# 深空星疆 · MVP 周一交付：规则锁定 + 试玩流程 + 代码改动清单

> 计划周期：2026-10-26（周一）— 2026-11-01（周日）
> 本文 = 周一「冻结范围与规则」交付物：规则表 / 试玩流程 / 代码改动清单。
> 本文与 `深空星疆·MVP周计划_2026-11-01.md` 配套；凡「待确认」项须用户拍板后再动代码（先设计后代码）。
> 红线约定（不可破）：任何接入 `settle` 的新系统必须满足 §14.5 / §14.6（离线 O(1)、dt 封顶 24h、rng 解耦、事件削峰 4、算≠渲）。

---

## 0. 代码基线核对（入口文件现状）

| 子系统 | 文件 | 当前状态（周一核） |
|---|---|---|
| 星图/安全等级/区域 | `game/js/data/starmap.js` | 207 固定节点、9 区域、`SECLEVEL_TABLE`(5 档)、`REGION_DEFS`(已带 `stage` 1/2/3 + `secLevel`)、`pirateRaid`、全矿种 + `oreAbundance` 丰寡。缺：试玩档位门禁、`shortestHops` BFS、行星产出。 |
| 资源/矿物/气体 | `game/js/data/resources.js` | 7 矿 + 7 气 + 8 矿材 + 3 部件 + 图纸，均有 `tier`；`startingResources()` 已给初始库存。缺：行星产出类别。 |
| NPC 生成/状态 | `game/js/engine/state.js` | `makeMember`(10 技能 + passion + 出身/经历词条 + 人生目的 `goals` + 舰船绑定)、`recruitMember`(名册<20)、`fireMember`。缺：招募技能上限钳制（单项≤10/总和≤30）。 |
| 招募中心 | `game/js/engine/recruit.js` | 每批 3 候选、4h 刷新、换批翻倍、招募免费、广告位占位。已落地。 |
| 派工/结算钩子 | `game/js/engine/dispatch.js` | `assign`(mine/explore/combat/train/transport)、战斗小队 squad。缺：`logistics` 管理岗派遣类型、`shortestHops` 接入。 |
| 时间戳结算 | `game/js/engine/settle.js` | 燃料回复 / 采矿 / 探索 / 战斗 / 演训 / 工业 / 势力刷新 / 事件 roll。常量 `BASE_MINE`/`XP_RATE`/`MAX_OFFLINE_SECONDS`。缺：物流效率乘区、经验节奏调慢。 |
| 工业三队列 | `game/js/engine/production.js` | smelt/manufacture/invent 入队+批次推进，`bodyLevelPlan` 控槽数。已落地。 |
| 母舰/舱段/蓝图 | `game/js/engine/base.js` + `ships.js` | 唯一核心、母舰蓝图、模块拆装、`queueDurationMultiplier`(相邻/特化加速)。**缺：能源预算门禁**；`ships.js` 有 **bodyLevelReq off-by-one**。 |
| 事件库 | `game/js/narrative/events.js` | 六类活动事件，但数量不足（refine 1 / invent 1，其余 2），且**无玩家选项分支、无任务链**类型。 |
| 界面 | `game/js/ui/app.js` | 五页签(星图/星系/舰基/成员/势力/日报) + 招募弹窗 + 人生目的条。缺：物流/能源/精通点/技能上限/事件后果的展示。 |
| 存档 | `game/js/core/persistence.js` + `store.js` | 当前存档 `version: 7`。本周 schema 改动须 bump 版本 + `normalize`。 |

---

## 1. 规则表（锁定，本周不可破）

