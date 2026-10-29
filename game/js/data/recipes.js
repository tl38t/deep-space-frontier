// ================================================================
// 深空星疆 —— Data.Recipes：精炼 / 制造 / 发明 配方
// 四级链：矿石(ore) →(smelt)→ 矿材(mineral) →(manufacture component)→ 部件(component)
//         →(manufacture ship)→ 整船 ；(mineral+component)→(invent)→ 改装图纸
// 精炼恒可（不受 bodyLevel 门禁），制造舰种受 bodyLevel（见 ships.js）。
// 矿种/矿材名复用 EVE-IDLE 解耦命名（fe_ore=铁硅原矿 … fe_alloy=标准钛材 …）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Recipes = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Recipes = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 精炼：矿 → 矿材（1:1，duration 秒/批；px_ore 额外产暗质晶核）
  const SMELT = [
    { id: "smelt_fe_alloy",    in: "fe_ore", out: "fe_alloy",    qty: 5, dur: 8 },
    { id: "smelt_ni_alloy",    in: "ni_ore", out: "ni_alloy",    qty: 5, dur: 8 },
    { id: "smelt_bo_alloy",    in: "bo_ore", out: "bo_alloy",    qty: 5, dur: 9 },
    { id: "smelt_mx_alloy",    in: "mx_ore", out: "mx_alloy",    qty: 5, dur: 9 },
    { id: "smelt_no_alloy",    in: "no_ore", out: "no_alloy",    qty: 5, dur: 10 },
    { id: "smelt_zr_alloy",    in: "zr_ore", out: "zr_alloy",    qty: 5, dur: 11 },
    { id: "smelt_px_alloy",    in: "px_ore", out: "px_alloy",    qty: 4, dur: 14 },
    { id: "smelt_morph_alloy", in: "px_ore", out: "morph_alloy", qty: 2, dur: 20 },
  ];

  // 制造部件：矿材 → 部件（dur 秒/批）
  const COMPONENT = [
    { id: "mk_struct", in: "fe_alloy", out: "struct", qty: 3, dur: 16 },
    { id: "mk_prop",   in: "ni_alloy", out: "prop",   qty: 3, dur: 18 },
    { id: "mk_weapon", in: "bo_alloy", out: "weapon", qty: 3, dur: 20 },
  ];

  // 发明：部件 + 矿材 → 改装图纸（bodyLevel>=2 开放）
  const INVENT = [
    { id: "inv_bp", in: { struct: 4, fe_alloy: 10 }, out: "bp", qty: 1, dur: 40 },
  ];

  // 按 id 查
  function find(type, id) {
    const tbl = type === "smelt" ? SMELT : type === "component" ? COMPONENT : type === "invent" ? INVENT : null;
    return tbl ? tbl.find(r => r.id === id) || null : null;
  }

  return { SMELT, COMPONENT, INVENT, find };
});
