# DeepSeek 投喂包 · 深空星疆

> **用法**：本文件整体复制粘贴给 DeepSeek（一次贴不下就按分节分两条贴）。
> 这是它上一轮点名要的全部材料：命名池 / 性格库 / 对话库 / 舰船名池 / 事件库 / 文件清单 / 架构文档。
> 所有内容取自正本仓库（EVEIDLE-WORKBUDDY-FRESH = github.com/tl38t/eveidle，main 分支）与续作工作目录（深空星疆）。

---

## 第 1 部分 · 前作架构文档 ARCHITECTURE.md（全文）

```markdown
<!-- ARCHITECTURE.md BEGIN -->
# EVE IDLE 前端架构约束

本项目继续使用无构建步骤的原生 JavaScript，但业务状态、计算和展示必须保持可替换边界。目标不是立即改用 React/Vue，而是让未来框架、移动端渲染器和自动测试可以复用同一套游戏核心。

## 分层与依赖方向

```text
data（静态配置）
  ↓
state（存档形状）
  ↓
selectors（纯读取 / View State） ← systems（规则与结算）
  ↓                              ↑
ui/render（DOM展示）      actions（显式状态修改）
```

允许的依赖方向：

- `data` 不依赖其他层。
- `state` 只定义状态结构与通用实例工具。
- `selectors` 接收 `state`，读取静态配置，返回可序列化的普通对象。
- `actions` 接收 `state + action + now`，只修改传入状态并返回结果。
- `systems` 负责游戏规则、tick、离线结算与存档迁移，可复用选择器中的纯计算。
- `ui` 消费 View State、绑定事件并更新DOM；UI通过动作入口请求状态变化。

禁止反向依赖：选择器和动作层不得访问DOM、调用渲染函数或读取全局 `gameState`。

## View State规则

选择器统一放在 `js/core/selectors.js`。

```js
const display = getMiningDisplayState(state, now);
```

每个选择器必须满足：

1. 显式传入状态和时间，不隐藏读取 `gameState` 或 `Date.now()`。
2. 不修改输入状态，包括不调用会补字段、归一化装备或迁移存档的函数。
3. 不访问DOM、Canvas、localStorage或浏览器API。
4. 返回普通对象、数组、数字、字符串和布尔值。
5. 同一输入必须产生同一输出。

目前已提供：

- `getGlobalDisplayState()`
- `getSidebarDisplayState()`
- `getSkillShellDisplayState()`
- `getCurrentActivityDisplayState()`
- `getProductionEfficiencyState()`
- `getMiningDisplayState()`
- `getSmeltingDisplayState()`
- `getGasDisplayState()`
- `getActiveActionProgressDisplayState()`
- `getShipEngineeringDisplayState()`
- `getEquipmentEngineeringDisplayState()`
- `getActionConfirmationDisplayState()`
- `getCombatDisplayState()`
- `getPlanetaryDisplayState()`
- `getCargoDisplayState()`
- `getLPStoreDisplayState()`
- `getHangarDisplayState()`
- `getShipFittingDisplayState()`
- `getQueueDisplayState()`
- `getNavigationDisplayState()`

## 状态动作规则

状态动作统一放在 `js/core/actions.js`，通过一个入口调用：

```js
dispatchGameAction(state, {
  type: "production/selectMiningArea",
  areaName: "镓月岩带"
}, now);
```

动作层可以修改显式传入的状态，但不能：

- 操作DOM；
- 显示Toast或弹窗；
- 调用 `updateUI()` / `render*()`；
- 保存localStorage；
- 静默使用全局 `gameState`。

动作返回 `{ changed, reason, ... }`，兼容层或未来框架根据结果决定刷新与反馈。

## 横向核心设施

### ResourceRegistry

`js/core/resources.js` 使用 `namespace:itemKey` 作为业务层唯一资源地址，例如 `ore:凡晶石`、`component:integrated_hull`、`ammo:laser`。业务规则、选择器和UI不得自行遍历 `resources.*` 资源池。

- Registry负责资源定义、读取、增加、设置、跨命名空间材料汇总和原子扣费。
- 现阶段Registry仍映射到旧存档的多个资源池，不创建 `resources.items`，因此旧存档无需整体迁移。
- `js/core/persistence.js` 是唯一允许直接整理旧资源字段的迁移边界；新增直接资源池读取必须被视为架构回归。
- 新资源应先注册命名空间、键、名称和分类，再由配方或系统引用其资源ID。

### GameEvents

`js/core/events.js` 是同步领域事件总线。生产、制造和战斗核心只负责发布已经发生的事实，任务、成就和统计等消费者只能订阅事件，不能被核心系统直接调用。

- 所有事件使用统一不可变信封：`{ schemaVersion, eventId, type, timestamp, payload, meta, valid, registered }`。
- `meta` 固定提供 `offline`、`aggregate`、`source` 和 `runId`；在线事件和离线聚合事件使用相同事件名。
- 采矿、冶炼、采气、行星、制造、击杀、波次、肃清、爆船、升级以及内部UI通知均已登记事件契约。
- 离线多周期结算发布一个包含总周期数和总产出的聚合事件，并以离线结算批次生成稳定 `runId/eventId`。
- 已登记事件缺少必需字段或字段类型错误时不向监听器分发，并由RuntimeGuard记录契约错误。
- 新的项目内事件发布点必须先登记契约；`tools/verify.mjs` 会扫描静态事件名并阻止无契约事件进入代码库。

`js/core/statistics.js` 是首个只读事件消费者：记录生产、制造、战斗、升级和在线/离线累计，不参与任何奖励或数值结算。

- 消费者通过 `GameEvents.onIdempotent()` 订阅，每个消费者按 `consumerId:eventId` 去重。
- 当前存档保留最近512个已处理事件ID，限制存档体积；重复事件不会再次累计。
- 旧存档缺少统计字段时由 `ensureStatisticsState()` 补齐，不重放历史数据，也不反推此前累计值。
- 调试时可调用 `GameStatistics.snapshot()` 获取统计副本；不得直接把统计结果作为生产或战斗状态来源。
- 事件payload属于跨模块契约；修改字段前必须同步更新契约测试和所有消费者。

### CombatModifiers

`js/core/combat-modifiers.js` 是战斗数值修正管线。技能、舰船、装备、区域以及未来Buff/Debuff都以修正项参与最终计算，战斗系统不应为单个玩法复制一套公式。

- 支持 `add`、`multiply`、`override`、`min`、`max` 和显式优先级。
- 修正可以按武器、生命层、区域及过期时间过滤。
- 修正管线不代表动态难度；敌人固定基础强度仍由静态配置决定。

### RuntimeGuard与错误边界

`js/core/runtime.js` 隔离关键循环和可恢复渲染通道，`js/ui/error-boundary.js` 将启动与运行时错误转为玩家可见面板。

- 关键结算失败后暂停对应通道，防止存档继续发生半结算。
- 可恢复渲染错误会被记录，但不永久停止后续帧。
- 恢复关键通道必须由用户显式触发；后续恢复增强还需加入状态校验和错误报告导出。

## 原生DOM适配层

`js/ui/render.js` 是当前原生DOM适配器。它可以访问DOM，但应遵循：

- 不重新实现业务公式；
- 不直接修改游戏状态；
- 不根据原始状态拼装复杂页面逻辑，优先消费完整View State；
- 高频刷新与完整刷新必须使用同一选择器，避免两个公式版本；
- 事件处理器只调用动作入口或系统命令。

React/Vue版本未来只需用组件替换这一层，不应重写采集效率、目标锁定、进度或门槛计算。

## 当前迁移状态

| 模块 | View State | Actions | DOM适配分离 |
|---|---|---|---|
| 全局资源栏/侧栏 | 已完成 | 不适用 | 已完成 |
| 采矿/月矿 | 已完成 | 已完成 | 已完成 |
| 冶炼 | 已完成 | 已完成 | 已完成 |
| 气体采集 | 已完成 | 已完成 | 已完成 |
| 舰船/装备制造 | 已完成 | 已完成 | 已完成 |
| 执行确认弹窗 | 已完成 | 复用队列动作 | 已完成 |
| 战斗 | 已完成 | 已完成 | 已完成 |
| 行星 | 已完成 | 已完成 | 已完成 |
| 仓库/LP商店 | 已完成 | 已完成 | 已完成 |
| 船坞/舰船装配 | 已完成 | 已完成 | 已完成 |
| 动作队列/页面导航 | 已完成 | 已完成 | 已完成 |

## 后续迁移顺序

四批基础迁移已经完成。后续新增功能必须直接按本文件边界实现；对旧代码只做按需清理，不再建立新的跨层兼容逻辑。

每次迁移都必须保持存档结构不变，并通过 `node tools/verify.mjs` 与真实浏览器回归。

## 自动约束

`tools/verify.mjs` 会检查：

- `selectors.js` 不含DOM、全局 `gameState`、渲染调用；
- `actions.js` 不含DOM、全局 `gameState`、渲染调用；
- 选择器调用前后输入状态JSON完全一致；
- 运行目标与待选目标可以同时正确表达；
- 锁定动作失败时不能修改状态；
- 统一动作入口拒绝未知动作。
- 战斗核心不得重新引入HUD DOM、面板渲染或攻击特效。
- 行星核心和静态配置不得访问DOM、Canvas、弹窗或渲染函数。
- 生产、战斗、行星和队列核心不得访问DOM、Toast或页面渲染函数。
- 仓库、船坞、装配、LP商店、队列和导航View State必须保持输入状态不变。
- 执行确认弹窗不得直接读取资源池或在提交时重新计算当前下拉配方。
- 除存档迁移边界外，业务代码不得新增 `resources.*` 原始资源池读写。
- ResourceRegistry扣费必须保持原子性；GameEvents、CombatModifiers和RuntimeGuard必须保持DOM为0。
- 所有项目内静态事件发布点必须拥有已登记契约；无效事件不得送达消费者。
- 统计消费者必须幂等，同一个 `eventId` 重放时累计值只能变化一次。
- 在线、离线聚合、行星产出与旧存档统计结构必须纳入自动回归。

这些检查用于防止后续功能开发重新破坏分层边界。

## 分批迁移计划

- 第1批（已完成）：舰船工程与装备工程。
- 第2批（已完成）：战斗属性、编队/HUD View State与战斗指令。
- 第3批（已完成）：行星卡片、生产倒计时与Canvas适配。
- 第4批（已完成）：仓库、LP商店、船坞、舰船装配、队列、页面导航与遗留兼容层清理。

<!-- ARCHITECTURE.md END -->
```

