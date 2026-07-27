# JsDesign MCP Bridge

即时设计 MCP：导出设计稿节点树，供 Cursor Agent 写页面（只读，不写回画布）。

- 仓库：https://github.com/nothing-sy/js.design
- npm：[`jsdesign-mcp-server`](https://www.npmjs.com/package/jsdesign-mcp-server)

**环境要求**：Node.js 18+ · [即时设计桌面端](https://js.design/download) · [Cursor](https://cursor.com)

---

## 整体流程

```text
① 安装 MCP 包
    ↓
② 在 Cursor 配置并启动 MCP（绿灯）
    ↓
③ 在即时设计安装并运行插件（显示「已连接」）
    ↓
④ 选中画板，让 Agent 调用 export_selection 写页面
```

---

## 1. 安装包

任选一种方式即可。

### 方式 A：无需预先安装（推荐）

Cursor 启动 MCP 时用 `npx` 自动拉取并运行，**不必手动安装**：

```bash
npx -y jsdesign-mcp-server
```

（一般不用单独执行；写进 `mcp.json` 后由 Cursor 自动调用。）

### 方式 B：全局安装

```bash
npm i -g jsdesign-mcp-server
```

安装后可直接使用命令：

```bash
jsdesign-mcp
```

### 方式 C：本地克隆开发

```bash
git clone https://github.com/nothing-sy/js.design.git
cd js.design/mcp-server
npm install
npm run build
```

本地启动：

```bash
npm start
# 或：node dist/index.js
```

> npm 包名是 **`jsdesign-mcp-server`**；CLI 命令名是 **`jsdesign-mcp`**，不要混用。

---

## 2. 配置 Cursor MCP

### 2.1 编辑配置文件

打开（没有则新建）：

| 系统 | 路径 |
|------|------|
| Windows | `%USERPROFILE%\.cursor\mcp.json` |
| macOS / Linux | `~/.cursor/mcp.json` |

### 2.2 写入配置

**用 npx（推荐，对应安装方式 A）：**

```json
{
  "mcpServers": {
    "jsdesign": {
      "command": "npx",
      "args": ["-y", "jsdesign-mcp-server"]
    }
  }
}
```

**用全局命令（对应安装方式 B）：**

```json
{
  "mcpServers": {
    "jsdesign": {
      "command": "jsdesign-mcp"
    }
  }
}
```

**用本地构建（对应安装方式 C）：**

把路径换成你机器上的绝对路径：

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

如需改端口（默认 `3847`）：

```json
{
  "mcpServers": {
    "jsdesign": {
      "command": "npx",
      "args": ["-y", "jsdesign-mcp-server"],
      "env": {
        "JSDESIGN_MCP_PORT": "3848"
      }
    }
  }
}
```

### 2.3 确认 MCP 已启动

1. 打开 Cursor → **Settings → MCP**
2. 找到 **jsdesign**，状态应为**绿灯**
3. 若为红灯：检查 `mcp.json` 语法、网络（首次 `npx` 需下载包）、以及 `mcp-server` 是否已 `npm run build`（本地方式）

MCP 默认监听：`ws://127.0.0.1:3847`

---

## 3. 连接即时设计

MCP 绿灯后，再在即时设计里装插件并连上 WebSocket。

### 3.1 安装插件

**方式 A：插件市场（推荐）**

1. 打开即时设计桌面端
2. 进入 **插件**
3. 搜索 **JsDesign MCP Bridge**（或「MCP Bridge」）
4. 安装并**运行**插件

**方式 B：开发者导入**

1. 克隆仓库：`git clone https://github.com/nothing-sy/js.design.git`
2. 即时设计 → **插件 → 开发者 → 导入插件**
3. 选择仓库里的 [`plugin/manifest.json`](plugin/manifest.json)
4. 运行插件

### 3.2 确认已连接

插件面板应显示：

- 状态：**已连接**（绿色）
- WebSocket 地址默认为 `ws://127.0.0.1:3847`

若显示「未连接」：

1. 确认 Cursor 里 jsdesign MCP 已是绿灯
2. 确认端口与 `mcp.json` / `JSDESIGN_MCP_PORT` 一致
3. 点击插件面板的 **重新连接**

> 使用期间请保持插件面板打开；先开 MCP，再连插件。

---

## 4. 使用

1. 在即时设计画布上选中目标画板（整屏 Frame）
2. 在 Cursor 里让 Agent 调用工具写页面，例如：

```text
按当前选中（在即时设计桌面端选中），结合项目结构和风格实现页面
```

常用工具：

| 工具 | 作用 |
|------|------|
| `get_connection_status` | 检查插件是否在线 |
| `list_top_frames` | 列出顶层画板 |
| `export_selection` | 导出当前选区（可 `includeAssets` 切图） |
| `export_node` | 按 id / name 导出节点 |
| `export_assets` | 批量切图落盘 |
| `get_design_tokens` | 颜色 / 字号 / 间距 / 圆角 |

可按自己的工作流写成 Cursor Skill，固化「导出 → 落盘 → 写页面」步骤。

---

## 常见问题

| 现象 | 处理 |
|------|------|
| MCP 红灯 | 检查 `mcp.json`；首次用 `npx` 需能访问 npm；本地构建先 `npm run build` |
| 插件未连接 | 先保证 MCP 绿灯，再点插件「重新连接」；保持面板打开 |
| 无选中节点 | 先在画布选中目标 Frame |
| 端口占用 | 结束占用进程，或设 `JSDESIGN_MCP_PORT` 换端口，并同步改插件面板里的地址 |
| `npx` / 命令找不到 | 确认包名是 `jsdesign-mcp-server`，全局命令是 `jsdesign-mcp` |

---

## License

MIT
