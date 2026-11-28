"""生成《深空星疆·科技树搬运确认清单》工作簿。"""
try:
    import openpyxl
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "openpyxl>=3.1.0"])
    import openpyxl

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule


def xl_color(css_hex: str) -> str:
    value = css_hex.removeprefix("#").upper()
    if len(value) != 6:
        raise ValueError(f"Expected #RRGGBB, got: {css_hex}")
    return "FF" + value


XL_HEAD = xl_color("#4472C4")
XL_HEAD_TXT = xl_color("#FFFFFF")
XL_TITLE = xl_color("#2F5597")
XL_INPUT = xl_color("#D9E2F3")
XL_LIGHT = xl_color("#F2F6FC")
XL_BORDER = xl_color("#BFBFBF")
XL_GREEN_BG = xl_color("#C6EFCE")
XL_GREEN_TXT = xl_color("#006100")
XL_RED_BG = xl_color("#FFC7CE")
XL_RED_TXT = xl_color("#9C0006")
XL_YELLOW_BG = xl_color("#FFEB9C")
XL_YELLOW_TXT = xl_color("#9C6500")
XL_GREY_TXT = xl_color("#595959")

THIN = Side(style="thin", color=XL_BORDER)
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
F_TITLE = Font(name="微软雅黑", size=15, bold=True, color=XL_HEAD_TXT)
F_HEAD = Font(name="微软雅黑", size=10, bold=True, color=XL_HEAD_TXT)
F_BODY = Font(name="微软雅黑", size=10, color=xl_color("#1A1A1A"))
F_NOTE = Font(name="微软雅黑", size=10, color=XL_GREY_TXT)
FILL_HEAD = PatternFill("solid", fgColor=XL_HEAD)
FILL_TITLE = PatternFill("solid", fgColor=XL_TITLE)
FILL_INPUT = PatternFill("solid", fgColor=XL_INPUT)
FILL_LIGHT = PatternFill("solid", fgColor=XL_LIGHT)
AL_HEAD = Alignment(horizontal="center", vertical="center", wrap_text=True)
AL_BODY = Alignment(horizontal="left", vertical="top", wrap_text=True)
AL_CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)

OUTPUT = r"D:\深空星疆：商业与战争\深空星疆·科技树搬运确认清单.xlsx"
TITLE = "深空星疆·科技树搬运确认清单"