---
## 第 2 部分 · 前作数据/系统层文件清单（ls 输出）
```
js/data/:
achievement-locales-de.js
achievement-locales-fr.js
achievement-locales-ja.js
achievement-locales-ru.js
achievement-locales-tw.js
achievement-locales.js
achievement-rules.js
achievements.js
alliance-building-config.js
alliance-task-catalog.js
alliance-task-model.js
ammo.js
ammunition.js
archaeology.js
base.js
boosters.js
cargo.js
changelog.js
combat.js
display-names.js
equipment.js
gameplay-help-locales.js
implants.js
leaderboard.js
legion
planets.js
platform-achievement-map.js
research.js
ships.js
titans.js
tutorial.js
wormhole.js

js/data/legion/:
npc-dialogue.js
npc-names.js
npc-personalities.js
npc-skills.js
self-built-npcs.js

js/systems/:
achievements.js
ad-buff.js
archaeology.js
boosters.js
capital-combat.js
combat-drop-craft.js
combat-log.js
combat.js
enhancement-chance.js
equipment-enhancement.js
invention.js
legion-combat-squad.js
legion-npc.js
legion-starmap-trial.js
manufacturing.js
offline-combat.js
planetary.js
production.js
recycling.js
reputation.js
research-ad.js
research-protocols.js
research.js
rigs.js
ship-enhancement.js
station.js
tutorial.js
wormhole.js
```

---
## 第 3 部分 · NPC 名字库 npc-names.js（全文 120 条）
```javascript
// ================================================================
// 军团 DLC —— NPC 名字库
// ----------------------------------------------------------------
// 科幻太空风格，含中文名 / 音译名 / 带姓氏的名字。
// 不引用 EVE 原作角色名，不使用明显重复模板。
// 名字在本文件静态定义；运行时由生成器写入 NPC 数据并持久化，
// 不会在每次刷新 UI 时重新生成。
// 兼容双环境：浏览器挂 window.LEGION_NPC_NAMES，Node 下 module.exports。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.LEGION_NPC_NAMES = mod;
  else if (root) root.LEGION_NPC_NAMES = mod;
})(typeof self !== "undefined" ? self : this, function () {
  const NAMES = [
    // —— 纯中文名（2~3 字，意境化）——
    "林澜", "苏野", "沈砚", "顾岚", "江潮", "叶舟", "黎昕", "宋漪",
    "楚河", "卫澜", "祁连", "蓝汐", "白桐", "程阙", "温叙", "孟川",
    "唐砚", "裴溯", "卓尔", "简宁", "邵霁", "岑寂", "葛原", "冉霜",
    "时砚", "云岫", "岳川", "崔嵬", "韩烁", "柳青冥",

    // —— 音译名（名·姓，太空殖民风）——
    "赫尔曼·维克", "伊莎·诺瓦", "洛安·凯斯", "维拉·晨星", "阿列克·索恩",
    "卡西安·雷", "诺亚·维尔", "塞拉·昆", "德雷克·奥恩", "莉薇·塔恩",
    "凯尔·维斯珀", "雷恩·霍克", "泽塔·诺克斯", "奥利安·斯特", "薇恩·科斯塔",
    "艾登·洛", "索菲·凛", "马库斯·赫", "妮娅·薇", "加文·斯通",
    "莉拉·凯", "西奥·凡", "尤里·卡", "塔莉亚·温", "罗兰·戟",
    "菲奥·南", "康纳·矢", "米拉·奎", "伊万·霜", "瑟琳·极",

    // —— 带姓氏 / 代号（希腊字母、天体、神祇意象）——
    "雷蒙德·银翼", "阿尔法·诺", "贝塔·岚", "伽马·枢", "卡戎·渡",
    "塔尔·星", "奥米伽·寂", "塞壬·歌", "涅普·霜", "普洛·核",
    "赫利俄斯·曦", "塞勒涅·月", "阿瑞斯·锋", "雅典娜·智", "赫尔墨斯·讯",
    "波塞冬·渊", "哈迪斯·冥", "倪克斯·夜", "厄洛斯·焰", "盖亚·壤",

    // —— 单字 / 双字代号（猛禽、天象、器物意象）——
    "寒鸦", "苍狼", "银梭", "断剑", "北辰", "流光", "玄鸟", "破晓",
    "残星", "逆鳞", "青鸾", "赤乌", "幽萤", "疾风", "沉璧", "霜钟",
    "烈阳", "暗涌", "星轨", "渊默",

    // —— 混血 / 复合式（名·意象后缀）——
    "卡门·黎", "瑞恩·极光", "薇拉·霜河", "洛特·银", "安雅·弦",
    "凯撒·北", "缇娜·岚", "奥古·枢", "薇斯·寂", "伦道夫·星",
    "希琳·夜", "狄俄·焰", "莫里·壤", "薇琪·潮", "卡尔·霜",
    "诺娃·曦", "泽诺·锋", "莉莉丝·智", "厄尔·讯", "图兰·渊"
  ];

  return NAMES;
});

```

---
## 第 4 部分 · NPC 性格库 npc-personalities.js（全文 12 种）
```javascript
// ================================================================
// 军团 DLC —— NPC 性格库
// ----------------------------------------------------------------
// 性格只影响文案表现，绝不参与任何数值计算。
// 所有加成、生产速度、经验、伤害一律来自 NPC 技能词条。
// 兼容双环境：浏览器挂 window.LEGION_NPC_PERSONALITIES，Node 下 module.exports。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.LEGION_NPC_PERSONALITIES = mod;
  else if (root) root.LEGION_NPC_PERSONALITIES = mod;
})(typeof self !== "undefined" ? self : this, function () {
  // 字段说明：
  //   personalityId : 内部稳定 id（数据 / 文案索引用）
  //   name          : 性格中文名（展示用）
  //   desc          : 简短描述
  //   tone          : 语气标签
  //   style         : 适合的句式风格（仅用于文案撰写的指导，不影响逻辑）
  const PERSONALITIES = [
    { personalityId: "calm",       name: "冷静", desc: "遇事不惊，语调平稳。", tone: "平稳/克制", style: "短句陈述，少修饰，直接给结论。" },
    { personalityId: "warm",       name: "热情", desc: "开朗外向，乐于表达。", tone: "明亮/积极", style: "感叹与感叹号，第二人称亲近。" },
    { personalityId: "taciturn",   name: "寡言", desc: "惜字如金，话极少。",   tone: "极简",     style: "单词句或极短句，省略主语。" },
    { personalityId: "arrogant",   name: "傲慢", desc: "自视甚高，语气居高。", tone: "居高/轻慢", style: "强调自身优越，略带不屑。" },
    { personalityId: "lazy",       name: "慵懒", desc: "提不起劲，慢吞吞。",   tone: "拖沓/困倦", style: "拉长语气，省略标点，抱怨式。" },
    { personalityId: "serious",    name: "认真", desc: "一丝不苟，态度端正。", tone: "郑重/严谨", style: "条列感，强调规程与记录。" },
    { personalityId: "optimistic", name: "乐观", desc: "总往好处想。",         tone: "轻快/期待", style: "展望式，正向预测。" },
    { personalityId: "pessimistic",name: "悲观", desc: "习惯往坏处想。",       tone: "低沉/担忧", style: "担忧式，预设失败或麻烦。" },
    { personalityId: "mystic",     name: "神秘", desc: "言语含混，似有深意。", tone: "幽深/朦胧", style: "隐喻，留白，不直接回答。" },
    { personalityId: "sharp",      name: "机敏", desc: "反应快，嘴利。",       tone: "机巧/俏皮", style: "反问，抖机灵，短促。" },
    { personalityId: "blunt",      name: "直率", desc: "有话直说，不绕弯。",   tone: "直接/干脆", style: "直陈，无客套。" },
    { personalityId: "scheming",   name: "腹黑", desc: "表面温和，暗藏心思。", tone: "温和带刺",   style: "甜里藏刀，反讽。" }
  ];

  return PERSONALITIES;
});

```

