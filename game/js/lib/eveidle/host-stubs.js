/* 宿主契约垫片（host-stubs）
 * 深空星疆复用 EVE-IDLE 的「数据 + 纯函数」层时，不引入其死亡空间/考古/势力探针等专属系统。
 * 这些系统对应的宿主全局在此给空默认值，使库文件可在本作独立加载、运行期不抛 ReferenceError。
 * 仅声明本作确实不使用的契约；深空星疆真正需要的数据由自有代码在加载本库前注入。
 * typeof 检查对未声明变量安全（strict 模式也不抛）。
 */
(function () {
  "use strict";
  if (typeof ARCHAEOLOGY_SHIP_TYPES === "undefined") globalThis.ARCHAEOLOGY_SHIP_TYPES = [];
  if (typeof DEATHSPACE_DATABASE === "undefined") globalThis.DEATHSPACE_DATABASE = [];
  if (typeof RIG_SERIES === "undefined") globalThis.RIG_SERIES = [];
  if (typeof EQUIPMENT_RECIPES === "undefined") globalThis.EQUIPMENT_RECIPES = [];
  if (typeof SMELTING_RECIPES === "undefined") globalThis.SMELTING_RECIPES = [];
  if (typeof SHIP_COMPONENT_RECIPES === "undefined") globalThis.SHIP_COMPONENT_RECIPES = [];
  if (typeof ITEM_CATEGORIES === "undefined") globalThis.ITEM_CATEGORIES = {};
  if (typeof CARGO_SIZES === "undefined") globalThis.CARGO_SIZES = [];
  if (typeof ARCHAEOLOGY_PROBES === "undefined") globalThis.ARCHAEOLOGY_PROBES = [];
  if (typeof ARCHAEOLOGY_RESTORED_PROBES === "undefined") globalThis.ARCHAEOLOGY_RESTORED_PROBES = [];
  if (typeof ARCHAEOLOGY_FACTION_PROBES === "undefined") globalThis.ARCHAEOLOGY_FACTION_PROBES = [];
  if (typeof ARCHAEOLOGY_ARTIFACTS === "undefined") globalThis.ARCHAEOLOGY_ARTIFACTS = [];
  if (typeof BOOSTER_ITEMS === "undefined") globalThis.BOOSTER_ITEMS = {};
  if (typeof getOfflinePerfCache === "undefined") globalThis.getOfflinePerfCache = function () { return null; };
  if (typeof getFittingFromInstance === "undefined") globalThis.getFittingFromInstance = function (s, i) { return (i && i.fitting) || { high: [], mid: [], low: [], rig: [] }; };
})();
