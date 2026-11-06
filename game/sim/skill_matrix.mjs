// 技能矩阵探针（2026-11-01 技能体系 12 项）
// 目的：**防止死技能复发**。对每项技能断言两条：
//   ① 能涨 —— 走真实路径后 xp 确实增长；
//   ② 有用 —— 改等级后，可观测输出（产出/耗时/火力/补偿）确实变化。
// 另外锁住 2026-11-01 定下的四条口径（驻舱不涨 / 产出才涨 / 无人不涨 / 演训舱才纯时间涨）。
//
// 与 arch_probe 同样用 Node vm 加载全部 UMD 模块，无 DOM。
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
const St = Engine.State, Settle = Engine.Settle, Disp = Engine.Dispatch;
const Base = Engine.Base, Prod = Engine.Production, Tech = Engine.Tech;
const Combat = Engine.Combat, Logi = Engine.Logistics, Repair = Engine.Repair;
const Booster = Engine.Booster;

// 静音活动事件系统（整场探针，不是某一条）。
// 原因：settle 每 25 秒为每个在岗成员 roll 一次活动事件，很多事件直接往 state.res 里塞整包资源
// （实测 fe_ore +30 / ni_ore +20 / he_gas +12）。本探针测的是「技能等级 → 输出」的单变量因果，
// 一旦掉落正好落在被观测矿种上，gained 就被污染 —— 曾出现 26.81 vs 56.81（差值正好 30.0）并把
// 「Lv10 产出更高」翻成反向 FAIL。事件本身有 story_check / arch_probe 覆盖，这里不需要它。
if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") {
  sandbox.NSK.Narrative.pick = function () { return null; };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name, extra || ""); }
  else { fail++; console.log("FAIL", name, extra || ""); }
}
const pct = (a, b) => (b ? ((a / b - 1) * 100).toFixed(1) + "%" : "n/a");

const now = Date.now();
function fresh() {
  const st = St.defaultState(now, Data);
  // 钉死 rngSeed：defaultState 里 rngSeed 是 Math.random()（state.js:51），
  // 不钉死则每个对照组的活动事件序列都不同（事件会往 res 里塞整包资源），
  // 探针就变成掷骰子。探针要的是「改一个变量→看一个结果」，不是采样。
  st.rngSeed = 0x5EED1234;
  for (const k in st.res) st.res[k] = 999999;
  st.res.credits = 9999999;
  for (const m of st.members) {
    m.destroyed = false; m.assignment = null; m.status = "idle";
    // 天赋/词条倍率统一清零：本探针只测「技能等级 → 输出」，不能让 random passion（0.35~1.5×）
    // 混进来 —— 否则 defense=major、laser=none 时副技能增量会反超主技能，断言随机红。
    m.passion = {};
    for (const k of St.SKILL_KEYS) m.passion[k] = "none";
    m.mods = { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 };
    // 装配也要清空：成员可能自带随机装备，采矿激光会进 fitEff 乘区，
    // 让「只改技能等级」的对照实验失真（实测能翻出 -44% 的反向结果）。
    m.fitted = { high: [], mid: [], low: [], rig: [] };
    m.enhancementLevel = 0;
  }
  return st;
}
function setLv(m, key, lv) { m.skills[key] = St.xpAtLevel(lv); }
// 让某成员成为唯一在场者，避免其他 5 人干扰断言（事件/补偿都按全员算）
function solo(st) {
  const m = st.members[0];
  st.members = [m];
  return m;
}
function tick(st, from, sec) {
  for (let i = 1; i <= sec; i++) Settle.settle(st, from + i * 1000);
}

// ── 0. 键表一致性 ───────────────────────────────────────────────
const EXPECT = ["mining", "gas", "archaeology", "combatLaser", "combatTurret", "missile", "defense", "refine", "manufacture", "research", "capacitor", "logistics"];
ok("键表:12 项且与设计稿一致", JSON.stringify(St.SKILL_KEYS) === JSON.stringify(EXPECT), St.SKILL_KEYS.join(","));
ok("键表:无人机不进表（避免死技能）", St.SKILL_KEYS.indexOf("drones") < 0);
ok("键表:旧键已除名", ["scanning", "command", "invent"].every(k => St.SKILL_KEYS.indexOf(k) < 0));

