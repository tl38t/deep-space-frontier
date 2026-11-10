// ================================================================
// 深空星疆 —— Engine.EnhancementChance：舰船强化成功率（② 2 代重做）
// 设计目标（与 1 代正本 lib/eveidle/systems/enhancement-chance.js 的「硬封顶」决裂）：
//   ① eng（成员 manufacture 技能等级）**永不封顶**——任意两个有限 eng（含 300 vs 500）必不相等；
//   ② 高强化等级仍是硬墙——成功率随 L 单调贴地板，eng 再高也 trivialize 不了；
//   ③ 失败照扣（每尝试都扣组件/星币/泰坦料），与 1 代标准 genre 一致。
//
// 公式演化（已在 ship_enhancement_demo.html 验证）：
//   · 1 代原式：skillBonus 硬封顶 0.30，gap>=50 时三处同时饱和 → eng80==eng100（用户否决）。
//   · 过渡：skillBonus 0.55·(1−e^(−gap/25)) 软饱和 → 仍有 0.55 渐近上限，eng>=~150 贴顶（用户否决 300==500）。
//   · 终版（本文件）：把「墙」交给 cap(L) 递减、而非 skillBonus 封顶；
//     用有理函数 g=gap/(gap+K)，K=30+15L 随 L 增大 → 低 L eng 快速饱和（易成）、
//     高 L eng 慢饱和（墙不被顶穿但 300 仍≠500 持续有用）。数学上 g 对任一有限 eng 严格递增，
//     且 g<1 恒成立，故任意两不同 eng 的 final 必不相等。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.EnhancementChance = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.EnhancementChance = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // 单次成功率。eng=成员 manufacture 等级；req=舰种需求刻度（护卫1…泰坦6）；L=当前强化等级。
  // 返回 [0,1] 比例。
  function chance(eng, req, L) {
    eng = Math.max(1, eng || 1);
    req = Math.max(1, req || 1);
    L = Math.max(0, Math.floor(L || 0));
    const gap = Math.max(0, eng - req);          // 溢出工程等级（可负→夹 0）
    const floor = 0.05;                          // 成功率地板（高 L 也至少 5%，避免 0 死锁）
    const cap = Math.max(0.12, 0.90 - 0.04 * L); // 高 L 硬墙：L0=0.90 … L20=0.12（线性递减）
    const K = 30 + 15 * L;                       // 饱和尺度随 L 增大：低 L 快饱和(易成)、高 L 慢饱和(墙牢不可破)
    const g = gap / (gap + K);                    // 有理函数：严格递增、g<1、任一有限 gap 必不相等
    return clamp(floor + (cap - floor) * g, floor, cap);
  }

  // 调试/探针用：返回中间量，便于断言「eng300≠eng500」「高 L 贴地板」。
  function breakdown(eng, req, L) {
    eng = Math.max(1, eng || 1);
    req = Math.max(1, req || 1);
    L = Math.max(0, Math.floor(L || 0));
    const gap = Math.max(0, eng - req);
    const floor = 0.05;
    const cap = Math.max(0.12, 0.90 - 0.04 * L);
    const K = 30 + 15 * L;
    const g = gap / (gap + K);
    return { chance: clamp(floor + (cap - floor) * g, floor, cap), gap: gap, floor: floor, cap: cap, K: K, g: g, L: L };
  }

  return { chance, breakdown };
});
