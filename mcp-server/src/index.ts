#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AgentClient, probeDaemon } from "./agent-client.js";
import { Bridge } from "./bridge.js";
import { DEFAULT_IDLE_MS, DEFAULT_WS_PORT } from "./schema.js";
import { registerTools } from "./tools.js";

const port = Number(process.env.JSDESIGN_MCP_PORT || DEFAULT_WS_PORT);
const idleMs = Number(
  process.env.JSDESIGN_MCP_IDLE_MS !== undefined &&
    process.env.JSDESIGN_MCP_IDLE_MS !== ""
    ? process.env.JSDESIGN_MCP_IDLE_MS
    : DEFAULT_IDLE_MS,
);
const selfPath = fileURLToPath(import.meta.url);

function daemonDir(): string {
  return join(tmpdir(), "jsdesign-mcp");
}

function pidPath(): string {
  return join(daemonDir(), "daemon.pid");
}

function writePid(): void {
  mkdirSync(daemonDir(), { recursive: true });
  writeFileSync(pidPath(), String(process.pid), "utf8");
}

function clearPid(): void {
  try {
    const raw = readFileSync(pidPath(), "utf8").trim();
    if (raw === String(process.pid)) unlinkSync(pidPath());
  } catch {
    /* ignore */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatIdleDuration(ms: number): string {
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1_000 === 0) return `${ms / 1_000}s`;
  return `${ms}ms`;
}

async function runDaemon(): Promise<void> {
  if (await probeDaemon(port, 1500)) {
    console.error(
      `[jsdesign-mcp] daemon already running on ws://127.0.0.1:${port} — exiting`,
    );
    process.exit(0);
  }

  const bridge = new Bridge(port);
  let idleTimer: NodeJS.Timeout | null = null;

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const shutdown = (reason?: string) => {
    clearIdleTimer();
    if (reason) {
      console.error(`[jsdesign-mcp] ${reason}`);
    }
    clearPid();
    bridge.stop();
    process.exit(0);
  };

  const armIdleTimer = () => {
    clearIdleTimer();
    if (idleMs <= 0) return;
    idleTimer = setTimeout(() => {
      if (bridge.clientCount() > 0) return;
      shutdown(
        `idle for ${formatIdleDuration(idleMs)} with no clients — exiting`,
      );
    }, idleMs);
    idleTimer.unref?.();
  };

  try {
    const listenPort = await bridge.start();
    writePid();
    console.error(
      `[jsdesign-mcp] daemon WebSocket on ws://127.0.0.1:${listenPort}`,
    );
    console.error("[jsdesign-mcp] Waiting for Instant Design plugin / MCP agents…");
    if (idleMs > 0) {
      console.error(
        `[jsdesign-mcp] will exit after ${formatIdleDuration(idleMs)} with no clients`,
      );
    }

    bridge.onClientsChanged((count) => {
      if (count > 0) {
        clearIdleTimer();
      } else {
        armIdleTimer();
      }
    });
    armIdleTimer();
  } catch (err) {
    if (await probeDaemon(port, 1500)) {
      console.error(
        `[jsdesign-mcp] daemon already running on ws://127.0.0.1:${port} — exiting`,
      );
      process.exit(0);
    }
    throw err;
  }

  process.on("SIGINT", () => shutdown());
  process.on("SIGTERM", () => shutdown());
}

function spawnDaemonDetached(): void {
  const child = spawn(process.execPath, [selfPath, "daemon"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
    windowsHide: true,
  });
  child.unref();
  console.error(
    `[jsdesign-mcp] spawned daemon (pid ${child.pid ?? "?"}) on port ${port}`,
  );
}

async function connectWithAutoStart(): Promise<AgentClient> {
  const client = new AgentClient(port);

  try {
    await client.connect(2_000);
    return client;
  } catch {
    client.close();
  }

  if (await probeDaemon(port, 1500)) {
    const retry = new AgentClient(port);
    await retry.connect(3_000);
    return retry;
  }

  spawnDaemonDetached();

  for (let i = 0; i < 20; i++) {
    await sleep(200 + i * 50);
    if (!(await probeDaemon(port, 1_000))) continue;
    const ready = new AgentClient(port);
    try {
      await ready.connect(3_000);
      return ready;
    } catch {
      ready.close();
    }
  }

  throw new Error(
    `无法连接或启动 jsdesign-mcp daemon（ws://127.0.0.1:${port}）。请手动运行: jsdesign-mcp daemon`,
  );
}

async function runMcp(): Promise<void> {
  const client = await connectWithAutoStart();
  console.error(
    `[jsdesign-mcp] attached to daemon at ws://127.0.0.1:${port}`,
  );

  const server = new McpServer({
    name: "jsdesign-mcp",
    version: "0.1.0",
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    client.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "daemon") {
    await runDaemon();
    return;
  }
  await runMcp();
}

main().catch((err) => {
  console.error("[jsdesign-mcp] fatal:", err);
  process.exit(1);
});
