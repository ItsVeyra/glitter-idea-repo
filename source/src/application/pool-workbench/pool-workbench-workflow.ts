import type { Vault } from "obsidian";
import { buildPoolMarkdownDocument } from "./pool-markdown-document";
import {
  createPoolRoamWorkflow,
  type PoolRoamAttachSourceInput,
  type PoolRoamBoardRecord,
  type PoolRoamCanvasData,
  type PoolRoamSourceContent
} from "./pool-roam-workflow";
import { collectPoolRoamManagedSourceBlocks } from "./pool-roam-source-blocks";
import {
  compareIdeaBrowseOrder,
  createIdeaBrowseQueryService,
  normalizeIdeaBrowseContentFilter,
  type IdeaBrowseQueryResult,
  type IdeaBrowseQueryService
} from "../idea-query/idea-browse-query";
import {
  createIdeaRuntimeSource,
  type IdeaRuntimeSource
} from "../idea-query/idea-runtime-source";
import type { Idea } from "../../domain/idea/idea-model";
import type { createIdeaService } from "../../domain/idea/idea-service";
import type { createPoolService } from "../../domain/pool/pool-service";
import type { createVaultFileStore } from "../../storage/vault-file-store";
import { resolvePoolDescription } from "../../plugin/constants";

export type PoolWorkbenchStatus = "all" | "referenced" | "file-created" | "with-markers";
export type PoolWorkbenchScope = "pool" | "global-status";
export type PoolWorkbenchContentFilter = "all" | "text" | "link" | "image" | "video";
export type PoolWorkbenchSort = "updated-desc" | "created-desc" | "title-asc";

export interface LoadPoolStateInput {
  poolId?: string;
  scope?: PoolWorkbenchScope;
  query: string;
  status: PoolWorkbenchStatus;
  contentFilter: PoolWorkbenchContentFilter;
  sort: PoolWorkbenchSort;
  selectedIdeaIds: string[];
}

export interface PoolWorkbenchSnippetLocation {
  notePath: string;
  noteTitle: string;
  occurrenceCount: number;
  stale: boolean;
}

export interface PoolWorkbenchCard {
  id: string;
  title: string;
  body: string;
  excerpt: string;
  hasBodyContent: boolean;
  selected: boolean;
  contentType: Idea["contentType"];
  sourceUrl?: string;
  attachmentPaths: string[];
  mediaThumbnailUrl?: string;
  mediaThumbnailUrls?: string[];
  fileCreated: boolean;
  filePath?: string;
  referenced: boolean;
  snippetNoteCount: number;
  snippetLocations: PoolWorkbenchSnippetLocation[];
  createdAt?: string;
  updatedAt: string;
  editedAt?: string;
}

export interface PoolWorkbenchRuntimeState {
  pool: {
    id: string;
    title: string;
    description: string;
    totalItemCount: number;
    visibleItemCount: number;
    color?: string;
    tone: "bluegray";
  };
  header: {
    eyebrow: string;
    hint: string;
  };
  cards: PoolWorkbenchCard[];
  controls: {
    query: string;
    status: PoolWorkbenchStatus;
    contentFilter: PoolWorkbenchContentFilter;
    sort: PoolWorkbenchSort;
    selectedCount: number;
    hasSelection: boolean;
  };
  poolOptions: Array<{
    id: string;
    label: string;
    count: number;
    selected: boolean;
  }>;
}

export interface PoolMarkdownPreview {
  poolId: string;
  poolTitle: string;
  markdown: string;
}

