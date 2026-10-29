// ================================================================
// 深空星疆 —— Engine.Base：唯一舰基核心、母舰蓝图与模块装配
// 船体只决定舱位拓扑；核心等级和工业队列由唯一 base 核心持有。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Base = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Base = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Ships = (typeof window !== "undefined" && window.NSK && window.NSK.Data)
    ? window.NSK.Data.Ships : require("../data/ships.js");
  const QUEUE_NAMES = { smelt: "精炼", manufacture: "制造", invent: "发明" };
  const LINK_RULES = [
    { a: "energy", b: "smelt", queue: "smelt", mult: 0.92, name: "能源直供" },
    { a: "energy", b: "manufacture", queue: "manufacture", mult: 0.94, name: "能源直供" },
    { a: "cargo", b: "smelt", queue: "smelt", mult: 0.96, name: "短链物流" },
    { a: "cargo", b: "manufacture", queue: "manufacture", mult: 0.94, name: "短链物流" },
  ];

  function normalize(state) {
    if (!state || !state.base) return state;
    const base = state.base;
    // 向后兼容：旧档缺精通点 / 待决事件 / 成员里程碑（MVP 周六新增）
    if (!state.mastery || typeof state.mastery !== "object") state.mastery = { points: 0, earned: 0, spent: 0, nodes: {} };
    if (!Array.isArray(state.pendingEvents)) state.pendingEvents = [];
    // 行星采集设施（EVE 式收菜，2026-10-27 方案 B）
    if (!state.sites || typeof state.sites !== "object") state.sites = {};
    if (Array.isArray(state.members)) {
      for (const m of state.members) if (!Array.isArray(m.milestones)) m.milestones = [];
    }
    // 向后兼容：旧档（version<8）缺工业 buildQueue / 增强剂 boosters 字段时兜底（MVP 周五新增）
    if (!base.industry) base.industry = { smeltQueue: [], manufactureQueue: [], inventQueue: [], buildQueue: [] };
    else if (!Array.isArray(base.industry.buildQueue)) base.industry.buildQueue = [];
    if (!Array.isArray(base.boosters)) base.boosters = [];
    const defaults = Ships.createInitialBase();
    if (!base.coreId) base.coreId = "base_core_" + (state.createdAt || 1).toString(36) + "_" + (state.rngSeed || 1).toString(36);
    if (!Ships.baseHullById(base.hullId)) base.hullId = defaults.hullId;
    if (!Array.isArray(base.ownedHullBlueprints)) base.ownedHullBlueprints = [defaults.hullId];
    if (!base.ownedHullBlueprints.includes(defaults.hullId)) base.ownedHullBlueprints.unshift(defaults.hullId);
    base.ownedHullBlueprints = base.ownedHullBlueprints.filter(id => !!Ships.baseHullById(id));
    if (!base.ownedHullBlueprints.includes(base.hullId)) base.ownedHullBlueprints.push(base.hullId);

    const hadModuleSystem = !!(base.modules && typeof base.modules === "object");
    if (!hadModuleSystem) {
      base.modules = {
        owned: defaults.modules.owned.map(m => ({ id: m.id, type: m.type })),
        installed: defaults.modules.installed.map(x => ({ slotId: x.slotId, moduleId: x.moduleId })),
      };
    } else {
      if (!Array.isArray(base.modules.owned)) base.modules.owned = defaults.modules.owned.map(m => ({ id: m.id, type: m.type }));
      if (!Array.isArray(base.modules.installed)) base.modules.installed = [];
    }
    // A partial/older module save gets one of each starter module; existing installations remain intact.
    for (const starter of defaults.modules.owned) {
      if (!base.modules.owned.some(m => m && m.id === starter.id)) base.modules.owned.push({ id: starter.id, type: starter.type });
    }
    const hull = Ships.baseHullById(base.hullId);
    const validSlots = new Map(Ships.baseHullSlots(hull).filter(s => s.type !== "core").map(s => [s.id, s.type]));
    const owned = new Map(base.modules.owned.filter(m => m && m.id && Ships.baseModuleByType(m.type)).map(m => [m.id, m]));
    const seen = new Set();
    base.modules.installed = base.modules.installed.filter(entry => {
      if (!entry || !validSlots.has(entry.slotId) || seen.has(entry.slotId)) return false;
      const module = owned.get(entry.moduleId);
      if (!module || module.type !== validSlots.get(entry.slotId)) return false;
      seen.add(entry.slotId);
      return true;
    });
    return state;
  }

  function hullOf(state) { return Ships.baseHullById(state && state.base && state.base.hullId) || Ships.BASE_HULLS[0]; }
  function installation(state, slotId) {
    const modules = state && state.base && state.base.modules;
    const record = modules && Array.isArray(modules.installed) ? modules.installed.find(x => x.slotId === slotId) : null;
    if (!record) return null;
    return modules.owned.find(x => x.id === record.moduleId) || null;
  }
  function moduleAt(state, slotId) {
    const module = installation(state, slotId);
    return module ? Ships.baseModuleByType(module.type) : null;
  }
  function slotById(state, slotId) { return Ships.baseHullSlots(hullOf(state)).find(s => s.id === slotId) || null; }
  function adjacentSlots(state, slotId) {
    const slot = slotById(state, slotId);
    if (!slot) return [];
    return Ships.baseHullSlots(hullOf(state)).filter(other => other.type !== "core" && other.id !== slotId
      && Math.abs(other.x - slot.x) + Math.abs(other.y - slot.y) === 1);
  }
  function availableModules(state, slotId) {
    const slot = slotById(state, slotId);
    if (!slot || slot.type === "core") return [];
    const modules = state.base.modules || { owned: [], installed: [] };
    const used = new Set(modules.installed.map(x => x.moduleId));
    return modules.owned.filter(m => m.type === slot.type && !used.has(m.id));
  }

  function buyBlueprint(state, hullId) {
    const hull = Ships.baseHullById(hullId);
    if (!hull) return { ok: false, err: "母舰蓝图不存在" };
    if (state.base.ownedHullBlueprints.includes(hullId)) return { ok: false, err: "已拥有该蓝图" };
    const faction = (state.factions || []).find(f => f.id === hull.factionId);
    if (!faction || faction.relation < hull.relationReq) return { ok: false, err: "势力关系不足" };
    if (state.base.bodyLevel < hull.bodyLevelReq) return { ok: false, err: "舰基核心等级不足" };
    const cost = hull.blueprintCost || {};
    for (const key in cost) if ((state.res[key] || 0) < cost[key]) return { ok: false, err: "星币不足" };
    for (const key in cost) state.res[key] = Math.max(0, (state.res[key] || 0) - cost[key]);
    state.base.ownedHullBlueprints.push(hullId);
    return { ok: true, hull: hull };
  }

  function switchHull(state, hullId) {
    if (!Ships.baseHullById(hullId)) return { ok: false, err: "母舰不存在" };
    if (!state.base.ownedHullBlueprints.includes(hullId)) return { ok: false, err: "尚未取得该母舰蓝图" };
    if (state.base.hullId === hullId) return { ok: false, err: "这就是当前母舰" };
    // 船体离坞时所有已装模块回到玩家库存；核心与工业队列留在唯一舰基状态上。
    state.base.modules.installed = [];
    state.base.hullId = hullId;
    return { ok: true, hull: Ships.baseHullById(hullId) };
  }

  function installModule(state, slotId, moduleId) {
    const slot = slotById(state, slotId);
    if (!slot || slot.type === "core") return { ok: false, err: "舱位不存在" };
    if (installation(state, slotId)) return { ok: false, err: "请先拆下当前模块" };
    const module = state.base.modules.owned.find(m => m.id === moduleId);
    if (!module) return { ok: false, err: "模块不在库存中" };
    if (module.type !== slot.type) return { ok: false, err: "模块与舱位不兼容" };
    if (state.base.modules.installed.some(x => x.moduleId === moduleId)) return { ok: false, err: "该模块已安装" };
    // 能源门禁（§1.5）：安装后将超出电网预算则拒绝。
    // 注意：装「能源舱」会即时提升预算（+ENERGY_OUTPUT），故其可用预算须计入自身发电，否则过载时永远无法自救（死锁）。
    const def = Ships.baseModuleByType(module.type);
    const extra = (def && def.energy) || 0;
    const effBudget = energyBudget(state) + (module.type === "energy" ? Ships.ENERGY_OUTPUT : 0);
    if (energyUsed(state) + extra > effBudget) {
      const need = Math.ceil((energyUsed(state) + extra) - effBudget);
      return { ok: false, err: "电网超载：需额外供能 " + need + "（装能源舱或升级核心）" };
    }
    state.base.modules.installed.push({ slotId: slotId, moduleId: moduleId });
    return { ok: true, slot: slot, module: module };
  }

  // ===== 能源电网（§1.5，2026-10-27 落地）=====
  // 总预算 = 本体外壳电网基础容量(BODY_LEVELS[lv].energy) + 已装能源舱数 × ENERGY_OUTPUT。
  // 负载 = 各已装模块 energy 占用之和（能源舱自身 0）。
  function energyBudget(state) {
    const lvl = Ships.bodyLevelPlan(state.base.bodyLevel).energy || 0;
    const gens = state.base.modules.installed.filter(e => {
      const m = state.base.modules.owned.find(x => x.id === e.moduleId);
      return m && m.type === "energy";
    }).length;
    return lvl + gens * Ships.ENERGY_OUTPUT;
  }
  function energyUsed(state) {
    let sum = 0;
    for (const entry of state.base.modules.installed) {
      const m = state.base.modules.owned.find(x => x.id === entry.moduleId);
      if (!m) continue;
      const def = Ships.baseModuleByType(m.type);
      sum += (def && def.energy) || 0;
    }
    return sum;
  }
  function powerReport(state) {
    const produced = energyBudget(state);
    const consumed = energyUsed(state);
    const ok = consumed <= produced;
    return { produced: produced, consumed: consumed, ok: ok, deficit: Math.max(0, consumed - produced) };
  }
  // 运行时棕化系数：超预算时工业队列按 负载/预算 比例降速（下限 0.1），避免硬阻塞旧档/突发超配。
  function powerMult(state) {
    const p = powerReport(state);
    if (p.ok) return 1;
    return Math.max(0.1, p.produced / Math.max(1, p.consumed));
  }

  // 升级唯一舰基核心（bodyLevel 0→3）。付 upgradeCost，递增并解锁能源预算 + 工业槽 + 高级舰种。
  function upgradeCore(state) {
    const lv = state.base.bodyLevel;
    if (lv >= 3) return { ok: false, err: "本体已至终级（深空要塞）" };
    const cost = Ships.upgradeCost(lv);
    if (!cost) return { ok: false, err: "本体已至终级" };
    for (const k in cost) if ((state.res[k] || 0) < cost[k]) return { ok: false, err: "资源不足" };
    for (const k in cost) state.res[k] = Math.max(0, (state.res[k] || 0) - cost[k]);
    state.base.bodyLevel = lv + 1;
    return { ok: true, level: state.base.bodyLevel, plan: Ships.bodyLevelPlan(state.base.bodyLevel) };
  }

  function uninstallModule(state, slotId) {
    const index = state.base.modules.installed.findIndex(x => x.slotId === slotId);
    if (index < 0) return { ok: false, err: "该舱位没有安装模块" };
    const [removed] = state.base.modules.installed.splice(index, 1);
    return { ok: true, module: state.base.modules.owned.find(m => m.id === removed.moduleId) || null };
  }

  function slotEffects(state, slotId) {
    const slot = slotById(state, slotId);
    const current = moduleAt(state, slotId);
    if (!slot || !current) return [];
    const effects = [];
    if (slot.special && slot.special.id === current.type) effects.push({
      queue: slot.special.queue, mult: slot.special.speedMult, text: "特化舱位「" + slot.special.name + "」：" + slot.special.effect,
    });
    for (const neighbor of adjacentSlots(state, slotId)) {
      const other = moduleAt(state, neighbor.id);
      if (!other) continue;
      for (const rule of LINK_RULES) {
        if ((current.type === rule.a && other.type === rule.b) || (current.type === rule.b && other.type === rule.a)) {
          effects.push({ queue: rule.queue, mult: rule.mult,
            text: "相邻" + other.name + "：" + rule.name + "，" + QUEUE_NAMES[rule.queue] + "耗时 -" + Math.round((1 - rule.mult) * 100) + "%" });
        }
      }
    }
    return effects;
  }

  function queueDurationMultiplier(state, queueType) {
    const hull = hullOf(state);
    const slots = Ships.baseHullSlots(hull).filter(s => s.type !== "core");
    const installedTypes = new Map(slots.map(s => [s.id, (moduleAt(state, s.id) || {}).type || null]));
    let multiplier = 1;
    for (const slot of slots) {
      if (!installedTypes.get(slot.id)) continue;
      if (slot.special && slot.special.id === slot.type && slot.special.queue === queueType) multiplier *= slot.special.speedMult;
      if (slot.type !== "energy" && slot.type !== "cargo") continue;
      for (const other of slots) {
        if (Math.abs(other.x - slot.x) + Math.abs(other.y - slot.y) !== 1) continue;
        for (const rule of LINK_RULES) {
          if (rule.queue !== queueType) continue;
          const a = installedTypes.get(slot.id), b = installedTypes.get(other.id);
          if ((a === rule.a && b === rule.b) || (a === rule.b && b === rule.a)) multiplier *= rule.mult;
        }
      }
    }
    return Math.max(0.65, Math.min(1, multiplier));
  }

  function hullStatus(state, hull) {
    if (state.base.ownedHullBlueprints.includes(hull.id)) return { owned: true, available: true, label: state.base.hullId === hull.id ? "当前母舰" : "切换母舰" };
    const faction = (state.factions || []).find(f => f.id === hull.factionId);
    const relation = faction ? faction.relation : 0;
    const enoughRel = relation >= hull.relationReq;
    const enoughLevel = state.base.bodyLevel >= hull.bodyLevelReq;
    const enoughCost = Object.keys(hull.blueprintCost || {}).every(k => (state.res[k] || 0) >= hull.blueprintCost[k]);
    const reason = !enoughRel ? "关系 " + relation + "/" + hull.relationReq
      : !enoughLevel ? "核心需 Lv." + (hull.bodyLevelReq + 1)
      : !enoughCost ? "星币不足" : "购买蓝图";
    return { owned: false, available: enoughRel && enoughLevel && enoughCost, label: reason };
  }

  return {
    normalize, hullOf, slotById, adjacentSlots, moduleAt, availableModules,
    buyBlueprint, switchHull, installModule, uninstallModule, slotEffects,
    queueDurationMultiplier, hullStatus,
    energyBudget, energyUsed, powerReport, powerMult, upgradeCore,
  };
});
