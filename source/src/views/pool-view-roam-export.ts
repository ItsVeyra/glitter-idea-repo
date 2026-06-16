import { getInterfaceText } from "../i18n/interface-language";
import type { PluginInterfaceLanguage } from "../settings/settings";

type PoolRoamExportNode = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "source" | "plain";
  poolName?: string;
  poolColor?: string;
  sourceStatus?: "active" | "missing";
};

type PoolRoamExportParsedNode = PoolRoamExportNode & {
  sourceBlockId?: string;
  sourceBlockRole?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isPoolRoamExportSourceMeta(value: unknown): value is {
  poolName: string;
  poolColor: string;
  status?: "active" | "missing";
  ideaTitle?: string;
} {
  return isRecord(value)
    && typeof value.poolName === "string"
    && typeof value.poolColor === "string"
    && (value.status === undefined || value.status === "active" || value.status === "missing")
    && (value.ideaTitle === undefined || typeof value.ideaTitle === "string");
}

function extractPoolRoamExportSourceBlockId(node: unknown): string | undefined {
  if (!isRecord(node) || !isRecord(node.glitterSourceBlock) || typeof node.glitterSourceBlock.sourceBlockId !== "string") {
    return undefined;
  }

  const sourceBlockId = node.glitterSourceBlock.sourceBlockId.trim();
  return sourceBlockId.length > 0 ? sourceBlockId : undefined;
}

function extractPoolRoamExportSourceBlockRole(node: unknown): string | undefined {
  if (!isRecord(node) || !isRecord(node.glitterSourceBlock) || typeof node.glitterSourceBlock.role !== "string") {
    return undefined;
  }

  const role = node.glitterSourceBlock.role.trim();
  return role.length > 0 ? role : undefined;
}

function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeSvgColor(color: string | undefined, fallback: string): string {
  if (!color) {
    return fallback;
  }

  const normalized = color.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(normalized)) {
    return normalized;
  }

  if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/.test(normalized)) {
    return normalized;
  }

  return fallback;
}

