/* ================================================================
   ResourceRegistry — 兼容当前存档结构的统一资源寻址层

   业务代码使用 namespace:itemKey；底层仍读写原有 resources.* 字段。
   ================================================================ */

const RESOURCE_NAMESPACE_CONFIG = Object.freeze({
  currency:{ kind:"scalar" },
  ore:{ kind:"pool", pool:"ores", material:true },
  mineral:{ kind:"pool", pool:"minerals", material:true },
  planetary:{ kind:"pool", pool:"planetary", material:true },
  gas:{ kind:"pool", pool:"gases", material:true },
  moon:{ kind:"pool", pool:"moonOres", material:true },
  special:{ kind:"pool", pool:"special", material:true },
  component:{ kind:"pool", pool:"shipComponents" },
  ammo:{ kind:"pool", pool:"ammunition" },
  probe:{ kind:"pool", pool:"probes" },
  artifact:{ kind:"pool", pool:"artifacts" },
  calibration:{ kind:"pool", pool:"calibrations", material:true },
  // 蓝图发明：解析矩阵（通用池，ME / TE 研究共用；唯一条目 analysis_matrix）
  matrix:{ kind:"pool", pool:"matrix", material:true },
  consumable:{ kind:"scalar" },
  // 增强剂系统 Phase 2A：booster 库存不属于 state.resources，而是 state.boosters.inventory（见 getPoolContainer 特判）。
  booster:{ kind:"pool", pool:"boosterInventory", material:false }
});

const MATERIAL_NAMESPACE_ORDER = Object.freeze(["mineral", "ore", "planetary", "gas", "moon", "special"]);

