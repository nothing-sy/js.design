# JsDesign MCP Bridge

即时设计 MCP：导出设计稿节点树，供 Cursor Agent 写页面（只读，不写回画布）。

- 仓库：https://github.com/nothing-sy/js.design
- npm：[`jsdesign-mcp-server`](https://www.npmjs.com/package/jsdesign-mcp-server)

**环境**：Node.js 18+ · [即时设计](https://js.design/download) · [Cursor](https://cursor.com)

---

## 1. 配置 MCP

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

也可 `npm i -g jsdesign-mcp-server` 后使用 `"command": "jsdesign-mcp"`。  
本地调试：`"command": "node"`，`args` 指向 `mcp-server/dist/index.js`。

Cursor **Settings → MCP** 中确认 **jsdesign** 绿灯。默认端口 `3847`（`JSDESIGN_MCP_PORT` 可改）。

---

## 2. 导入插件

### 方式 A：插件市场搜索安装（推荐）

即时设计 → **插件** → 搜索 **JsDesign MCP Bridge**（或「MCP Bridge」）→ 安装并运行，面板显示「已连接」。

### 方式 B：开发者导入

```bash
git clone https://github.com/nothing-sy/js.design.git
```

即时设计 → **插件 → 开发者 → 导入插件** → 选择 [`plugin/manifest.json`](plugin/manifest.json) → 运行插件。

> 先保证 Cursor MCP 绿灯；使用期间保持插件面板打开。

---

## 3. 使用

1. 画布上选中目标画板（整屏 Frame）
2. 让 Agent 调用 `export_selection` 写页面

常用工具：`get_connection_status` · `export_selection` · `export_node` · `list_top_frames` · `get_design_tokens` · `export_assets`


简单使用方式： `cursor agent: 按当前选中（在即时设计桌面端选中），结合项目结构和风格实现页面`

【可以结合自身的实际工作流程形成SKILL】
---

## 常见问题

| 现象 | 处理 |
|------|------|
| MCP 红灯 | 检查网络 / `mcp.json`；本地构建先 `npm run build` |
| 插件未连接 | 先开 MCP，再点插件「重新连接」 |
| 无选中节点 | 先选中目标 Frame |
| 端口占用 | 结束占用进程，或改 `JSDESIGN_MCP_PORT` |

---

## License

MIT
