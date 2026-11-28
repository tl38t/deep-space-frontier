// ================================================================
// 深空星疆 —— Engine.FactionShop：势力商店（蓝图永久买断）
//
// 设计正本：深空星疆·势力商店_设计稿.md（2026-11-25 定稿，2026-11-28 实装）
//   商品池 67 张 = 装备 27 + 增强剂 26 + 舰船 14
//     · 装备：equipment.js 现有 faction 字段（federation 6 / angel 10 / blood 11）
//             faction 为空的 7 件是考古稀有池专属（RARE_BLUEPRINT_ONLY），**不进商店**
//     · 增强剂：BOOSTER_RECIPES 中 requiresBlueprint 的 26 张，按 9 大系列归属 6 家势力
//     · 舰船：ships.js SHIP_BLUEPRINT_DEFS 14 艘（1 代 18 艘扣掉 sansha 4 艘）
//   sansha 静默集群 14 张（10 装备 + 4 舰船）**挂起**：商店不展示、不加门禁，未来走战斗掉落。
//
// 键格式铁律（与 1 代 actions.js:196/339 同口径，三套互不冲突）：
//   装备   "equipment:<equipId>"
//   增强剂 "booster:<recipeId>"
//   舰船   裸 shipId
//
// 校验顺序严格照 1 代 Base.buyBlueprint：
//   已拥有 → 归属合法 → 关系门槛（仅装备）→ 舰基等级（仅舰船）→ 余额 → 扣款 → 写键
//
// 付款：装备/增强剂/阵营舰船付 rep（1 代 LP）；中立 6 艘付 credits（1 代 ISK 50,000）。
//
// ⚠️ 本模块只写 state.ownedBlueprints —— 它同时是「装备制造 / 增强剂制造 / 舰船制造」三处
//    门禁的唯一事实源（production.buildEquipment / Booster.canCraft / production.buildShip），
//    商店之外**不得**再有别的授予通道（迁移与初始免费集除外，见 migrate）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.FactionShop = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.FactionShop = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // —— 增强剂系列 → 势力（设计稿 §1.2）——
  //   1 代 BOOSTER_SERIES 只有 name/desc，没有 faction 字段，只能在商店侧登记。
  //   9 系列 × 档数 = 26 张，与设计稿逐项对齐（mining_guild 6 / salvage_union 3 / lone_star 3 /
  //   abyssal_inst 9 / bounty_league 2 / settlers 3）。
  const BOOSTER_SERIES_OWNER = {
    high_temp_flux: "mining_guild",
    lattice_proliferation: "mining_guild",
    assembly_coordinator: "salvage_union",
    gas_rheology: "lone_star",
    fullerene_nucleation: "abyssal_inst",
    reaction_accelerant: "abyssal_inst",
    reaction_chain_proliferation: "abyssal_inst",
    neural_booster: "bounty_league",
    precision_rationing: "settlers",
  };

  // —— 增强剂定价（设计稿 §4 提议值，待标定）：普通 15 / 精工 35 / 传奇 70 ——
  const BOOSTER_PRICE = { n: 15, r: 35, l: 70 };
  const BOOSTER_QUALITY_NAME = { n: "普通", r: "精工", l: "传奇" };

  // 势力商店**永不展示**的势力（挂起）；sansha 的装备/舰船数据仍在，只是没有购买入口。
  const SUSPENDED = { sansha: 1 };

  // 中立舰船挂在哪一势力的页签下（设计稿 §1.3：联邦拓殖公社页的「中立船坞」）
  const NEUTRAL_HOME = "federation";

  const EQ_CAT_NAME = {
    archaeology: "考古", mining: "采矿", gas: "气云", combat: "战斗",
    shield: "护盾", repair: "维修", salvage: "打捞", industry: "工业",
  };

  function G() {
    if (typeof window !== "undefined" && window.NSK) return window.NSK;
    if (typeof globalThis !== "undefined" && globalThis.NSK) return globalThis.NSK;
    return null;
  }
  // 全局根对象（增强剂配方表 BOOSTER_RECIPES 由 1 代库挂在全局，不在 NSK 命名空间下）
  function GROOT() {
    if (typeof globalThis !== "undefined") return globalThis;
    if (typeof window !== "undefined") return window;
    if (typeof self !== "undefined") return self;
    return {};
  }
  function EqData() { const N = G(); return (N && N.Data && N.Data.Equipment) || null; }
  function ShipData() { const N = G(); return (N && N.Data && N.Data.Ships) || null; }
  function FacData() { const N = G(); return (N && N.Data && N.Data.Factions) || null; }
  function ResData() { const N = G(); return (N && N.Data && N.Data.Resources) || null; }

  // 资源显示名/图标（rep=宇宙声望、credits=星币）
  function curMeta(cur) {
    const R = ResData();
    const m = R && R.meta ? R.meta(cur) : null;
    return m ? { name: m.name, icon: m.icon } : { name: cur === "rep" ? "声望" : "星币", icon: "" };
  }

  // 装备加成 → 一行中文（|v|<1 视为比例，其余视为绝对值；hitBonus 10 这类不能乘 100）
  function eqDesc(eq) {
    const Eq = EqData();
    const labels = (Eq && Eq.BONUS_LABELS) || {};
    const b = (eq && eq.bonuses) || {};
    const out = [];
    for (const k in b) {
      const v = b[k];
      let txt;
      if (typeof v === "number") txt = (Math.abs(v) < 1 ? (v > 0 ? "+" : "") + (v * 100).toFixed(0) + "%" : (v > 0 ? "+" : "") + v);
      else txt = String(v);
      out.push((labels[k] || k) + " " + txt);
    }
    return out.join(" · ") || (EQ_CAT_NAME[eq && eq.cat] || "装备");
  }

  // 目录：一次性构建（纯派生，无状态依赖），UI 每次渲染重取以跟随数据热改
  //   → [{ kind:"equip"|"booster"|"ship", id, key, name, factionId, price, currency,
  //        relFaction, relMin, bodyLevel, tag, desc, neutral }]
  function items() {
    const out = [];
    const Eq = EqData(), Ship = ShipData(), Fac = FacData();
    const facs = (Fac && Fac.FACTIONS) || [];
    const known = {};
    facs.forEach(f => { known[f.id] = f; });

    // ① 装备蓝图
    if (Eq && Eq.all) {
      for (const eq of Eq.all()) {
        if (!eq.requiresBlueprint) continue;
        if (!eq.faction) continue;                    // 考古稀有 7 件：只走稀有池，不进商店
        if (SUSPENDED[eq.faction]) continue;          // sansha：挂起
        if (!known[eq.faction]) continue;
        out.push({
          kind: "equip", id: eq.id, key: Eq.bpKey(eq.id), name: eq.name,
          factionId: eq.faction,
          price: (Eq.shopPrice ? Eq.shopPrice(eq) : 40), currency: "rep",
          relFaction: eq.faction,
          relMin: (eq.requiresRel && eq.requiresRel[eq.faction]) || 0,
          bodyLevel: 0,
          tag: "装备 · Lv" + (eq.level || 1) + " · " + (EQ_CAT_NAME[eq.cat] || "通用"),
          desc: eqDesc(eq),
        });
      }
    }

    // ② 增强剂蓝图（数据在 1 代库 window.BOOSTER_RECIPES，本作不改数据）
    const recipes = GROOT().BOOSTER_RECIPES || [];
    for (const r of recipes) {
      if (!r.requiresBlueprint) continue;
      const fid = BOOSTER_SERIES_OWNER[r.series];
      if (!fid || SUSPENDED[fid] || !known[fid]) continue;
      out.push({
        kind: "booster", id: r.id, key: "booster:" + r.id, name: r.name,
        factionId: fid,
        price: BOOSTER_PRICE[r.quality] || BOOSTER_PRICE.n, currency: "rep",
        relFaction: null, relMin: 0, bodyLevel: 0,
        tag: "增强剂 · " + (BOOSTER_QUALITY_NAME[r.quality] || r.quality) + " · Lv" + (r.level || 1),
        desc: r.description || ("增幅剂配方（" + (BOOSTER_QUALITY_NAME[r.quality] || r.quality) + "档）"),
      });
    }

    // ③ 舰船蓝图（ships.js SHIP_BLUEPRINT_DEFS 为唯一真值）
    const defs = (Ship && Ship.SHIP_BLUEPRINT_DEFS) || {};
    for (const sid in defs) {
      const d = defs[sid];
      if (SUSPENDED[d.factionId]) continue;
      const sh = Ship.shipById(d.shipId);
      if (!sh) continue;
      const home = d.factionId || NEUTRAL_HOME;
      if (!known[home]) continue;
      out.push({
        kind: "ship", id: d.shipId, key: d.shipId, name: sh.name,
        factionId: home,
        price: d.price, currency: d.currency,
        relFaction: null, relMin: 0, bodyLevel: d.bodyLevelReq || 0,
        neutral: !d.factionId,
        tag: "舰船蓝图 · 需舰基 Lv." + ((d.bodyLevelReq || 0) + 1),
        desc: "解锁后可在总装船坞建造「" + sh.name + "」（一次性买断，无限建造）",
      });
    }
    return out;
  }

  // 按势力分组（含 sansha 空页，供 UI 展示「已挂起」说明）
  //   → { list:[{ id,name,color,tier,questGiver,items[],equip[],booster[],ship[],hull[] }], total }
  function catalog() {
    const Fac = FacData(), Ship = ShipData();
    const all = items();
    const list = [];
    const byId = {};
    ((Fac && Fac.FACTIONS) || []).forEach(f => {
      const row = { id: f.id, name: f.name, color: f.color, tier: f.tier, questGiver: f.questGiver !== false,
        suspended: !!SUSPENDED[f.id], items: [], equip: [], booster: [], ship: [], hull: [] };
      list.push(row); byId[f.id] = row;
    });
    for (const it of all) {
      const row = byId[it.factionId];
      if (!row) continue;
      row.items.push(it);
      (it.kind === "equip" ? row.equip : it.kind === "booster" ? row.booster : row.ship).push(it);
    }
    // 母舰信息卡（只读，购买入口仍在舰基页 Base.buyBlueprint）
    ((Ship && Ship.BASE_HULLS) || []).forEach(h => {
      const row = byId[h.factionId];
      if (row) row.hull.push(h);
    });
    return { list, total: all.length, byId };
  }

  function relationOf(state, fid) {
    const ent = ((state && state.factions) || []).find(x => x.id === fid);
    return ent ? (Number(ent.relation) || 0) : 0;
  }
  function hasKey(state, key) {
    return Array.isArray(state && state.ownedBlueprints) && state.ownedBlueprints.indexOf(key) >= 0;
  }

  // 单件可购性判定（UI 显示与 buy 共用同一套规则，避免「按钮亮着但买不动」）
  //   → { ok, why, tone } tone: "ok" | "owned" | "lock"
  function check(state, item) {
    if (!item) return { ok: false, why: "商品不存在", tone: "lock" };
    if (hasKey(state, item.key)) return { ok: false, why: "已拥有", tone: "owned" };
    if (item.relMin > 0) {
      const cur = relationOf(state, item.relFaction);
      if (cur < item.relMin) return { ok: false, why: "关系需 " + item.relMin + "（当前 " + Math.round(cur) + "）", tone: "lock" };
    }
    if (item.kind === "ship" && item.bodyLevel > ((state && state.base && state.base.bodyLevel) || 0))
      return { ok: false, why: "需舰基 Lv." + (item.bodyLevel + 1), tone: "lock" };
    const have = Number((state && state.res && state.res[item.currency]) || 0);
    if (have < item.price) return { ok: false, why: curMeta(item.currency).name + "不足", tone: "lock" };
    return { ok: true, why: "购买", tone: "ok" };
  }

  // 购买：校验顺序照 1 代 Base.buyBlueprint（已拥有 → 归属 → 关系 → 舰基等级 → 余额 → 扣款 → 写键）
  function buy(state, kind, id) {
    if (!state || typeof state !== "object") return { ok: false, err: "存档未就绪" };
    const it = items().find(x => x.kind === kind && x.id === id);
    if (!it) return { ok: false, err: "商品不存在（或已挂起）" };
    if (!Array.isArray(state.ownedBlueprints)) state.ownedBlueprints = [];
    if (hasKey(state, it.key)) return { ok: false, item: it, err: "已拥有该蓝图" };
    if (it.relMin > 0) {
      const cur = relationOf(state, it.relFaction);
      if (cur < it.relMin) {
        const f = FacData() && FacData().factionById ? FacData().factionById(it.relFaction) : null;
        return { ok: false, item: it, err: "势力关系不足（" + (f ? f.name : it.relFaction) + " 需 " + it.relMin + "，当前 " + Math.round(cur) + "）" };
      }
    }
    if (it.kind === "ship") {
      const body = (state.base && state.base.bodyLevel) || 0;
      if (body < it.bodyLevel) return { ok: false, item: it, err: "舰基核心等级不足（需 Lv." + (it.bodyLevel + 1) + "）" };
    }
    const have = Number((state.res && state.res[it.currency]) || 0);
    if (have < it.price) {
      return { ok: false, item: it, err: curMeta(it.currency).name + "不足（需 " + it.price + "，当前 " + Math.floor(have) + "）" };
    }
    state.res[it.currency] = have - it.price;
    state.ownedBlueprints.push(it.key);
    return { ok: true, item: it, paid: it.price, currency: it.currency };
  }

  // —— 老档迁移 A（设计稿 §3，一次性回落，幂等，不升 STATE_VERSION）——
  //   老档被 BP_GRANT_ALL 全量污染，留着门禁形同虚设 → 清空 → 发初始免费集 → 打标记。
  //   新档（ownedBlueprints 本就是空）同样走一遍，只是本来就没东西可清。
  function migrate(state) {
    if (!state || typeof state !== "object") return { ok: false, changed: false };
    if (state.shopMigrated === true) return { ok: true, changed: false, owned: Array.isArray(state.ownedBlueprints) ? state.ownedBlueprints.length : 0 };
    const Eq = EqData();
    const free = (Eq && Eq.FREE_BLUEPRINT_KEYS) ? Eq.FREE_BLUEPRINT_KEYS.slice() : [];
    const before = Array.isArray(state.ownedBlueprints) ? state.ownedBlueprints.length : 0;
    state.ownedBlueprints = free.slice();
    state.shopMigrated = true;
    return { ok: true, changed: true, cleared: before, granted: free.length };
  }

  return {
    BOOSTER_SERIES_OWNER, BOOSTER_PRICE, SUSPENDED, NEUTRAL_HOME,
    items, catalog, check, buy, migrate, relationOf, curMeta,
  };
});
