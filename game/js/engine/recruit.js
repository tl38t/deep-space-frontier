// ================================================================
// 深空星疆 —— Engine.Recruit：招募中心（候选市场）
// ----------------------------------------------------------------
// 机制对齐 EVE-IDLE 军团招募市场（用户 2026-10-25 拍板）：
//   · 每批 3 名候选人；
//   · 4 小时自然刷新（免费，并清零手动刷新次数）；
//   · 「换一批」消耗星币，每次翻倍（×1→×2→×4→×8→×16 封顶）；
//   · 招募候选「免费」（经济平衡待标定）；
//   · 刷新区广告位（ad 槽）走「观看广告免费换一批」占位流程。
// 候选 = Engine.State.makeMember 产出的完整成员对象，仅暂存于 state.recruit.candidates，
// 招募时整体移入 state.members（零额外拷贝，字段权威）。
// 无 DOM 依赖，Node 探针可 require（双环境 UMD 命名空间）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Recruit = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Recruit = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // —— 标定常量（数值待平衡，标「待标定」）——
  const REFRESH_MS = 4 * 3600 * 1000;   // 候选人自然刷新周期（4 小时）
  const BATCH = 3;                        // 每批候选人数
  const REROLL_BASE_CREDITS = 0;          // 临时：刷新消耗暂置 0（待标定后恢复 2000）
  const REROLL_MAX_MULT = 16;             // 翻倍封顶 ×16（1/2/4/8/16）
  const ROSTER_CAP = 20;                  // 名册上限（与 §13/§14 一致）

  function _Core() { return (typeof window !== "undefined" ? window.NSK.Core : null); }
  function _State() { return (typeof window !== "undefined" ? window.NSK.Engine.State : null); }

  // 候选生成专用 rng：由存档 rngSeed + 单调计数器派生，保证在线/离线一致且每次换批不重复序列。
  function genRng(state) {
    const c = (state.recruit.genCounter = (state.recruit.genCounter || 0) + 1);
    const seed = ((state.rngSeed >>> 0) ^ Math.imul(c >>> 0, 0x9E3779B1)) >>> 0;
    const core = _Core();
    return core ? core.makeRng(seed) : Math.random;
  }

  function generateBatch(state, Data, count) {
    const n = count || BATCH;
    const St = _State();
    if (!St || !St.makeMember) return [];
    const out = [];
    for (let i = 0; i < n; i++) {
      // makeMember 生成完整成员对象（id/技能/出身/词条/舰船/人生目的），仅暂存候选，不进名册
      out.push(St.makeMember(Data, genRng(state), state.base.nodeId));
    }
    return out;
  }

  // 旧档/新档补默认招募状态；若尚无候选则立即生成一批（避免玩家空等一个周期）。
  function ensureRecruitState(state, Data, now) {
    if (!state) return null;
    if (!state.recruit || typeof state.recruit !== "object") {
      state.recruit = { candidates: [], rerollCount: 0, nextFreeAt: now + REFRESH_MS, genCounter: 0, lastRefreshAt: now };
    }
    const R = state.recruit;
    if (!Array.isArray(R.candidates)) R.candidates = [];
    if (typeof R.rerollCount !== "number") R.rerollCount = 0;
    if (typeof R.nextFreeAt !== "number") R.nextFreeAt = now + REFRESH_MS;
    if (typeof R.genCounter !== "number") R.genCounter = 0;
    if (typeof R.lastRefreshAt !== "number") R.lastRefreshAt = now;
    if (R.candidates.length === 0) {
      R.candidates = generateBatch(state, Data, BATCH);
      R.lastRefreshAt = now;
    }
    return R;
  }

  // 手动换批费用：基础费 × 2^rerollCount，封顶 16×。
  function rerollCost(rerollCount) {
    const c = Math.max(0, Math.floor(rerollCount || 0));
    const mult = Math.min(Math.pow(2, c), REROLL_MAX_MULT);
    return Math.round(REROLL_BASE_CREDITS * mult);
  }

  // 4 小时自然刷新：到期则重摇一批 + 清零手动次数 + 重排计时器。
  function refreshDue(state, Data, now) {
    const R = ensureRecruitState(state, Data, now);
    if (now >= R.nextFreeAt) {
      R.candidates = generateBatch(state, Data, BATCH);
      R.rerollCount = 0;
      R.nextFreeAt = now + REFRESH_MS;
      R.lastRefreshAt = now;
      return true;
    }
    return false;
  }

  // 手动换一批：扣星币 → 重摇 → rerollCount++；opts.free（广告位）则免扣费但仍重摇。
  function reroll(state, Data, now, opts) {
    opts = opts || {};
    const R = ensureRecruitState(state, Data, now);
    if (!opts.free) {
      const cost = rerollCost(R.rerollCount);
      const have = (state.res && state.res.credits) || 0;
      if (have < cost) return { ok: false, reason: "insufficient", cost: cost };
      state.res.credits = have - cost;
    }
    R.candidates = generateBatch(state, Data, BATCH);
    if (!opts.free) R.rerollCount += 1;
    R.lastRefreshAt = now;
    return { ok: true, free: !!opts.free };
  }

  // 招募一名候选（免费，经济平衡待标定）：写入名册、移出候选。
  function recruit(state, candidateId) {
    const R = state.recruit;
    if (!R || !Array.isArray(R.candidates)) return { ok: false, reason: "no-recruit-state" };
    if (state.members.length >= ROSTER_CAP) return { ok: false, reason: "roster-full" };
    const idx = R.candidates.findIndex(c => c && c.id === candidateId);
    if (idx < 0) return { ok: false, reason: "candidate-not-found" };
    const m = R.candidates[idx];
    state.members.push(m);
    R.candidates.splice(idx, 1);
    state.counters = state.counters || {};
    state.counters.recruited = (state.counters.recruited || 0) + 1;
    return { ok: true, member: m };
  }

  // 供 UI 读取的快照（不修改 state）。
  function getState(state) {
    const R = state.recruit || {};
    const rerollCount = R.rerollCount || 0;
    const cost = rerollCost(rerollCount);
    const have = (state.res && state.res.credits) || 0;
    return {
      candidates: R.candidates || [],
      rerollCount: rerollCount,
      nextFreeAt: R.nextFreeAt || 0,
      cost: cost,
      mult: Math.min(Math.pow(2, rerollCount), REROLL_MAX_MULT),
      canAfford: have >= cost,
      rosterFull: state.members.length >= ROSTER_CAP,
      rosterCount: state.members.length,
      rosterCap: ROSTER_CAP,
    };
  }

  return {
    REFRESH_MS, BATCH, REROLL_BASE_CREDITS, REROLL_MAX_MULT, ROSTER_CAP,
    ensureRecruitState, refreshDue, reroll, recruit, rerollCost, getState, generateBatch,
  };
});
