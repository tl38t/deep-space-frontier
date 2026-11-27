/* 深空星疆 · 敌方编队数据（data/pirates.js）
 *
 * ⚠️ 数据来源：EVE-IDLE 正本 js/data/combat.js 的 ENEMY_DATABASE（2026-10-31 整组搬入）。
 *    hp / hit / dodge / baseDamage 全部为 1 代原值，未做任何缩放、未自创系数。
 *    只有「哪几型编成一队」是本作的分档映射（见 BAND_COMPOSITION）。
 *
 * 为什么必须整组搬：
 *   敌舰血量、我方武器伤害、命中率三者是同一量纲。若只搬武器不搬敌舰（或反之），
 *   击杀时间（TTK）就会失真——这正是 2026-10-31 之前用 HP_PER_POWER/DPS_PER_POWER
 *   自创缩放系数造成的错误（敌我耗时比与 1 代差 115 倍，敌人形同空气）。
 *
 * 分档映射：按 1 代敌舰等级段切 5 档（与 starmap 的安等分档一一对应）
 *   band1 高安  → lv1  normal + lv10 elite
 *   band2 边境  → lv20 normal + lv25 elite
 *   band3 低安  → lv40 normal + lv45 elite
 *   band4 深空  → lv60 normal + lv65 elite
 *   band5 0.0   → lv80 normal + lv82 elite
 *
 * 三势力的三防分布是 1 代的原生设计，天然对应三种武器克制：
 *   苍穹劫团 护盾厚（220/88/55）  → 激光（克护盾）好用
 *   赤誓教团 装甲厚（88/220/55）  → 导弹（克装甲）好用
 *   静默集群 结构厚（88/55/220）  → 射弹（克结构）好用
 *   （旧版「随安等变化」的三防占比是自创，已删除）
 *
 * 编队构成：2 普通 + 1 精英（UI 战斗面板固定 3 张敌舰卡）
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    var NSK = root.NSK || (root.NSK = {});
    NSK.Data = NSK.Data || {};
    NSK.Data.Pirates = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const KIND_CN = { normal: "普通", elite: "精英", boss: "BOSS" };

  // ---- 1 代敌舰原始数值（ENEMY_DATABASE 摘录，逐值照搬）----
  // 字段：name 中文名 / level 等级 / kind 类型 / hp 三防 / hit 命中 / dodge 闪避 / baseDamage 每轮伤害 / iskDrop 赏金
  const SHIPS = {
    angel: {
      factionName: "苍穹劫团",
      normal: {
        1: { id: "scout",             name: "苍穹劫团侦察兵",       level: 1,  kind: "normal", hp: { shield: 220,  armor: 88,   structure: 55    }, hit: 100, dodge: 30, baseDamage: 40,   iskDrop: 500  },
        2: { id: "patrol_destroyer",  name: "苍穹劫团巡猎驱逐舰",   level: 20, kind: "normal", hp: { shield: 545,  armor: 220,  structure: 135   }, hit: 120, dodge: 45, baseDamage: 94,   iskDrop: 500  },
        3: { id: "strike_cruiser",    name: "苍穹劫团突击巡洋舰",   level: 40, kind: "normal", hp: { shield: 1800, armor: 720,  structure: 450   }, hit: 145, dodge: 55, baseDamage: 310,  iskDrop: 1000 },
        4: { id: "siege_battleship",  name: "苍穹劫团攻城战列舰",   level: 60, kind: "normal", hp: { shield: 5400, armor: 2160, structure: 1350  }, hit: 170, dodge: 45, baseDamage: 930,  iskDrop: 2000 },
        5: { id: "frontier_capital",  name: "苍穹劫团边疆旗舰",     level: 80, kind: "normal", hp: { shield: 15000, armor: 6000, structure: 3750 }, hit: 310, dodge: 65, baseDamage: 1800, iskDrop: 4000 },
      },
      elite: {
        1: { id: "raider",            name: "苍穹劫团突击舰",       level: 10, kind: "elite",  hp: { shield: 550,   armor: 220,   structure: 110   }, hit: 130, dodge: 40, baseDamage: 59,   iskDrop: 1500 },
        2: { id: "raider_destroyer",  name: "苍穹劫团掠袭驱逐舰",   level: 25, kind: "elite",  hp: { shield: 1200,  armor: 500,   structure: 300   }, hit: 150, dodge: 60, baseDamage: 141,  iskDrop: 1500 },
        3: { id: "war_cruiser",       name: "苍穹劫团战斗巡洋舰",   level: 45, kind: "elite",  hp: { shield: 4140,  armor: 1620,  structure: 900   }, hit: 180, dodge: 70, baseDamage: 465,  iskDrop: 3000 },
        4: { id: "marauder_battleship", name: "苍穹劫团掠袭战列舰", level: 65, kind: "elite",  hp: { shield: 12420, armor: 4860,  structure: 2700  }, hit: 210, dodge: 60, baseDamage: 1395, iskDrop: 6000 },
        // ★ P1b：auraDamage 是 1 代原值（data/combat.js 该条目带 auraDamage:1.3）。
        //   在场时其余敌舰伤害 ×1.3（自身不吃）。P0 搬数据时漏了这一字段，P1b 补。
        5: { id: "frontier_commander", name: "苍穹劫团边疆指挥舰",  level: 82, kind: "elite",  hp: { shield: 37500, armor: 15000, structure: 9375  }, hit: 320, dodge: 68, baseDamage: 1800, auraDamage: 1.3, iskDrop: 12000 },
      },
      // ★ 2026-11-27 P0：boss 档（1 代 ENEMY_DATABASE 逐值照搬）。第 20 波强制出现，不参与抽签。
      //   对照 1 代据点→boss：lv1 高安=commander(lv20) / lv20 边境=hunter_commander(lv30) /
      //   lv40 低安=fleet_commander(lv50) / lv60 深空=war_master(lv70) / lv80 0.0=outer_reach_overseer(lv90)。
      //   ⚠️ 三势力的三防分布沿用 1 代原生设计：苍穹护盾厚 / 赤誓装甲厚 / 静默结构厚。
      boss: {
        1: { id: "commander",            name: "苍穹劫团指挥官",     level: 20, kind: "boss", hp: { shield: 1853,  armor: 65,    structure: 32    }, hit: 160, dodge: 50, baseDamage: 96,   iskDrop: 4000  },
        2: { id: "hunter_commander",     name: "苍穹劫团猎杀指挥官", level: 30, kind: "boss", hp: { shield: 4200,  armor: 200,   structure: 100   }, hit: 200, dodge: 70, baseDamage: 308,  iskDrop: 4000  },
        3: { id: "fleet_commander",      name: "苍穹劫团舰队指挥官", level: 50, kind: "boss", hp: { shield: 14040, armor: 630,   structure: 270   }, hit: 235, dodge: 85, baseDamage: 990,  iskDrop: 8000  },
        4: { id: "war_master",           name: "苍穹劫团战争主宰",   level: 70, kind: "boss", hp: { shield: 42120, armor: 1890,  structure: 810   }, hit: 270, dodge: 70, baseDamage: 2970, iskDrop: 16000 },
        5: { id: "outer_reach_overseer", name: "苍穹劫团外环督军",   level: 90, kind: "boss", hp: { shield: 117000, armor: 5250, structure: 2250  }, hit: 400, dodge: 85, baseDamage: 5700, iskDrop: 32000 },
      },
    },
    blood: {
      factionName: "赤誓教团",
      normal: {
        1: { id: "acolyte",           name: "赤誓教团侍僧",         level: 1,  kind: "normal", hp: { shield: 88,   armor: 220,   structure: 55    }, hit: 110, dodge: 25, baseDamage: 44,   iskDrop: 500  },
        2: { id: "ritual_destroyer",  name: "赤誓教团仪式驱逐舰",   level: 20, kind: "normal", hp: { shield: 220,  armor: 545,   structure: 135   }, hit: 130, dodge: 40, baseDamage: 82,   iskDrop: 500  },
        3: { id: "sermon_cruiser",    name: "赤誓教团布道巡洋舰",   level: 40, kind: "normal", hp: { shield: 702,  armor: 1755,  structure: 439   }, hit: 155, dodge: 50, baseDamage: 280,  iskDrop: 1000 },
        4: { id: "iron_battleship",   name: "赤誓教团铁律战列舰",   level: 60, kind: "normal", hp: { shield: 2106, armor: 5265,  structure: 1317  }, hit: 180, dodge: 40, baseDamage: 840,  iskDrop: 2000 },
        5: { id: "covenant_capital",  name: "赤誓教团圣约旗舰",     level: 80, kind: "normal", hp: { shield: 5850, armor: 14625, structure: 3656  }, hit: 320, dodge: 60, baseDamage: 1620, iskDrop: 4000 },
      },
      elite: {
        1: { id: "priest",            name: "赤誓教团祭司",         level: 10, kind: "elite",  hp: { shield: 220,  armor: 550,   structure: 110   }, hit: 140, dodge: 35, baseDamage: 66,   iskDrop: 1500 },
        2: { id: "blood_destroyer",   name: "赤誓教团鲜血驱逐舰",   level: 25, kind: "elite",  hp: { shield: 500,  armor: 1200,  structure: 300   }, hit: 160, dodge: 55, baseDamage: 123,  iskDrop: 1500 },
        3: { id: "sacrament_cruiser", name: "赤誓教团圣礼巡洋舰",   level: 45, kind: "elite",  hp: { shield: 1580, armor: 4037,  structure: 878   }, hit: 190, dodge: 65, baseDamage: 420,  iskDrop: 3000 },
        4: { id: "apostle_battleship", name: "赤誓教团使徒战列舰",  level: 65, kind: "elite",  hp: { shield: 4740, armor: 12111, structure: 2634  }, hit: 220, dodge: 55, baseDamage: 1260, iskDrop: 6000 },
        5: { id: "covenant_commander", name: "赤誓教团圣约指挥舰",  level: 82, kind: "elite",  hp: { shield: 14625, armor: 36563, structure: 9141 }, hit: 330, dodge: 63, baseDamage: 1620, auraDamage: 1.3, iskDrop: 12000 },
      },
      boss: {
        1: { id: "cardinal",                name: "赤誓教团主教",       level: 20, kind: "boss", hp: { shield: 65,     armor: 1853,  structure: 32    }, hit: 170, dodge: 45, baseDamage: 96,   iskDrop: 4000  },
        2: { id: "high_priest",             name: "赤誓教团大祭司",     level: 30, kind: "boss", hp: { shield: 200,    armor: 4200,  structure: 100   }, hit: 210, dodge: 65, baseDamage: 260,  iskDrop: 4000  },
        3: { id: "blood_archon",            name: "赤誓教团鲜血执政官", level: 50, kind: "boss", hp: { shield: 614,    armor: 13689, structure: 263   }, hit: 245, dodge: 80, baseDamage: 840,  iskDrop: 8000  },
        4: { id: "blood_sovereign",         name: "赤誓教团鲜血君王",   level: 70, kind: "boss", hp: { shield: 1842,   armor: 41067, structure: 789   }, hit: 280, dodge: 65, baseDamage: 2570, iskDrop: 16000 },
        5: { id: "outer_reliquary_overseer", name: "赤誓教团外环圣主",  level: 90, kind: "boss", hp: { shield: 5119,   armor: 114075, structure: 2194 }, hit: 410, dodge: 80, baseDamage: 5130, iskDrop: 32000 },
      },
    },
    sansha: {
      factionName: "静默集群",
      normal: {
        1: { id: "drone",                   name: "静默集群无人机",     level: 1,  kind: "normal", hp: { shield: 88,    armor: 55,    structure: 220   }, hit: 90,  dodge: 35, baseDamage: 42,   iskDrop: 500  },
        2: { id: "control_destroyer",       name: "静默集群控制驱逐舰", level: 20, kind: "normal", hp: { shield: 220,   armor: 135,   structure: 545   }, hit: 110, dodge: 50, baseDamage: 74,   iskDrop: 500  },
        3: { id: "assimilation_cruiser",    name: "静默集群同化巡洋舰", level: 40, kind: "normal", hp: { shield: 720,   armor: 450,   structure: 1800  }, hit: 135, dodge: 60, baseDamage: 250,  iskDrop: 1000 },
        4: { id: "command_battleship",      name: "静默集群指令战列舰", level: 60, kind: "normal", hp: { shield: 2160,  armor: 1350,  structure: 5400  }, hit: 160, dodge: 50, baseDamage: 750,  iskDrop: 2000 },
        5: { id: "nexus_capital",           name: "静默集群枢纽旗舰",   level: 80, kind: "normal", hp: { shield: 6000,  armor: 3750,  structure: 15000 }, hit: 300, dodge: 70, baseDamage: 1440, iskDrop: 4000 },
      },
      elite: {
        1: { id: "sentinel",                name: "静默集群哨兵",       level: 10, kind: "elite",  hp: { shield: 220,   armor: 110,   structure: 550   }, hit: 120, dodge: 45, baseDamage: 63,   iskDrop: 1500 },
        2: { id: "sentinel_destroyer",      name: "静默集群哨戒驱逐舰", level: 25, kind: "elite",  hp: { shield: 500,   armor: 300,   structure: 1200  }, hit: 140, dodge: 65, baseDamage: 111,  iskDrop: 1500 },
        3: { id: "dominion_cruiser",        name: "静默集群统御巡洋舰", level: 45, kind: "elite",  hp: { shield: 1620,  armor: 900,   structure: 4140  }, hit: 170, dodge: 75, baseDamage: 375,  iskDrop: 3000 },
        4: { id: "domination_battleship",   name: "静默集群支配战列舰", level: 65, kind: "elite",  hp: { shield: 4860,  armor: 2700,  structure: 12420 }, hit: 200, dodge: 65, baseDamage: 1125, iskDrop: 6000 },
        5: { id: "nexus_commander",         name: "静默集群枢纽指挥舰", level: 82, kind: "elite",  hp: { shield: 15000, armor: 9375,  structure: 37500 }, hit: 310, dodge: 73, baseDamage: 1440, auraDamage: 1.3, iskDrop: 12000 },
      },
      boss: {
        1: { id: "overlord",             name: "静默集群领主",     level: 20, kind: "boss", hp: { shield: 65,    armor: 32,    structure: 1853  }, hit: 150, dodge: 55, baseDamage: 96,   iskDrop: 4000  },
        2: { id: "control_overlord",     name: "静默集群控制领主", level: 30, kind: "boss", hp: { shield: 200,   armor: 100,   structure: 4200  }, hit: 190, dodge: 75, baseDamage: 226,  iskDrop: 4000  },
        3: { id: "nexus_overlord",       name: "静默集群枢纽领主", level: 50, kind: "boss", hp: { shield: 630,   armor: 270,   structure: 14040 }, hit: 225, dodge: 90, baseDamage: 801,  iskDrop: 8000  },
        4: { id: "matrix_overlord",      name: "静默集群矩阵领主", level: 70, kind: "boss", hp: { shield: 1890,  armor: 810,   structure: 42120 }, hit: 260, dodge: 75, baseDamage: 2550, iskDrop: 16000 },
        5: { id: "outer_array_overseer", name: "静默集群外环主脑", level: 90, kind: "boss", hp: { shield: 5250,  armor: 2250,  structure: 117000 }, hit: 390, dodge: 90, baseDamage: 4560, iskDrop: 32000 },
      },
    },
  };

  // 默认编队：2 普通 + 1 精英。
  // ★ 2026-11-27 P0 起**只作为向后兼容默认值**（`fleetFor` 不传 compId 时使用），
  //   真实战斗每波由 rollFormation 按 band 的池抽签（见 BAND_FORMATION_POOLS）。
  //   保留它是为了让探针（sim/arch_probe.mjs:1248 断言 3 艘）与所有旧调用点行为完全不变。
  const BAND_COMPOSITION = {
    1: ["normal", "normal", "elite"],
    2: ["normal", "normal", "elite"],
    3: ["normal", "normal", "elite"],
    4: ["normal", "normal", "elite"],
    5: ["normal", "normal", "elite"],
  };

  // ★ 2026-11-27 P0：band → 编队池（1 代 js/data/combat.js:95-131 的 COMBAT_FORMATION_POOLS 逐值照搬）
  // ⚠️⚠️ **各安等的池不同** —— 这是 1 代的核心手感：越危险，精英编队占比越高。
  //   含精英概率：band1 10% → band2 30% → band3 40% → band4 50% → band5 60%。
  //   本作 band 与 1 代池的对应：
  //     1 → highsec   (安等 1.0-0.8)
  //     2 → bordersec (安等 0.7-0.5)
  //     3 → lowsec    (安等 0.4-0.3)
  //     4 → deepsec   (安等 0.2-0.1)
  //     5 → nullsec   (安等 0.0 外环)
  //   ⚠️ band5 用 nullsec **不是** deepnull：本作 SEC_BAND（data/raids.js:49）只有 5 档且 "0.0"→5，
  //      band5 敌舰是 lv80/lv82，对应 1 代「0.0 外环」（data/combat.js:166-168，formationPool:"nullsec"）。
  //      deepnull 对应 lv90 深层 / lv110 深渊，本作没有这两档敌舰，暂不接（将来加深层星域再启用）。
  //   ⚠️ 1 代 getFactionEliteChanceBonus（负势力声望拉高精英率）**本作不接**：
  //      本作只有单一 state.res.rep（settle.js:329），没有分势力声望，接了就是死机制。
  const BAND_FORMATION_POOLS = {
    1: [ { id: "2_normal",         normal: 2, elite: 0, chance: 0.45 },
         { id: "3_normal",         normal: 3, elite: 0, chance: 0.45 },
         { id: "2_normal_1_elite", normal: 2, elite: 1, chance: 0.08 },
         { id: "3_normal_1_elite", normal: 3, elite: 1, chance: 0.02 } ],
    2: [ { id: "2_normal",         normal: 2, elite: 0, chance: 0.30 },
         { id: "3_normal",         normal: 3, elite: 0, chance: 0.40 },
         { id: "2_normal_1_elite", normal: 2, elite: 1, chance: 0.20 },
         { id: "3_normal_1_elite", normal: 3, elite: 1, chance: 0.10 } ],
    3: [ { id: "2_normal",         normal: 2, elite: 0, chance: 0.25 },
         { id: "3_normal",         normal: 3, elite: 0, chance: 0.35 },
         { id: "2_normal_1_elite", normal: 2, elite: 1, chance: 0.25 },
         { id: "3_normal_1_elite", normal: 3, elite: 1, chance: 0.15 } ],
    4: [ { id: "2_normal",         normal: 2, elite: 0, chance: 0.20 },
         { id: "3_normal",         normal: 3, elite: 0, chance: 0.30 },
         { id: "2_normal_1_elite", normal: 2, elite: 1, chance: 0.30 },
         { id: "3_normal_1_elite", normal: 3, elite: 1, chance: 0.20 } ],
    5: [ { id: "2_normal",         normal: 2, elite: 0, chance: 0.15 },
         { id: "3_normal",         normal: 3, elite: 0, chance: 0.25 },
         { id: "2_normal_1_elite", normal: 2, elite: 1, chance: 0.35 },
         { id: "3_normal_1_elite", normal: 3, elite: 1, chance: 0.25 } ],
  };

  // compId → 舰种序列。顺序沿用 1 代 buildCombatWave：先普通、后精英。
  const COMP_KINDS = {
    "2_normal":         ["normal", "normal"],
    "3_normal":         ["normal", "normal", "normal"],
    "2_normal_1_elite": ["normal", "normal", "elite"],
    "3_normal_1_elite": ["normal", "normal", "normal", "elite"],
  };

  // BOSS 波 = 1 个 boss + bossEscortCount 个 normal 护航（1 代 combat.js:321）。
  // 1 代仅「0.0 深层」lv90 据点 bossEscortCount=2，其余全为 1；
  // 本作 band5 对应 1 代「0.0 外环」⇒ 1。
  const BOSS_ESCORT = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };

  // ★ 2026-11-27 P2：整轮肃清功勋（1 代 data/combat.js 每个据点的 clearLp 字段，
  //   `systems/combat.js:1374-1380` 在 wave >= maxWave 时按 clearLp 发 currency:lp）。
  //   1 代按据点**等级**给 7 档真值：lv1→3 / lv20→6 / lv40→10 / lv60→15 / lv80→25 / lv90→30 / 先驱→40。
  //   本作据点强度只由 band 决定（没有 1 代那套 level 字段），故按 band 取前五档；
  //   band5 对应 1 代 lv80（lv90/先驱 属死亡空间外围，本作暂无）。
  const CLEAR_LP_BY_BAND = { 1: 3, 2: 6, 3: 10, 4: 15, 5: 25 };
  function clearLpOf(band) { return CLEAR_LP_BY_BAND[clampBand(band)] || 0; }

  // 该 band 的一轮波数（一轮 = 19 普通波 + 1 boss 波，1 代 maxWave=20）
  const MAX_WAVE = 20;

  // 1 代 ENEMY_DATABASE 的 boss 特殊字段（combat.js 消费）。
  // fleetFor 是逐字段手抄的，漏掉任何一个 = 该机制静默失效，故集中登记、循环透传。
  const SPECIAL_FIELDS = [
    "auraDamage",      // 编队光环：存活时其余敌舰伤害 ×aura（自身不吃）
    "bossHealPct",     // 相位重构：每 bossHealEvery 轮回复 maxTotal × pct
    "bossHealEvery",
    "enrageMul",       // 狂暴：自身血量比 < enrageAt 时，自身伤害 ×enrageMul
    "enrageAt",
    "repairSuppr",     // 抑制修理：存活时我方维修 ×(1 - s)
  ];

  function compKinds(compId, band) {
    if (compId === "boss") {
      const n = BOSS_ESCORT[clampBand(band)] || 1;
      const arr = ["boss"];
      for (let i = 0; i < n; i++) arr.push("normal");
      return arr;
    }
    return COMP_KINDS[compId] || BAND_COMPOSITION[clampBand(band)];
  }

  // 抽签：按该 band 池的权重掷一次。返回 { compId, normal, elite, boss }
  // randomFn 可注入（探针钉桩用）；省略则 Math.random。
  function rollFormation(band, randomFn) {
    const b = clampBand(band);
    const pool = BAND_FORMATION_POOLS[b] || BAND_FORMATION_POOLS[1];
    const roll = (typeof randomFn === "function") ? randomFn : Math.random;
    const v = roll();
    let cum = 0;
    for (let i = 0; i < pool.length; i++) {
      cum += pool[i].chance;
      if (v < cum) return { compId: pool[i].id, normal: pool[i].normal, elite: pool[i].elite, boss: 0 };
    }
    const last = pool[pool.length - 1];
    return { compId: last.id, normal: last.normal, elite: last.elite, boss: 0 };
  }

  // BOSS 波固定编队（不抽签）
  function bossFormation(band) {
    const b = clampBand(band);
    return { compId: "boss", normal: BOSS_ESCORT[b] || 1, elite: 0, boss: 1 };
  }

  const BAND_TITLE = { 1: "游猎编队", 2: "劫掠编队", 3: "猎杀编队", 4: "深空战团", 5: "旗舰战团" };

  function clampBand(band) {
    const b = Math.round(Number(band) || 1);
    return Math.min(5, Math.max(1, b));
  }

  function totalOf(hp) { return (hp.shield || 0) + (hp.armor || 0) + (hp.structure || 0); }

  function factionKey(faction) {
    return SHIPS[faction] ? faction : "sansha";
  }

  // 生成某档某势力的敌方编队。
  // ★ 2026-11-27 P0：新增第三参 compId（"2_normal" / "3_normal" / "2_normal_1_elite" /
  //   "3_normal_1_elite" / "boss"）。**省略时退回 BAND_COMPOSITION 默认编队**，
  //   保证原有 4 处调用点（combat.js:309、app.js:83/720、arch_probe.mjs:1521+）与探针断言零影响。
  // 返回 { band, faction, factionName, title, compId, isBossWave, ships[], totalHp, dps, split, evasion, hpSum }
  //   dps      = 编队每轮总伤害（1 代 baseDamage 之和，未乘命中率；命中在我方结算侧算）
  //   split    = 三防在编队总血中的占比（克制判定用当前层，此字段仅供 UI/探针参考）
  //   evasion  = 按血量加权的编队闪避（命中率分母）
  function fleetFor(band, faction, compId) {
    const b = clampBand(band);
    const fac = factionKey(faction);
    const db = SHIPS[fac];
    const comp = compKinds(compId, b);
    const seen = { normal: 0, elite: 0, boss: 0 };
    const isBossWave = compId === "boss";

    const ships = comp.map(function (kind, i) {
      const tpl = db[kind] && db[kind][b];
      if (!tpl) return null;                       // 数据缺失时跳过，不让整队崩掉
      const n = seen[kind]++;
      const maxHp = { shield: tpl.hp.shield, armor: tpl.hp.armor, structure: tpl.hp.structure };
      const ship = {
        id: b + "_" + fac + "_" + tpl.id + "_" + n,
        type: tpl.id,
        name: tpl.name,
        level: tpl.level,
        kind: tpl.kind,
        kindCn: KIND_CN[tpl.kind] || "普通",
        hit: tpl.hit,
        dodge: tpl.dodge,
        baseDamage: tpl.baseDamage,
        iskDrop: tpl.iskDrop,
        maxHp: maxHp,
        hp: { shield: maxHp.shield, armor: maxHp.armor, structure: maxHp.structure },
        total: totalOf(maxHp),
      };
      // ★ P1c 修：boss 特殊机制字段必须**透传**。
      //   P1b 只在 SHIPS 模板上加了 auraDamage，却忘了 fleetFor 是逐字段手抄的 ——
      //   combat.js 读 ships[i].auraDamage / bossHealPct / repairSuppr 全是 undefined，
      //   于是光环、相位重构回血、抑制修理、狂暴四条机制**全是死代码**（本轮一并修）。
      for (let fi = 0; fi < SPECIAL_FIELDS.length; fi++) {
        const k = SPECIAL_FIELDS[fi];
        if (tpl[k] !== undefined) ship[k] = tpl[k];
      }
      return ship;
    }).filter(Boolean);   // 数据缺失时剔除，避免后面解引用 null

    let totalHp = 0, dps = 0, wDodge = 0;
    const sum = { shield: 0, armor: 0, structure: 0 };
    for (const s of ships) {
      totalHp += s.total;
      dps += s.baseDamage;
      wDodge += s.dodge * s.total;
      sum.shield += s.maxHp.shield;
      sum.armor += s.maxHp.armor;
      sum.structure += s.maxHp.structure;
    }
    const split = totalHp > 0
      ? { shield: sum.shield / totalHp, armor: sum.armor / totalHp, structure: sum.structure / totalHp }
      : { shield: 0, armor: 0, structure: 0 };

    return {
      band: b,
      faction: fac,
      factionName: db.factionName,
      title: BAND_TITLE[b],
      compId: compId || "default",
      isBossWave: isBossWave,
      ships: ships,
      totalHp: totalHp,
      dps: dps,
      split: split,
      evasion: totalHp > 0 ? wDodge / totalHp : 30,
      hpSum: sum,
    };
  }

  // ★ 2026-11-27 死亡空间：按 1 代 systems/combat.js buildDeathspaceWave 原式构造单波编队。
  //   每波 = escortNormal 艘普通舰 + 1 艘 boss 当 wave leader（名字用 wave.name），
  //   血量 ×(balance.hp×[finalHp])×wave.hpMult，伤害 ×(balance.damage×[finalDamage])×wave.damageMult，
  //   与 1 代逐值同源。返回结构与 fleetFor 完全一致，可直接喂给 prepareNode 的 fleet 注入口。
  //   ⚠️ 本函数只被死亡空间调用；普通据点的 fleetFor 一行不改。
  function fleetForSite(site, waveIndex) {
    if (!site || !Array.isArray(site.waves)) return null;
    const wi = Math.max(0, Math.min(site.waves.length - 1, Math.round(waveIndex || 1) - 1));
    const w = site.waves[wi];
    if (!w) return null;
    const fac = factionKey(site.faction);
    const db = SHIPS[fac];
    if (!db) return null;                      // precursor 等无模板势力：数据先落库、入口不做
    const b = clampBand(site.band || 1);
    const bal = site.combatBalance || {};
    const isFinal = !!w.final;
    const hpScale = (bal.hp || 1) * (isFinal ? (bal.finalHp || 1) : 1);
    const dmgScale = (bal.damage || 1) * (isFinal ? (bal.finalDamage || 1) : 1);

    function makeShip(kind, seq, scaleHp, scaleDmg, displayName) {
      const tpl = db[kind] && db[kind][b];
      if (!tpl) return null;
      const maxHp = {
        shield: Math.max(1, Math.round(tpl.hp.shield * scaleHp)),
        armor: Math.max(1, Math.round(tpl.hp.armor * scaleHp)),
        structure: Math.max(1, Math.round(tpl.hp.structure * scaleHp)),
      };
      const ship = {
        id: "ds" + b + "_" + fac + "_" + tpl.id + "_" + seq,
        type: tpl.id,
        name: displayName || tpl.name,
        level: tpl.level,
        kind: tpl.kind,
        kindCn: KIND_CN[tpl.kind] || "普通",
        hit: tpl.hit,
        dodge: tpl.dodge,
        baseDamage: Math.max(1, Math.round(tpl.baseDamage * scaleDmg)),
        iskDrop: tpl.iskDrop,
        maxHp: maxHp,
        hp: { shield: maxHp.shield, armor: maxHp.armor, structure: maxHp.structure },
        total: totalOf(maxHp),
        deathspaceLeader: kind === "boss",
        deathspaceWave: wi + 1,
        deathspaceFinal: isFinal,
      };
      for (let fi = 0; fi < SPECIAL_FIELDS.length; fi++) {
        const k = SPECIAL_FIELDS[fi];
        if (tpl[k] !== undefined) ship[k] = tpl[k];
      }
      return ship;
    }

    const ships = [];
    for (let i = 0; i < Math.max(0, Math.round(w.escortNormal || 0)); i++) {
      const s = makeShip("normal", i, hpScale, dmgScale);
      if (s) ships.push(s);
    }
    const leader = makeShip("boss", 0, hpScale * (w.hpMult || 1), dmgScale * (w.damageMult || 1), w.name);
    if (leader) ships.push(leader);

    let totalHp = 0, dps = 0, wDodge = 0;
    const sum = { shield: 0, armor: 0, structure: 0 };
    for (const s of ships) {
      totalHp += s.total;
      dps += s.baseDamage;
      wDodge += s.dodge * s.total;
      sum.shield += s.maxHp.shield;
      sum.armor += s.maxHp.armor;
      sum.structure += s.maxHp.structure;
    }
    return {
      band: b, faction: fac, factionName: db.factionName,
      title: w.name, compId: "ds_wave_" + (wi + 1), isBossWave: isFinal,
      ships: ships, totalHp: totalHp, dps: dps,
      split: totalHp > 0
        ? { shield: sum.shield / totalHp, armor: sum.armor / totalHp, structure: sum.structure / totalHp }
        : { shield: 0, armor: 0, structure: 0 },
      evasion: totalHp > 0 ? wDodge / totalHp : 30,
      hpSum: sum,
    };
  }

  // 兼容接口：某档编队总血 / 每轮总伤害（供探针与 UI 快速取用）
  // ⚠️ 2026-11-01 清理：删掉 totalHp(band) / fleetDps(band) 两个只取 angel 势力的
  //    便捷 wrapper（无人调用，且默认势力会让调用方误以为「强度与势力无关」）。
  //    要强度就 fleetFor(band, faction) 现取，势力不同血量/火力本来就不同。

  return {
    FACTION_NAME: { angel: "苍穹劫团", blood: "赤誓教团", sansha: "静默集群" },
    SHIPS: SHIPS,
    BAND_COMPOSITION: BAND_COMPOSITION,
    BAND_FORMATION_POOLS: BAND_FORMATION_POOLS,   // ★ P0：band → 编队池（各安等不同）
    CLEAR_LP_BY_BAND: CLEAR_LP_BY_BAND,           // ★ P2：整轮肃清功勋（1 代 zone.clearLp）
    COMP_KINDS: COMP_KINDS,
    BOSS_ESCORT: BOSS_ESCORT,
    MAX_WAVE: MAX_WAVE,
    fleetForSite: fleetForSite,                // ★ 死亡空间单波编队（1 代 buildDeathspaceWave 原式）
    KIND_CN: KIND_CN,
    clampBand: clampBand,
    factionKey: factionKey,
    compKinds: compKinds,
    clearLpOf: clearLpOf,
    rollFormation: rollFormation,     // ★ P0：每波抽签
    bossFormation: bossFormation,     // ★ P0：第 20 波固定 boss
    fleetFor: fleetFor,               // ★ P0：第三参 compId
  };
});