function normalizePoolRoamExportText(text: string | undefined): string {
  return (text ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/u, "")
        .replace(/^[-*+]\s+/u, "")
        .replace(/^>\s?/u, "")
        .replace(/`+/g, "")
        .trim()
    )
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitPoolRoamExportText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const normalized = normalizePoolRoamExportText(text);
  if (!normalized || maxCharsPerLine <= 0 || maxLines <= 0) {
    return [];
  }

  const words = normalized.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";
  let clipped = false;

  const pushLine = (line: string) => {
    if (lines.length < maxLines) {
      lines.push(line);
      return;
    }
    clipped = true;
  };

  for (const word of words) {
    if (lines.length >= maxLines) {
      clipped = true;
      break;
    }

    if (word.length > maxCharsPerLine) {
      if (currentLine) {
        pushLine(currentLine);
        currentLine = "";
      }
      for (let index = 0; index < word.length; index += maxCharsPerLine) {
        if (lines.length >= maxLines) {
          clipped = true;
          break;
        }
        const segment = word.slice(index, index + maxCharsPerLine);
        if (segment.length < maxCharsPerLine && index + maxCharsPerLine >= word.length) {
          currentLine = segment;
        } else {
          pushLine(segment);
        }
      }
      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= maxCharsPerLine) {
      currentLine = nextLine;
      continue;
    }

    pushLine(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    pushLine(currentLine);
  }

  if (clipped && lines.length > 0) {
    const lastIndex = lines.length - 1;
    const baseLine = lines[lastIndex].replace(/\s+$/u, "");
    lines[lastIndex] = baseLine.length >= maxCharsPerLine
      ? `${baseLine.slice(0, Math.max(0, maxCharsPerLine - 1))}…`
      : `${baseLine}…`;
  }

  return lines;
}

function resolvePoolRoamExportTextLayout(node: PoolRoamExportNode): {
  textX: number;
  textY: number;
  maxCharsPerLine: number;
  maxLines: number;
} {
  const horizontalPadding = node.kind === "source" ? 28 : 20;
  const hasPoolPill = node.kind === "source" && Boolean(node.poolName);
  const textX = horizontalPadding;
  const textY = hasPoolPill ? 72 : 38;
  const availableWidth = Math.max(48, node.width - horizontalPadding * 2);
  const availableHeight = Math.max(20, node.height - textY - 20);

  return {
    textX,
    textY,
    maxCharsPerLine: Math.max(8, Math.floor(availableWidth / 8.4)),
    maxLines: Math.max(1, Math.floor(availableHeight / 20))
  };
}

function renderPoolRoamExportSourceIcon(x: number, y: number): string {
  return `<text x="${x}" y="${y}" fill="#16324F" font-size="18" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">✨</text>`;
}

function parsePoolRoamExportNodes(boardContent: string): PoolRoamExportNode[] {
  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(boardContent);
  } catch {
    throw new Error("ROAM_BOARD_PARSE_FAILED");
  }

  const nodes = isRecord(parsedContent) && Array.isArray(parsedContent.nodes) ? parsedContent.nodes : [];
  const parsedNodes: PoolRoamExportParsedNode[] = nodes.flatMap((node, index) => {
    if (
      !isRecord(node)
      || typeof node.x !== "number"
      || typeof node.y !== "number"
      || typeof node.width !== "number"
      || typeof node.height !== "number"
    ) {
      return [];
    }

    const sourceMeta = isPoolRoamExportSourceMeta(node.glitterSource) ? node.glitterSource : undefined;
    const text = typeof node.text === "string"
      ? node.text
      : sourceMeta?.ideaTitle ?? `Node ${index + 1}`;

    return [{
      id: typeof node.id === "string" ? node.id : `node-${index + 1}`,
      text,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      kind: sourceMeta ? "source" : "plain",
      poolName: sourceMeta?.poolName,
      poolColor: sourceMeta?.poolColor,
      sourceStatus: sourceMeta?.status,
      sourceBlockId: extractPoolRoamExportSourceBlockId(node),
      sourceBlockRole: extractPoolRoamExportSourceBlockRole(node)
    }];
  });
  const logicalNodes: PoolRoamExportNode[] = [];
  const managedNodesBySourceBlockId = new Map<string, PoolRoamExportParsedNode[]>();

  for (const node of parsedNodes) {
    if (!node.sourceBlockId) {
      logicalNodes.push(node);
      continue;
    }

    const managedNodes = managedNodesBySourceBlockId.get(node.sourceBlockId) ?? [];
    managedNodes.push(node);
    managedNodesBySourceBlockId.set(node.sourceBlockId, managedNodes);
  }

  for (const managedNodes of managedNodesBySourceBlockId.values()) {
    const rootNode = managedNodes.find((node) => node.sourceBlockRole === "root") ?? managedNodes[0];
    const labelNode = managedNodes.find((node) => node.sourceBlockRole === "caption" && node.text.trim().length > 0)
      ?? managedNodes.find((node) => node.text.trim().length > 0)
      ?? rootNode;
    const sourceNode = managedNodes.find((node) => node.kind === "source") ?? rootNode;

    logicalNodes.push({
      id: rootNode.id,
      text: labelNode.text,
      x: rootNode.x,
      y: rootNode.y,
      width: rootNode.width,
      height: rootNode.height,
      kind: sourceNode.kind,
      poolName: sourceNode.poolName,
      poolColor: sourceNode.poolColor,
      sourceStatus: sourceNode.sourceStatus
    });
  }

  return logicalNodes;
}

