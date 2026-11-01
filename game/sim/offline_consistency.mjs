// 离线一致性回归：同一份战斗，只改结算粒度（dt），结果必须收敛。
//
// 为什么需要这个文件：
//   2026-11-01 发现 combat.js 的闭式结算里「层不回卷」—— 一次 dt 内伤害刻度 hp 单调增长且从不取模，
//   一旦 hp ≥ fleetHp，layerAt 的 remain 被 Math.max(0,…) 夹成 0，永久返回 "structure"。
//   结果：打穿第一支编队后克制彻底失效/失效反转，离线 1 小时收益偏差 −13% ~ +18%（方向取决于配装）。
//   修法：打穿一波立刻回卷 + 波首整波跳除（段数仍是常数，O(1) 不破）。
//   这个文件就是为了不让它悄悄回来。
//
// ⚠️ 这里用 Combat.advance 而不是 Settle.settle：settle 每 tick 会长成员技能，
//    小 dt 会因「技能逐步变强」天然多算约 2%，那是技能成长的正常表现，不是结算粒度误差，
//    混进来会掩盖真正要测的东西。
import { createRequire } from "module";
const require = createRequire(import.meta.url);

global.window = global;
global.NSK = {}; window.NSK = global.NSK;
global.NSK.Engine = {};
global.NSK.Engine.Production = { processAll: () => [], canAfford: () => true, spend: () => {} };
global.NSK.Engine.Faction = { refreshFactions: () => {}, deliverQuest: () => {}, attemptMission: () => {}, missionSuccessChance: () => 0.5 };

const base = "D:/深空星疆：商业与战争/game/js/";
require(base + "core/rng.js");
require(base + "data/resources.js");
require(base + "data/equipment.js");
require(base + "data/starmap.js");
window.NSK.Data = window.NSK.Data || {};
window.NSK.Data.Pirates = require(base + "data/pirates.js");
require(base + "narrative/events.js");
require(base + "engine/mastery.js");
require(base + "engine/combat.js");
require(base + "engine/dispatch.js");
require(base + "engine/settle.js");

const Data = window.NSK.Data;
const Combat = window.NSK.Engine.Combat;
const Dispatch = window.NSK.Engine.Dispatch;

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) pass++;
  else { fail++; console.log("  FAIL: " + m + (d ? "  [" + d + "]" : "")); }
};

const map = Data.StarMap.generateStarMap(window.NSK.Core.makeRng(2071900));
const nid = map.startId;
const LASER = "t1_small_laser", MISSILE = "t1_light_missile_launcher", CANNON = "t1_small_cannon";
const FITS = [
  ["纯激光", [LASER]],
  ["纯导弹", [MISSILE]],
  ["纯射弹", [CANNON]],
  ["三弹混装", [LASER, MISSILE, CANNON]],
];

// 固定 6 名成员、6 门炮、血池拉满（排除「被打穿撤离」对波数的截断）
function mk(weapons, ammo) {
  const st = {
    version: 8, lastSeen: Date.now(), rngSeed: 9, starMap: map,
    res: { credits: 0, rep: 0, ammo_laser: 0, ammo_missile: 0, ammo_cannon: 0 },
    base: { nodeId: nid, fuel: 200, fuelMax: 200, squadTier: 0, industry: { smeltQueue: [], manufactureQueue: [], inventQueue: [] }, repairQueue: [] },
    members: [], squad: { enabled: false, members: [], capacity: 20, targetId: null },
    factions: [], reports: [], battles: {}, combatWaveHp: {}, combatFocus: null,
    equipment: { [LASER]: 999, [MISSILE]: 999, [CANNON]: 999 },
  };
  const cap = ammo == null ? 1e9 : ammo;
  st.res.ammo_laser = cap; st.res.ammo_missile = cap; st.res.ammo_cannon = cap;
  for (let i = 0; i < 6; i++) st.members.push({
    id: "m" + i, name: "m" + i, status: "idle", destroyed: false,
    skills: { mining: 0, scanning: 0, archaeology: 0, refine: 0, manufacture: 0, invent: 0, combatLaser: 3000, combatTurret: 3000, command: 3000, defense: 0 },
    passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 },
    assignment: null, shipId: "destroyer",
    fitted: { high: weapons.slice(), mid: [], low: [], rig: [] },
    hp: { shield: 1e12, armor: 1e12, structure: 1e12 },
  });
  st.members.forEach(m => Dispatch.assign(st, m.id, "combat", { nodeId: nid }));
  return st;
}

// 用 advance 逐跳跑 totalSec 秒，返回 { waves, segs, ms }
function run(dt, totalSec, weapons) {
  const st = mk(weapons);
  const steps = Math.max(1, Math.round(totalSec / dt));
  let wHp = 0, waves = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < steps; i++) {
    const r = Combat.advance(st, nid, dt, wHp, false);
    wHp = r.waveHp;
    waves += r.waves;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { waves, rate: waves / (steps * dt), ms };
}

