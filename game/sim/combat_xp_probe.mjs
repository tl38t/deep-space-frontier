// 战斗经验对回 1 代 · parity 探针（2026-11-06）
// 验证：
//   A. advance 透传 combatants（每成员装配的武器技能键，按舰归驾驶成员）
//   B. 武器系经验按「齐射(战斗秒)」发放、按武器归属（没装某武器就不涨），defense 仅受创时涨
//   C. 安等烈度：combatIntensity 随 band 单调递增；同舰队同时长，高 band 经验更高（危险更值钱）
//   D. 离线 O(1) 证明：一次大 dt 闭式 == 多次小 dt 闭式（波数/战斗秒完全一致，证明不逐波循环）
//   E. 在线焦点(随机掷骰) vs 离线闭式：波数在容差内（parity 自洽）
// 用 Node vm 加载全部 UMD 模块，无 DOM，与 manu_xp_probe / skill_matrix 同 harness。
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

const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  vm.runInContext(code, ctx, { filename: f });
}
const { Data, Engine } = sandbox.NSK;
const St = Engine.State, Settle = Engine.Settle, Combat = Engine.Combat;

// 静音活动事件：避免 settle 每 25s 给在岗成员 roll 资源污染断言
if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") {
  sandbox.NSK.Narrative.pick = function () { return null; };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name, extra || ""); }
  else { fail++; console.log("FAIL", name, extra || ""); }
}

const now = Date.now();
function fresh() {
  const st = St.defaultState(now, Data);
  if (Data.Raids && Data.Raids.attach) Data.Raids.attach(st.starMap);  // 挂具名据点（幂等）
  st.rngSeed = 0x5EED4321;
  for (const k in st.res) st.res[k] = 999999;
  st.res.credits = 9999999;
  for (const m of st.members) {
    m.destroyed = false; m.assignment = null; m.status = "idle";
    m.passion = {};
    for (const k of St.SKILL_KEYS) m.passion[k] = "none";
    m.mods = { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 };
    m.fitted = { high: [], mid: [], low: [], rig: [] };
    m.enhancementLevel = 0;
    m.skills = {};
    for (const k of St.SKILL_KEYS) m.skills[k] = 0;
  }
  return st;
}

// 取某安等的据点节点（Data.Raids.allRaids 按 band 升序）
function raidNodeOfBand(st, band) {
  const all = Data.Raids.allRaids(st.starMap);
  return all.find(r => r.raid.band === band) || all[0];
}

// 给成员装配武器 + 设战斗 passion 为 minor（倍率 1.0，便于断言），并派往据点
function assignCombat(st, m, nodeId, weaponIds, passions) {
  m.fitted = { high: weaponIds.slice(), mid: [], low: [], rig: [] };
  for (const k of ["combatLaser", "combatTurret", "missile", "defense"]) m.passion[k] = "minor";
  if (passions) for (const k in passions) m.passion[k] = passions[k];
  m.assignment = { type: "combat", nodeId: nodeId };
  m.status = "dispatched";
}

const EQ_IDS = { laser: "t1_small_laser", cannon: "t1_small_cannon", missile: "t1_light_missile_launcher" };

// ---------- A. combatants 透传 ----------
console.log("== A. advance 透传 combatants（按舰归驾驶成员）==");
{
  const A = fresh();
  const node = raidNodeOfBand(A, 1);
  const m0 = A.members[0], m1 = A.members[1];
  assignCombat(A, m0, node.nodeId, [EQ_IDS.laser], null);
  assignCombat(A, m1, node.nodeId, [EQ_IDS.cannon, EQ_IDS.missile], null);
  A.members = [m0, m1];
  const r = Combat.advance(A, node.nodeId, 10, 0, false);
  ok("advance 返回 combatants 含 2 名参战成员", r.combatants && r.combatants.length === 2, "len=" + (r.combatants && r.combatants.length));
  const c0 = r.combatants.find(c => c.id === m0.id);
  const c1 = r.combatants.find(c => c.id === m1.id);
  ok("m0(仅激光) 技能键 = [combatLaser]", c0 && c0.keys.length === 1 && c0.keys[0] === "combatLaser", JSON.stringify(c0 && c0.keys));
  ok("m1(炮+导) 技能键 含 combatTurret 与 missile、不含 combatLaser",
     c1 && c1.keys.indexOf("combatTurret") >= 0 && c1.keys.indexOf("missile") >= 0 && c1.keys.indexOf("combatLaser") < 0, JSON.stringify(c1 && c1.keys));
}

