# 深空星疆 · ②改装件 rig 谐振 · 实施方案

> 状态：**只读调查完成，等拍板，产品代码零改动**
> 前置：①装备实例化已完成并提交（`ea963d7`），`m.fitted` 存 `eq_<N>` uid、`state.equipInstances[uid]={itemId,affixes}`，`affixes` 恒空但接口已预留。
> 真值来源：1 代 `D:/EVE-IDLE/EVEIDLE-WORKBUDDY-FRESH/js/data/equipment.js:184-269`、`js/systems/rigs.js:1-88`、`js/systems/invention.js:461-825`；本作 `game/js/data/equipment.js:55-62`、`js/lib/eveidle/systems/rigs.js`、`js/engine/{archaeology,settle,production,combat,salvage}.js`。

---

## 0. 一句话结论

1 代 rig 是**独立子系统**（13 系 × 5 档 = 65 件 + 谐振惩罚 + 双词条强化 + 拆卸即毁）；本作只有 **1 系 5 件普通装备**，谐振公式躺在 254 行零调用死代码里，13 个加成键中 **9 个零消费方**、1 个（燃料）语义与 1 代**相反**。校准基体与 `bp` 两项经济链本体已通，缺的只是 rig 强化那笔 `bp` 消费。

---

## 1. 两边对照

| 维度 | 1 代 | 本作 | 判定 |
|---|---|---|---|
| 数据矩阵 | 13 系 × 5 档 = 65 件，`stackGroup/rigTier/rigCategory` | 仅 `fe_rig_t1~5` 一条系，无系列字段 | 🔴 缺 |
| 谐振惩罚 | `S(n)=0.5^(((n-1)/2.22292081)^2)`，组内降序、词条谐振外直加 | 公式在死代码 `rigs.js:16-20`；产品代码零调用 | 🔴 缺 |
| 装配语义 | 同系列可重复装，无互斥；**卸下/替换即销毁** | 同系列可叠但全效；卸下退回库存 | 🔴 语义不同 |
| 加成键 | 13 键，全部有消费方 | 4 键有消费、9 键零匹配、燃料 1 键语义相反 | 🔴 缺 |
| 强化 | `bp`(1+tier) + 星币 6000t + 校准基体×1 + 成功率/焦点/品质三掷骰 + 双词条 | 无入口；`invention.js` 只有 ME/TE | 🔴 缺 |
| 词条落盘 | 两段式 pending → 新实例 `{affixes:[{series,label,bonusKey,quality,value}]}` | 实例表已预留 `affixes`，恒空 | 🟡 底座已就绪 |
| 研究节点 | `inv_rig_theory/rig_catalyst/rig_quality/rig_focus` 等 | `tech.js` 零 `inv_*` | 🔴 缺 |
| 校准基体 | 考古产出 → 制造 + 强化消耗 | 考古产出 → 制造消耗（`equipment.js:58-62`） | 🟢 已通，只缺强化那笔 |
| 发明耗材 | `matrix:analysis_matrix` = 本作 `bp`，ME/TE 每循环 `tier` 份逐值等价 | `invention.js:44,72-77` 已运转 | 🟢 已通，只缺强化那笔 |

---

## 2. 关键口径差异（**必须拍板**）

### D1 · 加成键命名：1 代原名新增 vs 映射本作近似键

13 键在本作的现状：

| 1 代键 | 本作状态 | 本作近似键（不可混用） |
|---|---|---|
| `shieldCapacityPercent` | 零匹配 | `shieldCapacity`（`ships.js:29-55` 舰船本体 + `equipment.js:121` 装备，后者**有产出无消费**） |
| `armorCapacityPercent` | 零匹配 | `armorCapacity`（同上） |
| `structureCapacityPercent` | 零匹配 | `structureCapacity`（同上） |
| `miningEfficiency` | ✅ `settle.js:619` | — |
| `gasEfficiency` | ✅ `settle.js:618` | — |
| `smeltingSpeed` | ✅ `production.js:272,277` | — |
| `miningRichChance` | 零匹配 | `doubleMineralChance`（booster 全局 16 槽） |
| `gasRichChance` | 零匹配 | `doubleGasChance`（同上） |
| `archaeologyScanPercent` | 零匹配 | `archaeologyScan`（**绝对值** 5/8/12/18/25） |
| `archaeologyFuelEfficiency` | ⚠️ 有消费但**语义相反** | 见 D2 |
| `archaeologyInterferenceReduction` | 零匹配 | `archaeologyStabilizer`（反噬减伤，语义接近） |
| `archaeologyCycleReductionPercent` | 零匹配 | `archaeologyCycleReduction`（语义同、无 Percent） |
| `skillXpBonus` | 零匹配 | `xpMult`（NPC 特质 `compileMods` 专用） |

