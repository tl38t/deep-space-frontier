// ================================================================
// 深空星疆 —— Engine.Sites：行星采集设施（EVE 式「收菜」，2026-10-27 方案 B）
// 行星不再是成员派遣岗：军团在行星部署「采集装置」（设施），装置按时间戳
// 持续产出该行星的专属产物，累积到**行星本地缓冲**（有上限，溢出浪费 =
// 收菜节奏来源）。玩家回到该星系手动回收（全额），或派驻「物流岗」成员
// 自动回收（受物流效率乘区，给物流岗一个真实职责）。
// 装置槽位数随舰基等级（bodyLevel）开放；装置等级提升产率。
// ⚠️ 标定待定（B2 提议值）：DEPLOY_COST / UP_COSTS / SITE_RATE / BUFFER_HOURS / HAUL_RATE。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Sites = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Sites = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Data = (typeof window !== "undefined" ? window.NSK.Data : null);

  // —— 标定常量（提议值，待标定）——
  const SITE_RATE = 0.45;        // Lv1 基础产率 /秒（richness=1）
  const LEVEL_MULT = 0.5;        // 每级 +50% 产率
  const MAX_LEVEL = 3;
  const BUFFER_HOURS = 6;        // 缓冲上限 = 当前产率 × 6h
  const HAUL_RATE = 0.5;         // 每名物流岗 /秒 自动回收量（再 × 物流效率）
  const DEPLOY_COST = { credits: 3000, fe_alloy: 20 };
  const UP_COSTS = { 2: { credits: 6000, ni_alloy: 10 }, 3: { credits: 12000, bo_alloy: 10 } };

  // 惰性取用 Logistics（注册顺序无关）
  function _Logi() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Logistics : null; }

  function ensure(state) { if (!state.sites || typeof state.sites !== "object") state.sites = {}; }
  function slots(state) { return 2 + ((state.base && state.base.bodyLevel) || 0) * 2; }  // Lv1 本体=2 … Lv4=8
  function byBody(state, bodyId) { ensure(state); return state.sites[bodyId] || null; }

  // 天体查找（nodeById + bodies，读星图不改数据）
  function findBody(state, nodeId, bodyId) {
    if (!Data || !Data.StarMap || !Data.StarMap.nodeById) return null;
    const node = Data.StarMap.nodeById(state.starMap, nodeId);
    if (!node || !node.bodies) return null;
    return node.bodies.find(b => b.id === bodyId) || null;
  }

  // 产物资源 id：planetType → PLANET 资源（复用 Logistics 映射）
  function resKeyOf(state, bodyId) {
    const site = byBody(state, bodyId);
    if (!site) return null;
    const body = findBody(state, site.nodeId, bodyId);
    const L = _Logi();
    return (body && L && L.resourceForPlanetType) ? L.resourceForPlanetType(body.planetType) : null;
  }

  // 产率 /秒：SITE_RATE × 等级乘区 × 行星丰度（body.id 哈希 0.8~1.4，确定性）
  function levelMult(level) { return 1 + LEVEL_MULT * ((level || 1) - 1); }
  function rateOf(state, bodyId) {
    const site = byBody(state, bodyId);
    if (!site) return 0;
    const body = findBody(state, site.nodeId, bodyId);
    const L = _Logi();
    const rich = (body && L && L.planetRichness) ? L.planetRichness(body) : 1;
    return SITE_RATE * levelMult(site.level) * rich;
  }
  function capOf(rate) { return rate * BUFFER_HOURS * 3600; }
  function capOfSite(state, bodyId) { return capOf(rateOf(state, bodyId)); }

  // —— 部署：舰基需在该星系（亲自部署），槽位 + 成本门禁 ——
  function canDeploy(state, nodeId, bodyId) {
    ensure(state);
    if (state.base.nodeId !== nodeId) return { ok: false, reason: "舰基需在该星系（亲自部署）" };
    const body = findBody(state, nodeId, bodyId);
    if (!body || body.kind !== "planet") return { ok: false, reason: "只能部署在行星" };
    if (state.sites[bodyId]) return { ok: false, reason: "该行星已有装置" };
    if (Object.keys(state.sites).length >= slots(state)) return { ok: false, reason: "装置槽已满（升级舰基核心可扩展）" };
    if ((state.res.credits || 0) < DEPLOY_COST.credits) return { ok: false, reason: "星币不足" };
    if ((state.res.fe_alloy || 0) < (DEPLOY_COST.fe_alloy || 0)) return { ok: false, reason: "标准钛材不足" };
    return { ok: true };
  }
  function deploy(state, nodeId, bodyId) {
    const chk = canDeploy(state, nodeId, bodyId);
    if (!chk.ok) return chk;
    state.res.credits -= DEPLOY_COST.credits;
    state.res.fe_alloy -= DEPLOY_COST.fe_alloy;
    state.sites[bodyId] = { bodyId: bodyId, nodeId: nodeId, level: 1, buffer: 0 };
    return { ok: true };
  }

  // —— 升级：Lv1→3，成本递增（提议值）——
  function upCost(level) { return UP_COSTS[level + 1] || null; }
  function upgrade(state, bodyId) {
    const site = byBody(state, bodyId);
    if (!site) return { ok: false, reason: "无装置" };
    const cost = upCost(site.level);
    if (!cost) return { ok: false, reason: "已满级" };
    if ((state.res.credits || 0) < cost.credits) return { ok: false, reason: "星币不足" };
    for (const k in cost) { if (k !== "credits" && (state.res[k] || 0) < cost[k]) return { ok: false, reason: "材料不足" }; }
    state.res.credits -= cost.credits;
    for (const k in cost) { if (k !== "credits") state.res[k] -= cost[k]; }
    site.level += 1;
    return { ok: true };
  }

  // —— 结算：产缓冲（封顶溢出浪费）+ 物流岗自动回收 ——
  // O(设施数)，与成员产出同一 dt（时间戳驱动，离线同核）。
  function tick(state, dt) {
    ensure(state);
    const L = _Logi();
    if (!L) return;
    // 预聚合每个节点的物流岗人数（O(成员数) 单次扫描）
    const logiByNode = {};
    for (const m of state.members) {
      if (!m.destroyed && m.assignment && m.assignment.type === "logistics") {
        const nid = m.assignment.nodeId;
        logiByNode[nid] = (logiByNode[nid] || 0) + 1;
      }
    }
    for (const k in state.sites) {
      const site = state.sites[k];
      const resKey = resKeyOf(state, k);
      if (!resKey) continue;
      // 1) 产缓冲（封顶：满了溢出浪费——收菜节奏来源）
      const rate = rateOf(state, k);
      site.buffer = Math.min(capOf(rate), (site.buffer || 0) + rate * dt);
      // 2) 物流岗自动回收：该星系每名物流岗按 HAUL_RATE×物流效率 抽取缓冲直入仓库
      const n = logiByNode[site.nodeId] || 0;
      if (n > 0 && site.buffer > 0 && L.jobEfficiency) {
        const eff = L.jobEfficiency(state, site.nodeId);
        const haul = Math.min(site.buffer, HAUL_RATE * n * dt * eff);
        if (haul > 0) {
          state.res[resKey] = (state.res[resKey] || 0) + haul;
          site.buffer -= haul;
        }
      }
    }
  }

  // —— 手动回收（收菜）：舰基亲自到该星系，全额入仓 ——
  function collect(state, bodyId) {
    const site = byBody(state, bodyId);
    if (!site) return { ok: false, reason: "无装置" };
    if (state.base.nodeId !== site.nodeId) return { ok: false, reason: "舰基需在该星系（亲自回收）" };
    const resKey = resKeyOf(state, bodyId);
    if (!resKey) return { ok: false, reason: "产物映射缺失" };
    const amount = site.buffer || 0;
    if (amount <= 0) return { ok: false, reason: "缓冲为空" };
    state.res[resKey] = (state.res[resKey] || 0) + amount;
    site.buffer = 0;
    return { ok: true, amount: amount, resKey: resKey };
  }

  return {
    ensure, slots, byBody, findBody, resKeyOf,
    levelMult, rateOf, capOf, capOfSite,
    canDeploy, deploy, upCost, upgrade,
    tick, collect,
    SITE_RATE, LEVEL_MULT, MAX_LEVEL, BUFFER_HOURS, HAUL_RATE, DEPLOY_COST, UP_COSTS,
  };
});
