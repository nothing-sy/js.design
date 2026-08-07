import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import {
  AGENT_METHOD_LIST_CLIENTS,
  DEFAULT_WS_PORT,
  type AgentRpcRequest,
  type AgentRpcResponse,
  type BridgeHello,
  type BridgeMessage,
} from "./schema.js";
import type { BridgeClientInfo, BridgeLike } from "./bridge.js";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

/**
 * MCP stdio 进程侧：作为 agent 连接到 daemon，转发工具调用。
 */
export class AgentClient implements BridgeLike {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private port: number;
  private assignedId: string | null = null;

  constructor(port = DEFAULT_WS_PORT) {
    this.port = port;
  }

  get url(): string {
    return `ws://127.0.0.1:${this.port}`;
  }

  /** Connect and complete agent hello handshake. */
  connect(timeoutMs = 5_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      let settled = false;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const ok = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      const timer = setTimeout(() => {
        fail(new Error(`连接 daemon 超时（${this.url}）`));
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        ws.removeAllListeners();
      };

      ws.on("open", () => {
        // wait for server hello then send agent hello
      });

      ws.on("message", (raw) => {
        let msg: BridgeMessage;
        try {
          msg = JSON.parse(raw.toString()) as BridgeMessage;
        } catch {
          return;
        }

        if (msg.type === "hello" && !this.assignedId) {
          this.assignedId = msg.clientId;
          this.ws = ws;
          this.send({
            type: "hello",
            clientId: msg.clientId,
            role: "agent",
          } satisfies BridgeHello);
          ok();
          return;
        }

        if (msg.type === "agent-rpc-result") {
          this.onAgentResult(msg);
        }
      });

      ws.on("error", (err) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      });

      ws.on("close", () => {
        if (!settled) {
          fail(new Error(`daemon 连接已关闭（${this.url}）`));
          return;
        }
        this.ws = null;
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error("与 daemon 的连接已断开"));
        }
        this.pending.clear();
      });
    });
  }

  close(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("AgentClient closed"));
    }
    this.pending.clear();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  async listClients(): Promise<BridgeClientInfo[]> {
    const result = await this.call(AGENT_METHOD_LIST_CLIENTS, {}, {
      timeoutMs: 10_000,
    });
    if (!Array.isArray(result)) return [];
    return result as BridgeClientInfo[];
  }

  async call(
    method: string,
    params: Record<string, unknown> = {},
    options: { clientId?: string; timeoutMs?: number } = {},
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(
        "未连接到 jsdesign-mcp daemon。请确认守护进程已在固定端口运行。",
      );
    }

    const id = randomUUID();
    const timeoutMs = options.timeoutMs ?? 60_000;
    const req: AgentRpcRequest = {
      type: "agent-rpc",
      id,
      method,
      params,
      clientId: options.clientId,
    };

    const resultPromise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`调用 ${method} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });

    this.send(req);
    return resultPromise;
  }

  private onAgentResult(msg: AgentRpcResponse): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);
    if (msg.ok) {
      pending.resolve(msg.result);
    } else {
      pending.reject(new Error(msg.error || "daemon 返回错误"));
    }
  }

  private send(msg: BridgeMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

/** Probe whether an existing listener on port speaks agent-rpc (our daemon). */
export async function probeDaemon(
  port = DEFAULT_WS_PORT,
  timeoutMs = 2_000,
): Promise<boolean> {
  const client = new AgentClient(port);
  try {
    await client.connect(timeoutMs);
    await client.call(AGENT_METHOD_LIST_CLIENTS, {}, { timeoutMs });
    client.close();
    return true;
  } catch {
    client.close();
    return false;
  }
}
