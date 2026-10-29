// ================================================================
// 深空星疆 —— UI.Portraits：NPC 立绘「同 combo 多张 · 运行时随机抽一张」
// 零 DOM 依赖（仅用 fetch 读清单）；挂 window.NSK.UI.Portraits。
// 目录：game/assets/portraits/npc/<原型id>/<原型id>_<变体>[_义体][_第几张].webp
//   <变体> = v1..v4；V1 清凉版 = reveal；义体 = _eye / _limb / _eye_limb。
//   ⚠ 文件名始终带原型前缀（如 corp_heir_reveal.webp），图被拷出文件夹也能自证身份。
// 约定：
//   · 一个「combo」= 原型 id + 变体序号(V1-4) + 清凉/义体叠加，由 AssetPrompts.npcComboKey 标识（如 "corp_heir/reveal"）。
//   · 每个 combo 在其原型文件夹下可存多张（_2/_3…，第1张无后缀），见 asset-prompts.js。
//   · 清单 npc/manifest.json 记录「comboKey -> 该 combo 已存文件相对路径数组」，由可视化后台维护。
//   · 用法：启动期 await Portraits.loadManifest() 一次；之后对每名 NPC 调用一次 Portraits.pick(...)
//     并把返回值（相对 game/ 的路径或 null）缓存到 npc.portraitUrl —— 切勿每次渲染都调用，否则同一 NPC 会闪烁换脸。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.UI = window.NSK.UI || {};
    window.NSK.UI.Portraits = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.UI = root.NSK.UI || {};
    root.NSK.UI.Portraits = mod;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DIR = "assets/portraits/npc";
  const MANIFEST = DIR + "/manifest.json";

  let manifest = null;   // 已加载清单；null=尚未加载
  let loading = null;    // 进行中的加载 Promise（避免并发重复 fetch）

  function getAP() {
    if (typeof window !== "undefined" && window.NSK && window.NSK.Data && window.NSK.Data.AssetPrompts)
      return window.NSK.Data.AssetPrompts;
    if (typeof require !== "undefined") {
      try { return require("./asset-prompts.js"); } catch (_) { return null; }
    }
    return null;
  }

  // —— 异步加载清单（缓存，启动期调一次即可）——
  // 三条来源，按可靠性降级：① window.NSK_NPC_MANIFEST（后台同步落盘的 manifest.js 已先加载）
  // ② fetch manifest.json（http 部署常态）③ 动态注入 manifest.js（file:// 下 fetch 被禁，<script> 仍可读）
  function loadManifest() {
    if (manifest) return Promise.resolve(manifest);
    if (loading) return loading;
    loading = (async () => {
      if (typeof window !== "undefined" && window.NSK_NPC_MANIFEST) {
        return (manifest = window.NSK_NPC_MANIFEST);
      }
      try {
        const r = await fetch(MANIFEST, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j && typeof j === "object") return (manifest = j);
        }
      } catch (_) { /* file:// 下 fetch 会失败，走下面的 <script> 兜底 */ }
      const viaScript = await new Promise((res) => {
        if (typeof document === "undefined") return res(null);
        const s = document.createElement("script");
        s.src = DIR + "/manifest.js?_=" + Date.now();
        s.onload = () => res((typeof window !== "undefined" && window.NSK_NPC_MANIFEST) || null);
        s.onerror = () => res(null);
        document.head.appendChild(s);
      });
      return (manifest = viaScript || {});
    })();
    return loading;
  }

  // 强制重新加载（后台写入新图后可调，让运行时抽到新变体）
  function reload() { manifest = null; loading = null; return loadManifest(); }

  // —— 纯函数：从清单数组里随机抽一个（可注入 rng 便于测试），空则返回 null ——
  function pickFromList(list, rng) {
    if (!list || !list.length) return null;
    const r = (rng || Math.random)();
    const idx = Math.min(list.length - 1, Math.floor(r * list.length));
    return list[idx];
  }

  function comboKey(archId, variantIdx, opts) {
    const AP = getAP();
    return AP ? AP.npcComboKey(archId, variantIdx, opts)
              : (archId + "/v" + ((variantIdx | 0) + 1));
  }

  // 同步抽取：manifest 已加载则在其数组里随机；否则回退「第1张（无后缀）」路径（是否真存在由 <img> onerror 决定占位）。
  // rng 可注入（确定性测试 / 或传入 NPC 自身种子保证同一 NPC 稳定）。
  function pick(archId, variantIdx, opts, rng) {
    const key = comboKey(archId, variantIdx, opts);
    // 回退「第 1 张」路径：走 npcOutPath 才能带原型前缀（如 npc/corp_heir/corp_heir_reveal.webp）
    const AP = getAP();
    const fallback = AP ? AP.npcOutPath(archId, variantIdx, opts)
                        : (DIR + "/" + archId + "/" + archId + "_v" + ((variantIdx | 0) + 1) + ".webp");
    if (!manifest) return fallback;
    const chosen = pickFromList(manifest[key], rng);
    return chosen ? (DIR + "/" + chosen) : fallback;
  }

  // 同步取已加载清单（可能为 null，直到 loadManifest 完成）。供 UI 在「v1 缺失时回退到同原型任意已生成 combo」使用。
  function getManifest() { return manifest; }

  return {
    DIR, MANIFEST,
    loadManifest, reload, pickFromList, comboKey, pick, getManifest,
  };
});
