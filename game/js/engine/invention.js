// ================================================================
// 深空星疆 —— Engine.Invention：蓝图效率研究（ME / TE）
// ----------------------------------------------------------------
// 1 代正本：EVEIDLE-WORKBUDDY-FRESH/js/systems/invention.js:27-36, 64-77, 343-357
//   GATES [1,20,40,60,80] / MILESTONES [10,50,250,1250,5000] /
//   REDUCTIONS [5,10,15,20,25]% / 周期 30×tier / 每循环 2000×tier 星币 + tier 耗材 /
//   xp = ceil(0.4 × 1.1^E) / tier = min(5, floor(E/20)+1)
//
// 本作差异（均在设计稿中定稿）：
//   · 蓝图不复制 1 代 22KB 表，全部由真实 BOOSTER_RECIPES(63) + Recipes.COMPONENT 弹药(3)
//     按上式派生，共 66 张；1 代另 12 张无产线蓝图不搬。
//   · 1 代技能是全局 blueprintInvention；本作合并在成员 research 键上，
//     门槛取「全团 research 最高等级」——避免撤走驻舱者导致已解锁蓝图突然锁死。
//   · ME 取整是**唯一经用户明确授权的 1 代偏离**（2026-11-08）：1 代逐项
//     floor(qty×(1−r)) 在 1~7 的小数量成本上令前四级里程碑贴平；本作改为
//     「总额确定性分摊」。不得扩大适用范围。
//   · TE 只缩短该蓝图对应配方的**制造**耗时（/(1−teR)），不缩短研究自身耗时。
//
// 硬性约束：内部键全 ASCII；无 Math.random；无 localStorage 直调；UMD 挂命名子键。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Invention = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Invention = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- 1 代真值常量（禁改；改这里等于改设计）----
  const GATES = Object.freeze([1, 20, 40, 60, 80]);
  const MILESTONES = Object.freeze([10, 50, 250, 1250, 5000]);
  const REDUCTIONS = Object.freeze([0.05, 0.10, 0.15, 0.20, 0.25]);
  const ISK_PER_TIER = 2000;
  const CORE_PER_TIER = 1;      // 每循环耗材 = tier × 1（本作耗材 = bp / 改装图纸）
  const BASE_SECONDS = 30;
  const CREDIT_KEY = "credits";
  const CORE_KEY = "bp";
  const SCHEMA_VERSION = 1;

  // ---- 数据源（惰性取用，避免与 UI/Node 探针的加载顺序耦合）----
  function W() { return typeof window !== "undefined" ? window : null; }
  function boosterRecipes() { const w = W(); return (w && w.BOOSTER_RECIPES) || []; }
  function boosterItems() { const w = W(); return (w && w.BOOSTER_ITEMS) || {}; }
  function componentRecipes() {
    const w = W();
    return (w && w.NSK && w.NSK.Data && w.NSK.Data.Recipes && w.NSK.Data.Recipes.COMPONENT) || [];
  }
  function resName(id) {
    const w = W();
    const R = w && w.NSK && w.NSK.Data && w.NSK.Data.Resources;
    const m = R && R.meta ? R.meta(id) : null;
    return m ? m.name : id;
  }

  // ---- 纯函数：1 代派生公式（78/78 已验证；本作用其中 66 张）----
  function tierOf(E) {
    const e = Math.max(1, Math.floor(Number(E) || 1));
    return Math.min(5, Math.floor(e / 20) + 1);
  }
  function xpOf(E) {
    const e = Math.max(1, Math.floor(Number(E) || 1));
    return Math.ceil(0.4 * Math.pow(1.1, e));
  }
  function cycleSecondsOf(bp) { return BASE_SECONDS * bp.tier; }
  function cycleCostOf(bp) {
    const out = {};
    out[CREDIT_KEY] = ISK_PER_TIER * bp.tier;
    out[CORE_KEY] = CORE_PER_TIER * bp.tier;
    return out;
  }

  // ---- 66 张蓝图：由真实表派生，缓存一次 ----
  let _list = null;
  let _byKey = null;
  function buildList() {
    const out = [];
    for (const r of boosterRecipes()) {
      const id = String(r.itemId || "").replace(/^booster:/, "") || r.id;
      const it = boosterItems()[id] || {};
      const E = Math.max(1, Number(r.level) || 1);
      out.push({
        key: "booster:" + r.id, recipeId: String(r.id), outKey: String(r.itemId || r.id),
        name: it.name || r.name || r.id, cat: "booster", E: E, cost: r.cost || {},
      });
    }
    for (const c of componentRecipes()) {
      if (c.cat !== "ammo") continue;
      out.push({
        key: "ammo:" + String(c.out), recipeId: String(c.id), outKey: String(c.out),
        name: resName(String(c.out)), cat: "ammo", E: 1, cost: c.in || {},
      });
    }
    for (const b of out) {
      b.tier = tierOf(b.E);
      b.xp = xpOf(b.E);
      b.cycle = cycleSecondsOf(b);
      b.costCycle = cycleCostOf(b);
      b.gate = GATES[b.tier - 1];
    }
    return out;
  }
  function list() { if (!_list) _list = buildList(); return _list; }
  function byKey() {
    if (!_byKey) { _byKey = Object.create(null); for (const b of list()) _byKey[b.key] = b; }
    return _byKey;
  }
  function resetCache() { _list = null; _byKey = null; }   // 仅供探针切数据源
  function blueprintByKey(key) { return byKey()[key] || null; }

  // 制造配方 → 蓝图 key（ME/TE 挂载的唯一真值源）
  function keyForRecipe(queueType, recipeId) {
    if (!recipeId) return null;
    const id = String(recipeId);
    if (queueType === "booster") return "booster:" + id.replace(/^booster:/, "");
    if (queueType === "manufacture" && /^mk_ammo_/.test(id)) return "ammo:" + id.slice(3);
    return null;
  }

  // ---- 状态存取 ----
  function ensure(state) {
    if (!state) return null;
    if (!state.invention || typeof state.invention !== "object") {
      state.invention = { schemaVersion: SCHEMA_VERSION, blueprints: {} };
    }
    const inv = state.invention;
    if (inv.schemaVersion !== SCHEMA_VERSION) inv.schemaVersion = SCHEMA_VERSION;
    if (!inv.blueprints || typeof inv.blueprints !== "object" || Array.isArray(inv.blueprints)) {
      inv.blueprints = {};
    }
    // 逐项清洗（幂等）：脏计数一律归 0，不删未知 key（兼容未来新增蓝图）
    for (const k in inv.blueprints) {
      if (!Object.prototype.hasOwnProperty.call(inv.blueprints, k)) continue;
      let e = inv.blueprints[k];
      if (!e || typeof e !== "object" || Array.isArray(e)) e = inv.blueprints[k] = {};
      if (typeof e.meCount !== "number" || !isFinite(e.meCount) || e.meCount < 0) e.meCount = 0;
      if (typeof e.teCount !== "number" || !isFinite(e.teCount) || e.teCount < 0) e.teCount = 0;
    }
    return inv;
  }
  function entry(state, key, create) {
    const inv = state && state.invention;
    if (!inv || !inv.blueprints) { if (!create) return null; ensure(state); }
    const bag = state.invention.blueprints;
    let e = bag[key];
    if (!e || typeof e !== "object") {
      if (!create) return null;
      e = bag[key] = { meCount: 0, teCount: 0 };
    }
    return e;
  }
  function countOf(state, key, dir) {
    const e = entry(state, key, false);
    if (!e) return 0;
    const n = dir === "te" ? e.teCount : e.meCount;
    return (typeof n === "number" && isFinite(n)) ? n : 0;
  }

  // ---- 里程碑 / 减免 ----
  function milestoneLevel(count) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    let lv = 0;
    for (let i = 0; i < MILESTONES.length; i++) if (n >= MILESTONES[i]) lv = i + 1;
    return lv;
  }
  function reductionFor(level) {
    const l = Math.max(0, Math.min(5, Math.floor(Number(level) || 0)));
    return l === 0 ? 0 : REDUCTIONS[l - 1];
  }
  function nextMilestone(count) {
    for (let i = 0; i < MILESTONES.length; i++) if (count < MILESTONES[i]) return MILESTONES[i];
    return null;   // 已满档
  }
  function reduction(state, key, dir) {
    return reductionFor(milestoneLevel(countOf(state, key, dir)));
  }
  function meReduction(state, key) { return reduction(state, key, "me"); }
  function teReduction(state, key) { return reduction(state, key, "te"); }
  function meReductionForRecipe(state, queueType, recipeId) {
    const k = keyForRecipe(queueType, recipeId); return k ? meReduction(state, k) : 0;
  }
  function teReductionForRecipe(state, queueType, recipeId) {
    const k = keyForRecipe(queueType, recipeId); return k ? teReduction(state, k) : 0;
  }

  // ---- ME 取整：总额确定性分摊（经批准的唯一 1 代偏离）----
  // S = Σ qty；saved = round(S × r)；按 qty 降序（同级键名升序）逐项减到下限 1，
  // 直到省够 saved。无随机、整数安全、在线/离线逐值一致。
  // ⚠️ 必须在 discountedCost（配给剂折扣）**之后**调用，避免 1 代 station.js:1074 重复叠 bug。
  function applyMeReduction(cost, r) {
    if (!(r > 0) || !cost || typeof cost !== "object") return cost;
    const keys = Object.keys(cost).filter(k => Object.prototype.hasOwnProperty.call(cost, k));
    if (!keys.length) return cost;
    const out = {};
    let S = 0;
    for (const k of keys) {
      const q = Math.max(0, Math.floor(Number(cost[k]) || 0));
      out[k] = q; S += q;
    }
    if (S <= 0) return out;
    let saved = Math.round(S * r);          // JS 正数 Math.round 的 0.5 方向为 +∞
    if (saved <= 0) return out;
    const order = keys.slice().sort((a, b) => (out[b] - out[a]) || (a < b ? -1 : a > b ? 1 : 0));
    for (const k of order) {
      while (saved > 0 && out[k] > 1) { out[k] -= 1; saved -= 1; }
      if (saved <= 0) break;
    }
    return out;
  }
  // 1 代原样 floor 口径（仅供探针比对「经批准偏离」的事实依据，产品路径不调用）
  function applyMeReductionLegacy(cost, r) {
    if (!(r > 0) || !cost || typeof cost !== "object") return cost;
    const out = {};
    for (const k in cost) {
      if (!Object.prototype.hasOwnProperty.call(cost, k)) continue;
      let c = Math.floor(Number(cost[k]) * (1 - r));
      if (!(c >= 1)) c = 1;
      out[k] = c;
    }
    return out;
  }

  // ---- 门槛：1 代是全局技能，本作技能挂成员 → 取全团 research 最高等级 ----
  function levelOf(xp) {
    const w = W();
    const S = w && w.NSK && w.NSK.Engine && w.NSK.Engine.Settle;
    if (S && S.levelOf) return S.levelOf(xp);
    const x = Math.max(0, Number(xp) || 0);
    return 1 + Math.floor(Math.log(x / 1000 + 1) / Math.log(1.1));  // 与 settle.js:108 同式
  }
  function researchLevel(state) {
    let lv = 1;
    for (const m of ((state && state.members) || [])) {
      if (!m || m.destroyed) continue;
      const xp = (m.skills && m.skills.research) || 0;
      const L = levelOf(xp);
      if (L > lv) lv = L;
    }
    return lv;
  }
  function isUnlocked(state, bp) { return !!bp && researchLevel(state) >= bp.gate; }

  // ---- 显示名（不写进存档，改名自动跟随数据表）----
  function nameOf(key) { const b = blueprintByKey(key); return b ? b.name : key; }
  function labelFor(key, dir) { return (dir === "te" ? "时间效率" : "材料效率") + " · " + nameOf(key); }
  function xpForBlueprint(bp) { return bp ? bp.xp : 0; }

  // ---- 原子结算：扣费 / 计数同成或零副作用 ----
  // opts.paid = true 表示扣费已由通用队列（入队扣第 1 批 + 每批续扣）完成，
  // 本函数只做计数；队列路径必须传该值，否则会重复扣费。
  // 默认（探针/独立调用）自行原子扣费；资源不足返回 {ok:false} 且计数零变化。
  // 经验统一由 production.js 的 grantBatchXp 发放，本函数只返回应发 xp，不重复发。
  function settleCycle(state, key, dir, opts) {
    const bp = blueprintByKey(key);
    if (!bp || !state) return { ok: false, xp: 0 };
    const d = dir === "te" ? "te" : "me";
    const paid = !!(opts && opts.paid);
    if (!paid) {
      const cost = bp.costCycle;
      const res = state.res || (state.res = {});
      for (const k in cost) {
        if (!Object.prototype.hasOwnProperty.call(cost, k)) continue;
        if ((res[k] || 0) < cost[k]) return { ok: false, xp: 0 };
      }
      for (const k in cost) {
        if (!Object.prototype.hasOwnProperty.call(cost, k)) continue;
        res[k] = Math.max(0, (res[k] || 0) - cost[k]);
      }
    }
    const e = entry(state, key, true);
    if (!e) return { ok: false, xp: 0 };
    if (d === "te") e.teCount = (typeof e.teCount === "number" ? e.teCount : 0) + 1;
    else e.meCount = (typeof e.meCount === "number" ? e.meCount : 0) + 1;
    return { ok: true, xp: bp.xp };
  }

  return {
    GATES, MILESTONES, REDUCTIONS, ISK_PER_TIER, CORE_PER_TIER, BASE_SECONDS,
    CREDIT_KEY, CORE_KEY, SCHEMA_VERSION,
    list, blueprintByKey, byKey, resetCache, keyForRecipe,
    tierOf, xpOf, cycleSecondsOf, cycleCostOf,
    ensure, entry, countOf, milestoneLevel, reductionFor, nextMilestone,
    meReduction, teReduction, meReductionForRecipe, teReductionForRecipe,
    applyMeReduction, applyMeReductionLegacy,
    researchLevel, isUnlocked, nameOf, labelFor, xpForBlueprint, settleCycle,
  };
});
