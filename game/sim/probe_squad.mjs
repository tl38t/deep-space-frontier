// 验证：具名据点（战斗节点）+ 编制容量（科技解锁）+ 剿匪结算缩放（O(1)，无逐帧循环）
//
// 2026-11-01 重写：原文件测的是「持久小队 squad 名册 + squadTier 容量」，
// 那套状态已整体退役（容量门禁挂在 squad 上，assign 直派能完全绕过，实测容量 1 派 6 人）。
// 现在的规则：
//   · 战斗只发生在星图上的具名据点 node.raid（data/raids.js）
//   · 编制上限由科技 Engine.Tech.squadCapacity 决定（1 → 2 → 3）
//   · 门禁在 Engine.Dispatch.assign —— 唯一的派遣入口，绕不过去
import { createRequire } from "module";
const require = createRequire(import.meta.url);
global.window = global;
global.NSK = {}; window.NSK = global.NSK;
// 桩：settle 在加载时捕获 Production/Faction，先给空实现
global.NSK.Engine = {};
global.NSK.Engine.Production = { processAll: () => [], canAfford: () => true, spend: () => {} };
global.NSK.Engine.Faction = { refreshFactions: () => {}, deliverQuest: () => {}, attemptMission: () => {}, missionSuccessChance: () => 0.5 };

const base = "D:/深空星疆：商业与战争/game/js/";
require(base + "core/rng.js");
require(base + "data/resources.js");
require(base + "data/starmap.js");
// UMD 在 require 环境下走 module.exports，不会自己挂 NSK，必须手动接上
window.NSK.Data = window.NSK.Data || {};
window.NSK.Data.Pirates = require(base + "data/pirates.js");
window.NSK.Data.Raids = require(base + "data/raids.js");
window.NSK.Data.Tech = require(base + "data/tech.js");
require(base + "narrative/events.js");
require(base + "engine/tech.js");
require(base + "engine/combat.js");
require(base + "engine/dispatch.js");
require(base + "engine/settle.js");

const Data = window.NSK.Data;
const Settle = window.NSK.Engine.Settle;
const Combat = window.NSK.Engine.Combat;
const Dispatch = window.NSK.Engine.Dispatch;
const Tech = window.NSK.Engine.Tech;
const Raids = Data.Raids;
const Events = window.NSK.Narrative;

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; } else { fail++; console.log("  FAIL: " + m + (d ? "  [" + d + "]" : "") + ""); } };

// 1) secLevel 分档：9 区 band 正确，无旧 sec 浮点
const map = Data.StarMap.generateStarMap(window.NSK.Core.makeRng(2071900));
Raids.attach(map);
ok(map.regions.length === 9, "9 星域");
const bands = {};
for (const r of map.regions) {
  ok(r.secLevel != null && !("sec" in r), "region " + r.name + " 用 secLevel 无旧 sec");
  bands[r.secLevel] = (bands[r.secLevel] || 0) + 1;
}
ok(bands["1.0-0.8"] === 4, "高安 4 区 (得 " + (bands["1.0-0.8"] || 0) + ")");
ok(bands["0.7-0.5"] === 1, "边境 1 区");
ok(bands["0.4-0.3"] === 2, "低安 2 区");
ok(bands["0.2-0.1"] === 1 && bands["0.0"] === 1, "深空/0.0 各 1 区");
const slp = Data.StarMap.SECLEVEL_TABLE["0.0"];
ok(slp && slp.iskMult === 3.5 && slp.repMult === 2.5 && slp.band === 5, "0.0 档 iskMult3.5/repMult2.5/band5");

// 2) 具名据点：每星域 2 个（常规 + 精锐），共 18 个
const all = Raids.allRaids(map);
ok(all.length === 18, "据点总数 = 18（得 " + all.length + "）");
const perRegion = {};
for (const r of all) perRegion[r.region] = (perRegion[r.region] || 0) + 1;
ok(Object.keys(perRegion).length === 9 && Object.values(perRegion).every(v => v === 2),
  "每星域恰好 2 个据点", JSON.stringify(perRegion));

// 命名：同势力内不重名（1 代词表每势力 6 个类型词，正好覆盖 6 个据点）
const byFaction = {};
for (const r of all) (byFaction[r.raid.faction] = byFaction[r.raid.faction] || []).push(r.raid.name);
let dup = null;
for (const f in byFaction) {
  const set = new Set(byFaction[f]);
  if (set.size !== byFaction[f].length) dup = f + ":" + byFaction[f].join(",");
}
ok(!dup, "同势力据点不重名", dup || "");
ok(all.every(r => r.raid.name && r.raid.name.length >= 3), "每个据点都有名字");

