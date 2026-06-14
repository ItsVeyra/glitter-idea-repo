import { ItemView, Menu, TFile, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import {
  formatPoolRoamBoardDisplayName,
  type PoolRoamBoardRecord
} from "../application/pool-workbench/pool-roam-workflow";
import { isIdeaSnippetStartLine } from "../editor/snippet-serializer";
import { createToastService } from "../feedback/toast-service";
import { getInterfaceText } from "../i18n/interface-language";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { CREATE_NEW_POOL_ID, GLITTER_ICON_ID, POOL_VIEW_TYPE } from "../plugin/constants";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import type { PluginInterfaceLanguage } from "../settings/settings";
import { renderPoolView, syncRenderedPoolCardMenus } from "../ui/pool/render-pool";
import {
  DEFAULT_POOL_ROAM_PANEL_WIDTH_RATIO,
  MAX_POOL_ROAM_PANEL_WIDTH_RATIO,
  MIN_POOL_ROAM_PANEL_WIDTH_RATIO,
  buildPoolViewStateFromRuntime,
  type PoolBrowseOverlay,
  type PoolRoamBoundaryAnchorState,
  type PoolRoamPanelState
} from "../ui/pool/pool-state";
import {
  applyPoolViewHistoryState,
  applyPoolViewNavigationOptions,
  readPoolViewState,
  type PoolViewContentFilter,
  type PoolViewHistoryState,
  type PoolViewLocalState,
  type PoolViewLocalStateResult,
  type PoolViewNavigationOptions,
  type PoolViewScope,
  type PoolViewSort,
  type PoolViewStatus
} from "./pool-view-history";
import {
  captureCardGridScrollSnapshot,
  captureTextSelectionSnapshot,
  clearPoolViewSearchHitStyles,
  restoreCardGridScrollSnapshot,
  restoreTextSelectionSnapshot,
  revealPoolViewSearchHitCard
} from "./pool-view-render-transient";
import { createPoolViewActions } from "./pool-view-actions";
import {
  createPoolMarkdownPreviewRenderer,
  isPoolMarkdownPreviewAvailableForPoolId as isPoolMarkdownPreviewAvailableForPoolIdValue,
  resolvePoolMarkdownPreview as resolvePoolMarkdownPreviewValue,
  savePoolMarkdownPreviewFile
} from "./pool-view-markdown-preview";
import { createPoolRoamCanvasHost } from "./pool-roam-canvas-host";
import { PoolRoamBoardModal } from "./pool-roam-board-modal";
import { createPoolViewRoamController } from "./pool-view-roam";
import { PoolRoamHistoryModal } from "./pool-roam-history-modal";
import { PoolModal } from "./pool-modal";
import { SnippetLocationsModal } from "./snippet-locations-modal";

type PoolBrowseRuntimeState = Awaited<ReturnType<GlitterPlugin["poolWorkbenchWorkflow"]["loadPoolState"]>>;
type PoolMarkdownPreviewData = Awaited<ReturnType<GlitterPlugin["poolWorkbenchWorkflow"]["loadPoolMarkdownPreview"]>>;
type PoolRoamAttachResult = Awaited<ReturnType<GlitterPlugin["poolWorkbenchWorkflow"]["attachIdeaSourceToRoamBoard"]>>;
type PoolRoamBoardReadResult = Awaited<ReturnType<GlitterPlugin["poolWorkbenchWorkflow"]["readPoolRoamBoard"]>>;
type SessionBoundaryAnchor = Omit<PoolRoamBoundaryAnchorState, "visibleBridge">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isSessionBoundarySourceMeta(value: unknown): value is Omit<SessionBoundaryAnchor, "anchorId"> {
  return (
    isRecord(value)
    && typeof value.ideaId === "string"
    && typeof value.poolId === "string"
    && typeof value.poolName === "string"
    && typeof value.poolColor === "string"
    && typeof value.ideaTitle === "string"
  );
}

function isRootSessionBoundaryAnchorNode(node: unknown): boolean {
  if (!isRecord(node) || !isRecord(node.glitterSourceBlock)) {
    return true;
  }

  return typeof node.glitterSourceBlock.role === "string"
    && node.glitterSourceBlock.role.trim() === "root";
}

function extractSessionBoundaryAnchors(canvas: PoolRoamAttachResult["canvas"]): SessionBoundaryAnchor[] {
  return canvas.nodes.flatMap((node) => {
    if (
      typeof node.id !== "string"
      || !isSessionBoundarySourceMeta(node.glitterSource)
      || !isRootSessionBoundaryAnchorNode(node)
    ) {
      return [];
    }

    return [{
      anchorId: node.id,
      ideaId: node.glitterSource.ideaId,
      poolId: node.glitterSource.poolId,
      poolName: node.glitterSource.poolName,
      poolColor: node.glitterSource.poolColor,
      ideaTitle: node.glitterSource.ideaTitle
    }];
  });
}

function buildRoamSourceContent(card: PoolBrowseRuntimeState["cards"][number]) {
  return {
    title: card.title,
    body: card.body,
    contentType: card.contentType,
    sourceUrl: card.sourceUrl,
    attachmentPaths: [...card.attachmentPaths]
  };
}

function canCreatePoolRoamCanvasHost(app: unknown): app is {
  vault: { getAbstractFileByPath: (path: string) => unknown };
  workspace: { getLeaf: (newLeaf: boolean) => { openFile: (file: TFile) => Promise<void>; detach?: () => void } };
} {
  return Boolean(app)
    && typeof app === "object"
    && typeof (app as { vault?: { getAbstractFileByPath?: unknown } }).vault?.getAbstractFileByPath === "function"
    && typeof (app as { workspace?: { getLeaf?: unknown } }).workspace?.getLeaf === "function";
}

function canObservePoolRoamBoardVault(app: unknown): app is {
  vault: { on: (name: string, callback: (file: { path: string }) => void) => unknown };
} {
  return Boolean(app)
    && typeof app === "object"
    && typeof (app as { vault?: { on?: unknown } }).vault?.on === "function";
}

function buildSessionBoundaryAnchorIdentity(
  anchor: Pick<SessionBoundaryAnchor, "anchorId" | "ideaId" | "poolId" | "poolName" | "poolColor" | "ideaTitle">
): string {
  return [anchor.anchorId, anchor.ideaId, anchor.poolId, anchor.poolName, anchor.poolColor, anchor.ideaTitle].join("\u0000");
}

function hasSameSessionBoundaryAnchors(
  current: PoolRoamBoundaryAnchorState[],
  next: SessionBoundaryAnchor[]
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  const currentKeys = current.map((anchor) => buildSessionBoundaryAnchorIdentity(anchor)).sort();
  const nextKeys = next.map((anchor) => buildSessionBoundaryAnchorIdentity(anchor)).sort();
  return currentKeys.every((key, index) => key === nextKeys[index]);
}

function canWriteToClipboard(navigatorValue: unknown): navigatorValue is {
  clipboard: { writeText: (text: string) => Promise<void> };
} {
  return Boolean(navigatorValue)
    && typeof navigatorValue === "object"
    && typeof (navigatorValue as { clipboard?: { writeText?: unknown } }).clipboard?.writeText === "function";
}

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

// 导出时把 managed source block 重新折叠成一个逻辑节点，避免多图块在导出结果里被拆成多条来源记录。
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

function renderPoolRoamBoardSvgExport(input: {
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

// 池页面宿主：统一管理查询、筛选、批量模式、卡片菜单、池切换、Markdown 预览与文件跳转。
export class GlitterPoolView extends ItemView {
  private query = "";

  private queryDraft = "";

  private activeSearchHitIdeaId: string | null = null;

  private activeSearchHitPulse = false;

  private clearSearchHitTimer: ReturnType<typeof setTimeout> | null = null;

  private preserveQueryFocusOnNextRender = false;

  private preserveCardMoveSearchFocusOnNextRender = false;

  private preserveResultScrollOnNextRender = false;

  private status: PoolViewStatus = "all";

  private contentFilter: PoolViewContentFilter = "all";

  private sort: PoolViewSort = "updated-desc";

  private selectedIdeaIds = new Set<string>();

  private activePoolId: string | undefined;

  private pendingNavigationPoolId: string | undefined;

  private navigationMode: "browse" = "browse";

  private browseScope: PoolViewScope = "pool";

  private batchMode = false;

  private poolMarkdownPreviewOpen = false;

  private poolRoamOpen = false;

  private poolRoamBoardPath: string | undefined;

  private poolRoamErrorMessage: string | undefined;

  private poolRoamBackConfirmVisible = false;

  private poolRoamPaneRatio = DEFAULT_POOL_ROAM_PANEL_WIDTH_RATIO;

  private poolMarkdownPreviewSaving = false;

  private readonly poolMarkdownPreviewRenderer: ReturnType<typeof createPoolMarkdownPreviewRenderer>;

  private readonly poolRoamController: ReturnType<typeof createPoolViewRoamController>;

  private activePoolRoamHistoryModal: PoolRoamHistoryModal | undefined;

  private activePoolRoamBoardModal: PoolRoamBoardModal | undefined;

  private activeBrowseOverlay: PoolBrowseOverlay | undefined;

  private activeCardMenuIdeaId: string | undefined;

  private activeCardMoveIdeaId: string | undefined;

  private cardMoveSubmittingIdeaId: string | undefined;

  private cardMoveInFlightIdeaId: string | undefined;

  private cardMoveSearchQuery = "";

  private poolSwitcherActivePoolId: string | undefined;

  private poolSwitcherPoolIds: string[] = [];

  private poolSwitcherAlignOnOpen = false;

  private poolSwitcherRevealActiveItem = false;

  private lastBrowseRuntime?: PoolBrowseRuntimeState;

  private lastRenderedBrowseRuntime?: PoolBrowseRuntimeState;

  private lastPoolMarkdownPreview?: PoolMarkdownPreviewData;

  private pointerDownCloseHandler?: (event: PointerEvent) => void;

  private escapeCloseHandler?: (event: KeyboardEvent) => void;

  private renderVersion = 0;

  private roamPanelSyncVersion = 0;

  private poolRoamHistoryRequestVersion = 0;

  private pendingBrowseRenderVersion?: number;

  private renderedBrowseRuntimeVersion = 0;

  private isClosed = false;

  private readonly toastService = createToastService();

  constructor(
    private readonly hostLeaf: WorkspaceLeaf,
    private readonly plugin: GlitterPlugin
  ) {
    super(hostLeaf);
    this.poolMarkdownPreviewRenderer = createPoolMarkdownPreviewRenderer(this);
    this.poolRoamController = createPoolViewRoamController({
      canvasHost: canCreatePoolRoamCanvasHost(this.plugin.app)
        ? createPoolRoamCanvasHost(this.plugin.app as Parameters<typeof createPoolRoamCanvasHost>[0])
        : undefined
    });
  }

  override getViewType(): string {
    return POOL_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Glitter Pool";
  }

  override getIcon(): string {
    return GLITTER_ICON_ID;
  }

  override async onOpen(): Promise<void> {
    this.isClosed = false;
    this.contentEl?.addClass?.("glitter-idea-pool-view-host");

    if (canObservePoolRoamBoardVault(this.plugin.app)) {
      this.registerEvent(
        this.plugin.app.vault.on("modify", (file: { path: string }) => {
          const boardPath = this.poolRoamBoardPath;
          if (this.browseScope !== "pool" || !this.poolRoamOpen || !boardPath || file.path !== boardPath) {
            return;
          }

          void this.syncPoolRoamBoundaryAnchorsFromBoard(boardPath);
        }) as never
      );
    }

    this.applyLocalStateResult(
      applyPoolViewHistoryState(this.snapshotLocalState(), readPoolViewState(this.hostLeaf.getViewState?.()?.state))
    );

    await this.renderPoolShellSafely();
  }

  override async onClose(): Promise<void> {
    this.isClosed = true;
    this.renderVersion += 1;
    this.poolRoamHistoryRequestVersion += 1;
    this.clearSearchHitTimeout();
    this.detachPoolSwitcherCloseHandlers();
    this.setBrowseOverlay(undefined);
    this.activeCardMenuIdeaId = undefined;
    this.activeCardMoveIdeaId = undefined;
    this.cardMoveSubmittingIdeaId = undefined;
    this.cardMoveInFlightIdeaId = undefined;
    this.cardMoveSearchQuery = "";
    this.pendingBrowseRenderVersion = undefined;
    this.lastRenderedBrowseRuntime = undefined;
    this.lastPoolMarkdownPreview = undefined;
    this.activePoolRoamBoardModal?.close();
    this.activePoolRoamBoardModal = undefined;
    this.activePoolRoamHistoryModal?.close();
    this.activePoolRoamHistoryModal = undefined;
    this.poolMarkdownPreviewRenderer.release();
    this.poolRoamController.destroy();
    this.contentEl?.removeClass?.("glitter-idea-pool-view-host");
    this.contentEl.empty();
  }

  override getState(): PoolViewHistoryState {
    return {
      ...(this.navigationMode === "browse" && this.browseScope === "pool" && this.activePoolId
        ? { poolId: this.activePoolId }
        : {}),
      mode: this.navigationMode,
      ...(this.browseScope === "global-status" ? { scope: this.browseScope } : {}),
      ...(this.browseScope === "pool"
        ? {
            poolMarkdownPreviewOpen: this.poolMarkdownPreviewOpen,
            ...(this.poolRoamOpen ? { poolRoamOpen: true } : {}),
            ...(this.poolRoamBoardPath ? { poolRoamBoardPath: this.poolRoamBoardPath } : {})
          }
        : {}),
      query: this.query,
      status: this.status,
      contentFilter: this.contentFilter,
      sort: this.sort,
      batchMode: this.batchMode
    };
  }

  override async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    this.applyLocalStateResult(applyPoolViewHistoryState(this.snapshotLocalState(), readPoolViewState(state)));

    if (!this.isClosed) {
      this.renderPoolShell();
    }
  }

  // 本地状态快照与恢复：保证切页、重开视图、浏览历史回放时能回到同一浏览语义。
  private snapshotLocalState(): PoolViewLocalState {
    return {
      activePoolId: this.activePoolId,
      pendingNavigationPoolId: this.pendingNavigationPoolId,
      navigationMode: this.navigationMode,
      browseScope: this.browseScope,
      query: this.query,
      queryDraft: this.queryDraft,
      status: this.status,
      contentFilter: this.contentFilter,
      sort: this.sort,
      batchMode: this.batchMode,
      poolMarkdownPreviewOpen: this.poolMarkdownPreviewOpen,
      poolRoamOpen: this.poolRoamOpen,
      poolRoamBoardPath: this.poolRoamBoardPath
    };
  }

  private applyLocalStateResult(result: PoolViewLocalStateResult): void {
    this.activePoolId = result.activePoolId;
    this.pendingNavigationPoolId = result.pendingNavigationPoolId;
    this.navigationMode = result.navigationMode;
    this.browseScope = result.browseScope;
    this.query = result.query;
    this.queryDraft = result.queryDraft;
    this.status = result.status;
    this.contentFilter = result.contentFilter;
    this.sort = result.sort;
    this.batchMode = result.batchMode;
    this.poolMarkdownPreviewOpen = result.poolMarkdownPreviewOpen;
    const nextPoolRoamOpen = result.poolRoamOpen === true;
    if (!nextPoolRoamOpen || result.poolRoamBoardPath !== this.poolRoamBoardPath) {
      this.poolRoamErrorMessage = undefined;
      this.poolRoamController.clearSession();
    }
    if (!nextPoolRoamOpen) {
      this.poolRoamBackConfirmVisible = false;
      if (this.activeBrowseOverlay === "browse-more") {
        this.setBrowseOverlay(undefined);
      }
    }
    this.poolRoamOpen = nextPoolRoamOpen;
    this.poolRoamBoardPath = result.poolRoamBoardPath;

    if (result.clearSelection) {
      this.selectedIdeaIds.clear();
    }

    if (result.clearBrowseOverlay) {
      this.setBrowseOverlay(undefined);
    }

    if (result.disablePoolMarkdownPreview) {
      this.disablePoolMarkdownPreview();
    }

    if (result.disablePoolRoam) {
      this.disablePoolRoam();
    }
  }

  syncFromNavigation(options: PoolViewNavigationOptions = {}): void {
    this.applyLocalStateResult(applyPoolViewNavigationOptions(this.snapshotLocalState(), options));
    this.renderPoolShell();
  }

  refreshAfterExternalIdeaMutation(): void {
    if (this.isClosed) {
      return;
    }

    this.preserveResultScrollOnNextRender = true;
    void this.renderPoolShellSafely({ showLoadErrorToast: false });
  }

  refreshInterfaceText(): void {
    if (this.isClosed) {
      return;
    }

    this.preserveResultScrollOnNextRender = true;
    void this.renderPoolShellSafely({ showLoadErrorToast: false });
  }

  // 渲染入口：统一把当前本地状态送进安全异步渲染链路。
  private renderPoolShell(): void {
    void this.renderPoolShellSafely();
  }

  private revealActiveSearchHitCard(): void {
    if (!this.activeSearchHitIdeaId || !this.contentEl || !this.activeSearchHitPulse) {
      return;
    }

    revealPoolViewSearchHitCard(this.contentEl, this.activeSearchHitIdeaId);

    const searchHitIdeaId = this.activeSearchHitIdeaId;
    this.clearSearchHitTimeout();
    this.activeSearchHitPulse = true;
    this.clearSearchHitTimer = setTimeout(() => {
      if (this.activeSearchHitIdeaId !== searchHitIdeaId) {
        return;
      }

      this.activeSearchHitPulse = false;
      if (!this.batchMode && this.selectedIdeaIds.size === 1 && this.selectedIdeaIds.has(searchHitIdeaId)) {
        this.selectedIdeaIds.clear();
      }
      this.preserveResultScrollOnNextRender = true;
      this.renderPoolShell();
    }, 1600);
  }

  private clearSearchHitTimeout(): void {
    if (!this.clearSearchHitTimer) {
      return;
    }

    clearTimeout(this.clearSearchHitTimer);
    this.clearSearchHitTimer = null;
  }

  private removeActiveSearchHitStyles(): void {
    clearPoolViewSearchHitStyles(this.contentEl, this.activeSearchHitIdeaId);
  }

  private clearActiveSearchHit(): void {
    this.clearSearchHitTimeout();
    this.removeActiveSearchHitStyles();
    this.activeSearchHitIdeaId = null;
    this.activeSearchHitPulse = false;
    if (!this.batchMode && this.selectedIdeaIds.size === 1) {
      this.selectedIdeaIds.clear();
    }
  }

  // Markdown 预览链路：把池内卡片汇总成阅读视图，并支持导出到真实 .md 文件。
  private resolvePoolMarkdownPreview(
    runtime: PoolBrowseRuntimeState,
    preview?: PoolMarkdownPreviewData
  ): PoolMarkdownPreviewData | undefined {
    if (preview) {
      this.lastPoolMarkdownPreview = preview;
    }

    return resolvePoolMarkdownPreviewValue({
      preview,
      lastPreview: this.lastPoolMarkdownPreview,
      previewOpen: this.poolMarkdownPreviewOpen,
      previewAvailable: this.isPoolMarkdownPreviewAvailable(),
      runtimePoolId: runtime.pool.id
    });
  }

  private async syncPoolRoamPanel(roamState: PoolRoamPanelState | undefined): Promise<void> {
    const mountEl = this.contentEl?.querySelector?.(".glitter-pool-stage__roam-canvas-host") as HTMLElement | null;
    const requestedBoardPath = roamState?.open && roamState.mode === "board" ? roamState.boardPath : undefined;
    const syncVersion = ++this.roamPanelSyncVersion;

    try {
      await this.poolRoamController.syncInlinePanel(mountEl, roamState);
    } catch (_error) {
      if (
        this.isClosed
        || syncVersion !== this.roamPanelSyncVersion
        || requestedBoardPath !== this.poolRoamBoardPath
        || !this.poolRoamOpen
        || !this.poolRoamBoardPath
      ) {
        return;
      }

      const text = getInterfaceText(this.plugin.settings?.interfaceLanguage);
      this.poolRoamErrorMessage = text.pool.roamLoadFailed;
      this.toastService.show({
        status: "error",
        message: "Load roam board failed. Please try again."
      });

      if (this.rerenderLastRenderedBrowseRuntime()) {
        return;
      }

      this.renderPoolShell();
    }
  }

  private async readPersistedPoolRoamBoundaryAnchors(boardPath: string): Promise<SessionBoundaryAnchor[] | undefined> {
    const workflow = this.plugin.poolWorkbenchWorkflow as GlitterPlugin["poolWorkbenchWorkflow"] & {
      normalizePoolRoamBoard?: (input: { boardPath: string }) => Promise<PoolRoamBoardReadResult>;
      readPoolRoamBoard?: (input: { boardPath: string }) => Promise<PoolRoamBoardReadResult>;
    };

    const readBoard = typeof workflow.normalizePoolRoamBoard === "function"
      ? workflow.normalizePoolRoamBoard.bind(workflow)
      : typeof workflow.readPoolRoamBoard === "function"
        ? workflow.readPoolRoamBoard.bind(workflow)
        : undefined;

    if (!readBoard) {
      return undefined;
    }

    const result = await readBoard({ boardPath });
    return extractSessionBoundaryAnchors(result.canvas);
  }

  private async syncPoolRoamBoundaryAnchorsFromBoard(boardPath: string): Promise<void> {
    let nextAnchors: SessionBoundaryAnchor[] | undefined;

    try {
      nextAnchors = await this.readPersistedPoolRoamBoundaryAnchors(boardPath);
    } catch {
      return;
    }

    if (
      nextAnchors === undefined
      || this.isClosed
      || this.browseScope !== "pool"
      || !this.poolRoamOpen
      || this.poolRoamBoardPath !== boardPath
    ) {
      return;
    }

    const currentAnchors = this.poolRoamController.readSessionBoundaryAnchors(this.activePoolId);
    if (hasSameSessionBoundaryAnchors(currentAnchors, nextAnchors)) {
      return;
    }

    this.poolRoamController.clearSession();
    nextAnchors.forEach((anchor) => {
      this.poolRoamController.rememberSessionBoundaryAnchor(anchor);
    });
    this.preserveResultScrollOnNextRender = true;

    if (this.rerenderLastRenderedBrowseRuntime()) {
      return;
    }

    this.renderPoolShell();
  }

  private renderBrowseFromRuntime(runtime: PoolBrowseRuntimeState, preview?: PoolMarkdownPreviewData): void {
    this.renderedBrowseRuntimeVersion += 1;
    const activePoolId = this.resolveActivePoolIdFromRuntime(runtime);
    this.activePoolId = activePoolId;
    if (this.plugin.focusedIdeaId) {
      this.selectedIdeaIds = new Set([this.plugin.focusedIdeaId]);
      this.plugin.focusedIdeaId = null;
    }

    this.poolSwitcherPoolIds = runtime.poolOptions.map((pool) => pool.id);
    if (this.activeBrowseOverlay === "pool-switcher") {
      const defaultActivePoolId = this.poolSwitcherPoolIds.includes(this.activePoolId ?? "")
        ? this.activePoolId
        : this.poolSwitcherPoolIds[0];
      this.poolSwitcherActivePoolId = this.poolSwitcherActivePoolId ?? defaultActivePoolId;
    } else {
      this.resetPoolSwitcherTransientState();
    }

    const runtimeCardIds = new Set(runtime.cards.map((card) => card.id));
    if (this.activeCardMenuIdeaId && !runtimeCardIds.has(this.activeCardMenuIdeaId)) {
      this.activeCardMenuIdeaId = undefined;
    }

    const hadCardMoveState = Boolean(this.activeCardMoveIdeaId || this.cardMoveSubmittingIdeaId);
    if (this.activeCardMoveIdeaId && !runtimeCardIds.has(this.activeCardMoveIdeaId)) {
      this.activeCardMoveIdeaId = undefined;
    }
    if (this.cardMoveSubmittingIdeaId && !runtimeCardIds.has(this.cardMoveSubmittingIdeaId)) {
      this.cardMoveSubmittingIdeaId = undefined;
    }
    if (hadCardMoveState && !this.activeCardMoveIdeaId && !this.cardMoveSubmittingIdeaId) {
      this.cardMoveSearchQuery = "";
    }

    const previewAvailable = this.isPoolMarkdownPreviewAvailableForPoolId(activePoolId);
    if (!previewAvailable) {
      this.disablePoolMarkdownPreview();
    }

    const text = getInterfaceText(this.plugin.settings?.interfaceLanguage);
    const activePreview = previewAvailable ? this.resolvePoolMarkdownPreview(runtime, preview) : undefined;
    const previewState = previewAvailable
      ? {
          available: true,
          open: this.poolMarkdownPreviewOpen,
          saving: this.poolMarkdownPreviewSaving,
          panelTitle: text.pool.markdownPreviewPanelTitle(activePreview?.poolTitle ?? runtime.pool.title),
          saveLabel: this.poolMarkdownPreviewSaving ? text.pool.markdownPreviewSavingLabel : text.pool.markdownPreviewSaveLabel
        }
      : undefined;
    const roamState = this.browseScope === "pool"
      ? this.poolRoamController.buildPanelState({
          open: this.poolRoamOpen,
          boardPath: this.poolRoamBoardPath,
          historyEnabled: true,
          boundaryAnchors: this.poolRoamController.readSessionBoundaryAnchors(activePoolId),
          panelWidthRatio: this.poolRoamPaneRatio,
          errorMessage: this.poolRoamErrorMessage
        })
      : undefined;

    const state = buildPoolViewStateFromRuntime({
      ...runtime,
      controls: {
        ...runtime.controls,
        query: this.queryDraft,
        contentFilter: this.contentFilter
      },
      batchMode: this.batchMode,
      activeOverlay: this.activeBrowseOverlay,
      poolSwitcherActivePoolId: this.activeBrowseOverlay === "pool-switcher" ? this.poolSwitcherActivePoolId : undefined,
      viewOptions:
        this.browseScope === "global-status"
          ? {
              showPoolSwitcher: false,
              metadataEditable: false,
              queryPlaceholder: text.pool.filteredSearchPlaceholder
            }
          : undefined,
      preview: previewState,
      roam: roamState,
      roamBackConfirmVisible: this.poolRoamOpen && this.poolRoamBackConfirmVisible,
      interfaceLanguage: this.plugin.settings?.interfaceLanguage
    });

    this.attachPoolSwitcherCloseHandlers();
    const queryFocusSnapshot = captureTextSelectionSnapshot(
      this.contentEl,
      ".glitter-pool-stage__query",
      this.preserveQueryFocusOnNextRender
    );
    const cardMoveSearchFocusSnapshot = captureTextSelectionSnapshot(
      this.contentEl,
      ".glitter-pool-stage__card-move-dialog-search",
      this.preserveCardMoveSearchFocusOnNextRender
    );
    const resultScrollSnapshot = captureCardGridScrollSnapshot(this.contentEl, this.preserveResultScrollOnNextRender);

    const actions = createPoolViewActions({
      plugin: this.plugin,
      runtime,
      activePoolId: this.activePoolId,
      activateMainView: () => this.handleBackToHome(),
      dismissRoamBackConfirm: () => this.dismissPoolRoamBackConfirm(),
      confirmRoamBackHome: () => this.confirmPoolRoamBackHome(),
      setPoolRoamPaneRatio: (ratio) => this.setPoolRoamPaneRatio(ratio),
      closeCardMenu: (options) => this.closeCardMenu(options),
      renderPoolShell: () => this.renderPoolShell(),
      isBatchModeEnabled: () => this.batchMode,
      clearSelection: () => this.clearSelection(),
      selectOnly: (ideaId) => this.selectOnly(ideaId),
      toggleBatchSelection: (ideaId) => this.toggleBatchSelection(ideaId),
      getQueryValue: () => this.query,
      setQueryValue: (query) => this.setQueryValue(query),
      setQueryDraftValue: (query) => this.setQueryDraftValue(query),
      setStatusValue: (status) => this.setStatusValue(status),
      setContentFilterValue: (contentFilter) => this.setContentFilterValue(contentFilter),
      setSortValue: (sort) => this.setSortValue(sort),
      preserveQueryFocusOnNextRender: () => {
        this.preserveQueryFocusOnNextRender = true;
      },
      preserveResultScrollOnNextRender: () => {
        this.preserveResultScrollOnNextRender = true;
      },
      togglePoolRoam: () => this.togglePoolRoam(),
      attachPoolRoamSource: (ideaId) => this.attachPoolRoamSource(ideaId),
      locatePoolRoamSource: (ideaId) => this.locatePoolRoamSource(ideaId),
      deletePoolRoamSourceLink: (anchorId) => this.deletePoolRoamSourceLink(anchorId),
      poolRoamBoardPath: this.poolRoamBoardPath,
      openPoolRoamHistory: () => this.openPoolRoamHistory(),
      downloadPoolRoamBoard: () => this.downloadPoolRoamBoard(),
      openPoolRoamShareMenu: (anchorEl) => this.openPoolRoamShareMenu(anchorEl),
      addIdeaBlockToPoolRoam: () => this.openPoolRoamIdeaBlockPicker(),
      togglePoolMarkdownPreview: () => this.togglePoolMarkdownPreview(),
      savePoolMarkdownFile: () => this.savePoolMarkdownFile(),
      toggleBatchMode: () => this.toggleBatchMode(),
      moveSelectedToPool: (poolId) => this.moveSelectedToPool(poolId),
      createPoolForSelection: () => this.openCreatePoolModalForSelection(),
      rerenderBrowseRuntime: () => this.rerenderLastRenderedBrowseRuntime(),
      deleteSelectedIdeas: () => this.deleteSelectedIdeas(),
      toggleBrowseOverlay: (overlay) => this.toggleBrowseOverlay(overlay),
      clearBrowseOverlay: () => this.setBrowseOverlay(undefined),
      isCardMovePickerOpen: (ideaId) => this.isCardMovePickerOpen(ideaId),
      isCardMovePickerSubmitting: (ideaId) => this.isCardMovePickerSubmitting(ideaId),
      openCardMovePicker: (ideaId) => this.openCardMovePicker(ideaId),
      closeCardMovePicker: () => this.closeCardMovePicker(),
      updateCardMoveSearchQuery: (query, options) => this.updateCardMoveSearchQuery(query, options),
      getCardMovePickerSearchQuery: () => this.cardMoveSearchQuery,
      moveIdeaToPool: (ideaId, poolId) => this.moveIdeaToPool(ideaId, poolId),
      isCardMenuOpen: (ideaId) => this.isCardMenuOpen(ideaId),
      toggleCardMenu: (ideaId) => this.toggleCardMenu(ideaId),
      deleteIdea: (ideaId) => this.deleteIdea(ideaId),
      createIdeaFile: (ideaId) => this.createIdeaFile(ideaId),
      openPrimaryFileForCard: (nextRuntime, ideaId) => this.openPrimaryFileForCard(nextRuntime, ideaId),
      openSnippetNote: (nextRuntime, ideaId) => this.openSnippetNote(nextRuntime, ideaId),
      openSnippetLocations: (nextRuntime, ideaId) => this.openSnippetLocations(nextRuntime, ideaId),
      openShareMenu: (anchorEl) => this.openShareMenu(anchorEl),
      onPoolSwitch: (poolId) => this.onPoolSwitch(poolId),
      updatePoolMetadata: (input) => this.updatePoolMetadata(input)
    });
    renderPoolView(this.contentEl, state, actions);
    void this.syncPoolRoamPanel(roamState);

    if (activePreview && this.poolMarkdownPreviewOpen && this.isPoolMarkdownPreviewAvailable()) {
      void this.renderPoolMarkdownPreview(activePreview);
    } else {
      this.poolMarkdownPreviewRenderer.release();
    }

    this.preserveQueryFocusOnNextRender = false;
    restoreTextSelectionSnapshot(this.contentEl, ".glitter-pool-stage__query", queryFocusSnapshot);
    this.preserveCardMoveSearchFocusOnNextRender = false;
    restoreTextSelectionSnapshot(
      this.contentEl,
      ".glitter-pool-stage__card-move-dialog-search",
      cardMoveSearchFocusSnapshot
    );
    this.preserveResultScrollOnNextRender = false;
    restoreCardGridScrollSnapshot(this.contentEl, resultScrollSnapshot);
    this.revealActiveSearchHitCard();
    this.syncPoolSwitcherPopupScrolling();
  }

  private resetPoolSwitcherTransientState(): void {
    this.poolSwitcherActivePoolId = undefined;
    this.poolSwitcherPoolIds = [];
    this.poolSwitcherAlignOnOpen = false;
    this.poolSwitcherRevealActiveItem = false;
    this.lastBrowseRuntime = undefined;
  }

  private setBrowseOverlay(nextOverlay: PoolBrowseOverlay | undefined): void {
    if (this.activeBrowseOverlay === nextOverlay) {
      return;
    }

    this.activeBrowseOverlay = nextOverlay;

    if (nextOverlay === "pool-switcher") {
      this.poolSwitcherActivePoolId = this.activePoolId;
      this.poolSwitcherAlignOnOpen = true;
      this.poolSwitcherRevealActiveItem = false;
      return;
    }

    this.resetPoolSwitcherTransientState();
  }

  private toggleBrowseOverlay(nextOverlay: PoolBrowseOverlay): void {
    if (this.activeBrowseOverlay === nextOverlay) {
      this.setBrowseOverlay(undefined);
      return;
    }

    this.setBrowseOverlay(nextOverlay);
  }

  // 浏览条件与批量态：切换后会同时收口菜单、选择集和顶部浮层，避免状态交叉污染。
  private toggleBatchMode(): void {
    if (!this.batchMode) {
      this.batchMode = true;
      this.setBrowseOverlay(undefined);
      return;
    }

    this.batchMode = false;
    if (this.selectedIdeaIds.size > 1) {
      const first = [...this.selectedIdeaIds][0];
      this.selectedIdeaIds = first ? new Set([first]) : new Set();
    }
    this.setBrowseOverlay(undefined);
  }

  private clearSelection(): void {
    this.selectedIdeaIds.clear();
  }

  private selectOnly(ideaId: string): void {
    this.selectedIdeaIds = new Set([ideaId]);
  }

  private toggleBatchSelection(ideaId: string): void {
    if (this.selectedIdeaIds.has(ideaId)) {
      this.selectedIdeaIds.delete(ideaId);
      return;
    }

    this.selectedIdeaIds.add(ideaId);
  }

  private setQueryValue(query: string): void {
    this.query = query;
  }

  private setQueryDraftValue(query: string): void {
    this.queryDraft = query;
  }

  private setStatusValue(status: PoolViewStatus): void {
    this.status = status;
  }

  private setContentFilterValue(contentFilter: PoolViewContentFilter): void {
    this.contentFilter = contentFilter;
  }

  private setSortValue(sort: PoolViewSort): void {
    this.sort = sort;
  }

  private resolveActivePoolIdFromRuntime(runtime: PoolBrowseRuntimeState): string | undefined {
    return runtime.poolOptions.find((pool) => pool.selected && pool.id === runtime.pool.id)?.id;
  }

  private isPoolMarkdownPreviewAvailableForPoolId(poolId: string | undefined): boolean {
    return isPoolMarkdownPreviewAvailableForPoolIdValue(this.browseScope, poolId);
  }

  private disablePoolMarkdownPreview(): void {
    this.poolMarkdownPreviewOpen = false;
    this.lastPoolMarkdownPreview = undefined;
    this.poolMarkdownPreviewRenderer.release();
  }

  private disablePoolRoam(): void {
    this.poolRoamHistoryRequestVersion += 1;
    this.poolRoamOpen = false;
    this.poolRoamBoardPath = undefined;
    this.poolRoamErrorMessage = undefined;
    this.poolRoamBackConfirmVisible = false;
    if (this.activeBrowseOverlay === "browse-more") {
      this.setBrowseOverlay(undefined);
    }
    this.poolRoamController.clearSession();
    this.poolRoamController.destroy();
  }

  private async handleBackToHome(): Promise<void> {
    if (!this.poolRoamOpen) {
      await this.plugin.activateMainView();
      return;
    }

    this.setPoolRoamBackConfirmVisible(true);
  }

  private setPoolRoamBackConfirmVisible(visible: boolean): void {
    if (this.poolRoamBackConfirmVisible === visible) {
      return;
    }

    this.poolRoamBackConfirmVisible = visible;
    if (visible) {
      this.setBrowseOverlay(undefined);
    }

    if (this.rerenderLastRenderedBrowseRuntime()) {
      return;
    }

    this.renderPoolShell();
  }

  private dismissPoolRoamBackConfirm(): void {
    this.setPoolRoamBackConfirmVisible(false);
  }

  private confirmPoolRoamBackHome(): void {
    if (!this.poolRoamOpen) {
      void this.plugin.activateMainView();
      return;
    }

    this.disablePoolRoam();
    void this.plugin.activateMainView();
  }

  private setPoolRoamPaneRatio(ratio: number): void {
    const nextRatio = Math.min(
      MAX_POOL_ROAM_PANEL_WIDTH_RATIO,
      Math.max(MIN_POOL_ROAM_PANEL_WIDTH_RATIO, ratio)
    );
    if (this.poolRoamPaneRatio === nextRatio) {
      return;
    }

    this.poolRoamPaneRatio = nextRatio;
    this.preserveResultScrollOnNextRender = true;

    if (this.rerenderLastRenderedBrowseRuntime()) {
      return;
    }

    this.renderPoolShell();
  }

  private isPoolMarkdownPreviewAvailable(): boolean {
    return this.isPoolMarkdownPreviewAvailableForPoolId(this.activePoolId);
  }

  private togglePoolRoam(): void {
    if (this.browseScope !== "pool") {
      this.disablePoolRoam();
      return;
    }

    if (this.poolRoamOpen) {
      this.disablePoolRoam();
      this.preserveResultScrollOnNextRender = true;

      if (this.rerenderLastRenderedBrowseRuntime()) {
        return;
      }

      this.renderPoolShell();
      return;
    }

    this.poolRoamHistoryRequestVersion += 1;
    this.poolRoamController.clearSession();
    this.poolRoamOpen = true;
    this.poolRoamBoardPath = undefined;
    this.poolRoamErrorMessage = undefined;
    this.poolRoamBackConfirmVisible = false;
    this.disablePoolMarkdownPreview();
    this.preserveResultScrollOnNextRender = true;

    if (this.rerenderLastRenderedBrowseRuntime()) {
      return;
    }

    this.renderPoolShell();
  }

  private applyPoolRoamBoardUpdate(
    result: PoolRoamAttachResult | PoolRoamBoardReadResult,
    options: { open?: boolean; forceInlineRemount?: boolean } = {}
  ): void {
    if (options.open !== undefined) {
      this.poolRoamOpen = options.open;
    }

    this.poolRoamBoardPath = result.path;
    this.poolRoamErrorMessage = undefined;
    if (options.forceInlineRemount) {
      this.poolRoamController.destroy();
    } else {
      this.poolRoamController.clearSession();
    }
    extractSessionBoundaryAnchors(result.canvas).forEach((anchor) => {
      this.poolRoamController.rememberSessionBoundaryAnchor(anchor);
    });
    this.preserveResultScrollOnNextRender = true;

    if (this.rerenderLastRenderedBrowseRuntime()) {
      return;
    }

    this.renderPoolShell();
  }

  private openPoolRoamIdeaBlockPicker(boardPath = this.poolRoamBoardPath): void {
    if (!boardPath) {
      return;
    }

    this.plugin.openRoamIdeaBlockPicker({
      boardPath,
      onAttached: async (result) => {
        this.disablePoolMarkdownPreview();
        if (this.isClosed || !this.poolRoamOpen || this.poolRoamBoardPath !== result.path) {
          return;
        }

        this.applyPoolRoamBoardUpdate(result, {
          open: true,
          forceInlineRemount: true
        });
      }
    });
  }

  private async attachPoolRoamSource(ideaId: string): Promise<void> {
    if (this.browseScope !== "pool") {
      return;
    }

    const runtime = this.lastRenderedBrowseRuntime ?? this.lastBrowseRuntime;
    if (!runtime) {
      return;
    }

    const card = this.findRuntimeCard(runtime, ideaId);
    if (!card) {
      return;
    }

    const poolId = runtime.pool.id;
    const poolName = runtime.pool.title;

    try {
      const result = await this.plugin.poolWorkbenchWorkflow.attachIdeaSourceToRoamBoard({
        ideaId,
        poolId,
        poolName,
        poolColor: runtime.pool.color ?? "",
        ...buildRoamSourceContent(card),
        ...(this.poolRoamBoardPath ? { boardPath: this.poolRoamBoardPath } : {})
      });

      this.disablePoolMarkdownPreview();
      this.applyPoolRoamBoardUpdate(result, {
        open: true,
        forceInlineRemount: true
      });
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: "Attach to roam board failed. Please try again."
      });
    }
  }

  private locatePoolRoamSource(ideaId: string): void {
    const runtime = this.lastRenderedBrowseRuntime ?? this.lastBrowseRuntime;
    const sessionAnchor = this.poolRoamController
      .readSessionBoundaryAnchors(this.activePoolId)
      .find((anchor) => anchor.ideaId === ideaId);
    const targetPoolId = sessionAnchor?.poolId;

    if (!targetPoolId && (!runtime || !this.findRuntimeCard(runtime, ideaId))) {
      return;
    }

    this.plugin.focusedIdeaId = ideaId;
    this.plugin.pendingFocusedPoolId = targetPoolId ?? this.activePoolId ?? null;
    this.clearSearchHitTimeout();
    this.preserveResultScrollOnNextRender = true;
    this.renderPoolShell();
  }

  private async deletePoolRoamSourceLink(anchorId: string): Promise<void> {
    if (this.browseScope !== "pool" || !this.poolRoamBoardPath) {
      return;
    }

    const boardPath = this.poolRoamBoardPath;

    try {
      const result = await this.plugin.poolWorkbenchWorkflow.detachIdeaSourceFromRoamBoard({
        boardPath,
        nodeId: anchorId
      });

      if (this.isClosed || !this.poolRoamOpen || this.poolRoamBoardPath !== boardPath) {
        return;
      }

      this.applyPoolRoamBoardUpdate(result, {
        forceInlineRemount: true
      });
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: "Delete roam link failed. Please try again."
      });
    }
  }

  private async openPoolRoamHistory(): Promise<void> {
    const requestVersion = ++this.poolRoamHistoryRequestVersion;

    try {
      const boards = await this.plugin.poolWorkbenchWorkflow.listPoolRoamBoards();
      if (this.shouldIgnorePoolRoamHistoryRequest(requestVersion)) {
        return;
      }

      this.activePoolRoamBoardModal?.close();
      this.activePoolRoamHistoryModal?.close();

      let latestBoards = boards;
      const modal = new PoolRoamHistoryModal(this.plugin.app, boards, {
        onSelectBoard: (board, index) => {
          const nextIndex = latestBoards.findIndex((entry) => entry.path === board.path);
          this.openPoolRoamBoardModal(latestBoards, nextIndex >= 0 ? nextIndex : index);
        },
        onDeleteBoards: async (boardPaths) => {
          try {
            await this.plugin.poolWorkbenchWorkflow.deletePoolRoamBoards(boardPaths);

            if (this.poolRoamBoardPath && boardPaths.includes(this.poolRoamBoardPath)) {
              this.poolRoamBoardPath = undefined;
              this.poolRoamErrorMessage = undefined;
              this.poolRoamController.clearSession();
              this.preserveResultScrollOnNextRender = true;

              if (!this.rerenderLastRenderedBrowseRuntime()) {
                this.renderPoolShell();
              }
            }

            latestBoards = await this.plugin.poolWorkbenchWorkflow.listPoolRoamBoards();
            return latestBoards;
          } catch (_error) {
            this.toastService.show({
              status: "error",
              message: "Delete roam boards failed. Please try again."
            });
            throw _error;
          }
        },
        onClose: () => {
          if (this.activePoolRoamHistoryModal === modal) {
            this.activePoolRoamHistoryModal = undefined;
          }
        }
      }, {
        interfaceLanguage: this.plugin.settings?.interfaceLanguage
      });
      this.activePoolRoamHistoryModal = modal;
      modal.open();
    } catch (_error) {
      if (this.shouldIgnorePoolRoamHistoryRequest(requestVersion)) {
        return;
      }

      this.toastService.show({
        status: "error",
        message: "Load roam history failed. Please try again."
      });
    }
  }

  private async openHistoricalRoamBoardInLivePane(
    boardPath: string,
    shouldApply: (() => boolean) | undefined = undefined
  ): Promise<boolean> {
    try {
      const result = await this.plugin.poolWorkbenchWorkflow.readPoolRoamBoard({ boardPath });
      if (this.isClosed || (shouldApply && !shouldApply())) {
        return false;
      }

      this.disablePoolMarkdownPreview();
      this.applyPoolRoamBoardUpdate(result, {
        open: true,
        forceInlineRemount: true
      });
      return true;
    } catch {
      if (this.isClosed || (shouldApply && !shouldApply())) {
        return false;
      }

      this.toastService.show({
        status: "error",
        message: "Open roam board failed. Please try again."
      });
      return false;
    }
  }

  private openPoolRoamBoardModal(boards: PoolRoamBoardRecord[], activeBoardIndex: number): void {
    this.activePoolRoamBoardModal?.close();

    const historyModal = this.activePoolRoamHistoryModal;
    const closeActivePoolRoamHistoryModal = () => {
      if (this.activePoolRoamHistoryModal === historyModal) {
        historyModal?.close();
      }
    };
    let modal: PoolRoamBoardModal;
    const shouldApplyDirectOpenBoard = (boardPath: string, openInRoamRequestVersion: number): boolean => {
      return !this.isClosed
        && this.poolRoamOpen
        && !this.poolRoamBoardPath
        && this.activePoolRoamBoardModal === modal
        && modal.getActiveBoardPath() === boardPath
        && modal.isOpenInRoamRequestCurrent(openInRoamRequestVersion);
    };
    const shouldApplyConfirmedReplaceBoard = (
      boardPath: string,
      replacedBoardPath: string,
      openInRoamRequestVersion: number
    ): boolean => {
      return !this.isClosed
        && this.poolRoamOpen
        && this.poolRoamBoardPath === replacedBoardPath
        && this.activePoolRoamBoardModal === modal
        && modal.getActiveBoardPath() === boardPath
        && modal.isOpenInRoamRequestCurrent(openInRoamRequestVersion);
    };

    modal = new PoolRoamBoardModal(this.plugin.app, boards, activeBoardIndex, {
      onOpenError: () => {
        this.toastService.show({
          status: "error",
          message: "Open roam board failed. Please try again."
        });
      },
      onDownloadBoard: (board) => this.downloadPoolRoamBoardByPath(board.path),
      onShareBoard: (board, anchorEl) => {
        this.openPoolRoamShareMenuForBoard(board.path, anchorEl);
      },
      onAddIdeaBlock: (board, callbacks) => {
        this.plugin.openRoamIdeaBlockPicker({
          boardPath: board.path,
          onAttached: async (result) => {
            if (this.poolRoamOpen && this.poolRoamBoardPath === result.path && !this.isClosed) {
              this.disablePoolMarkdownPreview();
              this.applyPoolRoamBoardUpdate(result, {
                open: true,
                forceInlineRemount: true
              });
            }

            let latestBoards: PoolRoamBoardRecord[] | undefined;
            try {
              latestBoards = await this.plugin.poolWorkbenchWorkflow.listPoolRoamBoards();
            } catch {
              latestBoards = undefined;
            }

            callbacks.onAttached(latestBoards);
          }
        });
      },
      onOpenInRoam: async (board) => {
        if (this.poolRoamOpen && this.poolRoamBoardPath === board.path) {
          closeActivePoolRoamHistoryModal();
          return { type: "close" };
        }

        const liveBoardPath = this.poolRoamBoardPath;
        if (this.poolRoamOpen && liveBoardPath) {
          const openInRoamRequestVersion = modal.getOpenInRoamRequestVersion();
          return {
            type: "confirm",
            onConfirm: async () => {
              const opened = await this.openHistoricalRoamBoardInLivePane(
                board.path,
                () => shouldApplyConfirmedReplaceBoard(board.path, liveBoardPath, openInRoamRequestVersion)
              );
              if (opened) {
                closeActivePoolRoamHistoryModal();
              }
              return opened;
            }
          };
        }

        const openInRoamRequestVersion = modal.getOpenInRoamRequestVersion();
        const opened = await this.openHistoricalRoamBoardInLivePane(
          board.path,
          () => shouldApplyDirectOpenBoard(board.path, openInRoamRequestVersion)
        );
        if (opened) {
          closeActivePoolRoamHistoryModal();
          return { type: "close" };
        }
        return { type: "keep-open" };
      },
      onClose: () => {
        if (this.activePoolRoamBoardModal === modal) {
          this.activePoolRoamBoardModal = undefined;
        }
      }
    }, {
      interfaceLanguage: this.plugin.settings?.interfaceLanguage
    });
    this.activePoolRoamBoardModal = modal;
    modal.open();
  }

  private async downloadPoolRoamBoard(): Promise<void> {
    if (!this.poolRoamBoardPath) {
      return;
    }

    await this.downloadPoolRoamBoardByPath(this.poolRoamBoardPath);
  }

  private async downloadPoolRoamBoardByPath(boardPath: string): Promise<void> {
    const text = getInterfaceText(this.plugin.settings?.interfaceLanguage);
    const file = this.plugin.app.vault?.getAbstractFileByPath?.(boardPath);
    if (!(file instanceof TFile)) {
      this.toastService.show({
        status: "error",
        message: text.pool.downloadFailed
      });
      return;
    }

    try {
      const boardContent = await this.plugin.app.vault.read(file);
      const boardName = formatPoolRoamBoardDisplayName(file.basename ?? "Roam Board");
      const svgContent = renderPoolRoamBoardSvgExport({
        boardPath: file.path,
        boardName,
        boardContent,
        interfaceLanguage: this.plugin.settings.interfaceLanguage
      });
      const svgStorageDirectory = this.plugin.settings.roam?.svgStorageDirectory ?? DEFAULT_SETTINGS.roam.svgStorageDirectory;
      await this.plugin.vaultFileStore.ensureFolder(svgStorageDirectory);
      const exportPath = await this.plugin.vaultFileStore.createUniquePath(
        svgStorageDirectory,
        boardName,
        ".svg"
      );
      await this.plugin.app.vault.create(exportPath, svgContent);
      this.toastService.show({
        status: "success",
        message: text.pool.downloadSucceeded(exportPath)
      });
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: text.pool.downloadFailed
      });
    }
  }

  private openPoolRoamShareMenu(anchorEl: HTMLElement): void {
    if (!this.poolRoamBoardPath) {
      return;
    }

    this.openPoolRoamShareMenuForBoard(this.poolRoamBoardPath, anchorEl);
  }

  private openPoolRoamShareMenuForBoard(boardPath: string, anchorEl: HTMLElement): void {
    const text = getInterfaceText(this.plugin.settings?.interfaceLanguage);
    const rect = anchorEl.getBoundingClientRect();
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(text.pool.shareOpenBoard).onClick(() => {
        void this.openIdeaFile(boardPath);
      });
    });
    menu.addItem((item) => {
      item.setTitle(text.pool.shareCopyBoardPath).onClick(() => {
        void this.copyPoolRoamBoardPath(boardPath);
      });
    });
    menu.showAtPosition({ x: rect.right, y: rect.bottom });
  }

  private async copyPoolRoamBoardPath(boardPath: string): Promise<void> {
    const text = getInterfaceText(this.plugin.settings?.interfaceLanguage);
    const navigatorValue = (globalThis as { navigator?: unknown }).navigator;
    if (!canWriteToClipboard(navigatorValue)) {
      this.toastService.show({
        status: "error",
        message: text.pool.copyBoardPathFailed
      });
      return;
    }

    try {
      await navigatorValue.clipboard.writeText(boardPath);
      this.toastService.show({
        status: "success",
        message: text.pool.copyBoardPathSucceeded
      });
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: text.pool.copyBoardPathFailed
      });
    }
  }

  private togglePoolMarkdownPreview(): void {
    if (!this.isPoolMarkdownPreviewAvailable()) {
      this.disablePoolMarkdownPreview();
      return;
    }

    this.poolMarkdownPreviewOpen = !this.poolMarkdownPreviewOpen;
    if (this.poolMarkdownPreviewOpen) {
      this.disablePoolRoam();
    }
    this.preserveResultScrollOnNextRender = true;

    if (!this.poolMarkdownPreviewOpen) {
      if (this.rerenderLastRenderedBrowseRuntime()) {
        return;
      }
      this.renderPoolShell();
      return;
    }

    void this.renderPoolMarkdownPreviewFromCachedRuntime();
  }

  // Markdown 预览优先复用最近一次已渲染的浏览态，只在池仍然匹配且版本未过期时把异步结果贴回当前界面。
  private async renderPoolMarkdownPreviewFromCachedRuntime(): Promise<void> {
    const runtime = this.lastRenderedBrowseRuntime;
    const poolId = this.activePoolId;
    if (!runtime || !poolId || !this.isPoolMarkdownPreviewAvailableForPoolId(poolId)) {
      this.renderPoolShell();
      return;
    }

    const renderVersion = this.renderVersion;
    const renderedBrowseRuntimeVersion = this.renderedBrowseRuntimeVersion;
    if (this.pendingBrowseRenderVersion !== undefined) {
      return;
    }

    try {
      const preview = await this.plugin.poolWorkbenchWorkflow.loadPoolMarkdownPreview({
        poolId,
        sort: this.sort
      });
      if (
        this.shouldSkipRender(renderVersion) ||
        this.pendingBrowseRenderVersion !== undefined ||
        !this.poolMarkdownPreviewOpen ||
        this.activePoolId !== poolId ||
        !this.isPoolMarkdownPreviewAvailableForPoolId(poolId)
      ) {
        return;
      }

      const runtimeToRender = renderedBrowseRuntimeVersion === this.renderedBrowseRuntimeVersion
        ? runtime
        : this.lastRenderedBrowseRuntime;
      if (!runtimeToRender || this.resolveActivePoolIdFromRuntime(runtimeToRender) !== poolId) {
        return;
      }

      this.renderBrowseFromRuntime(runtimeToRender, preview);
    } catch (_error) {
      if (
        this.shouldSkipRender(renderVersion) ||
        this.pendingBrowseRenderVersion !== undefined ||
        !this.poolMarkdownPreviewOpen ||
        this.activePoolId !== poolId ||
        !this.isPoolMarkdownPreviewAvailableForPoolId(poolId)
      ) {
        return;
      }
      this.toastService.show({
        status: "error",
        message: "Load Markdown preview failed. Please try again."
      });
    }
  }

  private async renderPoolMarkdownPreview(preview: PoolMarkdownPreviewData): Promise<void> {
    await this.poolMarkdownPreviewRenderer.render({
      app: this.plugin.app,
      contentEl: this.contentEl,
      preview,
      shouldSkip: () => this.isClosed,
      onRenderError: () => {
        this.toastService.show({
          status: "error",
          message: "Load Markdown preview failed. Please try again."
        });
      }
    });
  }

  private async savePoolMarkdownFile(): Promise<void> {
    await savePoolMarkdownPreviewFile({
      previewSaving: this.poolMarkdownPreviewSaving,
      previewAvailable: this.isPoolMarkdownPreviewAvailable(),
      runtimePoolId: this.activePoolId,
      sort: this.sort,
      workflow: this.plugin.poolWorkbenchWorkflow,
      toastService: this.toastService,
      setPreviewSaving: (saving) => {
        this.poolMarkdownPreviewSaving = saving;
      },
      onSavingStateChange: () => {
        this.preserveResultScrollOnNextRender = true;
        this.renderPoolShell();
      }
    });
  }

  private isCardMovePickerOpen(ideaId: string): boolean {
    return this.activeCardMoveIdeaId === ideaId;
  }

  private isSingleCardMoveInFlight(ideaId?: string): boolean {
    if (ideaId) {
      return this.cardMoveInFlightIdeaId === ideaId || this.cardMoveSubmittingIdeaId === ideaId;
    }

    return Boolean(this.cardMoveInFlightIdeaId || this.cardMoveSubmittingIdeaId);
  }

  private isCardMovePickerSubmitting(ideaId: string): boolean {
    return this.isSingleCardMoveInFlight(ideaId);
  }

  private rerenderCurrentBrowseRuntime(): boolean {
    if (this.isClosed || !this.lastRenderedBrowseRuntime) {
      return false;
    }

    this.lastBrowseRuntime = this.lastRenderedBrowseRuntime;
    this.renderBrowseFromRuntime(this.lastRenderedBrowseRuntime);
    return true;
  }

  private rerenderLastRenderedBrowseRuntime(): boolean {
    if (this.isClosed || !this.lastRenderedBrowseRuntime) {
      return false;
    }

    const selectedIdeaIds = new Set(this.selectedIdeaIds);
    const runtime = {
      ...this.lastRenderedBrowseRuntime,
      cards: this.lastRenderedBrowseRuntime.cards.map((card) => ({
        ...card,
        selected: selectedIdeaIds.has(card.id)
      })),
      controls: {
        ...this.lastRenderedBrowseRuntime.controls,
        selectedCount: selectedIdeaIds.size,
        hasSelection: selectedIdeaIds.size > 0
      }
    };

    this.lastRenderedBrowseRuntime = runtime;
    return this.rerenderCurrentBrowseRuntime();
  }

  private isCardMenuOpen(ideaId: string): boolean {
    return this.activeCardMenuIdeaId === ideaId;
  }

  private syncRenderedCardMenuState(): boolean {
    if (this.isClosed) {
      return false;
    }

    return syncRenderedPoolCardMenus(this.contentEl, this.activeCardMenuIdeaId);
  }

  private closeCardMovePicker(options: { rerender?: boolean } = {}): void {
    if (this.isSingleCardMoveInFlight()) {
      return;
    }

    if (!this.activeCardMoveIdeaId && !this.cardMoveSubmittingIdeaId) {
      return;
    }

    this.activeCardMoveIdeaId = undefined;
    this.cardMoveSubmittingIdeaId = undefined;
    this.cardMoveSearchQuery = "";

    if (options.rerender !== false) {
      this.preserveResultScrollOnNextRender = true;
      if (this.rerenderCurrentBrowseRuntime()) {
        return;
      }
      this.renderPoolShell();
    }
  }

  private updateCardMoveSearchQuery(query: string, options: { isComposing?: boolean } = {}): void {
    if (this.isSingleCardMoveInFlight()) {
      return;
    }

    if (!this.activeCardMoveIdeaId && !this.cardMoveSubmittingIdeaId) {
      return;
    }

    if (this.cardMoveSearchQuery === query) {
      return;
    }

    this.cardMoveSearchQuery = query;
    if (options.isComposing) {
      return;
    }

    this.preserveCardMoveSearchFocusOnNextRender = true;
    this.preserveResultScrollOnNextRender = true;
    if (this.lastRenderedBrowseRuntime) {
      this.rerenderLastRenderedBrowseRuntime();
      return;
    }

    this.renderPoolShell();
  }

  // 单卡菜单、移动弹层与池切换器共享同一套焦点/关闭规则，保证长列表滚动时也能稳定工作。
  private openCardMovePicker(ideaId: string): void {
    if (this.isSingleCardMoveInFlight()) {
      return;
    }

    this.setBrowseOverlay(undefined);
    this.activeCardMenuIdeaId = undefined;
    this.activeCardMoveIdeaId = ideaId;
    this.cardMoveSubmittingIdeaId = undefined;
    this.cardMoveSearchQuery = "";
    this.preserveResultScrollOnNextRender = true;
    if (this.rerenderCurrentBrowseRuntime()) {
      return;
    }
    this.renderPoolShell();
  }

  private closeCardMenu(options: { rerender?: boolean } = {}): boolean {
    const hadCardMenu = Boolean(this.activeCardMenuIdeaId);
    const hadCardMovePicker = Boolean(this.activeCardMoveIdeaId || this.cardMoveSubmittingIdeaId);
    if (!hadCardMenu && !hadCardMovePicker) {
      return false;
    }

    this.closeCardMovePicker({ rerender: false });
    this.activeCardMenuIdeaId = undefined;

    if (!hadCardMovePicker && hadCardMenu && this.syncRenderedCardMenuState()) {
      return true;
    }

    if (options.rerender !== false) {
      this.preserveResultScrollOnNextRender = true;
      if (this.rerenderCurrentBrowseRuntime()) {
        return true;
      }
      this.renderPoolShell();
      return true;
    }

    return false;
  }

  private toggleCardMenu(ideaId: string): void {
    if (this.isSingleCardMoveInFlight()) {
      return;
    }

    const hadBrowseOverlay = Boolean(this.activeBrowseOverlay);
    const hadCardMovePicker = Boolean(this.activeCardMoveIdeaId || this.cardMoveSubmittingIdeaId);
    this.setBrowseOverlay(undefined);
    this.closeCardMovePicker({ rerender: false });
    this.activeCardMenuIdeaId = this.activeCardMenuIdeaId === ideaId ? undefined : ideaId;

    if (!hadBrowseOverlay && !hadCardMovePicker && this.syncRenderedCardMenuState()) {
      return;
    }

    this.preserveResultScrollOnNextRender = true;
    if (this.rerenderCurrentBrowseRuntime()) {
      return;
    }
    this.renderPoolShell();
  }

  private movePoolSwitcherActiveRow(step: -1 | 1): void {
    if (this.activeBrowseOverlay !== "pool-switcher" || this.poolSwitcherPoolIds.length === 0) {
      return;
    }

    const currentIndex = this.poolSwitcherActivePoolId
      ? this.poolSwitcherPoolIds.indexOf(this.poolSwitcherActivePoolId)
      : -1;
    const fallbackIndex = this.poolSwitcherPoolIds.findIndex((poolId) => poolId === this.activePoolId);
    const startIndex = currentIndex >= 0 ? currentIndex : Math.max(fallbackIndex, 0);
    const nextIndex = Math.min(Math.max(startIndex + step, 0), this.poolSwitcherPoolIds.length - 1);
    const nextPoolId = this.poolSwitcherPoolIds[nextIndex];
    if (!nextPoolId) {
      return;
    }

    this.poolSwitcherActivePoolId = nextPoolId;
    this.poolSwitcherRevealActiveItem = true;

    if (this.lastBrowseRuntime) {
      this.renderBrowseFromRuntime(this.lastBrowseRuntime);
      return;
    }

    this.renderPoolShell();
  }

  private onPoolSwitch(poolId: string): void {
    this.setBrowseOverlay(undefined);
    this.closeCardMenu({ rerender: false });
    void this.switchPool(poolId);
  }

  private confirmPoolSwitcherSelection(): void {
    if (this.activeBrowseOverlay !== "pool-switcher") {
      return;
    }

    const targetPoolId = this.poolSwitcherActivePoolId ?? this.activePoolId;
    if (!targetPoolId || targetPoolId === this.activePoolId) {
      this.preserveResultScrollOnNextRender = true;
      this.setBrowseOverlay(undefined);
      this.renderPoolShell();
      return;
    }

    this.onPoolSwitch(targetPoolId);
  }

  private syncPoolSwitcherPopupScrolling(): void {
    if (
      this.activeBrowseOverlay !== "pool-switcher" ||
      !this.contentEl ||
      typeof this.contentEl.querySelector !== "function"
    ) {
      return;
    }

    if (this.poolSwitcherAlignOnOpen) {
      const activeIndex = this.poolSwitcherActivePoolId
        ? this.poolSwitcherPoolIds.indexOf(this.poolSwitcherActivePoolId)
        : -1;
      if (activeIndex >= 0) {
        const startIndex = Math.max(activeIndex - 3, 0);
        const startEl = this.contentEl.querySelector(
          `.glitter-pool-stage__pool-popup-item[data-pool-index="${startIndex}"]`
        ) as HTMLElement | null;
        startEl?.scrollIntoView({ block: "start" });
      }
      this.poolSwitcherAlignOnOpen = false;
    }

    if (this.poolSwitcherRevealActiveItem && this.poolSwitcherActivePoolId) {
      const activeEl = this.contentEl.querySelector(
        `.glitter-pool-stage__pool-popup-item[data-pool-id="${this.poolSwitcherActivePoolId}"]`
      ) as HTMLElement | null;
      activeEl?.scrollIntoView({ block: "nearest" });
      this.poolSwitcherRevealActiveItem = false;
    }
  }

  private attachPoolSwitcherCloseHandlers(): void {
    const ownerDocument = this.contentEl?.ownerDocument;
    if (!ownerDocument || this.pointerDownCloseHandler || this.escapeCloseHandler) {
      return;
    }

    this.pointerDownCloseHandler = (event: PointerEvent) => {
      if (
        !this.activeBrowseOverlay &&
        !this.activeCardMenuIdeaId &&
        !this.activeCardMoveIdeaId &&
        !this.isSingleCardMoveInFlight() &&
        !this.activeSearchHitIdeaId
      ) {
        return;
      }

      type ClosableNode = {
        nodeType?: number;
        parentNode?: ClosableNode | null;
        matches?: (selector: string) => boolean;
      };

      const target = event.target as ClosableNode | null;
      let currentNode: ClosableNode | null = target && typeof target === "object" ? target : null;
      let isInsideProtectedShell = false;
      while (currentNode) {
        if (
          currentNode.nodeType === 1 &&
          typeof currentNode.matches === "function" &&
          (currentNode.matches(".glitter-pool-stage__pool-switcher") ||
            currentNode.matches(".glitter-pool-stage__title-switcher") ||
            currentNode.matches(".glitter-pool-stage__results-tool-anchor") ||
            currentNode.matches(".glitter-pool-stage__batch-action-anchor") ||
            currentNode.matches(".glitter-pool-stage__toolbar-menu") ||
            currentNode.matches(".glitter-pool-stage__card-menu-shell") ||
            currentNode.matches(".glitter-pool-stage__card-move-dialog"))
        ) {
          isInsideProtectedShell = true;
          break;
        }
        currentNode = currentNode.parentNode && typeof currentNode.parentNode === "object" ? currentNode.parentNode : null;
      }

      const clearedSearchHit = Boolean(this.activeSearchHitIdeaId && !this.activeSearchHitPulse);
      if (clearedSearchHit) {
        this.clearActiveSearchHit();
      }

      if (isInsideProtectedShell) {
        return;
      }

      let changed = false;
      if (this.activeBrowseOverlay) {
        this.setBrowseOverlay(undefined);
        changed = true;
      }
      if (!this.isSingleCardMoveInFlight() && (this.activeCardMenuIdeaId || this.activeCardMoveIdeaId)) {
        const closedLocally = !this.activeBrowseOverlay && this.closeCardMenu({ rerender: false });
        if (!closedLocally) {
          changed = true;
        }
      }
      if (changed) {
        this.preserveResultScrollOnNextRender = true;
        if (this.rerenderCurrentBrowseRuntime()) {
          return;
        }
        this.renderPoolShell();
        return;
      }

      if (clearedSearchHit) {
        this.preserveResultScrollOnNextRender = true;
        this.renderPoolShell();
      }
    };

    this.escapeCloseHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (this.activeBrowseOverlay) {
          event.preventDefault?.();
          event.stopPropagation?.();
          this.preserveResultScrollOnNextRender = true;
          this.setBrowseOverlay(undefined);
          this.renderPoolShell();
          return;
        }

        if (!this.isSingleCardMoveInFlight() && (this.activeCardMenuIdeaId || this.activeCardMoveIdeaId)) {
          event.preventDefault?.();
          event.stopPropagation?.();
          this.closeCardMenu();
        }
        return;
      }

      if (this.activeBrowseOverlay !== "pool-switcher") {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault?.();
        event.stopPropagation?.();
        this.movePoolSwitcherActiveRow(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault?.();
        event.stopPropagation?.();
        this.movePoolSwitcherActiveRow(-1);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault?.();
        event.stopPropagation?.();
        this.confirmPoolSwitcherSelection();
      }
    };

    ownerDocument.addEventListener("pointerdown", this.pointerDownCloseHandler);
    ownerDocument.addEventListener("keydown", this.escapeCloseHandler);
  }

  private detachPoolSwitcherCloseHandlers(): void {
    const ownerDocument = this.contentEl?.ownerDocument;
    if (!ownerDocument) {
      this.pointerDownCloseHandler = undefined;
      this.escapeCloseHandler = undefined;
      return;
    }

    if (this.pointerDownCloseHandler) {
      ownerDocument.removeEventListener("pointerdown", this.pointerDownCloseHandler);
      this.pointerDownCloseHandler = undefined;
    }

    if (this.escapeCloseHandler) {
      ownerDocument.removeEventListener("keydown", this.escapeCloseHandler);
      this.escapeCloseHandler = undefined;
    }
  }

  // 异步加载与重绘守卫：用 renderVersion 避免旧请求回填，防止池页在频繁切换时出现脏界面。
  private async renderPoolShellSafely(options: { showLoadErrorToast?: boolean } = {}): Promise<boolean> {
    const renderVersion = ++this.renderVersion;
    this.pendingBrowseRenderVersion = renderVersion;

    try {
      await this.renderPoolShellAsync(renderVersion);
      return true;
    } catch (_error) {
      if (options.showLoadErrorToast !== false && !this.shouldSkipRender(renderVersion)) {
        this.toastService.show({
          status: "error",
          message: "Load pool failed. Please try again."
        });
      }
      return false;
    } finally {
      if (this.pendingBrowseRenderVersion === renderVersion) {
        this.pendingBrowseRenderVersion = undefined;
      }
    }
  }

  // 主渲染异步流会先收口焦点跳转、副作用开关与筛选重置，再加载池运行时和 Markdown 预览，最后一次性回填当前版本。
  private async renderPoolShellAsync(renderVersion: number): Promise<void> {
    const focusedIdeaId = this.plugin.focusedIdeaId;
    if (focusedIdeaId) {
      const targetPoolId = this.plugin.pendingFocusedPoolId ?? this.pendingNavigationPoolId;
      this.activePoolId = targetPoolId ?? undefined;
      this.pendingNavigationPoolId = undefined;
      this.plugin.pendingFocusedPoolId = null;
      this.navigationMode = "browse";
      this.query = "";
      this.queryDraft = "";
      this.status = "all";
      this.contentFilter = "all";
      this.batchMode = false;
      this.setBrowseOverlay(undefined);
      this.selectedIdeaIds = new Set([focusedIdeaId]);
      this.activeSearchHitIdeaId = focusedIdeaId;
      this.activeSearchHitPulse = true;
      this.clearSearchHitTimeout();
    }

    const runtime = await this.plugin.poolWorkbenchWorkflow.loadPoolState({
      poolId: this.browseScope === "pool" ? this.activePoolId : undefined,
      scope: this.browseScope === "global-status" ? this.browseScope : undefined,
      query: this.query,
      status: this.status,
      contentFilter: this.contentFilter,
      sort: this.sort,
      selectedIdeaIds: focusedIdeaId ? [focusedIdeaId] : [...this.selectedIdeaIds],
      interfaceLanguage: this.plugin.settings?.interfaceLanguage
    });

    const runtimeWithSearchHit = this.activeSearchHitIdeaId
      ? {
          ...runtime,
          cards: runtime.cards.map((card) => ({
            ...card,
            searchHit: card.id === this.activeSearchHitIdeaId,
            searchHitPulse: card.id === this.activeSearchHitIdeaId ? this.activeSearchHitPulse : false
          }))
        }
      : runtime;

    const activePoolId = this.resolveActivePoolIdFromRuntime(runtimeWithSearchHit);
    this.activePoolId = activePoolId;
    if (!this.isPoolMarkdownPreviewAvailableForPoolId(activePoolId)) {
      this.disablePoolMarkdownPreview();
    }

    let preview: PoolMarkdownPreviewData | undefined;
    if (this.poolMarkdownPreviewOpen && activePoolId && this.isPoolMarkdownPreviewAvailableForPoolId(activePoolId)) {
      preview = await this.plugin.poolWorkbenchWorkflow.loadPoolMarkdownPreview({
        poolId: activePoolId,
        sort: this.sort
      });
    }

    let persistedRoamBoundaryAnchors: SessionBoundaryAnchor[] | undefined;
    if (this.browseScope === "pool" && this.poolRoamOpen && this.poolRoamBoardPath) {
      const boardPath = this.poolRoamBoardPath;
      try {
        persistedRoamBoundaryAnchors = await this.readPersistedPoolRoamBoundaryAnchors(boardPath);
      } catch {
        if (
          this.shouldSkipRender(renderVersion)
          || !this.poolRoamOpen
          || this.poolRoamBoardPath !== boardPath
        ) {
          return;
        }

        persistedRoamBoundaryAnchors = [];
      }
    }

    if (this.shouldSkipRender(renderVersion)) {
      return;
    }

    if (this.browseScope !== "pool" || !this.poolRoamOpen || !this.poolRoamBoardPath) {
      this.poolRoamController.clearSession();
    } else if (persistedRoamBoundaryAnchors !== undefined) {
      this.poolRoamErrorMessage = undefined;
      this.poolRoamController.clearSession();
      persistedRoamBoundaryAnchors.forEach((anchor) => {
        this.poolRoamController.rememberSessionBoundaryAnchor(anchor);
      });
    }

    this.lastBrowseRuntime = runtimeWithSearchHit;
    this.lastRenderedBrowseRuntime = runtimeWithSearchHit;
    this.renderBrowseFromRuntime(runtimeWithSearchHit, preview);
  }

  // 单卡移动落盘：在提交期间锁定当前移动态，成功后刷新选择集与结果区，失败则保留当前浏览上下文。
  private async moveIdeaToPool(ideaId: string, poolId: string): Promise<void> {
    if (this.isSingleCardMoveInFlight()) {
      return;
    }

    this.activeCardMoveIdeaId = ideaId;
    this.cardMoveSubmittingIdeaId = ideaId;
    this.cardMoveInFlightIdeaId = ideaId;
    this.preserveResultScrollOnNextRender = true;
    this.renderPoolShell();

    try {
      await this.plugin.poolWorkbenchWorkflow.moveIdeasToPool([ideaId], poolId);
      this.selectedIdeaIds.delete(ideaId);
      this.activeCardMoveIdeaId = undefined;
      this.cardMoveSubmittingIdeaId = undefined;
      this.cardMoveInFlightIdeaId = undefined;
      this.cardMoveSearchQuery = "";
      this.preserveResultScrollOnNextRender = true;
      this.rerenderLastRenderedBrowseRuntime();
      this.preserveResultScrollOnNextRender = true;
      this.renderPoolShell();
    } catch (_error) {
      this.cardMoveSubmittingIdeaId = undefined;
      this.cardMoveInFlightIdeaId = undefined;
      this.toastService.show({
        status: "error",
        message: "Move failed. Please try again."
      });
      this.preserveResultScrollOnNextRender = true;
      this.rerenderLastRenderedBrowseRuntime();
      this.preserveResultScrollOnNextRender = true;
      this.renderPoolShell();
    }
  }

  private openCreatePoolModalForSelection(): void {
    const modal = new PoolModal(
      this.plugin,
      "create",
      {
        onPoolChosen: (poolId) => {
          if (poolId === CREATE_NEW_POOL_ID) {
            return;
          }
          this.preserveResultScrollOnNextRender = true;
          void this.moveSelectedToPool(poolId, { rollbackCreatedPoolOnFailure: true });
        }
      },
      {
        flowContext: "global"
      }
    );
    modal.open();
  }

  private async moveSelectedToPool(
    poolId: string,
    options: { rollbackCreatedPoolOnFailure?: boolean } = {}
  ): Promise<void> {
    const selected = [...this.selectedIdeaIds];
    if (selected.length === 0) {
      if (options.rollbackCreatedPoolOnFailure) {
        void this.plugin.poolService.deletePool(poolId).catch(() => undefined);
        this.renderPoolShell();
      }
      return;
    }

    try {
      await this.plugin.poolWorkbenchWorkflow.moveIdeasToPool(selected, poolId);
    } catch (_error) {
      if (options.rollbackCreatedPoolOnFailure) {
        await this.plugin.poolService.deletePool(poolId).catch(() => undefined);
      }
      this.toastService.show({
        status: "error",
        message: "Move failed. Please try again."
      });
      this.renderPoolShell();
      return;
    }

    this.selectedIdeaIds.clear();
    this.renderPoolShell();
  }

  private async deleteSelectedIdeas(): Promise<void> {
    const selected = [...this.selectedIdeaIds];
    if (selected.length === 0) {
      return;
    }

    try {
      for (const ideaId of selected) {
        await this.plugin.poolWorkbenchWorkflow.deleteIdea(ideaId);
      }
      this.selectedIdeaIds.clear();
      this.renderPoolShell();
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: "Delete failed. Please try again."
      });
      this.renderPoolShell();
    }
  }

  private async createIdeaFile(ideaId: string): Promise<void> {
    try {
      await this.plugin.poolWorkbenchWorkflow.createIdeaFile(ideaId);
      this.renderPoolShell();
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: "Create file failed. Please try again."
      });
    }
  }

  private async openPrimaryFileForCard(runtime: PoolBrowseRuntimeState, ideaId: string): Promise<void> {
    const card = this.findRuntimeCard(runtime, ideaId);
    if (!card?.filePath) {
      await this.createIdeaFile(ideaId);
      return;
    }

    await this.openIdeaFile(card.filePath);
  }

  private async updatePoolMetadata(input: { name?: string; description?: string }): Promise<void> {
    if (!this.activePoolId) {
      return;
    }

    try {
      await this.plugin.poolWorkbenchWorkflow.updatePool(this.activePoolId, input);
      this.renderPoolShell();
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: "Update pool failed. Please try again."
      });
      this.renderPoolShell();
    }
  }

  private async deleteIdea(ideaId: string): Promise<void> {
    try {
      await this.plugin.poolWorkbenchWorkflow.deleteIdea(ideaId);
      this.selectedIdeaIds.delete(ideaId);
      this.renderPoolShell();
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: "Delete failed. Please try again."
      });
    }
  }

  private async switchPool(poolId: string): Promise<void> {
    try {
      await this.hostLeaf.setViewState({
        type: POOL_VIEW_TYPE,
        active: true,
        state: {
          poolId,
          mode: "browse",
          ...(this.poolMarkdownPreviewOpen ? { poolMarkdownPreviewOpen: true } : {}),
          ...(this.poolRoamOpen ? { poolRoamOpen: true } : {}),
          ...(this.poolRoamBoardPath ? { poolRoamBoardPath: this.poolRoamBoardPath } : {}),
          query: this.query,
          status: this.status,
          contentFilter: this.contentFilter,
          sort: this.sort,
          batchMode: false
        }
      });
      return;
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: "Switch pool failed. Please try again."
      });
    }
  }

  private findRuntimeCard(runtime: PoolBrowseRuntimeState, ideaId: string): PoolBrowseRuntimeState["cards"][number] | undefined {
    return runtime.cards.find((entry) => entry.id === ideaId);
  }

  private openSnippetLocations(runtime: PoolBrowseRuntimeState, ideaId: string): void {
    const card = this.findRuntimeCard(runtime, ideaId);
    if (!card || card.snippetLocations.length === 0) {
      return;
    }

    const modal = new SnippetLocationsModal(this.plugin.app, card.snippetLocations, async (location) => {
      await this.openIdeaFile(location.notePath, { ideaId });
    }, this.plugin.settings?.interfaceLanguage);
    modal.open();
  }

  private async openSnippetNote(runtime: PoolBrowseRuntimeState, ideaId: string): Promise<void> {
    const card = this.findRuntimeCard(runtime, ideaId);
    const location = card?.snippetLocations[0];
    if (!card || card.snippetLocations.length !== 1 || !location || location.stale) {
      this.openSnippetLocations(runtime, ideaId);
      return;
    }

    await this.openIdeaFile(location.notePath, { ideaId });
  }

  private openShareMenu(anchorEl: HTMLElement): void {
    const text = getInterfaceText(this.plugin.settings?.interfaceLanguage);
    const rect = anchorEl.getBoundingClientRect();
    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle(text.pool.moreShareComingSoonTitle)
        .onClick(() => {
          this.toastService.show({
            status: "info",
            message: text.pool.moreShareComingSoonMessage
          });
        });
    });
    menu.showAtPosition({ x: rect.right, y: rect.bottom });
  }

  private revealIdeaMarkerInLeaf(leaf: unknown, ideaId: string | undefined): void {
    if (!ideaId) {
      return;
    }

    try {
      const selector = `[data-glitteridea-id="${ideaId}"], [data-glitter-idea-id="${ideaId}"]`;
      const leafView = (leaf as {
        view?: {
          containerEl?: { querySelector?: (query: string) => HTMLElement | null };
          editor?: {
            lineCount?: () => number;
            getLine?: (line: number) => string;
            setCursor?: (position: { line: number; ch: number }) => void;
            scrollIntoView?: (from: { line: number; ch: number }, to?: { line: number; ch: number }) => void;
            focus?: () => void;
          };
        };
      }).view;
      const marker = leafView?.containerEl?.querySelector?.(selector);
      if (marker) {
        marker.scrollIntoView({
          block: "center",
          behavior: "smooth"
        });
        return;
      }

      const editor = leafView?.editor;
      const lineCount = editor?.lineCount?.() ?? 0;
      for (let line = 0; line < lineCount; line += 1) {
        const content = editor?.getLine?.(line) ?? "";
        if (!isIdeaSnippetStartLine(content, ideaId)) {
          continue;
        }

        const position = { line, ch: 0 };
        editor?.setCursor?.(position);
        editor?.scrollIntoView?.(position, position);
        editor?.focus?.();
        return;
      }
    } catch {
      return;
    }
  }

  private async openIdeaFile(filePath: string, options: { ideaId?: string } = {}): Promise<void> {
    const poolText = getInterfaceText(this.plugin.settings?.interfaceLanguage).pool;
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      this.toastService.show({
        status: "error",
        message: poolText.openFileFailed
      });
      return;
    }

    const leaf = this.plugin.app.workspace.getLeaf(true);
    try {
      await leaf.openFile(file as TFile);
      this.revealIdeaMarkerInLeaf(leaf, options.ideaId);
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: poolText.openFileFailed
      });
    }
  }

  private shouldIgnorePoolRoamHistoryRequest(requestVersion: number): boolean {
    return (
      this.isClosed
      || requestVersion !== this.poolRoamHistoryRequestVersion
      || this.browseScope !== "pool"
      || !this.poolRoamOpen
    );
  }

  private shouldSkipRender(renderVersion: number): boolean {
    return this.isClosed || renderVersion !== this.renderVersion;
  }
}
