// ================================================================
// 深空星疆 —— Engine.ShipEnhancement：舰船强化等级加成（§14 舰船装配）
// 机制复刻 1 代（EVE-IDLE）getShipEnhancementBonuses：每 5 级一档，blocks=floor(L/5)、rem=L%5。
// IP 解耦：无 EVE 裸名。中文名由 UI 层处理。
// 适配：深空星疆成员以单舰执行全部活动（考古/战斗/工业），故所有舰都同时给
//   hp / 伤害 / 考古扫描 三项倍率（1 代考古舰才给扫描，此处放宽以让强化对考古有意义）。
//   工业倍率仅工业舰生效（当前成员舰无工业舰，恒 1）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.ShipEnhancement = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.ShipEnhancement = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalizeLevel(value) { return Math.max(0, Math.floor(Number(value) || 0)); }

  // 强化倍率（纯函数，存档无关）
  // 返回 { hpMultiplier, damageMultiplier, archaeologyScanMultiplier, industryMultiplier }
  function getBonuses(shipId, enhancementLevel) {
    const level = normalizeLevel(enhancementLevel);
    const blocks = Math.floor(level / 5);
    const remainder = level % 5;
    const growth = 1 + blocks * 0.05 + remainder * 0.005;          // +5%/档，+0.5%/余级
    const damage = 1 + blocks * 0.025 + remainder * 0.0025;         // +2.5%/档
    return {
      hpMultiplier: growth,
      damageMultiplier: damage,
      archaeologyScanMultiplier: growth,                            // 放宽：成员舰均享扫描成长
      industryMultiplier: 1,                                        // 工业舰另行开启
    };
  }

  // 是否为里程碑等级（每 5 级）
  function isMilestone(level) {
    const n = normalizeLevel(level);
    return n > 0 && n % 5 === 0;
  }

  return { normalizeLevel, getBonuses, isMilestone };
});
