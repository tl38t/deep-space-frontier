// ================================================================
// 深空星疆 —— Data.Deathspace：死亡空间（DED）副本数据表
// ----------------------------------------------------------------
// 来源：1 代正本 js/data/combat.js 的 DEATHSPACE_DATABASE（16 副本），**逐值照搬**：
//   waves（hpMult/damageMult/escortNormal/coreChance/final）、combatBalance、
//   maxWave / waveLp / clearLpBonus / ticketChances 全部与 1 代一致，未做数值缩放。
//
// 本作化差异（IP 铁律 + 用户拍板）：
//   ① 显示名势力本作化：天使→苍穹劫团、血袭者→赤誓教团、萨沙→静默集群；
//      内部键全 ASCII（ds_tk_*），代码层不出现 EVE 裸名。
//   ② 8/10 静默「战争设施通行密钥」撞 6/10 → 按拍板改「静默集群同化中枢通行密钥」；
//      4/10 静默按自身副本名（同化枢纽）→「静默集群同化枢纽通行密钥」，避免二次撞名。
//   ③ band 映射（2026-11-27 定稿）：dedTier 2/3/4/6/8 → band1/2/3/4/5，
//      即每个 band × 每个势力恰好 1 个副本；先驱 10/10 的 band=0 表示**数据先落库、入口暂不做**。
//
// ⚠️ 本文件只落数据，不含引擎/UI。通行密钥资源注册见 data/resources.js 的 DS_TICKET；
//    掉落挂点与进入消耗等引擎接线属后续步骤，当前表里 coreMaterial/protocolMaterial 仅记录不消费。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.DeathSpace = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.DeathSpace = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // dedTier → 本作 band（1~5）；先驱 10/10 无入口，band=0
  const TIER_BAND = { 2: 1, 3: 2, 4: 3, 6: 4, 8: 5, 10: 0 };

  // 16 副本。ticket = 密钥资源 id（ASCII，与 Resources.ALL 的 DS_TICKET 键一致）。
  const SITES = [
    // ---- 2/10 → band1 ----
    { id: "angel_ded_2_10", name: "苍穹劫团2/10秘密补给站", faction: "angel", dedTier: 2, band: 1,
      ticket: "ds_tk_angel_2", ticketName: "苍穹劫团秘密补给站通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 3, waveLp: 1, clearLpBonus: 9,
      coreMaterial: "吉斯特试制校准核心", protocolMaterial: "吉斯特试制协议", protocolChance: 0.02,
      combatBalance: { hp: 0.2589, damage: 0.9725, finalHp: 1.3616, finalDamage: 2.1353 },
      waves: [
        { name: "补给站外围警戒官", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.08 },
        { name: "补给线路主管",     hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.12 },
        { name: "劫团补给站监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.25, final: true },
      ] },
    { id: "blood_ded_2_10", name: "赤誓教团2/10仪式地窖", faction: "blood", dedTier: 2, band: 1,
      ticket: "ds_tk_blood_2", ticketName: "赤誓教团仪式地窖通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 3, waveLp: 1, clearLpBonus: 9,
      coreMaterial: "科尔普斯试制校准核心", protocolMaterial: "科尔普斯试制协议", protocolChance: 0.02,
      combatBalance: { hp: 0.2797, damage: 0.8064, finalHp: 2.0632, finalDamage: 1.2039 },
      waves: [
        { name: "地窖外围侍祭",   hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.08 },
        { name: "仪式主持者",     hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.12 },
        { name: "赤誓地窖监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.25, final: true },
      ] },
    { id: "sansha_ded_2_10", name: "静默集群2/10控制哨所", faction: "sansha", dedTier: 2, band: 1,
      ticket: "ds_tk_sansha_2", ticketName: "静默集群控制哨所通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 3, waveLp: 1, clearLpBonus: 9,
      coreMaterial: "森屠斯试制校准核心", protocolMaterial: "森屠斯试制协议", protocolChance: 0.02,
      combatBalance: { hp: 0.3647, damage: 0.8507, finalHp: 0.6061, finalDamage: 1.0000 },
      waves: [
        { name: "哨所外围控制官", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.08 },
        { name: "同步节点主管",   hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.12 },
        { name: "静默哨所监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.25, final: true },
      ] },

    // ---- 3/10 → band2 ----
    { id: "angel_ded_3_10", name: "苍穹劫团3/10劫掠者船坞", faction: "angel", dedTier: 3, band: 2,
      ticket: "ds_tk_angel_3", ticketName: "苍穹劫团劫掠者船坞通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 4, waveLp: 1, clearLpBonus: 18,
      coreMaterial: "吉斯特强化校准核心", protocolMaterial: "吉斯特强化协议", protocolChance: 0.02,
      combatBalance: { hp: 1.4713, damage: 0.3574, finalHp: 0.8875, finalDamage: 1.7003 },
      waves: [
        { name: "船坞外围警戒官", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.08 },
        { name: "泊位防卫主管",   hpMult: 0.98, damageMult: 0.98, escortNormal: 1, coreChance: 0.12 },
        { name: "劫掠舰队协调官", hpMult: 1.12, damageMult: 1.12, escortNormal: 1, coreChance: 0.17 },
        { name: "劫团船坞监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.28, final: true },
      ] },
    { id: "blood_ded_3_10", name: "赤誓教团3/10献祭圣所", faction: "blood", dedTier: 3, band: 2,
      ticket: "ds_tk_blood_3", ticketName: "赤誓教团献祭圣所通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 4, waveLp: 1, clearLpBonus: 18,
      coreMaterial: "科尔普斯强化校准核心", protocolMaterial: "科尔普斯强化协议", protocolChance: 0.02,
      combatBalance: { hp: 0.2176, damage: 0.9253, finalHp: 2.0649, finalDamage: 1.1589 },
      waves: [
        { name: "圣所外围侍从",   hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.08 },
        { name: "献祭仪轨主管",   hpMult: 0.98, damageMult: 0.98, escortNormal: 1, coreChance: 0.12 },
        { name: "深红教团协调官", hpMult: 1.12, damageMult: 1.12, escortNormal: 1, coreChance: 0.17 },
        { name: "赤誓圣所监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.28, final: true },
      ] },
    { id: "sansha_ded_3_10", name: "静默集群3/10同步节点", faction: "sansha", dedTier: 3, band: 2,
      ticket: "ds_tk_sansha_3", ticketName: "静默集群同步节点通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 4, waveLp: 1, clearLpBonus: 18,
      coreMaterial: "森屠斯强化校准核心", protocolMaterial: "森屠斯强化协议", protocolChance: 0.02,
      combatBalance: { hp: 0.2754, damage: 0.8503, finalHp: 1.7278, finalDamage: 0.9919 },
      waves: [
        { name: "节点外围控制官", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.08 },
        { name: "同步阵列主管",   hpMult: 0.98, damageMult: 0.98, escortNormal: 1, coreChance: 0.12 },
        { name: "控制集群协调官", hpMult: 1.12, damageMult: 1.12, escortNormal: 1, coreChance: 0.17 },
        { name: "静默节点监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.28, final: true },
      ] },

    // ---- 4/10 → band3 ----
    { id: "angel_ded_4_10", name: "苍穹劫团4/10舰队集结区", faction: "angel", dedTier: 4, band: 3,
      ticket: "ds_tk_angel_4", ticketName: "苍穹劫团舰队集结区通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 5, waveLp: 2, clearLpBonus: 30,
      coreMaterial: "吉斯特精锐校准核心", protocolMaterial: "吉斯特精锐协议", protocolChance: 0.02,
      combatBalance: { hp: 0.6392, damage: 0.6678, finalHp: 1.8327, finalDamage: 0.8308 },
      waves: [
        { name: "集结区外围警戒官", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.08 },
        { name: "舰队调度主管",     hpMult: 0.95, damageMult: 0.95, escortNormal: 1, coreChance: 0.12 },
        { name: "火力节点协调官",   hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.16 },
        { name: "核心舰队统领",     hpMult: 1.15, damageMult: 1.15, escortNormal: 1, coreChance: 0.20 },
        { name: "劫团集结区监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.29, final: true },
      ] },
    { id: "blood_ded_4_10", name: "赤誓教团4/10深红修道院", faction: "blood", dedTier: 4, band: 3,
      ticket: "ds_tk_blood_4", ticketName: "赤誓教团深红修道院通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 5, waveLp: 2, clearLpBonus: 30,
      coreMaterial: "科尔普斯精锐校准核心", protocolMaterial: "科尔普斯精锐协议", protocolChance: 0.02,
      combatBalance: { hp: 0.2923, damage: 1.1475, finalHp: 0.5022, finalDamage: 0.8693 },
      waves: [
        { name: "修道院外围侍从", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.08 },
        { name: "圣坛防卫主管",   hpMult: 0.95, damageMult: 0.95, escortNormal: 1, coreChance: 0.12 },
        { name: "深红舰队协调官", hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.16 },
        { name: "核心圣坛统领",   hpMult: 1.15, damageMult: 1.15, escortNormal: 1, coreChance: 0.20 },
        { name: "赤誓修道院监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.29, final: true },
      ] },
    { id: "sansha_ded_4_10", name: "静默集群4/10同化中枢", faction: "sansha", dedTier: 4, band: 3,
      ticket: "ds_tk_sansha_4", ticketName: "静默集群同化中枢通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 5, waveLp: 2, clearLpBonus: 30,
      coreMaterial: "森屠斯精锐校准核心", protocolMaterial: "森屠斯精锐协议", protocolChance: 0.02,
      combatBalance: { hp: 0.3378, damage: 0.9652, finalHp: 2.2407, finalDamage: 0.6000 },
      waves: [
        { name: "中枢外围控制官", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.08 },
        { name: "同化矩阵主管",   hpMult: 0.95, damageMult: 0.95, escortNormal: 1, coreChance: 0.12 },
        { name: "控制集群协调官", hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.16 },
        { name: "核心节点统领",   hpMult: 1.15, damageMult: 1.15, escortNormal: 1, coreChance: 0.20 },
        { name: "静默中枢监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.29, final: true },
      ] },

    // ---- 6/10 → band4 ----
    { id: "angel_ded_6_10", name: "苍穹劫团6/10军事复合体", faction: "angel", dedTier: 6, band: 4,
      ticket: "ds_tk_angel_6", ticketName: "苍穹劫团军事复合体通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 5, waveLp: 3, clearLpBonus: 45,
      coreMaterial: "吉斯特A型校准核心", protocolMaterial: "吉斯特改良协议", protocolChance: 0.02,
      combatBalance: { hp: 0.9954, damage: 0.4334, finalHp: 1.7324, finalDamage: 1.2280 },
      waves: [
        { name: "外围警戒指挥官", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.12 },
        { name: "防御节点主管",   hpMult: 0.95, damageMult: 0.95, escortNormal: 1, coreChance: 0.15 },
        { name: "舰队协调官",     hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.18 },
        { name: "核心守卫统领",   hpMult: 1.15, damageMult: 1.15, escortNormal: 1, coreChance: 0.22 },
        { name: "劫团复合体监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.35, final: true },
      ] },
    { id: "blood_ded_6_10", name: "赤誓教团6/10海军造船厂", faction: "blood", dedTier: 6, band: 4,
      ticket: "ds_tk_blood_6", ticketName: "赤誓教团海军造船厂通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 5, waveLp: 3, clearLpBonus: 45,
      coreMaterial: "科尔普斯A型校准核心", protocolMaterial: "科尔普斯改良协议", protocolChance: 0.02,
      combatBalance: { hp: 0.5882, damage: 0.8610, finalHp: 1.4007, finalDamage: 0.5900 },
      waves: [
        { name: "外围献祭监工",   hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.12 },
        { name: "船坞防卫主管",   hpMult: 0.95, damageMult: 0.95, escortNormal: 1, coreChance: 0.15 },
        { name: "深红舰队协调官", hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.18 },
        { name: "核心圣堂统领",   hpMult: 1.15, damageMult: 1.15, escortNormal: 1, coreChance: 0.22 },
        { name: "赤誓造船厂监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.35, final: true },
      ] },
    { id: "sansha_ded_6_10", name: "静默集群6/10战争设施", faction: "sansha", dedTier: 6, band: 4,
      ticket: "ds_tk_sansha_6", ticketName: "静默集群战争设施通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 5, waveLp: 3, clearLpBonus: 45,
      coreMaterial: "森屠斯A型校准核心", protocolMaterial: "森屠斯改良协议", protocolChance: 0.02,
      combatBalance: { hp: 0.2463, damage: 1.0602, finalHp: 1.7108, finalDamage: 0.6900 },
      waves: [
        { name: "外围控制监督者", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.12 },
        { name: "防御矩阵主管",   hpMult: 0.95, damageMult: 0.95, escortNormal: 1, coreChance: 0.15 },
        { name: "战争节点协调官", hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.18 },
        { name: "核心设施统领",   hpMult: 1.15, damageMult: 1.15, escortNormal: 1, coreChance: 0.22 },
        { name: "静默战争设施监督者", hpMult: 1.25, damageMult: 1.25, escortNormal: 2, coreChance: 0.35, final: true },
      ] },

    // ---- 8/10 → band5 ----
    { id: "angel_ded_8_10", name: "苍穹劫团8/10边疆堡垒", faction: "angel", dedTier: 8, band: 5,
      ticket: "ds_tk_angel_8", ticketName: "苍穹劫团边疆堡垒通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 6, waveLp: 4, clearLpBonus: 72,
      coreMaterial: "劫团X型校准核心", protocolMaterial: "劫团X型改良协议", protocolChance: 0.02,
      combatBalance: { hp: 1.20, damage: 1.05, finalHp: 1.25, finalDamage: 1.10 },
      waves: [
        { name: "边疆堡垒外围警戒", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.15 },
        { name: "边疆堡垒防御节点", hpMult: 0.95, damageMult: 0.95, escortNormal: 1, coreChance: 0.18 },
        { name: "边疆堡垒火力协调", hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.21 },
        { name: "边疆堡垒核心防卫", hpMult: 1.12, damageMult: 1.12, escortNormal: 1, coreChance: 0.24 },
        { name: "边疆堡垒旗舰编队", hpMult: 1.20, damageMult: 1.20, escortNormal: 2, coreChance: 0.28 },
        { name: "劫团边疆堡垒监督者", hpMult: 1.30, damageMult: 1.30, escortNormal: 2, coreChance: 0.40, final: true },
      ] },
    { id: "blood_ded_8_10", name: "赤誓教团8/10深红圣所", faction: "blood", dedTier: 8, band: 5,
      ticket: "ds_tk_blood_8", ticketName: "赤誓教团深红圣所通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 6, waveLp: 4, clearLpBonus: 72,
      coreMaterial: "赤誓X型校准核心", protocolMaterial: "赤誓X型改良协议", protocolChance: 0.02,
      combatBalance: { hp: 1.05, damage: 1.20, finalHp: 1.20, finalDamage: 1.15 },
      waves: [
        { name: "深红圣所外围侍从", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.15 },
        { name: "深红圣所防卫主控", hpMult: 0.95, damageMult: 0.95, escortNormal: 1, coreChance: 0.18 },
        { name: "深红圣所献祭编队", hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.21 },
        { name: "深红圣所核心卫队", hpMult: 1.12, damageMult: 1.12, escortNormal: 1, coreChance: 0.24 },
        { name: "深红圣所重装编队", hpMult: 1.20, damageMult: 1.20, escortNormal: 2, coreChance: 0.28 },
        { name: "赤誓深红圣所监督者", hpMult: 1.30, damageMult: 1.30, escortNormal: 2, coreChance: 0.40, final: true },
      ] },
    { id: "sansha_ded_8_10", name: "静默集群8/10同化中枢", faction: "sansha", dedTier: 8, band: 5,
      ticket: "ds_tk_sansha_8", ticketName: "静默集群战争设施准入密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 6, waveLp: 4, clearLpBonus: 72,
      coreMaterial: "静默X型校准核心", protocolMaterial: "静默X型改良协议", protocolChance: 0.02,
      combatBalance: { hp: 1.15, damage: 1.10, finalHp: 1.30, finalDamage: 1.05 },
      waves: [
        { name: "同化中枢外围控制", hpMult: 0.85, damageMult: 0.85, escortNormal: 1, coreChance: 0.15 },
        { name: "同化中枢防御矩阵", hpMult: 0.95, damageMult: 0.95, escortNormal: 1, coreChance: 0.18 },
        { name: "同化中枢战争节点", hpMult: 1.05, damageMult: 1.05, escortNormal: 1, coreChance: 0.21 },
        { name: "同化中枢核心设施", hpMult: 1.12, damageMult: 1.12, escortNormal: 1, coreChance: 0.24 },
        { name: "同化中枢主力编队", hpMult: 1.20, damageMult: 1.20, escortNormal: 2, coreChance: 0.28 },
        { name: "静默同化中枢监督者", hpMult: 1.30, damageMult: 1.30, escortNormal: 2, coreChance: 0.40, final: true },
      ] },

    // ---- 10/10 先驱：数据先落库、入口暂不做（band=0）----
    { id: "precursor_ded_10_10", name: "先驱10/10深渊回响", faction: "precursor", dedTier: 10, band: 0,
      ticket: "ds_tk_precursor_10", ticketName: "先驱深渊回响通行密钥", ticketChances: { elite: 0.05, boss: 0.05 },
      maxWave: 6, waveLp: 6, clearLpBonus: 120,
      stationCoreDrops: [{ coreId: "precursor", resourceId: "空间站先驱核心", qty: 1, chances: { boss: 0.01 } }],
      combatBalance: { hp: 1, damage: 1, finalHp: 1, finalDamage: 1 },
      waves: [
        { name: "深渊回响·回响前哨",   hpMult: 0.06, damageMult: 0.06, escortNormal: 1, coreChance: 0.15 },
        { name: "深渊回响·亡灵游猎",   hpMult: 0.12, damageMult: 0.12, escortNormal: 1, coreChance: 0.18 },
        { name: "深渊回响·统御哨戒",   hpMult: 0.20, damageMult: 0.20, escortNormal: 2, coreChance: 0.21 },
        { name: "深渊回响·亡灵编队",   hpMult: 0.35, damageMult: 0.35, escortNormal: 2, coreChance: 0.24 },
        { name: "深渊回响·战争领主前卫", hpMult: 0.55, damageMult: 0.55, escortNormal: 2, coreChance: 0.28 },
        { name: "深渊回响·亡灵统御者", hpMult: 1.00, damageMult: 1.00, escortNormal: 2, coreChance: 0.45, final: true },
      ] },
  ];

  const BY_ID = {};
  for (const s of SITES) BY_ID[s.id] = s;

  // 本星系的副本：band + faction 唯一确定一个；先驱（band=0）无星系挂点。
  function siteFor(band, faction) {
    for (const s of SITES) if (s.band === band && s.faction === faction) return s;
    return null;
  }

  function tickets() { return SITES.map(s => s.ticket); }

  // ===== 探针掉落（2026-11-27 P6；1 代 data/combat.js:436-484 逐值照搬）=====
  // 死亡空间掉「探针本体」，与考古稀有池的「抄本 BPC」两条路径并行。
  // 本作资源 id 用 probe:<id>（resources.js 已注册），实测存进 state.archaeology.probes[id]。
  // 小怪概率 = 首领概率 × 0.25（1 代 DEATHSPACE_PROBE_NORMAL_RATIO），一本里每波有
  //   1 个 leader（boss kind）+ escortNormal 个小怪，普通小怪才是数量主体，故不能只挂 boss。
  const PROBE_NORMAL_RATIO = 0.25;
  const PROBE_DROPS = {
    // 势力探针：按敌人势力绑定，仅该势力的指定 tier 副本掉。
    angel:  { probe: "faction_probe_i",   byTier: { 2: { boss: 0.08, qty: 1 }, 3: { boss: 0.10, qty: 2 }, 4: { boss: 0.12, qty: 2 }, 6: { boss: 0.15, qty: 3 } } },
    blood:  { probe: "faction_probe_ii",  byTier: { 4: { boss: 0.10, qty: 2 }, 6: { boss: 0.13, qty: 2 } } },
    sansha: { probe: "faction_probe_iii", byTier: { 6: { boss: 0.10, qty: 2 } } },
  };
  // 深层先驱探针 IV：任意势力的 8/10（tier8）与 10/10（tier10）副本都掉。
  const DEEP_PROBE = { probe: "deep_probe_iv", byTier: { 8: { boss: 0.12, qty: 2 }, 10: { boss: 0.18, qty: 3 } } };

  // 返回某副本的所有探针掉落配置：[{ probe, bossChance, normalChance, qty }]。无配置 → []。
  function probeDropsFor(site) {
    if (!site) return [];
    const out = [];
    const f = PROBE_DROPS[site.faction];
    if (f && f.byTier[site.dedTier]) {
      const t = f.byTier[site.dedTier];
      out.push({ probe: f.probe, bossChance: t.boss, normalChance: t.boss * PROBE_NORMAL_RATIO, qty: t.qty });
    }
    if (DEEP_PROBE.byTier[site.dedTier]) {
      const t = DEEP_PROBE.byTier[site.dedTier];
      out.push({ probe: DEEP_PROBE.probe, bossChance: t.boss, normalChance: t.boss * PROBE_NORMAL_RATIO, qty: t.qty });
    }
    return out;
  }

  return { SITES, BY_ID, TIER_BAND, siteFor, tickets, byId: function (id) { return BY_ID[id] || null; },
    PROBE_NORMAL_RATIO, PROBE_DROPS, DEEP_PROBE, probeDropsFor };
});
