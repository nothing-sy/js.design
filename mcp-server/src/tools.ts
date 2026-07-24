import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Bridge } from "./bridge.js";
import type { AssetPayload, DesignNode } from "./schema.js";

/** Spill oversized export JSON to a temp file so Agent can Read the path. */
const LARGE_JSON_CHARS = 400_000;

type WrittenAsset = Omit<AssetPayload, "data"> & {
  localPath?: string;
  data?: undefined;
};

function textResult(data: unknown) {
  const text =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);

  if (text.length > LARGE_JSON_CHARS) {
    const dir = join(tmpdir(), "jsdesign-mcp");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `export-${Date.now()}.json`);
    writeFileSync(filePath, text, "utf8");
    const preview = text.slice(0, 4000);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              spilledToFile: true,
              path: filePath,
              bytes: Buffer.byteLength(text, "utf8"),
              hint: "导出过大，已写入本地 JSON。请用 Read 工具读取 path 后继续写页面。",
              preview,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    content: [{ type: "text" as const, text }],
  };
}

function errResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `错误: ${message}` }],
    isError: true,
  };
}

function defaultAssetsDir(): string {
  return join(tmpdir(), "jsdesign-mcp", "assets", String(Date.now()));
}

function resolveOutputDir(outputDir?: string): string {
  if (outputDir && outputDir.trim()) {
    return resolve(outputDir.trim());
  }
  return defaultAssetsDir();
}

function uniqueFilePath(dir: string, stem: string, ext: string, used: Set<string>): string {
  let base = `${stem}.${ext}`;
  let n = 1;
  while (used.has(base.toLowerCase())) {
    base = `${stem}_${n}.${ext}`;
    n += 1;
  }
  used.add(base.toLowerCase());
  return join(dir, base);
}

