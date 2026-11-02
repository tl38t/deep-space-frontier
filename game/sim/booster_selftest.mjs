// 探针：增强剂忠实移植验证（引擎层 + 制造集成 + 计时 + 效果聚合）
// 复用 fixture 的 vm sandbox 模式：window=sandbox，直接加载 本作引擎 + 内置 1 代增强剂数据。
// 不依赖浏览器；用比值/精确断言锁定行为。
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/store.js",
  "js/core/save-envelope.js", "js/core/cloud-save-contract.js",
  "js/core/cloud-providers.js", "js/core/cloud-save-service.js", "js/core/persistence.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/ships.js", "js/data/recipes.js",
  "js/data/factions.js", "js/data/names.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js",
  "js/engine/npc.js", "js/engine/booster.js", "js/engine/mastery.js",
  "js/engine/production.js", "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js",
  "js/narrative/events.js", "js/engine/settle.js",
  // 内置 1 代增强剂数据（window.BOOSTER_* 事实来源）
  "js/lib/eveidle/host-stubs.js",
  "js/lib/eveidle/data/boosters.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Data, Engine } = sandbox.NSK;
const B = Engine.Booster;

// ===== 断言脚手架 =====
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; fails.push(name); console.log("  FAIL  " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }

console.log("== 增强剂忠实移植探针 ==");

// 数据桥接
console.log("[数据桥接]");
ok("BOOSTER_ITEMS 非空", Object.keys(B.items()).length > 0, Object.keys(B.items()).length);
ok("配方数 = 物品数 = 63", B.recipes().length === 63 && Object.keys(B.items()).length === 63, { rec: B.recipes().length, it: Object.keys(B.items()).length });
ok("槽位数 = 16", B.slots().length === 16, B.slots().length);
ok("getRecipe('mining_lubricant_n') 存在", !!B.getRecipe("mining_lubricant_n"));
ok("getItem 跨前缀", B.getItem("booster:mining_lubricant_n") && B.getItem("mining_lubricant_n"));

// 成本重映射（planetary:/gas:/special: → 本作键）
console.log("[配方成本重映射]");
const cost1 = B.craftCost(state0(), "mining_lubricant_n");
ok("mining_lubricant_n 重映射 planet_lava/tactic:t1", cost1 && cost1["planet_lava"] === 2 && cost1["tactic:t1"] === 2, cost1);
const cost2 = B.craftCost(state0(), "laser_coolant_n");
ok("laser_coolant_n 重映射 planet_gas/he_gas", cost2 && cost2["planet_gas"] === 2 && cost2["he_gas"] === 1, cost2);

// 门禁（仅 requiresBlueprint；level 门槛本作不做）
console.log("[制造门禁]");
function state0() {
  const st = Engine.State.defaultState(Date.now(), Data);
  if (Engine.Base && Engine.Base.normalize) Engine.Base.normalize(st); // 模拟 boot：确保 boosterQueue 等字段存在
  return st;
}
ok("直解锁配方 canCraft 通过", B.canCraft(state0(), "mining_lubricant_n").ok === true);
{
  const st = state0();
  const r = B.canCraft(st, "gas_rheology_n");
  ok("需蓝图配方无蓝图被拒", r.ok === false && /蓝图/.test(r.err || ""), r);
  st.ownedBlueprints = st.ownedBlueprints || [];
  st.ownedBlueprints.push("booster:gas_rheology_n");
  ok("补蓝图后通过", B.canCraft(st, "gas_rheology_n").ok === true);
}

// 制造集成：入队 → 推进 → 入库
console.log("[制造集成]");
{
  const st = state0();
  // 注入原料（探针用）
  st.res["planet_lava"] = 100;
  st.res["tactic:t1"] = 100;
  const enq = Engine.Production.enqueue(st, "booster", "mining_lubricant_n", 1);
  ok("enqueue booster 成功", enq.ok === true, enq);
  ok("进入 boosterQueue", st.base.industry.boosterQueue.length === 1);
  // 反应实验室无人驻舱时耗时 ×1.4（effDur=18×1.4≈25.2s）；给 60s 余量确保完成 1 批
  const q0 = st.base.industry.boosterQueue[0];
  const base = q0.startedAt - 60000;
  q0.startedAt = base;
  const log = Engine.Production.processQueue(st, "booster", base + 60000, 1);
  ok("processQueue 产出入库", log.length === 1 && (st.res["booster:mining_lubricant_n"] || 0) === 1, { log, inv: st.res["booster:mining_lubricant_n"] });
  ok("队列清空（repeat=1）", st.base.industry.boosterQueue.length === 0);
  // 槽位上限：bodyLevel 1 时 booster=1，第二瓶应被拒
  st.res["planet_lava"] = 100; st.res["tactic:t1"] = 100;
  Engine.Production.enqueue(st, "booster", "mining_lubricant_n", 1);
  const enq2 = Engine.Production.enqueue(st, "booster", "mining_lubricant_n", 1);
  ok("槽位满后拒绝入队", enq2.ok === false && /槽位/.test(enq2.err || ""), enq2);
}