// ── 1. 采矿 / 采气：能涨 + 有用 ───────────────────────────────
// ⚠️ 气体矿种挂在 **body.abundance**（85 个 kind="gas" 的气态天体），不在 node.abundance 上。
//    采矿派遣必须带 bodyId，否则 settle 只按节点 abundance 取矿（全是矿石），采气永远不触发。
// ⚠️ 必须在**调用方的那个 state** 里找天体：早期版本内部自己 fresh() 造了新存档，
//    节点/天体 id 来自 A 状态、结算却跑在 B 状态上，靠「defaultState 星图确定性」侥幸对上。
//    那不是保证，是把测试架在巧合上 —— 传 st 进来。
function findBodyIn(st, gas) {
  for (const nd of st.starMap.nodes) {
    for (const b of (nd.bodies || [])) {
      if (!b.abundance) continue;
      const keys = Object.keys(b.abundance);
      const hit = gas ? keys.find(k => !!Data.Resources.GAS[k]) : keys.find(k => !Data.Resources.GAS[k]);
      if (hit) return { node: nd, body: b, ore: hit };
    }
  }
  return null;
}
// 自检：上面那次静音必须真的生效。否则本文件所有 >25s 的窗口断言都会悄悄退回掷骰子状态
// （有人把 Narrative 改名、或恢复了 pick 时，这条会先红，比几条采集断言随机翻红好定位得多）。
{
  const st = fresh();
  const t = findBodyIn(st, false);
  const m = solo(st);
  setLv(m, "mining", 1);
  m.assignment = { type: "mine", nodeId: t.node.id, bodyId: t.body.id, oreId: t.ore, startedAt: now, eventRoll: 0 };
  m.status = "dispatched";
  const snap = Object.assign({}, st.res);
  tick(st, now, 60); // 60s 跨 2 次事件 roll（EVENT_INTERVAL=25）
  const injected = Object.keys(st.res).filter(k => st.res[k] - (snap[k] || 0) > 0.001);
  ok("基线:活动事件已静音（60s 跨 2 次 roll，除目标矿外无资源注入）",
    injected.every(k => k === t.ore), injected.join(",") || "无注入");
}

