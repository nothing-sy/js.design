# 动态字段判定与落码

目标：设计稿还原页**不是纯静态 HTML**。可能来自接口的内容要变量化，方便后续对接。

## 判定优先级

1. **用户有额外提示**（「这些数字接接口」「标题写死」「只要静态预览」等）→ **以提示为准**，可覆盖下列粗判。
2. **用户无提示** → **不强制追问**；根据设计稿节点文案/结构 + 目标项目邻近页常见形态，自行做**粗略**动/静划分，然后直接落码。

写 DOM 前在心里（或对用户简述）完成一份「数据盘点」：动态字段列表 + 静态装饰列表。

## 粗判：倾向动态

无用户提示时，下列通常视为接口/状态数据：

| 信号 | 示例 |
|------|------|
| 金额、带符号数值、百分比、单位混排 | `+3.52`、`万元`、`87.5%` |
| 结构重复的组 | 多张同构概览卡、列表行、表格行、tag 组 |
| 图表与序列 | 曲线、柱状/折线、legend 对应 series |
| 交互筛选与状态 | 日期范围、Tab、状态徽章、分页、排序 |
| 页眉统计文案 | 「合计 xxx」「平均 xxx」类可变数值 |

落码：进入状态变量 / mock 模块 / 配置工厂参数；模板用插值与列表渲染；图表配置接收序列参数。

## 粗判：倾向静态

| 信号 | 处理 |
|------|------|
| 装饰背景、插画、复杂图标位图 | 切图 + 固定引用 / CSS `background-image` |
| 固定板块标题（无业务变化） | 可写死文案；若邻近页标题也配置化则跟随 |
| 纯布局、分割线、固定提示语 | 默认可静态；用户提示要配置化再抽变量 |
| 用户明确「纯展示 / 不要接数」 | 全部可静态，但仍建议列表结构用数组便于改 |

## 落码示意（按目标栈改写）

以下为常见 Vue 形态示意；React 等请换成目标项目等价写法（hooks / store / 邻近页模式）。

### mock / data 模块

```ts
import iconFee from '@/assets/images/<slug>/icon-fee.png'
import cardBgFee from '@/assets/images/<slug>/card-bg-fee.png'

export interface OverviewCardItem {
  key: string
  title: string
  mainValue?: string
  icon: string
  bg: string
}

/** 概览卡片 mock（设计稿初值；对接后与接口字段对齐） */
export const getOverviewCards = (): OverviewCardItem[] => [
  {
    key: 'fee',
    title: '合计费用',
    mainValue: '+3.52',
    icon: iconFee,
    bg: cardBgFee,
  },
]
```

### 页面绑定 + 预留加载入口

```ts
const overviewCards = ref<OverviewCardItem[]>([])

/** 加载概览数据；对接后替换为项目请求层 */
const loadOverview = () => {
  overviewCards.value = getOverviewCards() // mock
}

onMounted(() => {
  loadOverview()
})
```

### 图表配置

设计稿里的数据图 → 使用**目标项目既有图表组件**，option / 配置放独立模块或 `computed`。完整约定见 [project-conventions.md](project-conventions.md)。

```ts
/** 根据序列生成图表 option（字段名跟邻近页） */
export const createChartOption = (
  xAxis: string[],
  seriesA: number[],
  seriesB: number[],
) => ({
  tooltip: { trigger: 'axis' },
  legend: { show: true },
  xAxis: { type: 'category', data: xAxis },
  yAxis: { type: 'value' },
  series: [
    { name: '系列 A', type: 'line', data: seriesA },
    { name: '系列 B', type: 'line', data: seriesB },
  ],
})
```

禁止：绕过项目封装自行初始化图表引擎；用图表区域切图代替真实配置（用户只要静态示意除外）。

## 接口未定时的约定

- mock **初值**取自设计稿可见文案/数字，保证视觉还原。
- 每个数据域留一个同步函数（`loadXxx`），注释标明「对接后替换为项目请求」。
- **不要**虚构不存在的 API 路径；用户未给接口时只留入口与类型形状。
- 格式化走项目既有方式，不要新引格式化库。

## 交付时向用户说明

简短列出：

1. **动态字段**：已变量化的项（及所在模块 / 状态）。
2. **静态资源**：切图目录与命名。
3. **对接提示**：建议后续映射的数据域（无需实现真实请求，除非用户要求）。