// ---------- B. 武器系经验按波/按武器归属 + defense 受创才涨 ----------
console.log("== B. 武器系经验按波发、按武器归属；defense 仅受创时涨 ==");
{
  const B = fresh();
  const node = raidNodeOfBand(B, 1);
  const m = B.members[0];
  assignCombat(B, m, node.nodeId, [EQ_IDS.laser], null);  // 只装激光
  m.hp.shield = 1e9; m.hp.armor = 1e9; m.hp.structure = 1e9;  // 放大 hp 排除阵亡干扰，专测经验机制
  B.members = [m];
  // 离线整段（闭式，dt=3600s）：先取一次 advance 拿本段波数/受创（与 settle 单次调用同口径，已含 wipe 封顶）
  const pre = Combat.advance(B, node.nodeId, 3600, 0, false);
  const volleysPre = pre.fightSec / Combat.ROUND_SEC;   // 1 代 1 齐射 = ROUND_SEC 秒
  const inten = Settle.combatIntensity(pre.band);
  const expLaser = Settle.COMBAT_VOLLEY_XP * volleysPre * inten;   // passion minor=1.0, xpMult 默认 1.0
  const expDef = pre.damage > 0 ? Settle.COMBAT_DEF_XP * volleysPre * inten : 0;
  const beforeLaser = m.skills.combatLaser, beforeTurret = m.skills.combatTurret, beforeMissile = m.skills.missile, beforeDef = m.skills.defense;
  B.lastSeen = now - 3600 * 1000;
  Settle.settle(B, now);
  const dLaser = B.members[0].skills.combatLaser - beforeLaser;
  const dTurret = B.members[0].skills.combatTurret - beforeTurret;
  const dMissile = B.members[0].skills.missile - beforeMissile;
  const dDef = B.members[0].skills.defense - beforeDef;
  ok("战斗秒(闭式) band=" + pre.band + " fightSec=" + pre.fightSec.toFixed(0) + " waves=" + pre.waves, pre.fightSec > 0, "fightSec=" + pre.fightSec.toFixed(2));
  ok("combatLaser 增长 = VOLLEY_XP×齐射数×烈度 = " + expLaser.toFixed(2), Math.abs(dLaser - expLaser) < 1e-6, "delta=" + dLaser.toFixed(4));
  ok("combatTurret 不装炮台 → 零增长", Math.abs(dTurret) < 1e-9, "delta=" + dTurret);
  ok("missile 不装导弹 → 零增长", Math.abs(dMissile) < 1e-9, "delta=" + dMissile);
  ok("defense " + (pre.damage > 0 ? ("受创→增长 = DEF×齐射数×烈度 = " + expDef.toFixed(2)) : "未受创→零增长"),
     Math.abs(dDef - expDef) < 1e-6, "delta=" + dDef.toFixed(4) + " dmg=" + pre.damage.toFixed(2));
}

// ---------- C. 安等烈度单调性 + 不同 band 经验不同 ----------
console.log("== C. 安等烈度 ==");
{
  ok("combatIntensity 随 band 单调递增",
     Settle.combatIntensity(1) < Settle.combatIntensity(3) &&
     Settle.combatIntensity(3) < Settle.combatIntensity(5),
     [1,3,5].map(b => Settle.combatIntensity(b)).join(" < "));
  // 同舰队同武器，不同 band 同 3600s → 经验随烈度不同
  function xpForBand(band) {
    const C = fresh();
    const node = raidNodeOfBand(C, band);
    const m = C.members[0];
    assignCombat(C, m, node.nodeId, [EQ_IDS.laser], null);
    m.hp.shield = 1e9; m.hp.armor = 1e9; m.hp.structure = 1e9;  // 放大 hp 排除阵亡干扰
    C.members = [m];
    const pre = Combat.advance(C, node.nodeId, 3600, 0, false);
    const volleysPre = pre.fightSec / Combat.ROUND_SEC;
    const inten = Settle.combatIntensity(pre.band);
    return Settle.COMBAT_VOLLEY_XP * volleysPre * inten;   // 同时长、同舰队，仅 band 不同
  }
  const x1 = xpForBand(1), x3 = xpForBand(3), x5 = xpForBand(5);
  ok("band1 < band3 < band5 同时长经验", x1 < x3 && x3 < x5, [x1, x3, x5].map(v => v.toFixed(1)).join(" < "));
}

