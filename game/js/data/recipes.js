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
  // 精炼经验对回 1 代（2026-11-06）：1 代 SMELTING_RECIPES 每周期(=每批)发 recipe.baseXP，
  // XP = cycles × baseXP。本作每批 = 1 代 1 周期，故 xp 取 1 代 baseXP 真值（凡晶石10/灼烧30/水硼70/
  // 斜长140/干焦230/灰岩370/艾克诺580）；morph 与 px 同属 Lv4 深空要塞档 → 同 580。
  // ⚠️ 1 代另发 shipEngineering（工业舰工程）经验，本作 12 技能体系无对应键，依规不移植（只发 refine）。
  const SMELT = [
    { id: "smelt_fe_alloy",    in: { fe_ore: 1 }, out: "fe_alloy",    qty: 1, dur: 10,  bodyLevelReq: 0, xp: 10 },
    { id: "smelt_ni_alloy",    in: { ni_ore: 1 }, out: "ni_alloy",    qty: 1, dur: 20,  bodyLevelReq: 0, xp: 30 },
    { id: "smelt_bo_alloy",    in: { bo_ore: 1 }, out: "bo_alloy",    qty: 1, dur: 35,  bodyLevelReq: 0, xp: 70 },
    { id: "smelt_mx_alloy",    in: { mx_ore: 1 }, out: "mx_alloy",    qty: 1, dur: 60,  bodyLevelReq: 1, xp: 140 },
    { id: "smelt_no_alloy",    in: { no_ore: 1 }, out: "no_alloy",    qty: 1, dur: 90,  bodyLevelReq: 1, xp: 230 },
    { id: "smelt_zr_alloy",    in: { zr_ore: 1 }, out: "zr_alloy",    qty: 1, dur: 130, bodyLevelReq: 2, xp: 370 },
    { id: "smelt_px_alloy",    in: { px_ore: 1 }, out: "px_alloy",    qty: 1, dur: 190, bodyLevelReq: 3, xp: 580 },
    { id: "smelt_morph_alloy", in: { px_ore: 1 }, out: "morph_alloy", qty: 1, dur: 190, bodyLevelReq: 3, xp: 580 },
  ];

  // 制造部件：矿材 → 部件（dur 秒/批）
  // ⚠️ 2026-11-02 全量忠实复用 1 代 SHIP_COMPONENT_RECIPES 的 T1 档（每炉产 1 件，非此前误用的 3）：
  //   struct↔integrated_hull 63 / prop↔power_core 42 / weapon↔functional_system 18；
  //   1 代消耗为「三钛/类银/重金属/稀有气体」的复合组合，本作按资源映射填入
  //   fe_alloy/ni_alloy/planet_lava/planet_gas（planet_lava=重金属、planet_gas=稀有气体，
  //   由行星采集装置产出 —— 复用 1 代「部件须依赖行星产物」机制）。
  // ⚠️ xp = 每批完整制造经验（1 代移植真值口径）：dur × (0.50 + 0.06×(tier-1))，tier 由 dur 档位定
  //    （weapon/ammo=T1、prop=T2、struct=T3），与 equipment.js 已有的 1 代移植 xp 比例一致。
  // 2026-11-09 忠实移植 1 代 SHIP_COMPONENT_RECIPES 全 18 件（6 舰种 × 3 部件）：
  // integrated_hull/power_core/functional_system 为 frigate 级（无前缀），其余按 舰种_ 前缀。
  // 每炉产 1 件（qty:1，回 1 代原值）；dur/xp 取 1 代 SHIP_COMPONENT_RECIPES 真值。
  // 输入料名映射（1 代中文 → 本作 ASCII 键）：
  //   三钛合金→fe_alloy 类银超金属→ni_alloy 重金属→planet_lava 稀有气体→planet_gas 同位素→planet_ice
  //   等离子体→planet_plasma 磁场聚合物→planet_mag 类晶体胶矿→mx_alloy 同位聚合体→bo_alloy 超新星诺克石→no_alloy
  //   基腹断岩→zr_alloy 超噬矿→px_alloy 莫尔石→morph_alloy 铷→rb_moon 聚合气体→poly_gas 超纯聚合气体→ultra_pure_poly_gas
  const COMPONENT = [
    { id: "mk_integrated_hull",            name: "综合舰体组件",       in: { fe_alloy: 40, ni_alloy: 6, planet_lava: 7, planet_gas: 4 },                                  out: "integrated_hull",            qty: 1, dur: 63,  xp: 44 },
    { id: "mk_power_core",                 name: "动力控制核心",       in: { fe_alloy: 28, ni_alloy: 6, planet_gas: 5 },                                                    out: "power_core",                 qty: 1, dur: 42,  xp: 30 },
    { id: "mk_functional_system",          name: "舰船功能组件",       in: { fe_alloy: 14, ni_alloy: 1, planet_lava: 2 },                                                    out: "functional_system",          qty: 1, dur: 18,  xp: 12 },
    { id: "mk_destroyer_integrated_hull",  name: "驱逐舰综合舰体组件", in: { fe_alloy: 46, ni_alloy: 16, planet_lava: 6, planet_gas: 3 },                                     out: "destroyer_integrated_hull",  qty: 1, dur: 93,  xp: 76 },
    { id: "mk_destroyer_power_core",       name: "驱逐舰动力控制核心", in: { fe_alloy: 29, ni_alloy: 4, mx_alloy: 2, planet_lava: 3, planet_gas: 3 },                        out: "destroyer_power_core",       qty: 1, dur: 62,  xp: 50 },
    { id: "mk_destroyer_functional_system",name: "驱逐舰舰船功能组件", in: { fe_alloy: 14, ni_alloy: 4, planet_gas: 3 },                                                      out: "destroyer_functional_system",qty: 1, dur: 28,  xp: 22 },
    { id: "mk_cruiser_integrated_hull",    name: "巡洋舰综合舰体组件", in: { fe_alloy: 43, ni_alloy: 16, bo_alloy: 6, planet_ice: 6, planet_lava: 4 },                       out: "cruiser_integrated_hull",    qty: 1, dur: 137, xp: 140 },
    { id: "mk_cruiser_power_core",         name: "巡洋舰动力控制核心", in: { fe_alloy: 27, ni_alloy: 4, mx_alloy: 3, bo_alloy: 2, planet_lava: 4, planet_gas: 4 },           out: "cruiser_power_core",         qty: 1, dur: 93,  xp: 95 },
    { id: "mk_cruiser_functional_system",  name: "巡洋舰舰船功能组件", in: { fe_alloy: 15, ni_alloy: 3, bo_alloy: 1, planet_gas: 4 },                                         out: "cruiser_functional_system",  qty: 1, dur: 42,  xp: 40 },
    { id: "mk_battleship_integrated_hull", name: "战列舰综合舰体组件", in: { fe_alloy: 40, bo_alloy: 23, no_alloy: 20, planet_ice: 5, planet_lava: 6, planet_plasma: 10 },  out: "battleship_integrated_hull", qty: 1, dur: 195, xp: 215 },
    { id: "mk_battleship_power_core",      name: "战列舰动力控制核心", in: { fe_alloy: 28, bo_alloy: 12, no_alloy: 12, planet_lava: 6, planet_gas: 6, planet_plasma: 5 },   out: "battleship_power_core",      qty: 1, dur: 133, xp: 145 },
    { id: "mk_battleship_functional_system",name:"战列舰舰船功能组件", in: { fe_alloy: 10, bo_alloy: 5, no_alloy: 7, planet_gas: 6, planet_plasma: 2 },                     out: "battleship_functional_system",qty: 1, dur: 60, xp: 65 },
    { id: "mk_capital_integrated_hull",    name: "旗舰综合舰体组件",   in: { fe_alloy: 220, zr_alloy: 11, px_alloy: 7, rb_moon: 1, planet_mag: 6 },                         out: "capital_integrated_hull",    qty: 1, dur: 420, xp: 430 },
    { id: "mk_capital_power_core",         name: "旗舰动力控制核心",   in: { fe_alloy: 165, zr_alloy: 7, px_alloy: 5, rb_moon: 1, planet_plasma: 5, ultra_pure_poly_gas: 1 },out: "capital_power_core",         qty: 1, dur: 300, xp: 300 },
    { id: "mk_capital_functional_system",  name: "旗舰舰船功能组件",   in: { fe_alloy: 110, zr_alloy: 5, px_alloy: 4, rb_moon: 1, planet_mag: 4, poly_gas: 1 },             out: "capital_functional_system",  qty: 1, dur: 180, xp: 180 },
    { id: "mk_supercapital_integrated_hull",name:"超级旗舰综合舰体组件",in:{ fe_alloy: 340, zr_alloy: 17, px_alloy: 11, morph_alloy: 1, rb_moon: 3, planet_mag: 8 },        out: "supercapital_integrated_hull",qty:1, dur: 630, xp: 650 },
    { id: "mk_supercapital_power_core",    name: "超级旗舰动力控制核心",in:{ fe_alloy: 255, zr_alloy: 11, px_alloy: 9, morph_alloy: 1, rb_moon: 2, planet_plasma: 7, ultra_pure_poly_gas: 1 }, out:"supercapital_power_core",qty:1,dur:450,xp:460 },
    { id: "mk_supercapital_functional_system",name:"超级旗舰舰船功能组件",in:{ fe_alloy: 170, zr_alloy: 7, px_alloy: 6, morph_alloy: 1, rb_moon: 2, planet_mag: 6, poly_gas: 2 }, out:"supercapital_functional_system",qty:1,dur:270,xp:280 },
    // 弹药（2026-10-31）：与部件共用总装船坞槽位；每批 200 发，够 3 门武器打约 1 分钟；1 代无对应项，保留。
    { id: "mk_ammo_laser",   in: { mx_alloy: 2 }, out: "ammo_laser",   qty: 200, dur: 15, xp: 8, cat: "ammo" },
    { id: "mk_ammo_missile", in: { ni_alloy: 2 }, out: "ammo_missile", qty: 200, dur: 15, xp: 8, cat: "ammo" },
    { id: "mk_ammo_cannon",  in: { fe_alloy: 2 }, out: "ammo_cannon",  qty: 200, dur: 15, xp: 8, cat: "ammo" },
  ];

  // 发明：部件 + 矿材 → 改装图纸（bodyLevel>=2 开放）
  // xp:12 = 2026-11-08 定稿值：把 recipeBatchXp 原先的占位回退（XP_RATE.research 0.6 × 40s × 0.5）
  // 转成显式配方真值，手感不变；四路科研经验至此全部取显式 xp，回退分支命中 0 次。
  const INVENT = [
    { id: "inv_bp", in: { integrated_hull: 4, fe_alloy: 10 }, out: "bp", qty: 1, dur: 40, xp: 12 },
  ];

  // 按 id 查
  function find(type, id) {
    const tbl = type === "smelt" ? SMELT : type === "component" ? COMPONENT : type === "invent" ? INVENT : null;
    return tbl ? tbl.find(r => r.id === id) || null : null;
  }

  return { SMELT, COMPONENT, INVENT, find };
});
