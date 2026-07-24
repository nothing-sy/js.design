# JsDesign MCP Bridge

面向开发的即时设计 MCP 插件：**读取设计稿节点数据 → Cursor Agent 写页面**。不写回画布。

## 架构

```
Cursor Agent  ──stdio──►  MCP Server  ──WebSocket──►  插件 UI  ──postMessage──►  code.js (jsDesign API)
```

依据 [即时设计插件 API](https://js.design/developer-doc/plugin/guide/start/Intro)：主线程无网络能力，网络桥必须放在 UI iframe。

## 环境要求

- Node.js 18+
- 即时设计桌面客户端
- Cursor（或其它 MCP 客户端）

## 安装

```bash
cd mcp-server
npm install
npm run build
```

## 导入即时设计插件

1. 打开即时设计 → 任意设计文件
2. 菜单：**插件 → 开发者 → 导入插件**
3. 选择本仓库 [`plugin/manifest.json`](plugin/manifest.json)
4. 运行 **JsDesign MCP Bridge**，面板显示「已连接」即可

> MCP Server 需先被 Cursor 拉起（打开带本 MCP 配置的项目即可），插件才会连上 `ws://127.0.0.1:3847`。

## 配置 Cursor

将以下内容写入项目 [`.cursor/mcp.json`](.cursor/mcp.json)（路径按本机修改）：

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

可选环境变量：`JSDESIGN_MCP_PORT`（默认 `3847`）。若改端口，插件面板里的 WebSocket 地址需同步修改。

## 推荐工作流（设计稿 → 写页面）

1. 在即时设计打开插件，确认「已连接」
2. **选中要还原的画板 / Frame**
3. 在 Cursor 让 Agent：
   - 先 `get_connection_status`
   - 再 `export_selection`（或 `list_top_frames` → `export_node`）
   - 需要统一样式时再 `get_design_tokens`
4. Agent 根据返回的 JSON（结构 / 布局 / 填充 / 文字等）直接写 HTML/CSS/React 页面

## MCP 工具

| 工具 | 说明 |
|------|------|
| `get_connection_status` | 插件是否在线 |
| `get_document_info` | 文件 / 当前页信息 |
| `list_pages` | 页面列表 |
| `list_top_frames` | 当前页顶层画板 |
| `export_selection` | **导出选区完整节点树（推荐）** |
| `export_node` | 按 id / name 导出子树 |
| `export_page` | 导出整页（大页慎用） |
| `get_design_tokens` | 颜色 / 字号 / 间距 / 圆角去重 |
| `get_node_css` | 单节点近似 CSS 摘要 |

导出选项：`maxDepth`、`skipHidden`（默认 true）、`skipInstanceChildren`（默认 true）。

## 目录

```
plugin/           # 即时设计插件（manifest + code.js + ui.html）
mcp-server/       # Node MCP Server + WebSocket 桥
.cursor/mcp.json  # Cursor 配置示例
```

## 限制（官方约束）

- 插件须由用户打开并保持运行，无法后台常驻
- 无法实时监听画布编辑；每次工具调用拉取最新快照
- 同时只能运行一个插件
- 一期不导出位图资源，以结构与样式数值为主

## License

MIT
