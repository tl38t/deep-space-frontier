// 全链路整合试玩探针（2026-11-09）
// 目的：**技能系统大改后的连带回归核验**。
// 探针只测技能矩阵（skill_matrix.mjs）不够 —— 它不跑 招募→派遣→母舰→任务→战斗/考古 的完整链路，
// 也不测存档往返。本探针走通整条链，断言：
//   ① 主循环零异常（任何一步抛错都记 FAIL 并定位）
//   ② 各活动系统真实产出（采矿/考古/战斗/物流/训练/生产）
//   ③ 技能经验确实在涨（各路 grantBatchXp 未被技能重构打断）
//   ④ 燃料管线生效（考古/战斗扣 base.fuel；fuelEfficiencyMult 的 hull 分支自然触发）
//   ⑤ 存档往返：JSON 序列化 → Core.normalize → 再 settle 不崩、关键字段留存
//
// 与 skill_matrix 同样用 Node vm 加载全部 UMD 模块，无 DOM。
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
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  vm.runInContext(code, ctx, { filename: f });
}
const { Data, Engine, Core } = sandbox.NSK;
const St = Engine.State, Settle = Engine.Settle, Disp = Engine.Dispatch;
const Base = Engine.Base, Prod = Engine.Production, Combat = Engine.Combat, Logi = Engine.Logistics;

// 静音活动事件系统（整场探针）：settle 每 25s 为每个在岗成员 roll 一次事件，会往 res 里塞整包资源，
// 污染「技能等级→输出」的单变量因果。事件本身有 story_check / arch_probe 覆盖，这里不需要它。
if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") {
  sandbox.NSK.Narrative.pick = function () { return null; };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name, extra || ""); }
  else { fail++; console.log("FAIL", name, extra || ""); }
}
const now0 = Date.now();
const STEP = 3600; // 1 小时步长

// ---- 节点定位（防御式，复用 skill_matrix findBodyIn 思路）----
function findMineNode(st) {
  for (const nd of st.starMap.nodes) {
    for (const b of (nd.bodies || [])) {
      if (!b.abundance) continue;
      const keys = Object.keys(b.abundance);
      const ore = keys.find(k => !(Data.Resources.GAS && Data.Resources.GAS[k]));
      if (ore) return { node: nd, body: b, ore };
    }
  }
  return null;
}
function findArchNode(st) {
  for (const nd of st.starMap.nodes) {
    const dr = (nd.bodies || []).find(b => b.kind === "derelict");
    if (dr) return { node: nd, body: dr };
  }
  return null;
}
function findCombatNode(st) {
  return st.starMap.nodes.find(n => Data.Raids.raidAt(st.starMap, n.id)) || null;
}

// ---- 主流程 ----
const st = St.defaultState(now0, Data);
// 补足名册（defaultState 只 push 1 个成员）
while (st.members.length < 8) {
  const m = St.makeMember(Data, Math.random, st.base.nodeId);
  st.members.push(m);
}
console.log("[debug] members=", st.members.length, "ships=", st.members.map(m => m.shipId).join(","));

// 装配 + 派遣
const mine = findMineNode(st);
const arch = findArchNode(st);
const combat = findCombatNode(st);
console.log("[debug] mine=", mine && mine.node.id + "/" + mine.body.id + "/" + mine.ore,
            " arch=", arch && arch.node.id, " combat=", combat && combat.id);

const [m0, m1, m2, m3, m4, m5] = st.members;
// 给战斗成员装武器（触发 fuelPerVolley + capMult；hull.fuelEfficiency 自然生效）
m2.fitted = { high: ["t1_small_laser"], mid: [], low: [], rig: [] };
m0.fitted = { high: ["t1_small_laser"], mid: [], low: [], rig: [] };
m1.fitted = { high: ["t1_small_laser"], mid: [], low: [], rig: [] };

