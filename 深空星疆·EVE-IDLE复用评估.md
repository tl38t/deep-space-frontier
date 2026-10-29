# 深空星疆 · EVE-IDLE 代码复用评估清单

> 目的：回答「不要当前资源栏 UI，直接复用 EVE-IDLE 的材料 / 装备，能不能直接复用它的仓库代码」
> 被评估工程：`D:\EVE-IDLE\EVEIDLE-WORKBUDDY-FRESH`（199 个 js，v0.7.1，无构建原生 JS）
> 评估方式：只读代码审查，逐模块给「复用等级 + 依赖 + 改造点」，行号可核对
> 日期：2026-10-15

---

## 0. 一句话结论

- **「整体直接复用整个仓库代码」：不可行。** 核心骨架（state / selectors / actions / tick / offline / persistence）与本作 UI、平台、data 深度纠缠，且**违反了它自己在 `ARCHITECTURE.md` 里定的 DOM-free 契约**——搬过去等于重写。
- **但你点名的「材料 / 装备」：可行且划算。** 它们本质是「声明式数据 + 纯数学」，DOM-free、无 i18n、无三方依赖，抽出来做共享库是**低风险高回报**。
- **现实路径**：新建独立仓库 → 把 EVE-IDLE 的「数据 + 纯数学」层抽成可复用模块（多数仅需补 1 行导出），**战斗 / 结算层自写**。不要试图整仓 fork。
- 顺带：深空星疆目前**根本没有装备系统**（只有 `ships.js` 舰体等级 + `recipes.js` 配方），复用 EVE-IDLE 装备正好补这个缺口。

---

## 1. 判定分级

| 标记 | 含义 |
|---|---|
| 🟢 直接复用 | 拷贝即用，零改动或仅补 1 行导出 |
| 🟡 裁剪后复用 | 去掉「内容注册尾巴」/ stub 可选依赖后可当 lib 用 |
| 🔴 只能重写 | 耦合过深，搬运成本 ≥ 重写成本 |

---

## 2. 总表

| 子系统 | EVE-IDLE 文件 | 判定 | 关键点 |
|---|---|---|---|
| 资源寻址引擎 | `js/core/resources.js` (21KB) | 🟡 | 引擎干净，砍掉底部 `:302-401` 内容注册块即可独立 |
| 显示名重映射 | `js/data/display-names.js` (10KB) | 🟢 | 完全自包含，纯只读 |
| 货柜 / 材料掉落 | `js/data/cargo.js` (37KB) | 🟡 | 数据表 + 抽奖纯函数可用；「发放/应用」层须重写 |
| **装备定义库** | `js/data/equipment.js` (94KB) | 🟡 | 数据可搬，需补 `window.EQUIPMENT_DB` 导出 |
| 强化概率 | `js/systems/enhancement-chance.js` (3.5KB) | 🟢 | 已是 UMD（window + module.exports） |
| 装备强化 | `js/systems/equipment-enhancement.js` (16KB) | 🟡 | 保留 `resolveEquipmentReference`（装备解析核心） |
| 舰船强化 | `js/systems/ship-enhancement.js` (11KB) | 🟢 | 纯数学，补导出即可 |
| 改装件（rig） | `js/systems/rigs.js` (12KB) | 🟡 | 与 equipment-enhancement 成对引入（有隐藏依赖） |
| 植入体（脑插） | `js/data/implants.js` (29KB) | 🟡 | 数据可取；自动装监听器部分删掉 |
| 增强剂数据 | `js/data/boosters.js` (23KB) | 🟢 | 纯数据 |
| 增强剂逻辑 | `js/systems/boosters.js` (43KB) | 🔴 | 强绑 ResourceRegistry + GameEvents + gameState，重写 |
| 弹药库存 | `js/data/ammo.js` (10KB) | 🟡 | 依赖宿主 `state.ammo` 形态，本身无全局依赖 |
| 弹药制造配方 | `js/data/ammunition.js` (8KB) | 🟢 | 已 UMD，纯配方数据 |
| 冶炼 / 制造 / 发明 / 回收 | `js/systems/{production,manufacturing,invention,recycling}.js` | 🟡~🔴 | **未细审**，模式与上面一致（数据可取、逻辑绑 state），需二次评估 |
| 技能 / 研究 | `js/core/research-state.js`、`js/data/research.js` (61KB) | 🔴 | 绑本作研究树 + 存档形状 |
| **核心骨架** | `js/core/{state,selectors,actions,tick,offline,persistence}.js` | 🔴 | 见 §5，整仓复用的最大阻断点 |
| 存档信封 | `js/core/{save-envelope,save-codec}.js` | 🟡 | 信封层（校验/版本）可借鉴，payload 强绑本作 schema |
| UI / i18n / 平台 | `js/ui/*`、`js/i18n/*`、`js/platform/*` | 🔴 | 不复用（你这也不要它那套资源栏 UI） |

