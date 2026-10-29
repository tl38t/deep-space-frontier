// ================================================================
// 深空星疆 —— Core：确定性 RNG + 通用工具（无 DOM 依赖）
// 双环境 UMD：浏览器挂 window.NSK.Core；Node 可 require。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Core = window.NSK.Core || {};
    Object.assign(window.NSK.Core, mod);
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Core = Object.assign(root.NSK.Core || {}, mod);
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- 确定性 RNG（线性同余，存档内 seed 保证探针可复现） ----
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function rng() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  // 带范围的取整随机
  function rngInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
  function rngPick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  // ---- 通用工具 ----
  let _uid = 0;
  function uid(prefix) {
    _uid += 1;
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + _uid.toString(36);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round2(v) { return Math.round(v * 100) / 100; }

  // 数字千分位 / 大数缩写（双端通用）
  function fmtNum(v) {
    if (v === null || v === undefined || isNaN(v)) return "0";
    const n = Math.abs(v);
    if (n >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (n >= 1e4) return (v / 1e3).toFixed(1) + "K";
    return (Math.round(v * 100) / 100).toLocaleString("en-US");
  }
  // 时长 -> 人类可读（用于倒计时）
  function fmtDur(sec) {
    sec = Math.max(0, Math.floor(sec));
    if (sec < 60) return sec + "s";
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return m + "m" + (s ? s + "s" : "");
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 24) return h + "h" + (mm ? mm + "m" : "");
    const d = Math.floor(h / 24), hh = h % 24;
    return d + "d" + (hh ? hh + "h" : "");
  }

  return { makeRng, rngInt, rngPick, uid, clamp, round2, fmtNum, fmtDur };
});
