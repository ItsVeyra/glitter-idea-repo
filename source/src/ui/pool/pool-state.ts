import { buildIdeaStatusLabels, formatIdeaTimestamp } from "../../domain/idea/idea-model";
import {
  CREATE_NEW_POOL_ID,
  DEFAULT_POOL_DESCRIPTION,
  NEW_POOL_CREATED_ID,
  NEW_POOL_CREATED_LABEL,
  resolvePoolDescription
} from "../../plugin/constants";
import type { PoolColorSettings } from "../../settings/settings";

export type PoolScenario =
  | "pool-browse"
  | "pool-empty"
  | "pool-reduced-motion"
  | "pool-first-use-choose"
  | "pool-first-use-create";

interface PoolSummary {
  id: string;
  title: string;
  itemCount: number;
  tone: string;
}

interface PoolHeader {
  eyebrow: string;
  hint: string;
  title?: string;
}

interface PoolItem {
  id: string;
  title: string;
  excerpt: string;
  selected: boolean;
  fileCreated?: boolean;
  referenced?: boolean;
  updatedAt?: string;
}

interface PoolDetail {
  ideaId?: string;
  title: string;
  meta: string;
  body: string;
  contentType?: "text" | "link" | "image" | "video" | "mixed";
  previewImageUrl?: string;
  fileCreated?: boolean;
  referenced?: boolean;
}

export interface PoolBrowseSnippetLocation {
  notePath: string;
  noteTitle: string;
  occurrenceCount: number;
  stale: boolean;
}

export interface PoolBrowseCardMenuAction {
  kind: "create-file" | "open-primary-file" | "open-snippet-note" | "open-snippet-locations";
  label: string;
}

interface PoolBrowseCard {
  id: string;
  title: string;
  selected: boolean;
  searchHit?: boolean;
  searchHitPulse?: boolean;
  typeIcon: "text" | "link" | "image" | "video" | "mixed";
  contentKind: "text" | "link" | "image" | "video" | "empty";
  bodyText?: string;
  mediaPath?: string;
  mediaThumbnailUrl?: string;
  mediaThumbnailUrls?: string[];
  linkUrl?: string;
  linkDisplayText?: string;
  updatedLabel: string;
  fileCreated: boolean;
  statusLabels: string[];
  menuActions: PoolBrowseCardMenuAction[];
  snippetLocations: PoolBrowseSnippetLocation[];
}

export type PoolBrowseOverlay = "pool-switcher" | "status" | "filter" | "sort" | "batch";

interface PoolBrowseState {
  description: string;
  descriptionValue?: string;
  activeOverlay: PoolBrowseOverlay | null;
  poolSwitcherExpanded: boolean;
  poolSwitcherActivePoolId?: string;
  contentFilter: "all" | "text" | "link" | "image" | "video";
  queryPlaceholder: string;
  resultSummary: string;
  cards: PoolBrowseCard[];
}

interface PoolEmptyState {
  title: string;
  description: string;
}

const DEFAULT_POOL_EMPTY_STATE: PoolEmptyState = {
  title: "这个池里还没有灵感",
  description: "先记录一条灵感，之后就能在这里查看、筛选和整理。"
};

export interface PoolMarkdownPreviewState {
  available: boolean;
  open: boolean;
  saving: boolean;
  panelTitle: string;
  saveLabel: string;
}

export type PoolRoamFloatingAction = "download" | "share" | "history";

export const MIN_POOL_ROAM_PANEL_WIDTH_RATIO = 0.2;
export const MAX_POOL_ROAM_PANEL_WIDTH_RATIO = 0.8;
export const DEFAULT_POOL_ROAM_PANEL_WIDTH_RATIO = 0.6;

export interface PoolRoamBoundaryAnchorState {
  anchorId: string;
  ideaId: string;
  poolId: string;
  poolName: string;
  poolColor: string;
  ideaTitle: string;
  visibleBridge: boolean;
}

