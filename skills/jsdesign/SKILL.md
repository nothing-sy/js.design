---
name: jsdesign
description: >-
  Use the JsDesign MCP Bridge (即时设计 / jsdesign) to export design trees and
  image assets, then implement pages matching the target project's structure
  and style—with dynamic-field placeholders for later API wiring. Use when the
  user mentions 即时设计, jsdesign, MCP, export_selection, export_assets,
  设计稿还原, 切图, or design-to-code.
---

# JsDesign → 按项目落盘写页面

把即时设计选区变成**可对接接口的页面**：先保证 MCP 连通，再认目标项目目录与风格，导出结构/切图到项目内路径，按现有约定写代码，并对可能来自接口的内容预留变量。禁止纯静态堆砌、禁止切图只留临时目录、禁止无视项目栈硬造 UI。

## 强制工作流

```text
get_connection_status（未连通 → 请用户开插件/选画板）
→ 侦察目标仓库 → 定 assetsDir + pagePath
→ export_selection(+assets) / export_assets
→ 动态字段盘点（用户提示优先，否则自行粗判）
→ 按项目风格写页面（变量 / mock / 类型预留）
→ 交付清单
```

## 0. MCP 连通（前置，必须）

命名空间：`user-jsdesign`。WebSocket 桥由 `jsdesign-mcp daemon` 常驻提供；Cursor MCP 仅 attach，一般无需关心端口。

1. 调用 `get_connection_status`（或任意 jsdesign 工具探测）。
2. **未连通**：提示用户在即时设计中打开「JsDesign MCP Bridge」、保持面板打开，并选中目标画板；必要时请用户在 Cursor 中开关一次 jsdesign MCP。
3. **未连通前禁止臆造设计树或跳过切图。**

大画板用 `list_top_frames` 确认目标 Frame，再导出。

## 1. 先侦察项目，再定路径

在调用 `export_assets` / `includeAssets` **之前**，摸清目标仓库：

| 侦察项 | 看什么 | 决定什么 |
|--------|--------|----------|
| 框架 | `package.json`、构建配置 | React / Vue / 其它 |
| 页面目录 | `src/views`、`src/pages`、`app/` 等 | 页面落点 |
| 组件约定 | 邻近页、UI 库、样式方案 | 复用与样式写法 |
| 静态资源 | `src/assets/`、`public/` 等 | **切图 outputDir** |
| 别名 | `tsconfig` / 构建别名 | import 写法 |
| 编码规范 | `AGENTS.md`、邻近页面 | 注释、类型、格式化 |

详细约定见 [project-conventions.md](project-conventions.md)。无特殊约定时兜底：

```text
图片 → src/assets/images/<frame-slug>/ 或 public/design-assets/<frame-slug>/
页面 → 与邻近业务页同级
```

`frame-slug`：画板名转安全短名（小写、连字符，去特殊字符）。

## 2. MCP 导出（切图必进项目）

```text
get_connection_status（已通过）
→（可选）list_top_frames
→ 已选定 assetsDir（绝对路径）
→ export_selection({ includeAssets: true, outputDir: assetsDir })
→ 若未 includeAssets：export_assets({ outputDir: assetsDir })
→（可选）get_design_tokens
→ 按节点树 + localPath 写页面
```

### 切图规则

- `outputDir` **必须是业务项目内绝对路径**，禁止只落系统临时目录。
- 引用用导出结果的 `fills[].localPath` / `assetPath`，再换成目标项目可引用路径。
- IMAGE fill 不足时：`export_assets({ nodeIds: [...] })` 强制 `exportAsync`。
- 同 `imageHash` 只保留一份；导出 JSON 过大（`spilledToFile`）时 Read `path`，勿臆造。
- 导出后**重命名**为英文 kebab-case，禁止保留设计稿中文层名文件名。

### 工具速查

| 工具 | 用途 |
|------|------|
| `get_connection_status` | 插件/桥是否在线 |
| `list_top_frames` | 选哪一屏 |
| `export_selection` | 结构主数据；可 `includeAssets` |
| `export_assets` | 批量切图落盘 |
| `export_node` | 按 id/name 导出子树 |
| `get_design_tokens` | 颜色/字号/间距/圆角 |
| `get_node_css` | 单节点 CSS 参考（非主交付） |

## 3. 动态字段盘点（写 DOM 前必须）

完整规则见 [data-binding.md](data-binding.md)。摘要：

1. **用户有额外提示** → 以提示为准划分动/静（可覆盖粗判）。
2. **用户无提示** → **不强制追问**；按设计稿 + 目标项目邻近页常见形态自行粗判。
3. 倾向动态：金额/数值/百分比、重复卡片/列表/表行、图表序列、筛选日期/Tab/状态。
4. 倾向静态：装饰底图、固定图标、板块标题、纯布局文案。
5. 动态内容必须进变量 / mock / 配置工厂参数；禁止满屏硬编码业务数字。
6. 预留同步入口注释，便于后续接项目既有请求层。

## 4. 写代码原则

1. **复用优先**：对齐邻近页面的目录、命名、样式、路由写法。
2. **结构还原**：Auto-layout → flex；绝对定位保留坐标；颜色/圆角/字号跟导出或 tokens。
3. **图片必落地**：有 IMAGE/切图层却未导出或未引用 = 未完成。
4. **矢量 vs 位图**：简单矩形/文字/渐变用 DOM+CSS；复杂装饰用导出文件。
5. **图表**：使用目标项目既有图表封装与邻近页写法；序列走动态数据/mock。详见 [project-conventions.md](project-conventions.md)。禁止用静态切图冒充图表（除非用户只要示意）。
6. **范围**：只做用户要的那一屏/组件，不顺手重构无关模块。

## 5. 交付检查清单

- [ ] MCP 已连通（插件已开并选中目标画板）
- [ ] 导出的是正确画板；切图在项目内约定目录且英文命名、引用可打开
- [ ] 页面落点与命名风格一致；组件/样式跟邻近代码一致
- [ ] 已做动态字段盘点；动态值来自变量/mock，非满屏写死
- [ ] 设计稿中的图表已用项目图表方案 + 动态序列，未用 PNG 糊弄
- [ ] 向用户说明：页面路径、资源目录、动态字段清单、如何预览

## 故障速查

| 现象 | 处理 |
|------|------|
| 插件未连接 | 打开「JsDesign MCP Bridge」、保持面板；必要时开关一次 Cursor 中的 jsdesign MCP |
| 无选中 | 画布选中目标 Frame |
| 页面无图 | 补 `export_assets` / `includeAssets`，检查 `outputDir` 与引用 |
| 切图不全 | `nodeIds` 强制导出，或设计侧加 exportSettings |
| JSON 过大 | Read 临时文件 path |

## 对用户说话示例

> 请先确认即时设计 MCP 已连接并选中目标画板。连通后我会按项目资源目录导出切图，区分静态装饰与可对接字段，再按现有页面风格写代码。

## 附加资源

- 目标项目约定：[project-conventions.md](project-conventions.md)
- 动态字段判定与落码：[data-binding.md](data-binding.md)