const ResourceRegistry = (() => {
  const definitions = new Map();
  const idsByName = new Map();

  function makeId(namespace, key) { return namespace + ":" + key; }

  function parseId(id) {
    if (typeof id !== "string") return null;
    const separator = id.indexOf(":");
    if (separator <= 0 || separator >= id.length - 1) return null;
    return { namespace:id.slice(0, separator), key:id.slice(separator + 1) };
  }

  function register(definition) {
    if (!definition || !RESOURCE_NAMESPACE_CONFIG[definition.namespace]) throw new Error("未知资源命名空间：" + (definition && definition.namespace));
    const key = String(definition.key);
    const id = definition.id || makeId(definition.namespace, key);
    const config = RESOURCE_NAMESPACE_CONFIG[definition.namespace];
    const normalized = Object.freeze({
      id,
      namespace:definition.namespace,
      key,
      name:definition.name || key,
      category:definition.category || definition.namespace,
      pool:definition.pool || config.pool || null,
      scalarKey:definition.scalarKey || (config.kind === "scalar" ? key : null),
      material:definition.material !== undefined ? Boolean(definition.material) : Boolean(config.material)
    });
    definitions.set(id, normalized);
    const nameIds = idsByName.get(normalized.name) || [];
    if (!nameIds.includes(id)) nameIds.push(id);
    idsByName.set(normalized.name, nameIds);
    return normalized;
  }

  function getDefinition(id) {
    if (definitions.has(id)) return definitions.get(id);
    const parsed = parseId(id);
    const config = parsed && RESOURCE_NAMESPACE_CONFIG[parsed.namespace];
    if (!parsed || !config) return null;
    return register({ namespace:parsed.namespace, key:parsed.key, name:parsed.key });
  }

  function getResources(state) { return state && state.resources ? state.resources : null; }

  // 解析 pool 型资源的容器对象。booster 命名空间特判：容器为 state.boosters.inventory，其余走 state.resources[pool]。
  function getPoolContainer(state, definition, createIfMissing) {
    if (!state || !definition || !definition.pool) return null;
    if (definition.namespace === "booster") {
      if (!state.boosters || typeof state.boosters !== "object") { if (!createIfMissing) return null; state.boosters = {}; }
      if (!state.boosters.inventory || typeof state.boosters.inventory !== "object") { if (!createIfMissing) return null; state.boosters.inventory = {}; }
      return state.boosters.inventory;
    }
    const resources = getResources(state);
    if (!resources) return null;
    if (!resources[definition.pool] || typeof resources[definition.pool] !== "object") { if (!createIfMissing) return null; resources[definition.pool] = {}; }
    return resources[definition.pool];
  }

  function get(state, id) {
    const definition = getDefinition(id);
    if (!definition) return 0;
    if (definition.pool) {
      const container = getPoolContainer(state, definition, false);
      if (!container) return 0;
      // 兼容迁移前的增强剂库存：旧存档可能仍使用 booster:<id> 作为对象键。
      const value = container[definition.key];
      if (value !== undefined) return Number(value) || 0;
      if (definition.namespace === "booster") return Number(container["booster:" + definition.key]) || 0;
      return 0;
    }
    const resources = getResources(state);
    return resources ? Number(resources[definition.scalarKey]) || 0 : 0;
  }

  function set(state, id, quantity) {
    const definition = getDefinition(id);
    if (!definition) return false;
    const value = Math.max(0, Number(quantity) || 0);
    if (definition.pool) {
      const container = getPoolContainer(state, definition, true);
      if (!container) return false;
      const legacyKey = definition.namespace === "booster" ? "booster:" + definition.key : null;
      const previousValue = container[definition.key] !== undefined
        ? Number(container[definition.key]) || 0
        : (legacyKey ? Number(container[legacyKey]) || 0 : 0);
      container[definition.key] = value;
      if (legacyKey && legacyKey !== definition.key) delete container[legacyKey];
      // 仅在真实改变（值不同）时 emit 一次；add/spend/spendMaterial/spendCost 经 set 自然得到一次事件
      if (value !== previousValue && typeof GameEvents !== "undefined") {
        GameEvents.emit("resource:changed", { resourceId:id, previousValue, value, delta:Math.abs(value - previousValue) }, { source:"resource-registry" });
      }
    } else {
      const resources = getResources(state);
      if (!resources) return false;
      const previousValue = Number(resources[definition.scalarKey]) || 0;
      resources[definition.scalarKey] = value;
      if (value !== previousValue && typeof GameEvents !== "undefined") {
        GameEvents.emit("resource:changed", { resourceId:id, previousValue, value, delta:Math.abs(value - previousValue) }, { source:"resource-registry" });
      }
    }
    state._dirty = true;
    return true;
  }

  function add(state, id, quantity) {
    const delta = Number(quantity) || 0;
    if (delta === 0) return get(state, id);
    set(state, id, get(state, id) + delta);
    return get(state, id);
  }

  function spend(state, id, quantity) {
    const cost = Math.max(0, Number(quantity) || 0);
    if (get(state, id) < cost) return false;
    return set(state, id, get(state, id) - cost);
  }

  function resolveMaterialIds(reference) {
    if (typeof reference !== "string") return [];
    const direct = getDefinition(reference);
    if (parseId(reference)) return direct && direct.material ? [direct.id] : [];
    return (idsByName.get(reference) || [])
      .map(id => definitions.get(id))
      .filter(definition => definition && definition.material)
      .sort((left, right) => MATERIAL_NAMESPACE_ORDER.indexOf(left.namespace) - MATERIAL_NAMESPACE_ORDER.indexOf(right.namespace))
      .map(definition => definition.id);
  }

  function getMaterialStock(state, reference) {
    return resolveMaterialIds(reference).reduce((total, id) => total + get(state, id), 0);
  }

  function canAffordCost(state, cost, multiplier) {
    const cycles = Math.max(1, Number(multiplier) || 1);
    return Object.entries(cost || {}).every(([reference, quantity]) => getMaterialStock(state, reference) >= Number(quantity) * cycles);
  }

  function spendMaterial(state, reference, quantity) {
    let remaining = Math.max(0, Number(quantity) || 0);
    const ids = resolveMaterialIds(reference);
    if (ids.reduce((total, id) => total + get(state, id), 0) < remaining) return false;
    for (const id of ids) {
      if (remaining <= 0) break;
      const deduction = Math.min(remaining, get(state, id));
      spend(state, id, deduction);
      remaining -= deduction;
    }
    return true;
  }

  function spendCost(state, cost, multiplier) {
    const cycles = Math.max(1, Number(multiplier) || 1);
    if (!canAffordCost(state, cost, cycles)) return false;
    for (const [reference, quantity] of Object.entries(cost || {})) spendMaterial(state, reference, Number(quantity) * cycles);
    return true;
  }

  // 按 ref 形态自动解析：namespace:key（如 component:integrated_hull）走精确 get/spend；
  // 纯材料名（如 "镓"/"天使低级加密数据"，跨命名空间按名聚合）走 getMaterialStock/spendMaterial。
  // 供船坞节省 quote/commit 使用：materialCost 键为纯名称，componentCost 键被前缀为 component:。
  function getByRef(state, ref) {
    return parseId(ref) ? get(state, ref) : getMaterialStock(state, ref);
  }
  function spendByRef(state, ref, quantity) {
    return parseId(ref) ? spend(state, ref, quantity) : spendMaterial(state, ref, quantity);
  }

  function getResourceDisplayName(id) {
    if (typeof id !== "string" || !id) return id;
    // Batch L（IP 去相似化）：显示层优先走统一 DisplayNames（矿石/矿物/特殊材料/货币）；
    // 内部库存键永久保持原值，仅显示名替换。DisplayNames 未映射（返回 null 或原 key）时
    // 回落 ResourceRegistry 已注册 definition.name；完全未知资源才回退原始 ID。
    const parsed = parseId(id);
    const definition = definitions.has(id) ? definitions.get(id) : getDefinition(id);
    const defName = (definition && definition.name && definition.name !== definition.key) ? definition.name : null;
    if (parsed) {
      if (typeof DisplayNames !== "undefined" && DisplayNames && typeof DisplayNames.getResourceName === "function") {
        const renamed = DisplayNames.getResourceName(parsed.namespace, parsed.key, null);
        if (renamed !== null && renamed !== undefined) {
          // DisplayNames 明确给出新映射（与原 key 不同）——直接采用
          if (renamed !== parsed.key) return renamed;
          // renamed === parsed.key：可能是 ore/mineral 未映射（应回落 defName），
          // 也可能是 moon/gas/planetary 这类「裸键即最终显示名、且无专门 IP 映射」的命名空间。
          // 后者直接在显示层采用裸键，避免把 "moon:镓" 这类带命名空间前缀的 id 泄漏到界面。
          const BARE_KEY_NAMESPACES = ["moon", "gas", "planetary", "special"];
          if (BARE_KEY_NAMESPACES.includes(parsed.namespace)) {
            // 若注册了与 key 不同的显示名（如新增的「潜能芯片 · 采矿」技能模块，key 为 ASCII 的
            // 潜能芯片_mining），优先用注册名，避免内部键泄漏到界面；未注册别名时仍用裸键。
            if (defName) return defName;
            return renamed;
          }
        }
      }
      if (defName) return defName;
      // 装备 / 探针：数据库中无 ResourceRegistry 定义（equipment 未注册；probe 可能漏注册），
      // 在此兜底解析，避免把 equipment:<id> / probe:<id> 这类内部键泄漏到战斗日志、结算弹窗。
      if (parsed.namespace === "equipment" && typeof EQUIPMENT_DB !== "undefined" && EQUIPMENT_DB) {
        const eq = EQUIPMENT_DB[parsed.key];
        if (eq && eq.name) return eq.name;
      }
      if (parsed.namespace === "probe" && typeof getArchaeologyProbe === "function") {
        const probe = getArchaeologyProbe(parsed.key);
        if (probe && probe.name) return probe.name;
      }
      return id;
    }
    // 非 namespace:key 形式（如直接中文名"三钛合金"）：查 DisplayNames 裸键映射，否则原样
    if (typeof DisplayNames !== "undefined" && DisplayNames && typeof DisplayNames.getResourceRefName === "function") {
      const renamed = DisplayNames.getResourceRefName(id, null);
      if (renamed !== null && renamed !== undefined) return renamed;
    }
    return id;
  }

  function listDefinitions(namespace) {
    return [...definitions.values()].filter(definition => !namespace || definition.namespace === namespace);
  }

  function listStateEntries(state, namespace) {
    const config = RESOURCE_NAMESPACE_CONFIG[namespace];
    const resources = getResources(state);
    if (!config || !resources) return [];
    if (config.kind === "scalar") {
      return listDefinitions(namespace).map(definition => ({ definition, quantity:get(state, definition.id) }));
    }
    return Object.entries(resources[config.pool] || {}).map(([key, quantity]) => {
      const definition = getDefinition(makeId(namespace, key));
      return { definition, quantity:Number(quantity) || 0 };
    });
  }

  function getInventoryTotal(state) {
    const namespaces = ["ore", "mineral", "planetary", "gas", "moon", "special", "calibration", "component"];
    const stackables = namespaces.reduce((total, namespace) =>
      total + listStateEntries(state, namespace).reduce((sum, entry) => sum + entry.quantity, 0), 0);
    const equipmentStrings = state && state.equipment && Array.isArray(state.equipment.inventory) ? state.equipment.inventory.length : 0;
    const equipmentInstances = state && state.equipment && Array.isArray(state.equipment.instances)
      ? state.equipment.instances.filter(instance => !instance.installedOn).length
      : 0;
    return stackables + equipmentStrings + equipmentInstances;
  }

  return {
    makeId,
    parseId,
    register,
    getDefinition,
    get,
    set,
    add,
    spend,
    resolveMaterialIds,
    getMaterialStock,
    canAffordCost,
    spendMaterial,
    spendCost,
    getByRef,
    spendByRef,
    getResourceDisplayName,
    listDefinitions,
    listStateEntries,
    getInventoryTotal
  };
})();
window.ResourceRegistry = ResourceRegistry;

/* 统一资源名称解析：namespace:key → 中文显示名；解析失败回退原始键 */
function getResourceDisplayName(resourceKey) {
  return ResourceRegistry.getResourceDisplayName(resourceKey);
}
window.getResourceDisplayName = getResourceDisplayName;
