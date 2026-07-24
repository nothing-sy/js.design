/** Shared RPC message shapes between MCP server and plugin UI. */

export type RpcRequest = {
  type: "rpc";
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

export type RpcResponse = {
  type: "rpc-result";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

export type BridgeHello = {
  type: "hello";
  clientId: string;
  documentName?: string;
  pageName?: string;
};

export type BridgeHeartbeat = {
  type: "heartbeat";
  ts: number;
};

export type BridgeMessage = RpcRequest | RpcResponse | BridgeHello | BridgeHeartbeat;

export const DEFAULT_WS_PORT = 3847;
