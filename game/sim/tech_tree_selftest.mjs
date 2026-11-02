// 探针：科技树方案 A 扩充验证（数据完整性 + 6 乘区取值 + 6 条引擎路径集成）
// 复用 vm sandbox 模式（同 booster_selftest）：window=sandbox，加载本作引擎 + 数据。
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/store.js",
  "js/core/save-envelope.js", "js/core/cloud-save-contract.js",
  "js/core/cloud-providers.js", "js/core/cloud-save-service.js", "js/core/persistence.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/ships.js", "js/data/recipes.js",
  "js/data/raids.js", "js/data/pirates.js", "js/data/equipment.js", "js/data/factions.js", "js/data/names.js",
  "js/data/tech.js", "js/engine/tech.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js",
  "js/engine/npc.js", "js/engine/booster.js", "js/engine/mastery.js",
  "js/engine/production.js", "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js",
  "js/narrative/events.js", "js/engine/settle.js",
  "js/lib/eveidle/host-stubs.js",
  "js/lib/eveidle/data/boosters.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Data, Engine } = sandbox.NSK;
const Tech = Engine.Tech, Production = Engine.Production, Combat = Engine.Combat, Logi = Engine.Logistics, Settle = Engine.Settle;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; fails.push(name); console.log("  FAIL  " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }
function state0() {
  const st = Engine.State.defaultState(Date.now(), Data);
  if (Engine.Base && Engine.Base.normalize) Engine.Base.normalize(st);
  return st;
}

console.log("== 科技树方案 A 扩充探针 ==");

// ---------- ① 数据完整性 ----------
console.log("[① 数据完整性]");
{
  const all = Data.Tech.all();
  ok("节点总数 = 8", all.length === 8, all.length);
  ok("分类列 = 3（战斗/工业/后勤）", Data.Tech.COLS.length === 3, Data.Tech.COLS.map(c => c.cat));
  const expectBonus = { combat_aim: "hitAdd", bounty_1: "bountyMult", smelt_1: "smeltYield", manu_1: "manuSpeed", hop_1: "hopReduce", fuel_1: "fuelEff" };
  for (const id in expectBonus) {
    const n = Data.Tech.byId(id);
    ok("节点 " + id + " 存在且含 bonus." + expectBonus[id], !!n && n.bonus && typeof n.bonus[expectBonus[id]] === "number", n && n.bonus);
  }
  ok("combat_aim 归战斗列(col 0)", Data.Tech.colOf(Data.Tech.byId("combat_aim")) === 0);
  ok("smelt_1 归工业列(col 1)", Data.Tech.colOf(Data.Tech.byId("smelt_1")) === 1);
  ok("hop_1 归后勤列(col 2)", Data.Tech.colOf(Data.Tech.byId("hop_1")) === 2);
  const bn = Data.Tech.byId("bounty_1");
  ok("bounty_1 前置 combat_squad_1 Lv1", bn.requires.length === 1 && bn.requires[0].id === "combat_squad_1" && bn.requires[0].level === 1, bn.requires);
  ok("combat_aim 前置 combat_squad_1 Lv1", Data.Tech.byId("combat_aim").requires[0].id === "combat_squad_1");
}

// ---------- ② 6 乘区取值（数据→引擎聚合） ----------
console.log("[② 六乘区访问器取值]");
{
  const st = state0();
  st.tech.levels.combat_aim = 3;
  ok("hitBonus L3 = 9", approx(Tech.hitBonus(st), 9));
  st.tech.levels.bounty_1 = 3;
  ok("bountyMult L3 = 1.30", approx(Tech.bountyMult(st), 1.30));
  st.tech.levels.smelt_1 = 3;
  ok("smeltYieldMult L3 = 1.24", approx(Tech.smeltYieldMult(st), 1.24));
  st.tech.levels.manu_1 = 2;
  ok("manuSpeedFactor L2 = 0.90", approx(Tech.manuSpeedFactor(st), 0.90));
  st.tech.levels.hop_1 = 3;
  ok("hopReduce L3 = 0.06", approx(Tech.hopReduce(st), 0.06));
  st.tech.levels.fuel_1 = 2;
  ok("fuelMult L2 = 0.84", approx(Tech.fuelMult(st), 0.84));
  // 封顶：manuSpeed 即便给满也不穿透 0.1 地板
  st.tech.levels.manu_1 = 100;
  ok("manuSpeedFactor 封顶 0.1 地板", approx(Tech.manuSpeedFactor(st), 0.1, 1e-9), Tech.manuSpeedFactor(st));
}

