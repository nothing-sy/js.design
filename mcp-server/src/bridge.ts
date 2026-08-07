import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import {
  AGENT_METHOD_LIST_CLIENTS,
  DEFAULT_WS_PORT,
  type AgentRpcRequest,
  type AgentRpcResponse,
  type BridgeHello,
  type BridgeMessage,
  type ClientRole,
  type RpcRequest,
  type RpcResponse,
} from "./schema.js";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

export type BridgeClientInfo = {
  id: string;
  documentName?: string;
  pageName?: string;
  lastSeen: number;
};

export type ConnectedClient = {
  id: string;
  ws: WebSocket;
  role: ClientRole;
  documentName?: string;
  pageName?: string;
  lastSeen: number;
};

/** Shared surface used by MCP tools (in-process Bridge or remote AgentClient). */
export interface BridgeLike {
  listClients(): Promise<BridgeClientInfo[]>;
  call(
    method: string,
    params?: Record<string, unknown>,
    options?: { clientId?: string; timeoutMs?: number },
  ): Promise<unknown>;
}

export class Bridge implements BridgeLike {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ConnectedClient>();
  private pending = new Map<string, Pending>();
  private port: number;

  constructor(port = DEFAULT_WS_PORT) {
    this.port = port;
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: "127.0.0.1", port: this.port });
      this.wss = wss;

      wss.on("listening", () => resolve(this.port));
      wss.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          reject(
            new Error(
              `端口 ${this.port} 已被占用。若已是 jsdesign-mcp daemon 可忽略；否则结束占用进程或设置 JSDESIGN_MCP_PORT。`,
            ),
          );
          return;
        }
        reject(err);
      });

      wss.on("connection", (ws) => {
        const clientId = randomUUID();
        const client: ConnectedClient = {
          id: clientId,
          ws,
          role: "plugin",
          lastSeen: Date.now(),
        };
        this.clients.set(clientId, client);

        ws.on("message", (raw) => {
          this.onMessage(client, raw.toString());
        });

        ws.on("close", () => {
          this.clients.delete(clientId);
        });

        ws.on("error", () => {
          this.clients.delete(clientId);
        });

        this.send(ws, {
          type: "hello",
          clientId,
        } satisfies BridgeHello);
      });
    });
  }

  stop(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Bridge stopped"));
    }
    this.pending.clear();
    for (const c of this.clients.values()) {
      try {
        c.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }

  async listClients(): Promise<BridgeClientInfo[]> {
    return [...this.clients.values()]
      .filter((c) => c.role === "plugin")
      .map((c) => ({
        id: c.id,
        documentName: c.documentName,
        pageName: c.pageName,
        lastSeen: c.lastSeen,
      }));
  }

  getPrimaryPlugin(clientId?: string): ConnectedClient | null {
    if (clientId) {
      const c = this.clients.get(clientId);
      return c && c.role === "plugin" ? c : null;
    }
    return (
      [...this.clients.values()].find((c) => c.role === "plugin") ?? null
    );
  }

  async call(
    method: string,
    params: Record<string, unknown> = {},
    options: { clientId?: string; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const client = this.getPrimaryPlugin(options.clientId);
    if (!client) {
      throw new Error(
        "即时设计插件未连接。请在即时设计中打开「JsDesign MCP Bridge」插件，并确认状态为「已连接」。",
      );
    }

    const id = randomUUID();
    const timeoutMs = options.timeoutMs ?? 60_000;
    const req: RpcRequest = { type: "rpc", id, method, params };

    const resultPromise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`调用 ${method} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });

    this.send(client.ws, req);
    return resultPromise;
  }

  private onMessage(client: ConnectedClient, text: string): void {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(text) as BridgeMessage;
    } catch {
      return;
    }

    client.lastSeen = Date.now();

    if (msg.type === "hello") {
      if (msg.role === "agent") {
        client.role = "agent";
      } else {
        client.role = "plugin";
        client.documentName = msg.documentName;
        client.pageName = msg.pageName;
      }
      return;
    }

    if (msg.type === "heartbeat") {
      return;
    }

    if (msg.type === "agent-rpc") {
      if (client.role !== "agent") return;
      void this.handleAgentRpc(client, msg);
      return;
    }

    if (msg.type === "rpc-result") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      const res = msg as RpcResponse;
      if (res.ok) {
        pending.resolve(res.result);
      } else {
        pending.reject(new Error(res.error || "插件返回错误"));
      }
    }
  }

  private async handleAgentRpc(
    agent: ConnectedClient,
    msg: AgentRpcRequest,
  ): Promise<void> {
    const reply = (payload: Omit<AgentRpcResponse, "type" | "id">) => {
      this.send(agent.ws, {
        type: "agent-rpc-result",
        id: msg.id,
        ...payload,
      } satisfies AgentRpcResponse);
    };

    try {
      if (msg.method === AGENT_METHOD_LIST_CLIENTS) {
        const clients = await this.listClients();
        reply({ ok: true, result: clients });
        return;
      }

      const result = await this.call(msg.method, msg.params || {}, {
        clientId: msg.clientId,
      });
      reply({ ok: true, result });
    } catch (e) {
      reply({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private send(ws: WebSocket, msg: BridgeMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