**定案（用户 2026-11-28 纠正）：新增 1 代原名键，与近似键并存，1 代机制一律照搬、不为迁就本作缺口改写。**
理由：本作近似键都有别的产出方（装备平值、booster、NPC 特质），混算会污染既有闭环；新增独立键各自接消费方，未来移植 1 代系统零摩擦。代价是 9 处引擎接线。
⚠️ 我曾提议把「考古干扰缩短」等价改成反噬减伤，用户明确指出这是**擅改 1 代机制**，已撤回。该系按 1 代原式照搬（见 D1 补遗）。

> 注：旧笔记写「8 个新加成键」，逐键复核后实际是 **9 个零匹配**，此处更正。

#### D1 补遗 · 考古干扰缩短：照搬 1 代原式

1 代原式（`systems/archaeology.js:310-317`、`core/tick.js:602-603`、`core/actions.js:1439`）：

```
干扰秒数 = max(3, round(遗址基础周期 × 0.15 × (1 − 减免)))
```
- 触发：**考古失败但舰船未毁**时，`arch.interferenceUntil = now + 干扰秒数×1000`
- 门禁：该时间之前不能开工（`actions.js:1439` 返回 `reason:"interference"`；`tick.js:564` 把进度清 0 并 return）
- 减免来自 rig 的 `archaeologyInterferenceReduction`，封顶 0.90
- 存档：`state.archaeology.interferenceUntil` 必须幂等补 0（`persistence.js:708` 同口径）

本作移植需要：① 初始/`normalize` 加 `interferenceUntil` 字段；② `archaeology.js` 失败分支计算并写入；③ `settle.js` 派遣门禁读取；④ UI 显示剩余秒数。**不改名为反噬减伤**——本作已有的 `archaeologyStabilizer` 保持原语义不动。

### D2 · 燃料效率键语义：**相反**（最高危）

| | 1 代 | 本作 |
|---|---|---|
| 键值 | 节省比例 `0.04 / 0.055 / 0.07 / 0.085 / 0.10` | 乘性系数 `0.92 / 0.86 / 0.80 / 0.74 / 0.68` |
| 算式 | `mult = max(0, shipMult − rigSaving − equipSaving)`（`archaeology.js:562`、`selectors.js:2658`）**加算节省** | `mult *= ship.fuelEfficiency; mult *= rigValue`（`settle.js:343-365`）**乘性系数** |
| 后果 | T5 省 10% | T5 省 32% |

若直接照搬 1 代 65 件数据，新 fuel 系的 `0.04~0.10` 会被当乘子 → 省 **90%~96%**，燃料系统直接崩坏。必须二选一：
- **A（对齐 1 代）**：改 `fuelEfficiencyMult` 为加算节省 `max(0, ship − saving)`，现有 5 条 `fe_rig` 从 0.92~0.68 改为 0.04~0.10。代价：现有机体**被削弱**（T5 省 32% → 10%），但数值本就标着「待标定」。
- **B（保留本作口径）**：保持乘性 `mult *= v`，新增 fuel 系时把 1 代节省值换算成乘子 `1−v`（0.96~0.90），现有 5 条不动。代价：与 1 代数值不同，但语义统一、现有机体不受影响。

**定案（用户 2026-11-28 选 A）：改回 1 代加算节省。** `settle.js` 的 `fuelEfficiencyMult` 改为 `max(0, 船体系数 − 所有节省值)`，现有 5 条 `fe_rig` 从 `0.92/0.86/0.80/0.74/0.68` 改为 `0.04/0.055/0.07/0.085/0.10`（逐值对齐 1 代 T1~T5）。代价：现有机体 T5 省 32% → 10%，用户已知悉并接受。

