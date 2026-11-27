// ================================================================
// 深空星疆 — Data.ArchaeologyContent：考古内容数据层（2026-11-27 S1）
// ----------------------------------------------------------------
// 真值来源：1 代 D:/EVE-IDLE/EVEIDLE-WORKBUDDY-FRESH/js/data/archaeology.js
//   · 40 文物（每档 8 件：3 普通星币 + 3 独特 + 1 功勋信标 + 1 校准基体）
//   · 9 探针（3 基础 + 3 势力 + 2 复原 + 1 深层先驱）
//   · 5 地点（foci / cargoWeights / rareRate / rareWeights / 蓝图池 / 凭证 / 补偿）
//   · 2 凭证 + 三焦点常规收益权重 + 五档基础率
// 本作映射：
//   · 材料键走 display-names.js 冻结映射（超噬矿=px_alloy、类晶体胶矿=mx_alloy、铷=rb_moon）
//   · 探针经济成本 ISK ÷46 → 本作 credits（提议换算，与货柜战利品同锚点）；文物价值与地点补偿按 1 代原值搬
//   · 内部键全 ASCII；文物显示名是通用中文，不触发 IP 铁律
// ⚠️ 所有数值均为 1 代逐值，cost/sec 类提议值只在无真值处出现
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.ArchaeologyContent = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.ArchaeologyContent = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ISK→星币锚点（与 cargo-bridge 的 ISK_TO_CREDITS 同式，1 代最低档部署费 138000 ISK ↔ 3000 credits）
  const ISK_TO_CREDITS = 1 / 46;
  const isk = (n) => Math.max(1, Math.round(n * ISK_TO_CREDITS));

  // ---- 五档基础率（1 代 ARCHAEOLOGY_TIERS，1:1 对应本作 band 1-5）----
  const TIERS = Object.freeze({
    I:   { tier:"I",   band:1, level:1,  commonISK:[600,900,1200],       uniqueISK:[3000,4500,6000],       lpValue:50,   calibrationRate:0.020,  calibrationAmount:1, uniqueRate:0.010, lpBase:0.0005 },
    II:  { tier:"II",  band:2, level:15, commonISK:[1800,2700,3600],     uniqueISK:[9000,13500,18000],     lpValue:150,  calibrationRate:0.015,  calibrationAmount:1, uniqueRate:0.008, lpBase:0.0007 },
    III: { tier:"III", band:3, level:35, commonISK:[4500,6750,9000],     uniqueISK:[22500,33750,45000],    lpValue:400,  calibrationRate:0.010,  calibrationAmount:2, uniqueRate:0.006, lpBase:0.0010 },
    IV:  { tier:"IV",  band:4, level:55, commonISK:[9000,13500,18000],   uniqueISK:[45000,67500,90000],    lpValue:1000, calibrationRate:0.0075, calibrationAmount:2, uniqueRate:0.004, lpBase:0.0015 },
    V:   { tier:"V",   band:5, level:80, commonISK:[18000,27000,36000],  uniqueISK:[90000,135000,180000],  lpValue:2500, calibrationRate:0.005,  calibrationAmount:3, uniqueRate:0.002, lpBase:0.0020 },
  });
  const TIER_BY_BAND = Object.freeze({ 1:"I", 2:"II", 3:"III", 4:"IV", 5:"V" });

  // ---- 三类 profile（1 代 SITE_PROFILES 逐值）----
  // 本作焦点 salvage/research/cache ⇔ 1 代 salvage/research/treasure
  const PROFILES = Object.freeze({
    salvage:  { type:"salvage",  label:"安全打捞", backlashMultiplier:0.70, commonWeights:[0.45,0.35,0.20], calibrationMultiplier:0.5, uniqueMultiplier:0.5, lpMultiplier:0.5 },
    research: { type:"research", label:"科研遗迹", backlashMultiplier:1.00, commonWeights:[0.60,0.30,0.10], calibrationMultiplier:2.0, uniqueMultiplier:1.0, lpMultiplier:1.0 },
    cache:    { type:"treasure", label:"危险秘藏", backlashMultiplier:1.40, commonWeights:[0.70,0.20,0.10], calibrationMultiplier:0.5, uniqueMultiplier:2.0, lpMultiplier:2.0 },
  });

  // ---- 40 文物（逐值照搬，1 代 ARCHAEOLOGY_ARTIFACTS）----
  const ARTIFACTS = Object.freeze([
    { id:"art_i_common_a", name:"锈蚀数据核心", tier:"I", category:"common_isk", iskValue:600 },
    { id:"art_i_common_b", name:"远古合金板",   tier:"I", category:"common_isk", iskValue:900 },
    { id:"art_i_common_c", name:"残缺导航矩阵", tier:"I", category:"common_isk", iskValue:1200 },
    { id:"art_i_unique_a", name:"信标碎片",     tier:"I", category:"unique", iskValue:3000 },
    { id:"art_i_unique_b", name:"殖民徽记",     tier:"I", category:"unique", iskValue:4500 },
    { id:"art_i_unique_c", name:"货柜残片",     tier:"I", category:"unique", iskValue:6000 },
    { id:"art_i_lp",       name:"远古文明信标", tier:"I", category:"lp", lpValue:50 },
    { id:"art_i_calib",    name:"校准基体 I 型", tier:"I", category:"calibration" },
    { id:"art_ii_common_a", name:"巡防站黑匣",   tier:"II", category:"common_isk", iskValue:1800 },
    { id:"art_ii_common_b", name:"精炼同位素",   tier:"II", category:"common_isk", iskValue:2700 },
    { id:"art_ii_common_c", name:"平台主控核",   tier:"II", category:"common_isk", iskValue:3600 },
    { id:"art_ii_unique_a", name:"巡防站徽记",   tier:"II", category:"unique", iskValue:9000 },
    { id:"art_ii_unique_b", name:"采掘图谱",     tier:"II", category:"unique", iskValue:13500 },
    { id:"art_ii_unique_c", name:"中继塔核心",   tier:"II", category:"unique", iskValue:18000 },
    { id:"art_ii_lp",       name:"远古文明信标 II", tier:"II", category:"lp", lpValue:150 },
    { id:"art_ii_calib",    name:"校准基体 II 型", tier:"II", category:"calibration" },
    { id:"art_iii_common_a", name:"战列装甲片",  tier:"III", category:"common_isk", iskValue:4500 },
    { id:"art_iii_common_b", name:"湮灭实验录",  tier:"III", category:"common_isk", iskValue:6750 },
    { id:"art_iii_common_c", name:"方尖碑铭文",  tier:"III", category:"common_isk", iskValue:9000 },
    { id:"art_iii_unique_a", name:"战列徽记",    tier:"III", category:"unique", iskValue:22500 },
    { id:"art_iii_unique_b", name:"湮灭图谱",    tier:"III", category:"unique", iskValue:33750 },
    { id:"art_iii_unique_c", name:"观测者残片",  tier:"III", category:"unique", iskValue:45000 },
    { id:"art_iii_lp",       name:"远古文明信标 III", tier:"III", category:"lp", lpValue:400 },
    { id:"art_iii_calib",    name:"校准基体 III 型", tier:"III", category:"calibration" },
    { id:"art_iv_common_a", name:"旗舰装甲残片", tier:"IV", category:"common_isk", iskValue:9000 },
    { id:"art_iv_common_b", name:"虚空研究录",   tier:"IV", category:"common_isk", iskValue:13500 },
    { id:"art_iv_common_c", name:"跃迁日志",     tier:"IV", category:"common_isk", iskValue:18000 },
    { id:"art_iv_unique_a", name:"旗舰徽记",     tier:"IV", category:"unique", iskValue:45000 },
    { id:"art_iv_unique_b", name:"虚空图谱",     tier:"IV", category:"unique", iskValue:67500 },
    { id:"art_iv_unique_c", name:"枢纽核心",     tier:"IV", category:"unique", iskValue:90000 },
    { id:"art_iv_lp",       name:"远古文明信标 IV", tier:"IV", category:"lp", lpValue:1000 },
    { id:"art_iv_calib",    name:"校准基体 IV 型", tier:"IV", category:"calibration" },
    { id:"art_v_common_a", name:"圣殿圣物",     tier:"V", category:"common_isk", iskValue:18000 },
    { id:"art_v_common_b", name:"母舰主控核",   tier:"V", category:"common_isk", iskValue:27000 },
    { id:"art_v_common_c", name:"观测站日志",   tier:"V", category:"common_isk", iskValue:36000 },
    { id:"art_v_unique_a", name:"文明圣徽",     tier:"V", category:"unique", iskValue:90000 },
    { id:"art_v_unique_b", name:"母舰图谱",     tier:"V", category:"unique", iskValue:135000 },
    { id:"art_v_unique_c", name:"观测者核心",   tier:"V", category:"unique", iskValue:180000 },
    { id:"art_v_lp",       name:"远古文明信标 V", tier:"V", category:"lp", lpValue:2500 },
    { id:"art_v_calib",    name:"校准基体 V 型", tier:"V", category:"calibration" },
  ]);

  // ---- 9 探针（材料键已按 display-names 冻结映射纠正）----
  // craft 字段仅基础/势力探针有：复原/深层探针只从稀有池掉，不可制造。
  // credits 成本 = 1 代 economyCostISK ÷46（提议换算，与货柜战利品同锚点）。
  const PROBES = Object.freeze([
    { id:"core_probe_i",         name:"标准考古探针 I",      level:1,  scanBonus:0,  cycleReduction:0,    craft:{ batch:20, time:15, credits:isk(250),   cost:{ fe_alloy:40 } } },
    { id:"enhanced_probe_ii",    name:"强化考古探针 II",     level:35, scanBonus:10, cycleReduction:0,    craft:{ batch:20, time:35, credits:isk(1500),  cost:{ fe_alloy:200, mx_alloy:60 } } },
    { id:"deep_probe_iii",       name:"深空考古探针 III",    level:70, scanBonus:20, cycleReduction:0,    craft:{ batch:20, time:75, credits:isk(7800),  cost:{ fe_alloy:600, px_alloy:10, rb_moon:3 } } },
    { id:"faction_probe_i",      name:"苍穹劫团考古探针·掠空型", level:1,  scanBonus:0,  cycleReduction:0.05, craft:{ batch:20, time:15, credits:isk(1200),  cost:{ fe_alloy:40 }, repCost:{ angel:60 },  repId:"angel" } },
    { id:"faction_probe_ii",     name:"赤誓教团考古探针·血誓型", level:35, scanBonus:10, cycleReduction:0.10, craft:{ batch:20, time:35, credits:isk(6800),  cost:{ fe_alloy:200, mx_alloy:60 }, repCost:{ blood:60 },  repId:"blood" } },
    { id:"faction_probe_iii",    name:"静默集群考古探针·同化型", level:70, scanBonus:20, cycleReduction:0.15, craft:{ batch:20, time:75, credits:isk(32000), cost:{ fe_alloy:600, px_alloy:10, rb_moon:3 }, repCost:{ sansha:60 }, repId:"sansha" } },
    { id:"restored_probe_ii",       name:"复原强化考古探针 II",  level:15, scanBonus:15, cycleReduction:0 },
    { id:"restored_deep_probe_iii", name:"复原深空考古探针 III", level:35, scanBonus:30, cycleReduction:0 },
    { id:"deep_probe_iv",           name:"深层先驱遗迹探针 IV",  level:80, scanBonus:35, cycleReduction:0.20 },
  ]);
  const DEFAULT_PROBE = "core_probe_i";

  // ---- 2 凭证（唯一，回收收益 +10%）----
  const VOUCHERS = Object.freeze({
    voucher_pan_galactic: { id:"voucher_pan_galactic", name:"泛银河商业同盟接入界面", effect:"credits", desc:"所有以星币结算的物品回收最终收益 +10%", sourceTier:"II" },
    voucher_galactic_kin: { id:"voucher_galactic_kin", name:"银河联盟军警亲属金卡",   effect:"rep",     desc:"所有以功勋结算的物品回收最终收益 +10%", sourceTier:"III" },
  });

  // ---- 三焦点常规收益权重（1 代 ARCHAEOLOGY_FOCUS_REGULAR_WEIGHTS）----
  // 本作 salvage/research/cache ⇔ a/b/c：星币 / 功勋 / 货柜
  const FOCUS_WEIGHTS = Object.freeze({
    salvage:  { coin:0.70, merit:0.15, cargo:0.15 },
    research: { coin:0.15, merit:0.70, cargo:0.15 },
    cache:    { coin:0.15, merit:0.15, cargo:0.70 },
  });

  // ---- 5 地点稀有池（1 代 ARCHAEOLOGY_LOCATIONS 逐值）----
  // boosterBlueprints 的 id 已核对：本作 lib/eveidle/data/boosters.js 的 63 张配方全量存在。
  const LOCATIONS = Object.freeze([
    {
      id:"loc_i", tier:"I", name:"边疆信标残骸", level:1,
      cargoWeights:[{size:"S",weight:95},{size:"M",weight:5}],
      rareRate:0.020, rareWeights:{ blueprint:20, booster:60, probe:0, credential:0 },
      equipmentBlueprints:["archaeo_analyzer_frontier_i"],
      boosterBlueprints:["gas_rheology_n","fullerene_nucleation_n","high_temp_flux_n","lattice_proliferation_n"],
      probeBlueprints:[], credential:null, compensation:5000,
    },
    {
      id:"loc_ii", tier:"II", name:"废弃工业环站", level:15,
      cargoWeights:[{size:"S",weight:45},{size:"M",weight:50},{size:"L",weight:5}],
      rareRate:0.015, rareWeights:{ blueprint:15, booster:45, probe:25, credential:5 },
      equipmentBlueprints:["archaeo_stabilizer_station_ii"],
      boosterBlueprints:["assembly_coordinator_n","precision_rationing_n","reaction_accelerant_n","reaction_chain_proliferation_n"],
      probeBlueprints:["restored_probe_ii"], credential:"voucher_pan_galactic", compensation:15000,
    },
    {
      id:"loc_iii", tier:"III", name:"沉睡舰队坟场", level:35,
      cargoWeights:[{size:"M",weight:85},{size:"L",weight:15}],
      rareRate:0.010, rareWeights:{ blueprint:15, booster:40, probe:25, credential:5 },
      equipmentBlueprints:["archaeo_decoder_fleet_iii"],
      boosterBlueprints:["gas_rheology_r","fullerene_nucleation_r","high_temp_flux_r","lattice_proliferation_r"],
      probeBlueprints:["restored_probe_ii"], credential:"voucher_galactic_kin", compensation:50000,
    },
    {
      id:"loc_iv", tier:"IV", name:"湮灭研究禁区", level:55,
      cargoWeights:[{size:"M",weight:35},{size:"L",weight:60},{size:"XL",weight:5}],
      rareRate:0.0075, rareWeights:{ blueprint:15, booster:40, probe:25, credential:0 },
      equipmentBlueprints:["archaeo_analyzer_forbidden_iv"],
      boosterBlueprints:["assembly_coordinator_r","precision_rationing_r","reaction_accelerant_r","reaction_chain_proliferation_r"],
      probeBlueprints:["restored_deep_probe_iii"], credential:null, compensation:120000,
    },
    {
      id:"loc_v", tier:"V", name:"先驱文明核心", level:80,
      cargoWeights:[{size:"L",weight:70},{size:"XL",weight:30}],
      rareRate:0.005, rareWeights:{ blueprint:20, booster:40, probe:20, credential:0 },
      equipmentBlueprints:["archaeo_analyzer_pioneer_v","archaeo_stabilizer_pioneer_v","archaeo_decoder_pioneer_v"],
      boosterBlueprints:[
        "gas_rheology_l","fullerene_nucleation_l","high_temp_flux_l","lattice_proliferation_l",
        "assembly_coordinator_l","precision_rationing_l","reaction_accelerant_l","reaction_chain_proliferation_l",
      ],
      probeBlueprints:["restored_deep_probe_iii"], credential:null, compensation:300000,
    },
  ]);

  // ---- 查询辅助 ----
  function artifactsOfTier(tier) { return ARTIFACTS.filter(a => a.tier === tier); }
  function artifactById(id) { return ARTIFACTS.find(a => a.id === id) || null; }
  function probeById(id) { return PROBES.find(p => p.id === id) || null; }
  function locationOfBand(band) { return LOCATIONS.find(l => l.band === band || l.tier === TIER_BY_BAND[band]) || null; }
  function locationById(id) { return LOCATIONS.find(l => l.id === id) || null; }
  function tierOfBand(band) { return TIER_BY_BAND[Math.max(1, Math.min(5, Math.round(Number(band) || 1)))]; }
  function tierConfig(band) { return TIERS[tierOfBand(band)] || TIERS.I; }
  function profileOf(focus) { return PROFILES[focus] || PROFILES.salvage; }

  return {
    ISK_TO_CREDITS, DEFAULT_PROBE,
    TIERS, TIER_BY_BAND, PROFILES, ARTIFACTS, PROBES, VOUCHERS, FOCUS_WEIGHTS, LOCATIONS,
    artifactsOfTier, artifactById, probeById, locationOfBand, locationById, tierOfBand, tierConfig, profileOf,
  };
});
