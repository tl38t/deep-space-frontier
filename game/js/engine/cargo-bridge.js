// ================================================================
// 深空星疆 —— Engine.Cargo：货柜桥接层（2026-11-27 S1/S2）
// ----------------------------------------------------------------
// 背景：1 代货柜系统 `js/lib/eveidle/data/cargo.js`（659 行）已完整搬入，但**没接线**。
//   直接调用会踩四个坑（见「行星维护费与货柜_实施计划.md」§3.2）：
//     1. 资源键不兼容 —— cargo 走 1 代 `ResourceRegistry`（读写 state.resources[pool]），
//        本作是扁平 `state.res[asciiKey]`。不桥接 → 货柜写进幽灵库存，UI 读不到、存档清洗管不着。
//     2. 宿主函数缺失 —— cargo 用 `typeof X === "function"` 守卫，缺了就静默丢奖励。
//     3. 掉落接线点没接（战斗击坠 / 考古周期）。
//     4. 具名战利品没有出口。
//
// 本文件只做桥，**不改 cargo.js 一行**（保持与 1 代数据可比对）：
//   · 资源 id 映射表 `ID_MAP`：1 代 "namespace:中文" → 本作 ASCII 键
//   · 覆盖 ResourceRegistry.get/add/spend → 代理到 state.res
//   · 覆盖 addAmmo → 折算成本作真实弹药资源（本作战斗真的在烧 ammo_*，不是死库存）
//   · 覆盖 grantImplant → 恒返回 null（=已拥有），随后由本层折算成功勋
//   · 补 IMPLANT_DB 空表（只为让 cargo 取得到名字，不发放）
//
// ⚠️ 弹药折算：本作无「弹药实例（T1/T2 × 武器类型 × 弹匣）」体系，只有三种弹药资源。
//    1 代 T2 弹 = dmgMult 1.1 / hitMult 1.1（≈1.21 战力）⇒ 折算系数取 **1.2**（提议值待标定）。
// ⚠️ 脑插折算：本作 `implants.js` 已搬但无 `state.implants` 字段、无消费点。
//    发放 = 死物品，故折算成功勋 **200 rep / 枚**（与重复蓝图的 200 lp 同量级，提议值待标定）。
// ================================================================
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  const NSK = window.NSK = window.NSK || {};
  NSK.Engine = NSK.Engine || {};

  // ================================================================
  // 1. 资源 id 映射（权威口径：game/js/data/recipes.js:60-62 的「1 代中文 → 本作 ASCII 键」表）
  // ================================================================
  const ID_MAP = {
    // 货柜本体（1 代 special:货柜S/M/L/XL）
    "special:货柜S": "cargo_S",
    "special:货柜M": "cargo_M",
    "special:货柜L": "cargo_L",
    "special:货柜XL": "cargo_XL",
    // 矿物（1 代五阶矿 ↔ 本作精炼后矿材）
    "mineral:三钛合金": "fe_alloy",
    "mineral:类银超金属": "ni_alloy",
    "mineral:类晶体胶矿": "mx_alloy",
    "mineral:同位聚合体": "bo_alloy",
    "mineral:超新星诺克石": "no_alloy",
    "mineral:基腹断岩": "zr_alloy",
    "mineral:超噬矿": "px_alloy",
    "mineral:莫尔石": "morph_alloy",
    // 行星产物
    "planetary:重金属": "planet_lava",
    "planetary:稀有气体": "planet_gas",
    "planetary:同位素": "planet_ice",
    "planetary:等离子体": "planet_plasma",
    "planetary:生物质": "planet_bio",
    "planetary:磁场聚合物": "planet_mag",
    // 战术材料（1 代 special:XX ↔ 本作 tactic:tN）
    "special:战术残液": "tactic:t1",
    "special:活性战术凝胶": "tactic:t2",
    "special:高能战术萃取物": "tactic:t3",
    "special:极化战术介质": "tactic:t4",
    // 通货
    "currency:isk": "credits",
  };

  const AMMO_KEY = { laser: "ammo_laser", missile: "ammo_missile", cannon: "ammo_cannon" };
  const T2_AMMO_RATIO = 1.2;        // 1 代 T2 弹 ≈1.1×1.1=1.21 战力 → 折算成 T1 弹药数量
  const IMPLANT_REP = 200;          // 脑插折算功勋（提议值待标定）
  // 1 代 ISK → 本作 credits 换算比：与 data/planets.js 同一锚点
  // （1 代最低档行星部署费 138000 ISK ↔ 本作统一部署费 3000 credits ⇒ ÷46）
  const ISK_TO_CREDITS = 46;

  // 未映射 id 的观测点（正常应为空；非空说明 cargo.js 池子里出现了本表没覆盖的资源）
  const unmapped = Object.create(null);

  function mapId(id) { return ID_MAP[id] || null; }

  // ================================================================
  // 2. ResourceRegistry 适配：get/add/spend 全部代理到 state.res
  // ----------------------------------------------------------------
  // ⚠️ 只改这三个方法，其余（register/getDefinition/spendCost/…）保持 1 代原实现不动 ——
  //    那些方法本作没人调，改了反而制造不必要的行为差异。
  // ⚠️ 不映射的 id **不发放**（而不是塞进 state.resources 变成幽灵库存）。
  // ================================================================
  function installResourceBridge() {
    const RR = window.ResourceRegistry;
    if (!RR || RR.__nskBridged) return false;
    RR.get = function (state, id) {
      const k = mapId(id);
      if (!k) { if (id != null) unmapped[id] = (unmapped[id] || 0) + 1; return 0; }
      return Math.max(0, Number((state && state.res && state.res[k]) || 0));
    };
    RR.add = function (state, id, n) {
      const k = mapId(id);
      if (!k) { if (id != null) unmapped[id] = (unmapped[id] || 0) + 1; return 0; }
      if (!state || !state.res) return 0;
      const v = Math.max(0, Number(n) || 0);
      if (!(v > 0)) return 0;
      state.res[k] = (Number(state.res[k]) || 0) + v;
      return v;
    };
    RR.spend = function (state, id, n) {
      const k = mapId(id);
      if (!k) return false;
      if (!state || !state.res) return false;
      const v = Math.max(0, Number(n) || 0);
      if ((Number(state.res[k]) || 0) < v) return false;
      state.res[k] -= v;
      return true;
    };
    RR.__nskBridged = true;
    return true;
  }

  // ================================================================
  // 3. 宿主函数：弹药 / 脑插（其余缺失的宿主守卫走 cargo 自带 fallback，恰好等于本作契约）
  // ----------------------------------------------------------------
  // 不需要补的（核对过 fallback 正好对）：
  //   · getEquipmentBlueprintOwnershipKey → "equipment:"+id，本作 equipment.js bpKey 同式
  //   · hasEquipmentBlueprintFromState  → state.ownedBlueprints.includes(key)，本作同式
  //   · EQUIPMENT_DB                     → lib/eveidle/data/equipment.js 已挂 window，
  //                                        且 cargo 蓝图池 19 个 id 与本作 118 件装备**全量命中**
  //   · getBoosterRecipe                 → lib/eveidle/data/boosters.js 已挂 window
  //   · getResourceDisplayName           → lib/eveidle/core/resources.js 已挂 window
  //   · getSquadSalvageEfficiency        → 本作无打捞臂科技，fallback 0（= 无加成）正确
  //   · getEliteDropMult                 → 本作无难度档，fallback 1 正确
  //   · GameEvents                       → cargo 只在 `typeof` 守卫后 emit，缺失即跳过
  // ================================================================
  function installHostStubs() {
    window.addAmmo = function (state, opts) {
      if (!state || !state.res || !opts) return;
      const k = AMMO_KEY[opts.type];
      if (!k) return;
      let q = Math.max(1, Math.round(Number(opts.qty) || 1));
      if (opts.tier === "T2") q = Math.max(1, Math.round(q * T2_AMMO_RATIO));
      state.res[k] = (Number(state.res[k]) || 0) + q;
    };
    if (!window.IMPLANT_DB) window.IMPLANT_DB = {};
    // 恒「已拥有」→ cargo 走重复分支（不写 state.implants，不产生死物品）
    window.grantImplant = function () { return null; };
  }

  // ================================================================
  // 4. 开箱结果归一化：把 cargo 的 1 代文案/口径改成玩家在本作里看得懂的东西
  // ================================================================
  function resNameOf(k) {
    const R = (NSK.Data && NSK.Data.Resources);
    const m = (R && R.meta) ? R.meta(k) : null;
    return (m && m.name) || k;
  }

  function normalizeRolls(state, res) {
    if (!res || !Array.isArray(res.rolls)) return res;
    for (const g of res.rolls) {
      if (!g) continue;
      if (g.ammo) {
        const k = AMMO_KEY[g.weaponType];
        g.resKey = k || null;
        g.name = k ? resNameOf(k) : (g.name || "弹药");
        g.note = "折算为本作弹药资源（战斗直接消耗）";
      } else if (typeof g.id === "string" && g.id.indexOf("implantdup:") === 0) {
        if (state && state.res) state.res.rep = (Number(state.res.rep) || 0) + IMPLANT_REP;
        g.resKey = "rep";
        g.qty = IMPLANT_REP;
        g.name = "脑插·折算功勋";
        g.note = "本作暂无脑插系统，按 " + IMPLANT_REP + " 功勋折算";
        g.converted = true;
      } else if (g.loot) {
        g.note = "具名战利品，已入库（" + (g.kind === "isk" ? "可出售换星币" : "可兑换功勋") + "）";
      }
    }
    return res;
  }

  // ================================================================
  // 5. 对外 API（唯一入口，禁止 UI 直接调全局 rollCargoDrop / openCargoContainer）
  // ================================================================
  function sizes() { return (typeof CARGO_SIZES !== "undefined") ? CARGO_SIZES.slice() : ["S", "M", "L", "XL"]; }
  function dropChance() { return (typeof CARGO_DROP_CHANCE !== "undefined") ? CARGO_DROP_CHANCE : { normal: 0.006, elite: 0.010, boss: 0.015 }; }
  function itemIdOf(size) { return mapId("special:货柜" + size); }

  function containerCount(state, size) {
    const k = itemIdOf(size);
    if (!k) return 0;
    return Math.max(0, Math.floor(Number((state && state.res && state.res[k]) || 0)));
  }

  // 击坠掷货柜：enemy = {kind:"normal"|"elite"|"boss", type}；zone = {faction}
  // 返回 {size, itemId} 或 null。**掉率只由该敌人的 kind 决定**，与据点安等无关（1 代 1:1）。
  function rollDrop(state, enemy, zone, rng) {
    if (typeof rollCargoDrop !== "function") return null;
    return rollCargoDrop(enemy, zone, rng || Math.random, state);
  }

  function open(state, size, rng) {
    if (typeof openCargoContainer !== "function") return null;
    return normalizeRolls(state, openCargoContainer(state, size, rng || Math.random));
  }

  function openMany(state, size, count, rng) {
    if (typeof openCargoContainers !== "function") return null;
    return normalizeRolls(state, openCargoContainers(state, size, count, rng || Math.random));
  }

  // ================================================================
  // 6. 战斗掉落：按 kind 抽「掉落次数」再抽尺寸（S2）
  // ----------------------------------------------------------------
  // 为什么不能直接循环调 rollCargoDrop：整轮折叠后一次结算可能跨上百轮，
  //   每轮 19 波 × 3 只 ⇒ 击坠数上千，逐只调用会把 O(1) 的离线结算打回 O(击杀数)。
  // 做法：先按「尝试次数 × 掉率」抽次数（期望取整 + 小数部分随机进位，无偏），
  //   再逐次抽尺寸。次数通常是个位数，成本可忽略。
  // 尺寸档对回 1 代「船越大越不出小尺寸」：normal→frigate / elite→cruiser / boss→battleship
  //   （本作敌舰没有 1 代 type 字段，用 kind 做等价映射；frigate 只出 S、cruiser 只出 M）。
  // ================================================================
  const KIND_CLASS = { normal: "frigate", elite: "cruiser", boss: "battleship" };
  const MAX_DRAW_PER_KIND = 200;      // 防呆：单次结算单档最多发 200 个（正常远低于此）

  function drawCount(tries, chance, rng) {
    const exp = Math.max(0, tries) * Math.max(0, chance);
    if (!(exp > 0)) return 0;
    let n = Math.floor(exp);
    if (rng() < (exp - n)) n += 1;
    return n;
  }

  function drawKills(state, kills, faction, rng, salvageEff) {
    const fn = (typeof rng === "function") ? rng : Math.random;
    const out = { total: 0, bySize: { S: 0, M: 0, L: 0, XL: 0 }, clipped: 0 };
    if (!state || !state.res || !kills) return out;
    const base = dropChance();
    // ★ 2026-11-27 打捞臂被动：1 代 data/cargo.js:539 同一句
    //   chance = min(baseChance × (1 + ΣsalvageEfficiency), 0.5)
    //   上限 50% 只对「被放大后的值」生效，所以基础掉率低的档位永远到不了上限（1 代原样）。
    const se = Math.max(0, Number(salvageEff) || 0);
    const chance = {};
    for (const k of ["normal", "elite", "boss"]) {
      chance[k] = Math.min((base[k] || 0) * (1 + se), 0.5);
    }
    const specAll = (typeof CARGO_CLASS_SIZES !== "undefined") ? CARGO_CLASS_SIZES : null;
    for (const kind of ["normal", "elite", "boss"]) {
      const tries = Math.max(0, Number(kills[kind]) || 0);
      if (!(tries > 0)) continue;
      let n = drawCount(tries, chance[kind] || 0, fn);
      if (n <= 0) continue;
      if (n > MAX_DRAW_PER_KIND) { out.clipped += n - MAX_DRAW_PER_KIND; n = MAX_DRAW_PER_KIND; }
      const cls = KIND_CLASS[kind] || "frigate";
      const spec = (specAll && specAll[cls]) || { sizes: ["S"], weights: [1] };
      const items = spec.sizes.map(function (s, i) { return { id: s, weight: spec.weights[i] }; });
      for (let i = 0; i < n; i++) {
        const size = cargoWeightedPick(items, fn).id;
        const k = itemIdOf(size);
        if (!k) continue;
        state.res[k] = (Number(state.res[k]) || 0) + 1;
        out.bySize[size] += 1;
        out.total += 1;
      }
    }
    void faction;   // 预留：1 代尺寸只吃船级、不吃势力；本作保持一致
    return out;
  }

  // 掉落档位预览（UI 用）：返回 {S:{chance...}} 之类？直接用 cargo 的 getCargoDropInfo
  function infoOf(size, state) {
    if (typeof getCargoDropInfo !== "function") return null;
    try { return getCargoDropInfo(size, state); } catch (e) { return null; }
  }

  // ================================================================
  // 7. 具名战利品兑换（坑 4 的出口）
  // ----------------------------------------------------------------
  // 1 代把 loot:isk / loot:lp 铸成背包具名物（state.cargoLoot），靠**兑换 UI** 变现；
  // 本作没搬那个 UI，直接留着就是「看得见卖不掉」的死物品。
  // 这里补唯一出口：kind=isk → credits（÷46），kind=lp → rep（1:1）。
  // ================================================================
  function lootCount(state) { return Array.isArray(state && state.cargoLoot) ? state.cargoLoot.length : 0; }

  function sellLoot(state) {
    const arr = Array.isArray(state && state.cargoLoot) ? state.cargoLoot : [];
    let credits = 0, rep = 0, n = 0;
    const keep = [];
    for (const it of arr) {
      const v = Math.max(0, Number(it && it.value) || 0);
      if (!it || !(v > 0)) continue;
      if (it.kind === "isk") { credits += Math.round(v / ISK_TO_CREDITS); n++; }
      else if (it.kind === "lp") { rep += Math.round(v); n++; }
      else keep.push(it);
    }
    if (n > 0) {
      state.cargoLoot = keep;
      if (!state.res) state.res = {};
      state.res.credits = (Number(state.res.credits) || 0) + credits;
      state.res.rep = (Number(state.res.rep) || 0) + rep;
    }
    return { count: n, credits: credits, rep: rep, left: keep.length };
  }

  installResourceBridge();
  installHostStubs();

  NSK.Engine.Cargo = {
    // 数据
    ID_MAP, AMMO_KEY, T2_AMMO_RATIO, IMPLANT_REP,
    sizes, dropChance, itemIdOf,
    // 运行时
    installResourceBridge, installHostStubs,
    containerCount, rollDrop, open, openMany, infoOf,
    drawKills, drawCount, KIND_CLASS,
    lootCount, sellLoot, ISK_TO_CREDITS,
    unmappedIds: function () { return Object.keys(unmapped); },
    __unmapped: unmapped,
  };
})();