### D3 · 拆卸即毁是否照搬

1 代 `actions.js:2191,2212,2278`：rig 被替换或卸下即 `destroyRigRefFromFitting`，发 `rig:destroyed`，**不返库存**（教程 `gameplay-help-locales.js:15` 明写）。本作 `unfitEquipment` 一律退回库存。

这是 rig 经济的核心：持续消耗校准基体 + 考古产出。若不照搬，玩家一次做好永久复用，校准基体消费闭环只剩制造那一笔。**建议照搬**，但要在 UI 卸下前弹明确警告（1 代 `i18n:691` 有现成文案：「以下改装件将被永久销毁（不返还）」）。

### D4 · 分期范围

- **A 数据地基**：13 系 × 5 档 = 65 件（新增 60 件）、`stackGroup/rigTier/rigCategory` 字段、新产品模块 `engine/rig-resonance.js`
- **B 谐振接线**：`fittedBonuses` 改走 rig 聚合；9 个零匹配键接消费方（三围容量、伴生富集、扫描、干扰、周期、技能经验）；现有 5 条 `fe_rig` 纳入谐振
- **C 强化与词条**：`bp`+星币+校准基体消费、成功率/焦点/品质三掷骰、两段式 pending、`affixes` 落盘、`inv_rig_*` 研究节点
- **D UI**：发明舱「改造件强化」页签、谐振预览、拆卸警告
- **E 死代码清理**：摘掉 `index.html` 里 `lib/eveidle/systems/rigs.js` 的 script 标签（该文件依赖坏桩、0 调用，不可直接复活）

**建议 A→B→C→D→E 顺序推进，A+B 做完先停一次给你看效果**，因为这两步决定「装上去真的生效」，C/D 是叠加在上面的玩法层。

---

## 3. 谐振算式（1 代原式，逐值复刻）

```
S(n) = 0.5 ^ ( ((n-1) / 2.22292081)^2 )      // n=组内降序排位，n=1 吃满
S(1)=1.000  S(2)≈0.869  S(3)≈0.570  S(4)≈0.283  S(5)≈0.106
```
- 按 `stackGroup` 分组；组内按基础值降序，同值按装配序 `rigSeq` 稳定占位
- 每件有效值 = `基础值 × S(idx)`，按 `bonusKey` 跨组累加
- **词条值在谐振之外直加**（`rigs.js:61-63,73-86`），这是「词条不吃惩罚」的唯一落点
- 同系列可重复装，`canFitRig` 不排重；只受舰船 rig 槽数限制

### 档位元数据（1 代 `equipment.js:222-228`）

| 档 | level | time | xp | 校准基体 | 15% 族值 | 20% 族值 | 10% 族值 |
|---|---|---|---|---|---|---|---|
| I | 1 | 20 | 14 | 1 | 0.05 | 0.08 | 0.04 |
| II | 15 | 40 | 35 | 1 | 0.07 | 0.11 | 0.055 |
| III | 35 | 70 | 60 | 2 | 0.09 | 0.14 | 0.07 |
| IV | 55 | 120 | 110 | 2 | 0.12 | 0.17 | 0.085 |
| V | 80 | 200 | 180 | 3 | 0.15 | 0.20 | 0.10 |

13 系：战斗 3（护盾/装甲/结构容量，15% 族）、工业 5（采矿/采气/冶炼/伴生矿/伴生气，15% 族）、考古 4（扫描/燃料/干扰/速掘，前三 20% 族+燃料 10% 族）、训练 1（技能经验，15% 族）。

---

## 4. 强化经济（C 阶段）

