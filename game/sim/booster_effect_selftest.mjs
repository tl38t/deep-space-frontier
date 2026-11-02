// 探针：增强剂「效果接线」验证（Task #53-#56）
// 覆盖：① 技能键名对齐本作（gas/refine/manufacture/booster + combat 桶广播到战斗子键）
//       ② settle xpMultOf 接 booster 经验乘区
//       ③ 造船/装备/组件材料折扣
//       ④ 冶炼/增幅剂双倍产出
//       ⑤ combat 武器伤害 / 维修乘区
// 用 vm sandbox 模式（与 booster_selftest.mjs 同思路），直接加载 本作引擎 + 1 代增强剂数据。
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = "D:/深空星疆：商业与战争/game";
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/store.js",
  "js/data/resources.js", "js/data/equipment.js", "js/data/starmap.js", "js/data/ships.js",
  "js/data/recipes.js", "js/data/factions.js", "js/data/names.js",
  "js/data/pirates.js", "js/data/raids.js", "js/data/tech.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js",
  "js/engine/npc.js", "js/engine/booster.js", "js/engine/mastery.js", "js/engine/tech.js",
  "js/engine/production.js", "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js",
  "js/narrative/events.js", "js/engine/settle.js",
  // 内置 1 代增强剂数据（window.BOOSTER_* 事实来源）
  "js/lib/eveidle/host-stubs.js",
  "js/lib/eveidle/data/boosters.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Data, Engine } = sandbox.NSK;
const B = Engine.Booster;
const Production = Engine.Production;
const Settle = Engine.Settle;
const Combat = Engine.Combat;

// ===== 注入确定性测试用增强剂（不污染正本数据）=====
function injectTestItems() {
  const add = (id, o) => { sandbox.BOOSTER_ITEMS[id] = Object.assign({ id, name: "测试_" + id, itemId: "booster:" + id, quality: "n", universal: false }, o); };
  add("test_mine_xp",   { effectType: "skillXpMultiplier", effectValue: 1.0, category: "mining" });
  add("test_gas_xp",    { effectType: "skillXpMultiplier", effectValue: 1.0, category: "gas" });
  add("test_refine_xp", { effectType: "skillXpMultiplier", effectValue: 1.0, category: "refining" });
  add("test_manu_xp",   { effectType: "skillXpMultiplier", effectValue: 1.0, category: "ship" });
  add("test_booster_xp",{ effectType: "skillXpMultiplier", effectValue: 1.0, category: "booster" });
  add("test_combat_xp", { effectType: "skillXpMultiplier", effectValue: 1.0, category: "combatWeapon" });
  add("test_dmg",       { effectType: "damageMultiplier", weaponType: "laser", effectValue: 0.5, category: "combatWeapon" });
  add("test_repair",    { effectType: "repairAmount", repairTarget: "shield", effectValue: 0.5, category: "combatRepair" });
  add("test_smelt_double",  { effectType: "smeltDouble", effectValue: 1.0, category: "refining" });
  add("test_booster_double",{ effectType: "boosterDouble", effectValue: 1.0, category: "booster" });
  add("test_ship_disc", { effectType: "shipMaterialDiscount", effectValue: 0.5, category: "ship" });
  add("test_equip_disc",{ effectType: "shipMaterialDiscount", effectValue: 0.5, category: "equipment" });
  // 增幅剂双倍需要一个可入队的配方（itemId 必须带 booster: 前缀，与正本 buildBoosterTables 同口径）
  sandbox.BOOSTER_RECIPES.push({ id: "test_booster_double", itemId: "booster:test_booster_double", cost: { planet_lava: 1 }, time: 5, requiresBlueprint: false });
}

// ===== 断言脚手架 =====
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; fails.push(name); console.log("  FAIL  " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-6 : eps); }

function state0() {
  const st = Engine.State.defaultState(Date.now(), Data);
  if (Engine.Base && Engine.Base.normalize) Engine.Base.normalize(st);
  return st;
}

injectTestItems();

console.log("== 增强剂效果接线探针 ==");

