// ================================================================
// 深空星疆 —— Data.Archaeology：残骸场考古数据（§13 扩展，§14 接舰船装配）
// 机制复刻 1 代（EVE-IDLE systems/archaeology.js）：成功率 = 扫描强度 − 难度 模型，
// 扫描强度 = 考古技能等级 + 舰船扫描×强化倍率 + 装配 archaeologyScan。
// 全部中文解耦（ISK→星币、LP→功勋、文物→改装图纸📐）。
//
// 遗址等级 I–V 与安等分档 band 1:1 对齐（见 starmap.SECLEVEL_TABLE.band）。
// 玩家在残骸场自选「焦点」（3 类），焦点决定收益倾向/难度修正/反噬烈度，与遗址等级正交。
// 反噬：失败按档位比例扣成员三防船体（shield→armor→structure），受稳定器减免、
//   非致命免伤可完全规避；扣空置 destroyed（见 Engine.Archaeology.cycle + settle 修复回路）。
// 数值均为提议值，待平衡标定。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Archaeology = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Archaeology = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 遗址档位标签（band 1–5 = 安等分档）
  const TIER_LABEL = {
    1: "遗址 I · 高安",
    2: "遗址 II · 边境",
    3: "遗址 III · 低安",
    4: "遗址 IV · 深空",
    5: "遗址 V · 零点",
  };

  // 每档 3 个风味名（通用名，无 EVE 商标）；bake 进残骸场 body.name。
  const SITE_NAMES = {
    1: ["漂流信标残骸", "远古殖民舱", "漂流货柜群"],
    2: ["破碎巡防站", "废弃采矿平台", "星图中继塔"],
    3: ["沉睡战列残骸", "湮灭实验室", "深空方尖碑"],
    4: ["湮灭旗舰坟场", "虚空研究所", "远古跃迁枢纽"],
    5: ["失落文明圣殿", "湮灭母舰核心", "深渊观测站"],
  };

  // 遗址难度（扫描强度 − 难度的阈值基准）。band 越高越难，需更高技能/装配。
  // successChance = clamp(0.50 + (scanStrength − difficulty) × 0.01, 0.05, 0.95)。
  const DIFFICULTY_BY_BAND = { 1: 25, 2: 55, 3: 90, 4: 130, 5: 175 };

  // 三大焦点（玩家自选）。
  // difficultyMod：相对遗址难度的修正（安全打捞更易、危险秘藏更难）。
  // 掉落按遗址 band 缩放（band 越高越肥）；hullDamageFrac：失败时扣船体占"满载三防之和"的比例，
  //   实际值再受稳定器（archaeologyStabilizer）减免，并被非致命免伤（archaeologyNonFatalAvoid）概率规避。
  const PROFILES = {
    salvage: {
      id: "salvage", name: "安全打捞", risk: 1,
      desc: "稳妥拆解残骸外壳，稳定产出星币，风险极低，失败仅轻微擦伤船体。",
      difficultyMod: -15,
      credits: (b) => Math.round(70 * b),
      bpChance: 0.0, bp: (b) => 1,
      repChance: 0.0, rep: (b) => 0,
      hullDamageFrac: (b) => 0.02 * b,   // band1 2% → band5 10%
    },
    research: {
      id: "research", name: "科研遗迹", risk: 2,
      desc: "解析远古装置，改装图纸掉落率高，中等风险，失败有实质船体损伤。",
      difficultyMod: 0,
      credits: (b) => Math.round(40 * b),
      bpChance: 0.50, bp: (b) => 1,
      repChance: 0.05, rep: (b) => Math.round(2 * b),
      hullDamageFrac: (b) => 0.03 * b,   // band1 3% → band5 15%
    },
    cache: {
      id: "cache", name: "危险秘藏", risk: 3,
      desc: "深入湮灭核心寻宝，星币与功勋丰厚，反噬最重，失败重创船体。",
      difficultyMod: 30,
      credits: (b) => Math.round(280 * b),
      bpChance: 0.15, bp: (b) => 2,
      repChance: 0.40, rep: (b) => Math.round(4 * b),
      hullDamageFrac: (b) => 0.04 * b,   // band1 4% → band5 20%
    },
  };

  const PROFILE_ORDER = ["salvage", "research", "cache"];

  function tierLabel(band) { return TIER_LABEL[band] || TIER_LABEL[1]; }
  function difficultyFor(band) { return DIFFICULTY_BY_BAND[band] || DIFFICULTY_BY_BAND[1]; }
  function profileById(id) { return PROFILES[id] || PROFILES.salvage; }

  // 遗址风味名（确定性：由传入的 rand() 选，调用方负责提供可复现随机源）
  function siteName(band, rand) {
    const arr = SITE_NAMES[band] || SITE_NAMES[1];
    const r = rand ? rand() : 0;
    return arr[Math.floor(r * arr.length) % arr.length];
  }

  return {
    TIER_LABEL, SITE_NAMES, DIFFICULTY_BY_BAND, PROFILES, PROFILE_ORDER,
    tierLabel, difficultyFor, profileById, siteName,
  };
});
