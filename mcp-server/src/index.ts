#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Bridge } from "./bridge.js";
import { DEFAULT_WS_PORT } from "./schema.js";
import { registerTools } from "./tools.js";

const port = Number(process.env.JSDESIGN_MCP_PORT || DEFAULT_WS_PORT);

async function main() {
  const bridge = new Bridge(port);
  const listenPort = await bridge.start();

  // Log to stderr so stdout stays clean for MCP stdio
  console.error(`[jsdesign-mcp] WebSocket bridge on ws://127.0.0.1:${listenPort}`);
  console.error("[jsdesign-mcp] Waiting for Instant Design plugin…");

  const server = new McpServer({
    name: "jsdesign-mcp",
    version: "0.1.0",
  });

  registerTools(server, bridge);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[jsdesign-mcp] fatal:", err);
  process.exit(1);
});
