// Phase 4 验证探针（2026-11-10）：工业舰型系统 = 11 艘工业舰迁移 + 工业加成引擎接线（采矿/冶炼）
// 验证点：
//   ① 数据层 SHIPS=44 / SLOT_LAYOUT=44（33 既有 + 11 工业）
//   ② 11 工业舰 bonuses 真值正确（miningLaserEfficiency / gasLaserEfficiency / smeltingSpeed）
//   ③ 纪律：未搬 fleetMiningSpeed / pumpEfficiency（待舰队子系统）；既有 33 舰未回退
//   ④ 引擎·采矿：同节点同技能下，miner_frigate 产出应显著高于 rifter（shipEff ×1.25）
//   ⑤ 引擎·冶炼：dolphin(smeltingSpeed 0.25) 驻留阵营应比 rifter 更快出 fe_alloy
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/storage.js", "js/core/store.js",
  "js/core/save-envelope.js", "js/core/cloud-save-contract.js",
  "js/core/cloud-providers.js", "js/core/cloud-save-service.js", "js/core/persistence.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/archaeology.js", "js/data/ships.js", "js/data/recipes.js", "js/data/equipment.js",
  "js/data/pirates.js", "js/data/raids.js", "js/data/tech.js",
  "js/data/factions.js", "js/data/names.js", "js/lib/eveidle/data/boosters.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js", "js/engine/npc.js",
  "js/engine/booster.js", "js/engine/mastery.js", "js/engine/tech.js",
  "js/engine/production.js", "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js", "js/engine/sites.js", "js/narrative/events.js",
  "js/engine/settle.js", "js/engine/ship-enhancement.js", "js/engine/archaeology.js", "js/engine/repair.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, setTimeout };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Data, Engine, Core } = sandbox.NSK;
const St = Engine.State, Settle = Engine.Settle, Disp = Engine.Dispatch, Prod = Engine.Production;
if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") sandbox.NSK.Narrative.pick = () => null;

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log("PASS", name, extra || ""); } else { fail++; console.log("FAIL", name, extra || ""); } }

// ① 数量
const shipIds = Object.keys(Data.Ships.SHIPS);
const layoutIds = Object.keys(Data.Ships.SLOT_LAYOUT);
ok("① SHIPS 数量 = 45（33+11+1 泰坦）", shipIds.length === 45, "n=" + shipIds.length);
ok("①b SLOT_LAYOUT 数量 = 45", layoutIds.length === 45, "n=" + layoutIds.length);

// ② 工业舰 bonuses 真值
const expect = {
  miner_frigate: { miningLaserEfficiency: 0.25 },
  gas_frigate: { gasLaserEfficiency: 0.25 },
  miner_destroyer: { miningLaserEfficiency: 0.5 },
  gas_destroyer: { gasLaserEfficiency: 0.5 },
  miner_cruiser: { miningLaserEfficiency: 1.0 },
  gas_cruiser: { gasLaserEfficiency: 1.0 },
  dolphin: { smeltingSpeed: 0.25 },
  miner_battleship: { miningLaserEfficiency: 1.4 },
  gas_battleship: { gasLaserEfficiency: 1.4 },
  yunjin: { smeltingSpeed: 0.28 },
  orca: { miningLaserEfficiency: 1.8, gasLaserEfficiency: 1.8, smeltingSpeed: 0.30 },
};
let bonusOk = true, bonusDetail = "";
for (const [id, exp] of Object.entries(expect)) {
  const b = (Data.Ships.shipById(id) || {}).bonuses || {};
  for (const k in exp) if (Math.abs((b[k] || 0) - exp[k]) > 1e-9) { bonusOk = false; bonusDetail += " " + id + "." + k + " 期望" + exp[k] + " 实得" + b[k]; }
}
ok("② 11 工业舰 bonuses 真值正确", bonusOk, bonusDetail || "all-good");

// ③ 纪律：未搬 fleetMiningSpeed / pumpEfficiency；既有舰未回退
let deadOk = true, deadDetail = "";
for (const id of Object.keys(expect)) {
  const b = (Data.Ships.shipById(id) || {}).bonuses || {};
  if ("fleetMiningSpeed" in b || "pumpEfficiency" in b) { deadOk = false; deadDetail += " " + id + " 含未接线键"; }
}
const rifter = Data.Ships.shipById("rifter");
const heron = Data.Ships.shipById("heron");
if (!rifter || rifter.classTier !== 1) { deadOk = false; deadDetail += " rifter回退"; }
if (!heron || heron.archaeologyScanStrength !== 10) { deadOk = false; deadDetail += " heron回退"; }
ok("③ 未搬舰队键 + 既有 33 舰未回退", deadOk, deadDetail || "all-good");
// 普通战斗/考古舰不得携带工业键（mining/gas/smelting/fleet/pump）——保证 shipEff 对其退化为 1+0=1
// 注：Phase 5 已给 28 战斗舰加 combat bonuses（laserDamage 等），故此处只看工业键，不要求无 bonuses 对象
const INDUSTRIAL_KEYS = ["miningLaserEfficiency","gasLaserEfficiency","smeltingSpeed","fleetMiningSpeed","pumpEfficiency"];
const hasInd = (sh) => { const b = (sh && sh.bonuses) || {}; return INDUSTRIAL_KEYS.some(k => k in b); };
const combatHasInd = hasInd(rifter), archHasInd = hasInd(heron);
ok("③b 战斗/考古舰无工业键（mining/gas/smelting/fleet/pump）", !combatHasInd && !archHasInd, "combat=" + combatHasInd + " arch=" + archHasInd);