export interface PoolRoamPanelState {
  open: boolean;
  mode: "empty" | "board" | "error";
  boardPath?: string;
  historyEnabled: boolean;
  floatingActions: PoolRoamFloatingAction[];
  boundaryAnchors: PoolRoamBoundaryAnchorState[];
  panelWidthRatio?: number;
  errorMessage?: string;
}

export interface PoolChoiceOption {
  id: string;
  label: string;
  description: string;
}

interface PoolChoice {
  title: string;
  options: PoolChoiceOption[];
}

export interface PoolCreateForm {
  title: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  colorLabel: string;
  colorOptions: string[];
  tipTitle: string;
  tipText: string;
  confirmLabel: string;
  createdPoolId: string;
  createdPoolLabel: string;
}

export interface PoolViewState {
  mode: "browse" | "empty" | "first-use-choose" | "first-use-create";
  pool: PoolSummary;
  header: PoolHeader;
  items: PoolItem[];
  detail: PoolDetail;
  browse?: PoolBrowseState;
  preview?: PoolMarkdownPreviewState;
  roam?: PoolRoamPanelState;
  roamBackConfirmVisible?: boolean;
  emptyState?: PoolEmptyState;
  choice?: PoolChoice;
  createForm?: PoolCreateForm;
  showPoolSwitcher?: boolean;
  metadataEditable?: boolean;
  controls?: {
    query: string;
    status: "all" | "referenced" | "file-created" | "with-markers";
    contentFilter: "all" | "text" | "link" | "image" | "video";
    sort: "updated-desc" | "created-desc" | "title-asc";
    selectedCount: number;
    hasSelection: boolean;
    batchMode: boolean;
  };
  poolOptions?: Array<{
    id: string;
    label: string;
    count: number;
    selected: boolean;
  }>;
}

export function buildFirstUseChoosePoolState(options: { pools: Array<{ id: string; name: string; ideaCount: number }> }): PoolViewState {
  const defaultPool = options.pools[0];
  const defaultPoolId = defaultPool?.id ?? "pool-default";
  const defaultPoolName = defaultPool?.name ?? "默认池";

  return {
    mode: "first-use-choose",
    pool: {
      id: "pool-first-use",
      title: "归池选择（首次）",
      itemCount: options.pools.length,
      tone: "bluegray"
    },
    header: {
      eyebrow: "首次归池",
      hint: "第一条灵感已保存。你可以直接归入默认池，或现在创建一个新池来分类。"
    },
    items: [],
    detail: {
      title: "",
      meta: "",
      body: ""
    },
    choice: {
      title: "选择归池方式",
      options: [
        {
          id: CREATE_NEW_POOL_ID,
          label: "方案 A：新建池后归类（推荐）",
          description: "先创建池名称、描述与池色，再将这条灵感归入新池。"
        },
        {
          id: defaultPoolId,
          label: "方案 B：归入默认池",
          description: `立即完成首次流程，并归入当前默认池「${defaultPoolName}」。系统随后展示后续使用指引。`
        }
      ]
    }
  };
}

const CREATE_POOL_COLOR_KEYS: Array<keyof PoolColorSettings> = [
  "unsorted",
  "product",
  "research",
  "writing",
  "unnamed"
];

const FALLBACK_CREATE_COLOR_OPTIONS: PoolColorSettings = {
  unsorted: "#6ab5ff",
  product: "#74ccba",
  research: "#ffa980",
  writing: "#ffd468",
  unnamed: "#b794ff"
};

function resolveCreateColorOptions(poolColors?: PoolColorSettings): string[] {
  return CREATE_POOL_COLOR_KEYS.map((key) => poolColors?.[key] ?? FALLBACK_CREATE_COLOR_OPTIONS[key]);
}

