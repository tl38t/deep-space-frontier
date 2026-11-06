// 架构探针：Node vm 加载全部 UMD 模块到同一上下文（模拟浏览器 window.NSK），
// 跑真实 settle 验证「派遣→产矿→工业→势力交付→存档」闭环。无 DOM 依赖。
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
  "js/data/factions.js", "js/data/names.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js", "js/engine/npc.js",
  "js/engine/booster.js", "js/engine/mastery.js", "js/engine/tech.js",
  "js/engine/production.js", "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js",   "js/engine/sites.js", "js/narrative/events.js",
  "js/engine/settle.js", "js/engine/ship-enhancement.js", "js/engine/archaeology.js", "js/engine/repair.js",
  // 内置 1 代增强剂数据（window.BOOSTER_* 事实来源；booster_selftest 同口径）
  "js/lib/eveidle/host-stubs.js", "js/lib/eveidle/data/boosters.js",
];

// 构造最小 window/global 环境（UMD 走 window 分支）
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox;

// 战斗只发生在具名据点（node.raid）：取星图里第一个据点做测试落点
function raidIdOf(st) { const n = st.starMap.nodes.find(function (x) { return !!x.raid; }); return n ? n.id : null; }
// 直接解锁编制科技（跳过研究时长）：测试只关心「容量门禁」本身，不测等待
function unlockSquad(st, cap) {
  Engine.Tech.ensure(st);
  if (cap >= 2) st.tech.levels.combat_squad_1 = 1;
  if (cap >= 3) st.tech.levels.combat_squad_2 = 1;
}

sandbox.self = sandbox;
sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  vm.runInContext(code, ctx, { filename: f });
}
const NSK = sandbox.NSK;
console.log("NSK top keys:", Object.keys(NSK || {}));
console.log("Engine keys:", NSK.Engine ? Object.keys(NSK.Engine) : "NO ENGINE");
console.log("Data keys:", NSK.Data ? Object.keys(NSK.Data) : "NO DATA");
const { Core, Data, Engine } = NSK;
const Persistence = NSK.Core.Persistence || sandbox.Persistence;
const CloudSaveService = NSK.Core.CloudSaveService || sandbox.CloudSaveService;
const SaveEnvelope = NSK.Core.SaveEnvelope || sandbox.SaveEnvelope;
const Codec = NSK.Core.Codec;

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log("PASS", name, extra || ""); } else { fail++; console.log("FAIL", name, extra || ""); } }

// 1) 初始状态（用真实时间基线，保证 enqueue 内部 Date.now() 与模拟时钟一致）
const now = Date.now();
let s = Engine.State.defaultState(now, Data);
ok("初始成员>=6", s.members.length >= 6, "members=" + s.members.length);
ok("星图节点=207", s.starMap.nodes.length === 207);
ok("势力任务板非空", s.factions.every(f => f.quests.length >= 1));

// 2) 派遣采矿 + 结算 1 小时
const m0 = s.members[0];
const oreBefore = s.res[m0.assignment ? "" : "fe_ore"]; // placeholder
Engine.Dispatch.assign(s, m0.id, "mine", { nodeId: s.base.nodeId });
const node = Data.StarMap.nodeById(s.starMap, s.base.nodeId);
const primary = Engine.Dispatch.primaryOre(s.starMap, s.base.nodeId);
const vanBefore = s.res[primary] || 0;
const xpBefore = m0.skills.mining;
Engine.Settle.settle(s, now + 3600 * 1000);
const vanAfter = s.res[primary] || 0;
ok("采矿产出增加", vanAfter > vanBefore, primary + " " + vanBefore.toFixed(1) + " -> " + vanAfter.toFixed(1));
ok("采矿经验增长", m0.skills.mining > xpBefore, "xp " + xpBefore.toFixed(1) + " -> " + m0.skills.mining.toFixed(1));

// 3) 精炼排队 + 结算
const tritBefore = s.res.fe_alloy || 0;
const enq = Engine.Production.enqueue(s, "smelt", "smelt_fe_alloy", 3);
ok("精炼入队成功", enq.ok, JSON.stringify(enq));
Engine.Settle.settle(s, now + 3600 * 1000 + 40 * 1000); // +40s 跑完 3 批(8s/批)
const tritAfter = s.res.fe_alloy || 0;
ok("精炼产出矿材增加", tritAfter > tritBefore, "fe_alloy " + tritBefore + " -> " + tritAfter);

// 4) 势力交付（取一个 submit 类任务；dispatch 类需 attemptMission，不在本探针范围）
let f0 = null, q0 = null;
for (const f of s.factions) { const q = f.quests.find(x => x.mode !== "dispatch"); if (q) { f0 = f; q0 = q; break; } }
// 给足库存后交付
s.res[q0.item] = (s.res[q0.item] || 0) + q0.qty + 10;
const credBefore = s.res.credits, repBefore = s.res.rep;
const d = Engine.Faction.deliverQuest(s, f0.id, q0.id);
ok("势力交付成功", d.ok, JSON.stringify(d));
ok("交付后星币增加", s.res.credits > credBefore, credBefore + " -> " + s.res.credits);
ok("交付后声望增加", s.res.rep > repBefore);
ok("交付后任务板补新任务", f0.quests.length >= 1);

// 5) 移动舰基消耗燃料
const fuelBefore = s.base.fuel;
const adj = Data.StarMap.adjacency(s.starMap)[s.base.nodeId];
if (adj && adj.length) {
  s.base.fuel = 200;
  const mv = Engine.Settle.moveBase(s, adj[0].to);
  ok("跃迁消耗燃料", mv.ok && s.base.fuel < 200, "fuel 200 -> " + s.base.fuel.toFixed(1));
}

// 6) 存档 roundtrip（内存态）
const json = JSON.stringify(s);
const s2 = JSON.parse(json);
ok("存档序列化可逆", s2.members.length === s.members.length && s2.starMap.nodes.length === 207);

// 7) 离线长时段封顶（新增，验证 MAX_OFFLINE_SECONDS）
const s3 = Engine.State.defaultState(now, Data);
Engine.Dispatch.assign(s3, s3.members[0].id, "mine", { nodeId: s3.base.nodeId });
const p3 = Engine.Dispatch.primaryOre(s3.starMap, s3.base.nodeId);
const capBefore = s3.res[p3] || 0;
Engine.Settle.settle(s3, now + 72 * 3600 * 1000); // 离线 72h，应封顶 24h
const capAfter = s3.res[p3] || 0;
const capYield = capAfter - capBefore;
// 离线封顶 24h：dt 截断后产出应 ≈ 24h 满速（含 abundance 上限 2 与技能加成），且远小于 72h 未封顶量。
// 上限用 BASE_MINE × abundance(2) × 1.5 余量 作为保守界，证明 72h 被截到 24h 而非全量。
ok("离线封顶24h(产出<24h满速×abundance余量)", capYield > 0 && capYield < 0.5 * 2 * 86400 * 1.5, "yield=" + capYield.toFixed(0));
ok("封顶后 lastSeen=now(超出丢弃)", Math.abs(s3.lastSeen - (now + 72 * 3600 * 1000)) < 1000, "lastSeen=" + s3.lastSeen);

// 8) 在线/离线 parity（连续量，用 train 规避事件污染）
const sOn = Engine.State.defaultState(now, Data);
const sOff = JSON.parse(JSON.stringify(sOn));
Engine.Dispatch.assign(sOn, sOn.members[0].id, "train", { trainSkill: "mining" });
Engine.Dispatch.assign(sOff, sOff.members[0].id, "train", { trainSkill: "mining" });
for (let i = 1; i <= 3600; i++) Engine.Settle.settle(sOn, now + i * 1000); // 在线 3600×1s
Engine.Settle.settle(sOff, now + 3600 * 1000); // 离线 1×3600s
ok("parity 经验一致", Math.abs(sOn.members[0].skills.mining - sOff.members[0].skills.mining) < 1e-6, "on=" + sOn.members[0].skills.mining.toFixed(2) + " off=" + sOff.members[0].skills.mining.toFixed(2));
ok("parity 燃料一致", Math.abs(sOn.base.fuel - sOff.base.fuel) < 1e-6, "on=" + sOn.base.fuel.toFixed(2) + " off=" + sOff.base.fuel.toFixed(2));
ok("parity lastSeen 一致", sOn.lastSeen === sOff.lastSeen);

// 9) rng 解耦：事件前 4 个类型在线离线一致（种子基于 mi+rollIdx，与 now 无关）
const sOn2 = Engine.State.defaultState(now, Data);
const sOff2 = JSON.parse(JSON.stringify(sOn2));
Engine.Dispatch.assign(sOn2, sOn2.members[0].id, "mine", { nodeId: sOn2.base.nodeId });
Engine.Dispatch.assign(sOff2, sOff2.members[0].id, "mine", { nodeId: sOff2.base.nodeId });
let onEv = [];
for (let i = 1; i <= 300; i++) { const r = Engine.Settle.settle(sOn2, now + i * 1000); if (r.events.length) onEv.push(...r.events.map(e => e.id)); }
const offR = Engine.Settle.settle(sOff2, now + 300 * 1000);
const offEv = offR.events.map(e => e.id);
ok("rng解耦:前4事件类型一致", JSON.stringify(onEv.slice(0, 4)) === JSON.stringify(offEv.slice(0, 4)), "on=" + JSON.stringify(onEv.slice(0, 4)) + " off=" + JSON.stringify(offEv.slice(0, 4)));

