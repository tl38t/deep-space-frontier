// ================================================================
// 打捞臂（同位素标记打捞臂）
// 对标 1 代：data/cargo.js:26-58（组件档位表 / 掉率常量）+ systems/combat.js:1100-1122（主动打捞）
// ----------------------------------------------------------------
// 被动（装备即生效，与开关无关）：
//   Σ 打捞臂 salvageEfficiency → 货柜掉率 ×(1+Σeff)，上限 50%（1 代同一句公式）。
//   本作此前 salvageEfficiency 是**零消费的死字段**（装备库有 9 件打捞臂，无人读取）。
//
// 主动（开关开启 + 队里有打捞臂 + 有同位素才触发）：
//   每击杀一艘：消耗 1(normal) / 2(elite) / 3(boss) 个同位素（planet_ice，1 代 planetary:同位素）；
//   触发则以 COMPONENT_CHANCE 掉**同数量**的舰船组件，档位按敌舰等级映射到 6 舰种部件。
//   1 代口径：先扣同位素、再掷骰（掷不中也扣）—— 保留，否则同位素消耗对不上。
//
// ★ 2026-11-27 用户拍板：组件掉落概率**统一 1/2**（三档 kind 一致）。
//   1 代原文是 min(baseChance × (1+Σeff), 0.5)，而 baseChance = 0.6%/1.0%/1.5%
//   ⇒ 就算满配 t5 打捞臂（+90%），band1 普通舰也只有 1.14% —— 打捞臂形同虚设。
//   改为固定 50% 后，代价只剩同位素消耗，这是本次唯一偏离 1 代的地方。
// ================================================================
(function () {
  "use strict";
  const NSK = (window.NSK = window.NSK || {});
  NSK.Engine = NSK.Engine || {};

  // ★ 用户拍板值：组件掉落统一 1/2
  const COMPONENT_CHANCE = 0.5;
  // 1 代同位素在本作的键（resources.js: planet_ice 显示名「同位素」）
  const ISO_KEY = "planet_ice";
  // 单次结算单档最多抽这么多次，超出改走期望分配（防离线 24h 大数循环）
  const MAX_DRAW_PER_KIND = 200;

  // 1 代 SALVAGE_COMPONENT_TIERS（data/cargo.js:35）
  const TIERS = [
    { min: 90, tier: "supercapital" },
    { min: 80, tier: "capital" },
    { min: 55, tier: "battleship" },
    { min: 35, tier: "cruiser" },
    { min: 15, tier: "destroyer" },
    { min: 0,  tier: "" },
  ];
  // 1 代 SALVAGE_COMPONENT_IDS（data/cargo.js:43）；本作 resources.js COMPONENT 18 件全量同名
  const IDS = {
    "": ["integrated_hull", "power_core", "functional_system"],
    destroyer: ["destroyer_integrated_hull", "destroyer_power_core", "destroyer_functional_system"],
    cruiser: ["cruiser_integrated_hull", "cruiser_power_core", "cruiser_functional_system"],
    battleship: ["battleship_integrated_hull", "battleship_power_core", "battleship_functional_system"],
    capital: ["capital_integrated_hull", "capital_power_core", "capital_functional_system"],
    supercapital: ["supercapital_integrated_hull", "supercapital_power_core", "supercapital_functional_system"],
  };
  const TIER_CN = { "": "护卫舰级", destroyer: "驱逐舰级", cruiser: "巡洋舰级",
    battleship: "战列舰级", capital: "旗舰级", supercapital: "超级旗舰级" };

  function _Eq() {
    return (typeof window !== "undefined" && window.NSK && window.NSK.Data && window.NSK.Data.Equipment)
      ? window.NSK.Data.Equipment : null;
  }
  function _Pirates() {
    return (typeof window !== "undefined" && window.NSK && window.NSK.Data && window.NSK.Data.Pirates)
      ? window.NSK.Data.Pirates : null;
  }

  // 1 代 getSalvageComponentTier：敌舰等级 → 部件档位
  function tierOfLevel(lv) {
    const n = Number(lv) || 0;
    for (const t of TIERS) if (n >= t.min) return t.tier;
    return "";
  }
  // 1 代 getSalvageComponentQty：数量随 kind（与同位素消耗一一对应）
  function qtyOfKind(kind) {
    return kind === "boss" ? 3 : (kind === "elite" ? 2 : 1);
  }

  // 敌舰等级：band + kind 在本作是确定映射（pirates.js SHIPS[faction][kind][band].level），
  // 所以逐波段与折叠段用同一条路径，不需要「逐只 level」这种折叠段拿不到的信息。
  function enemyLevelOf(faction, band, kind) {
    const P = _Pirates();
    const fk = (P && typeof P.factionKey === "function") ? P.factionKey(faction) : (faction || "angel");
    const b = Math.max(1, Math.min(5, Math.round(Number(band) || 1)));
    if (!P || !P.SHIPS) return 0;
    const tbl = P.SHIPS[fk] || P.SHIPS.angel;
    if (!tbl) return 0;
    const rows = tbl[kind] || tbl.normal || null;
    const row = rows ? rows[b] : null;
    return (row && Number(row.level)) || 0;
  }

  // 该节点出战成员的打捞效率合计（1 代 getSalvageEfficiency / getSquadSalvageEfficiency 的本作映射）
  // ⚠️ 只算真实装备的打捞臂；本作没有 MTU，也没有 NPC 绑定舰，故不需要 1 代那两层排除。
  function efficiencyOf(state, nodeId) {
    if (!state || !Array.isArray(state.members)) return 0;
    const Eq = _Eq();
    if (!Eq || !Eq.byId) return 0;
    const EI = (typeof window !== "undefined" && window.NSK && window.NSK.Core)
      ? window.NSK.Core.EquipInstances : null;
    let total = 0;
    for (const m of state.members) {
      if (!m || m.destroyed) continue;
      if (!m.assignment || m.assignment.type !== "combat") continue;
      if (nodeId && m.assignment.nodeId !== nodeId) continue;
      if (!m.fitted) continue;
      for (const slot in m.fitted) {
        for (const ref of (m.fitted[slot] || [])) {
          const itemId = EI ? EI.itemIdOf(state, ref) : ref;
          const it = itemId ? Eq.byId(itemId) : null;
          if (it && it.bonuses && it.bonuses.salvageEfficiency) total += Number(it.bonuses.salvageEfficiency) || 0;
        }
      }
    }
    return total;
  }

  function hasArm(state, nodeId) { return efficiencyOf(state, nodeId) > 0; }

  function ensure(state) {
    if (!state) return null;
    if (!state.salvage || typeof state.salvage !== "object") state.salvage = { active: false };
    if (typeof state.salvage.active !== "boolean") state.salvage.active = !!state.salvage.active;
    return state.salvage;
  }
  function isActive(state) { const s = ensure(state); return !!(s && s.active); }
  function setActive(state, on) { const s = ensure(state); if (!s) return { ok: false }; s.active = !!on; return { ok: true, active: s.active }; }

  function isoOf(state) {
    return Math.max(0, Math.floor(Number((state && state.res && state.res[ISO_KEY]) || 0)));
  }

  // 无偏取整：n 的整数部分照给，小数部分按概率进位（期望 = n）
  function roundUnbiased(n, rng) {
    const v = Number(n) || 0;
    if (v <= 0) return 0;
    const base = Math.floor(v);
    return base + ((v - base) > (typeof rng === "function" ? rng() : Math.random()) ? 1 : 0);
  }

  // 单档抽 n 次，每次 COMPONENT_CHANCE 命中，返回命中次数（期望 = n × chance）。
  // n 很大时走「期望分配」，避免离线大数循环。
  function hitsOf(n, chance, rng) {
    if (!(n > 0)) return 0;
    if (n <= MAX_DRAW_PER_KIND) {
      let h = 0;
      for (let i = 0; i < n; i++) if (rng() < chance) h++;
      return h;
    }
    // 大数：期望值 + 二项近似抖动（±√npq 量级），再钳制到 [0, n]
    const mean = n * chance;
    const sd = Math.sqrt(n * chance * (1 - chance));
    const jitter = (rng() + rng() + rng() - 1.5) * sd;   // 三个均匀分布之和的近似正态
    return Math.max(0, Math.min(n, Math.round(mean + jitter)));
  }

  // ================================================================
  // 主动打捞：按本次结算的击坠数发组件
  //   kills = { normal, elite, boss }（可能带小数：折叠段是期望击坠数）
  // 返回 { ok, parts:{compId:qty}, isoSpent, attempts, hits, tier }
  // ================================================================
  function rollComponents(state, nodeId, kills, faction, band, rng) {
    const fn = (typeof rng === "function") ? rng : Math.random;
    const out = { ok: false, parts: {}, isoSpent: 0, attempts: 0, hits: 0, tier: "", reason: "" };
    if (!state || !kills) { out.reason = "no_state"; return out; }
    if (!isActive(state)) { out.reason = "off"; return out; }
    if (!hasArm(state, nodeId)) { out.reason = "no_arm"; return out; }

    // 先把浮点击坠数无偏取整（折叠段），后续全整数运算，逐波/折叠口径一致
    const n = {
      normal: roundUnbiased(kills.normal, fn),
      elite: roundUnbiased(kills.elite, fn),
      boss: roundUnbiased(kills.boss, fn),
    };
    const totalTries = n.normal + n.elite + n.boss;
    if (totalTries <= 0) { out.reason = "no_kill"; return out; }

    let iso = isoOf(state);
    if (iso <= 0) { out.reason = "no_iso"; return out; }

    let isoSpent = 0, attempts = 0, hits = 0;
    for (const kind of ["normal", "elite", "boss"]) {
      const qty = qtyOfKind(kind);
      let left = n[kind];
      while (left-- > 0) {
        if (iso < qty) break;              // 1 代：同位素不足则该次不触发
        iso -= qty;
        isoSpent += qty;
        attempts++;
        if (fn() < COMPONENT_CHANCE) {
          hits++;
          const tier = tierOfLevel(enemyLevelOf(faction, band, kind));
          const ids = IDS[tier] || IDS[""];
          const id = ids[Math.floor(fn() * ids.length)] || ids[0];
          out.parts[id] = (out.parts[id] || 0) + qty;
          out.tier = tier;
        }
      }
    }

    if (isoSpent > 0) state.res[ISO_KEY] = Math.max(0, (Number(state.res[ISO_KEY]) || 0) - isoSpent);
    out.isoSpent = isoSpent;
    out.attempts = attempts;
    out.hits = hits;
    out.ok = attempts > 0;
    if (!out.ok) out.reason = "no_iso";
    return out;
  }

  // 面板读数：一次性算好显示用的数字
  function infoOf(state, nodeId) {
    const eff = efficiencyOf(state, nodeId);
    return {
      arm: eff > 0,
      efficiency: eff,
      active: isActive(state),
      // 货柜掉率倍率（1 代口径：×(1+Σeff)，上限 50% 由调用方 min 掉）
      cargoMult: 1 + eff,
      componentChance: COMPONENT_CHANCE,
      iso: isoOf(state),
      isoKey: ISO_KEY,
    };
  }

  NSK.Engine.Salvage = {
    ensure, isActive, setActive, efficiencyOf, hasArm,
    tierOfLevel, qtyOfKind, enemyLevelOf, tierCn: function (t) { return TIER_CN[t] || t; },
    rollComponents, infoOf,
    COMPONENT_CHANCE, ISO_KEY, TIERS, IDS,
  };
})();
