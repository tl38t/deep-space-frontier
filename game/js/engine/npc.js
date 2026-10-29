// ================================================================
// 深空星疆 —— Engine.Npc：成员人生目的系统（设计草案 ⑤）
// 每个 NPC 随机 3 个人生目的（visit / bindShip / giveItem），
// 达成后给该 NPC 一个全局经验乘区 goalXp（各目的 reward 累乘）。
// 纯函数 + O(1) 聚合，不触碰 settle 热循环（§14.5 红线）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Npc = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Npc = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Data = (typeof window !== "undefined" ? window.NSK.Data : null);

  // 三档经验倍率（用户原话：达成 ×1.1 / ×1.2 / ×1.3）
  const REWARDS = [1.1, 1.2, 1.3];

  // ---- 确定性 rng（用于老档迁移，按 member id 稳定派生）----
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || "seed");
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ---- 数据源查询 ----
  function regionDefs() { return (Data && Data.StarMap && Data.StarMap.REGION_DEFS) || []; }
  function shipIdAtTier(tier) {
    const S = (Data && Data.Ships && Data.Ships.SHIPS) || {};
    for (const k of Object.keys(S)) if (S[k].classTier === tier) return k;
    let best = null;
    for (const k of Object.keys(S)) if (!best || S[k].classTier > S[best].classTier) best = k;
    return best;
  }
  function shipNameAtTier(tier) { const id = shipIdAtTier(tier); const S = (Data && Data.Ships && Data.Ships.SHIPS) || {}; return id ? S[id].name : "未知舰"; }
  function shipTierOf(shipId) { const S = (Data && Data.Ships && Data.Ships.SHIPS) || {}; return (shipId && S[shipId]) ? S[shipId].classTier : 1; }
  function giftPool() {
    const R = (Data && Data.Resources) || null;
    if (!R || !R.ALL) return [];
    return Object.keys(R.ALL).filter(k => {
      const c = (R.meta(k) || {}).cat;
      return c === "ore" || c === "gas" || c === "mineral" || c === "component" || c === "blueprint";
    });
  }

  // ---- 生成 3 个目的：visit / bindShip / giveItem 各一，reward 随机分配 ----
  function rollGoals(rng) {
    const rewards = shuffle(REWARDS, rng);
    const regs = regionDefs();
    const reg = regs.length ? regs[Math.floor(rng() * regs.length)] : { name: "未知星域" };
    const regIdx = regs.indexOf(reg);
    const tier = 2 + Math.floor(rng() * 3); // 2..4（铁卫级 → 星渊泰坦档）
    const pool = giftPool();
    const item = pool.length ? pool[Math.floor(rng() * pool.length)] : "fe_alloy";
    const giveCredits = rng() < 0.5;
    return [
      { type: "visit", target: "region_" + regIdx, targetName: reg.name, reward: rewards[0], done: false },
      { type: "bindShip", targetTier: tier, reward: rewards[1], done: false },
      { type: "giveItem", target: giveCredits ? "credits" : item, reward: rewards[2], done: false },
    ];
  }
  function rollGoalsFor(memberId) { return rollGoals(mulberry32(hashSeed(memberId))); }

  // ---- 聚合（O(1)）：done 目的 reward 累乘 → mods.goalXp ----
  function recomputeGoalXp(m) {
    let x = 1;
    for (const g of (m.goals || [])) if (g.done) x *= g.reward;
    if (!m.mods) m.mods = {};
    m.mods.goalXp = x;
    return x;
  }

  // ---- 追踪：派遣到目标星域节点 → 命中 visit ----
  function noteVisit(member, node) {
    if (!node || !member.goals) return;
    for (const g of member.goals) {
      if (g.type === "visit" && !g.done && node.region === g.target) g.done = true;
    }
    recomputeGoalXp(member);
  }

  // ---- 追踪：赠予道具 / 星币（道具消失）----
  function completeGiveItem(state, member, goal) {
    if (goal.done) return { ok: false, err: "目的已达成" };
    const R = (Data && Data.Resources) || null;
    if (goal.target === "credits") {
      const cost = 500; // 待标定
      if ((state.res.credits || 0) < cost) return { ok: false, err: "星币不足（需 " + cost + "）" };
      state.res.credits -= cost;
    } else {
      if ((state.res[goal.target] || 0) < 1) return { ok: false, err: "缺少道具：" + (R && R.meta(goal.target) ? R.meta(goal.target).name : goal.target) };
      state.res[goal.target] -= 1;
    }
    goal.done = true;
    recomputeGoalXp(member);
    checkMilestones(state, member);
    return { ok: true };
  }

  // ---- 追踪：满足舰船目的（扣材料，把舰船升到目标档并刷新三防上限）----
  function completeBindShip(state, member, goal) {
    if (goal.done) return { ok: false, err: "目的已达成" };
    const S = (Data && Data.Ships && Data.Ships.SHIPS) || {};
    const id = shipIdAtTier(goal.targetTier);
    const def = S[id];
    if (!def) return { ok: false, err: "目标舰船不存在" };
    const cost = def.cost || {};
    for (const k in cost) {
      if ((state.res[k] || 0) < cost[k]) {
        const R = (Data && Data.Resources) || null;
        return { ok: false, err: "材料不足：" + (R && R.meta(k) ? R.meta(k).name : k) };
      }
    }
    for (const k in cost) state.res[k] -= cost[k];
    member.shipId = id;
    const hp = (Data && Data.Ships) ? Data.Ships.maxHp(id) : null;
    if (hp) member.hp = { shield: hp.shield, armor: hp.armor, structure: hp.structure };
    goal.done = true;
    recomputeGoalXp(member);
    checkMilestones(state, member);
    return { ok: true, shipName: def.name };
  }

  // ---- UI 文案 ----
  function goalIcon(g) { return g.type === "visit" ? "🌌" : g.type === "bindShip" ? "🚀" : "🎁"; }
  function goalLabel(g) {
    const R = (Data && Data.Resources) || null;
    if (g.type === "visit") return "参观 " + g.targetName;
    if (g.type === "bindShip") return "配备 " + shipNameAtTier(g.targetTier) + "（及以上）";
    if (g.type === "giveItem") return g.target === "credits" ? "赠予 500 星币" : "赠予 " + (R && R.meta(g.target) ? R.meta(g.target).name : g.target);
    return "?";
  }
  function goalHint(g) {
    if (g.type === "visit") return "将该成员派遣到 " + g.targetName + " 内的星系即可达成";
    if (g.type === "bindShip") return "消耗材料为其配备 " + shipNameAtTier(g.targetTier) + " 级舰船";
    if (g.type === "giveItem") return g.target === "credits" ? "消耗 500 星币赠予该成员" : "从库存消耗 1 份指定道具赠予（道具消失）";
    return "";
  }

  // ============================================================
  // 行为里程碑（称号/勋章，2026-10-27 周六）
  // 纯函数判定：只读成员已有状态（技能累加器 / 人生目的 done / 词条），不新增计时器、
  // 不逐 tick 累加 → 不踩 §14.5 红线。check 幂等：已得 id 不重复发。
  // 发奖：个人功勋 +1、日报一条、精通点 +1（Mastery 可用时）。
  // ============================================================
  function lvOf(xp) {
    const x = Number(xp) || 0;
    if (x <= 0) return 1;
    return 1 + Math.floor(Math.log(x / 1000 + 1) / Math.log(1.1));
  }
  function doneCount(m) {
    let n = 0;
    for (const g of (m && m.goals) || []) if (g.done) n++;
    return n;
  }
  function maxSkillLevel(m) {
    let mx = 1;
    const sk = (m && m.skills) || {};
    for (const k in sk) { const l = lvOf(sk[k]); if (l > mx) mx = l; }
    return mx;
  }
  function countAtLeast(m, n) {
    let c = 0;
    const sk = (m && m.skills) || {};
    for (const k in sk) if (lvOf(sk[k]) >= n) c++;
    return c;
  }
  function lv(m, k) { return lvOf(m && m.skills ? m.skills[k] : 0); }

  const MILESTONES = [
    { id: "ms_first_goal", title: "初心得偿", icon: "🎖", desc: "达成第 1 个人生目的", test: m => doneCount(m) >= 1 },
    { id: "ms_all_goals", title: "此生无憾", icon: "🏅", desc: "达成全部 3 个人生目的", test: m => doneCount(m) >= 3 },
    { id: "ms_lv5", title: "熟练工", icon: "◆", desc: "任一技能达到 Lv5", test: m => maxSkillLevel(m) >= 5 },
    { id: "ms_lv10", title: "行家", icon: "◆◆", desc: "任一技能达到 Lv10", test: m => maxSkillLevel(m) >= 10 },
    { id: "ms_multi5", title: "多面手", icon: "✦", desc: "3 项技能达到 Lv5", test: m => countAtLeast(m, 5) >= 3 },
    { id: "ms_combat8", title: "百战老兵", icon: "⚔", desc: "战斗三技（激光/炮台/指挥）任一达到 Lv8", test: m => Math.max(lv(m, "combatLaser"), lv(m, "combatTurret"), lv(m, "command")) >= 8 },
    { id: "ms_industry8", title: "工业骨干", icon: "⚙", desc: "精炼/制造/发明任一达到 Lv8", test: m => Math.max(lv(m, "refine"), lv(m, "manufacture"), lv(m, "invent")) >= 8 },
    { id: "ms_explorer6", title: "深空测绘师", icon: "🛰", desc: "扫描/考古任一达到 Lv6", test: m => Math.max(lv(m, "scanning"), lv(m, "archaeology")) >= 6 },
  ];

  function milestoneById(id) { for (const ms of MILESTONES) if (ms.id === id) return ms; return null; }
  function milestoneList(m) {
    const ids = (m && m.milestones) || [];
    const out = [];
    for (const id of ids) { const ms = milestoneById(id); if (ms) out.push(ms); }
    return out;
  }

  // 幂等检查：返回本次新获得的里程碑数组（已得的跳过）。
  function checkMilestones(state, m) {
    if (!m) return [];
    if (!Array.isArray(m.milestones)) m.milestones = [];
    const got = [];
    for (const ms of MILESTONES) {
      if (m.milestones.indexOf(ms.id) >= 0) continue;
      let hit = false;
      try { hit = !!ms.test(m); } catch (e) { hit = false; }
      if (!hit) continue;
      m.milestones.push(ms.id);
      m.merit = (m.merit || 0) + 1;
      got.push(ms);
      if (state && Array.isArray(state.reports)) {
        state.reports.unshift({
          ts: Date.now(),
          title: "里程碑 · " + ms.title,
          lines: [m.name + " 获得称号「" + ms.title + "」（" + ms.desc + "），个人功勋 +1。"],
        });
        if (state.reports.length > 30) state.reports.length = 30;
      }
    }
    return got;
  }

  return {
    REWARDS, hashSeed, mulberry32, rollGoals, rollGoalsFor,
    recomputeGoalXp, noteVisit, completeGiveItem, completeBindShip,
    goalIcon, goalLabel, goalHint, shipNameAtTier, shipIdAtTier, shipTierOf,
    MILESTONES, milestoneById, milestoneList, checkMilestones,
  };
});
