import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Bridge } from "./bridge.js";

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `错误: ${message}` }],
    isError: true,
  };
}

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
            : "插件已连接，可调用 export_selection / export_node / export_page",
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
    "导出当前选中节点的完整子树（结构+布局+样式+文字）。推荐：在即时设计中选中目标画板后调用。供 Agent 据此写页面。",
    {
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
      clientId: z.string().optional().describe("可选客户端 id"),
    },
    async (args) => {
      try {
        const { clientId, ...params } = args;
        const result = await bridge.call("export_selection", params, {
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
    "export_node",
    "按 nodeId 或 name 导出节点完整子树。name 匹配时取第一个命中。",
    {
      nodeId: z.string().optional().describe("节点 id"),
      name: z.string().optional().describe("节点名称（精确匹配）"),
      maxDepth: z.number().int().min(1).max(50).optional(),
      skipHidden: z.boolean().optional(),
      skipInstanceChildren: z.boolean().optional(),
      clientId: z.string().optional(),
    },
    async (args) => {
      try {
        if (!args.nodeId && !args.name) {
          return errResult(new Error("请提供 nodeId 或 name"));
        }
        const { clientId, ...params } = args;
        const result = await bridge.call("export_node", params, {
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
    "export_page",
    "导出当前页完整节点树。大页面慎用，建议配合 maxDepth / skipHidden。优先用 export_selection 导出单个画板。",
    {
      maxDepth: z.number().int().min(1).max(50).optional(),
      skipHidden: z.boolean().optional(),
      skipInstanceChildren: z.boolean().optional(),
      clientId: z.string().optional(),
    },
    async (args) => {
      try {
        const { clientId, ...params } = args;
        const result = await bridge.call("export_page", params, {
          clientId,
          timeoutMs: 180_000,
        });
        return textResult(result);
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
