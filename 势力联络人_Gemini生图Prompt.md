# 深空星疆 · 势力联络人 — 美术设定 & Gemini 生图 Prompt 包

> 用途：直接拿给 Gemini（图像生成）跑 4 张势力联络人头像。
> 美术风格：风格化科幻立绘（概念设定稿质感半写实）+ 统一「通讯界面」边框 + 势力主色 key light + 极简背景。
> 命名/IP：联络人代号均为原创，不含 EVE 裸名；文件名键沿用 `factions.js` 的 ASCII 稳定键（angel/blood/sansha/alliance）。

---

## 一、设计总览（4 个联络人）

| 势力 | 内部 id | 主色 | 定位 | 联络人（职务 / 代号 / 外貌关键词） |
|---|---|---|---|---|
| 苍穹劫团 | `angel` | `#5ad1a0` 青绿 | 星区边缘私掠者，机会主义不邪恶，乐见你壮大好分一杯羹。要矿石/矿材。 | 前线军需谈判官 **「隼眼·凯」**：油滑但讲信用的大哥型交易老手。中年、利落短发、补丁飞行夹克别劫团徽、一只轻量机械义眼、青绿舱内 key light、松弛自信笑。 |
| 赤誓教团 | `blood` | `#e879a8` 玫红 | 军事化狂信守备，纪律严酷唯武力。只信肯交付军备(部件)+矿材的佣兵。 | 宣令官 **「赤誓·薇拉」**：肃穆的武僧/修女型指挥官。束发或剃额、战装外罩仪式披肩、胸前赤誓圣徽、玫红与暗银、庄重炽热眼神、肃立。 |
| 静默集群 | `sansha` | `#e8b45a` 琥珀金 | 高度同化机械教团，半人半机后人类，用星币与资源衡量忠诚。冷静疏离算计。 | 同步枢机 **「欧米伽」**：半机械管理员，说话少字字算账。中性、面部部分装甲化、一只光学镜头眼、皮下幽微电路纹、琥珀金 HUD 微光、表情极克制。 |
| 银河联盟 | `alliance` | `#4d8fe0` 钢蓝 | 玩家军团注册母国/中央政权，中立枢纽+注册福利+监察合法性，体制内正统权威。 | 联邦监察专员 **「晨星·赫拉」**：整洁专业、冷静公正的联邦专员。中青年、利落发型、制式深蓝舰队制服配星徽肩章与细金绦、姿态端正、背景规整蓝色指挥中心光带。 |

> 注：银河联盟目前不在 `factions.js` 的 `FACTIONS`（= 不派任务），本 md 仅作视觉/flavor 联络人。是否同时成为第 4 个任务派发势力是独立决策，先跑美术。

---

## 二、美术风格规范（定稿 · 方案 A）

- **画风**：风格化科幻立绘，概念设定稿质感，半写实 painterly 渲染但形状清晰可读（不像纯照片小图发糊、也不像卡通轻飘）。
- **构图**：头肩 bust，平视镜头微 3/4 转，单一势力色 key light，纯色暗渐变背景无环境细节。
- **统一框**：做成「全息通讯画面」——细 HUD 线框 + 角落信号标，让 4 张天然成套。
- **比例**：3:4 竖构图（bust 细节足，后续裁圆做头像也可）。
- **分辨率**：取 Gemini 原生最大，再压到长边 1024；PNG→WebP(q≈84)。
- **一致性铁律**：共享基底 prompt + 每势力一段 accent + 共享负向 + 统一比例/打光逻辑。

---

## 三、Gemini Prompt 包（复制即用）

### ① 共享基底 prompt（4 张都先接这段）

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral confident expression, soft studio lighting with one colored key light, plain dark gradient background with no environment, composed as a holographic communications feed with a thin HUD line frame and subtle corner signal ticks, high detail on face and outfit, game-key-art quality, polished, cinematic.
```

### ② 每势力 accent（拼在基底后面，4 选 1）

```
[angel / 苍穹劫团]
Teal-cyan key light (#5ad1a0). Weathered freebooter look: patched leather flight jacket with a small faction insignia pin, one subtle cybernetic eye implant, mid-age charismatic veteran quartermaster, relaxed confident smirk, salvaged-but-stylish gear, roguish charm.

[blood / 赤誓教团]
Rose-pink and dark-silver key light (#e879a8). Austere ecclesiastical-military vestments with ceremonial pauldrons, crimson-covenant holy emblem on chest, stern monk-warrior commander, tied-back hair, solemn devout expression, upright posture, disciplined.

[sansha / 静默集群]
Amber-gold key light (#e8b45a). Heavily cybernetically augmented post-human: partial facial armor plating, one eye an optical lens, faint glowing circuit lines under skin, neutral androgynous, extremely restrained calm expression, uncanny silent stillness.

[alliance / 银河联盟]
Azure-blue key light (#4d8fe0). Crisp standardized federation fleet uniform with star insignia shoulder marks and thin gold trim, polished federal commissioner, neat hair, upright professional posture, calm impartial authoritative expression, tidy blue command-center light bands behind.
```

### ③ 共享负向 prompt（4 张都用）

```
extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```

### ④ 拼接方式

每生成一张 = **① 基底 + ② 对应势力 accent + ③ 负向**（用英文逗号或换行连起来即可，Gemini 接受整段）。
例（苍穹劫团）：
```
<① 基底 prompt>
<② [angel] accent>
<③ 负向 prompt>
```

### ⑤ 输出 & 落盘

- 比例：**3:4**；分辨率取原生最大后再压到长边 **1024**。
- 文件名（沿 `factions.js` 的 ASCII 稳定键）：
  - `nsk_fac_angel_contact.webp`
  - `nsk_fac_blood_contact.webp`
  - `nsk_fac_sansha_contact.webp`
  - `nsk_fac_alliance_contact.webp`
- PNG → WebP（ffmpeg 一行，quality 0–100）：
  ```
  ffmpeg -i in.png -quality 84 out.webp
  ```
  （或用 ImageMagick：`magick in.png -quality 84 out.webp`；或 sharp 脚本批量。）

---

## 四、使用步骤

1. 把 ① 基底 prompt 复制到 Gemini 图像生成。
2. 追加 ② 里对应势力的 accent。
3. 追加 ③ 负向 prompt。
4. 设比例 3:4，生成。
5. 导出 PNG → 按 ⑤ 转 WebP 并命名。
6. 4 张齐了后，回来接 `factions.js` 的 `contact` 字段 + UI 调用。