### 1.1 星区 / 安全等级门槛
- 复用现有 `SECLEVEL_TABLE` 五档：`1.0-0.8` 高安 / `0.7-0.5` 边境 / `0.4-0.3` 低安 / `0.2-0.1` 深空 / `0.0`。
- **试玩开放 = `stage ≤ 1` 的全部区域**（5 个）：苍曜(高安)、霜环(高安)、沉沙(高安)、碧落(高安)、远寂(边境)。
- **锁定 = `stage ≥ 2` 的 4 个区域**：玄渊(低安)、幽烬(低安)、残辉(深空)、赤潮(0.0)。本周不可跃迁抵达。
- 门禁实现：`starmap.js` 新增 `TRIAL_STAGE_MAX = 1` + 节点/区域 `trialOpen` 标记；星图 UI 对 `trialOpen=false` 节点灰显并提示「后续版本开放」，连边保留但不作为试玩可达路径。
- ✅ **A 已确认（2026-10-26）**：用户拍板 = 仅 `stage1` 两档（高安+边境）开放；玄渊/幽烬/残辉/赤潮锁定。「中期」= 核心升 Lv2 解锁中级舰制造权限，玩家地理上仍在 stage1 内活动。

### 1.2 资源等级与采集
- 采集**不硬锁矿种**：小行星带/气云含全矿种，丰寡由 `oreAbundance(矿种tier, 节点tier)` 决定（同级 1.6~2.5 / 低级 0.5~1.0 / 越级 0.12~0.45）。已落地（§13.9），本周沿用。
- 资源 tier 表（复用 `resources.js`）：
  - 矿 tier1：铁硅原矿/赤镍矿；tier2：蓝硼晶/同位晶簇；tier3：诺瓦矿/重锆岩；tier4：极星矿。
  - 气 tier1：粗制富勒烯；tier2：氦同位素/稳定富勒烯；tier3：氢同位素/高纯富勒烯；tier4：聚合气体/超纯聚合气体。
- **行星产出（B 已确认，瘦移植 EVE-IDLE `PLANET_TYPES`）**：EVE-IDLE 有完整行星殖民系统（`systems/planetary.js`：部署/维护费/自动续期/专属 Canvas），但 MVP 过重，**只移植其数据模型**——6 类行星各产 1 种专属产物，挂到星系内 `planet` 天体上，作为新增 `develop` 派遣活动（时间戳结算，与 mine/gas 一致），**不搬殖民 Canvas/维护费 mini-game**。
  - 移植映射（内部键 + 解耦中文名，沿用 EVE-IDLE 产物语义）：
    | planetType | EVE-IDLE 名 | 深空星疆产物(内部键) | 产物显示名 | 试玩可出 |
    |---|---|---|---|---|
    | lava | 熔岩行星 | `planet_lava` | 熔岩矿粹 | ✅ stage1 |
    | gas | 气态行星 | `planet_gas` | 凝析轻气 | ✅ stage1 |
    | ice | 冰行星 | `planet_ice` | 极地同位素 | ✅ stage1 |
    | plasma | 等离子行星 | `planet_plasma` | 等离子流体 | 锁 stage2 |
    | temperate | 温带行星 | `planet_bio` | 生态基质 | 锁 stage2 |
    | storm | 风暴行星 | `planet_mag` | 磁聚合物 | 锁 stage2 |
  - 渐进分层：试玩（stage1）只生成 lava/gas/ice 三类行星天体，确保「完整行星产品覆盖」= 3 种产物；plasma/temperate/storm 留待 stage2 开放（与区域锁定一致）。
  - 每颗行星天体固定 1 个 `planetType` → 只产其对应产物（满足「每种行星只产出其对应产品」）。
  - 实施：`resources.js` 新增 `PLANET` 资源类别（6 项，tier 标记）+ 注册进 `ALL`/`HUD_ORDER`；`starmap.js` 的 `makeBodies`/`ensureBodies` 给 `planet` 天体写 `planetType`（按区域 stage 抽 lava/gas/ice 或 plasma/temperate/storm）；`dispatch.js` 增 `develop` 活动；`settle.js` 增 `develop` 时间戳结算分支（按行星 `interval` 产对应产物）；`events.js` 补 ≥3 个 develop 事件；`app.js` 星系视图标行星类型 + 派遣 `develop` 入口。