// ---------- ③ 前置门禁 + 等级推进 + 取消续研 ----------
console.log("[③ 门禁 / 推进 / 取消续研]");
{
  const st = state0();
  const v0 = Tech.canStart(st, "bounty_1");
  ok("bounty_1 前置未满足不可研究", v0.ok === false, v0);
  st.tech.levels.combat_squad_1 = 1; st.res.credits = 1e9;
  const v1 = Tech.canStart(st, "bounty_1");
  ok("bounty_1 前置满足可研究", v1.ok === true, v1);
  const r = Tech.start(st, "bounty_1", 0);   // startedAt=0, endsAt=3,600×1000×1.4=5,040,000
  ok("开始研究 bounty_1", r.ok === true, r);
  const c = Tech.cancel(st, 2_000_000, "bounty_1");   // reached ≈ 2e6/5.04e6 ≈ 0.397
  ok("取消保留进度", c.ok && (st.tech.prog.bounty_1 || 0) > 0.3, c);
  const r2 = Tech.start(st, "bounty_1", 2_000_000);   // base 接 prog（约 0.397）
  ok("取消后续研成功（base 接 prog）", r2.ok === true && r2.base > 0.3, r2);
  Tech.cancel(st, 2_000_000, "bounty_1");
  st.tech.active = { id: "bounty_1", targetLevel: 1, base: 0, startedAt: -1000, endsAt: -1 };
  const done = Tech.advance(st, -1);
  ok("advance 完成 → 等级 = 1", done && st.tech.levels.bounty_1 === 1, { done: !!done, lv: st.tech.levels.bounty_1 });
}

// ---------- ④ 集成：冶炼产出（production） ----------
console.log("[④ 集成·冶炼产出]");
{
  const st = state0();
  const smelt = Data.Recipes.SMELT[0];
  for (const k in smelt.in) st.res[k] = (st.res[k] || 0) + smelt.in[k] * 5;
  Production.enqueue(st, "smelt", smelt.id, 1);
  let q = st.base.industry.smeltQueue[0];
  let t0 = q.startedAt - 100000; q.startedAt = t0;
  let before = st.res[smelt.out] || 0;
  Production.processQueue(st, "smelt", t0 + 100000, 1);
  const yNo = (st.res[smelt.out] || 0) - before;
  ok("冶炼基础产出 = qty", approx(yNo, smelt.qty, 1e-9), yNo);

  const st2 = state0(); st2.tech.levels.smelt_1 = 3;
  for (const k in smelt.in) st2.res[k] = (st2.res[k] || 0) + smelt.in[k] * 5;
  Production.enqueue(st2, "smelt", smelt.id, 1);
  q = st2.base.industry.smeltQueue[0]; t0 = q.startedAt - 100000; q.startedAt = t0;
  before = st2.res[smelt.out] || 0;
  Production.processQueue(st2, "smelt", t0 + 100000, 1);
  const yYes = (st2.res[smelt.out] || 0) - before;
  ok("精炼工艺 L3：冶炼产出 ×1.24", approx(yYes, smelt.qty * 1.24, 1e-6), yYes);
}

// ---------- ⑤ 集成：制造耗时（production，比值法，抗 sf/mm） ----------
console.log("[⑤ 集成·制造耗时]");
{
  const comp = Data.Recipes.COMPONENT[0];
  for (const k in comp.in) { /* res 填充在各自 state 内 */ }
  function run(levels) {
    const st = state0();
    for (const k in comp.in) st.res[k] = 1e9;
    st.tech.levels = Object.assign({}, levels || {});
    Production.enqueue(st, "manufacture", comp.id, 1);
    const q = st.base.industry.manufactureQueue[0];
    q.repeat = 1000;
    const dur = q.dur;          // 入队时烘焙（含布局乘区），tech 不烘进 dur
    q.startedAt = 1;
    const now = 1 + 100 * dur * 1.4 * 1000;  // ms：elapsed 单位为秒（/1000），故 ×1000；约 100 批（无节点 effDur≈dur×1.4 秒）
    Production.processQueue(st, "manufacture", now, 1);
    return st.base.industry.manufactureQueue[0].done;
  }
  const dNo = run({});
  const dYes = run({ manu_1: 2 });
  ok("柔性产线 L2 同窗口完工数 > 无节点", dYes > dNo, { dNo, dYes });
  ok("柔性产线 L2 比值 ≈ 1/0.90", approx(dYes / dNo, 1 / 0.90, 0.03), { dNo, dYes, ratio: dYes / dNo });
}