// 采集窗口取 24s（< EVENT_INTERVAL 25s）是**第二道保险**：第一道是上面把 Narrative.pick 静音。
// 万一哪天静音失效（改名/恢复），25s 以内仍然一次事件都 roll 不到，这层断言不会立刻塌。
// 事件掉落的实害记录：fe_ore +30 / ni_ore +20 / he_gas +12 直接塞进 state.res，
// 把「技能等级 → 产出」的 17.6% 差值整个淹掉（26.81 变 56.81，差值正好 30.0，能翻出反向结论）。
const MINE_SEC = 24;
function mineRun(gas, lv, sec) {
  const st = fresh();
  const t = findBodyIn(st, gas);
  if (!t) return { err: "找不到" + (gas ? "气态" : "矿石") + "天体" };
  const m = solo(st);
  // 两个对照场景都必须显式设等级：只设高等级那侧会残留随机初始种子，
  // 导致「Lv1 基线」其实是 Lv3~4，甚至出现反向结果。
  setLv(m, gas ? "gas" : "mining", lv || 1);
  const before = st.res[t.ore] || 0;
  const abv = ((t.body.abundance || {})[t.ore] != null) ? t.body.abundance[t.ore] : ((t.node.abundance || {})[t.ore] || 1);
  m.assignment = { type: "mine", nodeId: t.node.id, bodyId: t.body.id, oreId: t.ore, startedAt: now, eventRoll: 0 };
  m.status = "dispatched";
  const xp0 = m.skills[gas ? "gas" : "mining"];
  const lvSet = Settle.levelOf(xp0);
  const bonusSet = Settle.skillBonus(m.skills, gas ? "gas" : "mining");
  tick(st, now, sec);
  const lvAfter = Settle.levelOf(m.skills[gas ? "gas" : "mining"]);
  return { st, m, ore: t.ore, gained: (st.res[t.ore] || 0) - before, abv: abv, xp0, xp1: m.skills[gas ? "gas" : "mining"], node: t.node, key: gas ? "gas" : "mining", lvSet, lvAfter, bonusSet };
}
// 断言用「比值」而不是「绝对值」：产出 = BASE_MINE × skillBonus × abv × dt × ym × effLogi × fitEff，
// 两组对照只改 skillBonus，其余乘区取相同值 → 相除自动约掉。
// 于是可以精确断言 gained_hi/gained_lo === bonus_hi/bonus_lo，2% 容差，比「高 10%」这种粗阈值可靠得多。
function assertSkillScales(label, gas) {
  const lo = mineRun(gas, 1, MINE_SEC), hi = mineRun(gas, 10, MINE_SEC);
  const ratio = hi.gained / lo.gained;
  const expect = hi.bonusSet / lo.bonusSet;
  const lvOk = (lo.lvAfter === 1 && hi.lvAfter === 10);
  ok(label + ":产出与技能倍率严格成正比（Lv10 vs Lv1）",
    lvOk && ratio > 1.1 && Math.abs(ratio / expect - 1) < 0.02,
    "Lv1=" + lo.gained.toFixed(2) + " Lv10=" + hi.gained.toFixed(2) +
    " 实测比=" + ratio.toFixed(3) + " 期望比=" + expect.toFixed(3) +
    "（等级 " + lo.lvAfter + " vs " + hi.lvAfter + "，矿种 " + lo.ore + "，窗口 " + MINE_SEC + "s）");
}
{
  const r = mineRun(false, 0, MINE_SEC);
  ok("采矿:派遣后 mining xp 增长", r.xp1 > r.xp0, "xp " + r.xp0.toFixed(1) + " → " + r.xp1.toFixed(1) + " 产出=" + r.gained.toFixed(1));
  assertSkillScales("采矿", false);
}
{
  const r = mineRun(true, 0, MINE_SEC);
  ok("采气:气态天体派遣后 gas xp 增长（不再写进 scanning）", r.xp1 > r.xp0 && (r.m.skills.scanning === undefined),
    "gas xp " + r.xp0.toFixed(1) + " → " + r.xp1.toFixed(1) + " 产出=" + r.gained.toFixed(1));
  assertSkillScales("采气", true);
}
{
  // 采集经验 = 1代 baseXP/baseTime(÷3 即 ×3) 按节点富裕度查表（2026-11-03）
  const r = mineRun(false, 0, MINE_SEC);
  const rich = r.node.richness != null ? r.node.richness : (r.node.tier != null ? r.node.tier : 1);
  const expected = (Settle.MINING_XP_RATE[rich] || Settle.MINING_XP_RATE[1]) * Settle.passionMult(r.m, "mining") * Settle.xpMultOf(r.st, r.m, "mining");
  const measured = (r.xp1 - r.xp0) / MINE_SEC;
  ok("采矿:每秒经验 = 1代 baseXP/baseTime×3 按节点富裕度查表", Math.abs(measured / expected - 1) < 0.02,
    "rich=" + rich + " 实测=" + measured.toFixed(3) + "/s 期望=" + expected.toFixed(3) + "/s");
}
{
  // 采矿派遣挖矿石时不该涨 gas（分流必须真的分开）
  const st = fresh();
  const t = findBodyIn(st, false);
  const m = solo(st);
  const b0 = { mining: m.skills.mining || 0, gas: m.skills.gas || 0 };
  m.assignment = { type: "mine", nodeId: t.node.id, bodyId: t.body.id, oreId: t.ore, startedAt: now, eventRoll: 0 };
  m.status = "dispatched";
  tick(st, now, 20);
  // 用增量：新成员带随机初始经验种子（seedSkills），绝对值不可比
  const dMin = (m.skills.mining || 0) - b0.mining, dGas = (m.skills.gas || 0) - b0.gas;
  ok("分流:挖矿石不涨 gas、挖气不涨 mining", dGas === 0 && dMin > 0,
    "Δmining=" + dMin.toFixed(1) + " Δgas=" + dGas.toFixed(1) + "（矿种 " + t.ore + "）");
}

// ── 2. 考古：能涨 + 有用 ──────────────────────────────────────
{
  const st = fresh();
  let node = null, body = null;
  for (const nd of st.starMap.nodes) {
    const b = (nd.bodies || []).find(x => x.kind === "derelict");
    if (b) { node = nd; body = b; break; }
  }
  if (!node) { ok("考古:残骸场存在（跳过后续）", false, "找不到 derelict"); }
  else {
    const w = solo(st);
    w.assignment = { type: "explore", nodeId: node.id, bodyId: body.id, focus: "salvage", startedAt: now, exploreProgress: 0, eventRoll: 0 };
    w.status = "dispatched";
    // 新模型（对回 1 代）：经验只在「跑完一个完整周期且成功」时发放（周期 120s），
    // 故必须把技能顶满（成功率封顶）并 tick 足够长（≥600s 稳出多周期），旧模型 40s 凑不满周期。
    w.skills.archaeology = 1e9;
    const x0 = w.skills.archaeology;
    tick(st, now, 600);
    ok("考古:残骸场派遣后 xp 增长", w.skills.archaeology > x0, "xp " + x0.toFixed(1) + " → " + w.skills.archaeology.toFixed(1));
  }
}

