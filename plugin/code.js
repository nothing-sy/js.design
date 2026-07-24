/**
 * JsDesign MCP Bridge — main thread (sandbox)
 * Serializes design nodes for Agent codegen. Read-only.
 */

/* global jsDesign */

const DEFAULTS = {
  skipHidden: true,
  skipInstanceChildren: true,
  maxDepth: 40,
};

jsDesign.showUI(__html__, { width: 320, height: 220 });

jsDesign.ui.onmessage = async (msg) => {
  if (!msg || typeof msg !== "object") return;
  const { id, method, params } = msg;
  if (!id || !method) return;

  try {
    const result = await handleMethod(method, params || {});
    jsDesign.ui.postMessage({ type: "rpc-result", id, ok: true, result });
  } catch (err) {
    jsDesign.ui.postMessage({
      type: "rpc-result",
      id,
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
};

// Notify UI of document context for hello handshake
jsDesign.ui.postMessage({
  type: "doc-info",
  documentName: jsDesign.root && jsDesign.root.name,
  pageName: jsDesign.currentPage && jsDesign.currentPage.name,
});

async function handleMethod(method, params) {
  switch (method) {
    case "get_document_info":
      return getDocumentInfo();
    case "list_pages":
      return listPages();
    case "list_top_frames":
      return listTopFrames();
    case "export_selection":
      return exportSelection(params);
    case "export_node":
      return exportNode(params);
    case "export_page":
      return exportPage(params);
    case "get_design_tokens":
      return getDesignTokens(params);
    case "get_node_css":
      return getNodeCss(params);
    case "ping":
      return { pong: true, at: Date.now() };
    default:
      throw new Error("未知方法: " + method);
  }
}

function getDocumentInfo() {
  return {
    documentName: jsDesign.root.name,
    documentId: jsDesign.root.id,
    currentPage: {
      id: jsDesign.currentPage.id,
      name: jsDesign.currentPage.name,
    },
    selectionCount: jsDesign.currentPage.selection.length,
  };
}

function listPages() {
  const pages = [];
  for (const page of jsDesign.root.children || []) {
    if (page.type === "PAGE") {
      pages.push({ id: page.id, name: page.name });
    }
  }
  return { pages, currentPageId: jsDesign.currentPage.id };
}

function listTopFrames() {
  const frames = [];
  for (const child of jsDesign.currentPage.children || []) {
    frames.push({
      id: child.id,
      name: child.name,
      type: child.type,
      width: "width" in child ? child.width : undefined,
      height: "height" in child ? child.height : undefined,
    });
  }
  return { pageId: jsDesign.currentPage.id, pageName: jsDesign.currentPage.name, frames };
}

function resolveOptions(params) {
  return {
    maxDepth:
      typeof params.maxDepth === "number" ? params.maxDepth : DEFAULTS.maxDepth,
    skipHidden:
      typeof params.skipHidden === "boolean"
        ? params.skipHidden
        : DEFAULTS.skipHidden,
    skipInstanceChildren:
      typeof params.skipInstanceChildren === "boolean"
        ? params.skipInstanceChildren
        : DEFAULTS.skipInstanceChildren,
  };
}

function applyTraverseFlags(opts) {
  try {
    if (opts.skipInstanceChildren) {
      jsDesign.skipInvisibleInstanceChildren = true;
    }
  } catch (_) {
    /* older API */
  }
}

function exportSelection(params) {
  const selection = jsDesign.currentPage.selection;
  if (!selection || selection.length === 0) {
    throw new Error("当前没有选中节点。请在即时设计中选中目标画板/图层后再导出。");
  }
  const opts = resolveOptions(params);
  applyTraverseFlags(opts);
  return {
    source: "selection",
    documentName: jsDesign.root.name,
    page: { id: jsDesign.currentPage.id, name: jsDesign.currentPage.name },
    nodes: selection.map((n) => serializeNode(n, 0, opts)),
  };
}

function findNodeByIdOrName(nodeId, name) {
  if (nodeId) {
    const byId = jsDesign.getNodeById(nodeId);
    if (byId) return byId;
  }
  if (name) {
    const found = jsDesign.currentPage.findOne((n) => n.name === name);
    if (found) return found;
  }
  return null;
}

function exportNode(params) {
  const node = findNodeByIdOrName(params.nodeId, params.name);
  if (!node) {
    throw new Error(
      "未找到节点" +
        (params.nodeId ? " id=" + params.nodeId : "") +
        (params.name ? " name=" + params.name : ""),
    );
  }
  const opts = resolveOptions(params);
  applyTraverseFlags(opts);
  return {
    source: "node",
    documentName: jsDesign.root.name,
    page: { id: jsDesign.currentPage.id, name: jsDesign.currentPage.name },
    node: serializeNode(node, 0, opts),
  };
}

function exportPage(params) {
  const opts = resolveOptions(params);
  applyTraverseFlags(opts);
  const page = jsDesign.currentPage;
  const children = [];
  for (const child of page.children || []) {
    if (opts.skipHidden && "visible" in child && child.visible === false) continue;
    children.push(serializeNode(child, 0, opts));
  }
  return {
    source: "page",
    documentName: jsDesign.root.name,
    page: { id: page.id, name: page.name },
    children,
  };
}

function getDesignTokens(params) {
  let roots = [];
  if (params.nodeId || params.name) {
    const node = findNodeByIdOrName(params.nodeId, params.name);
    if (!node) throw new Error("未找到用于提取 tokens 的节点");
    roots = [node];
  } else if (jsDesign.currentPage.selection.length > 0) {
    roots = [...jsDesign.currentPage.selection];
  } else {
    roots = [...(jsDesign.currentPage.children || [])];
  }

  const opts = resolveOptions({ maxDepth: 40, skipHidden: true, skipInstanceChildren: true });
  applyTraverseFlags(opts);
  const trees = roots.map((n) => serializeNode(n, 0, opts));
  return extractTokens(trees);
}

function getNodeCss(params) {
  const node = findNodeByIdOrName(params.nodeId, params.name);
  if (!node) throw new Error("未找到节点");
  const serialized = serializeNode(node, 0, {
    maxDepth: 1,
    skipHidden: false,
    skipInstanceChildren: true,
  });
  return {
    nodeId: node.id,
    name: node.name,
    css: nodeToCss(serialized),
  };
}

// ——— serialization ———

function serializeNode(node, depth, opts) {
  const out = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if ("visible" in node) out.visible = node.visible;
  if ("locked" in node) out.locked = node.locked;

  if ("x" in node) out.x = node.x;
  if ("y" in node) out.y = node.y;
  if ("width" in node) out.width = node.width;
  if ("height" in node) out.height = node.height;
  if ("rotation" in node) out.rotation = node.rotation;
  if ("opacity" in node) out.opacity = node.opacity;
  if ("blendMode" in node) out.blendMode = node.blendMode;

  // Layout (auto-layout frames)
  copyIfPresent(node, out, [
    "layoutMode",
    "primaryAxisSizingMode",
    "counterAxisSizingMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "itemSpacing",
    "layoutAlign",
    "layoutGrow",
    "layoutPositioning",
    "clipsContent",
  ]);

  // Visual
  if ("fills" in node && node.fills !== jsDesign.mixed) {
    out.fills = serializePaints(node.fills);
  }
  if ("strokes" in node && node.strokes !== jsDesign.mixed) {
    out.strokes = serializePaints(node.strokes);
  }
  if ("strokeWeight" in node && node.strokeWeight !== jsDesign.mixed) {
    out.strokeWeight = node.strokeWeight;
  }
  if ("strokeAlign" in node) out.strokeAlign = node.strokeAlign;
  if ("dashPattern" in node) out.dashPattern = node.dashPattern;

  if ("cornerRadius" in node && node.cornerRadius !== jsDesign.mixed) {
    out.cornerRadius = node.cornerRadius;
  }
  copyIfPresent(node, out, [
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
  ]);

  if ("effects" in node && node.effects !== jsDesign.mixed) {
    out.effects = serializeEffects(node.effects);
  }

  // Text
  if (node.type === "TEXT") {
    if ("characters" in node) out.characters = node.characters;
    if ("fontSize" in node && node.fontSize !== jsDesign.mixed) out.fontSize = node.fontSize;
    if ("fontName" in node && node.fontName !== jsDesign.mixed) out.fontName = node.fontName;
    if ("lineHeight" in node && node.lineHeight !== jsDesign.mixed) out.lineHeight = node.lineHeight;
    if ("letterSpacing" in node && node.letterSpacing !== jsDesign.mixed) {
      out.letterSpacing = node.letterSpacing;
    }
    copyIfPresent(node, out, [
      "textAlignHorizontal",
      "textAlignVertical",
      "textCase",
      "textDecoration",
      "textAutoResize",
    ]);
  }

  // Constraints
  if ("constraints" in node) out.constraints = node.constraints;

  // Children
  if ("children" in node && Array.isArray(node.children)) {
    if (depth >= opts.maxDepth) {
      out.childrenTruncated = true;
      out.childCount = node.children.length;
    } else if (opts.skipInstanceChildren && node.type === "INSTANCE") {
      out.childCount = node.children.length;
      out.instanceChildrenSkipped = true;
    } else {
      const kids = [];
      for (const child of node.children) {
        if (opts.skipHidden && "visible" in child && child.visible === false) continue;
        kids.push(serializeNode(child, depth + 1, opts));
      }
      out.children = kids;
    }
  }

  return out;
}

function copyIfPresent(src, dest, keys) {
  for (const k of keys) {
    if (k in src) {
      try {
        const v = src[k];
        if (v !== undefined && v !== jsDesign.mixed) dest[k] = v;
      } catch (_) {
        /* skip */
      }
    }
  }
}

function serializePaints(fills) {
  if (!Array.isArray(fills)) return [];
  return fills.map((p) => {
    const paint = { type: p.type, visible: p.visible !== false, opacity: p.opacity };
    if (p.type === "SOLID" && p.color) {
      paint.color = rgbaToHex(p.color, p.opacity);
      paint.rgb = p.color;
    }
    if (p.type === "IMAGE") {
      paint.scaleMode = p.scaleMode;
      paint.imageHash = p.imageHash;
    }
    if (p.type === "GRADIENT_LINEAR" || p.type === "GRADIENT_RADIAL" || p.type === "GRADIENT_ANGULAR") {
      paint.gradientStops = (p.gradientStops || []).map((s) => ({
        position: s.position,
        color: rgbaToHex(s.color, s.color.a),
        rgb: s.color,
      }));
      if (p.gradientTransform) paint.gradientTransform = p.gradientTransform;
    }
    return paint;
  });
}

function serializeEffects(effects) {
  if (!Array.isArray(effects)) return [];
  return effects.map((e) => ({
    type: e.type,
    visible: e.visible !== false,
    radius: e.radius,
    color: e.color ? rgbaToHex(e.color, e.color.a) : undefined,
    offset: e.offset,
    spread: e.spread,
  }));
}

function rgbaToHex(color, opacity) {
  if (!color) return undefined;
  const r = Math.round((color.r || 0) * 255);
  const g = Math.round((color.g || 0) * 255);
  const b = Math.round((color.b || 0) * 255);
  const a = opacity !== undefined && opacity !== null ? opacity : color.a !== undefined ? color.a : 1;
  const toHex = (n) => n.toString(16).padStart(2, "0");
  if (a < 1) {
    return "rgba(" + r + ", " + g + ", " + b + ", " + round(a, 3) + ")";
  }
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

function round(n, d) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

// ——— tokens ———

function extractTokens(trees) {
  const colors = new Set();
  const fontSizes = new Set();
  const fontFamilies = new Set();
  const radii = new Set();
  const spacings = new Set();

  function walk(n) {
    if (!n) return;
    if (Array.isArray(n.fills)) {
      for (const f of n.fills) {
        if (f.color) colors.add(f.color);
        if (f.gradientStops) {
          for (const s of f.gradientStops) if (s.color) colors.add(s.color);
        }
      }
    }
    if (Array.isArray(n.strokes)) {
      for (const s of n.strokes) if (s.color) colors.add(s.color);
    }
    if (typeof n.fontSize === "number") fontSizes.add(n.fontSize);
    if (n.fontName && n.fontName.family) fontFamilies.add(n.fontName.family + "/" + (n.fontName.style || ""));
    if (typeof n.cornerRadius === "number") radii.add(n.cornerRadius);
    for (const k of ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "itemSpacing"]) {
      if (typeof n[k] === "number") spacings.add(n[k]);
    }
    if (Array.isArray(n.children)) n.children.forEach(walk);
  }

  trees.forEach(walk);

  return {
    colors: [...colors],
    fontSizes: [...fontSizes].sort((a, b) => a - b),
    fontFamilies: [...fontFamilies],
    radii: [...radii].sort((a, b) => a - b),
    spacings: [...spacings].sort((a, b) => a - b),
  };
}

function nodeToCss(n) {
  const lines = [];
  if (typeof n.width === "number") lines.push("width: " + Math.round(n.width) + "px;");
  if (typeof n.height === "number") lines.push("height: " + Math.round(n.height) + "px;");
  if (n.layoutMode === "HORIZONTAL") {
    lines.push("display: flex;");
    lines.push("flex-direction: row;");
  } else if (n.layoutMode === "VERTICAL") {
    lines.push("display: flex;");
    lines.push("flex-direction: column;");
  }
  if (typeof n.itemSpacing === "number") lines.push("gap: " + n.itemSpacing + "px;");
  if (typeof n.paddingTop === "number") {
    lines.push(
      "padding: " +
        [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].map((v) => (v || 0) + "px").join(" ") +
        ";",
    );
  }
  if (typeof n.cornerRadius === "number") lines.push("border-radius: " + n.cornerRadius + "px;");
  if (Array.isArray(n.fills)) {
    const solid = n.fills.find((f) => f.type === "SOLID" && f.visible !== false);
    if (solid && solid.color) lines.push("background: " + solid.color + ";");
  }
  if (n.type === "TEXT") {
    if (n.fontSize) lines.push("font-size: " + n.fontSize + "px;");
    if (n.fontName && n.fontName.family) lines.push("font-family: \"" + n.fontName.family + "\";");
    if (n.characters !== undefined) lines.push("/* content: " + JSON.stringify(n.characters).slice(0, 80) + " */");
  }
  if (typeof n.opacity === "number" && n.opacity < 1) lines.push("opacity: " + n.opacity + ";");
  return lines.join("\n");
}
