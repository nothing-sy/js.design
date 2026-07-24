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

  // Hierarchy
  children?: DesignNode[];
  childCount?: number;
  childrenTruncated?: boolean;
  instanceChildrenSkipped?: boolean;
};

export type ExportSelectionResult = {
  source: "selection";
  documentName: string;
  page: { id: string; name: string };
  nodes: DesignNode[];
};

export type ExportNodeResult = {
  source: "node";
  documentName: string;
  page: { id: string; name: string };
  node: DesignNode;
};

export type ExportPageResult = {
  source: "page";
  documentName: string;
  page: { id: string; name: string };
  children: DesignNode[];
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
};