// ── 3. 战斗三项 + 防御：能涨 / 有用 ───────────────────────────
function raidNodeOf(st) { const n = st.starMap.nodes.find(x => !!x.raid); return n; }
function cMem(shipId, lvL, lvT, lvM, lvD, weaponId, nodeId) {
  return {
    id: "c1", name: "探针", status: "dispatched", destroyed: false, shipId: shipId || "frigate",
    skills: { mining: 0, gas: 0, archaeology: 0, refine: 0, manufacture: 0, research: 0,
      combatLaser: St.xpAtLevel(lvL), combatTurret: St.xpAtLevel(lvT), missile: St.xpAtLevel(lvM),
      defense: St.xpAtLevel(lvD), capacitor: 0, logistics: 0 },
    passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 },
    hp: { shield: 1e9, armor: 1e9, structure: 1e9 },
    fitted: { high: [weaponId], mid: [], low: [], rig: [] },
    assignment: { type: "combat", nodeId: nodeId },
  };
}
{
  const st = fresh();
  const n = raidNodeOf(st);
  const m = solo(st);
  m.assignment = { type: "combat", nodeId: n.id, startedAt: now, eventRoll: 0 };
  m.status = "dispatched";
  const x0 = { L: m.skills.combatLaser, T: m.skills.combatTurret, M: m.skills.missile, D: m.skills.defense };
  tick(st, now, 30);
  ok("激光:剿匪 30s 后 xp 增长", m.skills.combatLaser > x0.L, "+" + (m.skills.combatLaser - x0.L).toFixed(1));
  ok("炮台:剿匪 30s 后 xp 增长", m.skills.combatTurret > x0.T, "+" + (m.skills.combatTurret - x0.T).toFixed(1));
  ok("导弹:剿匪 30s 后 xp 增长（不再写进 command）", m.skills.missile > x0.M && m.skills.command === undefined,
    "+" + (m.skills.missile - x0.M).toFixed(1));
  // 防御是副技能（0.6×）。用**单 tick 增量比**测，避免多 tick + 事件累积把比值搅乱；
  // 天赋已统一 none，所以比值应精确等于 (0.6×0.6)/0.8 = 0.45。
  {
    const st2 = fresh();
    const w = solo(st2);
    w.assignment = { type: "combat", nodeId: n.id, startedAt: now, eventRoll: 0 };
    w.status = "dispatched";
    const D0 = w.skills.defense, L0 = w.skills.combatLaser;
    Settle.settle(st2, now + 1000);
    const dD = w.skills.defense - D0, dL = w.skills.combatLaser - L0;
    const ratio = dL > 0 ? dD / dL : 0;
    ok("防御:剿匪时按 0.6× 副速率涨（单 tick 比值 0.45）", dD > 0 && Math.abs(ratio - 0.45) < 0.06,
      "Δdef=" + dD.toFixed(3) + " Δlaser=" + dL.toFixed(3) + " 比=" + ratio.toFixed(3));
  }
}
{
  const st = fresh();
  const n = raidNodeOf(st);
  const prep = (lv, wid) => { const s2 = fresh(); s2.members = [cMem("frigate", lv, 1, 1, 0, wid, n.id)]; return Combat.prepareNode(s2, n.id); };
  const pLo = prep(1, "t1_small_laser"), pHi = prep(10, "t1_small_laser");
  ok("激光:技能提升 → 激光 DPS 上升", pHi.dpsByType.laser > pLo.dpsByType.laser * 1.1,
    "Lv1=" + pLo.dpsByType.laser.toFixed(2) + " Lv10=" + pHi.dpsByType.laser.toFixed(2));
  const tLo = prep2("t1_small_cannon", 1), tHi = prep2("t1_small_cannon", 10);
  function prep2(wid, turretLv) { const s2 = fresh(); s2.members = [cMem("frigate", 1, turretLv, 1, 0, wid, n.id)]; return Combat.prepareNode(s2, n.id); }
  ok("炮台:炮台技能提升 → 射弹 DPS 上升", tHi.dpsByType.cannon > tLo.dpsByType.cannon * 1.1,
    "Lv1=" + tLo.dpsByType.cannon.toFixed(2) + " Lv10=" + tHi.dpsByType.cannon.toFixed(2));
  const mLo = prep3("t1_light_missile_launcher", 1), mHi = prep3("t1_light_missile_launcher", 10);
  function prep3(wid, misLv) { const s2 = fresh(); s2.members = [cMem("frigate", 1, 1, misLv, 0, wid, n.id)]; return Combat.prepareNode(s2, n.id); }
  ok("导弹:导弹技能提升 → 导弹 DPS 上升", mHi.dpsByType.missile > mLo.dpsByType.missile * 1.1,
    "Lv1=" + mLo.dpsByType.missile.toFixed(2) + " Lv10=" + mHi.dpsByType.missile.toFixed(2));
  const dLo = prep4(1), dHi = prep4(10);
  function prep4(defLv) { const s2 = fresh(); s2.members = [cMem("frigate", 1, 1, 1, defLv, "t1_small_laser", n.id)]; return Combat.prepareNode(s2, n.id); }
  ok("防御:防御技能提升 → 受到伤害下降", dHi.incomingDps < dLo.incomingDps * 0.95,
    "Lv1=" + dLo.incomingDps.toFixed(2) + " Lv10=" + dHi.incomingDps.toFixed(2) + "/s（减伤 " + (dHi.dmgReduction * 100).toFixed(0) + "%）");
  ok("防御:减伤走同一个 DMG_RED_CAP 上限（不超过 0.60）", dHi.dmgReduction <= 0.6000001, "cap=" + dHi.dmgReduction);
}

