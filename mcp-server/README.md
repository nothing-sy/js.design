# jsdesign-mcp-server

即时设计（[js.design](https://js.design)）MCP Server：把设计稿节点树导出给 Cursor / Claude 等 Agent，用于设计稿 → 代码。

完整文档：https://github.com/nothing-sy/js.design

## 架构

- **`jsdesign-mcp daemon`**：常驻 WebSocket 桥，固定监听 `ws://127.0.0.1:3847`（可用 `JSDESIGN_MCP_PORT`），供即时设计插件连接。
- **`jsdesign-mcp`（默认）**：Cursor 拉起的 stdio MCP；作为 agent 接入已有 daemon。若 daemon 未运行会自动 detached 拉起，**退出 Cursor 不会关掉 daemon**。

## 快速开始

### 1. 配置 Cursor MCP

编辑 `%USERPROFILE%\.cursor\mcp.json`（macOS / Linux：`~/.cursor/mcp.json`）：

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

或全局安装后：

```bash
npm i -g jsdesign-mcp-server
```

```json
{
  "mcpServers": {
    "jsdesign": {
      "command": "jsdesign-mcp"
    }
  }
}
```

在 Cursor **Settings → MCP** 中确认 **jsdesign** 为绿灯。

可选预热守护进程：

```bash
jsdesign-mcp daemon
# 或：npm run daemon
```

### 2. 导入即时设计插件

- **推荐**：即时设计 → **插件** → 搜索 **JsDesign MCP Bridge** → 安装并运行
- **开发者导入**：克隆 https://github.com/nothing-sy/js.design ，再 **插件 → 开发者 → 导入插件** → 选择 `plugin/manifest.json`

面板显示「已连接」即可（地址默认 `ws://127.0.0.1:3847`）。

### 3. 使用

在画布选中目标画板，让 Agent 调用 `export_selection` 即可写页面。

## License

MIT
