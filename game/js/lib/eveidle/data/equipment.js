// ---- 装备工程：T1装备数据库（参照20260712细化） ----
const EQUIPMENT_DB = {
  // 高槽装备
  "t1_mining_laser":  { id:"t1_mining_laser",  name:"T1采矿激光器",  slot:"high", level:1, time:15, xp:8,  cost:{"三钛合金":20,"类银超金属":10}, bonuses:{miningEfficiency:0.05} },
  "t1_gas_harvester": { id:"t1_gas_harvester", name:"T1气云采集器",  slot:"high", level:1, time:15, xp:8,  cost:{"三钛合金":20,"粗制富勒烯":6},   bonuses:{gasEfficiency:0.05} },
  "t2_mining_laser":  { id:"t2_mining_laser",  name:"中型采矿激光器",  slot:"high", level:15, time:35, xp:20, cost:{"三钛合金":80,"类银超金属":30,"类晶体胶矿":10}, bonuses:{miningEfficiency:0.15} },
  "t2_gas_harvester": { id:"t2_gas_harvester", name:"中型气云采集器",  slot:"high", level:15, time:35, xp:20, cost:{"三钛合金":80,"稳定富勒烯":10}, bonuses:{gasEfficiency:0.15} },
  "raider_mining_laser": { id:"raider_mining_laser", name:"银河联盟采矿激光器", slot:"high", level:25, time:45, xp:30, cost:{"三钛合金":120,"类银超金属":48}, bonuses:{miningEfficiency:0.20}, faction:"alliance", requiresBlueprint:true },
  "raider_gas_harvester": { id:"raider_gas_harvester", name:"银河联盟气云采集器", slot:"high", level:25, time:45, xp:30, cost:{"三钛合金":120,"稳定富勒烯":15}, bonuses:{gasEfficiency:0.20}, faction:"alliance", requiresBlueprint:true },
  "angel_mining_laser": { id:"angel_mining_laser", name:"苍穹劫团联合采矿激光器", slot:"high", level:25, time:45, xp:30, cost:{"三钛合金":100,"类银超金属":40,"苍穹劫团装备生产许可C":3}, bonuses:{miningEfficiency:0.22}, faction:"angel", sourceZoneId:"angel_corridor", requiresBlueprint:true },
  "angel_gas_harvester": { id:"angel_gas_harvester", name:"苍穹劫团联合气云采集器", slot:"high", level:25, time:45, xp:30, cost:{"三钛合金":100,"稳定富勒烯":12,"苍穹劫团装备生产许可C":3}, bonuses:{gasEfficiency:0.22}, faction:"angel", sourceZoneId:"angel_corridor", requiresBlueprint:true },
  "t3_mining_laser":  { id:"t3_mining_laser",  name:"重型采矿激光器",  slot:"high", level:35, time:60, xp:40, cost:{"三钛合金":200,"类银超金属":80,"同位聚合体":20,"重金属":10}, bonuses:{miningEfficiency:0.30} },
  "t3_gas_harvester": { id:"t3_gas_harvester", name:"重型气云采集器",  slot:"high", level:35, time:60, xp:40, cost:{"三钛合金":200,"稳定富勒烯":8,"氦同位素":5}, bonuses:{gasEfficiency:0.30} },
  "t4_mining_laser":  { id:"t4_mining_laser",  name:"大型采矿激光器",  slot:"high", level:55, time:100, xp:75, cost:{"三钛合金":500,"超新星诺克石":30,"等离子体":15,"钷":5}, bonuses:{miningEfficiency:0.50} },
  "t4_gas_harvester": { id:"t4_gas_harvester", name:"大型气云采集器",  slot:"high", level:55, time:100, xp:75, cost:{"三钛合金":500,"氢同位素":5,"高纯富勒烯":10}, bonuses:{gasEfficiency:0.50} },
  "t5_mining_laser":  { id:"t5_mining_laser", shipTypes:["industrial_capital"], name:"旗舰采矿激光器",  slot:"high", level:80, time:180, xp:130, cost:{"三钛合金":1200,"超噬矿":20,"铷":10,"磁场聚合物":30}, bonuses:{miningEfficiency:0.80} },
  "t5_gas_harvester": { id:"t5_gas_harvester", shipTypes:["industrial_capital"], name:"旗舰气云采集器",  slot:"high", level:80, time:180, xp:130, cost:{"三钛合金":1200,"超纯聚合气体":3,"铷":5}, bonuses:{gasEfficiency:0.80} },
  "t1_small_laser": { id:"t1_small_laser", name:"小型激光炮 I", slot:"high", level:1, time:20, xp:12, cost:{"三钛合金":45,"类晶体胶矿":12}, bonuses:{}, combat:{kind:"weapon",weaponType:"laser",baseDamage:120,baseHit:100,fuelCost:3,ammoCost:1} },
  "t1_light_missile_launcher": { id:"t1_light_missile_launcher", name:"轻型导弹发射器 I", slot:"high", level:1, time:20, xp:12, cost:{"三钛合金":45,"类银超金属":12}, bonuses:{}, combat:{kind:"weapon",weaponType:"missile",baseDamage:100,baseHit:130,fuelCost:2,ammoCost:1} },
  "t1_small_cannon": { id:"t1_small_cannon", name:"小型射弹炮 I", slot:"high", level:1, time:20, xp:12, cost:{"三钛合金":45,"类银超金属":10}, bonuses:{}, combat:{kind:"weapon",weaponType:"cannon",baseDamage:80,baseHit:80,fuelCost:1,ammoCost:1} },
  "t1_medium_laser": { id:"t1_medium_laser", name:"中型激光炮 I", slot:"high", level:35, time:45, xp:35, cost:{"三钛合金":150,"类晶体胶矿":40,"同位聚合体":10,"同位素":5}, bonuses:{}, combat:{kind:"weapon",weaponType:"laser",baseDamage:240,baseHit:100,fuelCost:6,ammoCost:1} },
  "t1_heavy_missile_launcher": { id:"t1_heavy_missile_launcher", name:"重型导弹发射器 I", slot:"high", level:35, time:45, xp:35, cost:{"三钛合金":150,"类银超金属":40,"同位聚合体":10,"稀有气体":8}, bonuses:{}, combat:{kind:"weapon",weaponType:"missile",baseDamage:200,baseHit:130,fuelCost:4,ammoCost:1} },
  "t1_medium_cannon": { id:"t1_medium_cannon", name:"中型射弹炮 I", slot:"high", level:35, time:45, xp:35, cost:{"三钛合金":150,"同位聚合体":35,"重金属":8}, bonuses:{}, combat:{kind:"weapon",weaponType:"cannon",baseDamage:160,baseHit:80,fuelCost:2,ammoCost:1} },
  "t1_large_laser": { id:"t1_large_laser", name:"大型激光炮 I", slot:"high", level:55, time:70, xp:55, cost:{"三钛合金":300,"同位聚合体":50,"超新星诺克石":15,"等离子体":8}, bonuses:{}, combat:{kind:"weapon",weaponType:"laser",baseDamage:480,baseHit:100,fuelCost:12,ammoCost:1} },
  "t1_cruise_missile_launcher": { id:"t1_cruise_missile_launcher", name:"巡航导弹发射器 I", slot:"high", level:55, time:70, xp:55, cost:{"三钛合金":300,"类银超金属":100,"超新星诺克石":15,"稀有气体":12}, bonuses:{}, combat:{kind:"weapon",weaponType:"missile",baseDamage:400,baseHit:130,fuelCost:8,ammoCost:1} },
  "t1_large_cannon": { id:"t1_large_cannon", name:"大型射弹炮 I", slot:"high", level:55, time:70, xp:55, cost:{"三钛合金":300,"同位聚合体":70,"超新星诺克石":12,"重金属":12}, bonuses:{}, combat:{kind:"weapon",weaponType:"cannon",baseDamage:320,baseHit:80,fuelCost:4,ammoCost:1} },
  "t1_capital_laser": { id:"t1_capital_laser", name:"旗舰级聚焦激光炮 I", slot:"high", level:80, time:180, xp:130, cost:{"三钛合金":500,"基腹断岩":12,"超噬矿":8,"铷":2,"等离子体":10}, bonuses:{}, shipTypes:["capital","supercapital"], combat:{kind:"weapon",weaponType:"laser",baseDamage:600,baseHit:100,fuelCost:15,ammoCost:1,aoe:{mode:"next",multiplier:0.30,maxTargets:1,description:"扫掠光束：下一目标受到30%最终伤害"}} },
  "t1_capital_missile_array": { id:"t1_capital_missile_array", name:"旗舰级巡航导弹阵列 I", slot:"high", level:80, time:180, xp:130, cost:{"三钛合金":500,"基腹断岩":10,"超噬矿":8,"铷":2,"超纯聚合气体":1,"磁场聚合物":8}, bonuses:{}, shipTypes:["capital","supercapital"], combat:{kind:"weapon",weaponType:"missile",baseDamage:500,baseHit:130,fuelCost:10,ammoCost:1,aoe:{mode:"all",multiplier:0.12,description:"扩散弹头：其他所有目标受到12%最终伤害"}} },
  "t1_capital_cannon": { id:"t1_capital_cannon", name:"旗舰级攻城射弹炮 I", slot:"high", level:80, time:180, xp:130, cost:{"三钛合金":500,"基腹断岩":12,"超噬矿":7,"铷":2,"重金属":12}, bonuses:{}, shipTypes:["capital","supercapital"], combat:{kind:"weapon",weaponType:"cannon",baseDamage:400,baseHit:80,fuelCost:5,ammoCost:1,aoe:{mode:"next",multiplier:0.15,maxTargets:2,description:"破片齐射：最多两个其他目标受到15%最终伤害"}} },
  // 中槽装备
  "t1_drone_control": { id:"t1_drone_control", name:"T1无人机控制单元", slot:"mid", level:1, time:20, xp:10, cost:{"三钛合金":25,"类银超金属":8}, bonuses:{miningEfficiency:0.02,gasEfficiency:0.02} },
  "t2_drone_link": { id:"t2_drone_link", name:"协同无人机指挥链路", slot:"mid", level:15, time:35, xp:20, cost:{"三钛合金":100,"类银超金属":35,"类晶体胶矿":10,"稳定富勒烯":5}, bonuses:{miningEfficiency:0.05,gasEfficiency:0.05} },
  "t3_drone_link": { id:"t3_drone_link", name:"高级无人机指挥链路", slot:"mid", level:35, time:60, xp:40, cost:{"三钛合金":250,"类银超金属":90,"同位聚合体":20,"稳定富勒烯":5,"稀有气体":10}, bonuses:{miningEfficiency:0.10,gasEfficiency:0.10} },
  "blood_servant_drone_link": { id:"blood_servant_drone_link", name:"赤誓仆从无人机指挥链路", slot:"mid", level:45, time:75, xp:55, cost:{"三钛合金":350,"类银超金属":120,"同位聚合体":20,"赤誓教团装备生产许可B":5}, bonuses:{miningEfficiency:0.13,gasEfficiency:0.13}, faction:"blood", sourceZoneId:"blood_cathedral", requiresBlueprint:true },
  "blood_servant_drone_link_sacrifice": { id:"blood_servant_drone_link_sacrifice", name:"赤誓仆从无人机指挥链路·献祭型", slot:"mid", level:25, time:45, xp:30, cost:{"三钛合金":150,"类银超金属":50,"赤誓教团装备生产许可C":3,"类晶体胶矿":15}, bonuses:{miningEfficiency:0.08,gasEfficiency:0.08}, faction:"blood", requiresBlueprint:true },
  "alliance_drone_link": { id:"alliance_drone_link", name:"银河联盟无人机指挥链路", slot:"mid", level:45, time:75, xp:55, cost:{"三钛合金":420,"类银超金属":144,"同位聚合体":24}, bonuses:{miningEfficiency:0.13,gasEfficiency:0.13}, faction:"alliance", requiresBlueprint:true },
  "t4_drone_link": { id:"t4_drone_link", name:"深空无人机指挥链路", slot:"mid", level:55, time:100, xp:75, cost:{"三钛合金":600,"超新星诺克石":25,"等离子体":15,"钷":5}, bonuses:{miningEfficiency:0.16,gasEfficiency:0.16} },
  "t5_drone_core": { id:"t5_drone_core", shipTypes:["industrial_capital"], name:"旗舰无人机指挥核心", slot:"mid", level:80, time:180, xp:130, cost:{"三钛合金":1400,"超噬矿":20,"铷":8,"超纯聚合气体":2,"磁场聚合物":30}, bonuses:{miningEfficiency:0.25,gasEfficiency:0.25} },
  "shield_ext_small":  { id:"shield_ext_small",  name:"小型护盾扩展",   slot:"mid", level:1, time:15, xp:6,  cost:{"三钛合金":50,"类银超金属":20},  bonuses:{shieldCapacity:50} },
  "t1_shield_booster": { id:"t1_shield_booster", name:"小型护盾回充器 I", slot:"mid", level:1, time:18, xp:10, cost:{"三钛合金":35,"类银超金属":15}, bonuses:{}, combat:{kind:"repair",target:"shield",amount:30,fuelCost:1} },
  "t1_medium_shield_booster": { id:"t1_medium_shield_booster", name:"中型护盾回充器 I", slot:"mid", level:35, time:42, xp:30, cost:{"三钛合金":120,"类银超金属":40,"同位素":8}, bonuses:{}, combat:{kind:"repair",target:"shield",amount:60,fuelCost:2} },
  "t1_large_shield_booster": { id:"t1_large_shield_booster", name:"大型护盾回充器 I", slot:"mid", level:55, time:65, xp:50, cost:{"三钛合金":240,"类银超金属":80,"超新星诺克石":10,"同位素":12}, bonuses:{}, combat:{kind:"repair",target:"shield",amount:120,fuelCost:4} },
  // 低槽装备
  "t1_armor_repairer": { id:"t1_armor_repairer", name:"小型装甲维修器 I", slot:"low", level:1, time:18, xp:10, cost:{"三钛合金":35,"类银超金属":12}, bonuses:{}, combat:{kind:"repair",target:"armor",amount:20,fuelCost:1} },
  "t1_structure_repairer": { id:"t1_structure_repairer", name:"小型结构修理器 I", slot:"low", level:1, time:18, xp:10, cost:{"三钛合金":40,"类银超金属":8}, bonuses:{}, combat:{kind:"repair",target:"structure",amount:10,fuelCost:1} },
  "t1_medium_armor_repairer": { id:"t1_medium_armor_repairer", name:"中型装甲维修器 I", slot:"low", level:35, time:42, xp:30, cost:{"三钛合金":120,"同位聚合体":35,"重金属":10}, bonuses:{}, combat:{kind:"repair",target:"armor",amount:40,fuelCost:2} },
  "t1_medium_structure_repairer": { id:"t1_medium_structure_repairer", name:"中型结构修理器 I", slot:"low", level:35, time:42, xp:30, cost:{"三钛合金":130,"类银超金属":25,"同位聚合体":25,"稀有气体":6}, bonuses:{}, combat:{kind:"repair",target:"structure",amount:20,fuelCost:2} },
  "t1_large_armor_repairer": { id:"t1_large_armor_repairer", name:"大型装甲维修器 I", slot:"low", level:55, time:65, xp:50, cost:{"三钛合金":240,"同位聚合体":50,"超新星诺克石":10,"重金属":14}, bonuses:{}, combat:{kind:"repair",target:"armor",amount:80,fuelCost:4} },
  "t1_large_structure_repairer": { id:"t1_large_structure_repairer", name:"大型结构修理器 I", slot:"low", level:55, time:65, xp:50, cost:{"三钛合金":260,"类银超金属":50,"超新星诺克石":12,"稀有气体":10}, bonuses:{}, combat:{kind:"repair",target:"structure",amount:40,fuelCost:4} },
  "t1_capital_shield_array": { id:"t1_capital_shield_array", name:"旗舰级护盾回充阵列 I", slot:"mid", level:80, time:160, xp:110, cost:{"三钛合金":400,"基腹断岩":8,"超噬矿":6,"铷":1,"同位素":8,"磁场聚合物":8}, bonuses:{}, shipTypes:["capital","supercapital"], combat:{kind:"repair",target:"shield",amount:150,fuelCost:5} },
  "t1_capital_armor_array": { id:"t1_capital_armor_array", name:"旗舰级装甲维修阵列 I", slot:"low", level:80, time:160, xp:110, cost:{"三钛合金":400,"基腹断岩":9,"超噬矿":6,"铷":1,"重金属":10,"等离子体":6}, bonuses:{}, shipTypes:["capital","supercapital"], combat:{kind:"repair",target:"armor",amount:100,fuelCost:5} },
  "t1_capital_structure_array": { id:"t1_capital_structure_array", name:"旗舰级结构修复阵列 I", slot:"low", level:80, time:160, xp:110, cost:{"三钛合金":400,"基腹断岩":8,"超噬矿":7,"铷":1,"稀有气体":8,"磁场聚合物":6}, bonuses:{}, shipTypes:["capital","supercapital"], combat:{kind:"repair",target:"structure",amount:50,fuelCost:5} },
  "t1_mining_booster": { id:"t1_mining_booster", name:"T1采矿提升器",  slot:"low", level:10,time:20, xp:12, cost:{"三钛合金":50,"类银超金属":20}, bonuses:{miningLaserEfficiency:0.10} },
  "t2_mining_booster": { id:"t2_mining_booster", name:"中型采矿提升器", slot:"low", level:15,time:35, xp:20, cost:{"三钛合金":160,"类银超金属":60,"类晶体胶矿":15}, bonuses:{miningLaserEfficiency:0.30} },
  "t3_mining_booster": { id:"t3_mining_booster", name:"重型采矿提升器", slot:"low", level:35,time:60, xp:40, cost:{"三钛合金":400,"类银超金属":150,"同位聚合体":30,"重金属":15}, bonuses:{miningLaserEfficiency:0.50} },
  "t4_mining_booster": { id:"t4_mining_booster", name:"大型采矿提升器", slot:"low", level:55,time:110,xp:80, cost:{"三钛合金":900,"超新星诺克石":45,"等离子体":25,"钷":5}, bonuses:{miningLaserEfficiency:0.70} },
  "sansha_mineral_assimilation": { id:"sansha_mineral_assimilation", name:"矿物同化注入器", slot:"low", level:65,time:130,xp:95, cost:{"三钛合金":1100,"超新星诺克石":50,"钷":5,"等离子体":25,"静默集群装备生产许可A":6}, bonuses:{miningLaserEfficiency:0.80}, faction:"sansha", sourceZoneId:"sansha_command_matrix", requiresBlueprint:true },
  // ===== 新增星带势力生产装备（材料按档位分级：D=1.0-0.8 / C=0.7-0.5 / B=0.4-0.3 / A=0.2-0.1） =====
  "angel_mining_laser_outpost": { id:"angel_mining_laser_outpost", name:"苍穹劫团采矿激光器·前哨型", slot:"high", level:10, time:30, xp:15, cost:{"三钛合金":60,"类银超金属":20,"苍穹劫团装备生产许可D":2}, bonuses:{miningEfficiency:0.10}, faction:"angel", requiresBlueprint:true },
  "angel_mineral_assimilation_outpost": { id:"angel_mineral_assimilation_outpost", name:"苍穹劫团矿物同化注入器·前哨型", slot:"low", level:10, time:30, xp:15, cost:{"三钛合金":80,"类银超金属":20,"苍穹劫团装备生产许可D":2}, bonuses:{miningLaserEfficiency:0.20}, faction:"angel", requiresBlueprint:true },
  // 「破阵型」为无人机指挥链路，效果走无人机链路的独立采集效率乘区；
  // 此前同时带了 miningLaserEfficiency/gasLaserEfficiency（高槽采集器放大），
  // 但结算层把「带放大的势力中槽件」基础效率降级为平加，导致面板双加成而实际偏弱。
  // 用户拍板方案 A：移除高槽放大，只保留独立采集效率，与普通无人机链路同口径。
  "angel_drone_link_war": { id:"angel_drone_link_war", name:"苍穹劫团无人机指挥链路·破阵型", slot:"mid", level:65, time:130, xp:95, cost:{"三钛合金":900,"超新星诺克石":35,"钷":2,"等离子体":20,"苍穹劫团装备生产许可A":6}, bonuses:{miningEfficiency:0.20,gasEfficiency:0.20}, faction:"angel", requiresBlueprint:true },
  "blood_drone_link_sacrifice": { id:"blood_drone_link_sacrifice", name:"赤誓仆从无人机指挥链路·献祭型", slot:"mid", level:25, time:45, xp:30, cost:{"三钛合金":150,"类银超金属":50,"赤誓教团装备生产许可C":5,"类晶体胶矿":15}, bonuses:{miningEfficiency:0.08,gasEfficiency:0.08}, faction:"blood", sourceZoneId:"blood_sacrifice", requiresBlueprint:true },
  "blood_mining_laser_hunt": { id:"blood_mining_laser_hunt", name:"赤誓采矿激光器·猎杀型", slot:"high", level:45, time:75, xp:55, cost:{"三钛合金":300,"类银超金属":100,"同位聚合体":20,"重金属":15,"赤誓教团装备生产许可B":5}, bonuses:{miningEfficiency:0.40}, faction:"blood", requiresBlueprint:true },
  "blood_mineral_assimilation_nexus": { id:"blood_mineral_assimilation_nexus", name:"赤誓矿物同化注入器·枢纽型", slot:"low", level:45, time:75, xp:55, cost:{"三钛合金":600,"同位聚合体":25,"重金属":15,"赤誓教团装备生产许可B":5,"氦同位素":10}, bonuses:{miningLaserEfficiency:0.60}, faction:"blood", requiresBlueprint:true },
  "blood_gas_harvester_iron": { id:"blood_gas_harvester_iron", name:"赤誓气云采集器·铁血型", slot:"high", level:65, time:130, xp:95, cost:{"三钛合金":700,"氢同位素":15,"氦同位素":10,"赤誓教团装备生产许可A":6}, bonuses:{gasEfficiency:0.65}, faction:"blood", requiresBlueprint:true },
  "sansha_mineral_assimilation_node": { id:"sansha_mineral_assimilation_node", name:"矿物同化注入器·节点型", slot:"low", level:25, time:45, xp:30, cost:{"三钛合金":300,"类银超金属":100,"静默集群装备生产许可C":3,"类晶体胶矿":20}, bonuses:{miningLaserEfficiency:0.40}, faction:"sansha", requiresBlueprint:true },
  "sansha_gas_harvester_nexus": { id:"sansha_gas_harvester_nexus", name:"静默气云采集器·枢纽型", slot:"high", level:45, time:75, xp:55, cost:{"三钛合金":300,"稳定富勒烯":15,"氦同位素":10,"静默集群装备生产许可B":5}, bonuses:{gasEfficiency:0.40}, faction:"sansha", requiresBlueprint:true },
  "sansha_mining_laser_war": { id:"sansha_mining_laser_war", name:"静默采矿激光器·破阵型", slot:"high", level:65, time:130, xp:95, cost:{"三钛合金":700,"超新星诺克石":40,"钷":4,"等离子体":20,"静默集群装备生产许可A":6}, bonuses:{miningEfficiency:0.65}, faction:"sansha", requiresBlueprint:true },
  "sansha_drone_link_outpost": { id:"sansha_drone_link_outpost", name:"静默无人机指挥链路·前哨型", slot:"mid", level:10, time:30, xp:15, cost:{"三钛合金":40,"类银超金属":15,"静默集群装备生产许可D":2}, bonuses:{miningEfficiency:0.04,gasEfficiency:0.04}, faction:"sansha", requiresBlueprint:true },

  "alliance_mineral_assimilation": { id:"alliance_mineral_assimilation", name:"银河联盟矿物同化注入器", slot:"low", level:65,time:130,xp:95, cost:{"三钛合金":1320,"超新星诺克石":60,"铷":6,"等离子体":30}, bonuses:{miningLaserEfficiency:0.80}, faction:"alliance", requiresBlueprint:true },
  "t5_mining_booster": { id:"t5_mining_booster", shipTypes:["industrial_capital"], name:"旗舰采矿提升核心", slot:"low", level:80,time:200,xp:150,cost:{"三钛合金":2000,"超噬矿":35,"铷":15,"磁场聚合物":50}, bonuses:{miningLaserEfficiency:0.90} },
  "t1_gas_booster":    { id:"t1_gas_booster",    name:"T1采气提升器",  slot:"low", level:10,time:20, xp:12, cost:{"三钛合金":50,"粗制富勒烯":20},  bonuses:{gasLaserEfficiency:0.10} },
  // ===== 采气提升器（对标采矿提升器，低槽 gasLaserEfficiency） =====
  "t2_gas_booster":    { id:"t2_gas_booster",    name:"中型采气提升器",  slot:"low", level:15,time:35,  xp:20,  cost:{"三钛合金":160, "稳定富勒烯":60,   "类晶体胶矿":15}, bonuses:{gasLaserEfficiency:0.30} },
  "t3_gas_booster":    { id:"t3_gas_booster",    name:"重型采气提升器",  slot:"low", level:35,time:60,  xp:40,  cost:{"三钛合金":400, "稳定富勒烯":150,  "同位聚合体":30,"重金属":15}, bonuses:{gasLaserEfficiency:0.50} },
  "t4_gas_booster":    { id:"t4_gas_booster",    name:"大型采气提升器",  slot:"low", level:55,time:110, xp:80,  cost:{"三钛合金":900,"等离子体":25,"高纯富勒烯":55,"钷":5}, bonuses:{gasLaserEfficiency:0.70} },
  "t5_gas_booster":    { id:"t5_gas_booster", shipTypes:["industrial_capital"],    name:"旗舰采气提升核心", slot:"low", level:80,time:200, xp:150, cost:{"三钛合金":2000,"超纯聚合气体":35, "铷":15, "磁场聚合物":50}, bonuses:{gasLaserEfficiency:0.90} },
  // ===== 势力采气提升器（对标势力采矿提升器，气体同化注入器系，需蓝图） =====
  "sansha_gas_assimilation":  { id:"sansha_gas_assimilation",  name:"静默气体同化注入器",       slot:"low", level:65,time:130,xp:95,  cost:{"三钛合金":1100,"高纯富勒烯":50,"钷":5,"等离子体":25,"静默集群装备生产许可A":6}, bonuses:{gasLaserEfficiency:0.80}, faction:"sansha", sourceZoneId:"sansha_command_matrix", requiresBlueprint:true },
  "angel_gas_assimilation_outpost": { id:"angel_gas_assimilation_outpost", name:"苍穹劫团气体同化注入器·前哨型", slot:"low", level:10,time:30, xp:15, cost:{"三钛合金":80, "稳定富勒烯":20, "苍穹劫团装备生产许可D":3}, bonuses:{gasLaserEfficiency:0.20}, faction:"angel", requiresBlueprint:true },
  "blood_gas_assimilation_nexus":  { id:"blood_gas_assimilation_nexus",  name:"赤誓气体同化注入器·枢纽型",   slot:"low", level:45,time:75, xp:55,  cost:{"三钛合金":600,"同位聚合体":15,"氦同位素":15,"赤誓教团装备生产许可B":8}, bonuses:{gasLaserEfficiency:0.60}, faction:"blood", requiresBlueprint:true },
  "sansha_gas_assimilation_node":  { id:"sansha_gas_assimilation_node",  name:"静默气体同化注入器·节点型",   slot:"low", level:25,time:45, xp:30,  cost:{"三钛合金":300,"稳定富勒烯":100,"静默集群装备生产许可C":3,"类晶体胶矿":20}, bonuses:{gasLaserEfficiency:0.40}, faction:"sansha", requiresBlueprint:true },
  "alliance_gas_assimilation": { id:"alliance_gas_assimilation", name:"银河联盟气体同化注入器",     slot:"low", level:65,time:130,xp:95,  cost:{"三钛合金":1320,"聚合气体":60, "铷":6,"等离子体":30}, bonuses:{gasLaserEfficiency:0.80}, faction:"alliance", requiresBlueprint:true },

  // ===== 同位素标记打捞臂（对标采矿/采气提升器，低槽 salvageEfficiency；装备即生效提升货柜掉率；
  //   燃料：装备即按击毁数扣 salvageFuelPerKill（基准），开启主动打捞时基准×3；开主动额外消耗同位素并掉落舰船组件） =====
  "t1_salvage_arm":    { id:"t1_salvage_arm",    name:"T1同位素标记打捞臂",  slot:"low", level:10, time:20,  xp:12,  cost:{"三钛合金":50,  "重金属":20, "稀有气体":12}, bonuses:{salvageEfficiency:0.10}, salvageFuelPerKill:2 },
  "t2_salvage_arm":    { id:"t2_salvage_arm",    name:"中型同位素标记打捞臂", slot:"low", level:15, time:35,  xp:20,  cost:{"三钛合金":160, "同位素":60,  "类晶体胶矿":15}, bonuses:{salvageEfficiency:0.30}, salvageFuelPerKill:4 },
  "t3_salvage_arm":    { id:"t3_salvage_arm",    name:"重型同位素标记打捞臂", slot:"low", level:35, time:60,  xp:40,  cost:{"三钛合金":400, "等离子体":150, "同位素":30, "重金属":15}, bonuses:{salvageEfficiency:0.50}, salvageFuelPerKill:6 },
  "t4_salvage_arm":    { id:"t4_salvage_arm",    name:"大型同位素标记打捞臂", slot:"low", level:55, time:110, xp:80,  cost:{"三钛合金":900,"生物质":45,"等离子体":25,"钷":5}, bonuses:{salvageEfficiency:0.70}, salvageFuelPerKill:8 },
  "t5_salvage_arm":    { id:"t5_salvage_arm", shipTypes:["capital","supercapital","archaeology_capital"], name:"旗舰同位素标记打捞核心", slot:"low", level:80, time:200, xp:150, cost:{"三钛合金":2000,"磁场聚合物":35, "铷":15, "生物质":50}, bonuses:{salvageEfficiency:0.90}, salvageFuelPerKill:10 },
  // ===== 势力同位素标记打捞臂（对标势力采矿/采气提升器，残骸打捞注入器系，需蓝图；渠道逐件对标矿提孪生件：货柜 S/M/L + LP_STORE + STAR_BELT） =====
  "sansha_salvage_injector":  { id:"sansha_salvage_injector",  name:"静默残骸打捞注入器",       slot:"low", level:65, time:130, xp:95,  cost:{"三钛合金":1100,"等离子体":50,"钷":5,"生物质":25,"静默集群装备生产许可A":10}, bonuses:{salvageEfficiency:0.80}, salvageFuelPerKill:8, faction:"sansha", sourceZoneId:"sansha_command_matrix", requiresBlueprint:true },
  "angel_salvage_injector_outpost": { id:"angel_salvage_injector_outpost", name:"苍穹劫团残骸打捞注入器·前哨型", slot:"low", level:10, time:30, xp:15, cost:{"三钛合金":80, "稀有气体":20, "苍穹劫团装备生产许可D":3}, bonuses:{salvageEfficiency:0.20}, salvageFuelPerKill:2, faction:"angel", requiresBlueprint:true },
  "blood_salvage_injector_nexus":  { id:"blood_salvage_injector_nexus",  name:"赤誓残骸打捞注入器·枢纽型",   slot:"low", level:45, time:75, xp:55,  cost:{"三钛合金":600,"同位聚合体":25,"重金属":15,"赤誓教团装备生产许可B":8}, bonuses:{salvageEfficiency:0.60}, salvageFuelPerKill:8, faction:"blood", requiresBlueprint:true },
  "sansha_salvage_injector_node":  { id:"sansha_salvage_injector_node",  name:"静默残骸打捞注入器·节点型",   slot:"low", level:25, time:45, xp:30,  cost:{"三钛合金":300,"同位素":100,"静默集群装备生产许可C":5,"类晶体胶矿":20}, bonuses:{salvageEfficiency:0.40}, salvageFuelPerKill:4, faction:"sansha", requiresBlueprint:true },
  "alliance_salvage_injector": { id:"alliance_salvage_injector", name:"银河联盟残骸打捞注入器",     slot:"low", level:65, time:130, xp:95,  cost:{"三钛合金":1320,"铷":6,"生物质":105}, bonuses:{salvageEfficiency:0.80}, salvageFuelPerKill:8, faction:"alliance", requiresBlueprint:true },

  // ===== 考古装备（仅考古舰可装备，不可用于战斗，不可安装战斗装备） =====
  // 高槽：遗迹分析仪 — 提升扫描强度
  "archaeo_analyzer_i": { id:"archaeo_analyzer_i", name:"遗迹分析仪 I", slot:"high", level:1,  time:20, xp:14, cost:{"三钛合金":40,"类银超金属":15}, bonuses:{archaeologyScan:5},  shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_analyzer_ii":{ id:"archaeo_analyzer_ii",name:"遗迹分析仪 II",slot:"high", level:15, time:40, xp:35, cost:{"三钛合金":160,"类银超金属":60,"类晶体胶矿":15}, bonuses:{archaeologyScan:8},  shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_analyzer_iii":{id:"archaeo_analyzer_iii",name:"遗迹分析仪 III",slot:"high",level:35, time:70, xp:60, cost:{"三钛合金":400,"类银超金属":150,"同位聚合体":25,"重金属":12}, bonuses:{archaeologyScan:12}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_analyzer_iv":{ id:"archaeo_analyzer_iv",name:"遗迹分析仪 IV",slot:"high", level:55, time:120,xp:110,cost:{"三钛合金":900,"超新星诺克石":40,"等离子体":20,"钷":5}, bonuses:{archaeologyScan:18}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_analyzer_v": { id:"archaeo_analyzer_v", name:"遗迹分析仪 V", slot:"high", level:80, time:200,xp:180,cost:{"三钛合金":2000,"超噬矿":15,"铷":10,"磁场聚合物":40}, bonuses:{archaeologyScan:25}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  // 中槽：信号稳定器 — 降低失败反噬（总和上限 60%）
  "archaeo_stabilizer_i": { id:"archaeo_stabilizer_i", name:"信号稳定器 I", slot:"mid", level:1,  time:20, xp:14, cost:{"三钛合金":40,"类银超金属":15}, bonuses:{archaeologyStabilizer:0.05}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_stabilizer_ii":{ id:"archaeo_stabilizer_ii",name:"信号稳定器 II",slot:"mid", level:15, time:40, xp:35, cost:{"三钛合金":160,"类银超金属":60,"类晶体胶矿":15}, bonuses:{archaeologyStabilizer:0.08}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_stabilizer_iii":{id:"archaeo_stabilizer_iii",name:"信号稳定器 III",slot:"mid",level:35, time:70, xp:60, cost:{"三钛合金":400,"类银超金属":150,"同位聚合体":25,"重金属":12}, bonuses:{archaeologyStabilizer:0.11}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_stabilizer_iv":{ id:"archaeo_stabilizer_iv",name:"信号稳定器 IV",slot:"mid", level:55, time:120,xp:110,cost:{"三钛合金":900,"超新星诺克石":40,"等离子体":20,"钷":5}, bonuses:{archaeologyStabilizer:0.14}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_stabilizer_v": { id:"archaeo_stabilizer_v", name:"信号稳定器 V", slot:"mid", level:80, time:200,xp:180,cost:{"三钛合金":2000,"超噬矿":15,"铷":10,"磁场聚合物":40}, bonuses:{archaeologyStabilizer:0.17}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  // 低槽：文物译码器 — 稀有发现掉率加成（乘子 1+加成，总和上限 75%）
  "archaeo_decoder_i": { id:"archaeo_decoder_i", name:"文物译码器 I", slot:"low", level:1,  time:20, xp:14, cost:{"三钛合金":40,"类晶体胶矿":15}, bonuses:{archaeologyDecoder:0.10}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_decoder_ii":{ id:"archaeo_decoder_ii",name:"文物译码器 II",slot:"low", level:15, time:40, xp:35, cost:{"三钛合金":160,"重金属":8,"类晶体胶矿":50}, bonuses:{archaeologyDecoder:0.14}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_decoder_iii":{id:"archaeo_decoder_iii",name:"文物译码器 III",slot:"low",level:35, time:70, xp:60, cost:{"三钛合金":400,"同位聚合体":105,"稀有气体":8}, bonuses:{archaeologyDecoder:0.18}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_decoder_iv":{ id:"archaeo_decoder_iv",name:"文物译码器 IV",slot:"low", level:55, time:120,xp:110,cost:{"三钛合金":900,"同位聚合体":200,"等离子体":20,"钷":5}, bonuses:{archaeologyDecoder:0.22}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },
  "archaeo_decoder_v": { id:"archaeo_decoder_v", name:"文物译码器 V", slot:"low", level:80, time:200,xp:180,cost:{"三钛合金":2000,"同位聚合体":450,"铷":10,"磁场聚合物":40}, bonuses:{archaeologyDecoder:0.26}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true },

  // ===== 考古重做 — 7 张特殊考古装备蓝图（仅掉落蓝图，制造后属现有三类考古装备；requiresBlueprint） =====
  // 高槽：遗迹分析仪 — 扫描 + 周期缩短
  "archaeo_analyzer_frontier_i": { id:"archaeo_analyzer_frontier_i", name:"边疆遗迹分析仪 I", slot:"high", level:1,  time:25, xp:18, cost:{"三钛合金":60,"类银超金属":25}, bonuses:{archaeologyScan:7, archaeologyCycleReduction:0.02}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true, requiresBlueprint:true },
  "archaeo_analyzer_forbidden_iv": { id:"archaeo_analyzer_forbidden_iv", name:"禁区遗迹分析仪 IV", slot:"high", level:55, time:130,xp:120,cost:{"三钛合金":1000,"超新星诺克石":50,"等离子体":25,"钷":5}, bonuses:{archaeologyScan:23, archaeologyCycleReduction:0.05}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true, requiresBlueprint:true },
  "archaeo_analyzer_pioneer_v": { id:"archaeo_analyzer_pioneer_v", name:"先驱遗迹分析仪 V", slot:"high", level:80, time:210,xp:190,cost:{"三钛合金":2200,"超噬矿":20,"铷":12,"磁场聚合物":50}, bonuses:{archaeologyScan:32, archaeologyCycleReduction:0.06}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true, requiresBlueprint:true },
  // 中槽：信号稳定器 — 反噬减免 + 非致命免伤
  "archaeo_stabilizer_station_ii": { id:"archaeo_stabilizer_station_ii", name:"环站信号稳定器 II", slot:"mid", level:15, time:45, xp:40, cost:{"三钛合金":200,"类银超金属":80,"类晶体胶矿":20}, bonuses:{archaeologyStabilizer:0.08, archaeologyNonFatalAvoid:0.05}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true, requiresBlueprint:true },
  "archaeo_stabilizer_pioneer_v": { id:"archaeo_stabilizer_pioneer_v", name:"先驱信号稳定器 V", slot:"mid", level:80, time:210,xp:190,cost:{"三钛合金":2200,"超噬矿":20,"铷":12,"磁场聚合物":50}, bonuses:{archaeologyStabilizer:0.20, archaeologyNonFatalAvoid:0.12}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true, requiresBlueprint:true },
  // 低槽：文物译码器 — 稀有发现掉率加成 + 货柜焦点额外掉落一个货柜
  "archaeo_decoder_fleet_iii": { id:"archaeo_decoder_fleet_iii", name:"舰墓文物译码器 III", slot:"low", level:35, time:75, xp:65, cost:{"三钛合金":450,"同位聚合体":120,"稀有气体":10}, bonuses:{archaeologyDecoder:0.19, archaeologyCopyChance:0.04}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true, requiresBlueprint:true },
  "archaeo_decoder_pioneer_v": { id:"archaeo_decoder_pioneer_v", name:"先驱文物译码器 V", slot:"low", level:80, time:210,xp:190,cost:{"三钛合金":2200,"同位聚合体":500,"铷":12,"磁场聚合物":50}, bonuses:{archaeologyDecoder:0.28, archaeologyCopyChance:0.07}, shipTypes:ARCHAEOLOGY_SHIP_TYPES, archaeology:true, requiresBlueprint:true },

  // ===== 损伤控制单元（中槽主动耗燃料，全局减伤乘区；燃料=ceil(2/3×护盾回充器)，走 calcFuelMult 自动吃电容减免） =====
  "t1_damage_control": { id:"t1_damage_control", name:"小型损伤控制单元 I", slot:"mid", level:1, time:18, xp:10, cost:{"三钛合金":35,"类银超金属":15}, bonuses:{globalDamageReduction:0.05}, combat:{kind:"damageControl",fuelCost:1} },
  "t1_medium_damage_control": { id:"t1_medium_damage_control", name:"中型损伤控制单元 I", slot:"mid", level:35, time:42, xp:30, cost:{"三钛合金":120,"类银超金属":40,"同位素":8}, bonuses:{globalDamageReduction:0.08}, combat:{kind:"damageControl",fuelCost:2} },
  "t1_large_damage_control": { id:"t1_large_damage_control", name:"大型损伤控制单元 I", slot:"mid", level:55, time:65, xp:50, cost:{"三钛合金":240,"类银超金属":80,"超新星诺克石":10,"同位素":12}, bonuses:{globalDamageReduction:0.12}, combat:{kind:"damageControl",fuelCost:3} },
  "t1_capital_damage_control": { id:"t1_capital_damage_control", name:"旗舰级损伤控制阵列 I", slot:"mid", level:80, time:160, xp:110, cost:{"三钛合金":400,"基腹断岩":8,"超噬矿":6,"铷":1,"同位素":8,"磁场聚合物":8}, bonuses:{globalDamageReduction:0.18}, shipTypes:["capital","supercapital"], combat:{kind:"damageControl",fuelCost:4} },
  // 势力损伤控制单元：angel 吃死许可B（lv45，对标大型档）/ blood 吃死许可D（lv10，对标前哨型）；蓝图由 sourceZoneId 自动派生
  "angel_damage_control": { id:"angel_damage_control", name:"苍穹劫团损伤控制单元", slot:"mid", level:45, time:55, xp:45, cost:{"三钛合金":240,"类银超金属":80,"同位聚合体":10,"苍穹劫团装备生产许可B":5}, bonuses:{globalDamageReduction:0.12,shieldRepair:0.01}, combat:{kind:"damageControl",fuelCost:3}, faction:"angel", sourceZoneId:"angel_corridor", requiresBlueprint:true },
  "blood_damage_control": { id:"blood_damage_control", name:"赤誓教团损伤控制单元", slot:"mid", level:10, time:22, xp:12, cost:{"三钛合金":60,"类银超金属":20,"赤誓教团装备生产许可B":5}, bonuses:{globalDamageReduction:0.08,armorRepair:0.03}, combat:{kind:"damageControl",fuelCost:1}, faction:"blood", sourceZoneId:"blood_cathedral", requiresBlueprint:true },

  "angel_mining_gas_apoc": { id:"angel_mining_gas_apoc", name:"苍穹劫团采矿·气云采集器·终焉型", slot:"high", level:85, time:200, xp:150, cost:{"三钛合金":2000,"超噬矿":40,"铷":15,"磁场聚合物":50,"莫尔石":5,"苍穹劫团装备生产许可S":10}, bonuses:{miningEfficiency:1.0,gasEfficiency:1.0}, faction:"angel", sourceZoneId:"angel_outer_reach", shipTypes:["industrial_capital"], requiresBlueprint:true },
  "angel_drone_link_apoc": { id:"angel_drone_link_apoc", name:"苍穹劫团无人机指挥链路·终焉型", slot:"mid", level:85, time:200, xp:150,  cost:{"三钛合金":2000,"超噬矿":40,"铷":15,"磁场聚合物":50,"莫尔石":5,"苍穹劫团装备生产许可S":10}, bonuses:{miningEfficiency:0.35,gasEfficiency:0.35}, faction:"angel", sourceZoneId:"angel_outer_reach", shipTypes:["industrial_capital"], requiresBlueprint:true },
  "blood_mineral_assimilation_apoc": { id:"blood_mineral_assimilation_apoc", name:"赤誓矿物同化注入器·终焉型", slot:"low", level:85, time:200, xp:150, cost:{"三钛合金":2000,"超噬矿":40,"铷":15,"磁场聚合物":50,"莫尔石":5,"赤誓教团装备生产许可S":10}, bonuses:{miningLaserEfficiency:1.1}, faction:"blood", sourceZoneId:"blood_outer_reliquary", shipTypes:["industrial_capital"], requiresBlueprint:true },
  "blood_salvage_injector_apoc": { id:"blood_salvage_injector_apoc", name:"赤誓残骸打捞注入器·终焉型", slot:"low", level:85, time:200, xp:150, cost:{"三钛合金":2000,"超噬矿":40,"铷":15,"磁场聚合物":50,"莫尔石":5,"赤誓教团装备生产许可S":10}, bonuses:{salvageEfficiency:1.1}, salvageFuelPerKill:10, faction:"blood", sourceZoneId:"blood_outer_reliquary", shipTypes:["capital","supercapital","archaeology_capital"], requiresBlueprint:true },
  "sansha_gas_assimilation_apoc": { id:"sansha_gas_assimilation_apoc", name:"静默集群气体同化注入器·终焉型", slot:"low", level:85, time:200, xp:150, cost:{"三钛合金":2000,"超噬矿":40,"铷":15,"磁场聚合物":50,"莫尔石":5,"静默集群装备生产许可S":10}, bonuses:{gasLaserEfficiency:1.1}, faction:"sansha", sourceZoneId:"sansha_outer_array", shipTypes:["industrial_capital"], requiresBlueprint:true },

  // ===== 外接大型精炼泵（2026-09-02 定稿）：可安装于高/中/低槽任意一格（slot:"any"），
  //   安装时锁定另两类槽各 1 个空闲格作为管路接口（装备实例 anchor/reserves 记录，聚合器零改动）。
  //   冶炼速度 +10% 可叠加，与船体/改装同一加法区；每冶炼周期消耗等离子体 ×1/件（fuel 字段），
  //   断料自动降级不中断冶炼；可在冶炼面板「精炼泵」行开关（开关只影响下一炉）。
  "refinery_pump": { id:"refinery_pump", name:"外接大型精炼泵", slot:"any", level:40, time:100, xp:70,
    cost:{"三钛合金":450,"类银超金属":160,"同位聚合体":36,"稀有气体":18,"等离子体":30},
    bonuses:{smeltingSpeed:0.10},
    shipTypes:["industrial_frigate","industrial_destroyer","industrial_cruiser","industrial_support","industrial_battleship","industrial_capital"],
    fuel:{ resourceId:"planetary:等离子体", perCycle:1 },
    pump:true },
  // ===== 暗流体精炼泵（2026-09-07 定稿，spec §13）：虫洞印记商店图纸解锁（1400 印记，一次性）。
  //   大型泵上位：冶炼速度 +15%/件（同一加法区，可叠加）；燃料走 special:暗流体助熔触媒 ×1/件/周期，
  //   断料自动降级不中断冶炼（与大型泵同规则）。制造成本含泰坦材料（星骸钛晶/相位铱核，虫洞采集闭环）。
  "refinery_pump_dark": { id:"refinery_pump_dark", name:"暗流体精炼泵", slot:"any", level:50, time:200, xp:140,
    cost:{"三钛合金":800,"类银超金属":400,"同位聚合体":120,"稀有气体":60,"等离子体":80,"星骸钛晶":40,"相位铱核":20},
    bonuses:{smeltingSpeed:0.15},
    shipTypes:["industrial_frigate","industrial_destroyer","industrial_cruiser","industrial_support","industrial_battleship","industrial_capital"],
    fuel:{ resourceId:"special:暗流体助熔触媒", perCycle:1 },
    pump:true },
};

// 深空星疆复用：仅保留 EQUIPMENT_DB 纯数据字典，删去本作专属辅助函数/死亡空间/考古数据
if (typeof window !== "undefined") window.EQUIPMENT_DB = EQUIPMENT_DB;
