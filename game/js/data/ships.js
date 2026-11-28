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
      rookie_corvette: { id:"rookie_corvette", name:"启程级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":1,"power_core":1,"functional_system":1}, buildTime:30, xp:30, slots:4, dodge:22, hp:{shield:240,armor:80,structure:80}, archaeologyScanStrength:0, fuelEfficiency:1, bonuses:{shieldCapacity:0.05,laserDamage:0.02,missileDamage:0.02,cannonDamage:0.02} },
      rifter: { id:"rifter", name:"星矛级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:25, hp:{shield:300,armor:100,structure:100}, archaeologyScanStrength:0, fuelEfficiency:1, bonuses:{shieldCapacity:0.1,laserDamage:0.05} },
      kestrel: { id:"kestrel", name:"铁卫级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:22, hp:{shield:100,armor:300,structure:100}, archaeologyScanStrength:0, fuelEfficiency:0.9, bonuses:{armorCapacity:0.1,missileDamage:0.05} },
      atron: { id:"atron", name:"闪刃级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:30, hp:{shield:100,armor:100,structure:300}, archaeologyScanStrength:0, fuelEfficiency:0.95, bonuses:{structureCapacity:0.1,cannonDamage:0.05,structureRepair:2,structureEmergencyRepair:1} },
      raylight: { id:"raylight", name:"雷光级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:8, dodge:18, hp:{shield:600,armor:150,structure:150}, archaeologyScanStrength:0, fuelEfficiency:0.95, bonuses:{shieldCapacity:0.15,laserDamage:0.1,hitBonus:10} },
      spearfalcon: { id:"spearfalcon", name:"矛隼级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:8, dodge:16, hp:{shield:150,armor:600,structure:150}, archaeologyScanStrength:0, fuelEfficiency:0.85, bonuses:{armorCapacity:0.15,missileDamage:0.1,hitBonus:10,armorRepair:0.5} },
      swiftblade: { id:"swiftblade", name:"疾锋级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:8, dodge:22, hp:{shield:150,armor:150,structure:600}, archaeologyScanStrength:0, fuelEfficiency:0.9, bonuses:{structureCapacity:0.15,cannonDamage:0.1,hitBonus:10,structureRepair:2,structureEmergencyRepair:1} },
      gale: { id:"gale", name:"疾风级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":4,"destroyer_power_core":4,"destroyer_functional_system":5}, buildTime:60, xp:90, slots:8, dodge:26, hp:{shield:660,armor:165,structure:165}, archaeologyScanStrength:0, fuelEfficiency:0.95, bonuses:{shieldCapacity:0.2,laserDamage:0.15,hitBonus:10} },
      bloodthorn: { id:"bloodthorn", name:"血刺级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":4,"destroyer_power_core":4,"destroyer_functional_system":5}, buildTime:60, xp:90, slots:8, dodge:12, hp:{shield:165,armor:660,structure:165}, archaeologyScanStrength:0, fuelEfficiency:0.85, bonuses:{armorCapacity:0.2,missileDamage:0.15,hitBonus:10,armorRepair:0.5} },
      umbra: { id:"umbra", name:"暗影级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":4,"destroyer_power_core":4,"destroyer_functional_system":5}, buildTime:60, xp:90, slots:8, dodge:24, hp:{shield:165,armor:165,structure:660}, archaeologyScanStrength:0, fuelEfficiency:0.9, bonuses:{structureCapacity:0.2,cannonDamage:0.15,hitBonus:10,structureRepair:2,structureEmergencyRepair:1} },
      dawnlight: { id:"dawnlight", name:"曙光级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:12, dodge:12, hp:{shield:1300,armor:250,structure:250}, archaeologyScanStrength:0, fuelEfficiency:0.9, bonuses:{shieldCapacity:0.2,laserDamage:0.15,hitBonus:15} },
      warfalcon: { id:"warfalcon", name:"战隼级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:12, dodge:10, hp:{shield:300,armor:1200,structure:300}, archaeologyScanStrength:0, fuelEfficiency:0.8, bonuses:{armorCapacity:0.2,missileDamage:0.15,hitBonus:15,armorRepair:0.5} },
      stormblade: { id:"stormblade", name:"烈锋级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:12, dodge:15, hp:{shield:200,armor:200,structure:1400}, archaeologyScanStrength:0, fuelEfficiency:0.85, bonuses:{structureCapacity:0.2,cannonDamage:0.15,hitBonus:15,structureRepair:2,structureEmergencyRepair:1} },
      thunder: { id:"thunder", name:"雷霆级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":5,"cruiser_power_core":5,"cruiser_functional_system":6}, buildTime:90, xp:140, slots:12, dodge:17, hp:{shield:1380,armor:345,structure:345}, archaeologyScanStrength:0, fuelEfficiency:0.9, bonuses:{shieldCapacity:0.25,laserDamage:0.2,hitBonus:15} },
      crimson: { id:"crimson", name:"猩红级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":5,"cruiser_power_core":5,"cruiser_functional_system":6}, buildTime:90, xp:140, slots:12, dodge:14, hp:{shield:375,armor:1320,structure:375}, archaeologyScanStrength:0, fuelEfficiency:0.8, bonuses:{armorCapacity:0.25,missileDamage:0.2,hitBonus:15,armorRepair:0.5} },
      nether: { id:"nether", name:"幽冥级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":5,"cruiser_power_core":5,"cruiser_functional_system":6}, buildTime:90, xp:140, slots:12, dodge:18, hp:{shield:285,armor:285,structure:1500}, archaeologyScanStrength:0, fuelEfficiency:0.85, bonuses:{structureCapacity:0.25,cannonDamage:0.2,hitBonus:15,structureRepair:2,structureEmergencyRepair:1} },
      sunlance: { id:"sunlance", name:"曜光级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:15, dodge:8, hp:{shield:2600,armor:500,structure:500}, archaeologyScanStrength:0, fuelEfficiency:0.85, bonuses:{shieldCapacity:0.25,laserDamage:0.2,hitBonus:20} },
      fortfalcon: { id:"fortfalcon", name:"堡隼级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:15, dodge:6, hp:{shield:550,armor:2500,structure:550}, archaeologyScanStrength:0, fuelEfficiency:0.75, bonuses:{armorCapacity:0.25,missileDamage:0.2,hitBonus:20,armorRepair:0.5} },
      thunderblade: { id:"thunderblade", name:"震锋级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:15, dodge:10, hp:{shield:400,armor:400,structure:2800}, archaeologyScanStrength:0, fuelEfficiency:0.8, bonuses:{structureCapacity:0.25,cannonDamage:0.2,hitBonus:20,structureRepair:2,structureEmergencyRepair:1} },
      dawnbreaker: { id:"dawnbreaker", name:"破晓级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:120, xp:200, slots:15, dodge:13, hp:{shield:3300,armor:510,structure:510}, archaeologyScanStrength:0, fuelEfficiency:0.85, bonuses:{shieldCapacity:0.3,laserDamage:0.25,hitBonus:20} },
      crimson_bastion: { id:"crimson_bastion", name:"赤垒级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:120, xp:200, slots:15, dodge:8, hp:{shield:660,armor:3000,structure:660}, archaeologyScanStrength:0, fuelEfficiency:0.75, bonuses:{armorCapacity:0.3,missileDamage:0.25,hitBonus:20,armorRepair:0.5} },
      spectre_frame: { id:"spectre_frame", name:"幽构级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:120, xp:200, slots:15, dodge:5, hp:{shield:460,armor:460,structure:3400}, archaeologyScanStrength:0, fuelEfficiency:0.8, bonuses:{structureCapacity:0.3,cannonDamage:0.25,hitBonus:20,structureRepair:2,structureEmergencyRepair:1} },
      firmament: { id:"firmament", name:"天穹级", classTier:3, bodyLevelReq:2, cost:{"capital_integrated_hull":10,"capital_power_core":8,"capital_functional_system":8}, buildTime:300, xp:450, slots:18, dodge:5, hp:{shield:4400,armor:800,structure:800}, archaeologyScanStrength:0, fuelEfficiency:0.78, bonuses:{shieldCapacity:0.3,laserDamage:0.25,hitBonus:25} },
      heavy_bastion: { id:"heavy_bastion", name:"重垒级", classTier:3, bodyLevelReq:2, cost:{"capital_integrated_hull":10,"capital_power_core":8,"capital_functional_system":8}, buildTime:300, xp:450, slots:18, dodge:3, hp:{shield:900,armor:4200,structure:900}, archaeologyScanStrength:0, fuelEfficiency:0.68, bonuses:{armorCapacity:0.3,missileDamage:0.25,hitBonus:25,armorRepair:0.5} },
      riftbreaker: { id:"riftbreaker", name:"裂界级", classTier:3, bodyLevelReq:2, cost:{"capital_integrated_hull":10,"capital_power_core":8,"capital_functional_system":8}, buildTime:300, xp:450, slots:18, dodge:7, hp:{shield:700,armor:700,structure:4600}, archaeologyScanStrength:0, fuelEfficiency:0.73, bonuses:{structureCapacity:0.3,cannonDamage:0.25,hitBonus:25,structureRepair:2,structureEmergencyRepair:1} },
      starcrown: { id:"starcrown", name:"星冕级", classTier:4, bodyLevelReq:3, cost:{"supercapital_integrated_hull":18,"supercapital_power_core":16,"supercapital_functional_system":18}, buildTime:600, xp:800, slots:22, dodge:3, hp:{shield:6200,armor:1100,structure:1100}, archaeologyScanStrength:0, fuelEfficiency:0.72, bonuses:{shieldCapacity:0.35,laserDamage:0.3,hitBonus:30} },
      eternal_fortress: { id:"eternal_fortress", name:"恒城级", classTier:4, bodyLevelReq:3, cost:{"supercapital_integrated_hull":18,"supercapital_power_core":16,"supercapital_functional_system":18}, buildTime:600, xp:800, slots:22, dodge:2, hp:{shield:1250,armor:5900,structure:1250}, archaeologyScanStrength:0, fuelEfficiency:0.62, bonuses:{armorCapacity:0.35,missileDamage:0.3,hitBonus:30,armorRepair:0.5} },
      arbiter: { id:"arbiter", name:"裁决级", classTier:4, bodyLevelReq:3, cost:{"supercapital_integrated_hull":18,"supercapital_power_core":16,"supercapital_functional_system":18}, buildTime:600, xp:800, slots:22, dodge:5, hp:{shield:950,armor:950,structure:6500}, archaeologyScanStrength:0, fuelEfficiency:0.67, bonuses:{structureCapacity:0.35,cannonDamage:0.3,hitBonus:30,structureRepair:2,structureEmergencyRepair:1} },
      heron: { id:"heron", name:"觅迹级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:22, hp:{shield:260,armor:80,structure:60}, archaeologyScanStrength:10, archaeologyFailureDamageReduction:0, fuelEfficiency:1 },
      tracer: { id:"tracer", name:"追迹级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:7, dodge:18, hp:{shield:430,armor:150,structure:120}, archaeologyScanStrength:25, archaeologyFailureDamageReduction:0.05, fuelEfficiency:0.95 },
      starmap: { id:"starmap", name:"星图级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:10, dodge:14, hp:{shield:780,armor:300,structure:220}, archaeologyScanStrength:50, archaeologyFailureDamageReduction:0.10, fuelEfficiency:0.9 },
      farscope: { id:"farscope", name:"远镜级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:13, dodge:9, hp:{shield:1400,armor:600,structure:400}, archaeologyScanStrength:80, archaeologyFailureDamageReduction:0.15, fuelEfficiency:0.85 },
      illuminator: { id:"illuminator", name:"启明级", classTier:3, bodyLevelReq:2, cost:{"capital_integrated_hull":10,"capital_power_core":8,"capital_functional_system":10}, buildTime:320, xp:500, slots:16, dodge:6, hp:{shield:2900,armor:1100,structure:800}, archaeologyScanStrength:120, archaeologyFailureDamageReduction:0.20, fuelEfficiency:0.8 },

      // ===== 工业舰（1 代 INDUSTRIAL_SHIPS × 11，忠实移植）=====
      // bonuses 仅搬运引擎真读的 3 个键：miningLaserEfficiency（采矿）/ gasLaserEfficiency（采气）/ smeltingSpeed（冶炼提速）。
      // 1 代另有 fleetMiningSpeed / pumpEfficiency（舰队聚合加成），需舰队子系统方可接线，本专项不搬，待后续专项接入。
      // 接轨点：settle.js 采矿产出 ×(1+舰船.miningLaserEfficiency|gasLaserEfficiency)；production.js smeltFit += 舰船.smeltingSpeed。
      miner_frigate: { id:"miner_frigate", name:"拓岩级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:20, hp:{shield:220,armor:75,structure:75}, archaeologyScanStrength:0, fuelEfficiency:1, bonuses:{miningLaserEfficiency:0.25} },
      gas_frigate: { id:"gas_frigate", name:"捕云级", classTier:1, bodyLevelReq:0, cost:{"integrated_hull":2,"power_core":2,"functional_system":2}, buildTime:30, xp:30, slots:6, dodge:20, hp:{shield:220,armor:75,structure:75}, archaeologyScanStrength:0, fuelEfficiency:1, bonuses:{gasLaserEfficiency:0.25} },
      miner_destroyer: { id:"miner_destroyer", name:"凿岩级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:7, dodge:16, hp:{shield:300,armor:150,structure:110}, archaeologyScanStrength:0, fuelEfficiency:0.95, bonuses:{miningLaserEfficiency:0.5} },
      gas_destroyer: { id:"gas_destroyer", name:"采集者级", classTier:1, bodyLevelReq:0, cost:{"destroyer_integrated_hull":3,"destroyer_power_core":3,"destroyer_functional_system":4}, buildTime:45, xp:60, slots:7, dodge:16, hp:{shield:300,armor:150,structure:110}, archaeologyScanStrength:0, fuelEfficiency:0.95, bonuses:{gasLaserEfficiency:0.5} },
      miner_cruiser: { id:"miner_cruiser", name:"岩脊级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:9, dodge:12, hp:{shield:450,armor:300,structure:220}, archaeologyScanStrength:0, fuelEfficiency:0.9, bonuses:{miningLaserEfficiency:1.0} },
      gas_cruiser: { id:"gas_cruiser", name:"云舶级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":5,"cruiser_functional_system":4}, buildTime:70, xp:100, slots:9, dodge:12, hp:{shield:450,armor:300,structure:220}, archaeologyScanStrength:0, fuelEfficiency:0.9, bonuses:{gasLaserEfficiency:1.0} },
      dolphin: { id:"dolphin", name:"驮星级", classTier:2, bodyLevelReq:1, cost:{"cruiser_integrated_hull":4,"cruiser_power_core":4,"cruiser_functional_system":6}, buildTime:80, xp:120, slots:9, dodge:11, hp:{shield:550,armor:350,structure:250}, archaeologyScanStrength:0, fuelEfficiency:0.9, bonuses:{smeltingSpeed:0.25} },
      miner_battleship: { id:"miner_battleship", name:"巨像级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:12, dodge:8, hp:{shield:1000,armor:500,structure:350}, archaeologyScanStrength:0, fuelEfficiency:0.85, bonuses:{miningLaserEfficiency:1.4} },
      gas_battleship: { id:"gas_battleship", name:"云海级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":6,"battleship_power_core":5,"battleship_functional_system":5}, buildTime:100, xp:160, slots:12, dodge:8, hp:{shield:1000,armor:500,structure:350}, archaeologyScanStrength:0, fuelEfficiency:0.85, bonuses:{gasLaserEfficiency:1.4} },
      yunjin: { id:"yunjin", name:"云津级", classTier:3, bodyLevelReq:2, cost:{"battleship_integrated_hull":7,"battleship_power_core":6,"battleship_functional_system":7}, buildTime:200, xp:280, slots:10, dodge:9, hp:{shield:1650,armor:850,structure:583}, archaeologyScanStrength:0, fuelEfficiency:0.83, bonuses:{smeltingSpeed:0.28} },
      orca: { id:"orca", name:"山海级", classTier:3, bodyLevelReq:2, cost:{"capital_integrated_hull":10,"capital_power_core":8,"capital_functional_system":10}, buildTime:320, xp:500, slots:13, dodge:8, hp:{shield:2200,armor:1100,structure:750}, archaeologyScanStrength:0, fuelEfficiency:0.80, bonuses:{miningLaserEfficiency:1.8,gasLaserEfficiency:1.8,smeltingSpeed:0.30} },
      // ===== 泰坦（④ 泰坦子系统，2026-11-10）：Lv4 深空要塞门禁；cost=3 子总成（3×3×3 总装第三阶）=====
      // 门禁：requiresTech=titan_command（8 研究节点顶点）+ 需成立军团 + 需完成星图主线（buildShip 内校验）。
      // 末日武器仅占位（combat 引擎接线待 ③ 强化系统落地后接，非本专项范围）。
      titan: { id:"titan", name:"渊灭级泰坦", classTier:5, bodyLevelReq:4,
        cost:{ titan_hull_assembly:1, titan_weapon_assembly:1, titan_core_assembly:1 },
        buildTime:3600, xp:5000, slots:60, dodge:1,
        hp:{shield:50000,armor:50000,structure:50000},
        archaeologyScanStrength:0, fuelEfficiency:0.5,
        bonuses:{ shieldCapacity:0.5, laserDamage:0.5, missileDamage:0.5, cannonDamage:0.5, hitBonus:50, structureRepair:5, armorRepair:2, structureEmergencyRepair:3 },
        requiresTech:"titan_command", requiresAlliance:true, requiresStarMap:true,
        doomsday:{ name:"末日武器·湮灭脉冲", note:"占位槽，combat 引擎接线待 ③ 强化系统落地后接（非本专项范围）" } },
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
      miner_frigate: { high:2, mid:2, low:1, rig:1 },
      gas_frigate: { high:2, mid:2, low:1, rig:1 },
      miner_destroyer: { high:3, mid:1, low:2, rig:1 },
      gas_destroyer: { high:3, mid:1, low:2, rig:1 },
      miner_cruiser: { high:3, mid:2, low:2, rig:2 },
      gas_cruiser: { high:3, mid:2, low:2, rig:2 },
      dolphin: { high:2, mid:3, low:2, rig:2 },
      miner_battleship: { high:4, mid:3, low:2, rig:3 },
      gas_battleship: { high:4, mid:3, low:2, rig:3 },
      yunjin: { high:3, mid:3, low:2, rig:2 },
      orca: { high:4, mid:4, low:2, rig:3 },
      titan: { high:20, mid:20, low:10, rig:10 },
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
  // 格子是空容器（cellId = "x,y"），模块是实例（可同类多个），玩家在船型可用格内自由摆放。
  // 核心恒占 [3,3]，不可移动。可用格 = 该船旧 layout 九坐标（保证旧档零越界）
  //   + 按 shape 追加的空格（保留 8 船形状差异、给重排腾挪余地），每船 14–17 格。
  // 特化格（specialCell）：每船 1 格，放任意舱段都吃该船 speedMult（开罗式「风水宝地」）。
  const EXTRA_CELLS = {
    frontier: [[1,2],[2,1],[4,1],[5,2],[1,4],[5,4]],
    raider:   [[1,1],[5,1],[1,3],[5,3],[1,4],[5,4]],
    bastion:  [[2,1],[4,1],[2,5],[4,5],[3,5]],
    ark:      [[2,1],[4,1],[1,3],[5,2],[1,4],[2,5]],
    salvage:  [[1,2],[4,1],[1,3],[4,2],[2,5],[3,5]],
    caravan:  [[3,1],[4,2],[4,4],[1,2],[5,2],[2,5]],
    research: [[3,1],[4,2],[1,3],[5,3],[4,5],[2,5]],
    spear:    [[3,1],[2,2],[5,3],[1,3],[3,5],[5,4]],
  };
  // 特化格坐标（须是该船可用格之一，且与旧 layout 九坐标不重合，避免开局即锁死特化）。
  const SPECIAL_CELL = {
    frontier: [5,2], raider: [5,1], bastion: [3,5], ark: [1,3],
    salvage: [4,1], caravan: [4,4], research: [5,3], spear: [3,1],
  };
  // 由 layout + 追加格解析可用格列表。缓存，避免每次渲染重算。
  const _cellCache = {};
  function hullCells(hullOrId) {
    const hull = typeof hullOrId === "string" ? baseHullById(hullOrId) : hullOrId;
    if (!hull) return [];
    if (_cellCache[hull.id]) return _cellCache[hull.id];
    const seen = new Set();
    const cells = [];
    const push = (x, y, core) => {
      const id = x + "," + y;
      if (seen.has(id)) return;
      seen.add(id);
      cells.push({ id: id, x: x, y: y, core: !!core, type: core ? "core" : null });
    };
    push(3, 3, true);   // 核心恒定锚点
    for (const k in hull.layout) {
      if (k === "core") continue;
      const p = hull.layout[k];
      if (p && p[0] >= 1 && p[0] <= 5 && p[1] >= 1 && p[1] <= 5) push(p[0], p[1], false);
    }
    // nativeType：该格在旧 layout 中对应的舱段类型，仅用于 UI 兼容/提示，不参与任何机制判定。
    for (const k in hull.layout) {
      if (k === "core") continue;
      const p = hull.layout[k];
      if (!p) continue;
      const c = cells.find(s => s.x === p[0] && s.y === p[1]);
      if (c) c.nativeType = k;
    }
    for (const p of (EXTRA_CELLS[hull.shape] || [])) push(p[0], p[1], false);
    const sp = SPECIAL_CELL[hull.shape];
    if (sp) {
      const sc = cells.find(c => c.x === sp[0] && c.y === sp[1]);
      if (sc) sc.special = hull.specialSlot;
    }
    _cellCache[hull.id] = cells;
    return cells;
  }
  function hullCellAt(hullOrId, x, y) {
    return hullCells(hullOrId).find(c => c.x === x && c.y === y) || null;
  }
  function hullSpecialCell(hullOrId) {
    return hullCells(hullOrId).find(c => c.special) || null;
  }

  // 同类模块实例上限（避免无限堆叠破坏布局平衡），提议值待标定。
  const MODULE_INSTANCE_CAP = 3;
  // 资源建造造价（按模块耗电分档），锚定本体升级曲线，一个舱段显著便宜于升一次本体。
  const MODULE_BUILD_COST = {
    energy:      { credits: 4000,  fe_alloy: 20 },
    dock:        { credits: 4000,  fe_alloy: 20 },
    command:     { credits: 4000,  fe_alloy: 20 },
    habitat:     { credits: 4000,  fe_alloy: 20 },
    equip:       { credits: 8000,  ni_alloy: 40, struct: 5 },
    smelt:       { credits: 8000,  ni_alloy: 40, struct: 5 },
    booster:     { credits: 12000, ni_alloy: 60, struct: 10 },
    manufacture: { credits: 12000, ni_alloy: 60, struct: 10 },
    invent:      { credits: 16000, ni_alloy: 90, struct: 20 },
  };
  const BUILD_TIER_LABEL = { 4000: "轻型", 8000: "中型", 12000: "重型", 16000: "特种" };
  // 舱段建造耗时（2026-11-25：从即时建造改为走总装船坞队列，与造船同管线）。
  // 按造价四档锚定：45 / 60 / 75 / 90 秒，落在造船 30~120 秒区间内，
  // Light < 驱逐 60s、特种 < 巡洋 90s，保证「造舱段快于造舰」的直觉。
  const MODULE_BUILD_TIME = { 4000: 45, 8000: 60, 12000: 75, 16000: 90 };
  function moduleBuildCost(type) { return MODULE_BUILD_COST[type] || null; }
  function moduleBuildTime(type) {
    const c = MODULE_BUILD_COST[type];
    return c ? (MODULE_BUILD_TIME[c.credits] || 45) : 0;
  }
  function buildCostLabel(type) {
    const c = MODULE_BUILD_COST[type];
    if (!c) return "";
    return BUILD_TIER_LABEL[c.credits] || "";
  }

  const BASE_MODULES = {
    energy:      { type: "energy",      name: "能源舱",   icon: "⚡", color: "#e7b45d", desc: "发电并稳定工业电网。", energy: 0 },
    smelt:       { type: "smelt",       name: "精炼环",   icon: "⚗",  color: "#67d4a1", desc: "将采集矿石转化为矿材。", energy: 20 },
    manufacture: { type: "manufacture", name: "总装船坞", icon: "⌬",  color: "#42d6e8", desc: "制造舰船组件与整舰。", energy: 30 },
    // 2026-11-03 新增：装备制造独立成舱（此前内联在舰基页，与总装坞共用槽位）。
    // energy 15 = 提议值，介于泊位 10 与精炼环 20 之间。
    // 开局实测（真机 powerReport）：10 舱全装负载 165 / 供能 180（本体 80 + 能源舱 100），
    // 供能充足、余量 15，并未超预算；后续标定须以保住余量为约束，避免再加棕化。
    equip:       { type: "equip",       name: "制造车间", icon: "⚒",  color: "#e08a5a", desc: "制造装备与改装件，独立产线。", energy: 15 },
    invent:      { type: "invent",      name: "发明舱",   icon: "◇",  color: "#b28cff", desc: "研发改装图纸与高级配方。", energy: 40 },
    dock:        { type: "dock",        name: "舰队泊位", icon: "◈",  color: "#b28cff", desc: "停泊与维护舰队。", energy: 10 },
    command:     { type: "command",     name: "指挥塔",   icon: "⌁",  color: "#e8c46a", desc: "统筹成员、舰队与基地行动。", energy: 10 },
    habitat:     { type: "habitat",     name: "演训舱",   icon: "⌂",  color: "#ef7b87", desc: "成员技能演训，全游戏唯一纯时间涨经验通道。", energy: 10 },
    booster:     { type: "booster",     name: "反应实验室", icon: "⚗", color: "#c98bff", desc: "制造增强剂瓶身（反应实验室）。", energy: 25 },
  };

  const BASE_HULLS = [
    {
      id: "hull_frontier", name: "拓荒者级", factionId: "settlers", tagline: "边境通用母舰",
      shape: "frontier", accent: "#b5c46a", bodyLevelReq: 0, relationReq: 0, blueprintCost: {},
      specialSlot: { id: "smelt", name: "矿脉导流舱", queue: "smelt", speedMult: 0.94, effect: "精炼耗时 -6%" },
      layout: { core:[3,3], energy:[3,1], smelt:[4,4], manufacture:[3,2], invent:[2,2], dock:[2,3], command:[3,4], habitat:[3,5], booster:[5,5], equip:[4,2] },
    },
    {
      id: "hull_angel_raider", name: "苍穹掠袭舰", factionId: "angel", tagline: "高速突入 / 分散舱列",
      shape: "raider", accent: "#5ad1a0", bodyLevelReq: 0, relationReq: 0, blueprintCost: { credits: 8000 },
      specialSlot: { id: "manufacture", name: "战利品快装位", queue: "manufacture", speedMult: 0.90, effect: "制造耗时 -10%" },
      layout: { core:[3,3], energy:[3,2], smelt:[4,1], manufacture:[2,2], invent:[2,3], dock:[2,4], command:[3,4], habitat:[4,4], booster:[5,5], equip:[1,2] },
    },
    {
      id: "hull_blood_oath", name: "赤誓堡垒舰", factionId: "blood", tagline: "纵向装甲 / 中轴指挥",
      shape: "bastion", accent: "#e879a8", bodyLevelReq: 0, relationReq: 8, blueprintCost: { credits: 18000 },
      specialSlot: { id: "manufacture", name: "军规装配位", queue: "manufacture", speedMult: 0.88, effect: "制造耗时 -12%" },
      layout: { core:[3,3], energy:[3,2], smelt:[1,3], manufacture:[4,3], invent:[3,1], dock:[5,3], command:[2,4], habitat:[4,4], booster:[5,5], equip:[4,2] },
    },
    {
      id: "hull_mining_ark", name: "矿脉工造方舟", factionId: "mining_guild", tagline: "宽幅工业翼 / 矿冶强化",
      shape: "ark", accent: "#b5793f", bodyLevelReq: 0, relationReq: 4, blueprintCost: { credits: 12000 },
      specialSlot: { id: "smelt", name: "深层熔炼槽", queue: "smelt", speedMult: 0.84, effect: "精炼耗时 -16%" },
      layout: { core:[3,3], energy:[3,2], smelt:[4,3], manufacture:[4,4], invent:[2,2], dock:[5,3], command:[3,4], habitat:[2,4], booster:[5,5], equip:[4,5] },
    },
    {
      id: "hull_salvage_union", name: "残骸拼接舰", factionId: "salvage_union", tagline: "非对称拼装 / 模块外露",
      shape: "salvage", accent: "#c9772e", bodyLevelReq: 0, relationReq: 4, blueprintCost: { credits: 16000 },
      specialSlot: { id: "manufacture", name: "回收件快装位", queue: "manufacture", speedMult: 0.90, effect: "制造耗时 -10%" },
      layout: { core:[3,3], energy:[3,2], smelt:[5,2], manufacture:[4,3], invent:[2,3], dock:[2,4], command:[3,4], habitat:[4,4], booster:[5,5], equip:[5,3] },
    },
    {
      id: "hull_lone_star", name: "孤星商队母舰", factionId: "lone_star", tagline: "紧凑货运 / 双侧生产线",
      shape: "caravan", accent: "#d8c07a", bodyLevelReq: 0, relationReq: 8, blueprintCost: { credits: 24000 },
      specialSlot: { id: "manufacture", name: "冷链货运接口", queue: "manufacture", speedMult: 0.91, effect: "制造耗时 -9%" },
      layout: { core:[3,3], energy:[3,2], smelt:[4,3], manufacture:[2,3], invent:[2,2], dock:[5,3], command:[2,4], habitat:[3,4], booster:[5,5], equip:[1,3] },
    },
    {
      id: "hull_abyssal", name: "深空研习母舰", factionId: "abyssal_inst", tagline: "环形实验区 / 发明强化",
      shape: "research", accent: "#9b8fd0", bodyLevelReq: 1, relationReq: 12, blueprintCost: { credits: 32000 },
      specialSlot: { id: "invent", name: "先驱遗物实验位", queue: "invent", speedMult: 0.82, effect: "发明耗时 -18%" },
      layout: { core:[3,3], energy:[3,2], smelt:[4,3], manufacture:[3,4], invent:[2,2], dock:[2,3], command:[2,4], habitat:[4,4], booster:[5,5], equip:[3,5] },
    },
    {
      id: "hull_bounty", name: "悬赏者突击母舰", factionId: "bounty_league", tagline: "箭形舰首 / 前线总装",
      shape: "spear", accent: "#b02a1f", bodyLevelReq: 0, relationReq: 8, blueprintCost: { credits: 20000 },
      specialSlot: { id: "manufacture", name: "前线换装位", queue: "manufacture", speedMult: 0.88, effect: "制造耗时 -12%" },
      layout: { core:[3,3], energy:[3,2], smelt:[4,1], manufacture:[4,2], invent:[2,3], dock:[4,3], command:[2,4], habitat:[3,4], booster:[5,5], equip:[5,2] },
    },
  ];

  function baseHullById(id) { return BASE_HULLS.find(h => h.id === id) || null; }
  function baseModuleByType(type) { return BASE_MODULES[type] || null; }
  // 船体可用格列表（id = "x,y"，核心 id="core" 固定 [3,3]）。
  // 开罗化后格子是空容器、模块是实例，故不再按 BASE_MODULES 生成 type 插座。
  // 保留 hull.specialSlot（绑类型的旧特化）仅供旧档迁移参考；运行时特化走 specialCell。
  function baseHullSlots(hullOrId) {
    const hull = typeof hullOrId === "string" ? baseHullById(hullOrId) : hullOrId;
    if (!hull) return [];
    return hullCells(hull);
  }
  function createInitialBase() {
    const owned = Object.keys(BASE_MODULES).map(type => ({ id: "module_" + type + "_01", type: type }));
    const hull = baseHullById("hull_frontier");
    // 旧版每类一实例落在该船 layout[type]；开罗化改为落在可用格中对应坐标（若 layout 坐标合法）。
    const installed = [];
    for (const m of owned) {
      const p = hull.layout[m.type];
      const cell = p && hullCellAt(hull, p[0], p[1]);
      installed.push({ slotId: cell ? cell.id : "3,2", moduleId: m.id });
    }
    return {
      coreId: "base_core_01", hullId: "hull_frontier", ownedHullBlueprints: ["hull_frontier"],
      modules: { owned: owned, installed: installed },
    };
  }

  // 各级本体电网基础容量（energy）。总供能预算 = 本项 + 已装能源舱数 × ENERGY_OUTPUT。MVP 提议值，待标定。
  // booster = 反应实验室制造队列槽位（增强剂制造）。起步 1 槽可用（与精炼/总装同级），随本体升级扩容。
  // equip = 制造车间队列槽位（装备制造，2026-11-03 从总装坞独立出来）。曲线与 booster 一致（1/1/2/3）。
  const BODY_LEVELS = [
    // 燃料池不设容量上限（2026-11-26 定案）：唯一来源是制造车间制造（2026-11-27 迁回），本体升级不改变燃料容量。
    { lv: 1, name: "空间站",   smelt: 1, manufacture: 1, invent: 0, booster: 1, equip: 1, energy: 80 },
    { lv: 2, name: "星堡",     smelt: 2, manufacture: 2, invent: 1, booster: 1, equip: 1, energy: 180 },
    { lv: 3, name: "星城",     smelt: 3, manufacture: 3, invent: 2, booster: 2, equip: 2, energy: 320 },
    { lv: 4, name: "深空要塞", smelt: 3, manufacture: 3, invent: 3, booster: 3, equip: 3, energy: 520 },
  ];

  // ============================================================
  // 舰船制造蓝图（2026-11-28 势力商店）：照 1 代 js/data/ships.js:67-87 SHIP_BLUEPRINTS 十八艘，
  //   扣掉 sansha 4 艘（暗影/幽冥/幽构/裁决 —— 用户 11-25 定「挂起，未来走战斗掉落」）= 14 艘。
  //   键格式：写**裸 shipId**（1 代 actions.js:196 同款），与 equipment:/booster: 前缀互不冲突。
  //   currency：阵营 8 艘付 rep（照 1 代 LP 原值 60/100/150/1000）；
  //             中立 6 艘付 credits（照 1 代 ISK 原值 50,000，1 代这批本就无势力归属）。
  //   bodyLevelReq 语义 = 1 代 level 20/40/60/90 映射到本作 0/1/2/3（与 SHIPS.bodyLevelReq 同一字段）。
  //   ⚠️ rookie_corvette / raylight / spearfalcon / swiftblade / dawnlight / warfalcon / stormblade /
  //      sunlance / fortfalcon / thunderblade / firmament / heavy_bastion / riftbreaker / 工业舰 / 考古舰
  //      **不在**本表 = 无蓝图门禁（1 代 SHIP_ASSEMBLY_RECIPES 里 requiresBlueprint:false 的同批）。
  // ============================================================
  const SHIP_BLUEPRINT_DEFS = {
    // —— 苍穹劫团（angel）——
    gale:          { shipId: "gale",          factionId: "angel",  price: 60,   currency: "rep",     bodyLevelReq: 0 },
    thunder:       { shipId: "thunder",       factionId: "angel",  price: 100,  currency: "rep",     bodyLevelReq: 1 },
    dawnbreaker:   { shipId: "dawnbreaker",   factionId: "angel",  price: 150,  currency: "rep",     bodyLevelReq: 2 },
    starcrown:     { shipId: "starcrown",     factionId: "angel",  price: 1000, currency: "rep",     bodyLevelReq: 3 },
    // —— 赤誓教团（blood）——
    bloodthorn:    { shipId: "bloodthorn",    factionId: "blood",  price: 60,   currency: "rep",     bodyLevelReq: 0 },
    crimson:       { shipId: "crimson",       factionId: "blood",  price: 100,  currency: "rep",     bodyLevelReq: 1 },
    crimson_bastion: { shipId: "crimson_bastion", factionId: "blood", price: 150, currency: "rep",    bodyLevelReq: 2 },
    eternal_fortress: { shipId: "eternal_fortress", factionId: "blood", price: 1000, currency: "rep", bodyLevelReq: 3 },
    // —— 中立（无势力归属，付星币；商店里挂在联邦拓殖公社页的「中立船坞」）——
    rifter:        { shipId: "rifter",        factionId: null,     price: 50000, currency: "credits", bodyLevelReq: 0 },
    kestrel:       { shipId: "kestrel",       factionId: null,     price: 50000, currency: "credits", bodyLevelReq: 0 },
    atron:         { shipId: "atron",         factionId: null,     price: 50000, currency: "credits", bodyLevelReq: 0 },
    miner_frigate: { shipId: "miner_frigate", factionId: null,     price: 50000, currency: "credits", bodyLevelReq: 0 },
    gas_frigate:   { shipId: "gas_frigate",   factionId: null,     price: 50000, currency: "credits", bodyLevelReq: 0 },
    heron:         { shipId: "heron",         factionId: null,     price: 50000, currency: "credits", bodyLevelReq: 0 },
  };
  function shipBlueprintDef(shipId) { return SHIP_BLUEPRINT_DEFS[shipId] || null; }
  // 该舰是否要蓝图才能造（真值只来自 SHIP_BLUEPRINT_DEFS；表外舰船一律放行）
  function shipNeedsBlueprint(shipId) { return !!SHIP_BLUEPRINT_DEFS[shipId]; }

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
  // 舰船三防满载（成员 hp 上限来源）。enhLvl=舰船强化等级，乘 hpMultiplier（惰性取 ShipEnh，enhLvl=0 时 enh=1 不依赖模块）。
  // capBonus=防御技能容量加成（小数，如 0.20），三层同系数。
  //   2026-11-27 防御技能对回 1 代口径：1 代 shieldOperation/armorReinforcement/hullEngineering
  //   三个技能各管一层容量（selectors.js:2532/2544/2555，均 ×(1+lv×0.03)），本作三合一为 defense，
  //   故同一系数作用于三层。此前 defense 被接进 combat 的 dmgRedRaw（减伤），1 代技能从不产生减伤，已废除。
  function maxHp(shipId, enhLvl, capBonus) {
    const s = SHIPS[shipId];
    if (!s) return { shield: 100, armor: 100, structure: 100 };
    // 舰船级 HP 容量加成（1 代 shield/armor/structureCapacity，全局生效 = 舰船本体属性，与 1 代一致）
    const b = s.bonuses || {};
    const c = (typeof capBonus === "number" && isFinite(capBonus)) ? capBonus : 0;
    const enh = (enhLvl && enhLvl > 0)
      ? (function () { const SE = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.ShipEnhancement : null; return SE ? SE.getBonuses(shipId, enhLvl).hpMultiplier : 1; })()
      : 1;
    return {
      // 船体容量与技能容量**连乘**：1 代 selectors.js:2532 是两条独立 multiply
      // （priority 10 船体、20 技能），combat-modifiers.js:31 逐条 `value *= amount`，不复利合并。
      shield: s.hp.shield * (1 + (b.shieldCapacity || 0)) * (1 + c) * enh,
      armor: s.hp.armor * (1 + (b.armorCapacity || 0)) * (1 + c) * enh,
      structure: s.hp.structure * (1 + (b.structureCapacity || 0)) * (1 + c) * enh,
    };
  }
  // 成员级三围上限：maxHp + 防御技能容量。接受「成员对象」（含 shipId/enhancementLevel/skills），
  // 也接受招募期尚未落库的临时对象（{shipId, enhancementLevel:0, skills}）——state.js 建造成员时用。
  // Settle 未就绪时退化为不含技能容量（安全降级，repair/settle 之后会按新上限修正）。
  function maxHpOf(m) {
    if (!m) return maxHp(m, 0, 0);
    const eng = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine : null;
    const bonus = (eng && eng.Settle && eng.Settle.defenseCapBonus) ? eng.Settle.defenseCapBonus(m) : 0;
    return maxHp(m.shipId, m.enhancementLevel, bonus);
  }
  function upgradeCost(lv) {
    // lv = 当前等级，返回升到下一级的代价
    const COST = { 0: { credits: 5000, fe_alloy: 100 }, 1: { credits: 20000, ni_alloy: 150, struct: 40 }, 2: { credits: 60000, bo_alloy: 300, struct: 120 }, 3: { credits: 200000, px_alloy: 400, struct: 300 } };
    return COST[lv] || null;
  }

  return { SHIPS, BODY_LEVELS, bodyLevelPlan, canBuildAt, shipsAtLevel, shipById, maxHp, maxHpOf, upgradeCost, ENERGY_OUTPUT,
    SHIP_BLUEPRINT_DEFS, shipBlueprintDef, shipNeedsBlueprint,
    SLOT_LAYOUT, slotLayout, totalSlots,
    BASE_MODULES, BASE_HULLS, baseHullById, baseModuleByType, baseHullSlots, createInitialBase,
    EXTRA_CELLS, SPECIAL_CELL, hullCells, hullCellAt, hullSpecialCell,
    MODULE_INSTANCE_CAP, MODULE_BUILD_COST, moduleBuildCost, buildCostLabel, moduleBuildTime,
  };
});