// ── 4. 工业三项：驻舱倍率 + 批次经验 ──────────────────────────
function station(st, slotId, member, trainSkill) {
  const r = Disp.assign(st, member.id, "station", { slotId: slotId, trainSkill: trainSkill });
  return r;
}
function smeltRun({ occupy, lv, sec }) {
  const st = fresh();
  const m = solo(st);
  if (occupy) { if (lv) setLv(m, "refine", lv); station(st, "smelt", m); }
  const before = st.res.fe_alloy || 0;
  const r = Prod.enqueue(st, "smelt", "smelt_fe_alloy", 20);
  if (!r.ok) return { err: r.err };
  // 推进足够久让多批完成
  Prod.processQueue(st, "smelt", now + sec * 1000, 1);
  return { st, m, alloy: (st.res.fe_alloy || 0) - before, xp: m.skills.refine || 0 };
}
{
  const st0 = fresh();
  const m0 = solo(st0);
  ok("驻舱:无人驻精炼环 → stationSpeedMult = 1.4", Math.abs(Base.stationSpeedMult(st0, "smelt") - 1.4) < 1e-9,
    "=" + Base.stationSpeedMult(st0, "smelt"));
  setLv(m0, "refine", 10);
  station(st0, "smelt", m0);
  ok("驻舱:驻 Lv10 → stationSpeedMult < 0.55", Base.stationSpeedMult(st0, "smelt") < 0.9,
    "=" + Base.stationSpeedMult(st0, "smelt").toFixed(4));

  const idle = smeltRun({ occupy: true, lv: 1, sec: 60 });
  ok("冶炼:驻舱但队列产出一批后 xp 增长", idle.xp > 0, "xp=" + idle.xp.toFixed(1) + " 产出=" + idle.alloy);
  const lo = smeltRun({ occupy: true, lv: 1, sec: 60 }), hi = smeltRun({ occupy: true, lv: 10, sec: 60 });
  ok("冶炼:高技能驻舱 → 同时间产出更多", hi.alloy > lo.alloy,
    "Lv1=" + lo.alloy + " Lv10=" + hi.alloy + " (" + pct(hi.alloy, lo.alloy) + ")");
}
{
  const st = fresh();
  st.res.planet_lava = 100000; st.res.planet_gas = 100000; // 部件配方现需行星产物（1 代复合组合）
  const m = solo(st);
  station(st, "manufacture", m);
  const r = Prod.enqueue(st, "manufacture", Data.Recipes.COMPONENT[0].id, 20);
  ok("制造:入队成功", r.ok === true, r.err || "");
  const before = m.skills.manufacture || 0;
  Prod.processQueue(st, "manufacture", now + 120 * 1000, 1);
  ok("制造:批次产出后 xp 增长", (m.skills.manufacture || 0) > before, "xp " + before.toFixed(1) + " → " + (m.skills.manufacture || 0).toFixed(1));
  const s2 = fresh(); const w = solo(s2); station(s2, "manufacture", w); setLv(w, "manufacture", 10);
  ok("制造:技能缩短总装船坞耗时", Base.stationSpeedMult(s2, "manufacture") < 1 && Base.stationSpeedMult(s2, "manufacture") < Base.stationSpeedMult(fresh(), "manufacture"),
    "=" + Base.stationSpeedMult(s2, "manufacture").toFixed(3));
}
{
  // 科研：驻发明舱 + 研究完成涨经验；无人驻舱 → 研究变慢（×1.4）
  const st = fresh();
  const m = solo(st);
  const nodeId = (Data.Tech.all() || [])[0].id;
  const noOne = Tech.researchSpeedMult(st);
  ok("科研:发明舱无人 → 研究时长 ×1.4", Math.abs(noOne - 1.4) < 1e-9, "=" + noOne);
  setLv(m, "research", 10);
  station(st, "invent", m);
  ok("科研:驻 Lv10 → 研究时长显著缩短", Tech.researchSpeedMult(st) < 0.9, "=" + Tech.researchSpeedMult(st).toFixed(4));
  const x0 = m.skills.research;
  const r = Tech.start(st, nodeId, now);
  ok("科研:开始研究成功", r.ok === true, r.err || "");
  if (r.ok) {
    Tech.advance(st, now + 1000 * 3600 * 72);
    ok("科研:研究完成后 xp 增长", m.skills.research > x0, "xp " + x0.toFixed(1) + " → " + m.skills.research.toFixed(1));
  }
}