---
## 第 5 部分 · NPC 技能库 npc-skills.js（全文 21 种，含最新薪资统筹数值组）
```javascript
// ================================================================
// 军团 DLC —— NPC 技能定义（21 种）
// ----------------------------------------------------------------
// 技能名称、A/B/C/D 品质与数值规则严格沿用《军团DLC头脑风暴.md》
// 已确定的「NPC 词条命名与数值」表，不重新设计数值。
//
// 字段说明：
//   id        : 内部稳定 id（NPC 数据 skillId 用）
//   type      : 技能类型中文名（与需求清单一致）
//   name      : NPC 词条名（既有设计）
//   category  : 文案/匹配大类 production / combat / archaeology / management
//   shipClass : 经验/匹配用舰船大类 industrial / combat / archaeology；
//               management 为 null（不与舰船类型挂钩，按空间站建筑等级计算）
//   grades    : A/B/C/D 基础效果(base) 与每次强化(per)，单位 %
//   effect    : 仅用于展示的简短说明，不含计算公式
//
// 等级权重（沿用已确定方案）：A 5% / B 15% / C 30% / D 50%
// 兼容双环境：浏览器挂 window.LEGION_NPC_SKILLS，Node 下 module.exports。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.LEGION_NPC_SKILLS = mod;
  else if (root) root.LEGION_NPC_SKILLS = mod;
})(typeof self !== "undefined" ? self : this, function () {
  // 高数值组：D1.0/C1.3/B1.6/A2.0，每次强化 +0.15/+0.20/+0.25/+0.30
  const HIGH = {
    A: { base: 2.0, per: 0.30 },
    B: { base: 1.6, per: 0.25 },
    C: { base: 1.3, per: 0.20 },
    D: { base: 1.0, per: 0.15 }
  };
  // 低数值组：D0.5/C0.7/B0.9/A1.2，每次强化 +0.10/+0.12/+0.15/+0.20
  const LOW = {
    A: { base: 1.2, per: 0.20 },
    B: { base: 0.9, per: 0.15 },
    C: { base: 0.7, per: 0.12 },
    D: { base: 0.5, per: 0.10 }
  };
  // 薪资统筹专用高数值组：沿用同类 NPC 递减与 100% 工资减免上限。
  // A/B/C/D 在岗 Lv.70 分别约为 20.5% / 16.75% / 13.5% / 10.25%。
  const WAGE_HIGH = {
    A: { base: 10.0, per: 1.50 },
    B: { base: 8.0, per: 1.25 },
    C: { base: 6.5, per: 1.00 },
    D: { base: 5.0, per: 0.75 }
  };

  const SKILLS = [
    // ===== 采集与生产 =====
    { id: "mining",                type: "采矿",                   name: "矿脉勘探", category: "production", shipClass: "industrial", grades: HIGH, effect: "提升采矿效率" },
    { id: "planetaryIndustry",     type: "行星开发",               name: "行星统筹", category: "production", shipClass: "industrial", grades: HIGH, effect: "自动产出行星材料" },
    { id: "refining",              type: "冶炼",                   name: "熔炉调谐", category: "production", shipClass: "industrial", grades: HIGH, effect: "提升矿石精炼产出" },
    { id: "gasHarvesting",         type: "气体采集",               name: "气云析取", category: "production", shipClass: "industrial", grades: HIGH, effect: "提升气体采集效率" },
    { id: "shipEngineering",       type: "舰船工程",               name: "舰构工程", category: "production", shipClass: "industrial", grades: HIGH, effect: "提升舰船部件与整船建造" },
    { id: "equipmentEngineering",  type: "装备工程",               name: "装备装配", category: "production", shipClass: "industrial", grades: HIGH, effect: "提升装备与弹药制造" },
    { id: "boosterEngineering",    type: "增强剂制造",             name: "配方调制", category: "production", shipClass: "industrial", grades: HIGH, effect: "提升增强剂制造" },

    // ===== 战斗 =====
    { id: "laserOps",              type: "激光操作",               name: "激光火控", category: "combat", shipClass: "combat", grades: HIGH, effect: "提升激光炮伤害与应用" },
    { id: "cannonOps",             type: "炮台操作",               name: "炮台校准", category: "combat", shipClass: "combat", grades: HIGH, effect: "提升炮台伤害与应用" },
    { id: "missileOperations",     type: "导弹操作",               name: "制导算法", category: "combat", shipClass: "combat", grades: HIGH, effect: "提升导弹伤害与应用" },
    { id: "shieldOperation",       type: "护盾操作",               name: "护盾整流", category: "combat", shipClass: "combat", grades: HIGH, effect: "提升护盾容量" },
    { id: "armorReinforcement",    type: "装甲强化",               name: "装甲整备", category: "combat", shipClass: "combat", grades: HIGH, effect: "提升装甲容量" },
    { id: "hullEngineering",       type: "船体工程",               name: "船体加固", category: "combat", shipClass: "combat", grades: HIGH, effect: "提升结构容量" },
    { id: "capacitorManagement",   type: "电容管理",               name: "电容节流", category: "combat", shipClass: "combat", grades: LOW,  effect: "降低燃料消耗（战斗/考古通用）" },
    { id: "lootSearch",            type: "战斗稀有掉率",           name: "战利品搜寻", category: "combat", shipClass: "combat", grades: LOW,  effect: "提升战斗稀有掉落" },

    // ===== 考古 =====
    { id: "archaeologySpeed",      type: "考古速度",               name: "遗迹解析", category: "archaeology", shipClass: "archaeology", grades: HIGH, effect: "提升遗迹解析速度" },
    { id: "archaeologyLoot",       type: "考古稀有掉率",           name: "遗物鉴定", category: "archaeology", shipClass: "archaeology", grades: LOW,  effect: "提升考古稀有掉落" },

    // ===== 管理 =====
    { id: "autolineSpeed",         type: "自动线速度",             name: "产线调度", category: "management", shipClass: null, grades: LOW,  effect: "提升自动线速度" },
    { id: "shipComponentCostReduce", type: "舰船组件制造消耗降低", name: "舰材回收", category: "management", shipClass: null, grades: LOW,  effect: "降低舰船组件制造消耗" },
    { id: "xpGain",                type: "玩家与 NPC 经验获取",    name: "训练教范", category: "management", shipClass: null, grades: LOW,  effect: "提升玩家与 NPC 经验获取" },
    { id: "wageReduce",            type: "NPC 工资降低",           name: "薪资统筹", category: "management", shipClass: null, grades: WAGE_HIGH, effect: "降低 NPC 工资" }
  ];

  // 等级权重（已确定）：A 5 / B 15 / C 30 / D 50
  const GRADE_WEIGHTS = { A: 5, B: 15, C: 30, D: 50 };

  return { SKILLS, GRADE_WEIGHTS };
});

```