---

## 3. 详解 · 材料 / 资源

**核心是 `ResourceRegistry`（注册表），不是散落常量。**

- 命名空间骨架自包含在文件里：`js/core/resources.js:7-25`（`RESOURCE_NAMESPACE_CONFIG`，16 个命名空间 ore/mineral/planetary/gas/moon/special/component/... 映射到池）。
- 注册 API：`resources.js:42-62` `register({namespace,key,name,category,...})` → `Object.freeze` 存入 Map，并用「名称→id[]」反向索引。
- id 统一为 `namespace:key`（`resources.js:33` `makeId`、`:35-40` `parseId`）。
- 真实定义例：`resources.js:360` 货币 `{namespace:"currency",key:"isk",...scalar}`；`:368-370` 组件批量注册。

```js
// resources.js:360
ResourceRegistry.register({ namespace:"currency", key:"isk", name:"ISK", scalarKey:"isk", category:"currency" });
```

**依赖 / 耦合（关键）**
- 引擎本身（`get/set/add/spend/register/getDefinition/canAffordCost/spendMaterial...`）只读写传入的 `state`，**零 `document` / `localStorage` / `three` / platform 命中 → 纯函数意义 DOM-free**。
- 但**文件底部 `:302-401` 是「内容注册尾巴」**，加载期硬引用上游全局：`ITEM_CATEGORIES`（`:306`，来自 `systems/production.js:21`）、`SHIP_COMPONENT_RECIPES`（`:368`，来自 `ships.js:2`）**均无 `typeof` 守护** → 单独引入会直接 `ReferenceError`。其余（CARGO_SIZES/RIG_SERIES/ARCHAEOLOGY_*/BOOSTER_ITEMS）有守护，缺失只少注册几类。
- 可选依赖 `DisplayNames`（`:206` 有守护）、`GameEvents`（`:118/:126` 有守护）→ **可整体省略或放空 stub**。

**判定 🟡**：抽 `:7-25` + `:29-293`，删 `:302-401`，自行为新游戏 `register` 需要的资源即可作独立 UMD 资源层。

**`display-names.js` 🟢**：所有映射写死在 IIFE 内部，只暴露 `window.DisplayNames`，无外部数据、无 DOM，**零改动可引入**（不需要可省，缺失时 `getResourceDisplayName` 自动回退原始键）。

**`cargo.js` 🟡**：数据表与抽奖纯函数（`cargoWeightedPick:277`、`cargoRollQty:290`、`getCargoDropConfigs:399`、`getEnemyCargoClass:105`）DOM-free 可移植；但 `openCargoContainer:553` / `rollCargoDrop:533` / `grant*FromCargo` 等发放层**裸调用** `EQUIPMENT_DB`、`getBoosterRecipe`、`grantImplant`、`addAmmo`、`getEliteDropMult`（无守护）并直改整游戏 state → **发放层重写，只取数据 + 抽奖**。

---

## 4. 详解 · 装备 / 强化 / 改装 / 脑插 / 增强剂 / 弹药

**建模**：扁平字典 `EQUIPMENT_DB`（`js/data/equipment.js:2`），值为定义对象。

```js
// equipment.js:18 —— 武器（高槽，参与战斗）
"t1_small_laser": { id:"t1_small_laser", name:"小型激光炮 I", slot:"high", level:1, time:20, xp:12,
  cost:{"三钛合金":45,"类晶体胶矿":12}, bonuses:{},
  combat:{kind:"weapon",weaponType:"laser",baseDamage:120,baseHit:100,fuelCost:3,ammoCost:1} }
```

