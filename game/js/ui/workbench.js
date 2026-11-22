// ================================================================
// 深空星疆 —— UI.Workbench：舱段工作台（独立弹窗）
// 点击舰基页工业舱段（精炼环 / 总装船坞 / 发明舱）后弹出。
// 精炼环 → smelt；总装船坞 → 部件(enqueue manufacture) + 造船(buildShip) 两个子页签（共享总装槽）；发明舱 → invent。
// 复用现有引擎入队契约（enqueue / buildShip / 队列 splice 取消），引擎层零改动。
// 设计确认（2026-11-02）：独立弹窗 + 精炼/制造/发明统一 + 造船并进 + 连续=入队 9999 批+随时取消。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.UI = window.NSK.UI || {};
    window.NSK.UI.Workbench = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.UI = root.NSK.UI || {};
    root.NSK.UI.Workbench = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  let CTX = null;            // { getState, renderView, toast, resIcon, resName, esc, fmt }
  let cur = null;            // { slotId, type, tab, recipeId, count, overlay }
  let rdOverlay = null;      // 二级「配方详情」弹窗 DOM：盖在工作台之上，独立承载材料表+批量控制，解决右栏详情被挤没
  const RD_PREFIX = "workbench:rd";
  const MAX_CONTINUOUS = 9999;
  // 工业舱段（点击弹出工作台）：精炼环 / 总装船坞 / 发明舱 / 反应实验室（增强剂制造）
  const INDUSTRIAL = { smelt: 1, manufacture: 1, invent: 1, booster: 1, equip: 1 };

  function init(ctx) {
    CTX = ctx;
    // Esc 关闭详情弹窗（优先于主台）；详情窗未开时不拦截，交给 app.js 的其它面板处理。
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && rdIsOpen()) { closeRecipeDetail(); ev.preventDefault(); }
    });
  }
  function state() { return CTX && CTX.getState(); }
  function Engine() { return window.NSK.Engine; }
  function Data() { return window.NSK.Data; }
  function Prod() { return window.NSK.Engine && window.NSK.Engine.Production; }
  function Base() { return window.NSK.Engine && window.NSK.Engine.Base; }
  function BEngine() { return window.NSK.Engine && window.NSK.Engine.Booster; }
  function EData() { return (window.NSK.Data && window.NSK.Data.Equipment) || null; }
  function eqName(id) { const E = EData(); const e = E && E.byId ? E.byId(id) : null; return e ? e.name : id; }
  function boosterName(itemId) { const B = BEngine(); const it = B && B.getItem(itemId); return it ? it.name : itemId; }
  // 队列项产出名：精炼 / 发明 / 部件的队列项里存的是**资源内部键**（fe_alloy / struct / bp），
  // 直接上屏会露出英文标识符（玩家反馈「精炼下面还是显示的英文」）。一律过 Resources 显示名，
  // 与配方卡的写法（CTX.resName(r.out)）保持同口径。
  function outName(resId) { return CTX.resName(resId); }
  function clampN(n) { return Math.max(1, Math.min(MAX_CONTINUOUS, n | 0 || 1)); }
  function I() { return window.NSK.Engine && window.NSK.Engine.Invention; }
  function isStudy() { return !!cur && cur.type === "invent" && cur.tab === "study"; }

  function isOpen() { return !!cur; }
  function rdIsOpen() { return !!(rdOverlay && rdOverlay.classList.contains("active")); }
  // 详情弹窗 panel（供 patch/refresh 同步步进器/库存/可负担态），未开返回 null。
  function rdPanel() { return rdIsOpen() ? rdOverlay.querySelector(".wb-rd-panel") : null; }

  // 供 app.js 判定：该舱位是否工业类且已装配（决定是否弹工作台）
  function slotIfIndustrial(st, slotId) {
    const B = Base(); if (!B || !st) return null;
    const slot = B.slotById(st, slotId);
    const inst = slot && B.moduleAt(st, slot.id);   // 折中：工业类型跟随已装舱段，而非槽位原生类型
    if (!slot || !inst || !INDUSTRIAL[inst.type]) return null;
    return slot;
  }

  // detailBuilder：可选，() => html 字符串。由 app.js 传入「舱段明细」HTML，
  // 渲染在工作台弹窗顶部，使工业舱段被点开时原右侧明细也一并呈现（移除右侧常驻面板后的补偿）。
  // 从成员面板「强化舰船」按钮跳转：打开总装船坞并预选增强子页签 + 成员
  function openEnhance(memberId) {
    const st = state();
    if (!st) return;
    const B = Base();
    if (!B) return;
    const insts = (st.base.modules && st.base.modules.installed) || [];
    let slotId = null;
    for (const inst of insts) {
      const slot = B.slotById(st, inst.slotId);
      const m = slot && B.moduleAt(st, slot.id);
      if (slot && m && m.type === "manufacture") { slotId = slot.id; break; }
    }
    if (!slotId) { CTX.toast("总装船坞未安装，无法强化"); return; }
    open(slotId);
    cur.tab = "enhance";
    cur.enhMember = memberId || null;
    cur.recipeId = null;
    render();
  }

  function open(slotId, detailBuilder) {
    const st = state();
    const slot = slotIfIndustrial(st, slotId);
    if (!slot) return;
    // ⚠️ 同一时刻只允许一个工作台。旧实现直接重建 cur 并 ensureOverlay 新建 DOM，
    //    旧 overlay 既不 close 也不从 DOM 移除 → 每点一个工业舱段就叠一层（实测连点
    //    精炼环→反应实验室→制造车间后 DOM 里有 3 个 .wb-overlay）。
    //    后果：① 点 × 只关最上面那个，玩家会看到「关了还开着」；② 残留 overlay 的明细
    //    容器一直留在文档里，全局选择器/点按命中会命中旧内容（station_selftest 因此长期假红）。
    if (cur && cur.overlay) close();
    const instType = (Base().moduleAt(st, slotId) || {}).type;
    cur = {
      slotId: slotId, type: instType,
      // 发明舱双子页签：效率研究（默认）/ 图纸合成。总装船坞沿用 component/ship。
      tab: instType === "manufacture" ? "component" : instType === "invent" ? "study" : null,
      boosterCat: null,       // 反应实验室当前分类（null = 取第一个有配方的分类）
      equipCat: null,         // 制造车间当前分类（高槽/中槽/低槽/改装件）
      dcnt: {},               // 拆解回收页：每装备选中的拆解数量 { equipId: n }
      studyTier: 0,            // 0 = 全部；1..5 = 按蓝图档位筛选
      studyQuery: "",          // 蓝图名 / key 搜索
      studyDir: "me",          // me | te
      recipeId: null, count: 1, overlay: null, enhMember: null,   // enhMember: 强化子页签预选成员 id
      detailBuilder: typeof detailBuilder === "function" ? detailBuilder : null,
    };
    ensureOverlay();
    render();
    show();
  }

  function close() {
    closeRecipeDetail();   // 主台关闭时详情弹窗一并收走，杜绝悬空
    if (cur && cur.overlay && cur.overlay.parentNode) cur.overlay.parentNode.removeChild(cur.overlay);
    cur = null;
  }

  function ensureOverlay() {
    if (cur.overlay && cur.overlay.parentNode) return;
    const ov = document.createElement("div");
    ov.className = "wb-overlay";
    ov.setAttribute("data-wb-overlay", "1");
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    // 蓝图搜索：只重建网格，绝不整面板 render —— 否则输入框失焦、光标归零，无法连续输入。
    // 与 refresh() 的「每秒只就地更新动态片段」纪律一致。
    ov.addEventListener("input", function (e) {
      if (!e.target || e.target.id !== "ivq" || !isStudy()) return;
      cur.studyQuery = e.target.value;
      const box = ov.querySelector(".wb-recipes");
      if (box) box.innerHTML = studyCards();
      const cnt = ov.querySelector(".iv-catcount");
      if (cnt) cnt.textContent = "共 " + studyList().length + " 张 · 当前 " + studyVisible().length + " 张";
      const panel = ov.querySelector(".wb-panel");
      if (panel) updateRecipeAffordability(panel);
    });
    document.body.appendChild(ov);
    cur.overlay = ov;
  }

  function show() { if (cur && cur.overlay) cur.overlay.classList.add("active"); }

  // ---------- 数据 ----------
  function recipeTable() {
    const R = Data().Recipes;
    if (isStudy()) return [];                 // 效率研究页不消费 Recipes 表，走 studyCards()
    if (cur.type === "smelt") return R.SMELT;
    if (cur.type === "invent") return R.INVENT;
    if (cur.type === "booster") return (window.BOOSTER_RECIPES || []);
    if (cur.type === "equip") { if (cur.tab === "dismantle") return []; const E = EData(); return E ? E.bySlot(equipCat()) : []; }
    if (cur.type === "manufacture" && cur.tab === "component") return R.COMPONENT;
    return [];
  }

  // 增强剂分类：与 1 代 BOOSTER_CATEGORY_META 同源（采矿/考古/采气/冶炼/舰船工程/装备制造/
  // 增幅剂制造/战斗武器/战斗维修/技能训练），只保留本作真有配方的分类。
  // ⚠️ 个别配方的 category 是数组（如精密配给剂同时作用于 ship+equipment），双侧都要计入。
  const bInCat = (r, id) => [].concat(r.category || []).indexOf(id) >= 0;
  function boosterCatList() {
    const META = window.BOOSTER_CATEGORY_META || [];
    const R = window.BOOSTER_RECIPES || [];
    return META.map(m => ({ id: m.id, name: m.name, n: R.filter(r => bInCat(r, m.id)).length }))
      .filter(c => c.n > 0);
  }
  function boosterCat() {
    const list = boosterCatList();
    if (!list.length) return null;
    return list.some(c => c.id === cur.boosterCat) ? cur.boosterCat : list[0].id;
  }

  function headStats() {
    const st = state();
    const B = Base();
    const plan = Data().Ships.bodyLevelPlan(st.base.bodyLevel);
    const durMult = B.queueDurationMultiplier(st, cur.type);
    let used, total;
    if (cur.type === "smelt") { used = st.base.industry.smeltQueue.length; total = plan.smelt; }
    else if (cur.type === "invent") { used = st.base.industry.inventQueue.length; total = plan.invent; }
    else if (cur.type === "booster") { used = (st.base.industry.boosterQueue || []).length; total = plan.booster; }
    else if (cur.type === "equip") { used = (st.base.industry.equipQueue || []).length; total = plan.equip; }
    else { used = Prod().manufactureUsed(st); total = plan.manufacture; }
    return { name: Data().Ships.baseModuleByType(cur.type).name, used: used, total: total, speedPct: Math.round((1 - durMult) * 100) };
  }

  function jobs() {
    const st = state();
    const ind = st.base.industry;
    if (cur.type === "smelt")
      return (ind.smeltQueue || []).map((j, i) => ({ qk: "smeltQueue", i: i, it: j, out: outName(j.out) }));
    if (cur.type === "invent")
      return (ind.inventQueue || []).map((j, i) => ({
        qk: "inventQueue", i: i, it: j,
        // study 项的 out 是 ASCII 标记 "study"，显示名由数据表实时派生（不写进存档、不露裸 key）
        out: (j.outType === "study" && I()) ? I().labelFor(j.studyKey, j.studyDir) : outName(j.out),
      }));
    if (cur.type === "booster")
      return (ind.boosterQueue || []).map((j, i) => ({ qk: "boosterQueue", i: i, it: j, out: boosterName(j.out) }));
    if (cur.type === "equip")
      return (ind.equipQueue || []).map((j, i) => ({ qk: "equipQueue", i: i, it: j, out: eqName(j.out) }));
    const list = [];
    (ind.manufactureQueue || []).forEach((j, i) => list.push({ qk: "manufactureQueue", i: i, it: j, out: outName(j.out) }));
    (ind.buildQueue || []).forEach((j, i) => {
      const s = Data().Ships.shipById(j.shipId);
      list.push({ qk: "buildQueue", i: i, it: j, out: s ? s.name : j.shipId });
    });
    (ind.enhanceQueue || []).forEach((j, i) => {
      const m = (state() && state().members) ? state().members.find(x => x.id === j.memberId) : null;
      const s = Data().Ships.shipById(j.shipId);
      list.push({ qk: "enhanceQueue", i: i, it: j, out: (m ? m.name : "?") + " 的" + (s ? s.name : "?") + " 强化 Lv" + j.fromLevel + "→" + j.toLevel });
    });
    return list;
  }

  function recipeOutName(recipeId) {
    if (isStudy()) {
      const M = I(), b = M && M.blueprintByKey(recipeId);
      return (cur.studyDir === "te" ? "时间效率" : "材料效率") + " · " + (b ? b.name : recipeId);
    }
    if (cur.type === "manufacture" && cur.tab === "ship") {
      const s = Data().Ships.shipById(recipeId); return s ? s.name : recipeId;
    }
    if (cur.type === "equip") return eqName(recipeId) + " ×1";
    if (cur.type === "booster") {
      const it = BEngine() && BEngine().getItem(recipeId);
      const r = it || (recipeTable().find(x => x.id === recipeId)) || {};
      return (it ? it.name : (r.name || recipeId)) + " ×" + ((r.output && r.output.qty) || 1);
    }
    const r = recipeTable().find(x => x.id === recipeId);
    return r ? (CTX.resName(r.out) + (r.qty > 1 ? " ×" + r.qty : "")) : recipeId;
  }

  // ---------- 渲染 ----------
  // 通用「材料清单」渲染：每种原料附带当前库存持有量（用户需求：配方卡显示有多少原料）。
  // 数据键与入队/结算同口径（st.res[k]），数值取自 state()。
  // showStock=false 时仅显示需求（拆解回收的「预计回收」行是产出语义，不显示持有量，避免误读成需求）。
  function inStr(obj, showStock) {
    const st = state();
    const show = showStock !== false;   // 默认显示库存
    return Object.entries(obj).map(([k, v]) => {
      const have = (st && st.res && st.res[k]) || 0;
      const short = show && have < v;
      const stock = show
        ? '<i class="wb-stock">持 ' + CTX.fmt(have) + '</i>'
        : '';
      return '<span class="wb-io' + (short ? " short" : "") + (show ? '" data-sk="' + k + '" data-need="' + v + '"' : '"') + '>'
        + '<span class="wb-ic">' + CTX.resIcon(k) + '</span>' + CTX.resName(k) + ' <b>×' + CTX.fmt(v) + '</b>' + stock + '</span>';
    }).join(" ");
  }

  // 当前选中配方的「单批成本」，六类队列统一入口（必须与入队/结算同口径，否则可产批数会骗人）：
  //  · 精炼 / 发明 / 部件 → Recipes[].in
  //  · 造船               → Ships[].cost
  //  · 增强剂             → Booster.craftCost（planetary:/gas:/special: 已重映射到本作资源键）
  //  · 装备               → Booster.discountedCost(..., "equip")：buildEquipment 就是按折扣后扣料的
  function unitCost(recipeId) {
    if (!recipeId) return null;
    if (isStudy()) {
      const M = I(), b = M && M.blueprintByKey(recipeId);
      return b ? b.costCycle : null;   // 每循环 2000×tier 星币 + tier 张改装图纸
    }
    const st = state();
    if (cur.type === "booster") {
      const B = BEngine();
      return (B && B.craftCost(st, recipeId)) || null;
    }
    if (cur.type === "equip") {
      const E = EData();
      const eq = E && E.byId ? E.byId(recipeId) : null;
      if (!eq) return null;
      const B = BEngine();
      return (B && B.discountedCost) ? B.discountedCost(st, eq.cost || {}, "equip") : (eq.cost || {});
    }
    if (cur.type === "manufacture" && cur.tab === "ship") {
      const s = Data().Ships.shipById(recipeId);
      return s ? (s.cost || {}) : null;
    }
    const r = recipeTable().find(function (x) { return x.id === recipeId; });
    return r ? (r.in || {}) : null;
  }

  // 按现有库存算「还能排几批」：floor(min(库存 / 单批成本))。
  // 等价于原批量制造弹窗的 batchMaxCount（该弹窗已于 2026-11-03 并入本工作台后删除）。
  function maxBatches(cost) {
    if (!cost) return 0;
    const st = state();
    let m = Infinity;
    for (const k in cost) {
      const need = cost[k];
      if (!need) continue;
      m = Math.min(m, Math.floor((st.res[k] || 0) / need));
    }
    return m === Infinity ? 0 : m;
  }

  // 步进器下方的可产批数提示。**只提示、不 clamp**：
  // 「连续」的语义是「一直排到材料耗尽」（引擎 processQueue 逐批 canAfford + spend，料不够自动停队），
  // 若把 count 钳到可产批数，连续就退化成「一次性 ×N」，玩家补料后还得再点一次。
  function capText() {
    const noun = isStudy() ? "次研究" : "批";
    if (!cur.recipeId) return "选择" + (isStudy() ? "蓝图" : "配方") + "后显示可产" + noun;
    const mx = maxBatches(unitCost(cur.recipeId));
    return mx > 0 ? "按当前材料 · 最多 <b>" + mx + "</b> " + noun : "材料不足，无法排产";
  }

  // 是否走「左明细栏 + 配方网格 + 右明细面板」三段式（标准配方类：精炼/发明/部件/造船/增强剂/装备制造）。
  // 研究、拆解回收、强化舰船各自有独立布局，不走此分支。
  function isRecipeDetailType() {
    const isDismantle = (cur.type === "equip" && cur.tab === "dismantle");
    const isEnhance = (cur.type === "manufacture" && cur.tab === "enhance");
    return !isStudy() && !isDismantle && !isEnhance;
  }

  // 单张配方卡的「门禁 + 可负担」状态，渲染与每秒刷新共用，避免两处各算一遍漂移。
  function cardState(id) {
    const st = state();
    let can = false, gateOk = true, gateText = "";
    if (isStudy()) {
      const M = I(), bp = M && M.blueprintByKey(id);
      gateOk = !!(bp && M.isUnlocked(st, bp));
      gateText = gateOk ? "" : "科研 Lv" + (bp ? bp.gate : "?") + " 解锁";
      can = gateOk && Prod().canAfford(st.res, bp.costCycle);
    } else if (cur.type === "manufacture" && cur.tab === "ship") {
      const s = Data().Ships.shipById(id);
      gateOk = !!(s && Data().Ships.canBuildAt(s.id, st.base.bodyLevel));
      gateText = gateOk ? "" : "需核心 Lv" + (s ? s.bodyLevelReq + 1 : "?");
      can = gateOk && Prod().canAfford(st.res, s ? s.cost : {});
    } else if (cur.type === "equip") {
      const E = EData(); const eq = E && E.byId ? E.byId(id) : null;
      if (!eq) { gateOk = false; gateText = "—"; can = false; }
      else {
        const gate = Prod().equipGateLevel(eq.level);
        const lvOk = st.base.bodyLevel >= gate;
        const bpOk = !eq.requiresBlueprint || (E.hasBlueprint && E.hasBlueprint(st, id));
        gateOk = lvOk && bpOk;
        gateText = !lvOk ? "需核心 Lv" + (gate + 1) : (!bpOk ? "需蓝图" : "");
        can = gateOk && Prod().canAfford(st.res, eq.cost || {});
      }
    } else if (cur.type === "booster") {
      const B = BEngine(); const cost = B && B.craftCost(st, id); const r = B && B.getRecipe(id);
      gateOk = !!(r && (!r.requiresBlueprint || (st.ownedBlueprints || []).includes("booster:" + id)));
      gateText = gateOk ? "" : "需蓝图";
      can = gateOk && cost && Prod().canAfford(st.res, cost);
    } else {
      const r = recipeTable().find(function (x) { return x.id === id; });
      gateOk = !!(r && (r.bodyLevelReq == null || st.base.bodyLevel >= r.bodyLevelReq));
      gateText = gateOk ? "" : "需舰基 Lv" + (r ? r.bodyLevelReq + 1 : "?");
      can = gateOk && r && Prod().canAfford(st.res, r.in);
    }
    return { can: can, gateOk: gateOk, gateText: gateText };
  }

  // 已拥有该产物数量（1 代卡片「库存 N」口径）：资源走 st.res[out]，舰船/装备/增强剂走各自库存。
  function ownedOf(id) {
    const st = state();
    if (cur.type === "manufacture" && cur.tab === "ship") {
      return (st.ships || []).filter(function (s) { return s.shipId === id; }).length;
    }
    if (cur.type === "equip") {
      return (st.equipment && st.equipment[id]) || 0;
    }
    if (cur.type === "booster") {
      const r = (window.BOOSTER_RECIPES || []).find(function (x) { return x.id === id; });
      const itemId = r && r.itemId;
      return itemId ? ((st.res && st.res["booster:" + itemId]) || 0) : 0;
    }
    const r = recipeTable().find(function (x) { return x.id === id; });
    const key = r && r.out;
    return key ? ((st.res && st.res[key]) || 0) : 0;
  }

  // 紧凑产品卡（1 代式）：产出图标 + 名称×qty + 状态徽章(可制造/缺料/锁定) + 耗时/库存(已拥有产物)。
  // durTxt 已含单位（如「20s / 批」「20s / 艘」），不再在此拼接。
  function recipeCardHTML(id, name, qty, icon, durTxt) {
    const s = cardState(id);
    const badgeCls = s.gateOk ? (s.can ? "can" : "short") : "lock";
    const badgeTxt = s.gateOk ? (s.can ? "可制造" : "缺料") : (s.gateText || "锁定");
    const owned = ownedOf(id);
    const sel = cur.recipeId === id ? " sel" : "";
    const dis = s.can ? "" : " dis";
    return '<button class="wb-recipe' + sel + dis + '" data-act="workbench:sel:' + id + '" data-own-id="' + id + '">'
      + '<div class="wb-ric">' + (icon || "") + CTX.esc(name) + (qty > 1 ? ' <span class="wb-qty">×' + qty + '</span>' : '') + '</div>'
      + '<span class="wb-badge ' + badgeCls + '">' + badgeTxt + '</span>'
      + '<div class="wb-r2">' + durTxt + ' · 库存 <span class="wb-own">' + CTX.fmt(owned) + '</span></div>'
      + '</button>';
  }

  // 选中配方的「耗时」文案（与卡片 / 明细脚注共用）。
  function recipeDurText(id) {
    const st = state();
    const durMult = Base().queueDurationMultiplier(st, cur.type);
    if (cur.type === "manufacture" && cur.tab === "ship") {
      const s = Data().Ships.shipById(id);
      return (s ? Math.round(s.buildTime * durMult) : 0) + "s / 艘";
    }
    if (cur.type === "equip") {
      const E = EData(); const eq = E && E.byId ? E.byId(id) : null;
      return (eq ? Math.round(eq.time * durMult) : 0) + "s / 批";
    }
    if (cur.type === "booster") {
      const B = BEngine(); const r = B && B.getRecipe(id);
      const t = r ? r.time : 0; const d = Math.round(t * durMult * 10) / 10;
      return (durMult < 0.995 ? t + "s → " : "") + d + "s / 批";
    }
    const r = recipeTable().find(function (x) { return x.id === id; });
    const t = r ? r.dur : 0; const d = Math.round(t * durMult * 10) / 10;
    return (durMult < 0.995 ? t + "s → " : "") + d + "s / 批";
  }

  // 「连续生产数量」步进器 + 可产批数提示 + 加入队列按钮。
  // 标准配方类放在右侧明细面板内；研究类放在右栏底部；拆解/强化各自维护自己的按钮。
  function batchControlsHtml() {
    const st = state();
    const hs = headStats();
    const full = hs.used >= hs.total;
    let canAdd = !!cur.recipeId && !full;
    if (isStudy() && cur.recipeId) {
      const M = I(), b = M && M.blueprintByKey(cur.recipeId);
      if (!b || !M.isUnlocked(st, b)) canAdd = false;
    }
    const selName = cur.recipeId ? recipeOutName(cur.recipeId) : "未选择";
    return '<div class="wb-sec">' + (cur.type === "smelt" ? "连续冶炼数量" : isStudy() ? "连续研究次数" : "连续生产数量") + '</div>'
      + '<div class="wb-stepper">'
      + '<button class="wb-step" data-act="workbench:count:-1">−</button>'
      + '<div class="wb-count">' + CTX.fmt(cur.count) + '</div>'
      + '<button class="wb-step" data-act="workbench:count:1">+</button>'
      + '<span class="wb-chips">'
      + '<span class="wb-chip" data-act="workbench:chip:1">×1</span>'
      + '<span class="wb-chip" data-act="workbench:chip:10">×10</span>'
      + '<span class="wb-chip" data-act="workbench:chip:100">×100</span>'
      + '<span class="wb-chip cont" data-act="workbench:chip:9999">连续</span>'
      + '</span></div>'
      + '<div class="wb-cap">' + capText() + '</div>'
      + '<button class="wb-add' + (canAdd ? "" : " off") + '" data-act="workbench:add"' + (canAdd ? "" : " disabled") + '>'
      + (isStudy() ? "加入研究队列" : "加入队列") + ' · ' + CTX.esc(selName) + '</button>';
  }

  // 右侧「配方明细面板」：产出 + 制造材料表(含库存持有量，缺料标红) + 耗时/最多制造批数 + 批量控制。
  // 未选中时给占位；这一段是 1 代式「原料库存只在选中后显示」的核心。
  function recipeDetailHtml() {
    if (!cur.recipeId) return '<div class="wb-detail-empty">选择配方后显示明细</div>';
    const st = state();
    const cost = unitCost(cur.recipeId) || {};
    const outName = recipeOutName(cur.recipeId);
    const dur = recipeDurText(cur.recipeId);
    const mx = maxBatches(cost);
    const mats = Object.keys(cost).length
      ? Object.entries(cost).map(function (kv) {
          const k = kv[0], v = kv[1];
          const have = (st.res && st.res[k]) || 0;
          const short = have < v;
          return '<div class="wb-mat' + (short ? " short" : "") + '">'
            + '<span class="wb-mat-name">' + '<span class="wb-ic">' + CTX.resIcon(k) + '</span>' + CTX.resName(k) + ' <b>×' + CTX.fmt(v) + '</b></span>'
            + '<span class="wb-mat-have" data-sk="' + k + '" data-need="' + v + '">持 ' + CTX.fmt(have) + '</span>'
            + '</div>';
        }).join("")
      : '<div class="wb-detail-empty">该配方无需材料</div>';
    return '<div class="wb-detail-title">' + CTX.esc(outName) + '</div>'
      + '<div class="wb-sec">制造材料</div>'
      + '<div class="wb-mats">' + mats + '</div>'
      + '<div class="wb-detail-foot">' + dur + ' · 最多制造 <b>' + mx + '</b> 批</div>'
      + batchControlsHtml();
  }

  // ---------- 二级「配方详情」弹窗（2026-11-15）----------
  // 背景：PC 宽屏主台右栏把配方网格 + 详情 + 批量控制塞在同一列，详情区被限到
  // max-height:46%，材料多的配方「加入队列」被顶出可视区，必须滚动才够得着。
  // 方案：点配方卡 → 弹出独立详情窗（z 高于主台），材料表/步进器/加按钮独占整窗；
  // 主台右栏回归纯列表 + 队列。加入队列后**保持打开**（可连续调批量），toast 反馈。
  // 关闭：× / ESC / 点遮罩；详情窗随主台 close() 一并收走。

  // 当前可见配方的 id 序列（用于「上一个/下一个」），直接读主台已渲染的卡片，
  // 与各分类/页签筛选口径天然一致，无需另算一份。
  function rdRecipeIds() {
    if (!cur || !cur.overlay) return [];
    return [].map.call(cur.overlay.querySelectorAll(".wb-recipe[data-act^='workbench:sel:']"), function (n) {
      return (n.getAttribute("data-act") || "").slice("workbench:sel:".length);
    });
  }

  function ensureRdOverlay() {
    if (rdOverlay && rdOverlay.parentNode) return;
    rdOverlay = document.createElement("div");
    rdOverlay.className = "wb-rd-overlay";
    rdOverlay.setAttribute("data-wb-rd", "1");
    // 骨架必须有 .wb-rd-panel 容器：renderRecipeDetail() 往它 innerHTML 写内容，缺了就永远空白。
    const panel = document.createElement("div");
    panel.className = "wb-rd-panel";
    panel.setAttribute("role", "dialog");
    rdOverlay.appendChild(panel);
    rdOverlay.addEventListener("click", function (e) { if (e.target === rdOverlay) closeRecipeDetail(); });
    document.body.appendChild(rdOverlay);
  }

  function renderRecipeDetail() {
    // ⚠️ 首次打开时 active 类尚未加上，不能用 rdPanel()（它检查 active），
    //    直接取 overlay 内 panel；否则首次渲染被跳过，弹窗空白。
    const rp = rdOverlay ? rdOverlay.querySelector(".wb-rd-panel") : null;
    if (!rp || !cur || !cur.recipeId) return;
    const ids = rdRecipeIds();
    const idx = ids.indexOf(cur.recipeId);
    const hasPrev = idx > 0, hasNext = idx >= 0 && idx < ids.length - 1;
    const nav = '<div class="wb-rd-nav">'
      + '<button class="wb-rd-navbtn" data-act="workbench:rdprev"' + (hasPrev ? "" : " disabled") + '>‹ 上一个</button>'
      + '<span class="wb-rd-pos">' + (idx >= 0 ? (idx + 1) + ' / ' + ids.length : '—') + '</span>'
      + '<button class="wb-rd-navbtn" data-act="workbench:rdnext"' + (hasNext ? "" : " disabled") + '>下一个 ›</button>'
      + '</div>';
    rp.innerHTML =
      '<div class="wb-rd-head"><div><span class="eyebrow">RECIPE DETAIL · 配方明细</span>'
      + '<b>' + CTX.esc(recipeOutName(cur.recipeId)) + '</b></div>'
      + '<span class="wb-rd-close" data-act="workbench:rdclose" aria-label="关闭" title="关闭（Esc）">×</span></div>'
      + nav
      + '<div class="wb-rd-body">' + recipeDetailHtml() + '</div>';
  }

  function openRecipeDetail() {
    if (!cur || !cur.recipeId || !isRecipeDetailType()) return;
    ensureRdOverlay();
    renderRecipeDetail();
    rdOverlay.classList.add("active");
  }

  function closeRecipeDetail() {
    if (!rdOverlay) return;
    rdOverlay.classList.remove("active");
    // 关闭即清空内容：避免隐藏的详情弹窗残留旧配方按钮（data-act）污染全局 DOM 查询/事件命中。
    const panel = rdOverlay.querySelector(".wb-rd-panel");
    if (panel) panel.innerHTML = "";
  }

  // 详情窗内切换配方：更新 cur.recipeId + 卡片选中态 + 详情主体，不做整面板重建。
  function rdNav(dir) {
    const ids = rdRecipeIds();
    const i = ids.indexOf(cur.recipeId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    cur.recipeId = ids[j];
    const panel = cur.overlay && cur.overlay.querySelector(".wb-panel");
    if (panel) {
      const prefix = "workbench:sel:";
      panel.querySelectorAll(".wb-recipe[data-act^='workbench:sel:']").forEach(function (node) {
        node.classList.toggle("sel", (node.getAttribute("data-act") || "").slice(prefix.length) === cur.recipeId);
      });
    }
    renderRecipeDetail();
  }

  // ---------- 发明舱 · 效率研究（66 张蓝图，由真实配方派生） ----------
  // 桌面用原生 title hover；手机端按跨项目方案 C 用 ⓘ 提供点按等价物。
  // ⚠️ esc() 不转义双引号，属性内文本一律走 attrEsc（并把换行编成 &#10;，供 #nsk-pop 的 pre-line 渲染）。
  function attrEsc(s) { return CTX.esc(s).replace(/"/g, "&quot;").replace(/\n/g, "&#10;"); }
  function studyList() { const M = I(); return M ? M.list() : []; }
  function studyVisible() {
    const q = (cur.studyQuery || "").toLowerCase();
    return studyList().filter(b => {
      if (cur.studyTier && b.tier !== cur.studyTier) return false;
      if (q && b.name.toLowerCase().indexOf(q) < 0 && b.key.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function studyTierList() {
    const all = studyList(), d = {};
    for (const b of all) d[b.tier] = (d[b.tier] || 0) + 1;
    return [{ id: 0, name: "全部", n: all.length }].concat(
      [1, 2, 3, 4, 5].map(t => ({ id: t, name: "T" + t, n: d[t] || 0 })));
  }
  function pct(n, next) { return next == null ? 100 : Math.min(100, Math.round(n / next * 100)); }
  function studyInfo(b) {
    const M = I(), st = state();
    const me = M.countOf(st, b.key, "me"), te = M.countOf(st, b.key, "te");
    return [
      b.name + " · T" + b.tier,
      "制造需求等级 E " + b.E + " · 科研 Lv" + b.gate + " 解锁",
      "每循环 " + b.cycle + "s · 星币 " + b.costCycle.credits + " + 改装图纸 " + b.costCycle.bp,
      "ME " + me + "/" + (M.nextMilestone(me) || "满档") + " → " + Math.round(M.meReduction(st, b.key) * 100) + "%",
      "TE " + te + "/" + (M.nextMilestone(te) || "满档") + " → " + Math.round(M.teReduction(st, b.key) * 100) + "%",
      "研究经验 " + b.xp + " / 循环",
    ].join("\n");
  }
  function studyCards() {
    const M = I(), st = state();
    if (!M) return '<div class="wb-empty">蓝图研究系统未就绪。</div>';
    const rows = studyVisible();
    if (!rows.length) return '<div class="wb-empty">没有匹配的蓝图。</div>';
    return rows.map(b => {
      const me = M.countOf(st, b.key, "me"), te = M.countOf(st, b.key, "te");
      const meN = M.nextMilestone(me), teN = M.nextMilestone(te);
      const locked = !M.isUnlocked(st, b);
      const sel = cur.recipeId === b.key ? " sel" : "";
      const info = attrEsc(studyInfo(b));
      return '<button class="wb-recipe iv-bp' + sel + (locked ? " dis locked" : "") + '"'
        + ' data-act="workbench:sel:' + b.key + '" title="' + info + '">'
        + '<span class="hover-info-btn" data-info="' + info + '">ⓘ</span>'
        + '<div class="iv-bp-top"><span class="iv-bp-name">' + CTX.esc(b.name) + '</span>'
        + '<span class="iv-tier t' + b.tier + '">T' + b.tier + '</span></div>'
        + '<div class="iv-bp-sub">E ' + b.E + ' · ' + b.cycle + 's / 循环</div>'
        + '<div class="iv-bars">'
        + '<div class="iv-bar-row"><span>ME ' + me + (meN ? "/" + meN : " 满档") + '</span>'
        + '<div class="iv-bar"><i style="width:' + pct(me, meN) + '%"></i></div></div>'
        + '<div class="iv-bar-row"><span>TE ' + te + (teN ? "/" + teN : " 满档") + '</span>'
        + '<div class="iv-bar te"><i style="width:' + pct(te, teN) + '%"></i></div></div>'
        + '</div>'
        + (locked ? '<span class="iv-lockline">科研 Lv' + b.gate + ' 解锁</span>' : '')
        + '</button>';
    }).join("");
  }
  function studyFiltersHtml() {
    return '<div class="iv-filters">' + studyTierList().map(c =>
      '<span class="iv-filter' + (c.id === cur.studyTier ? " sel" : "") + '"'
      + ' data-act="workbench:stier:' + c.id + '">' + CTX.esc(c.name) + '<small>' + c.n + '</small></span>').join("") + '</div>';
  }
  function studyDetailHtml() {
    const M = I(), st = state();
    const b = M && M.blueprintByKey(cur.recipeId);
    if (!b) return '<div class="wb-empty">选择一张蓝图查看研究详情。</div>';
    const me = M.countOf(st, b.key, "me"), te = M.countOf(st, b.key, "te");
    const meN = M.nextMilestone(me), teN = M.nextMilestone(te);
    return '<div class="iv-detail"><h3>' + CTX.esc(b.name) + '</h3>'
      + '<div class="iv-sub">T' + b.tier + ' · E ' + b.E + ' · 科研 Lv' + M.researchLevel(st)
      + ' / 需 Lv' + b.gate + '</div>'
      + '<div class="iv-grid">'
      + '<div class="iv-cell"><em>研究周期</em><b>' + b.cycle + ' s</b></div>'
      + '<div class="iv-cell"><em>研究经验</em><b>' + b.xp + ' xp</b></div>'
      + '<div class="iv-cell"><em>星币 / 循环</em><b>' + CTX.fmt(b.costCycle.credits) + '</b></div>'
      + '<div class="iv-cell"><em>改装图纸 / 循环</em><b>' + b.costCycle.bp + '</b></div>'
      + '<div class="iv-cell"><em>ME 减免</em><b>' + Math.round(M.meReduction(st, b.key) * 100) + '%</b>'
      + '<em>累计 ' + me + ' 次' + (meN ? ' · 距下一档 ' + (meN - me) + ' 次' : ' · 已满档') + '</em></div>'
      + '<div class="iv-cell"><em>TE 减免</em><b>' + Math.round(M.teReduction(st, b.key) * 100) + '%</b>'
      + '<em>累计 ' + te + ' 次' + (teN ? ' · 距下一档 ' + (teN - te) + ' 次' : ' · 已满档') + '</em></div>'
      + '</div>'
      + '<div class="iv-note">ME 降低该蓝图对应配方的材料消耗；TE 缩短其制造耗时（/(1−减免)），研究自身耗时不受影响。'
      + '累计 10 / 50 / 250 / 1250 / 5000 次依次解锁 5% / 10% / 15% / 20% / 25%，两条线各自独立累计。</div>'
      + '<div class="iv-dir">'
      + '<span class="' + (cur.studyDir === "me" ? "on" : "") + '" data-act="workbench:sdir:me">材料效率 ME</span>'
      + '<span class="' + (cur.studyDir === "te" ? "on" : "") + '" data-act="workbench:sdir:te">时间效率 TE</span>'
      + '</div></div>';
  }

  function recipeCards() {
    if (isStudy()) return studyCards();
    if (cur.type === "booster") return boosterCards();
    if (cur.type === "equip") return equipCards();
    if (cur.type === "manufacture" && cur.tab === "ship") return shipCards();
    const st = state();
    const durMult = Base().queueDurationMultiplier(st, cur.type);
    const R = recipeTable();
    if (!R.length) return '<div class="wb-empty">该舱段暂无可生产配方。</div>';
    return R.map(function (r) {
      const adjDur = Math.round(r.dur * durMult * 10) / 10;
      const durTxt = (durMult < 0.995 ? r.dur + "s → " : "") + adjDur + "s / 批";
      return recipeCardHTML(r.id, CTX.resName(r.out), r.qty, '<span class="wb-ic">' + CTX.resIcon(r.out) + '</span> ', durTxt);
    }).join("");
  }

  // ---- 强化子页签：选成员 → 显示下一级成本/成功率/自动×N → 强化 ----
  function enhanceCards() {
    const st = state();
    const members = st.members || [];
    if (!members.length) return '<div class="wb-empty">名册为空，先到「招募」征募成员。</div>';
    let h = '<div class="wb-sec">选择成员（在港待命方可强化）</div>';
    h += '<div class="wb-enh-members">';
    for (const m of members) {
      const ship = Data().Ships.shipById(m.shipId);
      const sel = cur.enhMember === m.id ? ' sel' : '';
      const busy = (m.status === 'dispatched' || m.status === 'traveling' || m.status === 'repairing');
      const dis = busy ? ' dis' : '';
      h += '<button class="wb-recipe' + sel + dis + '" data-act="workbench:enhsel:' + m.id + '">'
        + '<div class="wb-r1">' + CTX.esc(m.name) + ' · ' + (ship ? CTX.esc(ship.name) : '?')
        + ' <span class="dim">强化 Lv' + (m.enhancementLevel || 0) + '</span></div>'
        + '<div class="wb-r2">' + (busy ? '出勤/维修中，不可强化' : '点击选择') + '</div>'
        + '</button>';
    }
    h += '</div>';
    const m = members.find(x => x.id === cur.enhMember);
    if (m) {
      const ES = (window.NSK && window.NSK.Engine) ? window.NSK.Engine.ShipEnhancement : null;
      const ship = Data().Ships.shipById(m.shipId);
      const curL = m.enhancementLevel || 0;
      const prev = ES ? ES.getPreview(st, m, m.shipId, curL) : null;
      h += '<div class="wb-enh-detail">';
      h += '<div class="wb-sec">强化 ' + CTX.esc(m.name) + ' 的 ' + (ship ? CTX.esc(ship.name) : '') + '：Lv' + curL + ' → Lv' + (curL + 1) + '</div>';
      if (prev) {
        const cost = prev.cost || {};
        const costHtml = Object.keys(cost).map(k => CTX.resIcon(k) + CTX.resName(k) + ' ×' + cost[k]).join(' ');
        h += '<div class="wb-r2">成功率 <b>' + (prev.chance * 100).toFixed(1) + '%</b>（manufacture Lv' + prev.eng + '，需求刻度 ' + prev.req + '）</div>';
        h += '<div class="wb-r2">单次成本：' + costHtml + '</div>';
        h += '<div class="wb-note">失败照扣（每次尝试都扣料/星币/泰坦料）。材料随等级指数递增 N(L)=2^floor(L/5)。'
          + '强化成功提升 HP 上限与武器伤害（每 5 级一档）。</div>';
      }
      h += '<div class="wb-sec">连续强化次数（每次独立掷骰）</div>';
      h += '<div class="wb-stepper">'
        + '<button class="wb-step" data-act="workbench:count:-1">−</button>'
        + '<div class="wb-count">' + CTX.fmt(cur.count) + '</div>'
        + '<button class="wb-step" data-act="workbench:count:1">+</button>'
        + '<span class="wb-chips">'
        + '<span class="wb-chip" data-act="workbench:chip:1">×1</span>'
        + '<span class="wb-chip" data-act="workbench:chip:5">×5</span>'
        + '<span class="wb-chip" data-act="workbench:chip:20">×20</span>'
        + '</span></div>';
      const canAdd = prev ? Prod().canAfford(st.res, prev.cost) : false;
      h += '<button class="wb-add' + (canAdd ? '' : ' off') + '" data-act="workbench:add"' + (canAdd ? '' : ' disabled') + '>'
        + '强化 ' + CTX.fmt(cur.count) + ' 次 · ' + CTX.esc(m.name) + '</button>';
      h += '</div>';
    } else {
      h += '<div class="wb-note">选择一个成员查看强化成本与成功率。</div>';
    }
    return h;
  }

  function shipCards() {
    const st = state();
    const durMult = Base().queueDurationMultiplier(st, "manufacture");
    const ships = Object.values(Data().Ships.SHIPS).sort((a, b) => a.classTier - b.classTier || a.bodyLevelReq - b.bodyLevelReq);
    return ships.map(function (s) {
      const adjDur = Math.round(s.buildTime * durMult);
      return recipeCardHTML(s.id, s.name, 1, "", adjDur + "s / 艘");
    }).join("");
  }

  // 反应实验室（增强剂）配方卡：成本经 Booster.craftCost 重映射（与引擎 enqueue 同口径），
  // 显示名取 BOOSTER_ITEMS.name；需蓝图者锁死。按当前分类标签过滤。
  function boosterCards() {
    const st = state();
    const B = BEngine();
    const durMult = Base().queueDurationMultiplier(st, "booster");
    const cat = boosterCat();
    const R = (window.BOOSTER_RECIPES || []).filter(r => bInCat(r, cat));
    if (!R.length) return '<div class="wb-empty">该分类暂无可生产配方。</div>';
    const hasBp = (id) => (st.ownedBlueprints || []).includes("booster:" + id);
    return R.map(function (r) {
      const adjDur = Math.round(r.time * durMult * 10) / 10;
      const durTxt = (durMult < 0.995 ? r.time + "s → " : "") + adjDur + "s / 批";
      const item = (B && B.getItem(r.itemId)) || { name: r.name };
      return recipeCardHTML(r.id, item.name, (r.output && r.output.qty) || 1, "", durTxt);
    }).join("");
  }

  // 制造车间（装备）分类：按槽位分组，与 1 代装备工程页的 高/中/低/改装件 一致。
  // 改装件（rig）本作无装备数据 → 该组恒空，自动从标签条里消失。
  const EQ_SLOT_META = [{ id: "high", name: "高槽" }, { id: "mid", name: "中槽" }, { id: "low", name: "低槽" }, { id: "rig", name: "改装件" }];
  function equipCatList() {
    const E = EData();
    if (!E) return [];
    return EQ_SLOT_META.map(m => ({ id: m.id, name: m.name, n: E.bySlot(m.id).length })).filter(c => c.n > 0);
  }
  function equipCat() {
    const list = equipCatList();
    if (!list.length) return "high";
    return list.some(c => c.id === cur.equipCat) ? cur.equipCat : list[0].id;
  }
  function equipCards() {
    if (cur.type === "equip" && cur.tab === "dismantle") return dismantleCards();
    const st = state();
    const E = EData();
    if (!E) return '<div class="wb-empty">装备数据未就绪。</div>';
    const durMult = Base().queueDurationMultiplier(st, "equip");
    const R = E.bySlot(equipCat());
    if (!R.length) return '<div class="wb-empty">该分类暂无可制造装备。</div>';
    return R.map(function (eq) {
      const tier = Math.min(5, Math.floor((eq.level - 1) / 20) + 1);
      const adjDur = Math.round(eq.time * durMult);
      return recipeCardHTML(eq.id, eq.name + " T" + tier, 1, "", adjDur + "s / 批");
    }).join("");
  }
  function dismantleCards() {
    const st = state();
    const E = EData();
    if (!E) return '<div class="wb-empty">装备数据未就绪。</div>';
    const inv = st.equipment || {};
    const ids = Object.keys(inv).filter(function (id) { return (inv[id] || 0) > 0; });
    if (!ids.length) return '<div class="wb-empty">暂无可拆解的库存装备。先到「制造」页造一些吧。</div>';
    return ids.map(function (id) {
      const eq = E.byId ? E.byId(id) : null;
      if (!eq) return "";
      const have = inv[id];
      const cnt = Math.max(1, Math.min(have, (cur.dcnt && cur.dcnt[id]) || 1));
      const prev = Prod().dismantlePreview(st, id, cnt);
      const backTxt = Object.keys(prev.back).length ? inStr(prev.back, false) : "无回收";
      return '<div class="wb-dcard">'
        + '<div class="wb-r1">' + CTX.esc(eq.name) + ' · 库存 ' + have + '</div>'
        + '<div class="wb-r2">回收率 ' + Math.round(prev.rate * 100) + '% · 预计回收：' + backTxt + '</div>'
        + '<div class="wb-stepper">'
        + '<button class="wb-step" data-act="workbench:dcount:' + id + ':-1">−</button>'
        + '<div class="wb-count">' + cnt + '</div>'
        + '<button class="wb-step" data-act="workbench:dcount:' + id + ':1">+</button>'
        + '<button class="wb-add" data-act="workbench:dismantle:' + id + '">拆解 ' + cnt + ' 件</button>'
        + '</div></div>';
    }).join("");
  }

  function queueRows() {
    const st = state();
    const now = Date.now();
    const list = jobs();
    if (!list.length) return '<div class="wb-empty">队列为空。选择配方后点「加入队列」。</div>';
    return list.map(job => {
      const it = job.it;
      const p = Math.max(0, Math.min(1, (now - it.startedAt) / 1000 / it.dur));
      const remain = Math.max(0, (it.repeat - it.done - p) * it.dur);
      const remainTxt = remain > 60 ? Math.floor(remain / 60) + 'm ' + Math.round(remain % 60) + 's' : Math.round(remain) + 's';
      // 进度中的状态词按队列区分，避免增强剂显示成「冶炼中」
      const QK_LABEL = { buildQueue: '建造中', boosterQueue: '合成中', inventQueue: '研发中', manufactureQueue: '制造中', smeltQueue: '冶炼中', enhanceQueue: '强化中' };
      const status = it.done >= it.repeat ? '完成'
        : it.outType === "study" ? '研究中' : (QK_LABEL[job.qk] || '生产中');
      return '<div class="wb-job">'
        + '<div class="wb-job-top"><span>' + CTX.esc(job.out) + ' · 批 ' + it.done + '/' + it.repeat + '</span>'
        + '<span class="wb-x" data-act="workbench:cancel:' + job.qk + ':' + job.i + '">×</span></div>'
        + '<div class="wb-bar"><i style="width:' + Math.round(p * 100) + '%"></i></div>'
        + '<div class="wb-job-sub">' + status + ' · 剩余 ≈ ' + remainTxt + '</div>'
        + '</div>';
    }).join("");
  }

  function buildBody() {
    const isDismantle = (cur.type === "equip" && cur.tab === "dismantle");
    const isEnhance = (cur.type === "manufacture" && cur.tab === "enhance");
    const hs = headStats();
    const st = state();
    const full = hs.used >= hs.total;
    let tabs = "";
    if (cur.type === "manufacture") {
      tabs = '<div class="wb-tabs">'
        + '<span class="wb-tab' + (cur.tab === "component" ? " on" : "") + '" data-act="workbench:tab:component">部件 / 弹药</span>'
        + '<span class="wb-tab' + (cur.tab === "ship" ? " on" : "") + '" data-act="workbench:tab:ship">造船</span>'
        + '<span class="wb-tab' + (cur.tab === "enhance" ? " on" : "") + '" data-act="workbench:tab:enhance">强化舰船</span>'
        + '</div>';
    } else if (cur.type === "invent") {
      // 双子页签：效率研究（66 张蓝图）/ 图纸合成（原 inv_bp 单配方）
      tabs = '<div class="wb-tabs">'
        + '<span class="wb-tab' + (cur.tab === "study" ? " on" : "") + '" data-act="workbench:tab:study">效率研究</span>'
        + '<span class="wb-tab' + (cur.tab === "synth" ? " on" : "") + '" data-act="workbench:tab:synth">图纸合成</span>'
        + '</div>';
    } else if (cur.type === "equip") {
      tabs = '<div class="wb-tabs">'
        + '<span class="wb-tab' + (cur.tab !== "dismantle" ? " on" : "") + '" data-act="workbench:tab:make">制造</span>'
        + '<span class="wb-tab' + (cur.tab === "dismantle" ? " on" : "") + '" data-act="workbench:tab:dismantle">拆解回收</span>'
        + '</div>';
    }
    // 反应实验室：1 代式分类标签（采矿 / 考古 / 采气 / 冶炼 / 舰船工程 / 装备制造 /
    // 增幅剂制造 / 战斗武器 / 战斗维修 / 技能训练），标签上带该类配方条数。
    let catBar = "", catName = "", catN = 0;
    const hasCats = (cur.type === "booster") || (cur.type === "equip" && cur.tab !== "dismantle");
    if (hasCats) {
      const list = cur.type === "booster" ? boosterCatList() : equipCatList();
      const selCat = cur.type === "booster" ? boosterCat() : equipCat();
      const hit = list.find(c => c.id === selCat) || {};
      catN = hit.n || 0; catName = hit.name || "";
      if (list.length > 1) {
        catBar = '<div class="wb-cats">' + list.map(c =>
          '<span class="wb-cat' + (c.id === selCat ? " sel" : "") + '" data-act="workbench:cat:' + c.id + '">'
          + CTX.esc(c.name) + '<small>' + c.n + '</small></span>').join("") + '</div>';
      }
    }
    const selName = cur.recipeId ? recipeOutName(cur.recipeId) : "未选择";
    let canAdd = !!cur.recipeId && !full;
    if (isStudy() && cur.recipeId) {
      const M = I(), b = M && M.blueprintByKey(cur.recipeId);
      if (!b || !M.isUnlocked(st, b)) canAdd = false;   // 门槛未达：卡片灰显且不可入队
    }
    // 研究详情单独包一层：选蓝图时 patch() 只重写这个容器，
    // 搜索框 #ivq 与筛选条的节点身份保持不变（否则输入到一半点蓝图会失焦、光标归零）。
    const studyHead = isStudy()
      ? '<div class="iv-search"><input id="ivq" type="text" placeholder="搜索蓝图名称 / key" value="'
        + attrEsc(cur.studyQuery) + '"></div>'
        + studyFiltersHtml() + '<div class="wb-study-detail">' + studyDetailHtml() + '</div>'
      : "";
    const hint = isStudy()
      ? '<div class="wb-note">研究消耗星币与改装图纸（图纸合成页产出，考古亦有掉落）。ME 减免在制造报价生效，'
        + 'TE 缩短该配方制造耗时；研究本身不产资源、不吃 TE。T4 / T5 保留 1 代门槛科研 Lv60 / Lv80，定位长线。</div>'
      : (cur.type === "manufacture" && cur.tab === "component")
      ? '<div class="wb-note">装备制造（改装件）仍在舰基页下方「装备制造」块。总装槽位由部件 / 造船共用。</div>'
      : (cur.type === "booster")
      ? '<div class="wb-note">瓶身入库后，到舰基页下方「增强剂」面板装入 16 个全局槽位，效果整军团共享、自动续瓶。</div>'
      : (cur.type === "equip")
      ? '<div class="wb-note">成品入「已存装备」库存，到「舰队」页点「装配」按成员装上舰；制造车间为独立产线，不再占用总装船坞槽位。</div>'
      : "";
    let detail = "";
    if (cur.detailBuilder) {
      let dh = "";
      try { dh = cur.detailBuilder() || ""; } catch (e) { dh = ""; }
      if (dh) detail = '<div class="wb-detail base-focus-panel">' + dh + '</div>';
    }
    // PC 宽屏（≥900px）左右分栏：左栏 = 舱段明细 + 队列（状态类），右栏 = 页签 / 配方 / 操作区。
    // 窄屏靠 CSS 把两个 wrapper 设成 display:contents 摊平，再用 order 还原原本的上下顺序，
    // 因此只维护一份 DOM，render()/patch()/refresh() 的后代选择器无需分叉。
    const leftHtml = detail
      + '<div class="wb-sec wb-queue-sec">队列 · ' + hs.used + ' / ' + hs.total + (full ? ' <span class="wb-full">已满</span>' : '') + '</div>'
      + '<div class="wb-queue">' + queueRows() + '</div>';
    const rightHtml = tabs
      + catBar
      + studyHead
      + '<div class="wb-sec">' + (isStudy() ? "选择蓝图" : "选择配方")
      + (isStudy() ? '<span class="iv-catcount">共 ' + studyList().length + ' 张 · 当前 ' + studyVisible().length + ' 张</span>'
          : (hasCats && catName ? '<span class="wb-catcount">' + CTX.esc(catName) + ' · ' + catN + (cur.type === "equip" ? ' 件' : ' 个配方') + '</span>' : ''))
      + '</div>'
      + (isEnhance
        ? '<div class="wb-enh-wrap">' + enhanceCards() + '</div>'
        : '<div class="wb-recipes' + (isStudy() ? " iv-list" : "") + '">' + recipeCards() + '</div>')
      + (isRecipeDetailType()
        ? '<div class="wb-rd-hint">' + (cur.recipeId
            ? '已选「' + CTX.esc(selName) + '」· 材料与批量见详情弹窗，可继续调数量或加入队列'
            : '点上方配方卡 → 弹出材料明细与批量面板') + '</div>'
        : "")
      + (isStudy()
        ? ('<div class="wb-sec">' + (isStudy() ? "连续研究次数" : "连续生产数量") + '</div>'
      + '<div class="wb-stepper">'
      + '<button class="wb-step" data-act="workbench:count:-1">−</button>'
      + '<div class="wb-count">' + CTX.fmt(cur.count) + '</div>'
      + '<button class="wb-step" data-act="workbench:count:1">+</button>'
      + '<span class="wb-chips">'
      + '<span class="wb-chip" data-act="workbench:chip:1">×1</span>'
      + '<span class="wb-chip" data-act="workbench:chip:10">×10</span>'
      + '<span class="wb-chip" data-act="workbench:chip:100">×100</span>'
      + '<span class="wb-chip cont" data-act="workbench:chip:9999">连续</span>'
      + '</span></div>'
      + '<div class="wb-cap">' + capText() + '</div>'
      + '<button class="wb-add' + (canAdd ? "" : " off") + '" data-act="workbench:add"' + (canAdd ? "" : " disabled") + '>'
      + (isStudy() ? "加入研究队列" : "加入队列") + ' · ' + CTX.esc(selName) + '</button>')
        : "")
      + (isDismantle ? '<div class="wb-note">按精炼工艺科技的回收率无损返还装备制造成本材料（合金 / 气体 / 行星料）。回收率 = 科技树·精炼工艺，默认 100%，点了相关科技按倍率返还。</div>' : hint);
    return '<div class="wb-panel">'
      + '<div class="wb-head"><div><b>' + CTX.esc(hs.name) + '</b><span class="wb-sub">槽位 ' + hs.used + ' / ' + hs.total + ' · 耗时 −' + hs.speedPct + '%</span></div>'
      + '<span class="wb-close" data-act="workbench:close">×</span></div>'
      + '<div class="wb-col-left">' + leftHtml + '</div>'
      + '<div class="wb-col-right">' + rightHtml + '</div>'
      + '</div>';
  }

  // 滚动位置的「快照 / 还原」：窄屏只有 .wb-panel 滚；PC 宽屏 panel 定高不滚，
  // 改由左栏、右侧配方区、研究详情三个容器各自滚。按选择器统一收一份，布局切换无需分支判断。
  const SCROLL_SLOTS = [null, ".wb-col-left", ".wb-col-right > .wb-recipes", ".wb-study-detail"];
  function captureScroll(panel) {
    return SCROLL_SLOTS.map(function (sel) {
      const el = sel ? panel.querySelector(sel) : panel;
      return el ? el.scrollTop : null;
    });
  }
  function restoreScroll(panel, snap) {
    if (!snap) return;
    SCROLL_SLOTS.forEach(function (sel, i) {
      const v = snap[i];
      if (!v) return;
      const el = sel ? panel.querySelector(sel) : panel;
      if (el) el.scrollTop = v;   // 浏览器自动 clamp 到新的可滚上限
    });
  }

  function render() {
    if (!cur || !cur.overlay) return;
    // 结构性变化（切页签/分类/研究档位）会清空 recipeId，此时详情弹窗失去主体，一并收走避免悬空。
    if (!cur.recipeId && rdIsOpen()) closeRecipeDetail();
    // 整块重建会替换 .wb-panel 及内部所有滚动容器，滚动位置随之归零。
    // 结构性动作（切页签 / 分类 / 蓝图档位 / 装拆数量）仍需整块重建，这里统一记住位置再还原；
    // 轻量动作改走 patch()，根本不进这里。
    const oldPanel = cur.overlay.querySelector(".wb-panel");
    const snap = oldPanel ? captureScroll(oldPanel) : null;
    cur.overlay.innerHTML = buildBody();
    const newPanel = cur.overlay.querySelector(".wb-panel");
    if (newPanel) restoreScroll(newPanel, snap);
  }

  // 配方明细面板「制造材料」行的实时库存（持 N）+ 缺料标红，以及卡片「库存 N」（已拥有产物），
  // 随库存每秒变化（结算/派遣/其它队列都在动）实时刷新；只改文本与 .short 态，
  // 不重建节点、不丢 hover/滚动。由 refresh() 每秒调用。
  function syncStock(panel) {
    const st = state();
    if (!st) return;
    // 右侧明细面板：每行「原料 ×N  持 M」，M 取自 st.res[k]（与入队/结算同口径）
    panel.querySelectorAll(".wb-mat-have[data-sk]").forEach(function (node) {
      const k = node.getAttribute("data-sk");
      const need = parseFloat(node.getAttribute("data-need")) || 0;
      const have = (st.res && st.res[k]) || 0;
      const t = "持 " + CTX.fmt(have);
      if (node.textContent !== t) node.textContent = t;
      const short = have < need;
      const mat = node.closest(".wb-mat");
      if (mat && mat.classList.contains("short") !== short) mat.classList.toggle("short", short);
    });
    // 卡片「库存 N」（已拥有该产物数）：build 时写了 data-own-id，这里按 state 重算，资源/舰/装/剂全覆盖
    panel.querySelectorAll(".wb-recipe[data-own-id]").forEach(function (node) {
      const id = node.getAttribute("data-own-id");
      const tgt = node.querySelector(".wb-own");
      if (!tgt || !id) return;
      const t = CTX.fmt(ownedOf(id));
      if (tgt.textContent !== t) tgt.textContent = t;
    });
  }

  // 「可产批数」提示：只在文本真变了才写 DOM，与 refresh()/patch() 共用一份逻辑。
  function syncCap(panel) {
    const cap = panel.querySelector(".wb-cap");
    if (!cap) return;
    const capHtml = capText();
    if (cap.innerHTML !== capHtml) cap.innerHTML = capHtml;
  }

  // 「加入队列」按钮的文案 / 可用态：随 recipeId、槽位占用、科研门槛变化。
  // 拆解回收页每张卡片自带 .wb-add（不是底部主按钮）、强化页文案带次数，两者由各自页面维护，跳过。
  function syncAdd(panel) {
    if (cur.type === "equip" && cur.tab === "dismantle") return;
    if (cur.type === "manufacture" && cur.tab === "enhance") return;
    const add = panel.querySelector(".wb-add");
    if (!add) return;
    const hs = headStats();
    let canAdd = !!cur.recipeId && hs.used < hs.total;
    if (isStudy() && cur.recipeId) {
      const M = I(), b = M && M.blueprintByKey(cur.recipeId);
      if (!b || !M.isUnlocked(state(), b)) canAdd = false;   // 门槛未达：按钮置灰
    }
    if (add.classList.contains("off") !== !canAdd) add.classList.toggle("off", !canAdd);
    if (canAdd) { if (add.hasAttribute("disabled")) add.removeAttribute("disabled"); }
    else { if (!add.hasAttribute("disabled")) add.setAttribute("disabled", ""); }
    const addTxt = (isStudy() ? "加入研究队列 · " : "加入队列 · ")
      + (cur.recipeId ? recipeOutName(cur.recipeId) : "未选择");
    if (add.textContent !== addTxt) add.textContent = addTxt;
  }

  // 强化子页签的 .wb-add 文案含连续次数（其余页面由 syncAdd 管）。
  function syncEnhanceAdd(panel) {
    if (!(cur.type === "manufacture" && cur.tab === "enhance")) return;
    const add = panel.querySelector(".wb-add");
    if (!add) return;
    const m = (state().members || []).find(x => x.id === cur.enhMember);
    const txt = "强化 " + CTX.fmt(cur.count) + " 次 · " + (m ? m.name : "");
    if (add.textContent !== txt) add.textContent = txt;
  }

  // 轻量交互（选配方 / 改数量 / 切 ME·TE）只更新受影响的那一小块，不整块重建面板：
  // 保住滚动位置、hover、焦点和卡片节点身份。结构性变化仍走 render()（内部已恢复 scrollTop）。
  function patch(kind) {
    if (!cur || !cur.overlay || !cur.overlay.classList.contains("active")) { render(); return; }
    const panel = cur.overlay.querySelector(".wb-panel");
    if (!panel) { render(); return; }
    const rp = rdPanel();   // 详情弹窗（标准配方且已开）也跟着就地同步，避免两处状态漂移
    try {
      if (kind === "sel") {
        const prefix = "workbench:sel:";
        panel.querySelectorAll(".wb-recipe[data-act^='workbench:sel:']").forEach(function (node) {
          const id = (node.getAttribute("data-act") || "").slice(prefix.length);
          node.classList.toggle("sel", !!cur.recipeId && id === cur.recipeId);
        });
        const slot = panel.querySelector(".wb-study-detail");
        if (slot) {   // 效率研究页：换详情，但搜索框 / 筛选条节点不动
          const dh = studyDetailHtml();
          if (slot.innerHTML !== dh) slot.innerHTML = dh;
        }
        if (isRecipeDetailType()) {   // 主台右栏详情已移到弹窗，这里只更新提示条
          const hint = panel.querySelector(".wb-rd-hint");
          if (hint) {
            const selName = cur.recipeId ? recipeOutName(cur.recipeId) : "未选择";
            const hh = cur.recipeId
              ? '已选「' + CTX.esc(selName) + '」· 材料与批量见详情弹窗，可继续调数量或加入队列'
              : '点上方配方卡 → 弹出材料明细与批量面板';
            if (hint.innerHTML !== hh) hint.innerHTML = hh;
          }
        }
      }
      if (kind === "sdir") {
        // .iv-dir 的高亮由 studyDetailHtml() 按 cur.studyDir 生成，重写详情容器即可，不必再单独 toggle。
        const slot = panel.querySelector(".wb-study-detail");
        if (slot) {
          const dh = studyDetailHtml();
          if (slot.innerHTML !== dh) slot.innerHTML = dh;
        }
      }
      if (kind === "count") {
        const txt = CTX.fmt(cur.count);
        const panels = rp ? [panel, rp] : [panel];
        panels.forEach(function (pl) {
          pl.querySelectorAll(".wb-count").forEach(function (el) {
            if (el.textContent !== txt) el.textContent = txt;
          });
        });
        syncEnhanceAdd(panel);
      }
      syncCap(panel); syncAdd(panel);
      if (rp) { syncCap(rp); syncAdd(rp); syncStock(rp); }
    } catch (e) {
      render();   // 就地更新万一失败就退回整块重建：宁可闪一下，也不能显示错状态
    }
  }

  // 每秒由 renderView 调用：仅就地更新「动态部分」（队列进度 / 头部槽位 / 加按钮可用态 / 配方可负担），
  // 绝不重建配方网格、页签、步进器——否则每秒整面板 innerHTML 重建会丢 hover/焦点、肉眼闪烁。
  // 进一步：每个动态片段只在「内容确实变了」时才写 DOM，无变化时零写入，弹窗静置期完全静止。
  function refresh() {
    if (!cur || !cur.overlay || !cur.overlay.classList.contains("active")) return;
    const panel = cur.overlay.querySelector(".wb-panel");
    if (!panel) return;
    const snap = captureScroll(panel);   // 1Hz 刷新里队列块会改高度，宽屏左栏滚动位置也要保住
    const hs = headStats();
    const full = hs.used >= hs.total;

    const sub = panel.querySelector(".wb-sub");
    const subTxt = "槽位 " + hs.used + " / " + hs.total + " · 耗时 −" + hs.speedPct + "%";
    if (sub && sub.textContent !== subTxt) sub.textContent = subTxt;

    const qsec = panel.querySelector(".wb-queue-sec");
    const qsecHtml = "队列 · " + hs.used + " / " + hs.total + (full ? ' <span class="wb-full">已满</span>' : "");
    if (qsec && qsec.innerHTML !== qsecHtml) qsec.innerHTML = qsecHtml;

    const q = panel.querySelector(".wb-queue");
    const qHtml = queueRows();
    if (q && q.innerHTML !== qHtml) q.innerHTML = qHtml;

    // 可产批数随库存每秒变化（结算/派遣/其它队列都在动），加按钮可用态随槽位变化。
    // 与 patch() 共用同一份同步逻辑，避免两处各写一遍导致文案/门禁漂移。
    syncCap(panel);
    syncAdd(panel);
    updateRecipeAffordability(panel);
    syncStock(panel);   // 配方卡「持有量」实时刷新（不动节点，保 hover/滚动）

    // 详情弹窗与主台共用同一份同步：加入队列后弹窗保持打开，材料「持 N」与可产批数必须跟着结算走。
    const rp = rdPanel();
    if (rp) { syncCap(rp); syncAdd(rp); syncStock(rp); }

    restoreScroll(panel, snap);
  }

  // 仅刷新顶部「舱段明细」块（驻舱撤下/安装模块等会改变明细内容）。容器已是 .base-focus-panel 复用样式。
  function refreshDetail() {
    if (!cur || !cur.overlay || !cur.overlay.classList.contains("active")) return;
    const panel = cur.overlay.querySelector(".wb-panel");
    if (!panel) return;
    const el = panel.querySelector(".wb-detail");
    if (!el || !cur.detailBuilder) return;
    let dh = "";
    try { dh = cur.detailBuilder() || ""; } catch (e) { dh = ""; }
    if (el.innerHTML !== dh) el.innerHTML = dh;
  }

  // 仅微调配方卡片的「可负担」态（资源每秒结算会变化），不重建节点，保留 hover/选中高亮。
  function updateRecipeAffordability(panel) {
    // 强化子页签用自定义成员卡片（enhsel），不走配方可负担逻辑，跳过避免误标 dis
    if (cur.type === "manufacture" && cur.tab === "enhance") return;
    const st = state();
    panel.querySelectorAll(".wb-recipe").forEach(function (node) {
      const act = node.getAttribute("data-act") || "";
      // ⚠️ 蓝图 key 自带冒号（"booster:xxx" / "ammo:xxx"），必须 join 回去，
      //    否则 split(":")[2] 只拿到 "booster"，查表必然落空、卡片被误标成不可负担。
      const id = act.split(":").slice(2).join(":");
      if (!id) return;
      let can;
      if (isStudy()) {
        const M = I(), bp = M && M.blueprintByKey(id);
        can = !!(bp && M.isUnlocked(st, bp) && Prod().canAfford(st.res, bp.costCycle));
      } else if (cur.type === "manufacture" && cur.tab === "ship") {
        const s = Data().Ships.shipById(id);
        can = !!(s && Data().Ships.canBuildAt(s.id, st.base.bodyLevel) && Prod().canAfford(st.res, s.cost));
      } else if (cur.type === "equip") {
        const E = EData();
        const eq = E && E.byId ? E.byId(id) : null;
        if (!eq) { node.classList.add("dis"); return; }
        const gate = Prod().equipGateLevel(eq.level);
        const lvOk = st.base.bodyLevel >= gate;
        const bpOk = !eq.requiresBlueprint || (E.hasBlueprint && E.hasBlueprint(st, id));
        can = !!(lvOk && bpOk && Prod().canAfford(st.res, eq.cost || {}));
      } else if (cur.type === "booster") {
        const B = BEngine();
        const cost = B && B.craftCost(st, id);
        const r = B && B.getRecipe(id);
        const gateOk = r && (!r.requiresBlueprint || (st.ownedBlueprints || []).includes("booster:" + id));
        can = !!(gateOk && cost && Prod().canAfford(st.res, cost));
      } else {
        const r = recipeTable().find(function (x) { return x.id === id; });
        const gateOk = r && (r.bodyLevelReq == null || st.base.bodyLevel >= r.bodyLevelReq);
        can = !!(gateOk && r && Prod().canAfford(st.res, r.in));
      }
      node.classList.toggle("dis", !can);
    });
  }

  // ---------- 动作 ----------
  function doAdd() {
    if (!cur || !cur.recipeId) { CTX.toast("请先选择配方"); return; }
    const st = state();
    let r;
    if (cur.type === "smelt") r = Prod().enqueue(st, "smelt", cur.recipeId, cur.count);
    else if (isStudy()) r = Prod().enqueueStudy(st, cur.recipeId, cur.studyDir, cur.count);
    else if (cur.type === "invent") r = Prod().enqueue(st, "invent", cur.recipeId, cur.count);
    else if (cur.type === "booster") r = Prod().enqueue(st, "booster", cur.recipeId, cur.count);
    else if (cur.type === "equip" && cur.tab !== "dismantle") r = Prod().buildEquipment(st, cur.recipeId, cur.count);
    else if (cur.type === "manufacture" && cur.tab === "component") r = Prod().enqueue(st, "manufacture", cur.recipeId, cur.count);
    else if (cur.type === "manufacture" && cur.tab === "ship") r = Prod().buildShip(st, cur.recipeId, cur.count);
    else if (cur.type === "manufacture" && cur.tab === "enhance") {
      if (!cur.enhMember) { CTX.toast("请先选择成员"); return; }
      r = Prod().enhanceShip(st, cur.enhMember, cur.count);
    }
    if (r && r.ok) CTX.toast("已加入队列 · " + recipeOutName(cur.recipeId) + " ×" + cur.count);
    else CTX.toast((r && r.err) || "无法加入队列");
    CTX.renderView();
  }

  function handle(act) {
    if (!cur) return;
    const p = act.split(":");
    const sub = p[1];
    let light = null;   // 非 null = 只就地更新受影响的那一小块，不整块重建面板
    // ⚠️ 蓝图 key 自带冒号（"booster:xxx"），sel 的参数要 join 回去。
    // 标准配方类：点卡 → 选中并弹出详情窗（材料/批量独立承载）；研究页仍就地 patch 保留搜索框上下文。
    if (sub === "sel") {
      cur.recipeId = p.slice(2).join(":");
      if (isRecipeDetailType()) {
        light = "sel";        // 主台卡片高亮 + 提示条就地更新
        openRecipeDetail();   // 打开/刷新详情弹窗
      } else light = "sel";
    }
    else if (sub === "rdprev") { rdNav(-1); return; }
    else if (sub === "rdnext") { rdNav(1); return; }
    else if (sub === "rdclose") { closeRecipeDetail(); return; }
    else if (sub === "stier") {
      cur.studyTier = Math.max(0, Math.min(5, parseInt(p[2], 10) || 0));
      cur.recipeId = null;
    }
    else if (sub === "sdir") { cur.studyDir = p[2] === "te" ? "te" : "me"; light = "sdir"; }
    else if (sub === "count") { cur.count = clampN(cur.count + (parseInt(p[2], 10) || 0)); light = "count"; }
    else if (sub === "chip") { cur.count = clampN(parseInt(p[2], 10) || 1); light = "count"; }
    else if (sub === "tab") { cur.tab = p[2]; cur.recipeId = null; cur.studyQuery = ""; cur.studyTier = 0; }
    else if (sub === "enhsel") { cur.enhMember = p.slice(2).join(":"); render(); return; }
    // 切分类（反应实验室 / 制造车间共用）：清空已选配方，避免「加入队列」仍指向看不见的另一分类配方
    else if (sub === "cat") {
      if (cur.type === "equip") cur.equipCat = p[2]; else cur.boosterCat = p[2];
      cur.recipeId = null;
    }
    else if (sub === "cancel") {
      const qk = p[2], idx = parseInt(p[3], 10);
      const q = state().base.industry[qk];
      if (q && q[idx]) { q.splice(idx, 1); CTX.renderView(); return; }
    }
    else if (sub === "add") { doAdd(); return; }
    else if (sub === "dcount") {
      const id = p[2];
      cur.dcnt = cur.dcnt || {};
      const max = ((state().equipment && state().equipment[id]) || 0);
      cur.dcnt[id] = Math.max(1, Math.min(max, (cur.dcnt[id] || 1) + (parseInt(p[3], 10) || 0)));
      render(); return;
    }
    else if (sub === "dismantle") {
      const id = p[2];
      const cnt = (cur.dcnt && cur.dcnt[id]) || 1;
      const r = Prod().dismantleEquipment(state(), id, cnt);
      CTX.toast(r && r.ok ? ("拆解 " + cnt + " 件「" + r.name + "」，回收 " + Object.keys(r.back).length + " 种材料") : ((r && r.err) || "拆解失败"));
      render(); return;
    }
    else if (sub === "close") { close(); return; }
    if (light) { patch(light); return; }
    render();   // 结构性变化（tab / cat / stier / enhsel / 拆解数量）：整块重画，render() 内部恢复滚动位置
  }

  return { init: init, open: open, openEnhance: openEnhance, close: close, refresh: refresh, refreshDetail: refreshDetail, isOpen: isOpen, slotIfIndustrial: slotIfIndustrial, handle: handle, rdIsOpen: rdIsOpen };
});