// ---------- ① 技能键名对齐 ----------
console.log("[① 技能键名对齐本作]");
{
  const st = state0();
  const setOne = (id, slot) => { B.addToInventory(st, "booster:" + id, 1); B.equip(st, slot, id); };
  setOne("test_mine_xp", "miningYield");
  setOne("test_gas_xp", "gasYield");
  setOne("test_refine_xp", "smeltYield");
  setOne("test_manu_xp", "shipYield");
  setOne("test_booster_xp", "boosterYield");
  setOne("test_combat_xp", "combatWeapon");
  const eff = B.getEffectState(st);
  ok("skillXpMultBySkill 含本作键 mining", approx(eff.skillXpMultBySkill.mining, 2.0, 1e-9), eff.skillXpMultBySkill.mining);
  ok("gas 键（非 gasHarvesting）", approx(eff.skillXpMultBySkill.gas, 2.0, 1e-9), eff.skillXpMultBySkill.gas);
  ok("refine 键（非 refining）", approx(eff.skillXpMultBySkill.refine, 2.0, 1e-9), eff.skillXpMultBySkill.refine);
  ok("manufacture 键（非 shipEngineering）", approx(eff.skillXpMultBySkill.manufacture, 2.0, 1e-9), eff.skillXpMultBySkill.manufacture);
  ok("booster 键（非 boosterEngineering）", approx(eff.skillXpMultBySkill.booster, 2.0, 1e-9), eff.skillXpMultBySkill.booster);
  ok("combat 桶 → combatLaser=2", approx(eff.skillXpMultBySkill.combatLaser, 2.0, 1e-9), eff.skillXpMultBySkill.combatLaser);
  ok("combat 桶 → combatTurret=2", approx(eff.skillXpMultBySkill.combatTurret, 2.0, 1e-9), eff.skillXpMultBySkill.combatTurret);
  ok("combat 桶 → missile=2", approx(eff.skillXpMultBySkill.missile, 2.0, 1e-9), eff.skillXpMultBySkill.missile);
  ok("combat 桶 → defense=2", approx(eff.skillXpMultBySkill.defense, 2.0, 1e-9), eff.skillXpMultBySkill.defense);
  ok("combat 桶 → capacitor=2", approx(eff.skillXpMultBySkill.capacitor, 2.0, 1e-9), eff.skillXpMultBySkill.capacitor);
}

// ---------- ② settle xpMultOf 接 booster 乘区 ----------
console.log("[② xpMultOf 接 booster 经验乘区]");
{
  const st = state0();
  const m = st.members[0];
  const base = Settle.xpMultOf(st, m, "mining");
  ok("无增强剂时 mining 乘区=1", approx(base, 1, 1e-9), base);
  B.addToInventory(st, "booster:test_mine_xp", 1);
  B.equip(st, "miningYield", "test_mine_xp");
  const boosted = Settle.xpMultOf(st, m, "mining");
  ok("mining 增强剂后乘区=2", approx(boosted, 2.0, 1e-9), boosted);
  B.addToInventory(st, "booster:test_combat_xp", 1);
  B.equip(st, "combatWeapon", "test_combat_xp");
  const cl = Settle.xpMultOf(st, m, "combatLaser");
  ok("combat 桶经 xpMultOf(combatLaser)=2", approx(cl, 2.0, 1e-9), cl);
}

// ---------- ③ 材料折扣 ----------
console.log("[③ 材料折扣]");
{
  const st = state0();
  const comp = Data.Recipes.COMPONENT[0];
  ok("无折扣返回原成本", B.discountedCost(st, comp.in, "ship") === comp.in);
  B.addToInventory(st, "booster:test_ship_disc", 1);
  B.equip(st, "shipYield", "test_ship_disc");
  const dShip = B.discountedCost(st, comp.in, "ship");
  let expectOk = true;
  for (const k in comp.in) {
    const raw = comp.in[k] * 0.5;
    const exp = Math.max(1, Math.ceil(raw));
    if (dShip[k] !== exp) expectOk = false;
  }
  ok("舰船折扣逐条 ceil 且下限1", expectOk, { in: comp.in, disc: dShip });

  const eqId = "t1_shield_booster";
  const eq = Data.Equipment.byId(eqId);
  B.addToInventory(st, "booster:test_equip_disc", 1);
  B.equip(st, "equipmentYield", "test_equip_disc");
  const dEq = B.discountedCost(st, eq.cost, "equip");
  let eqOk = true;
  for (const k in eq.cost) {
    const raw = eq.cost[k] * 0.5;
    const exp = Math.max(1, Math.ceil(raw));
    if (dEq[k] !== exp) eqOk = false;
  }
  ok("装备折扣逐条 ceil 且下限1", eqOk, { in: eq.cost, disc: dEq });

  st.res = st.res || {};
  for (const k in dShip) st.res[k] = (st.res[k] || 0) + dShip[k] + 100;
  const before = Object.assign({}, st.res);
  const enq = Production.enqueue(st, "manufacture", comp.id, 1);
  ok("组件入队成功", enq.ok === true, enq);
  let spentOk = true;
  for (const k in dShip) if ((before[k] - st.res[k]) !== dShip[k]) spentOk = false;
  ok("组件入队按折扣后扣料", spentOk, { before, after: st.res, expected: dShip });
}