export function renderPoolRoamBoardSvgExport(input: {
  boardPath: string;
  boardName: string;
  boardContent: string;
  interfaceLanguage: PluginInterfaceLanguage;
}): string {
  const text = getInterfaceText(input.interfaceLanguage);
  const nodes = parsePoolRoamExportNodes(input.boardContent);
  const boardPadding = 72;
  const headerHeight = 124;
  const defaultWidth = 960;
  const defaultHeight = 640;
  const minX = nodes.length > 0 ? Math.min(...nodes.map((node) => node.x)) : 0;
  const minY = nodes.length > 0 ? Math.min(...nodes.map((node) => node.y)) : 0;
  const maxRight = nodes.length > 0 ? Math.max(...nodes.map((node) => node.x + node.width)) : defaultWidth - boardPadding * 2;
  const maxBottom = nodes.length > 0 ? Math.max(...nodes.map((node) => node.y + node.height)) : defaultHeight - headerHeight - boardPadding;
  const contentWidth = Math.max(maxRight - minX, 1);
  const contentHeight = Math.max(maxBottom - minY, 1);
  const svgWidth = Math.max(defaultWidth, Math.ceil(contentWidth + boardPadding * 2));
  const svgHeight = Math.max(defaultHeight, Math.ceil(contentHeight + headerHeight + boardPadding));
  const offsetX = boardPadding - minX;
  const offsetY = headerHeight - minY;

  const renderedNodes = nodes.map((node, index) => {
    const x = node.x + offsetX;
    const y = node.y + offsetY;
    const clipId = `glitter-roam-export-node-clip-${index}`;
    const strokeColor = node.kind === "source"
      ? sanitizeSvgColor(node.poolColor, "#6AB5FF")
      : "#C8D4E3";
    const fillColor = node.kind === "source" ? "rgba(106, 181, 255, 0.12)" : "rgba(255, 255, 255, 0.94)";
    const layout = resolvePoolRoamExportTextLayout(node);
    const labelLines = splitPoolRoamExportText(node.text, layout.maxCharsPerLine, layout.maxLines);
    const labelSvg = labelLines.length === 0
      ? ""
      : `<text x="${layout.textX}" y="${layout.textY}" fill="#16324F" font-size="16" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${labelLines.map((line, lineIndex) => `<tspan x="${layout.textX}" dy="${lineIndex === 0 ? 0 : 20}">${escapeSvgText(line)}</tspan>`).join("")}</text>`;
    const poolPill = node.kind === "source" && node.poolName
      ? `<g><rect x="52" y="16" width="${Math.min(Math.max(node.poolName.length * 8 + 20, 56), Math.max(56, node.width - 92))}" height="24" rx="12" fill="rgba(255, 255, 255, 0.68)" stroke="${strokeColor}" stroke-width="1" /><text x="64" y="32" fill="#48617D" font-size="11" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" letter-spacing="0.04em">${escapeSvgText(node.poolName)}</text></g>`
      : "";
    const sourceIcon = node.kind === "source" ? renderPoolRoamExportSourceIcon(24, 34) : "";
    const statusBadge = node.sourceStatus === "missing"
      ? `<text x="${Math.max(24, node.width - 64)}" y="32" fill="#A63B3B" font-size="11" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${escapeSvgText(text.roamExport.missingStatus)}</text>`
      : "";

    return [
      `<g data-node-id="${escapeSvgText(node.id)}">`,
      `<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="24" /></clipPath></defs>`,
      `<rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="24" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"${node.sourceStatus === "missing" ? ' stroke-dasharray="8 6"' : ""} />`,
      node.kind === "source"
        ? `<rect x="${x}" y="${y}" width="8" height="${node.height}" rx="24" fill="${strokeColor}" />`
        : "",
      `<g clip-path="url(#${clipId})"><g transform="translate(${x}, ${y})">`,
      sourceIcon,
      poolPill,
      statusBadge,
      labelSvg,
      `</g></g>`,
      `</g>`
    ].join("");
  }).join("");

  const emptyState = nodes.length === 0
    ? `<g><rect x="${boardPadding}" y="${headerHeight + 24}" width="${svgWidth - boardPadding * 2}" height="${svgHeight - headerHeight - 48}" rx="28" fill="rgba(255, 255, 255, 0.72)" stroke="#D8E1EF" stroke-width="2" /><text x="${svgWidth / 2}" y="${svgHeight / 2 - 8}" text-anchor="middle" fill="#48617D" font-size="18" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${escapeSvgText(text.roamExport.emptyTitle)}</text><text x="${svgWidth / 2}" y="${svgHeight / 2 + 24}" text-anchor="middle" fill="#6F8398" font-size="13" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${escapeSvgText(text.roamExport.emptySubtitle)}</text></g>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" fill="none" role="img" aria-labelledby="glitter-roam-export-title glitter-roam-export-desc">`,
    `<title id="glitter-roam-export-title">${escapeSvgText(input.boardName)}</title>`,
    `<desc id="glitter-roam-export-desc">${escapeSvgText(input.boardPath)}</desc>`,
    `<rect width="${svgWidth}" height="${svgHeight}" rx="32" fill="#F3F7FD" />`,
    `<rect x="24" y="24" width="${svgWidth - 48}" height="${svgHeight - 48}" rx="28" fill="#FCFEFF" stroke="#D8E1EF" stroke-width="2" />`,
    `<text x="72" y="84" fill="#16324F" font-size="28" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${escapeSvgText(input.boardName)}</text>`,
    `<text x="72" y="112" fill="#6F8398" font-size="13" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${escapeSvgText(input.boardPath)}</text>`,
    emptyState,
    renderedNodes,
    `</svg>`
  ].join("");
}
