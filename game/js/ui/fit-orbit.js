// ================================================================
// 深空星疆 —— UI.FitOrbit：舰船装配 · 环带界面
// ----------------------------------------------------------------
// 来源（2026-11-01）：这是 1 代（EVE-IDLE）`js/ui/shell-render.js` 里
// `openEquipOrbit / buildOrbit / openOrbitSelect / updateOrbitLibrary / updateOrbitStats`
// 那一套的移植版。用户要求「直接用 1 代的装配界面」，故布局与交互照搬：
//   · 环形轨道：每个槽位一颗圆点，按槽位数均分角度
//   · 点槽位 → 环右侧浮出候选面板（当前槽对照条 + 候选卡 + 卸下）
//   · 下方「已装配装备」条 + 四格统计
//
// 刻意不搬的部分（本作没有对应子系统，搬过来就是死代码）：
//   · 装备实例 / 强化等级（1 代 state.equipment.instances + affixes 词条）
//   · 改装件谐振（rig 安装后拆卸即销毁、同系列递减）
//   · 泰坦末日武器占位槽、外接精炼泵管路锁定槽
//   · 候选卡上的「详情」按钮（指向 1 代仓库强化/拆解弹窗）
//   · 速度统计 → 换成回避（本作舰船有 dodge，没有 speed）
//
// 与 1 代的差异点（必须记住，否则改错）：
//   1. 1 代槽位按 `ship.fitted[type][slotIndex]` 定位；本作 `m.fitted[type]` 是
//      **无空洞数组**（卸下即 splice），所以「第 i 格」= 数组第 i 项，空格恒在末尾。
//   2. 本作 `Engine.Production.fitEquipment` 只做 append（满了返回「该槽位已满」），
//      不认 slotIndex。所以「替换」由本文件组合实现：先卸末尾一件 → 再装 → 失败回滚。
//   3. 1 代直连 DOM 事件（弹窗常驻 index.html）；本作同样常驻，但数据来自传入的
//      getState()，不持有 state 引用（state 是 UI 层常量，这里只读）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.UI = window.NSK.UI || {};
    window.NSK.UI.FitOrbit = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.UI = root.NSK.UI || {};
    root.NSK.UI.FitOrbit = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const CENTER = 250;
  const RADIUS = 180;
  const SLOT_TYPES = ["high", "mid", "low", "rig"];
  const SLOT_CN = { high: "高槽", mid: "中槽", low: "低槽", rig: "改装件" };
  const SLOT_GLYPH = { high: "⚡", mid: "🛡", low: "⚙", rig: "🔮" };
  const TIER_CN = ["", "护卫 / 驱逐", "巡洋 / 战巡", "战列 / 旗舰", "超级旗舰"];
  // 装备分类图标：本作没有 1 代的 ITEM_ICONS 表（那是逐件 emoji 映射），
  // 按 cat + combat.kind 归并成一套够用的字形。
  const CAT_GLYPH = {
    archaeology: "🏺", mining: "⛏", gas: "💨", combat: "⚔",
    repair: "🔧", salvage: "🪝", shield: "🛡", industry: "⚙",
  };
  // 绝对值型加成（其余 bonuses 一律按比例 ×100 显示成百分比）
  const ABS_BONUS_KEYS = { archaeologyScan: 1 };

  let deps = null;          // { getState, toast, onChanged }
  let openMemberId = null;
  let selectedIndex = null;
  let bound = false;

  // ---------- 基础工具 ----------
  function ns() { return (typeof window !== "undefined" && window.NSK) || {}; }
  function D() { return ns().Data || {}; }
  function state() { return deps && deps.getState ? deps.getState() : null; }
  function toast(msg) { if (deps && deps.toast) deps.toast(msg); }
  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ---------- 数值摘要（对应 1 代 equipmentStatSummary / Number / Delta / TierText）----------
  function statSummary(eq) {
    if (!eq) return "";
    if (eq.combat && eq.combat.kind === "weapon") return "伤害 " + (Number(eq.combat.baseDamage) || 0);
    if (eq.combat && eq.combat.kind === "repair") {
      const tgt = { shield: "护盾", armor: "装甲", structure: "结构" }[eq.combat.target] || "结构";
      return "恢复" + tgt + " " + (Number(eq.combat.amount) || 0);
    }
    if (eq.bonuses) {
      const labels = (D().Equipment && D().Equipment.BONUS_LABELS) || {};
      for (const k in eq.bonuses) {
        const v = Number(eq.bonuses[k]) || 0;
        if (!v) continue;
        const label = labels[k] || k;
        // 扫描强度是绝对值（+5 / +8），其余是比例（0.05 → +5%）。
        // ⚠️ 1 代这里一律 ×100，绝对值型键会显示成 +500%，移植时已修正。
        return ABS_BONUS_KEYS[k] ? label + " +" + v : label + " +" + Math.round(v * 100) + "%";
      }
    }
    return "";
  }
  function statNumber(eq) {
    if (!eq) return null;
    if (eq.combat && eq.combat.kind === "weapon") return Number(eq.combat.baseDamage) || 0;
    if (eq.combat && eq.combat.kind === "repair") return Number(eq.combat.amount) || 0;
    if (eq.bonuses) for (const k in eq.bonuses) { const v = Number(eq.bonuses[k]) || 0; if (v) return v; }
    return null;
  }
  // 只在「同类量纲」之间比差值（伤害 vs 采集效率没有可比性）
  function statKind(eq) {
    if (!eq) return null;
    if (eq.combat) return "combat:" + eq.combat.kind + (eq.combat.target || "");
    if (eq.bonuses) { for (const k in eq.bonuses) if (Number(eq.bonuses[k])) return "bonus:" + k; }
    return null;
  }
  function statDelta(eq, cur) {
    if (!eq || !cur) return null;
    if (statKind(eq) !== statKind(cur)) return null;
    const a = statNumber(eq), b = statNumber(cur);
    if (a == null || b == null || a === b) return null;
    const d = Math.round((a - b) * 100) / 100;
    return d === 0 ? null : d;
  }
  const TIER_BY_LEVEL = { 1: "T1", 15: "T2", 35: "T3", 55: "T4", 80: "T5" };
  function tierText(eq) {
    if (!eq) return "";
    if (TIER_BY_LEVEL[eq.level]) return TIER_BY_LEVEL[eq.level];
    const m = String(eq.id || "").match(/^t(\d+)_/);
    return m ? "T" + m[1] : "";
  }
  function equipGlyph(eq) {
    if (!eq) return "";
    if (eq.combat) {
      if (eq.combat.kind === "weapon") return "⚔";
      if (eq.combat.kind === "repair") return "🔧";
      return "🛡";
    }
    return CAT_GLYPH[eq.cat] || "📦";
  }

  // ---------- 数据适配层（对应 1 代 getShipFittingDisplayState 的精简版）----------
  // 1 代那版 190+ 行，含实例池解析、强化、改装件谐振、泰坦末日槽、管路锁；
  // 本作全部没有，故只保留「成员 → 舰种 → 槽位 → 装备」这条主线。
  function buildDisplay(st, memberId) {
    if (!st) return null;
    const Data = D();
    if (!Data.Ships || !Data.Equipment) return null;
    const m = (st.members || []).find(x => x.id === memberId);
    if (!m) return null;
    const def = Data.Ships.shipById(m.shipId) || null;
    const layout = Data.Ships.slotLayout(m.shipId);
    const maxHp = Data.Ships.maxHp(m.shipId, m.enhancementLevel);
    const orbitSlots = [];
    let index = 0;
    for (const type of SLOT_TYPES) {
      const cap = layout[type] || 0;
      const arr = (m.fitted && Array.isArray(m.fitted[type])) ? m.fitted[type] : [];
      for (let si = 0; si < cap; si++) {
        const eqId = arr[si] || null;
        const equipment = eqId ? Data.Equipment.byId(eqId) : null;
        orbitSlots.push({
          index: index, type: type, slotIndex: si, cap: cap,
          enabled: true,
          equipmentId: equipment ? eqId : null,
          equipment: equipment,
          name: equipment ? equipment.name : "",
        });
        index++;
      }
    }
    return {
      memberId: m.id, member: m, def: def, layout: layout, maxHp: maxHp,
      orbitSlots: orbitSlots,
      total: orbitSlots.length,
      filled: orbitSlots.filter(s => s.equipmentId).length,
    };
  }

  function subText(display) {
    const parts = [];
    if (display.def) parts.push("T" + display.def.classTier + " · " + (TIER_CN[display.def.classTier] || "舰船"));
    parts.push("驾驶者 " + display.member.name);
    parts.push("已装 " + display.filled + " / " + display.total + " 槽");
    return parts.join(" · ");
  }

  // ---------- 环带绘制（照搬 1 代 buildOrbit，去掉管路/末日/图标 image 分支）----------
  function buildOrbit(display) {
    const svg = el("fitOrbitSvg");
    if (!svg) return;
    const n = Math.max(1, display.orbitSlots.length);
    const segment = Math.PI * 2 / n;
    svg.innerHTML = "";
    for (const r of [180, 210, 150]) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", CENTER);
      c.setAttribute("cy", CENTER);
      c.setAttribute("r", r);
      c.setAttribute("class", r === 180 ? "fo-ring-glow" : (r === 210 ? "fo-ring-outer" : "fo-ring-inner"));
      svg.appendChild(c);
    }
    // 角度起点：候选面板浮在环右侧，若某个圆点正好落在 3 点钟方向会被整块盖住。
    // 槽位数为 4 的倍数时（4/8/12…）必须绕半格，否则 3 点方向必有一点；
    // 其余情况（2/3/5/6…）保持首点正上方反而都避开了右侧。
    const ANGLE_OFFSET = (n % 4 === 0) ? segment / 2 : 0;
    display.orbitSlots.forEach(slot => {
      const angle = slot.index * segment - Math.PI / 2 + ANGLE_OFFSET;
      const cx = CENTER + RADIUS * Math.cos(angle);
      const cy = CENTER + RADIUS * Math.sin(angle);
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "slot-segment " + slot.type + (slot.equipmentId ? " filled" : " empty")
        + (selectedIndex === slot.index ? " sel" : ""));
      g.setAttribute("data-slot", String(slot.index));
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.setAttribute("aria-label", SLOT_CN[slot.type] + " " + (slot.slotIndex + 1) + (slot.equipmentId ? "：" + slot.name : "：空槽"));

      const marker = document.createElementNS(SVG_NS, "circle");
      marker.setAttribute("cx", cx);
      marker.setAttribute("cy", cy);
      marker.setAttribute("r", 22);
      marker.setAttribute("class", slot.equipmentId ? "slot-bg-active" : "slot-bg");
      g.appendChild(marker);

      const icon = document.createElementNS(SVG_NS, "text");
      icon.setAttribute("x", cx);
      icon.setAttribute("y", cy + 1);
      icon.setAttribute("class", "slot-icon");
      icon.textContent = slot.equipmentId ? equipGlyph(slot.equipment) : SLOT_GLYPH[slot.type];
      g.appendChild(icon);

      // 圆点下方常驻槽位名：空槽图标是 emoji，30px 下不一定能认出是哪类槽，
      // 补一行「高槽 / 高槽 2」比让玩家猜更稳（1 代只有图标，认错是常事）。
      const tag = document.createElementNS(SVG_NS, "text");
      tag.setAttribute("x", cx);
      tag.setAttribute("y", cy + 38);
      tag.setAttribute("class", "slot-tag");
      tag.textContent = SLOT_CN[slot.type]
        + ((display.layout[slot.type] || 0) > 1 ? " " + (slot.slotIndex + 1) : "");
      g.appendChild(tag);

      g.addEventListener("click", function (ev) {
        ev.stopPropagation();
        selectSlot(slot.index, display);
      });
      g.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectSlot(slot.index, display); }
      });
      svg.appendChild(g);
    });
    const ship = document.createElementNS(SVG_NS, "text");
    ship.setAttribute("x", CENTER);
    ship.setAttribute("y", CENTER + 12);
    ship.setAttribute("class", "fo-ship-icon");
    ship.textContent = "🚀";
    svg.appendChild(ship);
  }

  // ---------- 候选面板 ----------
  function candidates(type) {
    const Data = D();
    const st = state();
    const inv = (st && st.equipment) || {};
    const out = [];
    for (const k of Object.keys(inv)) {
      const count = Number(inv[k]) || 0;
      if (count <= 0) continue;
      const eq = Data.Equipment.byId(k);
      if (!eq || eq.slot !== type) continue;
      out.push({ itemId: k, eq: eq, count: count, name: eq.name });
    }
    // 数值降序：先让玩家看到「更强的」；同值按名字，保证顺序稳定不跳动
    out.sort((a, b) => {
      const na = statNumber(a.eq), nb = statNumber(b.eq);
      if (na != null && nb != null && na !== nb) return nb - na;
      if (na == null && nb != null) return 1;
      if (na != null && nb == null) return -1;
      return String(a.name).localeCompare(String(b.name));
    });
    return out;
  }

  function currentBarHtml(slot) {
    const label = SLOT_CN[slot.type] + " " + (slot.slotIndex + 1) + " · 当前";
    if (!slot.equipment) {
      return '<div class="fo-current is-empty"><span class="fo-cur-label">' + label
        + '</span><span class="fo-cur-main">空槽 · 未安装</span></div>';
    }
    const sub = statSummary(slot.equipment);
    return '<div class="fo-current"><span class="fo-cur-label">' + label + "</span>"
      + '<span class="fo-cur-main">' + equipGlyph(slot.equipment) + " " + esc(slot.equipment.name) + "</span>"
      + (sub ? '<span class="fo-cur-sub">' + esc(sub) + "</span>" : "") + "</div>";
  }

  function optionCardHtml(item, slot) {
    const fitted = slot.equipmentId === item.itemId;
    const delta = statDelta(item.eq, slot.equipment);
    const parts = [];
    const s = statSummary(item.eq);
    if (s) parts.push(esc(s));
    if (delta != null) {
      parts.push('<span class="' + (delta > 0 ? "fo-up" : "fo-down") + '">('
        + (delta > 0 ? "+" : "") + delta + ")</span>");
    }
    const t = tierText(item.eq);
    if (t) parts.push(t);
    return '<button class="fo-opt duo' + (fitted ? " is-fitted" : "") + '" data-equip="' + esc(item.itemId) + '">'
      + '<span class="fo-row1"><span class="fo-ic">' + equipGlyph(item.eq) + "</span>"
      + '<span class="fo-nm">' + esc(item.name) + "</span>"
      + '<span class="fo-badge' + (fitted ? " fitted" : "") + '">' + (fitted ? "已装" : "未装") + "</span>"
      + (item.count > 1 ? '<span class="fo-count">×' + item.count + "</span>" : "")
      + "</span>"
      + '<span class="fo-row2">' + parts.join(' <span class="fo-sep">·</span> ') + "</span>"
      + "</button>";
  }

  function panelHtml(display, slot) {
    const list = candidates(slot.type);
    let html = currentBarHtml(slot);
    if (!list.length) {
      html += '<div class="fo-hint empty">库存里没有「' + SLOT_CN[slot.type]
        + '」装备。前往「舰基」页总装船坞制造。</div>';
    } else {
      for (const item of list) html += optionCardHtml(item, slot);
    }
    if (slot.equipmentId) {
      html += '<button class="fo-opt fo-unequip" data-unfit="1"><span class="fo-ic">○</span>'
        + '<span class="fo-nm">卸下装备</span></button>';
    }
    return html;
  }

  function selectSlot(index, display) {
    const d = display || buildDisplay(state(), openMemberId);
    if (!d) return;
    const slot = d.orbitSlots.find(s => s.index === index);
    if (!slot) return;
    selectedIndex = index;
    const title = el("fitOrbitPanelTitle");
    if (title) title.textContent = SLOT_CN[slot.type] + " · " + (slot.equipmentId ? "更换装备" : "选择装备");
    const box = el("fitOrbitOptions");
    if (box) box.innerHTML = panelHtml(d, slot);
    const panel = el("fitOrbitPanel");
    if (panel) panel.classList.add("active");
    // 重画环，让选中槽高亮（buildOrbit 会读 selectedIndex）
    markSelected(index);
  }

  function markSelected(index) {
    const cssEsc = (typeof window !== "undefined" && window.CSS && CSS.escape) ? CSS.escape(String(index)) : String(index);
    const nodes = document.querySelectorAll("#fitOrbitSvg .slot-segment");
    for (const g of nodes) {
      if (g.getAttribute("data-slot") === cssEsc) g.classList.add("sel");
      else g.classList.remove("sel");
    }
  }

  function hidePanel() {
    selectedIndex = null;
    const panel = el("fitOrbitPanel");
    if (panel) panel.classList.remove("active");
    markSelected(-1);
  }

  // ---------- 已装条 / 统计 ----------
  function renderLibrary(display) {
    const box = el("fitOrbitLib");
    if (!box) return;
    const items = display.orbitSlots.filter(s => s.equipmentId);
    if (!items.length) {
      box.innerHTML = '<span class="fo-lib-item is-empty">暂无装备</span>';
      return;
    }
    box.innerHTML = items.map(s => '<span class="fo-lib-item">' + equipGlyph(s.equipment)
      + " " + esc(s.equipment.name) + '<i>' + SLOT_CN[s.type] + "</i></span>").join("");
  }

  function renderStats(display) {
    const hp = display.member.hp || {};
    const mx = display.maxHp || {};
    const set = (id, v, max) => {
      const node = el(id);
      if (!node) return;
      node.textContent = Math.round(v || 0);
      node.setAttribute("title", max ? ("上限 " + Math.round(max)) : "");
    };
    set("foStatShield", hp.shield, mx.shield);
    set("foStatArmor", hp.armor, mx.armor);
    set("foStatHull", hp.structure, mx.structure);
    const dodgeNode = el("foStatDodge");
    if (dodgeNode) {
      dodgeNode.textContent = (display.def && Number(display.def.dodge)) || 0;
      dodgeNode.setAttribute("title", "回避值：参与命中率结算");
    }
  }

  // ---------- 装配动作（全部走 Engine.Production，不新增任何数值规则）----------
  function currentSlot() {
    const d = buildDisplay(state(), openMemberId);
    if (!d) return null;
    return d.orbitSlots.find(s => s.index === selectedIndex) || null;
  }

  function doFit(itemId) {
    const st = state();
    const d = buildDisplay(st, openMemberId);
    if (!st || !d) return;
    const slot = d.orbitSlots.find(s => s.index === selectedIndex);
    if (!slot) return;
    const P = ns().Engine && ns().Engine.Production;
    if (!P) { toast("装配模块未加载"); return; }
    const cap = slot.cap || 0;
    const arr = (d.member.fitted && d.member.fitted[slot.type]) || [];
    // 槽位满 → 替换末尾一件（本作 fitEquipment 只 append，不认 slotIndex）
    let replaced = null;
    if (arr.length >= cap) {
      replaced = arr[arr.length - 1];
      const r0 = P.unfitEquipment(st, openMemberId, slot.type, replaced);
      if (!r0.ok) { toast(r0.err); return; }
    }
    const res = P.fitEquipment(st, openMemberId, slot.type, itemId);
    if (!res.ok) {
      if (replaced) P.fitEquipment(st, openMemberId, slot.type, replaced);   // 回滚
      toast(res.err);
      return;
    }
    toast("已装配 " + (res.equip ? res.equip.name : itemId) + (replaced ? "（替换旧件已退回仓库）" : ""));
    refresh();
    if (deps.onChanged) deps.onChanged();
  }

  function doUnfit() {
    const st = state();
    const d = buildDisplay(st, openMemberId);
    if (!st || !d) return;
    const slot = d.orbitSlots.find(s => s.index === selectedIndex);
    if (!slot || !slot.equipmentId) { toast("该槽位没有装备"); return; }
    const P = ns().Engine && ns().Engine.Production;
    const res = P.unfitEquipment(st, openMemberId, slot.type, slot.equipmentId);
    if (!res.ok) { toast(res.err); return; }
    toast("已卸下 " + (res.equip ? res.equip.name : "") + "，退回仓库");
    refresh();
    if (deps.onChanged) deps.onChanged();
  }

  function clearAll() {
    const st = state();
    const d = buildDisplay(st, openMemberId);
    if (!st || !d) return;
    const P = ns().Engine && ns().Engine.Production;
    let n = 0;
    for (const slot of d.orbitSlots) {
      if (!slot.equipmentId) continue;
      const res = P.unfitEquipment(st, openMemberId, slot.type, slot.equipmentId);
      if (res.ok) n++;
    }
    toast(n ? ("已卸下全部 " + n + " 件装备，退回仓库") : "没有已装装备");
    hidePanel();
    refresh();
    if (deps.onChanged) deps.onChanged();
  }

  // ---------- 刷新 / 开合 ----------
  function refresh() {
    if (!openMemberId) return;
    const d = buildDisplay(state(), openMemberId);
    if (!d) { close(); return; }
    const title = el("fitOrbitTitle");
    if (title) title.textContent = d.def ? d.def.name : "舰船装配";
    const sub = el("fitOrbitSub");
    if (sub) sub.textContent = subText(d);
    buildOrbit(d);
    renderLibrary(d);
    renderStats(d);
    if (selectedIndex != null) {
      const still = d.orbitSlots.find(s => s.index === selectedIndex);
      if (still) selectSlot(selectedIndex, d); else hidePanel();
    }
  }

  function open(memberId) {
    if (!bound) bind();
    const d = buildDisplay(state(), memberId);
    if (!d) { toast("找不到该舰船的驾驶者"); return; }
    openMemberId = memberId;
    selectedIndex = null;
    const panel = el("fitOrbitPanel");
    if (panel) panel.classList.remove("active");
    const overlay = el("fitOrbitModal");
    if (overlay) {
      overlay.classList.add("active");
      overlay.setAttribute("aria-hidden", "false");
    }
    document.body.style.overflow = "hidden";
    refresh();
  }

  function close() {
    const overlay = el("fitOrbitModal");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.setAttribute("aria-hidden", "true");
    }
    const panel = el("fitOrbitPanel");
    if (panel) panel.classList.remove("active");
    document.body.style.overflow = "";
    openMemberId = null;
    selectedIndex = null;
  }

  function isOpen() {
    const overlay = el("fitOrbitModal");
    return !!(overlay && overlay.classList.contains("active"));
  }

  function bind() {
    if (bound) return;
    bound = true;
    const overlay = el("fitOrbitModal");
    if (overlay) {
      overlay.addEventListener("click", function (ev) {
        if (ev.target.closest(".fo-modal")) return;
        close();
      });
    }
    const x = el("fitOrbitClose"); if (x) x.addEventListener("click", close);
    const px = el("fitOrbitPanelClose"); if (px) px.addEventListener("click", function (ev) { ev.stopPropagation(); hidePanel(); });
    const done = el("fitOrbitDone"); if (done) done.addEventListener("click", close);
    const clear = el("fitOrbitClear"); if (clear) clear.addEventListener("click", clearAll);
    const options = el("fitOrbitOptions");
    if (options) {
      options.addEventListener("click", function (ev) {
        const unfit = ev.target.closest("[data-unfit]");
        if (unfit) { ev.stopPropagation(); doUnfit(); return; }
        const pick = ev.target.closest("[data-equip]");
        if (pick) { ev.stopPropagation(); doFit(pick.getAttribute("data-equip")); }
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" || !isOpen()) return;
      if (selectedIndex != null) hidePanel(); else close();
    });
  }

  function init(options) {
    deps = options || {};
    bind();
  }

  return {
    init, open, close, isOpen, refresh,
    // 暴露给自测探针：纯函数部分可单独验，不必开 DOM
    _buildDisplay: buildDisplay,
    _statSummary: statSummary,
    _statDelta: statDelta,
    _tierText: tierText,
    SLOT_CN, SLOT_TYPES,
  };
});