### 1.3 舰种建造门禁（⚠️ 修 off-by-one）
- `bodyLevel` 语义 = `BODY_LEVELS` 下标 0..3 即 Lv1..Lv4（见 `state.js` 注释「0=空间站 Lv1 本体」）。
- **Bug**：`ships.js` 的 `bodyLevelReq` 用 1-based（frigate/destroyer=1…supercapital=4），而起始 `bodyLevel=0` → `canBuildAt` 当前判定 **开局 Lv1 造不了任何船**；中级舰需升到 Lv3 才能造，远超一周闭环。
- **锁定修复（二选一，推荐 ①）**：
  - ① 改为 0-based：`frigate/destroyer=0`、`cruiser/battlecruiser=1`、`battleship/capital=2`、`supercapital=3`；
  - ② 起始 `bodyLevel` 置 1 并保留现有 1-based（需同步改 `BODY_LEVELS` 下标语义）。
- **中级舰 = cruiser(铁卫级)/battlecruiser(闪刃级)**，门禁 = **Lv2（升级核心一次后）**。试玩完成条件之一 = 造出 ≥1 艘中级舰。

### 1.4 物流公式（新增系统，周三实现）
- **最终效率 = `clamp(100% − 20% × 跳数 + 物流补偿, 0%, 100%)`**，物流补偿软上限 **70 个百分点(pp)**。
- 验证样例：6 跳、补偿 60pp → 100 − 120 + 60 = **40%**。✅
- UI 用语锁定：`跳数`(base 到作业节点的最短路径跳数) / `距离惩罚`(−20%/跳) / `物流补偿`(物流岗提供) / `最终效率`(结算实际乘区，**界面值 = 结算值**)。
- 物流岗 = 驻基地的**管理岗**（不占外勤派遣槽，参阅 §13.2 预留 `logistics` 光环）。每个在岗物流官提供固定补偿 pp，多官叠加至 70pp 软顶。⚠️ 单官补偿量 TBD（周三标定，建议 20~35pp/人）。

### 1.5 母舰核心 / 能源 / 舱段（周四实现）
- 核心升级（`base.bodyLevel` 0→3）解锁：能源预算 + 工业槽数(`BODY_LEVELS` 已含 smelt/manufacture/invent 槽数) + 高级舰种门禁。
- **能源预算（新增）**：每个 `BASE_MODULES` 类型加 `energy` 占用；`BODY_LEVELS` 每级加 `energy` 预算；`base.js` 加 `energyUsed(state)` 与安装门禁——超额则禁止安装/启用舱段。
- MVP 四类工作舱段 = `smelt`(精炼)/`manufacture`(总装)/`invent`(发明)/`dock`(泊位)，外加 `command`/`habitat`/`energy`/`cargo`。⚠️ 各模块 `energy` 数值 TBD（周四标定）。

### 1.6 开局闭环（锁定，周四/周三实现）
- 新档 = **仅舰基核心 + 起始母舰蓝图（拓荒者级），无居住舱、无成员**。
- 主线序章任务 **发放居住舱 + 首批人口容量**；居住舱就位前，招募/派工入口禁用或引导至主线。
- 目的：避免「开局即有 6 人 + 全模块」的启动闭环，强制玩家走「主线→居住舱→招募→派工」引导链。
- 当前 `defaultState` 起始 6 成员 + `createInitialBase` 预装全模块 → 须改为 0 成员、模块仅核心相关、居住舱由主线发放。

### 1.7 NPC 招募约束（周六实现，规则先锁）
- 招募时生成技能**等级**：强制校验 **单项 ≤ 10、总和 ≤ 30**（10 技能总和，非 7）。
- 当前 `makeMember` 用 `seedSkills` 撒 xp（major 250~800 → 等级可达 Lv7），**未钳制**。
- 实现：招募生成后 `clamp` 每技能等级 ≤10 且总等级 ≤30（优先保 major 技能），或改为直接按等级播种。

