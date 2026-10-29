// ================================================================
// 深空星疆 —— Engine.Combat：战斗（MVP 最小占位）
// 成员派 combat 时由 settle 直接累加声望/战利品（连续速率，见 settle.js）。
// 本文件预留军团小队战斗力估算与未来离散战斗结算接口。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Combat = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Combat = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 军团小队战斗力（占位：= 在战成员 三武器技能等级之和，未来接舰船/装备）
  function squadPower(state) {
    const Settle = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null;
    let p = 0;
    for (const m of state.members) {
      if (m.status === "dispatched" && m.assignment && m.assignment.type === "combat" && !m.destroyed) {
        // 三武器技能（激光/炮台/指挥）等级求和，复用 EVE-IDLE 玩家等级（无上限）
        p += Settle ? (Settle.levelOf(m.skills.combatLaser) + Settle.levelOf(m.skills.combatTurret) + Settle.levelOf(m.skills.command)) : 3;
      }
    }
    return p;
  }

  // 指定星系的当前剿匪战力（= 在该节点 combat 的成员三武器等级之和）。O(1) 单次调用。
  function squadPowerAtNode(state, nodeId) {
    const Settle = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null;
    let p = 0;
    for (const m of state.members) {
      if (m.status === "dispatched" && m.assignment && m.assignment.type === "combat" && m.assignment.nodeId === nodeId && !m.destroyed) {
        p += Settle ? (Settle.levelOf(m.skills.combatLaser) + Settle.levelOf(m.skills.combatTurret) + Settle.levelOf(m.skills.command)) : 3;
      }
    }
    return p;
  }

  // 小队容量（复用 EVE-IDLE 研究门禁：1→2→3 人，由 base.squadTier 升级解锁）
  function getSquadCapacity(state) {
    return 1 + (state && state.base && typeof state.base.squadTier === "number" ? state.base.squadTier : 0);
  }

  // 参战资格判定（稳定 reason，不抛异常；复用 EVE-IDLE canLegionNpcJoinCombat 约定）
  function canJoinSquad(state, memberId) {
    if (!state || !state.squad) return { ok: false, reason: "no-squad" };
    const m = (state.members || []).find(x => x.id === memberId);
    if (!m) return { ok: false, reason: "not-found" };
    if (m.destroyed) return { ok: false, reason: "destroyed" };
    if (state.squad.members.includes(memberId)) return { ok: false, reason: "already-in-squad" };
    const cap = getSquadCapacity(state);
    if (state.squad.members.length >= cap) return { ok: false, reason: "squad-full" };
    if (m.status !== "idle") return { ok: false, reason: "busy" };
    return { ok: true, member: m };
  }

  // 未来离散战斗结算钩子（MVP 未启用）。
  // 深空星疆战斗坚持轻量化：结算钩子只做 O(1) 战力比较，禁止进入逐波/逐回合仿真。
  // 若未来要做「战术副本」等离散战斗，必须走 §14.7 的「benchmark 首波 × 总波数」闭式，
  // 成本与离线时长无关（O(1)），绝不允许 recordKill 式逐击杀簿记或 N 级变量链。
  function resolveSquad(state, enemyPower) {
    return { win: squadPower(state) >= enemyPower, power: squadPower(state) };
  }

  return { squadPower, squadPowerAtNode, getSquadCapacity, canJoinSquad, resolveSquad };
});
