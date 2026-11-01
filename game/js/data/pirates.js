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
        5: { id: "frontier_commander", name: "苍穹劫团边疆指挥舰",  level: 82, kind: "elite",  hp: { shield: 37500, armor: 15000, structure: 9375  }, hit: 320, dodge: 68, baseDamage: 1800, iskDrop: 12000 },
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
        5: { id: "covenant_commander", name: "赤誓教团圣约指挥舰",  level: 82, kind: "elite",  hp: { shield: 14625, armor: 36563, structure: 9141 }, hit: 330, dodge: 63, baseDamage: 1620, iskDrop: 12000 },
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
        5: { id: "nexus_commander",         name: "静默集群枢纽指挥舰", level: 82, kind: "elite",  hp: { shield: 15000, armor: 9375,  structure: 37500 }, hit: 310, dodge: 73, baseDamage: 1440, iskDrop: 12000 },
      },
    },
  };

  // 编队构成：2 普通 + 1 精英（与战斗面板 3 张敌舰卡对应）
  const BAND_COMPOSITION = {
    1: ["normal", "normal", "elite"],
    2: ["normal", "normal", "elite"],
    3: ["normal", "normal", "elite"],
    4: ["normal", "normal", "elite"],
    5: ["normal", "normal", "elite"],
  };

  const BAND_TITLE = { 1: "游猎编队", 2: "劫掠编队", 3: "猎杀编队", 4: "深空战团", 5: "旗舰战团" };

  function clampBand(band) {
    const b = Math.round(Number(band) || 1);
    return Math.min(5, Math.max(1, b));
  }

  function totalOf(hp) { return (hp.shield || 0) + (hp.armor || 0) + (hp.structure || 0); }

  function factionKey(faction) {
    return SHIPS[faction] ? faction : "sansha";
  }

  // 生成某档某势力的敌方编队（确定性：同 band + faction 恒等，便于存档/探针/UI）
  // 返回 { band, faction, factionName, title, ships[], totalHp, dps, split, evasion }
  //   dps      = 编队每轮总伤害（1 代 baseDamage 之和，未乘命中率；命中在我方结算侧算）
  //   split    = 三防在编队总血中的占比（克制判定用当前层，此字段仅供 UI/探针参考）
  //   evasion  = 按血量加权的编队闪避（命中率分母）
  function fleetFor(band, faction) {
    const b = clampBand(band);
    const fac = factionKey(faction);
    const db = SHIPS[fac];
    const comp = BAND_COMPOSITION[b];
    const seen = { normal: 0, elite: 0 };

    const ships = comp.map(function (kind, i) {
      const tpl = db[kind][b];
      const n = seen[kind]++;
      const maxHp = { shield: tpl.hp.shield, armor: tpl.hp.armor, structure: tpl.hp.structure };
      return {
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
    });

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
      ships: ships,
      totalHp: totalHp,
      dps: dps,
      split: split,
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
    KIND_CN: KIND_CN,
    clampBand: clampBand,
    factionKey: factionKey,
    fleetFor: fleetFor,
  };
});