export interface PoolWorkbenchWorkflow {
  loadPoolState(input: LoadPoolStateInput): Promise<PoolWorkbenchRuntimeState>;
  loadPoolMarkdownPreview(input: { poolId: string; sort: PoolWorkbenchSort }): Promise<PoolMarkdownPreview>;
  savePoolMarkdownFile(input: { poolId: string; sort: PoolWorkbenchSort }): Promise<{ filePath: string; poolTitle: string }>;
  setActivePoolId(poolId: string): Promise<void>;
  moveIdeasToPool(ideaIds: string[], targetPoolId: string): Promise<void>;
  moveIdeasToNewPool(
    ideaIds: string[],
    input: { name: string; description?: string; color?: string }
  ): Promise<{ id: string; name: string }>;
  updatePool(poolId: string, input: { name?: string; description?: string }): Promise<void>;
  createIdeaFile(ideaId: string): Promise<{ filePath: string }>;
  listPoolRoamBoards(): Promise<PoolRoamBoardRecord[]>;
  deletePoolRoamBoards(boardPaths: string[]): Promise<number>;
  readPoolRoamBoard(input: { boardPath: string }): Promise<{ path: string; canvas: PoolRoamCanvasData }>;
  normalizePoolRoamBoard(input: { boardPath: string }): Promise<{ path: string; canvas: PoolRoamCanvasData }>;
  attachIdeaSourceToNewRoamBoard(input: PoolRoamAttachSourceInput): Promise<{ path: string; canvas: PoolRoamCanvasData }>;
  attachIdeaSourceToRoamBoard(
    input: PoolRoamAttachSourceInput & { boardPath?: string }
  ): Promise<{ path: string; canvas: PoolRoamCanvasData }>;
  detachIdeaSourceFromRoamBoard(input: { boardPath: string; nodeId: string }): Promise<{ path: string; canvas: PoolRoamCanvasData }>;
  syncIdeaSourceInRoamBoards(ideaId: string): Promise<number>;
  deleteIdea(ideaId: string): Promise<boolean>;
}

const GLITTER_POOL_EXPORT_FOLDER = "Glitter/池导出";

function hasSnippetRefs(idea: Pick<Idea, "snippetRefs">): boolean {
  return idea.snippetRefs.length > 0;
}

const GLOBAL_STATUS_POOL_ID = "pool-global-status";

function resolveGlobalStatusTitle(status: PoolWorkbenchStatus): string {
  if (status === "referenced") {
    return "已引用";
  }

  if (status === "file-created") {
    return "已建文件";
  }

  if (status === "all") {
    return "全部灵感";
  }

  return "已引用 / 已建文件";
}

function resolveGlobalStatusDescription(status: PoolWorkbenchStatus): string {
  if (status === "referenced") {
    return "汇总所有池中已引用到正文的灵感，便于继续定位、筛选与整理。";
  }

  if (status === "file-created") {
    return "汇总所有池中已创建文件的灵感，便于继续筛选、检索与整理。";
  }

  if (status === "all") {
    return "汇总所有池中的灵感，便于继续搜索、筛选与整理。";
  }

  return "汇总所有池中已引用或已建文件的灵感，便于继续搜索、筛选与整理。";
}

function resolveGlobalStatusHint(status: PoolWorkbenchStatus): string {
  if (status === "referenced") {
    return "筛选所有池中已引用到正文的灵感";
  }

  if (status === "file-created") {
    return "筛选所有池中已建文件的灵感";
  }

  if (status === "all") {
    return "浏览所有池中的灵感";
  }

  return "筛选所有池中的已引用与已建文件灵感";
}

function hasBodyContent(idea: Pick<Idea, "body">): boolean {
  return idea.body.trim().length > 0;
}

function excerptFromBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return "(empty)";
  }

  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function isFileLikeWithPath(file: unknown): file is { path: string } {
  return Boolean(file) && typeof file === "object" && typeof (file as { path?: unknown }).path === "string";
}

function resolveSnippetNoteTitle(notePath: string): string {
  const fileName = notePath.split("/").pop() ?? notePath;
  return fileName.replace(/\.md$/i, "");
}

function buildSnippetLocations(vault: Vault, snippetRefs: Idea["snippetRefs"]): PoolWorkbenchSnippetLocation[] {
  const groupedCounts = new Map<string, number>();

  for (const snippetRef of snippetRefs) {
    groupedCounts.set(snippetRef.notePath, (groupedCounts.get(snippetRef.notePath) ?? 0) + 1);
  }

  return Array.from(groupedCounts.entries()).map(([notePath, occurrenceCount]) => {
    const file = notePath ? vault.getAbstractFileByPath(notePath) : null;

    return {
      notePath,
      noteTitle: resolveSnippetNoteTitle(notePath),
      occurrenceCount,
      stale: !isFileLikeWithPath(file)
    };
  });
}

function buildPoolRoamSourceContent(idea: Pick<Idea, "title" | "body" | "contentType" | "sourceUrl" | "attachmentPaths">): PoolRoamSourceContent {
  return {
    title: idea.title,
    body: idea.body,
    contentType: idea.contentType,
    sourceUrl: idea.sourceUrl,
    attachmentPaths: [...idea.attachmentPaths]
  };
}