// ---------- 1) 层回卷的本体：打穿一波后层必须回到 shield ----------
console.log("[1] 层回卷");
{
  const st = mk([LASER]);
  const P = Combat.prepareNode(st, nid);
  const F = P.fleetHp, S = P.fleetHpSum;
  ok(Combat.layerAt(P, 0) === "shield", "刻度 0 → shield");
  ok(Combat.layerAt(P, S.shield) === "armor", "刻度 = 盾血 → armor");
  ok(Combat.layerAt(P, S.shield + S.armor) === "structure", "刻度 = 盾+甲 → structure");

  // 关键：一次 dt 跑 10 波，段里必须出现 shield/armor/structure 三层，而不是只有 structure
  const fp = Combat.fireSegments(P, st.res, P.waveSec * 10, 0);
  const seen = {};
  fp.segs.forEach(s => { seen[s.layer] = (seen[s.layer] || 0) + s.sec; });
  ok(!!(seen.shield > 0 && seen.armor > 0 && seen.structure > 0),
    "dt=10 波时三层都被打到（旧实现在第 1 波后就只剩 structure）",
    "盾=" + (seen.shield || 0).toFixed(2) + " 甲=" + (seen.armor || 0).toFixed(2) + " 构=" + (seen.structure || 0).toFixed(2));

  // 三层时长比必须等于「该层血量 ÷ 该层 dps」，即每波都完整走三层
  const tShield = (S.shield) / Combat.layerDps(P.dpsByType, "shield", null);
  const tArmor = (S.armor) / Combat.layerDps(P.dpsByType, "armor", null);
  const tStruct = (S.structure) / Combat.layerDps(P.dpsByType, "structure", null);
  ok(Math.abs(Combat.fullWaveSec(P, null) - (tShield + tArmor + tStruct)) < 1e-9,
    "一波耗时 = 盾段+甲段+构段",
    Combat.fullWaveSec(P, null).toFixed(6) + "s");
  ok(Math.abs(fp.waves - 10) <= 1, "dt=10 波 → 打出 10 波（±1 取整）", "waves=" + fp.waves);
}

// ---------- 2) 粒度无关性：dt 从 0.25 到 3600，每配装偏差 < 0.5% ----------
console.log("[2] 粒度无关性（1 小时，基准 dt=0.25）");
const REF = {};
for (const [label, ws] of FITS) {
  const ref = run(0.25, 3600, ws);
  REF[label] = ref.rate;
  const row = [];
  let worst = 0;
  for (const dt of [1, 60, 900, 3600]) {
    const r = run(dt, 3600, ws);
    const dev = Math.abs(r.rate - ref.rate) / ref.rate * 100;
    if (dev > worst) worst = dev;
    row.push("dt=" + dt + ":" + dev.toFixed(3) + "%");
  }
  console.log("    " + label.padEnd(9) + "基准 " + String(ref.waves).padStart(5) + " 波/时   " + row.join("  "));
  ok(worst < 0.5, label + " 各粒度偏差 < 0.5%", "worst=" + worst.toFixed(3) + "%");
}

// ---------- 3) 24 小时（离线封顶）与 1 小时的「波/秒」必须一致 ----------
console.log("[3] 离线 24h 与在线 1h 同频");
for (const [label, ws] of FITS) {
  const day = run(86400, 86400, ws);
  const dev = Math.abs(day.rate - REF[label]) / REF[label] * 100;
  console.log("    " + label.padEnd(9) + "离线 24h " + String(day.waves).padStart(6) + " 波 = " +
    (day.waves / 24).toFixed(1) + " 波/时   偏差 " + dev.toFixed(3) + "%");
  ok(dev < 0.5, label + " dt=86400 波/秒与在线基准一致", "偏差 " + dev.toFixed(3) + "%");
}

// ---------- 4) O(1)：段数与耗时都不随 dt 增长 ----------
console.log("[4] O(1)");
{
  const st = mk([LASER, MISSILE, CANNON]);
  const P = Combat.prepareNode(st, nid);
  const segsByDt = {};
  const msByDt = {};
  for (const dt of [1, 60, 3600, 86400]) {
    let r;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 300; i++) r = Combat.fireSegments(P, st.res, dt, 0);
    msByDt[dt] = Number(process.hrtime.bigint() - t0) / 1e6 / 300;
    segsByDt[dt] = r.segs.length;
  }
  ok(Math.max(...Object.values(segsByDt)) <= Combat.SEG_GUARD,
    "段数恒 ≤ SEG_GUARD(" + Combat.SEG_GUARD + ")",
    JSON.stringify(segsByDt));
  ok(segsByDt[86400] - segsByDt[1] <= 4,
    "dt 放大 86400 倍后段数只多 " + (segsByDt[86400] - segsByDt[1]) + " 段",
    "dt=1:" + segsByDt[1] + " dt=86400:" + segsByDt[86400]);
  const ratio = msByDt[86400] / Math.max(msByDt[1], 1e-9);
  ok(ratio < 3, "单次耗时与 dt 无关（86400s ÷ 1s = " + ratio.toFixed(2) + " 倍，O(dt) 会是 86400 倍）",
    "dt=1:" + msByDt[1].toFixed(4) + "ms dt=86400:" + msByDt[86400].toFixed(4) + "ms");
}

