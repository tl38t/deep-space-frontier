// ================================================================
// 深空星疆 —— Data.Ships：舰船定义 + 造船厂(bodyLevel)门禁
// 门禁机制：base.bodyLevel 即舰基本体的造船厂等级（§11），逐舰种门禁见 SHIPS 表。
// tier→bodyLevel 映射：Lv1 空间站→护卫/驱逐；Lv2 星堡→巡洋/战列巡洋；
//   Lv3 星城→战列/旗舰；Lv4 深空要塞→泰坦。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Ships = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Ships = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // classTier 与 bodyLevel 门禁；舰名复用 EVE-IDLE 解耦显示名（启程级/星矛级…），泰坦沿用原创名
  // hp = 该舰三防满载（成员绑定舰船后 hp 上限即此值，见 state.makeMember）
  // 舰种门禁：bodyLevelReq 采用 0-based，与 BODY_LEVELS 下标、state.base.bodyLevel 起始值 0 对齐（2026-10-27 修 off-by-one）。
  //   frigate/destroyer 可在起始本体（空间站 Lv1，bodyLevel=0）直接建造；
  //   cruiser/battlecruiser 需升级核心一次（星堡 Lv2）；battleship/capital 需 Lv3；supercapital 需 Lv4。
    const SHIPS = {
      rookie_corvette: { id:"rookie_corvette", name:"启程级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":1,"power_core":1,"functional_system":1}, buildTime:30, xp:30, slots:4, dodge:22, hp:{shield:240,armor:80,structure:80}, archaeologyScanStrength:0, fuelEfficiency:1 },
      rifter: { id:"rifter", name:"星矛级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:25, hp:{shield:300,armor:100,structure:100}, archaeologyScanStrength:0, fuelEfficiency:1 },
      kestrel: { id:"kestrel", name:"铁卫级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:22, hp:{shield:100,armor:300,structure:100}, archaeologyScanStrength:0, fuelEfficiency:0.9 },
      atron: { id:"atron", name:"闪刃级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:30, hp:{shield:100,armor:100,structure:300}, archaeologyScanStrength:0, fuelEfficiency:0.95 },
      raylight: { id:"raylight", name:"雷光级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:8, dodge:18, hp:{shield:600,armor:150,structure:150}, archaeologyScanStrength:0, fuelEfficiency:0.95 },
      spearfalcon: { id:"spearfalcon", name:"矛隼级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:8, dodge:16, hp:{shield:150,armor:600,structure:150}, archaeologyScanStrength:0, fuelEfficiency:0.85 },
      swiftblade: { id:"swiftblade", name:"疾锋级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:8, dodge:22, hp:{shield:150,armor:150,structure:600}, archaeologyScanStrength:0, fuelEfficiency:0.9 },
      gale: { id:"gale", name:"疾风级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":4,"destroyer_power_core":4,"destroyer_functional_system":5}, buildTime:60, xp:90, slots:8, dodge:26, hp:{shield:660,armor:165,structure:165}, archaeologyScanStrength:0, fuelEfficiency:0.95 },
      bloodthorn: { id:"bloodthorn", name:"血刺级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":4,"destroyer_power_core":4,"destroyer_functional_system":5}, buildTime:60, xp:90, slots:8, dodge:12, hp:{shield:165,armor:660,structure:165}, archaeologyScanStrength:0, fuelEfficiency:0.85 },
      umbra: { id:"umbra", name:"暗影级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":4,"destroyer_power_core":4,"destroyer_functional_system":5}, buildTime:60, xp:90, slots:8, dodge:24, hp:{shield:165,armor:165,structure:660}, archaeologyScanStrength:0, fuelEfficiency:0.9 },
      dawnlight: { id:"dawnlight", name:"曙光级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:12, dodge:12, hp:{shield:1300,armor:250,structure:250}, archaeologyScanStrength:0, fuelEfficiency:0.9 },
      warfalcon: { id:"warfalcon", name:"战隼级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:12, dodge:10, hp:{shield:300,armor:1200,structure:300}, archaeologyScanStrength:0, fuelEfficiency:0.8 },
      stormblade: { id:"stormblade", name:"烈锋级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:12, dodge:15, hp:{shield:200,armor:200,structure:1400}, archaeologyScanStrength:0, fuelEfficiency:0.85 },
      thunder: { id:"thunder", name:"雷霆级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":5,"cruiser_power_core":5,"cruiser_functional_system":6}, buildTime:90, xp:140, slots:12, dodge:17, hp:{shield:1380,armor:345,structure:345}, archaeologyScanStrength:0, fuelEfficiency:0.9 },
      crimson: { id:"crimson", name:"猩红级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":5,"cruiser_power_core":5,"cruiser_functional_system":6}, buildTime:90, xp:140, slots:12, dodge:14, hp:{shield:375,armor:1320,structure:375}, archaeologyScanStrength:0, fuelEfficiency:0.8 },
      nether: { id:"nether", name:"幽冥级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":5,"cruiser_power_core":5,"cruiser_functional_system":6}, buildTime:90, xp:140, slots:12, dodge:18, hp:{shield:285,armor:285,structure:1500}, archaeologyScanStrength:0, fuelEfficiency:0.85 },
      sunlance: { id:"sunlance", name:"曜光级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:15, dodge:8, hp:{shield:2600,armor:500,structure:500}, archaeologyScanStrength:0, fuelEfficiency:0.85 },
      fortfalcon: { id:"fortfalcon", name:"堡隼级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:15, dodge:6, hp:{shield:550,armor:2500,structure:550}, archaeologyScanStrength:0, fuelEfficiency:0.75 },
      thunderblade: { id:"thunderblade", name:"震锋级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:15, dodge:10, hp:{shield:400,armor:400,structure:2800}, archaeologyScanStrength:0, fuelEfficiency:0.8 },
      dawnbreaker: { id:"dawnbreaker", name:"破晓级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:120, xp:200, slots:15, dodge:13, hp:{shield:3300,armor:510,structure:510}, archaeologyScanStrength:0, fuelEfficiency:0.85 },
      crimson_bastion: { id:"crimson_bastion", name:"赤垒级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:120, xp:200, slots:15, dodge:8, hp:{shield:660,armor:3000,structure:660}, archaeologyScanStrength:0, fuelEfficiency:0.75 },
      spectre_frame: { id:"spectre_frame", name:"幽构级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:120, xp:200, slots:15, dodge:5, hp:{shield:460,armor:460,structure:3400}, archaeologyScanStrength:0, fuelEfficiency:0.8 },
      firmament: { id:"firmament", name:"天穹级", classTier:3, bodyLevelReq:2, cost:{"capital_integrated_hull":10,"capital_power_core":8,"capital_functional_system":8}, buildTime:300, xp:450, slots:18, dodge:5, hp:{shield:4400,armor:800,structure:800}, archaeologyScanStrength:0, fuelEfficiency:0.78 },
      heavy_bastion: { id:"heavy_bastion", name:"重垒级", classTier:3, bodyLevelReq:2, cost:{"capital_integrated_hull":10,"capital_power_core":8,"capital_functional_system":8}, buildTime:300, xp:450, slots:18, dodge:3, hp:{shield:900,armor:4200,structure:900}, archaeologyScanStrength:0, fuelEfficiency:0.68 },
      riftbreaker: { id:"riftbreaker", name:"裂界级", classTier:3, bodyLevelReq:2, cost:{"capital_integrated_hull":10,"capital_power_core":8,"capital_functional_system":8}, buildTime:300, xp:450, slots:18, dodge:7, hp:{shield:700,armor:700,structure:4600}, archaeologyScanStrength:0, fuelEfficiency:0.73 },
      starcrown: { id:"starcrown", name:"星冕级", classTier:4, bodyLevelReq:3, cost:{"supercapital_integrated_hull":18,"supercapital_power_core":16,"supercapital_functional_system":18}, buildTime:600, xp:800, slots:22, dodge:3, hp:{shield:6200,armor:1100,structure:1100}, archaeologyScanStrength:0, fuelEfficiency:0.72 },
      eternal_fortress: { id:"eternal_fortress", name:"恒城级", classTier:4, bodyLevelReq:3, cost:{"supercapital_integrated_hull":18,"supercapital_power_core":16,"supercapital_functional_system":18}, buildTime:600, xp:800, slots:22, dodge:2, hp:{shield:1250,armor:5900,structure:1250}, archaeologyScanStrength:0, fuelEfficiency:0.62 },
      arbiter: { id:"arbiter", name:"裁决级", classTier:4, bodyLevelReq:3, cost:{"supercapital_integrated_hull":18,"supercapital_power_core":16,"supercapital_functional_system":18}, buildTime:600, xp:800, slots:22, dodge:5, hp:{shield:950,armor:950,structure:6500}, archaeologyScanStrength:0, fuelEfficiency:0.67 },
      heron: { id:"heron", name:"觅迹级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:22, hp:{shield:260,armor:80,structure:60}, archaeologyScanStrength:10, fuelEfficiency:1 },
      tracer: { id:"tracer", name:"追迹级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:7, dodge:18, hp:{shield:430,armor:150,structure:120}, archaeologyScanStrength:25, fuelEfficiency:0.95 },
      starmap: { id:"starmap", name:"星图级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:10, dodge:14, hp:{shield:780,armor:300,structure:220}, archaeologyScanStrength:50, fuelEfficiency:0.9 },
      farscope: { id:"farscope", name:"远镜级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:13, dodge:9, hp:{shield:1400,armor:600,structure:400}, archaeologyScanStrength:80, fuelEfficiency:0.85 },
      illuminator: { id:"illuminator", name:"启明级", classTier:3, bodyLevelReq:2, cost:{"capital_integrated_hull":10,"capital_power_core":8,"capital_functional_system":10}, buildTime:320, xp:500, slots:16, dodge:6, hp:{shield:2900,armor:1100,structure:800}, archaeologyScanStrength:120, fuelEfficiency:0.8 },
    };

  // 舰船装配槽位布局（2026-10-31 舰船装配系统）：把原有扁平 slots 拆成 high/mid/low/rig 四槽，总数与 slots 对齐。
  // 深空星疆成员以单舰执行全部活动，故每艘舰都给到考古/战斗/工业可共用的槽位；装配加成由 Engine.Archaeology / Combat / Production 读取。
    const SLOT_LAYOUT = {
      rookie_corvette: { high:2, mid:1, low:1, rig:0 },
      rifter: { high:2, mid:2, low:1, rig:1 },
      kestrel: { high:2, mid:1, low:2, rig:1 },
      atron: { high:2, mid:1, low:2, rig:1 },
      raylight: { high:3, mid:3, low:1, rig:1 },
      spearfalcon: { high:3, mid:1, low:3, rig:1 },
      swiftblade: { high:3, mid:1, low:3, rig:1 },
      gale: { high:3, mid:3, low:1, rig:1 },
      bloodthorn: { high:3, mid:1, low:3, rig:1 },
      umbra: { high:3, mid:1, low:3, rig:1 },
      dawnlight: { high:4, mid:4, low:2, rig:2 },
      warfalcon: { high:4, mid:2, low:4, rig:2 },
      stormblade: { high:4, mid:2, low:4, rig:2 },
      thunder: { high:4, mid:4, low:2, rig:2 },
      crimson: { high:4, mid:2, low:4, rig:2 },
      nether: { high:4, mid:2, low:4, rig:2 },
      sunlance: { high:5, mid:5, low:2, rig:3 },
      fortfalcon: { high:5, mid:2, low:5, rig:3 },
      thunderblade: { high:5, mid:2, low:5, rig:3 },
      dawnbreaker: { high:5, mid:5, low:2, rig:3 },
      crimson_bastion: { high:5, mid:2, low:5, rig:3 },
      spectre_frame: { high:5, mid:2, low:5, rig:3 },
      firmament: { high:6, mid:6, low:2, rig:4 },
      heavy_bastion: { high:6, mid:2, low:6, rig:4 },
      riftbreaker: { high:6, mid:2, low:6, rig:4 },
      starcrown: { high:7, mid:7, low:3, rig:5 },
      eternal_fortress: { high:7, mid:3, low:7, rig:5 },
      arbiter: { high:7, mid:3, low:7, rig:5 },
      heron: { high:2, mid:2, low:1, rig:1 },
      tracer: { high:3, mid:2, low:1, rig:1 },
      starmap: { high:3, mid:3, low:2, rig:2 },
      farscope: { high:4, mid:4, low:2, rig:3 },
      illuminator: { high:4, mid:5, low:3, rig:4 },
    };
  function slotLayout(shipId) {
    const base = SLOT_LAYOUT[shipId] || { high: 1, mid: 1, low: 0, rig: 0 };
    return { high: base.high, mid: base.mid, low: base.low, rig: base.rig };
  }
  // 槽位总数（= 原 slots）
  function totalSlots(shipId) {
    const l = slotLayout(shipId);
    return l.high + l.mid + l.low + l.rig;
  }

  // 单个能源舱的发电输出（供能）。与 BODY_LEVELS[i].energy（本体外壳电网基础容量）共同构成总预算。
  const ENERGY_OUTPUT = 100;

  // 舰基母舰蓝图：每艘船的舱位拓扑各异；核心独立于船体，模块可在同类舱位间拆装。
  // energy 字段 = 该模块运行时电力占用（⚡ 能源舱自身为 0，其发电见 ENERGY_OUTPUT）。
  // 占用数值为 MVP 提议值（周四标定，E 项），后续可按平衡微调。
  const BASE_MODULES = {
    energy:      { type: "energy",      name: "能源舱",   icon: "⚡", color: "#e7b45d", desc: "发电并稳定工业电网。", energy: 0 },
    cargo:       { type: "cargo",       name: "仓储舱",   icon: "▣",  color: "#79a9ff", desc: "周转矿石、矿材与舰船组件。", energy: 5 },
    smelt:       { type: "smelt",       name: "精炼环",   icon: "⚗",  color: "#67d4a1", desc: "将采集矿石转化为矿材。", energy: 20 },
    manufacture: { type: "manufacture", name: "总装船坞", icon: "⌬",  color: "#42d6e8", desc: "制造舰船组件与整舰。", energy: 30 },
    // 2026-11-03 新增：装备制造独立成舱（此前内联在舰基页，与总装坞共用槽位）。
    // energy 15 = 提议值，介于泊位 10 与精炼环 20 之间（开局已超预算，尽量少再加棕化）。
    equip:       { type: "equip",       name: "制造车间", icon: "⚒",  color: "#e08a5a", desc: "制造装备与改装件，独立产线。", energy: 15 },
    invent:      { type: "invent",      name: "发明舱",   icon: "◇",  color: "#b28cff", desc: "研发改装图纸与高级配方。", energy: 40 },
    dock:        { type: "dock",        name: "舰队泊位", icon: "◈",  color: "#b28cff", desc: "停泊与维护舰队。", energy: 10 },
    command:     { type: "command",     name: "指挥塔",   icon: "⌁",  color: "#e8c46a", desc: "统筹成员、舰队与基地行动。", energy: 10 },
    habitat:     { type: "habitat",     name: "居住舱",   icon: "⌂",  color: "#ef7b87", desc: "供成员生活与训练。", energy: 10 },
    booster:     { type: "booster",     name: "反应实验室", icon: "⚗", color: "#c98bff", desc: "制造增强剂瓶身（反应实验室）。", energy: 25 },
  };

  const BASE_HULLS = [
    {
      id: "hull_frontier", name: "拓荒者级", factionId: "settlers", tagline: "边境通用母舰",
      shape: "frontier", accent: "#b5c46a", bodyLevelReq: 0, relationReq: 0, blueprintCost: {},
      specialSlot: { id: "smelt", name: "矿脉导流舱", queue: "smelt", speedMult: 0.94, effect: "精炼耗时 -6%" },
      layout: { core:[3,3], energy:[3,1], cargo:[4,3], smelt:[4,4], manufacture:[3,2], invent:[2,2], dock:[2,3], command:[3,4], habitat:[3,5], booster:[5,5], equip:[4,2] },
    },
    {
      id: "hull_angel_raider", name: "苍穹掠袭舰", factionId: "angel", tagline: "高速突入 / 分散舱列",
      shape: "raider", accent: "#5ad1a0", bodyLevelReq: 0, relationReq: 0, blueprintCost: { credits: 8000 },
      specialSlot: { id: "manufacture", name: "战利品快装位", queue: "manufacture", speedMult: 0.90, effect: "制造耗时 -10%" },
      layout: { core:[3,3], energy:[3,2], cargo:[3,1], smelt:[4,1], manufacture:[2,2], invent:[2,3], dock:[2,4], command:[3,4], habitat:[4,4], booster:[5,5], equip:[1,2] },
    },
    {
      id: "hull_blood_oath", name: "赤誓堡垒舰", factionId: "blood", tagline: "纵向装甲 / 中轴指挥",
      shape: "bastion", accent: "#e879a8", bodyLevelReq: 0, relationReq: 8, blueprintCost: { credits: 18000 },
      specialSlot: { id: "manufacture", name: "军规装配位", queue: "manufacture", speedMult: 0.88, effect: "制造耗时 -12%" },
      layout: { core:[3,3], energy:[3,2], cargo:[2,3], smelt:[1,3], manufacture:[4,3], invent:[3,1], dock:[5,3], command:[2,4], habitat:[4,4], booster:[5,5], equip:[4,2] },
    },
    {
      id: "hull_mining_ark", name: "矿脉工造方舟", factionId: "mining_guild", tagline: "宽幅工业翼 / 矿冶强化",
      shape: "ark", accent: "#b5793f", bodyLevelReq: 0, relationReq: 4, blueprintCost: { credits: 12000 },
      specialSlot: { id: "smelt", name: "深层熔炼槽", queue: "smelt", speedMult: 0.84, effect: "精炼耗时 -16%" },
      layout: { core:[3,3], energy:[3,2], cargo:[4,2], smelt:[4,3], manufacture:[4,4], invent:[2,2], dock:[5,3], command:[3,4], habitat:[2,4], booster:[5,5], equip:[4,5] },
    },
    {
      id: "hull_salvage_union", name: "残骸拼接舰", factionId: "salvage_union", tagline: "非对称拼装 / 模块外露",
      shape: "salvage", accent: "#c9772e", bodyLevelReq: 0, relationReq: 4, blueprintCost: { credits: 16000 },
      specialSlot: { id: "manufacture", name: "回收件快装位", queue: "manufacture", speedMult: 0.90, effect: "制造耗时 -10%" },
      layout: { core:[3,3], energy:[3,2], cargo:[4,2], smelt:[5,2], manufacture:[4,3], invent:[2,3], dock:[2,4], command:[3,4], habitat:[4,4], booster:[5,5], equip:[5,3] },
    },
    {
      id: "hull_lone_star", name: "孤星商队母舰", factionId: "lone_star", tagline: "紧凑货运 / 双侧生产线",
      shape: "caravan", accent: "#d8c07a", bodyLevelReq: 0, relationReq: 8, blueprintCost: { credits: 24000 },
      specialSlot: { id: "cargo", name: "冷链货运接口", queue: "manufacture", speedMult: 0.91, effect: "制造耗时 -9%" },
      layout: { core:[3,3], energy:[3,2], cargo:[4,2], smelt:[4,3], manufacture:[2,3], invent:[2,2], dock:[5,3], command:[2,4], habitat:[3,4], booster:[5,5], equip:[1,3] },
    },
    {
      id: "hull_abyssal", name: "深空研习母舰", factionId: "abyssal_inst", tagline: "环形实验区 / 发明强化",
      shape: "research", accent: "#9b8fd0", bodyLevelReq: 1, relationReq: 12, blueprintCost: { credits: 32000 },
      specialSlot: { id: "invent", name: "先驱遗物实验位", queue: "invent", speedMult: 0.82, effect: "发明耗时 -18%" },
      layout: { core:[3,3], energy:[3,2], cargo:[4,2], smelt:[4,3], manufacture:[3,4], invent:[2,2], dock:[2,3], command:[2,4], habitat:[4,4], booster:[5,5], equip:[3,5] },
    },
    {
      id: "hull_bounty", name: "悬赏者突击母舰", factionId: "bounty_league", tagline: "箭形舰首 / 前线总装",
      shape: "spear", accent: "#b02a1f", bodyLevelReq: 0, relationReq: 8, blueprintCost: { credits: 20000 },
      specialSlot: { id: "manufacture", name: "前线换装位", queue: "manufacture", speedMult: 0.88, effect: "制造耗时 -12%" },
      layout: { core:[3,3], energy:[3,2], cargo:[3,1], smelt:[4,1], manufacture:[4,2], invent:[2,3], dock:[4,3], command:[2,4], habitat:[3,4], booster:[5,5], equip:[5,2] },
    },
  ];

  function baseHullById(id) { return BASE_HULLS.find(h => h.id === id) || null; }
  function baseModuleByType(type) { return BASE_MODULES[type] || null; }
  function baseHullSlots(hullOrId) {
    const hull = typeof hullOrId === "string" ? baseHullById(hullOrId) : hullOrId;
    if (!hull) return [];
    const slots = Object.keys(BASE_MODULES).map(type => ({
      id: type, type: type, x: hull.layout[type][0], y: hull.layout[type][1],
      special: hull.specialSlot && hull.specialSlot.id === type ? hull.specialSlot : null,
    }));
    slots.push({ id: "core", type: "core", x: hull.layout.core[0], y: hull.layout.core[1] });
    return slots;
  }
  function createInitialBase() {
    const owned = Object.keys(BASE_MODULES).map(type => ({ id: "module_" + type + "_01", type: type }));
    return {
      coreId: "base_core_01", hullId: "hull_frontier", ownedHullBlueprints: ["hull_frontier"],
      modules: {
        owned: owned,
        installed: owned.map(m => ({ slotId: m.type, moduleId: m.id })),
      },
    };
  }

  // 各级本体电网基础容量（energy）。总供能预算 = 本项 + 已装能源舱数 × ENERGY_OUTPUT。MVP 提议值，待标定。
  // booster = 反应实验室制造队列槽位（增强剂制造）。起步 1 槽可用（与精炼/总装同级），随本体升级扩容。
  // equip = 制造车间队列槽位（装备制造，2026-11-03 从总装坞独立出来）。曲线与 booster 一致（1/1/2/3）。
  const BODY_LEVELS = [
    { lv: 1, name: "空间站",   smelt: 1, manufacture: 1, invent: 0, booster: 1, equip: 1, energy: 80 },
    { lv: 2, name: "星堡",     smelt: 2, manufacture: 2, invent: 1, booster: 1, equip: 1, energy: 180 },
    { lv: 3, name: "星城",     smelt: 3, manufacture: 3, invent: 2, booster: 2, equip: 2, energy: 320 },
    { lv: 4, name: "深空要塞", smelt: 3, manufacture: 3, invent: 3, booster: 3, equip: 3, energy: 520 },
  ];

  function bodyLevelPlan(lv) { return BODY_LEVELS[Math.max(0, Math.min(3, lv))] || BODY_LEVELS[0]; }
  function canBuildAt(shipId, bodyLevel) {
    const s = SHIPS[shipId];
    return !!s && bodyLevel >= s.bodyLevelReq;
  }
  function shipsAtLevel(bodyLevel) {
    return Object.values(SHIPS).filter(s => s.bodyLevelReq <= bodyLevel)
      .sort((a, b) => a.classTier - b.classTier);
  }
  function shipById(id) { return SHIPS[id] || null; }
  // 舰船三防满载（成员 hp 上限来源）
  function maxHp(shipId) {
    const s = SHIPS[shipId];
    return s ? { shield: s.hp.shield, armor: s.hp.armor, structure: s.hp.structure }
             : { shield: 100, armor: 100, structure: 100 };
  }
  function upgradeCost(lv) {
    // lv = 当前等级，返回升到下一级的代价
    const COST = { 0: { credits: 5000, fe_alloy: 100 }, 1: { credits: 20000, ni_alloy: 150, struct: 40 }, 2: { credits: 60000, bo_alloy: 300, struct: 120 }, 3: { credits: 200000, px_alloy: 400, struct: 300 } };
    return COST[lv] || null;
  }

  return { SHIPS, BODY_LEVELS, bodyLevelPlan, canBuildAt, shipsAtLevel, shipById, maxHp, upgradeCost, ENERGY_OUTPUT,
    SLOT_LAYOUT, slotLayout, totalSlots,
    BASE_MODULES, BASE_HULLS, baseHullById, baseModuleByType, baseHullSlots, createInitialBase };
});