function isRoamSourceBlockForIdea(
  block: ReturnType<typeof collectPoolRoamManagedSourceBlocks>[number],
  ideaId: string
): boolean {
  return block.nodes.some((node) => node.glitterSourceBlock.sourceId === ideaId);
}

function resolveRoamSourceBlockNodeId(block: ReturnType<typeof collectPoolRoamManagedSourceBlocks>[number]): string | undefined {
  return block.rootNode?.id ?? block.nodes[0]?.id;
}

function resolveMediaThumbnailUrls(vault: Vault, attachmentPaths: string[]): string[] {
  const resourcePaths: string[] = [];
  const seen = new Set<string>();

  for (const attachmentPath of attachmentPaths) {
    if (!attachmentPath.trim()) {
      continue;
    }

    const file = vault.getAbstractFileByPath(attachmentPath);
    if (!isFileLikeWithPath(file)) {
      continue;
    }

    const resourcePath = vault.getResourcePath(file as any);
    if (!resourcePath || seen.has(resourcePath)) {
      continue;
    }

    seen.add(resourcePath);
    resourcePaths.push(resourcePath);
  }

  return resourcePaths;
}

export function createPoolWorkbenchWorkflow({
  poolService,
  ideaService,
  vaultFileStore,
  vault,
  ideaRuntimeSource = createIdeaRuntimeSource({ ideaService, vault }),
  ideaBrowseQueryService = createIdeaBrowseQueryService(),
  onIdeasMoved = () => undefined,
  onIdeaDeleted = () => undefined,
  resolveFileStorageDirectory = () => "Glitter",
  resolveRoamBoardStorageDirectory = () => "Glitter/灵感漫游"
}: {
  poolService: ReturnType<typeof createPoolService>;
  ideaService: ReturnType<typeof createIdeaService>;
  vaultFileStore: ReturnType<typeof createVaultFileStore>;
  vault: Vault;
  ideaRuntimeSource?: IdeaRuntimeSource;
  ideaBrowseQueryService?: IdeaBrowseQueryService;
  onIdeasMoved?: (ideaIds: string[]) => void;
  onIdeaDeleted?: (ideaId: string) => void;
  resolveFileStorageDirectory?: () => string;
  resolveRoamBoardStorageDirectory?: () => string;
}): PoolWorkbenchWorkflow {
  let activePoolId: string | null = null;
  const poolRoamWorkflow = createPoolRoamWorkflow({
    vault,
    settings: {
      get roam() {
        return {
          boardStorageDirectory: resolveRoamBoardStorageDirectory()
        };
      }
    }
  });

  async function loadPoolMarkdownPreviewData(input: {
    poolId: string;
    sort: PoolWorkbenchSort;
  }): Promise<PoolMarkdownPreview> {
    const pool = await poolService.getPool(input.poolId);
    if (!pool) {
      throw new Error(`Pool not found: ${input.poolId}`);
    }

    const baselineIdeaById = new Map((await ideaService.listIdeas()).map((idea) => [idea.id, idea]));
    const runtimeIdeas = await ideaRuntimeSource.listIdeas();
    const sortedIdeas = runtimeIdeas
      .filter((idea) => idea.poolId === pool.id)
      .sort((left, right) => compareIdeaBrowseOrder(
        baselineIdeaById.get(left.id) ?? left,
        baselineIdeaById.get(right.id) ?? right,
        input.sort
      ));

    return {
      poolId: pool.id,
      poolTitle: pool.name,
      markdown: buildPoolMarkdownDocument({
        pool: { name: pool.name },
        ideas: sortedIdeas
      })
    };
  }

  // 编辑灵感后，把所有挂载过该灵感的漫游来源块同步刷新；如果灵感已删，则改成 missing 状态。
  async function syncIdeaSourceInRoamBoards(ideaId: string): Promise<number> {
    if (typeof (vault as Vault & { getFiles?: () => unknown[] }).getFiles !== "function") {
      return 0;
    }

    const boardPaths = (await poolRoamWorkflow.listRoamBoards()).map((board) => board.path);
    if (boardPaths.length === 0) {
      return 0;
    }

    const latestIdea = await ideaService.getIdea(ideaId);
    const latestContent = latestIdea ? buildPoolRoamSourceContent(latestIdea) : null;
    const failedBoardPaths: string[] = [];
    let updatedBoards = 0;

    for (const boardPath of boardPaths) {
      try {
        const { canvas } = await poolRoamWorkflow.readRoamBoard(boardPath);
        const matchingBlocks = collectPoolRoamManagedSourceBlocks(canvas).filter((block) => isRoamSourceBlockForIdea(block, ideaId));
        if (matchingBlocks.length === 0) {
          continue;
        }

        for (const block of matchingBlocks) {
          const nodeId = resolveRoamSourceBlockNodeId(block);
          if (!nodeId) {
            continue;
          }

          if (latestContent) {
            await poolRoamWorkflow.replaceSourceNodeContent({
              boardPath,
              nodeId,
              content: latestContent
            });
            continue;
          }

          await poolRoamWorkflow.markSourceNodeMissing({
            boardPath,
            nodeId
          });
        }

        updatedBoards += 1;
      } catch {
        failedBoardPaths.push(boardPath);
      }
    }

    if (failedBoardPaths.length > 0) {
      throw new Error(
        `Failed to sync idea source in ${failedBoardPaths.length} roam board(s): ${failedBoardPaths.join(", ")}`
      );
    }

    return updatedBoards;
  }

  return {
    async loadPoolState(input) {
      const poolsWithCounts = await poolService.listPoolsWithCounts();
      const scope = input.scope ?? "pool";

      const requestedPoolId = scope === "pool" ? (input.poolId ?? activePoolId) : undefined;
      const activePool = requestedPoolId
        ? poolsWithCounts.find((pool) => pool.id === requestedPoolId) ?? poolsWithCounts[0] ?? null
        : scope === "pool"
          ? (poolsWithCounts[0] ?? null)
          : null;
      if (scope === "pool" && input.poolId === undefined) {
        activePoolId = activePool?.id ?? null;
      }

      const selectedIdeaIdSet = new Set(input.selectedIdeaIds);
      const allIdeas = await ideaRuntimeSource.listIdeas();
      const browseResult: IdeaBrowseQueryResult = scope === "global-status"
        ? ideaBrowseQueryService.queryIdeas({
            ideas: allIdeas,
            scope: "global-status",
            query: input.query,
            status: input.status,
            contentFilter: input.contentFilter,
            sort: input.sort
          })
        : activePool
          ? ideaBrowseQueryService.queryIdeas({
              ideas: allIdeas,
              scope: "pool",
              poolId: activePool.id,
              query: input.query,
              status: input.status,
              contentFilter: input.contentFilter,
              sort: input.sort
            })
          : {
              normalizedContentFilter: normalizeIdeaBrowseContentFilter(input.contentFilter),
              scopedIdeas: [],
              statusMatchedIdeas: [],
              visibleIdeas: []
            };
      const { normalizedContentFilter, statusMatchedIdeas, visibleIdeas } = browseResult;

      const cards: PoolWorkbenchCard[] = visibleIdeas.map((idea) => {
        const snippetLocations = buildSnippetLocations(vault, idea.snippetRefs);
        const mediaThumbnailUrls = resolveMediaThumbnailUrls(vault, idea.attachmentPaths);

        return {
          id: idea.id,
          title: idea.title,
          body: idea.body,
          excerpt: excerptFromBody(idea.body),
          hasBodyContent: hasBodyContent(idea),
          selected: selectedIdeaIdSet.has(idea.id),
          contentType: idea.contentType,
          sourceUrl: idea.sourceUrl,
          attachmentPaths: [...idea.attachmentPaths],
          mediaThumbnailUrl: mediaThumbnailUrls[0],
          mediaThumbnailUrls: idea.contentType === "video" || mediaThumbnailUrls.length === 0 ? undefined : mediaThumbnailUrls,
          fileCreated: idea.fileCreated,
          filePath: idea.filePath,
          referenced: hasSnippetRefs(idea),
          snippetNoteCount: snippetLocations.length,
          snippetLocations,
          createdAt: idea.createdAt,
          updatedAt: idea.updatedAt,
          editedAt: idea.editedAt
        };
      });

      return {
        pool: {
          id: scope === "global-status" ? GLOBAL_STATUS_POOL_ID : (activePool?.id ?? "pool-empty"),
          title: scope === "global-status" ? resolveGlobalStatusTitle(input.status) : (activePool?.name ?? "Idea Pool"),
          description:
            scope === "global-status"
              ? resolveGlobalStatusDescription(input.status)
              : resolvePoolDescription(activePool?.description),
          totalItemCount: scope === "global-status" ? statusMatchedIdeas.length : (activePool?.ideaCount ?? 0),
          visibleItemCount: cards.length,
          color: scope === "pool" ? activePool?.color : undefined,
          tone: "bluegray"
        },
        header: {
          eyebrow: scope === "global-status" ? "全局状态" : "灵感池",
          hint: scope === "global-status" ? resolveGlobalStatusHint(input.status) : "进入当前池继续整理与筛选"
        },
        cards,
        controls: {
          query: input.query,
          status: input.status,
          contentFilter: normalizedContentFilter,
          sort: input.sort,
          selectedCount: cards.filter((item) => item.selected).length,
          hasSelection: cards.some((item) => item.selected)
        },
        poolOptions: poolsWithCounts.map((pool) => ({
          id: pool.id,
          label: pool.name,
          count: pool.ideaCount,
          selected: scope === "pool" && pool.id === activePool?.id
        }))
      };
    },

    async loadPoolMarkdownPreview(input) {
      return loadPoolMarkdownPreviewData(input);
    },

    async savePoolMarkdownFile(input) {
      const preview = await loadPoolMarkdownPreviewData(input);

      await vaultFileStore.ensureFolder(GLITTER_POOL_EXPORT_FOLDER);
      const filePath = await vaultFileStore.createUniquePath(GLITTER_POOL_EXPORT_FOLDER, preview.poolTitle, ".md");
      await vault.create(filePath, preview.markdown);

      return {
        filePath,
        poolTitle: preview.poolTitle
      };
    },

    async setActivePoolId(poolId) {
      activePoolId = poolId;
    },

    async moveIdeasToPool(ideaIds, targetPoolId) {
      if (ideaIds.length === 0) {
        return;
      }

      await ideaService.moveIdeas(ideaIds, targetPoolId);
      onIdeasMoved(ideaIds);
    },

    async moveIdeasToNewPool(ideaIds, input) {
      const pool = await poolService.createPool(input);
      if (ideaIds.length > 0) {
        await ideaService.moveIdeas(ideaIds, pool.id);
        onIdeasMoved(ideaIds);
      }

      activePoolId = pool.id;
      return {
        id: pool.id,
        name: pool.name
      };
    },

    async updatePool(poolId, input) {
      await poolService.updatePool(poolId, input);
    },

    async createIdeaFile(ideaId) {
      const idea = await ideaService.getIdea(ideaId);
      if (!idea) {
        throw new Error(`Idea not found: ${ideaId}`);
      }

      const fileStorageDirectory = resolveFileStorageDirectory().trim() || "Glitter";
      await vaultFileStore.ensureFolder(fileStorageDirectory);
      const filePath = await vaultFileStore.createUniquePath(fileStorageDirectory, idea.title, ".md");
      const content = vaultFileStore.buildIdeaFileContent(idea);

      await vault.create(filePath, content);
      await ideaService.markFileCreated(idea.id, filePath);

      return { filePath };
    },

    async listPoolRoamBoards() {
      return poolRoamWorkflow.listRoamBoards();
    },

    async deletePoolRoamBoards(boardPaths) {
      return poolRoamWorkflow.deleteRoamBoards(boardPaths);
    },

    async readPoolRoamBoard(input) {
      return poolRoamWorkflow.readRoamBoard(input.boardPath);
    },

    async normalizePoolRoamBoard(input) {
      return poolRoamWorkflow.normalizeManagedSourceBlocks(input);
    },

    async attachIdeaSourceToNewRoamBoard(input) {
      return poolRoamWorkflow.attachIdeaSourceToNewBoard(input);
    },

    async attachIdeaSourceToRoamBoard(input) {
      if (input.boardPath) {
        return poolRoamWorkflow.attachIdeaSourceToBoard(input as PoolRoamAttachSourceInput & { boardPath: string });
      }

      return poolRoamWorkflow.attachIdeaSourceToNewBoard(input);
    },

    async detachIdeaSourceFromRoamBoard(input) {
      return poolRoamWorkflow.detachSourceNode(input);
    },

    async syncIdeaSourceInRoamBoards(ideaId) {
      return syncIdeaSourceInRoamBoards(ideaId);
    },

    async deleteIdea(ideaId) {
      const deleted = await ideaService.deleteIdea(ideaId);
      if (deleted) {
        try {
          await syncIdeaSourceInRoamBoards(ideaId);
        } finally {
          onIdeaDeleted(ideaId);
        }
      }
      return deleted;
    }
  };
}
