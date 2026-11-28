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

  // ===== 开罗式成套组合（2026-11-22，本作原创，数值均提议待标定）=====
  // 判定口径：指定的 3 类舱段两两曼哈顿距离 ≤2（聚落口径）。开罗化后纯看实时摆位，无「默认布局」。
  // kind="duration" 的效果烘进 queueDurationMultiplier（入队锁定）；kind="xp"/"logistics" 运行时生效。
  const COMBOS = [
    { id: "foundry",   name: "熔铸总装环", types: ["smelt", "manufacture", "equip"], kind: "duration",
      queues: ["manufacture", "equip"], mult: 0.90, effect: "制造 / 装备耗时 -10%" },
    { id: "powergrid", name: "全厂供能网", types: ["energy", "smelt", "manufacture"], kind: "duration",
      queues: ["smelt", "manufacture"], mult: 0.92, effect: "精炼 / 制造耗时 -8%" },
    { id: "academy",   name: "指挥演训所", types: ["command", "habitat", "dock"], kind: "xp",
      queues: [], mult: 1.10, effect: "演训经验 +10%" },
    { id: "research",  name: "科研闭环",   types: ["energy", "invent", "booster"], kind: "duration",
      queues: ["invent", "booster"], mult: 0.90, effect: "发明 / 增幅剂耗时 -10%" },
    { id: "logistics", name: "后勤中枢",   types: ["dock", "command", "energy"], kind: "logistics",
      queues: [], mult: 1.10, effect: "物流补偿 +10%" },
  ];
  const MANHATTAN_RADIUS = 2;

  // 当前摆位下所有「已激活」组合。types 任一类型可有多个实例，取距离最近的一组判定。
  function activeCombos(state) {
    if (!state || !state.base) return [];
    // cellId → module type
    const byCell = new Map();
    for (const e of (state.base.modules.installed || [])) {
      const m = state.base.modules.owned.find(x => x.id === e.moduleId);
      if (m) byCell.set(e.slotId, m.type);
    }
    const posOf = cellId => {
      const [x, y] = cellId.split(",").map(Number);
      return (Number.isInteger(x) && Number.isInteger(y)) ? [x, y] : null;
    };
    const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    const out = [];
    for (const combo of COMBOS) {
      // 每种类型收集其所在格坐标
      const groups = combo.types.map(t => {
        const cells = [];
        for (const [cid, mt] of byCell) if (mt === t) { const p = posOf(cid); if (p) cells.push([cid, p]); }
        return cells;
      });
      if (groups.some(g => !g.length)) continue;
      // 贪心：固定第一类的每个候选，后两类取距其最近的候选，三者两两 ≤R 即激活
      let activated = null;
      for (const a of groups[0]) {
        for (const b of groups[1]) {
          if (dist(a[1], b[1]) > MANHATTAN_RADIUS) continue;
          for (const c of groups[2]) {
            if (dist(a[1], c[1]) > MANHATTAN_RADIUS || dist(b[1], c[1]) > MANHATTAN_RADIUS) continue;
            activated = [a[0], b[0], c[0]];
            break;
          }
          if (activated) break;
        }
        if (activated) break;
      }
      if (activated) out.push({ combo: combo, cells: activated });
    }
    return out;
  }
  function comboEffectMult(state, kind, queueType) {
    let mult = 1;
    for (const a of activeCombos(state)) {
      const c = a.combo;
      if (c.kind !== kind) continue;
      if (kind === "duration" && c.queues.indexOf(queueType) < 0) continue;
      mult *= c.mult;
    }
    return mult;
  }

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
    if (!base.industry) base.industry = { smeltQueue: [], manufactureQueue: [], inventQueue: [], buildQueue: [], boosterQueue: [], equipQueue: [], enhanceQueue: [] };
    else if (!Array.isArray(base.industry.buildQueue)) base.industry.buildQueue = [];
    if (!Array.isArray(base.industry.boosterQueue)) base.industry.boosterQueue = [];
    // 2026-11-03：装备制造独立成「制造车间」队列。旧档只补空队列（不升版本、不迁移在制任务 ——
    // 旧档 manufactureQueue 里已在造的装备任务 outType="equipment"，会照旧在总装坞跑完）。
    if (!Array.isArray(base.industry.equipQueue)) base.industry.equipQueue = [];
    // ② 舰船强化队列（总装船坞共享槽位）：旧档补空队列（不升版本、不迁移在制任务）
    if (!Array.isArray(base.industry.enhanceQueue)) base.industry.enhanceQueue = [];
    // ③ 舱段建造队列（2026-11-25）：旧档补空队列，不迁移（旧即时建造无在制任务）
    if (!Array.isArray(base.industry.moduleQueue)) base.industry.moduleQueue = [];
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

    // ===== 开罗化迁移（2026-11-22，幂等、不升版本）=====
    // 旧档：installed[].slotId = 舱段类型（"smelt"），另有 base.slotPos 记录玩家换位坐标。
    // 新档：slotId = 格位坐标（"x,y"），空格自由摆放，slotPos 退役。
    // 每类型可有多个实例：第 2 个及以后落在同类型的其它可用格（先到先得），无位置则留在库存（installed 中剔除）。
    const allCells = Ships.hullCells(hull).filter(s => !s.core);
    const cellIds = new Set(allCells.map(s => s.id));
    const oldTypeSlot = e => !!(e && typeof e.slotId === "string" && e.slotId.indexOf(",") < 0);
    const oldPos = (base.slotPos && typeof base.slotPos === "object" && !Array.isArray(base.slotPos)) ? base.slotPos : {};
    const newOwned = base.modules.owned.filter(m => m && m.id && Ships.baseModuleByType(m.type));
    const ownedById = new Map(newOwned.map(m => [m.id, m]));

    if (base.modules.installed.some(oldTypeSlot)) {
      // 旧档迁移：给每个旧 entry 找一个坐标。优先 slotPos[type]，否则该类型在 layout 的默认坐标；
      // 若该格已被占，按可用格顺序找第一个空格（支持同类多实例）。
      const usedCells = new Set();
      const migrated = [];
      // 先处理有明确 slotPos 的
      for (const e of base.modules.installed) {
        if (!oldTypeSlot(e)) continue;
        const m = ownedById.get(e.moduleId);
        if (!m) continue;
        const p = oldPos[e.slotId] || (hull.layout[e.slotId]);
        let cid = Array.isArray(p) ? p[0] + "," + p[1] : null;
        if (!cid || !cellIds.has(cid) || usedCells.has(cid)) {
          cid = allCells.map(s => s.id).find(id => !usedCells.has(id)) || null;
        }
        if (cid && !usedCells.has(cid)) { usedCells.add(cid); migrated.push({ slotId: cid, moduleId: e.moduleId }); }
      }
      // 保留本来就是新格式的 entry（理论上迁移中途的档）
      for (const e of base.modules.installed) {
        if (oldTypeSlot(e)) continue;
        if (!e || !cellIds.has(e.slotId) || usedCells.has(e.slotId) || !ownedById.has(e.moduleId)) continue;
        usedCells.add(e.slotId); migrated.push(e);
      }
      base.modules.installed = migrated;
      if (Array.isArray(state.members)) {
        // 旧档驻舱 slotId 也是类型 → 平移到该类型实例所在格；找不到则撤下。
        const cellOfType = t => (base.modules.installed.find(e => ownedById.get(e.moduleId) && ownedById.get(e.moduleId).type === t) || {}).slotId;
        for (const m of state.members) {
          if (!m || !m.assignment || m.assignment.type !== "station") continue;
          const a = m.assignment;
          if (a.slotId && a.slotId.indexOf(",") < 0) {
            const cid = a.slotType ? cellOfType(a.slotType) : cellOfType(a.slotId);
            if (cid) a.slotId = cid;
            else { m.assignment = null; if (m.status === "stationed") m.status = "idle"; }
          }
        }
      }
    } else {
      // 已是新格式：只清洗非法 / 重复格位，避免手改存档导致两模块叠同一格。
      const usedCells = new Set();
      base.modules.installed = base.modules.installed.filter(e => {
        if (!e || !cellIds.has(e.slotId) || usedCells.has(e.slotId) || !ownedById.has(e.moduleId)) return false;
        usedCells.add(e.slotId);
        return true;
      });
    }
    base.modules.owned = newOwned;
    delete base.slotPos;   // 自由摆放后不再有「覆盖默认拓扑」概念

    // 舱段被移除后（如 2026-11-22 删除仓储舱），旧档成员可能仍挂 station 派遣到已不存在的格位。
    // 只清失效 slotId 的 station 派遣，mine / combat / logistics 等其它派遣一律不动。
    if (Array.isArray(state.members)) {
      const validSlotIds = new Set(Ships.hullCells(hull).map(s => s.id));
      for (const m of state.members) {
        if (!m || !m.assignment || m.assignment.type !== "station") continue;
        if (validSlotIds.has(m.assignment.slotId)) continue;
        m.assignment = null;
        if (m.status === "stationed") m.status = "idle";
      }
    }
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
  // 可用格拓扑 = 船型可用格（静态，含核心 [3,3]）。开罗化后格子是空容器，
  // 占用状态查 installed[].slotId（= cellId）。所有「相邻 / 组合」判定必须走这里。
  function stateSlots(state) {
    return Ships.hullCells(hullOf(state));
  }
  function slotById(state, slotId) {
    return stateSlots(state).find(s => s.id === slotId) || null;
  }
  function adjacentSlots(state, slotId) {
    const slots = stateSlots(state);
    const slot = slots.find(s => s.id === slotId);
    if (!slot || slot.core) return [];
    return slots.filter(other => !other.core && other.id !== slotId
      && Math.abs(other.x - slot.x) + Math.abs(other.y - slot.y) === 1);
  }

  // ⚠️ 核心格的 id 是 "3,3"（见 Ships.hullCells 的 push(3,3,true)），**不是**字符串 "core"。
  //   旧代码拿 "core" 字面量比对永远匹配不到 → 模块能被拖进核心格 / 与核心格互换
  //   （2026-11-28 探针捉到：moveModule(2,3 → 3,3) 返回 ok）。统一走格位对象的 core 标志。
  function isCoreCell(state, cellId) {
    const c = slotById(state, cellId);
    return !!(c && c.core);
  }
  // 自由摆放：把某格上的模块实例移动到目标空格。核心不可动、目标须是可用空格。
  // 若目标已占用则返回失败（不做交换，UI 端应先拆再装；开罗式摆放以空格为主）。
  function moveModule(state, fromCell, toCell) {
    if (!fromCell || !toCell || fromCell === toCell) return { ok: false, err: "格位相同" };
    if (isCoreCell(state, fromCell) || isCoreCell(state, toCell)) return { ok: false, err: "唯一核心不可移动" };
    const slots = stateSlots(state);
    if (!slots.some(s => s.id === fromCell) || !slots.some(s => s.id === toCell)) return { ok: false, err: "格位不可用" };
    const inst = state.base.modules.installed.find(e => e.slotId === fromCell);
    if (!inst) return { ok: false, err: "来源格位没有模块" };
    if (state.base.modules.installed.some(e => e.slotId === toCell)) return { ok: false, err: "目标格位已占用" };
    inst.slotId = toCell;
    return { ok: true, from: fromCell, to: toCell };
  }
  // 兼容旧接口：swapSlots 曾用于「交换两插座坐标」。开罗化后若两格都有模块则互换，
  // 若目标为空则等价于移动。保留此函数让旧 UI 代码/探针不直接报错。
  function swapSlots(state, idA, idB) {
    if (!idA || !idB || idA === idB) return { ok: false, err: "格位相同" };
    if (isCoreCell(state, idA) || isCoreCell(state, idB)) return { ok: false, err: "唯一核心不可移动" };
    const slots = stateSlots(state);
    if (!slots.some(s => s.id === idA) || !slots.some(s => s.id === idB)) return { ok: false, err: "格位不可用" };
    const a = state.base.modules.installed.find(e => e.slotId === idA);
    const b = state.base.modules.installed.find(e => e.slotId === idB);
    if (a && b) { a.slotId = idB; b.slotId = idA; return { ok: true, swapped: true }; }
    if (a && !b) return moveModule(state, idA, idB);
    if (!a && b) return moveModule(state, idB, idA);
    return { ok: false, err: "两格均为空" };
  }
  // 恢复初始摆位：清空后按当前船layout重新落位每类首个实例（多出的实例回库存）。
  function resetSlotPos(state) {
    if (!state || !state.base) return { ok: false, err: "舰基不存在" };
    const hull = hullOf(state);
    const cellIds = new Set(Ships.hullCells(hull).filter(s => !s.core).map(s => s.id));
    const used = new Set();
    const installed = [];
    for (const type in Ships.BASE_MODULES) {
      const p = hull.layout[type];
      let cid = Array.isArray(p) ? p[0] + "," + p[1] : null;
      if (!cid || !cellIds.has(cid) || used.has(cid)) cid = Array.from(cellIds).find(id => !used.has(id));
      const m = state.base.modules.owned.find(x => x.type === type);
      if (cid && m && !used.has(cid)) { used.add(cid); installed.push({ slotId: cid, moduleId: m.id }); }
    }
    state.base.modules.installed = installed;
    clearStationAssignments(state, null);
    return { ok: true };
  }
  function hasCustomLayout(state) {
    // 开罗化后只要有任何模块不在「该类型 layout 默认格」即算自定义（提示可一键复位）。
    if (!state || !state.base) return false;
    const hull = hullOf(state);
    for (const e of state.base.modules.installed) {
      const m = state.base.modules.owned.find(x => x.id === e.moduleId);
      if (!m) continue;
      const p = hull.layout[m.type];
      const def = Array.isArray(p) ? p[0] + "," + p[1] : null;
      if (e.slotId !== def) return true;
    }
    return false;
  }
  function availableModules(state, slotId) {
    // 开罗化：任意未安装模块可装任意空格（格子无类型限制）。
    const slot = slotById(state, slotId);
    if (!slot || slot.core) return [];
    const modules = state.base.modules || { owned: [], installed: [] };
    const used = new Set(modules.installed.map(x => x.moduleId));
    return modules.owned.filter(m => !used.has(m.id));
  }

  // 资源建造：花资源造同类第 N 个实例（先入库存，不自动摆放；放置时再校验电力）。
  function buildModule(state, type) {
    const def = Ships.baseModuleByType(type);
    if (!def) return { ok: false, err: "未知舱段类型" };
    const cost = Ships.moduleBuildCost(type);
    if (!cost) return { ok: false, err: "该舱段不可建造" };
    const owned = state.base.modules.owned.filter(m => m.type === type);
    if (owned.length >= Ships.MODULE_INSTANCE_CAP) return { ok: false, err: "已达同类上限 " + Ships.MODULE_INSTANCE_CAP };
    for (const k in cost) if ((state.res[k] || 0) < cost[k]) return { ok: false, err: "资源不足" };
    for (const k in cost) state.res[k] = Math.max(0, (state.res[k] || 0) - cost[k]);
    const n = owned.length + 1;
    const inst = { id: "module_" + type + "_" + String(n).padStart(2, "0"), type: type };
    state.base.modules.owned.push(inst);
    return { ok: true, module: inst, cost: cost };
  }

  // 队列完成入库（2026-11-25：舱段建造改走总装队列，与造船同管线）。
  // 与 buildModule 的区别：成本已在入队时扣除、同类上限已在入队时校验，这里只做入库，
  // 避免「排队期间材料被挪作他用 / 上限被别的队列项抢先」导致完成时才失败。
  function finishModuleBuild(state, type) {
    const def = Ships.baseModuleByType(type);
    if (!def) return { ok: false, err: "未知舱段类型" };
    const owned = state.base.modules.owned.filter(m => m.type === type);
    const n = owned.length + 1;
    const inst = { id: "module_" + type + "_" + String(n).padStart(2, "0"), type: type };
    state.base.modules.owned.push(inst);
    return { ok: true, module: inst };
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
    // 同步撤下所有驻舱成员：原舱段已全部卸回库存，再挂着 station 派遣会永久卡死（见 clearStationAssignments）。
    state.base.modules.installed = [];
    clearStationAssignments(state, null);
    state.base.hullId = hullId;
    return { ok: true, hull: Ships.baseHullById(hullId) };
  }

  function installModule(state, slotId, moduleId) {
    const slot = slotById(state, slotId);
    if (!slot || slot.core) return { ok: false, err: "格位不可用" };
    if (installation(state, slotId)) return { ok: false, err: "请先拆下当前模块" };
    const module = state.base.modules.owned.find(m => m.id === moduleId);
    if (!module) return { ok: false, err: "模块不在库存中" };
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

  // ===== 燃料池（2026-11-26：统一唯一真相源；无容量上限）=====
  // base.fuel 是唯一权威（跃迁 / 战斗 / 考古都从这里扣）；res.fuel 仅作镜像保留，
  // 供旧档、HUD 与外部读取兼容 —— 所有写入必须经 setFuel，避免两本账再次分叉。
  // 燃料是可制造、可囤积的物资，不设容量墙；仅钳制非负，避免扣减产生负数。
  function setFuel(state, value) {
    if (!state || !state.base) return 0;
    const v = Math.max(0, Number(value) || 0);
    state.base.fuel = v;
    if (state.res) state.res.fuel = v;
    return v;
  }
  function grantFuel(state, amount) {
    return setFuel(state, ((state && state.base && state.base.fuel) || 0) + (Number(amount) || 0));
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

  // 撤下指向某舱位（或全体驻舱）的成员。舱段被拆下 / 换船后该岗已不存在，
  // 必须同步清掉成员的 station 派遣，否则成员会永久卡在「驻舱中」且无界面入口可撤回
  // （撤回按钮只在该舱位已装模块时显示）。slotId 为 null = 清空全部驻舱派遣。
  function clearStationAssignments(state, slotId) {
    if (!state || !Array.isArray(state.members)) return 0;
    let n = 0;
    for (const m of state.members) {
      if (m.destroyed || !m.assignment || m.assignment.type !== "station") continue;
      if (slotId !== null && m.assignment.slotId !== slotId) continue;
      m.assignment = null;
      m.status = "idle";
      n++;
    }
    return n;
  }

  function uninstallModule(state, slotId) {
    const index = state.base.modules.installed.findIndex(x => x.slotId === slotId);
    if (index < 0) return { ok: false, err: "该舱位没有安装模块" };
    const [removed] = state.base.modules.installed.splice(index, 1);
    // 根因修复：拆下舱段 = 该舱位失去模块，驻舱者的岗位随之消失，必须一并撤下。
    const freed = clearStationAssignments(state, slotId);
    return { ok: true, module: state.base.modules.owned.find(m => m.id === removed.moduleId) || null, freed: freed };
  }

  // 顶替（2026-11-03 用户决策 ③：舱段库拖到「已占用」舱位 = 直接交换，不再要求先拆）。
  // 语义 = 先拆后装，但**失败要整体回滚**：电网超载 / 类型不兼容时原舱段必须留在原位。
  // 不做成「install 前偷偷 uninstall」的原因：installModule 的门禁（负载、已安装、类型）
  // 会读 installed 列表，摘掉旧件才能算出正确的替换后负载；所以顺序只能是「摘→装→失败回插」。
  function replaceModule(state, slotId, moduleId) {
    const slot = slotById(state, slotId);
    if (!slot || slot.core) return { ok: false, err: "格位不可用" };
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

  // 单格效果说明：特化格（放任意舱段生效）+ 该格所属已激活组合。
  function slotEffects(state, slotId) {
    const slot = slotById(state, slotId);
    const current = moduleAt(state, slotId);
    if (!slot || !current || slot.core) return [];
    const effects = [];
    if (slot.special) effects.push({
      queue: slot.special.queue, mult: slot.special.speedMult,
      text: "✦ 特化格「" + slot.special.name + "」：" + slot.special.effect,
    });
    for (const a of activeCombos(state)) {
      if (a.cells.indexOf(slotId) < 0) continue;
      const c = a.combo;
      effects.push({ queue: (c.queues[0] || null), mult: c.mult,
        text: "成套「" + c.name + "」：" + c.effect, combo: c.id });
    }
    return effects;
  }

  // 队列耗时乘区 = 特化格（该队列模块恰在特化格上） × 已激活 duration 组合。
  // 制造车间（equip）沿用制造特化格：特化格放任意模块即生效，故只按格位判定、不再按类型。
  function queueDurationMultiplier(state, queueType) {
    const slots = stateSlots(state).filter(s => !s.core);
    const installedTypes = new Map(slots.map(s => [s.id, (moduleAt(state, s.id) || {}).type || null]));
    let multiplier = 1;
    // 特化格：只要格上有模块就吃该船 speedMult（开罗式风水宝地，不再要求类型匹配）。
    const sp = slots.find(s => s.special && installedTypes.get(s.id));
    if (sp) multiplier *= sp.special.speedMult;
    // 成套组合（duration 类）乘区。
    multiplier *= comboEffectMult(state, "duration", queueType);
    return Math.max(0.65, Math.min(1, multiplier));
  }

  // 运行时增益（不烘进 it.dur）：演训经验 / 物流补偿的组合乘区。
  function comboXpMult(state) { return comboEffectMult(state, "xp", null); }
  function comboLogisticsMult(state) { return comboEffectMult(state, "logistics", null); }

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
    swapSlots, moveModule, resetSlotPos, hasCustomLayout, installModule, buildModule, finishModuleBuild,
    buyBlueprint, switchHull, uninstallModule, replaceModule, slotEffects,
    queueDurationMultiplier, comboXpMult, comboLogisticsMult, activeCombos, COMBOS, hullStatus,
    energyBudget, energyUsed, powerReport, powerMult, setFuel, grantFuel, upgradeCore,
    stationedAt, stationedOfType, stationWorker, stationSpeedMult, memberSkillLv,
    QUEUE_MODULE, QUEUE_SKILL, UNMANNED_PENALTY,
  };
});