# ---------------------------------------------------------------- 逐项确认
# 列：分组 / 项目 / 1代做法 / 本作现状 / 建议 / 优先级 / 理由 / 备注
rows = [
    ("骨架机制", "单研究槽", "一次只研究一个节点", "已有单线队列", "保持", "P0", "本作已同构，无需改动", ""),
    ("骨架机制", "取消保留进度", "取消后保留已投入比例", "已有，按秒比例保留", "保持", "P0", "行为一致，旧档兼容", ""),
    ("骨架机制", "pendingQueue 批量入队", "可一次排多级，产生 queued 状态", "无排队，只能逐级点", "搬", "P0", "5 级节点不排队要点 5 次；需改 state.tech.queue + 入队即扣星币 + UI", ""),
    ("骨架机制", "投影前置", "buildProjectedResearchLevels：队列中的等级算进前置", "只看已完成等级", "搬", "P0", "否则排队时 UI 会误报「前置未满足」", ""),
    ("骨架机制", "queued / branch-locked 状态", "6 种节点状态", "4 种", "搬", "P1", "UI 需加蓝色排队与灰斜纹分支锁两色", ""),
    ("骨架机制", "24h 离线封顶", "研究时长受离线结算封顶", "settle 已统一封顶", "保持", "P0", "不重复实现", ""),
    ("骨架机制", "researchHourBank 工时银行 + 50% 抵扣", "成就产工时，单步最多抵 50%", "无成就 / 工时体系", "不搬", "P0", "凭空引入新货币会破坏本作经济；本作只保留星币门槛 + 真实时间", ""),
    ("骨架机制", "beginResearchStep 私有原语", "结算循环内启动下一步走私有原语，防递归", "无", "搬", "P1", "纯实现细节，防止队列推进时递归调用结算", ""),
    ("骨架机制", "contentPack 分支门控", "本体等级 / 建筑 / DLC 门槛", "泰坦已有 requiresTech", "搬思路", "P1", "沿用现有门禁即可，不照搬 DLC 逻辑", ""),
    ("骨架机制", "RESEARCH_BONUS_CONSUMERS 注册表", "bonus.group → 消费点双向集合审计", "6 个乘区手接，无注册表", "搬", "P0", "防科技点死代码；6 个乘区已逐一确认有真实消费点", ""),
    ("骨架机制", "时长公式派生", "UNIT × WEIGHTS[lv-1] × RANK_MULT[cat]", "sec 手填", "搬", "P0", "本作 26 级合计约 57 小时（2.4 天）毕业，必须换曲线", ""),
    ("骨架机制", "5 级数值节点", "数值节点 maxLevel 5", "1~3 级", "搬", "P0", "配合 5 级曲线；现有 16 节点 id / maxLevel 不改，旧档等级继续有效", ""),
    ("骨架机制", "每级 +1.2% 小数值", "小步递增，5 级合计约 6%", "每级 +8%~10%", "搬", "P0", "降低单级收益，把成长摊到 5 级长线", ""),
    ("结构布局", "era 0~4 五时代分列", "5 列按时代递进", "4 列按 cat（战斗/工业/后勤/泰坦）", "不搬", "P0", "改坐标/配色/列头，泰坦列无处安放；时代感由前置链 + 等级徽章等价表达", "对应设计稿方案 B"),
    ("结构布局", "保留 4 列 cat 分列", "—", "colOf() 已分列", "保持", "P0", "UI 零改动，降低实装风险", "对应设计稿方案 A（推荐）"),
    ("结构布局", "底部协议带", "协议节点独立显示", "无", "搬", "P0", "era 4 等价物，横跨三列不占主树列", ""),
    ("结构布局", "泰坦列独立分支", "contentPack titan，不计入主树权重", "8 节点独立", "保持", "P1", "结构与权重规则均已符合", ""),
    ("结构布局", "5 级 pip", "按等级画 pip", "已有 1~3 级 pip", "搬", "P1", "把现有 pip 逻辑扩到 5 即可", ""),
    ("结构布局", "连线三态", "met / projected / unmet 三色", "仅 met / unmet 两态", "搬", "P1", "projected 表示前置在队列排队中", ""),
    ("结构布局", "排队区 UI", "顶部显示待研究项", "无", "搬", "P1", "与 pendingQueue 配套，需显示 5 个待研究项 + 取消按钮", ""),
    ("结构布局", "UI 坐标系 / 列宽不改", "RT_LAYOUT 常量", "现有布局", "保持", "P1", "不重写坐标，除非拍板方案 B", ""),
    ("基础层 foundation", "syseng 系统工程", "全采集效率 +2%", "无采集科技乘区", "搬", "P0", "需新建 miningYieldMult / gasYieldMult 访问器并接 settle 采集管线", ""),
    ("基础层 foundation", "matsci 材料科学", "全制造效率 +2%", "已有 manuSpeedFactor", "搬", "P0", "并入现有乘区的基础项", ""),
    ("基础层 foundation", "dataan 数据分析", "全武器伤害 +2%", "无该乘区", "搬", "P0", "新建 weaponDamageMult 接 combat 伤害乘区", ""),
    ("基础层 foundation", "autocon 自动控制", "考古效率 +2%", "无该乘区", "搬", "P0", "新建 archSpeedMult 接 archaeology 周期", ""),
    ("工业 industry", "mine 采矿理论", "采矿 +1.2%/级", "无", "搬", "P1", "与 syseng 同乘区分级叠加", ""),
    ("工业 industry", "gas 气云动力学", "采气 +1.2%/级", "无", "搬", "P1", "同上", ""),
    ("工业 industry", "smelt 冶炼理论", "冶炼产出 +1.2%/级", "已有 smelt_1（+8%/级）", "合并", "P1", "id 保留旧档，bonus 并入新节点，不重复开节点", ""),
    ("工业 industry", "equipeng 装备工程", "装备制造耗时 -1.2%/级", "已有 manu_1", "合并", "P1", "同上", ""),
    ("工业 industry", "boostereng 增强剂工程", "增强剂耗时 -1.2%/级", "有 boosterQueue", "搬", "P1", "建议并入 prod_all 共享乘区", ""),
    ("工业 industry", "shipcomp 舰船组件工程", "部件耗时 -1.2%/级", "有 component 队列", "搬", "P1", "建议并入 prod_all", ""),
    ("工业 industry", "shipasm 舰船装配工程", "总装耗时 -1.2%/级", "有 buildQueue / moduleQueue", "搬", "P1", "建议并入 prod_all", ""),
    ("工业 industry", "reclaim 拆解回收", "回收率 +1%/级", "有 dismantlePreview", "搬", "P1", "可接现有回收率聚合点", ""),
    ("工业 industry", "工业 8 节点细分", "8 个独立 bonus group", "拟做 5 级长线", "不搬", "P1", "8×5=40 级会把树撑爆；建议合并成 prod_all / mining_all 等 3 个粗分节点", "P1 决策点"),
    ("探索 exploration", "arch 遗迹分析效率", "考古周期 -1.2%/级", "无", "搬", "P0", "与 autocon 共享 archSpeedMult", ""),
    ("探索 exploration", "signal 信号解析", "考古成功率 +0.6pp/级", "有成功率管线", "搬", "P1", "可接 archaeology 成功率处", ""),
    ("探索 exploration", "dataarch 数据归档", "考古经验 +1.2%/级", "grantBatchXp archaeology", "搬", "P1", "前置乘区可接", ""),
    ("探索 exploration", "scanopt 扫描优化", "—", "有 scanStrength", "新增", "P1", "本作新增节点，补强考古线，扫描强度 +1.5%/级", ""),
    ("探索 exploration", "deeparch 深度考古", "与 arch 同乘区", "无", "不搬", "P1", "与 arch 重复乘区，无独立消费点", ""),
    ("探索 exploration", "backlash 反噬控制", "降低反噬", "无反噬系统", "不搬", "P0", "本作无对应系统，不造空节点", ""),
    ("探索 exploration", "probe 探针学", "探针机制", "无探针", "不搬", "P0", "本作无对应系统", ""),
    ("探索 exploration", "autosell / autoconv 文物自动兑换", "文物自动出售 / 兑换", "无自动交易", "不搬", "P0", "先有系统再谈节点", ""),
    ("战斗 combat", "combat 作战理论", "战斗经验 +1.2%/级", "grantBatchXp combat 系", "搬", "P0", "可接", ""),
    ("战斗 combat", "firectrl 火控预测", "全武器伤害 +0.6%/级", "与 dataan 共享乘区", "搬", "P0", "汇总到 weaponDamageMult", ""),
    ("战斗 combat", "defense 防御工程", "三层生命 +0.6%/级", "combat 的 hp 汇总处", "搬", "P0", "可接", ""),
    ("战斗 combat", "repair 战场维修理论", "维修量 +1.2%/级", "已有 armorRepair / structureRepair 乘区", "搬", "P1", "可接", ""),
    ("战斗 combat", "tactical 综合战术模型", "命中 +0.6%/级", "已有 combat_aim 命中通道", "合并", "P1", "并入 combat_aim，旧档等级映射", ""),
    ("战斗 combat", "weapons 武器系统学（三系合并）", "合并 laser / missile / projectile", "无「专精系」概念", "不搬", "P1", "待定：若后续做专精系需另开设计稿", ""),
    ("战斗 combat", "laser / missile / projectile 三系专精", "每系伤害 +1.2%/级", "伤害由装配件驱动", "不搬", "P0", "再加科技乘区会稀释装配意义", "P1 决策点"),
    ("战斗 combat", "shield / armor / structure 属性节点", "各属性 +1.2%/级", "由船体与装配驱动", "不搬", "P0", "同上；属性成长交给装配与船体", ""),
    ("后勤 logistics", "fuellog 维护燃料管理", "燃料消耗 -1.2%/级", "已有 fuel_1", "合并", "P1", "id 保留，bonus 并入", ""),
    ("后勤 logistics", "englog 工程统筹", "全队列耗时 -1.2%/级", "与 manu_1 重叠", "合并", "P1", "并入 prod_all / manu_1", ""),
    ("后勤 logistics", "autolog 自动线调度", "派遣资源产出 +1.2%/级", "有物流补偿池", "搬", "P1", "接 logistics 补偿池", ""),
    ("后勤 logistics", "hop_1 跃迁优化", "—", "已有", "保持", "P1", "不改 id 与数值", ""),
    ("后勤 logistics", "planfin / planind 行星财政 / 工业", "行星系统科技", "无行星系统", "不搬", "P0", "本作无对应系统，用 autolog + hop_1 替代", ""),
    ("协议 protocol", "grand_logistics 全域物流协议", "多前置满级的毕业奖励", "无", "搬", "P1", "前置 fuellog@5 + hop_1@3 + autolog@5；燃料 -20%、跳数惩罚 -3pp（提议值）", ""),
    ("协议 protocol", "grand_industry 全域工业协议", "同上", "无", "搬", "P1", "前置工业 3 节点各 @5；队列 -15%、冶炼 +15%（提议值）", ""),
    ("协议 protocol", "grand_tactics 全域战术协议", "同上", "无", "搬", "P1", "前置 combat@5 + firectrl@5 + defense@5；命中 +5、伤害 +5%（提议值）", ""),
    ("协议 protocol", "自动出售 / 自动强化类协议", "1 代便利协议", "无对应系统", "不搬", "P1", "系统不存在，不造空节点", ""),
    ("协议 protocol", "协议数量 6 → 3", "1 代 6 个", "拟 3 个", "搬", "P1", "3 个够用，后续可加", ""),
    ("分支内容", "legion 军团分支 6 节点", "NPC 军团薪酬 / 后勤", "无 NPC 军团", "不搬", "P0", "本作编制是小队，不是军团", ""),
    ("分支内容", "frontier 星图 / 虫洞 25 节点", "星图、虫洞、泰坦", "无虫洞", "不搬", "P0", "本作无虫洞系统", ""),
    ("分支内容", "invention 发明 12 节点", "蓝图 ME / TE 研究", "本作发明仅占位配方 inv_bp", "不搬", "P1", "发明系统未成型，等实装后再议", ""),
    ("分支内容", "泰坦列 8 节点保持现状", "contentPack titan", "8 节点", "保持", "P1", "不改数值，继续不计入主树权重", ""),
    ("全局决策", "分列方案", "era 五时代", "4 列 cat", "不搬（选 A）", "P0", "保留 4 列 + 底部协议带，UI 零重写", "另一个选项是方案 B"),
    ("全局决策", "节点规模", "40 节点", "16 节点", "搬裁剪版", "P0", "裁剪到约 25 节点 / 5 级，按本作已有系统筛", ""),
    ("全局决策", "时长档位", "主树约 90 天", "2.4 天", "搬 30 天档", "P0", "21 / 30 / 60 天三档中选 30（推荐）；数值待试玩标定", ""),
    ("全局决策", "旧档兼容", "—", "16 节点 id 固定", "保持", "P0", "不改名、不改 maxLevel；同名节点按等级映射合并", ""),
]