// ── 4b. 增强剂（反应实验室）：科研既管研究科技，也管制造增强剂 ──────────
// 用户 2026-11-03 定：两条路都涨同一项 research，不新增第 13 个技能键。
// 历史 bug：QUEUE_SKILL.booster 曾写成 "booster" —— 一个既不在 SKILL_KEYS、也不在 XP_RATE 的死键。
//   grantBatchXp 的白名单（!XP_RATE[key]）直接 return 0，于是驻舱者永远 Lv1：
//   耗时乘数恒定 1/1.02=0.9804（只抵掉无人惩罚，永远压不到 Lv10 的 0.8333），
//   且 app.js 的 STATION_SKILL 也没有 booster 条目 → 面板连「研究 Lv.x」都不显示。
// 本段同时锁「键表无死键」，防止同类问题在 equip/build 等新队列上复发。
{
  // ① 全部工业队列的驻舱技能键必须是真实存在的 12 项之一（死键会导致静默零经验）
  const dead = Object.keys(Base.QUEUE_SKILL).filter(q => !Settle.XP_RATE[Base.QUEUE_SKILL[q]]);
  ok("队列技能:所用键全在 XP_RATE 白名单（无死键）", dead.length === 0,
    "队列=" + Object.keys(Base.QUEUE_SKILL).map(q => q + "→" + Base.QUEUE_SKILL[q]).join(" "));
  ok("增强剂:驻反应实验室 = 科研（research）", Base.QUEUE_SKILL.booster === "research", "=" + Base.QUEUE_SKILL.booster);
  // ② 增强剂「经验茶」的乘区表也不能写死键：白名单里必须没有 booster，且必须有 research
  const eff0 = Booster.getEffectState(fresh());
  ok("增强剂:经验乘区表无 booster 死键、含 research",
    eff0.skillXpMultBySkill.booster === undefined && typeof eff0.skillXpMultBySkill.research === "number",
    "keys=" + Object.keys(eff0.skillXpMultBySkill).join(","));

  // ③ 真跑一批：驻舱者涨的是 research
  const st = fresh();
  const m = solo(st);
  const rec = Booster.recipes().find(x => !x.requiresBlueprint);
  ok("增强剂:存在免蓝图配方可测", !!rec, rec && rec.id);
  if (rec) {
    const cost = Booster.craftCost(st, rec.id) || {};
    for (const k of Object.keys(cost)) st.res[k] = 999999;
    const r0 = station(st, "booster", m);
    ok("增强剂:驻反应实验室派遣成功", r0.ok === true, r0.err || "");
    const rq = Prod.enqueue(st, "booster", rec.id, 2);
    ok("增强剂:入队成功", rq.ok === true, rq.err || "");
    const xRes = m.skills.research || 0, xMan = m.skills.manufacture || 0;
    Prod.processQueue(st, "booster", now + 3600 * 1000, 1);
    ok("增强剂:产出一批后 research 增长", (m.skills.research || 0) > xRes,
      "research " + xRes.toFixed(1) + " → " + (m.skills.research || 0).toFixed(1) + " 产出=" + JSON.stringify(Prod.queueStatus(st, "booster", now)));
    ok("增强剂:同一批**不**给 manufacture（不串技能）", (m.skills.manufacture || 0) === xMan,
      "manufacture=" + (m.skills.manufacture || 0).toFixed(1));
  }

  // ④ 科研等级真的加速反应实验室（与科研加速研究是同一乘区，玩家直觉一致）
  const s1 = fresh(); const m1 = solo(s1); station(s1, "booster", m1); setLv(m1, "research", 1);
  const s10 = fresh(); const m10 = solo(s10); station(s10, "booster", m10); setLv(m10, "research", 10);
  ok("增强剂:科研 Lv10 驻舱比 Lv1 更快",
    Base.stationSpeedMult(s10, "booster") < Base.stationSpeedMult(s1, "booster"),
    "Lv1=" + Base.stationSpeedMult(s1, "booster").toFixed(4) + " Lv10=" + Base.stationSpeedMult(s10, "booster").toFixed(4));
}