// ---------- ⑥ 集成：跳数惩罚（logistics） ----------
console.log("[⑥ 集成·跳数惩罚]");
{
  const st = state0();
  const penNo = Logi.hopPenaltyOf(st);
  st.tech.levels.hop_1 = 3;
  const penYes = Logi.hopPenaltyOf(st);
  ok("航线优化 L3 降低每跳惩罚（−0.06）", approx(penNo - penYes, 0.06, 1e-9), { penNo, penYes });
  ok("惩罚不低于 0.05 地板", penYes >= 0.05 - 1e-9, penYes);
}

// ---------- ⑦ 集成：燃料（settle.moveBase） ----------
console.log("[⑦ 集成·燃料消耗]");
{
  const map = Data.StarMap.generateStarMap(sandbox.NSK.Core.makeRng(2071900));
  Data.Raids.attach(map);
  // adjacency() 每次从 map.edges 重建，必须改地图本身的边，而非 adjacency 返回值
  const e0 = map.edges[0];
  e0.fuelCost = 50;            // 探针强制设定，避免依赖生成器默认值
  const fromId = e0.from, toId = e0.to;
  function mkFuel() {
    const st = state0(); st.starMap = map; st.base.nodeId = fromId; st.base.fuel = 1000; st.base.fuelMax = 2000;
    return st;
  }
  const sNo = mkFuel();
  Settle.moveBase(sNo, toId);
  const spentNo = 1000 - sNo.base.fuel;
  ok("跃迁基础消耗 = edge.fuelCost(50)", approx(spentNo, 50, 1e-9), spentNo);
  const sFu = mkFuel(); sFu.tech.levels.fuel_1 = 2;
  Settle.moveBase(sFu, toId);
  const spentFu = 1000 - sFu.base.fuel;
  ok("跃迁增效 L2：消耗 = 50×0.84 = 42", approx(spentFu, 50 * 0.84, 1e-9), spentFu);
}

// ---------- ⑧ 集成：命中 + 赏金（combat.prepareNode） ----------
console.log("[⑧ 集成·命中 / 赏金]");
{
  const map = Data.StarMap.generateStarMap(sandbox.NSK.Core.makeRng(2071900));
  Data.Raids.attach(map);
  const nid = map.nodes.find(n => n.raid).id;
  function mkCombat(levels) {
    const st = {
      version: 8, lastSeen: Date.now(), rngSeed: 9, starMap: map,
      res: { credits: 0, rep: 0, ammo_laser: 1e12, ammo_missile: 1e12, ammo_cannon: 1e12 },
      base: { nodeId: nid, fuel: 1e12, fuelMax: 1e12, industry: { smeltQueue: [], manufactureQueue: [], inventQueue: [], buildQueue: [], boosterQueue: [] }, repairQueue: [] },
      members: [], tech: { levels: Object.assign({}, levels || {}), active: null }, factions: [], reports: [], battles: {}, combatWaveHp: {}, combatFocus: null,
      equipment: {}, ownedBlueprints: [],
    };
    st.members.push({ id: "m0", name: "m0", status: "dispatched", destroyed: false,
      skills: { mining: 0, gas: 0, archaeology: 0, refine: 0, manufacture: 0, research: 0, combatLaser: 3000, combatTurret: 3000, missile: 3000, defense: 0, capacitor: 0, logistics: 0 },
      passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 },
      assignment: { type: "combat", nodeId: nid }, shipId: "destroyer",
      fitted: { high: ["t1_small_laser"], mid: ["t1_shield_booster"], low: [], rig: [] },
      hp: { shield: 1e12, armor: 1e12, structure: 1e12 } });
    return st;
  }
  const pNo = Combat.prepareNode(mkCombat({}), nid);
  const hcNo = pNo.weapons.find(w => w.type === "laser").hitChance;
  const pHit = Combat.prepareNode(mkCombat({ combat_aim: 3 }), nid);
  const hcHit = pHit.weapons.find(w => w.type === "laser").hitChance;
  ok("精准瞄准 L3 提升激光命中", hcHit > hcNo + 1e-9, { hcNo, hcHit });

  const pB = Combat.prepareNode(mkCombat({}), nid);
  const dropNo = pB.dropCredits;
  const pBn = Combat.prepareNode(mkCombat({ bounty_1: 3 }), nid);
  const dropYes = pBn.dropCredits;
  ok("战利品协议 L3 让赏金 ×1.30", approx(dropYes / dropNo, 1.30, 1e-6), { dropNo, dropYes, ratio: dropYes / dropNo });
}

console.log("\n== 汇总 ==");
console.log("PASS " + pass + " / FAIL " + fail);
if (fail) { console.log("失败项: " + fails.join(" | ")); process.exit(1); }
else { console.log("全部通过 ✅"); }