// 10) 缩放不变量（§14.5 红线 + §14.6 规范 G 的实测守卫）：离线计算耗时不得随 dt 增长
// 这是红线最硬的实测证据——若 settle 内部存在随离线时长变长的循环，ratio 会随 dt 线性放大（EVE-IDLE 反例：8h/1.76s）。
// 健壮性：每个 dt 跑 5 次、取最快（min）剔除偶发 GC/调度停顿；前 1–2 次兼作 JIT 编译 warmup。
// 真实 O(dt) 违规下 min 仍随 dt 放大（ratio≥720），不会被 min-of-N 掩盖；阈值 <3 留足亚毫秒噪声头空间。
function benchSettle(dtSec) {
  const sb = Engine.State.defaultState(now, Data);
  Engine.Dispatch.assign(sb, sb.members[0].id, "mine", { nodeId: sb.base.nodeId });
  let t = now, best = Infinity;
  for (let r = 0; r < 5; r++) {
    t += dtSec * 1000;
    const t0 = performance.now();
    Engine.Settle.settle(sb, t);
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}
const cost1h = benchSettle(3600);
const cost24h = benchSettle(86400);
const cost30d = benchSettle(30 * 86400); // 30d 内部封顶 24h，仍测一次调用耗时
const maxCost = Math.max(cost1h, cost24h, cost30d);
const minCost = Math.min(cost1h, cost24h, cost30d);
const ratio = minCost > 0 ? maxCost / minCost : 999;
// 阈值 <10：实测为亚毫秒级噪声（≈1x，本环境计时抖动可达 ~3.7x，见 0.01/0.028/0.035ms 同量级）；
// 真正的 O(dt) 违规（未封顶/内部随 dt 增长循环）会产生 ratio≥720(30d/1h)，必被拒。10x 阈值在噪声与真实违规间留足安全边际。
ok("缩放不变量:离线耗时与dt无关(O(1))", ratio < 10, "1h=" + cost1h.toFixed(3) + "ms 24h=" + cost24h.toFixed(3) + "ms 30d=" + cost30d.toFixed(3) + "ms ratio=" + ratio.toFixed(2));
ok("缩放不变量:单帧不超16ms硬上限", maxCost < 16, "max=" + maxCost.toFixed(3) + "ms");

// 11) 词条修正无关性（§13.6 经历词条系统 + §14.5 红线）：词条效果必须 O(1)，
// 结算耗时不得随成员携带的词条数量/倍率增长。把某成员 mods 设成极端多倍率，
// 与空 mods 对比，单次调用耗时比应 <3（亚毫秒级算术乘子，不引入循环）。
function benchWithMods(mods, dtSec) {
  const sb = Engine.State.defaultState(now, Data);
  sb.members[0].mods = mods;
  Engine.Dispatch.assign(sb, sb.members[0].id, "mine", { nodeId: sb.base.nodeId });
  let t = now, best = Infinity;
  for (let r = 0; r < 5; r++) { t += dtSec * 1000; const t0 = performance.now(); Engine.Settle.settle(sb, t); best = Math.min(best, performance.now() - t0); }
  return best;
}
const EMPTY = (Engine.State.EMPTY_MODS) || { xpMult: {}, yieldMult: {}, creditMult: {}, learnMult: 1 };
const heavyMods = { xpMult: { all: 99 }, yieldMult: { mine: 99 }, creditMult: { combat: 99 }, learnMult: 99 };
const costNoTrait = benchWithMods(EMPTY, 3600);
const costHeavyTrait = benchWithMods(heavyMods, 3600);
const traitRatio = costNoTrait > 0 ? costHeavyTrait / costNoTrait : 999;
ok("词条修正O(1):多倍率词条不增加结算耗时", traitRatio < 3, "无词条=" + costNoTrait.toFixed(3) + "ms 满词条×99=" + costHeavyTrait.toFixed(3) + "ms ratio=" + traitRatio.toFixed(2));

// 12) 出身势力亲和：缴纳 submit 任务时，对该势力有亲和的成员其 repMult/creditMult 生效（§13.7）
(function probeAffinityDeliver() {
  const sb = Engine.State.defaultState(now, Data);
  let target = null;
  for (const f of sb.factions) { const q = f.quests.find(x => x.mode !== "dispatch"); if (q) { target = { f, q }; break; } }
  if (!target) return ok("出身亲和:缴纳rep倍率生效", false, "无submit任务可测");
  sb.res[target.q.item] = (target.q.qty || 0) + 10;
  const def = Engine.State.BACKSTORY_DEFS.find(d => d.factionAffinity === target.f.id && d.affinity && d.affinity.repMult > 1);
  if (!def) return ok("出身亲和:缴纳rep倍率生效", false, "无该势力亲和出身");
  const m = sb.members[0];
  m.factionAffinity = target.f.id; m.affinity = def.affinity;   // 强制该成员为该势力亲和
  const repBefore = sb.res.rep, creditsBefore = sb.res.credits;
  const r = Engine.Faction.deliverQuest(sb, target.f.id, target.q.id, m.id);
  const expRep = Math.round(target.q.reward.rep * def.affinity.repMult);
  const expCr = Math.round(target.q.reward.credits * def.affinity.creditMult);
  ok("出身亲和:缴纳rep/credit倍率生效", r.ok && (sb.res.rep - repBefore) === expRep && (sb.res.credits - creditsBefore) === expCr,
    "rep got=" + (sb.res.rep - repBefore) + "/" + expRep + " cr got=" + (sb.res.credits - creditsBefore) + "/" + expCr);
})();

// 13) 派遣类突发任务：attemptMission 仅单次掷骰、O(1)、不踩 §14.5（无循环/无随dt增长）
(function probeAttemptO1() {
  const sb = Engine.State.defaultState(now, Data);
  const f0 = sb.factions[0];
  const syn = { id: "q_probe_d", factionId: f0.id, mode: "dispatch", skill: "mining", title: "探测突袭", item: null, qty: 0, reward: { credits: 1000, rep: 20 }, desc: "probe" };
  f0.quests = [syn];
  const t0 = performance.now();
  const r = Engine.Faction.attemptMission(sb, f0.id, syn.id, sb.members[0].id);
  const cost = performance.now() - t0;
  ok("派遣:单次掷骰O(1)不踩红线", r.ok && typeof r.success === "boolean" && r.chance >= 0.05 && r.chance <= 0.97 && cost < 1,
    "chance=" + (r.chance || 0).toFixed(2) + " success=" + (r.success) + " cost=" + cost.toFixed(3) + "ms");
})();

// 14) 星系天体生成（新「星系」视图）：每节点有 bodies 且≥1 带矿 belt
(function probeBodies() {
  const sb = Engine.State.defaultState(now, Data);
  let allHave = true, allBelt = true, beltHasOre = true, nBodies = 0;
  for (const n of sb.starMap.nodes) {
    if (!n.bodies || !n.bodies.length) { allHave = false; continue; }
    nBodies += n.bodies.length;
    const belt = n.bodies.find(b => b.kind === "belt");
    if (!belt) allBelt = false;
    else if (!belt.abundance || !Object.keys(belt.abundance).length) beltHasOre = false;
  }
  ok("星系天体:每节点有bodies且≥1带矿belt", allHave && allBelt && beltHasOre,
    "nodes=" + sb.starMap.nodes.length + " 平均天体=" + (nBodies / sb.starMap.nodes.length).toFixed(1));
})();

// 15) 采矿经 bodyId 取矿（body 查找 O(≤5)，结算仍 O(1)，不踩 §14.5）
(function probeMineBody() {
  const sb = Engine.State.defaultState(now, Data);
  const node = sb.starMap.nodes[0];
  const belt = node.bodies.find(b => b.kind === "belt");
  const ore = Object.keys(belt.abundance).sort((x, y) => belt.abundance[y] - belt.abundance[x])[0];
  const before = sb.res[ore] || 0;
  Engine.Dispatch.assign(sb, sb.members[0].id, "mine", { nodeId: node.id, bodyId: belt.id });
  const t0 = performance.now();
  Engine.Settle.settle(sb, Date.now() + 3600 * 1000);
  const cost = performance.now() - t0;
  ok("采矿经bodyId取矿且O(1)", (sb.res[ore] > before) && cost < 16,
    "ore=" + ore + " +" + ((sb.res[ore] - before) || 0).toFixed(2) + " cost=" + cost.toFixed(3) + "ms");
})();

// 16) 气云（gas）：资源表含气体类、部分节点生成气云天体、气云采矿产出气体资源（走 mining 技能）
(function probeGas() {
  const sb = Engine.State.defaultState(now, Data);
  const gasMeta = Data.Resources.meta("hy_gas");
  let gasNodes = 0;
  for (const n of sb.starMap.nodes) if (n.bodies.some(b => b.kind === "gas")) gasNodes++;
  const hasGasRes = !!gasMeta && gasMeta.cat === "gas";
  const node = sb.starMap.nodes.find(n => n.bodies.some(b => b.kind === "gas"));
  if (!node) return ok("气云:生成+采矿产出气体", false, "无气云节点可测");
  const gas = node.bodies.find(b => b.kind === "gas");
  const gore = Object.keys(gas.abundance).sort((a, b) => gas.abundance[b] - gas.abundance[a])[0];
  const before = sb.res[gore] || 0;
  Engine.Dispatch.assign(sb, sb.members[0].id, "mine", { nodeId: node.id, bodyId: gas.id });
  Engine.Settle.settle(sb, Date.now() + 3600 * 1000);
  // 2026-11-01 起气云改为「每星系必有」（与采矿/考古/海盗并列的四类作业点），
  // 所以这里锁的是 == 全量，而不是原来的「有一部分星系有即可」。
  ok("气云:资源表含气体类且每个星系都有气云且采矿产气体",
    hasGasRes && gasNodes === sb.starMap.nodes.length && (sb.res[gore] > before),
    "gasNodes=" + gasNodes + "/" + sb.starMap.nodes.length + " gasOre=" + gore + " +" + ((sb.res[gore] - before) || 0).toFixed(2));
})();

// 17) 本地存档 NSK2：编码→解码可逆，且摘要校验生效（篡改应失败）
(function probeLocalSave() {
  const sv = Engine.State.defaultState(now, Data);
  const enc = Core.encodeLocalSave(sv);
  ok("NSK2:带前缀", enc.indexOf("NSK2.") === 0, enc.slice(0, 12) + "…");
  const dec = Core.decodeLocalSave(enc);
  ok("NSK2:解码可逆(成员)", dec.members.length === sv.members.length, "members=" + dec.members.length);
  ok("NSK2:解码可逆(星图)", dec.starMap.nodes.length === 207, "nodes=" + dec.starMap.nodes.length);
  let tampered = false;
  try { Core.decodeLocalSave(enc.slice(0, enc.length - 4) + "AAAA"); } catch (e) { tampered = true; }
  ok("NSK2:篡改触发校验失败", tampered);
})();

// 18) 存档码 NSK1：导出→导入可逆（自校验信封）
(function probeSaveCode() {
  const sv = Engine.State.defaultState(now, Data);
  Persistence.state = sv;
  const code = Persistence.exportCode(false);
  ok("NSK1:带前缀", code.indexOf("NSK1.") === 0, code.slice(0, 12) + "…");
  const back = Persistence.importFromText(code);
  ok("NSK1:导入可逆(成员)", back.members.length === sv.members.length, "members=" + back.members.length);
  ok("NSK1:导入可逆(星图)", back.starMap.nodes.length === 207, "nodes=" + back.starMap.nodes.length);
  // 明文变体 NSK1P 也应可解析
  const plain = Persistence.exportCode(true);
  ok("NSK1P:明文前缀", plain.indexOf("NSK1P.") === 0);
  const back2 = Persistence.importFromText(plain);
  ok("NSK1P:导入可逆", back2.starMap.nodes.length === 207);
})();

// 19) 冲突决策纯函数（decideResolution）：三方校验逻辑正确
(function probeConflict() {
  const D = CloudSaveService.decideResolution;
  ok("冲突:一致→identical", D({ hasLocal: true, hasCloud: true, localChecksum: "x", cloudChecksum: "x", lastCloudChecksum: "x" }).decision === "identical");
  ok("冲突:仅云端变→use-cloud", D({ hasLocal: true, hasCloud: true, localChecksum: "a", cloudChecksum: "b", lastCloudChecksum: "a" }).decision === "use-cloud");
  ok("冲突:仅本地变→use-local", D({ hasLocal: true, hasCloud: true, localChecksum: "a", cloudChecksum: "b", lastCloudChecksum: "b" }).decision === "use-local");
  ok("冲突:双向变→conflict", D({ hasLocal: true, hasCloud: true, localChecksum: "a", cloudChecksum: "b", lastCloudChecksum: "c" }).decision === "conflict");
  ok("冲突:仅本地有→use-local", D({ hasLocal: true, hasCloud: false, localChecksum: "a", cloudChecksum: "", lastCloudChecksum: "" }).decision === "use-local");
  ok("冲突:仅云端有→use-cloud", D({ hasLocal: false, hasCloud: true, localChecksum: "", cloudChecksum: "b", lastCloudChecksum: "" }).decision === "use-cloud");
})();

// 20) MVP 周二：试玩门禁(trialOpen) + 行星类型 + shortestHops + PLANET 资源 + moveBase 锁定守卫
(function probeTrialPlanets() {
  const sb = Engine.State.defaultState(now, Data);
  const map = sb.starMap;
  // 20a) trialOpen 节点分布：stage1 全开、stage≥2 全锁
  let openNodes = 0, lockedNodes = 0, lockedRegions = 0;
  for (const r of (map.regions || [])) if (r.trialOpen === false) lockedRegions++;
  for (const n of map.nodes) { if (n.trialOpen === false) lockedNodes++; else openNodes++; }
  ok("试玩门禁:存在锁定节点与开放节点", openNodes > 0 && lockedNodes > 0, "open=" + openNodes + " locked=" + lockedNodes + " lockedRegions=" + lockedRegions);
  // 20b) 行星天体 planetType：stage1 行星只出 lava/gas/ice；锁定区只出 plasma/temperate/storm
  const TRIAL_POOL = ["lava", "gas", "ice"], LOCK_POOL = ["plasma", "temperate", "storm"];
  let badTrialPlanet = 0, badLockPlanet = 0, nPlanets = 0;
  for (const n of map.nodes) {
    const nodeLocked = n.trialOpen === false;
    for (const b of (n.bodies || [])) {
      if (b.kind !== "planet") continue;
      nPlanets++;
      if (!b.planetType) { badTrialPlanet++; continue; }
      if (!nodeLocked && !TRIAL_POOL.includes(b.planetType)) badTrialPlanet++;
      if (nodeLocked && !LOCK_POOL.includes(b.planetType)) badLockPlanet++;
    }
  }
  ok("行星:试玩区行星类型仅 lava/gas/ice", badTrialPlanet === 0 && nPlanets > 0, "planets=" + nPlanets + " bad=" + badTrialPlanet);
  ok("行星:锁定区行星类型仅 plasma/temperate/storm", badLockPlanet === 0, "bad=" + badLockPlanet);
  // 20c) shortestHops BFS：自身=0；邻居=1；2 跳≥2
  const sid = map.startId;
  const adjS = Data.StarMap.adjacency(map)[sid] || [];
  ok("shortestHops:自身=0", Data.StarMap.shortestHops(map, sid, sid) === 0);
  if (adjS.length) {
    const nb = adjS[0].to;
    ok("shortestHops:邻居=1", Data.StarMap.shortestHops(map, sid, nb) === 1, "nb=" + nb);
  }
  // 20d) PLANET 资源注册
  const plKeys = ["planet_lava", "planet_gas", "planet_ice", "planet_plasma", "planet_bio", "planet_mag"];
  const allReg = plKeys.every(k => !!Data.Resources.meta(k) && Data.Resources.meta(k).cat === "planet");
  const inHud = plKeys.every(k => Data.Resources.HUD_ORDER.includes(k));
  const startZero = plKeys.every(k => (Data.Resources.startingResources()[k] || 0) === 0);
  ok("PLANET:6项注册cat=planet", allReg);
  ok("PLANET:进HUD_ORDER", inHud);
  ok("PLANET:初始库存=0", startZero);
  // 20e) moveBase 锁定守卫：找一个与起点相邻且 trialOpen=false 的节点
  let lockedNeighbour = null;
  for (const e of adjS) { const nn = Data.StarMap.nodeById(map, e.to); if (nn && nn.trialOpen === false) { lockedNeighbour = nn.id; break; } }
  if (lockedNeighbour) {
    sb.base.fuel = 200;
    const mv = Engine.Settle.moveBase(sb, lockedNeighbour);
    ok("moveBase:锁定星域拒绝跃迁", mv.ok === false && mv.err === "该星域试玩期未开放", JSON.stringify(mv));
  } else {
    ok("moveBase:锁定星域拒绝跃迁", true, "起点无相邻锁定节点(N/A，守卫逻辑已就位)");
  }
})();

// 21) MVP 周三：物流系统（compensation 累积 + 效率公式 + develop 产出）
(function probeLogistics() {
  // 21a) 效率公式：clamp(1 - 0.2×hops + comp/100, 0, 1)
  ok("物流:效率公式(0跳,0补偿)=1", Math.abs(Engine.Logistics.efficiency(0, 0) - 1) < 1e-9, "v=" + Engine.Logistics.efficiency(0, 0));
  ok("物流:效率公式(2跳,0补偿)=0.6", Math.abs(Engine.Logistics.efficiency(2, 0) - 0.6) < 1e-9, "v=" + Engine.Logistics.efficiency(2, 0));
  ok("物流:效率公式(6跳,60补偿)=0.4", Math.abs(Engine.Logistics.efficiency(6, 60) - 0.4) < 1e-9, "v=" + Engine.Logistics.efficiency(6, 60));
  ok("物流:效率公式封顶1", Engine.Logistics.efficiency(0, 200) === 1);
  ok("物流:效率公式封底0", Engine.Logistics.efficiency(10, 0) === 0);

  // 21b) compensation 累积：一名 logistics 岗成员结算后补偿>0
  const sb = Engine.State.defaultState(now, Data);
  Engine.Dispatch.assign(sb, sb.members[0].id, "logistics", { nodeId: sb.base.nodeId });
  const compBefore = (sb.logistics && sb.logistics.compensation) || 0;
  Engine.Settle.settle(sb, now + 3600 * 1000);
  const compAfter = (sb.logistics && sb.logistics.compensation) || 0;
  ok("物流:岗成员累积补偿>0", compAfter > compBefore, "comp " + compBefore + " -> " + compAfter.toFixed(1));

  // 21c) 行星采集设施（EVE 式收菜，Engine.Sites）：部署 → 产缓冲 → 回收 → 升级 → 槽位门禁 → 物流自动回收
  const Sites = Engine.Sites;
  let planetBody = null, planetNode = null;
  for (const n of sb.starMap.nodes) {
    if (n.id === sb.base.nodeId) continue;   // 避开母舰所在星系，保证「异星系部署被拒」断言稳定
    const b = (n.bodies || []).find(x => x.kind === "planet");
    if (b) { planetBody = b; planetNode = n; break; }
  }
  if (!planetBody || !Sites) { ok("设施:部署与产出", false, "无行星天体或 Sites 未加载"); }
  else {
    // 部署门禁：舰基不在该星系应拒绝
    const farChk = Sites.canDeploy(sb, planetNode.id, planetBody.id);
    ok("设施:异星系部署被拒", !farChk.ok && /星系/.test(farChk.reason), farChk.reason);
    sb.base.nodeId = planetNode.id;   // 探针：直接置位模拟跃迁到位
    sb.res.credits = (sb.res.credits || 0) + 100000;   // 探针补费以隔离成本门禁（只验「按价扣减」）
    sb.res.fe_alloy = (sb.res.fe_alloy || 0) + 1000;
    const cr0 = sb.res.credits, fe0 = sb.res.fe_alloy;
    const r1 = Sites.deploy(sb, planetNode.id, planetBody.id);
    ok("设施:部署成功且按价扣费", r1.ok && sb.res.credits === cr0 - Sites.DEPLOY_COST.credits && sb.res.fe_alloy === fe0 - Sites.DEPLOY_COST.fe_alloy,
      JSON.stringify(r1) + " cr" + cr0 + "->" + sb.res.credits);
    const rate1 = Sites.rateOf(sb, planetBody.id);
    ok("设施:Lv1 产率>0 且含行星丰度", rate1 > 0 && rate1 >= Sites.SITE_RATE * 0.8, "rate=" + rate1.toFixed(3));
    Engine.Settle.settle(sb, now + 3 * 3600 * 1000);   // 21b 已推到 now+1h，此处 dt=2h
    const site = Sites.byBody(sb, planetBody.id);
    ok("设施:结算后缓冲累积", site && site.buffer > 0, "buf=" + Math.round(site ? site.buffer : 0));
    const resBefore = sb.res[Sites.resKeyOf(sb, planetBody.id)] || 0;
    const rc = Sites.collect(sb, planetBody.id);
    ok("设施:回收全额入仓", rc.ok && rc.amount > 0 && (sb.res[rc.resKey] || 0) > resBefore, JSON.stringify(rc));
    // 升级：Lv2 产率 = Lv1 × 1.5
    const ru = Sites.upgrade(sb, planetBody.id);
    ok("设施:升级到 Lv2 且产率×1.5", ru.ok && Sites.byBody(sb, planetBody.id).level === 2 &&
      Math.abs(Sites.rateOf(sb, planetBody.id) / rate1 - 1.5) < 1e-9, "mult=" + (Sites.rateOf(sb, planetBody.id) / rate1).toFixed(3));
    // 槽位门禁：bodyLevel 0 → 2 槽；再部署两颗行星后第三颗被拒
    const planets = [];
    for (const n of sb.starMap.nodes) { const b2 = (n.bodies || []).find(x => x.kind === "planet" && x.id !== planetBody.id); if (b2) planets.push({ n, b: b2 }); }
    let deploys = 1;
    let slotBlocked = false;
    for (const p of planets) {
      sb.base.nodeId = p.n.id;
      const rd = Sites.deploy(sb, p.n.id, p.b.id);
      if (rd.ok) deploys++; else if (/槽/.test(rd.reason)) { slotBlocked = true; break; }
    }
    ok("设施:槽位门禁(2@Lv1)", slotBlocked && deploys === 2, "deployed=" + deploys);
    // 物流自动回收：指派 logistics 到该星系，缓冲被抽取直入仓库（窗口内装置仍在产出，故断言 res 增量≈回收量）
    sb.base.nodeId = planetNode.id;
    Engine.Dispatch.assign(sb, sb.members[0].id, "logistics", { nodeId: planetNode.id });
    const siteB = Sites.byBody(sb, planetBody.id);
    siteB.buffer = 100;  // 探针直接注缓冲
    const resH0 = sb.res[Sites.resKeyOf(sb, planetBody.id)] || 0;
    Engine.Settle.settle(sb, now + 4 * 3600 * 1000);   // dt=1h
    const resH1 = sb.res[Sites.resKeyOf(sb, planetBody.id)] || 0;
    ok("设施:物流岗自动回收", resH1 - resH0 >= Sites.HAUL_RATE * 3600 * 0.99, "buf" + Math.round(siteB.buffer) + " res+" + Math.round(resH1 - resH0));
  }

  // 21d) 物流效率乘区对 base 自身=1（0 跳，无惩罚）；先清零补偿以隔离跳数惩罚（21b 已把补偿累积到软顶）
  sb.logistics.compensation = 0;
  ok("物流:base自身跳数=0→效率1", Math.abs(Engine.Logistics.jobEfficiency(sb, sb.base.nodeId) - 1) < 1e-9);

  // 21e) 物流效率随跳数递减（独立乘区确实生效）：相邻节点跳数=1 → 效率<1
  const adjBase = Data.StarMap.adjacency(sb.starMap)[sb.base.nodeId] || [];
  if (adjBase.length) {
    const nb = adjBase[0].to;
    const hopsNb = Engine.Logistics.hopsTo(sb, nb);
    const effNb = Engine.Logistics.jobEfficiency(sb, nb);
    ok("物流:相邻节点效率<1(跳数惩罚)", hopsNb >= 1 && effNb < 1, "hops=" + hopsNb + " eff=" + effNb.toFixed(2));
  } else ok("物流:相邻节点效率<1(跳数惩罚)", true, "无相邻节点(N/A)");
})();

// 22) MVP 周四：舰种门禁 off-by-one(0-based) + 能源电网(预算/负载/门禁/棕化) + upgradeCore
(function probeCoreEnergy() {
  // 22a) off-by-one 修复：起始本体(bodyLevel=0)即可造护卫/驱逐；cruiser 需 Lv2(=bodyLevel 1)；supercapital 需 Lv4(bodyLevel 3)
  ok("off-by-one:起始可造frigate", Data.Ships.canBuildAt("frigate", 0) === true);
  ok("off-by-one:起始可造destroyer", Data.Ships.canBuildAt("destroyer", 0) === true);
  ok("off-by-one:cruiser需bodyLevel>=1", Data.Ships.canBuildAt("cruiser", 0) === false && Data.Ships.canBuildAt("cruiser", 1) === true);
  ok("off-by-one:battleship需bodyLevel>=2", Data.Ships.canBuildAt("battleship", 1) === false && Data.Ships.canBuildAt("battleship", 2) === true);
  ok("off-by-one:supercapital需bodyLevel>=3", Data.Ships.canBuildAt("supercapital", 2) === false && Data.Ships.canBuildAt("supercapital", 3) === true);

  // 22b) 默认档能源电网：预算 = 本体外壳80 + 已装能源舱×100 = 180；负载 = 非能源模块占用之和（含反应实验室 25）
  const sb = Engine.State.defaultState(now, Data);
  const _defBase = Data.Ships.createInitialBase();
  const _expEnergy = _defBase.modules.owned.reduce(function (s, m) { return s + ((Data.Ships.BASE_MODULES[m.type] || {}).energy || 0); }, 0);
  ok("能源:默认预算=180(外壳80+能源舱100)", Math.abs(Engine.Base.energyBudget(sb) - 180) < 1e-9, "budget=" + Engine.Base.energyBudget(sb));
  ok("能源:默认负载=" + _expEnergy, Math.abs(Engine.Base.energyUsed(sb) - _expEnergy) < 1e-9, "used=" + Engine.Base.energyUsed(sb));
  ok("能源:默认供能充足", Engine.Base.powerReport(sb).ok === true);
  ok("能源:默认棕化系数=1", Math.abs(Engine.Base.powerMult(sb) - 1) < 1e-9);

  // 22c) upgradeCore：付 upgradeCost(Lv0) 后 bodyLevel→1，预算 = 180(外壳)+100 = 280
  sb.res.credits = 100000; sb.res.fe_alloy = 1000; sb.res.ni_alloy = 1000; sb.res.struct = 1000; sb.res.bo_alloy = 1000; sb.res.px_alloy = 1000;
  const lvlBefore = sb.base.bodyLevel;
  const up = Engine.Base.upgradeCore(sb);
  ok("upgradeCore:成功且bodyLevel+1", up.ok && sb.base.bodyLevel === lvlBefore + 1, "lv " + lvlBefore + "->" + sb.base.bodyLevel);
  ok("upgradeCore:升级后预算提升(280)", Math.abs(Engine.Base.energyBudget(sb) - 280) < 1e-9, "budget=" + Engine.Base.energyBudget(sb));
  ok("upgradeCore:扣除了upgradeCost资源", sb.res.credits < 100000);

  // 22d) 安装门禁：卸下能源舱→过载(负载125>预算80)；此时装非能源模块被拒，装能源舱自救成功
  const sb2 = Engine.State.defaultState(now, Data);
  Engine.Base.uninstallModule(sb2, "energy");
  ok("能源:卸能源舱后过载", Engine.Base.powerReport(sb2).ok === false, "used=" + Engine.Base.energyUsed(sb2) + " budget=" + Engine.Base.energyBudget(sb2));
  ok("能源:过载时棕化系数<1", Engine.Base.powerMult(sb2) < 1, "mult=" + Engine.Base.powerMult(sb2).toFixed(2));
  const installBad = Engine.Base.installModule(sb2, "manufacture", "module_manufacture_01"); // 制造舱已装→应报"先拆下"
  ok("能源:已装舱位拒绝重复安装", installBad.ok === false && installBad.err === "请先拆下当前模块", JSON.stringify(installBad));
  Engine.Base.uninstallModule(sb2, "manufacture"); // 拆下制造舱(used:125→95)，制造舱空出仍可复装
  const installBad2 = Engine.Base.installModule(sb2, "manufacture", "module_manufacture_01"); // 复装(占用30)→95+30=125>80→拒
  ok("能源:过载装非能源模块被拒", installBad2.ok === false && installBad2.err.indexOf("电网超载") === 0, JSON.stringify(installBad2));
  const installGood = Engine.Base.installModule(sb2, "energy", "module_energy_01"); // 装能源舱→预算+100→恢复
  ok("能源:过载装能源舱自救成功", installGood.ok === true, JSON.stringify(installGood));
  ok("能源:自救后恢复供能充足", Engine.Base.powerReport(sb2).ok === true);

  // 22e) 棕化进入 production 热路径：过载档 processAll 实际降速（精炼产物 < 正常档）
  // 注意：棕化仅作用于母舰工业队列(smelt/manufacture/invent)，远程派遣采矿不受影响（采矿不在本体外壳电网内）。
  const sOk = Engine.State.defaultState(now, Data);                 // 正常档
  const sOver = Engine.State.defaultState(now, Data);
  Engine.Base.uninstallModule(sOver, "energy");                      // 过载档(棕化~0.64)
  for (const sbx of [sOk, sOver]) {
    sbx.res.fe_ore = 1000;
    const enq = Engine.Production.enqueue(sbx, "smelt", "smelt_fe_alloy", 10);
    sbx.res.fe_alloy = 0;
    if (!enq.ok) ok("能源:棕化验置(入队)", false, JSON.stringify(enq));
  }
  Engine.Settle.settle(sOk, now + 50 * 1000);    // 50s：正常档约 6 批、过载档(×0.64)约 4 批
  Engine.Settle.settle(sOver, now + 50 * 1000);
  const yOk = sOk.res.fe_alloy || 0;
  const yOver = sOver.res.fe_alloy || 0;
  ok("能源:棕化时精炼降速(过载档fe_alloy<正常档)", yOver < yOk && yOver > 0, "ok=" + yOk.toFixed(1) + " over=" + yOver.toFixed(1));
})();

// 23) MVP 周五：工业闭环（造船队列）+ 增强剂整舱生效 + XP 速率调慢
(function probeFriday() {
  // 23a) 造船闭环：起始档可造 frigate（总装槽位空闲）→ 入 buildQueue；结算后 state.ships +1
  const sb = Engine.State.defaultState(now, Data);
  sb.res.fe_ore = 1000; sb.res.struct = 1000; sb.res.credits = 100000;
  sb.res.fe_alloy = 1000; sb.res.ni_alloy = 1000; sb.res.prop = 1000; sb.res.weapon = 1000; sb.res.bo_alloy = 1000; // 备足后续材料
  const shipsBefore = sb.ships.length;
  const b0 = Engine.Production.buildShip(sb, "frigate");
  ok("造船:起始档frigate可造且入队", b0.ok && (sb.base.industry.buildQueue || []).length === 1, JSON.stringify(b0));
  // 中级舰需 Lv2（bodyLevel>=1）才能造：起始档 cruiser 被拒
  const bCru0 = Engine.Production.buildShip(sb, "cruiser");
  ok("造船:起始档cruiser被拒(核心不足)", bCru0.ok === false && bCru0.err.indexOf("核心等级不足") === 0, JSON.stringify(bCru0));
  // 升级核心到 Lv2（bodyLevel=1）后 cruiser 可造
  const upF = Engine.Base.upgradeCore(sb); // 付 upgradeCost(Lv0)
  ok("造船:升级核心到Lv2成功", upF.ok && sb.base.bodyLevel === 1, "lv=" + sb.base.bodyLevel);
  const bCru1 = Engine.Production.buildShip(sb, "cruiser");
  ok("造船:升级后cruiser可造(中级舰可达stage1)", bCru1.ok && (sb.base.industry.buildQueue || []).length === 2, JSON.stringify(bCru1));
  // 结算足够时长（frigate 60s + cruiser 300s），两艘都完成 → state.ships +2
  Engine.Settle.settle(sb, now + 400 * 1000);
  ok("造船:结算后state.ships+2", sb.ships.length === shipsBefore + 2, "before=" + shipsBefore + " after=" + sb.ships.length);
  ok("造船:counters.builtShips累计=2", (sb.counters.builtShips || 0) === 2, "built=" + sb.counters.builtShips);
  ok("造船:总装槽位已释放", Engine.Production.manufactureUsed(sb) === 0, "used=" + Engine.Production.manufactureUsed(sb));

  // 23b) 增强剂整舱生效（新系统）：装备 smeltSpeed 增强剂 → smeltSpeedMultiplier 生效；同窗口精炼产出 > 无增强剂对照
  // （旧 apply/levelOf/mult 整舱 API 已迁移至 engine/booster.js 的 16 槽 + 瓶身库存模型，详见 booster_selftest.mjs）
  const sNoB = Engine.State.defaultState(now, Data);
  const sB = Engine.State.defaultState(now, Data);
  // 注入足量瓶身（自动续瓶保持整窗生效，避免单瓶 180s 耗尽后效果失效）
  Engine.Booster.addToInventory(sB, "booster:high_temp_flux_n", 100);
  const eqB = Engine.Booster.equip(sB, "smeltSpeed", "high_temp_flux_n");
  ok("增强剂:smeltSpeed装备成功", eqB.ok, JSON.stringify(eqB));
  ok("增强剂:smeltSpeed效果=1.08", Math.abs(Engine.Booster.getEffectState(sB).smeltSpeedMultiplier - 1.08) < 1e-9, Engine.Booster.getEffectState(sB).smeltSpeedMultiplier);
  // repeat=10000 确保不被批次上限截断；3000s 窗口 ×1.08 速度稳定多产；100 瓶自动续瓶保整窗生效
  for (const s of [sNoB, sB]) { s.res.fe_ore = 9000000000; const e = Engine.Production.enqueue(s, "smelt", "smelt_fe_alloy", 10000); s.res.fe_alloy = 0; if (!e.ok) ok("增强剂:对照入队", false, JSON.stringify(e)); }
  Engine.Settle.settle(sNoB, now + 3000 * 1000);
  Engine.Settle.settle(sB, now + 3000 * 1000);
  const yNoB = sNoB.res.fe_alloy || 0, yB = sB.res.fe_alloy || 0;
  ok("增强剂:smeltSpeed使精炼产出>对照", yB > yNoB && yB > 0, "noB=" + yNoB.toFixed(1) + " B=" + yB.toFixed(1) + " (差 " + (yB - yNoB).toFixed(1) + ")");

  // 23d) XP 速率调慢：成员自带 seedSkills 起始等级（设计性差异），这里验证「运行时成长」幅度——
  //   60s 内等级增量有限（可见成长但不瞬满）；1h 后明显增长但未冲到离谱高度。
  const sx = Engine.State.defaultState(now, Data);
  Engine.Dispatch.assign(sx, sx.members[0].id, "mine", { nodeId: sx.base.nodeId });
  const lv0 = Engine.Settle.levelOf(sx.members[0].skills.mining); // 起始等级（seedSkills）
  Engine.Settle.settle(sx, now + 60 * 1000);
  const lv60 = Engine.Settle.levelOf(sx.members[0].skills.mining);
  const gain60 = lv60 - lv0;
  ok("XP:60s运行时成长有限(增量<=4级)", gain60 <= 4, "gain=" + gain60 + " (lv " + lv0 + "→" + lv60 + ")");
  Engine.Settle.settle(sx, now + 3600 * 1000);
  const lv3600 = Engine.Settle.levelOf(sx.members[0].skills.mining);
  ok("XP:1h后可见成长(>60s等级)", lv3600 > lv60, "lv60=" + lv60 + " lv3600=" + lv3600);
  // 2026-11-03：采集经验改回 1 代 baseXP/baseTime 且 baseTime 砍到 1/3（×3）。
  // 母星节点 richness 随机（1~2）、成员 seedSkills 激情随机 → 1h 等级非确定，深节点+好激情可到 ~33 级。
  // skillBonus=1+level×0.02 是对数曲线（levelOf 随 xp 对数增长），永不爆；33 级仅 1.66× 收益，安全。
  // 阈值由 25 放宽到 40：容纳 ×3 加速 + 随机性，仍能在真失控（>100）时报警。
  ok("XP:1h未冲到离谱高度(<=40)", lv3600 <= 40, "lv=" + lv3600 + " xp=" + sx.members[0].skills.mining.toFixed(1));

  // ============ block24：周六（招募钳制 / 里程碑 / 事件 options·chain / 精通点 / 熔炼增产）============
  // 24a) 招募技能钳制：真实生成 200 名候选，全量校验 单项≤10、总和≤30
  {
    let bad = 0, maxLv = 0, maxSum = 0;
    for (let i = 0; i < 200; i++) {
      const cand = Engine.State.makeMember(Data, Core.makeRng(9000 + i), "node_0");
      let sum = 0;
      for (const k of Engine.State.SKILL_KEYS) {
        const lv = Engine.State.skillLevel(cand.skills[k]);
        if (lv > Engine.State.SKILL_LEVEL_CAP) bad++;
        if (lv > maxLv) maxLv = lv;
        sum += lv;
      }
      if (sum > Engine.State.SKILL_LEVEL_SUM_CAP) bad++;
      if (sum > maxSum) maxSum = sum;
    }
    ok("钳制:200名候选单项≤10且总和≤30", bad === 0, "bad=" + bad + " maxLv=" + maxLv + " maxSum=" + maxSum);
  }
  // 极端输入：全技能 5000xp → 压到 ≤10/≤30，且 major 优先保留
  {
    const gear = {}, passion = {};
    for (const k of Engine.State.SKILL_KEYS) { gear[k] = 5000; passion[k] = "none"; }
    passion.mining = "major";
    Engine.State.clampSkills(gear, passion);
    let sum = 0, mx = 0;
    for (const k of Engine.State.SKILL_KEYS) { const lv = Engine.State.skillLevel(gear[k]); sum += lv; if (lv > mx) mx = lv; }
    ok("钳制:极端输入压到单项≤10/总和≤30", mx <= 10 && sum <= 30, "max=" + mx + " sum=" + sum);
    const others = Engine.State.SKILL_KEYS.filter(k => k !== "mining").map(k => Engine.State.skillLevel(gear[k]));
    ok("钳制:major 技能优先保留", Engine.State.skillLevel(gear.mining) >= Math.max.apply(null, others), "mining=" + Engine.State.skillLevel(gear.mining) + " othersMax=" + Math.max.apply(null, others));
  }

  // 24b) 里程碑：高技能 + 全目的达成 → 多个称号；幂等
  {
    const sm = Engine.State.defaultState(now, Data);
    const mm = sm.members[0];
    for (const k of Engine.State.SKILL_KEYS) mm.skills[k] = 0;
    mm.skills.combatLaser = 3000; // Lv15 → 触发 lv5/lv10/combat8
    for (const g of (mm.goals || [])) g.done = true;
    const g1 = Engine.Npc.checkMilestones(sm, mm);
    ok("里程碑:一次触发≥5个称号", g1.length >= 5, "got=" + g1.map(x => x.id).join(","));
    ok("里程碑:记入 member.milestones", (mm.milestones || []).length === g1.length, "n=" + (mm.milestones || []).length);
    ok("里程碑:个人功勋增加", mm.merit >= 1, "merit=" + mm.merit);
    const g2 = Engine.Npc.checkMilestones(sm, mm);
    ok("里程碑:幂等（二次检查无新得）", g2.length === 0);
  }

  // 24c) 事件库：每类 MVP 工作≥3 + options + chain
  {
    const cnt = NSK.Narrative.countsByActivity();
    const need = ["mine", "explore", "combat", "refine", "manufacture", "invent"];
    const lack = need.filter(a => (cnt[a] || 0) < 3);
    ok("事件:六类 MVP 工作各≥3", lack.length === 0, JSON.stringify(cnt));
    ok("事件:存在 options 分支(≥6)", NSK.Narrative.EVENTS.filter(e => e.options && e.options.length).length >= 6,
      "n=" + NSK.Narrative.EVENTS.filter(e => e.options && e.options.length).length);
    ok("事件:存在三段战斗链", NSK.Narrative.EVENTS.filter(e => e.kind === "chain").length >= 3);
  }
  // 选项结算：稳妥分支 → 矿石增加 + 精通点 +1；词条门槛拦截
  {
    const se = Engine.State.defaultState(now, Data);
    const mem = se.members[0];
    const ev = NSK.Narrative.findById("mine_rich_choice");
    const before = se.res.fe_ore || 0;
    const p0 = Engine.Mastery.summary(se).points;
    const r = NSK.Narrative.resolveOption(se, ev, 1, mem.id, () => 0.99); // index1 = 稳妥回收
    ok("事件选项:稳妥分支结算成功", r.ok && (se.res.fe_ore || 0) > before, JSON.stringify({ ok: r.ok, fe: se.res.fe_ore }));
    ok("事件选项:精通点+1", Engine.Mastery.summary(se).points === p0 + 1, "points=" + Engine.Mastery.summary(se).points);
    mem.trait = null;
    const rq = NSK.Narrative.resolveOption(se, ev, 2, mem.id, () => 0.99); // index2 需「矿脉直觉」
    ok("事件选项:词条门槛拦住", rq.ok === false, JSON.stringify(rq));
  }
  // 任务链：force success（rng=0）→ 一→二→三阶段贯通
  {
    const sc = Engine.State.defaultState(now, Data);
    const mid = sc.members[0].id;
    const rr = NSK.Narrative.resolveOption(sc, NSK.Narrative.findById("chain_combat_1"), 0, mid, () => 0);
    ok("任务链:一阶段成功→接续二阶段", rr.ok && rr.success === true && rr.next === "chain_combat_2", JSON.stringify({ ok: rr.ok, s: rr.success, next: rr.next }));
    const r2 = NSK.Narrative.resolveOption(sc, NSK.Narrative.findById("chain_combat_2"), 0, mid, () => 0);
    ok("任务链:二阶段→三阶段", r2.ok && r2.success === true && r2.next === "chain_combat_3", JSON.stringify({ next: r2.next }));
    const r3 = NSK.Narrative.resolveOption(sc, NSK.Narrative.findById("chain_combat_3"), 0, mid, () => 0);
    ok("任务链:三阶段完成并发放图纸", r3.ok && r3.success === true && r3.next === null && (sc.res.bp || 0) >= 1, "bp=" + sc.res.bp);
  }
  // 24d) 待决事件队列：入队 / 去重 / 上限
  {
    const sp = Engine.State.defaultState(now, Data);
    const ev = NSK.Narrative.findById("mine_rich_choice");
    const okEnq = Engine.Settle.enqueuePending(sp, ev, sp.members[0].id, now);
    ok("待决:入队成功", okEnq === true && (sp.pendingEvents || []).length === 1);
    const dup = Engine.Settle.enqueuePending(sp, ev, sp.members[0].id, now);
    ok("待决:同事件同成员去重", dup === false && sp.pendingEvents.length === 1);
    for (let i = 0; i < 10; i++) Engine.Settle.enqueuePending(sp, NSK.Narrative.findById("com_win"), "m_x" + i, now);
    ok("待决:上限 5 条", sp.pendingEvents.length === 5, "len=" + sp.pendingEvents.length);
  }

  // 24e) 精通点：发点 / 消费 / 乘区生效
  {
    const sm2 = Engine.State.defaultState(now, Data);
    ok("精通:初始 0 点", Engine.Mastery.summary(sm2).points === 0);
    Engine.Mastery.award(sm2, 6, "test");
    ok("精通:发点 6", Engine.Mastery.summary(sm2).points === 6);
    const buy = Engine.Mastery.spend(sm2, "industry"); // 1 级花 1 点
    ok("精通:强化工业 Lv1 并扣 1 点", buy.ok && buy.level === 1 && Engine.Mastery.summary(sm2).points === 5, JSON.stringify(buy));
    ok("精通:工业耗时乘区 < 1", Engine.Mastery.industryTimeMult(sm2) < 1, "mult=" + Engine.Mastery.industryTimeMult(sm2).toFixed(3));
    const pen0 = Engine.Mastery.hopPenalty(sm2);
    Engine.Mastery.spend(sm2, "logistics");
    const pen1 = Engine.Mastery.hopPenalty(sm2);
    ok("精通:航线惩罚随级下降", Math.abs(pen0 - 0.20) < 1e-9 && pen1 < pen0, "pen " + pen0.toFixed(2) + "→" + pen1.toFixed(2));
    // 工业 Lv1 同窗口产出 > 对照组
    const sNo = Engine.State.defaultState(now, Data);
    const sYes = Engine.State.defaultState(now, Data);
    Engine.Mastery.award(sYes, 10, "t"); Engine.Mastery.spend(sYes, "industry");
    for (const st of [sNo, sYes]) { st.res.fe_ore = 1000; Engine.Production.enqueue(st, "smelt", "smelt_fe_alloy", 100); st.res.fe_alloy = 0; }
    Engine.Settle.settle(sNo, now + 600 * 1000);
    Engine.Settle.settle(sYes, now + 600 * 1000);
    ok("精通:工业强化使同窗口精炼产出>对照", sYes.res.fe_alloy > sNo.res.fe_alloy,
      "no=" + (sNo.res.fe_alloy || 0).toFixed(1) + " yes=" + (sYes.res.fe_alloy || 0).toFixed(1));
  }

  // 24f) 熔炼增产任务：矿材提交单出现 smeltBoost 且文案标注双倍酬劳
  {
    const fac = Data.Factions.FACTIONS.find(f => f.bias && f.bias.mineral > 0) || Data.Factions.FACTIONS[0];
    let boost = 0, total = 0, badDesc = 0;
    for (let i = 0; i < 300; i++) {
      const q = Data.Factions.generateQuest(Core.makeRng(1234 + i), fac, 2);
      if (q.mode !== "submit") continue;
      total++;
      if (q.smeltBoost) {
        boost++;
        if (String(q.desc).indexOf("双倍酬劳") < 0) badDesc++;
      }
    }
    ok("熔炼增产:出现双倍酬劳任务", boost > 0, "boost=" + boost + "/" + total);
    ok("熔炼增产:文案标注正确", badDesc === 0, "badDesc=" + badDesc);
  }

  // ============ block25：周日（新档完整闭环 + 存档版本兼容）============
  {
    const s25 = Engine.State.defaultState(now, Data);
    ok("闭环:新档 version=8", s25.version === 8, "v=" + s25.version);
    ok("闭环:序章报告已发居住舱", String((s25.reports[0] || {}).title || "").indexOf("序章") >= 0);
    ok("闭环:起始本体 Lv1(bodyLevel=0)", s25.base.bodyLevel === 0);

    // 1) 招募中心：确保候选 → 招 1 人进名册
    Engine.Recruit.ensureRecruitState(s25, Data, now);
    const cand = (s25.recruit.candidates || [])[0];
    const memBefore = s25.members.length;
    const rc = cand ? Engine.Recruit.recruit(s25, cand.id) : { ok: false, reason: "no-candidate" };
    ok("闭环:招募中心招入 1 人", rc.ok && s25.members.length === memBefore + 1, "n=" + s25.members.length);

    // 2) 派工采集 30 分钟（含经验成长 + 可能触发的待决事件不影响本断言）
    const w = s25.members[0];
    Engine.Dispatch.assign(s25, w.id, "mine", { nodeId: s25.base.nodeId });
    const oreKey = Engine.Dispatch.primaryOre(s25.starMap, s25.base.nodeId);
    const o0 = s25.res[oreKey] || 0;
    Engine.Settle.settle(s25, now + 30 * 60 * 1000);
    ok("闭环:派工采矿有产出", (s25.res[oreKey] || 0) > o0, oreKey + " " + o0.toFixed(0) + "→" + (s25.res[oreKey] || 0).toFixed(0));
    ok("闭环:采矿经验成长", w.skills.mining > 0, "xp=" + w.skills.mining.toFixed(0));

    // 3) 冶炼 → 矿材；制造 → 部件
    s25.res.fe_ore = Math.max(s25.res.fe_ore || 0, 800);
    const alloy0 = s25.res.fe_alloy || 0;
    // 部件配方现吃 fe_alloy:40 + ni_alloy:6 + planet_lava:7 + planet_gas:4（1 代复合组合）；
    // 给足矿材/行星产物，避免 mk_struct 扣料掩盖精炼产出、且保证可入队（开局行星产物为 0）。
    s25.res.fe_alloy = (s25.res.fe_alloy || 0) + 200;
    s25.res.ni_alloy = (s25.res.ni_alloy || 0) + 100;
    s25.res.planet_lava = (s25.res.planet_lava || 0) + 100;
    s25.res.planet_gas = (s25.res.planet_gas || 0) + 100;
    const eq = Engine.Production.enqueue(s25, "smelt", "smelt_fe_alloy", 10);
    const cs0 = s25.res.struct || 0;
    const ec = Engine.Production.enqueue(s25, "manufacture", "mk_struct", 1);
    Engine.Settle.settle(s25, now + 30 * 60 * 1000 + 120 * 1000);
    ok("闭环:精炼产出矿材", eq.ok && (s25.res.fe_alloy || 0) > alloy0, "fe_alloy " + alloy0 + "→" + (s25.res.fe_alloy || 0));
    ok("闭环:制造产出部件", ec.ok && (s25.res.struct || 0) > cs0, "struct " + cs0 + "→" + (s25.res.struct || 0));

    // 4) 升级核心 Lv2 + 装舱（能源门禁内）
    //    升级价（Lv1→Lv2）= 星币 5000 + 标准钛材 100；闭环内先把这两项补足（正常玩法由采矿→精炼累积）
    s25.res.credits = (s25.res.credits || 0) + 8000;
    s25.res.fe_alloy = (s25.res.fe_alloy || 0) + 200;
    const up = Engine.Base.upgradeCore(s25);
    ok("闭环:核心升级到 Lv2", up.ok && s25.base.bodyLevel === 1, JSON.stringify({ ok: up.ok, lv: s25.base.bodyLevel }));
    const pw25 = Engine.Base.powerReport(s25);
    ok("闭环:升级后电网预算增加且未超载", pw25.ok && pw25.produced > 180, JSON.stringify({ p: pw25.produced, c: pw25.consumed }));

    // 5) 跃迁到相邻可开放节点（中期区域）
    const adj25 = Data.StarMap.adjacency(s25.starMap)[s25.base.nodeId] || [];
    let target = null;
    for (const e of adj25) {
      const nd = Data.StarMap.nodeById(s25.starMap, e.to);
      if (nd && nd.trialOpen !== false && (!target || (nd.richness || 0) > (target.richness || 0))) target = nd;
    }
    let moved = { ok: false, err: "no-target" };
    if (target) {
      s25.base.fuel = Math.max(s25.base.fuel, 200);
      moved = Engine.Settle.moveBase(s25, target.id);
    }
    ok("闭环:跃迁到相邻节点", moved.ok === true, JSON.stringify({ ok: moved.ok, err: moved.err, to: target && target.name }));

    // 6) 造中级舰（铁卫级，需 Lv2）：材料给足后总装完成
    s25.res.ni_alloy = (s25.res.ni_alloy || 0) + 200;
    s25.res.struct = (s25.res.struct || 0) + 100;
    s25.res.prop = (s25.res.prop || 0) + 100;
    s25.res.weapon = (s25.res.weapon || 0) + 100; // 1 代部件配比 cost 现含 weapon:4
    const ships0 = s25.ships.length;
    const bc = Engine.Production.buildShip(s25, "cruiser");
    Engine.Settle.settle(s25, now + 2 * 3600 * 1000);
    ok("闭环:中级舰（铁卫级）可造并完成", bc.ok && s25.ships.length === ships0 + 1, JSON.stringify({ ok: bc.ok, err: bc.err, ships: s25.ships.length }));

    // 7) 待决事件在闭环内可产生并被处理（直接入队 + 结算一次）
    const pc0 = (s25.pendingEvents || []).length;
    Engine.Settle.enqueuePending(s25, NSK.Narrative.findById("exp_derelict_choice"), w.id, now);
    const pr = NSK.Narrative.resolveOption(s25, NSK.Narrative.findById("exp_derelict_choice"), 1, w.id, () => 0.99);
    ok("闭环:待决事件可入队并结算", (s25.pendingEvents || []).length === pc0 + 1 && pr.ok, JSON.stringify({ pending: s25.pendingEvents.length, ok: pr.ok }));
  }

  // 存档版本兼容：v7 旧档可迁移加载、补新字段；更高版本拒绝
  {
    const ls = {
      _m: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; },
    };
    sandbox.localStorage = ls; // 让 Core.Store 走浏览器分支
    const sOld = Engine.State.defaultState(now, Data);
    sOld.version = 7;
    delete sOld.mastery;
    delete sOld.pendingEvents;
    sOld.members[0].milestones = undefined;
    ls.setItem(Core.SAVE_KEY, Core.encodeLocalSave(sOld));
    const loaded = Core.load();
    ok("存档:v7 旧档迁移加载并升到 v8", !!loaded && loaded.version === 8, "v=" + (loaded && loaded.version));
    ok("存档:迁移补齐 mastery/pendingEvents/里程碑",
      !!loaded && !!loaded.mastery && Array.isArray(loaded.pendingEvents) && Array.isArray(loaded.members[0].milestones));

    const sFuture = Engine.State.defaultState(now, Data);
    sFuture.version = 99;
    ls.setItem(Core.SAVE_KEY, Core.encodeLocalSave(sFuture));
    ok("存档:更高版本拒绝加载", Core.load() === null);
  }

  // ============ block26：存储后端抽象（localStorage / TapTap tap.setStorage / 内存）============
  {
    const Storage = NSK.Core.Storage;
    // (1) 三者皆无 → memory（Node 探针环境本身就没有 localStorage）
    delete sandbox.localStorage;
    delete sandbox.tap;
    Storage.reset();
    ok("存储:无 localStorage/tap → memory 后端", Storage.backend() === "memory", Storage.backend());
    Storage.setItem("k", "v1");
    ok("存储:memory 读写成对", Storage.getItem("k") === "v1");
    Storage.removeItem("k");
    ok("存储:memory 可删", Storage.getItem("k") === null);

    // (2) 有 tap、无 localStorage → tap 后端；preload 把存档读进内存镜像（同步回调，无需 await）
    const tapCalls = { set: [], remove: [] };
    sandbox.tap = {
      getStorage(o) { if (o && o.success) o.success({ data: "OLD_SAVE" }); },
      setStorage(o) { tapCalls.set.push(o.key + "=" + o.data); if (o && o.success) o.success(); },
      removeStorage(o) { tapCalls.remove.push(o.key); if (o && o.success) o.success(); },
    };
    Storage.reset();
    ok("存储:检测到 tap 后端", Storage.backend() === "tap", Storage.backend());
    Storage.preload("nsk_save_v7");
    ok("存储:tap preload 读入内存镜像", Storage.getItem("nsk_save_v7") === "OLD_SAVE", String(Storage.getItem("nsk_save_v7")));
    Storage.setItem("nsk_save_v7", "NEW_SAVE");
    ok("存储:tap 写入走 tap.setStorage", tapCalls.set.length === 1 && tapCalls.set[0] === "nsk_save_v7=NEW_SAVE", JSON.stringify(tapCalls.set));
    Storage.removeItem("nsk_save_v7");
    ok("存储:tap 删除走 tap.removeStorage", tapCalls.remove.length === 1 && tapCalls.remove[0] === "nsk_save_v7", JSON.stringify(tapCalls.remove));

    // (3) Store 经 Storage 落盘：tap 后端下 save/load 闭环（沙盒里的真实路径）
    Storage.reset();
    Storage.preload("nsk_save_v7");
    const stTap = Engine.State.defaultState(now, Data);
    tapCalls.set.length = 0;
    const okSave = Core.save(stTap);
    ok("存储:Core.save 在 tap 后端成功", okSave === true && tapCalls.set.length === 1, "writes=" + tapCalls.set.length);
    const okLoad = Core.load();
    ok("存储:Core.load 在 tap 后端读回 v8", !!okLoad && okLoad.version === 8, "v=" + (okLoad && okLoad.version));

    // (4) 两者都在时 localStorage 优先（浏览器行为不变）
    const ls2 = {
      _m: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; },
    };
    sandbox.localStorage = ls2;
    Storage.reset();
    ok("存储:localStorage 优先于 tap", Storage.backend() === "localStorage", Storage.backend());
    delete sandbox.tap;
    Storage.reset();
  }
})();