// ── 5. 后勤两项：物流补偿 + 电容管理 ──────────────────────────
function logisticsRun(lv, sec) {
  const st = fresh();
  const m = solo(st);
  if (lv) setLv(m, "logistics", lv);
  const l0 = m.skills.logistics || 0, c0 = m.skills.capacitor || 0;
  m.assignment = { type: "logistics", nodeId: st.base.nodeId, startedAt: now, eventRoll: 0 };
  m.status = "dispatched";
  tick(st, now, sec);
  return { st, m, comp: st.logistics.compensation || 0, xp: (m.skills.logistics || 0) - l0, capXp: (m.skills.capacitor || 0) - c0 };
}
{
  const r = logisticsRun(0, 30);
  ok("物流:物流岗 30s 后 xp 增长", r.xp > 0, "xp=" + r.xp.toFixed(1));
  ok("电容管理:物流岗顺带涨（副 0.5×）", r.capXp > 0 && r.capXp < r.xp, "cap=" + r.capXp.toFixed(1) + " log=" + r.xp.toFixed(1));  const lo = logisticsRun(1, 30), hi = logisticsRun(44, 30);
  ok("物流:技能提升 → 补偿累积更快", hi.comp > lo.comp * 1.05,
    "Lv1=" + lo.comp.toFixed(2) + " Lv10=" + hi.comp.toFixed(2) + " (" + pct(hi.comp, lo.comp) + ")");
}
{
  // 电容管理：驻能源舱 → 燃料再生更快
  const st = fresh();
  const m = solo(st);
  st.base.fuel = 0;
  const noOne = (function () { const s2 = fresh(); solo(s2); s2.base.fuel = 0; tick(s2, now, 10); return s2.base.fuel; })();
  setLv(m, "capacitor", 10);
  station(st, "energy", m);
  tick(st, now, 10);
  ok("电容管理:驻能源舱 Lv10 → 燃料再生更快", st.base.fuel > noOne * 1.05,
    "无人=" + noOne.toFixed(3) + " Lv10=" + st.base.fuel.toFixed(3));
}