export function buildFirstUseCreatePoolState(
  options: {
    defaultName?: string;
    flowContext?: "first-use" | "global";
    poolColors?: PoolColorSettings;
  } = {}
): PoolViewState {
  const flowContext = options.flowContext ?? "first-use";
  const isGlobalFlow = flowContext === "global";

  return {
    mode: "first-use-create",
    pool: {
      id: "pool-create",
      title: isGlobalFlow ? "新建池" : "新建池分类（首次）",
      itemCount: 0,
      tone: "bluegray"
    },
    header: {
      eyebrow: isGlobalFlow ? "池管理" : "首次归池",
      hint: isGlobalFlow
        ? "创建一个新池，便于后续筛选与整理。"
        : "为这条灵感创建一个新池，后续筛选和整理会更清晰。"
    },
    items: [],
    detail: {
      title: "",
      meta: "",
      body: ""
    },
    createForm: {
      title: isGlobalFlow ? "新建池" : "新建池分类（首次）",
      subtitle: isGlobalFlow
        ? "创建一个新池，便于后续筛选与整理。"
        : "为这条灵感创建一个新池，后续筛选和整理会更清晰。",
      nameLabel: "池名称",
      namePlaceholder: "例如：产品池 / 写作池 / 研究池",
      descriptionLabel: "池描述",
      descriptionPlaceholder: "填写该池聚焦的方向与使用场景，便于后续筛选和整理。",
      colorLabel: "池颜色",
      colorOptions: resolveCreateColorOptions(options.poolColors),
      tipTitle: isGlobalFlow ? "提示" : "首次说明",
      tipText: isGlobalFlow
        ? "创建完成后会返回首页并刷新数据。"
        : "创建后会自动把当前灵感归入该池，并在首页显示首次入池反馈。",
      confirmLabel: "创建池",
      createdPoolId: NEW_POOL_CREATED_ID,
      createdPoolLabel: options.defaultName ?? NEW_POOL_CREATED_LABEL
    }
  };
}

function firstAttachmentPath(paths: string[]): string | undefined {
  return paths.find((path) => path.trim().length > 0);
}