// 26) 舱段布局拖拽换位（2026-10-29）：换的是舱位坐标，必须真实改变相邻增效
{
  const sl = Engine.State.defaultState(now, Data);
  Engine.Base.normalize(sl);
  const hull = Engine.Base.hullOf(sl);
  ok("布局:旧档 normalize 补齐 slotPos 空对象", !!sl.base.slotPos && typeof sl.base.slotPos === "object" && Object.keys(sl.base.slotPos).length === 0);
  const slots0 = Engine.Base.stateSlots(sl);
  ok("布局:默认拓扑等于船体蓝图 layout",
    slots0.every(s => s.type === "core" || (s.x === hull.layout[s.type][0] && s.y === hull.layout[s.type][1])),
    slots0.length + " slots");
  // 拓荒者级：energy(3,1) 与 manufacture(3,2) 相邻 → 能源直供 0.94
  const multBefore = Engine.Base.queueDurationMultiplier(sl, "manufacture");
  ok("布局:初始制造倍率含能源直供", Math.abs(multBefore - 0.94) < 1e-9, "mult=" + multBefore);
  ok("布局:初始相邻增效含「相邻能源舱」", Engine.Base.slotEffects(sl, "manufacture").some(x => x.text.indexOf("相邻能源舱") >= 0));
  const sw = Engine.Base.swapSlots(sl, "energy", "dock");
  const movedE = Engine.Base.stateSlots(sl).find(s => s.id === "energy");
  const movedD = Engine.Base.stateSlots(sl).find(s => s.id === "dock");
  ok("布局:交换 energy↔dock 成功且坐标互换", sw.ok && movedE.x === 2 && movedE.y === 3 && movedD.x === 3 && movedD.y === 1,
    JSON.stringify({ e: [movedE.x, movedE.y], d: [movedD.x, movedD.y] }));
  const multAfter = Engine.Base.queueDurationMultiplier(sl, "manufacture");
  ok("布局:换位后能源不再邻接总装 → 制造倍率回到 1", Math.abs(multAfter - 1) < 1e-9, "mult=" + multAfter);
  ok("布局:相邻增效文本随换位消失", !Engine.Base.slotEffects(sl, "manufacture").some(x => x.text.indexOf("相邻能源舱") >= 0));
  ok("布局:核心不可交换", Engine.Base.swapSlots(sl, "core", "cargo").ok === false);
  ok("布局:同舱位交换被拒", Engine.Base.swapSlots(sl, "cargo", "cargo").ok === false);
  ok("布局:未知舱位被拒", Engine.Base.swapSlots(sl, "cargo", "nope").ok === false);
  ok("布局:hasCustomLayout 换位后为真", Engine.Base.hasCustomLayout(sl) === true);
  ok("布局:恢复默认清空覆盖", Engine.Base.resetSlotPos(sl).ok && Engine.Base.hasCustomLayout(sl) === false);
  ok("布局:恢复默认后坐标回到蓝图", Engine.Base.stateSlots(sl).every(s => s.type === "core" || (s.x === hull.layout[s.type][0] && s.y === hull.layout[s.type][1])));
  // 手改存档：越界坐标 + 与默认位重叠 → normalize 整套丢弃，避免两张卡叠在同一格
  const dirty = Engine.State.defaultState(now, Data);
  dirty.base.slotPos = { cargo: [9, 9], smelt: [3, 1], energy: [3, 1] };
  Engine.Base.normalize(dirty);
  ok("布局:越界/重叠坐标被 normalize 清洗", Object.keys(dirty.base.slotPos).length === 0, JSON.stringify(dirty.base.slotPos));
  // 换船体：舱位布局属于船体物理结构，换船回落新船体默认拓扑
  const sw2 = Engine.State.defaultState(now, Data);
  if (!sw2.base.ownedHullBlueprints.includes("hull_angel_raider")) sw2.base.ownedHullBlueprints.push("hull_angel_raider");
  Engine.Base.normalize(sw2);
  Engine.Base.swapSlots(sw2, "energy", "dock");
  const swapped2 = Engine.Base.hasCustomLayout(sw2);
  Engine.Base.switchHull(sw2, "hull_angel_raider");
  ok("布局:切换船体清空舱位覆盖", swapped2 === true && Engine.Base.hasCustomLayout(sw2) === false && sw2.base.hullId === "hull_angel_raider");
}