HEADERS = ["序号", "分组", "项目", "1 代做法", "本作现状", "建议", "优先级", "理由 / 依据", "你的确认", "备注"]
DATA_START, DATA_END = 3, 2 + len(rows)

wb = Workbook()
wb.properties.title = TITLE
ws = wb.active
ws.title = "逐项确认"

ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(HEADERS))
ws.cell(1, 1, TITLE + "（逐项打勾，改动只按你确认的项实施）")
ws.cell(1, 1).font = F_TITLE
ws.cell(1, 1).fill = FILL_TITLE
ws.cell(1, 1).alignment = AL_CENTER
ws.row_dimensions[1].height = 30

for col, name in enumerate(HEADERS, 1):
    c = ws.cell(2, col, name)
    c.font, c.fill, c.alignment, c.border = F_HEAD, FILL_HEAD, AL_HEAD, BORDER
ws.row_dimensions[2].height = 28

for i, row in enumerate(rows):
    r = DATA_START + i
    vals = [i + 1] + list(row)
    for col, v in enumerate(vals, 1):
        c = ws.cell(r, col, v)
        c.font = F_BODY
        c.border = BORDER
        c.alignment = AL_CENTER if col in (1, 6, 7, 9) else AL_BODY
        if col == 9:
            c.fill = FILL_INPUT
        elif col in (6, 7):
            c.fill = FILL_LIGHT