| 项 | 1 代原式 | 本作映射 |
|---|---|---|
| 星币 | `6000 × tier` | 直接沿用 |
| 解析矩阵 | `(1+tier)` 份 | 换成 `bp`（用户已裁定为对应物） |
| 校准基体 | 固定 1 份，`art_i~v_calib` 按档 | 已有产出与消耗桥接，直接沿用 |
| 成功率 | `clamp(0.25 + 0.006×发明 + 0.003×装备工程 − 0.06×(t−1) + 0.02×rig_theory, 0.05, 0.90)` | 需新增 `inv_rig_*` 节点 |
| 焦点 | `clamp(0.40 + 0.005×发明 + 0.02×rig_focus, 0.40, 0.85)` | 同上 |
| 品质 | 普通 0.03 / 优良 0.05 / 卓越 0.08；权重随装备工程等级与 `inv_rig_quality` 漂移 | 同上 |
| 词条上限 | 每件 2 条，满槽覆写 | 沿用 |
| 词条值 | `baseBonus × (DESIGN[q] / 该系 T5 基础值)`——T5 恒出 3/5/8%，低档递减，防套利 | 沿用 |
| 芯片 | 催化芯片 +10% 成功率（成功才扣）、词条芯片必中+卓越+免基体 | 依赖⑤潜能芯片，C 阶段先留接口 |
| 失败 | 只扣资源，目标与已有词条不变 | 沿用 |
| pending | 存 `state.invention.rigEnhance.pending`，玩家选槽 0/1/追加/放弃后才落地新实例 | 沿用（引擎态，非 UI 态） |

---

## 5. 风险与验证

| 风险 | 缓解 |
|---|---|
| 9 个新键接线遗漏 → 装了没效果（项目反复踩：23 条 tbd 词条死在只认 4 乘区的 `compileMods`） | 每个键写一条探针，断言「装 1 件 → 引擎输出变化量 = 谐振后有效值」 |
| 燃料键语义接错 → 省油 90%+ | D2 拍板后先改 `fuelEfficiencyMult` 并单独断言 T5 值 |
| 谐振聚合漏掉词条直加 → 强化白做 | 断言「同系 2 件 + 词条」时词条值不被 `S(2)` 衰减 |
| 拆卸即毁改坏库存账 | 断言卸下后 `equipInstances` 删除、`state.equipment` **不**增加 |
| 新 60 件装备进表影响配方/蓝图/库存遍历 | 只加 `slot:"rig"` 定义，不动 `Resources.ALL`；跑全量探针 |
| 起始舰 `rookie_corvette` 是 `rig:0`（`ships.js:93`） | 新系统对开局不可见，需用有 rig 槽的舰做夹具（`rifter` 起 1 槽、`dawnlight` 2 槽、`sunlance` 3 槽） |

验证策略：A+B 阶段用定向探针（不改产品代码）；C/D 完成后按你的授权跑 23 探针全量 + Chrome 冒烟。**不自行跑测试、不自行 commit/push。**

---

## 6. 拍板结果

| 项 | 结果 |
|---|---|
| **D1 键名** | ✅ 新增 1 代原名 9 键；**1 代机制一律照搬，不改写**（干扰系照搬失败锁站机制，已撤回「等价改成反噬减伤」的提议） |
| **D2 燃料** | ✅ **A：改回 1 代加算节省**；现有 5 条改为 0.04~0.10，接受 T5 省 32%→10% |
| **D3 拆卸** | ✅ 照搬 1 代「拆卸即毁」+ UI 警告 |
| **D4 范围** | ✅ **A+B 先停一次**：13 系 65 件数据 + 谐振模块 + 9 键消费接线，做完停下给看效果；C/D/E 后续再定 |

### A+B 阶段具体交付
1. `data/equipment.js`：新增 13 系 × 5 档 = 65 件（含 `stackGroup/rigTier/rigCategory`）；现有 5 条 `fe_rig` 只改燃料值、归入对应系列或保留为独立系列
2. 新建 `engine/rig-resonance.js`：谐振公式 `S(n)`、按 `stackGroup` 分组降序、词条谐振外直加（词条接口预留）
3. `fittedBonuses` 等聚合入口改走 rig 聚合；9 个新键各自接消费方
4. **干扰系照搬**：`interferenceUntil` 存档字段 + 失败写入 + 派遣门禁 + UI 倒计时
5. 三围容量：`maxHpOf` 接受装配加成，用独立 `*Percent` 键乘在船体系数之后
6. 缓存戳 bump；新增定向探针逐键断言「装 1 件 → 输出变化 = 谐振后有效值」
7. 做完停下报告，**不自行跑全量探针、不 commit/push**

---

**本轮零产品代码改动。** 工作树另有 P1 承伤修复（`combat.js` + `index.html`）未验证、未提交，与本次 rig 方案无关。
