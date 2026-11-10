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

  // ---- ② 2 代强化系统：成本 / 成功率预览 / 入队前置（实装 2026-11-10）----
  // 材料曲线：指数 N(L)=2^floor(L/5)（用户选定「最陡硬核墙」）。
  function N(L) { return Math.pow(2, Math.floor(normalizeLevel(L) / 5)); }

  // 需求刻度（小刻度，避免「永远拿不到加成」死区）：护卫/驱逐1、巡洋/战列巡洋2、战列/旗舰3、
  //   超级旗舰4、泰坦6（泰坦更高门槛）。直接由 ship.classTier 派生。
  function reqOf(shipId) {
    const Ships = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.Ships : null;
    const s = Ships ? Ships.shipById(shipId) : null;
    const t = s ? (s.classTier || 1) : 1;
    return t >= 5 ? 6 : t;
  }

  // 成员某技能等级（经验→等级，无封顶，复用 Settle.levelOf；Settle 晚注册则惰性取用）
  function memberSkillLevel(member, key) {
    const Settle = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null;
    const xp = (member && member.skills) ? (member.skills[key] || 0) : 0;
    if (Settle && Settle.levelOf) return Settle.levelOf(xp);
    return 1 + Math.floor(Math.log(xp / 1000 + 1) / Math.log(1.1)); // 兜底（与 Settle.levelOf 同口径）
  }

  // 升到 L→L+1 的单次成本（强化「每次尝试」=升一级，失败照扣）。返回资源键→数量 的 dict。
  //   · 三件套组件：ship.cost 全部键 × N(L)（与造船同源，随等级指数递增）
  //   · 星币：按 classTier 基础 × N(L)（提议值，待标定）
  //   · 泰坦舰额外料：星骸钛晶×2 / 相位铱核×1 × N(L)（虫洞事件产出，暂挂虫洞）
  function getCost(state, member, shipId, L) {
    L = normalizeLevel(L);
    const Ships = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.Ships : null;
    const ship = Ships ? Ships.shipById(shipId) : null;
    if (!ship) return null;
    const n = N(L);
    const cost = {};
    for (const k in (ship.cost || {})) cost[k] = (ship.cost[k] || 0) * n;
    const tier = ship.classTier || 1;
    const creditsBase = ({ 1: 50000, 2: 200000, 3: 600000, 4: 1000000, 5: 2000000 })[tier] || 50000;
    cost.credits = creditsBase * n;
    if (tier >= 5) {
      cost.star_corpse_titanium = (cost.star_corpse_titanium || 0) + 2 * n;
      cost.phase_iridium_core = (cost.phase_iridium_core || 0) + 1 * n;
    }
    return cost;
  }

  // 强化预览：成本 + 成功率 + 升后加成（供 UI 展示，不落库）
  function getPreview(state, member, shipId, L) {
    const cost = getCost(state, member, shipId, L);
    if (!cost) return null;
    const Ships = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.Ships : null;
    const ship = Ships ? Ships.shipById(shipId) : null;
    if (!ship) return null;
    const req = reqOf(shipId);
    const eng = memberSkillLevel(member, "manufacture");
    const Ch = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.EnhancementChance : null;
    const chanceVal = Ch ? Ch.chance(eng, req, L) : 0;
    const bonusAfter = getBonuses(shipId, L + 1);
    return { cost: cost, chance: chanceVal, req: req, eng: eng, fromLevel: L, toLevel: L + 1, bonusAfter: bonusAfter };
  }

  return { normalizeLevel, getBonuses, isMilestone, N, reqOf, memberSkillLevel, getCost, getPreview };
});