### 1.8 精通点（周六实现，规则先锁）
- 来源：**按工作完成 / 有效产出发点**，不按高频 settle tick 刷点（防刷）。建议：每完成 1 个工业批次 +1、每交付 1 个势力任务 +N、每达成 1 个 NPC 人生目的 +N。
- 用途：先开放 **3 个军团全局强化**（降级顺序第 3 条），如「采集速率 +X%」「工业耗时 −X%」「物流补偿 +X pp」。

### 1.9 事件（周六实现，规则先锁）
- 每种 MVP 工作（活动上下文）≥ **3 个事件**。当前缺口（按 `activity` 统计）：`mine 2`/`explore 2`/`combat 2`/`refine 1`/`manufacture 2`/`invent 1`。
- 需要新增的类型：① 玩家**选项分支**（`options:[{text, effects}]`，采矿遭遇）；② **任务链**（`kind:"chain"`，一条短战斗唯一链）；③ 熔炼增产**势力任务双倍奖励**。
- 事件 schema 须扩 `options` / `kind` 字段，`settle.applyEvent` 与 UI 选项面板相应支持。

---

## 2. 试玩流程（锁定闭环路径）

```
新档
 └─ 序章主线：发放居住舱 + 首批人口容量（核心 Lv1）
     └─ 招募中心：招 ≥1 名 NPC（技能钳制后）
         └─ 派工采集：在 stage1 星系采矿/采气（显示 跳数/距离惩罚/物流补偿/最终效率）
             ├─ 触发并处理活动事件（≥3 种/工作，含采矿遭遇分支）
             ├─ 基地冶炼：矿石 → 矿材（精炼环）
             ├─ 基地制造：矿材 → 部件 → 总装护卫/驱逐舰（验证工业链）
             └─ 势力交付：提交矿石/矿材/部件/图纸 → 星币 + 声望（链感）
                 └─ 升级核心 Lv1→Lv2（消耗 星币 + 铁硅原矿/标准钛材）
                     ├─ 解锁中级舰门禁 + 能源预算 + 更多工业槽
                     ├─ 在 stage1 内造出 ≥1 艘中级舰（cruiser/battlecruiser）★完成★
                     └─ （可选）跃迁至边境(远寂) 验证 0.8-0.5 星区
```
- 重开存档校验：NPC / 任务 / 队列 / 舱段 / 精通点 / 人生目的 / 地图状态一致。
- 不降级规则（必保）：物流界面值 = 结算值；资源/舰船门槛正确；母舰能启动工作循环；存档可继续。

---

## 3. 代码改动清单（按日分，命中文件 + 改动点）

### ✅ 周二 · 星区、星系和资源分布（已完成 2026-10-26）
- `starmap.js`：`TRIAL_STAGE_MAX=1` + 行星类型分层(`TRIAL_POOL`/`LOCK_POOL`)；节点/区域加 `trialOpen`（按 `reg.stage<=TRIAL_STAGE_MAX`）；新增 `shortestHops(map, from, to)`（BFS，物流周三复用，已导出）；`makeBodies` 给 `planet` 天体写 `planetType`（按区域 stage 抽 lava/gas/ice 或 plasma/temperate/storm）。
- `resources.js`：新增 **`PLANET` 资源类别**（6 项，见 §1.2 映射表，tier 标记）+ 注册进 `ALL`/`HUD_ORDER` + `startingResources` 置 0。
- `app.js`：星图/星域视图对 `trialOpen=false` 灰显 + 「后续版本开放 / 试玩锁定」标签；`settle.js.moveBase` 加锁定守卫。
- 验收：探针 block20 全 PASS；headless 零控制台报错；锁定节点 89 / 锁定星域 4 正确渲染。

