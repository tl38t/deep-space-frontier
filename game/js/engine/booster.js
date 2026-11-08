// ================================================================
// 深空星疆 —— Engine.Booster：增强剂（忠实移植 1 代模型，适配本作舰基全局架构）
//
// 设计要点（相对 1 代的数据层 js/lib/eveidle/data/boosters.js 已全局加载）：
//  - 数据来自 window.BOOSTER_ITEMS / BOOSTER_RECIPES / BOOSTER_SLOTS / BOOSTER_SERIES（1 代正本，不动）。
//  - 瓶身库存 = state.res["booster:<id>"]（与 1 代 ResourceRegistry.get(state, itemId) 同口径）。
//  - 装备：消耗 1 瓶入槽（active[slot]={itemId, remainingMs:180000}）；计时耗尽自动从库存续瓶。
//  - 16 槽（miningSpeed/miningYield/.../combatWeapon/combatRepair），全局生效（非 1 代逐成员）。
//  - 计时消耗按「当前在岗活动」判定：采矿/气/考古/战斗按需；工业四槽（冶炼/舰船/装备/增幅剂）常驻运行。
//  - 本作无全局玩家等级 → recipe.level 解锁门槛暂不做硬门禁（仅 requiresBlueprint 门禁生效）。
//  - 向后兼容 shim：levelOf→0 / list→[] / apply→no-op，避免旧 app.js 引用崩溃（旧 UI 由 UI 任务替换）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Booster = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Booster = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DURATION_MS = 180000; // 每瓶 180s（与 1 代 BOOSTER_DURATION_MS 一致）

  // —— 1 代配方 cost 键 → 本作资源键 映射 ——
  // planetary:<产物名> → 本作 planet_<type>（按 1 代行星产物语义）
  const PLANET_NAME_TO_KEY = {
    "重金属": "planet_lava", "稀有气体": "planet_gas", "同位素": "planet_ice",
    "等离子体": "planet_plasma", "生物质": "planet_bio", "磁场聚合物": "planet_mag",
  };
  // gas:<气体名> → 本作 gas 键
  const GAS_NAME_TO_KEY = {
    "粗制富勒烯": "crude_fullerene", "氦同位素": "he_gas", "稳定富勒烯": "stable_fullerene",
    "氢同位素": "hy_gas", "高纯富勒烯": "high_purity_fullerene", "聚合气体": "poly_gas",
    "超纯聚合气体": "ultra_pure_poly_gas",
  };
  // special:<战术材料名> → 本作 tactic:t1..t5（战斗掉落，step 2 才可得；此处仅注册键名）
  const SPECIAL_NAME_TO_KEY = {
    "战术残液": "tactic:t1", "活性战术凝胶": "tactic:t2", "高能战术萃取物": "tactic:t3",
    "极化战术介质": "tactic:t4", "深层适应性样本": "tactic:t5",
  };

  // —— 槽位 → 行动类别（与 1 代 getActionBoosterSlots 同口径，类别名用于计时判定）——
  const SLOT_ACTION = {
    miningSpeed: "mining", miningYield: "mining",
    gasSpeed: "gas", gasYield: "gas",
    archaeologySpeed: "archaeology", archaeologyRare: "archaeology",
    smeltSpeed: "refining", smeltYield: "refining",
    shipSpeed: "ship", shipYield: "ship",
    equipmentSpeed: "equipment", equipmentYield: "equipment",
    boosterSpeed: "booster", boosterYield: "booster",
    combatWeapon: "combat", combatRepair: "combat",
  };
  // 槽位 → 分类 id（与 1 代 BOOSTER_CATEGORY_META.id 一致，用于兼容判定）
  const SLOT_CATEGORY = {
    miningSpeed: "mining", miningYield: "mining",
    archaeologySpeed: "archaeology", archaeologyRare: "archaeology",
    gasSpeed: "gas", gasYield: "gas",
    smeltSpeed: "refining", smeltYield: "refining",
    shipSpeed: "ship", shipYield: "ship",
    equipmentSpeed: "equipment", equipmentYield: "equipment",
    boosterSpeed: "booster", boosterYield: "booster",
    combatWeapon: "combatWeapon", combatRepair: "combatRepair",
  };
  // 槽位 → 技能经验键（神经增强器经验茶模型）。
  // ⚠️ 本作技能键名与 1 代不同：1 代 gasHarvesting/refining/shipEngineering/equipmentEngineering/
  // boosterEngineering 在本作分别为 gas/refine/manufacture/manufacture/research；
  // 战斗技能拆分为 combatLaser/combatTurret/missile/defense/capacitor（见 state.js SKILL_KEYS）。
  // ⚠️ 值必须是 SKILL_KEYS 里真实存在的 12 项之一：boosterEngineering 在 12 项体系里没有对应键，
  //    曾直接映射成 "booster" → 写进 eff.skillXpMultBySkill.booster，而 xpMultOf(state,m,"research")
  //    永远读不到 → 增强剂「经验茶」对反应实验室完全无效。2026-11-03 并入科研（research）。
  // 故此处一律映射到本作键名，combat 桶在 getEffectState 末尾广播到战斗子键。
  const SLOT_XP_SKILL = {
    miningSpeed: "mining", miningYield: "mining",
    archaeologySpeed: "archaeology", archaeologyRare: "archaeology",
    gasSpeed: "gas", gasYield: "gas",
    smeltSpeed: "refine", smeltYield: "refine",
    shipSpeed: "manufacture", shipYield: "manufacture",
    equipmentSpeed: "manufacture", equipmentYield: "manufacture",
    boosterSpeed: "research", boosterYield: "research",
    combatWeapon: "combat", combatRepair: "combat",
  };

  // ===== 数据桥接（只读 window.BOOSTER_*，不复制）=====
  function items() { return (typeof window !== "undefined" && window.BOOSTER_ITEMS) || {}; }
  function recipes() { return (typeof window !== "undefined" && window.BOOSTER_RECIPES) || []; }
  function slots() { return (typeof window !== "undefined" && window.BOOSTER_SLOTS) || []; }
  function seriesMap() { return (typeof window !== "undefined" && window.BOOSTER_SERIES) || {}; }

  function getItem(id) {
    if (!id) return null;
    const key = String(id).startsWith("booster:") ? String(id).slice("booster:".length) : String(id);
    return items()[key] || null;
  }
  function getRecipe(id) {
    if (!id) return null;
    const key = String(id).startsWith("booster:") ? String(id).slice("booster:".length) : String(id);
    return recipes().find(r => r.id === key) || null;
  }

  // 1 代配方 cost 键 → 本作资源键（planetary:/gas:/special: 前缀展开）
  function remapCost(cost) {
    const out = {};
    for (const k in cost) {
      if (!Object.prototype.hasOwnProperty.call(cost, k)) continue;
      if (k.startsWith("planetary:")) {
        const name = k.slice("planetary:".length);
        const key = PLANET_NAME_TO_KEY[name];
        if (key) out[key] = cost[k]; // 未命中则跳过（防御脏数据）
      } else if (k.startsWith("gas:")) {
        const name = k.slice("gas:".length);
        const key = GAS_NAME_TO_KEY[name];
        if (key) out[key] = cost[k];
      } else if (k.startsWith("special:")) {
        const name = k.slice("special:".length);
        const key = SPECIAL_NAME_TO_KEY[name];
        if (key) out[key] = cost[k];
      } else {
        out[k] = cost[k];
      }
    }
    return out;
  }

  // ===== 状态初始化 =====
  function ensure(state) {
    if (!state) return null;
    if (!state.boosters || typeof state.boosters !== "object") state.boosters = { active: {}, lastTick: 0 };
    if (!state.boosters.active || typeof state.boosters.active !== "object") state.boosters.active = {};
    if (typeof state.boosters.lastTick !== "number") state.boosters.lastTick = 0;
    return state.boosters;
  }

  // ===== 库存（瓶身 = state.res["booster:<id>"]）=====
  function inventoryCount(state, itemId) { return (state.res && state.res[itemId]) || 0; }
  function addToInventory(state, itemId, qty) {
    if (!state.res) state.res = {};
    state.res[itemId] = (state.res[itemId] || 0) + (qty || 0);
  }
  function spendInventory(state, itemId, qty) {
    if (!state.res) state.res = {};
    state.res[itemId] = Math.max(0, (state.res[itemId] || 0) - (qty || 0));
  }

  // ===== 蓝图门禁（仅 requiresBlueprint 生效；level 门槛本作无全局等级，暂不做）=====
  function hasBlueprint(state, recipeId) {
    return Array.isArray(state && state.ownedBlueprints) && state.ownedBlueprints.includes("booster:" + recipeId);
  }
  function canCraft(state, recipeId) {
    const r = getRecipe(recipeId);
    if (!r) return { ok: false, err: "配方不存在" };
    if (r.requiresBlueprint && !hasBlueprint(state, r.id)) return { ok: false, err: "需要蓝图（考古/货柜掉落）" };
    return { ok: true, recipe: r };
  }
  // 制造队列项用的「已重映射成本」预览（UI 显示用）+ ME 减免（引擎入队扣料同口径）。
  // ⚠️ 顺序固定：remapCost → discountedCost（将来若接精密配给剂）→ ME。
  //    ME 必须最后叠，否则会重蹈 1 代 station.js:1074 的重复叠折扣 bug。
  //    ME 取整是经用户明确授权的 1 代偏离（总额确定性分摊），见 Engine.Invention。
  function craftCost(state, recipeId) {
    const r = getRecipe(recipeId);
    if (!r) return null;
    let cost = remapCost(r.cost);
    const I = (typeof window !== "undefined" && window.NSK && window.NSK.Engine)
      ? window.NSK.Engine.Invention : null;
    if (I) {
      const meR = I.meReduction(state, "booster:" + String(recipeId).replace(/^booster:/, ""));
      if (meR) cost = I.applyMeReduction(cost, meR);
    }
    return cost;
  }

  // ===== 兼容判定（isCompatible）=====
  function isCompatible(item, slot) {
    if (!item) return false;
    if (item.universal) {
      // 技能超载（skillLevelBonus）只允许采集/制造类槽，禁战斗槽
      if (item.effectType === "skillLevelBonus") {
        const act = SLOT_ACTION[slot];
        return !!act && act !== "combat";
      }
      return true;
    }
    const cat = SLOT_CATEGORY[slot];
    if (!cat) return item.slot === slot;
    const cats = Array.isArray(item.category) ? item.category : [item.category];
    return cats.indexOf(cat) !== -1;
  }
  function canEquip(state, slot, itemId) {
    if (!slots().includes(slot)) return { ok: false, err: "非法槽位" };
    const item = getItem(itemId);
    if (!item) return { ok: false, err: "物品不存在" };
    if (!isCompatible(item, slot)) return { ok: false, err: "槽位不兼容" };
    if (inventoryCount(state, item.itemId) < 1) return { ok: false, err: "库存不足" };
    return { ok: true, item: item };
  }

  // ===== 装备 / 卸下 / 替换 =====
  // 装备：消耗 1 瓶入槽（起始满 180s）。槽内瓶未退回（与 1 代同口径：部分时间不回收）。
  function equip(state, slot, itemId) {
    ensure(state);
    const chk = canEquip(state, slot, itemId);
    if (!chk.ok) return chk;
    spendInventory(state, chk.item.itemId, 1);
    state.boosters.active[slot] = { itemId: chk.item.itemId, remainingMs: DURATION_MS };
    return { ok: true, slot: slot, itemId: chk.item.itemId };
  }
  function unequip(state, slot) {
    ensure(state);
    if (state.boosters.active[slot]) { delete state.boosters.active[slot]; return { ok: true, slot: slot }; }
    return { ok: false, err: "该槽未装载" };
  }
  function replace(state, slot, itemId) {
    unequip(state, slot);
    return equip(state, slot, itemId);
  }

  // ===== 计时消耗（逐瓶模型，忠实 1 代 calculateBoosterTimeConsumption）=====
  function calculateConsumption(entry, elapsedMs, invCount) {
    if (!entry || !entry.itemId) return { entry: null, consumed: 0, depleted: false };
    if (!(elapsedMs > 0)) return { entry: { itemId: entry.itemId, remainingMs: entry.remainingMs || 0 }, consumed: 0, depleted: false };
    const DUR = DURATION_MS;
    let remaining = Number(entry.remainingMs) || 0;
    if (remaining <= 0) remaining = 0;
    let inv = Math.max(0, Math.floor(Number(invCount) || 0));
    if (elapsedMs < remaining) {
      return { entry: { itemId: entry.itemId, remainingMs: remaining - elapsedMs }, consumed: 0, depleted: false };
    }
    let consumed = 0, need = elapsedMs - remaining;
    while (need > 0) {
      if (inv <= 0) return { entry: null, consumed: consumed, depleted: true };
      inv--; consumed++;
      if (need >= DUR) { need -= DUR; }
      else { return { entry: { itemId: entry.itemId, remainingMs: DUR - need }, consumed: consumed, depleted: false }; }
    }
    if (inv > 0) { inv--; consumed++; return { entry: { itemId: entry.itemId, remainingMs: DUR }, consumed: consumed, depleted: false }; }
    return { entry: null, consumed: consumed, depleted: true };
  }

  // 应用单槽计时（修改 state.res + active）
  function consumeSlot(state, slot, elapsedMs) {
    ensure(state);
    const entry = state.boosters.active[slot];
    if (!entry || !entry.itemId) return { consumed: 0, depleted: false };
    const inv = inventoryCount(state, entry.itemId);
    const res = calculateConsumption(entry, elapsedMs, inv);
    if (res.consumed > 0) spendInventory(state, entry.itemId, res.consumed);
    if (res.depleted) { delete state.boosters.active[slot]; }
    else if (res.entry) { state.boosters.active[slot] = { itemId: res.entry.itemId, remainingMs: res.entry.remainingMs }; }
    else { delete state.boosters.active[slot]; }
    return { consumed: res.consumed, depleted: res.depleted };
  }

  // 当前在岗活动 → 需计时的类别集合
  function activeCategories(state) {
    const cats = {};
    // 工业四槽恒定运行（本作队列每 tick 持续结算）
    cats.refining = true; cats.ship = true; cats.equipment = true; cats.booster = true;
    const Data = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data : null;
    for (const m of (state.members || [])) {
      if (m.destroyed || !m.assignment) continue;
      const a = m.assignment;
      if (a.type === "mine") {
        // 采矿派遣同时覆盖矿石与气云；按目标矿种激活对应类别
        let isGas = false;
        if (Data && Data.Resources && Data.Resources.GAS && a.oreId) isGas = !!Data.Resources.GAS[a.oreId];
        if (isGas) cats.gas = true; else cats.mining = true;
        // 未指定 oreId 时两类别都激活（默认最丰富，可能是气或矿）
        if (!a.oreId) { cats.mining = true; cats.gas = true; }
      } else if (a.type === "explore") {
        cats.archaeology = true;
      } else if (a.type === "combat") {
        cats.combat = true;
      }
    }
    return cats;
  }

  // 每 tick 推进计时（由 Settle.settle 调用，在线/离线统一：dt 已是本作封顶后的真实耗时）。
  // 不额外夹紧：离线期间增强剂若在岗即持续消耗（与工业队列同口径）。lastTick 恒推进防追扣。
  function tick(state, now) {
    const b = ensure(state);
    const last = b.lastTick || now;
    let elapsed = now - last;
    if (!(elapsed > 0)) { b.lastTick = now; return; }
    const cats = activeCategories(state);
    const allSlots = slots();
    for (const slot of allSlots) {
      const cat = SLOT_ACTION[slot];
      if (!cat) continue;
      if (!cats[cat]) continue; // 该类别当前无活动 → 不消耗（瓶装暂停保留）
      consumeSlot(state, slot, elapsed);
    }
    b.lastTick = now;
  }

  // ===== 效果聚合（忠实 1 代 getBoosterEffectState 语义）=====
  function getEffectState(state) {
    const b = ensure(state);
    const active = b.active || {};
    const eff = {
      miningSpeedMultiplier: 1,
      doubleMineralChance: 0,
      gasSpeedMultiplier: 1,
      doubleGasChance: 0,
      archaeologySpeedMultiplier: 1,
      rareShiftMultiplier: 1,
      smeltSpeedMultiplier: 1,
      doubleSmeltChance: 0,
      shipSpeedMultiplier: 1,
      equipmentSpeedMultiplier: 1,
      shipMaterialDiscount: 0,
      shipMaterialLevelGate: 0,
      shipMaterialRoundDown: false,
      equipMaterialDiscount: 0,
      equipMaterialLevelGate: 0,
      equipMaterialRoundDown: false,
      boosterSpeedMultiplier: 1,
      doubleBoosterChance: 0,
      weaponDamageMultiplier: { laser: 1, missile: 1, cannon: 1 },
      repairMultiplier: { shield: 1, armor: 1, structure: 1 },
      // ⚠️ 白名单即这两张表：SLOT_XP_SKILL 的值不在这里出现时，写入分支的 `!== undefined`
      //    会静默跳过（曾因表里只有 "booster"、而 SLOT_XP_SKILL 也写 "booster"，
      //    看起来自洽，实际整个 "booster" 键全游戏无人读）。现统一为 research。
      skillLevelBySkill: { mining: 0, gas: 0, refine: 0, manufacture: 0, research: 0, archaeology: 0, combat: 0 },
      skillXpMultBySkill: { mining: 1, gas: 1, refine: 1, manufacture: 1, research: 1, archaeology: 1, combat: 1 },
      activeEntries: {},
    };
    for (const slot of slots()) {
      const entry = active[slot];
      if (!entry || !entry.itemId) continue;
      const item = getItem(entry.itemId);
      if (!item) continue;
      const remainingMs = Number(entry.remainingMs);
      if (!(remainingMs > 0)) continue;
      eff.activeEntries[slot] = {
        itemId: item.id, name: item.name, quality: item.quality,
        effectType: item.effectType, effectValue: item.effectValue, remainingMs: remainingMs,
      };
      switch (item.effectType) {
        case "miningSpeed": eff.miningSpeedMultiplier *= (1 + Number(item.effectValue)); break;
        case "doubleMineral": { const v = Number(item.effectValue) || 0; if (v > eff.doubleMineralChance) eff.doubleMineralChance = v; break; }
        case "gasSpeed": eff.gasSpeedMultiplier *= (1 + Number(item.effectValue)); break;
        case "doubleGas": { const v = Number(item.effectValue) || 0; if (v > eff.doubleGasChance) eff.doubleGasChance = v; break; }
        case "archaeologySpeed": eff.archaeologySpeedMultiplier *= (1 + Number(item.effectValue)); break;
        case "rareShift": eff.rareShiftMultiplier *= (Number(item.effectValue) || 1); break;
        case "smeltSpeed": eff.smeltSpeedMultiplier *= (1 + Number(item.effectValue)); break;
        case "smeltDouble": { const v = Number(item.effectValue) || 0; if (v > eff.doubleSmeltChance) eff.doubleSmeltChance = v; break; }
        case "shipSpeed": eff.shipSpeedMultiplier *= (1 + Number(item.effectValue)); break;
        case "equipmentSpeed": eff.equipmentSpeedMultiplier *= (1 + Number(item.effectValue)); break;
        case "shipMaterialDiscount": {
          const dv = Number(item.effectValue) || 0;
          const lg = Number(item.levelGate) || 0;
          const grp = (slot === "shipSpeed" || slot === "shipYield") ? "ship" : "equip";
          if (dv > eff[grp + "MaterialDiscount"]) {
            eff[grp + "MaterialDiscount"] = dv;
            eff[grp + "MaterialRoundDown"] = (item.quality === "r" || item.quality === "l");
          }
          if (lg > eff[grp + "MaterialLevelGate"]) eff[grp + "MaterialLevelGate"] = lg;
          break;
        }
        case "boosterSpeed": eff.boosterSpeedMultiplier *= (1 + Number(item.effectValue)); break;
        case "boosterDouble": { const v = Number(item.effectValue) || 0; if (v > eff.doubleBoosterChance) eff.doubleBoosterChance = v; break; }
        case "damageMultiplier":
          if (item.weaponType && item.weaponType in eff.weaponDamageMultiplier)
            eff.weaponDamageMultiplier[item.weaponType] *= (1 + Number(item.effectValue));
          break;
        case "repairAmount":
          if (item.repairTarget && item.repairTarget in eff.repairMultiplier)
            eff.repairMultiplier[item.repairTarget] *= (1 + Number(item.effectValue));
          break;
        case "skillLevelBonus": {
          const sB = Number(item.effectValue) || 0;
          const sSkill = SLOT_XP_SKILL[slot];
          if (sSkill && eff.skillLevelBySkill[sSkill] !== undefined && sB > eff.skillLevelBySkill[sSkill])
            eff.skillLevelBySkill[sSkill] = sB;
          break;
        }
        case "skillXpMultiplier": {
          const xpSkill = SLOT_XP_SKILL[slot];
          if (xpSkill && eff.skillXpMultBySkill[xpSkill] !== undefined)
            eff.skillXpMultBySkill[xpSkill] *= (1 + Number(item.effectValue));
          break;
        }
      }
    }
    // 战斗神经加成广播：combat 桶 → 本作战斗子技能键（combatLaser/combatTurret/missile/defense/capacitor）。
    // 1 代按 laserOps/cannonOps/missileOperations/targeting/... 十个子键广播；本作战斗技能键已重构为
    // combatLaser/combatTurret/missile/defense，电容为 capacitor（物流副技能，但属战斗技能族），
    // 故广播到这五个本作键，保证「战斗增强剂」经验茶作用于本作实际战斗经验结算。
    const combatMult = Number(eff.skillXpMultBySkill.combat) || 1;
    if (combatMult !== 1) {
      const COMBAT_KEYS = ["combatLaser", "combatTurret", "missile", "defense", "capacitor"];
      for (const ck of COMBAT_KEYS) {
        const cur = Number(eff.skillXpMultBySkill[ck]) || 1;
        eff.skillXpMultBySkill[ck] = cur * combatMult;
      }
    }
    return eff;
  }

  // 临时技能等级（技能超载催化器）：基础等级 + 当前生效 bonus。state.skills[key].lvl 或 直接数值。
  function getEffectiveSkillLevel(state, key) {
    const g = state || ((typeof gameState !== "undefined") ? gameState : null);
    if (!g || !g.skills) return 1;
    const base = (g.skills[key] && Number(g.skills[key].lvl)) || 1;
    const eff = getEffectState(g);
    const bonus = Number(eff.skillLevelBySkill && eff.skillLevelBySkill[key]) || 0;
    return base + bonus;
  }

  // 双倍矿物/气云一次性骰子（纯函数）
  function rollDouble(chance, randomFn) {
    if (!(chance > 0)) return false;
    const rng = typeof randomFn === "function" ? randomFn : Math.random;
    return rng() < chance;
  }

  // 考古稀有率（rareShift）
  function effectiveUniqueRate(baseUniqueRate, rareShiftMultiplier) {
    const mult = Number(rareShiftMultiplier);
    if (!(mult > 0)) return baseUniqueRate;
    return Math.min(0.99, baseUniqueRate * mult);
  }

  // 精密配给剂材料折扣倍率（1 - discount，下限 0.05）。group: "ship" | "equip"。
  // 与 1 代 getShipMaterialDiscountMultiplier / getEquipEngBuildingQuote 同口径。
  function materialDiscountMultiplier(state, group) {
    const eff = getEffectState(state);
    if (!eff) return 1;
    let discount = group === "equip"
      ? (typeof eff.equipMaterialDiscount === "number" ? eff.equipMaterialDiscount : 0)
      : (typeof eff.shipMaterialDiscount === "number" ? eff.shipMaterialDiscount : 0);
    if (!(discount > 0)) return 1;
    if (discount > 0.95) discount = 0.95;
    return 1 - discount;
  }
  // 对成本表 { mat:qty } 按倍率缩放：roundDown=true 向下取整，否则向上取整；单条至少 1（不免费）。
  function discountCost(cost, mult, roundDown) {
    if (!cost || typeof cost !== "object" || !(mult > 0) || mult >= 1) return cost;
    const out = {};
    for (const mat in cost) {
      if (!Object.prototype.hasOwnProperty.call(cost, mat)) continue;
      const raw = Number(cost[mat]) * mult;
      let c = roundDown ? Math.floor(raw) : Math.ceil(raw);
      if (!(c >= 1)) c = 1;
      out[mat] = c;
    }
    return out;
  }
  // 取某组折扣后的实际成本（含 roundDown 品质判定）。group: "ship" | "equip"。
  function discountedCost(state, cost, group) {
    const eff = getEffectState(state);
    if (!eff) return cost;
    const mult = materialDiscountMultiplier(state, group);
    if (mult >= 1) return cost;
    const roundDown = group === "equip" ? (eff.equipMaterialRoundDown === true) : (eff.shipMaterialRoundDown === true);
    return discountCost(cost, mult, roundDown);
  }

  // ===== 显示态（UI 消费）=====
  function getDisplayState(state, now) {
    const eff = getEffectState(state);
    const groups = {
      mining: { label: "采矿", slots: ["miningSpeed", "miningYield"] },
      gas: { label: "采气", slots: ["gasSpeed", "gasYield"] },
      archaeology: { label: "考古", slots: ["archaeologySpeed", "archaeologyRare"] },
      refining: { label: "冶炼", slots: ["smeltSpeed", "smeltYield"] },
      ship: { label: "舰船工程", slots: ["shipSpeed", "shipYield"] },
      equipment: { label: "装备制造", slots: ["equipmentSpeed", "equipmentYield"] },
      booster: { label: "增幅剂制造", slots: ["boosterSpeed", "boosterYield"] },
      combat: { label: "战斗", slots: ["combatWeapon", "combatRepair"] },
    };
    const result = { effect: eff, groups: [] };
    for (const key in groups) {
      const grp = groups[key];
      const slotsData = grp.slots.map(slot => {
        const entry = (eff.activeEntries && eff.activeEntries[slot]) || null;
        if (!entry) return { slot: slot, empty: true };
        const sec = Math.ceil(entry.remainingMs / 1000);
        const mm = Math.floor(sec / 60), ss = sec % 60;
        return {
          slot: slot, empty: false, itemId: entry.itemId, name: entry.name, quality: entry.quality,
          effectType: entry.effectType, effectValue: entry.effectValue, remainingMs: entry.remainingMs,
          remainingText: (entry.remainingMs > 0) ? (mm + ":" + String(ss).padStart(2, "0")) : "耗尽",
          inventory: inventoryCount(state, entry.itemId),
        };
      });
      result.groups.push({ key: key, label: grp.label, slots: slotsData });
    }
    return result;
  }

  // 技能经验乘区（按本作技能键读取）：getEffectState 已把 combat 桶广播到战斗子键。
  function skillXpMultiplierFor(state, key) {
    const eff = getEffectState(state);
    return (eff && eff.skillXpMultBySkill && eff.skillXpMultBySkill[key] !== undefined) ? Number(eff.skillXpMultBySkill[key]) || 1 : 1;
  }

  // 临时技能等级（技能超载催化器），按本作键读取
  function skillLevelBonusFor(state, key) {
    const eff = getEffectState(state);
    return (eff && eff.skillLevelBySkill && eff.skillLevelBySkill[key] !== undefined) ? Number(eff.skillLevelBySkill[key]) || 0 : 0;
  }

  // 离线分段结算辅助：某槽总剩余秒（当前瓶 + 库存）
  function totalRemainingSeconds(state, slot) {
    const b = ensure(state);
    const entry = b.active && b.active[slot];
    if (!entry || !entry.itemId) return 0;
    const inv = inventoryCount(state, entry.itemId);
    const remS = (Number(entry.remainingMs) || 0) / 1000;
    return remS + Math.max(0, Math.floor(inv)) * (DURATION_MS / 1000);
  }

  // ===== 向后兼容 shim（旧 app.js 引用，避免崩溃；旧 UI 由 UI 任务替换）=====
  function levelOf() { return 0; }
  function list() { return []; }
  function apply() { return { ok: false, err: "已迁移至新增强剂系统" }; }
  function mult() { return 1; }
  function clean() { /* 新模型无需惰性清理 */ }

  return {
    // 数据桥接
    items, recipes, slots, seriesMap, getItem, getRecipe, remapCost,
    // 状态/库存
    ensure, inventoryCount, addToInventory, spendInventory,
    // 制造门禁
    hasBlueprint, canCraft, craftCost,
    // 装备
    isCompatible, canEquip, equip, unequip, replace,
    // 计时
    calculateConsumption, consumeSlot, activeCategories, tick,
    // 效果
    getEffectState, getEffectiveSkillLevel, rollDouble, effectiveUniqueRate,
    materialDiscountMultiplier, discountedCost, getDisplayState, totalRemainingSeconds,
    skillXpMultiplierFor, skillLevelBonusFor,
    // 兼容 shim
    levelOf, list, apply, mult, clean,
    DURATION_MS,
  };
});
