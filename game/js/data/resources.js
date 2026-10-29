// ================================================================
// 深空星疆 —— Data.Resources：资源注册表
// 续作 Path B：复用 EVE-IDLE「IP 去相似化」解耦显示名（铁硅原矿/赤镍矿…星币/苍穹劫团…），
// 内部键用 ASCII 稳定键（fe_ore 等），代码层不出现任何 EVE 裸名（凡晶石/veldspar/ISK 等）。
// 资源 = 顶层(星币/燃料/声望) + 矿石(ore) + 矿材(mineral) + 部件(component) + 图纸(blueprint)
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Resources = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Resources = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 顶层资源（HUD 常驻）
  const TOP = {
    credits: { id: "credits", name: "星币", icon: "💠", cat: "top", desc: "军团流通货币，用于制造、招募与势力交易。" },
    fuel:    { id: "fuel",    name: "跃迁燃料", icon: "⛽", cat: "top", desc: "跃迁燃料，派遣小队与基地迁移的消耗品，容量随舰基等级提升。" },
    rep:     { id: "rep",     name: "宇宙声望", icon: "⭐", cat: "top", desc: "宇宙声望，向势力交付物资累积，可在声望商店兑换奖励物品与装备。" },
  };

  // 矿石（节点产出，受 tier + abundance；显示名复用 EVE-IDLE 解耦名）
  // img 指向本地 WebP 图标（assets/icons/，按内部 ASCII 键命名）；icon 保留 emoji 作文本场景回退
  const ORE = {
    fe_ore: { id: "fe_ore", name: "铁硅原矿", icon: "🔹", img: "assets/icons/ores/fe_ore.webp", cat: "ore", tier: 1, desc: "一阶基础矿石，恒星系常见，精炼产出标准钛材。" },
    ni_ore: { id: "ni_ore", name: "赤镍矿",   icon: "🔸", img: "assets/icons/ores/ni_ore.webp", cat: "ore", tier: 1, desc: "一阶基础矿石，精炼产出银镍合金。" },
    bo_ore: { id: "bo_ore", name: "蓝硼晶",   icon: "🔷", img: "assets/icons/ores/bo_ore.webp", cat: "ore", tier: 2, desc: "二阶矿石，精炼产出同位复材。" },
    mx_ore: { id: "mx_ore", name: "同位晶簇", icon: "⬡", img: "assets/icons/ores/mx_ore.webp", cat: "ore", tier: 2, desc: "二阶矿石，精炼产出晶格聚合物。" },
    no_ore: { id: "no_ore", name: "诺瓦矿",   icon: "🟠", img: "assets/icons/ores/no_ore.webp", cat: "ore", tier: 3, desc: "三阶矿石，精炼产出诺瓦陶金。" },
    zr_ore: { id: "zr_ore", name: "重锆岩",   icon: "🟤", img: "assets/icons/ores/zr_ore.webp", cat: "ore", tier: 3, desc: "三阶矿石，精炼产出重锆晶材。" },
    px_ore: { id: "px_ore", name: "极星矿",   icon: "⭐", img: "assets/icons/ores/px_ore.webp", cat: "ore", tier: 4, desc: "四阶稀有矿石，精炼产出奇点合金与暗质晶核。" },
  };

  // 气体（气云产出，受 tier；复用 EVE-IDLE 7 气体系：粗制富勒烯→氦同位素→稳定富勒烯→氢同位素→高纯富勒烯→聚合气体→超纯聚合气体，按解锁层级分带）
  const GAS = {
    crude_fullerene:    { id: "crude_fullerene",    name: "粗制富勒烯",   icon: "☁", img: "assets/icons/gases/crude_fullerene.webp",    cat: "gas", tier: 1, desc: "一阶气体，气云采集，富勒烯链起点。" },
    he_gas:            { id: "he_gas",            name: "氦同位素",     icon: "🌫", img: "assets/icons/gases/he_gas.webp",            cat: "gas", tier: 2, desc: "二阶同位素气体，气云采集。" },
    stable_fullerene:  { id: "stable_fullerene",  name: "稳定富勒烯",   icon: "🌫", img: "assets/icons/gases/stable_fullerene.webp",  cat: "gas", tier: 2, desc: "二阶富勒烯，由气云采集，精炼链中段。" },
    hy_gas:            { id: "hy_gas",            name: "氢同位素",     icon: "☁", img: "assets/icons/gases/hy_gas.webp",            cat: "gas", tier: 3, desc: "三阶同位素气体，气云采集。" },
    high_purity_fullerene: { id: "high_purity_fullerene", name: "高纯富勒烯", icon: "🌬", img: "assets/icons/gases/high_purity_fullerene.webp", cat: "gas", tier: 3, desc: "三阶富勒烯，高纯气体炼制产物。" },
    poly_gas:          { id: "poly_gas",          name: "聚合气体",     icon: "❄", img: "assets/icons/gases/poly_gas.webp",          cat: "gas", tier: 4, desc: "四阶聚合气体，气云高阶产物。" },
    ultra_pure_poly_gas: { id: "ultra_pure_poly_gas", name: "超纯聚合气体", icon: "❄", img: "assets/icons/gases/ultra_pure_poly_gas.webp", cat: "gas", tier: 4, desc: "四阶超纯聚合气体，气云顶端产物。" },
  };

  // 矿材（矿石精炼产出，与 ore 1:1 对应；px_ore 额外产暗质晶核）
  const MINERAL = {
    fe_alloy:    { id: "fe_alloy",    name: "标准钛材",   icon: "🟦", img: "assets/icons/minerals/fe_alloy.webp", cat: "mineral", from: "fe_ore",  desc: "标准钛材，由铁硅原矿精炼，制造部件的基础材料。" },
    ni_alloy:    { id: "ni_alloy",    name: "银镍合金",   icon: "🟧", img: "assets/icons/minerals/ni_alloy.webp", cat: "mineral", from: "ni_ore",  desc: "银镍合金，由赤镍矿精炼。" },
    bo_alloy:    { id: "bo_alloy",    name: "同位复材",   icon: "🟩", img: "assets/icons/minerals/bo_alloy.webp", cat: "mineral", from: "bo_ore",  desc: "同位复材，由蓝硼晶精炼。" },
    mx_alloy:    { id: "mx_alloy",    name: "晶格聚合物", icon: "🟪", img: "assets/icons/minerals/mx_alloy.webp", cat: "mineral", from: "mx_ore",  desc: "晶格聚合物，由同位晶簇精炼。" },
    no_alloy:    { id: "no_alloy",    name: "诺瓦陶金",   icon: "🟧", img: "assets/icons/minerals/no_alloy.webp", cat: "mineral", from: "no_ore",  desc: "诺瓦陶金，由诺瓦矿精炼。" },
    zr_alloy:    { id: "zr_alloy",    name: "重锆晶材",   icon: "🟫", img: "assets/icons/minerals/zr_alloy.webp", cat: "mineral", from: "zr_ore",  desc: "重锆晶材，由重锆岩精炼。" },
    px_alloy:    { id: "px_alloy",    name: "奇点合金",   icon: "🟥", img: "assets/icons/minerals/px_alloy.webp", cat: "mineral", from: "px_ore",  desc: "奇点合金，由极星矿精炼。" },
    morph_alloy: { id: "morph_alloy", name: "暗质晶核",   icon: "🟣", img: "assets/icons/minerals/morph_alloy.webp", cat: "mineral", from: "px_ore", desc: "暗质晶核，极星矿精炼的稀有副产物。" },
  };

  // 行星产物（MVP 瘦移植 EVE-IDLE PLANET_TYPES 数据模型，2026-10-26 B 决策）：
  // 六类行星各产 1 种专属产物，挂到星系内 planet 天体上，由 Engine.Sites 采集装置时间戳结算产出（EVE 式收菜）。
  // 不搬 EVE-IDLE 殖民 Canvas / 维护费 mini-game；产物 tier 沿用 EVE-IDLE 各行星 level 语义。
  // 试玩（stage1）只生成 lava/gas/ice → 仅 planet_lava/planet_gas/planet_ice 实际可出；
  // plasma/temperate/storm 产物随 stage2 区域开放（与星图锁定一致）。
  // img 暂留空（无图标资产），resIcon 自动回退 emoji，避免试玩期出现裂图。
  const PLANET = {
    planet_lava: { id: "planet_lava", name: "熔岩矿粹",   icon: "🌋", cat: "planet", planetType: "lava",       tier: 1, desc: "熔岩行星产物，富含重金属，采集装置产出。" },
    planet_gas:  { id: "planet_gas",  name: "凝析轻气",   icon: "💨", cat: "planet", planetType: "gas",        tier: 1, desc: "气态行星产物，稀有气体凝析，采集装置产出。" },
    planet_ice:  { id: "planet_ice",  name: "极地同位素", icon: "🧊", cat: "planet", planetType: "ice",        tier: 2, desc: "冰行星产物，极地同位素，采集装置产出。" },
    planet_plasma:{ id: "planet_plasma", name: "等离子流体", icon: "⚡", cat: "planet", planetType: "plasma",   tier: 3, desc: "等离子行星产物，stage2 解锁。" },
    planet_bio:  { id: "planet_bio",  name: "生态基质",   icon: "🌿", cat: "planet", planetType: "temperate",  tier: 4, desc: "温带行星产物，生物质基质，stage2 解锁。" },
    planet_mag:  { id: "planet_mag",  name: "磁聚合物",   icon: "🧲", cat: "planet", planetType: "storm",      tier: 4, desc: "风暴行星产物，磁场聚合物，stage2 解锁。" },
  };

  // 月矿（卫星开采专属稀有金属，系统暂未落地：先注册显示名与图标，不进 ALL / HUD_ORDER / 初始库存）
  const MOON_ORE = {
    ga_moon: { id: "ga_moon", name: "镓", icon: "⚪", img: "assets/icons/moon-ores/gallium.webp", cat: "moon_ore", tier: 4, desc: "月矿稀有金属，卫星开采产出。" },
    pt_moon: { id: "pt_moon", name: "铂", icon: "⚪", img: "assets/icons/moon-ores/platinum.webp", cat: "moon_ore", tier: 4, desc: "月矿稀有金属，卫星开采产出。" },
    hf_moon: { id: "hf_moon", name: "铪", icon: "⚪", img: "assets/icons/moon-ores/hafnium.webp", cat: "moon_ore", tier: 4, desc: "月矿稀有金属，卫星开采产出。" },
    os_moon: { id: "os_moon", name: "锇", icon: "⚪", img: "assets/icons/moon-ores/osmium.webp", cat: "moon_ore", tier: 4, desc: "月矿稀有金属，卫星开采产出。" },
    pm_moon: { id: "pm_moon", name: "钷", icon: "⚪", img: "assets/icons/moon-ores/promethium.webp", cat: "moon_ore", tier: 4, desc: "月矿稀有金属，卫星开采产出。" },
    rb_moon: { id: "rb_moon", name: "铷", icon: "⚪", img: "assets/icons/moon-ores/rubidium.webp", cat: "moon_ore", tier: 4, desc: "月矿稀有金属，卫星开采产出。" },
  };

  // 部件（矿材制造产出）
  // 显示名与图标复用 EVE-IDLE 基础版三件套（综合舰体组件 / 动力控制核心 / 舰船功能组件），
  // 内部键保持 ASCII（struct/prop/weapon，符合 IP 解耦铁律），机制不变。
  const COMPONENT = {
    struct: { id: "struct", name: "综合舰体组件", icon: "🛡", img: "assets/icons/ship-components/base_hull.webp",      cat: "component", desc: "综合舰体组件，由标准钛材制造，舰船总装的结构主体。" },
    prop:   { id: "prop",   name: "动力控制核心", icon: "⚙", img: "assets/icons/ship-components/base_powercore.webp", cat: "component", desc: "动力控制核心，由银镍合金制造，为舰船提供推进与能源。" },
    weapon: { id: "weapon", name: "舰船功能组件", icon: "🔧", img: "assets/icons/ship-components/base_func.webp",      cat: "component", desc: "舰船功能组件，由同位复材制造，承载武器与作战系统。" },
  };

  // 图纸（发明产出，可自用或交付势力）
  const BLUEPRINT = {
    bp: { id: "bp", name: "改装图纸", icon: "📐", cat: "blueprint", desc: "改装图纸，由发明产出，可自用制造可装配装备或交付势力领取奖励。" },
  };

  const ALL = Object.assign({}, TOP, ORE, GAS, MINERAL, COMPONENT, BLUEPRINT, PLANET);

  // 仓库初始资源
  function startingResources() {
    return {
      credits: 20000,
      fuel: 100,
      rep: 0,
      fe_ore: 200, ni_ore: 120, bo_ore: 0, mx_ore: 0, no_ore: 0, zr_ore: 0, px_ore: 0,
      hy_gas: 0, he_gas: 0, crude_fullerene: 0, stable_fullerene: 0, high_purity_fullerene: 0, poly_gas: 0, ultra_pure_poly_gas: 0,
      fe_alloy: 60, ni_alloy: 40, bo_alloy: 0, mx_alloy: 0, no_alloy: 0, zr_alloy: 0, px_alloy: 0, morph_alloy: 0,
      struct: 10, prop: 6, weapon: 4,
      bp: 0,
      planet_lava: 0, planet_gas: 0, planet_ice: 0, planet_plasma: 0, planet_bio: 0, planet_mag: 0,
    };
  }

  // 资源元信息（HUD 顺序）
  const HUD_ORDER = ["credits", "fuel", "rep",
    "fe_ore", "ni_ore", "bo_ore", "mx_ore", "no_ore", "zr_ore", "px_ore",
    "crude_fullerene", "he_gas", "stable_fullerene", "hy_gas", "high_purity_fullerene", "poly_gas", "ultra_pure_poly_gas",
    "fe_alloy", "ni_alloy", "bo_alloy", "mx_alloy", "no_alloy", "zr_alloy", "px_alloy", "morph_alloy",
    "struct", "prop", "weapon", "bp",
    "planet_lava", "planet_gas", "planet_ice", "planet_plasma", "planet_bio", "planet_mag"];

  function meta(id) { return ALL[id]; }

  return { TOP, ORE, GAS, MINERAL, MOON_ORE, COMPONENT, BLUEPRINT, PLANET, ALL, HUD_ORDER, startingResources, meta };
});