// ── 6. 反向断言：锁住 2026-11-01 的三条口径 ────────────────────
{
  // ① 驻舱空转不涨
  const st = fresh();
  const m = solo(st);
  station(st, "smelt", m);
  const x0 = m.skills.refine || 0;
  tick(st, now, 60);
  ok("口径:驻精炼环但队列空转 60s → refine xp 为 0", (m.skills.refine || 0) === x0,
    "xp=" + (m.skills.refine || 0).toFixed(3));
}
{
  // ② 有产出但无人驻舱 → 没人涨
  const st = fresh();
  const m = solo(st);
  const before = m.skills.refine || 0;
  const r = Prod.enqueue(st, "smelt", "smelt_fe_alloy", 10);
  Prod.processQueue(st, "smelt", now + 600 * 1000, 1);
  ok("口径:队列有产出但无人驻舱 → 全员技能不变", r.ok && (m.skills.refine || 0) === before && (st.res.fe_alloy || 0) > 0,
    "产出=" + (st.res.fe_alloy || 0) + " refine " + before.toFixed(1) + " → " + (m.skills.refine || 0).toFixed(1));
}
{
  // ③ 演训舱：驻舱即涨（唯一纯时间通道）
  const st = fresh();
  const m = solo(st);
  const r = station(st, "habitat", m, "mining");
  ok("演训:派往演训舱成功", r.ok === true, r.err || "");
  const x0 = m.skills.mining || 0;
  tick(st, now, 60);
  // 期望值要含天赋/词条倍率，否则 major 天赋（1.5×）会被误判成 bug
  const expect = 1.4 * 60 * Settle.passionMult(m, "mining") * Settle.xpMultOf(m, "mining");
  ok("口径:驻演训舱 60s → 所选技能涨 ≈ 1.4×60×天赋", Math.abs((m.skills.mining - x0) - expect) < 2,
    "Δ=" + (m.skills.mining - x0).toFixed(2) + " 期望=" + expect.toFixed(2));
}
{
  // ④ 一舱一人：第二人被拒
  const st = fresh();
  const a = st.members[0], b = st.members[1];
  const r1 = station(st, "smelt", a);
  const r2 = station(st, "smelt", b);
  ok("口径:一舱一人，第二人派同一个精炼环被拒", r1.ok === true && r2.ok === false, r2.err || "");
  // ⑤ 演训舱必须选技能
  const r3 = station(st, "habitat", b, null);
  ok("口径:演训舱不选技能 → 拒绝", r3.ok === false, r3.err || "");
  // ⑥ 撤下后队列立刻变慢（运行时因子，不是入队烘死）
  const before = Base.stationSpeedMult(st, "smelt");
  Disp.recall(st, a.id);
  const after = Base.stationSpeedMult(st, "smelt");
  ok("口径:撤走驻舱者 → 该队列立刻回到 ×1.4", after > before && Math.abs(after - 1.4) < 1e-9,
    before.toFixed(3) + " → " + after.toFixed(3));
}
{
  // ⑦ 泊位：维修变快，但并发格数不变
  const st = fresh();
  const m = solo(st);
  const shipId = m.shipId;
  const base0 = Repair.repairDuration(shipId, null);
  setLv(m, "manufacture", 44);
  station(st, "dock", m);
  const fast = Repair.repairDuration(shipId, st);
  const bays0 = Repair.repairBays(fresh());
  ok("泊位:驻舱后修复时长缩短", fast < base0 * 0.9, base0.toFixed(0) + "s → " + fast.toFixed(0) + "s");
  ok("泊位:并发维修格数不受驻舱影响（归 bodyLevel）", Repair.repairBays(st) === bays0, "bays=" + Repair.repairBays(st));
}
{
  // ⑧ 指挥塔：全队命中/伤害上升，但不碰减伤
  const st = fresh();
  const n = raidNodeOf(st);
  const mkState = (withCmd) => {
    const s2 = fresh();
    const a = cMem("frigate", 20, 20, 20, 0, "t1_small_laser", n.id);
    a.id = "a1"; a.status = "dispatched";
    const b = cMem("frigate", 5, 5, 5, 0, "t1_small_laser", n.id);
    b.id = "b1"; b.status = "dispatched";
    s2.members = [a, b];
    if (withCmd) {
      const cmd = { id: "cmd", name: "指挥官", status: "stationed", destroyed: false, shipId: "frigate",
        skills: { combatLaser: St.xpAtLevel(30), combatTurret: St.xpAtLevel(30), missile: St.xpAtLevel(30), defense: St.xpAtLevel(0) },
        passion: {}, mods: { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 },
        hp: { shield: 1e9, armor: 1e9, structure: 1e9 }, fitted: { high: [], mid: [], low: [], rig: [] },
        assignment: { type: "station", slotId: "command", slotType: "command" } };
      s2.members.push(cmd);
    }
    return s2;
  };
  const pNo = Combat.prepareNode(mkState(false), n.id);
  const pYes = Combat.prepareNode(mkState(true), n.id);
  ok("指挥塔:全队伤害上升", pYes.weaponDps > pNo.weaponDps * 1.05,
    pNo.weaponDps.toFixed(2) + " → " + pYes.weaponDps.toFixed(2) + " (" + pct(pYes.weaponDps, pNo.weaponDps) + ")");
  ok("指挥塔:全队命中上升", pYes.weapons[0].hitChance > pNo.weapons[0].hitChance,
    (pNo.weapons[0].hitChance * 100).toFixed(2) + "% → " + (pYes.weapons[0].hitChance * 100).toFixed(2) + "%");
  ok("指挥塔:不碰减伤（减伤归 defense）", Math.abs(pYes.dmgReduction - pNo.dmgReduction) < 1e-9,
    pNo.dmgReduction.toFixed(3) + " vs " + pYes.dmgReduction.toFixed(3));
}

// ── 7. 旧存档迁移：scanning→gas / command→missile / invent→research ──
{
  const Store = sandbox.NSK.Core;   // store.js 是 flat 挂载：normalize 直接挂在 Core 上
  const st = fresh();
  const m = st.members[0];
  delete m.skills.gas; delete m.skills.missile; delete m.skills.research;
  m.skills.scanning = 500; m.skills.command = 300; m.skills.invent = 200;
  m.passion.scanning = "major";
  Store.normalize(st);
  const m1 = st.members[0];
  ok("迁移:scanning(500) → gas", m1.skills.gas === 500 && m1.skills.scanning === undefined, "gas=" + m1.skills.gas);
  ok("迁移:command(300) → missile", m1.skills.missile === 300 && m1.skills.command === undefined, "missile=" + m1.skills.missile);
  ok("迁移:invent(200) → research", m1.skills.research === 200 && m1.skills.invent === undefined, "research=" + m1.skills.research);
  ok("迁移:天赋档位跟着走（scanning major → gas）", m1.passion.gas === "major", m1.passion.gas);
  // 幂等：再跑一次不能把同一个 xp 再加一遍（存档越读越强是致命 bug）
  Store.normalize(st);
  ok("迁移:重复规范化不会重复累加（幂等）", st.members[0].skills.gas === 500, "gas=" + st.members[0].skills.gas);
}

console.log("\n======== RESULT: PASS=" + pass + " FAIL=" + fail + " ========");
process.exit(fail ? 1 : 0);