// band：精锐 = 常规 +1（封顶 5），且全档 1~5 都出现
const bandSet = {};
for (const r of all) bandSet[r.raid.band] = 1;
ok([1, 2, 3, 4, 5].every(b => bandSet[b]), "据点覆盖 band 1~5（不出现难度断层）", Object.keys(bandSet).join(","));
const sameRegion = all.filter(r => r.region === all[0].region);
ok(sameRegion.length === 2 && sameRegion.some(r => r.raid.elite) && sameRegion.some(r => !r.raid.elite),
  "同星域一个常规一个精锐");
ok(sameRegion.find(r => r.raid.elite).raid.band >= sameRegion.find(r => !r.raid.elite).raid.band,
  "精锐 band ≥ 常规 band");

// 3) 普通节点不可剿匪（这是本次设计的核心：战斗只发生在据点）
const plainNode = map.nodes.find(n => !n.raid && n.discovered !== false);
ok(!!plainNode, "存在普通节点");
function mkState(cap0) {
  const st = {
    version: 8, lastSeen: Date.now() - 3600 * 1000, rngSeed: 999,
    res: { credits: 0, rep: 0 },
    base: { nodeId: map.startId, fuel: 100, fuelMax: 200, industry: { smeltQueue: [], manufactureQueue: [], inventQueue: [] } },
    starMap: map,
    members: [],
    tech: { levels: {}, active: null },
    factions: [], reports: [], battles: {}, combatWaveHp: {},
  };
  if (cap0 >= 2) st.tech.levels.combat_squad_1 = 1;
  if (cap0 >= 3) st.tech.levels.combat_squad_2 = 1;
  return st;
}
function mkMem(id) {
  return { id, status: "idle", destroyed: false,
    skills: { mining: 0, scanning: 0, archaeology: 0, refine: 0, manufacture: 0, invent: 0, combatLaser: 1000, combatTurret: 1000, command: 1000, defense: 0 },
    passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 }, assignment: null,
    fitted: { high: [], mid: [], low: [], rig: [] } };
}

const stPlain = mkState(1);
stPlain.members.push(mkMem("a"));
const rPlain = Dispatch.assign(stPlain, "a", "combat", { nodeId: plainNode.id });
ok(!rPlain.ok && String(rPlain.err).indexOf("据点") > -1, "普通节点派遣战斗被拒", JSON.stringify(rPlain));
ok(Combat.prepareNode(stPlain, plainNode.id) === null, "普通节点 prepareNode = null（不产战斗）");

// 4) 编制容量：科技解锁 1 → 2 → 3
const RAID_NODE = all[0].nodeId;
ok(Tech.squadCapacity(mkState(1)) === 1, "基础编制 = 1 人");
ok(Tech.squadCapacity(mkState(2)) === 2, "研究「战斗编制 I」→ 2 人");
ok(Tech.squadCapacity(mkState(3)) === 3, "研究「战斗编制 II」→ 3 人");

// 5) 容量门禁：容量 1 时第 2 人派不进；容量 2 时进得去
const st1 = mkState(1);
st1.members.push(mkMem("a")); st1.members.push(mkMem("b"));
ok(Dispatch.assign(st1, "a", "combat", { nodeId: RAID_NODE }).ok, "容量 1 时第 1 人派遣成功");
const rB = Dispatch.assign(st1, "b", "combat", { nodeId: RAID_NODE });
ok(!rB.ok && String(rB.err).indexOf("编制已满") > -1, "容量 1 时第 2 人被拒（门禁在 assign，绕不过去）", JSON.stringify(rB));
ok(Dispatch.fightingAt(st1, RAID_NODE) === 1, "实际参战 1 人（不是「派了 2 个」）");

const st2 = mkState(2);
st2.members.push(mkMem("a")); st2.members.push(mkMem("b")); st2.members.push(mkMem("c"));
Dispatch.assign(st2, "a", "combat", { nodeId: RAID_NODE });
ok(Dispatch.assign(st2, "b", "combat", { nodeId: RAID_NODE }).ok, "容量 2 时第 2 人派遣成功");
ok(!Dispatch.assign(st2, "c", "combat", { nodeId: RAID_NODE }).ok, "容量 2 时第 3 人被拒");