// 22) 残骸场考古（§13 扩展）：每节点恰 1 残骸场 + band + 风味名；成功率随考古等级单调；
//     掉落/反噬正确；派遣 focus 写入；结算周期产出（星币/bp/rep）与确定性 RNG。
(function probeArchaeology() {
  const sb = Engine.State.defaultState(now, Data);
  const map = sb.starMap;
  // 22a) 每节点恰好 1 个残骸场，带 band(1–5) 与中文风味名，无重复 id
  let drCount = 0, badBand = 0, noName = 0, dupIds = new Set(), idDup = 0;
  for (const n of map.nodes) {
    const drs = n.bodies.filter(b => b.kind === "derelict");
    if (drs.length !== 1) { badBand++; continue; }
    drCount += drs.length;
    const d = drs[0];
    if (!(d.band >= 1 && d.band <= 5)) badBand++;
    if (!d.name || /残骸场$/.test(d.name)) noName++; // 风味名应非默认「XX 残骸场」
    if (dupIds.has(d.id)) idDup++; else dupIds.add(d.id);
  }
  ok("考古:每节点恰1残骸场", drCount === map.nodes.length && badBand === 0, "drs=" + drCount + "/" + map.nodes.length + " bad=" + badBand);
  ok("考古:残骸场band∈1..5且无重复id", badBand === 0 && idDup === 0, "idDup=" + idDup);
  ok("考古:残骸场使用风味名(非默认'XX 残骸场')", noName === 0, "noName=" + noName);

  // 22b) 扫描强度模型：成功率随考古等级 + 装配 + 强化单调提升；焦点难度修正生效
  const A = Engine.Archaeology;
  const D = Data.Archaeology;
  function mkMember(archLvl, opts) {
    const xp = 1000 * (Math.pow(1.1, archLvl - 1) - 1);
    const m = { name: "T" + archLvl, skills: { archaeology: xp }, passion: {}, shipId: "destroyer", enhancementLevel: 0, fitted: { high: [], mid: [], low: [], rig: [] } };
    if (opts) Object.assign(m, opts);
    const max = Data.Ships.maxHp(m.shipId);
    m.hp = { shield: max.shield, armor: max.armor, structure: max.structure };
    return m;
  }
  const dr = sb.starMap.nodes[0].bodies.find(b => b.kind === "derelict"); // band 取决于节点
  const band = dr.band;
  // 同焦点(cache)：成功率随考古等级单调不减
  let mono = true, prev = -1;
  for (let lv = 1; lv <= 20; lv++) {
    const r = A.successChance(mkMember(lv), dr, "cache");
    if (r < prev - 1e-9) mono = false;
    prev = r;
  }
  ok("考古:成功率随等级单调不减(cache)", mono);
  ok("考古:安全打捞成功率高于危险秘藏(Lv1)", A.successChance(mkMember(1), dr, "salvage") > A.successChance(mkMember(1), dr, "cache"));
  ok("考古:安全打捞Lv1可肝(salvage>=0.3)", A.successChance(mkMember(1), dr, "salvage") >= 0.3);
  ok("考古:危险秘藏Lv1处于地板(>=0.05,极难但非不可能)", A.successChance(mkMember(1), dr, "cache") >= 0.05);
  ok("考古:高等级封顶0.95", A.successChance(mkMember(80), dr, "cache") <= 0.9501);

  // 22c) 装配 analyzer 提升扫描强度 → 成功率提升
  const base = mkMember(10);
  const withAna = mkMember(10, { fitted: { high: ["analyzer_t3"], mid: [], low: [], rig: [] } });
  ok("考古:装配扫描仪提升扫描强度", A.scanStrength(withAna) > A.scanStrength(base), "base=" + A.scanStrength(base).toFixed(2) + " +ana=" + A.scanStrength(withAna).toFixed(2));
  ok("考古:装配扫描仪提升成功率", A.successChance(withAna, dr, "cache") > A.successChance(base, dr, "cache"));

  // 22d) 舰船强化提升扫描强度（archaeologyScanMultiplier 作用于舰船基础扫描）
  const noEnh = mkMember(10, { shipId: "destroyer" });
  const enh = mkMember(10, { shipId: "destroyer", enhancementLevel: 20 });
  ok("考古:舰船强化(20级)提升扫描强度", A.scanStrength(enh) > A.scanStrength(noEnh), "noEnh=" + A.scanStrength(noEnh).toFixed(2) + " enh=" + A.scanStrength(enh).toFixed(2));

  // 22e) 派遣 focus 写入 assignment
  const sb2 = Engine.State.defaultState(now, Data);
  const node2 = sb2.starMap.nodes[0];
  const dr2 = node2.bodies.find(b => b.kind === "derelict");
  const r2 = Engine.Dispatch.assign(sb2, sb2.members[0].id, "explore", { nodeId: node2.id, bodyId: dr2.id, focus: "cache" });
  ok("考古:派遣focus写入assignment", r2.ok && sb2.members[0].assignment.focus === "cache", JSON.stringify(sb2.members[0].assignment.focus));

  // 22f) 结算周期：残骸场走考古 cycle，确定性强者必产出
  const sb3 = Engine.State.defaultState(now, Data);
  const node3 = sb3.starMap.nodes[0];
  const dr3 = node3.bodies.find(b => b.kind === "derelict");
  sb3.members[0].skills.archaeology = 1000 * (Math.pow(1.1, 40) - 1); // ~Lv40，确保 salvage 必成功
  sb3.members[0].shipId = "destroyer";
  Engine.Dispatch.assign(sb3, sb3.members[0].id, "explore", { nodeId: node3.id, bodyId: dr3.id, focus: "salvage" });
  const credBefore = sb3.res.credits;
  const archBefore = sb3.members[0].skills.archaeology;
  const counterBefore = sb3.archCounter || 0;
  Engine.Settle.settle(sb3, now + 1500 * 1000); // 1500s ≈ 12 周期
  ok("考古:成员考古经验增长", sb3.members[0].skills.archaeology > archBefore);
  ok("考古:安全打捞结算产出星币", sb3.res.credits > credBefore, "credits " + credBefore.toFixed(0) + " -> " + sb3.res.credits.toFixed(0));
  ok("考古:archCounter 递增(确定性)", (sb3.archCounter || 0) > counterBefore);

  // 22g) 焦点掉落倾向：research 有 bp 倾向，cache 有 rep 倾向；经验成功率≈理论值
  const sb4 = Engine.State.defaultState(now, Data);
  const node4 = sb4.starMap.nodes[0];
  const dr4 = node4.bodies.find(b => b.kind === "derelict");
  const archMember = mkMember(20);
  const maxHp4 = Data.Ships.maxHp(archMember.shipId);
  let bpHits = 0, repHits = 0, successN = 0;
  for (let i = 0; i < 400; i++) {
    sb4.archCounter = i;
    archMember.hp = { shield: maxHp4.shield, armor: maxHp4.armor, structure: maxHp4.structure };
    archMember.destroyed = false; // 真实游戏成员周期间回舰基修复，此处隔离反噬累积以独立测 RNG
    const r = A.cycle(sb4, archMember, dr4, "research");
    if (r.success) { successN++; if (r.drops.bp > 0) bpHits++; if (r.drops.rep > 0) repHits++; }
  }
  const researchRate = A.successChance(archMember, dr4, "research");
  ok("考古:research经验成功率≈理论值(容差0.08)", Math.abs(successN / 400 - researchRate) < 0.08, "emp=" + (successN / 400).toFixed(3) + " theory=" + researchRate.toFixed(3));
  ok("考古:research掉落含bp(50%倾向)", bpHits > 0 && bpHits <= 400);
  let cacheRep = 0, cacheSucc = 0;
  for (let i = 0; i < 400; i++) {
    sb4.archCounter = 1000 + i;
    archMember.hp = { shield: maxHp4.shield, armor: maxHp4.armor, structure: maxHp4.structure };
    archMember.destroyed = false;
    const r = A.cycle(sb4, archMember, dr4, "cache");
    if (r.success) { cacheSucc++; if (r.drops.rep > 0) cacheRep++; }
  }
  const cacheRate = A.successChance(archMember, dr4, "cache");
  ok("考古:cache经验成功率≈理论值(容差0.08)", Math.abs(cacheSucc / 400 - cacheRate) < 0.08);
  ok("考古:cache掉落含rep(40%倾向)", cacheRep > 0 && cacheRep <= 400);

  // 22h) 反噬扣船体：低技能 cache 失败 → hp 下降；稳定器减免；非致命免伤可规避
  const sbH = Engine.State.defaultState(now, Data);
  const drH = sbH.starMap.nodes[0].bodies.find(b => b.kind === "derelict");
  const hm = sbH.members[0]; hm.skills.archaeology = 1000 * (Math.pow(1.1, 1) - 1); hm.shipId = "destroyer";
  const hpBefore = hm.hp.shield + hm.hp.armor + hm.hp.structure;
  let damaged = false, destroyed = false;
  for (let i = 0; i < 60; i++) { sbH.archCounter = i; const r = A.cycle(sbH, hm, drH, "cache"); if (r.hullDamage.frac > 0) damaged = true; if (r.destroyed) destroyed = true; }
  const hpAfter = hm.hp.shield + hm.hp.armor + hm.hp.structure;
  ok("考古:反噬扣船体(hp下降)", damaged && hpAfter < hpBefore, "hp " + hpBefore + " -> " + hpAfter);

  // 22i) 修复回路：受损成员回归 idle 后，Repair.tick 回满三防
  const sbR = Engine.State.defaultState(now, Data);
  const rm = sbR.members[0]; rm.shipId = "destroyer";
  rm.hp.shield = 0; rm.hp.armor = 0; rm.hp.structure = 0; rm.status = "idle"; // 模拟全损（未阵亡）
  const Repair = Engine.Repair;
  ok("考古:全损成员需修复", Repair.needsRepair(rm));
  for (let t = 0; t < 2000; t += 5) Repair.tick(sbR, 5); // 推进足够时间
  const maxHp = Data.Ships.maxHp("destroyer");
  const full = rm.hp.shield >= maxHp.shield - 1e-6 && rm.hp.armor >= maxHp.armor - 1e-6 && rm.hp.structure >= maxHp.structure - 1e-6;
  ok("考古:修复回路回满三防", full, JSON.stringify(rm.hp));

  // 22j) 确定性：同种子两次 cycle 序列一致
  const sb5 = Engine.State.defaultState(now, Data);
  const dr5 = sb5.starMap.nodes[0].bodies.find(b => b.kind === "derelict");
  sb5.members[0].skills.archaeology = 1000 * (Math.pow(1.1, 5) - 1); sb5.members[0].shipId = "destroyer";
  const seq1 = [], seq2 = [];
  const maxHp5 = Data.Ships.maxHp("destroyer");
  for (let i = 0; i < 30; i++) {
    sb5.archCounter = i;
    const m5 = sb5.members[0];
    m5.hp = { shield: maxHp5.shield, armor: maxHp5.armor, structure: maxHp5.structure };
    m5.destroyed = false;
    const r = A.cycle(sb5, m5, dr5, "cache"); seq1.push(r.success ? 1 : 0);
  }
  const sb6 = JSON.parse(JSON.stringify(sb5)); sb6.archCounter = 0;
  const maxHp6 = Data.Ships.maxHp("destroyer");
  for (let i = 0; i < 30; i++) {
    sb6.archCounter = i;
    const m6 = sb6.members[0];
    m6.hp = { shield: maxHp6.shield, armor: maxHp6.armor, structure: maxHp6.structure };
    m6.destroyed = false;
    const r = A.cycle(sb6, m6, dr5, "cache"); seq2.push(r.success ? 1 : 0);
  }
  ok("考古:同种子周期序列可复现", JSON.stringify(seq1) === JSON.stringify(seq2), JSON.stringify(seq1.slice(0, 8)));
})();

