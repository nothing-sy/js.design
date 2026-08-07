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
② Cursor 配置 jsdesign MCP（首次会自动拉起常驻 daemon，占用 3847）
    ↓
③ 在即时设计安装并运行插件（显示「已连接」）
    ↓
④ 选中画板，让 Agent 调用 export_selection 写页面
```

架构：

```text
即时设计插件 ──WebSocket :3847──► jsdesign-mcp daemon（常驻）
Cursor MCP stdio ──agent 接入──► 同上 daemon（Cursor 启停不关端口）
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
# 常驻 WebSocket 守护进程（推荐先开一次）
npm run daemon
# 或：node dist/index.js daemon

# Cursor 用的 MCP 入口（会 attach 到已有 daemon；没有则自动拉起）
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

默认 WebSocket：`ws://127.0.0.1:3847`，由 **daemon 常驻占用**（与 Cursor MCP stdio 进程分离）。  
首次启用 MCP 时会自动 `spawn` daemon；关闭 Cursor / 重启 MCP **不会**关掉 3847，即时设计插件可保持连接。

可选：登录后手动预热，或写入开机启动：

```bash
jsdesign-mcp daemon
```

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

1. 确认本机 `3847` 上已有 daemon（可先跑 `jsdesign-mcp daemon`），且 Cursor 里 jsdesign MCP 为绿灯
2. 确认端口与 `mcp.json` / `JSDESIGN_MCP_PORT` 一致
3. 点击插件面板的 **重新连接**

> 使用期间请保持插件面板打开。daemon 常驻后，不必每次开 Cursor 再等端口重启。

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

可按自己的工作流写成 Cursor Skill，固化「导出 → 落盘 → 写页面」步骤。本仓库提供一份**参考用** Skill，见下方 **§5**。

---

## 5. Cursor Skill（参考）

仓库目录 [`skills/jsdesign/`](skills/jsdesign/) 中的 Skill **仅供参考**：展示「连通检查 → 侦察目标项目 → 导出切图到项目内路径 → 动态字段盘点 → 按项目风格写页面」的推荐工作流。可按自身业务栈裁剪、改写后再放到 Cursor skills 目录使用，不必原样照搬。

| 文件 | 作用 |
|------|------|
| [`SKILL.md`](skills/jsdesign/SKILL.md) | 主流程与工具约定 |
| [`data-binding.md`](skills/jsdesign/data-binding.md) | 动态 / 静态字段判定与落码 |
| [`project-conventions.md`](skills/jsdesign/project-conventions.md) | 目标项目落盘与写页通用约定 |

### 如何使用这份参考

若要在 Cursor 中启用，可复制到用户级或业务项目的 skills 目录（并按需要修改）：

```text
# 用户级示例
%USERPROFILE%\.cursor\skills\jsdesign\
# macOS / Linux：~/.cursor/skills/jsdesign/

# 或业务项目级
.cursor/skills/jsdesign/
```

启用后新开 Agent 对话，提到即时设计 / 设计稿还原 / `export_selection` 等即可触发。

---

## 常见问题

| 现象 | 处理 |
|------|------|
| MCP 红灯 | 检查 `mcp.json`；首次用 `npx` 需能访问 npm；本地构建先 `npm run build` |
| 插件未连接 | 确认 daemon 在 `3847`（`jsdesign-mcp daemon`）；再点插件「重新连接」；保持面板打开 |
| 无选中节点 | 先在画布选中目标 Frame |
| 端口占用（非本 daemon） | 结束占用进程，或设 `JSDESIGN_MCP_PORT` 换端口，并同步改插件面板里的地址 |
| 旧版 MCP 占着 3847 | 结束旧 `node`/`jsdesign-mcp` 进程后执行 `jsdesign-mcp daemon` |
| `npx` / 命令找不到 | 确认包名是 `jsdesign-mcp-server`，全局命令是 `jsdesign-mcp` |

---

## License

MIT
