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

import type { Vault } from "obsidian";
import type { IdeaContentType } from "../../domain/idea/idea-model";
import {
  buildPoolRoamSourceBlock,
  collectPoolRoamManagedSourceBlocks,
  isPoolRoamAllowedManagedEdge
} from "./pool-roam-source-blocks";

export type PoolRoamSourceBlockKind = "text" | "link" | "image" | "video";
export type PoolRoamSourceBlockRole = "root" | "caption" | "image";

export interface PoolRoamSourceAttachment {
  path: string;
  mediaType?: "image" | "video";
  width?: number;
  height?: number;
}

export interface PoolRoamSourceRecord {
  ideaId: string;
  title: string;
  body: string;
  contentType: IdeaContentType;
  sourceUrl?: string;
  attachments?: readonly PoolRoamSourceAttachment[];
  attachmentPaths?: readonly string[];
}

export interface PoolRoamManagedSourceBlockMetadata {
  sourceBlockId: string;
  nodeKey: string;
  sourceId: string;
  kind: PoolRoamSourceBlockKind;
  role: PoolRoamSourceBlockRole;
  contentType?: IdeaContentType;
  title?: string;
  body?: string;
  sourceUrl?: string;
  attachmentPaths?: readonly string[];
  attachmentPath?: string;
  attachmentIndex?: number;
  connectorEnabled?: boolean;
  layoutVersion?: 1;
}

export interface PoolRoamSourceMeta {
  ideaId: string;
  poolId: string;
  poolName: string;
  poolColor: string;
  ideaTitle: string;
  syncMode: "readonly-follow-source";
  status: "active" | "missing";
}

export interface PoolRoamThumbnailBox {
  nodeId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "source" | "plain";
}

export interface PoolRoamThumbnailEdge {
  fromNodeId: string;
  toNodeId: string;
}

export interface PoolRoamBoardRecord {
  path: string;
  name: string;
  updatedAt: number;
  relatedPools: Array<{ id: string; name: string; color: string }>;
  thumbnailBoxes: PoolRoamThumbnailBox[];
  thumbnailEdges?: PoolRoamThumbnailEdge[];
}

export type PoolRoamSourceContent = Pick<PoolRoamSourceRecord, "title" | "body" | "contentType" | "sourceUrl"> & {
  attachmentPaths: readonly string[];
};

export type PoolRoamAttachSourceContent = Pick<PoolRoamSourceRecord, "ideaId"> & PoolRoamSourceContent;

export interface PoolRoamAttachSourceInput extends PoolRoamAttachSourceContent {
  poolId: string;
  poolName: string;
  poolColor: string;
}

export interface PoolRoamCanvasNode {
  id: string;
  type: string;
  text?: string;
  file?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  glitterSource?: PoolRoamSourceMeta;
  glitterSourceBlock?: Partial<PoolRoamManagedSourceBlockMetadata>;
  [key: string]: unknown;
}

export type PoolRoamCanvasNodeLike = PoolRoamCanvasNode;
export type PoolRoamManagedCanvasNode<TNode extends PoolRoamCanvasNode = PoolRoamCanvasNode> = TNode & {
  glitterSourceBlock: PoolRoamManagedSourceBlockMetadata;
};

export interface PoolRoamCanvasData {
  nodes: PoolRoamCanvasNode[];
  edges: Array<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isVaultFile(value: unknown): value is { path: string; basename?: string; stat?: { mtime: number } } {
  return isRecord(value) && typeof value.path === "string";
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

function extractManagedSourceBlockId(node: unknown): string | null {
  if (!isRecord(node) || !isRecord(node.glitterSourceBlock) || typeof node.glitterSourceBlock.sourceBlockId !== "string") {
    return null;
  }

  const sourceBlockId = node.glitterSourceBlock.sourceBlockId.trim();
  return sourceBlockId.length > 0 ? sourceBlockId : null;
}

function hasPositionedThumbnailBounds(
  node: Pick<PoolRoamCanvasNode, "x" | "y" | "width" | "height">
): node is Pick<PoolRoamCanvasNode, "x" | "y" | "width" | "height"> & {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return (
    typeof node.x === "number"
    && typeof node.y === "number"
    && typeof node.width === "number"
    && typeof node.height === "number"
  );
}

function buildThumbnailEdgeIdentity(fromNodeId: string, toNodeId: string): string {
  return fromNodeId < toNodeId ? `${fromNodeId}\u0000${toNodeId}` : `${toNodeId}\u0000${fromNodeId}`;
}

function normalizeCanvasData(value: unknown): PoolRoamCanvasData {
  const record = isRecord(value) ? value : {};

  return {
    nodes: Array.isArray(record.nodes)
      ? record.nodes.filter(isRecord).map((node) => ({ ...node }) as PoolRoamCanvasNode)
      : [],
    edges: Array.isArray(record.edges)
      ? record.edges.filter(isRecord).map((edge) => ({ ...edge }))
      : []
  };
}

function formatRoamBoardTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function resolveBoardName(path: string): string {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.canvas$/i, "");
}

export function formatPoolRoamBoardDisplayName(name: string): string {
  return name.replace(/(\d{4}-\d{2}-\d{2}\s+\d{2})：(\d{2})(?=$|[^\d])/g, "$1:$2");
}

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}

