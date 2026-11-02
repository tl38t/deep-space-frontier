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

  // 精炼：矿 → 矿材（每批耗 1 矿、产 1 矿材；时长/门禁 复用 1 代 SMELTING_RECIPES 档位）
  // ⚠️ 1 代 SMELTING_RECIPES：每周期耗 1 矿石、产 1 矿材，dur 10/20/35/60/90/130/190，
  //    精炼等级门禁 1/10/20/40/55/70/85。本作精炼在舰基端跑（无指定成员），制造门禁轴统一为
  //    bodyLevel（舰基等级 0~3），故把 1 代「精炼技能档」语义落到 bodyLevel 轴：
  //    fe/ni/bo 恒可；mx/no→Lv2 星堡；zr→Lv3 星城；px/morph→Lv4 深空要塞。
  // in 必须是对象 { 矿: 每批耗量=1 }（与 1 代 consumeOre→qty:1 一致），qty=1（1 代 baseOutput=1，非曾误用的 5）。
  const SMELT = [
    { id: "smelt_fe_alloy",    in: { fe_ore: 1 }, out: "fe_alloy",    qty: 1, dur: 10,  bodyLevelReq: 0 },
    { id: "smelt_ni_alloy",    in: { ni_ore: 1 }, out: "ni_alloy",    qty: 1, dur: 20,  bodyLevelReq: 0 },
    { id: "smelt_bo_alloy",    in: { bo_ore: 1 }, out: "bo_alloy",    qty: 1, dur: 35,  bodyLevelReq: 0 },
    { id: "smelt_mx_alloy",    in: { mx_ore: 1 }, out: "mx_alloy",    qty: 1, dur: 60,  bodyLevelReq: 1 },
    { id: "smelt_no_alloy",    in: { no_ore: 1 }, out: "no_alloy",    qty: 1, dur: 90,  bodyLevelReq: 1 },
    { id: "smelt_zr_alloy",    in: { zr_ore: 1 }, out: "zr_alloy",    qty: 1, dur: 130, bodyLevelReq: 2 },
    { id: "smelt_px_alloy",    in: { px_ore: 1 }, out: "px_alloy",    qty: 1, dur: 190, bodyLevelReq: 3 },
    { id: "smelt_morph_alloy", in: { px_ore: 1 }, out: "morph_alloy", qty: 1, dur: 190, bodyLevelReq: 3 },
  ];

  // 制造部件：矿材 → 部件（dur 秒/批）
  // ⚠️ 2026-11-02 全量忠实复用 1 代 SHIP_COMPONENT_RECIPES 的 T1 档（每炉产 1 件，非此前误用的 3）：
  //   struct↔integrated_hull 63 / prop↔power_core 42 / weapon↔functional_system 18；
  //   1 代消耗为「三钛/类银/重金属/稀有气体」的复合组合，本作按资源映射填入
  //   fe_alloy/ni_alloy/planet_lava/planet_gas（planet_lava=重金属、planet_gas=稀有气体，
  //   由行星采集装置产出 —— 复用 1 代「部件须依赖行星产物」机制）。
  const COMPONENT = [
    { id: "mk_struct", in: { fe_alloy: 40, ni_alloy: 6, planet_lava: 7, planet_gas: 4 }, out: "struct", qty: 1, dur: 63 },
    { id: "mk_prop",   in: { fe_alloy: 28, ni_alloy: 6, planet_gas: 5 },                 out: "prop",   qty: 1, dur: 42 },
    { id: "mk_weapon", in: { fe_alloy: 14, ni_alloy: 1, planet_lava: 2 },                 out: "weapon", qty: 1, dur: 18 },
    // 弹药（2026-10-31）：与部件共用总装船坞槽位；每批 200 发，够 3 门武器打约 1 分钟；1 代无对应项，保留。
    { id: "mk_ammo_laser",   in: { mx_alloy: 2 }, out: "ammo_laser",   qty: 200, dur: 15, cat: "ammo" },
    { id: "mk_ammo_missile", in: { ni_alloy: 2 }, out: "ammo_missile", qty: 200, dur: 15, cat: "ammo" },
    { id: "mk_ammo_cannon",  in: { fe_alloy: 2 }, out: "ammo_cannon",  qty: 200, dur: 15, cat: "ammo" },
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
