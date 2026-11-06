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
  const QUEUE_NAMES = { smelt: "精炼", manufacture: "制造", invent: "发明", booster: "增幅剂", equip: "装备" };
  const LINK_RULES = [
    { a: "energy", b: "smelt", queue: "smelt", mult: 0.92, name: "能源直供" },
    { a: "energy", b: "manufacture", queue: "manufacture", mult: 0.94, name: "能源直供" },
    { a: "energy", b: "equip", queue: "equip", mult: 0.94, name: "能源直供" },
    { a: "cargo", b: "smelt", queue: "smelt", mult: 0.96, name: "短链物流" },
    { a: "cargo", b: "manufacture", queue: "manufacture", mult: 0.94, name: "短链物流" },
    { a: "cargo", b: "equip", queue: "equip", mult: 0.94, name: "短链物流" },
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
    // 向后兼容：旧档（version<8）缺工业 buildQueue / boosterQueue 字段时兜底（MVP 周五新增）
    if (!base.industry) base.industry = { smeltQueue: [], manufactureQueue: [], inventQueue: [], buildQueue: [], boosterQueue: [], equipQueue: [] };
    else if (!Array.isArray(base.industry.buildQueue)) base.industry.buildQueue = [];
    if (!Array.isArray(base.industry.boosterQueue)) base.industry.boosterQueue = [];
    // 2026-11-03：装备制造独立成「制造车间」队列。旧档只补空队列（不升版本、不迁移在制任务 ——
    // 旧档 manufactureQueue 里已在造的装备任务 outType="equipment"，会照旧在总装坞跑完）。
    if (!Array.isArray(base.industry.equipQueue)) base.industry.equipQueue = [];
    // 增强剂状态迁移到 state.boosters（全局 16 槽 + 库存=state.res["booster:<id>"]），见 engine/booster.js。
    // 旧档残留的 base.boosters（整舱生效简化版数组）在此清掉，避免与新模型混淆。
    if (Array.isArray(base.boosters)) delete base.boosters;
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
    // 舱段布局覆盖（2026-10-29）：玩家拖动交换舱位后的落点，键 = 舱位 id，值 = [x, y]。
    // 旧档无此字段 → 空对象即「沿用船体蓝图拓扑」，与剧情字段一样靠 ensure 补齐，不升 STATE_VERSION。
    if (!base.slotPos || typeof base.slotPos !== "object" || Array.isArray(base.slotPos)) base.slotPos = {};
    const layoutSlots = Ships.baseHullSlots(hull).filter(s => s.type !== "core");
    const cleanedPos = {};
    for (const s of layoutSlots) {
      const p = base.slotPos[s.id];
      if (!Array.isArray(p) || p.length !== 2) continue;
      const px = p[0], py = p[1];
      if (!Number.isInteger(px) || !Number.isInteger(py) || px < 1 || px > 7 || py < 1 || py > 6) continue;
      if (px === s.x && py === s.y) continue;   // 与默认一致，不必存
      cleanedPos[s.id] = [px, py];
    }
    // 坐标冲突（手改存档 / 跨船体残留）时整套丢弃，回退船体默认布局，避免两张卡叠在同一格。
    const takenCells = new Set();
    let layoutConflict = false;
    for (const s of layoutSlots) {
      const p = cleanedPos[s.id] || [s.x, s.y];
      const cell = p[0] + "," + p[1];
      if (takenCells.has(cell)) { layoutConflict = true; break; }
      takenCells.add(cell);
    }
    base.slotPos = layoutConflict ? {} : cleanedPos;

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
  // 生效的舱位拓扑 = 船体蓝图默认 layout + 玩家拖拽覆盖（state.base.slotPos）。
  // 所有「相邻」判定必须走这里：否则界面显示的邻接关系与耗时/增效计算会分叉。
  function stateSlots(state) {
    const slots = Ships.baseHullSlots(hullOf(state));
    const pos = state && state.base ? state.base.slotPos : null;
    if (!pos || typeof pos !== "object") return slots;
    return slots.map(s => {
      if (s.type === "core") return s;
      const p = pos[s.id];
      if (!Array.isArray(p) || p.length !== 2) return s;
      return { id: s.id, type: s.type, x: p[0], y: p[1], special: s.special };
    });
  }
  function slotById(state, slotId) { return stateSlots(state).find(s => s.id === slotId) || null; }
  function adjacentSlots(state, slotId) {
    const slots = stateSlots(state);
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return [];
    return slots.filter(other => other.type !== "core" && other.id !== slotId
      && Math.abs(other.x - slot.x) + Math.abs(other.y - slot.y) === 1);
  }

  // 拖动换位：交换两个非核心舱位的坐标。唯一核心是舰体中轴锚点，固定不可移动。
  function swapSlots(state, idA, idB) {
    if (!idA || !idB || idA === idB) return { ok: false, err: "舱位相同" };
    const slots = stateSlots(state);
    const a = slots.find(s => s.id === idA);
    const b = slots.find(s => s.id === idB);
    if (!a || !b) return { ok: false, err: "舱位不存在" };
    if (a.type === "core" || b.type === "core") return { ok: false, err: "唯一核心不可移动" };
    if (!state.base.slotPos || typeof state.base.slotPos !== "object") state.base.slotPos = {};
    state.base.slotPos[idA] = [b.x, b.y];
    state.base.slotPos[idB] = [a.x, a.y];
    return { ok: true, a: { id: idA, x: b.x, y: b.y }, b: { id: idB, x: a.x, y: a.y } };
  }
  function resetSlotPos(state) {
    if (!state || !state.base) return { ok: false, err: "舰基不存在" };
    state.base.slotPos = {};
    return { ok: true };
  }
  function hasCustomLayout(state) {
    const pos = state && state.base ? state.base.slotPos : null;
    return !!(pos && typeof pos === "object" && Object.keys(pos).length);
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
    // 舱位布局是船体的物理结构，换船即回落到新船体的默认拓扑。
    state.base.modules.installed = [];
    state.base.slotPos = {};
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

  // 顶替（2026-11-03 用户决策 ③：舱段库拖到「已占用」舱位 = 直接交换，不再要求先拆）。
  // 语义 = 先拆后装，但**失败要整体回滚**：电网超载 / 类型不兼容时原舱段必须留在原位。
  // 不做成「install 前偷偷 uninstall」的原因：installModule 的门禁（负载、已安装、类型）
  // 会读 installed 列表，摘掉旧件才能算出正确的替换后负载；所以顺序只能是「摘→装→失败回插」。
  function replaceModule(state, slotId, moduleId) {
    const slot = slotById(state, slotId);
    if (!slot || slot.type === "core") return { ok: false, err: "舱位不存在" };
    const prev = state.base.modules.installed.find(x => x.slotId === slotId);
    if (!prev) return installModule(state, slotId, moduleId);
    if (prev.moduleId === moduleId) return { ok: false, err: "该模块已装在此舱位" };
    const index = state.base.modules.installed.indexOf(prev);
    const prevModule = state.base.modules.owned.find(m => m.id === prev.moduleId) || null;
    state.base.modules.installed.splice(index, 1);
    const r = installModule(state, slotId, moduleId);
    if (!r.ok) {
      state.base.modules.installed.splice(index, 0, prev);   // 原地回插，保持 installed 顺序
      return r;
    }
    return { ok: true, replaced: prevModule, module: r.module, slot: r.slot };
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
    const slots = stateSlots(state).filter(s => s.type !== "core");
    const installedTypes = new Map(slots.map(s => [s.id, (moduleAt(state, s.id) || {}).type || null]));
    // 制造车间（equip）沿用总装坞的特化舱位加成（军规装配位 / 战利品快装位…），
    // 否则独立成舱后舰体特化对装备制造完全失效，等于白送一个负面。相邻增效另由 LINK_RULES 的 equip 条目给。
    const specialKey = queueType === "equip" ? "manufacture" : queueType;
    let multiplier = 1;
    for (const slot of slots) {
      if (!installedTypes.get(slot.id)) continue;
      if (slot.special && slot.special.id === slot.type && slot.special.queue === specialKey) multiplier *= slot.special.speedMult;
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

  // ===== 驻舱（2026-11-01 技能体系）：一人一岗，与出征互斥 =====
  // 队列 → 承担该队列的舱段模块类型（造船与部件制造共用总装船坞）
  const QUEUE_MODULE = { smelt: "smelt", manufacture: "manufacture", invent: "invent", build: "manufacture", booster: "booster", equip: "equip" };
  // 队列 → 驻舱者决定耗时的技能键
  // ⚠️ 值必须是 SKILL_KEYS 里真实存在的 12 项之一 —— 否则 grantBatchXp 的白名单（!XP_RATE[key]）
  //    会静默 return 0，驻舱者永远拿不到经验（曾用 "booster"，一个体系外死键）。
  // equip 复用「制造」；booster 复用「科研」：科研同时管「研究科技」与「制造增强剂」，
  // 两条路都在涨同一项 research（用户 2026-11-03 定），不新增第 13 个技能键。
  const QUEUE_SKILL = { smelt: "refine", manufacture: "manufacture", invent: "research", build: "manufacture", booster: "research", equip: "manufacture" };
  const UNMANNED_PENALTY = 1.4;   // 舱段无人：该队列耗时 ×1.4（约 71% 速度）

  function stationedAt(state, slotId) {
    if (!state || !Array.isArray(state.members)) return null;
    for (const m of state.members) {
      if (!m.destroyed && m.assignment && m.assignment.type === "station" && m.assignment.slotId === slotId) return m;
    }
    return null;
  }

  // 按模块类型找驻舱者。command / dock / habitat 这些不接队列的舱段也用它。
  function stationedOfType(state, moduleType) {
    if (!state || !Array.isArray(state.members)) return null;
    for (const m of state.members) {
      if (!m.destroyed && m.assignment && m.assignment.type === "station"
          && (m.assignment.slotType === moduleType
              || (m.assignment.slotType === undefined && m.assignment.slotId === moduleType))) return m;
    }
    return null;
  }

  function memberSkillLv(m, key) {
    const E = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine : null;
    const S = E && E.Settle;
    if (!S || !S.levelOf || !m || !m.skills || !key) return 1;
    return S.levelOf(m.skills[key] || 0);
  }

  // 该队列的驻舱工头 → { member, skill }；无人返回 null。
  function stationWorker(state, queueType) {
    const type = QUEUE_MODULE[queueType];
    if (!type) return null;
    const m = stationedOfType(state, type);
    return m ? { member: m, skill: QUEUE_SKILL[queueType], moduleType: type } : null;
  }

  // 驻舱对「队列耗时」的乘数。**运行时算、不烘进 it.dur**：
  // 人可以撤走，撤了就该立刻变慢；而布局乘区是物理结构（queueDurationMultiplier 在入队时烘死）。
  // ⚠️ 无人惩罚 1.4 必须留在 queueDurationMultiplier 的 clamp(0.65~1) 之外，否则会被钳回 1。
  function stationSpeedMult(state, queueType) {
    const w = stationWorker(state, queueType);
    if (!w) return UNMANNED_PENALTY;
    return 1 / (1 + memberSkillLv(w.member, w.skill) * 0.02);
  }

  return {
    normalize, hullOf, stateSlots, slotById, adjacentSlots, moduleAt, availableModules,
    swapSlots, resetSlotPos, hasCustomLayout,
    buyBlueprint, switchHull, installModule, uninstallModule, replaceModule, slotEffects,
    queueDurationMultiplier, hullStatus,
    energyBudget, energyUsed, powerReport, powerMult, upgradeCore,
    stationedAt, stationedOfType, stationWorker, stationSpeedMult, memberSkillLv,
    QUEUE_MODULE, QUEUE_SKILL, UNMANNED_PENALTY,
  };
});