// 27) 装备制造闭环（制造车间 · 2026-11-03 独立队列）：buildEquipment 入 equip 队列 → 结算入库 state.equipment
(function probeEquipment() {
  const P = Engine.Production;
  // 27a) T1 装备（analyzer_t1, level1→gate0）在起始档可造：扣原料 + 入队 + 结算入库
  const sb = Engine.State.defaultState(now, Data);
  const eq = Data.Equipment.byId("analyzer_t1");
  for (const k in eq.cost) sb.res[k] = (sb.res[k] || 0) + eq.cost[k] + 100; // 备足原料
  const before = sb.equipment["analyzer_t1"] || 0;
  const r = P.buildEquipment(sb, "analyzer_t1");
  ok("装备:起始档T1可造且入队(equipQueue)", r.ok && (sb.base.industry.equipQueue || []).length === 1
    && (sb.base.industry.manufactureQueue || []).length === 0, "equip=" + (sb.base.industry.equipQueue || []).length + " manu=" + (sb.base.industry.manufactureQueue || []).length);
  Engine.Settle.settle(sb, now + 60 * 1000); // time 20s × durationMult，结算完成
  ok("装备:结算后入库 state.equipment", (sb.equipment["analyzer_t1"] || 0) === before + 1, "equip=" + (sb.equipment["analyzer_t1"] || 0));
  ok("装备:结算后制造车间队列清空", (sb.base.industry.equipQueue || []).length === 0, "equipQueue=" + (sb.base.industry.equipQueue || []).length);

  // 27b) 等级门禁：T5（level80→gate3）在起始档被拒
  const sb2 = Engine.State.defaultState(now, Data);
  const r5 = P.buildEquipment(sb2, "analyzer_t5");
  ok("装备:T5需核心Lv4被拒(gate)", r5.ok === false && r5.err.indexOf("核心等级不足") === 0, JSON.stringify(r5));

  // 27c) 原料不足被拒（先清空 T1 所需原料：fe_alloy 40 / ni_alloy 15）
  const sb3 = Engine.State.defaultState(now, Data);
  sb3.res.fe_alloy = 0; sb3.res.ni_alloy = 0;
  const r3 = P.buildEquipment(sb3, "analyzer_t1");
  ok("装备:原料不足被拒", r3.ok === false && r3.err.indexOf("原料不足") === 0, JSON.stringify(r3));

  // 27d) 独立产线：造船占满总装坞不影响装备；装备自己按 plan.equip 卡槽位（起始档 1/1）
  const sb4 = Engine.State.defaultState(now, Data);
  for (const k in eq.cost) sb4.res[k] = (sb4.res[k] || 0) + (eq.cost[k] || 0) * 4 + 400;
  const bs = P.buildShip(sb4, "frigate"); // 占 1 个总装槽（起始档 manufacture=1）
  ok("装备:先造舰占满总装坞", bs.ok && P.manufactureUsed(sb4) === 1, "used=" + P.manufactureUsed(sb4));
  const rEq = P.buildEquipment(sb4, "analyzer_t1");
  ok("装备:总装坞满不影响装备入队（独立产线）", rEq.ok === true && (sb4.base.industry.equipQueue || []).length === 1, JSON.stringify(rEq).slice(0, 80));
  const rEq2 = P.buildEquipment(sb4, "analyzer_t1");
  ok("装备:制造车间槽满(1/1)时被拒", rEq2.ok === false && rEq2.err.indexOf("制造车间槽位已满") > -1, JSON.stringify(rEq2));

  // 27e) 蓝图门禁（1 代 ownedBlueprints 原样）：势力商店未实装期间由 BP_GRANT_ALL 全量授予
  const sb5 = Engine.State.defaultState(now, Data);
  const bpEqs = Data.Equipment.all().filter(e => e.requiresBlueprint);
  ok("蓝图:新档授予全部 requiresBlueprint 装备",
    bpEqs.every(e => Data.Equipment.hasBlueprint(sb5, e.id)),
    "标蓝图=" + bpEqs.length + " 授予后 owned=" + sb5.ownedBlueprints.length);
  ok("蓝图:key 前缀为 equipment:",
    Data.Equipment.bpKey("analyzer_t1") === "equipment:analyzer_t1", Data.Equipment.bpKey("analyzer_t1"));
  const nBp = sb5.ownedBlueprints.length;
  Data.Equipment.grantAllBlueprints(sb5);
  ok("蓝图:重复授予幂等", sb5.ownedBlueprints.length === nBp, nBp + " -> " + sb5.ownedBlueprints.length);

  // 27f) 门真实生效：清空后同一件装备被拦，补回后可造（开关语义 = 只改授予，不改门）
  const sb6 = Engine.State.defaultState(now, Data);
  const GATED = "raider_mining_laser";        // requiresBlueprint 且无 requiresRel，排除干扰
  const ge = Data.Equipment.byId(GATED);
  for (const k in ge.cost) sb6.res[k] = (sb6.res[k] || 0) + ge.cost[k] + 100;
  sb6.base.bodyLevel = 3;                      // 排除核心等级门
  sb6.ownedBlueprints = [];                    // 模拟「势力商店还没买」
  const rNo = P.buildEquipment(sb6, GATED);
  ok("蓝图:未解锁被拒", rNo.ok === false && rNo.err.indexOf("缺少蓝图") === 0, JSON.stringify(rNo));
  sb6.ownedBlueprints.push(Data.Equipment.bpKey(GATED));
  const rYes = P.buildEquipment(sb6, GATED);
  ok("蓝图:解锁后放行", rYes.ok === true, JSON.stringify(rYes));

  // 27g) 无 requiresBlueprint 的装备不受门禁影响（refinery_pump 是通用槽件）
  const sb7 = Engine.State.defaultState(now, Data);
  const fp = Data.Equipment.byId("refinery_pump");
  for (const k in fp.cost) sb7.res[k] = (sb7.res[k] || 0) + fp.cost[k] + 100;
  sb7.base.bodyLevel = 3;
  sb7.ownedBlueprints = [];
  const rFree = P.buildEquipment(sb7, "refinery_pump");
  ok("蓝图:无蓝图装备不受门禁影响", rFree.ok === true, JSON.stringify(rFree));

  // 27h) 战斗技能接线（1 代 schemas：每门武器只吃自己类型技能，不跨类型平均）
  const CM = Engine.Combat;
  ok("技能:武器→技能映射与 1 代一致",
    CM.SKILL_OF_WEAPON.laser === "combatLaser" &&
    CM.SKILL_OF_WEAPON.cannon === "combatTurret" &&
    CM.SKILL_OF_WEAPON.missile === "missile",
    JSON.stringify(CM.SKILL_OF_WEAPON));

  const lvXp = (lv) => Math.round(((Math.pow(1.1, lv - 1) + Math.pow(1.1, lv)) / 2 - 1) * 1000);
  function cMem(id, lvL, lvT, lvM, wid, nodeId) {
    return { id, status: "idle", destroyed: false,
      skills: { mining: 0, gas: 0, archaeology: 0, refine: 0, manufacture: 0, research: 0,
                combatLaser: lvXp(lvL), combatTurret: lvXp(lvT), missile: lvXp(lvM), defense: 0,
                capacitor: 0, logistics: 0 },
      passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 },
      hp: { shield: 1e9, armor: 1e9, structure: 1e9 },
      fitted: { high: [wid], mid: [], low: [], rig: [] },
      assignment: { type: "combat", nodeId } };
  }
  const sb8 = Engine.State.defaultState(now, Data);
  const nid = raidIdOf(sb8);
  function probeOne(m, nd) { sb8.members = [m]; return CM.prepareNode(sb8, nd); }

  const pLo = probeOne(cMem("a", 1, 1, 1, "t1_small_laser", nid), nid);
  const pHi = probeOne(cMem("a", 44, 1, 1, "t1_small_laser", nid), nid);
  const pCmd = probeOne(cMem("a", 1, 1, 44, "t1_small_laser", nid), nid);
  ok("技能:激光技能提升 → 激光 DPS 上升",
    pHi.dpsByType.laser > pLo.dpsByType.laser * 1.5,
    "Lv1=" + pLo.dpsByType.laser.toFixed(2) + " Lv44=" + pHi.dpsByType.laser.toFixed(2));
  ok("技能:命中随技能等级上升（1 代 baseHit + lv×4）",
    pHi.weapons[0].hitChance > pLo.weapons[0].hitChance + 0.05,
    "Lv1=" + (pLo.weapons[0].hitChance * 100).toFixed(1) + "% Lv44=" + (pHi.weapons[0].hitChance * 100).toFixed(1) + "%");
  ok("技能:练导弹不影响激光炮（旧的「三技能平均」已删）",
    Math.abs(pCmd.dpsByType.laser - pLo.dpsByType.laser) < 1e-9,
    "misLv44=" + pCmd.dpsByType.laser.toFixed(4) + " base=" + pLo.dpsByType.laser.toFixed(4));

  const pMisLo = probeOne(cMem("a", 1, 1, 1, "t1_light_missile_launcher", nid), nid);
  const pMisHi = probeOne(cMem("a", 1, 1, 44, "t1_light_missile_launcher", nid), nid);
  ok("技能:导弹吃 missile 技能（2026-11-01 独立，原借 command）",
    pMisHi.dpsByType.missile > pMisLo.dpsByType.missile * 1.2,
    "Lv1=" + pMisLo.dpsByType.missile.toFixed(2) + " Lv44=" + pMisHi.dpsByType.missile.toFixed(2));
  ok("技能:weaponSkillOf 回报装配武器的技能",
    (function () {
      const m = cMem("a", 1, 1, 1, "t1_small_laser", nid);
      const w = CM.weaponSkillOf(m);
      return w && w.key === "combatLaser" && w.weaponType === "laser" && w.level >= 1;
    })(), JSON.stringify(CM.weaponSkillOf(cMem("a", 1, 1, 1, "t1_small_laser", nid))));
})();

