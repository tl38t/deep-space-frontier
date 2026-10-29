// ================================================================
// 深空星疆 —— UI.App：主界面框架（PC+手机双端）
// 4Hz 渲染循环（HUD）+ 1Hz 视图刷新；事件委托；手机 ⓘ 浮层（方案 C）。
// 所有渲染走纯函数 view(state) -> HTML，避免 DOM 状态碎片。
// ================================================================
(function () {
  "use strict";
  const NSK = window.NSK;
  const Core = NSK.Core, Data = NSK.Data, Engine = NSK.Engine;
  const Persistence = (NSK.Core && NSK.Core.Persistence) || (typeof window !== "undefined" && window.Persistence) || null;

  const TABS = [
    { id: "starmap", name: "星图" },
    { id: "system", name: "星系" },
    { id: "base", name: "舰基" },
    { id: "warehouse", name: "仓库" },
    { id: "members", name: "成员" },
    { id: "factions", name: "势力" },
    { id: "story", name: "剧情" },
    { id: "report", name: "日报" },
    { id: "settings", name: "设置" },
  ];

  const SKILL_CN = { mining: "采矿", scanning: "扫描", archaeology: "考古", refine: "冶炼", manufacture: "制造", invent: "发明", combatLaser: "激光", combatTurret: "炮台", command: "指挥", defense: "防御" };
  const SKILL_KEYS = Object.keys(SKILL_CN);

  // 增强剂（整舱生效）经济参数（MVP 提议值，待标定）：基础等级 1、持续 10 分钟、消耗星币。
  const BOOSTER_LEVEL = 1;
  const BOOSTER_DURATION = 600;        // 秒（10 分钟）
  const BOOSTER_COST = { credits: 2000 };

  let state = null;
  let tab = "starmap";
  let curSystem = null;      // 星系视图当前选中系统（独立 Tab）
  let baseFocus = "core";   // 舰基可视化当前选中的舱段
  let warehouseFilter = "all"; // 仓库页类别筛选（all/ore/gas/mineral/component/blueprint）
  let whShowEmpty = false;     // 仓库页是否显示空仓条目（默认只看有货的）
  // 星图平移/缩放状态（跨 1Hz 重渲染保持，避免每次重建丢视角）
  // 默认聚焦星图中部，避免整张图被缩成一团；仍可拖拽查看外围星域。
  let mapView = { x: 0, y: 0, scale: 2.3 };
  // 以缩放分层显示标签：概览只突出当前/可达节点，放大后再显示全部已探明节点与星座。
  const NODE_LABEL_SHOW_SCALE = 2.7;
  const CONST_SHOW_SCALE = 3.0;
  let mapDrag = null;
  let suppressClickUntil = 0;
  let _starSig = "";        // 星图视图指纹（避免 207 节点每 1Hz 全量重建 SVG）
  let _starCache = "";
  let _lastViewHtml = "";   // 上一帧视图 HTML，内容未变则跳过 innerHTML 重设
  const $view = document.getElementById("nsk-view");
  const $hud = document.getElementById("nsk-hud");
  const $tabs = document.getElementById("nsk-tabs");
  const $pop = document.getElementById("nsk-pop");
  const $nodePop = document.getElementById("nsk-nodepop");   // 星图节点操作浮层（查看 / 跃迁）
  const $actDrawer = document.getElementById("nsk-activity"); // 右上角「成员动态」侧边抽屉

  // ---------- 工具 ----------
  function fmt(n) { return Core.fmtNum(Math.floor(n * 100) / 100); }
  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
  function resName(id) { const m = Data.Resources.meta(id); return m ? m.name : id; }
  // 富文本图标：注册了 WebP 图标的资源（矿石/矿材）用 <img>，其余回退 emoji
  function resIcon(id) {
    const m = Data.Resources.meta(id); if (!m) return "•";
    return m.img ? '<img class="res-img" src="' + m.img + '" alt="' + esc(m.name) + '" draggable="false">' : m.icon;
  }
  // 纯文本图标（<option> 内只能放文字，用 emoji）
  function resIconTxt(id) { const m = Data.Resources.meta(id); return m ? m.icon : "•"; }
  // 追加一条日报（标题 + 行），封顶 30 条，新的在前
  function pushReport(title, lines) {
    if (!state.reports) state.reports = [];
    state.reports.unshift({ ts: Date.now(), title: title, lines: Array.isArray(lines) ? lines : [lines] });
    if (state.reports.length > 30) state.reports.length = 30;
  }

  // 资源 chips（HUD）—— 顶部只常驻星币与跃迁燃料，其余物资收进仓库页
  function renderHUD() {
    const order = ["credits", "fuel"];
    let inner = '<span class="brand">🌌 深空星疆</span>';
    for (const k of order) {
      const meta = Data.Resources.meta(k);
      inner += '<span class="res" title="' + esc(meta.name) + '">' + meta.icon + " <b>" + fmt(state.res[k] || 0) + "</b></span>";
    }
    // 在勤成员数（有派遣任务）= 实时红点提示，点开抽屉看每个人在干什么
    const busy = state.members.filter(m => !m.destroyed && m.assignment).length;
    $hud.innerHTML =
      '<div class="hud-scroll">' + inner + "</div>" +
      '<button class="hud-act-btn" data-act="openSettings" title="设置 · 存档" aria-label="设置">⚙</button>' +
      '<button class="hud-act-btn" data-act="toggleActivity" title="成员动态 · 他们在干什么" aria-label="成员动态">👥' +
      (busy ? '<span class="hud-badge">' + busy + "</span>" : "") + "</button>";
  }

  // 成员当前活动（用于「成员动态」抽屉与 HUD 红点）
  function memberActivity(m) {
    if (m.destroyed) return { label: "阵亡", detail: "", cls: "bad" };
    const a = m.assignment;
    if (!a) return { label: "待命", detail: "舰基待命", cls: "" };
    const node = a.nodeId ? Data.StarMap.nodeById(state.starMap, a.nodeId) : null;
    const loc = node ? "于 " + node.name : "";
    const map = {
      mine:    { label: "采矿中", detail: loc, cls: "good" },
      explore: { label: "探索中", detail: loc, cls: "good" },
      combat:  { label: "作战中", detail: loc, cls: "warn" },
      train:   { label: "演训中", detail: "舰基演训", cls: "good" },
    };
    return map[a.type] || { label: jobName(a.type), detail: loc, cls: "good" };
  }

  // 成员动态抽屉：右上角按钮点开后从右侧滑入，列出每个人在干什么
  function renderActivityDrawer() {
    if (!$actDrawer) return;
    const ms = state.members;
    const busy = ms.filter(m => !m.destroyed && m.assignment).length;
    const idle = ms.filter(m => !m.destroyed && !m.assignment).length;
    let html = '<div class="act-head"><b>成员动态</b>'
      + '<span class="act-sum dim">在勤 ' + busy + " · 待命 " + idle + "</span>"
      + '<button class="act-close" data-act="toggleActivity" aria-label="关闭">✕</button></div>';
    html += '<div class="act-list">';
    if (!ms.length) html += '<div class="dim act-empty">尚无成员。去「成员」页招募。</div>';
    for (const m of ms) {
      const pers = Data.Names.personalityById(m.personalityId);
      const ship = Data.Ships.shipById(m.shipId);
      const act = memberActivity(m);
      html += '<div class="act-row click" data-act="npc:' + m.id + '" title="查看 ' + esc(m.name) + ' 详情">'
        + '<div class="act-row-top"><span class="act-name">' + esc(m.name) + '</span>'
        + '<span class="tag ' + act.cls + '">' + act.label + "</span></div>"
        + '<div class="act-row-sub dim">' + (pers ? esc(pers.name) : "") + " · " + (ship ? esc(ship.name) : "—")
        + (act.detail ? " · " + esc(act.detail) : "") + "</div></div>";
    }
    html += "</div>";
    const prev = $actDrawer.scrollTop;
    $actDrawer.innerHTML = html;
    $actDrawer.scrollTop = prev;
  }
  function openActivityDrawer() { renderActivityDrawer(); $actDrawer.classList.add("show"); }
  function hideActivityDrawer() { $actDrawer.classList.remove("show"); }
  function toggleActivityDrawer() { if ($actDrawer.classList.contains("show")) hideActivityDrawer(); else openActivityDrawer(); }

  // ---------- 各视图 ----------
  function catColor(c) { return { top: "#d4a843", ore: "#4fb0ff", gas: "#4fd0c0", mineral: "#e8b45a", component: "#9b8cff", blueprint: "#5ad1a0", other: "#8b96b8" }[c] || "#8b96b8"; }

  function viewStarMap() {
    const map = state.starMap;
    // 视图指纹只跟「当前节点 / 已探明数」走。燃料有 HUD 实时显示，不放进指纹，
    // 否则燃料后台回复会让 207 节点 SVG 每秒整图重建（视觉刷新/脉冲重播）。
    const sig = state.base.nodeId + "#" + map.discovered.length;
    if (sig === _starSig) return _starCache;
    _starSig = sig;
    const cur = state.base.nodeId;
    const curNode = Data.StarMap.nodeById(map, cur);
    const adj = Data.StarMap.adjacency(map);
    const neighbours = (adj[cur] || []).map(e => ({ node: Data.StarMap.nodeById(map, e.to), fuelCost: e.fuelCost }));
    const reachIds = new Set(neighbours.filter(nb => nb.node && state.base.fuel >= nb.fuelCost).map(nb => nb.node.id));
    // 星图展示坐标：把九个星域排成疏朗的星区阵列，保留每个星域内部的相对布局。
    // 只用于绘制，不改存档坐标或航线数据，因此旧存档也会立即采用新布局。
    const regionAnchors = [
      { x: 2300, y: 1600 }, { x: 3100, y: 1000 }, { x: 1500, y: 1000 },
      { x: 1500, y: 2200 }, { x: 3100, y: 2200 }, { x: 450, y: 1600 },
      { x: 4150, y: 1600 }, { x: 2300, y: 300 }, { x: 2300, y: 2900 },
    ];
    const sourceRegionById = {};
    for (const r of (map.regions || [])) sourceRegionById[r.id] = r;
    const anchorByRegionId = {};
    const displayRegions = (map.regions || []).map((r, i) => {
      const match = /region_(\d+)/.exec(r.id || "");
      const anchor = regionAnchors[match ? Number(match[1]) : i] || { x: r.cx, y: r.cy };
      anchorByRegionId[r.id] = anchor;
      return { ...r, cx: anchor.x, cy: anchor.y };
    });
    const displayNodes = map.nodes.map(n => {
      const source = sourceRegionById[n.region], anchor = anchorByRegionId[n.region];
      return source && anchor ? { ...n, x: anchor.x + n.x - source.cx, y: anchor.y + n.y - source.cy } : n;
    });
    const displayNodeById = {};
    for (const n of displayNodes) displayNodeById[n.id] = n;
    const displayConstellations = (map.constellations || []).map(c => {
      const source = sourceRegionById[c.regionId], anchor = anchorByRegionId[c.regionId];
      return source && anchor ? { ...c, cx: anchor.x + c.cx - source.cx, cy: anchor.y + c.cy - source.cy } : c;
    });
    const regionById = {}; for (const r of displayRegions) regionById[r.id] = r;
    const boundsPoints = displayNodes.concat(displayRegions, displayConstellations).map(p => ({
      x: typeof p.x === "number" ? p.x : p.cx,
      y: typeof p.y === "number" ? p.y : p.cy,
    }));
    const pad = 180;
    const minX = boundsPoints.length ? Math.min(...boundsPoints.map(p => p.x)) - pad : 0;
    const minY = boundsPoints.length ? Math.min(...boundsPoints.map(p => p.y)) - pad : 0;
    const W = boundsPoints.length ? Math.max(...boundsPoints.map(p => p.x)) - minX + pad : (map.width || 1600);
    const H = boundsPoints.length ? Math.max(...boundsPoints.map(p => p.y)) - minY + pad : (map.height || 1100);
    const dx = -minX, dy = -minY;
    for (const r of displayRegions) { r.cx += dx; r.cy += dy; }
    for (const c of displayConstellations) { c.cx += dx; c.cy += dy; }
    for (const n of displayNodes) { n.x += dx; n.y += dy; }
    const regColor = id => (regionById[id] || { color: "#5ad1a0" }).color;

    let html = "<h2>星图 · 当前舰基位于「" + esc(curNode.name) + "」</h2>";
    html += '<div class="panel map-hint"><span class="dim">跃迁燃料 <b>' + fmt(state.base.fuel) + " / " + state.base.fuelMax +
      '</b></span><span class="dim">拖拽平移 · 滚轮缩放 · 点星系弹出查看 / 跃迁</span></div>';

    // 空间星图（SVG viewBox 自适应；pan/zoom 由 UI 层 transform 控制）
    html += '<div class="starmap-wrap" id="nsk-map"><div class="starmap-canvas" id="nsk-map-canvas"><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet">';
    // 连边：按区域色淡描；区域间长途星门略亮（不画领地圆盘，边界靠密度+色融合）
    for (const e of map.edges) {
      const a = displayNodeById[e.from], b = displayNodeById[e.to];
      const act = (e.from === cur || e.to === cur) ? " edge act" : "";
      const kc = e.kind === "choke" ? " choke" : (e.kind === "bridge" ? " bridge" : "");
      const stroke = e.kind === "choke" ? "#dfe8f5" : regColor(a.region);
      html += '<line class="edge' + act + kc + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + stroke + '" />';
    }
    // 区域漂浮文字标签（EVE 式：以文字标识区域，无边界圈）
    for (const r of displayRegions) {
      html += '<text class="region-label" x="' + r.cx + '" y="' + r.cy + '" fill="' + r.color + '">' + esc(r.name) + '</text>';
    }
    // 星座文字标签（缩放可见：地图放大到一定倍率才显形，避免与星域名挤在一起）
    for (const con of displayConstellations) {
      const col = regColor(con.regionId);
      html += '<text class="constellation-label" x="' + con.cx + '" y="' + con.cy + '" fill="' + col + '">' + esc(con.name) + '</text>';
    }
    // 节点：已探明按星域着色；未探明雾灰；试玩锁定(stage≥2)区域灰显 + 「后续版本开放」
    for (const n of displayNodes) {
      const isCur = n.id === cur;
      const isReach = reachIds.has(n.id);
      const locked = n.trialOpen === false;  // MVP 试玩门禁：stage≥2 区域不可达
      const cls = "node" + (isCur ? " cur" : "") + (n.discovered ? "" : " hid") + (isReach && !locked ? " reach" : "") + (locked ? " locked" : "");
      const r = isCur ? 19 : 13;
      const fill = !n.discovered ? "#23344a" : (locked ? "#39404e" : regColor(n.region));
      // 已探明且未锁定节点可点弹查看；锁定节点不可点
      const actAttr = (n.discovered && !locked) ? ' data-act="nodeinfo:' + n.id + '"' : "";
      html += '<g class="' + cls + '"' + actAttr + ' transform="translate(' + n.x + "," + n.y + ')">';
      html += '<circle r="' + r + '" fill="' + fill + '" />';
      if (isCur) html += '<circle class="pulse" r="' + r + '" />';
      // 未探明只留雾点（不写文字，避免「?」铺屏）；已探明才标注名称
      if (n.discovered) {
        html += '<text class="nlabel" y="' + (r + 22) + '">' + esc(n.name) + "</text>";
        if (locked) html += '<text class="nlock" y="' + (r + 40) + '">后续版本开放</text>';
      } else if (locked) {
        html += '<text class="nlabel nlock" y="' + (r + 22) + '">🔒 锁定</text>';
      }
      html += "</g>";
    }
    html += "</svg></div></div>";

    // 星域图例（领地一览 + 进度档 / EVE 式安全等级分档 / 剿匪倍率 / 主导海盗）
    if (map.regions && map.regions.length) {
      html += "<h3>星域（" + map.regions.length + "）</h3><div class='grid region-legend'>";
      for (const r of map.regions) {
        const cnt = map.nodes.filter(n => n.region === r.id).length;
        const disc = map.nodes.filter(n => n.region === r.id && n.discovered).length;
        const home = r.id === (Data.StarMap.nodeById(map, map.startId) || {}).region ? ' <span class="tag good">起</span>' : "";
        const pf = (Data.Factions && Data.Factions.factionById) ? Data.Factions.factionById(r.pirate) : null;
        const sl = r.secLevel || "1.0-0.8";
        const slp = (Data.StarMap.SECLEVEL_TABLE && Data.StarMap.SECLEVEL_TABLE[sl]) || { name: "高安", iskMult: 1, requiredCL: 1 };
        const stageTag = r.stage === 3 ? "后期" : r.stage === 2 ? "中期" : "初期";
        const secCls = (sl === "1.0-0.8" || sl === "0.7-0.5") ? "good" : (sl === "0.4-0.3") ? "warn" : "bad";
        html += '<div class="region-chip">'
          + '<div class="rc-top"><span class="sw" style="background:' + r.color + '"></span><b>' + esc(r.name) + "</b>" + home
          + '<span class="rc-prog">' + disc + "/" + cnt + "</span></div>"
          + '<div class="rc-tags">'
          + '<span class="tag">' + stageTag + "</span>"
          + '<span class="tag ' + secCls + '">安 ' + sl + " · " + slp.name + "</span>"
          + '<span class="tag">剿匪×' + slp.iskMult + "</span>"
          + (pf ? '<span class="tag" style="color:' + pf.color + '">海盗·' + esc(pf.name) + "</span>" : "")
          + (r.trialOpen === false ? '<span class="tag bad">🔒 试玩锁定</span>' : "")
          + "</div></div>";
      }
      html += "</div>";
    }

    // 可直达节点（可操作，手机端友好）
    html += "<h3>可直达节点（点击跃迁）</h3><div class='panel'>";
    for (const nb of neighbours) {
      const n = nb.node; if (!n) continue;
      const locked = n.trialOpen === false;  // 试玩锁定区域不可跃迁抵达
      const can = !locked && state.base.fuel >= nb.fuelCost;
      const choke = nb.fuelCost >= 8 ? ' <span class="tag warn">咽喉</span>' : "";
      const lockTag = locked ? ' <span class="tag bad">🔒 锁定</span>' : "";
      html += '<div class="row"><span>' + esc(n.name) +
        (n.discovered ? "" : '<span class="tag warn">未探明</span>') + choke + lockTag + "</span>" +
        '<button class="sm" data-act="move:' + n.id + '"' + (can ? "" : " disabled") + ">跃迁 ⛽" + nb.fuelCost + "</button></div>";
    }
    html += "</div>";

    // 已探明节点（丰度参考）
    html += "<h3>已探明节点（" + map.discovered.length + "/" + map.nodes.length + "）</h3><div class='grid'>";
    for (const n of map.nodes.filter(x => x.discovered)) {
      const ab = Object.entries(n.abundance).map(([o, v]) =>
        '<span class="tag ' + (v > 1 ? "good" : "") + '">' + resIcon(o) + resName(o) + " ×" + v.toFixed(1) + "</span>").join("");
      html += '<div class="node-card' + (n.id === cur ? " cur" : "") + '"><div class="row"><b>' + esc(n.name) + '</b></div>' +
        '<div class="dim">丰度（' + (n.id === cur ? "当前作业点" : "可派遣采矿") + "）</div><div>" + ab + "</div>" +
        '<div class="row"><button class="sm" data-act="sys:' + n.id + '">查看星系</button></div></div>';
    }
    html += "</div>";
    _starCache = html;
    return html;
  }

  // ---------- 星系视图（独立 Tab）：SVG 显示当前星系的天体，点天体派遣 ----------
  function kindCN(k) { return { star: "主星", belt: "小行星带", gas: "气云", planet: "行星", derelict: "残骸场", station: "空间站" }[k] || k; }
  function kindColor(k) { return { star: "#ffd27a", belt: "#caa46a", gas: "#9be8ff", planet: "#5fb8ff", derelict: "#e879a8", station: "#5ad1a0" }[k] || "#889"; }
  // 行星类型 → 中文（与 resources.js PLANET.planetType 对应）
  function planetTypeName(t) { return { lava: "熔岩", gas: "气态", ice: "冰", plasma: "等离子", temperate: "温带", storm: "风暴" }[t] || t; }
  function planetProductName(t) { const m = (t && Data.Resources) ? Data.Resources.meta("planet_" + t) : null; return m ? m.name : null; }
  function topSkill(m) { let best = SKILL_KEYS[0]; for (const k of SKILL_KEYS) if (Engine.Settle.levelOf(m.skills[k]) > Engine.Settle.levelOf(m.skills[best])) best = k; return best; }
  function bodyActs(k) {
    return k === "belt" ? [{ type: "mine", label: "采矿" }]
      : k === "gas" ? [{ type: "mine", label: "采集气云" }]
      : k === "planet" ? [{ type: "explore", label: "勘探" }]   // 行星产出走「采集装置」（Engine.Sites），成员不再驻留
      : k === "derelict" ? [{ type: "explore", label: "考古" }]
      : [];   // station 为工业/势力锚点，后续接入冶炼制造
  }

  // 某天体的在岗成员：按 assignment.nodeId + bodyId 精确匹配（bodyId=null = 本星系未指定天体）。
  // 物流岗在母舰作业，不落到天体上，排除。
  function bodyWorkers(nodeId, bodyId) {
    const out = [];
    const want = bodyId || null;
    for (const m of state.members) {
      if (m.destroyed || !m.assignment) continue;
      const a = m.assignment;
      if (a.nodeId !== nodeId) continue;
      if ((a.bodyId || null) !== want) continue;
      if (a.type === "logistics") continue;
      out.push(m);
    }
    return out;
  }

  function viewSystem() {
    // 由 body id 派生的确定性伪随机（保证碎石带每次渲染一致、可复现）
    function beltRng(id) {
      let h = 2166136261;
      for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
      return function () { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    // 标签点击热区：`.sys-label` 是 pointer-events:none 的（避免文字挡住天体），
    // 真实点击会穿透到 SVG 画布 → 「点小行星带的名字」完全没反应。
    // 方案：在文字下方垫一块透明 rect，命中后冒泡到父级 <g data-act>，文字仍不拦截别的天体。
    function labelHitRect(name, cx, baselineY, fontSize) {
      const fs = fontSize || 9;
      const txt = String(name || "");
      const w = Math.max(fs * 2.6, txt.length * fs * 1.02 + fs * 1.4);
      const h = fs * 1.9;
      return '<rect class="hit-rect" x="' + (cx - w / 2).toFixed(1) + '" y="' + (baselineY - h * 0.78).toFixed(1) +
        '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="transparent"/>';
    }
    // 天体在岗徽章：形如「⛏2」，hover 出名单（手机端看下面的卡片名单）。
    function workerBadge(cx, y, workers) {
      if (!workers || !workers.length) return "";
      const txt = "⛏" + workers.length;
      const w = 26, h = 13;
      const tip = workers.map(m => m.name + "（" + jobName(m.assignment.type) + "）").join("、");
      return '<g class="sys-worker"><title>' + esc(tip) + "</title>"
        + '<rect x="' + (cx - w / 2) + '" y="' + (y - h) + '" width="' + w + '" height="' + h + '" rx="6.5" fill="rgba(90,209,160,.20)" stroke="rgba(90,209,160,.7)" stroke-width="1"/>'
        + '<text class="sys-worker-t" x="' + cx + '" y="' + (y - 3.5) + '" text-anchor="middle">' + txt + "</text></g>";
    }
    if (!curSystem) curSystem = state.base.nodeId;
    const node = Data.StarMap.nodeById(state.starMap, curSystem) || Data.StarMap.nodeById(state.starMap, state.base.nodeId);
    const bodies = node.bodies || [];
    const opts = state.starMap.nodes.filter(n => n.discovered)
      .map(n => '<option value="' + n.id + '"' + (n.id === node.id ? " selected" : "") + ">" + esc(n.name) + "</option>").join("");
    let html = "<h2>星系视图 · " + esc(node.name) + "</h2>";
    html += '<div class="panel map-hint"><span class="dim">选择星系</span>' +
      '<select class="sys-sel">' + opts + "</select>" +
      '<span class="dim">' + (node.discovered ? "已探明" : "未探明") + "</span></div>";
    // 当前星域威胁（EVE 式安全等级分档 + 主导海盗）——星带/死亡空间风险总览
    const _reg = (state.starMap.regions || []).find(r => r.id === node.region) || null;
    if (_reg) {
      const _pf = (Data.Factions && Data.Factions.factionById) ? Data.Factions.factionById(_reg.pirate) : null;
      const _sl = _reg.secLevel || "1.0-0.8";
      const _slp = (Data.StarMap.SECLEVEL_TABLE && Data.StarMap.SECLEVEL_TABLE[_sl]) || { name: "高安", iskMult: 1, repMult: 1, requiredCL: 1 };
      const _stageTag = _reg.stage === 3 ? "后期星域" : _reg.stage === 2 ? "中期星域" : "初期星域";
      const _secCls = (_sl === "1.0-0.8" || _sl === "0.7-0.5") ? "good" : (_sl === "0.4-0.3") ? "warn" : "bad";
      html += '<div class="panel map-hint"><span class="dim">所属</span><b>' + esc(_reg.name) + "</b>" +
        '<span class="tag">' + _stageTag + "</span>" +
        '<span class="tag ' + _secCls + '>安全 ' + _sl + " · " + _slp.name + "</span>" +
        '<span class="tag">推荐战斗等级 ' + _slp.requiredCL + "</span>" +
        (_pf ? '<span class="tag" style="color:' + _pf.color + '">海盗·' + esc(_pf.name) + "</span>" : "") +
        '<span class="dim">安全越低，海盗战力越高、剿匪赏金越丰</span></div>';
    }

    // SVG 星系图（中央恒星 + 环绕天体，按种类配色；可点击派遣）
    html += '<div class="system-wrap"><svg class="sys-svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">';
    for (const b of bodies) if (b.orbit > 0) html += '<circle cx="200" cy="200" r="' + b.orbit + '" class="orbit"/>';
    for (const b of bodies) {
      const col = kindColor(b.kind);
      if (b.kind === "belt") {
        // 小行星带 = 环绕恒星的环状碎石带（不是单个圆）。沿轨道半径散布 N 颗小碎石，确定性布点。
        const br0 = beltRng(b.id);
        const N = 26, halfW = Math.max(8, b.size * 0.6);
        const act0 = ' data-act="body:' + node.id + ":" + b.id + '"';
        let peb = "";
        for (let i = 0; i < N; i++) {
          const a = (i / N) * 360 + br0() * 12;                          // 沿环均匀分布 + 相位抖动
          const rad = b.orbit + (br0() - 0.5) * 2 * halfW;               // 径向厚度抖动
          const px = (200 + rad * Math.cos(a * Math.PI / 180)).toFixed(1);
          const py = (200 + rad * Math.sin(a * Math.PI / 180)).toFixed(1);
          const pr = (1.0 + br0() * 1.6).toFixed(1);
          peb += '<circle cx="' + px + '" cy="' + py + '" r="' + pr + '" fill="' + col + '" opacity="' + (0.45 + br0() * 0.45).toFixed(2) + '"/>';
        }
        html += '<g class="sys-body belt click"' + act0 + '>'
          + '<circle class="belt-hit" cx="200" cy="200" r="' + b.orbit + '" fill="none" stroke="transparent" stroke-width="' + (halfW * 2 + 26) + '"/>'
          + peb
          + labelHitRect(b.name, 200, 200 - b.orbit - halfW - 4)
          + workerBadge(200, 200 - b.orbit - halfW - 17, bodyWorkers(node.id, b.id))
          + '<text class="sys-label" x="200" y="' + (200 - b.orbit - halfW - 4) + '" text-anchor="middle">' + esc(b.name) + "</text></g>";
        continue;
      }
      if (b.kind === "gas") {
        // 气云 = 轨道上某处的弥散气体云团（蓬松叠加，非实心球、非环形）
        const gr0 = beltRng(b.id);
        const gx = 200 + b.orbit * Math.cos(b.ang * Math.PI / 180);
        const gy = 200 + b.orbit * Math.sin(b.ang * Math.PI / 180);
        const act0 = ' data-act="body:' + node.id + ":" + b.id + '"';
        let puff = "";
        const NP = 7;
        for (let i = 0; i < NP; i++) {
          const a = gr0() * 360, rr = 6 + gr0() * 16;
          const px = (gx + rr * Math.cos(a * Math.PI / 180)).toFixed(1);
          const py = (gy + rr * Math.sin(a * Math.PI / 180)).toFixed(1);
          const pr = (10 + gr0() * 12).toFixed(1);
          puff += '<circle cx="' + px + '" cy="' + py + '" r="' + pr + '" fill="' + col + '" opacity="' + (0.12 + gr0() * 0.12).toFixed(2) + '"/>';
        }
        html += '<g class="sys-body gas click"' + act0 + '>'
          + '<circle class="gas-hit" cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="' + (b.size + 10) + '" fill="transparent"/>'
          + puff
          + labelHitRect(b.name, gx, gy + b.size + 18)
          + workerBadge(gx, gy + b.size + 35, bodyWorkers(node.id, b.id))
          + '<text class="sys-label" x="' + gx.toFixed(1) + '" y="' + (gy + b.size + 18).toFixed(1) + '" text-anchor="middle">' + esc(b.name) + "</text></g>";
        continue;
      }
      const x = (200 + b.orbit * Math.cos(b.ang * Math.PI / 180)).toFixed(1);
      const y = (200 + b.orbit * Math.sin(b.ang * Math.PI / 180)).toFixed(1);
      const clickable = (b.kind === "planet" || b.kind === "derelict");
      const act = clickable ? ' data-act="body:' + node.id + ":" + b.id + '"' : "";
      html += '<g class="sys-body ' + b.kind + (clickable ? " click" : "") + '"' + act + ' transform="translate(' + x + "," + y + ')">';
      html += '<circle r="' + b.size + '" fill="' + col + '" />';
      if (b.kind === "star") html += '<circle class="star-glow" r="' + b.size + '" fill="' + col + '" />';
      if (clickable) html += labelHitRect(b.name, 0, b.size + 13);   // 名字也可点（行星/残骸）
      html += '<text class="sys-label" y="' + (b.size + 13) + '">' + esc(b.name) + "</text>";
      html += workerBadge(0, -b.size - 3, bodyWorkers(node.id, b.id));   // 天体上方在岗徽章
      html += "</g>";
    }
    html += "</svg></div>";

    // 本星系在岗汇总（含未指定天体的派遣，例如成员页直接点「采矿」）
    const sysWorkers = state.members.filter(m => !m.destroyed && m.assignment && m.assignment.nodeId === node.id && m.assignment.type !== "logistics");
    if (sysWorkers.length) {
      html += '<div class="panel sys-workers"><div class="row"><b>本星系在岗 ' + sysWorkers.length + ' 人</b>'
        + '<span class="tag good">⛏ 地图上的徽章 = 该天体在岗人数</span></div>'
        + '<div class="dim">' + sysWorkers.map(m => esc(m.name) + "（" + jobName(m.assignment.type)
          + (m.assignment.bodyId ? "" : " · 未指定天体") + "）").join("、") + "</div></div>";
    }

    // 天体卡（手机/精确操作）
    html += "<h3>天体（点击派遣）</h3><div class='grid body-grid'>";
    for (const b of bodies) {
      const acts = bodyActs(b.kind);
      const actHtml = acts.length
        ? acts.map(a => '<button class="sm" data-act="assignBody:' + node.id + ":" + b.id + ":" + a.type + '">' + a.label + "</button>").join(" ")
        : '<span class="dim">工业/势力锚点（后续接入）</span>';
      let sub = "";
      if (b.kind === "belt" || b.kind === "gas") sub = Object.entries(b.abundance || {}).map(([o, v]) =>
        '<span class="tag ' + (v > 1 ? "good" : "") + '">' + resIcon(o) + resName(o) + " ×" + v.toFixed(1) + "</span>").join("");
      else if (b.kind === "station") sub = "冶炼 / 制造锚点";
      else if (b.kind === "derelict") sub = "考古目标";
      else if (b.kind === "planet") sub = "行星 · " + planetTypeName(b.planetType) + "型" + (planetProductName(b.planetType) ? " → " + planetProductName(b.planetType) : "");
      html += '<div class="node-card click" data-act="body:' + node.id + ":" + b.id + '"><div class="row"><b>' + esc(b.name) + '</b><span class="tag" style="color:' + colOf2(b.kind) + '">' + kindCN(b.kind) + "</span></div>" +
        '<div class="dim">' + sub + "</div>" +
        (function () {
          const wk = bodyWorkers(node.id, b.id);
          const site = (Engine.Sites && b.kind === "planet") ? Engine.Sites.byBody(state, b.id) : null;
          const siteLine = site ? '<div class="dim">💠 采集装置 Lv' + site.level + " · 缓冲 " + fmt(Math.floor(site.buffer || 0)) + "</div>" : "";
          return siteLine + (wk.length
            ? '<div class="dim wk-line">⛏ 在岗：' + wk.map(m => esc(m.name) + "（" + jobName(m.assignment.type) + "）").join("、") + "</div>"
            : (site ? "" : '<div class="dim">无人驻守</div>'));
        })() +
        "<div class='row'>" + actHtml + "</div></div>";
    }
    html += "</div>";
    // 海盗据点 · 剿匪（玩家自行组建小队，复用 EVE-IDLE createDefaultSquad / 容量门禁）
    html += viewPirateRaid(node);
    return html;
  }
  function colOf2(k) { return kindColor(k); }

  // 星系海盗据点 + 剿匪小队管理面板
  function viewPirateRaid(node) {
    const raid = Data.StarMap.pirateRaid(state.starMap, node.id);
    if (!raid) return "";
    const pf = (Data.Factions && Data.Factions.factionById) ? Data.Factions.factionById(raid.faction) : null;
    const cap = Engine.Combat.getSquadCapacity(state);
    const deployedHere = state.squad && state.squad.enabled && state.squad.targetId === node.id;
    // 小队战力（部署到本星系时的总三武器等级；O(1)）
    let sp = 0;
    for (const id of (state.squad.members || [])) {
      const m = state.members.find(x => x.id === id);
      if (m && !m.destroyed) sp += Engine.Settle.levelOf(m.skills.combatLaser) + Engine.Settle.levelOf(m.skills.combatTurret) + Engine.Settle.levelOf(m.skills.command);
    }
    const eff = Math.max(0.2, Math.min(2.5, raid.piratePower > 0 ? sp / raid.piratePower : 1));
    const avgCL = (state.squad.members && state.squad.members.length) ? sp / state.squad.members.length : 0;
    const underCL = avgCL < raid.requiredCL ? '<span class="tag bad">低于推荐等级 · 效率×0.5</span>' : "";
    let html = "<h3>海盗据点 · 剿匪</h3><div class='panel squad-panel'>";
    html += '<div class="row"><b>' + (pf ? esc(pf.name) : raid.faction) + " 劫掠者</b>" +
      '<span class="tag">安全 ' + raid.secLevel + " · " + raid.secName + "</span>" +
      '<span class="tag">推荐战斗等级 ' + raid.requiredCL + "</span>" +
      '<span class="tag">海盗战力 ' + raid.piratePower + "</span></div>";
    html += '<div class="row dim">赏金 ×' + raid.iskMult + "　声望 ×" + raid.repMult +
      "　小队战力 " + sp + "　预估效率 ×" + eff.toFixed(2) + "　" + underCL + "</div>";
    // 小队名册
    const inSquad = (state.squad.members || []).map(id => state.members.find(m => m.id === id)).filter(Boolean);
    html += '<div class="squad-roster">';
    if (inSquad.length) {
      for (const m of inSquad) {
        const cl = Engine.Settle.levelOf(m.skills.combatLaser) + Engine.Settle.levelOf(m.skills.combatTurret) + Engine.Settle.levelOf(m.skills.command);
        html += '<div class="row"><span>' + esc(m.name) + ' <span class="dim">战力 ' + cl + "</span></span>" +
          '<button class="sm ghost" data-act="squadRemove:' + m.id + '">退出</button></div>';
      }
    } else html += '<div class="dim">小队为空，从下方空闲成员中加入。</div>';
    html += "</div>";
    // 候选空闲成员
    const idle = state.members.filter(m => m.status === "idle" && !m.destroyed && !(state.squad.members || []).includes(m.id));
    if (idle.length) {
      html += '<div class="dim">空闲成员（容量 ' + inSquad.length + "/" + cap + "）：</div><div class='squad-roster'>";
      for (const m of idle) {
        const cl = Engine.Settle.levelOf(m.skills.combatLaser) + Engine.Settle.levelOf(m.skills.combatTurret) + Engine.Settle.levelOf(m.skills.command);
        const full = inSquad.length >= cap;
        html += '<div class="row"><span>' + esc(m.name) + ' <span class="dim">战力 ' + cl + "</span></span>" +
          '<button class="sm" data-act="squadAdd:' + m.id + '"' + (full ? " disabled" : "") + ">加入</button></div>";
      }
      html += "</div>";
    }
    // 出击 / 召回 / 升级
    html += '<div class="row" style="margin-top:6px">';
    if (deployedHere) html += '<button class="sm" data-act="squadRecall">召回小队</button>';
    else html += '<button class="sm" data-act="squadDeploy:' + node.id + '"' + (inSquad.length ? "" : " disabled") + ">派遣小队剿匪</button>";
    const tier = state.base.squadTier || 0;
    if (tier < 2) {
      const cost = tier === 0 ? 5000 : 25000;
      const can = (state.res.credits || 0) >= cost;
      html += '<button class="sm ghost" data-act="squadUpgrade"' + (can ? "" : " disabled") + ">升级小队协议 Lv" + (tier + 1) + " · " + cost + "⛁</button>";
    } else html += '<span class="tag good">小队协议已满</span>';
    html += "</div></div>";
    return html;
  }

  // 天体详情 popover（含选人派遣）
  function showBody(nodeId, bodyId) {
    const node = Data.StarMap.nodeById(state.starMap, nodeId);
    if (!node) return;
    const body = (node.bodies || []).find(b => b.id === bodyId);
    if (!body) return;
    const acts = bodyActs(body.kind);
    let html = '<div class="pop-body"><h3>' + esc(body.name) + ' <span class="tag">' + kindCN(body.kind) + "</span></h3>";
    html += '<div class="dim">所属星系：' + esc(node.name) + "</div>";
    if (body.kind === "belt") html += '<div>可采矿种：' + Object.entries(body.abundance || {}).map(([o, v]) =>
      '<span class="tag ' + (v > 1 ? "good" : "") + '">' + resIcon(o) + resName(o) + " ×" + v.toFixed(1) + "</span>").join("") + "</div>";
    else if (body.kind === "station") html += '<div class="dim">势力 / 工业锚点：冶炼、制造将在此接入。</div>';
    else if (body.kind === "derelict") html += '<div class="dim">考古目标：派遣「考古」稳定涨 archaeology 经验。</div>';
    else if (body.kind === "planet") {
      const pt = body.planetType;
      const prod = planetProductName(pt);
      html += '<div>行星类型：<b>' + planetTypeName(pt) + "型</b>" + (prod ? "　产物：" + prod : "") + "</div>";
      // EVE 式采集设施（Engine.Sites）：部署 → 产缓冲 → 回星系回收 / 物流岗自动回收
      const S = Engine.Sites || null;
      const site = S ? S.byBody(state, bodyId) : null;
      if (!S) {
        html += '<div class="dim">采集设施模块未加载。</div>';
      } else if (!site) {
        const chk = S.canDeploy(state, nodeId, bodyId);
        const slotsLeft = S.slots(state) - Object.keys(state.sites || {}).length;
        html += '<div class="dim">部署「采集装置」后持续产出 ' + (prod || "产物") + '，累积到行星缓冲（上限 = 产率 × ' + S.BUFFER_HOURS + "h，溢出浪费）；回本星系回收，或派物流岗自动回收。</div>";
        html += '<div class="dim">装置槽剩余 <b>' + slotsLeft + " / " + S.slots(state) + '</b>（随舰基核心等级扩展）</div>';
        html += '<div class="row"><button class="sm" data-act="site_deploy:' + nodeId + ":" + bodyId + '"' + (chk.ok ? "" : " disabled") + ">部署采集装置 · " + S.DEPLOY_COST.credits + "⛁ +" + S.DEPLOY_COST.fe_alloy + " " + resName("fe_alloy") + "</button>" +
          (chk.ok ? "" : '<span class="dim">' + esc(chk.reason) + "</span>") + "</div>";
      } else {
        const resKey = S.resKeyOf(state, bodyId);
        const rate = S.rateOf(state, bodyId);
        const cap = S.capOfSite(state, bodyId);
        const buf = site.buffer || 0;
        const atNode = state.base.nodeId === site.nodeId;
        const up = S.upCost(site.level);
        const haul = state.members.filter(m => !m.destroyed && m.assignment && m.assignment.type === "logistics" && m.assignment.nodeId === site.nodeId).length;
        html += '<div>采集装置 <b>Lv' + site.level + "</b>" + (site.level >= S.MAX_LEVEL ? "（满级）" : "") + "　产率 <b>" + rate.toFixed(2) + "</b>/s　产物：" + (resKey ? resIcon(resKey) + resName(resKey) : "—") + "</div>";
        html += '<div class="dim">行星缓冲 <b>' + fmt(Math.floor(buf)) + " / " + fmt(Math.round(cap)) + "</b>（" + Math.round(buf / Math.max(1, cap) * 100) + '%，满则溢出浪费）</div>';
        html += '<div class="dim">物流岗自动回收：' + (haul ? "有 " + haul + " 名驻本星系，回收中 ×" + S.HAUL_RATE : "无——派物流岗到本星系可自动回收") + "</div>";
        html += '<div class="row"><button class="sm primary" data-act="site_collect:' + nodeId + ":" + bodyId + '"' + (atNode && buf > 0 ? "" : " disabled") + ">回收 " + resIconTxt(resKey) + fmt(Math.floor(buf)) + "</button>" +
          (up ? '<button class="sm" data-act="site_upgrade:' + nodeId + ":" + bodyId + '"' + ((state.res.credits || 0) >= up.credits ? "" : " disabled") + ">升级 Lv" + (site.level + 1) + " · " + up.credits + "⛁</button>" : "") + "</div>";
        if (!atNode) html += '<div class="dim">回收需舰基跃迁到本星系（亲自收菜）。</div>';
      }
    }
    if (acts.length) {
      const idle = state.members.filter(m => m.status === "idle" && !m.destroyed);
      if (!idle.length) html += '<div class="dim">无空闲成员可派遣（召回或等待）。</div>';
      else {
        // 采矿：目标矿选择（belt 含全矿种，可指定稀缺矿；默认自动选最丰富）
        let oreSel = "";
        if (body.kind === "belt" && body.abundance) {
          const ores = Object.entries(body.abundance).sort((x, y) => y[1] - x[1]);
          oreSel = '<div class="row"><select id="body-ore" class="mbr-sel"><option value="">自动（最丰富 ' +
            resIconTxt(ores[0][0]) + resName(ores[0][0]) + "）</option>" +
            ores.map(([o, v]) => '<option value="' + o + '">' + resIconTxt(o) + resName(o) + " ×" + v.toFixed(1) + "</option>").join("") +
            "</select></div>";
        }
        html += '<div class="row"><select id="body-mem" class="mbr-sel">' + idle.map(m =>
          '<option value="' + m.id + '">' + esc(m.name) + " · " + SKILL_CN[topSkill(m)] + " L" + Engine.Settle.levelOf(m.skills[topSkill(m)]) + "</option>").join("") + "</select></div>";
        html += oreSel;
        html += '<div class="row">' + acts.map(a =>
          '<button class="sm" data-act="assignBody:' + nodeId + ":" + bodyId + ":" + a.type + '">' + a.label + "</button>").join(" ") + "</div>";
      }
    }
    // 在岗成员（采矿/开发/勘探都算）——直接可召回
    const wk = bodyWorkers(nodeId, bodyId);
    if (wk.length) {
      html += '<div class="dim wk-line">⛏ 在岗 ' + wk.length + " 人：" + wk.map(m => esc(m.name) + "（" + jobName(m.assignment.type) + "）").join("、") + "</div>";
      html += '<div class="row" style="flex-wrap:wrap;gap:4px">' + wk.map(m =>
        '<button class="sm ghost" data-act="recall:' + m.id + '">召回 ' + esc(m.name) + "</button>").join("") + "</div>";
    } else {
      html += '<div class="dim">当前无人驻守此天体。</div>';
    }
    html += '<button class="sm ghost" data-act="closePop">关闭</button></div>';
    $pop.innerHTML = html;
    $pop.dataset.nodeId = nodeId;   // 供召回后原地刷新面板
    $pop.dataset.bodyId = bodyId;
    $pop.style.left = Math.max(8, (window.innerWidth - 280) / 2) + "px";
    $pop.style.top = "72px";
    $pop.classList.add("show");
  }

  function baseQueueState(type, recipes) {
    const q = state.base.industry[type + "Queue"] || [];
    const it = q[0];
    const recipe = it && recipes ? recipes.find(r => r.id === it.recipeId) : null;
    if (!it) return { count: 0, label: "待命", progress: 0, detail: "暂无排产" };
    const p = Core.clamp((Date.now() - it.startedAt) / 1000 / it.dur, 0, 1);
    return { count: q.length, label: recipe ? resName(recipe.out) : it.recipeId, progress: p, detail: "批次 " + (it.done + 1) + "/" + it.repeat };
  }

  function baseInventoryStrip() {
    const ids = ["credits", "fuel", "fe_alloy", "ni_alloy", "struct", "prop", "weapon"];
    return '<div class="base-inventory-strip">' + ids.map(k => '<span class="base-stock">' + resIcon(k) + '<b>' + fmt(state.res[k] || 0) + '</b><em>' + esc(resName(k)) + '</em></span>').join("") + '</div>';
  }

  function baseHullSelector() {
    let html = '<section class="base-hull-selector"><div class="base-hull-selector-head"><div><b>母舰蓝图</b><small>向势力购入船体蓝图；核心与工业队列随舰基保留</small></div><span class="tag">已拥有 ' + state.base.ownedHullBlueprints.length + ' / ' + Data.Ships.BASE_HULLS.length + '</span></div><div class="base-hull-cards">';
    for (const hull of Data.Ships.BASE_HULLS) {
      const faction = Data.Factions.factionById(hull.factionId) || { name: "未知势力", color: "#7893aa" };
      const status = Engine.Base.hullStatus(state, hull);
      const current = state.base.hullId === hull.id;
      const action = status.owned ? "baseHull:" + hull.id : "baseBlueprint:" + hull.id;
      const disabled = current || !status.available;
      const cost = Object.entries(hull.blueprintCost || {}).map(([k, v]) => resIcon(k) + " " + fmt(v)).join(" ");
      const rel = (state.factions.find(f => f.id === hull.factionId) || {}).relation || 0;
      html += '<button class="base-hull-card' + (current ? " current" : "") + '" style="--hull-accent:' + esc(hull.accent) + '" data-act="' + action + '"' + (disabled ? " disabled" : "") + '>'
        + '<span class="base-hull-card-faction" style="color:' + esc(faction.color) + '">' + esc(faction.name) + '</span>'
        + '<b>' + esc(hull.name) + '</b><small>' + esc(hull.tagline) + '</small>'
        + '<em>' + (status.owned ? (current ? "核心已搭载" : "切换船体") : status.label) + '</em>'
        + (!status.owned ? '<small class="base-hull-cost">关系 ' + rel + '/' + hull.relationReq + (cost ? " · " + cost : " · 免费") + '</small>' : "")
        + '</button>';
    }
    return html + '</div></section>';
  }

  function baseConnectionsSvg(hull) {
    const slots = Data.Ships.baseHullSlots(hull);
    const lines = [];
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) continue;
      const activeA = a.type === "core" || Engine.Base.moduleAt(state, a.id);
      const activeB = b.type === "core" || Engine.Base.moduleAt(state, b.id);
      const active = activeA && activeB;
      const x1 = Math.round((a.x - 0.5) * 1000 / 5), y1 = Math.round((a.y - 0.5) * 1000 / 5);
      const x2 = Math.round((b.x - 0.5) * 1000 / 5), y2 = Math.round((b.y - 0.5) * 1000 / 5);
      lines.push('<line class="' + (active ? "active" : "") + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>');
    }
    return '<svg class="base-connections" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">' + lines.join("") + '</svg>';
  }

  function baseModule(slot, plan) {
    const def = Data.Ships.baseModuleByType(slot.type);
    const installed = Engine.Base.moduleAt(state, slot.id);
    const selected = baseFocus === slot.id;
    const shortDesc = { energy: "能源输出", cargo: "资源库存", smelt: "矿石 → 矿材", manufacture: "部件 / 舰船", invent: "图纸研发", dock: state.ships.length + " 艘停泊", command: "小队管理", habitat: "成员舱" };
    let label = installed ? "在线" : "待装配";
    let progress = 0;
    if (installed && slot.type === "smelt") { const q = baseQueueState("smelt", Data.Recipes.SMELT); label = q.count ? q.label : "精炼待命"; progress = q.progress; }
    if (installed && slot.type === "manufacture") { const q = baseQueueState("manufacture", Data.Recipes.COMPONENT); label = q.count ? q.label : "总装待命"; progress = q.progress; }
    if (installed && slot.type === "invent") { const q = baseQueueState("invent", Data.Recipes.INVENT); label = plan.invent <= 0 ? "核心 Lv.2 解锁" : q.count ? q.label : "研发待命"; progress = q.progress; }
    if (installed && slot.type === "cargo") label = "真实库存 · 可用";
    if (installed && slot.type === "dock") label = "停泊 " + state.ships.length + " 艘";
    if (installed && slot.type === "command") label = "小队容量 " + (1 + (state.base.squadTier || 0));
    if (installed && slot.type === "habitat") label = "成员 " + state.members.length + "/20";
    if (!installed && slot.type === "invent" && plan.invent <= 0) label = "核心 Lv.2 解锁";
    const special = slot.special ? " special" : "";
    return '<button class="base-module base-' + slot.type + (selected ? " selected" : "") + special + (!installed ? " empty" : "") + '" style="grid-column:' + slot.x + ';grid-row:' + slot.y + ';--module-color:' + esc(def.color) + '" data-act="baseinfo:' + slot.id + '">'
      + (slot.special ? '<i class="base-special-mark" title="特化舱位">✦</i>' : "")
      + '<span class="base-module-icon">' + def.icon + '</span><b>' + (installed ? esc(def.name) : "空舱位") + '</b>'
      + '<small>' + esc(installed ? shortDesc[slot.type] : "兼容：" + def.name) + '</small>'
      + '<span class="base-module-status">' + esc(label) + (progress ? " · " + Math.round(progress * 100) + "%" : "") + '</span></button>';
  }

  function baseFocusPanel(plan, hull) {
    if (baseFocus === "core" || baseFocus === "") {
      const specialActive = !!Engine.Base.moduleAt(state, hull.specialSlot.id);
      return '<div class="base-core-inspector"><span class="eyebrow">UNIQUE COMMAND CORE</span><h3>唯一舰基核心</h3>'
        + '<div class="base-focus-title">' + esc(hull.name) + ' · ' + esc(plan.name) + ' Lv.' + plan.lv + '</div>'
        + '<div class="dim">核心编号 ' + esc(state.base.coreId) + '。更换母舰只改变船体和舱位拓扑，核心等级、燃料、库存与工业队列继续归属本舰基。</div>'
        + '<div class="base-focus-effect">' + (specialActive ? "已激活" : "待装配") + '特化舱位：' + esc(hull.specialSlot.name) + ' · ' + esc(hull.specialSlot.effect) + '</div></div>';
    }
    const slot = Engine.Base.slotById(state, baseFocus);
    if (!slot) return '<h3>舰基核心</h3><div class="dim">选择舱位查看模块与连接状态。</div>';
    const def = Data.Ships.baseModuleByType(slot.type);
    const installed = Engine.Base.moduleAt(state, slot.id);
    const effects = Engine.Base.slotEffects(state, slot.id);
    const energyLine = slot.type === "energy"
      ? '发电输出 +' + Data.Ships.ENERGY_OUTPUT
      : '电力占用 ' + (def.energy || 0);
    let html = '<span class="eyebrow">COMPARTMENT / ' + esc(slot.type.toUpperCase()) + '</span><h3>' + esc(def.name) + '</h3>';
    html += '<div class="base-focus-title">' + (installed ? "已装配" : "空舱位") + ' · ' + esc(hull.name) + '</div>';
    html += '<div class="dim">' + esc(def.desc) + '</div>';
    html += '<div class="base-focus-energy">⚡ ' + energyLine + '　·　电网 ' + Engine.Base.energyUsed(state) + ' / ' + Engine.Base.energyBudget(state) + '</div>';
    if (slot.special) html += '<div class="base-special-card"><b>✦ 势力特化舱位 · ' + esc(slot.special.name) + '</b><span>' + esc(slot.special.effect) + (installed ? ' · 效果已激活' : ' · 安装对应模块后生效') + '</span></div>';
    if (effects.length) html += '<div class="base-focus-effect">' + effects.map(x => esc(x.text)).join('<br>') + '</div>';
    else if (installed) html += '<div class="base-focus-effect muted">暂无相邻增效；可切换母舰布局，或拆装模块改变连接。</div>';
    if (installed) {
      const instance = state.base.modules.owned.find(m => m.id === (state.base.modules.installed.find(x => x.slotId === slot.id) || {}).moduleId);
      html += '<div class="base-module-instance">模块编号 <code>' + esc(instance ? instance.id : "—") + '</code></div>';
      // 增强剂（整舱生效）：对当前舱段类型激活基础等级（持续 + 消耗星币）
      const bl = Engine.Booster ? Engine.Booster.levelOf(state, slot.type) : 0;
      if (bl > 0) html += '<div class="base-focus-effect">本舱段增强剂生效中 · Lv.' + bl + '</div>';
      const canBooster = (state.res.credits || 0) >= BOOSTER_COST.credits;
      html += '<button class="sm ghost base-module-action" data-act="booster:' + slot.id + '"' + (canBooster ? "" : " disabled") + '>激活' + esc(def.name) + '增强剂 · ' + fmtDur(BOOSTER_DURATION) + '</button>';
      html += '<button class="sm ghost base-module-action" data-act="moduleRemove:' + slot.id + '">拆卸并收入模块库</button>';
    } else {
      const choices = Engine.Base.availableModules(state, slot.id);
      html += '<div class="base-module-library-title">模块库 · ' + choices.length + ' 个兼容模块</div>';
      html += choices.length ? choices.map(m => '<button class="base-module-choice" data-act="moduleInstall:' + slot.id + ':' + m.id + '"><span>' + def.icon + '</span><b>' + esc(def.name) + '</b><small>安装到该舱位</small></button>').join("")
        : '<div class="dim">模块已安装在其他位置；先拆卸后即可移装。</div>';
    }
    return html;
  }

  function viewBase() {
    const plan = Data.Ships.bodyLevelPlan(state.base.bodyLevel);
    const hull = Engine.Base.hullOf(state);
    const up = Data.Ships.upgradeCost(state.base.bodyLevel);
    const smelt = baseQueueState("smelt", Data.Recipes.SMELT);
    const manufacture = baseQueueState("manufacture", Data.Recipes.COMPONENT);
    const invent = baseQueueState("invent", Data.Recipes.INVENT);
    let html = '<div class="base-view-head"><div><h2>舰基 · ' + esc(hull.name) + '</h2><div class="dim">唯一舰基核心 · ' + esc(plan.name) + ' Lv.' + plan.lv + ' · ' + esc((Data.Factions.factionById(hull.factionId) || {}).name || "独立") + '</div></div>';
    if (up) {
      const costStr = Object.entries(up).map(([k, v]) => resIcon(k) + resName(k) + " " + v).join("  ");
      const can = Engine.Production.canAfford(state.res, up);
      html += '<button class="sm base-upgrade" data-act="upgrade"' + (can ? "" : " disabled") + '">升级本体 · ' + costStr + '</button>';
    } else html += '<span class="tag good">已达终级</span>';
    html += '</div>' + baseHullSelector() + baseInventoryStrip();

    const slots = Data.Ships.baseHullSlots(hull);
    const coreSlot = slots.find(s => s.type === "core");
    const smeltMult = Engine.Base.queueDurationMultiplier(state, "smelt");
    const manufactureMult = Engine.Base.queueDurationMultiplier(state, "manufacture");
    const inventMult = Engine.Base.queueDurationMultiplier(state, "invent");
    html += '<div class="base-layout-panel"><div class="base-stage hull-' + esc(hull.shape) + '" style="--hull-accent:' + esc(hull.accent) + '"><div class="base-blueprint-title"><b>SHIPYARD / DECK PLAN</b><span>' + esc(hull.name) + '</span></div><div class="base-blueprint-meta"><b>TOP VIEW</b><span>GRID 05 × 05</span><span>FRAME 00—24</span></div><div class="base-hull hull-' + esc(hull.shape) + '"><img class="base-blueprint-art" src="assets/base-hull-blueprint.svg?v=2" alt="" aria-hidden="true"></div><div class="base-layout">' + baseConnectionsSvg(hull);
    html += '<button class="base-module base-core' + (baseFocus === "core" ? " selected" : "") + '" style="grid-column:' + coreSlot.x + ';grid-row:' + coreSlot.y + '" data-act="baseinfo:core"><span class="base-module-icon">✦</span><b>唯一核心</b><small>' + esc(hull.name) + '</small><span class="base-module-status">本体 Lv.' + plan.lv + '</span></button>';
    for (const slot of slots) if (slot.type !== "core") html += baseModule(slot, plan);
    const installedCount = state.base.modules.installed.length;
    html += '</div><div class="base-stage-foot"><span><b>核心在线</b><em>模块 ' + installedCount + ' / ' + state.base.modules.owned.length + '</em></span><span>工业槽位 ' + (state.base.industry.smeltQueue.length + state.base.industry.manufactureQueue.length + state.base.industry.inventQueue.length + (state.base.industry.buildQueue || []).length) + ' / ' + (plan.smelt + plan.manufacture + plan.invent) + '</span></div></div>';
    html += '<aside class="base-focus-panel">' + baseFocusPanel(plan, hull) + '</aside></div>';
    html += '<div class="base-queue-note"><span>新排产效率</span><b>精炼 ' + smelt.count + '/' + plan.smelt + ' · 耗时 -' + Math.round((1 - smeltMult) * 100) + '%</b><b>制造 ' + manufacture.count + '/' + plan.manufacture + ' · 耗时 -' + Math.round((1 - manufactureMult) * 100) + '%</b><b>发明 ' + invent.count + '/' + plan.invent + ' · 耗时 -' + Math.round((1 - inventMult) * 100) + '%</b><small>模块布局在排产时确定，本批次按已锁定耗时运行。</small></div>';
    // 升级
    // 工业三队列
    html += queueBlock("smelt", "精炼（矿→矿材）", Data.Recipes.SMELT, plan.smelt, "out");
    html += queueBlock("manufacture", "制造部件", Data.Recipes.COMPONENT, plan.manufacture, "out");
    if (plan.invent > 0) html += queueBlock("invent", "发明（→改装图纸）", Data.Recipes.INVENT, plan.invent, "out");
    else html += '<div class="panel dim">发明需舰基升至星堡（Lv.2）解锁。</div>';
    html += shipyardBlock();
    // 小队协议升级（容量 1→2→3，复用 EVE-IDLE 研究门禁思路）
    const tier = state.base.squadTier || 0;
    if (tier < 2) {
      const cost = tier === 0 ? 5000 : 25000;
      const can = (state.res.credits || 0) >= cost;
      html += '<div class="panel"><div class="row"><span>升级小队协议（容量 ' + (1 + tier) + "→" + (2 + tier) + "）</span>" +
        '<button class="sm" data-act="squadUpgrade"' + (can ? "" : " disabled") + ">升级 · " + cost + "⛁</button></div></div>";
    } else html += '<div class="panel"><span class="tag good">小队协议已满级（容量 3）</span></div>';
    // 能源电网（§1.5）：供能预算 / 负载 / 状态
    const pw = Engine.Base.powerReport(state);
    const pwPct = pw.produced ? Math.round(pw.consumed / pw.produced * 100) : 0;
    html += '<div class="panel"><div class="row"><b>能源电网</b>' +
      '<span class="tag ' + (pw.ok ? "good" : "warn") + '">' + (pw.ok ? "供能充足" : "电网超载") + '</span>' +
      '<span class="tag">负载 ' + pw.consumed + ' / 供能 ' + pw.produced + '</span>' +
      (pw.ok ? '' : '<span class="tag warn">工业降速至 ' + Math.round(Engine.Base.powerMult(state) * 100) + '%</span>') +
      '</div>' +
      '<div class="energy-bar"><div class="energy-fill ' + (pw.ok ? "ok" : "over") + '" style="width:' + Math.min(100, pwPct) + '%"></div></div>' +
      '<div class="dim">总供能 = 本体外壳电网 ' + Data.Ships.bodyLevelPlan(state.base.bodyLevel).energy + ' + 能源舱 ×' + Data.Ships.ENERGY_OUTPUT + '。' +
      '各舱段占用：精炼环 20 · 总装船坞 30 · 发明舱 40 · 泊位 10 · 指挥塔 10 · 居住舱 10 · 仓储舱 5（能源舱自身 0）。超载时工业队列按比例降速，安装舱段受电网预算门禁。</div></div>';
    // 物流调度（§1.2）：物流补偿 + 在勤物流岗 + 公式说明
    const logiOnDuty = state.members.filter(m => !m.destroyed && m.assignment && m.assignment.type === "logistics").length;
    const logiComp = (state.logistics && state.logistics.compensation) || 0;
    html += '<div class="panel"><div class="row"><b>物流调度</b>' +
      '<span class="tag">补偿 ' + logiComp.toFixed(0) + 'pp / 软顶 ' + Engine.Logistics.COMP_CAP + '</span>' +
      '<span class="tag ' + (logiOnDuty ? "good" : "warn") + '">在勤 ' + logiOnDuty + ' 人</span></div>' +
      '<div class="dim">物流岗成员持续累积补偿；远程采矿产出 × 物流效率 ' +
      '= clamp(100% − 20%×跳数 + 补偿, 0%, 100%)。派驻到有采集装置的星系时，装置缓冲由物流岗自动回收（受物流效率）。成员页可派遣「物流」。</div></div>';
    // 增强剂（整舱生效）
    html += boosterPanel();
    // 精通 · 军团全局强化
    html += masteryPanel();
    return html;
  }

  // 精通点面板（3 个全局强化节点 + 发点说明）
  function masteryPanel() {
    const M = Engine.Mastery;
    if (!M || !M.summary) return "";
    const s = M.summary(state);
    let html = '<div class="panel"><div class="row"><b>精通 · 军团强化</b>'
      + '<span class="tag good">精通点 ' + s.points + '</span>'
      + '<span class="tag">累计 ' + s.earned + ' · 已用 ' + s.spent + '</span></div>';
    for (const n of s.nodes) {
      const effTxt = n.id === "industry" ? "工业耗时 −" + Math.round(n.cur * 100) + "%"
        : n.id === "combat" ? "声望/赏金 +" + Math.round(n.cur * 100) + "%"
        : "每跳惩罚 −" + Math.round(n.cur * 100) + "pp";
      html += '<div class="ms-node"><span class="ms-ic">' + n.icon + '</span>'
        + '<div class="ms-body"><div class="ms-name">' + esc(n.name) + ' <b>Lv.' + n.level + "/" + n.max + '</b></div>'
        + '<div class="dim">' + esc(n.desc) + '（当前 ' + effTxt + '）</div></div>'
        + (n.nextCost == null
          ? '<span class="tag good">已满级</span>'
          : '<button class="sm' + (n.canBuy ? "" : " disabled") + '"' + (n.canBuy ? ' data-act="mastery:' + n.id + '"' : " disabled") + '>强化 · ' + n.nextCost + ' 点</button>')
        + '</div>';
    }
    html += '<div class="dim">精通点按「完成」发点、不按挂机 tick：工业批次 +1 · 势力任务 +2 · 事件决策 +1 · 人生目的 +2 · 总装完成 +3。</div></div>';
    return html;
  }

  // 里程碑徽章（成员卡紧凑条）
  function milestoneChips(m) {
    const Npc = (typeof window !== "undefined" && window.NSK.Engine.Npc) || null;
    if (!Npc || !Npc.milestoneList) return "";
    const list = Npc.milestoneList(m);
    if (!list.length) return "";
    return list.map(ms => '<span class="ms-chip" title="' + esc(ms.desc) + '">' + ms.icon + " " + esc(ms.title) + "</span>").join("");
  }

  function queueBlock(type, title, recipes, slots, _ign) {
    const q = state.base.industry[type + "Queue"];
    const now = Date.now();
    const durationMult = Engine.Base.queueDurationMultiplier(state, type);
    let html = "<h3>" + title + " · 生产线 " + q.length + "/" + slots + "</h3><div class='panel'>";
    // 配方按钮
    for (const r of recipes) {
      const inStr = typeof r.in === "object"
        ? Object.entries(r.in).map(([k, v]) => resIcon(k) + resName(k) + " " + v).join(" ")
        : resIcon(r.in) + resName(r.in) + " " + r.qty;
      const outStr = resIcon(r.out) + resName(r.out) + " ×" + r.qty;
      const can = Engine.Production.canAfford(state.res, typeof r.in === "object" ? r.in : { [r.in]: r.qty });
      const adjustedDur = Math.round(r.dur * durationMult * 10) / 10;
      const durLabel = durationMult < 0.995 ? r.dur + "s → " + adjustedDur + "s" : r.dur + "s";
      html += '<div class="row"><span>' + inStr + " → " + outStr + ' <span class="dim">(' + durLabel + "/批)</span></span>" +
        '<button class="sm" data-act="enqueue:' + type + ":" + r.id + '"' + (can ? "" : " disabled") + ">排产</button></div>";
    }
    // 进行中
    for (const it of q) {
      const p = Core.clamp((now - it.startedAt) / 1000 / it.dur, 0, 1);
      const r = recipes.find(x => x.id === it.recipeId);
      html += '<div class="row"><span>' + (r ? resIcon(r.out) + resName(r.out) : it.recipeId) +
        " · 批 " + (it.done + 1) + "/" + it.repeat + '</span><span class="dim">' + Math.round(p * 100) + "%</span></div>" +
        '<div class="bar"><i style="width:' + (p * 100) + '%"></i></div>';
    }
    html += "</div>";
    return html;
  }

  // 秒 → 简洁时长（用于增强剂倒计时）
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + "s";
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + "m" + (s ? " " + s + "s" : "");
  }
  function modName(type) { const d = Data.Ships.baseModuleByType(type); return d ? d.name : type; }

  // 造船面板（总装船坞，共享 manufacture 槽位；完成入 state.ships）
  function shipyardBlock() {
    const plan = Data.Ships.bodyLevelPlan(state.base.bodyLevel);
    const now = Date.now();
    const durMult = Engine.Base.queueDurationMultiplier(state, "manufacture");
    const used = Engine.Production.manufactureUsed ? Engine.Production.manufactureUsed(state) : (state.base.industry.manufactureQueue.length + (state.base.industry.buildQueue || []).length);
    let html = '<div class="panel"><h3>造船 · 总装船坞 ' + used + "/" + plan.manufacture + '</h3><div class="row"><span class="tag">' + state.ships.length + ' 艘已建成</span><span class="dim">核心 Lv.' + plan.lv + ' 可造舰种见下方</span></div>';
    const ships = Object.values(Data.Ships.SHIPS).sort((a, b) => a.classTier - b.classTier || a.bodyLevelReq - b.bodyLevelReq);
    for (const s of ships) {
      const ok = Data.Ships.canBuildAt(s.id, state.base.bodyLevel);
      const costStr = Object.entries(s.cost).map(([k, v]) => resIcon(k) + resName(k) + " " + v).join(" ");
      const adjDur = Math.round(s.buildTime * durMult);
      const canAfford = Engine.Production.canAfford(state.res, s.cost);
      const lockNote = ok ? "" : "（核心 Lv." + (s.bodyLevelReq + 1) + " 解锁）";
      html += '<div class="row"><span>' + esc(s.name) + lockNote + ' · ' + costStr + ' · ' + adjDur + 's</span>'
        + '<button class="sm" data-act="build:' + s.id + '"' + ((ok && canAfford) ? "" : " disabled") + '>建造</button></div>';
    }
    const bs = Engine.Production.buildStatus ? Engine.Production.buildStatus(state, now) : [];
    for (const it of bs) {
      html += '<div class="row"><span>' + esc(it.name) + ' · 第 ' + (it.done + 1) + ' 艘建造中</span><span class="dim">' + Math.round(it.progress * 100) + '%</span></div>'
        + '<div class="bar"><i style="width:' + (it.progress * 100) + '%"></i></div>';
    }
    html += '<div class="dim">「部件制造」与「造船」共享总装船坞槽位；升级舰基核心（Lv.2）解锁中级舰（铁卫级/闪刃级）。</div></div>';
    return html;
  }

  // 增强剂（整舱生效）状态面板
  function boosterPanel() {
    const list = Engine.Booster ? Engine.Booster.list(state) : [];
    let html = '<div class="panel"><div class="row"><b>增强剂（整舱生效）</b>' + (list.length ? '<span class="tag good">生效中 ' + list.length + '</span>' : '<span class="tag">未激活</span>') + '</div>';
    if (list.length) {
      html += list.map(b => '<div class="row"><span>' + modName(b.type) + ' Lv.' + b.level + '</span><span class="dim">剩 ' + fmtDur(b.remaining) + ' · 加速 ×' + (1 + 0.1 * b.level).toFixed(2) + '</span></div>').join("");
    }
    html += '<div class="dim">在舰基舱位聚焦面板可激活对应舱段增强剂：基础等级 + 持续 ' + BOOSTER_DURATION + 's，消耗 ' + resIcon("credits") + BOOSTER_COST.credits + '。同舱段再激活取最高等级并刷新时长。</div></div>';
    return html;
  }

  function viewMembers() {
    let html = '<div class="members-page-head"><div class="members-page-title">'
      + '<span class="members-kicker">CREW REGISTRY / 星疆人员档案</span>'
      + '<h2>成员档案 <span class="members-count">' + state.members.length + ' / 20 在册</span></h2>'
      + '<small>生物识别记录 · 服役状态 · 专业能力</small></div>'
      + '<button class="sm members-recruit" data-act="recruit_hub">＋ 招募成员</button></div>';
    if (!state.members.length) html += '<div class="members-empty"><b>暂无在册人员</b><span>前往招募中心建立第一份人员档案</span></div>';
    html += '<div class="member-grid">';
    for (const m of state.members) {
      const pers = Data.Names.personalityById(m.personalityId);
      const ship = Data.Ships.shipById(m.shipId);
      const shipName = ship ? ship.name : "—";
      // 派遣落点里的天体名（小行星带/行星/残骸），让成员卡直接看出「在哪采矿」
      const ab = (function () {
        if (!m.assignment || !m.assignment.bodyId) return null;
        const nd = Data.StarMap.nodeById(state.starMap, m.assignment.nodeId);
        return nd && nd.bodies ? (nd.bodies.find(x => x.id === m.assignment.bodyId) || null) : null;
      })();
      const memberCode = String(m.id || "UNREGISTERED").replace(/^m_/, "").toUpperCase();
      const statusTxt = m.destroyed ? '<span class="mc-status bad"><i></i> 阵亡</span>'
        : m.assignment ? '<span class="mc-status good"><i></i> ' + esc(jobName(m.assignment.type) + (ab ? " · " + ab.name : "")) + "</span>"
        : '<span class="mc-status idle"><i></i> 待命</span>';
      const skCells = SKILL_KEYS.map(k => {
        const lv = Engine.Settle.levelOf(m.skills[k]);
        const pf = m.passion && m.passion[k];
        const pfMark = pf === "major" ? '<span class="pf major" title="专精（经验×1.5）">★★</span>'
          : pf === "minor" ? '<span class="pf minor" title="擅长（经验×1.0）">★</span>' : '';
        return '<div class="sk-cell"><span class="sk-n">' + (SKILL_CN[k] || k) + '</span>'
          + '<span class="sk-l">L' + lv + '</span>' + pfMark + '</div>';
      }).join("");
      const hpMax = Data.Ships.maxHp(m.shipId);
      const hpRow = hpBar("shield", m.hp.shield, hpMax.shield, "护盾")
        + hpBar("armor", m.hp.armor, hpMax.armor, "装甲")
        + hpBar("struct", m.hp.structure, hpMax.structure, "结构");
      const bs = m.backstory || {};
      const goalsHtml = goalChips(m);
      const milestonesHtml = milestoneChips(m);
      html += '<div class="member-card click" data-act="npc:' + m.id + '">'
        + '<div class="mc-top"><aside class="mc-id-column"><div class="mc-photo-frame">'
        + '<img class="mc-portrait" src="' + esc(npcPortraitUrl(m)) + '" alt="' + esc(m.name) + ' 的登记影像" draggable="false" loading="lazy">'
        + '<span class="mc-photo-stamp">IDENTITY / VERIFIED</span><i class="mc-corner tl"></i><i class="mc-corner br"></i></div>'
        + '<div class="mc-id-code"><span>PERSONNEL ID</span><b>' + esc(memberCode) + '</b></div>'
        + (m.trait ? '<div class="mc-trait"><span>PERSONNEL TRAIT</span><b>⚑ ' + esc(m.trait.name) + '</b><small>' + esc(m.trait.desc) + '</small></div>' : '')
        + '</aside><div class="mc-record"><div class="mc-filehead"><span>CREW PERSONNEL FILE</span><b>NO. ' + esc(memberCode.slice(-8)) + '</b></div>'
        + '<div class="mc-head"><span class="name">' + esc(m.name) + '</span><span class="mc-goals-toggle" title="打开完整档案与人生目的">档案 ↗</span></div>'
        + statusTxt
        + '<div class="mc-quote">“' + esc(pers.line || "档案记录待补充。") + '”</div>'
        + '<div class="mc-facts"><div><span>人格倾向</span><b>' + esc(pers.name) + '</b></div>'
        + '<div><span>籍贯</span><b>' + esc(m.origin || "未登记") + '</b></div>'
        + '<div class="wide"><span>绑定舰船</span><b>' + esc(shipName) + '</b></div></div></div></div>'
        + '<div class="mc-story">'
        + (bs.childhood ? '<span class="story-seg" title="' + esc(bs.childhood.desc) + '">出身·' + esc(bs.childhood.title) + '</span>' : '')
        + (bs.adulthood ? '<span class="story-seg" title="' + esc(bs.adulthood.desc) + '">经历·' + esc(bs.adulthood.title) + '</span>' : '')
        + '</div>'
        + '<div class="mc-section-head"><span>专业能力</span><small>SKILL PROFILE</small></div>'
        + '<div class="sk-grid">' + skCells + '</div>'
        + '<div class="mc-section-head mc-vitals-head"><span>舰船状态</span><small>HULL INTEGRITY</small></div>'
        + '<div class="hp-block">' + hpRow + '</div>'
        + (goalsHtml ? '<div class="mc-section-head"><span>人生目的</span><small>PERSONAL DIRECTIVES</small></div><div class="goal-strip">' + goalsHtml + '</div>' : '')
        + (milestonesHtml ? '<div class="ms-strip">' + milestonesHtml + '</div>' : '');
      if (!m.destroyed) {
        html += m.assignment
          ? '<button class="sm ghost" data-act="recall:' + m.id + '">召回</button>'
          : '<div class="row" style="margin-top:6px;flex-wrap:wrap;gap:4px">'
            + '<button class="sm" data-act="dispatch:' + m.id + ':mine">采矿</button>'
            + '<button class="sm" data-act="dispatch:' + m.id + ':explore">探索</button>'
            + '<button class="sm" data-act="dispatch:' + m.id + ':combat">战斗</button>'
            + '<button class="sm" data-act="dispatch:' + m.id + ':train">演训</button>'
            + '<button class="sm" data-act="dispatch:' + m.id + ':logistics">物流</button></div>';
      }
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function hpBar(kind, cur, max, label) {
    const pct = Math.max(0, Math.min(100, max ? cur / max * 100 : 0));
    return '<div class="hp-row"><span class="hp-lab">' + label + '</span>'
      + '<span class="hp-track"><span class="hp-fill ' + kind + '" style="width:' + pct.toFixed(1) + '%"></span></span>'
      + '<span class="hp-num">' + Math.round(cur) + '</span></div>';
  }

  function jobName(t) { return { mine: "采矿中", explore: "探索中", combat: "作战中", train: "演训中", logistics: "物流调度" }[t] || t; }

  // 升级小队协议：容量 1→2→3（tier 0→1 花 5000，1→2 花 25000）。扣费后调用 Dispatch.squadUpgrade。
  function squadUpgradeCost(tier) { return tier >= 2 ? null : (tier === 0 ? 5000 : 25000); }
  function doSquadUpgrade() {
    const tier = state.base.squadTier || 0;
    const cost = squadUpgradeCost(tier);
    if (cost == null) return;
    if ((state.res.credits || 0) >= cost) {
      state.res.credits -= cost;
      Engine.Dispatch.squadUpgrade(state);
    }
  }

  function viewFactions() {
    let html = "<h2>势力与任务板</h2>";
    // questGiver:false 的野怪势力（静默集群）不进任务板
    const board = state.factions.filter(f => {
      const m = Data.Factions.factionById(f.id);
      return m && m.questGiver !== false;
    });
    for (const f of board) {
      const meta = Data.Factions.factionById(f.id);
      const c = meta.contact || {};
      const tierTag = meta.tier === "minor"
        ? '<span class="tag">' + esc(meta.scale || "中小型") + "势力</span>"
        : '<span class="tag good">主要势力</span>';
      html += '<div class="panel"><div class="row" style="display:flex;gap:10px;align-items:flex-start">'
        + (c.img ? '<img class="fac-avatar" src="' + c.img + '" alt="" loading="lazy" style="width:64px;height:64px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid rgba(255,255,255,0.15);flex:0 0 auto;background:#111">' : '')
        + '<div style="flex:1;min-width:0">'
        + '<div class="row"><b style="color:' + meta.color + '">' + esc(meta.name) + "</b>" + tierTag
        + '<span class="tag">关系 ' + f.relation + "</span></div>"
        + (c.name ? '<div class="dim">联络人：' + esc(c.name) + (c.title ? " · " + esc(c.title) : "") + "</div>" : "")
        + '<div class="dim">' + esc(meta.blurb) + "</div></div></div>";
      for (const q of f.quests) {
        if (q.mode === "dispatch") {
          // 派遣类突发任务：选团员 + 预测成功率 + 派遣
          const opts = state.members.filter(m => !m.destroyed).map(m =>
            '<option value="' + m.id + '">' + esc(m.name) + "（" + (SKILL_CN[q.skill] || q.skill) + " L" + Engine.Settle.levelOf(m.skills[q.skill] || 0) + "）</option>").join("");
          const firstId = state.members.find(m => !m.destroyed);
          const hint = firstId ? Math.round(Engine.Faction.missionSuccessChance(firstId, q) * 100) : 0;
          html += '<div class="row quest-dispatch"><span>' + esc(q.desc) +
            ' <span class="tag good">💠' + q.reward.credits + " ⭐" + q.reward.rep + "</span></span>" +
            '<select class="mbr-sel" data-qid="' + q.id + '" data-fid="' + f.id + '">' + (opts || '<option value="">无可用团员</option>') + "</select>" +
            '<span class="tag warn chance" id="chance_' + q.id + '">成功率 ' + hint + "%</span>" +
            '<button class="sm" data-act="attempt:' + f.id + ":" + q.id + '">派遣</button></div>';
        } else {
          const have = state.res[q.item] || 0;
          const can = have >= q.qty;
          html += '<div class="row"><span>' + esc(q.desc) +
            ' <span class="tag ' + (can ? "good" : "warn") + '">持有 ' + fmt(have) + "/" + q.qty + "</span>" +
            '<span class="tag good">💠' + q.reward.credits + " ⭐" + q.reward.rep + "</span></span>" +
            '<button class="sm" data-act="deliver:' + f.id + ":" + q.id + '"' + (can ? "" : " disabled") + ">交付</button></div>";
        }
      }
      html += "</div>";
    }
    return html;
  }

  // 待决事件面板：有 options / chain 的事件不自动结算，等玩家在这里选择
  function pendingEventsBlock() {
    const list = state.pendingEvents || [];
    if (!list.length) return "";
    const N = (typeof window !== "undefined" && window.NSK.Narrative) || null;
    if (!N || !N.findById) return "";
    let html = '<div class="panel pending-events"><div class="row"><b>待决事件（' + list.length + '）</b>'
      + '<span class="tag warn">需要你的决策</span></div>';
    for (const p of list) {
      const ev = N.findById(p.eventId);
      if (!ev) continue;
      const m = p.memberId ? state.members.find(x => x.id === p.memberId) : null;
      html += '<div class="pe-card"><div class="pe-head"><b>' + esc(ev.title) + '</b>'
        + (m ? '<span class="tag ghost">' + esc(m.name) + '</span>' : "")
        + (ev.kind === "chain" ? '<span class="tag good">任务链</span>' : "") + "</div>";
      html += (ev.lines || []).map(l => '<div class="dim">' + esc(l) + "</div>").join("");
      html += '<div class="pe-opts">';
      (ev.options || []).forEach((o, i) => {
        const rq = N.checkRequire(state, m, o.require);
        let chance = o.chance == null ? 0.6 : o.chance;
        if (o.chanceBonus && m && m.trait && o.chanceBonus[m.trait.id]) chance += o.chanceBonus[m.trait.id];
        chance = Math.max(0.05, Math.min(0.97, chance));
        const chanceTxt = o.success ? ' <span class="pe-chance">' + Math.round(chance * 100) + "%</span>" : "";
        html += '<button class="sm' + (rq.ok ? "" : " disabled") + '"'
          + (rq.ok ? ' data-act="evopt:' + p.uid + ":" + i + '"' : ' disabled title="' + esc(rq.err) + '"') + ">"
          + esc(o.label) + chanceTxt + "</button>";
        if (!rq.ok) html += '<span class="pe-lock">' + esc(rq.err) + "</span>";
      });
      html += "</div></div>";
    }
    html += "</div>";
    return html;
  }

  // ============================================================
  // 设置页签：手动存档 / 导出存档 / 删除存档（+ 存储后端状态）
  // 存储后端由 Core.Storage 决定：浏览器 localStorage / TapTap 沙盒 tap.setStorage / 内存兜底。
  // ============================================================
  let settingsCode = "";
  let pendingDeleteSave = false;
  let lastManualSaveAt = 0;

  function viewSettings() {
    const S = (typeof window !== "undefined" && window.NSK.Core) ? window.NSK.Core.Storage : null;
    const st = S ? S.status() : { backend: "localStorage", label: "浏览器 localStorage", lastError: null };
    const storeKey = (Core && Core.SAVE_KEY) || "nsk_save_v7";
    let bytes = 0;
    try { bytes = String((S ? S.getItem(storeKey) : localStorage.getItem(storeKey)) || "").length; } catch (e) { bytes = 0; }
    const kb = bytes ? (bytes / 1024).toFixed(1) + " KB" : "—";
    const err = st.lastError ? String(st.lastError.errMsg || st.lastError.message || st.lastError) : "";

    let html = "<h2>设置</h2>";

    // —— 存储后端 ——
    html += '<div class="panel"><div class="row"><b>存储</b>'
      + '<span class="tag ' + (st.backend === "memory" ? "warn" : "good") + '">' + esc(st.label) + "</span>"
      + '<span class="tag">存档 ' + kb + '</span></div>'
      + '<div class="dim">存档键 <code>' + esc(storeKey) + "</code> · 格式 v8"
      + (st.backend === "tap" ? " · TapTap 沙盒单键上限 1MB / 总量 10MB，已自动写入 tap.setStorage" : "")
      + (st.backend === "memory" ? " · ⚠ 当前环境不支持持久化，进度只保留在本次会话" : "")
      + (err ? " · ⚠ 最近异常：" + esc(err) : "")
      + "</div></div>";

    // —— 手动存档 ——
    html += '<div class="panel"><div class="row"><b>手动存档</b>'
      + (lastManualSaveAt
        ? '<span class="tag good">上次手动 ' + new Date(lastManualSaveAt).toLocaleString("zh-CN", { hour12: false }) + "</span>"
        : '<span class="tag">本次会话未手动保存</span>')
      + "</div>"
      + '<div class="dim">游戏每 5 秒自动保存；切设备、关页面前建议点一次立即保存。</div>'
      + '<button class="sm" data-act="save_now">立即保存</button></div>';

    // —— 导出存档 ——
    html += '<div class="panel"><div class="row"><b>导出存档</b>'
      + '<span class="dim">存档码可发给好友/粘到别的设备；.json 文件适合备份</span></div>'
      + '<div class="row" style="flex-wrap:wrap;gap:6px">'
      + '<button class="sm" data-act="set_export_code">生成存档码</button>'
      + '<button class="sm"' + (settingsCode ? ' data-act="set_copy_code"' : " disabled") + ">复制存档码</button>"
      + '<button class="sm" data-act="set_export_file">导出存档文件</button>'
      + "</div>"
      + (settingsCode ? '<textarea class="nsk-code" id="set-code-area" readonly>' + esc(settingsCode) + "</textarea>" : "")
      + '<div class="row" style="flex-wrap:wrap;gap:6px">'
      + '<button class="sm" data-act="set_import_code"' + (settingsCode ? "" : " disabled") + ">导入上方存档码</button>"
      + '<label class="sm file-btn">导入存档文件<input type="file" id="set-import-file" accept=".json,.txt,application/json" hidden></label>'
      + "</div></div>";

    // —— 删除存档（二次确认）——
    html += '<div class="panel danger-panel"><div class="row"><b>删除存档</b><span class="tag bad">不可恢复</span></div>';
    if (!pendingDeleteSave) {
      html += '<div class="dim">删除本机存档（已接云存档时会一并删除）。建议先导出备份。</div>'
        + '<button class="sm danger" data-act="delete_save">删除本机存档</button>';
    } else {
      html += '<div class="fire-confirm"><span class="fire-warn">⚠ 确认删除？成员、舰船、队列、星图探索进度将全部消失，无法撤销。</span>'
        + '<button class="sm danger" data-act="delete_confirm">确认删除</button>'
        + '<button class="sm ghost" data-act="delete_cancel">取消</button></div>';
    }
    html += "</div>";
    return html;
  }

  // ============================================================
  // 剧情页签（Narrative.Story）：对话播放器 + 章节列表
  // 数据来自 js/narrative/story.js（由 story-editor.html 生成），
  // 状态存 state.story = { seen[], cur{sceneId,i}|null, flags{} }，随存档走。
  // 有正在播放的剧情时：头像 + 名字 + 正文 +（选项 或 下一句/结束）。
  // 没有时：章节卡列表（已看/未看/开局自动）。
  // ============================================================
  function storyRuntime() {
    return (typeof window !== "undefined" && window.NSK && window.NSK.Narrative && window.NSK.Narrative.Story) || null;
  }

  // 选项效果的可见文案（+300 星币 · +20 燃料），让玩家选之前知道代价/收益
  function storyEffText(ef) {
    if (!ef) return "";
    const parts = [];
    if (ef.delta) {
      for (const k in ef.delta) {
        const v = Number(ef.delta[k]) || 0;
        if (!v) continue;
        parts.push((v > 0 ? "+" : "") + v + " " + resName(k));
      }
    }
    if (ef.flag) parts.push("记录关键选择");
    return parts.join(" · ");
  }

  function viewStory() {
    const S = storyRuntime();
    let html = "<h2>剧情</h2>";
    if (!S) {
      return html + '<div class="panel"><div class="dim">剧情运行时未加载（js/narrative/story-runtime.js）。</div></div>';
    }
    if (!S.scenes().length) {
      return html + '<div class="panel"><div class="dim">还没有剧情数据。用 story-editor.html 录入后导出 js/narrative/story.js。</div></div>';
    }

    const c = S.current(state);
    if (c) {
      const line = c.line || {};
      const sp = S.speakerOf(line.who);
      const isNarr = !line.who || line.who === "narrator" || (!sp.name && !line.avatar);
      const av = S.avatarOf(line);
      const initial = (sp.name || "旁").trim().charAt(0) || "旁";
      const holo = (line.fx === "holo") || (!line.fx && sp.fx === "holo");
      const choices = Array.isArray(line.choices) ? line.choices : [];

      html += '<div class="story-play"><div class="dlg' + (holo ? " fx-holo" : "") + '">';
      html += '<div class="dlg-head">';
      if (av) {
        // 缺图兜底：onerror 给容器加 .miss → 隐藏 img、露出首字母牌（不出现碎图）
        html += '<div class="dlg-av"><img src="' + esc(av) + '" alt="' + esc(sp.name || "旁白") + '"'
          + ' draggable="false" onerror="this.parentNode.classList.add(\'miss\')">'
          + '<span class="av-ph">' + esc(initial) + "</span></div>";
      }
      html += '<div class="dlg-body">';
      if (!isNarr && sp.name) {
        html += '<div class="dlg-name"' + (sp.color ? ' style="color:' + esc(sp.color) + '"' : "") + ">"
          + esc(sp.name) + "</div>";
      }
      html += '<div class="dlg-text' + (isNarr ? " narr" : "") + '">' + esc(line.text || "") + "</div>";

      if (choices.length) {
        html += '<div class="dlg-choices">';
        choices.forEach((o, i) => {
          const gain = storyEffText(o.effect);
          html += '<button class="dlg-choice" data-act="story:choice:' + i + '">'
            + esc(o.label || ("选项 " + (i + 1)))
            + (gain ? '<span class="ch-gain">' + esc(gain) + "</span>" : "") + "</button>";
        });
        html += "</div>";
      } else {
        const last = (c.index + 1) >= c.total;
        html += '<div class="dlg-bar">'
          + '<button class="sm" data-act="story:next">' + (last ? "结束 ›" : "下一句 ›") + "</button>"
          + '<span class="dlg-prog">' + (c.index + 1) + " / " + c.total + "</span>"
          + '<span class="dim">' + esc(c.scene.title || c.scene.id) + "</span>"
          + "</div>";
      }
      html += "</div></div></div></div>";
      return html;
    }

    const list = S.list(state);
    html += '<div class="panel"><div class="row"><b>章节</b>'
      + '<span class="dim">选项会影响拿到的资源，重看可换选择。</span></div></div>';
    html += '<div class="story-list">';
    for (const sc of list) {
      html += '<div class="story-card">'
        + '<div class="sc-title">' + esc(sc.title) + "</div>"
        + (sc.note ? '<div class="sc-note">' + esc(sc.note) + "</div>" : "")
        + '<div class="sc-foot">'
        + '<button class="sm' + (sc.seen ? " ghost" : "") + '" data-act="story:start:' + esc(sc.id) + '">'
        + (sc.seen ? "重看" : "播放") + "</button>"
        + (sc.seen ? '<span class="sc-badge">已看</span>' : "")
        + (sc.auto ? '<span class="sc-badge auto">开局自动</span>' : "")
        + '<span class="sc-meta">' + sc.total + " 句</span>"
        + "</div></div>";
    }
    html += "</div>";
    return html;
  }

  function viewReport() {
    let html = "<h2>行动日报</h2>";
    html += pendingEventsBlock();
    if (!state.reports.length) html += '<div class="dim">暂无记录。派遣成员或排产后会在此汇总。</div>';
    for (const r of state.reports) {
      html += '<div class="panel"><div class="row"><b>' + esc(r.title) + "</b>" +
        '<span class="dim">' + new Date(r.ts).toLocaleString("zh-CN", { hour12: false }) + "</span></div>" +
        r.lines.map(l => '<div class="dim">· ' + esc(l) + "</div>").join("") + "</div>";
    }
    return html;
  }

  // 仓库：物资库存总览。视觉语言对齐一代 cargo（分类色卡片 / 分段标签 / 顶层资源三卡）。
  // 装备/脑插子区块随③接入后扩展。
  const WH_CATS = [
    { id: "all", name: "全部" },
    { id: "ore", name: "矿石" },
    { id: "gas", name: "气体" },
    { id: "mineral", name: "矿材" },
    { id: "component", name: "部件" },
    { id: "blueprint", name: "图纸" },
  ];
  // 顶层资源在页首三卡展示，不重复进网格
  const WH_TOP = ["credits", "fuel", "rep"];
  const WH_ORDER = ["ore", "gas", "mineral", "component", "blueprint", "other"];

  function viewWarehouse() {
    const res = state.res || {};
    const hudIdx = {};
    Data.Resources.HUD_ORDER.forEach((k, i) => { hudIdx[k] = i; });

    const groups = {};
    let totalKinds = 0, ownedKinds = 0;
    for (const k of Object.keys(res)) {
      const m = Data.Resources.meta(k);
      if (!m) continue;                       // 未注册键不进仓库，避免露出裸 id
      const cat = m.cat || "other";
      (groups[cat] = groups[cat] || []).push(k);
      totalKinds++;
      if ((res[k] || 0) > 0) ownedKinds++;
    }
    // 类内：持有量降序，空仓尾随；同量按 HUD 顺序，保证排序稳定不跳动
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => (res[b] || 0) - (res[a] || 0) || (hudIdx[a] || 0) - (hudIdx[b] || 0));
    }

    let html = '<div class="wh-head"><div><h2>仓库 · 物资库存</h2>'
      + '<div class="wh-desc">军团持有的全部物资；交付势力、排产、派遣产出实时同步。</div></div>'
      + '<div class="wh-head-r">'
      + '<span class="wh-toggle' + (whShowEmpty ? " on" : "") + '" data-act="wh:toggle">显示空仓</span>'
      + '<div class="wh-tally"><b>' + ownedKinds + '</b><span>/ ' + totalKinds + ' 类在库</span></div>'
      + "</div></div>";

    // 顶层资源三卡
    html += '<div class="wh-hero">';
    for (const k of WH_TOP) {
      const m = Data.Resources.meta(k); if (!m) continue;
      const cap = (k === "fuel" && state.base && state.base.fuelMax)
        ? ' <span class="st-cap">/ ' + fmt(state.base.fuelMax) + "</span>" : "";
      html += '<div class="wh-stat click" data-act="whinfo:' + k + '" data-res="' + k + '">'
        + '<span class="st-ic">' + resIcon(k) + '</span>'
        + '<span class="st-l">' + esc(m.name) + '</span>'
        + '<span class="st-v">' + fmt(res[k] || 0) + cap + '</span></div>';
    }
    html += "</div>";

    // 分段标签（带各类条目数）
    const catCount = (id) => id === "all" ? totalKinds : (groups[id] || []).length;
    html += '<div class="seg-tabs">';
    for (const c of WH_CATS) {
      html += '<span class="seg-tab' + (warehouseFilter === c.id ? " on" : "") + '" data-act="wh:' + c.id + '">'
        + c.name + "<i>" + catCount(c.id) + "</i></span>";
    }
    html += "</div>";

    let shown = 0;
    for (const cat of WH_ORDER) {
      if (warehouseFilter !== "all" && warehouseFilter !== cat) continue;
      const keys = groups[cat]; if (!keys || !keys.length) continue;
      const owned = keys.filter(k => (res[k] || 0) > 0).length;
      if (!whShowEmpty && !owned) continue;      // 空仓分类整段隐藏，避免整页幽灵卡
      shown++;
      const label = (WH_CATS.find(c => c.id === cat) || { name: cat === "other" ? "其他" : cat }).name;
      html += '<div class="wh-sec" data-cat="' + cat + '"><span class="nm">' + label + "</span>"
        + '<span class="cnt">' + owned + " / " + keys.length + ' 种在库</span><span class="ln"></span></div>';
      html += '<div class="wh-grid">';
      for (const k of keys) {
        const m = Data.Resources.meta(k);
        const val = res[k] || 0;
        const empty = val <= 0;
        if (empty && !whShowEmpty) continue;
        const tier = m.tier ? '<span class="wh-tier t' + m.tier + '">T' + m.tier + "</span>" : "";
        const tip = m.name + (m.tier ? " · T" + m.tier : "") + " · 持有 " + fmt(val);
        html += '<div class="wh-item click' + (empty ? " empty" : "") + '" data-act="whinfo:' + k + '" data-cat="' + cat + '" title="' + esc(tip) + '">'
          + '<div class="wh-top"><span class="wh-ic">' + resIcon(k) + "</span>"
          + '<span class="wh-nm">' + esc(m.name) + "</span>" + tier + "</div>"
          + '<div class="wh-q">' + fmt(val) + "</div></div>";
      }
      html += "</div>";
    }
    if (!shown) html += '<div class="wh-note">该分类下暂无物资。</div>';
    html += '<div class="wh-note">装备与脑插将在制造 / 事件系统接入后显示于本页。</div>';
    return html;
  }

  // ---------- 仓库卡片点击详情（对齐 EVE-IDLE cargo 卡点开） ----------
  let whDetailEl = null;
  function openWhDetail(key) {
    closeWhDetail();
    const m = Data.Resources.meta(key); if (!m) return;
    const qty = (state.res && state.res[key]) || 0;
    const catName = (WH_CATS.find(c => c.id === m.cat) || { name: m.cat === "other" ? "其他" : m.cat }).name;
    const accent = catColor(m.cat);
    const fromName = m.from ? (Data.Resources.meta(m.from) ? Data.Resources.meta(m.from).name : m.from) : null;
    const el = document.createElement("div");
    el.className = "wh-detail-mask";
    el.innerHTML =
      '<div class="wh-detail">' +
        '<button class="whd-x" data-whclose="1" title="关闭">✕</button>' +
        '<div class="whd-head">' +
          '<div class="whd-ic" style="border-color:' + accent + ';box-shadow:0 0 18px ' + accent + '55">' + resIcon(key) + "</div>" +
          '<div class="whd-t"><div class="whd-name">' + esc(m.name) + "</div>" +
            '<div class="whd-cat" style="color:' + accent + '">' + catName + (m.tier ? " · T" + m.tier : "") + "</div></div>" +
        "</div>" +
        '<div class="whd-qty"><span>当前持有</span><b>' + fmt(qty) + "</b></div>" +
        (fromName ? '<div class="whd-line"><span>提炼自</span><b>' + esc(fromName) + "</b></div>" : "") +
        '<div class="whd-desc">' + esc(m.desc || "仓库中的一类物资。交付势力、排产、派遣产出都会实时反映在此。") + "</div>" +
      "</div>";
    el.addEventListener("click", function (ev) {
      if (ev.target.closest(".wh-detail") && !ev.target.closest("[data-whclose]")) return;
      closeWhDetail();
    });
    document.body.appendChild(el);
    whDetailEl = el;
  }
  function closeWhDetail() { if (whDetailEl) { whDetailEl.remove(); whDetailEl = null; } }

  // ---------- NPC 人生目的系统（⑤）：卡片目的条 + 详情弹层 ----------
  function npcGoals(m) { return (m && m.goals) || []; }
  function goalAffordable(state, m, g) {
    const Npc = (typeof window !== "undefined" && window.NSK.Engine.Npc) || null;
    if (!Npc) return true;
    if (g.type === "giveItem") {
      if (g.target === "credits") return (state.res.credits || 0) >= 500;
      return (state.res[g.target] || 0) >= 1;
    }
    if (g.type === "bindShip") {
      const S = (typeof window !== "undefined" && window.NSK.Data.Ships.SHIPS) || {};
      const id = Npc.shipIdAtTier(g.targetTier);
      const cost = (S[id] || {}).cost || {};
      for (const k in cost) if ((state.res[k] || 0) < cost[k]) return false;
      return true;
    }
    return true; // visit 自动达成
  }
  // 卡片内紧凑目的条
  function goalChips(m) {
    const Npc = (typeof window !== "undefined" && window.NSK.Engine.Npc) || null;
    if (!Npc) return "";
    return npcGoals(m).map(g => {
      const rw = "×" + g.reward.toFixed(1);
      return '<span class="goal-chip' + (g.done ? " done" : "") + '" title="' + esc(Npc.goalHint(g)) + '">'
        + '<span class="g-ic">' + Npc.goalIcon(g) + '</span>'
        + '<span class="g-lb">' + esc(Npc.goalLabel(g)) + '</span>'
        + '<span class="g-rw">经验 ' + rw + '</span>'
        + (g.done ? '<span class="g-ck">✓</span>' : '') + '</span>';
    }).join("");
  }
  // 详情内完整目的行（含操作按钮）
  function goalDetailRows(m) {
    const Npc = (typeof window !== "undefined" && window.NSK.Engine.Npc) || null;
    if (!Npc) return "";
    return npcGoals(m).map((g, i) => {
      const rw = "×" + g.reward.toFixed(1);
      let act;
      if (g.done) act = '<span class="tag good">已达成</span>';
      else if (g.type === "visit") act = '<span class="tag">派遣至 ' + esc(g.targetName) + ' 自动达成</span>';
      else {
        const can = goalAffordable(state, m, g);
        const label = g.type === "bindShip" ? "满足舰船目的" : "赠予";
        act = '<button class="sm' + (can ? "" : " disabled") + '"' + (can ? ' data-act="' + (g.type === "bindShip" ? "goalship" : "goalgive") + ":" + m.id + ":" + i + '"' : " disabled") + '>' + label + '</button>';
      }
      return '<div class="goal-row' + (g.done ? " done" : "") + '">'
        + '<span class="g-ic">' + Npc.goalIcon(g) + '</span>'
        + '<div class="g-body"><div class="g-lb">' + esc(Npc.goalLabel(g)) + '</div>'
        + '<div class="g-hint">' + esc(Npc.goalHint(g)) + '</div></div>'
        + '<span class="g-rw">经验 ' + rw + '</span>' + act + '</div>';
    }).join("");
  }
  let npcDetailEl = null;
  let pendingFireId = null;   // 解雇二次确认：待确认解雇的成员 id（null=无）
  function npcPortraitUrl(m) {
    if (m.portraitUrl) return m.portraitUrl;
    // 出身 → 立绘原型：每个出身各有独立原型（2026-10-25 起，新出身不再复用老原型）。
    const portraitByOrigin = {
      orphan_void: "orphan_void", fleet_brat: "fleet_brat", belt_nomad: "belt_nomad",
      station_rat: "station_rat", relic_kid: "relic_kid", corp_heir: "corp_heir",
      defector: "defector", signal_orphan: "signal_orphan", smelter_apprentice: "smelter_apprentice",
      salvage_waif: "salvage_waif", gas_drifter: "gas_drifter", abyss_acolyte: "abyss_acolyte",
      bounty_foundling: "bounty_foundling", settler_scion: "settler_scion", turret_child: "turret_child",
    };
    const sourceId = m.backstory && m.backstory.childhood && m.backstory.childhood.id;
    const portraitId = portraitByOrigin[sourceId] || "pilot";
    let seed = 2166136261 >>> 0;
    for (const c of String(m.id || m.name || "npc")) { seed ^= c.charCodeAt(0); seed = Math.imul(seed, 16777619); }
    const rng = function () {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const P = NSK.UI && NSK.UI.Portraits;
    m.portraitUrl = pickPortrait(P, portraitId, rng);
    return m.portraitUrl;
  }
  // 选立绘：优先 v1（标准）→ reveal（清凉版）→ 同原型任意已生成 combo；清单未就绪时走原兜底路径。
  // rng 由成员自身种子派生并缓存到 m.portraitUrl，保证同一 NPC 稳定不闪脸。
  function pickPortrait(P, archId, rng) {
    if (P) {
      const M = P.getManifest && P.getManifest();
      if (M) {
        const pref = [archId + "/v1", archId + "/reveal"];
        for (const key of pref) {
          if (M[key] && M[key].length) return P.DIR + "/" + P.pickFromList(M[key], rng);
        }
        const any = Object.keys(M).find(k => k.indexOf(archId + "/") === 0 && M[k] && M[k].length);
        if (any) return P.DIR + "/" + P.pickFromList(M[any], rng);
      }
      return P.pick(archId, 0, {}, rng);
    }
    return "assets/portraits/npc/" + archId + "/" + archId + "_v1.webp";
  }
  function npcSkillCells(m) {
    return SKILL_KEYS.map(k => {
      const xp = Math.max(0, Number(m.skills && m.skills[k]) || 0);
      const lv = Engine.Settle.levelOf(xp);
      const atLevel = Math.ceil(1000 * (Math.pow(1.1, lv - 1) - 1));
      const nextLevel = Math.ceil(1000 * (Math.pow(1.1, lv) - 1));
      const need = Math.max(1, nextLevel - atLevel);
      const progress = Math.max(0, Math.min(100, (xp - atLevel) / need * 100));
      const pf = m.passion && m.passion[k];
      const pfText = pf === "major" ? "专精 · ×1.5" : pf === "minor" ? "擅长 · ×1.0" : "无偏好 · ×0.35";
      const pfClass = pf === "major" ? "major" : pf === "minor" ? "minor" : "none";
      return '<div class="npc-skill">'
        + '<div class="npc-skill-top"><span>' + esc(SKILL_CN[k] || k) + '</span><b>LV ' + lv + '</b></div>'
        + '<div class="npc-skill-track"><i style="width:' + progress.toFixed(1) + '%"></i></div>'
        + '<div class="npc-skill-foot"><span class="' + pfClass + '">' + pfText + '</span><span>' + Math.floor(xp - atLevel) + ' / ' + need + ' XP</span></div>'
        + '</div>';
    }).join("");
  }
  function npcVitalRows(m, hpMax) {
    return [["shield", "护盾", m.hp.shield], ["armor", "装甲", m.hp.armor], ["struct", "结构", m.hp.structure]].map(([kind, label, cur]) => {
      const max = (hpMax && hpMax[kind === "struct" ? "structure" : kind]) || 0;
      const pct = Math.max(0, Math.min(100, max ? cur / max * 100 : 0));
      return '<div class="npc-vital"><div class="npc-vital-label"><span>' + label + '</span><b>' + Math.round(cur) + '<i> / ' + Math.round(max) + '</i></b></div>'
        + '<div class="hp-track"><span class="hp-fill ' + kind + '" style="width:' + pct.toFixed(1) + '%"></span></div></div>';
    }).join("");
  }
  function openNpcDetail(memberId) {
    closeNpcDetail();
    const m = state.members.find(x => x.id === memberId);
    if (!m) return;
    const pers = Data.Names.personalityById(m.personalityId);
    const ship = Data.Ships.shipById(m.shipId);
    const shipName = ship ? ship.name : "—";
    const statusLabel = m.destroyed ? "阵亡" : m.assignment ? jobName(m.assignment.type) : "待命";
    const statusClass = m.destroyed ? "bad" : m.assignment ? "good" : "idle";
    const hpMax = Data.Ships.maxHp(m.shipId);
    const bs = m.backstory || {};
    const goalXp = (m.mods && m.mods.goalXp) || 1;
    // 里程碑（称号/勋章）：已得 + 未达成一览
    const NpcMod = (typeof window !== "undefined" && window.NSK.Engine.Npc) || null;
    const allMs = (NpcMod && NpcMod.MILESTONES) || [];
    const earnedIds = Array.isArray(m.milestones) ? m.milestones : [];
    const msRows = allMs.map(ms => {
      const got = earnedIds.indexOf(ms.id) >= 0;
      return '<div class="ms-row' + (got ? " got" : "") + '"><span class="ms-ic">' + ms.icon + '</span>'
        + '<div class="ms-body"><div class="ms-name">' + esc(ms.title) + '</div><div class="dim">' + esc(ms.desc) + '</div></div>'
        + '<span class="' + (got ? "tag good" : "tag") + '">' + (got ? "已获得" : "未达成") + '</span></div>';
    }).join("");
    const assignmentNode = m.assignment && m.assignment.nodeId ? Data.StarMap.nodeById(state.starMap, m.assignment.nodeId) : null;
    const assignmentBody = (m.assignment && m.assignment.bodyId && assignmentNode && assignmentNode.bodies)
      ? (assignmentNode.bodies.find(b => b.id === m.assignment.bodyId) || null) : null;
    const assignmentLabel = m.destroyed ? "生命信号中断" : m.assignment
      ? jobName(m.assignment.type) + (assignmentNode ? " · " + assignmentNode.name : "") + (assignmentBody ? " · " + assignmentBody.name : "")
      : "舰基待命 · 可接受派遣";
    const affinityFaction = m.factionAffinity && Data.Factions.factionById(m.factionAffinity);
    const affinity = m.affinity || {};
    const affinityText = affinityFaction
      ? esc(affinityFaction.name) + ' · 声望 ×' + Number(affinity.repMult || 1).toFixed(2) + ' · 收入 ×' + Number(affinity.creditMult || 1).toFixed(2) + ' · 突发成功率 +' + Math.round((affinity.urgentSuccess || 0) * 100) + '%'
      : "未登记势力亲和";
    const portraitUrl = npcPortraitUrl(m);
    const memberCode = String(m.id || "UNREGISTERED").replace(/^m_/, "").toUpperCase();
    const el = document.createElement("div");
    el.className = "wh-detail-mask npc-detail-mask";
    el.tabIndex = -1;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "成员档案：" + m.name);
    el.innerHTML =
      '<div class="wh-detail npc-detail">'
      + '<div class="npc-terminal-bar"><span><i></i> 星疆人事数据库 <b>/ PERSONNEL ARCHIVE</b></span><span>访问级别 · 指挥部</span></div>'
      + '<button class="whd-x" data-whclose="1" title="关闭档案" aria-label="关闭档案">✕</button>'
      + '<div class="npc-profile">'
      + '<aside class="npc-id-column">'
      + '<div class="npc-portrait"><img src="' + esc(portraitUrl) + '" alt="' + esc(m.name) + ' 的登记影像" draggable="false"><span class="npc-portrait-stamp">身份影像 · 已归档</span><span class="npc-portrait-corner tl"></span><span class="npc-portrait-corner br"></span></div>'
      + (m.trait ? '<div class="npc-id-trait"><div><span>履历特质</span><b>⚑ ' + esc(m.trait.name) + '</b></div><small>' + esc(m.trait.desc) + '</small></div>' : '')
      + '<div class="npc-id-code"><span>PERSONNEL ID</span><b>' + esc(memberCode) + '</b></div>'
      + '<div class="npc-signal"><i></i> 生物识别档案已同步</div>'
      + '</aside>'
      + '<section class="npc-record">'
      + '<div class="npc-record-kicker">军团成员 · 个人履历 <span>FILE NO. ' + esc(memberCode.slice(-8)) + '</span></div>'
      + '<div class="npc-name-line"><div><h2>' + esc(m.name) + '</h2><p>' + esc(bs.childhood ? bs.childhood.title : "身份来源未登记") + ' <span>/</span> ' + esc(shipName) + '</p></div><span class="npc-status ' + statusClass + '">' + esc(statusLabel) + '</span></div>'
      + '<blockquote class="npc-quote">“' + esc(pers.line) + '”</blockquote>'
      + '<div class="npc-facts">'
      + '<div class="npc-fact"><span>人格倾向</span><b>' + esc(pers.name) + '</b></div>'
      + '<div class="npc-fact"><span>招募来源</span><b>' + esc(m.origin || "未登记") + '</b></div>'
      + '<div class="npc-fact"><span>当前任务</span><b>' + esc(assignmentLabel) + '</b></div>'
      + '<div class="npc-fact"><span>绑定舰船</span><b>' + esc(shipName) + (ship && ship.classTier ? ' · T' + ship.classTier : '') + '</b></div>'
      + '<div class="npc-fact wide"><span>势力倾向</span><b>' + affinityText + '</b></div>'
      + '</div>'
      + '<div class="npc-biography">'
      + '<div class="npc-biography-head">履历摘要 <span>BACKGROUND CHECK</span></div>'
      + '<p>' + esc(bs.childhood ? bs.childhood.desc : "暂无出身记录。") + '</p>'
      + (bs.adulthood ? '<p>' + esc(bs.adulthood.desc || bs.adulthood.title) + '</p>' : '')
      + '</div>'
      + '</section>'
      + '</div>'
      + '<div class="npc-lower-grid">'
      + '<section class="npc-panel-section"><div class="npc-section-head"><span>技能矩阵</span><small>SKILL MATRIX · 成长经验</small></div>'
      + '<div class="npc-skill-grid">' + npcSkillCells(m) + '</div></section>'
      + '<section class="npc-panel-section npc-vitals-section"><div class="npc-section-head"><span>舰体状态</span><small>HULL INTEGRITY</small></div>'
      + '<div class="npc-ship-label"><b>' + esc(shipName) + '</b><span>' + (ship && ship.classTier ? 'CLASS T' + ship.classTier : '舰船型号未知') + '</span></div>'
      + '<div class="npc-vitals">' + npcVitalRows(m, hpMax) + '</div></section>'
      + '</div>'
      + '<section class="npc-panel-section npc-goals-section"><div class="npc-section-head"><span>人生目的</span><small>PERSONAL DIRECTIVES <b>全经验 ×' + goalXp.toFixed(3) + '</b></small></div>'
      + '<div class="goal-list">' + goalDetailRows(m) + '</div></section>'
      + '<section class="npc-panel-section npc-ms-section"><div class="npc-section-head"><span>里程碑</span><small>MILESTONES <b>' + earnedIds.length + " / " + allMs.length + '</b></small></div>'
      + '<div class="ms-list">' + (msRows || '<div class="dim">暂无里程碑定义。</div>') + '</div></section>'
      + '<div class="npc-acts">'
      + (pendingFireId === m.id
          ? '<div class="fire-confirm">'
            + '<span class="fire-warn">⚠ 确认解雇 ' + esc(m.name) + '？解除雇佣不可撤销，将同时取消其派遣并移出战斗小队。</span>'
            + '<button class="sm danger" data-act="fire_confirm:' + m.id + '">确认解雇</button>'
            + '<button class="sm ghost" data-act="fire_cancel:' + m.id + '">取消</button>'
            + '</div>'
          : (m.destroyed ? '' :
              m.assignment ? '<button class="sm ghost" data-act="recall:' + m.id + '">召回</button>'
              : '<button class="sm" data-act="dispatch:' + m.id + ':mine">采矿</button><button class="sm" data-act="dispatch:' + m.id + ':explore">探索</button><button class="sm" data-act="dispatch:' + m.id + ':combat">战斗</button><button class="sm" data-act="dispatch:' + m.id + ':train">演训</button><button class="sm" data-act="dispatch:' + m.id + ':logistics">物流</button>')
            + '<button class="sm danger" data-act="fire:' + m.id + '">解雇</button>')
      + '<span class="npc-footer-note">深空星疆 · 人员档案系统</span></div>'
      + '</div>';
    el.addEventListener("click", function (ev) {
      if (ev.target.closest(".wh-detail") && !ev.target.closest("[data-whclose]")) return;
      closeNpcDetail();
    });
    el.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeNpcDetail(); });
    document.body.appendChild(el);
    npcDetailEl = el;
    el.focus();
  }
  function closeNpcDetail() { if (npcDetailEl) { npcDetailEl.remove(); npcDetailEl = null; } }

  // ============================================================
  // 招募中心（候选市场）弹窗 —— 对齐 EVE-IDLE：3 候选 / 4h 自然刷新 / 换批星币翻倍 / 广告位
  // ============================================================
  let recruitHubEl = null;
  let recruitCountdownTimer = null;

  function fmtCountdown(ms) {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = n => String(n).padStart(2, "0");
    return p(hh) + ":" + p(mm) + ":" + p(ss);
  }

  function toast(msg) {
    let t = document.getElementById("nsk-toast");
    if (!t) { t = document.createElement("div"); t.id = "nsk-toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 1600);
  }

  // 单张候选卡：复用 NPC 档案的视觉语言（肖像 / 人格语录 / 出身经历词条 / 技能矩阵 / 势力亲和）
  function recruitCardHtml(m, index) {
    const pers = Data.Names.personalityById(m.personalityId);
    const ship = Data.Ships.shipById(m.shipId);
    const shipName = ship ? ship.name : "—";
    const bs = m.backstory || {};
    const skCells = SKILL_KEYS.map(k => {
      const lv = Engine.Settle.levelOf(m.skills[k]);
      const pf = m.passion && m.passion[k];
      const pfMark = pf === "major" ? '<span class="pf major" title="专精（经验×1.5）">★★</span>'
        : pf === "minor" ? '<span class="pf minor" title="擅长（经验×1.0）">★</span>' : '';
      return '<div class="sk-cell"><span class="sk-n">' + (SKILL_CN[k] || k) + '</span>'
        + '<span class="sk-l">L' + lv + '</span>' + pfMark + '</div>';
    }).join("");
    const affinityFaction = m.factionAffinity && Data.Factions.factionById(m.factionAffinity);
    const affinity = m.affinity || {};
    const affinityText = affinityFaction
      ? esc(affinityFaction.name) + ' · 声望 ×' + Number(affinity.repMult || 1).toFixed(2) + ' · 收入 ×' + Number(affinity.creditMult || 1).toFixed(2)
      : "未登记势力亲和";
    const portraitUrl = npcPortraitUrl(m);
    const full = state.members.length >= 20;
    return '<div class="recruit-card">'
      + '<div class="rc-profile">'
      + '<aside class="rc-id-column">'
      + '<div class="rc-portrait"><img src="' + esc(portraitUrl) + '" alt="' + esc(m.name) + ' 的登记影像" draggable="false">'
      + '<span class="rc-stamp">候选 · 待招募</span><span class="rc-corner tl"></span><span class="rc-corner br"></span></div>'
      + (m.trait ? '<div class="rc-trait"><span>PERSONNEL TRAIT</span><b>⚑ ' + esc(m.trait.name) + '</b><small>' + esc(m.trait.desc) + '</small></div>' : '')
      + '</aside>'
      + '<div class="rc-record">'
      + '<div class="rc-filehead"><span>PERSONNEL FILE</span><b>NO. ' + String(index + 1).padStart(2, "0") + '</b></div>'
      + '<div class="rc-name-line"><b class="rc-name">' + esc(m.name) + '</b><span class="rc-origin">' + esc(m.origin || "未登记") + '</span></div>'
      + '<div class="rc-quote">“' + esc(pers.line) + '”</div>'
      + '<div class="rc-facts">'
      + '<div class="rc-fact"><span>人格倾向</span><b>' + esc(pers.name) + '</b></div>'
      + '<div class="rc-fact"><span>绑定舰船</span><b>' + esc(shipName) + '</b></div>'
      + '<div class="rc-fact wide"><span>势力倾向</span><b>' + esc(affinityText) + '</b></div>'
      + '</div>'
      + '</div></div>'
      + '<div class="rc-story">'
      + (bs.childhood ? '<span class="story-seg" title="' + esc(bs.childhood.desc) + '">出身·' + esc(bs.childhood.title) + '</span>' : '')
      + (bs.adulthood ? '<span class="story-seg" title="' + esc(bs.adulthood.desc) + '">经历·' + esc(bs.adulthood.title) + '</span>' : '')
      + '</div>'
      + '<div class="sk-grid">' + skCells + '</div>'
      + '<div class="rc-actions">' + (full
        ? '<button class="sm" disabled>名册已满（20）</button>'
        : '<button class="sm primary" data-act="recruit_pick:' + m.id + '">签约招募 · 免费</button>')
      + '<span><i></i> 履历核验完成</span></div>'
      + '</div>';
  }

  function recruitHubInner() {
    if (!Engine.Recruit) return "";
    const rs = Engine.Recruit.getState(state);
    const cards = rs.candidates.length
      ? rs.candidates.map((m, i) => recruitCardHtml(m, i)).join("")
      : '<div class="recruit-empty">当前无候选 · 等待 4 小时自然刷新，或花费星币换一批。</div>';
    const remainMs = Math.max(0, rs.nextFreeAt - Date.now());
    return '<div class="recruit-topbar">'
      + '<div class="recruit-heading"><span>CANDIDATE REVIEW / 星疆人员征募</span><b>候选档案审阅</b><small>核对履历、特质与技能，选择新成员加入军团</small></div>'
      + '<div class="recruit-metrics">'
      + '<span><small>本轮候选</small><b>' + rs.candidates.length + ' <i>份档案</i></b></span>'
      + '<span><small>成员名册</small><b>' + rs.rosterCount + '<i> / ' + rs.rosterCap + '</i></b></span>'
      + '<span><small>可用星币</small><b>◆ ' + fmt(state.res.credits) + '</b></span>'
      + '</div></div>'
      + '<div class="recruit-grid">' + cards + '</div>'
      + '<div class="recruit-foot">'
      + '<button class="sm" data-act="recruit_reroll" ' + (rs.canAfford ? '' : 'disabled') + '>'
      + (rs.cost > 0 ? '换一批（消耗 ' + fmt(rs.cost) + ' 星币）' : '换一批（免费）')
      + ' <span class="recruit-mult">×' + rs.mult + '</span></button>'
      + '<div class="recruit-ad" data-act="recruit_ad" title="广告位 · 观看广告免费换一批（演示占位）">'
      + '<div class="ad-tag">广告位 · AD</div><div class="ad-body">▶ 观看广告 · 免费换一批</div></div>'
      + '<div class="recruit-countdown">免费刷新倒计时 <span id="recruit_cd">' + fmtCountdown(remainMs) + '</span></div>'
      + '</div>';
  }

  function refreshRecruitHubBody() {
    const body = document.getElementById("recruit_hub_body");
    if (body) body.innerHTML = recruitHubInner();
  }

  function openRecruitHub() {
    closeRecruitHub();
    if (Engine.Recruit) Engine.Recruit.ensureRecruitState(state, Data, Date.now());
    const el = document.createElement("div");
    el.className = "wh-detail-mask recruit-hub-mask";
    el.tabIndex = -1;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "星疆招募中心");
    el.innerHTML = '<div class="wh-detail recruit-hub">'
      + '<div class="npc-terminal-bar"><span><i></i> 星疆招募中心 <b>/ RECRUITMENT HUB</b></span><span>访问级别 · 指挥部</span></div>'
      + '<button class="whd-x" data-whclose="1" aria-label="关闭招募中心">✕</button>'
      + '<div id="recruit_hub_body">' + recruitHubInner() + '</div>'
      + '</div>';
    document.body.appendChild(el);
    // 仅处理关闭与背景点击；候选卡上的 data-act 按钮交给全局 document 监听（与 openNpcDetail 同款，避免双重触发）
    el.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-whclose]")) { closeRecruitHub(); return; }
      if (!ev.target.closest(".wh-detail")) { closeRecruitHub(); return; } // 点背景关闭
    });
    recruitHubEl = el;
    if (recruitCountdownTimer) clearInterval(recruitCountdownTimer);
    recruitCountdownTimer = setInterval(function () {
      const cd = document.getElementById("recruit_cd");
      if (!cd || !Engine.Recruit) return;
      cd.textContent = fmtCountdown(Math.max(0, Engine.Recruit.getState(state).nextFreeAt - Date.now()));
    }, 1000);
  }

  function closeRecruitHub() {
    if (recruitCountdownTimer) { clearInterval(recruitCountdownTimer); recruitCountdownTimer = null; }
    if (recruitHubEl) { recruitHubEl.remove(); recruitHubEl = null; }
  }

  function applyMapTransform() {
    const c = document.getElementById("nsk-map-canvas");
    if (c) {
      c.style.transform = "translate(" + mapView.x + "px," + mapView.y + "px) scale(" + mapView.scale + ")";
      // 缩放分层：先显示已探明节点，再显示星座标签；远景保留星域名作索引。
      c.classList.toggle("show-nodes", mapView.scale >= NODE_LABEL_SHOW_SCALE);
      c.classList.toggle("show-const", mapView.scale >= CONST_SHOW_SCALE);
    }
  }

  function renderView() {
    const fn = { starmap: viewStarMap, system: viewSystem, base: viewBase, warehouse: viewWarehouse, members: viewMembers, factions: viewFactions, story: viewStory, report: viewReport, settings: viewSettings }[tab];
    const html = fn ? fn() : "";
    // 内容无变化（如星图缓存命中、仅燃料后台回复）则不重设 innerHTML，
    // 避免 207 节点 SVG 每秒销毁重建导致的整图刷新 / 脉冲重播 / 视角闪烁。
    if (html === _lastViewHtml) return;
    _lastViewHtml = html;
    $view.innerHTML = html;
    if (tab === "starmap") applyMapTransform();   // 重建后保持平移/缩放视角
  }

  function renderTabs() {
    // 剧情有未播完的一屏 → 「剧情」标签挂红点，提示玩家回去继续
    const S = storyRuntime();
    const storyActive = !!(S && S.hasActive(state));
    $tabs.innerHTML = TABS.map(t => {
      const dot = (t.id === "story" && storyActive) ? '<i class="tab-dot"></i>' : "";
      return '<div class="tab' + (t.id === tab ? " on" : "") + '" data-act="tab:' + t.id + '">' + t.name + dot + "</div>";
    }).join("");
  }

  // ---------- 交互 ----------
  function onAction(act, e) {
    hideNodeMenu();   // 任何操作先收起星图节点浮层
    const [cmd, a, b] = act.split(":");
    if (cmd === "tab") { closeNpcDetail(); closeWhDetail(); tab = a; renderTabs(); renderView(); return; }
    if (cmd === "story") {
      const S = storyRuntime();
      if (!S) return;
      if (a === "next") {
        const r = S.advance(state);
        if (!r.ok) { if (r.err === "need-choice") toast("这一句要先做选择"); return; }
        if (r.done) toast("章节结束");
      } else if (a === "choice") {
        const r = S.choose(state, parseInt(b, 10));
        if (!r.ok) { toast(r.err); return; }
        const g = storyEffText(r.effect);
        if (g) toast(g);
        else if (r.done) toast("章节结束");
      } else if (a === "start") {
        const r = S.start(state, b);
        if (!r.ok) { toast(r.err); return; }
      } else if (a === "reset") {
        S.resetProgress(state);
        toast("剧情进度已重置");
      }
      renderTabs(); renderView();   // 播放进度会影响页签红点，两个都要刷
      return;
    }
    if (cmd === "wh") {
      if (a === "toggle") whShowEmpty = !whShowEmpty;
      else warehouseFilter = a;
      renderView(); return;
    }
    if (cmd === "whinfo") { openWhDetail(a); return; }
    if (cmd === "npc") { openNpcDetail(a); return; }
    if (cmd === "fire") { pendingFireId = a; openNpcDetail(a); return; }
    if (cmd === "fire_confirm") {
      const r = Engine.State.fireMember(state, a);
      pendingFireId = null;
      if (r.ok) { closeNpcDetail(); toast("已解雇 " + (r.member && r.member.name || "该成员")); }
      else if (r.err === "not-found") toast("该成员已不在名册");
      return;
    }
    if (cmd === "fire_cancel") { pendingFireId = null; openNpcDetail(a); return; }
    if (cmd === "sys") { curSystem = a; tab = "system"; renderTabs(); renderView(); return; }
    if (cmd === "toggleActivity") { toggleActivityDrawer(); return; }
    if (cmd === "openSettings") { openSettings(); return; }
    if (cmd === "nodeinfo") { openNodeMenu(a, e); return; }
    if (cmd === "body") { showBody(a, b); return; }
    if (cmd === "baseinfo") { baseFocus = a || "core"; renderView(); return; }
    if (cmd === "closePop") { hidePop(); return; }
    if (cmd === "assignBody") {
      const [nodeId, bodyId, type] = [a, b, act.split(":")[3]];
      const mid = (document.getElementById("body-mem") || {}).value || "";
      const oreId = (document.getElementById("body-ore") || {}).value || "";
      if (mid) Engine.Dispatch.assign(state, mid, type, { nodeId: nodeId, bodyId: bodyId, oreId: oreId || null });
      hidePop();
    }
    if (cmd === "move") Engine.Settle.moveBase(state, a);
    else if (cmd === "squadAdd") Engine.Dispatch.squadAdd(state, a);
    else if (cmd === "squadRemove") Engine.Dispatch.squadRemove(state, a);
    else if (cmd === "squadDeploy") Engine.Dispatch.squadDeploy(state, a);
    else if (cmd === "squadRecall") Engine.Dispatch.squadRecall(state);
    else if (cmd === "squadUpgrade") doSquadUpgrade();
    else if (cmd === "upgrade") {
      const r = Engine.Base.upgradeCore(state);
      if (r.ok) pushReport("舰基升级 · " + r.plan.name + " Lv." + r.plan.lv,
        ["核心升至 Lv." + r.plan.lv + "（" + r.plan.name + "）。",
         "电网预算 +" + (r.plan.energy) + "，工业槽 精炼 " + r.plan.smelt + " / 制造 " + r.plan.manufacture + " / 发明 " + r.plan.invent + "。"]);
    } else if (cmd === "baseBlueprint") Engine.Base.buyBlueprint(state, a);
    else if (cmd === "baseHull") { Engine.Base.switchHull(state, a); baseFocus = "core"; }
    else if (cmd === "moduleInstall") { Engine.Base.installModule(state, a, b); baseFocus = a; }
    else if (cmd === "moduleRemove") { Engine.Base.uninstallModule(state, a); baseFocus = a; }
    else if (cmd === "enqueue") Engine.Production.enqueue(state, a, b, 1);
    else if (cmd === "build") {
      const r = Engine.Production.buildShip(state, a);
      if (r.ok) toast("开始建造 " + r.ship.name);
      else toast(r.err);
    }
    else if (cmd === "booster") {
      if ((state.res.credits || 0) < BOOSTER_COST.credits) toast("星币不足，无法激活增强剂");
      else {
        const r = Engine.Booster.apply(state, a, BOOSTER_LEVEL, BOOSTER_DURATION);
        if (r.ok) {
          state.res.credits -= BOOSTER_COST.credits;
          const def = Data.Ships.baseModuleByType(a);
          pushReport("增强剂激活 · " + (def ? def.name : a),
            ["已对「" + (def ? def.name : a) + "」舱段施加 Lv." + r.level + " 增强剂，持续 " + BOOSTER_DURATION + "s。",
             "该舱段工业队列加速 ×" + (1 + 0.1 * r.level).toFixed(2) + "（耗时 -" + Math.round(0.1 * r.level * 100) + "%）。"]);
          toast("已激活 " + (def ? def.name : a) + " 增强剂 Lv." + r.level);
        }
      }
    }
    else if (cmd === "dispatch") Engine.Dispatch.assign(state, a, b, { nodeId: state.base.nodeId });
    else if (cmd === "recall") {
      Engine.Dispatch.recall(state, a);
      // 天体面板开着时原地刷新，避免显示过期的在岗名单
      if ($pop.classList.contains("show") && $pop.dataset.nodeId) showBody($pop.dataset.nodeId, $pop.dataset.bodyId);
    }
    else if (cmd === "site_deploy") {
      const S = Engine.Sites;
      const r = S ? S.deploy(state, a, b) : { ok: false, reason: "模块未加载" };
      if (r.ok) {
        const nd = Data.StarMap.nodeById(state.starMap, a);
        pushReport("行星设施 · 部署采集装置", ["已在「" + (nd ? nd.name : a) + "」行星部署采集装置 Lv1。", "装置持续把产物累积到行星缓冲；回本星系回收，或派物流岗自动回收。"]);
        toast("采集装置已部署");
      } else toast(r.reason || "部署失败");
      if ($pop.classList.contains("show") && $pop.dataset.nodeId) showBody($pop.dataset.nodeId, $pop.dataset.bodyId);
    }
    else if (cmd === "site_upgrade") {
      const S = Engine.Sites;
      const r = S ? S.upgrade(state, b) : { ok: false, reason: "模块未加载" };
      if (r.ok) toast("采集装置已升级");
      else toast(r.reason || "升级失败");
      if ($pop.classList.contains("show") && $pop.dataset.nodeId) showBody($pop.dataset.nodeId, $pop.dataset.bodyId);
    }
    else if (cmd === "site_collect") {
      const S = Engine.Sites;
      const r = S ? S.collect(state, b) : { ok: false, reason: "模块未加载" };
      if (r.ok) toast("回收 " + (resName(r.resKey) || "产物") + " ×" + fmt(Math.floor(r.amount)));
      else toast(r.reason || "回收失败");
      if ($pop.classList.contains("show") && $pop.dataset.nodeId) showBody($pop.dataset.nodeId, $pop.dataset.bodyId);
    }
    else if (cmd === "recruit_hub") { openRecruitHub(); }
    else if (cmd === "recruit_pick") {
      if (!Engine.Recruit) return;
      const r = Engine.Recruit.recruit(state, a);
      if (r.ok) { toast("已招募 " + r.member.name); refreshRecruitHubBody(); }
      else if (r.reason === "roster-full") toast("名册已满（20）");
    }
    else if (cmd === "recruit_reroll") {
      if (!Engine.Recruit) return;
      const r = Engine.Recruit.reroll(state, Data, Date.now());
      if (r.ok) refreshRecruitHubBody();
      else toast("星币不足，无法换批");
    }
    else if (cmd === "recruit_ad") {
      if (!Engine.Recruit) return;
      Engine.Recruit.reroll(state, Data, Date.now(), { free: true }); // 广告位：观看广告免费换一批（演示占位）
      refreshRecruitHubBody();
      toast("（演示）广告位占位 · 正式版接入广告 SDK 后观看广告免费刷新");
    }
    else if (cmd === "deliver") Engine.Faction.deliverQuest(state, a, b);
    else if (cmd === "attempt") {
      // 派遣突发任务：从对应 select 取当前选中的团员
      const sel = document.querySelector('.mbr-sel[data-qid="' + b + '"]');
      const mid = sel ? sel.value : "";
      Engine.Faction.attemptMission(state, a, b, mid);
    }
    else if (cmd === "goalgive") {
      const m = state.members.find(x => x.id === a);
      const gi = parseInt(b, 10);
      if (m && m.goals && m.goals[gi]) window.NSK.Engine.Npc.completeGiveItem(state, m, m.goals[gi]);
      openNpcDetail(a); // 刷新弹层（反映已达成）
    }
    else if (cmd === "goalship") {
      const m = state.members.find(x => x.id === a);
      const gi = parseInt(b, 10);
      if (m && m.goals && m.goals[gi]) window.NSK.Engine.Npc.completeBindShip(state, m, m.goals[gi]);
      openNpcDetail(a);
    }
    else if (cmd === "evopt") {
      // 待决事件选项：uid + 选项下标
      const N = (typeof window !== "undefined" && window.NSK.Narrative) || null;
      const list = state.pendingEvents || [];
      const p = list.find(x => x.uid === a);
      if (!N || !p) return;
      const ev = N.findById(p.eventId);
      if (!ev) { state.pendingEvents = list.filter(x => x.uid !== a); return; }
      const idx = parseInt(b, 10);
      const r = N.resolveOption(state, ev, idx, p.memberId, null);
      if (!r.ok) { toast(r.err); return; }
      state.pendingEvents = list.filter(x => x.uid !== a);
      if (r.next) {
        const nxt = N.findById(r.next);
        if (nxt) Engine.Settle.enqueuePending(state, nxt, p.memberId, Date.now());
      }
      toast((r.success === false ? "失败 · " : r.success === true ? "成功 · " : "") + r.title);
    }
    else if (cmd === "mastery") {
      if (!Engine.Mastery) return;
      const r = Engine.Mastery.spend(state, a);
      if (r.ok) toast("已强化「" + ((Engine.Mastery.NODES.find(n => n.id === a) || {}).name || a) + "」→ Lv." + r.level);
      else toast(r.err);
    }
    else if (cmd === "save_now") {
      let ok = false;
      try { ok = Core.save(state); } catch (err) { ok = false; }
      if (Persistence && Persistence.save) { try { Persistence.save(state); } catch (err) { /* 云同步失败不影响本地 */ } }
      lastManualSaveAt = Date.now();
      toast(ok ? "已保存到本地" : "保存失败：当前环境不支持持久化");
    }
    else if (cmd === "set_export_code") {
      if (!Persistence) { toast("存档服务未加载"); return; }
      try { settingsCode = Persistence.exportCode(false); toast("存档码已生成（NSK1.）"); }
      catch (err) { toast("生成失败：" + (err && err.message ? err.message : err)); }
    }
    else if (cmd === "set_copy_code") { copyToClipboard(settingsCode); }
    else if (cmd === "set_export_file") {
      doExportFile();
      toast("已导出存档文件");
    }
    else if (cmd === "set_import_code") {
      const ta = document.getElementById("set-code-area");
      const text = ta ? String(ta.value || "").trim() : String(settingsCode || "").trim();
      if (!text) { toast("请先生成或粘贴存档码"); return; }
      applyImported(text, "存档码");
    }
    else if (cmd === "delete_save") { pendingDeleteSave = true; renderView(); return; }
    else if (cmd === "delete_cancel") { pendingDeleteSave = false; renderView(); return; }
    else if (cmd === "delete_confirm") {
      pendingDeleteSave = false;
      toast("正在删除存档…");
      const p = Persistence && Persistence.deleteSave ? Promise.resolve(Persistence.deleteSave()) : Promise.resolve(Core.wipe());
      p.then(function () { setTimeout(function () { location.reload(); }, 400); })
        .catch(function () { location.reload(); });
      return; // 删除后绝不能再次 save（否则白删）
    }
    // 立即结算一次 + 刷新，避免等待下一 tick
    Engine.Settle.settle(state, Date.now());
    renderHUD(); renderView();
    if ($actDrawer.classList.contains("show")) renderActivityDrawer();   // 抽屉开着则同步刷新成员动态
    if (Persistence) Persistence.save(state); else Core.save(state);
  }

  function bind() {
    // 设置页签的「导入存档文件」：file input 的 change 需要单独委托（click 委托接不到）
    document.addEventListener("change", function (e) {
      if (e.target && e.target.id === "set-import-file") doImportFile(e);
    });
    document.addEventListener("click", e => {
      // 轻点/拖拽收尾的误触：抑制窗口内、且不是点在菜单自身的点击，全部吞掉。
      // 关键：setPointerCapture 会把轻点后的 click 目标重定向到 $view 容器，若只判断
      // 「落在星图内」会漏掉——重定向的 click.target 是 $view（starmap-wrap 的父级），
      // 它不在 starmap-wrap 之内，反而会一路走到 hideNodeMenu() 把刚打开的菜单秒关。
      // 故改为「窗口内且目标不在菜单内则抑制」，菜单按钮（在 $nodePop 内）不受影响。
      if (Date.now() < suppressClickUntil && !$nodePop.contains(e.target)) return;
      const el = e.target.closest("[data-act]");
      if (el) { onAction(el.getAttribute("data-act"), e); return; }
      const info = e.target.closest(".hover-info-btn");
      if (info) { showPop(info); return; }
      if (!$pop.contains(e.target)) hidePop();
      if (!$nodePop.contains(e.target)) hideNodeMenu();
      if ($actDrawer.classList.contains("show") && !$actDrawer.contains(e.target) && !e.target.closest('[data-act="toggleActivity"]')) hideActivityDrawer();
    });

    // 派遣任务选人 → 实时刷新预测成功率
    $view.addEventListener("change", e => {
      const sysSel = e.target.closest(".sys-sel");
      if (sysSel) { curSystem = sysSel.value; renderView(); return; }
      const sel = e.target.closest(".mbr-sel");
      if (!sel) return;
      const qid = sel.getAttribute("data-qid");
      const fid = sel.getAttribute("data-fid");
      const f = state.factions.find(x => x.id === fid);
      const q = f && f.quests.find(x => x.id === qid);
      const m = state.members.find(x => x.id === sel.value);
      const ch = document.getElementById("chance_" + qid);
      if (q && m && ch) ch.textContent = "成功率 " + Math.round(Engine.Faction.missionSuccessChance(m, q) * 100) + "%";
    });

    // 星图拖拽平移 + 滚轮/双指缩放（指针事件同时覆盖鼠标/触屏）
    const pointers = new Map();   // pointerId -> {x,y}
    let pinch = null;             // { startDist, startScale }
    $view.addEventListener("pointerdown", e => {
      const w = e.target.closest(".starmap-wrap");
      if (!w) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { $view.setPointerCapture(e.pointerId); } catch (_) { }
      if (pointers.size === 2) {
        const p = [...pointers.values()];
        pinch = { startDist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, startScale: mapView.scale };
        mapDrag = null; // 进入双指缩放，取消单指拖拽
      } else if (pointers.size === 1) {
        mapDrag = { sx: e.clientX, sy: e.clientY, ox: mapView.x, oy: mapView.y };
      }
    });
    $view.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const p = [...pointers.values()];
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        mapView.scale = Core.clamp(pinch.startScale * (d / pinch.startDist), 0.5, 3.2);
        applyMapTransform();
      } else if (mapDrag) {
        mapView.x = mapDrag.ox + (e.clientX - mapDrag.sx);
        mapView.y = mapDrag.oy + (e.clientY - mapDrag.sy);
        applyMapTransform();
      }
    });
    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      const wasDragging = mapDrag;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (wasDragging) {
          const dx = e.clientX - wasDragging.sx, dy = e.clientY - wasDragging.sy;
          if (Math.abs(dx) > 10 || Math.abs(dy) > 10) suppressClickUntil = Date.now() + 350; // 真拖拽：抑制随后的误触 click
          else {
            // 轻点（位移 < 10px）= 点击节点。用真实命中测试绕过 pointer capture 把 click 目标重定向到容器的坑，
            // 否则在触屏/捕获下 click.target 会变成 $view，closest("[data-act]") 取不到节点，菜单打不开。
            const hit = document.elementFromPoint(e.clientX, e.clientY);
            const g = hit && hit.closest ? hit.closest('[data-act^="nodeinfo:"]') : null;
            if (g) {
              // 吞掉随后被重定向到 $view 的那个 click，避免它被文档委托当成「浮层外点击」而关掉刚打开的菜单。
              // 仅抑制星图内的点击，菜单按钮在星图外不受影响。
              suppressClickUntil = Date.now() + 350;
              onAction(g.getAttribute("data-act"), e);
            }
          }
        }
        mapDrag = null;
      } else if (pointers.size === 1) {
        // 双指松开一指后，剩一指转为拖拽基准，避免跳变
        const [pt] = [...pointers.values()];
        mapDrag = { sx: pt.x, sy: pt.y, ox: mapView.x, oy: mapView.y };
      }
    }
    $view.addEventListener("pointerup", endPointer);
    $view.addEventListener("pointercancel", endPointer);
    $view.addEventListener("wheel", e => {
      if (!e.target.closest(".starmap-wrap")) return;
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      mapView.scale = Core.clamp(mapView.scale * f, 0.5, 3.2);
      applyMapTransform();
    }, { passive: false });
  }
  function showPop(el) {
    $pop.textContent = el.getAttribute("data-info");
    const r = el.getBoundingClientRect();
    $pop.style.left = Math.min(window.innerWidth - 270, r.left) + "px";
    $pop.style.top = (r.top - $pop.offsetHeight - 8 < 0 ? r.bottom + 8 : r.top - $pop.offsetHeight - 8) + "px";
    $pop.classList.add("show");
  }
  function hidePop() { $pop.classList.remove("show"); }

  // 星图节点浮层：查看星系 + 跃迁（跃迁按可达性 / 燃料决定可用状态）
  function hideNodeMenu() { if ($nodePop) $nodePop.classList.remove("show"); }
  function openNodeMenu(nodeId, e) {
    const map = state.starMap;
    const node = Data.StarMap.nodeById(map, nodeId);
    if (!$nodePop || !node || !node.discovered) return;
    const cur = state.base.nodeId;
    const isCur = nodeId === cur;
    const adj = Data.StarMap.adjacency(map);
    const edge = (adj[cur] || []).find(x => x.to === nodeId);
    const fuelCost = edge ? edge.fuelCost : null;
    const canWarp = !!edge && state.base.fuel >= fuelCost;
    const region = (map.regions || []).find(r => r.id === node.region) || null;
    const slName = region && region.secLevel ? (Data.StarMap.SECLEVEL_TABLE[region.secLevel] || {}).name : "";
    let html = '<div class="np-head"><b>' + esc(node.name) + "</b></div>";
    html += '<div class="np-sub dim">' + (region ? esc(region.name) : "") + (slName ? " · " + slName : "") + (isCur ? " · 当前所在" : "") + "</div>";
    html += '<div class="np-acts">';
    html += '<button class="sm" data-act="sys:' + nodeId + '">查看星系</button>';
    if (isCur) {
      html += '<button class="sm" disabled>跃迁（当前所在）</button>';
    } else if (!edge) {
      html += '<button class="sm" disabled>非直达 · 不可跃迁</button>';
    } else if (!canWarp) {
      html += '<button class="sm" disabled>跃迁 ⛽' + fuelCost + '（燃料不足）</button>';
    } else {
      html += '<button class="sm primary" data-act="move:' + nodeId + '">跃迁 ⛽' + fuelCost + "</button>";
    }
    html += "</div>";
    $nodePop.innerHTML = html;
    $nodePop.classList.add("show");
    // 在点击处就近定位（viewport 钳制，避免溢出）
    const pw = $nodePop.offsetWidth, ph = $nodePop.offsetHeight;
    let left = e ? e.clientX : window.innerWidth / 2;
    let top = e ? e.clientY + 14 : 80;
    left = Math.min(Math.max(8, left), window.innerWidth - pw - 8);
    top = Math.min(Math.max(8, top), window.innerHeight - ph - 8);
    $nodePop.style.left = left + "px";
    $nodePop.style.top = top + "px";
  }

  // ---------- 设置 / 存档面板 ----------
  let settingsPollTimer = null;
  function $(id) { return document.getElementById(id); }
  function relTime(ts) {
    const d = Date.now() - ts;
    if (d < 60000) return "刚刚";
    if (d < 3600000) return Math.floor(d / 60000) + " 分钟前";
    if (d < 86400000) return Math.floor(d / 3600000) + " 小时前";
    return Math.floor(d / 86400000) + " 天前";
  }
  function hintSettings(msg) { const el = $("nsk-settings-hint"); if (el) el.textContent = msg; }

  function bindSettings() {
    const sc = $("nsk-settings-close"); if (sc) sc.addEventListener("click", closeSettings);
    const exp = $("nsk-export-code"); if (exp) exp.addEventListener("click", doExportCode);
    const copy = $("nsk-copy-code"); if (copy) copy.addEventListener("click", doCopyCode);
    const imp = $("nsk-import-code"); if (imp) imp.addEventListener("click", doImportCode);
    const expf = $("nsk-export-file"); if (expf) expf.addEventListener("click", doExportFile);
    const impf = $("nsk-import-file"); if (impf) impf.addEventListener("change", doImportFile);
    const del = $("nsk-delete-save"); if (del) del.addEventListener("click", doDeleteSave);
    // 云端冲突弹窗
    const cl = $("nsk-conflict-local"); if (cl) cl.addEventListener("click", function () { resolveCloud("local"); });
    const cc = $("nsk-conflict-cloud"); if (cc) cc.addEventListener("click", function () { resolveCloud("cloud"); });
  }

  function openSettings() {
    refreshCloudStatus();
    const ov = $("nsk-settings"); if (ov) ov.classList.add("show");
    if (settingsPollTimer) clearInterval(settingsPollTimer);
    settingsPollTimer = setInterval(refreshCloudStatus, 2000);
  }
  function closeSettings() {
    const ov = $("nsk-settings"); if (ov) ov.classList.remove("show");
    if (settingsPollTimer) { clearInterval(settingsPollTimer); settingsPollTimer = null; }
  }
  function refreshCloudStatus() {
    const el = $("nsk-cloud-status"); if (!el || !Persistence) return;
    const s = Persistence.getCloudStatus();
    let txt, cls = "";
    if (!s.available) { txt = "云存档：不可用（本地模式）"; cls = "warn"; }
    else if (s.busy) { txt = "云存档：同步中…"; cls = "busy"; }
    else if (s.state === "error") { txt = "云存档：同步出错（本地档安全）"; cls = "err"; }
    else if (s.lastSuccessfulSyncAt) { txt = "云存档：已连接 · 上次同步 " + relTime(s.lastSuccessfulSyncAt); cls = "ok"; }
    else { txt = "云存档：已连接 · 等待首次同步"; cls = "ok"; }
    el.textContent = txt;
    el.className = "nsk-cloud-status " + cls;
  }

  function doExportCode() {
    if (!Persistence) return;
    try {
      const code = Persistence.exportCode(false);
      const area = $("nsk-code-area"); if (area) area.value = code;
      const copy = $("nsk-copy-code"); if (copy) copy.disabled = false;
      const imp = $("nsk-import-code"); if (imp) imp.disabled = false;
      hintSettings("已生成存档码（NSK1.），可复制发送到其他设备或好友。");
    } catch (e) { hintSettings("生成失败：" + (e && e.message ? e.message : e)); }
  }
  function doCopyCode() {
    const area = $("nsk-code-area"); if (!area) return;
    const text = area.value;
    if (!text) { hintSettings("请先生成存档码。"); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { hintSettings("已复制到剪贴板。"); }, function () { fallbackCopy(text); });
      } else fallbackCopy(text);
    } catch (e) { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    const area = $("nsk-code-area");
    if (!area) return;
    area.removeAttribute("readonly"); area.select();
    try { document.execCommand("copy"); hintSettings("已复制（兼容模式）。"); } catch (e) { hintSettings("复制失败，请手动选择文本复制。"); }
    area.setAttribute("readonly", "");
  }
  // 通用复制（设置页签用，不依赖 overlay 的 textarea）
  function copyToClipboard(text) {
    if (!text) { toast("没有可复制的内容"); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { toast("已复制到剪贴板"); },
          function () { toast("复制失败，请手动选中文本复制"); }
        );
        return;
      }
    } catch (e) { /* fall through */ }
    toast("复制失败，请手动选中文本复制");
  }
  function doImportCode() {
    const area = $("nsk-code-area"); if (!area) return;
    const text = area.value.trim();
    if (!text) { hintSettings("请先粘贴存档码。"); return; }
    applyImported(text, "存档码");
  }
  function doExportFile() {
    if (!Persistence) return;
    try {
      const text = Persistence.exportFileText();
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url; a.download = "nsk-save-" + ts + ".json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      hintSettings("已导出存档文件（含校验信封）。");
    } catch (e) { hintSettings("导出失败：" + (e && e.message ? e.message : e)); }
  }
  function doImportFile(e) {
    const file = e && e.target && e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () { applyImported(String(reader.result || ""), "存档文件"); };
    reader.onerror = function () { hintSettings("读取文件失败。"); };
    reader.readAsText(file);
    if (e.target) e.target.value = ""; // 允许重复选择同一文件
  }
  function applyImported(text, label) {
    if (!Persistence) return;
    try {
      const st = Persistence.importFromText(text);
      if (!st || typeof st !== "object") throw new Error("解析结果为空");
      state = st;
      curSystem = st.base.nodeId;
      Persistence.save(state);
      renderTabs(); renderHUD(); renderView();
      if ($actDrawer.classList.contains("show")) renderActivityDrawer();
      hintSettings(label + "导入成功，已应用到当前存档。");
      toast(label + "导入成功");
    } catch (e) { hintSettings("导入失败：" + (e && e.message ? e.message : e)); toast("导入失败：" + (e && e.message ? e.message : e)); }
  }
  function doDeleteSave() {
    if (!confirm("确定删除本机存档吗？此操作不可恢复（云端存档也会一并删除）。")) return;
    hintSettings("正在删除…");
    Promise.resolve(Persistence ? Persistence.deleteSave() : Promise.resolve(true)).then(function () {
      hintSettings("已删除，正在重启…");
      setTimeout(function () { location.reload(); }, 400);
    }).catch(function () { location.reload(); });
  }

  // 启动存档冲突（本地 vs 云端）弹窗
  function showCloudConflict(info) {
    const body = $("nsk-conflict-body");
    if (body) {
      const lt = info && info.localSavedAt ? new Date(info.localSavedAt).toLocaleString() : "未知";
      const ct = info && info.cloudSavedAt ? new Date(info.cloudSavedAt).toLocaleString() : "未知";
      body.innerHTML = '<p>检测到本机与云端存档不一致，且无法自动判断哪边更新。请选择保留哪一份（另一份不会被立即删除，但下次同步以你选择的一份为准）：</p>'
        + '<div class="nsk-conflict-cards">'
        + '<div class="nsk-cc-card"><b>本机存档</b><span class="dim">' + esc(lt) + '</span></div>'
        + '<div class="nsk-cc-card"><b>云端存档</b><span class="dim">' + esc(ct) + '</span></div>'
        + '</div>';
    }
    const ov = $("nsk-cloud-conflict"); if (ov) ov.classList.add("show");
  }
  function resolveCloud(choice) {
    if (!Persistence) return;
    const ov = $("nsk-cloud-conflict"); if (ov) ov.classList.remove("show");
    Promise.resolve(Persistence.resolveConflict(choice)).then(function (st) {
      state = st;
      if (Engine.Base && Engine.Base.normalize) Engine.Base.normalize(state);
      curSystem = st.base.nodeId;
      renderTabs(); renderHUD(); renderView();
      if ($actDrawer.classList.contains("show")) renderActivityDrawer();
      hintSettings("已采用" + (choice === "cloud" ? "云端" : "本机") + "存档。");
    });
  }

  // ---------- 主循环 ----------
  async function boot() {
    // 存储预载：TapTap 沙盒的 getStorage 是异步的，而 Core.load() 是同步的 →
    // 启动时先把存档读进内存镜像，之后同步读才拿得到（浏览器 localStorage 下是空操作）。
    const Storage = (NSK.Core && NSK.Core.Storage) || null;
    if (Storage && Storage.preload && Core && Core.SAVE_KEY) {
      try { await Storage.preload(Core.SAVE_KEY); } catch (e) { /* 存储不可用则走新档 */ }
    }
    const portraits = NSK.UI && NSK.UI.Portraits;
    const portraitsReady = portraits ? portraits.loadManifest().catch(() => null) : Promise.resolve(null);
    let res = null;
    if (Persistence) {
      res = await Persistence.bootstrap({ now: Date.now() });
      state = res.state;
    } else {
      state = Core.load();
    }
    await portraitsReady;
    if (!state) { state = Engine.State.defaultState(Date.now(), Data); if (Persistence) Persistence.save(state); else Core.save(state); }
    if (Engine.Base && Engine.Base.normalize) Engine.Base.normalize(state);
    if (Engine.Recruit) Engine.Recruit.ensureRecruitState(state, Data, Date.now()); // 招募中心补档 + 生成首批候选
    // 剧情：补齐 state.story（旧档没这个字段也能直接跑）+ 找首个 trigger:"firstBoot" 且未看过的场景自动开播
    const StoryMod = storyRuntime();
    let storyAuto = null;
    if (StoryMod) { StoryMod.ensure(state); storyAuto = StoryMod.autoStart(state); }
    curSystem = state.base.nodeId;
    const h = (location.hash || "").replace("#", "");
    if (TABS.some(t => t.id === h)) tab = h;   // 支持 #base / #members 等直达（调试/分享）
    else if (storyAuto && storyAuto.started) tab = "story";   // 开局无指定页时直接推到序章
    renderTabs(); renderHUD(); renderView();
    bind();
    bindSettings();
    // 4Hz：结算 + HUD；1Hz：视图
    setInterval(() => {
      if (Engine.Recruit) Engine.Recruit.refreshDue(state, Data, Date.now()); // 招募中心 4h 自然刷新（免费、清零手动次数）
      Engine.Settle.settle(state, Date.now());
      renderHUD();
    }, 250);
    setInterval(() => { renderView(); }, 1000);
    setInterval(() => { if (Persistence) Persistence.save(state); else Core.save(state); }, 5000);
    // 启动存档冲突（本地 vs 云端）弹窗
    if (res && res.needsChoice) showCloudConflict(res.conflict);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
