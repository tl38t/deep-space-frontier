// ================================================================
// 深空星疆 —— Engine.Production：工业三队列结算
// 精炼(smelt)/制造部件+总装(manufacture)/发明(invent)。
// 入队时扣原料，完成一批产一批（离散批次 + repeat，支持离线 O(批次数)）。
// 精炼恒可；manufacture 造舰种受 bodyLevel 门禁（见 ships.js）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Production = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Production = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Core = (typeof window !== "undefined" ? window.NSK.Core : require("./core/rng.js"));
  const Data = (typeof window !== "undefined" ? window.NSK.Data : require("../data/resources.js"));
  const Base = (typeof window !== "undefined" && window.NSK.Engine) ? window.NSK.Engine.Base : null;
  const Booster = (typeof window !== "undefined" && window.NSK.Engine) ? window.NSK.Engine.Booster : null;
  // 精通点强化用惰性取用（mastery.js 可能晚于本文件注册，避免 load-time 捕获为 null）
  function _Mastery() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Mastery : null; }

  const MAX_BATCHES = 2000; // 单次 settle 安全上限，防离线巨量迭代冻结

  function canAfford(res, cost) {
    for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
    return true;
  }
  function spend(res, cost) { for (const k in cost) res[k] = Math.max(0, (res[k] || 0) - cost[k]); }
  function gain(res, out, qty) { res[out] = (res[out] || 0) + qty; }
  // 总装船坞（manufacture）槽位由「部件制造队列」+「造船队列」共享
  function manufactureUsed(state) {
    const ind = state.base.industry;
    return (ind.manufactureQueue || []).length + (ind.buildQueue || []).length;
  }

  // 入队：检查槽位 + 原料，扣原料，写队列项
  function enqueue(state, queueType, recipeId, repeat) {
    const Ship = Data.Ships;
    const plan = Ship.bodyLevelPlan(state.base.bodyLevel);
    const slots = queueType === "smelt" ? plan.smelt : queueType === "manufacture" ? plan.manufacture : plan.invent;
    // manufacture 槽位由「部件制造队列」与「造船队列」共享（同为总装船坞）
    const used = queueType === "manufacture" ? manufactureUsed(state) : state.base.industry[queueType + "Queue"].length;
    if (used >= slots) return { ok: false, err: "生产线槽位已满（需升级舰基）" };

    const tbl = queueType === "smelt" ? Data.Recipes.SMELT
      : queueType === "manufacture" ? Data.Recipes.COMPONENT
      : Data.Recipes.INVENT;
    const r = tbl.find(x => x.id === recipeId);
    if (!r) return { ok: false, err: "配方不存在" };
    const q = state.base.industry[queueType + "Queue"];

    // 总装整船走 manufacture 但引用 ships（此处仅部件/矿材/图纸）
    repeat = repeat || 1;
    if (!canAfford(state.res, r.in)) return { ok: false, err: "原料不足" };
    spend(state.res, r.in);
    const durationMult = Base && Base.queueDurationMultiplier ? Base.queueDurationMultiplier(state, queueType) : 1;
    q.push({
      recipeId: recipeId, dur: r.dur * durationMult, out: r.out, qty: r.qty,
      startedAt: Date.now(), repeat: repeat, done: 0,
    });
    return { ok: true };
  }

  // 结算某队列（推进批次）。powerMult：电网棕化系数（§1.5 运行时降速，正常为 1）；
  //   boosterMult：增强剂整舱加速倍率（>=1，production 已在等效耗时中除以它）。返回产出日志 [{out, qty}]
  function processQueue(state, queueType, now, powerMult) {
    const pm = (powerMult && powerMult > 0) ? powerMult : 1;
    const bm = (Booster && Booster.mult) ? Booster.mult(state, queueType) : 1; // 增强剂加速（整舱生效）
    const M = _Mastery();
    const mm = (M && M.industryTimeMult) ? M.industryTimeMult(state) : 1;     // 精通点·工业调度（耗时乘区）
    const effDur = (it) => it.dur / (pm * bm) * mm; // 棕化(pm<1)拉长；增强剂(bm>1)缩短；精通(mm<1)缩短
    const q = state.base.industry[queueType + "Queue"];
    const log = [];
    let guard = 0;
    while (q.length && guard < MAX_BATCHES) {
      const it = q[0];
      const elapsed = (now - it.startedAt) / 1000; // 真实流逝（秒）
      if (typeof console !== "undefined" && state.__dbg) console.log("  PQ", queueType, "elapsed=", elapsed.toFixed(2), "effDur=", effDur(it).toFixed(2), "pm=", pm, "bm=", bm, "done=", it.done);
      if (elapsed < effDur(it)) break; // 队首未到一批
      // 完成一批
      gain(state.res, it.out, it.qty);
      log.push({ out: it.out, qty: it.qty });
      it.done += 1;
      if (it.done >= it.repeat) { q.shift(); continue; }
      // 续下一批：推进 startedAt（按等效耗时），重新校验原料
      it.startedAt += effDur(it) * 1000;
      const tbl = queueType === "smelt" ? Data.Recipes.SMELT
        : queueType === "manufacture" ? Data.Recipes.COMPONENT : Data.Recipes.INVENT;
      const r = tbl.find(x => x.id === it.recipeId);
      if (!r || !canAfford(state.res, r.in)) { q.shift(); continue; }
      spend(state.res, r.in);
      guard += 1;
    }
    return log;
  }

  // ---- 造船队列（总装船坞，共享 manufacture 槽位；完成入 state.ships）----
  // 入队：检查总装槽位 + 核心门禁 + 材料，扣材料，写 buildQueue 项。
  function buildShip(state, shipId) {
    const Ship = Data.Ships;
    const ship = Ship.shipById(shipId);
    if (!ship) return { ok: false, err: "舰船不存在" };
    if (!Ship.canBuildAt(shipId, state.base.bodyLevel)) return { ok: false, err: "核心等级不足（需 Lv." + (ship.bodyLevelReq + 1) + "）" };
    const plan = Ship.bodyLevelPlan(state.base.bodyLevel);
    if (manufactureUsed(state) >= plan.manufacture) return { ok: false, err: "总装船坞槽位已满（需升级舰基）" };
    if (!canAfford(state.res, ship.cost)) return { ok: false, err: "材料不足" };
    spend(state.res, ship.cost);
    const durationMult = Base && Base.queueDurationMultiplier ? Base.queueDurationMultiplier(state, "manufacture") : 1;
    const q = state.base.industry.buildQueue || (state.base.industry.buildQueue = []);
    q.push({ shipId: shipId, dur: ship.buildTime * durationMult, startedAt: Date.now(), repeat: 1, done: 0 });
    return { ok: true, ship: ship };
  }

  // 结算造船队列：完成一艘 → 推入 state.ships（{id, shipId, name, status, nodeId}），并记 counters.builtShips。
  function processBuildQueue(state, now) {
    const pm = (Base && Base.powerMult) ? Base.powerMult(state) : 1;
    const bm = (Booster && Booster.mult) ? Booster.mult(state, "manufacture") : 1; // 造船复用总装增强剂
    const M = _Mastery();
    const mm = (M && M.industryTimeMult) ? M.industryTimeMult(state) : 1;
    const effDur = (it) => it.dur / (pm * bm) * mm;
    const q = state.base.industry.buildQueue || (state.base.industry.buildQueue = []);
    const log = [];
    let guard = 0;
    while (q.length && guard < MAX_BATCHES) {
      const it = q[0];
      const elapsed = (now - it.startedAt) / 1000;
      if (elapsed < effDur(it)) break;
      const ship = Data.Ships.shipById(it.shipId);
      if (ship) {
        state.ships.push({ id: "s_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36), shipId: ship.id, name: ship.name, status: "idle", nodeId: state.base.nodeId });
        log.push({ shipId: ship.id, name: ship.name });
        state.counters = state.counters || {};
        state.counters.builtShips = (state.counters.builtShips || 0) + 1;
        // 精通点：完成一艘总装 +3（离散发点，非 tick）
        const M = _Mastery();
        if (M && M.award) M.award(state, 3, "ship");
      }
      q.shift();
      guard += 1;
    }
    return log;
  }

  function buildStatus(state, now) {
    const q = state.base.industry.buildQueue || [];
    return q.map(it => {
      const p = Core.clamp((now - it.startedAt) / 1000 / it.dur, 0, 1);
      const ship = Data.Ships.shipById(it.shipId);
      return { shipId: it.shipId, name: ship ? ship.name : it.shipId, progress: p, done: it.done, repeat: it.repeat };
    });
  }

  function processAll(state, now) {
    const pm = (Base && Base.powerMult) ? Base.powerMult(state) : 1;
    const all = [];
    all.push(...processQueue(state, "smelt", now, pm));
    all.push(...processQueue(state, "manufacture", now, pm));
    all.push(...processQueue(state, "invent", now, pm));
    if (Booster && Booster.clean) Booster.clean(state, now); // 惰性清理过期增强剂（O(active)）
    all.push(...processBuildQueue(state, now));
    return all;
  }

  function queueStatus(state, queueType, now) {
    const q = state.base.industry[queueType + "Queue"];
    return q.map(it => {
      const p = Core.clamp((now - it.startedAt) / 1000 / it.dur, 0, 1);
      return { recipeId: it.recipeId, progress: p, repeat: it.repeat, done: it.done };
    });
  }

  return { enqueue, processAll, processQueue, processBuildQueue, buildShip, buildStatus, manufactureUsed, queueStatus, canAfford, spend, gain };
});
