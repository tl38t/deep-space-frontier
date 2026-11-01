// ================================================================
// 深空星疆 —— Engine.Tech：科技树研究（单线队列）
// ----------------------------------------------------------------
// 1 代研究系统的核心是「花时间」而不是「花点」。本作同样用真实时间推进，
// 离线期间继续研究（与生产队列一致），但因为一个节点只研究一次，
// 不存在 §14.5 那种「按 tick 累加货币」的红线问题。
//
// 状态（state.tech）：
//   { levels: { techId: 1 },
//     prog:   { techId: 0.42 },                  ← 取消研究后**保留下来的进度**（0~1，相对当前目标等级）
//     active: { id, targetLevel, base, startedAt, endsAt } | null }
//
// 为什么用绝对时间戳 endsAt 而不是剩余秒数递减：
//   离线结算时只需要比较 now >= endsAt，不需要按 dt 累计，精度不受 tick 粒度影响。
//
// 取消研究（cancel）：已花的星币**不退**，但把「已过时间占比」折进 prog[id] 保存下来；
// 下次对同一节点 start 时从 base=prog[id] 接着走，只需再熬剩下的 (1-base) 时长。
// 为什么存「比例」而不是「已熬秒数」：等级/时长改数值时比例仍然成立，秒数会失真。
//
// ⚠️ 存档不升 STATE_VERSION：state.tech 是 additive 字段，ensure() 补齐（同剧情系统做法）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Tech = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Tech = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function _Tech() {
    const D = (typeof window !== "undefined" && window.NSK) ? window.NSK.Data : null;
    return (D && D.Tech) ? D.Tech : null;
  }

  function ensure(state) {
    if (!state.tech || typeof state.tech !== "object") state.tech = { levels: {}, prog: {}, active: null };
    if (!state.tech.levels || typeof state.tech.levels !== "object") state.tech.levels = {};
    if (!state.tech.prog || typeof state.tech.prog !== "object") state.tech.prog = {};
    if (state.tech.active === undefined) state.tech.active = null;
    // 清洗：非法 id / NaN 等级
    for (const k in state.tech.levels) {
      const v = state.tech.levels[k];
      if (!isFinite(v) || v <= 0) delete state.tech.levels[k];
    }
    // 清洗：保留进度越界/垃圾值。
    // ⚠️ 只在「该节点已修满 maxLevel」时才删掉半截进度 —— 多级节点 Lv1 已完成、
    // Lv2 研究到一半后取消时 levels[k]=1 仍然存在，误删会丢掉玩家已熬的时间。
    const T0 = _Tech();
    for (const k in state.tech.prog) {
      const v = state.tech.prog[k];
      if (!isFinite(v) || v <= 0 || v >= 1) { delete state.tech.prog[k]; continue; }
      const nd = T0 ? T0.byId(k) : null;
      if (!nd) { delete state.tech.prog[k]; continue; }
      const maxLv = T0.maxLevelOf ? T0.maxLevelOf(nd) : 1;
      if ((state.tech.levels[k] || 0) >= maxLv) delete state.tech.prog[k];
    }
    const a = state.tech.active;
    if (a && (!a.id || !isFinite(a.endsAt))) state.tech.active = null;
    return state.tech;
  }

  // 已积累但尚未完成的研究进度（0~1）——取消研究后保留
  function savedProgressOf(state, id) {
    ensure(state);
    const v = state.tech.prog[id];
    return (isFinite(v) && v > 0 && v < 1) ? v : 0;
  }

  function levelOf(state, id) {
    ensure(state);
    return state.tech.levels[id] || 0;
  }

  // 单项是否已研究到顶（单级节点 = 研究过一级；多级节点 = 修满 maxLevel）
  function isDone(state, id) {
    const T = _Tech();
    const node = T ? T.byId(id) : null;
    if (!node) return false;
    return levelOf(state, id) >= (T.maxLevelOf ? T.maxLevelOf(node) : 1);
  }

  // 编制容量 = 基础 1 + Σ（每级的 squadCap 增量 × 当前等级）
  // 单级节点等价于「研究过就 +n」；多级节点每级 +n（1 代也是按级线性叠加）。
  function squadCapacity(state) {
    const T = _Tech();
    if (!T) return 1;
    ensure(state);
    let cap = T.BASE_SQUAD_CAP;
    for (const node of T.all()) {
      const lv = levelOf(state, node.id);
      if (lv < 1) continue;
      cap += ((node.bonus && node.bonus.squadCap) || 0) * lv;
    }
    return cap;
  }

  // 研究某项的可行性（不扣费，纯判定，供 UI 与 start 共用）
  function canStart(state, id) {
    const T = _Tech();
    if (!T) return { ok: false, err: "科技数据缺失" };
    const node = T.byId(id);
    if (!node) return { ok: false, err: "没有这项科技" };
    ensure(state);
    const maxLv = T.maxLevelOf ? T.maxLevelOf(node) : 1;
    if (levelOf(state, id) >= maxLv) return { ok: false, err: "已研究完成" };
    if (state.tech.active) {
      return { ok: false, err: "正在研究「" + ((T.byId(state.tech.active.id) || {}).name || state.tech.active.id) + "」" };
    }
    if (!T.prereqOk(node, key => levelOf(state, key))) {
      const miss = (node.requires || []).find(r => levelOf(state, r.id) < (r.level || 1));
      const mn = miss ? (T.byId(miss.id) || {}).name || miss.id : "前置";
      return { ok: false, err: "需先完成「" + mn + "」" };
    }
    const cost = (node.cost && node.cost.credits) || 0;
    if ((state.res.credits || 0) < cost) return { ok: false, err: "星币不足（需 " + cost + "）" };
    return { ok: true, node: node, cost: cost, targetLevel: levelOf(state, id) + 1 };
  }

  // 开始研究：扣星币（**全额，即使已保留进度也照收**），写 active
  // base = 之前取消时留下来的进度；本次只需要熬剩下的 (1-base) 时长。
  // 科研技能对研究时长的乘数（2026-11-01 技能体系）：由发明舱驻舱者的 research 等级决定。
  // 无人驻舱 → ×1.4，与生产队列的无人惩罚同一口径（用户定的规则 2）。
  function researchSpeedMult(state) {
    const E = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine : null;
    const B = E ? E.Base : null;
    if (!state || !B || !B.stationedOfType) return 1;
    const w = B.stationedOfType(state, "invent");
    if (!w) return B.UNMANNED_PENALTY || 1.4;
    return 1 / (1 + (B.memberSkillLv ? B.memberSkillLv(w, "research") : 1) * 0.02);
  }

  function start(state, id, now) {
    const v = canStart(state, id);
    if (!v.ok) return v;
    const t = isFinite(now) ? now : Date.now();
    const base = savedProgressOf(state, id);
    const full = v.node.sec || 0;
    state.res.credits -= v.cost;
    // 科研技能只作用于**本次剩余**时长；base 是比例，与技能无关，取消/续研都仍成立。
    const speed = researchSpeedMult(state);
    state.tech.active = {
      id: id,
      targetLevel: v.targetLevel,
      base: base,
      startedAt: t,
      endsAt: t + full * (1 - base) * 1000 * speed,
    };
    return {
      ok: true, node: v.node, base: base, speedMult: speed,
      endsAt: state.tech.active.endsAt, targetLevel: v.targetLevel,
    };
  }

  // 取消研究：**不退星币**，但把已熬的进度折成比例存进 prog[id]，下次接着来。
  // 为什么进度封顶 0.999：刚好压到 1 会让「重新开始 → 立刻完成」，等于白嫖一次判定。
  // id 可选：传了就校验「当前研究的确实是它」，防止 UI 上的陈旧按钮误取消别的项目。
  function cancel(state, now, id) {
    const T = _Tech();
    ensure(state);
    const a = state.tech.active;
    if (!a) return { ok: false, err: "当前没有进行中的研究" };
    const node = T ? T.byId(a.id) : null;
    if (id && a.id !== id) {
      return { ok: false, err: "正在研究的是「" + ((node && node.name) || a.id) + "」" };
    }
    const t = isFinite(now) ? now : Date.now();
    const reached = progress(state, t);          // 已含 base
    if (reached > 0) state.tech.prog[a.id] = Math.min(0.999, reached);
    state.tech.active = null;
    return { ok: true, node: node, id: a.id, progress: savedProgressOf(state, a.id) };
  }

  // 推进：完成返回完成的科技节点（settle 用来打日报），否则返回 null
  function advance(state, now) {
    const T = _Tech();
    ensure(state);
    const a = state.tech.active;
    if (!a || !T) return null;
    const node = T.byId(a.id);
    if (!node) { state.tech.active = null; return null; }
    const t = isFinite(now) ? now : Date.now();
    if (t < a.endsAt) return null;
    // 多级节点：+1 级（旧档没有 targetLevel 字段时按「当前级 + 1」推）
    const cur = state.tech.levels[a.id] || 0;
    const want = (isFinite(a.targetLevel) && a.targetLevel > cur) ? a.targetLevel : cur + 1;
    state.tech.levels[a.id] = want;
    if (state.tech.prog[a.id] !== undefined) delete state.tech.prog[a.id];  // 升级后进度归零
    state.tech.active = null;
    // 科研经验（2026-11-01）：研究**真的完成**才给，与「真正使用才涨」同口径。
    // 发给发明舱驻舱者；无人驻舱则没人涨。基数用节点标称 sec（不含技能因子，避免负反馈）。
    const E2 = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine : null;
    const B2 = E2 ? E2.Base : null, S2 = E2 ? E2.Settle : null;
    if (B2 && B2.stationedOfType && S2 && S2.grantBatchXp) {
      const w = B2.stationedOfType(state, "invent");
      if (w) S2.grantBatchXp(state, w, "research", node.sec || 0);
    }
    return { node: node, bonus: node.bonus || {}, level: want };
  }

  // UI 用：当前研究项的**总体**进度 0~1（含取消前保留的那部分；无研究返回 0）
  function progress(state, now) {
    ensure(state);
    const a = state.tech.active;
    if (!a) return 0;
    const base = (isFinite(a.base) && a.base > 0) ? a.base : 0;
    const total = Math.max(1, a.endsAt - a.startedAt);
    const t = isFinite(now) ? now : Date.now();
    const p = Math.max(0, Math.min(1, (t - a.startedAt) / total));
    return Math.min(1, base + (1 - base) * p);
  }

  const STATUS_CN = { completed: "已完成", active: "研究中", available: "可研究", locked: "前置未满足" };

  // 单项科技的完整视图（科技树方块 + 详情弹窗共用，避免两处各算一套状态）
  //   状态只有 4 种（本作单线队列，没有 1 代的 queued）：
  //   completed 已到顶 / active 正在研究 / available 可研究 / locked 前置未满足
  function nodeView(state, id, now) {
    const T = _Tech();
    ensure(state);
    if (!T) return null;
    const node = T.byId(id);
    if (!node) return null;
    const t = isFinite(now) ? now : Date.now();
    const maxLevel = T.maxLevelOf ? T.maxLevelOf(node) : 1;
    const level = levelOf(state, id);
    const isSingle = maxLevel === 1;
    const a = state.tech.active;
    const isActive = !!(a && a.id === id);
    const topLevel = level >= maxLevel;
    const verdict = topLevel ? { ok: false, err: "已研究完成" } : canStart(state, id);

    let status;
    if (topLevel) status = "completed";
    else if (isActive) status = "active";
    else if (T.prereqOk(node, k => levelOf(state, k))) status = "available";
    else status = "locked";

    const targetLevel = topLevel ? maxLevel : (isActive && isFinite(a.targetLevel) ? a.targetLevel : level + 1);

    // 等级 pip：已修 filled / 研究中 active / 未修 empty（与 1 代同一套语汇）
    const levelMarks = [];
    if (!isSingle) {
      for (let lv = 1; lv <= maxLevel; lv += 1) {
        if (lv <= level) levelMarks.push("filled");
        else if (isActive && lv === targetLevel) levelMarks.push("active");
        else levelMarks.push("empty");
      }
    }
    const effects = Array.isArray(node.effects) ? node.effects : [];
    const eff = effects.length ? String(effects[Math.min(Math.max(targetLevel, 1) - 1, effects.length - 1)]) : (node.desc || "");
    const saved = savedProgressOf(state, id);
    const fullSec = node.sec || 0;

    return {
      node: node,
      id: id,
      level: level,
      maxLevel: maxLevel,
      isSingle: isSingle,
      status: status,
      statusLabel: STATUS_CN[status] || status,
      targetLevel: targetLevel,
      levelMarks: levelMarks,
      shortEffect: eff,
      cost: (node.cost && node.cost.credits) || 0,
      sec: fullSec,
      // 取消研究留下来的进度（0~1）；active 时也保留这个值，便于文案区分「本次」与「已有」
      savedProgress: saved,
      // 这次开始研究实际要熬多久：已保留的部分不再重复付时间
      needSec: fullSec * (1 - saved),
      remainSec: isActive ? Math.max(0, Math.ceil((a.endsAt - t) / 1000)) : 0,
      progress: isActive ? progress(state, t) : saved,
      canStart: verdict.ok,
      reason: verdict.ok ? "" : verdict.err,
    };
  }

  // UI 用：整棵树（按数据顺序，坐标由 UI 算）
  function list(state, now) {
    const T = _Tech();
    if (!T) return [];
    const t = isFinite(now) ? now : Date.now();
    return T.all().map(node => nodeView(state, node.id, t)).filter(Boolean);
  }

  // 清空（设置页「删除存档」/ 探针用）
  function reset(state) {
    state.tech = { levels: {}, prog: {}, active: null };
    return state.tech;
  }

  return {
    ensure, levelOf, isDone, squadCapacity, canStart, start, cancel, advance,
    progress, savedProgressOf, nodeView, list, reset, STATUS_CN, researchSpeedMult,
  };
});