// 装备 / 计时 / 自动续瓶
console.log("[装备 / 计时 / 自动续瓶]");
{
  const st = state0();
  B.addToInventory(st, "booster:mining_lubricant_n", 5);
  const eq = B.equip(st, "miningSpeed", "mining_lubricant_n");
  ok("equip 成功", eq.ok === true, eq);
  ok("active 起始 180000ms", st.boosters.active.miningSpeed && st.boosters.active.miningSpeed.remainingMs === 180000);
  ok("库存扣 1", (st.res["booster:mining_lubricant_n"] || 0) === 4);

  // 在岗活动判定：未派遣成员 → mining 不计时；派遣 1 人采矿 → mining 计时
  const T0 = Date.now();
  st.boosters.lastTick = T0;
  B.tick(st, T0 + 60000); // 无成员在岗，mining 不应消耗（且 elapsed 真实 60s）
  ok("无成员在岗 mining 槽不消耗", approx(st.boosters.active.miningSpeed.remainingMs, 180000, 1e-6), st.boosters.active.miningSpeed);

  Engine.Dispatch.assign(st, st.members[0].id, "mine", { nodeId: st.base.nodeId });
  // elapsed 200s：第一瓶 180s 用尽，再从库存续 1 瓶剩 20s → remaining≈160000, inv 3
  B.tick(st, T0 + 260000);
  ok("计时推进 + 自动续瓶（remaining≈160000）", approx(st.boosters.active.miningSpeed.remainingMs, 160000, 1), st.boosters.active.miningSpeed);
  ok("续瓶后库存 -1 = 3", (st.res["booster:mining_lubricant_n"] || 0) === 3, st.res["booster:mining_lubricant_n"]);

  // 耗尽：库存清零 + 大 elapsed → 槽清空
  B.addToInventory(st, "booster:mining_lubricant_n", -3); // 退回
  ok("库存归零", (st.res["booster:mining_lubricant_n"] || 0) === 0);
  B.tick(st, st.boosters.lastTick + 1000000);
  ok("库存耗尽后槽清空", !st.boosters.active.miningSpeed, st.boosters.active.miningSpeed);
}

// 效果聚合（忠实 1 代 getBoosterEffectState 语义）
console.log("[效果聚合]");
{
  const st = state0();
  function setOne(id, slot) { B.addToInventory(st, "booster:" + id, 1); B.equip(st, slot, id); }
  setOne("mining_lubricant_n", "miningSpeed");
  setOne("ore_resonance_n", "miningYield");
  setOne("shield_recharge_n", "combatRepair");
  setOne("laser_coolant_n", "combatWeapon");
  setOne("relic_solver_n", "archaeologySpeed");
  const eff = B.getEffectState(st);
  ok("miningSpeed ×1.08", approx(eff.miningSpeedMultiplier, 1.08, 1e-9), eff.miningSpeedMultiplier);
  ok("doubleMineralChance 0.10", approx(eff.doubleMineralChance, 0.10, 1e-9), eff.doubleMineralChance);
  ok("repairMultiplier.shield ×1.10", approx(eff.repairMultiplier.shield, 1.10, 1e-9), eff.repairMultiplier.shield);
  ok("weaponDamageMultiplier.laser ×1.06", approx(eff.weaponDamageMultiplier.laser, 1.06, 1e-9), eff.weaponDamageMultiplier.laser);
  ok("archaeologySpeedMultiplier ×0.92（负加成）", approx(eff.archaeologySpeedMultiplier, 0.92, 1e-9), eff.archaeologySpeedMultiplier);
  // 独立槽位各自生效（每槽仅 1 瓶）：miningSpeed 与 smeltSpeed 互不干扰
  setOne("high_temp_flux_n", "smeltSpeed");
  const eff3 = B.getEffectState(st);
  ok("miningSpeed 独立槽 ×1.08", approx(eff3.miningSpeedMultiplier, 1.08, 1e-9), eff3.miningSpeedMultiplier);
  ok("smeltSpeed 独立槽 ×1.08", approx(eff3.smeltSpeedMultiplier, 1.08, 1e-9), eff3.smeltSpeedMultiplier);
  // 同槽重装 = 替换而非叠加（装 r 版 → ×1.18，而非 1.08×1.18）
  setOne("mining_lubricant_r", "miningSpeed");
  const eff4 = B.getEffectState(st);
  ok("同槽重装=替换（miningSpeed ×1.18）", approx(eff4.miningSpeedMultiplier, 1.18, 1e-9), eff4.miningSpeedMultiplier);
}

// 兼容判定：universal 件（neural_booster / skill_overdrive）可入任意采集/制造槽，禁战斗槽
console.log("[兼容判定]");
{
  const st = state0();
  B.addToInventory(st, "booster:neural_booster_n", 1);
  B.addToInventory(st, "booster:skill_overdrive_n", 1);
  ok("neural(universal skillXpMultiplier) 可入 smeltSpeed", B.canEquip(st, "smeltSpeed", "neural_booster_n").ok === true);
  ok("skill_overdrive(universal) 可入 shipSpeed", B.canEquip(st, "shipSpeed", "skill_overdrive_n").ok === true);
  ok("neural(universal) 可入 combatWeapon（经验茶通用件）", B.canEquip(st, "combatWeapon", "neural_booster_n").ok === true);
  ok("skill_overdrive(skillLevelBonus) 禁战斗槽 combatWeapon", B.canEquip(st, "combatWeapon", "skill_overdrive_n").ok === false);
  // 非兼容：mining 件不能入 combatRepair
  B.addToInventory(st, "booster:mining_lubricant_n", 1);
  ok("mining 件禁 combatRepair 槽", B.canEquip(st, "combatRepair", "mining_lubricant_n").ok === false);
}

console.log("\n== 汇总 ==");
console.log("PASS " + pass + " / FAIL " + fail);
if (fail) { console.log("失败项: " + fails.join(" | ")); process.exit(1); }
else { console.log("全部通过 ✅"); }
