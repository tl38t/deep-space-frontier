// 战术材料掉落验证探针（2026-11-09）
// 目的：验证「战斗掉落 tactic:t1..t5」已接通 —— Combat.advance 按 band 返回 drops，
//       settle.js 把 drops 累加进 state.res，使高阶增强剂配方（唯一 tactic 消费者）不再是无源死数据。
//
// 与 integration_chain 同加载范式：Node vm 加载全部 UMD 模块，无 DOM。
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
const St = Engine.State, Settle = Engine.Settle, Disp = Engine.Dispatch, Combat = Engine.Combat;

if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") {
  sandbox.NSK.Narrative.pick = function () { return null; };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name, extra || ""); }
  else { fail++; console.log("FAIL", name, extra || ""); }
}

// ---- 构造：一支能清波的战斗小队（单舰打不赢 band-1，战斗本就是小队玩法）----
const st = St.defaultState(Date.now(), Data);
while (st.members.length < 3) st.members.push(St.makeMember(Data, Math.random, st.base.nodeId));
const combatNode = st.starMap.nodes.find(n => Data.Raids.raidAt(st.starMap, n.id));
const band = combatNode ? (Data.Raids.raidAt(st.starMap, combatNode.id).band) : null;
console.log("[debug] combatNode=", combatNode && combatNode.id, " band=", band);

// 模拟「已研究战斗编制」的玩家：给 combat_squad_1/2 各升 1 级 → 据点编制上限 = 3，可组小队清波。
// （开局 cap=1，单艘起始船打不赢 band-1，tactic 本就需 progression 解锁；测试照此构造真实场景。）
st.tech = st.tech || {};
st.tech.levels = st.tech.levels || {};
st.tech.levels.combat_squad_1 = 1;
st.tech.levels.combat_squad_2 = 1;
console.log("[debug] squadCap=", Engine.Combat ? Engine.Combat.squadCapacity(st) : (Engine.Tech ? Engine.Tech.squadCapacity(st) : "?"));

// 三名成员都编入战斗、统一驱逐舰+1激光，确保能清波（wiped=false → waves>0 → 出 tactic）
const assignResults = [];
for (let i = 0; i < 3; i++) {
  const mm = st.members[i];
  mm.shipId = "destroyer";
  mm.fitted = { high: ["t1_small_laser"], mid: [], low: [], rig: [] };
  const ra = Disp.assign(st, mm.id, "combat", { nodeId: combatNode.id });
  assignResults.push(ra.ok);
}
console.log("[debug] assign oks:", JSON.stringify(assignResults),
  " combatMembers=", st.members.filter(m => m.assignment && m.assignment.type === "combat" && m.assignment.nodeId === combatNode.id).length);

// 直接验证 Combat.advance 返回 drops（纯单元层，不依赖 settle 全链）
const adv = Combat.advance(st, combatNode.id, 3600, 0, false);
const tacticKey = "tactic:t" + band;
const advDrop = adv.drops ? (adv.drops[tacticKey] || 0) : 0;
console.log("[debug] adv:", JSON.stringify({
  waves: adv.waves, dmg: adv.dmg, fireSec: adv.fireSec, noWeapon: adv.noWeapon,
  weaponDps: adv.weaponDps, squadDps: adv.squadDps, incomingDps: adv.incomingDps,
  wiped: adv.wiped, band: adv.band, combatants: adv.combatants && adv.combatants.length
}));
ok("① Combat.advance 按 band 返回 tactic 掉落", !!adv.drops && advDrop > 0,
   "key=" + tacticKey + " drop=" + advDrop.toFixed(3) + " waves=" + adv.waves);

// ---- 全链验证：settle 把 drops 写进 state.res ----
const STEP = 3600;
const t0 = Date.now();
st.lastSeen = t0;
const before = st.res[tacticKey] || 0;
let thrown = 0, lastErr = null;
let t = t0;
for (let k = 0; k < 24; k++) {
  t += STEP * 1000;
  try { Settle.settle(st, t); }
  catch (e) { thrown++; lastErr = (e && e.stack) || String(e); break; }
}
ok("② 主循环零异常（24步×1h）", thrown === 0, lastErr ? ("ERR:" + String(lastErr).slice(0, 200)) : "");

const after = st.res[tacticKey] || 0;
ok("③ settle 把 tactic 累加进 state.res（" + tacticKey + " 上升）",
   after > before && after > 0,
   "before=" + before.toFixed(3) + " after=" + after.toFixed(3) + " delta=" + (after - before).toFixed(3));

// 存档往返安全：tactic 键已在 Resources.ALL，normalize 补 0 / 不删键
let normOk = false;
try {
  const norm = Core.normalize(JSON.parse(JSON.stringify(st)));
  normOk = !!norm && (norm.res[tacticKey] !== undefined) && (norm.res[tacticKey] > 0);
} catch (e) { console.log("[debug] roundtrip err:", e.message); }
ok("④ 存档往返安全（tactic 键已注册，不丢）", normOk, "normOk=" + normOk);

console.log("\n==== RESULT: PASS=" + pass + " FAIL=" + fail + " ====");
process.exit(fail === 0 ? 0 : 1);