### ✅ 周三 · 采集与物流（已完成 2026-10-26）
- 新增 `engine/logistics.js`（UMD `NSK.Engine.Logistics`）：`efficiency(hops,comp)`=`clamp(1−0.2×hops+comp/100,0,1)`、`accumulate`(在岗物流官求和，软顶 70pp，COMP_RATE=0.4/s/人 待标)、`jobEfficiency`、`resourceForPlanetType`、`planetRichness`（确定性哈希，不写回星图）。
- `dispatch.js`：`assign` 增 `type:"develop"`(行星开发) / `"logistics"`(驻基地管理岗)。
- `settle.js`：主循环前 `Logistics.accumulate`；采矿 yield × 物流效率(effLogi 独立乘区)；新增 **develop 结算分支**（行星产出对应 PLANET 资源，× 物流效率，涨制造技能）。
- `app.js`：行星 `bodyActs` 加 develop；行星 popover 显示 跳数/距离惩罚/物流补偿/最终效率；成员页加「物流」派遣按钮；舰基页加「物流调度」面板。
- 验收：探针 block21 新增 12 项全 PASS；探针总 61 PASS / 0 FAIL；headless 零控制台报错。

### 周四 · 母舰核心与舱段 ✅ 已完成（2026-10-27）
- `ships.js`：**修 §1.3 off-by-one**（bodyLevelReq 改 0-based：frigate/destroyer=0、cruiser/battlecruiser=1、battleship/capital=2、supercapital=3，与 `BODY_LEVELS` 下标 + 起始 bodyLevel=0 对齐）；`BASE_MODULES` 各加 `energy` 占用；`BODY_LEVELS` 各加 `energy` 预算（80/180/320/520）；导出 `ENERGY_OUTPUT=100`。
- `base.js`：加 `energyBudget/energyUsed/powerReport/powerMult`；`installModule` 能源门禁（**含自救逻辑**：装能源舱时预算计入自身发电，避免过载死锁）；新增 `upgradeCore(state)`（付 `upgradeCost`、bodyLevel++）。
- `state.js`：序章报告「拓荒启航」发放居住舱 + 人口容量（居住舱本就在 `createInitialBase` 安装）。
- `app.js`：viewBase 加「能源电网」面板（供能/负载/超载降速条）；舱位聚焦面板显示电力占用/发电；核心升级按钮走 `upgradeCore` + 日报。
- `production.js`：`processAll` 接入 `powerMult` 棕化（**修复一处实现 bug**：原按 pm 缩放 elapsed 但 startedAt 按真实 dur 推进，导致过载反而多产；改为以 `dur/pm` 为等效耗时，方向正确）。
- 验收：新档能源足额（预算 180 / 负载 125）；起始即可造护卫/驱逐；升级核心后预算+100；过载时工业降速、安装门禁生效、装能源舱可自救；四类工作舱段安装+能源校验就位。探针 22 全 PASS，headless 零报错。

