# 深空星疆 · 中小型委托势力 — 美术设定 & Gemini 生图 Prompt 包

> 用途：直接拿给 Gemini（图像生成）跑 6 张中小型委托势力的联络人头像。
> 这批势力都会发布任务（进「委托层」，tier=minor），与三大巨头（苍穹劫团/赤誓教团/银河联盟）共用任务板逻辑，仅 UI 上巨头更显眼。
> 美术风格：与巨头联络人一致 —— 风格化科幻立绘（概念设定稿质感半写实）+ 统一「通讯界面」边框 + 势力主色 key light + 极简背景。
> 命名/IP：联络人代号均为原创，不含 EVE 裸名；文件名键用 ASCII 稳定键（见下）。

---

## 一、设计总览（6 个中小型委托势力）

| 势力 | 内部 id | 主色 | 规模 | 发布任务偏向 | 联络人（职务 / 代号 / 外貌关键词） |
|---|---|---|---|---|---|
| 边陲矿业公会 | `mining_guild` | `#b5793f` 暖褐 | 中型 | 矿石/矿材 重 | 工头 **「凿岩·戈登」**：壮实老矿工，安全帽+矿灯，赭石工装，宽肩，风霜脸与手。 |
| 拾荒者联合体 | `salvage_union` | `#c9772e` 锈橙 | 中型 | 打捞/部件 重 | 首席回收官 **「废铁·玛拉」**：满身工具挂带，独眼罩，锈橙拼凑外套，油污脸颊。 |
| 孤星商社 | `lone_star` | `#d8c07a` 香槟金 | 中型 | 部件/气体/贸易品 | 商队总管 **「金秤·洛」**：精明商人，丝绸领巾+电子账本，香槟金长衫，从容算计表情。 |
| 深空研究院 | `abyssal_inst` | `#9b8fd0` 浅紫 | 中型 | 气体/样本/数据 | 首席研究员 **「静析·伊」**：冷峻学者，白袍+全息平板，浅紫数据光映镜片，一丝不苟。 |
| 悬赏者同盟 | `bounty_league` | `#b02a1f` 深绯 | 小型 | 派遣战斗 重 | 赏金经纪 **「血契·雷」**：干练中介，皮甲+通缉档案，深绯披风，冷静职业凝视。 |
| 拓殖议会 | `settlers` | `#b5c46a` 麦绿 | 小型 | 生物质/补给/部件 | 镇长 **「新禾·安」**：朴实边民领袖，作物色围裙+殖民徽，麦绿便装，诚恳温暖。 |

> 颜色全部避开「4 委托巨头 + 5 野怪」已占色，敌我/大小一眼可分。
> 任务偏向只影响 `questBias` 权重（复用 `factions.js` 的 ore/mineral/component/blueprint/gas + dispatch 模板），不新建任务类型。

---

## 二、美术风格规范（与巨头联络人一致）

- **画风**：风格化科幻立绘，概念设定稿质感，半写实 painterly 渲染但形状清晰可读。
- **构图**：头肩 bust，平视镜头微 3/4 转，单一势力色 key light，纯色暗渐变背景无环境细节。
- **统一框**：做成「全息通讯画面」——细 HUD 线框 + 角落信号标，与巨头 4 张天然成套。
- **比例**：3:4 竖构图（bust 细节足，后续裁圆做头像也可）。
- **分辨率**：取 Gemini 原生最大，再压到长边 1024；PNG→WebP(q≈84)。
- **一致性铁律**：共享基底 prompt + 每势力一段 accent + 共享负向 + 统一比例/打光逻辑。

---

## 三、Gemini Prompt 包（复制即用）

### ① 共享基底 prompt（6 张都先接这段）

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral confident expression, soft studio lighting with one colored key light, plain dark gradient background with no environment, composed as a holographic communications feed with a thin HUD line frame and subtle corner signal ticks, high detail on face and outfit, game-key-art quality, polished, cinematic.
```

### ② 每势力 accent（拼在基底后面，6 选 1）

```
[mining_guild / 边陲矿业公会]
Warm earthy brown key light (#b5793f). Burly veteran miner foreman, worn hard hat with a mounted lamp, ochre work uniform, broad shoulders, weathered face and hands, pragmatic blue-collar demeanor, faint dust on jacket.

[salvage_union / 拾荒者联合体]
Rust-orange key light (#c9772e). Chief salvage officer, tool-laden utility belt and harness, eyepatch, patched rust-orange salvage coat made of scavenged panels, scrappy resourceful look, grease-smudged cheek.

[lone_star / 孤星商社]
Champagne-gold key light (#d8c07a). Sharp trading company quartermaster, silk cravat, electronic ledger tablet in hand, long champagne-gold robe, clever merchant expression, polished and composed.

[abyssal_inst / 深空研究院]
Pale violet key light (#9b8fd0). Stern chief researcher, white lab coat, holographic data tablet, calm detached scholarly expression, faint violet data-glow on glasses, immaculate and precise.

[bounty_league / 悬赏者同盟]
Deep crimson key light (#b02a1f). Bounty broker, lean practical intermediary, leather jerkin, stack of wanted posters, deep-crimson travel cloak, cool professional stare, no-nonsense attitude.

[settlers / 拓殖议会]
Wheat-green key light (#b5c46a). Frontier town councilor, plain agrarian leader, crop-colored apron over simple clothes, colony insignia pin, warm earnest expression, humble frontier practicality.
```

### ③ 共享负向 prompt（6 张都用）

```
extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```

### ④ 拼接方式

每生成一张 = **① 基底 + ② 对应势力 accent + ③ 负向**（用英文逗号或换行连起来即可，Gemini 接受整段）。
例（边陲矿业公会）：
```
<① 基底 prompt>
<② [mining_guild] accent>
<③ 负向 prompt>
```

### ⑤ 输出 & 落盘

- 比例：**3:4**；分辨率取原生最大后再压到长边 **1024**。
- 文件名（ASCII 稳定键，与巨头同目录 `game/assets/portraits/factions/`）：
  - `nsk_fac_mining_guild_contact.webp`
  - `nsk_fac_salvage_union_contact.webp`
  - `nsk_fac_lone_star_contact.webp`
  - `nsk_fac_abyssal_inst_contact.webp`
  - `nsk_fac_bounty_league_contact.webp`
  - `nsk_fac_settlers_contact.webp`
- PNG → WebP（本机无 ffmpeg/magick，用已建好的 Pillow venv）：
  ```
  "C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe" -c "
  from PIL import Image; import os
  for n in ['mining_guild','salvage_union','lone_star','abyssal_inst','bounty_league','settlers']:
      im=Image.open(n+'.png').convert('RGB'); im.save('nsk_fac_'+n+'_contact.webp','WEBP',quality=84,method=6)
  "
  ```
  （或 ffmpeg：`ffmpeg -i in.png -quality 84 out.webp`；或 ImageMagick：`magick in.png -quality 84 out.webp`。）

---

## 四、使用步骤

1. 把 ① 基底 prompt 复制到 Gemini 图像生成。
2. 追加 ② 里对应势力的 accent。
3. 追加 ③ 负向 prompt。
4. 设比例 3:4，生成。
5. 导出 PNG → 按 ⑤ 转 WebP 并命名。
6. 6 张齐了后，回来接 `factions.js` 的 minor 势力数据（`tier:"minor"` + `questBias` 权重），并给 UI 接图。
