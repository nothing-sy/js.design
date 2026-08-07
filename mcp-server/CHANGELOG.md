# Changelog

本文件记录 [`jsdesign-mcp-server`](https://www.npmjs.com/package/jsdesign-mcp-server) 的版本变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.2.1] - 2026-08-07

### Added

- Daemon 在 **没有任何 WebSocket 客户端**（Cursor MCP agent 与即时设计插件均断开）持续 **15 分钟**后自动退出，减少孤儿进程与端口占用困惑
- 环境变量 `JSDESIGN_MCP_IDLE_MS`：覆盖空闲时长（毫秒）；设为 `0` 可禁用自动退出

### Changed

- 文档说明由「永久常驻」调整为「有连接时保活，全部断开后空闲退出；下次启用 MCP 会再自动拉起」

## [0.2.0] - 2026-08-07

### Added

- 独立常驻 WebSocket daemon（默认 `ws://127.0.0.1:3847`），与 Cursor MCP stdio 进程分离
- MCP 进程作为 agent 接入 daemon；daemon 未运行时自动 detached 拉起
- Agent RPC（`list_clients` 等）与 `JSDESIGN_MCP_PORT` 端口配置
- 参考 Skill（`skills/jsdesign`）与端到端使用文档
- 本地 `.npm-token` 发布脚本（`npm run release`）

### Changed

- Bridge 支持 `plugin` / `agent` 双角色连接

## [0.1.0] - 2026-08-06

### Added

- 初版即时设计 MCP Bridge：插件 WebSocket ↔ MCP 工具
- 导出工具：`export_selection` / `export_node` / `export_page` / `export_assets` 等
- `get_connection_status`、`get_document_info`、`list_pages`、`list_top_frames`、`get_design_tokens`、`get_node_css`
