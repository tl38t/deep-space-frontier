// ================================================================
// 深空星疆 —— Data.Raids：星图上的具名海盗据点（战斗节点）
// ----------------------------------------------------------------
// 设计（2026-11-01 用户定稿）：**每个星系都有海盗据点**，与采矿（小行星带）、
//   采气（气云）、考古（残骸场）一样，是星系的四类基础作业点之一。
//   据点强度只由所属星域的安全等级决定（SEC_BAND），安等越低 band 越高。
//   · 据点直接挂在既有星图节点上（node.raid），不新增坐标 / 航程 / 探明逻辑，
//     跃迁、燃料、跳跃次数全部复用现有实现。
//   · **不再强制探明**（早期为「18 个稀有据点」写过强制探明；现在每星系都有，
//     强制探明等于开局点亮整张星图）。玩家探到哪打到哪。
//
// 命名沿用 1 代 js/data/combat.js 的 COMBAT_ZONES 词表（势力 + 据点类型），
//   每势力扩到 12 个词。一个星域有 19~27 个星系而词只有 12 个，**跨星系必然会重名**——
//   这是刻意的：据点靠「所属星系名」区分，星图与星系图都同时显示两者。
//
// 精锐：每星域 1 个（域内第一个非起始星系），band = 星域档 + 1（封顶 5），
//   赏金 ×1.5、声望 ×1.3。作用是让四个高安星域也有 band2 的挑战，梯度不断层。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Raids = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Raids = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 势力中文名（与 data/factions.js、data/pirates.js 的 factionName 保持一致）
  const FACTION_CN = { angel: "苍穹劫团", blood: "赤誓教团", sansha: "静默集群" };

  // 每势力 12 个据点类型词。星域内星系多于 12 时会循环复用（见文件头说明）。
  const NAME_POOL = {
    angel:  ["前哨站", "巡逻哨", "警戒站", "劫掠走廊", "猎杀空域", "破阵战场",
             "封锁线", "补给站", "伏击阵位", "突袭集结点", "前沿哨所", "战利品仓"],
    blood:  ["隐蔽所", "祷告堂", "献祭场", "深红圣堂", "铁血圣殿", "外环圣库",
             "忏悔室", "血契祭坛", "狂热集会场", "教团前哨", "赎罪牢笼", "圣物库"],
    sansha: ["哨站", "采集阵列", "控制节点", "同化枢纽", "统御矩阵", "外环同化阵列",
             "侦查结点", "增殖巢", "群体归化站", "核心耦合器", "静默信标", "母体接口"],
  };

  const ELITE_ISK = 1.5;   // 精锐赏金倍率（叠在星域安等倍率上）
  const ELITE_REP = 1.3;   // 精锐声望倍率
  const SEC_BAND = { "1.0-0.8": 1, "0.7-0.5": 2, "0.4-0.3": 3, "0.2-0.1": 4, "0.0": 5 };
  const SEC_ISK = { "1.0-0.8": 1.0, "0.7-0.5": 1.5, "0.4-0.3": 2.0, "0.2-0.1": 2.5, "0.0": 3.5 };
  const SEC_REP = { "1.0-0.8": 1.0, "0.7-0.5": 1.2, "0.4-0.3": 1.5, "0.2-0.1": 1.8, "0.0": 2.5 };
  const SEC_CN = { "1.0-0.8": "高安", "0.7-0.5": "边境", "0.4-0.3": "低安", "0.2-0.1": "深空", "0.0": "0.0" };

  // 把据点挂到星图节点上（幂等：每次都按同一规则重算并覆盖，不依赖旧值）
  // 规则固定 ⇒ 同一版本内结果恒定；对旧档也幂等（早期 18 个据点的档会被整体重算成 207 个）。
  function attach(map) {
    if (!map || !Array.isArray(map.nodes) || !Array.isArray(map.regions)) return map;
    const byRegion = {};
    for (const n of map.nodes) {
      if (n.raid) delete n.raid;          // 先清旧值，避免改规则后残留
      (byRegion[n.region] = byRegion[n.region] || []).push(n);
    }

    const used = { angel: 0, blood: 0, sansha: 0 };
    for (const reg of map.regions) {
      const pool = byRegion[reg.id] || [];
      const faction = reg.pirate || "sansha";
      const poolNames = NAME_POOL[faction] || NAME_POOL.sansha;
      const sec = reg.secLevel || "1.0-0.8";
      const baseBand = SEC_BAND[sec] || 1;
      // 每星域 1 个精锐：域内第一个「不是起始星系」的节点。固定规则，不随机。
      const eliteNode = pool.find(n => n.id !== map.startId) || pool[0];

      for (const n of pool) {
        const elite = !!eliteNode && n.id === eliteNode.id;
        const word = poolNames[used[faction] % poolNames.length];
        used[faction] += 1;
        const band = Math.max(1, Math.min(5, baseBand + (elite ? 1 : 0)));
        n.raid = {
          id: "raid_" + n.id,
          name: (FACTION_CN[faction] || faction) + word,
          word: word,
          faction: faction,
          secLevel: sec,
          secName: SEC_CN[sec] || "高安",
          band: band,
          elite: elite,
          iskMult: Math.round((SEC_ISK[sec] || 1) * (elite ? ELITE_ISK : 1) * 100) / 100,
          repMult: Math.round((SEC_REP[sec] || 1) * (elite ? ELITE_REP : 1) * 100) / 100,
        };
        // ⚠️ 这里**刻意不再强制探明**：早期「18 个稀有据点」时怕玩家找不到目标才强制点亮，
        //    现在每星系都有据点，继续强制探明等于开局把 207 个节点全部揭开 ——
        //    雾点/探索机制会整个失效。玩家探到哪，哪里才有可见的据点。
      }
    }
    return map;
  }

  function raidAt(map, nodeId) {
    if (!map || !Array.isArray(map.nodes)) return null;
    const n = map.nodes.find(x => x.id === nodeId);
    return (n && n.raid) ? n.raid : null;
  }

  // 全部据点（UI 列表 / 探针用），按 band 升序
  function allRaids(map) {
    if (!map || !Array.isArray(map.nodes)) return [];
    return map.nodes
      .filter(n => n.raid)
      .map(n => ({ nodeId: n.id, nodeName: n.name, region: n.region, raid: n.raid }))
      .sort((a, b) => a.raid.band - b.raid.band);
  }

  return { attach, raidAt, allRaids, FACTION_CN, NAME_POOL, SEC_BAND };
});
