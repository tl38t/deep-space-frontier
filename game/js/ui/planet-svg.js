// ================================================================
// 深空星疆 —— UI.Planet：行星天体的球面渲染（纯 SVG，零 canvas 运行时）
// ------------------------------------------------------------------
// 为什么不用 canvas 逐像素（1 代 _drawPlanetSphere 那套）：
//   · 逐像素要把 2R×2R 每个像素反解 UV 再采样，R=18 时 1296 px、R=26 时 2704 px，
//     每次进星系图/每次重建都要重算；纯 SVG 只有 ~10 个节点，浏览器合成层免费。
//   · 星系视图 renderView 是 1Hz 整块 innerHTML 重建（见 app.js），canvas 方案必须
//     在重建后重新绘制，而 SVG 只要相位由「绝对时钟」推出来，重建不打断自转。
//
// 结构（局部坐标，球心恒在 (0,0)，外层由调用方的 translate 定位）：
//   <g class="nsk-planet">
//     <g clip-path="url(#nskt_cp_<R>)">          ① 圆形裁剪
//       <g class="nsk-tilt"  rotate(θ)>          ② 自转轴倾角（静态，按 body.id 派生）
//         <g class="nsk-spin"  translate(-s,0)>  ③ 自转（每帧由 rAF 写，s ∈ [0, 4R]）
//           <use href="#nskt_tex_<type>"/> × 3   ④ 首尾相接的三张等距贴图
//         </g>
//       </g>
//     </g>
//     <g class="nsk-light" rotate(φ)>            ⑤ 光照（独立于自转轴，按 id 派生方位）
//       <circle r=R fill="url(#nskt_shade)"/>     暗角
//       <circle r=R fill="url(#nskt_high)"/>      高光
//     </g>
//     <circle class="nsk-rim" r=R/>               边缘高光线
//   </g>
//
// 两个几何要点（曾算错，别再犯）：
//   · 贴图高只需 2R。绕自身中心旋转的矩形恒盖住它的内切圆 —— 圆内点逆旋转后
//     |p'| = |p| ≤ R，永远落在半高 R 的矩形内。按 R(cosθ+sinθ) 加留白是错的
//     （那是矩形包围盒的角点，圆内没有角点），加了反而让极点露纯色块。
//   · 贴图宽必须 4R、且要三张。单张 4R 走完一圈后最右边界降到 3R−4R = −R，
//     盖不住右边的 +1.302R（tilt=22° 时的 x 上确界）；三张并集在 s∈[0,4R]
//     全程覆盖 [−9R, 7R]，足够。
//
// 贴图与渐变都放在一个常驻的隐藏 <svg id="nsk-planet-defs"> 里，
// 星系视图每次重建只输出几十字节的 <use href="#...">，不重复背 PNG 的 base64。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.UI = window.NSK.UI || {};
    window.NSK.UI.Planet = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.UI = root.NSK.UI || {};
    root.NSK.UI.Planet = mod;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const DEFS_ID = "nsk-planet-defs";

  // 与 data/resources.js 的 planetType 取值一一对应
  const TYPES = ["lava", "gas", "ice", "plasma", "temperate", "storm"];
  const FALLBACK_TYPE = "temperate";

  // 自转速度：单位是「每帧(60fps)相位增量」，与 1 代同量级 → 秒/圈 = 1/(v·speed·60)。
  // temperate 0.0010 ⇒ 约 16.7 秒一圈，慢到看得出球在转、又不会晃眼。
  const SPIN_RATE = { lava: 0.0009, gas: 0.0006, ice: 0.0012, plasma: 0.0005, temperate: 0.0010, storm: 0.0015 };

  const TEX_W = 512, TEX_H = 256;   // 只存一份（常驻 defs 里），不参与每帧重建，可以给足分辨率
  const TILT_MAX = 22;              // 自转轴在屏幕上的倾角上限（纯观感）；超过会让极点纹理拉花
  // 星环：暂时不画。环半径 2.2R，而当前行星 R=11~18（轨道间距只有 40），画出来会横穿相邻天体。
  // 要开就把环画在光照组之后、rim 之前，并先把门槛抬到 R≥22。

  /* ---------------- 确定性伪随机 ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function strHash(s) {
    s = String(s);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // 由 body.id 派生：同一颗行星每次进游戏倾角/光源/转速/初相位完全一致。
  // （1 代按「类型」缓存贴图，一局内同型星球长得一样；这里进一步把朝向也钉死，
  //   避免「同一颗星每次刷新换个姿势」这种既不真实又不可复现的表现。）
  function spinParams(seed) {
    const r = mulberry32(seed >>> 0);
    return {
      tilt: (r() * 2 - 1) * TILT_MAX,   // 自转轴倾角（屏幕平面内）
      light: r() * 360,                 // 光源方位，与倾角物理上无关系
      speed: 0.7 + r() * 0.6,           // 转速倍率
      phase: r(),                       // 初相位，避免一屏行星像贴纸一样同步
    };
  }

  /* ---------------- 贴图（一次性，按类型缓存） ---------------- */
  const _texUrl = {};

  function buildTexture(type) {
    if (_texUrl[type]) return _texUrl[type];
    if (typeof document === "undefined") return null;
    let c;
    try { c = document.createElement("canvas"); } catch (e) { return null; }
    if (!c || !c.getContext) return null;
    c.width = TEX_W; c.height = TEX_H;
    const ctx = c.getContext("2d");
    if (!ctx || !ctx.createLinearGradient) return null;

    const rnd = mulberry32(strHash("nsk_planet_tex_" + type));
    const w = TEX_W, h = TEX_H;

    const grads = {
      lava:      [[0, "#552200"], [0.5, "#993300"], [0.7, "#dd5500"], [1, "#772200"]],
      gas:       [[0, "#0f2a3a"], [0.3, "#1a4466"], [0.6, "#337799"], [0.8, "#4488bb"], [1, "#1a4466"]],
      ice:       [[0, "#2a5566"], [0.4, "#4488aa"], [0.7, "#99ccdd"], [1, "#4488aa"]],
      plasma:    [[0, "#331166"], [0.4, "#6622bb"], [0.7, "#9944ee"], [1, "#6622bb"]],
      temperate: [[0, "#0d3344"], [0.3, "#1a5577"], [0.6, "#2a77aa"], [0.8, "#4499cc"], [1, "#2a77aa"]],
      storm:     [[0, "#112233"], [0.3, "#223355"], [0.6, "#445577"], [0.8, "#556688"], [1, "#334466"]],
    };
    const stops = grads[type] || grads.lava;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i < stops.length; i++) grad.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

    if (type === "lava") {
      for (let i = 0; i < 14; i++) {
        const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 40;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(255," + (200 + rnd() * 55) + ",80," + (0.7 + rnd() * 0.3) + ")");
        g.addColorStop(0.6, "rgba(255," + (150 + rnd() * 50) + ",30," + (0.4 + rnd() * 0.3) + ")");
        g.addColorStop(1, "rgba(255,80,0,0)");
        ctx.fillStyle = g; ctx.beginPath();
        ctx.ellipse(x, y, r * (0.6 + rnd() * 0.8), r * (0.4 + rnd() * 0.6), rnd() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (type === "gas") {
      for (let i = 0; i < 8; i++) {
        const y = (0.05 + i * 0.12 + rnd() * 0.04) * h;
        ctx.fillStyle = "rgba(200,230,255," + (0.15 + rnd() * 0.25) + ")";
        ctx.fillRect(0, y - 4, w, 6 + rnd() * 10);
      }
      ctx.save(); ctx.shadowColor = "rgba(255,180,80,0.4)"; ctx.shadowBlur = 25;
      ctx.beginPath(); ctx.ellipse(w * 0.35, h * 0.52, 44, 28, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#dd7744"; ctx.fill();
      ctx.shadowBlur = 12; ctx.beginPath(); ctx.ellipse(w * 0.35, h * 0.52, 28, 16, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#ff9955"; ctx.fill();
      ctx.shadowBlur = 6; ctx.beginPath(); ctx.ellipse(w * 0.35, h * 0.52, 12, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#ffbb77"; ctx.fill(); ctx.restore();
      for (let i = 0; i < 20; i++) {
        const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 6;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, rnd() * 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255," + (0.04 + rnd() * 0.06) + ")"; ctx.fill();
      }
    }
    if (type === "ice") {
      for (let i = 0; i < 25; i++) {
        const x = rnd() * w, y = rnd() * h, len = 8 + rnd() * 35;
        ctx.strokeStyle = "rgba(60,90,110," + (0.25 + rnd() * 0.35) + ")";
        ctx.lineWidth = 1 + rnd() * 2; ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x + len * (rnd() - 0.5) * 2, y + len * (rnd() - 0.5) * 2); ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const x = rnd() * w, y = rnd() * h, r = 15 + rnd() * 45;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(255,255,255," + (0.08 + rnd() * 0.12) + ")");
        g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (type === "plasma") {
      const cols = ["#ff88ff", "#66aaff", "#aa44ff", "#44ccff"];
      for (let i = 0; i < 16; i++) {
        const x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 32;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const col = cols[Math.floor(rnd() * cols.length)];
        g.addColorStop(0, col + "aa"); g.addColorStop(0.5, col + "55"); g.addColorStop(1, "transparent");
        ctx.fillStyle = g; ctx.beginPath();
        ctx.ellipse(x, y, r * (0.5 + rnd() * 0.8), r * (0.3 + rnd() * 0.6), rnd() * 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (type === "temperate") {
      const landCols = ["#55bb44", "#66bb55", "#77cc66", "#99dd77", "#88cc66"];
      for (let i = 0; i < 12; i++) {
        const x = rnd() * w, y = rnd() * h, r = 12 + rnd() * 38;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const col = landCols[Math.floor(rnd() * landCols.length)];
        g.addColorStop(0, col + "aa"); g.addColorStop(0.7, col + "60"); g.addColorStop(1, "transparent");
        ctx.fillStyle = g; ctx.beginPath();
        ctx.ellipse(x, y, r * (0.5 + rnd() * 0.9), r * (0.4 + rnd() * 0.7), rnd() * 2, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 6; i++) {
        const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 55;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(255,255,255," + (0.08 + rnd() * 0.08) + ")");
        g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x, y, r * (0.5 + rnd() * 0.8), r * (0.3 + rnd() * 0.5), rnd() * 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (type === "storm") {
      for (let i = 0; i < 14; i++) {
        const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 30;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const bright = 130 + rnd() * 125;
        g.addColorStop(0, "rgba(" + bright + "," + (bright - 40) + ",255," + (0.4 + rnd() * 0.4) + ")");
        g.addColorStop(0.6, "rgba(" + (bright - 60) + "," + (bright - 100) + ",220," + (0.15 + rnd() * 0.25) + ")");
        g.addColorStop(1, "transparent"); ctx.fillStyle = g; ctx.beginPath();
        ctx.ellipse(x, y, r * (0.4 + rnd() * 0.8), r * (0.3 + rnd() * 0.6), rnd() * 2, 0, Math.PI * 2); ctx.fill();
      }
    }

    try { _texUrl[type] = c.toDataURL("image/png"); } catch (e) { return null; }
    return _texUrl[type];
  }

  /* ---------------- 常驻 defs ---------------- */
  let _defsSvg = null, _defsRoot = null;
  const _hasTex = {}, _hasCp = {};

  function ensureDefs() {
    if (_defsSvg && _defsSvg.parentNode) return _defsRoot;
    if (typeof document === "undefined" || !document.body || !document.createElementNS) return null;
    _defsSvg = document.getElementById(DEFS_ID);
    if (!_defsSvg) {
      _defsSvg = document.createElementNS(SVGNS, "svg");
      _defsSvg.setAttribute("id", DEFS_ID);
      _defsSvg.setAttribute("width", "0");
      _defsSvg.setAttribute("height", "0");
      _defsSvg.setAttribute("aria-hidden", "true");
      // 用绝对定位 + 0 尺寸而不是 display:none —— display:none 在部分内核上会让
      // <use> 引用的内容不参与渲染。
      _defsSvg.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none");
      document.body.appendChild(_defsSvg);
    }
    _defsRoot = _defsSvg.querySelector("defs");
    if (!_defsRoot) {
      _defsRoot = document.createElementNS(SVGNS, "defs");
      _defsSvg.appendChild(_defsRoot);
    }
    ensureShade();
    return _defsRoot;
  }

  // 光照两层渐变（objectBoundingBox，跟着引用它的圆走 → 旋转 g 即可换光源方位）
  function ensureShade() {
    if (document.getElementById("nskt_shade")) return;
    const mk = function (id, stops) {
      const g = document.createElementNS(SVGNS, "radialGradient");
      g.setAttribute("id", id);
      g.setAttribute("cx", stops.cx); g.setAttribute("cy", stops.cy); g.setAttribute("r", stops.r);
      for (let i = 0; i < stops.s.length; i++) {
        const st = document.createElementNS(SVGNS, "stop");
        st.setAttribute("offset", stops.s[i][0]);
        st.setAttribute("stop-color", stops.s[i][1]);
        st.setAttribute("stop-opacity", stops.s[i][2]);
        g.appendChild(st);
      }
      _defsRoot.appendChild(g);
    };
    // 暗角：亮核偏左上、向边缘压到 0.72 黑。canvas 版的内圆偏置无法用单个 SVG 径向
    // 渐变表达，用 cx/cy 前移 + r 略放大做等效近似（肉眼无差别）。
    mk("nskt_shade", { cx: "0.45", cy: "0.45", r: "0.55", s: [[0, "#000", "0"], [0.45, "#000", "0.06"], [0.78, "#000", "0.26"], [1, "#000", "0.72"]] });
    // 高光：圆心距球心 0.59R、半径 0.62R —— 旋转任意方位都整颗留在球内
    mk("nskt_high", { cx: "0.29", cy: "0.29", r: "0.31", s: [[0, "#fff", "0.40"], [0.3, "#fff", "0.14"], [1, "#fff", "0"]] });
  }

  function ensureTex(type) {
    if (_hasTex[type]) return true;
    const root = ensureDefs();
    if (!root) return false;
    const id = "nskt_tex_" + type;
    if (!document.getElementById(id)) {
      const url = buildTexture(type);
      if (!url) return false;
      const im = document.createElementNS(SVGNS, "image");
      im.setAttribute("id", id);
      im.setAttribute("x", "0");
      im.setAttribute("y", "0");
      im.setAttribute("width", String(TEX_W));
      im.setAttribute("height", String(TEX_H));
      im.setAttribute("preserveAspectRatio", "none");
      im.setAttribute("href", url);
      root.appendChild(im);
    }
    _hasTex[type] = true;
    return true;
  }

  function ensureClip(R) {
    const key = String(R);
    if (_hasCp[key]) return "nskt_cp_" + key;
    const root = ensureDefs();
    if (!root) return null;
    const id = "nskt_cp_" + key;
    if (!document.getElementById(id)) {
      const cp = document.createElementNS(SVGNS, "clipPath");
      cp.setAttribute("id", id);
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", "0"); c.setAttribute("cy", "0"); c.setAttribute("r", key);
      cp.appendChild(c);
      root.appendChild(cp);
    }
    _hasCp[key] = true;
    return id;
  }

  /* ---------------- 自转驱动 ---------------- */
  // 相位必须由「绝对时钟」算，不能靠 CSS/SMIL 动画：星系视图 1Hz 整块重建 innerHTML，
  // 动画会随节点销毁而从 0 重放 → 每秒抖一下；而 animation-delay 为负值也只能整体平移
  // 一个周期，解决不了「每秒重建」。
  const REDUCED = (typeof window !== "undefined" && window.matchMedia)
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  let _raf = 0, _idle = 0, _frames = 0;

  function tick(now, manual) {
    const list = document.getElementsByClassName("nsk-spin");
    if (!list.length) {
      if (++_idle < 90) { if (!manual) ensureLoop(); }   // 约 1.5 秒没有球体就停 rAF，别空转耗电
      return;
    }
    _idle = 0; _frames++;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      const w = +g.getAttribute("data-w");
      const sp = +g.getAttribute("data-sp");
      if (!w || !sp) continue;
      let ph = (+g.getAttribute("data-ph") || 0) + now / (sp * 1000);
      ph -= Math.floor(ph);
      g.setAttribute("transform", "translate(" + (-ph * w).toFixed(2) + ",0)");
    }
    if (!manual) ensureLoop();
  }

  function loop(ts) {
    _raf = 0;
    const now = (typeof ts === "number" && ts > 0) ? ts
      : ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());
    tick(now, false);
  }

  function ensureLoop() {
    if (_raf || REDUCED) return;
    if (typeof window === "undefined" || !window.requestAnimationFrame) return;
    _raf = window.requestAnimationFrame(loop);
  }

  /* ---------------- 对外：单颗行星的 SVG 片段 ---------------- */
  // 返回的 <g> 局部坐标以球心为原点，由调用方用 translate(x,y) 定位。
  function bodyHtml(body, opt) {
    if (!body) return "";
    opt = opt || {};
    const R = Math.max(4, Math.round(Number(body.size) || 12));
    const type = TYPES.indexOf(body.planetType) >= 0 ? body.planetType : FALLBACK_TYPE;
    const p = spinParams(strHash(String(body.id || type)));

    ensureDefs();
    ensureTex(type);
    const cp = ensureClip(R);
    if (!cp) return '<circle r="' + R + '" fill="#5fb8ff"/>';   // defs 建不起来时的兜底

    const texW = R * 4, texH = R * 2;
    const k = texW / TEX_W;          // 与 texH/TEX_H 相等（512:256 = 4R:2R）
    const xb = -R, xa = xb - texW, xc = xb + texW;
    const shift = p.phase * texW;
    const secPerTurn = 1 / (SPIN_RATE[type] * p.speed * 60);
    const use = function (x) {
      return '<use href="#nskt_tex_' + type + '" transform="translate(' + x.toFixed(2) + "," + (-R) +
        ") scale(" + k.toFixed(6) + ')"/>';
    };

    return '<g class="nsk-planet" data-r="' + R + '" data-type="' + type + '">'
      + '<g clip-path="url(#' + cp + ')">'
      +   '<g class="nsk-tilt" data-tilt="' + p.tilt.toFixed(1) + '" transform="rotate(' + p.tilt.toFixed(2) + ')">'
      +     '<g class="nsk-spin" data-w="' + texW + '" data-sp="' + secPerTurn.toFixed(4) +
              '" data-ph="' + p.phase.toFixed(4) + '" transform="translate(' + (-shift).toFixed(2) + ',0)">'
      +       use(xa) + use(xb) + use(xc)
      +     "</g>"
      +   "</g>"
      + "</g>"
      + '<g class="nsk-light" data-light="' + p.light.toFixed(1) + '" transform="rotate(' + p.light.toFixed(2) + ')">'
      +   '<circle r="' + R + '" fill="url(#nskt_shade)"/>'
      +   '<circle r="' + R + '" fill="url(#nskt_high)"/>'
      + "</g>"
      + '<circle class="nsk-rim" r="' + R + '" fill="none" stroke="rgba(180,220,255,0.11)" stroke-width="0.8"/>'
      + "</g>";
  }

  function start() { _idle = 0; ensureLoop(); }

  return {
    TYPES: TYPES,
    TILT_MAX: TILT_MAX,
    TEX_W: TEX_W,
    TEX_H: TEX_H,
    strHash: strHash,
    spinParams: spinParams,
    bodyHtml: bodyHtml,
    ensureDefs: ensureDefs,
    start: start,
    // 自测用：不依赖 rAF 也能推进相位（传入绝对时刻 ms）
    _tickAt: function (t) { tick(t, true); },
    _frames: function () { return _frames; },
    _texUrl: function (t) { return _texUrl[t] || null; },
  };
});
