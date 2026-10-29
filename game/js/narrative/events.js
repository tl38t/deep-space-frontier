// ================================================================
// 深空星疆 —— Narrative.Events：活动事件库（Layer A 规则事件，零 API）
// ----------------------------------------------------------------
// schema（向后兼容旧字段）：
//   { id, activity, weight, title, lines:[],
//     deltas?: {resKey: ±n}, skillKey?, skill?: n,
//     options?: [ option ],                  // 有 options → 交由玩家选择（进 state.pendingEvents）
//     kind?: "chain", chainOnly?: bool, chain?: { next?: eventId } }
//   option:
//   { id?, label, require?: { trait?, skill?, min?, res?: {k, qty} }, note?,
//     chance?: 0..1, chanceBonus?: {traitId: +delta},
//     success?: payload, fail?: payload,      // 有 success/fail → 掷一次骰
//     dels?: payload }                        // 无 success/fail → 直接结算（payload = {deltas,skillKey,skill,lines,title}）
//
// 触发点（settle.js）：mine / explore / combat / refine / manufacture / invent / train / logistics。
// 无 options 的事件仍由 settle 直接 applyEvent；有 options / chain 的事件入 state.pendingEvents 等玩家决策。
//
// 2026-10-27 周六重写要点：
//   1. 每个 MVP 工作 ≥3 个事件；
//   2. 加 options 分支（含词条/技能门槛 + 成功率 + 成败不同结果）；
//   3. 加 kind:"chain" 三阶段短战斗任务链（chain_combat_1→2→3）；
//   4. 修复历史 bug：旧 applyEvent 只认 deltas，顶层 skillKey/skill 从未生效（事件只出文案不涨经验）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Narrative = window.NSK.Narrative || {};
    Object.assign(window.NSK.Narrative, mod);
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Narrative = Object.assign(root.NSK.Narrative || {}, mod);
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- 轻量工具（避免 narrative → engine 的加载期依赖）----
  function _Settle() {
    return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null;
  }
  function _Mastery() {
    return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Mastery : null;
  }
  function levelOf(xp) {
    const x = Number(xp) || 0;
    if (x <= 0) return 1;
    return 1 + Math.floor(Math.log(x / 1000 + 1) / Math.log(1.1));
  }

  const EVENTS = [
    // ================= 采集 mine =================
    { id: "mine_cache", activity: "mine", weight: 10, title: "矿脉伴生发现", lines: ["勘探仪在岩层夹缝里扫到富集矿囊。"], deltas: { fe_ore: 30, ni_ore: 20 } },
    { id: "mine_ups", activity: "mine", weight: 4, title: "手法精进", lines: ["反复作业让采矿动作愈发流畅。"], skillKey: "mining", skill: 60 },
    { id: "mine_gas_pocket", activity: "mine", weight: 3, title: "气囊夹层", lines: ["矿层深处封着一小袋稀有气体，被一并抽出。"], deltas: { he_gas: 12, crude_fullerene: 8 } },
    {
      id: "mine_rich_choice", activity: "mine", weight: 5, title: "富矿囊 · 取舍",
      lines: ["钻头前方是一处异常富集的矿囊，但顶板不稳，塌方风险肉眼可见。"],
      options: [
        { label: "冒险深挖（有塌方风险）", chance: 0.6, chanceBonus: { vein_guide: 0.2 },
          success: { deltas: { fe_ore: 120, ni_ore: 60 }, skillKey: "mining", skill: 80, title: "富矿囊 · 满载而归", lines: ["顶板撑住了，满载出矿。"] },
          fail: { skillKey: "mining", skill: 20, title: "富矿囊 · 塌方撤离", lines: ["碎石落下前撤出，只带回少量矿石。"] } },
        { label: "稳妥回收现有矿石（无风险）", dels: { deltas: { fe_ore: 40 }, skillKey: "mining", skill: 30, lines: ["按标准流程收走表层矿，稳妥但不惊艳。"] } },
        { label: "凭矿脉直觉直取（需「矿脉直觉」）", require: { trait: "vein_guide" },
          dels: { deltas: { fe_ore: 90, ni_ore: 40 }, skillKey: "mining", skill: 60, lines: ["顺着岩层纹路直取富集核，效率极高。"] } },
      ],
    },

    // ================= 探索 explore =================
    { id: "exp_relic", activity: "explore", weight: 8, title: "遗迹残片", lines: ["扫描到先驱文明的零散造物，或可交付势力。"], deltas: { credits: 500 }, skillKey: "archaeology", skill: 50 },
    { id: "exp_signal", activity: "explore", weight: 6, title: "异常信号", lines: ["截获一段加密广播，破译后是一笔星币转账。"], deltas: { credits: 800 }, skillKey: "scanning", skill: 40 },
    { id: "exp_quiet_scan", activity: "explore", weight: 3, title: "乏味航段", lines: ["连续数小时只有背景噪声，倒也积累了不少滤波器参数。"], skillKey: "scanning", skill: 30 },
    {
      id: "exp_derelict_choice", activity: "explore", weight: 5, title: "残骸场 · 进与退",
      lines: ["一艘断成两截的旧式运输舰漂在航道边，货舱似乎还有人封存过。"],
      options: [
        { label: "深入残骸搜索", chance: 0.55, chanceBonus: { deep_diver: 0.2 },
          success: { deltas: { bp: 1, credits: 300 }, skillKey: "archaeology", skill: 60, title: "残骸场 · 找到封存货柜", lines: ["切开舱壁，里面是一份完整图纸与少量货款。"] },
          fail: { skillKey: "scanning", skill: 20, title: "残骸场 · 空手而归", lines: ["舱室早被扫空，只留下锈蚀的支架。"] } },
        { label: "标记坐标后撤离（无风险）", dels: { deltas: { credits: 150 }, skillKey: "scanning", skill: 20, lines: ["把坐标上报给航道局，换了一笔情报费。"] } },
        { label: "老手拆解（需「遗迹嗅觉」）", require: { trait: "deep_diver" },
          dels: { deltas: { bp: 1 }, skillKey: "archaeology", skill: 80, lines: ["熟门熟路地拆走核心数据模块。"] } },
      ],
    },

    // ================= 战斗 combat =================
    { id: "com_win", activity: "combat", weight: 10, title: "巡逻交火", lines: ["小队清剿了一股走私武装，缴获战利品。"], deltas: { credits: 600, rep: 3 } },
    { id: "com_intel", activity: "combat", weight: 5, title: "俘获情报官", lines: ["审讯得到敌方部署，全员战术素养提升。"], skillKey: "command", skill: 50 },
    { id: "com_skirmish", activity: "combat", weight: 3, title: "零星骚扰", lines: ["海盗试探性打了几个照面就退走，正好练手。"], skillKey: "defense", skill: 40 },
    {
      id: "com_salvage_choice", activity: "combat", weight: 5, title: "战果 · 追与收",
      lines: ["残余敌舰拖着火光逃向碎石带，甲板上还留着未及带走的战利品。"],
      options: [
        { label: "追击残敌", chance: 0.6, chanceBonus: { vet_gunner: 0.15 },
          success: { deltas: { credits: 500, rep: 4 }, skillKey: "combatTurret", skill: 50, title: "战果 · 全歼", lines: ["追上并击毁残敌，缴获额外赏金。"] },
          fail: { skillKey: "defense", skill: 30, title: "战果 · 追之不及", lines: ["残敌跃迁逃脱，小队只带回少量战利品。"] } },
        { label: "回收残骸（无风险）", dels: { deltas: { credits: 250, struct: 2 }, skillKey: "manufacture", skill: 20, lines: ["拆回可用的结构与部件。"] } },
        { label: "联系黑市销赃（需「销赃能手」）", require: { trait: "black_broker" },
          dels: { deltas: { credits: 800 }, skillKey: "command", skill: 30, lines: ["黑市不问货源，价格给得很痛快。"] } },
      ],
    },
    {
      id: "com_ambush_choice", activity: "combat", weight: 4, title: "遭遇伏击",
      lines: ["航道两翼的陨石后突然亮起引擎尾焰——是个早就摆好的口袋。"],
      options: [
        { label: "正面强攻", chance: 0.65, chanceBonus: { iron_wall: 0.15 },
          success: { deltas: { credits: 700, rep: 5 }, skillKey: "combatLaser", skill: 50, title: "遭遇伏击 · 正面击穿", lines: ["顶着火力撕开缺口，反把伏击者围歼。"] },
          fail: { skillKey: "defense", skill: 30, title: "遭遇伏击 · 被迫脱离", lines: ["硬扛着撤出交战，没吃到战利品。"] } },
        { label: "绕后突袭（风险更高，收益更大）", chance: 0.5,
          success: { deltas: { credits: 1000, rep: 6 }, skillKey: "command", skill: 60, title: "遭遇伏击 · 反包围", lines: ["从陨石背面绕出，反把伏击者钉在航道上。"] },
          fail: { skillKey: "defense", skill: 20, title: "遭遇伏击 · 绕行失败", lines: ["绕行路线被预判，只能仓促脱离。"] } },
        { label: "谨慎脱离（无风险）", dels: { skillKey: "defense", skill: 40, lines: ["果断掉头脱离，保存战力。"] } },
      ],
    },
    // ---- 三阶段短战斗链（stage1 进随机池；2/3 仅由上一阶段成功后接续）----
    {
      id: "chain_combat_1", activity: "combat", weight: 3, title: "断链行动 · 一阶段：截获补给线",
      kind: "chain", chain: { next: "chain_combat_2" },
      lines: ["情报显示走私团在三个节点之间用固定航线补给。指挥层决定掐断这条链。"],
      options: [
        { label: "伏击运输队", chance: 0.6, chanceBonus: { vet_gunner: 0.1 },
          success: { deltas: { credits: 400, rep: 2 }, skillKey: "combatLaser", skill: 40, title: "断链行动 · 一阶段完成", lines: ["补给船被截停，货单指向下一处据点。"] },
          fail: { skillKey: "defense", skill: 30, title: "断链行动 · 一阶段失利", lines: ["运输队提前跃迁，线索中断，行动告吹。"] } },
        { label: "放弃行动", dels: { lines: ["指挥部撤销了这次行动。"] } },
      ],
    },
    {
      id: "chain_combat_2", activity: "combat", weight: 3, title: "断链行动 · 二阶段：突入据点",
      kind: "chain", chainOnly: true, chain: { next: "chain_combat_3" },
      lines: ["货单指向一处隐蔽据点。守军不多，但入口只有一个。"],
      options: [
        { label: "强攻入口", chance: 0.55,
          success: { deltas: { credits: 700, rep: 3 }, skillKey: "combatTurret", skill: 50, title: "断链行动 · 二阶段完成", lines: ["据点被攻破，守军溃散。"] },
          fail: { skillKey: "defense", skill: 40, title: "断链行动 · 二阶段受阻", lines: ["入口火力太密，小队被迫退出，行动中止。"] } },
        { label: "施放干扰后突入", chance: 0.7,
          success: { deltas: { credits: 600, rep: 3 }, skillKey: "command", skill: 50, title: "断链行动 · 二阶段完成", lines: ["干扰弹压下火控，小队贴墙突入。"] },
          fail: { skillKey: "defense", skill: 20, title: "断链行动 · 二阶段受阻", lines: ["干扰未生效，只能撤离。"] } },
      ],
    },
    {
      id: "chain_combat_3", activity: "combat", weight: 3, title: "断链行动 · 三阶段：斩首",
      kind: "chain", chainOnly: true, chain: { next: null },
      lines: ["据点深处是指挥舰的对接舱。走私团头目就在里面。"],
      options: [
        { label: "突入斩首", chance: 0.5, chanceBonus: { war_surgeon: 0.1 },
          success: { deltas: { credits: 2000, rep: 12, bp: 1 }, skillKey: "combatLaser", skill: 80, title: "断链行动 · 完成", lines: ["头目被击毙，整条走私链瓦解。指挥部发来嘉奖令。"] },
          fail: { deltas: { rep: 2 }, skillKey: "defense", skill: 40, title: "断链行动 · 功亏一篑", lines: ["头目从应急通道逃走，只留下一地残骸。"] } },
      ],
    },

    // ================= 冶炼 refine =================
    { id: "ref_eff", activity: "refine", weight: 6, title: "炉况优化", lines: ["熔炉温度曲线调平，精炼更顺。"], skillKey: "refine", skill: 50 },
    { id: "ref_slag", activity: "refine", weight: 4, title: "炉渣回收", lines: ["从炉渣里再筛出一批可用矿材。"], deltas: { fe_alloy: 5, credits: 100 } },
    {
      id: "ref_temp_choice", activity: "refine", weight: 5, title: "炉温 · 稳与险",
      lines: ["这一炉的温控余量还有空间，是拉满搏产量，还是按标准流程走？"],
      options: [
        { label: "提高炉温搏产量", chance: 0.65, chanceBonus: { forge_master: 0.2 },
          success: { deltas: { fe_alloy: 8 }, skillKey: "refine", skill: 60, title: "炉温 · 超产", lines: ["温度压在临界线上，多出了一批矿材。"] },
          fail: { skillKey: "refine", skill: 20, title: "炉温 · 结渣", lines: ["局部过热结渣，这一炉产量打了折扣。"] } },
        { label: "稳守标准流程（无风险）", dels: { deltas: { fe_alloy: 4 }, skillKey: "refine", skill: 30, lines: ["按标准曲线走完，产量稳定。"] } },
        { label: "宗师手法（需「冶炼宗师」）", require: { trait: "forge_master" },
          dels: { deltas: { fe_alloy: 12 }, skillKey: "refine", skill: 70, lines: ["凭手感微调风门，产量远超标准。"] } },
      ],
    },

    // ================= 制造 manufacture =================
    { id: "mfg_break", activity: "manufacture", weight: 5, title: "良品出炉", lines: ["一批部件公差极小，额外溢出。"], deltas: { struct: 3, prop: 2 } },
    { id: "mfg_skill", activity: "manufacture", weight: 5, title: "装配手感", lines: ["重复装配让手法更稳。"], skillKey: "manufacture", skill: 50 },
    {
      id: "mfg_rush_choice", activity: "manufacture", weight: 5, title: "产线 · 赶工与精工",
      lines: ["订单催得紧，产线可以赶工，也可以慢工出细活。"],
      options: [
        { label: "赶工交付", chance: 0.6,
          success: { deltas: { credits: 400, struct: 2 }, skillKey: "manufacture", skill: 50, title: "产线 · 赶工成功", lines: ["按期交付，客户很满意。"] },
          fail: { skillKey: "manufacture", skill: 20, title: "产线 · 返工", lines: ["公差超标被退回返工，白忙一场。"] } },
        { label: "精工细作（无风险）", dels: { deltas: { struct: 4 }, skillKey: "manufacture", skill: 30, lines: ["放慢节拍，成品质量扎实。"] } },
        { label: "能手装配（需「装配能手」）", require: { trait: "assembly_ace" },
          dels: { deltas: { struct: 6, prop: 3 }, skillKey: "manufacture", skill: 60, lines: ["闭眼装配，又快又准。"] } },
      ],
    },

    // ================= 发明 invent =================
    { id: "inv_insight", activity: "invent", weight: 6, title: "逆向顿悟", lines: ["拆解样机时捕捉到关键工艺节点。"], deltas: { bp: 1 } },
    { id: "inv_skill", activity: "invent", weight: 4, title: "图纸推演", lines: ["在草图上反复推演，思路逐渐清晰。"], skillKey: "invent", skill: 50 },
    {
      id: "inv_risk_choice", activity: "invent", weight: 5, title: "图纸 · 破译与复刻",
      lines: ["一份加密的先驱工艺档案摆在面前：强行破译可能拿到更多，也可能一无所获。"],
      options: [
        { label: "强行破译先驱协议", chance: 0.5, chanceBonus: { inventor_wind: 0.2 },
          success: { deltas: { bp: 2 }, skillKey: "invent", skill: 70, title: "图纸 · 破译成功", lines: ["协议被解开，附带两套完整图纸。"] },
          fail: { skillKey: "invent", skill: 20, title: "图纸 · 破译失败", lines: ["自毁程序触发，档案清空。"] } },
        { label: "稳妥复刻现有图纸（无风险）", dels: { deltas: { bp: 1 }, skillKey: "invent", skill: 25, lines: ["照着现有图纸复刻一份，稳妥推进。"] } },
      ],
    },

    // ================= 演训 train =================
    { id: "trn_drill", activity: "train", weight: 6, title: "例行演训", lines: ["按课表完成一轮战术演练。"], skillKey: "command", skill: 40 },
    { id: "trn_doc", activity: "train", weight: 4, title: "战术复盘", lines: ["复盘上一场交火，纠正了几处协同失误。"], skillKey: "command", skill: 50 },
    {
      id: "trn_spar_choice", activity: "train", weight: 5, title: "对练 · 全力与留手",
      lines: ["演训舱里空着，要不要来一场不带护具的对练？"],
      options: [
        { label: "全力对练", chance: 0.7,
          success: { skillKey: "combatLaser", skill: 60, lines: ["高强度对练，手感提升明显。"] },
          fail: { skillKey: "defense", skill: 40, title: "对练 · 吃了点亏", lines: ["被对手抓住破绽，倒是把防御练明白了。"] } },
        { label: "按标准课表练（无风险）", dels: { skillKey: "command", skill: 40, lines: ["标准课表走完，稳稳积累。"] } },
      ],
    },

    // 行星开发 develop 事件已随「设施化」退役（2026-10-27 方案 B）：行星产出走 Engine.Sites 采集装置，
    // 成员不再驻留行星 → dev_* 事件失去触发源，整段移除（设施玩法的事件后置）。

    // ================= 物流 logistics =================
    { id: "log_route", activity: "logistics", weight: 6, title: "航线优化", lines: ["重新规划了运输航线，周转更顺。"], skillKey: "command", skill: 40 },
    { id: "log_delay", activity: "logistics", weight: 4, title: "航道拥堵", lines: ["航道上排起了队，来回调度耗掉不少精力。"], skillKey: "command", skill: 30 },
    {
      id: "log_bottleneck_choice", activity: "logistics", weight: 4, title: "调度 · 绕行与等待",
      lines: ["主航道临时管制，货物要么绕远路，要么排队等放行。"],
      options: [
        { label: "绕行远航道", chance: 0.65,
          success: { deltas: { credits: 200 }, skillKey: "command", skill: 40, title: "调度 · 绕行顺利", lines: ["绕行路线通畅，按期送达。"] },
          fail: { skillKey: "command", skill: 20, title: "调度 · 绕行遇阻", lines: ["远航道也不好走，耽搁了半程。"] } },
        { label: "排队等放行（无风险）", dels: { deltas: { credits: 80 }, skillKey: "command", skill: 30, lines: ["老老实实排队，损失了一点时效。"] } },
      ],
    },
  ];

  const BY_ID = {};
  for (const e of EVENTS) BY_ID[e.id] = e;

  function findById(id) { return BY_ID[id] || null; }
  function byActivity(activity) { return EVENTS.filter(e => e.activity === activity); }
  // 每个活动的事件数（探针/后台自检用）
  function countsByActivity() {
    const out = {};
    for (const e of EVENTS) out[e.activity] = (out[e.activity] || 0) + 1;
    return out;
  }

  // 按 activity 抽取（确定性 rng；纯 weight，无安全度缩放）。
  // chainOnly 事件不进随机池（只由上一阶段成功接续）。
  function pick(activity, rng, state, member) {
    if (!rng) return null;
    const pool = EVENTS.filter(e => e.activity === activity && !e.chainOnly);
    if (!pool.length) return null;
    let total = 0; for (const e of pool) total += e.weight;
    let r = rng() * total;
    for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
    return pool[pool.length - 1];
  }

  // ---- 条件检查（词条 / 技能等级 / 库存）----
  function checkRequire(state, member, req) {
    if (!req) return { ok: true };
    if (req.trait) {
      const tid = member && member.trait ? member.trait.id : null;
      if (tid !== req.trait) return { ok: false, err: "需要词条「" + req.trait + "」" };
    }
    if (req.skill) {
      const mink = req.min == null ? 1 : req.min;
      const lv = member && member.skills ? levelOf(member.skills[req.skill]) : 0;
      if (lv < mink) return { ok: false, err: "需要技能等级 " + mink + "（当前 " + lv + "）" };
    }
    if (req.res) {
      const have = (state && state.res && state.res[req.res.k]) || 0;
      const need = req.res.qty || 1;
      if (have < need) return { ok: false, err: "库存不足：" + req.res.k + " " + Math.floor(have) + "/" + need };
    }
    return { ok: true };
  }

  // ---- 增量应用（资源 deltas + 技能经验；技能走 passion/词条/人生目的乘区）----
  function applyDeltas(state, deltas, member) {
    if (!deltas) return;
    for (const k in deltas) {
      const v = deltas[k];
      if (!state.res) state.res = {};
      state.res[k] = (state.res[k] || 0) + v;
      if (state.res[k] < 0) state.res[k] = 0; // 资源不出现负数
    }
  }
  function applySkill(member, key, amount) {
    if (!member || !key || !amount) return;
    const S = _Settle();
    let mult = 1;
    if (S && S.passionMult) mult = S.passionMult(member, key);
    if (S && S.xpMultOf) mult *= S.xpMultOf(member, key);
    if (!member.skills) member.skills = {};
    member.skills[key] = (member.skills[key] || 0) + amount * mult;
  }
  function applyPayload(state, payload, member) {
    if (!payload) return;
    applyDeltas(state, payload.deltas, member);
    if (payload.skillKey && payload.skill) applySkill(member, payload.skillKey, payload.skill);
  }

  function pushReport(state, title, lines) {
    if (!state || !Array.isArray(state.reports) || !title) return;
    state.reports.unshift({ ts: Date.now(), title: title, lines: lines || [] });
    if (state.reports.length > 30) state.reports.length = 30;
  }

  // 结算一个「无选项」事件（供 settle 调用；也兼容旧调用方）
  function applyEvent(state, ev, member) {
    if (!ev) return;
    applyDeltas(state, ev.deltas, member);
    if (ev.skillKey && ev.skill) applySkill(member, ev.skillKey, ev.skill);
    pushReport(state, ev.title, ev.lines || []);
  }

  // ---- 选项结算（玩家决策后调用）----
  // 返回 { ok, success?, next?, title, lines, err? }
  function resolveOption(state, ev, optIdx, memberId, rng) {
    if (!ev || !Array.isArray(ev.options)) return { ok: false, err: "事件无选项" };
    const opt = ev.options[optIdx];
    if (!opt) return { ok: false, err: "选项不存在" };
    const member = memberId ? (state.members || []).find(m => m.id === memberId) : null;
    if (memberId && !member) return { ok: false, err: "执行成员不在名册" };
    const rq = checkRequire(state, member, opt.require);
    if (!rq.ok) return { ok: false, err: rq.err };

    let payload, success = null, title = ev.title, lines = ev.lines || [];
    if (opt.success || opt.fail) {
      let chance = opt.chance == null ? 0.6 : opt.chance;
      if (opt.chanceBonus && member && member.trait && opt.chanceBonus[member.trait.id]) chance += opt.chanceBonus[member.trait.id];
      chance = Math.max(0.05, Math.min(0.97, chance));
      const roll = (typeof rng === "function" ? rng() : Math.random());
      success = roll < chance;
      payload = success ? opt.success : opt.fail;
      if (!payload) payload = {};
      title = payload.title || (success ? ev.title + " · 成功" : ev.title + " · 失败");
      lines = payload.lines || lines;
    } else {
      payload = opt.dels || opt;
      title = payload.title || ev.title;
      lines = payload.lines || lines;
    }
    applyPayload(state, payload, member);
    pushReport(state, title, lines);

    // 精通点：完成一次事件决策 +1（离散发点，非 tick）
    const M = _Mastery();
    if (M && M.award) M.award(state, 1, "event");

    const next = (ev.kind === "chain" && ev.chain && success) ? (ev.chain.next || null) : null;
    return { ok: true, success: success, next: next, title: title, lines: lines };
  }

  return {
    EVENTS, pick, applyEvent, resolveOption, applyDeltas, applySkill,
    checkRequire, findById, byActivity, countsByActivity,
  };
});
