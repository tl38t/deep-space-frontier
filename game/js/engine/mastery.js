// ================================================================
// 深空星疆 —— Engine.Mastery：军团精通点与全局强化（周六落地）
// ----------------------------------------------------------------
// 设计红线（§14.5）：精通点**只按离散完成事件发点**，绝不按 tick 累加。
//   发点源（全部是「完成一次」级别，次数天然受限）：
//     · 工业批次完成（精炼/制造/发明/总装）  +1 / 批
//     · 势力任务交付 / 派遣成功              +2 / 次
//     · 事件选项结算                        +1 / 次
//     · 人生目的达成                        +2 / 个
//     · 舰船总装完成                        +3 / 艘
//   离线 30 天 → 批次与事件都由 dt 封顶 + MAX_BATCHES/MAX_EVENTS 限流，点数不会爆炸。
//
// 3 个全局强化节点（每级 1/2/3 点，最高 3 级）：
//   · industry  工业调度：工业队列耗时 ×0.95^lv（−5%/级，乘区）
//   · combat    战术协同：作战声望/赏金 ×(1+0.08·lv)
//   · logistics 航线优化：每跳距离惩罚 −3pp/级（20% → 最低 5%）
// 无 DOM 依赖，Node 探针可 require。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Mastery = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Mastery = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_LEVEL = 3;
  const NODES = [
    { id: "industry", name: "工业调度", icon: "⚙", desc: "工业队列耗时每级 −5%", effect: "time", perLevel: 0.05, cost: [1, 2, 3] },
    { id: "combat", name: "战术协同", icon: "⚔", desc: "作战声望与赏金每级 +8%", effect: "yield", perLevel: 0.08, cost: [1, 2, 3] },
    { id: "logistics", name: "航线优化", icon: "🛰", desc: "每跳距离惩罚每级 −3pp", effect: "hop", perLevel: 0.03, cost: [1, 2, 3] },
  ];
  const NODE_BY_ID = {};
  for (const n of NODES) NODE_BY_ID[n.id] = n;

  function ensure(state) {
    if (!state) return null;
    if (!state.mastery || typeof state.mastery !== "object") {
      state.mastery = { points: 0, earned: 0, spent: 0, nodes: {} };
    }
    const M = state.mastery;
    if (typeof M.points !== "number" || !isFinite(M.points)) M.points = 0;
    if (typeof M.earned !== "number" || !isFinite(M.earned)) M.earned = 0;
    if (typeof M.spent !== "number" || !isFinite(M.spent)) M.spent = 0;
    if (!M.nodes || typeof M.nodes !== "object") M.nodes = {};
    for (const n of NODES) {
      const v = M.nodes[n.id];
      M.nodes[n.id] = (typeof v === "number" && isFinite(v)) ? Math.max(0, Math.min(MAX_LEVEL, Math.floor(v))) : 0;
    }
    return M;
  }

  // 发点（离散发点；reason 仅用于调试/日志，不进存档）
  function award(state, n, reason) {
    const M = ensure(state);
    if (!M) return 0;
    const add = Math.max(0, Math.floor(Number(n) || 0));
    if (!add) return M.points;
    M.points += add;
    M.earned += add;
    return M.points;
  }

  function levelOf(state, id) {
    const M = ensure(state);
    return (M && M.nodes && M.nodes[id]) || 0;
  }

  // 下一级花费（已满级返回 null）
  function nextCost(state, id) {
    const def = NODE_BY_ID[id];
    if (!def) return null;
    const lv = levelOf(state, id);
    if (lv >= MAX_LEVEL) return null;
    return def.cost[lv];
  }

  function canSpend(state, id) {
    const c = nextCost(state, id);
    if (c == null) return false;
    const M = ensure(state);
    return M.points >= c;
  }

  function spend(state, id) {
    const def = NODE_BY_ID[id];
    if (!def) return { ok: false, err: "强化节点不存在" };
    const c = nextCost(state, id);
    if (c == null) return { ok: false, err: "已满级" };
    const M = ensure(state);
    if (M.points < c) return { ok: false, err: "精通点不足（需 " + c + "）" };
    M.points -= c;
    M.spent += c;
    M.nodes[id] = levelOf(state, id) + 1;
    return { ok: true, id: id, level: M.nodes[id], cost: c };
  }

  // ---- 乘区（全部 O(1)，热路径可直接调用）----
  function industryTimeMult(state) {
    return Math.pow(1 - 0.05, levelOf(state, "industry"));
  }
  function combatYieldMult(state) {
    return 1 + 0.08 * levelOf(state, "combat");
  }
  // 距离惩罚（与 Logistics.HOP_PENALTY 同基准 0.20，最低 0.05）
  function hopPenalty(state) {
    return Math.max(0.05, 0.20 - 0.03 * levelOf(state, "logistics"));
  }

  function summary(state) {
    const M = ensure(state);
    return {
      points: M.points,
      earned: M.earned,
      spent: M.spent,
      nodes: NODES.map(n => {
        const lv = M.nodes[n.id] || 0;
        return {
          id: n.id, name: n.name, icon: n.icon, desc: n.desc, level: lv, max: MAX_LEVEL,
          nextCost: lv >= MAX_LEVEL ? null : n.cost[lv],
          canBuy: lv < MAX_LEVEL && M.points >= n.cost[lv],
          cur: n.effect === "time" ? (1 - Math.pow(0.95, lv)) : n.effect === "yield" ? 0.08 * lv : 0.03 * lv,
        };
      }),
    };
  }

  return {
    MAX_LEVEL, NODES, ensure, award, levelOf, nextCost, canSpend, spend,
    industryTimeMult, combatYieldMult, hopPenalty, summary,
  };
});