// ---------- 5) 弹药约束不被整波跳除绕过 ----------
console.log("[5] 弹药约束");
{
  const st = mk([LASER]);
  const P = Combat.prepareNode(st, nid);
  const tf = Combat.fullWaveSec(P, null);
  for (const n of [1, 3, 7]) {
    const ammo = P.ammoRate.laser * tf * n;
    const res = { ...st.res, ammo_laser: ammo, ammo_missile: 0, ammo_cannon: 0 };
    const fp = Combat.fireSegments(P, res, 86400, 0);
    ok(fp.waves === n && fp.allDry === true,
      "弹药只够 " + n + " 波 → 精确停在 " + n + " 波并判弹尽",
      "waves=" + fp.waves + " fireSec=" + fp.fireSec.toFixed(3) + "s 段数=" + fp.segs.length);
    ok(Math.abs(fp.fireSec - tf * n) < 1e-6,
      "  开火时长 = " + n + " × 一波耗时",
      fp.fireSec.toFixed(6) + " vs " + (tf * n).toFixed(6));
  }
}

// ---------- 6) 焦点路径（逐轮掷骰）也必须回卷 ----------
console.log("[6] 焦点 / 非焦点同规则");
{
  // 从「本波还剩 5% 结构」起步打 2 秒 = 2 轮（1 轮 = 1 秒）：
  //   第 1 轮在 structure 层，打穿后必须回卷到 shield，第 2 轮才吃得到激光的盾克制。
  //   不回卷的话两轮都锁在 structure，2 秒伤害 = structure × 2。
  const st = mk([LASER]);
  const P = Combat.prepareNode(st, nid);
  const startHp = P.fleetHp * 0.95;
  const dShield = Combat.layerDps(P.dpsByType, "shield", null);
  const dStruct = Combat.layerDps(P.dpsByType, "structure", null);
  const expect = dStruct + dShield;      // 第 1 轮结构 + 第 2 轮回盾

  const N = 4000;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += Combat.simulateVolley(P, st.res, 2, startHp).dmg;
  const simAvg = sum / N;

  ok(Math.abs(simAvg - expect) / expect < 0.03,
    "逐轮仿真跨波后回到 shield（= 结构 1 秒 + 盾 1 秒）",
    "实测=" + simAvg.toFixed(1) + " 期望=" + expect.toFixed(1) + " 偏差=" + (Math.abs(simAvg - expect) / expect * 100).toFixed(2) + "%");
  ok(simAvg > dStruct * 2 * 1.05,
    "不是「2 秒都锁在 structure」（那是旧实现的结果）",
    "实测=" + simAvg.toFixed(1) + " 锁死值=" + (dStruct * 2).toFixed(1));

  // 闭式同场景解析解：先补完本波剩余 5% 结构，剩下的时间按「整波 + 余量打盾」走
  //   （2 秒 > 0.106s 余量 + 1.857s 一整波，所以会打完一整波再回来打盾）
  const closed = Combat.fireSegments(P, st.res, 2, startHp).dmg;
  const tRem = (P.fleetHp * 0.05) / dStruct;
  let rest = 2 - tRem;
  const tf2 = Combat.fullWaveSec(P, null);
  const whole = Math.floor(rest / tf2);
  rest -= whole * tf2;
  const expectClosed = P.fleetHp * 0.05 + whole * P.fleetHp + rest * dShield;
  ok(Math.abs(closed - expectClosed) / expectClosed < 0.01,
    "闭式同场景与解析解一致（余量 " + tRem.toFixed(3) + "s + " + whole + " 整波 + " + rest.toFixed(3) + "s 盾）",
    "实测=" + closed.toFixed(1) + " 期望=" + expectClosed.toFixed(1));
}

// ---------- 7) UI 的一波时长 = 含克制的真实耗时 ----------
console.log("[7] waveSec 口径");
for (const [label, ws] of FITS) {
  const st = mk(ws);
  const P = Combat.prepareNode(st, nid);
  const fp = Combat.fireSegments(P, st.res, P.waveSec, 0);
  ok(Math.abs(fp.waves - 1) <= 1 && Math.abs(fp.fireSec - P.waveSec) < 1e-6,
    label + " 按 waveSec 打一轮正好打穿一波",
    "waveSec=" + P.waveSec.toFixed(3) + "s fireSec=" + fp.fireSec.toFixed(3) + "s waves=" + fp.waves);
  // 且与「无克制」的旧口径不同（除非一件武器都不克制任何层——不存在）
  const oldStyle = P.fleetHp / P.squadDps;
  ok(Math.abs(P.waveSec - oldStyle) > 1e-6,
    label + " waveSec 已含克制（不是 fleetHp/无克制DPS）",
    "新=" + P.waveSec.toFixed(3) + " 旧口径=" + oldStyle.toFixed(3));
}

console.log("\n======== RESULT: PASS=" + pass + " FAIL=" + fail + " ========");
if (fail > 0) process.exitCode = 1;