// ---------- ④ 冶炼 / 增幅剂双倍产出 ----------
console.log("[④ 冶炼 / 增幅剂双倍产出]");
{
  const st = state0();
  const smelt = Data.Recipes.SMELT[0];
  for (const k in smelt.in) st.res[k] = (st.res[k] || 0) + smelt.in[k] * 5;
  const enq0 = Production.enqueue(st, "smelt", smelt.id, 1);
  ok("冶炼入队成功", enq0.ok === true, enq0);
  const q0 = st.base.industry.smeltQueue[0];
  const base0 = q0.startedAt - 100000; q0.startedAt = base0;
  const before0 = st.res[smelt.out] || 0;
  Production.processQueue(st, "smelt", base0 + 100000, 1);
  const yNo = (st.res[smelt.out] || 0) - before0;
  ok("冶炼基础产出 = qty", approx(yNo, smelt.qty, 1e-9), yNo);

  const st2 = state0();
  for (const k in smelt.in) st2.res[k] = (st2.res[k] || 0) + smelt.in[k] * 5;
  B.addToInventory(st2, "booster:test_smelt_double", 1);
  B.equip(st2, "smeltYield", "test_smelt_double");
  Production.enqueue(st2, "smelt", smelt.id, 1);
  const q2 = st2.base.industry.smeltQueue[0];
  const base2 = q2.startedAt - 100000; q2.startedAt = base2;
  const before2 = st2.res[smelt.out] || 0;
  Production.processQueue(st2, "smelt", base2 + 100000, 1);
  const yYes = (st2.res[smelt.out] || 0) - before2;
  ok("冶炼双倍产出 = 2×qty", approx(yYes, smelt.qty * 2, 1e-9), yYes);

  const st3 = state0();
  st3.res["planet_lava"] = 10;
  B.addToInventory(st3, "booster:test_booster_double", 1);
  B.equip(st3, "boosterYield", "test_booster_double");
  const enqB = Production.enqueue(st3, "booster", "test_booster_double", 1);
  ok("增幅剂入队成功", enqB.ok === true, enqB);
  const qb = st3.base.industry.boosterQueue[0];
  const bb = qb.startedAt - 100000; qb.startedAt = bb;
  Production.processQueue(st3, "booster", bb + 100000, 1);
  const bottles = st3.res["booster:test_booster_double"] || 0;
  ok("增幅剂双倍产出 = 2 瓶", approx(bottles, 2, 1e-9), bottles);
}

// ---------- ⑤ combat 武器伤害 / 维修乘区 ----------
console.log("[⑤ combat 武器伤害 / 维修乘区]");
{
  const map = Data.StarMap.generateStarMap(sandbox.NSK.Core.makeRng(2071900));
  Data.Raids.attach(map);
  const nid = map.nodes.find(n => n.raid).id;
  function mkCombat() {
    const st = {
      version: 8, lastSeen: Date.now(), rngSeed: 9, starMap: map,
      res: { credits: 0, rep: 0, ammo_laser: 1e12, ammo_missile: 1e12, ammo_cannon: 1e12 },
      base: { nodeId: nid, fuel: 1e12, fuelMax: 1e12, industry: { smeltQueue: [], manufactureQueue: [], inventQueue: [], buildQueue: [], boosterQueue: [] }, repairQueue: [] },
      members: [], tech: { levels: {}, active: null }, factions: [], reports: [], battles: {}, combatWaveHp: {}, combatFocus: null,
      equipment: {}, ownedBlueprints: ["booster:test_booster_double"],
    };
    st.members.push({
      id: "m0", name: "m0", status: "dispatched", destroyed: false,
      skills: { mining: 0, gas: 0, archaeology: 0, refine: 0, manufacture: 0, research: 0, combatLaser: 3000, combatTurret: 3000, missile: 3000, defense: 0, capacitor: 0, logistics: 0 },
      passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 },
      assignment: { type: "combat", nodeId: nid }, shipId: "destroyer",
      fitted: { high: ["t1_small_laser"], mid: ["t1_shield_booster"], low: [], rig: [] },
      hp: { shield: 1e12, armor: 1e12, structure: 1e12 },
    });
    return st;
  }
  const sBase = mkCombat();
  const P0 = Combat.prepareNode(sBase, nid);
  const dmg0 = P0.weapons.find(w => w.type === "laser").dmg;
  const inc0 = P0.incomingDps;
  const rp0 = P0.repairPerSec;
  const sW = mkCombat();
  B.addToInventory(sW, "booster:test_dmg", 1);
  B.equip(sW, "combatWeapon", "test_dmg");
  const P1 = Combat.prepareNode(sW, nid);
  const dmg1 = P1.weapons.find(w => w.type === "laser").dmg;
  ok("武器伤害 ×1.5（laser）", approx(dmg1, dmg0 * 1.5, 1e-3), { dmg0, dmg1 });
  const sR = mkCombat();
  B.addToInventory(sR, "booster:test_repair", 1);
  B.equip(sR, "combatRepair", "test_repair");
  const P2 = Combat.prepareNode(sR, nid);
  const inc1 = P2.incomingDps;
  const rp1 = P2.repairPerSec;
  ok("维修增强剂 → 每秒维修量上升（repairPerSec 增）", rp1 > rp0 + 1e-9, { rp0, rp1 });
  ok("维修增强剂 → 入傷 dps 下降", inc1 < inc0 - 1e-9, { inc0, inc1 });
}

console.log("\n== 汇总 ==");
console.log("PASS " + pass + " / FAIL " + fail);
if (fail) { console.log("失败项: " + fails.join(" | ")); process.exit(1); }
else { console.log("全部通过 ✅"); }
