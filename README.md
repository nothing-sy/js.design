# JsDesign MCP Bridge

面向开发的即时设计 MCP：**读取设计稿节点数据 → Cursor Agent 写页面**。  
不写回画布，只做设计稿 → 代码。

仓库：https://github.com/nothing-sy/js.design

---

## 它解决什么问题

在即时设计里选中一屏设计，Agent 通过 MCP 拿到完整节点树（布局、颜色、文字、层级），再据此写 HTML / CSS / React 等页面，而不是靠截图猜样式。

---

## 环境要求

- Node.js 18+
- [即时设计](https://js.design/download) 桌面客户端
- [Cursor](https://cursor.com)（或其它支持 MCP 的客户端）

---

## 一、安装与构建

```bash
git clone https://github.com/nothing-sy/js.design.git
cd js.design/mcp-server
npm install
npm run build
```

构建产物：`mcp-server/dist/index.js`（Cursor 会启动这个文件）。

---

## 二、开启 MCP（Cursor）

**不用手动开终端常驻。** Cursor 会按配置自动拉起服务。

### 方式 A：全局配置（推荐，任意项目可用）

编辑用户目录下的 MCP 配置：

| 系统 | 路径 |
|------|------|
| Windows | `%USERPROFILE%\.cursor\mcp.json` |
| macOS / Linux | `~/.cursor/mcp.json` |

加入（**把路径改成你本机仓库位置**）：

```json
{
  "mcpServers": {
    "jsdesign": {
      "command": "node",
      "args": ["D:/projects/js.design/mcp-server/dist/index.js"]
    }
  }
}
```

### 方式 B：仅当前项目

复制本仓库的 [`.cursor/mcp.json`](.cursor/mcp.json)，修改其中的绝对路径。  
若与全局同名，**项目级配置优先**。

### 确认已开启

1. 打开 Cursor **Settings → MCP**
2. 找到 **jsdesign**，打开开关，等待**绿灯**
3. 红灯时点 **Refresh / Restart**

成功后本机会监听：`ws://127.0.0.1:3847`  
可选环境变量：`JSDESIGN_MCP_PORT`（默认 `3847`）。改端口后，插件面板里的地址也要改。

---

## 三、导入即时设计插件

1. 打开即时设计 → 任意设计文件  
2. 菜单：**插件 → 开发者 → 导入插件**  
3. 选择本仓库的 [`plugin/manifest.json`](plugin/manifest.json)  
4. 运行插件 **JsDesign MCP Bridge**  
5. 面板显示 **「已连接」**（绿灯）即可  

> 须先让 Cursor 把 MCP 拉起来（上一步绿灯），插件才能连上。  
> 使用期间**保持插件面板打开**；关掉就断桥，MCP 会提示未连接。

---

## 四、「选中画板」是什么意思

在即时设计画布上，**用鼠标点中你要还原成代码的那一整屏**（通常是一个大 Frame），让它处于选中状态。

| 操作 | `export_selection` 导出内容 |
|------|---------------------------|
| 选中整个「首页」Frame | 该屏完整结构（推荐） |
| 只选中里面一个按钮 | 只有那个按钮 |
| 什么都不选 | 报错：当前没有选中节点 |

也可以先调用 `list_top_frames` 看当前页有哪些顶层画板，再按 `nodeId` / `name` 用 `export_node` 导出。

---

## 五、日常使用流程（设计稿 → 写页面）

1. Cursor：MCP `jsdesign` 绿灯  
2. 即时设计：打开 **JsDesign MCP Bridge**，显示「已连接」  
3. 画布上**选中目标画板**  
4. 在 Cursor 对话里对 Agent 说，例如：

> 先用 jsdesign 的 `get_connection_status` 检查连接，再 `export_selection`，根据设计数据写一个 React 页面。

Agent 典型调用顺序：

```text
get_connection_status → export_selection →（可选）get_design_tokens → 写代码
```

---

## 六、MCP 工具一览

| 工具 | 说明 |
|------|------|
| `get_connection_status` | 插件是否在线 |
| `get_document_info` | 文件 / 当前页信息 |
| `list_pages` | 页面列表 |
| `list_top_frames` | 当前页顶层画板 |
| `export_selection` | **导出当前选区完整节点树（最常用）** |
| `export_node` | 按 `nodeId` 或 `name` 导出子树 |
| `export_page` | 导出整页（大页慎用） |
| `export_assets` | 导出切图 / 图片资源到本地目录 |
| `get_design_tokens` | 颜色 / 字号 / 间距 / 圆角去重 |
| `get_node_css` | 单节点近似 CSS 摘要 |

导出可选参数：

- `maxDepth`：最大递归深度  
- `skipHidden`：跳过隐藏节点（默认 `true`）  
- `skipInstanceChildren`：跳过组件实例内部（默认 `true`）  
- `includeAssets`：一并导出位图（若工具支持）  
- `outputDir`：切图输出目录  

JSON 超过约 400KB 时，会写入临时文件（如 `%TEMP%/jsdesign-mcp/export-*.json`），工具返回 `path`，Agent 用 Read 读取即可。

---

## 七、导出数据长什么样

每个节点大致包含：

- **身份**：`id`, `name`, `type`, `visible`  
- **几何**：`x`, `y`, `width`, `height`, `rotation`  
- **布局**：`layoutMode`, `padding*`, `itemSpacing`, …  
- **视觉**：`fills`, `strokes`, `cornerRadius`, `effects`, `opacity`  
- **文字**：`characters`, `fontName`, `fontSize`, `lineHeight`, …  
- **层级**：`children[]`  

类型定义见 [`mcp-server/src/schema.ts`](mcp-server/src/schema.ts) 的 `DesignNode`。

---

## 八、项目结构

```text
js.design/
  plugin/                 # 即时设计插件（桥）
    manifest.json
    code.js
    ui.html
  mcp-server/             # Node MCP Server
    src/
      index.ts
      bridge.ts
      tools.ts
      schema.ts
    dist/                 # build 产物（Cursor 启动入口）
  .cursor/mcp.json        # 项目级 MCP 配置示例
  package.json
  README.md
```

架构示意：

```text
Cursor Agent ──stdio──► MCP Server ──WebSocket──► 插件 UI ──postMessage──► code.js ──► 画布
```

依据 [即时设计插件 API](https://js.design/developer-doc/plugin/guide/start/Intro)：主线程无网络能力，桥必须放在 UI iframe。

---

## 九、常见问题

| 现象 | 处理 |
|------|------|
| Cursor 里 jsdesign 红灯 | `npm run build` 后 Refresh；检查 `mcp.json` 路径是否指向本机 `dist/index.js` |
| 端口被占用 | 结束占用 `3847` 的进程，或设 `JSDESIGN_MCP_PORT` 并同步改插件地址 |
| 插件显示「未连接」 | 先保证 Cursor MCP 绿灯，再点插件「重新连接」 |
| `export_selection` 报错无选中 | 在画布上选中目标 Frame 后再调 |
| 导出很慢 / 很大 | 优先导出单个画板；用 `maxDepth` 限制深度 |

---

## 限制

- 插件须用户打开并保持运行，不能后台常驻  
- 不能实时监听编辑；每次工具调用拉取最新快照  
- 同时只能运行一个即时设计插件  
- **不做写回画布**

---

## License

MIT