for col, width in zip("ABCDEFGHIJ", [6, 19, 32, 40, 38, 14, 9, 56, 14, 22]):
    ws.column_dimensions[col].width = width
ws.freeze_panes = "C3"
ws.auto_filter.ref = f"A2:J{DATA_END}"

dv = DataValidation(type="list", formula1='"同意,改成搬,改成不搬,待议"', allow_blank=True)
dv.error = "请从下拉里选一项"
dv.errorTitle = "确认列只能选这四个值"
dv.showErrorMessage = True
ws.add_data_validation(dv)
dv.add(f"I{DATA_START}:I{DATA_END}")

for value, bg, fg in [
    ("同意", XL_GREEN_BG, XL_GREEN_TXT),
    ("改成搬", XL_YELLOW_BG, XL_YELLOW_TXT),
    ("改成不搬", XL_YELLOW_BG, XL_YELLOW_TXT),
    ("待议", XL_RED_BG, XL_RED_TXT),
]:
    ws.conditional_formatting.add(
        f"I{DATA_START}:I{DATA_END}",
        FormulaRule(formula=[f'$I{DATA_START}="{value}"'],
                    fill=PatternFill("solid", fgColor=bg), font=Font(color=fg, bold=True)),
    )
for value, bg, fg in [
    ("不搬", XL_RED_BG, XL_RED_TXT),
    ("搬", XL_GREEN_BG, XL_GREEN_TXT),
]:
    ws.conditional_formatting.add(
        f"F{DATA_START}:F{DATA_END}",
        FormulaRule(formula=[f'$F{DATA_START}="{value}"'],
                    fill=PatternFill("solid", fgColor=bg), font=Font(color=fg, bold=True)),
    )