---
## 第 6 部分 · NPC 对话库 npc-dialogue.js（全文，24KB 三层结构）
> 注意：这些台词的语境是前作「单舰 DLC」（事件类型如 shipAssigned 都是"你开船、NPC 上船"），
> 续作是"军团 CEO"语境——**只学语气和三层回退结构，不照搬事件语境**。
```javascript
// ================================================================
// 军团 DLC —— NPC 文案库
// ----------------------------------------------------------------
// 三层结构（getNpcDialogue 按优先级回退）：
//   1) personality[性格][事件]  —— 性格 × 事件 专属文案（最贴切）
//   2) skillCategory[技能大类][事件] —— 技能类别文案（性格缺位时兜底）
//   3) generic[事件]            —— 通用兜底（保证任何事件都有文案）
//
// 触发事件（12 种，与需求一致）：
//   recruit / dailyGreeting / salaryPaid / salaryOverdue /
//   shipAssigned / shipReplaced / noShip / incompatibleShip /
//   levelUp / skillMilestone / maxLevel / dismiss
//
// 文案规则：
//   - 短句，舰娘式简短回应，不写长篇剧情。
//   - 每条文案不携带任何数值或奖励，纯表现层。
//   - 性格只改文案，不改数值。
//
// 兼容双环境：浏览器挂 window.LEGION_NPC_DIALOGUE，Node 下 module.exports。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.LEGION_NPC_DIALOGUE = mod;
  else if (root) root.LEGION_NPC_DIALOGUE = mod;
})(typeof self !== "undefined" ? self : this, function () {

  // —— 通用兜底：每种事件至少 4 条，保证任意性格/技能缺失时仍有文案 ——
  const generic = {
    recruit:          ["报到，已加入军团。", "新成员就位。", "入职完成，等待调度。", "我来了，听候安排。"],
    dailyGreeting:    ["今天也照常运转。", "你来了，一切正常。", "新的一天，开始吧。", "在岗，有事直说。"],
    salaryPaid:       ["薪资已到账。", "报酬收到，记录完毕。", "工资到手，继续工作。", "薪酬入账，无异议。"],
    salaryOverdue:    ["薪资未到，先停手。", "欠薪状态，效果暂停。", "账户空了，暂不发力。", "没钱发，我先待命。"],
    shipAssigned:     ["舰船已绑定。", "座驾到手，准备就绪。", "飞船配属完成。", "新船已接管。"],
    shipReplaced:     ["旧舰注销，新舰就位。", "换装完成。", "飞船更替，无异常。", "已换上新座驾。"],
    noShip:           ["暂未配舰，照常值守。", "无舰状态，基础效率运转。", "没有飞船，我仍在岗。", "空编在岗，等待配属。"],
    incompatibleShip: ["舰型不匹配，效果减半。", "配船不对口，谨慎使用。", "舰种不符，仅基础生效。", "错船一辆，将就着用。"],
    levelUp:          ["等级提升，能力增强。", "进阶完成，数据已校准。", "升级了，继续下一阶段。", "等级上调，记录入档。"],
    skillMilestone:   ["核心词条强化，数值刷新。", "里程碑达成，技能增幅。", "强化节点通过，效果提升。", "词条强化，参数已修订。"],
    maxLevel:         ["已达当前等级上限。", "等级封顶，等待解锁。", "上限已至，需科技扩展。", "封顶状态，请推进研发。"],
    dismiss:          ["明白，我这就离队。", "交接完毕，告退。", "离职手续已办清。", "我走，保重。"]
  };

  // —— 性格 × 事件：每种性格、每种事件各 3 条 ——
  const personality = {
    calm: {
      recruit: ["报到。我已就位。", "任务交接完成，可以开始。", "新岗位，我会按规程执行。"],
      dailyGreeting: ["今天也按计划推进。", "一切正常，无需担心。", "我在这里，有事直说。"],
      salaryPaid: ["薪资已收到，账目清楚。", "报酬到位，继续工作。", "工资无误，记录已存。"],
      salaryOverdue: ["薪资未到，我先停手。", "账上没钱，暂不动作。", "欠薪期间，效果暂停。"],
      shipAssigned: ["舰船已绑定，状态读取完毕。", "已接管飞船，随时可用。", "座驾确认，准备就绪。"],
      shipReplaced: ["旧舰注销，新舰已载。", "换装完成，参数已更新。", "飞船更替，无异常。"],
      noShip: ["暂未配舰，基础效率运转。", "无舰状态，照常值守。", "没有飞船，我仍在岗。"],
      incompatibleShip: ["舰型不匹配，效果减半。", "这艘船不对口，谨慎使用。", "舰种不符，仅基础生效。"],
      levelUp: ["等级提升，能力同步增强。", "进阶完成，数据已校准。", "升级了，继续下一阶段。"],
      skillMilestone: ["核心词条强化，数值已刷新。", "里程碑达成，技能增幅。", "强化节点通过，效果提升。"],
      maxLevel: ["已达当前上限，等待解锁。", "等级封顶，需科技扩展。", "上限已至，后续看研发。"],
      dismiss: ["明白，我这就离队。", "交接完毕，告退。", "离职手续，已办清。"]
    },
    warm: {
      recruit: ["终于上岗啦，请多指教！", "加入军团，好开心！", "以后我就是你的搭档咯！"],
      dailyGreeting: ["早上好呀，今天也要加油！", "你来啦，我等好久了！", "新的一天，冲冲冲！"],
      salaryPaid: ["工资到手，超满足的！", "薪水到账，干劲满满！", "谢啦，我会更努力的！"],
      salaryOverdue: ["哎呀钱没发，我先歇会儿？", "欠薪了……那我先待命。", "账户空空，暂不发力哦。"],
      shipAssigned: ["哇，是我的新船吗，爱了！", "座驾到手，出发！", "飞船好帅，谢谢指挥官！"],
      shipReplaced: ["换新船啦，旧的不用可惜～", "升级座驾，太棒了！", "船换好了，继续飙！"],
      noShip: ["还没船呀，那我先徒步干活！", "没飞船也没关系，我能扛！", "空手也上岗，没问题！"],
      incompatibleShip: ["这船不太对味，但将就啦！", "舰型不对？没事我适应！", "配错船啦，照样往前冲！"],
      levelUp: ["升级啦，我变强了耶！", "等级up，超有成就感！", "进阶成功，继续冲顶！"],
      skillMilestone: ["词条强化！感觉浑身是劲！", "里程碑！技能更猛了！", "强化达成，效果翻倍爽！"],
      maxLevel: ["到顶啦，等科技给我开新路！", "满级咯，期待解锁！", "上限到了，催研发去！"],
      dismiss: ["要告别啦，会想你的！", "离职好舍不得，保重！", "我先走啦，常联系哦！"]
    },
    taciturn: {
      recruit: ["在。", "收到。", "就位。"],
      dailyGreeting: ["嗯。", "在。", "说。"],
      salaryPaid: ["妥。", "记了。", "好。"],
      salaryOverdue: ["停。", "欠。", "等。"],
      shipAssigned: ["船。", "载。", "行。"],
      shipReplaced: ["换。", "新。", "好。"],
      noShip: ["无。", "照。", "守。"],
      incompatibleShip: ["错。", "半。", "将就。"],
      levelUp: ["升。", "强。", "续。"],
      skillMilestone: ["强。", "点。", "涨。"],
      maxLevel: ["顶。", "待。", "锁。"],
      dismiss: ["走。", "辞。", "别。"]
    },
    arrogant: {
      recruit: ["本座肯来，是你的荣幸。", "区区招募，也配得上我？", "算你识相，选了我。"],
      dailyGreeting: ["本座在此，安心去吧。", "有我在，还需你操心？", "例行露面，莫要受宠若惊。"],
      salaryPaid: ["这点薪水，本座勉强收下。", "报酬到了，理所应当。", "记账吧，本座不缺这点。"],
      salaryOverdue: ["欠薪？你也配差遣我？", "没钱的活，本座不屑干。", "账空了，便停，莫来烦。"],
      shipAssigned: ["此船尚配得上本座。", "座驾到手，理应如此。", "飞船归我，物尽其用。"],
      shipReplaced: ["旧船丢人，换新的才对。", "升级座驾，本座本就该有。", "换新，意料之中。"],
      noShip: ["无舰也能压你一头。", "没船又如何，照样强。", "空手，亦胜凡夫。"],
      incompatibleShip: ["破船也敢配本座？减半便减半。", "舰型低劣，将就罢了。", "错船一辆，难不住我。"],
      levelUp: ["变强，不过水到渠成。", "升级，本座本就该强。", "进阶，意料之内。"],
      skillMilestone: ["词条强化，理所当然。", "里程碑？本座随手过。", "增幅，配得上我。"],
      maxLevel: ["上限太低，配不上本座。", "封顶？等科技追上来吧。", "满级而已，无趣。"],
      dismiss: ["离队？是你损失。", "辞呈，准了，莫留。", "本座去也，惜哉你。"]
    },
    lazy: {
      recruit: ["唔……报到就报到吧……", "嗯哼，上岗了，困……", "行吧行吧，我来了……"],
      dailyGreeting: ["哈啊……今天也……好困……", "唔，你来啦……好懒得动……", "嗯……又是新的一天……"],
      salaryPaid: ["钱到了……那就……继续躺……", "薪水……收了……别吵我……", "嗯，记账……然后睡……"],
      salaryOverdue: ["没发钱啊……那我……歇着……", "欠薪……正好……偷个懒……", "账户空……不干也罢……"],
      shipAssigned: ["船来了……哦……慢慢接管……", "座驾……嗯……先放着……", "飞船……载好了……好困……"],
      shipReplaced: ["换船……懒得抗拒……新的吧……", "旧的不管……新的凑合……", "嗯……换就换……"],
      noShip: ["没船……正好……不用动……", "无舰……躺着也行……", "空手……省事……"],
      incompatibleShip: ["错船……将就……懒得换……", "舰型不对……唉……凑合……", "配错……算了……眯一会……"],
      levelUp: ["升级了……嗯……继续睡……", "变强……好困……无所谓……", "进阶……唔……"],
      skillMilestone: ["强化……哦……涨了一点……", "里程碑……懒得兴奋……", "词条强了……嗯……"],
      maxLevel: ["到顶……终于……能歇了……", "封顶……好……不想动了……", "上限……睡……"],
      dismiss: ["走啊……懒得留……拜拜……", "离职……正好……歇着……", "辞……嗯……再见……"]
    },
    serious: {
      recruit: ["已登记入职，职责已确认。", "报到完毕，请按规程调度。", "入职手续齐全，可以上岗。"],
      dailyGreeting: ["今日工作计划已核对。", "例行签到，状态正常。", "请确认今日任务清单。"],
      salaryPaid: ["薪资已入账，凭证留存。", "报酬核对无误，记录归档。", "工资发放完成，账目清楚。"],
      salaryOverdue: ["薪资未达，按规停效。", "欠薪状态，暂停履职。", "账务异常，等待补齐。"],
      shipAssigned: ["舰船绑定完成，检验通过。", "座驾已登记，性能已测。", "飞船配属就绪，可调用。"],
      shipReplaced: ["旧舰注销手续已办。", "换装流程合规，新舰就位。", "飞船更替记录已存档。"],
      noShip: ["未配舰，按基础规程值守。", "无舰状态，依标准效率。", "空编在岗，等待配属。"],
      incompatibleShip: ["舰型不符，已标注降级。", "配船错误，效果按规减半。", "舰种不匹配，请复核。"],
      levelUp: ["等级晋升，档案已更新。", "进阶核验通过，能力上调。", "升级完成，记录入档。"],
      skillMilestone: ["强化节点已达，参数修订。", "词条增幅确认，数据备案。", "里程碑通过，效果已定。"],
      maxLevel: ["已达等级上限，待科技审批。", "封顶状态，等待扩容。", "上限锁定，请推进研发。"],
      dismiss: ["离职流程合规，已交接。", "辞呈归档，物资清退。", "离队手续完毕，请签收。"]
    },
    optimistic: {
      recruit: ["太好了，新伙伴就位！", "加入啦，未来可期！", "上岗第一天，充满希望！"],
      dailyGreeting: ["早上好，今天肯定顺利！", "新的一天，好事情要来！", "你来啦，好运在路上！"],
      salaryPaid: ["工资到啦，开心花起来！", "薪水入账，日子更美！", "报酬到手，继续向好！"],
      salaryOverdue: ["钱没发？没事，很快补上！", "欠薪别慌，会好转的！", "账空了，挺一挺就过！"],
      shipAssigned: ["新船到，前途更亮！", "座驾在手，所向披靡！", "飞船配好，冲劲十足！"],
      shipReplaced: ["换新车，更带劲啦！", "升级座驾，好事连连！", "新船到，运势up！"],
      noShip: ["没船？没关系，迟早会有！", "空手也开工，机会在后！", "无舰照样乐观向前！"],
      incompatibleShip: ["错船？小问题，能克服！", "舰型不对，调整就好！", "配错也别灰心，会顺的！"],
      levelUp: ["升级啦，越来越强！", "进阶成功，好戏在后！", "变强了，未来闪光！"],
      skillMilestone: ["强化达成，更上一层！", "里程碑，喜上加喜！", "词条涨了，势头正旺！"],
      maxLevel: ["到顶啦，解锁就在前方！", "满级，新上限等着呢！", "封顶莫急，研发会开！"],
      dismiss: ["告别啦，后会有期！", "离职也开心，祝你顺！", "我先走，前方更好！"]
    },
    pessimistic: {
      recruit: ["上岗……但愿别出岔子。", "加入吧，反正总有麻烦。", "报到，别指望太顺利。"],
      dailyGreeting: ["早……今天怕又不顺。", "你来了，准没好事。", "新一天，忧从中来。"],
      salaryPaid: ["钱到了，别又被扣。", "薪水……且花且珍惜。", "报酬入账，省着点吧。"],
      salaryOverdue: ["果然欠薪，意料之中。", "没钱了，早知道会这样。", "账空，迟早的事。"],
      shipAssigned: ["船来了，别半路坏。", "座驾……但愿撑得住。", "飞船到，小心保养。"],
      shipReplaced: ["换船，旧的也未必好。", "新舰……别又出故障。", "更替，麻烦才刚开始。"],
      noShip: ["没船，效率怕是上不去。", "无舰，只能勉强撑。", "空手，前景不妙。"],
      incompatibleShip: ["错船，效果准要打折。", "舰型不对，果然不妙。", "配错，更没指望了。"],
      levelUp: ["升级了，别高兴太早。", "进阶，后面更难。", "变强，考验在后头。"],
      skillMilestone: ["强化，别转眼又削。", "里程碑，别白高兴。", "词条涨，未必稳。"],
      maxLevel: ["到顶，也未必是好事。", "封顶，卡住更难受。", "上限，解不解开两说。"],
      dismiss: ["离队，也好，早走少烦。", "辞职，谁知道对不对。", "走吧，反正留不住。"]
    },
    mystic: {
      recruit: ["命运牵引，我来了。", "缘起于此，听候差遣。", "星海低语，唤我至此。"],
      dailyGreeting: ["潮起潮落，你我又见。", "雾散之处，便是今日。", "时之缝隙，你我相逢。"],
      salaryPaid: ["代价已偿，流转如常。", "银流归位，莫问来处。", "所予所得，皆有其数。"],
      salaryOverdue: ["泉眼枯了，静待再涌。", "欠者自欠，时未至也。", "断流之时，蛰伏而已。"],
      shipAssigned: ["铁翼附身，命线相连。", "舟已成契，驶向未知。", "星舟认主，影随形动。"],
      shipReplaced: ["旧影散，新影生。", "换舟如换命，皆浮光。", "舟易而道不移。"],
      noShip: ["无舟亦可行于虚。", "虚空为舟，何须铁翼。", "未载亦在途。"],
      incompatibleShip: ["错舟逆行，亦是一劫。", "舰悖其主，半力而行。", "逆流的舟，且渡且看。"],
      levelUp: ["阶升一级，靠近命核。", "层叠而上，雾渐薄。", "级涨，窥见更深。"],
      skillMilestone: ["节点亮，符文再刻。", "碑文添一笔，力量潜移。", "强化如潮，暗涌成形。"],
      maxLevel: ["顶处风急，门后未知。", "极处非终，密钥未现。", "满级如满月初盈。"],
      dismiss: ["缘尽于此，归于星尘。", "别矣，轨迹交错一瞬。", "我退入雾，汝自行路。"]
    },
    sharp: {
      recruit: ["挑中我？眼光不错嘛。", "上岗咯，准备好被惊艳？", "报到，准备好接招没？"],
      dailyGreeting: ["哟，今儿想听点啥？", "来啦，今天打算考我？", "早，要不要先来段脱口秀？"],
      salaryPaid: ["钱到账，这波不亏吧？", "薪水到，老板挺讲信用嘛。", "报酬收了，继续逗你玩。"],
      salaryOverdue: ["没发钱？这可不厚道哦。", "欠薪？那我可就摸鱼了。", "账空啦，咱各退一步？"],
      shipAssigned: ["新船？让我看看成色。", "座驾到，性能测评走起。", "飞船配了，咱飙一圈？"],
      shipReplaced: ["换车？旧的我可没舍不得。", "新舰到，旧的爱谁谁。", "更替完毕，更香了。"],
      noShip: ["没船？那我靠脑子飞。", "空手也能carry，信不？", "无舰，照样灵光。"],
      incompatibleShip: ["错船？将就一下显我本事。", "舰型不对？难不倒机灵鬼。", "配错也行，反正是我开。"],
      levelUp: ["升级，意料之中啦。", "变强，基操勿六。", "进阶，早猜到了。"],
      skillMilestone: ["强化达成，帅不帅？", "里程碑，轻松拿捏。", "词条涨，小意思。"],
      maxLevel: ["到顶，下一步你打算咋扩？", "满级，该你上科技了。", "封顶，看你的了老板。"],
      dismiss: ["走咯，记得想我哈。", "离职，江湖再见。", "拜拜，别太想我。"]
    },
    blunt: {
      recruit: ["到岗，直接干活。", "招我了，说任务。", "入职，别废话。"],
      dailyGreeting: ["早，有事说事。", "来了，安排。", "签到，接着干。"],
      salaryPaid: ["钱到了，记上。", "薪水收了，继续。", "报酬入账，没事。"],
      salaryOverdue: ["没钱就停，简单。", "欠薪，我不干。", "账空，歇着。"],
      shipAssigned: ["船给我，开。", "座驾到，走。", "飞船配了，用。"],
      shipReplaced: ["旧的扔，新的上。", "换船，利索。", "更替，完了。"],
      noShip: ["没船，照干。", "空手，不误事。", "无舰，照样。"],
      incompatibleShip: ["错船，效果减半，认了。", "舰型不对，凑合。", "配错，将就用。"],
      levelUp: ["升级，更强。", "变强，继续。", "进阶，完了。"],
      skillMilestone: ["强化，数值涨。", "里程碑，过。", "词条强了，好。"],
      maxLevel: ["到顶，等解锁。", "封顶，催研发。", "上限，等着。"],
      dismiss: ["走人，交接清。", "离职，拜。", "辞，利落。"]
    },
    scheming: {
      recruit: ["能为您效劳，真是我的荣幸呢~", "入职啦，我会好好‘帮忙’的。", "选中我，您可真有眼光~"],
      dailyGreeting: ["早安，今天也请多‘关照’我哦。", "来啦，我可一直‘等’着您呢。", "新的一天，咱们慢慢来~"],
      salaryPaid: ["薪水到手啦，真体贴呢。", "报酬收下，下次可别少哦。", "钱到账，记您一笔~"],
      salaryOverdue: ["没发钱呀，那我也‘休息’咯。", "欠薪呢，这账我可记着。", "账户空空，咱慢慢算~"],
      shipAssigned: ["新船真漂亮，归我啦？谢谢~", "座驾到，我会‘爱惜’用的。", "飞船配好，放心交给我。"],
      shipReplaced: ["旧船呀，扔了怪可惜的呢。", "换新咯，旧的我‘处理’掉。", "更替，旧的爱谁谁~"],
      noShip: ["没船呀，那我‘闲’着也挺好。", "空手，正好看您忙~", "无舰，我自在。"],
      incompatibleShip: ["错船呢，效果减半，怪心疼的。", "舰型不对？那可‘委屈’我了。", "配错啦，您得补补偿~"],
      levelUp: ["升级啦，是不是更离不开我了？", "变强咯，以后多‘依赖’我哦。", "进阶，您赚到了呢~"],
      skillMilestone: ["强化达成，我这价值又涨了吧？", "里程碑，您可别‘亏待’我。", "词条涨了，记我功~"],
      maxLevel: ["到顶啦，您可要快点‘解锁’我哦。", "封顶，别让我等太久呢。", "上限，看您表现咯~"],
      dismiss: ["要走啦？您可别后悔哦。", "离职，记得想我~", "拜拜，回头‘算账’~"]
    }
  };

  // —— 技能类别文案：性格缺位时兜底（覆盖与技能最相关的事件）——
  // 仅列有类别语义的事件；其余事件回退到 generic。
  const skillCategory = {
    production: {
      recruit: ["产线多了一双手。", "工业岗，交给我。", "采矿冶炼，我熟。"],
      dailyGreeting: ["炉火正旺，今日多产。", "产线运转，安心。", "今日产出，包在我身。"],
      shipAssigned: ["工业舰到手，效率拉满。", "配了工业舰，正合我意。", "座驾是工业舰，刚好。"],
      shipReplaced: ["旧工业舰退役，新的更强。", "换上工业舰，产能up。", "飞船更替，产线不误。"],
      noShip: ["没工业舰？基础产出照跑。", "无舰也能看产线。", "空手守着炉子。"],
      incompatibleShip: ["这船不是工业舰，减产咯。", "配错舰型，产出打折。", "舰不对口，将就产。"],
      levelUp: ["等级涨，产出更稳。", "进阶，产能微升。", "升级，多看几炉。"],
      skillMilestone: ["核心工业词条强化。", "产线增幅，数值刷新。", "强化节点，效率提升。"]
    },
    combat: {
      recruit: ["战斗岗，随时出战。", "火力就位，听令。", "要打的，喊我。"],
      dailyGreeting: ["今日也磨刀霍霍。", "战位就绪，无惧。", "前线交给我。"],
      shipAssigned: ["战斗舰到，开火。", "配了战斗舰，正合。", "座驾是战舰，爽。"],
      shipReplaced: ["换战斗舰，火力更猛。", "旧舰退役，新舰压上。", "飞船更替，战力不减。"],
      noShip: ["没战斗舰？照样能打。", "无舰也守战位。", "空手，不怯场。"],
      incompatibleShip: ["这船不对战，火力打折。", "配错舰型，战力减半。", "舰不对口，勉强战。"],
      levelUp: ["等级涨，炮更准。", "进阶，杀伤微升。", "升级，战力更稳。"],
      skillMilestone: ["核心战斗词条强化。", "火力增幅，数值刷新。", "强化节点，伤害提升。"]
    },
    archaeology: {
      recruit: ["遗迹交给我解析。", "考古岗，就位。", "我来挖，你来看。"],
      dailyGreeting: ["今日信号清晰，可探。", "遗迹在唤，准备。", "考古进度，稳。"],
      shipAssigned: ["考古舰到，深入遗址。", "配了考古舰，正好。", "座驾是考古舰，顺手。"],
      shipReplaced: ["换考古舰，探得更深。", "旧舰退役，新舰上阵。", "飞船更替，勘探不误。"],
      noShip: ["没考古舰？基础探查照做。", "无舰也守信号。", "空手，盯紧遗迹。"],
      incompatibleShip: ["这船非考古舰，效率低。", "配错舰型，解析打折。", "舰不对口，慢慢探。"],
      levelUp: ["等级涨，解析更利。", "进阶，勘探微升。", "升级，眼更尖。"],
      skillMilestone: ["核心考古词条强化。", "解析增幅，数值刷新。", "强化节点，收获提升。"]
    },
    management: {
      recruit: ["后方调度，交给我。", "管理岗，就位。", "军团杂务，我理。"],
      dailyGreeting: ["今日事务，已排妥。", "管理无小事，稳。", "军团运转，安心。"],
      shipAssigned: ["舰船已入账，调度有序。", "配舰完成，登记在册。", "座驾到，归档。"],
      shipReplaced: ["旧舰注销，新舰编入。", "换装完成，账目更新。", "飞船更替，记录无误。"],
      noShip: ["管理岗不靠船，照常。", "无舰也管得动。", "空手，理全局。"],
      incompatibleShip: ["管理岗无所谓舰型。", "配船不对口？不影响我。", "舰型不符，管理照旧。"],
      levelUp: ["等级涨，调度更顺。", "进阶，效率微升。", "升级，管得更宽。"],
      skillMilestone: ["核心管理词条强化。", "调度增幅，数值刷新。", "强化节点，统筹提升。"]
    }
  };

  return { generic, personality, skillCategory };
});

```

