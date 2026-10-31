// ================================================================
// 深空星疆 —— Data.Equipment：舰船装备定义（§14 舰船装配）
// 中文解耦（IP 铁律）：名/机制复刻 1 代（EVE-IDLE），但去除所有 EVE 裸名/商标。
// 1 代考古装备加成键（archaeologyScan / Stabilizer / Decoder / NonFatalAvoid / CycleReduction / CopyChance）
// 为通用语义键，本文件沿用，运行时只认键不认名。
// 资源键映射到深空星疆合金/气体/组件体系（fe_alloy=标准钛材, ni_alloy=银镍, bo_alloy=同位复材,
//   mx_alloy=类晶, no_alloy=重, px_alloy=奇点, morph_alloy=磁场聚合物, he/hy/poly_gas=气体）。
// 装备装配不限制舰种（深空星疆成员以单舰执行全部活动），故去掉 1 代 ARCHAEOLOGY_SHIP_TYPES 限制。
// Phase 1 仅含考古线装备；战斗/采矿/维修装备见 Phase 2。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Equipment = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Equipment = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // slot: high | mid | low | rig
  // level: 制造门禁等级（复用 1 代舰船制造等级档位：1/15/35/55/80）
  // cost: 深空星疆资源
  // bonuses: 通用加成键（考古线）
  const EQUIPMENT = {
    // —— 高槽：遗迹扫描仪（archaeologyScan，叠加进成功率扫描强度）——
    analyzer_t1: { id: "analyzer_t1", name: "遗迹扫描仪 I",   slot: "high", level: 1,  time: 20,  xp: 14,  cost: { fe_alloy: 40,  ni_alloy: 15 },                                   bonuses: { archaeologyScan: 5 },  cat: "archaeology" },
    analyzer_t2: { id: "analyzer_t2", name: "遗迹扫描仪 II",  slot: "high", level: 15, time: 40,  xp: 35,  cost: { fe_alloy: 160, ni_alloy: 60, mx_alloy: 15 },                            bonuses: { archaeologyScan: 8 },  cat: "archaeology" },
    analyzer_t3: { id: "analyzer_t3", name: "遗迹扫描仪 III", slot: "high", level: 35, time: 70,  xp: 60,  cost: { fe_alloy: 400, ni_alloy: 150, bo_alloy: 25, no_alloy: 12 },              bonuses: { archaeologyScan: 12 }, cat: "archaeology" },
    analyzer_t4: { id: "analyzer_t4", name: "遗迹扫描仪 IV",  slot: "high", level: 55, time: 120, xp: 110, cost: { fe_alloy: 900, px_alloy: 40, hy_gas: 20, morph_alloy: 5 },              bonuses: { archaeologyScan: 18, archaeologyCycleReduction: 0.05 }, cat: "archaeology" },
    analyzer_t5: { id: "analyzer_t5", name: "遗迹扫描仪 V",   slot: "high", level: 80, time: 200, xp: 180, cost: { fe_alloy: 2000, px_alloy: 15, morph_alloy: 10, poly_gas: 40 },           bonuses: { archaeologyScan: 25, archaeologyCycleReduction: 0.06 }, cat: "archaeology" },

    // —— 中槽：信号稳定器（archaeologyStabilizer 反噬减免；高阶附非致命免伤）——
    stabilizer_t1: { id: "stabilizer_t1", name: "信号稳定器 I",   slot: "mid", level: 1,  time: 20,  xp: 14,  cost: { fe_alloy: 40,  ni_alloy: 15 },                                   bonuses: { archaeologyStabilizer: 0.05 },                  cat: "archaeology" },
    stabilizer_t2: { id: "stabilizer_t2", name: "信号稳定器 II",  slot: "mid", level: 15, time: 40,  xp: 35,  cost: { fe_alloy: 160, ni_alloy: 60, mx_alloy: 15 },                            bonuses: { archaeologyStabilizer: 0.08 },                  cat: "archaeology" },
    stabilizer_t3: { id: "stabilizer_t3", name: "信号稳定器 III", slot: "mid", level: 35, time: 70,  xp: 60,  cost: { fe_alloy: 400, ni_alloy: 150, bo_alloy: 25, no_alloy: 12 },              bonuses: { archaeologyStabilizer: 0.11 },                  cat: "archaeology" },
    stabilizer_t4: { id: "stabilizer_t4", name: "信号稳定器 IV",  slot: "mid", level: 55, time: 120, xp: 110, cost: { fe_alloy: 900, px_alloy: 40, hy_gas: 20, morph_alloy: 5 },              bonuses: { archaeologyStabilizer: 0.14, archaeologyNonFatalAvoid: 0.05 }, cat: "archaeology" },
    stabilizer_t5: { id: "stabilizer_t5", name: "信号稳定器 V",   slot: "mid", level: 80, time: 200, xp: 180, cost: { fe_alloy: 2000, px_alloy: 15, morph_alloy: 10, poly_gas: 40 },           bonuses: { archaeologyStabilizer: 0.17, archaeologyNonFatalAvoid: 0.12 }, cat: "archaeology" },

    // —— 低槽：文物译码器（archaeologyDecoder 稀有掉率；高阶附货柜额外掉落）——
    decoder_t1: { id: "decoder_t1", name: "文物译码器 I",   slot: "low", level: 1,  time: 20,  xp:14,  cost: { fe_alloy: 40,  mx_alloy: 15 },                                   bonuses: { archaeologyDecoder: 0.10 },            cat: "archaeology" },
    decoder_t2: { id: "decoder_t2", name: "文物译码器 II",  slot: "low", level: 15, time: 40,  xp:35,  cost: { fe_alloy: 160, no_alloy: 8, mx_alloy: 50 },                            bonuses: { archaeologyDecoder: 0.14 },            cat: "archaeology" },
    decoder_t3: { id: "decoder_t3", name: "文物译码器 III", slot: "low", level: 35, time: 70,  xp:60,  cost: { fe_alloy: 400, mx_alloy: 105, he_gas: 8 },                             bonuses: { archaeologyDecoder: 0.18 },            cat: "archaeology" },
    decoder_t4: { id: "decoder_t4", name: "文物译码器 IV",  slot: "low", level: 55, time: 120, xp:110, cost: { fe_alloy: 900, mx_alloy: 200, hy_gas: 20, morph_alloy: 5 },              bonuses: { archaeologyDecoder: 0.22, archaeologyCopyChance: 0.04 }, cat: "archaeology" },
    decoder_t5: { id: "decoder_t5", name: "文物译码器 V",   slot: "low", level: 80, time: 200, xp:180, cost: { fe_alloy: 2000, mx_alloy: 500, morph_alloy: 12, poly_gas: 40 },           bonuses: { archaeologyDecoder: 0.26, archaeologyCopyChance: 0.07 }, cat: "archaeology" },
  };

  function byId(id) { return EQUIPMENT[id] || null; }
  function all() { return Object.values(EQUIPMENT); }
  function bySlot(slot) { return Object.values(EQUIPMENT).filter(e => e.slot === slot); }
  function byCategory(cat) { return Object.values(EQUIPMENT).filter(e => e.cat === cat); }

  // 加成键中文标签（UI 显示用）
  const BONUS_LABELS = {
    archaeologyScan: "扫描强度",
    archaeologyStabilizer: "失败反噬减免",
    archaeologyNonFatalAvoid: "非致命免伤",
    archaeologyDecoder: "稀有发现掉率加成",
    archaeologyCycleReduction: "考古周期缩短",
    archaeologyCopyChance: "货柜额外掉落",
  };

  return { EQUIPMENT, byId, all, bySlot, byCategory, BONUS_LABELS };
});
