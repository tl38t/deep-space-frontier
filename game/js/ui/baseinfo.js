// ================================================================
// 深空星疆 —— UI.BaseInfo：舱段明细弹窗（独立弹窗）
// 点击舰基页「非工业」舱段（核心 / 能源舱 / 仓储舱 / 指挥塔 / 居住舱 / 泊位 等）
// 后弹出，呈现原右侧常驻面板的内容（模块名、装配状态、描述、电力、特化、相邻增效、
// 模块编号、驻舱成员、拆卸 / 安装）。工业类舱段由 Workbench 承载并复用同一明细。
// 纯 UI 改动，明细 HTML 由 app.js 传入（detailHtml），交互按钮走全局 click 委托。
// 设计确认（2026-11-02）：右侧常驻面板拆除，明细并入弹窗，蓝图放大。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.UI = window.NSK.UI || {};
    window.NSK.UI.BaseInfo = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.UI = root.NSK.UI || {};
    root.NSK.UI.BaseInfo = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  let CTX = null;            // { getState, renderView, toast, detailHtml }
  let cur = null;            // { slotId, overlay }
  const OVERLAY_ID = "nsk-baseinfo-overlay";

  function ensureOverlay() {
    let ov = document.getElementById(OVERLAY_ID);
    if (!ov) {
      ov = document.createElement("div");
      ov.id = OVERLAY_ID;
      ov.className = "bi-overlay";
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
      document.body.appendChild(ov);
    }
    return ov;
  }

  function render() {
    if (!cur || !CTX) return;
    let detail = "";
    try { detail = (CTX.detailHtml && CTX.detailHtml()) || ""; } catch (e) { detail = ""; }
    cur.overlay.innerHTML =
      '<div class="bi-panel" role="dialog">'
      + '<div class="bi-head"><span class="eyebrow">COMPARTMENT DETAIL</span>'
      + '<button class="bi-close" data-act="baseinfo:close" aria-label="关闭">×</button></div>'
      + '<div class="bi-body base-focus-panel">' + detail + '</div>'
      + '</div>';
  }

  function open(slotId, detailHtml) {
    if (!CTX) return;
    const ov = ensureOverlay();
    cur = { slotId: slotId, overlay: ov };
    render();
    ov.classList.add("active");
  }

  function refresh() {
    if (cur && cur.overlay && cur.overlay.classList.contains("active")) render();
  }

  function close() {
    if (cur && cur.overlay) cur.overlay.classList.remove("active");
    cur = null;
  }

  function isOpen() { return !!(cur && cur.overlay && cur.overlay.classList.contains("active")); }

  function init(ctx) {
    CTX = ctx;
  }

  // open 自身守卫 CTX（未初始化时静默返回），无需单独的 noop 桩。
  return { init: init, open: open, close: close, refresh: refresh, isOpen: isOpen };
});
