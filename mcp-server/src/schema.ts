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

export type ClientRole = "plugin" | "agent";

export type BridgeHello = {
  type: "hello";
  clientId: string;
  /** Agent 客户端声明 role:"agent"；缺省视为 plugin（兼容旧插件） */
  role?: ClientRole;
  documentName?: string;
  pageName?: string;
};

export type BridgeHeartbeat = {
  type: "heartbeat";
  ts: number;
};

/** MCP stdio 进程 → daemon：转发到插件的 RPC */
export type AgentRpcRequest = {
  type: "agent-rpc";
  id: string;
  method: string;
  params?: Record<string, unknown>;
  clientId?: string;
};

/** daemon → MCP stdio 进程 */
export type AgentRpcResponse = {
  type: "agent-rpc-result";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

export type BridgeMessage =
  | RpcRequest
  | RpcResponse
  | BridgeHello
  | BridgeHeartbeat
  | AgentRpcRequest
  | AgentRpcResponse;

export const DEFAULT_WS_PORT = 3847;

/** Built-in agent-rpc method: list plugin clients (not forwarded to plugin). */
export const AGENT_METHOD_LIST_CLIENTS = "list_clients";

/**
 * Design-to-code export JSON shapes (plugin → MCP → Agent).
 * Agent should treat this as the source of truth for layout/styles/text.
 */

export type Rgb = { r: number; g: number; b: number; a?: number };

export type PaintExport = {
  type: string;
  visible?: boolean;
  opacity?: number;
  /** Hex or rgba string for SOLID / gradient stops */
  color?: string;
  rgb?: Rgb;
  scaleMode?: string;
  imageHash?: string;
  /** Absolute path after export_assets / includeAssets writes the file */
  localPath?: string;
  gradientStops?: Array<{ position: number; color?: string; rgb?: Rgb }>;
  gradientTransform?: unknown;
};

export type EffectExport = {
  type: string;
  visible?: boolean;
  radius?: number;
  color?: string;
  offset?: { x: number; y: number };
  spread?: number;
};

export type FontNameExport = {
  family: string;
  style: string;
};

/** Unified node snapshot used by export_selection / export_node / export_page */
export type DesignNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  locked?: boolean;

  // Geometry (relative to parent)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  blendMode?: string;

  // Auto-layout
  layoutMode?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  layoutAlign?: string;
  layoutGrow?: number;
  layoutPositioning?: string;
  clipsContent?: boolean;

  // Visual
  fills?: PaintExport[];
  strokes?: PaintExport[];
  strokeWeight?: number;
  strokeAlign?: string;
  dashPattern?: number[];
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  effects?: EffectExport[];

  // Text
  characters?: string;
  fontSize?: number;
  fontName?: FontNameExport;
  lineHeight?: unknown;
  letterSpacing?: unknown;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textCase?: string;
  textDecoration?: string;
  textAutoResize?: string;

  constraints?: unknown;

  /** Absolute path when this node was exported as a raster/SVG asset */
  assetPath?: string;

  // Hierarchy
  children?: DesignNode[];
  childCount?: number;
  childrenTruncated?: boolean;
  instanceChildrenSkipped?: boolean;
};

/** Raw asset payload from plugin (base64). MCP writes files and strips `data`. */
export type AssetPayload = {
  /** Stable id used for filename / fill matching */
  id: string;
  kind: "image-fill" | "node-export";
  /** Suggested filename stem (without extension) */
  name: string;
  format: string;
  /** Lowercase extension without dot, e.g. png / jpg / svg */
  ext: string;
  imageHash?: string;
  nodeId?: string;
  nodeIds?: string[];
  width?: number;
  height?: number;
  /** Base64-encoded file bytes (stripped before returning to Agent) */
  data: string;
  bytes?: number;
  error?: string;
};

export type ExportSelectionResult = {
  source: "selection";
  documentName: string;
  page: { id: string; name: string };
  nodes: DesignNode[];
  /** Present when includeAssets was requested (raw base64; MCP strips after write) */
  assets?: AssetPayload[];
};

export type ExportNodeResult = {
  source: "node";
  documentName: string;
  page: { id: string; name: string };
  node: DesignNode;
  assets?: AssetPayload[];
};

export type ExportPageResult = {
  source: "page";
  documentName: string;
  page: { id: string; name: string };
  children: DesignNode[];
  assets?: AssetPayload[];
};

export type DesignTokens = {
  colors: string[];
  fontSizes: number[];
  fontFamilies: string[];
  radii: number[];
  spacings: number[];
};

export type ExportOptions = {
  maxDepth?: number;
  skipHidden?: boolean;
  skipInstanceChildren?: boolean;
  /** When true, plugin also returns raw asset payloads for MCP to write to disk */
  includeAssets?: boolean;
  /** Hint only; MCP server chooses the real output directory */
  outputDir?: string;
};

export type ExportAssetsResult = {
  source: "assets";
  documentName: string;
  page: { id: string; name: string };
  outputDir?: string;
  assets: Array<Omit<AssetPayload, "data"> & { localPath?: string; data?: string }>;
  truncated?: boolean;
  skipped?: number;
  hint?: string;
};