// ---------- D. 离线 O(1) 证明：一次大 dt == 多次小 dt（闭式完全一致）----------
console.log("== D. 离线 O(1)：一次大 dt 闭式 == 多次小 dt 闭式 ==");
{
  const D = fresh();
  const node = raidNodeOfBand(D, 2);
  const m = D.members[0];
  assignCombat(D, m, node.nodeId, [EQ_IDS.laser, EQ_IDS.cannon], null);
  D.members = [m];
  // 放大 hp 避免 wipe 干扰（本段只验证波数计算一致性，不验证阵亡机制）
  for (const mm of D.members) { mm.hp.shield = 1e9; mm.hp.armor = 1e9; mm.hp.structure = 1e9; }
  const TOTAL = 3600;
  // 离线：一次 advance(dt=3600)
  const once = Combat.advance(D, node.nodeId, TOTAL, 0, false);
  // 在线闭式：3600 次 advance(dt=1)，逐 tick 承接 waveHp
  let waveHp = 0, sumWaves = 0, sumDmg = 0, sumFight = 0;
  for (let t = 0; t < TOTAL; t++) {
    const r = Combat.advance(D, node.nodeId, 1, waveHp, false);
    waveHp = r.waveHp; sumWaves += r.waves; sumDmg += r.damage; sumFight += r.fightSec;
  }
  ok("一次大 dt 波数 == 多次小 dt 波数之和（≤1 波 floor 误差）",
     Math.abs(once.waves - sumWaves) <= 1, "once=" + once.waves + " sum=" + sumWaves);
  ok("一次大 dt 伤害 == 多次小 dt 伤害之和（一致）",
     Math.abs(once.damage - sumDmg) < 1e-3, "once=" + once.damage.toFixed(4) + " sum=" + sumDmg.toFixed(4));
  ok("一次大 dt 战斗秒 == 多次小 dt 战斗秒之和（一致，证明不按波循环）",
     Math.abs(once.fightSec - sumFight) < 1e-3, "once=" + once.fightSec.toFixed(4) + " sum=" + sumFight.toFixed(4));
}

// ---------- E. 在线焦点(随机) vs 离线闭式：parity 容差内 ----------
console.log("== E. 在线焦点(随机掷骰) vs 离线闭式 parity ==");
{
  // 用确定性种子替换 Math.random，使焦点随机路径可复现、探针不 flaky
  const realRandom = sandbox.Math.random;
  let s = 0x1234ABCD >>> 0;
  sandbox.Math.random = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  function setup() {
    const st = fresh();
    const node = raidNodeOfBand(st, 2);
    const m = st.members[0];
    assignCombat(st, m, node.nodeId, [EQ_IDS.laser, EQ_IDS.cannon], null);
    st.members = [m];
    for (const mm of st.members) { mm.hp.shield = 1e9; mm.hp.armor = 1e9; mm.hp.structure = 1e9; }
    return { st, node };
  }
  // 离线：一次 settle(dt=600)
  const off = setup();
  off.st.lastSeen = now - 600 * 1000;
  Settle.settle(off.st, now);
  const offWaves = (off.st.battles[off.node.nodeId] || {}).waves || 0;
  // 在线：600 次 settle(dt=1)，combatFocus=据点（走逐轮真仿真）
  const on = setup();
  on.st.combatFocus = on.node.nodeId;
  for (let i = 1; i <= 600; i++) Settle.settle(on.st, now + i * 1000);
  const onWaves = (on.st.battles[on.node.nodeId] || {}).waves || 0;

  sandbox.Math.random = realRandom;
  ok("离线/在线均清到可观波数", offWaves > 3 && onWaves > 3, "off=" + offWaves + " on=" + onWaves);
  const rel = Math.abs(offWaves - onWaves) / Math.max(1, offWaves);
  ok("在线焦点(随机) vs 离线闭式 波数相对差 ≤ 10%", rel <= 0.10, "rel=" + (rel * 100).toFixed(2) + "%");
}

console.log("\n==== 战斗经验探针 " + pass + " passed, " + fail + " failed ====");
process.exit(fail ? 1 : 0);
