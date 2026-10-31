/* 深空星疆 · 敌方编队数据（data/pirates.js）
 *
 * 作用：给 5 档安等（PIRATE_POWER 14/28/46/72/110）各配一支敌方编队模板，
 *       提供「每艘敌舰的名字/标签/三防血量」与「编队每秒伤害」，供战斗齐射模型与战斗面板使用。
 *
 * 数值标定（全部为提议值，待实测标定）：
 *   编队总血 = 海盗战力 × HP_PER_POWER，故「一波时长 = 编队总血 ÷ 我方DPS」
 *   与「每波掉落 ÷ 旧每秒速率」两条路推导出的波时长完全一致（见 combat.js 注释）。
 *   这意味着：引入编队/血条/受击后，每秒收益与旧连续速率公式精确等价，经济零漂移。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    var NSK = root.NSK || (root.NSK = {});
    NSK.Data = NSK.Data || {};
    NSK.Data.Pirates = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 海盗战力分档（与 starmap.js PIRATE_POWER 同源；此处冗余一份用于血量标定，data 层自洽）
  const PIRATE_POWER = { 1: 14, 2: 28, 3: 46, 4: 72, 5: 110 };

  // 编队总血量 = 海盗战力 × 该系数（标定锚点，改动会同时改变波时长与收益速率）
  const HP_PER_POWER = 60;
  // 编队每秒伤害 = 海盗战力 × 该系数（我方受击强度；高安温和、深空致命）
  // 标定目标：高安单成员约 8 分钟才需返港，0.0 区约 1 分钟即被打穿（安全度差异由此体现）
  const DPS_PER_POWER = 0.15;
  // 三防拆分比例（护盾在前，符合先扣盾后扣甲的直觉）
  const HP_SPLIT = { shield: 0.50, armor: 0.30, structure: 0.20 };

  // 各势力舰种名（原创中文名，与 IP 护栏一致：不出现任何 EVE 字面商标）
  const SHIP_NAMES = {
    angel:  { scout: "侦察艇",   raider: "突击舰",   captain: "指挥舰",   heavy: "重炮舰" },
    blood:  { scout: "侍僧艇",   raider: "圣礼舰",   captain: "主教座舰", heavy: "苦修舰" },
    sansha: { scout: "探针",     raider: "集群舰",   captain: "枢机核心", heavy: "同步舰" },
  };
  const FACTION_NAME = { angel: "苍穹劫团", blood: "赤誓教团", sansha: "静默集群" };

  // 每档编队的舰种构成（w = 血量占比，合计 1.0）
  const BAND_TEMPLATES = {
    1: { title: "游猎编队", ships: [
      { t: "scout",   kind: "normal", w: 0.25 },
      { t: "scout",   kind: "normal", w: 0.25 },
      { t: "raider",  kind: "elite",  w: 0.50 },
    ] },
    2: { title: "劫掠编队", ships: [
      { t: "scout",   kind: "normal", w: 0.22 },
      { t: "raider",  kind: "elite",  w: 0.33 },
      { t: "captain", kind: "boss",   w: 0.45 },
    ] },
    3: { title: "猎杀编队", ships: [
      { t: "raider",  kind: "elite",  w: 0.28 },
      { t: "raider",  kind: "elite",  w: 0.28 },
      { t: "captain", kind: "boss",   w: 0.44 },
    ] },
    4: { title: "深空战团", ships: [
      { t: "raider",  kind: "elite",  w: 0.24 },
      { t: "heavy",   kind: "elite",  w: 0.32 },
      { t: "captain", kind: "boss",   w: 0.44 },
    ] },
    5: { title: "旗舰战团", ships: [
      { t: "heavy",   kind: "elite",  w: 0.26 },
      { t: "heavy",   kind: "elite",  w: 0.26 },
      { t: "captain", kind: "boss",   w: 0.48 },
    ] },
  };

  const KIND_CN = { normal: "普通", elite: "精英", boss: "BOSS" };

  function clampBand(band) {
    const b = Math.round(Number(band) || 1);
    return Math.min(5, Math.max(1, b));
  }

  // 编队总血量（确定性，与战力线性）
  function totalHp(band) {
    const b = clampBand(band);
    return PIRATE_POWER[b] * HP_PER_POWER;
  }

  // 编队每秒伤害（打我方）
  function fleetDps(band) {
    const b = clampBand(band);
    return PIRATE_POWER[b] * DPS_PER_POWER;
  }

  // 展开单个敌舰的三防血量（按占比拆分总血，取整避免浮点毛刺）
  function shipHp(total, w) {
    const hp = Math.max(1, Math.round(total * w));
    const shield = Math.round(hp * HP_SPLIT.shield);
    const armor = Math.round(hp * HP_SPLIT.armor);
    const structure = Math.max(1, hp - shield - armor);
    return { shield: shield, armor: armor, structure: structure };
  }

  // 生成某档某势力的敌方编队（确定性：同 band + faction 恒等，便于存档/回放/探针）
  // 返回 { band, faction, factionName, title, ships:[{id,name,kind,kindCn,hp:{...},maxHp:{...},total}], totalHp, dps }
  function fleetFor(band, faction) {
    const b = clampBand(band);
    const fac = SHIP_NAMES[faction] ? faction : "sansha";
    const tpl = BAND_TEMPLATES[b];
    const TH = totalHp(b);
    const ships = tpl.ships.map(function (s, i) {
      const maxHp = shipHp(TH, s.w);
      const total = maxHp.shield + maxHp.armor + maxHp.structure;
      return {
        id: b + "_" + fac + "_" + s.t + "_" + i,
        type: s.t,
        name: (FACTION_NAME[fac] || "") + SHIP_NAMES[fac][s.t],
        kind: s.kind,
        kindCn: KIND_CN[s.kind] || "普通",
        maxHp: maxHp,
        hp: { shield: maxHp.shield, armor: maxHp.armor, structure: maxHp.structure },
        total: total,
      };
    });
    return {
      band: b,
      faction: fac,
      factionName: FACTION_NAME[fac] || "",
      title: tpl.title,
      ships: ships,
      totalHp: ships.reduce(function (a, s) { return a + s.total; }, 0),
      dps: fleetDps(b),
      piratePower: PIRATE_POWER[b],
    };
  }

  return {
    PIRATE_POWER: PIRATE_POWER,
    HP_PER_POWER: HP_PER_POWER,
    DPS_PER_POWER: DPS_PER_POWER,
    BAND_TEMPLATES: BAND_TEMPLATES,
    KIND_CN: KIND_CN,
    totalHp: totalHp,
    fleetDps: fleetDps,
    fleetFor: fleetFor,
  };
});
