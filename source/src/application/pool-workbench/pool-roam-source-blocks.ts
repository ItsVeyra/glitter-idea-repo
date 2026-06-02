/*
Copyright (C) 2026 ItsVeyra

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3 of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type {
  PoolRoamCanvasData,
  PoolRoamCanvasNodeLike,
  PoolRoamManagedCanvasNode,
  PoolRoamManagedSourceBlockMetadata,
  PoolRoamSourceAttachment,
  PoolRoamSourceBlockKind,
  PoolRoamSourceBlockRole,
  PoolRoamSourceContent,
  PoolRoamSourceMeta,
  PoolRoamSourceRecord
} from "./pool-roam-workflow";

const DEFAULT_TEXT_BLOCK_WIDTH = 420;
const DEFAULT_IMAGE_BLOCK_WIDTH = 540;
const DEFAULT_BLOCK_GAP = 12;
const DEFAULT_CAPTION_MEDIA_GAP = 18;
const DEFAULT_TEXT_LINE_HEIGHT = 24;
const DEFAULT_TEXT_PADDING = 32;
const DEFAULT_IMAGE_ASPECT_RATIO = 1;
const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif", ".heic", ".heif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".wmv", ".ogv", ".ogg"]);

type PoolRoamImageAttachment = PoolRoamSourceAttachment & { path: string };
type PoolRoamManagedImageAttachment = PoolRoamImageAttachment & {
  attachmentIndex: number;
  attachmentOccurrence: number;
  nodeKey: string;
};

export interface PoolRoamImageTile {
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  attachmentIndex: number;
  aspectRatio: number;
}

export interface PoolRoamImageTileLayout {
  width: number;
  height: number;
  gap: number;
  tiles: PoolRoamImageTile[];
}

export interface BuildPoolRoamSourceBlockInput {
  sourceBlockId?: string;
  source: PoolRoamSourceRecord;
  x: number;
  y: number;
  width?: number;
  gap?: number;
  previousNodes?: readonly PoolRoamCanvasNodeLike[];
  createNodeId?: (nodeKey: string) => string;
}

export interface PoolRoamSourceBlockBuildResult {
  sourceBlockId: string;
  kind: PoolRoamSourceBlockKind;
  nodes: PoolRoamManagedCanvasNode[];
}

export interface PoolRoamCollectedSourceBlock {
  sourceBlockId: string;
  rootNode: PoolRoamManagedCanvasNode | null;
  nodes: PoolRoamManagedCanvasNode[];
  sourceContent: PoolRoamSourceContent | null;
  legacy: boolean;
}

function hasText(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function normalizeTitle(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isPoolRoamSourceMeta(value: unknown): value is PoolRoamSourceMeta {
  return (
    isRecord(value) &&
    typeof value.ideaId === "string" &&
    typeof value.poolId === "string" &&
    typeof value.poolName === "string" &&
    typeof value.poolColor === "string" &&
    typeof value.ideaTitle === "string" &&
    value.syncMode === "readonly-follow-source" &&
    (value.status === "active" || value.status === "missing")
  );
}

function normalizeAttachmentPaths(paths: readonly string[] | undefined): string[] {
  return (paths ?? []).filter(hasText).map((path) => path.trim());
}

function normalizeIdeaContentType(value: unknown): PoolRoamSourceContent["contentType"] | null {
  return value === "text" || value === "link" || value === "image" || value === "video" || value === "mixed"
    ? value
    : null;
}

function parsePoolRoamSourceMarkdown(markdown: string): Partial<PoolRoamSourceContent> {
  const normalized = normalizeWhitespace(markdown);
  if (!normalized) {
    return { body: "", attachmentPaths: [] };
  }

  const rawLines = normalized.split("\n");
  const attachmentPaths: string[] = [];
  const contentLines: string[] = [];

  for (const line of rawLines) {
    const attachmentMatch = line.match(/^!\[\[(.+?)\]\]$/u);
    if (attachmentMatch) {
      const attachmentPath = attachmentMatch[1]?.trim();
      if (attachmentPath) {
        attachmentPaths.push(attachmentPath);
      }
      continue;
    }

    contentLines.push(line);
  }

  const calloutTitleMatch = contentLines[0]?.match(/^> \[!glitter-source\]\s*(.*)$/u);
  if (calloutTitleMatch) {
    const title = calloutTitleMatch[1]?.trim() ?? "";
    let offset = 1;
    let sourceUrl: string | undefined;

    if (/^> >\s+/u.test(contentLines[offset] ?? "")) {
      sourceUrl = (contentLines[offset] ?? "").replace(/^> >\s+/u, "").trim() || undefined;
      offset += 1;
      if ((contentLines[offset] ?? "").trim() === ">") {
        offset += 1;
      }
    }

    const body = contentLines
      .slice(offset)
      .map((line) => {
        if (line.trim() === ">") {
          return "";
        }
        if (line.startsWith("> ")) {
          return line.slice(2);
        }
        if (line.startsWith(">")) {
          return line.slice(1).trimStart();
        }
        return line;
      })
      .join("\n")
      .trim();

    return {
      title,
      body,
      sourceUrl,
      attachmentPaths,
      contentType: attachmentPaths.some((path) => inferAttachmentMediaType({ path }) === "video")
        ? "video"
        : attachmentPaths.some((path) => inferAttachmentMediaType({ path }) === "image")
          ? "image"
          : sourceUrl
            ? "link"
            : "text"
    };
  }

  const headingMatch = contentLines[0]?.match(/^#{1,6}\s+(.*)$/u);
  if (headingMatch) {
    return {
      title: headingMatch[1]?.trim() ?? "",
      body: contentLines.slice(1).join("\n").trim(),
      attachmentPaths,
      contentType: attachmentPaths.some((path) => inferAttachmentMediaType({ path }) === "video")
        ? "video"
        : attachmentPaths.some((path) => inferAttachmentMediaType({ path }) === "image")
          ? "image"
          : "text"
    };
  }

  return {
    body: contentLines.join("\n").trim(),
    attachmentPaths,
    contentType: attachmentPaths.some((path) => inferAttachmentMediaType({ path }) === "video")
      ? "video"
      : attachmentPaths.some((path) => inferAttachmentMediaType({ path }) === "image")
        ? "image"
        : "text"
  };
}

function inferSourceContentType(input: {
  stored?: PoolRoamSourceContent["contentType"] | null;
  kind?: PoolRoamSourceBlockKind;
  sourceUrl?: string;
  attachmentPaths: readonly string[];
}): PoolRoamSourceContent["contentType"] {
  if (input.stored) {
    return input.stored;
  }

  if (input.attachmentPaths.some((path) => inferAttachmentMediaType({ path }) === "video")) {
    return "video";
  }
  if (input.attachmentPaths.some((path) => inferAttachmentMediaType({ path }) === "image")) {
    return "image";
  }
  if (hasText(input.sourceUrl)) {
    return "link";
  }
  if (input.kind === "link" || input.kind === "image" || input.kind === "video") {
    return input.kind;
  }
  return "text";
}

function sortManagedImageNodes(nodes: readonly PoolRoamManagedCanvasNode[]): PoolRoamManagedCanvasNode[] {
  return [...nodes].sort((left, right) => {
    const leftIndex = typeof left.glitterSourceBlock.attachmentIndex === "number" ? left.glitterSourceBlock.attachmentIndex : Number.MAX_SAFE_INTEGER;
    const rightIndex = typeof right.glitterSourceBlock.attachmentIndex === "number" ? right.glitterSourceBlock.attachmentIndex : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    const leftY = typeof left.y === "number" ? left.y : Number.MAX_SAFE_INTEGER;
    const rightY = typeof right.y === "number" ? right.y : Number.MAX_SAFE_INTEGER;
    if (leftY !== rightY) {
      return leftY - rightY;
    }

    const leftX = typeof left.x === "number" ? left.x : Number.MAX_SAFE_INTEGER;
    const rightX = typeof right.x === "number" ? right.x : Number.MAX_SAFE_INTEGER;
    if (leftX !== rightX) {
      return leftX - rightX;
    }

    return left.id.localeCompare(right.id);
  });
}

function normalizeSourceAttachments(source: Pick<PoolRoamSourceRecord, "attachments" | "attachmentPaths">): PoolRoamSourceAttachment[] {
  if (Array.isArray(source.attachments) && source.attachments.length > 0) {
    return source.attachments
      .filter((attachment): attachment is PoolRoamSourceAttachment => Boolean(attachment) && hasText(attachment.path))
      .map((attachment) => ({
        path: attachment.path.trim(),
        mediaType: attachment.mediaType,
        width: attachment.width,
        height: attachment.height
      }));
  }

  return (source.attachmentPaths ?? []).filter(hasText).map((path) => ({ path: path.trim() }));
}

function resolveExtension(path: string): string {
  const normalizedPath = path.trim().toLowerCase();
  const fileName = normalizedPath.split("?")[0] ?? normalizedPath;
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex >= 0 ? fileName.slice(lastDotIndex) : "";
}

function inferAttachmentMediaType(attachment: PoolRoamSourceAttachment): "image" | "video" | null {
  if (attachment.mediaType === "image" || attachment.mediaType === "video") {
    return attachment.mediaType;
  }

  const extension = resolveExtension(attachment.path);
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  return null;
}

function isImageAttachment(attachment: PoolRoamSourceAttachment): attachment is PoolRoamImageAttachment {
  return inferAttachmentMediaType(attachment) === "image";
}

function resolveImageAspectRatio(attachment: Pick<PoolRoamSourceAttachment, "width" | "height">): number {
  if (typeof attachment.width === "number" && attachment.width > 0 && typeof attachment.height === "number" && attachment.height > 0) {
    return attachment.width / attachment.height;
  }

  return DEFAULT_IMAGE_ASPECT_RATIO;
}

function resolveConnectorEnabled(kind: PoolRoamSourceBlockKind, role: PoolRoamSourceBlockRole): boolean {
  if (kind === "image") {
    return role === "root" || role === "image";
  }

  return role === "root";
}

function buildBlockRoleMetadata(input: {
  sourceBlockId: string;
  nodeKey: string;
  source: Pick<PoolRoamSourceRecord, "ideaId" | "title" | "body" | "contentType" | "sourceUrl">;
  kind: PoolRoamSourceBlockKind;
  role: PoolRoamSourceBlockRole;
  attachmentPaths?: readonly string[];
  attachmentPath?: string;
  attachmentIndex?: number;
}): PoolRoamManagedSourceBlockMetadata {
  return {
    sourceBlockId: input.sourceBlockId,
    nodeKey: input.nodeKey,
    sourceId: input.source.ideaId,
    kind: input.kind,
    role: input.role,
    contentType: input.source.contentType,
    title: input.source.title,
    body: input.source.body,
    sourceUrl: input.source.sourceUrl,
    attachmentPaths: normalizeAttachmentPaths(input.attachmentPaths),
    attachmentPath: input.attachmentPath,
    attachmentIndex: input.attachmentIndex,
    connectorEnabled: resolveConnectorEnabled(input.kind, input.role),
    layoutVersion: 1
  };
}

function prefixCalloutLine(line: string): string {
  return line.length > 0 ? `> ${line}` : ">";
}

function buildLegacyRootNodeKey(sourceId: string): string {
  return `${sourceId}:root`;
}

function buildRootNodeKey(sourceBlockId: string): string {
  return `${sourceBlockId}:root`;
}

function buildLegacyCaptionNodeKey(sourceId: string): string {
  return `${sourceId}:caption`;
}

function buildCaptionNodeKey(sourceBlockId: string): string {
  return `${sourceBlockId}:caption`;
}

function buildLegacyImageNodeKey(sourceId: string, attachmentPath: string): string {
  return `${sourceId}:image:${attachmentPath}`;
}

function buildImageNodeKey(sourceBlockId: string, attachmentPath: string, attachmentOccurrence: number): string {
  return `${sourceBlockId}:image:${attachmentPath}:${attachmentOccurrence}`;
}

function buildManagedImageAttachments(source: PoolRoamSourceRecord, sourceBlockId: string): PoolRoamManagedImageAttachment[] {
  const imageAttachments = normalizeSourceAttachments(source).filter(isImageAttachment).slice(0, 7);
  const occurrenceCountByPath = new Map<string, number>();

  return imageAttachments.map((attachment, attachmentIndex) => {
    const attachmentOccurrence = occurrenceCountByPath.get(attachment.path) ?? 0;
    occurrenceCountByPath.set(attachment.path, attachmentOccurrence + 1);

    return {
      ...attachment,
      attachmentIndex,
      attachmentOccurrence,
      nodeKey: buildImageNodeKey(sourceBlockId, attachment.path, attachmentOccurrence)
    };
  });
}

function estimateTextNodeHeight(text: string, width: number): number {
  const approximateCharactersPerLine = Math.max(18, Math.floor(width / 10));
  const renderedLineCount = text.split("\n").reduce((count, line) => {
    const rawLine = line.length > 0 ? line.length : 1;
    return count + Math.max(1, Math.ceil(rawLine / approximateCharactersPerLine));
  }, 0);

  return DEFAULT_TEXT_PADDING + renderedLineCount * DEFAULT_TEXT_LINE_HEIGHT;
}

function resolveVideoAspectRatio(attachment: Pick<PoolRoamSourceAttachment, "width" | "height">): number {
  if (typeof attachment.width === "number" && attachment.width > 0 && typeof attachment.height === "number" && attachment.height > 0) {
    return attachment.width / attachment.height;
  }

  return DEFAULT_VIDEO_ASPECT_RATIO;
}

function defaultCreateSourceBlockId(): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  return `glitter-roam-source-block-${randomPart}`;
}

function defaultCreateNodeId(nodeKey: string): string {
  return `glitter-roam-${encodeURIComponent(nodeKey)}`;
}

function resolvePreferredImagePatterns(count: number): number[][] {
  switch (count) {
    case 1:
      return [[1]];
    case 2:
      return [[2], [1, 1]];
    case 3:
      return [[1, 2], [2, 1], [3]];
    case 4:
      return [[2, 2], [1, 3], [3, 1]];
    case 5:
      return [[2, 3], [3, 2], [1, 2, 2], [2, 2, 1]];
    case 6:
      return [[3, 3], [2, 2, 2], [1, 2, 3], [3, 2, 1]];
    case 7:
      return [[3, 2, 2], [2, 3, 2], [2, 2, 3], [1, 3, 3], [3, 3, 1]];
    default:
      return [];
  }
}

function evaluateImagePattern(input: { pattern: number[]; aspects: number[]; width: number; gap: number }) {
  const rowHeights: number[] = [];
  let offset = 0;

  for (const rowSize of input.pattern) {
    const rowAspects = input.aspects.slice(offset, offset + rowSize);
    const rowAspectTotal = rowAspects.reduce((sum, aspect) => sum + aspect, 0);
    if (rowAspectTotal <= 0) {
      return null;
    }

    const rowHeight = (input.width - input.gap * (rowSize - 1)) / rowAspectTotal;
    if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
      return null;
    }

    rowHeights.push(rowHeight);
    offset += rowSize;
  }

  const averageHeight = rowHeights.reduce((sum, height) => sum + height, 0) / rowHeights.length;
  const variance = rowHeights.reduce((sum, height) => sum + Math.pow(height - averageHeight, 2), 0) / rowHeights.length;
  const singleItemPenalty = input.pattern.filter((rowSize) => rowSize === 1).length * 0.3;
  const preferredRowCount = input.aspects.length <= 2 ? 1 : input.aspects.length <= 5 ? 2 : 3;
  const rowCountPenalty = Math.abs(input.pattern.length - preferredRowCount) * 0.2;
  const layoutHeight = rowHeights.reduce((sum, height) => sum + height, 0) + input.gap * (rowHeights.length - 1);
  const targetHeight = input.width * (input.aspects.length <= 2 ? 0.62 : input.aspects.length <= 4 ? 0.82 : 0.95);
  const targetHeightPenalty = Math.abs(layoutHeight - targetHeight) / input.width;

  return {
    rowHeights,
    layoutHeight,
    cost: variance / Math.max(averageHeight * averageHeight, 1) + singleItemPenalty + rowCountPenalty + targetHeightPenalty
  };
}

export function resolvePoolRoamSourceBlockKind(
  source: Pick<PoolRoamSourceRecord, "contentType" | "sourceUrl" | "attachments" | "attachmentPaths">
): PoolRoamSourceBlockKind {
  const attachments = normalizeSourceAttachments(source);
  const hasImageAttachment = attachments.some(isImageAttachment);
  const hasVideoAttachment = attachments.some((attachment) => inferAttachmentMediaType(attachment) === "video");

  if (source.contentType === "video") {
    return "video";
  }

  if (source.contentType === "mixed" && hasVideoAttachment) {
    return "video";
  }

  if (hasImageAttachment) {
    return "image";
  }

  if (hasVideoAttachment) {
    return "video";
  }

  if (source.contentType === "image") {
    return "image";
  }

  if (source.contentType === "link" || hasText(source.sourceUrl)) {
    return "link";
  }

  return "text";
}

export function buildPoolRoamCaptionMarkdown(source: PoolRoamSourceRecord): string {
  const kind = resolvePoolRoamSourceBlockKind(source);
  const attachments = normalizeSourceAttachments(source);
  const videoAttachment = kind === "video"
    ? attachments.find((attachment) => inferAttachmentMediaType(attachment) === "video")
    : undefined;
  const sourceUrl = hasText(source.sourceUrl) ? source.sourceUrl.trim() : null;
  const bodyLines = hasText(source.body) ? normalizeWhitespace(source.body).split("\n") : [];
  const calloutLines = [prefixCalloutLine(`[!glitter-source] ${normalizeTitle(source.title)}`)];

  if (sourceUrl) {
    calloutLines.push(prefixCalloutLine(`> ${sourceUrl}`));
  }

  if (sourceUrl && bodyLines.length > 0) {
    calloutLines.push(prefixCalloutLine(""));
  }

  for (const line of bodyLines) {
    calloutLines.push(prefixCalloutLine(line));
  }

  if (videoAttachment) {
    return [`![[${videoAttachment.path}]]`, ...calloutLines].join("\n");
  }

  return calloutLines.join("\n");
}

export function buildPoolRoamImageTileLayout(input: {
  images: ReadonlyArray<Pick<PoolRoamSourceAttachment, "path" | "width" | "height">>;
  width: number;
  gap?: number;
}): PoolRoamImageTileLayout {
  if (input.images.length < 1 || input.images.length > 7) {
    throw new Error("Pool roam image layout supports between 1 and 7 images.");
  }

  const gap = input.gap ?? DEFAULT_BLOCK_GAP;
  const aspects = input.images.map((image) => resolveImageAspectRatio(image));
  const patternEvaluations = resolvePreferredImagePatterns(input.images.length)
    .map((pattern) => ({ pattern, evaluation: evaluateImagePattern({ pattern, aspects, width: input.width, gap }) }))
    .filter((entry): entry is { pattern: number[]; evaluation: NonNullable<ReturnType<typeof evaluateImagePattern>> } => Boolean(entry.evaluation))
    .sort((left, right) => left.evaluation.cost - right.evaluation.cost);

  const bestPattern = patternEvaluations[0];
  if (!bestPattern) {
    throw new Error("Unable to resolve a pool roam image layout pattern.");
  }

  const tiles: PoolRoamImageTile[] = [];
  let imageOffset = 0;
  let y = 0;

  for (const [rowIndex, rowSize] of bestPattern.pattern.entries()) {
    const rowHeight = bestPattern.evaluation.rowHeights[rowIndex];
    let x = 0;

    for (let columnIndex = 0; columnIndex < rowSize; columnIndex += 1) {
      const imageIndex = imageOffset + columnIndex;
      const image = input.images[imageIndex];
      const aspectRatio = aspects[imageIndex];
      const tileWidth = rowHeight * aspectRatio;

      tiles.push({
        path: image.path,
        x,
        y,
        width: tileWidth,
        height: rowHeight,
        attachmentIndex: imageIndex,
        aspectRatio
      });

      x += tileWidth + gap;
    }

    imageOffset += rowSize;
    y += rowHeight + gap;
  }

  return {
    width: input.width,
    height: bestPattern.evaluation.layoutHeight,
    gap,
    tiles
  };
}

export function extractPoolRoamManagedNodeKey(node: unknown): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }

  const metadata = (node as { glitterSourceBlock?: { nodeKey?: unknown } }).glitterSourceBlock;
  return metadata && typeof metadata.nodeKey === "string" && metadata.nodeKey.trim().length > 0 ? metadata.nodeKey : null;
}

function extractPoolRoamManagedSourceBlockId(node: unknown): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }

  const metadata = (node as { glitterSourceBlock?: { sourceBlockId?: unknown } }).glitterSourceBlock;
  return metadata && typeof metadata.sourceBlockId === "string" && metadata.sourceBlockId.trim().length > 0
    ? metadata.sourceBlockId
    : null;
}

function resolvePoolRoamSourceBlockId(input: {
  source: Pick<PoolRoamSourceRecord, "ideaId">;
  sourceBlockId?: string;
  previousNodes?: readonly PoolRoamCanvasNodeLike[];
}): string {
  if (hasText(input.sourceBlockId)) {
    return input.sourceBlockId.trim();
  }

  const previousSourceBlockId = (input.previousNodes ?? [])
    .map((node) => extractPoolRoamManagedSourceBlockId(node))
    .find((sourceBlockId): sourceBlockId is string => hasText(sourceBlockId));
  if (previousSourceBlockId) {
    return previousSourceBlockId;
  }

  const hasLegacyIdeaScopedNode = (input.previousNodes ?? []).some((node) => {
    const nodeKey = extractPoolRoamManagedNodeKey(node);
    return nodeKey?.startsWith(`${input.source.ideaId}:`) ?? false;
  });
  if (hasLegacyIdeaScopedNode) {
    return input.source.ideaId;
  }

  return defaultCreateSourceBlockId();
}

export function resolvePoolRoamManagedNodeIds(input: {
  nodeKeys: readonly string[];
  previousNodes?: readonly PoolRoamCanvasNodeLike[];
  createNodeId?: (nodeKey: string) => string;
  nodeKeyAliases?: Readonly<Record<string, readonly string[]>>;
}): Record<string, string> {
  const previousIdByKey = new Map<string, string>();

  for (const node of input.previousNodes ?? []) {
    const nodeKey = extractPoolRoamManagedNodeKey(node);
    if (!nodeKey || previousIdByKey.has(nodeKey) || typeof node.id !== "string" || node.id.trim().length === 0) {
      continue;
    }

    previousIdByKey.set(nodeKey, node.id);
  }

  const createNodeId = input.createNodeId ?? defaultCreateNodeId;
  return Object.fromEntries(
    input.nodeKeys.map((nodeKey) => {
      const exactId = previousIdByKey.get(nodeKey);
      const aliasedId = input.nodeKeyAliases?.[nodeKey]
        ?.map((aliasKey) => previousIdByKey.get(aliasKey))
        .find((id): id is string => typeof id === "string" && id.trim().length > 0);

      return [nodeKey, exactId ?? aliasedId ?? createNodeId(nodeKey)];
    })
  );
}

export function extractPoolRoamManagedNodeIdMap(nodes: readonly PoolRoamCanvasNodeLike[]): Record<string, string> {
  return Object.fromEntries(
    nodes.flatMap((node) => {
      const nodeKey = extractPoolRoamManagedNodeKey(node);
      return nodeKey && typeof node.id === "string" && node.id.trim().length > 0 ? [[nodeKey, node.id]] : [];
    })
  );
}

// 归一化/替换时优先复用旧节点几何信息，这样用户手动拉过的边界不会被重建逻辑抹掉。
function buildPreviousNodeByIdMap(nodes: readonly PoolRoamCanvasNodeLike[] | undefined): Map<string, PoolRoamCanvasNodeLike> {
  return new Map(
    (nodes ?? [])
      .filter((node): node is PoolRoamCanvasNodeLike & { id: string } => typeof node.id === "string" && node.id.trim().length > 0)
      .map((node) => [node.id, node] as const)
  );
}

function resolvePersistedCoordinate(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolvePersistedSize(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function isManagedConnectorEnabled(metadata: Partial<PoolRoamManagedSourceBlockMetadata> | undefined): boolean {
  if (!metadata) {
    return true;
  }

  if (typeof metadata.connectorEnabled === "boolean") {
    return metadata.connectorEnabled;
  }

  if (metadata.role === "image") {
    return true;
  }

  if (metadata.role === "root") {
    return true;
  }

  return false;
}

function resolveCollectedSourceContent(
  block: Omit<PoolRoamCollectedSourceBlock, "sourceContent">
): PoolRoamSourceContent | null {
  if (!block.rootNode) {
    return null;
  }

  const storedMetadata = [block.rootNode, ...block.nodes]
    .map((node) => node.glitterSourceBlock)
    .find(
      (metadata) =>
        normalizeIdeaContentType(metadata.contentType) ||
        hasText(metadata.title) ||
        typeof metadata.body === "string" ||
        hasText(metadata.sourceUrl) ||
        normalizeAttachmentPaths(metadata.attachmentPaths).length > 0
    );
  const captionNode = block.nodes.find((node) => node.glitterSourceBlock.role === "caption" && hasText(node.text));
  const textCarrier = hasText(block.rootNode.text)
    ? block.rootNode.text
    : hasText(captionNode?.text)
      ? captionNode.text
      : "";
  const parsedContent = hasText(textCarrier) ? parsePoolRoamSourceMarkdown(textCarrier) : { body: "", attachmentPaths: [] };
  const attachmentPathsFromNodes = sortManagedImageNodes(
    block.nodes.filter((node) => node.glitterSourceBlock.role === "image")
  )
    .map((node) => {
      if (hasText(node.glitterSourceBlock.attachmentPath)) {
        return node.glitterSourceBlock.attachmentPath.trim();
      }
      return hasText(node.file) ? node.file.trim() : null;
    })
    .filter((path): path is string => Boolean(path));
  const storedAttachmentPaths = normalizeAttachmentPaths(storedMetadata?.attachmentPaths);
  const parsedAttachmentPaths = normalizeAttachmentPaths(parsedContent.attachmentPaths);
  const attachmentPaths = storedAttachmentPaths.length > 0
    ? storedAttachmentPaths
    : attachmentPathsFromNodes.length > 0
      ? attachmentPathsFromNodes
      : parsedAttachmentPaths;
  const sourceUrl = hasText(storedMetadata?.sourceUrl)
    ? storedMetadata.sourceUrl.trim()
    : hasText(parsedContent.sourceUrl)
      ? parsedContent.sourceUrl.trim()
      : undefined;
  const title = hasText(storedMetadata?.title)
    ? storedMetadata.title.trim()
    : hasText(parsedContent.title)
      ? parsedContent.title.trim()
      : block.rootNode.glitterSource?.ideaTitle ?? "";
  const body = typeof storedMetadata?.body === "string"
    ? normalizeWhitespace(storedMetadata.body)
    : typeof parsedContent.body === "string"
      ? normalizeWhitespace(parsedContent.body)
      : "";

  return {
    title,
    body,
    sourceUrl,
    attachmentPaths,
    contentType: inferSourceContentType({
      stored: normalizeIdeaContentType(storedMetadata?.contentType) ?? normalizeIdeaContentType(parsedContent.contentType),
      kind: block.rootNode.glitterSourceBlock.kind,
      sourceUrl,
      attachmentPaths
    })
  };
}

// 这里把多节点图片块/视频块重新收口成“一个逻辑来源块”，并兼容旧的单文本节点数据，供历史、导出、重写共用。
export function collectPoolRoamManagedSourceBlocks(canvas: PoolRoamCanvasData): PoolRoamCollectedSourceBlock[] {
  const blocks = new Map<string, Omit<PoolRoamCollectedSourceBlock, "sourceContent">>();

  for (const rawNode of canvas.nodes) {
    const sourceBlockId = extractPoolRoamManagedSourceBlockId(rawNode);
    if (sourceBlockId) {
      const node = rawNode as PoolRoamManagedCanvasNode;
      const existing = blocks.get(sourceBlockId) ?? {
        sourceBlockId,
        rootNode: null,
        nodes: [],
        legacy: false
      };
      existing.nodes.push(node);
      if (node.glitterSourceBlock.role === "root") {
        existing.rootNode = node;
      }
      blocks.set(sourceBlockId, existing);
      continue;
    }

    if (!isPoolRoamSourceMeta(rawNode.glitterSource) || !hasText(rawNode.id)) {
      continue;
    }

    const parsedContent = hasText(rawNode.text)
      ? parsePoolRoamSourceMarkdown(rawNode.text)
      : ({ body: "", attachmentPaths: [] } satisfies Partial<PoolRoamSourceContent>);
    const attachmentPaths = normalizeAttachmentPaths(parsedContent.attachmentPaths);
    const sourceUrl = hasText(parsedContent.sourceUrl) ? parsedContent.sourceUrl.trim() : undefined;
    const title = hasText(parsedContent.title) ? parsedContent.title.trim() : rawNode.glitterSource.ideaTitle;
    const body = typeof parsedContent.body === "string" ? normalizeWhitespace(parsedContent.body) : "";
    const contentType = inferSourceContentType({
      stored: normalizeIdeaContentType(parsedContent.contentType),
      sourceUrl,
      attachmentPaths
    });
    const kind = resolvePoolRoamSourceBlockKind({
      contentType,
      sourceUrl,
      attachmentPaths
    });
    const legacySourceBlockId = `legacy:${rawNode.glitterSource.ideaId}:${rawNode.id.trim()}`;
    const nodeKey = buildRootNodeKey(legacySourceBlockId);
    const legacyNode: PoolRoamManagedCanvasNode = {
      ...(rawNode as PoolRoamManagedCanvasNode),
      glitterSourceBlock: {
        sourceBlockId: legacySourceBlockId,
        nodeKey,
        sourceId: rawNode.glitterSource.ideaId,
        kind,
        role: "root",
        contentType,
        title,
        body,
        sourceUrl,
        attachmentPaths,
        connectorEnabled: resolveConnectorEnabled(kind, "root"),
        layoutVersion: 1
      }
    };

    blocks.set(legacySourceBlockId, {
      sourceBlockId: legacySourceBlockId,
      rootNode: legacyNode,
      nodes: [legacyNode],
      legacy: true
    });
  }

  return Array.from(blocks.values()).map((block) => ({
    ...block,
    sourceContent: resolveCollectedSourceContent(block)
  }));
}

export function isPoolRoamAllowedManagedEdge(
  edge: Record<string, unknown>,
  nodeById: ReadonlyMap<string, PoolRoamCanvasNodeLike>
): boolean {
  const fromNodeId = typeof edge.fromNode === "string" ? edge.fromNode : "";
  const toNodeId = typeof edge.toNode === "string" ? edge.toNode : "";
  const fromMetadata = nodeById.get(fromNodeId)?.glitterSourceBlock;
  const toMetadata = nodeById.get(toNodeId)?.glitterSourceBlock;

  if (!fromMetadata && !toMetadata) {
    return true;
  }
  if (fromMetadata && !isManagedConnectorEnabled(fromMetadata)) {
    return false;
  }
  if (toMetadata && !isManagedConnectorEnabled(toMetadata)) {
    return false;
  }

  return true;
}

function buildManagedTextNode(input: {
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;
  height?: number;
  metadata: PoolRoamManagedSourceBlockMetadata;
}): PoolRoamManagedCanvasNode {
  return {
    id: input.id,
    type: "text",
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height ?? estimateTextNodeHeight(input.text, input.width),
    text: input.text,
    glitterSourceBlock: input.metadata
  };
}

function buildManagedGroupNode(input: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metadata: PoolRoamManagedSourceBlockMetadata;
}): PoolRoamManagedCanvasNode {
  return {
    id: input.id,
    type: "group",
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    glitterSourceBlock: input.metadata
  };
}

function buildManagedFileNode(input: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  file: string;
  metadata: PoolRoamManagedSourceBlockMetadata;
}): PoolRoamManagedCanvasNode {
  return {
    id: input.id,
    type: "file",
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    file: input.file,
    glitterSourceBlock: input.metadata
  };
}

// 统一从来源内容生成漫游块：文本/链接/视频保持单根节点，多图内容拆成 root + caption + image 子节点，但仍共享同一个 sourceBlockId。
export function buildPoolRoamSourceBlock(input: BuildPoolRoamSourceBlockInput): PoolRoamSourceBlockBuildResult {
  const kind = resolvePoolRoamSourceBlockKind(input.source);
  const sourceBlockId = resolvePoolRoamSourceBlockId({
    source: input.source,
    sourceBlockId: input.sourceBlockId,
    previousNodes: input.previousNodes
  });
  const attachments = normalizeSourceAttachments(input.source);
  const attachmentPaths = attachments.map((attachment) => attachment.path);
  const blockWidth = input.width ?? (kind === "image" ? DEFAULT_IMAGE_BLOCK_WIDTH : DEFAULT_TEXT_BLOCK_WIDTH);
  const gap = input.gap ?? DEFAULT_BLOCK_GAP;
  const captionMarkdown = buildPoolRoamCaptionMarkdown(input.source);

  if (kind !== "image") {
    const nodeKey = buildRootNodeKey(sourceBlockId);
    const nodeIds = resolvePoolRoamManagedNodeIds({
      nodeKeys: [nodeKey],
      previousNodes: input.previousNodes,
      createNodeId: input.createNodeId,
      nodeKeyAliases: {
        [nodeKey]: [buildLegacyRootNodeKey(input.source.ideaId)]
      }
    });
    const previousNodeById = buildPreviousNodeByIdMap(input.previousNodes);
    const previousRootNode = previousNodeById.get(nodeIds[nodeKey]);
    const rootWidth = resolvePersistedSize(previousRootNode?.width, blockWidth);
    const videoAttachment = kind === "video"
      ? attachments.find((attachment) => inferAttachmentMediaType(attachment) === "video")
      : undefined;
    const reservedMediaHeight = videoAttachment
      ? Math.round(rootWidth / Math.max(resolveVideoAspectRatio(videoAttachment), 0.75))
      : 0;
    const rootHeight = resolvePersistedSize(
      previousRootNode?.height,
      estimateTextNodeHeight(captionMarkdown, rootWidth) + reservedMediaHeight
    );

    return {
      sourceBlockId,
      kind,
      nodes: [
        buildManagedTextNode({
          id: nodeIds[nodeKey],
          x: resolvePersistedCoordinate(previousRootNode?.x, input.x),
          y: resolvePersistedCoordinate(previousRootNode?.y, input.y),
          width: rootWidth,
          text: captionMarkdown,
          height: rootHeight,
          metadata: buildBlockRoleMetadata({
            sourceBlockId,
            nodeKey,
            source: input.source,
            kind,
            role: "root",
            attachmentPaths
          })
        })
      ]
    };
  }

  const imageAttachments = buildManagedImageAttachments(input.source, sourceBlockId);
  const rootKey = buildRootNodeKey(sourceBlockId);
  const captionKey = buildCaptionNodeKey(sourceBlockId);
  const imageNodeKeys = imageAttachments.map((attachment) => attachment.nodeKey);
  const nodeKeyAliases = {
    [rootKey]: [buildLegacyRootNodeKey(input.source.ideaId)],
    [captionKey]: [buildLegacyCaptionNodeKey(input.source.ideaId)],
    ...Object.fromEntries(
      imageAttachments
        .filter((attachment) => attachment.attachmentOccurrence === 0)
        .map((attachment) => [attachment.nodeKey, [buildLegacyImageNodeKey(input.source.ideaId, attachment.path)]])
    )
  };
  const nodeIds = resolvePoolRoamManagedNodeIds({
    nodeKeys: [rootKey, captionKey, ...imageNodeKeys],
    previousNodes: input.previousNodes,
    createNodeId: input.createNodeId,
    nodeKeyAliases
  });
  const previousNodeById = buildPreviousNodeByIdMap(input.previousNodes);
  const previousRootNode = previousNodeById.get(nodeIds[rootKey]);
  const rootX = resolvePersistedCoordinate(previousRootNode?.x, input.x);
  const rootY = resolvePersistedCoordinate(previousRootNode?.y, input.y);
  const rootWidth = resolvePersistedSize(previousRootNode?.width, blockWidth);
  const previousCaptionNode = previousNodeById.get(nodeIds[captionKey]);
  const captionX = resolvePersistedCoordinate(previousCaptionNode?.x, rootX);
  const captionY = resolvePersistedCoordinate(previousCaptionNode?.y, rootY);
  const captionWidth = resolvePersistedSize(previousCaptionNode?.width, rootWidth);
  const captionHeight = resolvePersistedSize(previousCaptionNode?.height, estimateTextNodeHeight(captionMarkdown, captionWidth));
  const captionNode = buildManagedTextNode({
    id: nodeIds[captionKey],
    x: captionX,
    y: captionY,
    width: captionWidth,
    text: captionMarkdown,
    height: captionHeight,
    metadata: buildBlockRoleMetadata({
      sourceBlockId,
      nodeKey: captionKey,
      source: input.source,
      kind,
      role: "caption",
      attachmentPaths
    })
  });

  const captionMediaGap = Math.max(gap, DEFAULT_CAPTION_MEDIA_GAP);
  const imageLayout = imageAttachments.length > 0
    ? buildPoolRoamImageTileLayout({
        images: imageAttachments,
        width: rootWidth,
        gap
      })
    : null;
  const imageNodes = (imageLayout?.tiles ?? []).map((tile) => {
    const attachment = imageAttachments[tile.attachmentIndex];
    const attachmentPath = attachment?.path ?? tile.path;
    const nodeKey = attachment?.nodeKey ?? buildImageNodeKey(sourceBlockId, attachmentPath, tile.attachmentIndex);

    return buildManagedFileNode({
      id: nodeIds[nodeKey],
      x: rootX + tile.x,
      y: captionY + captionHeight + captionMediaGap + tile.y,
      width: tile.width,
      height: tile.height,
      file: tile.path,
      metadata: buildBlockRoleMetadata({
        sourceBlockId,
        nodeKey,
        source: input.source,
        kind,
        role: "image",
        attachmentPaths,
        attachmentIndex: attachment?.attachmentIndex ?? tile.attachmentIndex,
        attachmentPath
      })
    });
  });

  const computedGroupHeight = Math.max(
    captionY - rootY + captionHeight,
    imageLayout ? captionY - rootY + captionHeight + captionMediaGap + imageLayout.height : 0
  );
  const groupNode = buildManagedGroupNode({
    id: nodeIds[rootKey],
    x: rootX,
    y: rootY,
    width: rootWidth,
    height: resolvePersistedSize(previousRootNode?.height, computedGroupHeight),
    metadata: buildBlockRoleMetadata({
      sourceBlockId,
      nodeKey: rootKey,
      source: input.source,
      kind,
      role: "root",
      attachmentPaths
    })
  });

  return {
    sourceBlockId,
    kind,
    nodes: [groupNode, captionNode, ...imageNodes]
  };
}
