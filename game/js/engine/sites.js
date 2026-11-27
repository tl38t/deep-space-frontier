// ================================================================
// 深空星疆 —— Engine.Sites：行星采集设施（EVE 式「收菜」，2026-10-27 方案 B）
// 行星不再是成员派遣岗：军团在行星部署「采集装置」（设施），装置按时间戳
// 持续产出该行星的专属产物，累积到**行星本地缓冲**（有上限，溢出浪费 =
// 收菜节奏来源）。玩家回到该星系手动回收（全额），或派驻「物流岗」成员
// 自动回收（受物流效率乘区，给物流岗一个真实职责）。
// 装置槽位数随舰基等级（bodyLevel）开放；装置等级提升产率。
// ★ 2026-11-27 S5：补 1 代「每 24h 维护费 → 到期停产 → 付费续期」链路
//   （1 代 data/planets.js:3「到期后停产，需手动支付 maintenanceCostISK 续期」）。
//   维护费按**行星类型**固定（1 代无等级系统，用户拍板 P0-A：不随等级缩放），
//   金额表见 Data.Planets；减免走科技 planCost（1 代 planfin，每级 −1.8%）。
//   到期只停产、**不清 buffer**（对应 1 代「storage 保留」），物流岗仍可把已有 buffer 收走。
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
  // 惰性取用 Tech（维护费减免 planCost，1 代 research.js:284 的 planfin）
  function _Tech() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Tech : null; }
  function _Planets() { return (Data && Data.Planets) ? Data.Planets : null; }

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

  // ================================================================
  // 维护费 / 到期 / 续期（★ 2026-11-27 S5）
  // ----------------------------------------------------------------
  // 1 代口径：每 maintenanceDuration(86400s) 付一次 maintenanceCostISK，到期不付即停产，
  //   只停产不清 storage。本作把「ISK」换成 credits（换算比 46，见 data/planets.js）。
  // ⚠️ 时基：全部用**墙钟 ms**（deployedAt 时间戳），与 settle 的离线模型一致 ——
  //   离线 24h 回来只 tick 一次，靠这个时间戳判「窗口内哪一段有效」，不能只看 dt。
  // ================================================================
  function planetTypeOf(state, bodyId) {
    const site = byBody(state, bodyId);
    if (!site) return null;
    const body = findBody(state, site.nodeId, bodyId);
    return (body && body.planetType) || null;
  }
  function baseMaintOf(state, bodyId) {
    const P = _Planets();
    return (P && P.maintenanceOf) ? P.maintenanceOf(planetTypeOf(state, bodyId)) : 0;
  }
  function durationOf(state, bodyId) {
    const site = byBody(state, bodyId);
    if (site && Number(site.duration) > 0) return Number(site.duration);
    const P = _Planets();
    return (P && P.durationOf) ? P.durationOf(planetTypeOf(state, bodyId)) : 86400;
  }
  // ★ 维护费唯一公式：ceil(基准 × max(0, 1 − planCost减免))
  //   手动续费 / 自动续费 / UI 报价**全部**只准调它，不许另起一套乘法。
  function renewCostOf(state, bodyId) {
    if (!byBody(state, bodyId)) return 0;
    const base = baseMaintOf(state, bodyId);
    const T = _Tech();
    const cut = (T && T.bonusSum) ? T.bonusSum(state, "planCost") : 0;
    const mult = Math.max(0, 1 - (Number(cut) || 0));
    return Math.ceil(base * mult);
  }
  function expiresAtOf(state, bodyId) {
    const site = byBody(state, bodyId);
    if (!site) return 0;
    return (Number(site.deployedAt) || 0) + durationOf(state, bodyId) * 1000;
  }
  function remainingSecOf(state, bodyId) {
    const site = byBody(state, bodyId);
    if (!site || site.active === false) return 0;
    return Math.max(0, (expiresAtOf(state, bodyId) - Date.now()) / 1000);
  }
  function isActive(state, bodyId) {
    const site = byBody(state, bodyId);
    if (!site || site.active === false) return false;
    return expiresAtOf(state, bodyId) > Date.now();
  }

  // 手动续费：仅「已停产」可执行（1 代只能到期后付，不能提前囤时长）。
  // buffer 不重置 —— 停产期间攒下的东西续费后照旧在（1 代「保留 storage」）。
  function renew(state, bodyId, nowMs) {
    const site = byBody(state, bodyId);
    if (!site) return { ok: false, reason: "无装置" };
    if (site.active !== false && remainingSecOf(state, bodyId) > 0) {
      return { ok: false, reason: "尚未到期，无需续费" };
    }
    const cost = renewCostOf(state, bodyId);
    if ((state.res.credits || 0) < cost) return { ok: false, reason: "星币不足（需 " + cost + "）" };
    state.res.credits -= cost;
    const now = Number(nowMs) || Date.now();
    site.deployedAt = now;
    site.active = true;
    if (!(Number(site.duration) > 0)) site.duration = durationOf(state, bodyId);
    if (site.lastRenewFail !== undefined) delete site.lastRenewFail;
    return { ok: true, cost: cost, expiresAt: expiresAtOf(state, bodyId) };
  }

  // 自动续费（用户拍板 P0-B「做」）：只在到期那一刻尝试一次，走**同一个** renew()。
  // 未接科技门槛（本作无 planauto 节点），预留 Tech.autoRenewUnlocked 钩子：
  //   科技树落地后把下面这行改成 `if (T && T.autoRenewUnlocked && !T.autoRenewUnlocked(state)) return ...`。
  function autoRenewUnlocked(state) {
    const T = _Tech();
    if (T && typeof T.autoRenewUnlocked === "function") return !!T.autoRenewUnlocked(state);
    return true;
  }
  function tryAutoRenew(state, bodyId, nowMs) {
    const site = byBody(state, bodyId);
    if (!site) return { ok: false, reason: "无装置" };
    const ar = site.autoRenew;
    if (!ar || !ar.enabled) return { ok: false, reason: "未开启自动续费" };
    if (!autoRenewUnlocked(state)) return { ok: false, reason: "未解锁自动续费" };
    const cost = renewCostOf(state, bodyId);
    const credits = state.res.credits || 0;
    const reserve = Math.max(0, Number(ar.minIskReserve) || 0);
    if (credits < cost) return { ok: false, reason: "余额不足（需 " + cost + "）" };
    if (credits - cost < reserve) return { ok: false, reason: "续费后低于储备金 " + reserve };
    return renew(state, bodyId, nowMs);
  }

  function setAutoRenew(state, bodyId, enabled, minReserve) {
    const site = byBody(state, bodyId);
    if (!site) return { ok: false, reason: "无装置" };
    if (!site.autoRenew || typeof site.autoRenew !== "object") site.autoRenew = { enabled: false, minIskReserve: 0 };
    // enabled 省略 = 只改储备金，不动开关（UI 两个控件各改各的）
    if (enabled !== undefined && enabled !== null) site.autoRenew.enabled = !!enabled;
    if (minReserve !== undefined && minReserve !== null && minReserve !== "") {
      let v = Math.floor(Number(minReserve) || 0);
      if (!isFinite(v) || v < 0) v = 0;
      site.autoRenew.minIskReserve = v;
    }
    return { ok: true, autoRenew: site.autoRenew };
  }

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
    const body = findBody(state, nodeId, bodyId);
    const P = _Planets();
    const type = (body && body.planetType) || null;
    state.sites[bodyId] = {
      bodyId: bodyId, nodeId: nodeId, level: 1, buffer: 0,
      // ★ S5 维护费字段（1 代部署即开始计时，24h 后到期）
      deployedAt: Date.now(),
      duration: (P && P.durationOf) ? P.durationOf(type) : 86400,
      active: true,
      autoRenew: { enabled: false, minIskReserve: 0 },
    };
    return { ok: true, expiresAt: expiresAtOf(state, bodyId) };
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

  // —— 结算：判到期/自动续费 → 产缓冲（封顶溢出浪费）→ 物流岗自动回收 ——
  // O(设施数)，与成员产出同一 dt（时间戳驱动，离线同核）。
  // ★ S5：dt 可能很大（离线 24h 一次 tick），所以到期判定必须按**墙钟**算窗口内有效秒数，
  //   不能只判「现在到期了没」——否则离线跨过到期点会多产一整个窗口。
  function tick(state, dt) {
    ensure(state);
    const L = _Logi();
    if (!L) return;
    const now = Date.now();
    const dtMs = Math.max(0, (Number(dt) || 0) * 1000);
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

      // 1) 到期判定：算出本窗口内「装置仍有效」的秒数
      let effSec = Math.max(0, Number(dt) || 0);
      if (site.active === false) {
        effSec = 0;
      } else {
        const limit = durationOf(state, k) * 1000;
        const elapsed = now - (Number(site.deployedAt) || now);
        if (elapsed >= limit) {
          // 到期时刻 T = deployedAt + limit 落在 [now-dt, now] 内 ⇒ 有效时长 = T − 窗口起点
          const validMs = Math.max(0, Math.min(dtMs, limit - (elapsed - dtMs)));
          effSec = validMs / 1000;
          site.active = false;
          const ar = tryAutoRenew(state, k, now);
          if (ar.ok) { effSec = Math.max(0, Number(dt) || 0); }
          else site.lastRenewFail = ar.reason;
        }
      }

      // 2) 产缓冲（封顶：满了溢出浪费——收菜节奏来源）
      if (effSec > 0) {
        const rate = rateOf(state, k);
        site.buffer = Math.min(capOf(rate), (site.buffer || 0) + rate * effSec);
      }

      // 3) 物流岗自动回收：该星系每名物流岗按 HAUL_RATE×物流效率 抽取缓冲直入仓库
      //    ⚠️ 停产也照收 —— 1 代「保留 storage」，已有缓冲不该被维护费罚没。
      const n = logiByNode[site.nodeId] || 0;
      if (n > 0 && site.buffer > 0 && L.jobEfficiency) {
        const eff = L.jobEfficiency(state, site.nodeId);
        const haul = Math.min(site.buffer, HAUL_RATE * n * (Number(dt) || 0) * eff);
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
    // ★ S5 维护费 / 到期 / 续费
    planetTypeOf, baseMaintOf, renewCostOf, durationOf, expiresAtOf, remainingSecOf, isActive,
    renew, tryAutoRenew, setAutoRenew, autoRenewUnlocked,
    SITE_RATE, LEVEL_MULT, MAX_LEVEL, BUFFER_HOURS, HAUL_RATE, DEPLOY_COST, UP_COSTS,
  };
});