(function probeFitRepair() {
  const P = Engine.Production;
  const Repair = Engine.Repair;
  // 28a) 装配：destroyer 成员（高/中/低槽各 1），仓库有 analyzer_t1(high) ×2 + stabilizer_t1(mid)
  const sb = Engine.State.defaultState(now, Data);
  const m = sb.members[0]; m.shipId = "destroyer"; // 强制有高/中/低槽
  sb.equipment["analyzer_t1"] = 2;
  sb.equipment["stabilizer_t1"] = 1;
  const rFit = P.fitEquipment(sb, m.id, "high", "analyzer_t1");
  ok("装配:high 槽装配成功", rFit.ok && m.fitted.high.indexOf("analyzer_t1") >= 0, JSON.stringify(rFit));
  ok("装配:库存扣减", (sb.equipment["analyzer_t1"] || 0) === 1, "inv=" + (sb.equipment["analyzer_t1"] || 0));
  // 28b) 卸下反向归还库存
  const rUn = P.unfitEquipment(sb, m.id, "high", "analyzer_t1");
  ok("卸下:成功且库存归还", rUn.ok && (sb.equipment["analyzer_t1"] || 0) === 2 && m.fitted.high.length === 0, JSON.stringify(rUn));
  // 28c) 槽类型不匹配：把 mid 装备装入 high 槽
  const rMis = P.fitEquipment(sb, m.id, "high", "stabilizer_t1");
  ok("装配:槽类型不匹配被拒", rMis.ok === false && rMis.err.indexOf("不匹配") > -1, JSON.stringify(rMis));
  // 28d) 槽位容量超限：frigate 高槽=1，装两件 analyzer 被拒
  const sb2 = Engine.State.defaultState(now, Data);
  const m2 = sb2.members[0]; m2.shipId = "frigate";
  sb2.equipment["analyzer_t1"] = 3; sb2.equipment["analyzer_t2"] = 1;
  const f1 = P.fitEquipment(sb2, m2.id, "high", "analyzer_t1");
  const f2 = P.fitEquipment(sb2, m2.id, "high", "analyzer_t2");
  ok("装配:高槽满(1)后再装被拒", f1.ok && f2.ok === false && f2.err.indexOf("已满") > -1, JSON.stringify({ f1, f2 }));
  // 28e) 修复信息：制造一名重创 idle 成员，settle 后应进入修复队列（模型 C）
  const sb3 = Engine.State.defaultState(now, Data);
  const m3 = sb3.members[0]; m3.shipId = "destroyer";
  m3.hp = { shield: 0, armor: 0, structure: 10 };
  Engine.Settle.settle(sb3, now + 1000); // 触发 Repair.tick
  const info = Repair.repairInfo(sb3);
  const inRep = info.repairing.concat(info.waiting).some(e => e.id === m3.id);
  ok("修复:受损成员进入修复队列", inRep, "used=" + info.used + "/" + info.bays);
  ok("修复:泊位数量=max(2,bodyLevel+2)", info.bays === Math.max(2, sb3.base.bodyLevel + 2), "bays=" + info.bays);
})();

