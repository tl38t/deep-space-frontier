// ================================================================
// 深空星疆 —— Engine.Logistics：物流效率系统（§1.2，MVP 周三落地）
// 公式：最终效率 = clamp(100% − 20%×跳数 + 物流补偿, 0%, 100%)；补偿软顶 70pp。
// 物流补偿由「物流岗」成员在母舰持续累积（每名 /秒 产生补偿，软顶 70pp）。
// 远程派遣（采矿 mine / 行星开发 develop）的产出 × 物流效率（独立乘区）。
//
// ⚠️ 标定待定（D 决策）：HOP_PENALTY / COMP_CAP / COMP_RATE 为提议值，
//    用户最终标定后改这里即可，不动公式结构（与 settle.js 其他乘区一致）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Logistics = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Logistics = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Data = (typeof window !== "undefined" ? window.NSK.Data : null);

  // —— 标定常量（§1.2，D 决策：物流补偿量 待用户最终标定）——
  const HOP_PENALTY = 0.20;   // 每跳距离惩罚 -20%
  const COMP_CAP = 70;        // 物流补偿软顶 70pp（= +70% 效率上限）
  const COMP_RATE = 0.4;      // 每名物流岗成员 /秒 累积的补偿 pp（待定）

  function ensure(state) { if (!state.logistics) state.logistics = { compensation: 0 }; }

  // 母舰到作业节点的最短跳数（BFS，复用 StarMap.shortestHops）
  function hopsTo(state, nodeId) {
    if (!state.starMap || !Data || !Data.StarMap || !Data.StarMap.shortestHops) return 0;
    if (!nodeId) return 0;
    return Data.StarMap.shortestHops(state.starMap, state.base.nodeId, nodeId);
  }

  // 物流补偿累积：统计 logistics 岗成员，线性累积并软顶至 COMP_CAP。
  // 与燃料/产出同 dt，置于 settle 主循环前，保证当次结算即用最新补偿。
  function accumulate(state, dt) {
    ensure(state);
    let n = 0;
    for (const m of state.members) {
      if (!m.destroyed && m.assignment && m.assignment.type === "logistics") n++;
    }
    if (n > 0) state.logistics.compensation = Math.min(COMP_CAP, (state.logistics.compensation || 0) + COMP_RATE * n * dt);
  }

  // 距离惩罚：基础 HOP_PENALTY，受精通点「航线优化」按级下调（惰性取用 Mastery，最低 5pp）
  function hopPenaltyOf(state) {
    const M = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Mastery : null;
    if (M && M.hopPenalty) return M.hopPenalty(state);
    return HOP_PENALTY;
  }

  // 最终物流效率（独立乘区）：clamp(1 − penalty×hops + comp/100, 0, 1)
  function efficiency(hops, compensation) {
    return Math.max(0, Math.min(1, 1 - HOP_PENALTY * (hops || 0) + (compensation || 0) / 100));
  }

  // 给定作业节点，返回该作业受物流影响后的效率（含精通点强化后的距离惩罚）
  function jobEfficiency(state, nodeId) {
    ensure(state);
    const pen = hopPenaltyOf(state);
    return Math.max(0, Math.min(1, 1 - pen * hopsTo(state, nodeId) + (state.logistics.compensation || 0) / 100));
  }

  // 行星开发产出资源：由 planetType 映射 PLANET 资源 id（planet_lava…）
  function resourceForPlanetType(type) {
    if (!Data || !Data.Resources || !Data.Resources.PLANET) return null;
    const P = Data.Resources.PLANET;
    for (const k in P) { if (P[k].planetType === type) return k; }
    return null;
  }

  // 行星开发丰度（确定性，由 body id 哈希派生 0.8~1.4；不写回星图数据，兼容旧档）
  function planetRichness(body) {
    if (!body || !body.id) return 1;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < body.id.length; i++) { h ^= body.id.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = ((h >>> 0) % 1000) / 1000; // 0..1
    return 0.8 + r * 0.6;
  }

  return { ensure, accumulate, efficiency, hopsTo, jobEfficiency, hopPenaltyOf, resourceForPlanetType, planetRichness, HOP_PENALTY, COMP_CAP, COMP_RATE };
});
