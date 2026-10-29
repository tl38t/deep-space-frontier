// ================================================================
// 深空星疆 —— Engine.Booster：增强剂（整舱生效）
// MVP 周五落地（降级顺序第 4 条：先一舱一基础等级；保留整舱生效规则）。
//
// 设计要点（§1.5 衍生 / 周五计划）：
//  - 增强剂作用于「整个指定舱段类型」（整舱生效），而非单个模块实例。
//  - 基础等级（level）：当前 MVP 仅开放基础等级 1；每级 = 该舱段对应工业队列耗时 -10%（速度 ×1.10）。
//  - 持续时间（durationSec）：到期自动失效，不残留。
//  - 叠加规则（降级顺序第 4 条）：同一舱段类型同时只持有 1 个增强剂；
//      再次施加同类型 → 取 max(已有等级, 新等级) 并「刷新」到期时间（不叠加加算，避免 runaway）。
//      不同类型互相独立。
//  - 生效读取 O(1)，过期条目在 levelOf/list 时惰性清理，不踩 §14.5 红线（无 tick 累加、无逐秒循环）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Booster = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Booster = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const BOOST_PER_LEVEL = 0.10;   // 每级：队列耗时 -10%（速度 ×(1+0.10*level)）
  const MAX_LEVEL = 3;            // 单舱段增强剂等级上限（MVP 基础等级 1，预留扩展）
  const MIN_LEVEL = 1;

  function nowMs() { return (typeof Date !== "undefined" ? Date.now() : 0); }

  // 确保 state.base.boosters 存在（兜底，避免旧档缺字段）
  function ensure(state) {
    if (!state.base) state.base = {};
    if (!Array.isArray(state.base.boosters)) state.base.boosters = [];
    return state.base.boosters;
  }

  // 惰性清理过期条目（O(activeBoosters)，远小于 §14.5 风险阈值）
  function clean(state, now) {
    const t = now || nowMs();
    const arr = ensure(state);
    state.base.boosters = arr.filter(b => b.expiresAt > t);
  }

  // 施加 / 刷新增强剂。type = 舱段类型（smelt/manufacture/invent/...）。
  // 返回 {ok, level, expiresAt} 或 {ok:false, err}。
  function apply(state, type, level, durationSec) {
    if (!type) return { ok: false, err: "未指定舱段类型" };
    level = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level | 0 || MIN_LEVEL));
    if (!durationSec || durationSec <= 0) return { ok: false, err: "持续时间无效" };
    const t = nowMs();
    const arr = ensure(state);
    const existing = arr.find(b => b.type === type);
    if (existing) {
      // 同类型：取 max 等级 + 刷新到期时间（不叠加加算，遵守降级顺序第 4 条）
      existing.level = Math.max(existing.level, level);
      existing.expiresAt = t + durationSec * 1000;
    } else {
      arr.push({ type: type, level: level, expiresAt: t + durationSec * 1000 });
    }
    return { ok: true, level: level, expiresAt: t + durationSec * 1000 };
  }

  // 当前某舱段类型的生效等级（0 = 无 / 已过期）。顺带清理。
  function levelOf(state, type, now) {
    const t = now || nowMs();
    clean(state, t);
    const b = (state.base && state.base.boosters || []).find(x => x.type === type);
    return b ? b.level : 0;
  }

  // 该舱段类型对应的工业队列加速倍率（>=1）。production 在等效耗时中除以此值。
  function mult(state, type, now) {
    const lv = levelOf(state, type, now);
    return 1 + BOOST_PER_LEVEL * lv;
  }

  // UI 用：列出当前生效中的增强剂 + 剩余秒数
  function list(state, now) {
    const t = now || nowMs();
    clean(state, t);
    return (state.base && state.base.boosters || []).map(b => ({
      type: b.type, level: b.level, remaining: Math.max(0, Math.round((b.expiresAt - t) / 1000)),
    }));
  }

  return { apply, levelOf, mult, list, clean, BOOST_PER_LEVEL, MAX_LEVEL, MIN_LEVEL };
});