# ---------------------------------------------------------------- 四项拍板
ws2 = wb.create_sheet("四项拍板")
H2 = ["编号", "决策点", "可选项", "推荐", "影响范围", "你的决定", "备注"]
decisions = [
    (1, "P0 分列方案", "A 保留 4 列 + 底部协议带 / B era 五时代", "A", "UI 坐标、列头、泰坦列位置", "", "B 要重写坐标系"),
    (2, "P0 节点规模", "裁剪版约 25 节点 / 照搬 40 节点", "裁剪版", "节点清单、时长总权重、实施工作量", "", "裁剪版只留本作有系统的节点"),
    (3, "P0 时长档位", "21 天 / 30 天 / 60 天", "30 天", "UNIT≈895s，5 级数值节点约 20h/级", "", "提议值，待试玩标定"),
    (4, "P0 批量队列", "搬 pendingQueue / 不搬", "搬", "state.tech.queue、canStart、UI 排队区", "", "不搬则 5 级节点要点 5 次"),
    (5, "P1 工业细分", "8 节点细分 / 合并 3 节点粗分", "合并 3 节点", "工业列节点数与总级数", "", "避免 8×5=40 级撑爆树"),
    (6, "P1 战斗三系专精", "做 laser/missile/projectile / 不做", "不做", "战斗列节点数、装配价值", "", "若做需另开设计稿"),
    (7, "P1 协议带数量", "3 个 / 6 个", "3 个", "协议带宽度、前置门槛设计", "", "1 代 6 个含大量便利协议"),
]
D2_START, D2_END = 3, 2 + len(decisions)
ws2.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(H2))
ws2.cell(1, 1, "全局拍板（P0 不定就开不了工；P1 可先按推荐走）")
ws2.cell(1, 1).font, ws2.cell(1, 1).fill, ws2.cell(1, 1).alignment = F_TITLE, FILL_TITLE, AL_CENTER
ws2.row_dimensions[1].height = 30
for col, name in enumerate(H2, 1):
    c = ws2.cell(2, col, name)
    c.font, c.fill, c.alignment, c.border = F_HEAD, FILL_HEAD, AL_HEAD, BORDER
ws2.row_dimensions[2].height = 28
for i, row in enumerate(decisions):
    r = D2_START + i
    for col, v in enumerate(row, 1):
        c = ws2.cell(r, col, v)
        c.font, c.border = F_BODY, BORDER
        c.alignment = AL_CENTER if col in (1, 4, 6) else AL_BODY
        if col == 6:
            c.fill = FILL_INPUT
        elif col == 4:
            c.fill = FILL_LIGHT
