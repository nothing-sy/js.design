import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_WS_PORT,
  type BridgeHello,
  type BridgeMessage,
  type RpcRequest,
  type RpcResponse,
} from "./schema.js";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

export type PluginClient = {
  id: string;
  ws: WebSocket;
  documentName?: string;
  pageName?: string;
  lastSeen: number;
};

export class Bridge {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, PluginClient>();
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
      wss.on("error", reject);

      wss.on("connection", (ws) => {
        const clientId = randomUUID();
        const client: PluginClient = {
          id: clientId,
          ws,
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

        // Tell plugin its assigned id (optional)
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

  listClients(): Array<{
    id: string;
    documentName?: string;
    pageName?: string;
    lastSeen: number;
  }> {
    return [...this.clients.values()].map((c) => ({
      id: c.id,
      documentName: c.documentName,
      pageName: c.pageName,
      lastSeen: c.lastSeen,
    }));
  }

  getPrimaryClient(clientId?: string): PluginClient | null {
    if (clientId) {
      return this.clients.get(clientId) ?? null;
    }
    const all = [...this.clients.values()];
    return all[0] ?? null;
  }

  async call(
    method: string,
    params: Record<string, unknown> = {},
    options: { clientId?: string; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const client = this.getPrimaryClient(options.clientId);
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

  private onMessage(client: PluginClient, text: string): void {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(text) as BridgeMessage;
    } catch {
      return;
    }

    client.lastSeen = Date.now();

    if (msg.type === "hello") {
      client.documentName = msg.documentName;
      client.pageName = msg.pageName;
      return;
    }

    if (msg.type === "heartbeat") {
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

  private send(ws: WebSocket, msg: BridgeMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