const r1 = Disp.assign(st, m0.id, "mine", { nodeId: mine.node.id, bodyId: mine.body.id, oreId: mine.ore });
const r2 = Disp.assign(st, m1.id, "explore", { nodeId: arch.node.id, bodyId: arch.body ? arch.body.id : null, focus: "salvage" });
const r3 = Disp.assign(st, m2.id, "combat", { nodeId: combat.id });
const r4 = Disp.assign(st, m3.id, "train", { nodeId: combat.id, trainSkill: "combatLaser" });
const r5 = Disp.assign(st, m4.id, "logistics", {});
const r6 = Disp.assign(st, m5.id, "transport", { nodeId: mine.node.id });
console.log("[debug] assign:", JSON.stringify([r1.ok, r2.ok, r3.ok, r4.ok, r5.ok, r6.ok]));

// 母舰精炼：createInitialBase 默认已装 smelt 模块（installed 含 module_smelt_01）；
// 槽位权威来源是 Data.Ships.baseHullSlots(hullId)，不是 st.base.slots（UI 层/可能为空）。
// 直接 station 一个成员到 smelt 槽 → 验证精炼队列推进 + refine 技能经验（12 技能之一）。
let stationOk = false, stationSlot = null;
const hullSlots = Data.Ships.baseHullSlots(st.base.hullId) || [];
const smeltSlot = hullSlots.find(s => s.type === "smelt");
if (smeltSlot) {
  const rs = Disp.assign(st, st.members[6].id, "station", { slotId: smeltSlot.id });
  stationOk = rs.ok;
  stationSlot = smeltSlot.id;
  console.log("[debug] station smelt ->", rs.ok, rs.err || "");
} else {
  console.log("[debug] 无 smelt 槽位，母舰精炼段跳过");
}

// 生产队列：精炼 fe 矿
let enqOk = false;
try {
  const r = Prod.enqueue(st, "smelt", "smelt_fe_alloy", false);
  enqOk = !!r && (r.ok !== false);
  console.log("[debug] enqueue smelt_fe_alloy ->", JSON.stringify(r),
    "smeltQueue.len=", (st.base.industry && st.base.industry.smeltQueue || []).length);
} catch (e) { console.log("[debug] enqueue err:", e.message); }
// 记录精炼产出基线（settle 后 fe_alloy 应上升，证明 smelt 队列真的跑了）
const feAlloyBefore = st.res.fe_alloy || 0;

// 任务系统：刷新一次任务板（generateQuest 不抛）
let questOk = false;
try {
  const f0 = Data.Factions.factionById("minmatar") || st.factions[0];
  const q = Data.Factions.generateQuest(Math.random, f0, st.base.bodyLevel + 1);
  questOk = !!q && !!q.id;
  console.log("[debug] generateQuest ->", questOk, q && q.id);
} catch (e) { console.log("[debug] generateQuest err:", e.message); }

// ---- 跑主循环：48 步 × 1h = 2 天 ----
let thrown = 0, lastErr = null;
let minFuel = st.base.fuel;
let t = now0;
st.lastSeen = t; // 确保第一轮 dt>0
for (let k = 0; k < 48; k++) {
  t += STEP * 1000;
  try { Settle.settle(st, t); }
  catch (e) { thrown++; lastErr = (e && e.stack) || String(e); break; }
  if (st.base.fuel < minFuel) minFuel = st.base.fuel;
}
ok("① 全链路主循环零异常（48步×1h=2天）", thrown === 0, lastErr ? ("ERR:" + String(lastErr).slice(0, 200)) : "");

// ---- 产出断言 ----
const oreNow = mine ? (st.res[mine.ore] || 0) : 0;
ok("② 采矿真实产出（"+ (mine ? mine.ore : "?") +" > 0）", oreNow > 0, "res="+oreNow.toFixed(1));

const fuelNow = st.base.fuel, fuelMax = st.base.fuelMax || 200;
ok("③ 燃料系统合法（终值在 [0,fuelMax] 且 regen 已顶满）",
   fuelNow >= 0 && fuelNow <= fuelMax && fuelNow === fuelMax,
   "now="+fuelNow.toFixed(1)+" max="+fuelMax);