for col, width in zip("ABCDEFG", [8, 20, 42, 16, 40, 18, 30]):
    ws2.column_dimensions[col].width = width
ws2.freeze_panes = "C3"
ws2.auto_filter.ref = f"A2:G{D2_END}"
dv2 = DataValidation(type="list", formula1='"同意推荐,按推荐外选项,待议"', allow_blank=True)
dv2.showErrorMessage = True
ws2.add_data_validation(dv2)
dv2.add(f"F{D2_START}:F{D2_END}")
for value, bg, fg in [("同意推荐", XL_GREEN_BG, XL_GREEN_TXT), ("待议", XL_RED_BG, XL_RED_TXT)]:
    ws2.conditional_formatting.add(
        f"F{D2_START}:F{D2_END}",
        FormulaRule(formula=[f'$F{D2_START}="{value}"'],
                    fill=PatternFill("solid", fgColor=bg), font=Font(color=fg, bold=True)),
    )

# ---------------------------------------------------------------- 填写说明 + 统计
ws3 = wb.create_sheet("填写说明")
ws3.merge_cells("A1:B1")
ws3.cell(1, 1, "填写说明与确认进度")
ws3.cell(1, 1).font, ws3.cell(1, 1).fill, ws3.cell(1, 1).alignment = F_TITLE, FILL_TITLE, AL_CENTER
ws3.row_dimensions[1].height = 30
ws3.cell(3, 1, "「你的确认」选项")
ws3.cell(3, 2, "含义")
for r in (3, 9):
    for col in (1, 2):
        c = ws3.cell(r, col)
        c.font, c.fill, c.alignment, c.border = F_HEAD, FILL_HEAD, AL_HEAD, BORDER
legend = [
    ("同意", "按「建议」列执行"),
    ("改成搬", "推翻建议，这项要搬进来"),
    ("改成不搬", "推翻建议，这项不要搬"),
    ("待议", "先放着，等你进一步确认"),
]
for i, (k, v) in enumerate(legend):
    r = 4 + i
    ws3.cell(r, 1, k).font = F_BODY
    ws3.cell(r, 2, v).font = F_BODY
    for col in (1, 2):
        ws3.cell(r, col).border = BORDER
        ws3.cell(r, col).alignment = AL_BODY
ws3.cell(9, 1, "统计项")
ws3.cell(9, 2, "数量")
stats = [
    ("逐项确认总数", f"=COUNTA('逐项确认'!$C${DATA_START}:$C${DATA_END})"),
    ("同意", f'=COUNTIF(\'逐项确认\'!$I${DATA_START}:$I${DATA_END},"同意")'),
    ("改成搬", f'=COUNTIF(\'逐项确认\'!$I${DATA_START}:$I${DATA_END},"改成搬")'),
    ("改成不搬", f'=COUNTIF(\'逐项确认\'!$I${DATA_START}:$I${DATA_END},"改成不搬")'),
    ("待议", f'=COUNTIF(\'逐项确认\'!$I${DATA_START}:$I${DATA_END},"待议")'),
    ("尚未填写", "=B10-SUM(B11:B14)"),
    ("全局拍板已填", f"=COUNTA('四项拍板'!$F${D2_START}:$F${D2_END})"),
    ("全局拍板未填", f"={len(decisions)}-B16"),
]
for i, (k, formula) in enumerate(stats):
    r = 10 + i
    c1 = ws3.cell(r, 1, k)
    c2 = ws3.cell(r, 2, formula)
    c1.font = F_BODY if r < 15 else F_HEAD
    c2.font = F_BODY if r < 15 else F_HEAD
    c2.alignment = AL_CENTER
    for col in (1, 2):
        ws3.cell(r, col).border = BORDER
        if r >= 15:
            ws3.cell(r, col).fill = FILL_LIGHT
ws3.column_dimensions["A"].width = 24
ws3.column_dimensions["B"].width = 54

wb.save(OUTPUT)
print("saved:", OUTPUT)
print("rows:", len(rows), "decisions:", len(decisions), "data rows:", DATA_START, "-", DATA_END)
