// ================================================================
// 深空星疆 —— Data.Raids：星图上的具名海盗据点（战斗节点）
// ----------------------------------------------------------------
// 设计意图（2026-11-01）：
//   · 剿匪不再是「任意采矿节点顺手就能打」，而是**星图上一批具名据点**。
//     否则「去哪个节点打」不构成决策，207 个节点全可打等于难度自选菜单。
//   · 据点直接挂在既有星图节点上（node.raid），不新增坐标 / 航程 / 探明逻辑，
//     跃迁、燃料、跳跃次数全部复用现有实现。
//
// 命名沿用 1 代 js/data/combat.js 的 COMBAT_ZONES 词表（势力 + 据点类型）：
//   苍穹劫团：前哨站 / 巡逻哨 / 警戒站 / 劫掠走廊 / 猎杀空域 / 破阵战场
//   赤誓教团：隐蔽所 / 祷告堂 / 献祭场 / 深红圣堂 / 铁血圣殿 / 外环圣库
//   静默集群：哨站 / 采集阵列 / 控制节点 / 同化枢纽 / 统御矩阵 / 外环同化阵列
//   （1 代原词为前哨站/劫掠走廊/猎杀空域/破阵战场/外环侵袭区/深域王庭 等；
//     本作每势力需要 6 个不重名据点，高安档补了中性词「巡逻哨/警戒站」等。）
//
// 数量：每星域 2 个 = 18 个。
//   · 常规：band = 星域安等档（SECLEVEL_TABLE.band）
//   · 精锐：band = 星域档 + 1（封顶 5），赏金 ×1.5、声望 ×1.3
//   精锐的存在是为了让四个高安星域也有 band2 的挑战，梯度不断层。
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

  // 每势力 6 个据点类型词（按星域出现顺序依次取用，保证同势力内不重名）
  const NAME_POOL = {
    angel:  ["前哨站", "巡逻哨", "警戒站", "劫掠走廊", "猎杀空域", "破阵战场"],
    blood:  ["隐蔽所", "祷告堂", "献祭场", "深红圣堂", "铁血圣殿", "外环圣库"],
    sansha: ["哨站", "采集阵列", "控制节点", "同化枢纽", "统御矩阵", "外环同化阵列"],
  };

  const ELITE_ISK = 1.5;   // 精锐赏金倍率（叠在星域安等倍率上）
  const ELITE_REP = 1.3;   // 精锐声望倍率
  const SEC_BAND = { "1.0-0.8": 1, "0.7-0.5": 2, "0.4-0.3": 3, "0.2-0.1": 4, "0.0": 5 };
  const SEC_ISK = { "1.0-0.8": 1.0, "0.7-0.5": 1.5, "0.4-0.3": 2.0, "0.2-0.1": 2.5, "0.0": 3.5 };
  const SEC_REP = { "1.0-0.8": 1.0, "0.7-0.5": 1.2, "0.4-0.3": 1.5, "0.2-0.1": 1.8, "0.0": 2.5 };
  const SEC_CN = { "1.0-0.8": "高安", "0.7-0.5": "边境", "0.4-0.3": "低安", "0.2-0.1": "深空", "0.0": "0.0" };

  // 在星域内选两个落点：优先区域第 0 个（常规）与第 4 个（精锐）；
  // 若撞上起始星系（不能放据点）则按候选序列顺延，保证每域仍是 2 个。
  // 固定规则 ⇒ 同一版本内每次生成结果一致，且对旧档幂等（attach 可重复调用）。
  // 为什么从第 0 个开始：星图生成时只会探明「起点 + 起点邻居 + 各域 hub」，
  // 若据点全落在未探明节点上，新手开局连一个能打的战斗节点都看不见。
  const SLOT_IDX = [0, 3, 4, 5, 1, 2];
  const SLOTS_PER_REGION = 2;

  // 把据点挂到星图节点上（幂等：每次都按同一规则重算并覆盖，不依赖旧值）
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

      let slot = 0;
      for (const idx of SLOT_IDX) {
        if (slot >= SLOTS_PER_REGION) break;
        const n = pool[idx];
        if (!n) continue;
        if (n.id === map.startId) continue;   // 起始星系不放据点 → 顺延下一个候选
        if (n.raid) continue;                 // 同一轮已占（候选重叠时防重复）
        const elite = (slot === 1);
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
        // 海盗据点是公开目标：强制探明，否则玩家既看不见也不知道该往哪打。
        // （只改「可见」，不改可达性 —— 跃迁仍要走相邻星门、照常烧燃料。）
        if (!n.discovered) {
          n.discovered = true;
          if (Array.isArray(map.discovered) && map.discovered.indexOf(n.id) < 0) map.discovered.push(n.id);
        }
        slot++;
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