/** Decode base64 payloads, write files, return path map + stripped asset list. */
function materializeAssets(
  assets: AssetPayload[] | undefined,
  outputDir?: string,
): {
  outputDir: string;
  assets: WrittenAsset[];
  byImageHash: Map<string, string>;
  byNodeId: Map<string, string>;
} {
  const dir = resolveOutputDir(outputDir);
  mkdirSync(dir, { recursive: true });
  const usedNames = new Set<string>();
  const byImageHash = new Map<string, string>();
  const byNodeId = new Map<string, string>();
  const written: WrittenAsset[] = [];

  for (const asset of assets || []) {
    const { data, ...meta } = asset;
    if (!data || asset.error) {
      written.push({ ...meta, data: undefined });
      continue;
    }
    try {
      const buf = Buffer.from(data, "base64");
      const ext = (asset.ext || "png").replace(/^\./, "");
      const filePath = uniqueFilePath(dir, asset.name || asset.id, ext, usedNames);
      writeFileSync(filePath, buf);
      const item: WrittenAsset = {
        ...meta,
        bytes: buf.length,
        localPath: filePath,
        data: undefined,
      };
      written.push(item);
      if (asset.imageHash) byImageHash.set(asset.imageHash, filePath);
      if (asset.nodeId) byNodeId.set(asset.nodeId, filePath);
      if (Array.isArray(asset.nodeIds)) {
        for (const nid of asset.nodeIds) byNodeId.set(nid, filePath);
      }
    } catch (e) {
      written.push({
        ...meta,
        data: undefined,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { outputDir: dir, assets: written, byImageHash, byNodeId };
}

function patchNodeAssets(
  node: DesignNode,
  byImageHash: Map<string, string>,
  byNodeId: Map<string, string>,
): DesignNode {
  const next: DesignNode = { ...node };
  if (Array.isArray(node.fills)) {
    next.fills = node.fills.map((f) => {
      if (f.type === "IMAGE" && f.imageHash && byImageHash.has(f.imageHash)) {
        return { ...f, localPath: byImageHash.get(f.imageHash) };
      }
      return f;
    });
  }
  if (byNodeId.has(node.id)) {
    next.assetPath = byNodeId.get(node.id);
  }
  if (Array.isArray(node.children)) {
    next.children = node.children.map((c) =>
      patchNodeAssets(c, byImageHash, byNodeId),
    );
  }
  return next;
}

function attachAssetsToExportResult(
  result: Record<string, unknown>,
  outputDir?: string,
): Record<string, unknown> {
  const rawAssets = result.assets as AssetPayload[] | undefined;
  if (!rawAssets || !Array.isArray(rawAssets) || rawAssets.length === 0) {
    const { assets: _drop, ...rest } = result;
    return {
      ...rest,
      assets: [],
      assetsOutputDir: outputDir ? resolveOutputDir(outputDir) : undefined,
      hint: "未发现 IMAGE fill 或带 exportSettings 的切图层。可用 export_assets({ nodeIds }) 强制导出指定节点。",
    };
  }

  const material = materializeAssets(rawAssets, outputDir);
  const out: Record<string, unknown> = {
    ...result,
    assets: material.assets,
    assetsOutputDir: material.outputDir,
  };

  if (Array.isArray(result.nodes)) {
    out.nodes = (result.nodes as DesignNode[]).map((n) =>
      patchNodeAssets(n, material.byImageHash, material.byNodeId),
    );
  }
  if (result.node && typeof result.node === "object") {
    out.node = patchNodeAssets(
      result.node as DesignNode,
      material.byImageHash,
      material.byNodeId,
    );
  }
  if (Array.isArray(result.children)) {
    out.children = (result.children as DesignNode[]).map((n) =>
      patchNodeAssets(n, material.byImageHash, material.byNodeId),
    );
  }

  return out;
}

const exportCommonShape = {
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("最大递归深度，默认不限制（建议大画板设 20）"),
  skipHidden: z
    .boolean()
    .optional()
    .describe("是否跳过不可见节点，默认 true"),
  skipInstanceChildren: z
    .boolean()
    .optional()
    .describe("是否跳过组件实例内部子节点，默认 true"),
  includeAssets: z
    .boolean()
    .optional()
    .describe(
      "为 true 时一并导出 IMAGE fill / exportSettings 切图到本地，并在 fills.localPath / assetPath 写入路径",
    ),
  outputDir: z
    .string()
    .optional()
    .describe(
      "切图输出目录（绝对路径或相对 cwd）。默认写入系统临时目录 jsdesign-mcp/assets/<ts>/",
    ),
  clientId: z.string().optional().describe("可选客户端 id"),
};

export function registerTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    "get_connection_status",
    "检查即时设计 MCP 插件是否已连接，以及当前文档/页面信息。",
    async () => {
      const clients = bridge.listClients();
      return textResult({
        connected: clients.length > 0,
        clientCount: clients.length,
        clients,
        hint:
          clients.length === 0
            ? "请在即时设计中打开「JsDesign MCP Bridge」插件"
            : "插件已连接，可调用 export_selection / export_assets / export_node",
      });
    },
  );

  server.tool(
    "get_document_info",
    "获取当前打开设计文件与页面的基本信息。",
    {
      clientId: z
        .string()
        .optional()
        .describe("多文档时指定插件客户端 id；默认第一个在线客户端"),
    },
    async ({ clientId }) => {
      try {
        const result = await bridge.call("get_document_info", {}, { clientId });
        return textResult(result);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "list_pages",
    "列出设计文件中的所有页面（id / name）。",
    {
      clientId: z.string().optional().describe("可选客户端 id"),
    },
    async ({ clientId }) => {
      try {
        const result = await bridge.call("list_pages", {}, { clientId });
        return textResult(result);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "list_top_frames",
    "列出当前页顶层画板/Frame/组件，便于先选要做的那一屏再导出。",
    {
      clientId: z.string().optional().describe("可选客户端 id"),
    },
    async ({ clientId }) => {
      try {
        const result = await bridge.call("list_top_frames", {}, { clientId });
        return textResult(result);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "export_selection",
    "导出当前选中节点的完整子树（结构+布局+样式+文字）。设 includeAssets=true 可同时导出切图到本地。推荐：在即时设计中选中目标画板后调用。",
    exportCommonShape,
    async (args) => {
      try {
        const { clientId, includeAssets, outputDir, ...params } = args;
        const result = (await bridge.call(
          "export_selection",
          { ...params, includeAssets: !!includeAssets },
          {
            clientId,
            timeoutMs: includeAssets ? 180_000 : 120_000,
          },
        )) as Record<string, unknown>;

        if (includeAssets) {
          return textResult(attachAssetsToExportResult(result, outputDir));
        }
        return textResult(result);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "export_node",
    "按 nodeId 或 name 导出节点完整子树。name 匹配时取第一个命中。可设 includeAssets 一并导出切图。",
    {
      nodeId: z.string().optional().describe("节点 id"),
      name: z.string().optional().describe("节点名称（精确匹配）"),
      ...exportCommonShape,
    },
    async (args) => {
      try {
        if (!args.nodeId && !args.name) {
          return errResult(new Error("请提供 nodeId 或 name"));
        }
        const { clientId, includeAssets, outputDir, ...params } = args;
        const result = (await bridge.call(
          "export_node",
          { ...params, includeAssets: !!includeAssets },
          {
            clientId,
            timeoutMs: includeAssets ? 180_000 : 120_000,
          },
        )) as Record<string, unknown>;

        if (includeAssets) {
          return textResult(attachAssetsToExportResult(result, outputDir));
        }
        return textResult(result);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "export_page",
    "导出当前页完整节点树。大页面慎用，建议配合 maxDepth / skipHidden。优先用 export_selection 导出单个画板。可设 includeAssets。",
    exportCommonShape,
    async (args) => {
      try {
        const { clientId, includeAssets, outputDir, ...params } = args;
        const result = (await bridge.call(
          "export_page",
          { ...params, includeAssets: !!includeAssets },
          {
            clientId,
            timeoutMs: includeAssets ? 240_000 : 180_000,
          },
        )) as Record<string, unknown>;

        if (includeAssets) {
          return textResult(attachAssetsToExportResult(result, outputDir));
        }
        return textResult(result);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "export_assets",
    "导出选区（或指定节点）中的切图/图片资源到本地目录。收集 IMAGE fill（getImageByHash）与带 exportSettings 的节点（exportAsync）。返回 localPath 清单供写页面引用，不把 base64 回传给 Agent。",
    {
      nodeId: z.string().optional().describe("从该节点子树收集资源"),
      name: z.string().optional().describe("按名称定位根节点"),
      nodeIds: z
        .array(z.string())
        .optional()
        .describe("强制对这些节点做 exportAsync（复杂图标/切图层）"),
      outputDir: z
        .string()
        .optional()
        .describe(
          "输出目录。默认 %TEMP%/jsdesign-mcp/assets/<ts>/。写静态页时建议传项目 public/design-assets",
        ),
      format: z
        .enum(["PNG", "JPG", "SVG"])
        .optional()
        .describe("节点 exportAsync 默认格式（有 exportSettings 时优先用设置）。默认 PNG"),
      scale: z
        .number()
        .positive()
        .optional()
        .describe("PNG/JPG 缩放倍数，默认 2"),
      maxAssets: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("单次最多导出张数，默认 50"),
      skipHidden: z.boolean().optional(),
      skipInstanceChildren: z.boolean().optional(),
      clientId: z.string().optional(),
    },
    async (args) => {
      try {
        const { clientId, outputDir, ...params } = args;
        const result = (await bridge.call("export_assets", params, {
          clientId,
          timeoutMs: 180_000,
        })) as {
          source: string;
          documentName: string;
          page: { id: string; name: string };
          assets: AssetPayload[];
          truncated?: boolean;
          skipped?: number;
          hint?: string;
        };

        const material = materializeAssets(result.assets, outputDir);
        return textResult({
          source: "assets",
          documentName: result.documentName,
          page: result.page,
          outputDir: material.outputDir,
          assets: material.assets,
          truncated: result.truncated,
          skipped: result.skipped,
          hint:
            result.hint ||
            "请用 assets[].localPath 作为 img/src 或 CSS background-image；IMAGE fill 可通过 imageHash 与 export_selection 节点对应。",
        });
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "get_design_tokens",
    "从当前选区（或指定节点）提取颜色、字号、间距、圆角等设计令牌去重列表，便于写页面时统一 token。",
    {
      nodeId: z.string().optional().describe("可选：从该节点子树提取；默认当前选区"),
      name: z.string().optional().describe("可选：按名称定位节点"),
      clientId: z.string().optional(),
    },
    async (args) => {
      try {
        const { clientId, ...params } = args;
        const result = await bridge.call("get_design_tokens", params, {
          clientId,
          timeoutMs: 120_000,
        });
        return textResult(result);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "get_node_css",
    "为单个节点生成近似 CSS 摘要（辅助参考；主交付仍是 export_* JSON）。",
    {
      nodeId: z.string().optional(),
      name: z.string().optional(),
      clientId: z.string().optional(),
    },
    async (args) => {
      try {
        if (!args.nodeId && !args.name) {
          return errResult(new Error("请提供 nodeId 或 name"));
        }
        const { clientId, ...params } = args;
        const result = await bridge.call("get_node_css", params, { clientId });
        return textResult(result);
      } catch (e) {
        return errResult(e);
      }
    },
  );
}
