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
  const MAX_CONTINUOUS = 9999;
  // 工业舱段（点击弹出工作台）：精炼环 / 总装船坞 / 发明舱 / 反应实验室（增强剂制造）
  const INDUSTRIAL = { smelt: 1, manufacture: 1, invent: 1, booster: 1, equip: 1 };

  function init(ctx) { CTX = ctx; }
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

  // 供 app.js 判定：该舱位是否工业类且已装配（决定是否弹工作台）
  function slotIfIndustrial(st, slotId) {
    const B = Base(); if (!B || !st) return null;
    const slot = B.slotById(st, slotId);
    if (!slot || !INDUSTRIAL[slot.type]) return null;
    if (!B.moduleAt(st, slot.id)) return null;
    return slot;
  }

  // detailBuilder：可选，() => html 字符串。由 app.js 传入「舱段明细」HTML，
  // 渲染在工作台弹窗顶部，使工业舱段被点开时原右侧明细也一并呈现（移除右侧常驻面板后的补偿）。
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
    cur = {
      slotId: slotId, type: slot.type,
      // 发明舱双子页签：效率研究（默认）/ 图纸合成。总装船坞沿用 component/ship。
      tab: slot.type === "manufacture" ? "component" : slot.type === "invent" ? "study" : null,
      boosterCat: null,       // 反应实验室当前分类（null = 取第一个有配方的分类）
      equipCat: null,         // 制造车间当前分类（高槽/中槽/低槽/改装件）
      dcnt: {},               // 拆解回收页：每装备选中的拆解数量 { equipId: n }
      studyTier: 0,            // 0 = 全部；1..5 = 按蓝图档位筛选
      studyQuery: "",          // 蓝图名 / key 搜索
      studyDir: "me",          // me | te
      recipeId: null, count: 1, overlay: null,
      detailBuilder: typeof detailBuilder === "function" ? detailBuilder : null,
    };
    ensureOverlay();
    render();
    show();
  }

  function close() {
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
  function inStr(obj) {
    return Object.entries(obj).map(([k, v]) => CTX.resIcon(k) + CTX.resName(k) + " " + v).join(" ");
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
    return R.map(r => {
      const gateOk = r.bodyLevelReq == null || st.base.bodyLevel >= r.bodyLevelReq;
      const gateTag = gateOk ? "" : '<span class="wb-lock">需舰基 Lv' + (r.bodyLevelReq + 1) + '</span>';
      const can = gateOk && Prod().canAfford(st.res, r.in);
      const adjDur = Math.round(r.dur * durMult * 10) / 10;
      const sel = cur.recipeId === r.id ? " sel" : "";
      const dis = can ? "" : " dis";
      return '<button class="wb-recipe' + sel + dis + '" data-act="workbench:sel:' + r.id + '">'
        + '<div class="wb-r1">' + inStr(r.in) + ' → ' + CTX.resIcon(r.out) + CTX.resName(r.out) + ' ×' + r.qty + '</div>'
        + '<div class="wb-r2">' + (durMult < 0.995 ? r.dur + 's → ' + adjDur + 's' : adjDur + 's') + ' / 批 ' + gateTag + '</div>'
        + '</button>';
    }).join("");
  }

  function shipCards() {
    const st = state();
    const durMult = Base().queueDurationMultiplier(st, "manufacture");
    const ships = Object.values(Data().Ships.SHIPS).sort((a, b) => a.classTier - b.classTier || a.bodyLevelReq - b.bodyLevelReq);
    return ships.map(s => {
      const ok = Data().Ships.canBuildAt(s.id, st.base.bodyLevel);
      const canAfford = Prod().canAfford(st.res, s.cost);
      const adjDur = Math.round(s.buildTime * durMult);
      const lock = ok ? "" : '<span class="wb-lock">核心 Lv' + (s.bodyLevelReq + 1) + '</span>';
      const sel = cur.recipeId === s.id ? " sel" : "";
      const dis = (ok && canAfford) ? "" : " dis";
      return '<button class="wb-recipe' + sel + dis + '" data-act="workbench:sel:' + s.id + '">'
        + '<div class="wb-r1">' + inStr(s.cost) + ' → ' + CTX.esc(s.name) + ' ×1</div>'
        + '<div class="wb-r2">' + adjDur + 's / 艘 ' + lock + '</div>'
        + '</button>';
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
    return R.map(r => {
      const cost = (B && B.craftCost(st, r.id)) || {};
      const gateOk = !r.requiresBlueprint || hasBp(r.id);
      const gateTag = gateOk ? "" : '<span class="wb-lock">需蓝图</span>';
      const can = gateOk && Prod().canAfford(st.res, cost);
      const adjDur = Math.round(r.time * durMult * 10) / 10;
      const sel = cur.recipeId === r.id ? " sel" : "";
      const dis = can ? "" : " dis";
      const item = (B && B.getItem(r.itemId)) || { name: r.name };
      return '<button class="wb-recipe' + sel + dis + '" data-act="workbench:sel:' + r.id + '">'
        + '<div class="wb-r1">' + inStr(cost) + ' → ' + CTX.esc(item.name) + ' ×' + ((r.output && r.output.qty) || 1) + '</div>'
        + '<div class="wb-r2">' + (durMult < 0.995 ? r.time + 's → ' + adjDur + 's' : adjDur + 's / 批') + ' ' + gateTag + '</div>'
        + '</button>';
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
    return R.map(eq => {
      const tier = Math.min(5, Math.floor((eq.level - 1) / 20) + 1);
      const gate = Prod().equipGateLevel(eq.level);
      const lvLocked = st.base.bodyLevel < gate;
      const bpLocked = !!eq.requiresBlueprint && !(E.hasBlueprint && E.hasBlueprint(st, eq.id));
      const locked = lvLocked || bpLocked;
      const gateTag = lvLocked ? '<span class="wb-lock">需核心 Lv' + (gate + 1) + '</span>'
        : bpLocked ? '<span class="wb-lock">需蓝图</span>' : "";
      const cost = eq.cost || {};
      const can = !locked && Prod().canAfford(st.res, cost);
      const adjDur = Math.round(eq.time * durMult);
      const sel = cur.recipeId === eq.id ? " sel" : "";
      const dis = can ? "" : " dis";
      return '<button class="wb-recipe' + sel + dis + '" data-act="workbench:sel:' + eq.id + '">'
        + '<div class="wb-r1">' + inStr(cost) + ' → ' + CTX.esc(eq.name) + ' T' + tier + '</div>'
        + '<div class="wb-r2">' + (durMult < 0.995 ? Math.round(eq.time) + 's → ' + adjDur + 's' : adjDur + 's / 批') + ' ' + gateTag + '</div>'
        + '</button>';
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
      const backTxt = Object.keys(prev.back).length ? inStr(prev.back) : "无回收";
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
      const QK_LABEL = { buildQueue: '建造中', boosterQueue: '合成中', inventQueue: '研发中', manufactureQueue: '制造中', smeltQueue: '冶炼中' };
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
    const hs = headStats();
    const st = state();
    const full = hs.used >= hs.total;
    let tabs = "";
    if (cur.type === "manufacture") {
      tabs = '<div class="wb-tabs">'
        + '<span class="wb-tab' + (cur.tab === "component" ? " on" : "") + '" data-act="workbench:tab:component">部件 / 弹药</span>'
        + '<span class="wb-tab' + (cur.tab === "ship" ? " on" : "") + '" data-act="workbench:tab:ship">造船</span>'
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
    const studyHead = isStudy()
      ? '<div class="iv-search"><input id="ivq" type="text" placeholder="搜索蓝图名称 / key" value="'
        + attrEsc(cur.studyQuery) + '"></div>'
        + studyFiltersHtml() + studyDetailHtml()
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
    return '<div class="wb-panel">'
      + '<div class="wb-head"><div><b>' + CTX.esc(hs.name) + '</b><span class="wb-sub">槽位 ' + hs.used + ' / ' + hs.total + ' · 耗时 −' + hs.speedPct + '%</span></div>'
      + '<span class="wb-close" data-act="workbench:close">×</span></div>'
      + detail
      + tabs
      + catBar
      + studyHead
      + '<div class="wb-sec">' + (isStudy() ? "选择蓝图" : "选择配方")
      + (isStudy() ? '<span class="iv-catcount">共 ' + studyList().length + ' 张 · 当前 ' + studyVisible().length + ' 张</span>'
          : (hasCats && catName ? '<span class="wb-catcount">' + CTX.esc(catName) + ' · ' + catN + (cur.type === "equip" ? ' 件' : ' 个配方') + '</span>' : ''))
      + '</div>'
      + '<div class="wb-recipes' + (isStudy() ? " iv-list" : "") + '">' + recipeCards() + '</div>'
      + (isDismantle ? '' : (
          '<div class="wb-sec">' + (cur.type === "smelt" ? "连续冶炼数量" : isStudy() ? "连续研究次数" : "连续生产数量") + '</div>'
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
        + (isStudy() ? "加入研究队列" : "加入队列") + ' · ' + CTX.esc(selName) + '</button>'
      ))
      + (isDismantle ? '<div class="wb-note">按精炼工艺科技的回收率无损返还装备制造成本材料（合金 / 气体 / 行星料）。回收率 = 科技树·精炼工艺，默认 100%，点了相关科技按倍率返还。</div>' : hint)
      + '<div class="wb-sec wb-queue-sec">队列 · ' + hs.used + ' / ' + hs.total + (full ? ' <span class="wb-full">已满</span>' : '') + '</div>'
      + '<div class="wb-queue">' + queueRows() + '</div>'
      + '</div>';
  }

  function render() {
    if (!cur || !cur.overlay) return;
    cur.overlay.innerHTML = buildBody();
  }

  // 每秒由 renderView 调用：仅就地更新「动态部分」（队列进度 / 头部槽位 / 加按钮可用态 / 配方可负担），
  // 绝不重建配方网格、页签、步进器——否则每秒整面板 innerHTML 重建会丢 hover/焦点、肉眼闪烁。
  // 进一步：每个动态片段只在「内容确实变了」时才写 DOM，无变化时零写入，弹窗静置期完全静止。
  function refresh() {
    if (!cur || !cur.overlay || !cur.overlay.classList.contains("active")) return;
    const panel = cur.overlay.querySelector(".wb-panel");
    if (!panel) return;
    const scrollTop = panel.scrollTop;
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

    // 可产批数随库存每秒变化（结算/派遣/其它队列都在动），同样只在文本真变了才写 DOM。
    const cap = panel.querySelector(".wb-cap");
    if (cap) {
      const capHtml = capText();
      if (cap.innerHTML !== capHtml) cap.innerHTML = capHtml;
    }

    let canAdd = !!cur.recipeId && !full;
    if (isStudy() && cur.recipeId) {
      const M = I(), b = M && M.blueprintByKey(cur.recipeId);
      if (!b || !M.isUnlocked(state(), b)) canAdd = false;
    }
    const add = panel.querySelector(".wb-add");
    if (add && !(cur.type === "equip" && cur.tab === "dismantle")) {
      if (add.classList.contains("off") !== !canAdd) add.classList.toggle("off", !canAdd);
      if (canAdd) { if (add.hasAttribute("disabled")) add.removeAttribute("disabled"); }
      else { if (!add.hasAttribute("disabled")) add.setAttribute("disabled", ""); }
      const addTxt = (isStudy() ? "加入研究队列 · " : "加入队列 · ")
        + (cur.recipeId ? recipeOutName(cur.recipeId) : "未选择");
      if (add.textContent !== addTxt) add.textContent = addTxt;
    }

    updateRecipeAffordability(panel);
    panel.scrollTop = scrollTop;
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
    if (r && r.ok) CTX.toast("已加入队列 · " + recipeOutName(cur.recipeId) + " ×" + cur.count);
    else CTX.toast((r && r.err) || "无法加入队列");
    CTX.renderView();
  }

  function handle(act) {
    if (!cur) return;
    const p = act.split(":");
    const sub = p[1];
    // ⚠️ 蓝图 key 自带冒号（"booster:xxx"），sel 的参数要 join 回去。
    if (sub === "sel") cur.recipeId = p.slice(2).join(":");
    else if (sub === "stier") {
      cur.studyTier = Math.max(0, Math.min(5, parseInt(p[2], 10) || 0));
      cur.recipeId = null;
    }
    else if (sub === "sdir") cur.studyDir = p[2] === "te" ? "te" : "me";
    else if (sub === "count") cur.count = clampN(cur.count + (parseInt(p[2], 10) || 0));
    else if (sub === "chip") cur.count = clampN(parseInt(p[2], 10) || 1);
    else if (sub === "tab") { cur.tab = p[2]; cur.recipeId = null; cur.studyQuery = ""; cur.studyTier = 0; }
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
    render();
  }

  return { init: init, open: open, close: close, refresh: refresh, refreshDetail: refreshDetail, isOpen: isOpen, slotIfIndustrial: slotIfIndustrial, handle: handle };
});
