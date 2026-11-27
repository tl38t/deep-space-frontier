// ================================================================
// 深空星疆 —— Data.Planets：行星采集装置的维护费（1 代 data/planets.js 搬运）
// ----------------------------------------------------------------
// 1 代口径（正本 D:/EVE-IDLE/EVEIDLE-WORKBUDDY-FRESH/js/data/planets.js:6-11）：
//   · 部署时付 constructionCost（isk + 三钛合金）
//   · **每 24h（86400s）付一次 maintenanceCostISK**，到期不付 → 停产（storage 保留）
//   · 维护费**只按行星类型固定**，与等级无关（1 代无等级系统）
//   · 科技 `planfin`（research.js:284，group:"planCost"，perLevel 1.8%，negative）减维护费
//
// 本作映射（2026-11-27 用户拍板 P0-A/P0-B，见「行星维护费与货柜_实施计划.md」§2）：
//   · 部署费本作统一 3000 credits + 20 fe_alloy，对应 1 代最低档 138000 isk
//     ⇒ 换算比 = 138000 / 3000 = **46**，维护费 = round(maintenanceCostISK / 46)
//   · 六档**相对倍率与 1 代完全一致**（以熔岩/气态 46000 为 1.0 基准）
//   · 时长统一 86400s（24h），与 1 代同
//   · `maintenanceCost` 是**提议值待标定**（本作经济规模与 1 代不同）
//
// ⚠️ 本表只描述「维护费与时长」，不含产出速率：
//    本作产率走 engine/sites.js 的 SITE_RATE（统一 0.45/s × 等级 × 丰度），
//    不分行星类型；1 代的 interval（10~30s）属生产曲线，本次不搬（避免顺手改经济）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Planets = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Planets = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // planetType 键与 Data.Resources 的 cat:"planet" 资源、1 代 id 三元对齐
  const DURATION = 86400;          // 24h，1 代 maintenanceDuration 全档同值

  const PLANETS = {
    lava: {
      id: "lava", name: "熔岩行星", icon: "🌋", output: "重金属", planetType: "lava",
      iskCost: 46000,              // 1 代真值
      maintenanceCost: 1000,       // round(46000 / 46)
      maintenanceDuration: DURATION,
    },
    gas: {
      id: "gas", name: "气态行星", icon: "💨", output: "稀有气体", planetType: "gas",
      iskCost: 46000,
      maintenanceCost: 1000,
      maintenanceDuration: DURATION,
    },
    ice: {
      id: "ice", name: "冰行星", icon: "🧊", output: "同位素", planetType: "ice",
      iskCost: 83000,
      maintenanceCost: 1804,       // round(83000 / 46) = 1804.35
      maintenanceDuration: DURATION,
    },
    plasma: {
      id: "plasma", name: "等离子行星", icon: "⚡", output: "等离子体", planetType: "plasma",
      iskCost: 238000,
      maintenanceCost: 5174,       // round(238000 / 46) = 5173.9
      maintenanceDuration: DURATION,
    },
    temperate: {
      id: "temperate", name: "温带行星", icon: "🌿", output: "生物质", planetType: "temperate",
      iskCost: 638000,
      maintenanceCost: 13870,      // round(638000 / 46) = 13869.6
      maintenanceDuration: DURATION,
    },
    storm: {
      id: "storm", name: "风暴行星", icon: "🧲", output: "磁场聚合物", planetType: "storm",
      iskCost: 1633000,
      maintenanceCost: 35500,      // round(1633000 / 46) = 35500
      maintenanceDuration: DURATION,
    },
  };

  // 未登记类型（旧档 / 未来新类型）→ 取最低档，绝不返回 undefined
  const FALLBACK = PLANETS.lava;

  function of(planetType) {
    return PLANETS[planetType] || FALLBACK;
  }
  function maintenanceOf(planetType) {
    return of(planetType).maintenanceCost;
  }
  function durationOf(planetType) {
    return of(planetType).maintenanceDuration;
  }
  function nameOf(planetType) {
    return of(planetType).name;
  }

  return {
    PLANETS, DURATION, FALLBACK,
    of, maintenanceOf, durationOf, nameOf,
    ALL: Object.keys(PLANETS),
  };
});
