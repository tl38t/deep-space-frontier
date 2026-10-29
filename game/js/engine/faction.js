// ================================================================
// 深空星疆 —— Engine.Faction：势力任务刷新 / 交付
// questBoard 是工业链外部消费者（§10 C-1）：提交矿石/矿材/部件/图纸换星币+声望。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Faction = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Faction = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Data = (typeof window !== "undefined" ? window.NSK.Data : null);
  const Core = (typeof window !== "undefined" ? window.NSK.Core : null);
  const Settle = (typeof window !== "undefined" && window.NSK.Engine) ? window.NSK.Engine.Settle : null;

  function findFaction(state, id) { return state.factions.find(f => f.id === id) || null; }

  // 取名册中对某势力亲和最高的成员（用于「缴纳任务」自动享受声望/收入加成，§13.7）
  function bestAffinityMember(state, factionId) {
    let best = null, bestRep = 1;
    for (const m of state.members) {
      if (m.destroyed) continue;
      if (m.factionAffinity === factionId && m.affinity && m.affinity.repMult > bestRep) { best = m; bestRep = m.affinity.repMult; }
    }
    return best;
  }

  // 派遣任务成功率（O(1)，§14.5 红线无关，因只在玩家派遣时算一次）：
  // = 技能等级 + 绑定舰船档位(classTier) + 出身/经历（该势力突发任务成功率加值）。
  function missionSuccessChance(member, quest) {
    if (!member || !quest) return 0;
    const skillLv = Settle ? Settle.levelOf(member.skills[quest.skill] || 0) : 1;
    const ship = Data && Data.Ships ? Data.Ships.shipById(member.shipId) : null;
    const shipTier = ship ? (ship.classTier || 1) : 1;          // 绑定舰船装备（档位 1~4）
    let chance = 0.30 + skillLv * 0.025 + (shipTier - 1) * 0.07; // 技能 + 舰船
    if (member.factionAffinity === quest.factionId && member.affinity) chance += (member.affinity.urgentSuccess || 0); // 出身对该势力突发任务加值
    return Math.max(0.05, Math.min(0.97, chance));
  }

  // 内部：发奖 + 补新任务（submit / dispatch 共用）
  function grantAndRefresh(state, f, quest, repMult, creditMult) {
    const rep = Math.round(quest.reward.rep * repMult);
    const credits = Math.round(quest.reward.credits * creditMult);
    state.res.rep += rep;
    state.res.credits += credits;
    f.relation = Math.min(100, f.relation + 4);
    state.counters.delivered = (state.counters.delivered || 0) + 1;
    const rng = Core.makeRng((state.rngSeed ^ (Date.now() >>> 0) ^ Math.floor(Math.random() * 4294967296)) >>> 0);
    f.quests = f.quests.filter(x => x.id !== quest.id);
    f.quests.push(Data.Factions.generateQuest(rng, Data.Factions.factionById(f.id), state.base.bodyLevel + 1));
    // 精通点：完成一次势力任务 +2（离散发点，非 tick）
    const M = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Mastery : null;
    if (M && M.award) M.award(state, 2, "quest");
    return { rep: rep, credits: credits };
  }

  // 交付「提交类」任务（囤够物品→缴纳）。memberId 可省：省略时自动取该势力最高亲和成员享受加成。
  function deliverQuest(state, factionId, questId, memberId) {
    const f = findFaction(state, factionId);
    if (!f) return { ok: false, err: "势力不存在" };
    const q = f.quests.find(x => x.id === questId);
    if (!q) return { ok: false, err: "任务不存在" };
    if (q.mode === "dispatch") return { ok: false, err: "这是派遣任务，需用「派遣」执行" };
    if ((state.res[q.item] || 0) < q.qty) return { ok: false, err: "库存不足，无法交付" };
    state.res[q.item] = Math.max(0, state.res[q.item] - q.qty);
    const m = memberId ? state.members.find(x => x.id === memberId) : bestAffinityMember(state, factionId);
    const am = (m && m.factionAffinity === factionId && m.affinity) ? m.affinity : { repMult: 1, creditMult: 1 };
    const got = grantAndRefresh(state, f, q, am.repMult, am.creditMult);
    return { ok: true, reward: got, affinity: !!(m && m.factionAffinity === factionId) };
  }

  // 执行「派遣类」突发任务（玩家自选团员，掷一次骰判定成败，O(1)）
  function attemptMission(state, factionId, questId, memberId) {
    const f = findFaction(state, factionId);
    if (!f) return { ok: false, err: "势力不存在" };
    const q = f.quests.find(x => x.id === questId);
    if (!q) return { ok: false, err: "任务不存在" };
    if (q.mode !== "dispatch") return { ok: false, err: "这是缴纳任务，请用「交付」" };
    if (!memberId) return { ok: false, err: "需指定执行团员" };
    const m = state.members.find(x => x.id === memberId);
    if (!m || m.destroyed) return { ok: false, err: "团员不存在/已阵亡" };
    const chance = missionSuccessChance(m, q);
    // 单次确定性掷骰（种子含 rngSeed+questId+memberId+时间），无循环 → 不踩 §14.5
    let h = state.rngSeed >>> 0;
    for (const c of (questId + memberId)) h = (Math.imul(h, 0x9E3779B1) ^ c.charCodeAt(0)) >>> 0;
    h = (h ^ (Date.now() >>> 0)) >>> 0;
    const roll = Core.makeRng(h)();
    const success = roll < chance;
    let result;
    if (success) {
      const am = (m.factionAffinity === factionId && m.affinity) ? m.affinity : { repMult: 1, creditMult: 1 };
      const got = grantAndRefresh(state, f, q, am.repMult, am.creditMult);
      result = { ok: true, success: true, chance: chance, reward: got, affinity: !!(m.factionAffinity === factionId) };
      pushMissionReport(state, m.name + " 完成「" + q.title + "」", ["成功率 " + Math.round(chance * 100) + "%，掷骰 " + Math.round(roll * 100) + "% 通过，获得 💠" + got.credits + " ⭐" + got.rep + (am.repMult > 1 ? "（出身加成）" : "")]);
    } else {
      result = { ok: true, success: false, chance: chance };
      pushMissionReport(state, m.name + " 折戟「" + q.title + "」", ["成功率 " + Math.round(chance * 100) + "%，掷骰 " + Math.round(roll * 100) + "% 未过，任务失败无收益。"]);
    }
    return result;
  }

  function pushMissionReport(state, title, lines) {
    state.reports.unshift({ ts: Date.now(), title: title, lines: lines });
    if (state.reports.length > 30) state.reports.length = 30;
  }

  // 派生势力刷新专用 rng：种子基于 rngSeed + 势力 id + 该势力刷新次数（与 now/调用频率无关 → 在线离线 parity）
  function factionRng(state, f) {
    let idh = 0;
    const id = f.id || "";
    for (let i = 0; i < id.length; i++) idh = (idh * 31 + id.charCodeAt(i)) >>> 0;
    f.refreshCount = (f.refreshCount || 0) + 1;
    let s = (state.rngSeed ^ Math.imul(idh, 0x9E3779B1) ^ Math.imul(f.refreshCount, 0x85EBCA77)) >>> 0;
    return Core.makeRng(s);
  }

  // 到期刷新任务板（rng 内部派生，不依赖调用频率 → 在线离线一致）
  function refreshFactions(state, now) {
    for (const f of state.factions) {
      if (now >= f.nextRefreshAt) {
        f.quests = [Data.Factions.generateQuest(factionRng(state, f), Data.Factions.factionById(f.id), state.base.bodyLevel + 1)];
        f.nextRefreshAt = now + 6 * 3600 * 1000;
      }
    }
  }

  return { deliverQuest, attemptMission, missionSuccessChance, refreshFactions, findFaction };
});