---
## 第 7 部分 · 玩家自建 NPC 示例（self-built-npcs.js 节选）
> ⚠️ 这是玩家共创机制：玩家按模板自建 NPC（台词在 customDialogue 字段）。
> 样例里的 EVE 黑话（新八/打捞/海凤凰等）**是玩家原话，本作严禁模仿**——只看"玩家共创"这个机制本身。
```javascript
// ================================================================
// 军团 DLC —— 自建 NPC 数据（AUTO-GENERATED，勿手改）
// 由 tools/import-legion-npcs.py 从「军团NPC自建填写模板」生成。
// 这些 NPC 的台词只存在于 customDialogue 字段，绝不写入内置随机角色台词库。
// 兼容双环境：浏览器挂 window.LEGION_NPC_SELF_BUILT，Node 下 module.exports。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.LEGION_NPC_SELF_BUILT = mod;
  else if (root) root.LEGION_NPC_SELF_BUILT = mod;
})(typeof self !== "undefined" ? self : this, function () {
  const SELF_BUILT_NPCS = [
    {
      npcId: 'self_穆萨韦德',
      name: '穆萨韦德',
      personalityId: 'sharp',
      skillId: 'lootSearch',
      skillGrade: 'A',
      secondarySkillId: 'archaeologySpeed',
      secondarySkillGrade: 'B',
      customDialogue: {
          'recruit': ['你好，新八指定打捞', '接打捞', '我只在新八活动'],
          'dailyGreeting': ['黄金时间上线', '有猫娘没', '大狸子我好想你'],
          'salaryPaid': ['今日入账还算可以', '好耶，消费去了', '我的海凤凰在招手'],
          'salaryOverdue': ['不是哥们，你不给尾款我不给箱子的', '那我吞货了', '尾款结一下'],
          'shipAssigned': ['我说打捞是唯一出路', '有黑夜没', '可以兄弟可以的'],
          'shipReplaced': ['旧的放转转', '这船好大', '这船真白'],
          'noShip': ['你是想让我开日不完打捞吗？', '信不信我把星城给你开过来', '我要叫强暴队了'],
          'incompatibleShip': ['不是哥们，我开不了这船', '你给出脑浆钱吗？', '我技能不够开这船'],
          'levelUp': ['为什么打捞没有官员装？', '为什么没有打捞泰坦？', '我打算直接战地打捞，有说法没'],
          'skillMilestone': ['我强的可怕', '知道什么叫专业打捞吗？', '我打捞技能专精哥们'],
          'maxLevel': ['知道什么叫新八专业打捞吗？', '我要去日风暴炼乳', '小草你人呢？我要去会战打捞！'],
          'dismiss': ['不是哥们？', '你再也找不到像我这样的专业打捞人了', '我的梦想其实是海凤凰和奇美拉小航']
        }
    },
    {
      npcId: 'self_潮歌',
      name: '潮歌',
      personalityId: 'serious',
      skillId: 'archaeologySpeed',
      skillGrade: 'A',
      secondarySkillId: 'shipComponentCostReduce',
      secondarySkillGrade: 'B',
      customDialogue: {
          'recruit': ['遗迹解析，就交给我。', '考古岗报到，信号已锁定。', '新成员就位，准备开掘。'],
          'dailyGreeting': ['今日遗迹波动清晰，可探。', '你来了，遗址在唤。', '新的一天，进度稳。'],
          'salaryPaid': ['薪酬入账，继续发掘。', '报酬到手，记下了。', '工资收到，干劲足。'],
          'salaryOverdue': ['没钱发？我先歇着。', '欠薪状态，停手等补。', '账空了，暂不发力。'],
          'shipAssigned': ['考古舰到手，深入遗址。', '座驾是考古舰，正好。', '飞船配属，勘探就绪。'],

```