// 6) 科技研究流程：花费 → 计时 → 完成 → 容量提升；前置与重复研究被拒
const stT = mkState(1);
stT.res.credits = 100000;
const node1 = Data.Tech.byId("combat_squad_1");
ok(Tech.canStart(stT, "combat_squad_2").ok === false, "前置未完成时不能研究 II");
const credBefore = stT.res.credits;
const t0 = Date.now();
ok(Tech.start(stT, "combat_squad_1", t0).ok, "开始研究「战斗编制 I」");
ok(stT.res.credits === credBefore - node1.cost.credits, "研究扣星币 " + node1.cost.credits);
ok(Tech.squadCapacity(stT) === 1, "研究进行中容量还没变");
ok(Tech.advance(stT, t0 + 1000) === null, "未到时间不完成");
const doneR = Tech.advance(stT, t0 + node1.sec * 1000 + 1);
ok(!!doneR && doneR.node.id === "combat_squad_1", "到时间后完成");
ok(Tech.squadCapacity(stT) === 2, "完成后容量 1 → 2");
ok(Tech.start(stT, "combat_squad_1", t0).ok === false, "已完成的科技不能重复研究");
ok(Tech.canStart(stT, "combat_squad_2").ok === true, "I 完成后 II 解锁");

// 6b) 取消研究：星币不退，但已熬的进度按比例保留；再开始时只熬剩下的时长
const stC = mkState(1);
stC.res.credits = 100000;
const sec1 = node1.sec;
const c0 = Date.now();
const paid = stC.res.credits;
Tech.start(stC, "combat_squad_1", c0);
const afterPay = stC.res.credits;
ok(afterPay === paid - node1.cost.credits, "开始研究扣费 " + node1.cost.credits);
const cancelAt = c0 + sec1 * 1000 * 0.4;          // 熬到 40% 时取消
const rc = Tech.cancel(stC, cancelAt, "combat_squad_1");
ok(rc.ok, "取消研究成功", JSON.stringify(rc));
ok(stC.res.credits === afterPay, "取消**不退还**星币（余额与取消前一致）", "credits=" + stC.res.credits);
ok(stC.tech.active === null, "取消后没有进行中的研究");
const savedP = Tech.savedProgressOf(stC, "combat_squad_1");
ok(Math.abs(savedP - 0.4) < 0.02, "已熬的 40% 被保留", "saved=" + savedP.toFixed(3));
ok(Tech.progress(stC, cancelAt) === 0, "没有研究时 progress = 0");
const vC = Tech.nodeView(stC, "combat_squad_1", cancelAt);
ok(vC.status === "available" && vC.savedProgress > 0.38, "方块回到「可研究」但带着保留进度",
  vC.status + " saved=" + vC.savedProgress.toFixed(3));
ok(Math.abs(vC.needSec - sec1 * (1 - savedP)) < 1, "nodeView.needSec 扣掉已保留的部分",
  "need=" + vC.needSec.toFixed(0) + "s");

// id 校验：拿别的节点 id 取消必须被拒（UI 上可能残留过期按钮）
Tech.start(stC, "combat_squad_1", cancelAt);
const rcWrong = Tech.cancel(stC, cancelAt + 1000, "combat_squad_2");
ok(!rcWrong.ok, "用别的 id 取消被拒（防陈旧按钮误取消）", JSON.stringify(rcWrong));
const rc2 = Tech.cancel(stC, cancelAt + 1000, "combat_squad_1");
ok(rc2.ok && rc2.progress > savedP, "再次取消：进度继续累积", "p=" + rc2.progress.toFixed(3));

// 继续研究：付全额，但只熬剩下的
const credBefore2 = stC.res.credits;
const rResume = Tech.start(stC, "combat_squad_1", cancelAt + 1000);
ok(rResume.ok, "带保留进度可以继续研究");
ok(stC.res.credits === credBefore2 - node1.cost.credits, "继续研究仍要付**全额**");
const needMs = stC.tech.active.endsAt - (cancelAt + 1000);
ok(needMs < sec1 * 1000 * 0.7, "这次只需熬剩余时长", "need=" + (needMs / 1000).toFixed(0) + "s / full=" + sec1 + "s");
ok(Tech.progress(stC, stC.tech.active.startedAt) > 0.3, "进度条从保留的位置起步（不是从 0）",
  "p=" + Tech.progress(stC, stC.tech.active.startedAt).toFixed(3));

// 完成 → 保留进度清空
Tech.advance(stC, stC.tech.active.endsAt + 1);
ok(Tech.levelOf(stC, "combat_squad_1") === 1, "熬满后升到 Lv1");
ok(Tech.savedProgressOf(stC, "combat_squad_1") === 0, "完成后保留进度清空");
ok(Tech.cancel(stC, Date.now()).ok === false, "没有进行中研究时取消返回失败");