字段：`slot`(high/mid/low/rig/any)、`level`(制造门槛)、`shipTypes`(舰种白名单)、`cost`(精炼矿物 + 许可名)、`bonuses{}`(被动键值)、`combat{}`(战斗行为)、`faction`/`requiresBlueprint`/`archaeology` 等元数据。改装件由 `buildRigDefinitions():230` 程序化生成后 `Object.assign` 并入（`:269`）。

**风格**：顶层 `const` + 显式 `window.X = X`，**经典 `<script>` 全局，非 ESM**（全子系统仅 `enhancement-chance.js:63`、`ammunition.js:102` 顺带 `module.exports`）。

**耦合重心不在本子系统，而在外层**：
- 装备→战力聚合在 `js/core/selectors.js`：`getCombatMaxHpFromState:2498`（遍历 `fitting` → `resolveEquipmentReference` → 累加 `bonuses`）、`getInstalledCombatModulesFromState:2217`、`getCombatWeaponHitFromState:2569`。
- 伤害公式在 `js/systems/combat.js:164 calcCombatDamage`，主循环 `combatTick:2214`。

**依赖清单（9 个装备相关文件）**：`Translator` 0 命中、`document.` 0 命中、`THREE` 0 命中、platform 0 命中 → **DOM-free / 无 i18n**。仅 `systems/boosters.js`（写 ResourceRegistry + emit GameEvents + 读 gameState + 可选 `window.INVENTION`）与 `data/implants.js` 的自动监听器（GameEvents/gameState，均 `typeof` 守护）有硬依赖。

**模块依赖链**：
```
ARCHAEOLOGY_SHIP_TYPES(ships.js) ─► data/equipment.js (EQUIPMENT_DB)
enhancement-chance.js ─┬─► equipment-enhancement.js ─[resolveEquipmentReference]─► rigs.js
                       └─► ship-enhancement.js
data/boosters.js ─► systems/boosters.js (重写)
data/implants.js ─► GameEvents + gameState (守护)
data/ammo.js ─► 仅操作传入 state.ammo
data/ammunition.js ─► 纯配方(UMD)
```

**两处摩擦**：① `EQUIPMENT_DB` **未挂 window**（仅顶层 const）→ 需补 `window.EQUIPMENT_DB = EQUIPMENT_DB` 或 `module.exports`；② `rigs.js` 隐藏依赖 `resolveEquipmentReference`（定义在 `equipment-enhancement.js:145`）→ **必须成对引入，且 enhancement 先于 rigs 加载**。

**判定**：🟢 拷贝即用 `enhancement-chance.js` / `ammunition.js` / `data/boosters.js` / `data/implants.js`(数据) / `ship-enhancement.js`；🟡 补导出 `data/equipment.js`、成对引入 `rigs.js`+`equipment-enhancement.js`、提供 `state.ammo`/stub `getOfflinePerfCache`；🔴 重写 `systems/boosters.js`；**装备→战斗结算层（约 100~200 行）自写**。

---

## 5. 关键阻断点（为什么不能整仓复用）