// ③b 隔离验证：扣燃料管线函数本身正常（不经 settle regen，FUEL_REGEN=0.02/s 会把扣減淹没）
const archCost = Settle.archaeologyFuelCost(st, m1);
const fittedFuel = (Combat.fittedFuelCost ? Combat.fittedFuelCost(m1) : 0);
ok("③b 扣燃料管线函数正常（考古燃料成本>0 且 装备燃料成本>0）",
   archCost > 0 && fittedFuel > 0,
   "archCost="+archCost.toFixed(3)+" fittedFuel="+fittedFuel.toFixed(3));

const combatXp = (m2.skills.combatLaser || 0) + (m2.skills.missile || 0) + (m2.skills.combatTurret || 0);
ok("④ 战斗成员武器技能经验在涨（combatLaser/missile/combatTurret）", combatXp > 0, "xp="+combatXp.toFixed(0));

const comp = (st.logistics && st.logistics.compensation) || 0;
ok("⑤ 物流补偿累积（piloting 驱动）", comp > 0, "comp="+comp.toFixed(1));

const trainXp = m3.skills.combatLaser || 0;
ok("⑥ 演训/训练成员技能经验在涨（combatLaser）", trainXp > 0, "xp="+trainXp.toFixed(0));

const totalXp = st.members.reduce((s, m) => s + Object.values(m.skills || {}).reduce((a, b) => a + (b || 0), 0), 0);
ok("⑦ 全员技能经验总和 > 0（各路 grantBatchXp 未断）", totalXp > 0, "sum="+totalXp.toFixed(0));

// 驾驶经验（双路：战斗 + 物流岗）
const pilotXp = m2.skills.piloting || 0;
ok("⑧ 驾驶(piloting)经验在涨（战斗块 + 物流岗双路）", pilotXp > 0, "m2.piloting="+pilotXp.toFixed(0));

// 生产队列推进（精炼队列在 settle 中会跑完并出队，故不可断言"队列仍非空"；
// 真正判据：① enqueue 成功 ② 驻守工头拿到 refine 经验（production.js:235「真产出一批才涨」）
// ③ 实物 fe_alloy 上升（production.js:231 gain 产出）。三者齐证 smelt 管线端到端跑通。）
const refineXpM6 = st.members[6].skills.refine || 0;
const feAlloyAfter = st.res.fe_alloy || 0;
ok("⑨ 生产队列推进（enqueue成功 + 驻守工头refine经验涨 + 实物fe_alloy产出）",
   enqOk && refineXpM6 > 0 && feAlloyAfter > feAlloyBefore,
   "enqOk="+enqOk+" m6.refine="+refineXpM6.toFixed(0)+" fe_alloy "+feAlloyBefore.toFixed(0)+"→"+feAlloyAfter.toFixed(0));

ok("⑩ 任务系统 generateQuest 不抛且返回有效任务", questOk, "");

// ---- 存档往返 ----
let savedErr = null, normOk = false, reloadOk = false;
try {
  const json = JSON.stringify(st);
  const copy = JSON.parse(json);
  const loaded = Core.normalize(copy);
  normOk = !!loaded && Array.isArray(loaded.members) && loaded.members.length === st.members.length;
  const t2 = t + STEP * 1000;
  Settle.settle(loaded, t2);
  reloadOk = true;
} catch (e) { savedErr = (e && e.stack) || String(e); }
ok("⑪ 存档往返：JSON序列化→Core.normalize→再settle 不崩且字段留存",
   normOk && reloadOk, savedErr ? String(savedErr).slice(0, 200) : ("norm="+normOk));

// ---- 母舰 station（若成功驻舱）----
if (stationSlot && stationOk) {
  const sm = st.members[6];
  ok("⑫ 母舰精炼岗驻守 + refine 经验涨", sm.status === "stationed" && (sm.skills.refine || 0) > 0,
     "status="+sm.status+" refine="+(sm.skills.refine||0).toFixed(0));
} else {
  console.log("[skip] ⑫ 母舰精炼：未成功安装 smelt 模块/驻守（见 debug），refine 经验未自动验证");
}

console.log("\n======== RESULT: PASS=" + pass + " FAIL=" + fail + " ========");
process.exit(fail === 0 ? 0 : 1);