---
## 第 8 部分 · 舰船命名池

**前作全部舰名（44 个，命名风格参考，续作不得撞名）：**

星矛级、铁卫级、闪刃级、拓岩级、捕云级、疾风级、血刺级、暗影级、雷霆级、猩红级、幽冥级、破晓级、赤垒级、幽构级、星冕级、恒城级、裁决级、觅迹级、启程级、雷光级、矛隼级、疾锋级、凿岩级、采集者级、曙光级、战隼级、烈锋级、岩脊级、云舶级、驮星级、曜光级、堡隼级、震锋级、巨像级、云海级、云津级、天穹级、重垒级、裂界级、山海级、追迹级、星图级、远镜级、启明级

**续作（深空星疆）已占用舰名（11 个，写在 game/js/data/ships.js）：**

拓岩级、驮星级、星矛级、凿岩级、觅迹级、雷光级、岩脊级、云舶级、战隼级、曜光级、巨像级

---
## 第 9 部分 · 续作（深空星疆）当前事件库 + 数据定义（全文，即开即用的骨架）
```javascript
// ===== game/js/data/economy.js =====
// ================================================================
// 深空星疆 —— 经济资源定义
// 继承 EVE-IDLE 的资源语义，统一星币（IP 护栏：不用 ISK）。
// UMD 双环境：浏览器挂 window.NSK.DATA.economy，Node 下 module.exports。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.DATA = window.NSK.DATA || {};
    window.NSK.DATA.economy = mod;
  } else if (root) { root.NSK = root.NSK || {}; root.NSK.DATA = root.NSK.DATA || {}; root.NSK.DATA.economy = mod; }
})(typeof self !== "undefined" ? self : this, function () {
  const RESOURCES = {
    credits:  { name: "星币",   icon: "💰", desc: "军团流动资金，造船/雇佣/维护的硬通货" },
    minerals: { name: "矿物",   icon: "⛏️", desc: "造船与建筑的基础原料" },
    fuel:     { name: "燃料",   icon: "⛽", desc: "舰队出击与派遣的消耗品" },
    rep:      { name: "宇宙声望", icon: "🌟", desc: "跨星系的名望，解锁更高阶内容" },
  };

  // 初始资源（待标定）
  const START = { credits: 20000, minerals: 500, fuel: 100, rep: 0 };

  // 维护费：每艘在册舰船每小时消耗（待标定）
  const UPKEEP_PER_SHIP_PER_HOUR = { credits: 40 };

  return { RESOURCES, START, UPKEEP_PER_SHIP_PER_HOUR };
});

// ===== game/js/data/ships.js =====
// ================================================================
// 深空星疆 —— 舰船定义（军团资产）
// 舰种分类沿用 EVE-IDLE ships.js 的 taxonomy（frigate→battleship +
// mining/transport/combat/survey 变体），成本改用星币/矿物，去掉组件微观合成
//（骨架阶段：一档建造一步到位，组件化留 Phase 2）。
// eff = 派遣任务时该船提供的效率倍率。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {}; window.NSK.DATA = window.NSK.DATA || {}; window.NSK.DATA.ships = mod;
  } else if (root) { root.NSK = root.NSK || {}; root.NSK.DATA = root.NSK.DATA || {}; root.NSK.DATA.ships = mod; }
})(typeof self !== "undefined" ? self : this, function () {
  const SHIP_CLASSES = [
    // ---- 护卫级（t1）----
    { id: "frigate_mine",    name: "拓岩级", cls: "mining",    tier: "frigate",   cost: { credits: 3000,  minerals: 60 },  time: 180,   eff: 1.0 },
    { id: "frigate_haul",    name: "驮星级", cls: "transport", tier: "frigate",   cost: { credits: 3500,  minerals: 70 },  time: 210,   eff: 1.0 },
    { id: "frigate_combat",  name: "星矛级", cls: "combat",    tier: "frigate",   cost: { credits: 4000,  minerals: 80 },  time: 240,   eff: 1.0 },
    // ---- 驱逐级（t2）----
    { id: "destroyer_mine",  name: "凿岩级", cls: "mining",    tier: "destroyer", cost: { credits: 9000,  minerals: 180 }, time: 480,   eff: 1.8 },
    { id: "destroyer_survey",name: "觅迹级", cls: "survey",    tier: "destroyer", cost: { credits: 10000, minerals: 200 }, time: 540,   eff: 1.8 },
    { id: "destroyer_combat",name: "雷光级", cls: "combat",    tier: "destroyer", cost: { credits: 11000, minerals: 220 }, time: 600,   eff: 1.8 },
    // ---- 巡洋级（t3）----
    { id: "cruiser_mine",    name: "岩脊级", cls: "mining",    tier: "cruiser",   cost: { credits: 26000, minerals: 520 }, time: 1200,  eff: 3.2 },
    { id: "cruiser_haul",    name: "云舶级", cls: "transport", tier: "cruiser",   cost: { credits: 28000, minerals: 560 }, time: 1320,  eff: 3.2 },
    { id: "cruiser_combat",  name: "战隼级", cls: "combat",    tier: "cruiser",   cost: { credits: 32000, minerals: 640 }, time: 1500,  eff: 3.2 },
    // ---- 战列级（t4）----
    { id: "battleship_combat", name: "曜光级", cls: "combat",  tier: "battleship",cost: { credits: 90000, minerals: 2200 }, time: 2700, eff: 6.0 },
    { id: "battleship_mine",   name: "巨像级", cls: "mining",  tier: "battleship",cost: { credits: 85000, minerals: 2100 }, time: 2700, eff: 6.0 },
  ];

  const TIER_NAMES = { frigate: "护卫", destroyer: "驱逐", cruiser: "巡洋", battleship: "战列" };
  const CLS_NAMES = { mining: "采矿", transport: "运输", combat: "战斗", survey: "勘探" };

  // 解锁门槛：战列需要声望（待标定）
  const UNLOCKS = { battleship: { rep: 100 } };

  function byId(id) { return SHIP_CLASSES.find(s => s.id === id) || null; }

  return { SHIP_CLASSES, TIER_NAMES, CLS_NAMES, UNLOCKS, byId };
});

// ===== game/js/data/jobs.js =====
// ================================================================
// 深空星疆 —— 派遣任务定义（NPC 工作）
// 军团核心循环：NPC(+舰船) → 派往任务 → 时长结算 → 产出资源/经验。
// skillCat 对应 npc-skills.js 的 category（production/combat/archaeology/
// management），NPC 相关技能提供加成。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {}; window.NSK.DATA = window.NSK.DATA || {}; window.NSK.DATA.jobs = mod;
  } else if (root) { root.NSK = root.NSK || {}; root.NSK.DATA = root.NSK.DATA || {}; root.NSK.DATA.jobs = mod; }
})(typeof self !== "undefined" ? self : this, function () {
  const JOBS = [
    {
      id: "mining_run", name: "采矿作业", needShip: "mining", duration: 1800,
      skillCat: "production",
      out: { minerals: 220 },
      fuel: 10,
      desc: "派舰船去矿带作业，产出矿物。效率吃生产类技能。"
    },
    {
      id: "transport_run", name: "商队护航运输", needShip: "transport", duration: 2400,
      skillCat: "production",
      out: { credits: 2600 },
      fuel: 12,
      desc: "护送商队赚取星币。效率吃生产类技能。"
    },
    {
      id: "patrol", name: "区域巡逻", needShip: "combat", duration: 3600,
      skillCat: "combat",
      out: { credits: 1400 },
      fuel: 15,
      desc: "清除小股海盗、护航收钱。效率吃战斗类技能。"
    },
    {
      id: "survey", name: "深空勘探", needShip: "survey", duration: 5400,
      skillCat: "archaeology",
      out: { minerals: 320, rep: 2 },
      fuel: 20,
      desc: "勘测异常信号，产出矿物并有概率带回复原蓝图碎片。效率吃考古类技能。"
    },
    {
      id: "training", name: "内部演训", needShip: null, duration: 3600,
      skillCat: null, out: { xp: 30 }, fuel: 0,
      desc: "不出港，给 NPC 攒经验（提升技能等级）。"
    },
    {
      id: "office", name: "内勤值班", needShip: null, duration: 7200,
      skillCat: "management", out: { credits: 900 }, fuel: 0,
      desc: "坐办公室处理军团事务。效率吃管理类技能。"
    },
  ];

  // 蓝图碎片掉落（勘探任务专用，待标定）
  const SURVEY_BLUEPRINT_CHANCE = 0.25;

  function byId(id) { return JOBS.find(j => j.id === id) || null; }

  return { JOBS, SURVEY_BLUEPRINT_CHANCE, byId };
});

// ===== game/js/narrative/events.js（当前事件库） =====
// ================================================================
// 深空星疆 —— 叙事层：事件库（Layer A 规则定义）+ 语气渲染（Layer B）
// 零 API：静态事件库 + 模板拼接。性格 voice 复用 EVE-IDLE
// npc-personalities（12 种，只改文案、绝不进数值）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {}; window.NSK.Narrative = mod;
  } else if (root) { root.NSK = root.NSK || {}; root.NSK.Narrative = mod; }
})(typeof self !== "undefined" ? self : this, function () {
  const W = (typeof window !== "undefined") ? window : null;

  // ================================================================
  // Layer A —— 规则事件定义
  // 每条：id / weight / cond(state) / apply(state, rng) -> facts 行
  // rollEvents 每次结算按权重掷至多 2 条（待标定），可扩展 memoryTags。
  // ================================================================
  const EVENTS = [
    {
      id: "market_boom",
      weight: 3,
      cond: s => s.npcs.length > 0,
      apply: (s, rng) => {
        const gain = 800 + Math.floor(rng() * 1500);
        W.NSK.Engine.addRes(s, { credits: gain });
        return { tag: "market_boom", text: "星域商路行情上涨，军团账户入账 " + gain + " 星币。", delta: { credits: gain } };
      },
    },
    {
      id: "fuel_leak",
      weight: 2,
      cond: s => s.ships.length >= 2 && s.res.fuel > 15,
      apply: (s, rng) => {
        const loss = 5 + Math.floor(rng() * 8);
        W.NSK.Engine.addRes(s, { fuel: -loss });
        return { tag: "fuel_leak", text: "维护班组报告燃料管线渗漏，损耗 " + loss + " 燃料。", delta: { fuel: -loss } };
      },
    },
    {
      id: "rookie_application",
      weight: 2,
      cond: s => s.npcs.length < (W.NSK.Engine.NPC_MAX || 12) && s.res.credits > 4000,
      apply: (s, rng) => {
        return { tag: "rookie_application", text: "一名候选人向军团投递了简历，可在成员页面试用招募。", delta: {} };
      },
    },
    {
      id: "pirate_probe",
      weight: 2,
      cond: s => s.ships.some(sh => sh.status === "mission"),
      apply: (s, rng) => {
        const hit = rng() < 0.5;
        if (hit) {
          const loss = Math.min(s.res.credits, 300 + Math.floor(rng() * 500));
          W.NSK.Engine.addRes(s, { credits: -loss });
          return { tag: "pirate_probe", text: "海盗袭扰后勤线，被巡逻舰队驱散，损失 " + Math.round(loss) + " 星币。", delta: { credits: -loss } };
        }
        return { tag: "pirate_probe", text: "侦测到海盗探子出没，已被舰队吓退，无损失。", delta: {} };
      },
    },
  ];

  /** 按权重掷事件（每次结算至多 maxEvents 条，去重） */
  function rollEvents(state, nowTs, rng) {
    const maxEvents = 2;   // 待标定：事件密度上限，防反噬阅读速度
    const pool = EVENTS.filter(e => e.cond(state));
    const fired = [];
    for (let i = 0; i < maxEvents && pool.length; i++) {
      const total = pool.reduce((a, e) => a + e.weight, 0);
      let r = rng() * total;
      let picked = null;
      for (const e of pool) { r -= e.weight; if (r <= 0) { picked = e; break; } }
      if (!picked) picked = pool[pool.length - 1];
      const fact = picked.apply(state, rng);
      if (fact) fired.push(fact);
      pool.splice(pool.indexOf(picked), 1);
    }
    return fired;
  }

  // ================================================================
  // Layer B —— 语气渲染：事实 → 可读句子
  // personality.voicePrefix 来自 EVE-IDLE npc-personalities 的 style 字段。
  // ================================================================
  function personalities() { return (W && W.LEGION_NPC_PERSONALITIES) || []; }
  function persById(id) { return personalities().find(p => p.personalityId === id) || null; }

  function resName(k) {
    const R = W.NSK.DATA.economy.RESOURCES;
    return R[k] ? R[k].name : k;
  }

  function missionLine(m) {
    const parts = Object.keys(m.out).map(k => "+" + m.out[k] + " " + resName(k));
    let s = m.npcName + " 带队完成了「" + m.jobName + "」" + (m.shipName ? "（乘 " + m.shipName + "）" : "") + "：" + parts.join("，") + "。";
    const p = persById(m.personalityId);
    if (p && p.style && m.skillMult && m.skillMult > 1.15) {
      s = "[" + p.tone + "] " + s + "（" + p.style.slice(0, 12) + "…干得漂亮，专长发挥了作用 ×" + m.skillMult.toFixed(2) + "）";
    }
    return s;
  }

  function compose(facts) {
    const L = [];
    for (const b of facts.builds) L.push("「" + b.shipName + "」在舰坞下水，已编入军团舰队。");
    for (const m of facts.missions) L.push(missionLine(m));
    for (const e of facts.events) L.push(e.text);
    if (facts.upkeep) L.push("舰队日常维护支出 " + facts.upkeep.credits + " 星币（" + facts.upkeep.ships + " 艘在册）。");
    if (!L.length) L.push("这段时日军团风平浪静，没有值得记录的事。");
    return L;
  }

  return { EVENTS, rollEvents, compose, missionLine };
});

```

---
**收尾说明**：续作的完整设计文档（EVE军团经营模拟器策划文档.md、深空星疆·开发计划案.md、背景故事·DeepSeek交接文档.md）如需全文，用文件上传功能传附件即可——交接文档应已在本对话中。

wc:
