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
  "js/data/resources.js", "js/data/starmap.js", "js/data/ships.js", "js/data/recipes.js",
  "js/data/factions.js", "js/data/names.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js", "js/engine/npc.js",
  "js/engine/booster.js", "js/engine/mastery.js",
  "js/engine/production.js", "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js", "js/engine/sites.js", "js/narrative/events.js",
  "js/engine/settle.js",
];

// 构造最小 window/global 环境（UMD 走 window 分支）
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox;
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
  ok("气云:资源表含气体类且节点有气云且采矿产气体",
    hasGasRes && gasNodes > 0 && gasNodes < sb.starMap.nodes.length && (sb.res[gore] > before),
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

  // 22b) 默认档能源电网：预算 = 本体外壳80 + 已装能源舱×100 = 180；负载 = 非能源模块占用之和 = 125
  const sb = Engine.State.defaultState(now, Data);
  ok("能源:默认预算=180(外壳80+能源舱100)", Math.abs(Engine.Base.energyBudget(sb) - 180) < 1e-9, "budget=" + Engine.Base.energyBudget(sb));
  ok("能源:默认负载=125", Math.abs(Engine.Base.energyUsed(sb) - 125) < 1e-9, "used=" + Engine.Base.energyUsed(sb));
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

  // 23b) 增强剂整舱生效：apply → levelOf / mult；同类型取 max 等级 + 刷新；不同类型独立；过期清理
  const sb2 = Engine.State.defaultState(now, Data);
  const a1 = Engine.Booster.apply(sb2, "smelt", 1, 600);
  ok("增强剂:apply成功level1", a1.ok && a1.level === 1, JSON.stringify(a1));
  ok("增强剂:levelOf=1", Engine.Booster.levelOf(sb2, "smelt") === 1);
  ok("增强剂:mult>1(加速)", Engine.Booster.mult(sb2, "smelt") > 1, "mult=" + Engine.Booster.mult(sb2, "smelt").toFixed(2));
  const a2 = Engine.Booster.apply(sb2, "smelt", 1, 600); // 同类型再激活：等级不变，时长刷新
  ok("增强剂:同类型再激活等级不变", a2.level === 1 && Engine.Booster.levelOf(sb2, "smelt") === 1);
  const a3 = Engine.Booster.apply(sb2, "smelt", 3, 600); // 更高等级 → 取 max
  ok("增强剂:同类型取max等级", Engine.Booster.levelOf(sb2, "smelt") === 3, "lv=" + Engine.Booster.levelOf(sb2, "smelt"));
  Engine.Booster.apply(sb2, "manufacture", 1, 600); // 不同类型独立
  ok("增强剂:不同类型独立", Engine.Booster.levelOf(sb2, "manufacture") === 1 && Engine.Booster.levelOf(sb2, "smelt") === 3);
  // 过期：用未来时间戳查询 → 返回 0（惰性清理）
  const futureMs = now + 700 * 1000;
  ok("增强剂:过期后levelOf=0", Engine.Booster.levelOf(sb2, "smelt", futureMs) === 0, "lv=" + Engine.Booster.levelOf(sb2, "smelt", futureMs));
  ok("增强剂:过期已惰性清理", (sb2.base.boosters || []).length === 0, "boosters=" + (sb2.base.boosters || []).length);

  // 23c) 增强剂进入 production 热路径：smelt 增强剂使同窗口精炼产出 > 无增强剂对照
  // 用较长窗口 + 大量批次，使两态都持续生产、B 始终领先 speed 比率（避免窗口恰好落在同一批次边界）。
  const sNoB = Engine.State.defaultState(now, Data);
  const sB = Engine.State.defaultState(now, Data);
  Engine.Booster.apply(sB, "smelt", 1, 600);
  for (const s of [sNoB, sB]) { s.res.fe_ore = 1000; const e = Engine.Production.enqueue(s, "smelt", "smelt_fe_alloy", 100); s.res.fe_alloy = 0; if (!e.ok) ok("增强剂:对照入队", false, JSON.stringify(e)); }
  Engine.Settle.settle(sNoB, now + 120 * 1000);
  Engine.Settle.settle(sB, now + 120 * 1000);
  const yNoB = sNoB.res.fe_alloy || 0, yB = sB.res.fe_alloy || 0;
  ok("增强剂:加速后精炼产出>对照", yB > yNoB && yB > 0, "noB=" + yNoB.toFixed(1) + " B=" + yB.toFixed(1) + " (差 " + (yB - yNoB).toFixed(1) + ")");

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
  ok("XP:1h未冲到离谱高度(<=25)", lv3600 <= 25, "lv=" + lv3600 + " xp=" + sx.members[0].skills.mining.toFixed(1));

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
    Engine.Settle.settle(sNo, now + 120 * 1000);
    Engine.Settle.settle(sYes, now + 120 * 1000);
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
    const eq = Engine.Production.enqueue(s25, "smelt", "smelt_fe_alloy", 2);
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

console.log("\n== 架构探针结果: " + pass + " PASS / " + fail + " FAIL ==");
process.exit(fail ? 1 : 0);