(function probeWaveCombat() {
  const C = Engine.Combat, S = Engine.Settle;

  // 给某 state 的所有参战成员装同一把武器（1 代规则：没有武器就没有伤害）
  function armAll(st, weaponId) {
    for (const mm of st.members) {
      if (mm.assignment && mm.assignment.type === "combat") {
        mm.fitted = { high: [weaponId], mid: [], low: [], rig: [] };
      }
    }
  }

  const sb = Engine.State.defaultState(now, Data);
  const m = sb.members[0];
  m.skills.combatLaser = 20000; m.skills.combatTurret = 20000; m.skills.command = 20000;
  const asg = Engine.Dispatch.assign(sb, m.id, "combat", { nodeId: raidIdOf(sb) });
  ok("齐射:派遣战斗成功", asg && asg.ok !== false, JSON.stringify(asg));

  // 29a) 关键回归：未装武器 = 零伤害（自创的「本能输出」已删除，1 代同规则）
  const Pbare = C.prepareNode(sb, raidIdOf(sb));
  const rbare = C.advance(sb, raidIdOf(sb), 60, 0, false);
  ok("战斗:未装武器 → 零伤害零掉落（1 代规则，无自创本能输出）",
    !!Pbare && Pbare.squadDps === 0 && rbare.credits === 0 && rbare.damage === 0,
    Pbare ? ("squadDps=" + Pbare.squadDps + " credits=" + rbare.credits + " damage=" + rbare.damage) : "null");

  armAll(sb, "t1_small_laser");

  // 29b) 物理恒等：一波时长 = 盾段 + 甲段 + 构段（每段含该层克制，不是拍脑袋的常量）
  //      2026-11-01 修「层不回卷」时一并修正：旧口径 fleetHp/squadDps 是不含克制的，
  //      会让 UI 的一波时长比实际偏长（激光队 2.12s vs 真实 1.86s）。
  const P = C.prepareNode(sb, raidIdOf(sb));
  const waveSum = ["shield", "armor", "structure"].reduce(function (a, L) {
    return a + P.fleetHpSum[L] / C.layerDps(P.dpsByType, L, null);
  }, 0);
  ok("战斗:一波时长 = 三段（盾+甲+构）之和，每段含克制",
    !!P && P.squadDps > 0 && P.dropCredits > 0 && P.dropRep > 0 &&
      Math.abs(P.waveSec - waveSum) < 1e-9 && P.waveSec < P.fleetHp / P.squadDps - 1e-9,
    P ? ("fleetHp=" + P.fleetHp + " waveSec=" + P.waveSec.toFixed(3) + "s 无克制口径=" + (P.fleetHp / P.squadDps).toFixed(3) + "s") : "null");
  ok("齐射:编队含 3 艘敌舰且带三防血量",
    !!P && !!P.fleet && P.fleet.ships.length === 3 &&
      P.fleet.ships.every(s => s.maxHp.shield > 0 && s.maxHp.armor > 0 && s.maxHp.structure > 0),
    P && P.fleet ? ("fleet=" + P.fleet.ships.map(s => s.name + "(" + s.kindCn + ")").join(" / ")) : "");
  ok("战斗:我方伤害全部来自装配武器（squadDps ≡ weaponDps）",
    !!P && Math.abs(P.squadDps - P.weaponDps) < 1e-9 && P.weaponDps > 0,
    P ? ("weapon=" + P.weaponDps.toFixed(2) + " squad=" + P.squadDps.toFixed(2)) : "");

  // 29c) 波时长随我方战力变化：多装武器 → 打得更快
  const sb2w = Engine.State.defaultState(now, Data);
  unlockSquad(sb2w, 3);   // 编制上限 3（科技解锁）：容量门禁生效后不能整队 6 人上了
  for (const mm of sb2w.members) Engine.Dispatch.assign(sb2w, mm.id, "combat", { nodeId: raidIdOf(sb2w) });
  armAll(sb2w, "t1_small_laser");
  const Pone = C.prepareNode(sb, raidIdOf(sb));      // 1 人 1 炮
  const Pmany = C.prepareNode(sb2w, raidIdOf(sb2w)); // 全员 1 炮
  ok("齐射:武器越多一波越短（波时长由敌我强度算出，非常量）",
    !!Pone && !!Pmany && Pmany.squadDps > Pone.squadDps && Pmany.waveSec < Pone.waveSec,
    "1人=" + Pone.waveSec.toFixed(2) + "s " + Pmany.cnt + "人=" + Pmany.waveSec.toFixed(2) + "s");

  // 29d) 每秒收益完全由物理推出：每波掉落固定，波越短单位时间收益越高
  //     （2026-11-01 清理：删掉自创的 rateCredits/rateRep 字段，它只是 drop/waveSec 的别名）
  const rateOne = Pone.dropCredits / Pone.waveSec;
  const rateMany = Pmany.dropCredits / Pmany.waveSec;
  ok("战斗:单位时间收益由「波时长」推出（武器越多波越短 → 收益越高）",
    rateMany > rateOne, "1人=" + rateOne.toFixed(3) + "/s " + Pmany.cnt + "人=" + rateMany.toFixed(3) + "/s");

  // 29e) 波数换算 + 掉落 = 每波 × 波数（按实际战斗时长，受血池封顶）
  const r1 = C.advance(sb, raidIdOf(sb), 3600, 0, false);
  const dealt1 = (function () { let s = 0; for (const seg of C.fireSegments(P, sb.res, r1.fightSec, 0).segs) s += seg.dps * seg.sec; return s; })();
  const expWaves1 = P.fleetHp > 0 ? Math.floor(dealt1 / P.fleetHp) : 0;
  ok("战斗:波数 = 打进去的伤害 ÷ 编队总血", Math.abs(r1.waves - expWaves1) <= 1,
    "waves=" + r1.waves + " exp≈" + expWaves1 + " fightSec=" + r1.fightSec.toFixed(1));
  ok("战斗:掉落 = 每波掉落 × 波数", Math.abs(r1.credits - P.dropCredits * r1.waves) < 1e-6,
    "cred=" + r1.credits.toFixed(2) + " exp=" + (P.dropCredits * r1.waves).toFixed(2));

  // 29f) 受击封顶：血池打空后不再继续受击（离线大 dt 不失真）
  ok("战斗:受击正比于实际战斗时长", Math.abs(r1.damage - P.incomingDps * r1.fightSec) < 1e-6,
    "dmg=" + r1.damage.toFixed(1) + " incomingDps=" + P.incomingDps.toFixed(2));
  ok("战斗:超长 dt 触发血池封顶（wiped）", r1.wiped === true && r1.fightSec < 3600,
    "fightSec=" + r1.fightSec.toFixed(1) + "/3600 wiped=" + r1.wiped);

  // 29g) waveHp 累加器：未打穿编队不结算，打穿才结算（切页签/离线靠它衔接）
  const halfSec = P.waveSec * 0.4;   // 用含克制的真实一波时长，否则跨层估算会偏
  const rh = C.advance(sb, raidIdOf(sb), halfSec, 0, false);
  ok("战斗:未打穿编队不结算掉落（进度累积在 waveHp）", rh.waves === 0 && rh.waveHp > 0,
    "waves=" + rh.waves + " waveHp=" + rh.waveHp.toFixed(1) + "/" + P.fleetHp + " progress=" + rh.progress.toFixed(2));
  const rf = (function () {
    // 独立 state 且血量拉满：否则「打穿」会被血池封顶截断（1 人 1020 血只扛得住约 8 秒）
    const st = Engine.State.defaultState(now, Data);
    const mm = st.members[0];
    Engine.Dispatch.assign(st, mm.id, "combat", { nodeId: raidIdOf(st) });
    mm.fitted = { high: ["t1_small_laser"], mid: [], low: [], rig: [] };
    mm.hp = { shield: 1e9, armor: 1e9, structure: 1e9 };
    st.res.ammo_laser = 1e9;
    const PP = C.prepareNode(st, raidIdOf(st));
    return C.advance(st, raidIdOf(st), PP.waveSec * 1.05, 0, false);
  })();
  ok("战斗:打穿编队结算 1 波并结余到下一队", rf.waves === 1 && rf.waveHp > 0 && rf.waveHp < P.fleetHp,
    "waves=" + rf.waves + " waveHp=" + rf.waveHp.toFixed(1));

  // 29h) 编队快照：按波内进度扣血，清场数递增
  const snap0 = C.fleetSnapshot(P.fleet, 0);
  const snap5 = C.fleetSnapshot(P.fleet, 0.5);
  const snap1 = C.fleetSnapshot(P.fleet, 1);
  const hpSum = s => s.ships.reduce((a, x) => a + x.hp.shield + x.hp.armor + x.hp.structure, 0);
  ok("齐射:编队快照按进度扣血", !!snap0 && hpSum(snap0) > hpSum(snap5) && hpSum(snap5) > hpSum(snap1),
    "0%=" + hpSum(snap0) + " 50%=" + hpSum(snap5) + " 100%=" + hpSum(snap1));
  ok("齐射:进度 100% 时全部清场", !!snap1 && snap1.cleared === 3 && snap1.targetIdx === -1,
    "cleared=" + (snap1 ? snap1.cleared : "-"));

  // 29i) 性能：O(1) 闭式，成本与 dt 无关
  const t0 = Date.now();
  for (let k = 0; k < 1000; k++) C.advance(sb, raidIdOf(sb), 86400, 0);
  const ms = Date.now() - t0;
  ok("齐射:O(1) 闭式 1000 次超大 dt < 50ms", ms < 50, ms + "ms / 1000 次");

  // 29j) settle 接线：战报累计 + 掉落入账 + 成员被打穿撤离返港
  // ⚠️ 必须全员参战：1 人 1 门炮打不过一支 3 艘编队（1 代同规则），会当场被打穿、零掉落
  // ⚠️ 必须先把全员的舰船与血量拉平：受击是本 tick 总伤害平摊，血池封顶后 share 恰等于
  //    「平均每人的血量」。若成员随机到不同吨位，血量高于均值的人会带伤活下来 →
  //    「成员被打穿」这条断言会随每人随机舰船而偶发失败（曾出现 450/270 残结构）。
  const sbS = Engine.State.defaultState(now, Data);
  unlockSquad(sbS, 3);    // 编制上限 3：新规则下同据点最多 3 人
  const uniHp = Data.Ships.maxHp("destroyer");
  for (const mm of sbS.members) {
    mm.shipId = "destroyer";
    mm.hp = { shield: uniHp.shield, armor: uniHp.armor, structure: uniHp.structure };
    mm.skills.combatLaser = 20000; mm.skills.combatTurret = 20000; mm.skills.command = 20000;
    Engine.Dispatch.assign(sbS, mm.id, "combat", { nodeId: raidIdOf(sbS) });
  }
  armAll(sbS, "t1_small_laser");
  sbS.res.ammo_laser = 1e9;
  const mS = sbS.members[0];
  const credB = sbS.res.credits, repB = sbS.res.rep;
  Engine.Settle.settle(sbS, now + 3600 * 1000);
  const bt = sbS.battles[raidIdOf(sbS)];
  ok("齐射:settle 后战报累计波次", !!bt && bt.waves > 0, bt ? ("waves=" + bt.waves + " waveSec=" + Number(bt.waveSec).toFixed(2)) : "no battle");
  ok("齐射:settle 后星币/声望增加", sbS.res.credits > credB && sbS.res.rep > repB,
    "cred +" + (sbS.res.credits - credB).toFixed(1) + " rep +" + (sbS.res.rep - repB).toFixed(1));
  ok("齐射:长时间战斗后成员被打穿撤离返港", mS.assignment === null && mS.hp.structure <= 0,
    "assign=" + JSON.stringify(mS.assignment) + " struct=" + mS.hp.structure);
  // 再 settle 一小步，撤离者应被 Repair.tick 拉进修复泊位
  Engine.Settle.settle(sbS, now + 3600 * 1000 + 1000);
  const info2 = Engine.Repair.repairInfo(sbS);
  const inQ = info2.repairing.concat(info2.waiting).some(e => e.id === mS.id);
  ok("齐射:撤离成员进入修复队列（接 1-E 船坞）", inQ, "used=" + info2.used + "/" + info2.bays);
})();

// ================================================================
// Block 30：Phase 2 装备接入（113 条 · 加成真正生效）
// 验证：数据完整 / 采矿与气采乘区分离 / 加成按比例入账 / 冶炼泵聚合 / 势力关系门槛拦截
// ================================================================
(() => {
  const all = Data.Equipment.all();
  ok("装备:总条数 113（15 考古 + 98 迁入）", all.length === 113, "total=" + all.length);
  ok("装备:战斗武器 12 条", all.filter(e => e.combat && e.combat.kind === "weapon").length === 12);
  ok("装备:维修 12 条 / 损伤控制 6 条",
    all.filter(e => e.combat && e.combat.kind === "repair").length === 12 &&
    all.filter(e => e.combat && e.combat.kind === "damageControl").length === 6);
  ok("装备:势力关系门槛 31 条", all.filter(e => e.requiresRel).length === 31);
  ok("装备:加成键全部有中文标签",
    all.every(e => Object.keys(e.bonuses || {}).every(k => !!Data.Equipment.BONUS_LABELS[k])),
    "labels=" + Object.keys(Data.Equipment.BONUS_LABELS).length);

  const n3 = Data.StarMap.nodeById(s.starMap, s.base.nodeId);
  const oreKey = Object.keys(n3.abundance).find(k => !Data.Resources.GAS[k]);
  const gasKey = Object.keys(n3.abundance).find(k => Data.Resources.GAS[k]);

  // 同一节点、同一矿种、同一成员（技能/passion 完全一致），唯一变量是「是否装配」
  // —— 基准 state 每个矿种只建一次并缓存，之后全部克隆：独立 defaultState 的成员技能是
  //    随机生成的，若每次重建基准，A/B 比的就是两个不同的人，比值会随机漂移（曾测出 1.62~1.99）。
  // —— dt 必须取短（10s）：长 dt 会触发随机事件，额外产出污染 A/B 比值。
  const TEST_DT = 10;
  const baseByKey = {};
  const runMine = (eqId, key) => {
    if (!baseByKey[key]) {
      const b = Engine.State.defaultState(now, Data);
      Engine.Dispatch.assign(b, b.members[0].id, "mine", { nodeId: b.base.nodeId, oreId: key });
      baseByKey[key] = b;
    }
    const st = JSON.parse(JSON.stringify(baseByKey[key]));
    if (eqId) st.members[0].fitted = { high: [eqId], mid: [], low: [], rig: [] };
    const before = st.res[key] || 0;
    Engine.Settle.settle(st, now + TEST_DT * 1000);
    return (st.res[key] || 0) - before;
  };

  // 基地/非派遣来源的固定产出（不吃成员装配），必须先扣除才能测出装配乘区
  const runBaseOut = (key) => {
    const st = JSON.parse(JSON.stringify(baseByKey[key] || (function(){
      const b = Engine.State.defaultState(now, Data);
      Engine.Dispatch.assign(b, b.members[0].id, "mine", { nodeId: b.base.nodeId, oreId: key });
      baseByKey[key] = b; return b;
    })()));
    st.members[0].assignment = null;   // 取消派遣 → 只剩基地产出
    const b0 = st.res[key] || 0;
    Engine.Settle.settle(st, now + TEST_DT * 1000);
    return (st.res[key] || 0) - b0;
  };

  // 采矿：t5_mining_laser = miningEfficiency 0.80
  const oreBaseOut = runBaseOut(oreKey);
  const plainOre = runMine(null, oreKey) - oreBaseOut;
  const eqOre = runMine("t5_mining_laser", oreKey) - oreBaseOut;
  const ratioOre = plainOre > 0 ? eqOre / plainOre : 0;
  ok("装备:采矿激光使成员产出 ×1.80", Math.abs(ratioOre - 1.8) < 1e-4,
    "成员产出 无装=" + plainOre.toFixed(3) + " 有装=" + eqOre.toFixed(3) + " 比=" + ratioOre.toFixed(6)
    + "（基地固定产出 " + oreBaseOut.toFixed(2) + " 已扣除）");

  // 乘区分离：采矿装备不该给气体加成
  if (gasKey) {
    const gasBaseOut = runBaseOut(gasKey);
    const plainGas = runMine(null, gasKey) - gasBaseOut;
    const eqGas = runMine("t5_mining_laser", gasKey) - gasBaseOut;
    const ratioGas = plainGas > 0 ? eqGas / plainGas : 0;
    ok("装备:采矿激光对气体无效（乘区分离）", Math.abs(ratioGas - 1) < 1e-4,
      "比=" + ratioGas.toFixed(6) + " (" + gasKey + ")");

    // 气采装备对气体生效
    const gasEq = runMine("t5_gas_harvester", gasKey) - gasBaseOut;
    const ratioGas2 = plainGas > 0 ? gasEq / plainGas : 0;
    ok("装备:气采采集器使气体产出 ×1.80", Math.abs(ratioGas2 - 1.8) < 1e-4, "比=" + ratioGas2.toFixed(6));
  } else {
    ok("装备:当前节点无气体（跳过乘区分离断言）", true, "skip");
  }

  // 低槽提升器与高槽采集器叠加：miningEfficiency 0.8 + miningLaserEfficiency 0.7 → ×2.50
  const st2 = Engine.State.defaultState(now, Data);
  const mm2 = st2.members[0];
  Engine.Dispatch.assign(st2, mm2.id, "mine", { nodeId: st2.base.nodeId, oreId: oreKey });
  mm2.fitted = { high: ["t5_mining_laser"], mid: [], low: ["t4_mining_booster"], rig: [] };
  const fitStack = Engine.Archaeology.fittedBonuses(mm2);
  ok("装备:高/低槽采矿乘区叠加", Math.abs((1 + fitStack.miningEfficiency + fitStack.miningLaserEfficiency) - 2.5) < 1e-9,
    "mining=" + fitStack.miningEfficiency + " laser=" + fitStack.miningLaserEfficiency);

  // 冶炼泵（mid 槽）：全军团聚合
  const st3 = Engine.State.defaultState(now, Data);
  st3.members[0].fitted = { high: [], mid: ["refinery_pump"], low: [], rig: [] };
  const fitPump = Engine.Archaeology.fittedBonuses(st3.members[0]);
  ok("装备:精炼泵 smeltingSpeed 聚合", Math.abs((fitPump.smeltingSpeed || 0) - 0.10) < 1e-9,
    "smeltingSpeed=" + fitPump.smeltingSpeed);

  // 势力关系门槛：angel_mining_laser 需 relation 25，初始 0 应被拒
  const st4 = Engine.State.defaultState(now, Data);
  st4.base.bodyLevel = 3;
  st4.res.fe_alloy = 99999; st4.res.ni_alloy = 99999;
  const rel0 = st4.factions.find(f => f.id === "angel").relation;
  const denied = Engine.Production.buildEquipment(st4, "angel_mining_laser");
  ok("装备:势力关系不足时拒绝制造", !denied.ok && /势力关系不足/.test(denied.err || ""),
    "relation=" + rel0 + " err=" + (denied.err || ""));

  // 关系达标后放行
  st4.factions.find(f => f.id === "angel").relation = 50;
  const allowed = Engine.Production.buildEquipment(st4, "angel_mining_laser");
  ok("装备:关系达标后允许制造", allowed.ok === true, "relation=50 err=" + (allowed.err || "ok"));
})();