// 进度封顶 0.999：否则「取消 → 重新开始」会立刻完成，等于白嫖一次
const stCap = mkState(1);
stCap.res.credits = 100000;
Tech.start(stCap, "combat_squad_1", 1000000);
Tech.cancel(stCap, 1000000 + sec1 * 1000, "combat_squad_1");   // 刚好到点时取消
ok(Tech.savedProgressOf(stCap, "combat_squad_1") <= 0.999, "进度封顶 0.999",
  "saved=" + Tech.savedProgressOf(stCap, "combat_squad_1").toFixed(4));
ok(Tech.advance(stCap, 1000000 + sec1 * 1000 + 1) === null, "取消后不会自己完成");

// 7) 无武器 = 0 波 0 掉落（1 代规则：伤害 100% 来自装配武器）
function strongMem(id) {
  return { id, status: "idle", destroyed: false,
    skills: { mining: 0, scanning: 0, archaeology: 0, refine: 0, manufacture: 0, invent: 0, combatLaser: 60000, combatTurret: 60000, command: 60000, defense: 0 },
    passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 }, assignment: null,
    fitted: { high: [], mid: [], low: [], rig: [] } };
}
const stLo = mkState(2); stLo.members.push(strongMem("a")); stLo.members.push(strongMem("b"));
Dispatch.assign(stLo, "a", "combat", { nodeId: RAID_NODE });
Dispatch.assign(stLo, "b", "combat", { nodeId: RAID_NODE });
const Plo0 = Combat.prepareNode(stLo, RAID_NODE);
ok(!!Plo0 && Plo0.cnt === 2 && Plo0.weapons.length === 0, "无装配 → 0 件武器参战");
Settle.settle(stLo, Date.now());
const bLo = stLo.battles[RAID_NODE];
ok(!!bLo && bLo.waves === 0 && bLo.credits === 0, "无武器剿匪 → 0 波 0 星币（不是挂机白拿钱）");

// 8) 每波掉落按据点 iskMult 缩放（0.0 精锐 ÷ 高安常规 与两者 iskMult 之比一致）
const hiRaid = all.find(r => !r.raid.elite && r.raid.band === 1);
const loRaid = all.filter(r => r.raid.band === 5).sort((a, b) => b.raid.iskMult - a.raid.iskMult)[0];
ok(!!hiRaid && !!loRaid, "找到高安常规与 0.0 据点", (hiRaid ? hiRaid.raid.name : "-") + " / " + (loRaid ? loRaid.raid.name : "-"));
const stA = mkState(1), stB = mkState(1);
stA.members.push(strongMem("a")); stB.members.push(strongMem("a"));
Dispatch.assign(stA, "a", "combat", { nodeId: hiRaid.nodeId });
Dispatch.assign(stB, "a", "combat", { nodeId: loRaid.nodeId });
const PA = Combat.prepareNode(stA, hiRaid.nodeId);
const PB = Combat.prepareNode(stB, loRaid.nodeId);
const wantRatio = loRaid.raid.iskMult / hiRaid.raid.iskMult;
ok(!!PA && !!PB && Math.abs(PB.dropCredits / PA.dropCredits - wantRatio) < 1e-6,
  "每波掉落 = 据点 iskMult 缩放：" + PB.dropCredits.toFixed(1) + " ÷ " + PA.dropCredits.toFixed(1) +
  " = " + (PB.dropCredits / PA.dropCredits).toFixed(3) + "（应 " + wantRatio.toFixed(3) + "）");
// 精锐据点血更厚（band 更高 → 1 代 ENEMY_DATABASE 档位更高）
ok(PB.fleetHp > PA.fleetHp, "0.0 编队血量 > 高安（" + PB.fleetHp + " / " + PA.fleetHp + "）");

// 9) 事件库：已删 mine_pirate，com_win 仍在
const mineEvents = Events.EVENTS.filter(e => e.activity === "mine");
ok(!mineEvents.some(e => e.id === "mine_pirate"), "mine_pirate 已删除");
ok(Events.EVENTS.some(e => e.id === "com_win"), "com_win 仍在");

// 10) O(1) 不变量：dt 封顶 24h，超大 dt 不报错且单次结算
const st3 = mkState(2); st3.members.push(mkMem("a")); st3.members.push(mkMem("b"));
Dispatch.assign(st3, "a", "combat", { nodeId: RAID_NODE });
Dispatch.assign(st3, "b", "combat", { nodeId: RAID_NODE });
const big = Settle.settle(st3, st3.lastSeen + 100 * 24 * 3600 * 1000); // 100 天
ok(big.dt <= 24 * 3600 + 1, "dt 封顶 24h（得 " + Math.round(big.dt) + "s）");

console.log("\nPASS " + pass + " / FAIL " + fail);
process.exit(fail ? 1 : 0);