// 工具：定位采矿节点
function findMineNode(st) {
  for (const nd of st.starMap.nodes) for (const b of (nd.bodies || [])) {
    if (!b.abundance) continue;
    const keys = Object.keys(b.abundance);
    const ore = keys.find(k => !(Data.Resources.GAS && Data.Resources.GAS[k]));
    if (ore) return { node: nd, body: b, ore };
  }
  return null;
}

// ④ 采矿 A/B：同节点同技能，miner_frigate vs rifter
function mineState(shipId) {
  const st = St.defaultState(Date.now(), Data);
  st.members.length = 0;                       // 清空默认成员，单变量
  const m = St.makeMember(Data, Math.random, st.base.nodeId);
  m.shipId = shipId;                            // 强制指定舰船（单变量）
  m.skills = {};                                // 清零随机初始技能 → 双方同起点，比值只反映 shipEff
  st.members.push(m);
  const mn = findMineNode(st);
  Disp.assign(st, m.id, "mine", { nodeId: mn.node.id, bodyId: mn.body.id, oreId: mn.ore });
  return { st, mn, ore: mn.ore };
}
const A = mineState("rifter");
const B = mineState("miner_frigate");
const oreA = A.ore, oreB = B.ore;
const beforeA = A.st.res[oreA] || 0, beforeB = B.st.res[oreB] || 0;
// 小 dt 隔离 shipEff：避免长结算中成员随机 passion 致技能涨速不同、skillBonus 漂移污染单变量比值。
const t0 = Date.now(); A.st.lastSeen = t0; B.st.lastSeen = t0;
const dt = 10 * 1000;
Settle.settle(A.st, t0 + dt);
Settle.settle(B.st, t0 + dt);
const gainA = (A.st.res[oreA] || 0) - beforeA;
const gainB = (B.st.res[oreB] || 0) - beforeB;
const ratio = gainA > 0 ? gainB / gainA : 0;
ok("④ 采矿：miner_frigate 产出 > rifter 且 ≈×1.25（shipEff）", gainB > gainA && ratio >= 1.22 && ratio <= 1.28,
   "A(rifter)=" + gainA.toFixed(2) + " B(miner_frigate)=" + gainB.toFixed(2) + " ratio=" + ratio.toFixed(3));

// ⑤ 冶炼提速：测"完成首批耗时"（dolphin smeltingSpeed 0.25 → effDur ×1/1.25 → 更快出首批）
// 1s 步进测耗时，并手动对齐队列项 startedAt 消掉墙钟偏差；总产出对比在 1 批窗口内无法区分 1.25×，故改用耗时比。
function smeltState(shipId) {
  const st = St.defaultState(Date.now(), Data);
  st.members.length = 0;
  const m = St.makeMember(Data, Math.random, st.base.nodeId);
  m.shipId = shipId;
  st.members.push(m);
  const hullSlots = Data.Ships.baseHullSlots(st.base.hullId) || [];
  const smeltSlot = hullSlots.find(s => s.type === "smelt");
  Disp.assign(st, m.id, "station", { slotId: smeltSlot.id });
  const r = Prod.enqueue(st, "smelt", "smelt_fe_alloy", false);
  return { st, enqOk: !!(r && r.ok !== false) };
}
function timeToFirstBatch(st) {
  const base = st.res.fe_alloy || 0;
  const T0 = 1_000_000_000_000;            // 受控基准时钟
  st.lastSeen = T0;
  // 对齐队列项起始时刻，使首个 settle 的 elapsed 从 0 起算（消除 enqueue 时墙钟偏差）
  for (const q of (st.base.industry.smeltQueue || [])) q.startedAt = T0;
  let t = T0, guard = 0;
  while (((st.res.fe_alloy || 0) - base) < 1 && guard < 5000) {
    t += 100;                               // 0.1s 步进，避免整数秒吞掉 9.024s vs 7.22s 的 1.25× 差异
    Settle.settle(st, t);
    guard++;
  }
  return { sec: (t - T0) / 1000, gained: (st.res.fe_alloy || 0) - base };
}
const S0 = smeltState("rifter");
const S1 = smeltState("dolphin");
const r0 = timeToFirstBatch(S0.st);
const r1 = timeToFirstBatch(S1.st);
const sRatio = r1.sec > 0 ? r0.sec / r1.sec : 0;   // 理论 ≈ 1.25（dolphin 更快）
ok("⑤ 冶炼：dolphin 完成首批比 rifter 快 ≈×1.25（smeltFit）",
   S0.enqOk && S1.enqOk && r1.gained >= 1 && r1.sec < r0.sec && sRatio >= 1.10 && sRatio <= 1.40,
   "rifter=" + r0.sec + "s dolphin=" + r1.sec + "s ratio=" + sRatio.toFixed(3));

// ⑥ 存档往返（工业舰 bonuses 序列化不丢）
let normOk = false;
try {
  const env = Core.normalize(JSON.parse(JSON.stringify(B.st)));
  const ship = env.members[0] && env.members[0].shipId;
  normOk = ship === "miner_frigate" && !!(Data.Ships.shipById(ship).bonuses.miningLaserEfficiency);
} catch (e) { normOk = false; }
ok("⑥ 存档往返：工业舰 shipId + bonuses 留存", normOk, "");

console.log("\nRESULT pass=" + pass + " fail=" + fail);
process.exit(fail > 0 ? 1 : 0);