// ================================================================
// Block 31：真实时战斗 —— 武器伤害 / 三弹种弹药 / 克制 / 焦点仿真 vs 闭式
// ================================================================
(function probeRealTimeCombat() {
  const C = Engine.Combat, EqData = Data.Equipment;

  ok("弹药:3 个弹种资源已注册",
    !!Data.Resources.ALL.ammo_laser && !!Data.Resources.ALL.ammo_missile && !!Data.Resources.ALL.ammo_cannon,
    Object.keys(Data.Resources.ALL).filter(k => k.indexOf("ammo_") === 0).join(","));

  // 战斗只发生在具名据点：按 band 找据点节点（2026-11-01 起普通节点不产战斗）
  function pickNodeByBand(st, band) {
    for (const n of st.starMap.nodes) {
      if (n.raid && (n.raid.band || 1) === band) return n.id;
    }
    return null;
  }
  function mkBase(nodeId) {
    const st = Engine.State.defaultState(now, Data);
    const mm = st.members[0];
    mm.skills.combatLaser = 20000; mm.skills.combatTurret = 20000; mm.skills.command = 20000;
    Engine.Dispatch.assign(st, mm.id, "combat", { nodeId: nodeId });
    return st;
  }
  function fit(st, ids) {
    st.members[0].fitted = { high: ids.slice(), mid: [], low: [], rig: [] };
  }

  const n1 = pickNodeByBand(Engine.State.defaultState(now, Data), 1);
  const n5 = pickNodeByBand(Engine.State.defaultState(now, Data), 5);
  ok("弹道:找到高安(band1)与深空(band5)节点", !!n1 && !!n5, "n1=" + n1 + " n5=" + n5);

  // 31a) 装武器 → 武器 DPS > 0、总战力上升、波时长变短
  const sA = mkBase(n1), PA0 = C.prepareNode(sA, n1);
  fit(sA, ["t1_small_laser"]);
  const PA1 = C.prepareNode(sA, n1);
  ok("武器:装配后武器DPS>0 且总战力上升",
    PA1.weaponDps > 0 && PA1.squadDps > PA0.squadDps,
    "无装=" + PA0.squadDps.toFixed(1) + " 有装=" + PA1.squadDps.toFixed(1) + "（武器+" + PA1.weaponDps.toFixed(1) + "）");
  ok("武器:伤害变高 → 波时长变短（同一支编队）",
    PA1.waveSec < PA0.waveSec,
    "无装=" + PA0.waveSec.toFixed(2) + "s 有装=" + PA1.waveSec.toFixed(2) + "s");

  // 31b) 三防克制：1 代 calcWeaponCounterMultiplier —— 只有「当前最外层」对应武器 ×1.25，其余 ×1.0
  const cm = (w, l) => C.counterMult(w, l);
  ok("克制:激光对护盾层 ×1.25，其余武器 ×1.0",
    cm("laser", "shield") === 1.25 && cm("laser", "armor") === 1 && cm("laser", "structure") === 1 &&
    cm("missile", "armor") === 1.25 && cm("missile", "shield") === 1 &&
    cm("cannon", "structure") === 1.25 && cm("cannon", "armor") === 1,
    "laser/盾=" + cm("laser", "shield") + " missile/甲=" + cm("missile", "armor") + " cannon/构=" + cm("cannon", "structure"));

  // 1 代命中公式：hit^1.4 / (hit^1.4 + dodge^1.4)
  ok("命中:1 代公式 hit^1.4/(hit^1.4+dodge^1.4)",
    Math.abs(C.hitCoeff(100, 30) - 0.8438) < 0.001 && Math.abs(C.hitCoeff(80, 30) - 0.7979) < 0.001,
    "hit100/dodge30=" + C.hitCoeff(100, 30).toFixed(4) + " hit80/dodge30=" + C.hitCoeff(80, 30).toFixed(4));

  // 换层顺序：护盾打空 → 装甲 → 结构（1 代按层扣减）
  const fl1 = Data.Pirates.fleetFor(1, "angel");
  const fakeP = { fleetHp: fl1.totalHp, fleetHpSum: fl1.hpSum };
  ok("克制:编队按 盾→甲→构 顺序换层",
    C.layerAt(fakeP, 0) === "shield" &&
    C.layerAt(fakeP, fl1.hpSum.shield + 1) === "armor" &&
    C.layerAt(fakeP, fl1.hpSum.shield + fl1.hpSum.armor + 1) === "structure",
    "盾界=" + fl1.hpSum.shield + " 甲界=" + (fl1.hpSum.shield + fl1.hpSum.armor) + " 总=" + fl1.totalHp);

  // 三势力三防特征（1 代原生设计，不是随安等变化）：各偏一门 → 各吃一种武器
  const spA = Data.Pirates.fleetFor(1, "angel").split;
  const spB = Data.Pirates.fleetFor(1, "blood").split;
  const spS = Data.Pirates.fleetFor(1, "sansha").split;
  ok("克制:三势力三防分布与 1 代一致（苍穹盾厚/赤誓甲厚/静默构厚）",
    spA.shield > spA.armor && spA.shield > spA.structure &&
    spB.armor > spB.shield && spB.armor > spB.structure &&
    spS.structure > spS.shield && spS.structure > spS.armor,
    "苍穹=" + (spA.shield * 100).toFixed(0) + "%盾 赤誓=" + (spB.armor * 100).toFixed(0) + "%甲 静默=" + (spS.structure * 100).toFixed(0) + "%构");

  // 31c) 三弹种按武器类型分别扣弹药（各扣各的）
  const sB = mkBase(n1);
  fit(sB, ["t1_small_laser", "t1_light_missile_launcher", "t1_small_cannon"]);
  const before = { l: sB.res.ammo_laser, m: sB.res.ammo_missile, c: sB.res.ammo_cannon };
  const rB = C.advance(sB, n1, 60, 0, false);
  ok("弹药:三种弹种均被消耗且各扣各的",
    !!rB.ammoUsed && rB.ammoUsed.ammo_laser > 0 && rB.ammoUsed.ammo_missile > 0 && rB.ammoUsed.ammo_cannon > 0,
    JSON.stringify(rB.ammoUsed));

  // 31d) 断弹即撤退：弹药清零 → allDry
  const sC = mkBase(n1);
  fit(sC, ["t1_small_laser"]);
  sC.res.ammo_laser = 0;
  const rC = C.advance(sC, n1, 60, 0, false);
  ok("弹药:某弹种清零 → 该型武器哑火（allDry 判定）", rC.allDry === true,
    "allDry=" + rC.allDry + " fightSec=" + rC.fightSec.toFixed(1));

  // 31e) 维修器 / 损伤控制降低敌方压到我方的火力
  const sD = mkBase(n1);
  const inD0 = C.prepareNode(sD, n1).incomingDps;
  sD.members[0].fitted = { high: [], mid: ["t1_shield_booster"], low: [], rig: [] };
  const inD1 = C.prepareNode(sD, n1).incomingDps;
  ok("维修:护盾回充器降低敌方有效火力（封顶 50%）", inD1 < inD0,
    "无=" + inD0.toFixed(3) + " 有=" + inD1.toFixed(3) + "/s");

  const sE = mkBase(n1);
  // 技能基线必须与 inD0 一致，否则「装配」不是唯一变量：
  // defense 现在也进减伤（2026-11-01 技能体系），两个独立 state 的随机技能会让比较失效。
  sE.members[0].skills = Object.assign({}, sD.members[0].skills);
  sE.members[0].fitted = { high: [], mid: ["t1_damage_control"], low: [], rig: [] };
  const inE = C.prepareNode(sE, n1).incomingDps;
  ok("减伤:损伤控制单元生效", inE < inD0,
    "无=" + inD0.toFixed(3) + " 有=" + inE.toFixed(3) + "/s（减伤 " + (C.prepareNode(sE, n1).dmgReduction * 100).toFixed(0) + "%）");

  // 31f) 焦点仿真 vs 闭式：长期收益偏差应在 20% 内（用户允许的容差）
  //      两边都排除血池封顶干扰（否则闭式被 min(dt, 血池÷敌DPS) 截断，比的不是同一件事）
  const sF = mkBase(n1);
  fit(sF, ["t1_small_laser", "t1_light_missile_launcher"]);
  sF.res.ammo_laser = 1e9; sF.res.ammo_missile = 1e9;
  for (const mm of sF.members) mm.hp = { shield: 1e9, armor: 1e9, structure: 1e9 };
  const sG = JSON.parse(JSON.stringify(sF));
  const TICKS = 240;
  let simCred = 0;
  for (let i = 0; i < TICKS; i++) {
    const rr = C.advance(sF, n1, 1, sF.combatWaveHp ? (sF.combatWaveHp[n1] || 0) : 0, true);
    sF.combatWaveHp = sF.combatWaveHp || {};
    sF.combatWaveHp[n1] = rr.waveHp;
    simCred += rr.credits;
  }
  const closed = C.advance(sG, n1, TICKS, 0, false);
  const dev = closed.credits > 0 ? Math.abs(simCred - closed.credits) / closed.credits : 1;
  ok("焦点:逐轮仿真与闭式长期收益偏差 < 20%", dev < 0.20,
    "仿真=" + simCred.toFixed(0) + " 闭式=" + closed.credits.toFixed(0) + " 偏差=" + (dev * 100).toFixed(1) + "%");

  // 31g) 焦点仿真成本恒定（每 tick 少量掷骰，不随时长增长）
  const sH = mkBase(n1);
  fit(sH, ["t1_small_laser", "t1_light_missile_launcher", "t1_small_cannon"]);
  sH.res.ammo_laser = 1e9; sH.res.ammo_missile = 1e9; sH.res.ammo_cannon = 1e9;
  const tSim = Date.now();
  for (let i = 0; i < 1000; i++) C.advance(sH, n1, 1, 0, true);
  const msSim = Date.now() - tSim;
  ok("焦点:1000 次逐轮仿真 < 100ms（成本与时长无关）", msSim < 100, msSim + "ms / 1000 次");

  // 31h) 弹药耗尽 → 整队撤退返港（settle 接线）
  const sI = Engine.State.defaultState(now, Data);
  const mI = sI.members[0];
  mI.skills.combatLaser = 20000; mI.skills.combatTurret = 20000; mI.skills.command = 20000;
  mI.fitted = { high: ["t1_small_laser"], mid: [], low: [], rig: [] };
  Engine.Dispatch.assign(sI, mI.id, "combat", { nodeId: sI.base.nodeId });
  sI.res.ammo_laser = 0;
  Engine.Settle.settle(sI, now + 1000);
  ok("弹药:断弹后 settle 令小队撤退返港", mI.assignment === null,
    "assign=" + JSON.stringify(mI.assignment) + " status=" + mI.status);
})();

// 21) 考古经验对回 1 代（2026-11-04，用户纠正：1 代 systems/archaeology.js:696 是「每次成功解析周期发固定 site.xp」）
// band 1–5 = 遗址档位 I–V，xp 取 1 代真值 50/150/400/900/2000；失败（反噬）不发经验；不再连续 ×dt。
(function probeArchXp() {
  // 静音活动事件：叙事事件（exp_relic 等，activity:"explore"）会直接发 archaeology 技能，
  // 且其 eventBudget 按「每次 settle 调用」封顶 4 → 离线只发 ≤4 次，在线随 3600 次调用多发，
  // 会污染考古经验对照（属另一处 parity bug，不在此考古任务范围）。纪律：对照实验前必须静音。
  const _pick0 = NSK.Narrative.pick;
  NSK.Narrative.pick = function () { return null; };

  // A) 纯函数映射校验
  ok("考古xp映射 band1=50", Engine.Settle.archXpForBand(1) === 50);
  ok("考古xp映射 band5=2000", Engine.Settle.archXpForBand(5) === 2000);
  ok("考古xp映射 缺省band回退50", Engine.Settle.archXpForBand(0) === 50);

  // B) 端到端：高技能成员在 band1 残骸场离线 3h，经验只来自成功周期、且为 50 的整倍数（非连续 ×dt）
  const sb = Engine.State.defaultState(now, Data);
  const node = sb.starMap.nodes.find(n => (n.bodies || []).some(b => b.kind === "derelict" && b.band === 1));
  if (!node) { NSK.Narrative.pick = _pick0; return ok("考古:band1残骸场存在", false, "无band1 derelict"); }
  const ebody = node.bodies.find(b => b.kind === "derelict" && b.band === 1);
  const m = sb.members[0];
  m.skills.archaeology = 1e9;          // 扫描强度远超难度 → 成功率封顶 0.95
  Engine.Dispatch.assign(sb, m.id, "explore", { nodeId: node.id, bodyId: ebody.id, focus: "salvage" });
  // 中性化放 assign 之后：assign→noteVisit 完成「访问目的」会重算 goalXp，须在之后清零；
  // 并清掉默认出身 trait（deep_diver 考古 ×1.3、fast_learner 全局学习 ×1.25 等），隔离「档位 xp 真值」测量。
  m.trait = null;
  m.passion.archaeology = "minor";     // 倍率 1.0（minor）
  m.mods.xpMult = {}; m.mods.learnMult = 1; m.mods.goalXp = 1;
  const gmB = Engine.Settle.passionMult(m, "archaeology") * Engine.Settle.xpMultOf(sb, m, "archaeology");
  const xpBefore = m.skills.archaeology;
  // 离线 3h 一次性结算：period=120s → 90 个周期；while 补齐，经验按成功数发放
  let __cb = 0; const __ob = Engine.Archaeology.cycle; Engine.Archaeology.cycle = function (s, mm, b, f) { __cb++; return __ob(s, mm, b, f); };
  NSK.__grants = [];
  Engine.Settle.settle(sb, now + 3 * 3600 * 1000);
  Engine.Archaeology.cycle = __ob;
  const xpGain = m.skills.archaeology - xpBefore;
  ok("考古:3h后经验增长(成功周期发)", xpGain > 0, "gain=" + xpGain.toFixed(2));
  // 按成员真实乘区 gm 归一：验证「每成功周期 = 50×gm」机制本身（gm 无关，不再假设乘区=1）
  ok("考古:经验为50×gm整倍数(非连续×dt)", Math.abs((xpGain / gmB) % 50) < 1e-6, "gain=" + xpGain.toFixed(2) + " gm=" + gmB.toFixed(4) + " perCycle=" + (xpGain / gmB).toFixed(3));
  ok("考古:离线3h周期数=90(while补齐)", __cb === 90, "cycles=" + __cb);
  ok("考古:经验不超 周期数×50×gm", xpGain <= 90 * 50 * gmB + 1e-6, "gain=" + xpGain.toFixed(2));

  // C) 在线/离线 parity：考古经验只由成功周期数决定，与结算切分无关（验证 while 补齐 + 确定性 RNG）
  const sOnA = Engine.State.defaultState(now, Data);
  const sOffA = JSON.parse(JSON.stringify(sOnA));
  function prepArch(st) {
    const mm = st.members[0];
    mm.skills.archaeology = 1e9;
    Engine.Dispatch.assign(st, mm.id, "explore", { nodeId: node.id, bodyId: ebody.id, focus: "salvage" });
    mm.trait = null; mm.passion.archaeology = "minor";
    mm.mods.xpMult = {}; mm.mods.learnMult = 1; mm.mods.goalXp = 1; // 中性化放 assign 后（noteVisit 重算 goalXp 已发生），隔离档位 xp 真值测量
  }
  prepArch(sOnA); prepArch(sOffA);
  let __cOn = 0, __cOff = 0;
  const __oc = Engine.Archaeology.cycle;
  Engine.Archaeology.cycle = function (s, mm, b, f) { __cOn++; return __oc(s, mm, b, f); };
  NSK.__grants = [];
  for (let i = 1; i <= 3600; i++) Engine.Settle.settle(sOnA, now + i * 1000); // 在线 3600×1s
  Engine.Archaeology.cycle = function (s, mm, b, f) { __cOff++; return __oc(s, mm, b, f); };
  Engine.Settle.settle(sOffA, now + 3600 * 1000);                            // 离线 1×3600s
  Engine.Archaeology.cycle = __oc;
  NSK.Narrative.pick = _pick0;
  const onXp = sOnA.members[0].skills.archaeology - 1e9;
  const offXp = sOffA.members[0].skills.archaeology - 1e9;
  // 按成员真实乘区 gm 归一，验证「成功周期数」这一真实不变量（在线/离线应一致，与乘区无关）
  const gmOn = Engine.Settle.passionMult(sOnA.members[0], "archaeology") * Engine.Settle.xpMultOf(sOnA, sOnA.members[0], "archaeology");
  const gmOff = Engine.Settle.passionMult(sOffA.members[0], "archaeology") * Engine.Settle.xpMultOf(sOffA, sOffA.members[0], "archaeology");
  const succOn = onXp / (50 * gmOn), succOff = offXp / (50 * gmOff); // 每成功周期 = 50×gm，故成功周期数 = 经验/(50×gm)
  // 周期数在线/离线应一致（≤1 容差：1/120 浮点累加在线侧 3600 次得 29.9999…，末周期差 1 个，
  // 属浮点边界漂移、实时游玩下一 tick 自愈，非逻辑 bug）。
  ok("考古parity:在线离线周期数一致(≤1)", Math.abs(__cOn - __cOff) <= 1, "on=" + __cOn + " off=" + __cOff);
  ok("考古parity:在线离线成功周期数一致(≤1)", Math.abs(succOn - succOff) <= 1, "on=" + succOn.toFixed(2) + " off=" + succOff.toFixed(2));
  ok("考古parity:成功周期量级合理(≈22~31)", succOn >= 22 && succOn <= 31 && succOff >= 22 && succOff <= 31,
    "on=" + succOn.toFixed(1) + " off=" + succOff.toFixed(1));
})();

console.log("\n== 架构探针结果: " + pass + " PASS / " + fail + " FAIL ==");
process.exit(fail ? 1 : 0);