### 周五 · 工业、经验与增强剂 ✅ 已完成（2026-10-30）
- `settle.js`：调慢 `XP_RATE`（约 ÷10，提案值待标定）：mining 0.9 / refine 0.9 / manufacture 0.7 / invent 0.6 / combat 0.8×3 / defense 0.6 / train 1.4（/秒）。实测：60s 专注成长 ≤4 级（可见但不瞬满），1h 后到 ~Lv20（未冲到离谱高度）。保留 levelOf 闭式曲线（无 NPC 等级、技能无硬上限）。
- `production.js` + `recipes.js`：新增**造船队列**（总装船坞与部件制造共享 `plan.manufacture` 槽位；完成入 `state.ships`，记 `counters.builtShips`）；闭环验证：frigate 起始可造 → upgradeCore 到 Lv2 后 cruiser 可造（中级舰 stage1 可达）。配方耗时/原料维持原值（精炼 8~14s/批、部件 16~20s/批、舰 buildTime 60~5400s），无卡死/溢出。
- 新增 `engine/booster.js`（UMD `NSK.Engine.Booster`）：增强剂**整舱生效**（作用于整个舱段类型），基础等级 + 持续时间 + 叠加规则（降级顺序第 4 条：同舱段同时只 1 个、再激活取 max 等级并刷新时长、不同类型独立、到期惰性清理）。每级 = 该舱段工业队列耗时 −10%（加速 ×1.10）。增强剂乘区已接入 `processQueue`/`processBuildQueue` 等效耗时（与电网棕化 pm 同帧处理）。
- `state.js` / `base.js`：默认态加 `industry.buildQueue` 与 `state.base.boosters`；`Base.normalize` 向后兼容兜底（旧档缺字段不崩）。
- `app.js` / `index.html`：舰基页新增**造船面板**（按 `canBuildAt` 列全部舰种、显示 cost/buildTime/锁定态、排产按钮、`buildQueue` 进度、已造艘数）+ **增强剂状态面板**；舱位聚焦面板对在线舱段加「激活增强剂」按钮（消耗 2000 星币、持续 600s）。`booster.js` 注册顺序在 `production.js` 之前（避免 `Production` 捕获 `Booster` 常量为 null）。
- 验收：探针 block23 全 PASS（造船闭环 / 增强剂 apply·levelOf·mult·max·独立·过期 / 增强剂提速产出 B=90>对照80 / XP 调慢曲线）；headless `#base` 与默认页均零控制台报错，造船面板与增强剂面板真实渲染。

### 周六 · NPC 成长、精通点与事件 ✅（2026-10-27 落地）
- ✅ `state.js`：招募技能钳制 —— **单项等级 ≤10、十项总和 ≤30**；F 决策采用「**生成后 clamp、保 major 专精**」（削减顺序 none→minor→major，同级取最高）。导出 `SKILL_LEVEL_CAP/SKILL_LEVEL_SUM_CAP/clampSkills/skillLevel/xpAtLevel`。成员对象新增 `milestones:[]`。
- ✅ `npc.js`：人生目的 `mods.goalXp` 全技能经验倍率沿用；新增 **8 条行为里程碑**（初心得偿/此生无憾/熟练工 Lv5/行家 Lv10/多面手/百战老兵/工业骨干/深空测绘师），`checkMilestones` 幂等发称号 + 个人功勋 +1 + 日报，不按 tick。
- ✅ `events.js` 重写：**每类 MVP 工作 ≥3**（mine 4 / explore 4 / combat 8 / refine 3 / manufacture 3 / invent 3，另补 train/develop/logistics 各 3）；`options` 分支 **13 个**（`require` 支持词条/技能等级/库存门槛，`chance` + 词条加成，成功/失败不同结果）；`kind:"chain"` **三段短战斗链**（断链行动 一→二→三阶段，终局发图纸）；**修复历史 bug**：旧 `applyEvent` 只认 `deltas`，顶层 `skillKey/skill` 从未生效（经验事件只出文案）。
- ✅ 新增 `engine/mastery.js`：**离散发点**（工业批次 +1 / 势力任务 +2 / 事件决策 +1 / 人生目的 +2 / 总装完成 +3），**3 个全局强化**（工业调度 −5% 耗时/级、战术协同 +8% 声望赏金/级、航线优化 −3pp 跳数惩罚/级，各 3 级、花费 1/2/3 点）；乘区已接入 `production`/`settle`/`logistics`；UI 有消费面板。
- ✅ 待决事件队列：带 `options`/`chain` 的事件**不自动结算**，入 `state.pendingEvents`（上限 5、同事件同成员去重），日报页顶部渲染选项按钮（含成功率与锁定原因），点选后 `resolveOption` 结算并按需接续链下一阶段。
- ✅ 势力任务：矿材提交单 **60% 概率标记 `smeltBoost` → 酬劳 ×2**（星币与声望同倍，文案标注「熔炼增产 · 双倍酬劳」）。
- ✅ `app.js`：日报待决事件面板、成员卡里程碑徽章、成员详情里程碑清单（已得/未达成）、舰基页精通点面板与强化按钮。
- **验收**：探针 **block24 全 PASS（总 126/0）**；headless `#base/#members/#report` 零控制台报错；夹具页实测「2 条待决 → 点选 → 剩 1 条 + 日报出现结算文案 + 成功 toast」，零报错。