function sanitizeRoamBoardFileName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/:/g, "：")
    .replace(/[\\/*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "Glitter灵感漫游";
}

async function ensureFolder(vault: Vault, path: string): Promise<void> {
  const normalized = normalizeVaultPath(path);
  const parts = normalized.split("/").filter(Boolean);
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = vault.getAbstractFileByPath(current);

    if (!existing) {
      await vault.createFolder(current);
      continue;
    }

    if (!("children" in existing)) {
      throw new Error(`Path exists and is not a folder: ${current}`);
    }
  }
}

function createUniqueRoamBoardPath(vault: Vault, directory: string, fileName: string): string {
  const normalizedDirectory = normalizeVaultPath(directory);
  const sanitizedBase = sanitizeRoamBoardFileName(fileName);
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;
    const candidate = normalizeVaultPath(`${normalizedDirectory}/${sanitizedBase}${suffix}.canvas`);

    if (!vault.getAbstractFileByPath(candidate)) {
      return candidate;
    }

    attempt += 1;
  }
}

type PoolRoamWorkflowSettings = {
  roam: {
    boardStorageDirectory: string;
  };
};

type PoolRoamAttachmentMediaType = NonNullable<PoolRoamSourceAttachment["mediaType"]>;
type PoolRoamMediaSize = { width: number; height: number };
type PoolRoamMeasureMediaInput = {
  resourceUrl: string;
  mediaType: PoolRoamAttachmentMediaType;
};

const POOL_ROAM_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".avif",
  ".heic",
  ".heif"
]);
const POOL_ROAM_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
  ".avi",
  ".wmv",
  ".ogv",
  ".ogg"
]);

function resolvePoolRoamAttachmentExtension(path: string): string {
  const normalizedPath = path.trim().toLowerCase();
  const fileName = normalizedPath.split("?")[0] ?? normalizedPath;
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex >= 0 ? fileName.slice(lastDotIndex) : "";
}

function inferPoolRoamAttachmentMediaType(path: string): PoolRoamAttachmentMediaType | undefined {
  const extension = resolvePoolRoamAttachmentExtension(path);
  if (POOL_ROAM_IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (POOL_ROAM_VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  return undefined;
}

function buildPoolRoamSourceMeta(input: PoolRoamAttachSourceInput): PoolRoamSourceMeta {
  return {
    ideaId: input.ideaId,
    poolId: input.poolId,
    poolName: input.poolName,
    poolColor: input.poolColor,
    ideaTitle: input.title,
    syncMode: "readonly-follow-source",
    status: "active"
  };
}

async function defaultMeasurePoolRoamMediaSize(input: PoolRoamMeasureMediaInput): Promise<PoolRoamMediaSize | null> {
  if (typeof document === "undefined") {
    return null;
  }

  if (input.mediaType === "image") {
    if (typeof Image === "undefined") {
      return null;
    }

    return new Promise((resolve) => {
      const image = new Image();
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
      };

      image.onload = () => {
        const width = image.naturalWidth ?? 0;
        const height = image.naturalHeight ?? 0;
        cleanup();
        resolve(width > 0 && height > 0 ? { width, height } : null);
      };
      image.onerror = () => {
        cleanup();
        resolve(null);
      };
      image.src = input.resourceUrl;
    });
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      try {
        video.pause();
      } catch {
        return;
      } finally {
        video.removeAttribute("src");
        video.load?.();
      }
    };

    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const width = video.videoWidth ?? 0;
      const height = video.videoHeight ?? 0;
      cleanup();
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = input.resourceUrl;
  });
}

export function createPoolRoamWorkflow(deps: {
  vault: Vault;
  settings: PoolRoamWorkflowSettings;
  clock?: () => Date;
  measureMediaSize?: (input: PoolRoamMeasureMediaInput) => Promise<PoolRoamMediaSize | null>;
}) {
  const measureMediaSize = deps.measureMediaSize ?? defaultMeasurePoolRoamMediaSize;

  function resolveDirectory(): string {
    return normalizeVaultPath(deps.settings.roam.boardStorageDirectory);
  }

  async function readRoamBoard(path: string): Promise<{ path: string; canvas: PoolRoamCanvasData }> {
    const file = deps.vault.getAbstractFileByPath(path);
    if (!isVaultFile(file)) {
      throw new Error(`Roam board not found: ${path}`);
    }

    const content = await deps.vault.read(file as any);
    return {
      path: file.path,
      canvas: normalizeCanvasData(JSON.parse(content))
    };
  }

  async function writeRoamBoard(path: string, canvas: PoolRoamCanvasData): Promise<void> {
    const file = deps.vault.getAbstractFileByPath(path);
    if (!isVaultFile(file)) {
      throw new Error(`Roam board not found: ${path}`);
    }

    await deps.vault.modify(file as any, JSON.stringify(canvas, null, 2));
  }

  async function resolveSourceAttachments(attachmentPaths: readonly string[]): Promise<PoolRoamSourceAttachment[]> {
    const resolvedAttachments = await Promise.all(
      attachmentPaths.map(async (attachmentPath) => {
        const normalizedPath = attachmentPath.trim();
        if (!normalizedPath) {
          return null;
        }

        const mediaType = inferPoolRoamAttachmentMediaType(normalizedPath);
        if (!mediaType) {
          return { path: normalizedPath } satisfies PoolRoamSourceAttachment;
        }

        const file = deps.vault.getAbstractFileByPath(normalizedPath);
        if (!isVaultFile(file)) {
          return { path: normalizedPath, mediaType } satisfies PoolRoamSourceAttachment;
        }

        const resourceUrl = deps.vault.getResourcePath(file as any);
        if (!resourceUrl) {
          return { path: normalizedPath, mediaType } satisfies PoolRoamSourceAttachment;
        }

        const size = await measureMediaSize({ resourceUrl, mediaType });
        return {
          path: normalizedPath,
          mediaType,
          ...(size ?? {})
        } satisfies PoolRoamSourceAttachment;
      })
    );

    return resolvedAttachments.filter((attachment): attachment is PoolRoamSourceAttachment => Boolean(attachment));
  }

  async function buildSourceNodes(
    input: PoolRoamAttachSourceInput & {
      previousNodes?: readonly PoolRoamCanvasNodeLike[];
      sourceBlockId?: string;
    },
    position: { x: number; y: number }
  ): Promise<PoolRoamCanvasNode[]> {
    const attachments = await resolveSourceAttachments(input.attachmentPaths);
    const sourceBlock = buildPoolRoamSourceBlock({
      sourceBlockId: input.sourceBlockId,
      previousNodes: input.previousNodes,
      source: {
        ideaId: input.ideaId,
        title: input.title,
        body: input.body,
        contentType: input.contentType,
        sourceUrl: input.sourceUrl,
        attachments,
        attachmentPaths: input.attachmentPaths
      },
      x: position.x,
      y: position.y
    });
    const sourceMeta = buildPoolRoamSourceMeta(input);

    return sourceBlock.nodes.map((node) =>
      node.glitterSourceBlock.role === "root"
        ? {
            ...node,
            glitterSource: sourceMeta
          }
        : { ...node }
    );
  }

  function cloneCanvas(canvas: PoolRoamCanvasData): PoolRoamCanvasData {
    return {
      ...canvas,
      nodes: canvas.nodes.map((node) => ({ ...node })),
      edges: canvas.edges.map((edge) => ({ ...edge }))
    };
  }

  function filterManagedCanvasEdges(canvas: PoolRoamCanvasData): Array<Record<string, unknown>> {
    const nodeById = new Map(canvas.nodes.map((node) => [node.id, node] as const));
    return canvas.edges.filter((edge) => isPoolRoamAllowedManagedEdge(edge, nodeById)).map((edge) => ({ ...edge }));
  }

  function removeNodesAndEdges(canvas: PoolRoamCanvasData, removedNodeIds: ReadonlySet<string>): PoolRoamCanvasData {
    return {
      ...canvas,
      nodes: canvas.nodes.filter((node) => !removedNodeIds.has(node.id)).map((node) => ({ ...node })),
      edges: canvas.edges
        .filter((edge) => {
          const fromNodeId = typeof edge.fromNode === "string" ? edge.fromNode : undefined;
          const toNodeId = typeof edge.toNode === "string" ? edge.toNode : undefined;
          return !removedNodeIds.has(fromNodeId ?? "") && !removedNodeIds.has(toNodeId ?? "");
        })
        .map((edge) => ({ ...edge }))
    };
  }

  function replaceBlockNodes(
    canvas: PoolRoamCanvasData,
    removedNodeIds: ReadonlySet<string>,
    replacementNodes: readonly PoolRoamCanvasNode[]
  ): PoolRoamCanvasNode[] {
    const nextNodes: PoolRoamCanvasNode[] = [];
    let inserted = false;

    for (const node of canvas.nodes) {
      if (removedNodeIds.has(node.id)) {
        if (!inserted) {
          nextNodes.push(...replacementNodes.map((replacementNode) => ({ ...replacementNode })));
          inserted = true;
        }
        continue;
      }

      nextNodes.push({ ...node });
    }

    if (!inserted) {
      nextNodes.push(...replacementNodes.map((replacementNode) => ({ ...replacementNode })));
    }

    return nextNodes;
  }

  // 替换/缺失/归一化都走同一条重写路径，确保节点结构、边界复用和边连接过滤保持一致。
  async function rewriteManagedSourceBlockOnCanvas(input: {
    canvas: PoolRoamCanvasData;
    nodeId: string;
    content?: PoolRoamSourceContent;
    missing?: boolean;
  }): Promise<PoolRoamCanvasData> {
    const blocks = collectPoolRoamManagedSourceBlocks(input.canvas);
    const targetBlock = blocks.find((block) => block.nodes.some((node) => node.id === input.nodeId));
    if (!targetBlock?.rootNode || !isPoolRoamSourceMeta(targetBlock.rootNode.glitterSource) || !targetBlock.sourceContent) {
      return cloneCanvas(input.canvas);
    }

    const rootNode = targetBlock.rootNode;
    const rootSource = rootNode.glitterSource;
    if (!isPoolRoamSourceMeta(rootSource)) {
      return cloneCanvas(input.canvas);
    }

    const nextContent = input.content ?? targetBlock.sourceContent;
    const replacementNodes = await buildSourceNodes(
      {
        ideaId: rootSource.ideaId,
        poolId: rootSource.poolId,
        poolName: rootSource.poolName,
        poolColor: rootSource.poolColor,
        title: nextContent.title,
        body: nextContent.body,
        contentType: nextContent.contentType,
        sourceUrl: nextContent.sourceUrl,
        attachmentPaths: nextContent.attachmentPaths,
        previousNodes: targetBlock.nodes,
        sourceBlockId: targetBlock.sourceBlockId
      },
      {
        x: typeof rootNode.x === "number" ? rootNode.x : 160,
        y: typeof rootNode.y === "number" ? rootNode.y : 120
      }
    );
    const nextStatus = input.missing ? "missing" : rootSource.status;
    const replacementNodesWithStatus = replacementNodes.map((node) =>
      node.glitterSourceBlock?.role === "root" && isPoolRoamSourceMeta(node.glitterSource)
        ? {
            ...node,
            glitterSource: {
              ...node.glitterSource,
              status: nextStatus
            }
          }
        : { ...node }
    );
    const removedNodeIds = new Set(targetBlock.nodes.map((node) => node.id));
    const retainedNodeIds = new Set(replacementNodesWithStatus.map((node) => node.id));
    const nextNodes = replaceBlockNodes(input.canvas, removedNodeIds, replacementNodesWithStatus);
    const edgeFilteredCanvas: PoolRoamCanvasData = {
      ...input.canvas,
      nodes: nextNodes,
      edges: input.canvas.edges
        .filter((edge) => {
          const fromNodeId = typeof edge.fromNode === "string" ? edge.fromNode : "";
          const toNodeId = typeof edge.toNode === "string" ? edge.toNode : "";
          if (removedNodeIds.has(fromNodeId) && !retainedNodeIds.has(fromNodeId)) {
            return false;
          }
          if (removedNodeIds.has(toNodeId) && !retainedNodeIds.has(toNodeId)) {
            return false;
          }
          return true;
        })
        .map((edge) => ({ ...edge }))
    };

    return {
      ...edgeFilteredCanvas,
      edges: filterManagedCanvasEdges(edgeFilteredCanvas)
    };
  }

  function resolveNextSourceNodePosition(canvas: PoolRoamCanvasData): { x: number; y: number } {
    const positionedNodes = canvas.nodes.filter(
      (node) => typeof node.x === "number" && typeof node.y === "number" && typeof node.width === "number"
    );
    if (positionedNodes.length === 0) {
      return { x: 160, y: 120 };
    }

    const maxRight = positionedNodes.reduce((max, node) => Math.max(max, (node.x as number) + (node.width as number)), 0);
    const firstY = typeof positionedNodes[0]?.y === "number" ? positionedNodes[0].y : 120;
    return {
      x: maxRight + 96,
      y: firstY
    };
  }

  async function attachIdeaSourceToNewBoard(input: PoolRoamAttachSourceInput): Promise<{
    path: string;
    canvas: PoolRoamCanvasData;
  }> {
    const createdAt = deps.clock?.() ?? new Date();
    const fileName = `Glitter灵感漫游 ${formatRoamBoardTimestamp(createdAt)}`;
    const path = createUniqueRoamBoardPath(deps.vault, resolveDirectory(), fileName);
    const canvas: PoolRoamCanvasData = {
      nodes: await buildSourceNodes(input, { x: 160, y: 120 }),
      edges: []
    };

    await ensureFolder(deps.vault, resolveDirectory());
    await deps.vault.create(path, JSON.stringify(canvas, null, 2));

    return { path, canvas };
  }

  async function attachIdeaSourceToBoard(input: PoolRoamAttachSourceInput & { boardPath: string }): Promise<{
    path: string;
    canvas: PoolRoamCanvasData;
  }> {
    const board = await readRoamBoard(input.boardPath);
    const nextCanvas: PoolRoamCanvasData = {
      ...board.canvas,
      nodes: [
        ...board.canvas.nodes.map((node) => ({ ...node })),
        ...(await buildSourceNodes(input, resolveNextSourceNodePosition(board.canvas)))
      ],
      edges: board.canvas.edges.map((edge) => ({ ...edge }))
    };

    await writeRoamBoard(board.path, nextCanvas);
    return {
      path: board.path,
      canvas: nextCanvas
    };
  }

  async function listRoamBoards(): Promise<PoolRoamBoardRecord[]> {
    const directoryPrefix = `${resolveDirectory()}/`;
    const files = deps.vault
      .getFiles()
      .filter((file) => file.path.startsWith(directoryPrefix) && file.path.endsWith(".canvas"));

    const records = await Promise.all(
      files.map(async (file) => {
        try {
          const { canvas } = await readRoamBoard(file.path);
          const relatedPoolMap = new Map<string, { id: string; name: string; color: string }>();
          const thumbnailBoxes: PoolRoamThumbnailBox[] = [];
          // 历史缩略图按逻辑来源块聚合，避免多图块把一条来源拆成多张缩略卡和重复连线。
          const managedBlocks = collectPoolRoamManagedSourceBlocks(canvas).filter((block) => !block.legacy);
          const managedNodeIdToLogicalNodeId = new Map<string, string>();
          const positionedThumbnailNodeIds = new Set<string>();
          const managedNodeIds = new Set<string>();

          for (const block of managedBlocks) {
            for (const node of block.nodes) {
              managedNodeIds.add(node.id);
              managedNodeIdToLogicalNodeId.set(node.id, block.sourceBlockId);
            }

            if (block.rootNode && isPoolRoamSourceMeta(block.rootNode.glitterSource) && !relatedPoolMap.has(block.rootNode.glitterSource.poolId)) {
              relatedPoolMap.set(block.rootNode.glitterSource.poolId, {
                id: block.rootNode.glitterSource.poolId,
                name: block.rootNode.glitterSource.poolName,
                color: block.rootNode.glitterSource.poolColor
              });
            }

            if (!block.rootNode || !hasPositionedThumbnailBounds(block.rootNode)) {
              continue;
            }

            positionedThumbnailNodeIds.add(block.sourceBlockId);
            thumbnailBoxes.push({
              nodeId: block.sourceBlockId,
              x: block.rootNode.x,
              y: block.rootNode.y,
              width: block.rootNode.width,
              height: block.rootNode.height,
              kind: isPoolRoamSourceMeta(block.rootNode.glitterSource) ? "source" : "plain"
            });
          }

          for (const node of canvas.nodes) {
            if (managedNodeIds.has(node.id)) {
              continue;
            }

            const nodeId = typeof node.id === "string" ? node.id : undefined;
            if (hasPositionedThumbnailBounds(node)) {
              if (nodeId) {
                positionedThumbnailNodeIds.add(nodeId);
              }
              thumbnailBoxes.push({
                nodeId,
                x: node.x,
                y: node.y,
                width: node.width,
                height: node.height,
                kind: isPoolRoamSourceMeta(node.glitterSource) ? "source" : "plain"
              });
            }

            if (isPoolRoamSourceMeta(node.glitterSource) && !relatedPoolMap.has(node.glitterSource.poolId)) {
              relatedPoolMap.set(node.glitterSource.poolId, {
                id: node.glitterSource.poolId,
                name: node.glitterSource.poolName,
                color: node.glitterSource.poolColor
              });
            }
          }

          const seenThumbnailEdgeIds = new Set<string>();
          const thumbnailEdges = canvas.edges.flatMap((edge) => {
            const fromNodeId = typeof edge.fromNode === "string" ? edge.fromNode : undefined;
            const toNodeId = typeof edge.toNode === "string" ? edge.toNode : undefined;
            if (!fromNodeId || !toNodeId) {
              return [];
            }

            const logicalFromNodeId = managedNodeIdToLogicalNodeId.get(fromNodeId) ?? fromNodeId;
            const logicalToNodeId = managedNodeIdToLogicalNodeId.get(toNodeId) ?? toNodeId;
            if (logicalFromNodeId === logicalToNodeId) {
              return [];
            }
            if (!positionedThumbnailNodeIds.has(logicalFromNodeId) || !positionedThumbnailNodeIds.has(logicalToNodeId)) {
              return [];
            }

            const edgeIdentity = buildThumbnailEdgeIdentity(logicalFromNodeId, logicalToNodeId);
            if (seenThumbnailEdgeIds.has(edgeIdentity)) {
              return [];
            }
            seenThumbnailEdgeIds.add(edgeIdentity);
            return [{ fromNodeId: logicalFromNodeId, toNodeId: logicalToNodeId }];
          });

          return {
            path: file.path,
            name: formatPoolRoamBoardDisplayName(file.basename ?? resolveBoardName(file.path)),
            updatedAt: file.stat?.mtime ?? 0,
            relatedPools: Array.from(relatedPoolMap.values()),
            thumbnailBoxes,
            thumbnailEdges
          };
        } catch {
          return {
            path: file.path,
            name: formatPoolRoamBoardDisplayName(file.basename ?? resolveBoardName(file.path)),
            updatedAt: file.stat?.mtime ?? 0,
            relatedPools: [],
            thumbnailBoxes: [],
            thumbnailEdges: []
          };
        }
      })
    );

    return records.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async function deleteRoamBoards(paths: string[]): Promise<number> {
    const vaultWithDelete = deps.vault as Vault & {
      delete?: (file: unknown, force?: boolean) => Promise<unknown>;
      trash?: (file: unknown, system?: boolean) => Promise<unknown>;
    };
    let deletedCount = 0;

    for (const path of paths) {
      const file = deps.vault.getAbstractFileByPath(path);
      if (!isVaultFile(file)) {
        continue;
      }

      if (typeof vaultWithDelete.delete === "function") {
        await vaultWithDelete.delete(file as never, true);
        deletedCount += 1;
        continue;
      }

      if (typeof vaultWithDelete.trash === "function") {
        await vaultWithDelete.trash(file as never, true);
        deletedCount += 1;
        continue;
      }

      throw new Error("ROAM_BOARD_DELETE_UNAVAILABLE");
    }

    return deletedCount;
  }

  async function replaceSourceNodeContent(input: {
    boardPath: string;
    nodeId: string;
    content: PoolRoamSourceContent;
  }): Promise<{ path: string; canvas: PoolRoamCanvasData }> {
    const board = await readRoamBoard(input.boardPath);
    const nextCanvas = await rewriteManagedSourceBlockOnCanvas({
      canvas: board.canvas,
      nodeId: input.nodeId,
      content: input.content
    });

    await writeRoamBoard(board.path, nextCanvas);
    return {
      path: board.path,
      canvas: nextCanvas
    };
  }

  async function markSourceNodeMissing(input: {
    boardPath: string;
    nodeId: string;
  }): Promise<{ path: string; canvas: PoolRoamCanvasData }> {
    const board = await readRoamBoard(input.boardPath);
    const nextCanvas = await rewriteManagedSourceBlockOnCanvas({
      canvas: board.canvas,
      nodeId: input.nodeId,
      missing: true
    });

    await writeRoamBoard(board.path, nextCanvas);
    return {
      path: board.path,
      canvas: nextCanvas
    };
  }

  // 打开旧白板时把遗留块先规整到当前结构，后续交互就都能复用同一套 managed source block 语义。
  async function normalizeManagedSourceBlocks(input: {
    boardPath: string;
  }): Promise<{ path: string; canvas: PoolRoamCanvasData }> {
    const board = await readRoamBoard(input.boardPath);
    const collectedBlocks = collectPoolRoamManagedSourceBlocks(board.canvas);
    const orphanedNodeIds = new Set(
      collectedBlocks.flatMap((block) => (!block.rootNode ? block.nodes.map((node) => node.id) : []))
    );
    let nextCanvas = orphanedNodeIds.size > 0 ? removeNodesAndEdges(board.canvas, orphanedNodeIds) : cloneCanvas(board.canvas);
    const rootNodeIds = collectPoolRoamManagedSourceBlocks(nextCanvas).flatMap((block) =>
      block.rootNode ? [block.rootNode.id] : []
    );

    for (const rootNodeId of rootNodeIds) {
      nextCanvas = await rewriteManagedSourceBlockOnCanvas({
        canvas: nextCanvas,
        nodeId: rootNodeId
      });
    }

    nextCanvas = {
      ...nextCanvas,
      edges: filterManagedCanvasEdges(nextCanvas)
    };

    await writeRoamBoard(board.path, nextCanvas);
    return {
      path: board.path,
      canvas: nextCanvas
    };
  }

  async function detachSourceNode(input: {
    boardPath: string;
    nodeId: string;
  }): Promise<{ path: string; canvas: PoolRoamCanvasData }> {
    const board = await readRoamBoard(input.boardPath);
    const targetNode = board.canvas.nodes.find((node) => node.id === input.nodeId);
    const targetSourceBlockId = extractManagedSourceBlockId(targetNode);
    const removedNodeIds = new Set(
      board.canvas.nodes.flatMap((node) => {
        if (targetSourceBlockId) {
          return extractManagedSourceBlockId(node) === targetSourceBlockId && typeof node.id === "string" ? [node.id] : [];
        }

        return node.id === input.nodeId && isPoolRoamSourceMeta(node.glitterSource) ? [node.id] : [];
      })
    );
    const nextCanvas: PoolRoamCanvasData = {
      ...board.canvas,
      nodes: board.canvas.nodes.filter((node) => !removedNodeIds.has(node.id)).map((node) => ({ ...node })),
      edges: board.canvas.edges
        .filter((edge) => {
          const fromNodeId = typeof edge.fromNode === "string" ? edge.fromNode : undefined;
          const toNodeId = typeof edge.toNode === "string" ? edge.toNode : undefined;
          return !removedNodeIds.has(fromNodeId ?? "") && !removedNodeIds.has(toNodeId ?? "");
        })
        .map((edge) => ({ ...edge }))
    };

    await writeRoamBoard(board.path, nextCanvas);
    return {
      path: board.path,
      canvas: nextCanvas
    };
  }

  return {
    resolveDirectory,
    attachIdeaSourceToNewBoard,
    attachIdeaSourceToBoard,
    listRoamBoards,
    deleteRoamBoards,
    readRoamBoard,
    replaceSourceNodeContent,
    markSourceNodeMissing,
    normalizeManagedSourceBlocks,
    detachSourceNode
  };
}
