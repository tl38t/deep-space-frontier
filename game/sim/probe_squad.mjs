// 验证：secLevel 分档 + 持久小队 + 剿匪结算缩放（O(1)，无逐帧循环）
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
require(base + "narrative/events.js");
require(base + "engine/combat.js");
require(base + "engine/dispatch.js");
require(base + "engine/settle.js");

const Data = window.NSK.Data;
const Settle = window.NSK.Engine.Settle;
const Combat = window.NSK.Engine.Combat;
const Dispatch = window.NSK.Engine.Dispatch;
const Events = window.NSK.Narrative;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log("  FAIL: " + m); } };

// 1) secLevel 分档：9 区 band 正确，无旧 sec 浮点
const map = Data.StarMap.generateStarMap(window.NSK.Core.makeRng(2071900));
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
ok(slp && slp.iskMult === 3.5 && slp.repMult === 2.5 && slp.requiredCL === 80, "0.0 档 iskMult3.5/repMult2.5/CL80");

// 2) pirateRaid 随 tier 与安全度变化（O(1)）
const nodeHi = map.nodes.find(n => { const r = map.regions.find(x => x.id === n.region); return r.secLevel === "1.0-0.8"; });
const nodeLo = map.nodes.find(n => { const r = map.regions.find(x => x.id === n.region); return r.secLevel === "0.0"; });
const raidHi = Data.StarMap.pirateRaid(map, nodeHi.id);
const raidLo = Data.StarMap.pirateRaid(map, nodeLo.id);
ok(raidLo.piratePower > raidHi.piratePower, "0.0 海盗战力(" + raidLo.piratePower + ") > 高安(" + raidHi.piratePower + ")");
ok(raidLo.iskMult > raidHi.iskMult, "0.0 赏金倍率 > 高安");
ok(raidLo.requiredCL === 80 && raidHi.requiredCL === 1, "requiredCL 分档");

// 3) 确定性：两次生成一致
const map2 = Data.StarMap.generateStarMap(window.NSK.Core.makeRng(2071900));
ok(JSON.stringify(map2.regions.map(r => r.secLevel)) === JSON.stringify(map.regions.map(r => r.secLevel)), "星图 secLevel 确定性");

// 4) 事件库：已删 mine_pirate，com_win 仍在
const mineEvents = Events.EVENTS.filter(e => e.activity === "mine");
ok(!mineEvents.some(e => e.id === "mine_pirate"), "mine_pirate 已删除");
ok(Events.EVENTS.some(e => e.id === "com_win"), "com_win 仍在");
// pick 不再缩放（同 rng 序列稳定）
const rngA = window.NSK.Core.makeRng(1), rngB = window.NSK.Core.makeRng(1);
const e1 = Events.pick("combat", rngA, {}), e2 = Events.pick("combat", rngB, {});
ok(e1 && e2 && e1.id === e2.id, "pick 确定性");

// 5) 持久小队：createDefaultSquad + 容量 + 参战资格
const squad = window.NSK.Engine.State ? null : null;
// 用 dispatch 直接操作 squad（state 自带 squad）
function mkState(tier) {
  return {
    version: 7, lastSeen: Date.now() - 3600 * 1000, rngSeed: 999,
    res: { credits: 0, rep: 0 },
    base: { nodeId: map.startId, fuel: 100, fuelMax: 200, squadTier: tier || 0, industry: { smeltQueue: [], manufactureQueue: [], inventQueue: [] } },
    starMap: map,
    members: [],
    squad: { enabled: false, members: [], capacity: 1 + (tier || 0), targetId: null },
    factions: [], reports: [],
  };
}
function mkMem(id) {
  return { id, status: "idle", destroyed: false,
    skills: { mining: 0, scanning: 0, archaeology: 0, refine: 0, manufacture: 0, invent: 0, combatLaser: 1000, combatTurret: 1000, command: 1000, defense: 0 },
    passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 }, assignment: null };
}
// 5a) 容量门禁（tier0，容量 1）
const st0 = mkState(0);
ok(Combat.getSquadCapacity(st0) === 1, "容量 tier0 = 1");
st0.members.push(mkMem("a")); st0.members.push(mkMem("b"));
ok(Dispatch.squadAdd(st0, "a").ok, "加入 a 成功");
let r = Dispatch.squadAdd(st0, "b");
ok(!r.ok && r.reason === "squad-full", "容量 1 时拒绝第 2 人");
r = Dispatch.squadAdd(st0, "a"); ok(!r.ok && r.reason === "already-in-squad", "重复加入拒绝");
// 5b) 升级后容量 2
const t1 = mkState(0); t1.base.squadTier = 1; ok(Combat.getSquadCapacity(t1) === 2, "容量 tier1 = 2");
const st = mkState(0); st.base.squadTier = 1; st.squad.capacity = 2;
st.members.push(mkMem("a")); st.members.push(mkMem("b"));
Dispatch.squadAdd(st, "a");
ok(Dispatch.squadAdd(st, "b").ok, "升级后可加入 b");

// 6) 派遣小队剿匪 + 结算缩放（O(1)）——用强小队（三武器 Lv60）验证 iskMult 生效
function strongMem(id) {
  return { id, status: "idle", destroyed: false,
    skills: { mining: 0, scanning: 0, archaeology: 0, refine: 0, manufacture: 0, invent: 0, combatLaser: 60000, combatTurret: 60000, command: 60000, defense: 0 },
    passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 }, assignment: null };
}
const stLo = mkState(1); stLo.members.push(strongMem("a")); stLo.members.push(strongMem("b"));
Dispatch.squadAdd(stLo, "a"); Dispatch.squadAdd(stLo, "b");
ok(Dispatch.squadDeploy(stLo, nodeLo.id).ok, "强小队派遣至 0.0 节点");
const beforeLo = stLo.res.credits; Settle.settle(stLo, Date.now()); const gainedLo = stLo.res.credits - beforeLo;
ok(gainedLo > 0, "0.0 剿匪产生星币 (" + gainedLo.toFixed(0) + ")");

const stHi = mkState(1); stHi.members.push(strongMem("a")); stHi.members.push(strongMem("b"));
Dispatch.squadAdd(stHi, "a"); Dispatch.squadAdd(stHi, "b");
Dispatch.squadDeploy(stHi, nodeHi.id);
const beforeHi = stHi.res.credits; Settle.settle(stHi, Date.now()); const gainedHi = stHi.res.credits - beforeHi;
ok(gainedLo > gainedHi * 1.5, "强队·0.0(" + gainedLo.toFixed(0) + ") > 高安(" + gainedHi.toFixed(0) + ")（iskMult 3.5×eff 缩放生效）");

// 7) O(1) 不变量：dt 封顶 24h，超大 dt 不报错且单次结算
const st3 = mkState(1); st3.members.push(mkMem("a")); st3.members.push(mkMem("b"));
Dispatch.squadAdd(st3, "a"); Dispatch.squadAdd(st3, "b"); Dispatch.squadDeploy(st3, nodeLo.id);
const big = Settle.settle(st3, st3.lastSeen + 100 * 24 * 3600 * 1000); // 100 天
ok(big.dt <= 24 * 3600 + 1, "dt 封顶 24h（得 " + Math.round(big.dt) + "s）");

console.log("\nPASS " + pass + " / FAIL " + fail);
process.exit(fail ? 1 : 0);