### 周日 · 整合、验收与试玩包 ✅（2026-10-27 落地）
- ✅ **闭环验收（探针 block25，8 项全 PASS）**：新档 → 招募 1 人（名册 6→7）→ 派工采矿 30 分钟（产出 + 经验成长）→ 精炼出矿材 → 制造出部件 → 核心升 Lv2（电网 180→280）→ 跃迁相邻节点「灰之域」→ **造出铁卫级（cruiser）并完成总装** → 待决事件入队并结算。
- ✅ **存档 version bump 7→8 + 兼容迁移**：`Store.load` 由「必须严格等于」改为「接受 ≤ 当前版本、拒绝更高版本」；`normalizeMembers` 补齐 `mastery` / `pendingEvents` / 成员 `milestones`；`Base.normalize` 同步兜底。探针验证：v7 旧档加载后升 v8 且新字段齐全；v99 存档被拒。
- ✅ **UI 校对**：跳数/距离惩罚/最终效率（物流面板公式）、资源门槛（按钮 disabled + 持有量）、能源占用（负载/供能条）、NPC 驻守（派遣状态标签）、技能上限（招募钳制）、事件后果（待决事件面板 + 日报结算文案）均已上屏。
- ✅ **试玩包**：`深空星疆·MVP试玩包_操作说明与反馈表.md`（启动方式 / 10 分钟上手路径 / 关键数值速查 / 已知问题与未完成项 10 条 / 10 题反馈表 + 4 个开放问题 / 可复现验证记录）。
- **收口验证**：探针 **142 PASS / 0 FAIL**；headless 星图/舰基/成员/日报零控制台报错；待决事件夹具端到端（2 条 → 点选 → 1 条 + 结算文案 + 成功 toast）零报错。

---

## 4. 本周待确认（用户拍板后再写代码）

1. ~~**A. 试玩区域边界**：✅ 已确认（2026-10-26）= 仅 `stage1` 两档开放（高安+边境），`TRIAL_STAGE_MAX=1`。~~
2. ~~**B. 行星产出**：✅ 已确认（2026-10-26）= 瘦移植 EVE-IDLE `PLANET_TYPES` 六类行星→各自产物，作为 `develop` 派遣活动挂到星系内 `planet` 天体；不搬殖民 Canvas/维护费 mini-game（详见 §1.2 映射表）。~~
3. ~~**C. off-by-one 修法**：① bodyLevelReq 改 0-based（推荐）/ ② 起始 bodyLevel 置 1。**已决（采用 ①，2026-10-27 落地）**：frigate/destroyer=0、cruiser/battlecruiser=1、battleship/capital=2、supercapital=3，与 `BODY_LEVELS` 下标 + 起始 bodyLevel=0 对齐。~~
4. **D. 物流岗补偿量**：单官 pp 值（建议 20~35，软顶 70）。**已用提议值 `COMP_RATE=0.4/s/人` + 软顶 70pp + `HOP_PENALTY=0.2` 落地（2026-10-26），待最终标定**。
5. ~~**E. 能源数值**：各模块 `energy` 占用与各级 `energy` 预算。**已用提议值落地（2026-10-27，待标定）**：模块占用 精炼20/总装30/发明40/泊位10/指挥10/居住10/仓储5（能源舱0）；各级外壳电网 80/180/320/520；能源舱输出 100。~~
6. ~~**F. 招募技能钳制方式**：✅ 已决（2026-10-27）= **生成后 clamp、保 major**：单项等级 ≤10、十项总和 ≤30，削减顺序 none→minor→major（同级取最高）。未采用「按等级播种」，因为播种要改 `seedSkills` 分布、且难保 major 手感。~~

> A/B 已决，周二可开工；C~F 在各自当日实现前定。