1. **无统一模块边界**：`selectors.js` 完全零导出（无 `window.*`、无 `module.exports`）；`actions.js` 的 `dispatchGameAction`、`offline.js` 的 `calculateOfflineGains` 也只是裸全局。任何打包器/CommonJS 都 import 不到核心 API，只能回退「浏览器 `<script>` 全量顺序加载 + 全局作用域」这条脆弱路径。
2. **违反自己的 DOM-free 契约**：`actions.js` 直调 `showToast(...)`；`tick.js:22/41/46/48/50/60` 直调 `showToast`/`updateUI()`；`offline.js:81` 调 `openRewardResultModal`、`:1794` 调 `updateUI()`；`state.js:441-462` 直读/写 `localStorage`。
3. **强绑本作 data 全局**：核心层处处读 `STARTER_SHIPS`/`MINING_AREAS`/`SMELTING_RECIPES`/`ResourceRegistry`/`DisplayNames`/`WORMHOLE`/`LEGION_*` 等几十个本作专属全局（`selectors.js:12-40,346,356,663,800,860...`）。
4. **存档无 schema 抽象**：`gameState` 就是整棵本作状态树（`state.js:16-331`）；迁移是**硬编码 `migrate*` 函数流水线**（`persistence.js:930-945` 固定次序），**没有版本号注册表**，换游戏等于换整棵树 + 重写全部迁移。
5. **求值期硬加载顺序**：`state.js:226-235` 在加载期即调 `TutorialState/ResearchState/AchievementState.createDefaultXxxState()`（缺失即抛）；`bootstrap-launch.js` 必须在 `render.js` 之前（`index.html` 的 `defer` 顺序即契约）。
6. **浏览器 API 渗透核心**：`localStorage`/`window`/`document`/`navigator`/`CompressionStream`/`btoa` 散落在 state/persistence/save-codec/bootstrap/runtime，Node 环境跑不起来。

---

## 6. 推荐路径

| 方案 | 做法 | 评价 |
|---|---|---|
| **A 整仓 fork** | 以 EVE-IDLE 为基座派生新仓，保留其核心层 | ❌ 不推荐。要带着它的 data 全局、i18n、平台、iframe 星图、巨型存档跑；等于把 §5 的 6 个阻断点全背过来。 |
| **B 抽「数据 + 纯数学」共享库** | 新建独立仓，把 §7 清单里的模块抽成一个 file:// 可跑的 UMD 库，深空星疆引用（原始 `src/` 或 git submodule），战斗/结算层自写 | ✅ **推荐**。低风险、体积小、无 DOM/无 i18n，正好补上深空星疆缺的装备系统。 |
| **C 只参考不复制** | 读 EVE-IDLE 的数值/结构，深空星疆自己写 | 🟡 保守。省不了多少事，且放弃现成的 200+ 材料 / 全套装备数值。 |

**建议 B**，理由：EVE-IDLE 的材料 / 装备是**声明式数据**，最大的价值就是内容量（约 200+ 资源 id、全套 T1~T5 装备与改装件），复用它可以省掉海量数值设计；而最贵的「结算逻辑」本来就要按深空星疆的挂机模型（§14.5 红线：O(1)、算≠回放）重写——两者恰好互补。

---

## 7. 最小可复用抽取清单（可直接照做）

**🟢 直接拷（零改动或补 1 行导出）**
- `js/data/display-names.js` → `window.DisplayNames`（可选）
- `js/systems/enhancement-chance.js`（已 UMD）
- `js/data/ammunition.js`（已 UMD）
- `js/data/boosters.js`（纯数据）
- `js/systems/ship-enhancement.js`（补导出）
- `js/data/implants.js`（只取 `IMPLANT_DB` 数据段，删自动监听器）

**🟡 拷 + 改（1~2 处）**
- `js/core/resources.js`：留 `:7-25` 命名空间配置 + `:29-293` 引擎，**删 `:302-401` 注册块**；自行 `register` 需要的资源。
- `js/data/equipment.js`：**补 `window.EQUIPMENT_DB = EQUIPMENT_DB`**；依赖的 `ARCHAEOLOGY_SHIP_TYPES` 用普通数组即可。
- `js/systems/equipment-enhancement.js` + `js/systems/rigs.js`：**成对引入（enhancement 先于 rigs）**；stub 掉 `getOfflinePerfCache`（`:150`，缺失会走原实现）。
- `js/data/ammo.js`：提供宿主 `state.ammo` 形态即可，本身无全局依赖。
- `js/data/cargo.js`：只取数据表 + `cargoWeightedPick`/`getCargoDropConfigs` 等纯函数，发放层重写。
- `js/core/save-envelope.js` / `save-codec.js`：可借鉴「信封 + 校验和 + 版本拒绝加载」思路，但**不搬 payload 白名单**。

**🔴 不搬（重写）**
- `js/systems/boosters.js`（增强剂运行逻辑）
- `js/core/{state,selectors,actions,tick,offline,persistence}.js`（核心骨架）
- `js/ui/*`、`js/i18n/*`、`js/platform/*`
- 装备→战力的聚合层（对标 `selectors.js:2498/2217`）

