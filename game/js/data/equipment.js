// ================================================================
// 深空星疆 —— Data.Equipment：舰船装备定义（§14 舰船装配）
// 中文解耦（IP 铁律）：名/机制复刻 1 代（EVE-IDLE），但去除所有 EVE 裸名/商标。
// 1 代考古装备加成键（archaeologyScan / Stabilizer / Decoder / NonFatalAvoid / CycleReduction / CopyChance）
// 为通用语义键，本文件沿用，运行时只认键不认名。
// 资源键映射到深空星疆合金/气体/组件体系（fe_alloy=标准钛材, ni_alloy=银镍, bo_alloy=同位复材,
//   mx_alloy=类晶, no_alloy=重, px_alloy=奇点, morph_alloy=磁场聚合物, he/hy/poly_gas=气体）。
// 装备装配不限制舰种（深空星疆成员以单舰执行全部活动），故去掉 1 代 ARCHAEOLOGY_SHIP_TYPES 限制。
// Phase 1 仅含考古线装备；Phase 2（2026-10-31）接入 1 代 98 条非考古装备：
//   采矿/气采/打捞/冶炼/战斗/维修/损伤控制，共 113 条。
// 资源键已全部映射到本作 40 键体系（零新增资源）；1 代「势力装备生产许可」
//   改为 requiresRep 声望门槛；1 代 faction:alliance → 本作 federation。
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

    // —— 改装件（rig）：同位素节流器（archaeologyFuelEfficiency，降低考古每周期燃料成本；乘性叠加）——
    //    仅 battlecruiser 及以上有 rig 槽（slots.js SLOT_LAYOUT），故小舰只能靠船体 fuelEfficiency。
    //    数值为提议值，待平衡 pass（见数值标定清单）。
    fe_rig_t1: { id: "fe_rig_t1", name: "同位素节流器 I",   slot: "rig", level: 1,  time: 20,  xp: 14,  cost: { fe_alloy: 40,  ni_alloy: 15 },                                  bonuses: { archaeologyFuelEfficiency: 0.92 }, cat: "archaeology" },
    fe_rig_t2: { id: "fe_rig_t2", name: "同位素节流器 II",  slot: "rig", level: 15, time: 40,  xp: 35,  cost: { fe_alloy: 160, ni_alloy: 60, mx_alloy: 15 },                       bonuses: { archaeologyFuelEfficiency: 0.86 }, cat: "archaeology" },
    fe_rig_t3: { id: "fe_rig_t3", name: "同位素节流器 III", slot: "rig", level: 35, time: 70,  xp: 60,  cost: { fe_alloy: 400, ni_alloy: 150, bo_alloy: 25, no_alloy: 12 },         bonuses: { archaeologyFuelEfficiency: 0.80 }, cat: "archaeology" },
    fe_rig_t4: { id: "fe_rig_t4", name: "同位素节流器 IV",  slot: "rig", level: 55, time: 120, xp: 110, cost: { fe_alloy: 900, px_alloy: 40, hy_gas: 20, morph_alloy: 5 },          bonuses: { archaeologyFuelEfficiency: 0.74 }, cat: "archaeology" },
    fe_rig_t5: { id: "fe_rig_t5", name: "同位素节流器 V",   slot: "rig", level: 80, time: 200, xp: 180, cost: { fe_alloy: 2000, px_alloy: 15, morph_alloy: 10, poly_gas: 40 },      bonuses: { archaeologyFuelEfficiency: 0.68 }, cat: "archaeology" },

    // —— 高槽：采矿/气采/武器 ——
    t1_mining_laser: { id: "t1_mining_laser", name: "T1采矿激光器", slot: "high", level: 1, time: 15, xp: 8, cost: {fe_alloy: 20, ni_alloy: 10}, bonuses: {miningEfficiency: 0.05}, cat: "mining" },
    t1_gas_harvester: { id: "t1_gas_harvester", name: "T1气云采集器", slot: "high", level: 1, time: 15, xp: 8, cost: {fe_alloy: 20, crude_fullerene: 6}, bonuses: {gasEfficiency: 0.05}, cat: "gas" },
    t2_mining_laser: { id: "t2_mining_laser", name: "中型采矿激光器", slot: "high", level: 15, time: 35, xp: 20, cost: {fe_alloy: 80, ni_alloy: 30, mx_alloy: 10}, bonuses: {miningEfficiency: 0.15}, cat: "mining" },
    t2_gas_harvester: { id: "t2_gas_harvester", name: "中型气云采集器", slot: "high", level: 15, time: 35, xp: 20, cost: {fe_alloy: 80, stable_fullerene: 10}, bonuses: {gasEfficiency: 0.15}, cat: "gas" },
    raider_mining_laser: { id: "raider_mining_laser", name: "联邦拓殖公社采矿激光器", slot: "high", level: 25, time: 45, xp: 30, cost: {fe_alloy: 120, ni_alloy: 48}, bonuses: {miningEfficiency: 0.2}, faction: "federation", requiresBlueprint: true, cat: "mining" },
    raider_gas_harvester: { id: "raider_gas_harvester", name: "联邦拓殖公社气云采集器", slot: "high", level: 25, time: 45, xp: 30, cost: {fe_alloy: 120, stable_fullerene: 15}, bonuses: {gasEfficiency: 0.2}, faction: "federation", requiresBlueprint: true, cat: "gas" },
    angel_mining_laser: { id: "angel_mining_laser", name: "苍穹劫团联合采矿激光器", slot: "high", level: 25, time: 45, xp: 30, cost: {fe_alloy: 100, ni_alloy: 40}, bonuses: {miningEfficiency: 0.22}, faction: "angel", requiresRel: {angel: 45}, requiresBlueprint: true, cat: "mining" },
    angel_gas_harvester: { id: "angel_gas_harvester", name: "苍穹劫团联合气云采集器", slot: "high", level: 25, time: 45, xp: 30, cost: {fe_alloy: 100, stable_fullerene: 12}, bonuses: {gasEfficiency: 0.22}, faction: "angel", requiresRel: {angel: 45}, requiresBlueprint: true, cat: "gas" },
    t3_mining_laser: { id: "t3_mining_laser", name: "重型采矿激光器", slot: "high", level: 35, time: 60, xp: 40, cost: {fe_alloy: 200, ni_alloy: 80, bo_alloy: 20, zr_alloy: 10}, bonuses: {miningEfficiency: 0.3}, cat: "mining" },
    t3_gas_harvester: { id: "t3_gas_harvester", name: "重型气云采集器", slot: "high", level: 35, time: 60, xp: 40, cost: {fe_alloy: 200, stable_fullerene: 8, he_gas: 5}, bonuses: {gasEfficiency: 0.3}, cat: "gas" },
    t4_mining_laser: { id: "t4_mining_laser", name: "大型采矿激光器", slot: "high", level: 55, time: 100, xp: 75, cost: {fe_alloy: 500, px_alloy: 30, planet_plasma: 15, pm_moon: 5}, bonuses: {miningEfficiency: 0.5}, cat: "mining" },
    t4_gas_harvester: { id: "t4_gas_harvester", name: "大型气云采集器", slot: "high", level: 55, time: 100, xp: 75, cost: {fe_alloy: 500, hy_gas: 5, high_purity_fullerene: 10}, bonuses: {gasEfficiency: 0.5}, cat: "gas" },
    t5_mining_laser: { id: "t5_mining_laser", name: "旗舰采矿激光器", slot: "high", level: 80, time: 180, xp: 130, cost: {fe_alloy: 1200, morph_alloy: 20, rb_moon: 10, planet_mag: 30}, bonuses: {miningEfficiency: 0.8}, cat: "mining" },
    t5_gas_harvester: { id: "t5_gas_harvester", name: "旗舰气云采集器", slot: "high", level: 80, time: 180, xp: 130, cost: {fe_alloy: 1200, ultra_pure_poly_gas: 3, rb_moon: 5}, bonuses: {gasEfficiency: 0.8}, cat: "gas" },
    t1_small_laser: { id: "t1_small_laser", name: "小型激光炮 I", slot: "high", level: 1, time: 20, xp: 12, cost: {fe_alloy: 45, mx_alloy: 12}, combat: {kind:"weapon", weaponType:"laser", baseDamage:120, baseHit:100, fuelCost:3, ammoCost:1}, cat: "combat" },
    t1_light_missile_launcher: { id: "t1_light_missile_launcher", name: "轻型导弹发射器 I", slot: "high", level: 1, time: 20, xp: 12, cost: {fe_alloy: 45, ni_alloy: 12}, combat: {kind:"weapon", weaponType:"missile", baseDamage:100, baseHit:130, fuelCost:2, ammoCost:1}, cat: "combat" },
    t1_small_cannon: { id: "t1_small_cannon", name: "小型射弹炮 I", slot: "high", level: 1, time: 20, xp: 12, cost: {fe_alloy: 45, ni_alloy: 10}, combat: {kind:"weapon", weaponType:"cannon", baseDamage:80, baseHit:80, fuelCost:1, ammoCost:1}, cat: "combat" },
    t1_medium_laser: { id: "t1_medium_laser", name: "中型激光炮 I", slot: "high", level: 35, time: 45, xp: 35, cost: {fe_alloy: 150, mx_alloy: 40, bo_alloy: 10, he_gas: 5}, combat: {kind:"weapon", weaponType:"laser", baseDamage:240, baseHit:100, fuelCost:6, ammoCost:1}, cat: "combat" },
    t1_heavy_missile_launcher: { id: "t1_heavy_missile_launcher", name: "重型导弹发射器 I", slot: "high", level: 35, time: 45, xp: 35, cost: {fe_alloy: 150, ni_alloy: 40, bo_alloy: 10, poly_gas: 8}, combat: {kind:"weapon", weaponType:"missile", baseDamage:200, baseHit:130, fuelCost:4, ammoCost:1}, cat: "combat" },
    t1_medium_cannon: { id: "t1_medium_cannon", name: "中型射弹炮 I", slot: "high", level: 35, time: 45, xp: 35, cost: {fe_alloy: 150, bo_alloy: 35, zr_alloy: 8}, combat: {kind:"weapon", weaponType:"cannon", baseDamage:160, baseHit:80, fuelCost:2, ammoCost:1}, cat: "combat" },
    t1_large_laser: { id: "t1_large_laser", name: "大型激光炮 I", slot: "high", level: 55, time: 70, xp: 55, cost: {fe_alloy: 300, bo_alloy: 50, px_alloy: 15, planet_plasma: 8}, combat: {kind:"weapon", weaponType:"laser", baseDamage:480, baseHit:100, fuelCost:12, ammoCost:1}, cat: "combat" },
    t1_cruise_missile_launcher: { id: "t1_cruise_missile_launcher", name: "巡航导弹发射器 I", slot: "high", level: 55, time: 70, xp: 55, cost: {fe_alloy: 300, ni_alloy: 100, px_alloy: 15, poly_gas: 12}, combat: {kind:"weapon", weaponType:"missile", baseDamage:400, baseHit:130, fuelCost:8, ammoCost:1}, cat: "combat" },
    t1_large_cannon: { id: "t1_large_cannon", name: "大型射弹炮 I", slot: "high", level: 55, time: 70, xp: 55, cost: {fe_alloy: 300, bo_alloy: 70, px_alloy: 12, zr_alloy: 12}, combat: {kind:"weapon", weaponType:"cannon", baseDamage:320, baseHit:80, fuelCost:4, ammoCost:1}, cat: "combat" },
    t1_capital_laser: { id: "t1_capital_laser", name: "旗舰级聚焦激光炮 I", slot: "high", level: 80, time: 180, xp: 130, cost: {fe_alloy: 500, no_alloy: 12, morph_alloy: 8, rb_moon: 2, planet_plasma: 10}, combat: {kind:"weapon", weaponType:"laser", baseDamage:600, baseHit:100, fuelCost:15, ammoCost:1, aoe:{mode:"next", multiplier:0.3, maxTargets:1, description:"扫掠光束：下一目标受到30%最终伤害"}}, cat: "combat" },
    t1_capital_missile_array: { id: "t1_capital_missile_array", name: "旗舰级巡航导弹阵列 I", slot: "high", level: 80, time: 180, xp: 130, cost: {fe_alloy: 500, no_alloy: 10, morph_alloy: 8, rb_moon: 2, ultra_pure_poly_gas: 1, planet_mag: 8}, combat: {kind:"weapon", weaponType:"missile", baseDamage:500, baseHit:130, fuelCost:10, ammoCost:1, aoe:{mode:"all", multiplier:0.12, description:"扩散弹头：其他所有目标受到12%最终伤害"}}, cat: "combat" },
    t1_capital_cannon: { id: "t1_capital_cannon", name: "旗舰级攻城射弹炮 I", slot: "high", level: 80, time: 180, xp: 130, cost: {fe_alloy: 500, no_alloy: 12, morph_alloy: 7, rb_moon: 2, zr_alloy: 12}, combat: {kind:"weapon", weaponType:"cannon", baseDamage:400, baseHit:80, fuelCost:5, ammoCost:1, aoe:{mode:"next", multiplier:0.15, maxTargets:2, description:"破片齐射：最多两个其他目标受到15%最终伤害"}}, cat: "combat" },
    angel_mining_laser_outpost: { id: "angel_mining_laser_outpost", name: "苍穹劫团采矿激光器·前哨型", slot: "high", level: 10, time: 30, xp: 15, cost: {fe_alloy: 60, ni_alloy: 20}, bonuses: {miningEfficiency: 0.1}, faction: "angel", requiresRel: {angel: 25}, requiresBlueprint: true, cat: "mining" },
    blood_mining_laser_hunt: { id: "blood_mining_laser_hunt", name: "赤誓采矿激光器·猎杀型", slot: "high", level: 45, time: 75, xp: 55, cost: {fe_alloy: 300, ni_alloy: 100, bo_alloy: 20, zr_alloy: 15}, bonuses: {miningEfficiency: 0.4}, faction: "blood", requiresRel: {blood: 90}, requiresBlueprint: true, cat: "mining" },
    blood_gas_harvester_iron: { id: "blood_gas_harvester_iron", name: "赤誓气云采集器·铁血型", slot: "high", level: 65, time: 130, xp: 95, cost: {fe_alloy: 700, hy_gas: 15, he_gas: 10}, bonuses: {gasEfficiency: 0.65}, faction: "blood", requiresRel: {blood: 90}, requiresBlueprint: true, cat: "gas" },
    sansha_gas_harvester_nexus: { id: "sansha_gas_harvester_nexus", name: "静默气云采集器·枢纽型", slot: "high", level: 45, time: 75, xp: 55, cost: {fe_alloy: 300, stable_fullerene: 15, he_gas: 10}, bonuses: {gasEfficiency: 0.4}, faction: "sansha", requiresRel: {sansha: 90}, requiresBlueprint: true, cat: "gas" },
    sansha_mining_laser_war: { id: "sansha_mining_laser_war", name: "静默采矿激光器·破阵型", slot: "high", level: 65, time: 130, xp: 95, cost: {fe_alloy: 700, px_alloy: 40, pm_moon: 4, planet_plasma: 20}, bonuses: {miningEfficiency: 0.65}, faction: "sansha", requiresRel: {sansha: 90}, requiresBlueprint: true, cat: "mining" },
    angel_mining_gas_apoc: { id: "angel_mining_gas_apoc", name: "苍穹劫团采矿·气云采集器·终焉型", slot: "high", level: 85, time: 200, xp: 150, cost: {fe_alloy: 2000, morph_alloy: 40, rb_moon: 15, planet_mag: 50, hf_moon: 5}, bonuses: {miningEfficiency: 1, gasEfficiency: 1}, faction: "angel", requiresRel: {angel: 90}, requiresBlueprint: true, cat: "mining" },

    // —— 中槽：无人机链路/护盾/回充/损伤控制 ——
    t1_drone_control: { id: "t1_drone_control", name: "T1无人机控制单元", slot: "mid", level: 1, time: 20, xp: 10, cost: {fe_alloy: 25, ni_alloy: 8}, bonuses: {miningEfficiency: 0.02, gasEfficiency: 0.02}, cat: "mining" },
    t2_drone_link: { id: "t2_drone_link", name: "协同无人机指挥链路", slot: "mid", level: 15, time: 35, xp: 20, cost: {fe_alloy: 100, ni_alloy: 35, mx_alloy: 10, stable_fullerene: 5}, bonuses: {miningEfficiency: 0.05, gasEfficiency: 0.05}, cat: "mining" },
    t3_drone_link: { id: "t3_drone_link", name: "高级无人机指挥链路", slot: "mid", level: 35, time: 60, xp: 40, cost: {fe_alloy: 250, ni_alloy: 90, bo_alloy: 20, stable_fullerene: 5, poly_gas: 10}, bonuses: {miningEfficiency: 0.1, gasEfficiency: 0.1}, cat: "mining" },
    blood_servant_drone_link: { id: "blood_servant_drone_link", name: "赤誓仆从无人机指挥链路", slot: "mid", level: 45, time: 75, xp: 55, cost: {fe_alloy: 350, ni_alloy: 120, bo_alloy: 20}, bonuses: {miningEfficiency: 0.13, gasEfficiency: 0.13}, faction: "blood", requiresRel: {blood: 90}, requiresBlueprint: true, cat: "mining" },
    blood_servant_drone_link_sacrifice: { id: "blood_servant_drone_link_sacrifice", name: "赤誓仆从无人机指挥链路·献祭型", slot: "mid", level: 25, time: 45, xp: 30, cost: {fe_alloy: 150, ni_alloy: 50, mx_alloy: 15}, bonuses: {miningEfficiency: 0.08, gasEfficiency: 0.08}, faction: "blood", requiresRel: {blood: 45}, requiresBlueprint: true, cat: "mining" },
    alliance_drone_link: { id: "alliance_drone_link", name: "联邦拓殖公社无人机指挥链路", slot: "mid", level: 45, time: 75, xp: 55, cost: {fe_alloy: 420, ni_alloy: 144, bo_alloy: 24}, bonuses: {miningEfficiency: 0.13, gasEfficiency: 0.13}, faction: "federation", requiresBlueprint: true, cat: "mining" },
    t4_drone_link: { id: "t4_drone_link", name: "深空无人机指挥链路", slot: "mid", level: 55, time: 100, xp: 75, cost: {fe_alloy: 600, px_alloy: 25, planet_plasma: 15, pm_moon: 5}, bonuses: {miningEfficiency: 0.16, gasEfficiency: 0.16}, cat: "mining" },
    t5_drone_core: { id: "t5_drone_core", name: "旗舰无人机指挥核心", slot: "mid", level: 80, time: 180, xp: 130, cost: {fe_alloy: 1400, morph_alloy: 20, rb_moon: 8, ultra_pure_poly_gas: 2, planet_mag: 30}, bonuses: {miningEfficiency: 0.25, gasEfficiency: 0.25}, cat: "mining" },
    shield_ext_small: { id: "shield_ext_small", name: "小型护盾扩展", slot: "mid", level: 1, time: 15, xp: 6, cost: {fe_alloy: 50, ni_alloy: 20}, bonuses: {shieldCapacity: 50}, cat: "shield" },
    t1_shield_booster: { id: "t1_shield_booster", name: "小型护盾回充器 I", slot: "mid", level: 1, time: 18, xp: 10, cost: {fe_alloy: 35, ni_alloy: 15}, combat: {kind:"repair", target:"shield", amount:30, fuelCost:1}, cat: "repair" },
    t1_medium_shield_booster: { id: "t1_medium_shield_booster", name: "中型护盾回充器 I", slot: "mid", level: 35, time: 42, xp: 30, cost: {fe_alloy: 120, ni_alloy: 40, he_gas: 8}, combat: {kind:"repair", target:"shield", amount:60, fuelCost:2}, cat: "repair" },
    t1_large_shield_booster: { id: "t1_large_shield_booster", name: "大型护盾回充器 I", slot: "mid", level: 55, time: 65, xp: 50, cost: {fe_alloy: 240, ni_alloy: 80, px_alloy: 10, he_gas: 12}, combat: {kind:"repair", target:"shield", amount:120, fuelCost:4}, cat: "repair" },
    t1_capital_shield_array: { id: "t1_capital_shield_array", name: "旗舰级护盾回充阵列 I", slot: "mid", level: 80, time: 160, xp: 110, cost: {fe_alloy: 400, no_alloy: 8, morph_alloy: 6, rb_moon: 1, he_gas: 8, planet_mag: 8}, combat: {kind:"repair", target:"shield", amount:150, fuelCost:5}, cat: "repair" },
    angel_drone_link_war: { id: "angel_drone_link_war", name: "苍穹劫团无人机指挥链路·破阵型", slot: "mid", level: 65, time: 130, xp: 95, cost: {fe_alloy: 900, px_alloy: 35, pm_moon: 2, planet_plasma: 20}, bonuses: {miningEfficiency: 0.2, gasEfficiency: 0.2}, faction: "angel", requiresRel: {angel: 90}, requiresBlueprint: true, cat: "mining" },
    blood_drone_link_sacrifice: { id: "blood_drone_link_sacrifice", name: "赤誓仆从无人机指挥链路·献祭型", slot: "mid", level: 25, time: 45, xp: 30, cost: {fe_alloy: 150, ni_alloy: 50, mx_alloy: 15}, bonuses: {miningEfficiency: 0.08, gasEfficiency: 0.08}, faction: "blood", requiresRel: {blood: 70}, requiresBlueprint: true, cat: "mining" },
    sansha_drone_link_outpost: { id: "sansha_drone_link_outpost", name: "静默无人机指挥链路·前哨型", slot: "mid", level: 10, time: 30, xp: 15, cost: {fe_alloy: 40, ni_alloy: 15}, bonuses: {miningEfficiency: 0.04, gasEfficiency: 0.04}, faction: "sansha", requiresRel: {sansha: 25}, requiresBlueprint: true, cat: "mining" },
    t1_damage_control: { id: "t1_damage_control", name: "小型损伤控制单元 I", slot: "mid", level: 1, time: 18, xp: 10, cost: {fe_alloy: 35, ni_alloy: 15}, bonuses: {globalDamageReduction: 0.05}, combat: {kind:"damageControl", fuelCost:1}, cat: "shield" },
    t1_medium_damage_control: { id: "t1_medium_damage_control", name: "中型损伤控制单元 I", slot: "mid", level: 35, time: 42, xp: 30, cost: {fe_alloy: 120, ni_alloy: 40, he_gas: 8}, bonuses: {globalDamageReduction: 0.08}, combat: {kind:"damageControl", fuelCost:2}, cat: "shield" },
    t1_large_damage_control: { id: "t1_large_damage_control", name: "大型损伤控制单元 I", slot: "mid", level: 55, time: 65, xp: 50, cost: {fe_alloy: 240, ni_alloy: 80, px_alloy: 10, he_gas: 12}, bonuses: {globalDamageReduction: 0.12}, combat: {kind:"damageControl", fuelCost:3}, cat: "shield" },
    t1_capital_damage_control: { id: "t1_capital_damage_control", name: "旗舰级损伤控制阵列 I", slot: "mid", level: 80, time: 160, xp: 110, cost: {fe_alloy: 400, no_alloy: 8, morph_alloy: 6, rb_moon: 1, he_gas: 8, planet_mag: 8}, bonuses: {globalDamageReduction: 0.18}, combat: {kind:"damageControl", fuelCost:4}, cat: "shield" },
    angel_damage_control: { id: "angel_damage_control", name: "苍穹劫团损伤控制单元", slot: "mid", level: 45, time: 55, xp: 45, cost: {fe_alloy: 240, ni_alloy: 80, bo_alloy: 10}, bonuses: {globalDamageReduction: 0.12, shieldRepair: 0.01}, combat: {kind:"damageControl", fuelCost:3}, faction: "angel", requiresRel: {angel: 90}, requiresBlueprint: true, cat: "shield" },
    blood_damage_control: { id: "blood_damage_control", name: "赤誓教团损伤控制单元", slot: "mid", level: 10, time: 22, xp: 12, cost: {fe_alloy: 60, ni_alloy: 20}, bonuses: {globalDamageReduction: 0.08, armorRepair: 0.03}, combat: {kind:"damageControl", fuelCost:1}, faction: "blood", requiresRel: {blood: 90}, requiresBlueprint: true, cat: "shield" },
    angel_drone_link_apoc: { id: "angel_drone_link_apoc", name: "苍穹劫团无人机指挥链路·终焉型", slot: "mid", level: 85, time: 200, xp: 150, cost: {fe_alloy: 2000, morph_alloy: 40, rb_moon: 15, planet_mag: 50, hf_moon: 5}, bonuses: {miningEfficiency: 0.35, gasEfficiency: 0.35}, faction: "angel", requiresRel: {angel: 90}, requiresBlueprint: true, cat: "mining" },

    // —— 低槽：维修器/提升器 ——
    t1_armor_repairer: { id: "t1_armor_repairer", name: "小型装甲维修器 I", slot: "low", level: 1, time: 18, xp: 10, cost: {fe_alloy: 35, ni_alloy: 12}, combat: {kind:"repair", target:"armor", amount:20, fuelCost:1}, cat: "repair" },
    t1_structure_repairer: { id: "t1_structure_repairer", name: "小型结构修理器 I", slot: "low", level: 1, time: 18, xp: 10, cost: {fe_alloy: 40, ni_alloy: 8}, combat: {kind:"repair", target:"structure", amount:10, fuelCost:1}, cat: "repair" },
    t1_medium_armor_repairer: { id: "t1_medium_armor_repairer", name: "中型装甲维修器 I", slot: "low", level: 35, time: 42, xp: 30, cost: {fe_alloy: 120, bo_alloy: 35, zr_alloy: 10}, combat: {kind:"repair", target:"armor", amount:40, fuelCost:2}, cat: "repair" },
    t1_medium_structure_repairer: { id: "t1_medium_structure_repairer", name: "中型结构修理器 I", slot: "low", level: 35, time: 42, xp: 30, cost: {fe_alloy: 130, ni_alloy: 25, bo_alloy: 25, poly_gas: 6}, combat: {kind:"repair", target:"structure", amount:20, fuelCost:2}, cat: "repair" },
    t1_large_armor_repairer: { id: "t1_large_armor_repairer", name: "大型装甲维修器 I", slot: "low", level: 55, time: 65, xp: 50, cost: {fe_alloy: 240, bo_alloy: 50, px_alloy: 10, zr_alloy: 14}, combat: {kind:"repair", target:"armor", amount:80, fuelCost:4}, cat: "repair" },
    t1_large_structure_repairer: { id: "t1_large_structure_repairer", name: "大型结构修理器 I", slot: "low", level: 55, time: 65, xp: 50, cost: {fe_alloy: 260, ni_alloy: 50, px_alloy: 12, poly_gas: 10}, combat: {kind:"repair", target:"structure", amount:40, fuelCost:4}, cat: "repair" },
    t1_capital_armor_array: { id: "t1_capital_armor_array", name: "旗舰级装甲维修阵列 I", slot: "low", level: 80, time: 160, xp: 110, cost: {fe_alloy: 400, no_alloy: 9, morph_alloy: 6, rb_moon: 1, zr_alloy: 10, planet_plasma: 6}, combat: {kind:"repair", target:"armor", amount:100, fuelCost:5}, cat: "repair" },
    t1_capital_structure_array: { id: "t1_capital_structure_array", name: "旗舰级结构修复阵列 I", slot: "low", level: 80, time: 160, xp: 110, cost: {fe_alloy: 400, no_alloy: 8, morph_alloy: 7, rb_moon: 1, poly_gas: 8, planet_mag: 6}, combat: {kind:"repair", target:"structure", amount:50, fuelCost:5}, cat: "repair" },
    t1_mining_booster: { id: "t1_mining_booster", name: "T1采矿提升器", slot: "low", level: 10, time: 20, xp: 12, cost: {fe_alloy: 50, ni_alloy: 20}, bonuses: {miningLaserEfficiency: 0.1}, cat: "mining" },
    t2_mining_booster: { id: "t2_mining_booster", name: "中型采矿提升器", slot: "low", level: 15, time: 35, xp: 20, cost: {fe_alloy: 160, ni_alloy: 60, mx_alloy: 15}, bonuses: {miningLaserEfficiency: 0.3}, cat: "mining" },
    t3_mining_booster: { id: "t3_mining_booster", name: "重型采矿提升器", slot: "low", level: 35, time: 60, xp: 40, cost: {fe_alloy: 400, ni_alloy: 150, bo_alloy: 30, zr_alloy: 15}, bonuses: {miningLaserEfficiency: 0.5}, cat: "mining" },
    t4_mining_booster: { id: "t4_mining_booster", name: "大型采矿提升器", slot: "low", level: 55, time: 110, xp: 80, cost: {fe_alloy: 900, px_alloy: 45, planet_plasma: 25, pm_moon: 5}, bonuses: {miningLaserEfficiency: 0.7}, cat: "mining" },
    sansha_mineral_assimilation: { id: "sansha_mineral_assimilation", name: "矿物同化注入器", slot: "low", level: 65, time: 130, xp: 95, cost: {fe_alloy: 1100, px_alloy: 50, pm_moon: 5, planet_plasma: 25}, bonuses: {miningLaserEfficiency: 0.8}, faction: "sansha", requiresRel: {sansha: 90}, requiresBlueprint: true, cat: "mining" },
    angel_mineral_assimilation_outpost: { id: "angel_mineral_assimilation_outpost", name: "苍穹劫团矿物同化注入器·前哨型", slot: "low", level: 10, time: 30, xp: 15, cost: {fe_alloy: 80, ni_alloy: 20}, bonuses: {miningLaserEfficiency: 0.2}, faction: "angel", requiresRel: {angel: 25}, requiresBlueprint: true, cat: "mining" },
    blood_mineral_assimilation_nexus: { id: "blood_mineral_assimilation_nexus", name: "赤誓矿物同化注入器·枢纽型", slot: "low", level: 45, time: 75, xp: 55, cost: {fe_alloy: 600, bo_alloy: 25, zr_alloy: 15, he_gas: 10}, bonuses: {miningLaserEfficiency: 0.6}, faction: "blood", requiresRel: {blood: 90}, requiresBlueprint: true, cat: "mining" },
    sansha_mineral_assimilation_node: { id: "sansha_mineral_assimilation_node", name: "矿物同化注入器·节点型", slot: "low", level: 25, time: 45, xp: 30, cost: {fe_alloy: 300, ni_alloy: 100, mx_alloy: 20}, bonuses: {miningLaserEfficiency: 0.4}, faction: "sansha", requiresRel: {sansha: 45}, requiresBlueprint: true, cat: "mining" },
    alliance_mineral_assimilation: { id: "alliance_mineral_assimilation", name: "联邦拓殖公社矿物同化注入器", slot: "low", level: 65, time: 130, xp: 95, cost: {fe_alloy: 1320, px_alloy: 60, rb_moon: 6, planet_plasma: 30}, bonuses: {miningLaserEfficiency: 0.8}, faction: "federation", requiresBlueprint: true, cat: "mining" },
    t5_mining_booster: { id: "t5_mining_booster", name: "旗舰采矿提升核心", slot: "low", level: 80, time: 200, xp: 150, cost: {fe_alloy: 2000, morph_alloy: 35, rb_moon: 15, planet_mag: 50}, bonuses: {miningLaserEfficiency: 0.9}, cat: "mining" },
    t1_gas_booster: { id: "t1_gas_booster", name: "T1采气提升器", slot: "low", level: 10, time: 20, xp: 12, cost: {fe_alloy: 50, crude_fullerene: 20}, bonuses: {gasLaserEfficiency: 0.1}, cat: "gas" },
    t2_gas_booster: { id: "t2_gas_booster", name: "中型采气提升器", slot: "low", level: 15, time: 35, xp: 20, cost: {fe_alloy: 160, stable_fullerene: 60, mx_alloy: 15}, bonuses: {gasLaserEfficiency: 0.3}, cat: "gas" },
    t3_gas_booster: { id: "t3_gas_booster", name: "重型采气提升器", slot: "low", level: 35, time: 60, xp: 40, cost: {fe_alloy: 400, stable_fullerene: 150, bo_alloy: 30, zr_alloy: 15}, bonuses: {gasLaserEfficiency: 0.5}, cat: "gas" },
    t4_gas_booster: { id: "t4_gas_booster", name: "大型采气提升器", slot: "low", level: 55, time: 110, xp: 80, cost: {fe_alloy: 900, planet_plasma: 25, high_purity_fullerene: 55, pm_moon: 5}, bonuses: {gasLaserEfficiency: 0.7}, cat: "gas" },
    t5_gas_booster: { id: "t5_gas_booster", name: "旗舰采气提升核心", slot: "low", level: 80, time: 200, xp: 150, cost: {fe_alloy: 2000, ultra_pure_poly_gas: 35, rb_moon: 15, planet_mag: 50}, bonuses: {gasLaserEfficiency: 0.9}, cat: "gas" },
    sansha_gas_assimilation: { id: "sansha_gas_assimilation", name: "静默气体同化注入器", slot: "low", level: 65, time: 130, xp: 95, cost: {fe_alloy: 1100, high_purity_fullerene: 50, pm_moon: 5, planet_plasma: 25}, bonuses: {gasLaserEfficiency: 0.8}, faction: "sansha", requiresRel: {sansha: 90}, requiresBlueprint: true, cat: "gas" },
    angel_gas_assimilation_outpost: { id: "angel_gas_assimilation_outpost", name: "苍穹劫团气体同化注入器·前哨型", slot: "low", level: 10, time: 30, xp: 15, cost: {fe_alloy: 80, stable_fullerene: 20}, bonuses: {gasLaserEfficiency: 0.2}, faction: "angel", requiresRel: {angel: 25}, requiresBlueprint: true, cat: "gas" },
    blood_gas_assimilation_nexus: { id: "blood_gas_assimilation_nexus", name: "赤誓气体同化注入器·枢纽型", slot: "low", level: 45, time: 75, xp: 55, cost: {fe_alloy: 600, bo_alloy: 15, he_gas: 15}, bonuses: {gasLaserEfficiency: 0.6}, faction: "blood", requiresRel: {blood: 90}, requiresBlueprint: true, cat: "gas" },
    sansha_gas_assimilation_node: { id: "sansha_gas_assimilation_node", name: "静默气体同化注入器·节点型", slot: "low", level: 25, time: 45, xp: 30, cost: {fe_alloy: 300, stable_fullerene: 100, mx_alloy: 20}, bonuses: {gasLaserEfficiency: 0.4}, faction: "sansha", requiresRel: {sansha: 45}, requiresBlueprint: true, cat: "gas" },
    alliance_gas_assimilation: { id: "alliance_gas_assimilation", name: "联邦拓殖公社气体同化注入器", slot: "low", level: 65, time: 130, xp: 95, cost: {fe_alloy: 1320, poly_gas: 60, rb_moon: 6, planet_plasma: 30}, bonuses: {gasLaserEfficiency: 0.8}, faction: "federation", requiresBlueprint: true, cat: "gas" },
    t1_salvage_arm: { id: "t1_salvage_arm", name: "T1同位素标记打捞臂", slot: "low", level: 10, time: 20, xp: 12, cost: {fe_alloy: 50, zr_alloy: 20, poly_gas: 12}, bonuses: {salvageEfficiency: 0.1}, cat: "salvage" },
    t2_salvage_arm: { id: "t2_salvage_arm", name: "中型同位素标记打捞臂", slot: "low", level: 15, time: 35, xp: 20, cost: {fe_alloy: 160, he_gas: 60, mx_alloy: 15}, bonuses: {salvageEfficiency: 0.3}, cat: "salvage" },
    // ⚠️ 2026-11-06：planet_plasma 是 stage2（低安 0.4-0.3）行星产物，试玩期不可得，
    // 而本件 level 35（船坞 Lv1 即可造）是全表唯一「门槛已达却永远缺料」的装备；
    // 且原值 150 比 t5 装备的同类用量（8~30）大 5~20 倍，属标定笔误。
    // 改为 stage1 可产的 planet_ice（冰行星产物，T2），数量按 t3 档位重定。
    t3_salvage_arm: { id: "t3_salvage_arm", name: "重型同位素标记打捞臂", slot: "low", level: 35, time: 60, xp: 40, cost: {fe_alloy: 400, planet_ice: 45, he_gas: 30, zr_alloy: 15}, bonuses: {salvageEfficiency: 0.5}, cat: "salvage" },
    t4_salvage_arm: { id: "t4_salvage_arm", name: "大型同位素标记打捞臂", slot: "low", level: 55, time: 110, xp: 80, cost: {fe_alloy: 900, planet_bio: 45, planet_plasma: 25, pm_moon: 5}, bonuses: {salvageEfficiency: 0.7}, cat: "salvage" },
    t5_salvage_arm: { id: "t5_salvage_arm", name: "旗舰同位素标记打捞核心", slot: "low", level: 80, time: 200, xp: 150, cost: {fe_alloy: 2000, planet_mag: 35, rb_moon: 15, planet_bio: 50}, bonuses: {salvageEfficiency: 0.9}, cat: "salvage" },
    sansha_salvage_injector: { id: "sansha_salvage_injector", name: "静默残骸打捞注入器", slot: "low", level: 65, time: 130, xp: 95, cost: {fe_alloy: 1100, planet_plasma: 50, pm_moon: 5, planet_bio: 25}, bonuses: {salvageEfficiency: 0.8}, faction: "sansha", requiresRel: {sansha: 90}, requiresBlueprint: true, cat: "salvage" },
    angel_salvage_injector_outpost: { id: "angel_salvage_injector_outpost", name: "苍穹劫团残骸打捞注入器·前哨型", slot: "low", level: 10, time: 30, xp: 15, cost: {fe_alloy: 80, poly_gas: 20}, bonuses: {salvageEfficiency: 0.2}, faction: "angel", requiresRel: {angel: 25}, requiresBlueprint: true, cat: "salvage" },
    blood_salvage_injector_nexus: { id: "blood_salvage_injector_nexus", name: "赤誓残骸打捞注入器·枢纽型", slot: "low", level: 45, time: 75, xp: 55, cost: {fe_alloy: 600, bo_alloy: 25, zr_alloy: 15}, bonuses: {salvageEfficiency: 0.6}, faction: "blood", requiresRel: {blood: 90}, requiresBlueprint: true, cat: "salvage" },
    sansha_salvage_injector_node: { id: "sansha_salvage_injector_node", name: "静默残骸打捞注入器·节点型", slot: "low", level: 25, time: 45, xp: 30, cost: {fe_alloy: 300, he_gas: 100, mx_alloy: 20}, bonuses: {salvageEfficiency: 0.4}, faction: "sansha", requiresRel: {sansha: 70}, requiresBlueprint: true, cat: "salvage" },
    alliance_salvage_injector: { id: "alliance_salvage_injector", name: "联邦拓殖公社残骸打捞注入器", slot: "low", level: 65, time: 130, xp: 95, cost: {fe_alloy: 1320, rb_moon: 6, planet_bio: 105}, bonuses: {salvageEfficiency: 0.8}, faction: "federation", requiresBlueprint: true, cat: "salvage" },
    blood_mineral_assimilation_apoc: { id: "blood_mineral_assimilation_apoc", name: "赤誓矿物同化注入器·终焉型", slot: "low", level: 85, time: 200, xp: 150, cost: {fe_alloy: 2000, morph_alloy: 40, rb_moon: 15, planet_mag: 50, hf_moon: 5}, bonuses: {miningLaserEfficiency: 1.1}, faction: "blood", requiresRel: {blood: 90}, requiresBlueprint: true, cat: "mining" },
    blood_salvage_injector_apoc: { id: "blood_salvage_injector_apoc", name: "赤誓残骸打捞注入器·终焉型", slot: "low", level: 85, time: 200, xp: 150, cost: {fe_alloy: 2000, morph_alloy: 40, rb_moon: 15, planet_mag: 50, hf_moon: 5}, bonuses: {salvageEfficiency: 1.1}, faction: "blood", requiresRel: {blood: 90}, requiresBlueprint: true, cat: "salvage" },
    sansha_gas_assimilation_apoc: { id: "sansha_gas_assimilation_apoc", name: "静默集群气体同化注入器·终焉型", slot: "low", level: 85, time: 200, xp: 150, cost: {fe_alloy: 2000, morph_alloy: 40, rb_moon: 15, planet_mag: 50, hf_moon: 5}, bonuses: {gasLaserEfficiency: 1.1}, faction: "sansha", requiresRel: {sansha: 90}, requiresBlueprint: true, cat: "gas" },

    // —— 通用槽 ——
    refinery_pump: { id: "refinery_pump", name: "外接大型精炼泵", slot: "mid", level: 40, time: 100, xp: 70, cost: {fe_alloy: 450, ni_alloy: 160, bo_alloy: 36, poly_gas: 18, planet_plasma: 30}, bonuses: {smeltingSpeed: 0.1}, cat: "industry" },
    refinery_pump_dark: { id: "refinery_pump_dark", name: "暗流体精炼泵", slot: "mid", level: 50, time: 200, xp: 140, cost: {fe_alloy: 800, ni_alloy: 400, bo_alloy: 120, poly_gas: 60, planet_plasma: 80, os_moon: 40, ga_moon: 20}, bonuses: {smeltingSpeed: 0.15}, cat: "industry" },
  };

  function byId(id) { return EQUIPMENT[id] || null; }
  function all() { return Object.values(EQUIPMENT); }
  function bySlot(slot) { return Object.values(EQUIPMENT).filter(e => e.slot === slot); }
  function byCategory(cat) { return Object.values(EQUIPMENT).filter(e => e.cat === cat); }

  // ---- 装备制造蓝图（1 代 equipment.js:634-641 原样搬入）----
  // 1 代用 state.ownedBlueprints: string[] 存所有权，装备键 = "equipment:" + id，
  // 舰船键 = 裸 shipId，两种前缀共用一个数组（1 代 actions.js:196/339 同口径）。
  // 蓝图是**一次性解锁**（BPO），解锁后该装备可无限制造，永不再消耗图纸。
  // 与限次抄本（BPC，state.blueprintCharges）完全分离；本作暂不引入 BPC。
  function bpKey(equipmentId) { return "equipment:" + equipmentId; }
  function hasBlueprint(state, equipmentId) {
    return Array.isArray(state && state.ownedBlueprints) &&
      state.ownedBlueprints.includes(bpKey(equipmentId));
  }

  // ⏳ 势力商店尚未实装期间的临时开关。
  //    true  = 建档 / 首次加载旧档时，把所有 requiresBlueprint 装备的蓝图直接授予
  //            （机制在位、门不拦人，玩家体验与现在完全一致）
  //    false = 未解锁的装备会被 Production.buildEquipment 拦下，蓝图需从势力商店获得
  // 商店做完后只需把这里改成 false；机制本身不需要再动。
  // ⚠️ 老档一旦写过 ownedBlueprints，改成 false 后仍是全解锁（存档已持久化）。
  //    要真门禁需配合一次性回落（清空该字段后重新授予），那属于商店上线时的迁移工作。
  const BP_GRANT_ALL = true;

  // 把所有需要蓝图的装备一次性授予该存档（幂等，返回本次新授予数量）
  function grantAllBlueprints(state) {
    if (!state || typeof state !== "object") return 0;
    if (!Array.isArray(state.ownedBlueprints)) state.ownedBlueprints = [];
    if (!BP_GRANT_ALL) return 0;
    let n = 0;
    for (const eq of all()) {
      if (!eq.requiresBlueprint) continue;
      const key = bpKey(eq.id);
      if (!state.ownedBlueprints.includes(key)) { state.ownedBlueprints.push(key); n++; }
    }
    return n;
  }

  // 加成键中文标签（UI 显示用）
  const BONUS_LABELS = {
    archaeologyScan: "扫描强度",
    archaeologyStabilizer: "失败反噬减免",
    archaeologyNonFatalAvoid: "非致命免伤",
    archaeologyDecoder: "稀有发现掉率加成",
    archaeologyCycleReduction: "考古周期缩短",
    archaeologyCopyChance: "货柜额外掉落",
    archaeologyFuelEfficiency: "考古燃料效率",
    // —— 生产/采集/工业线（Phase 2 接入）——
    miningEfficiency: "采矿效率",
    gasEfficiency: "气采效率",
    miningLaserEfficiency: "采矿激光效率",
    gasLaserEfficiency: "气采激光效率",
    salvageEfficiency: "打捞效率",
    smeltingSpeed: "冶炼速度",
    // —— 战斗线（Phase 2 接入，真实时战斗生效）——
    shieldCapacity: "护盾容量",
    globalDamageReduction: "全局减伤",
    shieldRepair: "护盾回充量",
    armorRepair: "装甲维修量",
  };

  return { EQUIPMENT, byId, all, bySlot, byCategory, BONUS_LABELS,
           bpKey, hasBlueprint, BP_GRANT_ALL, grantAllBlueprints };
});