function hasTrimmedContent(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeLinkUrl(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^www\./i.test(trimmed)
      ? `https://${trimmed}`
      : undefined;

  if (!candidate) {
    return undefined;
  }

  try {
    return new URL(candidate).toString();
  } catch {
    return undefined;
  }
}

function resolveBrowseContentKind(
  contentType: "text" | "link" | "image" | "video" | "mixed",
  input: { hasBodyContent: boolean; sourceUrl?: string; attachmentPaths: string[] }
): PoolBrowseCard["contentKind"] {
  if (contentType === "image") {
    return firstAttachmentPath(input.attachmentPaths) ? "image" : "empty";
  }
  if (contentType === "video") {
    return firstAttachmentPath(input.attachmentPaths) ? "video" : "empty";
  }
  if (contentType === "link") {
    return hasTrimmedContent(input.sourceUrl) || input.hasBodyContent ? "link" : "empty";
  }
  if (contentType === "mixed") {
    if (firstAttachmentPath(input.attachmentPaths)) {
      return "image";
    }
    if (input.sourceUrl) {
      return "link";
    }
    return input.hasBodyContent ? "text" : "empty";
  }
  return input.hasBodyContent ? "text" : "empty";
}

function resolvePrimaryFileMenuAction(input: {
  fileCreated: boolean;
  filePath?: string;
}): PoolBrowseCardMenuAction {
  if (input.fileCreated && input.filePath) {
    return { kind: "open-primary-file", label: "打开主文件" };
  }

  return { kind: "create-file", label: "创建文件" };
}

function normalizeSnippetLocations(snippetLocations?: PoolBrowseSnippetLocation[]): PoolBrowseSnippetLocation[] {
  return Array.isArray(snippetLocations) ? snippetLocations.map((location) => ({ ...location })) : [];
}

function normalizeMediaThumbnailUrls(input: {
  mediaThumbnailUrl?: string;
  mediaThumbnailUrls?: string[];
}): string[] {
  const normalizedUrls = Array.isArray(input.mediaThumbnailUrls)
    ? input.mediaThumbnailUrls.filter((url) => hasTrimmedContent(url)).map((url) => url.trim())
    : [];

  if (normalizedUrls.length > 0) {
    return normalizedUrls;
  }

  return hasTrimmedContent(input.mediaThumbnailUrl) ? [input.mediaThumbnailUrl!.trim()] : [];
}

function resolveSnippetNoteCount(input: {
  snippetNoteCount?: number;
  snippetLocations: PoolBrowseSnippetLocation[];
}): number {
  if (typeof input.snippetNoteCount === "number" && Number.isFinite(input.snippetNoteCount) && input.snippetNoteCount >= 0) {
    return input.snippetNoteCount;
  }

  return input.snippetLocations.length;
}

function buildBrowseMenuActions(input: {
  fileCreated: boolean;
  filePath?: string;
  snippetLocations: PoolBrowseSnippetLocation[];
}): PoolBrowseCardMenuAction[] {
  const actions: PoolBrowseCardMenuAction[] = [resolvePrimaryFileMenuAction(input)];

  if (input.snippetLocations.length === 1) {
    actions.push(
      input.snippetLocations[0].stale
        ? {
            kind: "open-snippet-locations",
            label: `查看插入位置（${input.snippetLocations.length}）`
          }
        : {
            kind: "open-snippet-note",
            label: "打开插入笔记"
          }
    );
  } else if (input.snippetLocations.length > 1) {
    actions.push({
      kind: "open-snippet-locations",
      label: `查看插入位置（${input.snippetLocations.length}）`
    });
  }

  return actions;
}

function buildBrowseResultSummary(visible: number, total: number): string {
  if (visible === total) {
    return `共 ${total} 条灵感`;
  }

  return `命中 ${visible} / 共 ${total} 条灵感`;
}

function buildUpdatedLabel(createdAt: string | undefined, updatedAt: string, editedAt?: string): string {
  const displayTime = formatIdeaTimestamp(editedAt ?? createdAt ?? updatedAt);
  return editedAt ? `${displayTime} 已更新` : displayTime;
}

function clonePoolRoamPanelState(state: PoolRoamPanelState): PoolRoamPanelState {
  return {
    ...state,
    floatingActions: [...state.floatingActions],
    boundaryAnchors: state.boundaryAnchors.map((anchor) => ({ ...anchor }))
  };
}

export function buildPoolViewStateFromRuntime(input: {
  pool: {
    id: string;
    title: string;
    description: string;
    totalItemCount: number;
    visibleItemCount: number;
    color?: string;
    tone: "bluegray";
  };
  header: { eyebrow: string; hint: string };
  cards: Array<{
    id: string;
    title: string;
    body?: string;
    excerpt: string;
    hasBodyContent: boolean;
    selected: boolean;
    searchHit?: boolean;
    searchHitPulse?: boolean;
    contentType: "text" | "link" | "image" | "video" | "mixed";
    sourceUrl?: string;
    attachmentPaths: string[];
    mediaThumbnailUrl?: string;
    mediaThumbnailUrls?: string[];
    fileCreated: boolean;
    filePath?: string;
    referenced: boolean;
    snippetNoteCount?: number;
    snippetLocations?: PoolBrowseSnippetLocation[];
    createdAt?: string;
    updatedAt: string;
    editedAt?: string;
  }>;
  controls: {
    query: string;
    status: "all" | "referenced" | "file-created" | "with-markers";
    contentFilter: "all" | "text" | "link" | "image" | "video";
    sort: "updated-desc" | "created-desc" | "title-asc";
    selectedCount: number;
    hasSelection: boolean;
  };
  poolOptions: Array<{
    id: string;
    label: string;
    count: number;
    selected: boolean;
  }>;
  batchMode: boolean;
  activeOverlay?: PoolBrowseOverlay;
  poolSwitcherActivePoolId?: string;
  viewOptions?: {
    showPoolSwitcher?: boolean;
    metadataEditable?: boolean;
    queryPlaceholder?: string;
  };
  preview?: PoolMarkdownPreviewState;
  roam?: PoolRoamPanelState;
  roamBackConfirmVisible?: boolean;
}): PoolViewState {
  const hasBrowseContext = input.pool.totalItemCount > 0 || input.cards.length > 0;
  const selectedPoolOption = input.poolOptions.find((pool) => pool.selected);
  const poolSwitcherExpanded = input.activeOverlay === "pool-switcher";
  const browse: PoolBrowseState = {
    description: resolvePoolDescription(input.pool.description),
    descriptionValue: input.pool.description,
    activeOverlay: input.activeOverlay ?? null,
    poolSwitcherExpanded,
    poolSwitcherActivePoolId: poolSwitcherExpanded
      ? (input.poolSwitcherActivePoolId ?? selectedPoolOption?.id ?? input.pool.id)
      : undefined,
    contentFilter: input.controls.contentFilter,
    queryPlaceholder: input.viewOptions?.queryPlaceholder ?? "搜索当前池中的灵感",
    resultSummary: buildBrowseResultSummary(input.pool.visibleItemCount, input.pool.totalItemCount),
    cards: input.cards.map((card) => {
      const mediaPath = firstAttachmentPath(card.attachmentPaths);
      const normalizedLinkUrl = normalizeLinkUrl(card.sourceUrl);
      const contentKind = resolveBrowseContentKind(card.contentType, {
        hasBodyContent: card.hasBodyContent,
        sourceUrl: normalizedLinkUrl,
        attachmentPaths: card.attachmentPaths
      });
      const snippetLocations = normalizeSnippetLocations(card.snippetLocations);
      const snippetNoteCount = resolveSnippetNoteCount({
        snippetNoteCount: card.snippetNoteCount,
        snippetLocations
      });
      const mediaThumbnailUrls = normalizeMediaThumbnailUrls({
        mediaThumbnailUrl: card.mediaThumbnailUrl,
        mediaThumbnailUrls: card.mediaThumbnailUrls
      });
      const primaryMediaThumbnailUrl = mediaThumbnailUrls[0];

      return {
        id: card.id,
        title: card.title,
        selected: card.selected,
        searchHit: card.searchHit,
        searchHitPulse: card.searchHitPulse,
        typeIcon: card.contentType,
        contentKind,
        bodyText:
          contentKind === "link"
            ? (card.hasBodyContent ? card.body ?? card.excerpt : undefined)
            : contentKind === "image" || contentKind === "video"
              ? (card.hasBodyContent ? card.body ?? card.excerpt : undefined)
              : contentKind === "text"
                ? (card.hasBodyContent ? card.body ?? card.excerpt : undefined)
                : undefined,
        mediaPath: contentKind === "image" || contentKind === "video" ? mediaPath : undefined,
        mediaThumbnailUrl: contentKind === "image" || contentKind === "video" ? primaryMediaThumbnailUrl : undefined,
        mediaThumbnailUrls: contentKind === "image" && mediaThumbnailUrls.length > 0 ? mediaThumbnailUrls : undefined,
        linkUrl: contentKind === "link" ? normalizedLinkUrl : undefined,
        linkDisplayText: undefined,
        updatedLabel: buildUpdatedLabel(card.createdAt, card.updatedAt, card.editedAt),
        fileCreated: card.fileCreated,
        statusLabels: buildIdeaStatusLabels({
          fileCreated: card.fileCreated,
          snippetCount: snippetNoteCount
        }),
        menuActions: buildBrowseMenuActions({
          fileCreated: card.fileCreated,
          filePath: card.filePath,
          snippetLocations
        }),
        snippetLocations
      };
    })
  };

  return {
    mode: hasBrowseContext ? "browse" : "empty",
    pool: {
      id: input.pool.id,
      title: input.pool.title,
      itemCount: input.pool.totalItemCount,
      tone: input.pool.tone
    },
    header: {
      ...input.header,
      title: input.pool.title
    },
    browse,
    preview: input.preview ? { ...input.preview } : undefined,
    roam: input.roam ? clonePoolRoamPanelState(input.roam) : undefined,
    roamBackConfirmVisible: input.roamBackConfirmVisible === true,
    items: [],
    detail: {
      title: "",
      meta: "",
      body: ""
    },
    emptyState: hasBrowseContext
      ? undefined
      : {
          ...DEFAULT_POOL_EMPTY_STATE
        },
    showPoolSwitcher: input.viewOptions?.showPoolSwitcher ?? true,
    metadataEditable: input.viewOptions?.metadataEditable ?? true,
    controls: {
      ...input.controls,
      batchMode: input.batchMode
    },
    poolOptions: input.poolOptions.map((pool) => ({ ...pool }))
  };
}

export function buildPoolViewState(scenario: PoolScenario): PoolViewState {
  if (scenario === "pool-browse") {
    return {
      mode: "browse",
      pool: {
        id: "pool-product",
        title: "产品池",
        itemCount: 3,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "3 ideas · deterministic review",
        title: "产品池",
      },
      browse: {
        description: DEFAULT_POOL_DESCRIPTION,
        activeOverlay: null,
        contentFilter: "all",
        queryPlaceholder: "搜索当前池中的灵感",
        poolSwitcherExpanded: false,
        resultSummary: "共 3 条灵感",
        cards: [
          {
            id: "idea-product-1",
            title: "Design weekly notes",
            selected: true,
            typeIcon: "text",
            contentKind: "text",
            bodyText: "Summarize weekly product decisions into reusable idea cards.",
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [{ kind: "create-file", label: "创建文件" }],
            snippetLocations: [],
          },
          {
            id: "idea-product-2",
            title: "Onboarding flow audit",
            selected: false,
            typeIcon: "link",
            contentKind: "link",
            linkUrl: "https://example.com/onboarding-audit",
            linkDisplayText: "https://example.com/onboarding-audit",
            updatedLabel: "2026-04-17 09:30 已更新",
            fileCreated: true,
            statusLabels: ["已创建文件"],
            menuActions: [{ kind: "open-primary-file", label: "打开主文件" }],
            snippetLocations: [],
          },
          {
            id: "idea-product-3",
            title: "Search shortcut sketch",
            selected: false,
            typeIcon: "mixed",
            contentKind: "text",
            bodyText: "Prototype one-key jump from home to search results.",
            updatedLabel: "2026-04-16 14:20",
            fileCreated: false,
            statusLabels: [],
            menuActions: [{ kind: "create-file", label: "创建文件" }],
            snippetLocations: [],
          }
        ]
      },
      items: [],
      detail: {
        title: "",
        meta: "",
        body: ""
      }
    };
  }

  if (scenario === "pool-empty") {
    return {
      mode: "empty",
      pool: {
        id: "pool-product",
        title: "产品池",
        itemCount: 0,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "0 ideas · deterministic review",
        title: "产品池",
      },
      items: [],
      detail: {
        title: "No idea selected",
        meta: "",
        body: ""
      },
      browse: {
        description: DEFAULT_POOL_DESCRIPTION,
        activeOverlay: null,
        contentFilter: "all",
        queryPlaceholder: "搜索当前池中的灵感",
        poolSwitcherExpanded: false,
        resultSummary: "共 0 条灵感",
        cards: []
      },
      emptyState: {
        ...DEFAULT_POOL_EMPTY_STATE
      }
    };
  }

  if (scenario === "pool-reduced-motion") {
    return {
      mode: "browse",
      pool: {
        id: "pool-archive",
        title: "Archive Pool",
        itemCount: 2,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "Reduced motion review · static transitions",
        title: "Archive Pool",
      },
      browse: {
        description: DEFAULT_POOL_DESCRIPTION,
        activeOverlay: null,
        contentFilter: "all",
        queryPlaceholder: "搜索当前池中的灵感",
        poolSwitcherExpanded: false,
        resultSummary: "共 2 条灵感",
        cards: [
          {
            id: "idea-archive-1",
            title: "Stable summary card",
            selected: true,
            typeIcon: "text",
            contentKind: "text",
            bodyText: "Use static emphasis instead of animated transitions.",
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [{ kind: "create-file", label: "创建文件" }],
            snippetLocations: [],
          },
          {
            id: "idea-archive-2",
            title: "Silent highlight pass",
            selected: false,
            typeIcon: "mixed",
            contentKind: "text",
            bodyText: "Highlight selected detail with non-motion affordances.",
            updatedLabel: "2026-04-17 09:30",
            fileCreated: false,
            statusLabels: [],
            menuActions: [{ kind: "create-file", label: "创建文件" }],
            snippetLocations: [],
          }
        ]
      },
      items: [],
      detail: {
        title: "",
        meta: "",
        body: ""
      }
    };
  }

  if (scenario === "pool-first-use-choose") {
    return {
      mode: "first-use-choose",
      pool: {
        id: "pool-unsorted",
        title: "归池选择（首次）",
        itemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "首次归池",
        hint: "第一条灵感已保存。你可以直接归入默认池，或现在创建一个新池来分类。"
      },
      items: [],
      detail: {
        title: "",
        meta: "",
        body: ""
      },
      browse: {
        description: DEFAULT_POOL_DESCRIPTION,
        activeOverlay: null,
        contentFilter: "all",
        queryPlaceholder: "搜索当前池中的灵感",
        poolSwitcherExpanded: false,
        resultSummary: "",
        cards: []
      },
      choice: {
        title: "选择归池方式",
        options: [
          {
            id: CREATE_NEW_POOL_ID,
            label: "方案 A：新建池后归类（推荐）",
            description: "先创建池名称、描述与池色，再将这条灵感归入新池。"
          },
          {
            id: "use-default-pool",
            label: "方案 B：归入默认池",
            description: "立即完成首次流程，并归入当前默认池「未整理」。系统随后展示后续使用指引。"
          }
        ]
      }
    };
  }

  if (scenario === "pool-first-use-create") {
    return {
      mode: "first-use-create",
      pool: {
        id: "pool-create",
        title: "新建池分类（首次）",
        itemCount: 0,
        tone: "bluegray"
      },
      header: {
        eyebrow: "首次归池",
        hint: "为这条灵感创建一个新池，后续筛选和整理会更清晰。"
      },
      items: [],
      detail: {
        title: "",
        meta: "",
        body: ""
      },
      browse: {
        description: DEFAULT_POOL_DESCRIPTION,
        activeOverlay: null,
        contentFilter: "all",
        queryPlaceholder: "搜索当前池中的灵感",
        poolSwitcherExpanded: false,
        resultSummary: "",
        cards: []
      },
      createForm: {
        title: "新建池分类（首次）",
        subtitle: "为这条灵感创建一个新池，后续筛选和整理会更清晰。",
        nameLabel: "池名称",
        namePlaceholder: "例如：产品池 / 写作池 / 研究池",
        descriptionLabel: "池描述",
        descriptionPlaceholder: "填写该池聚焦的方向与使用场景，便于后续筛选和整理。",
        colorLabel: "池颜色",
        colorOptions: resolveCreateColorOptions(),
        tipTitle: "首次说明",
        tipText: "创建后会自动把当前灵感归入该池，并在首页显示首次入池反馈。",
        confirmLabel: "创建池",
        createdPoolId: NEW_POOL_CREATED_ID,
        createdPoolLabel: NEW_POOL_CREATED_LABEL
      }
    };
  }

  throw new Error(`buildPoolViewState does not support scenario: ${scenario}`);
}