**需要提供的空 stub（放空实现即可）**：`GameEvents`、`DisplayNames`（可选）、`getOfflinePerfCache`（可选）、`ResourceRegistry`（若模块内可选引用）。

---

## 8. 下一步（待定）

1. **仓库形态**：新游戏仓用 **git submodule 引 EVE-IDLE 源文件**（保持单一来源、不复制），还是把抽好的 lib **复制进新仓**自行演进？（前者干净但耦合上游节奏；后者自由但会分叉）
2. **是否先做一个 PoC**：把 `ResourceRegistry` + `EQUIPMENT_DB` + 强化数学（`enhancement-chance`/`equipment-enhancement`/`ship-enhancement`/`rigs`）抽成一个 **file:// 直接可跑的 UMD 模块**，接进深空星疆，试装 1 件装备走通「材料 → 制造 → 装备 → 属性加成」，验证复用链路真的通。
3. **资源栏 UI**：确认彻底换掉深空星疆现有 HUD（用 EVE-IDLE 那套资源注册表 + 分类展示），还是仅把「装备/材料」接进来、HUD 保留。
4. **待补评估**：冶炼 / 制造 / 发明 / 回收（`systems/{production,manufacturing,invention,recycling}.js`）本轮未细审，若也要复用需再出一份。

---

## 9. 执行记录（2026-10-15）

按方案 B「抽数据+纯数学共享库」，但改为**复制进本地库、不共享**（用户拍板：复制过来自己用、自行演进）。

- **库位置**：`game/js/lib/eveidle/{core,data,systems}/`（复制自 `EVE-IDLE-WORKBUDDY-FRESH`）
- **复制文件（🟢🟡）**：`core/resources.js`、`data/{display-names,equipment,ammunition,cargo,boosters,implants,ammo}.js`、`systems/{enhancement-chance,equipment-enhancement,rigs,ship-enhancement}.js`
- **裁剪/改造**：
  - `resources.js` 删 `:302-401` 本作专属注册尾巴（PowerShell `Set-Content` 曾把中文写乱码，已用 .NET UTF-8 重截到 300 行修复）
  - `equipment.js` 仅保留 `const EQUIPMENT_DB`（`:2-170` 纯数据字典），删去死亡空间/考古/UI 辅助函数；补 `window.EQUIPMENT_DB` 导出
  - `equipment-enhancement.js` / `rigs.js` 自带 `window` 导出（`resolveEquipmentReference` 在 `window.EquipmentEnhancement` 上）
  - 新增 `host-stubs.js`：集中给 EVE-IDLE 专属宿主全局（`DEATHSPACE_DATABASE`/`RIG_SERIES`/`SMELTING_RECIPES`/…）空默认值，使库独立加载
- **验证**：`sim/probe_lib_poc.cjs` **16/16 PASS**（加载无错、ResourceRegistry pool 形态、EQUIPMENT_DB 数据完整、resolveEquipmentReference、强化公式、加成聚合、rig 谐振、确定性、DOM-free）
- **接入**：`index.html` 在自有脚本前按依赖顺序引入 lib（缓存号 `?v=1`）
- **未裁（有意保留）**：`cargo.js` 发放层 / `implants.js` 监听器 / `ammo.js` / `boosters.js` 数据保留完整——加载期安全，运行时发放逻辑由深空星疆自写结算层处理，不调用

*本清单已落地为本地库；原始评估为只读，落地改动见上。*

---

## 10. 下一步（集成）

1. 在深空星疆 `state` 里引入 `EQUIPMENT_DB` 装备字典 + 装备实例形态（成员/舰船挂 `equipment` 字段）。
2. 自写「制造装备」动作：材料消耗走 `ResourceRegistry`（pool 形态 `state.resources.minerals[...]`），cost 键需映射注册 id。
3. 自写「装备→加成」聚合（复用 `resolveEquipmentReference` + `EQUIPMENT_DB[ref].bonuses`），接入 §14.5 离线红线（O(1)）。
4. 视需要补全 `cargo/implants/ammo/boosters` 的数据消费（目前仅取数据表，发放/监听器不接）。
