// ================================================================
// 深空星疆 —— Engine.Dispatch：成员派遣（assignment 层，§4/§13）
// 每个成员是并发活动单元：可派往节点做 mine/explore/combat/train/transport。
// 无并发上限（名册 20 全员可同时干活）。召回回基地待命。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Dispatch = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Dispatch = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Data = (typeof window !== "undefined" ? window.NSK.Data : null);

  function findMember(state, id) { return state.members.find(m => m.id === id) || null; }

  function assign(state, memberId, type, opts) {
    const m = findMember(state, memberId);
    if (!m) return { ok: false, err: "成员不存在" };
    if (m.destroyed) return { ok: false, err: "成员已阵亡" };
    opts = opts || {};
    // develop 已退役（2026-10-27 设施化）：行星产出走 Engine.Sites 采集装置，成员不再驻留行星
    if (type === "mine" || type === "explore" || type === "combat" || type === "train" || type === "transport" || type === "logistics") {
      const nodeId = opts.nodeId || state.base.nodeId;
      m.assignment = {
        type: type,
        nodeId: nodeId,
        bodyId: opts.bodyId || null,   // 星系内天体（belt/planet/derelict）：采矿/勘探/考古精确落点
        oreId: opts.oreId || null,     // 采矿目标矿（null=自动选最丰富）；belt 含全矿种，可指定稀缺矿
        startedAt: Date.now(),
        trainSkill: opts.trainSkill || "combatLaser",
        exploreProgress: 0,
        eventRoll: 0,
      };
      m.status = "dispatched";
      // 人生目的系统（⑤）：派遣到目标星域节点即达成 visit 目的
      const Npc = (typeof window !== "undefined" && window.NSK && window.NSK.Engine && window.NSK.Engine.Npc) || null;
      if (Npc && nodeId && state.starMap) {
        const node = Data.StarMap ? Data.StarMap.nodeById(state.starMap, nodeId) : null;
        if (node) Npc.noteVisit(m, node);
      }
      return { ok: true, member: m };
    }
    return { ok: false, err: "未知工作类型" };
  }

  function recall(state, memberId) {
    const m = findMember(state, memberId);
    if (!m) return { ok: false, err: "成员不存在" };
    m.assignment = null;
    m.status = "idle";
    return { ok: true };
  }

  // —— 战斗小队（复用 EVE-IDLE createDefaultSquad / 容量门禁 / 参战资格）——
  // 玩家自行组建：在 base 把空闲成员加入 squad（容量受 base.squadTier 限制 1→2→3），
  // 再派 squad 去某星系海盗据点剿匪（deploySquad 将全队置为 combat 派遣）。

  // 升级小队协议（提升容量）。cost 由调用方（UI）按 tier 计算后扣费。
  function squadUpgrade(state) {
    if (!state.squad) state.squad = { enabled: false, members: [], capacity: 1, targetId: null };
    if ((state.base.squadTier || 0) >= 2) return { ok: false, err: "已达最高小队协议" };
    state.base.squadTier = (state.base.squadTier || 0) + 1;
    state.squad.capacity = 1 + state.base.squadTier;
    return { ok: true, tier: state.base.squadTier, capacity: state.squad.capacity };
  }

  // 加入小队（资格判定复用 Combat.canJoinSquad 稳定 reason）
  function squadAdd(state, memberId) {
    const Combat = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Combat : null;
    if (!state.squad) state.squad = { enabled: false, members: [], capacity: 1, targetId: null };
    const verdict = Combat ? Combat.canJoinSquad(state, memberId) : { ok: false, reason: "no-combat" };
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
    state.squad.members.push(memberId);
    return { ok: true, members: state.squad.members.slice() };
  }

  // 退出小队
  function squadRemove(state, memberId) {
    if (!state.squad) return { ok: false, err: "无小队" };
    const i = state.squad.members.indexOf(memberId);
    if (i < 0) return { ok: false, err: "不在小队" };
    state.squad.members.splice(i, 1);
    return { ok: true, members: state.squad.members.slice() };
  }

  // 派遣小队去某星系海盗据点剿匪（全队置为 combat 派遣到 nodeId）
  function squadDeploy(state, nodeId) {
    if (!state.squad || !state.squad.members.length) return { ok: false, err: "小队为空" };
    let n = 0;
    for (const id of state.squad.members) {
      const r = assign(state, id, "combat", { nodeId: nodeId });
      if (r.ok) n++;
    }
    if (n === 0) return { ok: false, err: "无可用成员（可能均在作战/阵亡）" };
    state.squad.enabled = true;
    state.squad.targetId = nodeId;
    return { ok: true, deployed: n, nodeId: nodeId };
  }

  // 召回小队（全队回基地待命）
  function squadRecall(state) {
    if (!state.squad) return { ok: false, err: "无小队" };
    let n = 0;
    for (const id of state.squad.members) {
      const r = recall(state, id);
      if (r.ok) n++;
    }
    state.squad.enabled = false;
    state.squad.targetId = null;
    return { ok: true, recalled: n };
  }

  // 节点主矿（abundance 最高）— 采矿默认目标（无 bodyId 时回退）
  function primaryOre(map, nodeId) {
    const node = Data.StarMap.nodeById(map, nodeId);
    if (!node) return null;
    let best = null, bv = -1;
    for (const ore in node.abundance) if (node.abundance[ore] > bv) { bv = node.abundance[ore]; best = ore; }
    return best;
  }

  // 星系内天体查找（bodyId 对应）
  function bodyById(map, nodeId, bodyId) {
    if (!bodyId) return null;
    const n = Data.StarMap.nodeById(map, nodeId);
    if (!n || !n.bodies) return null;
    return n.bodies.find(b => b.id === bodyId) || null;
  }

  return { assign, recall, findMember, primaryOre, bodyById, squadUpgrade, squadAdd, squadRemove, squadDeploy, squadRecall };
});
