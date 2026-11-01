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

  // 某据点当前参战人数（权威来源 = member.assignment，不是任何名册副本）
  function fightingAt(state, nodeId) {
    let n = 0;
    for (const m of (state.members || [])) {
      if (m.destroyed || !m.assignment || m.assignment.type !== "combat") continue;
      if (m.assignment.nodeId === nodeId) n++;
    }
    return n;
  }

  // 编制上限（科技解锁 1→2→3，见 engine/tech.js）
  function squadCapOf(state) {
    const Tech = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Tech : null;
    return Tech ? Tech.squadCapacity(state) : 1;
  }

  function assign(state, memberId, type, opts) {
    const m = findMember(state, memberId);
    if (!m) return { ok: false, err: "成员不存在" };
    if (m.destroyed) return { ok: false, err: "成员已阵亡" };
    opts = opts || {};
    // develop 已退役（2026-10-27 设施化）：行星产出走 Engine.Sites 采集装置，成员不再驻留行星
    if (type === "mine" || type === "explore" || type === "combat" || type === "train" || type === "transport" || type === "logistics") {
      const nodeId = opts.nodeId || state.base.nodeId;

      // 战斗 = 唯一有门禁的派遣类型（2026-11-01）：
      //   ① 目标必须是星图上的具名据点（node.raid），普通采矿节点不能剿匪
      //   ② 该据点参战人数不得超过编制上限（Engine.Tech.squadCapacity）
      //   门禁放在这里而不是 UI：容量原本挂在 state.squad 上，被 assign 直派完全绕过
      //   （实测容量 1 能派 6 人，收益 6 倍）。现在只有这一条路，绕不过去。
      if (type === "combat") {
        const Raids = (Data && Data.Raids) ? Data.Raids : null;
        const raid = (Raids && state.starMap) ? Raids.raidAt(state.starMap, nodeId) : null;
        if (!raid) return { ok: false, err: "该星系没有海盗据点，无法剿匪" };
        const cap = squadCapOf(state);
        const already = !!(m.assignment && m.assignment.type === "combat" && m.assignment.nodeId === nodeId);
        if (!already && fightingAt(state, nodeId) >= cap) {
          return { ok: false, err: "据点编制已满（上限 " + cap + " 人，研究「战斗编制」可提升）" };
        }
      }

      m.assignment = {
        type: type,
        nodeId: nodeId,
        bodyId: opts.bodyId || null,   // 星系内天体（belt/planet/derelict）：采矿/勘探/考古精确落点
        focus: opts.focus || null,     // 考古焦点（残骸场自选：salvage/research/cache）；非残骸场为 null
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

  // ⚠️ 2026-11-01 删除 squadUpgrade / squadAdd / squadRemove / squadDeploy / squadRecall。
  //    那套「持久小队名册 + 部署」与 member.assignment 是两套重复状态：
  //    容量门禁写在 squad 上，assign 直派完全绕过；recall 单人后 id 残留在名册里；
  //    squad.targetId 与 assignment 脱节后 UI 判定「这里有小队」而实际无人。
  //    现在唯一权威 = assignment；派多少人由据点派遣面板一次选定（见 ui/app.js raidPanel）。

  // 批量派遣到同一据点（派遣面板一次提交）：逐个走上方的 assign，任一人失败不影响其他人，
  // 但整体若一个人都没派出去则返回失败。
  function assignGroup(state, memberIds, nodeId) {
    const ok = [], fail = [];
    for (const id of (memberIds || [])) {
      const r = assign(state, id, "combat", { nodeId: nodeId });
      if (r.ok) ok.push(id); else fail.push({ id: id, err: r.err });
    }
    if (!ok.length) return { ok: false, err: (fail[0] && fail[0].err) || "无可派遣成员", fail: fail };
    return { ok: true, assigned: ok.length, fail: fail };
  }

  // 召回该据点全部参战成员
  function recallGroup(state, nodeId) {
    let n = 0;
    for (const m of (state.members || [])) {
      if (m.destroyed || !m.assignment || m.assignment.type !== "combat") continue;
      if (m.assignment.nodeId !== nodeId) continue;
      if (recall(state, m.id).ok) n++;
    }
    return { ok: n > 0, recalled: n };
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

  return {
    assign, recall, findMember, primaryOre, bodyById,
    fightingAt, squadCapOf, assignGroup, recallGroup,
  };
});
