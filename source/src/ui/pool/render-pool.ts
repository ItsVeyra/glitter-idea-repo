import { CREATE_NEW_POOL_ID, DEFAULT_POOL_ID, NEW_POOL_CREATED_ID, NEW_POOL_CREATED_LABEL } from "../../plugin/constants";
import {
  DEFAULT_POOL_ROAM_PANEL_WIDTH_RATIO,
  MAX_POOL_ROAM_PANEL_WIDTH_RATIO,
  MIN_POOL_ROAM_PANEL_WIDTH_RATIO,
  type PoolBrowseLabels,
  type PoolBrowseOverlay,
  type PoolRoamBoundaryAnchorState,
  type PoolViewState
} from "./pool-state";

// 池视图渲染层回调：覆盖返回、筛选、批量操作、卡片菜单、池切换等所有可见交互。
export interface PoolViewActions {
  onBack: () => void;
  onDismissRoamBackConfirm?: () => void;
  onConfirmRoamBackHome?: () => void;
  onSetPoolRoamPaneRatio?: (ratio: number) => void;
  onClose?: () => void;
  onItemSelect: (itemId: string) => void;
  onCreateIdea: () => void;
  onQueryChange?: (query: string, options?: { isComposing?: boolean }) => void;
  onQuerySubmit?: (query: string) => void;
  onStatusChange?: (status: "all" | "referenced" | "file-created" | "with-markers") => void;
  onSortChange?: (sort: "updated-desc" | "created-desc" | "title-asc") => void;
  onBatchModeToggle?: () => void;
  onTogglePoolRoam?: () => void;
  onAttachPoolRoamSource?: (ideaId: string) => void;
  onLocatePoolRoamSource?: (ideaId: string) => void;
  onDeletePoolRoamSourceLink?: (anchorId: string) => void;
  onTogglePoolMarkdownPreview?: () => void;
  onSavePoolMarkdownFile?: () => void;
  onOpenPoolRoamHistory?: () => void;
  onDownloadPoolRoamImage?: () => void;
  onSharePoolRoamBoard?: (anchorEl: HTMLElement) => void;
  onAddPoolRoamIdeaBlock?: () => void;
  onMoveSelectionToPool?: (poolId: string) => void;
  onDeleteSelection?: () => void;
  onCreateFile?: (ideaId: string) => void;
  onOpenPrimaryFile?: (ideaId: string) => void;
  onOpenSnippetNote?: (ideaId: string) => void;
  onOpenSnippetLocations?: (ideaId: string) => void;
  onEditIdea?: (ideaId: string) => void;
  onOpenCardMovePicker?: (ideaId: string) => void;
  onCloseCardMovePicker?: () => void;
  onCardMovePickerSearchQueryChange?: (query: string, options?: { isComposing?: boolean }) => void;
  getCardMovePickerSearchQuery?: () => string;
  onMoveIdeaToPool?: (ideaId: string, poolId: string) => void;
  onShareIdea?: (ideaId: string, anchorEl: HTMLElement) => void;
  onDeleteIdea?: (ideaId: string) => void;
  onBrowseOverlayToggle?: (overlay: PoolBrowseOverlay) => void;
  onBrowseOverlayClose?: () => void;
  onContentFilterChange?: (filter: "all" | "text" | "link" | "image" | "video") => void;
  onPoolSwitch?: (poolId: string) => void;
  onPoolTitleSave?: (title: string) => void;
  onPoolDescriptionSave?: (description: string) => void;
  isCardMovePickerOpen?: (ideaId: string) => boolean;
  isCardMovePickerSubmitting?: (ideaId: string) => boolean;
  isCardMenuOpen?: (ideaId: string) => boolean;
  onCardMenuToggle?: (ideaId: string) => void;
}

// 基础 DOM 辅助：统一节点创建、按钮绑定与可键盘触达的媒体预览入口。
function clearContainer(containerEl: HTMLElement): void {
  const withEmpty = containerEl as HTMLElement & { empty?: () => void };
  if (typeof withEmpty.empty === "function") {
    withEmpty.empty();
    return;
  }

  while (containerEl.firstChild) {
    containerEl.firstChild.remove();
  }
}

function createNode(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
  const doc = (parent.ownerDocument ?? document) as Document;
  const node = doc.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  parent.appendChild(node);
  return node;
}

function createButton(
  parent: HTMLElement,
  className: string,
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const button = createNode(parent, "button", className, label) as HTMLButtonElement;
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function createMediaPreviewButton(
  parent: HTMLElement,
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const button = createNode(parent, "button", "glitter-pool-stage__card-media-hitbox") as HTMLButtonElement;
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

function createAnchor(
  parent: HTMLElement,
  className: string,
  href: string
): HTMLAnchorElement {
  const anchor = createNode(parent, "a", className) as HTMLAnchorElement;
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

// 空态与媒体预览层：分别承接无结果提示和图片/视频放大查看体验。
function renderPoolEmptyState(
  parent: HTMLElement,
  input: { eyebrow?: string; title: string; description: string }
): HTMLElement {
  const empty = createNode(parent, "div", "glitter-pool-stage__empty");
  if (input.eyebrow) {
    createNode(empty, "span", "glitter-pool-stage__empty-eyebrow", input.eyebrow);
  }
  createNode(empty, "strong", "glitter-pool-stage__empty-title", input.title);
  createNode(empty, "p", "glitter-pool-stage__empty-description", input.description);
  return empty;
}

type PoolMediaPreviewOverlayElement = HTMLElement & {
  __glitterPoolMediaPreviewCleanup?: () => void;
};

const POOL_MEDIA_PREVIEW_OPEN_CLASS = "glitter-pool-stage--media-preview-open";

function closePoolMediaPreviewOverlay(stage: HTMLElement): void {
  const overlay = stage.querySelector(".glitter-pool-stage__media-preview-overlay") as PoolMediaPreviewOverlayElement | null;
  if (!overlay) {
    setClassToken(stage, POOL_MEDIA_PREVIEW_OPEN_CLASS, false);
    return;
  }
  overlay.__glitterPoolMediaPreviewCleanup?.();
  overlay.__glitterPoolMediaPreviewCleanup = undefined;
  overlay.remove();
  setClassToken(stage, POOL_MEDIA_PREVIEW_OPEN_CLASS, false);
}

function findClosestPoolStage(element: HTMLElement, fallback: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element;
  while (current) {
    const classTokens = current.className.split(/\s+/);
    if (classTokens.includes("glitter-pool-stage")) {
      return current;
    }
    current = current.parentElement ?? (current.parentNode as HTMLElement | null) ?? ((current as unknown as { parent?: HTMLElement | null }).parent ?? null);
  }

  return fallback;
}

function openPoolMediaPreviewOverlay(
  stage: HTMLElement,
  input:
    | { src: string; title: string; kind: "video"; labels: PoolBrowseLabels }
    | { src: string; title: string; kind: "image"; imageSources?: string[]; initialIndex?: number; labels: PoolBrowseLabels }
): void {
  closePoolMediaPreviewOverlay(stage);

  const overlay = createNode(stage, "div", "glitter-pool-stage__media-preview-overlay") as PoolMediaPreviewOverlayElement;
  setClassToken(stage, POOL_MEDIA_PREVIEW_OPEN_CLASS, true);
  const previewCleanupCallbacks: Array<() => void> = [];
  overlay.__glitterPoolMediaPreviewCleanup = () => {
    while (previewCleanupCallbacks.length > 0) {
      previewCleanupCallbacks.pop()?.();
    }
  };
  const removeOverlay = (): void => {
    overlay.__glitterPoolMediaPreviewCleanup?.();
    overlay.__glitterPoolMediaPreviewCleanup = undefined;
    overlay.remove();
    setClassToken(stage, POOL_MEDIA_PREVIEW_OPEN_CLASS, false);
  };
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      removeOverlay();
    }
  });

  const dialog = createNode(overlay, "div", "glitter-pool-stage__media-preview-dialog");

  if (input.kind === "image") {
    const imageSources = input.imageSources?.length ? input.imageSources : [input.src];
    let currentImageIndex = Math.max(0, Math.min(input.initialIndex ?? 0, imageSources.length - 1));
    const previewViewport = createNode(
      dialog,
      "div",
      `glitter-pool-stage__media-preview-viewport${imageSources.length > 1 ? " glitter-pool-stage__media-preview-viewport--gallery" : ""}`
    );
    const previewNavLayer = imageSources.length > 1
      ? createNode(dialog, "div", "glitter-pool-stage__media-preview-nav-layer")
      : undefined;
    // 只靠 fit-content + 百分比高度时，真实运行里大图会按原始尺寸溢出，所以这里改成“整块视口负责定界，图片框负责收口”。
    const previewStage = createNode(
      previewViewport,
      "div",
      `glitter-pool-stage__media-preview-stage${imageSources.length > 1 ? " glitter-pool-stage__media-preview-stage--gallery" : ""}`
    );
    const previewFrame = createNode(
      previewStage,
      "div",
      `glitter-pool-stage__media-preview-frame${imageSources.length > 1 ? " glitter-pool-stage__media-preview-frame--gallery" : ""}`
    );
    const previewImage = createNode(previewFrame, "img", "glitter-pool-stage__media-preview-image") as HTMLImageElement;
    let pagination: HTMLElement | undefined;

    // 大图尺寸只由舞台内容区控制；左右翻页改挂在 viewport 固定槽位里，不再跟图片一起漂移，也不会压到图片上。
    const syncPreviewBounds = (): void => {
      if (typeof previewStage.getBoundingClientRect !== "function") {
        return;
      }
      const stageRect = previewStage.getBoundingClientRect();
      const maxImageWidth = Math.max(0, Math.min(stageRect.width, 1180));
      const maxImageHeight = Math.max(0, stageRect.height);
      if (maxImageWidth > 0) {
        previewStage.style.setProperty("--glitter-pool-preview-image-max-width", `${maxImageWidth}px`);
      } else {
        previewStage.style.removeProperty("--glitter-pool-preview-image-max-width");
      }
      if (maxImageHeight > 0) {
        previewStage.style.setProperty("--glitter-pool-preview-image-max-height", `${maxImageHeight}px`);
      } else {
        previewStage.style.removeProperty("--glitter-pool-preview-image-max-height");
      }
    };
    const scheduleSyncPreviewBounds = (): void => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          syncPreviewBounds();
        });
        return;
      }
      syncPreviewBounds();
    };

    const syncPreviewImage = (): void => {
      const currentImageSrc = imageSources[currentImageIndex] ?? input.src;
      previewImage.setAttribute("src", currentImageSrc);
      previewImage.setAttribute(
        "alt",
        imageSources.length > 1
          ? input.labels.mediaPreviewImageAltWithPosition(
              input.title,
              input.labels.cardImagePositionLabel(currentImageIndex + 1, imageSources.length)
            )
          : input.labels.mediaPreviewImageAlt(input.title)
      );
      if (pagination) {
        pagination.textContent = `${currentImageIndex + 1} / ${imageSources.length}`;
      }
      syncPreviewBounds();
      scheduleSyncPreviewBounds();
    };

    previewImage.addEventListener("load", () => {
      scheduleSyncPreviewBounds();
    });

    if (typeof ResizeObserver === "function") {
      const previewResizeObserver = new ResizeObserver(() => {
        scheduleSyncPreviewBounds();
      });
      previewResizeObserver.observe(previewStage);
      previewCleanupCallbacks.push(() => {
        previewResizeObserver.disconnect();
      });
    } else if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      const handleWindowResize = (): void => {
        scheduleSyncPreviewBounds();
      };
      window.addEventListener("resize", handleWindowResize);
      previewCleanupCallbacks.push(() => {
        window.removeEventListener("resize", handleWindowResize);
      });
    }

    if (imageSources.length > 1) {
      const previousButton = createButton(
        previewNavLayer ?? dialog,
        "glitter-pool-stage__media-preview-nav glitter-pool-stage__media-preview-nav--previous",
        "",
        () => {
          currentImageIndex = (currentImageIndex - 1 + imageSources.length) % imageSources.length;
          syncPreviewImage();
        }
      );
      previousButton.setAttribute("aria-label", input.labels.mediaPreviewPreviousImageLabel);
      createNode(previousButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--chevron-left");

      const nextButton = createButton(
        previewNavLayer ?? dialog,
        "glitter-pool-stage__media-preview-nav glitter-pool-stage__media-preview-nav--next",
        "",
        () => {
          currentImageIndex = (currentImageIndex + 1) % imageSources.length;
          syncPreviewImage();
        }
      );
      nextButton.setAttribute("aria-label", input.labels.mediaPreviewNextImageLabel);
      createNode(nextButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--chevron-right");

      pagination = createNode(previewViewport, "span", "glitter-pool-stage__media-preview-pagination", "");
    }

    syncPreviewImage();
  } else {
    const previewVideo = createNode(dialog, "video", "glitter-pool-stage__media-preview-video") as HTMLVideoElement;
    previewVideo.setAttribute("src", input.src);
    previewVideo.setAttribute("controls", "");
    previewVideo.setAttribute("playsinline", "");
    previewVideo.setAttribute("preload", "metadata");
    previewVideo.setAttribute("aria-label", input.labels.mediaPreviewVideoLabel(input.title));
    previewVideo.controls = true;
    previewVideo.playsInline = true;
    previewVideo.preload = "metadata";
  }

  const closeButton = createButton(dialog, "glitter-pool-stage__media-preview-close", "", () => {
    removeOverlay();
  });
  closeButton.setAttribute("aria-label", input.labels.mediaPreviewCloseLabel);
  createNode(closeButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--close");
}

// 卡片瀑布流与悬停隔离参数：控制列宽、滚动显隐、3 秒进入隔离态以及还原时机。
const POOL_CARD_MASONRY_MIN_WIDTH = 280;
const POOL_CARD_MASONRY_GAP = 12;
const POOL_CARD_MASONRY_SAFE_INSET_X_PX = 0;
const POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY = "__glitterPoolCardMasonryResizeObserver";
const POOL_CARD_ISOLATION_CLEANUP_KEY = "__glitterPoolCardIsolationCleanup";
const POOL_CARD_ISOLATION_STATE_KEY = "__glitterPoolCardIsolationState";
const POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY = "__glitterPoolCardScrollbarVisibilityCleanup";
const POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY = "__glitterPoolRoamBridgeLayoutCleanup";
const POOL_ROAM_PANE_RESIZE_CLEANUP_KEY = "__glitterPoolRoamPaneResizeCleanup";
const POOL_CARD_ISOLATION_DELAY_MS = 3000;
const POOL_CARD_ISOLATION_MAX_DISTANCE_PX = 760;
const POOL_CARD_SCROLLBAR_VISIBILITY_TIMEOUT_MS = 900;
const POOL_CARD_SCROLL_INDICATOR_TOP_INSET_PX = 14;
const POOL_CARD_SCROLL_INDICATOR_BOTTOM_INSET_PX = 24;
const POOL_CARD_SCROLL_INDICATOR_THUMB_WIDTH_PX = 8;
const POOL_CARD_SCROLL_INDICATOR_THUMB_HEIGHT_PX = 14;
const POOL_CARD_MORE_MENU_MIN_HEIGHT_PX = 80;
const POOL_CARD_STRUCTURE_SIGNATURE_KEY = "__glitterPoolCardStructureSignature";

type PoolCardIsolationRuntimeState = {
  activeCardId?: string | null;
  pendingCardId?: string | null;
  pendingTimer?: ReturnType<typeof setTimeout>;
};

function disconnectPoolCardMasonry(containerEl: HTMLElement): void {
  const withObserver = containerEl as HTMLElement & {
    [POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY]?: ResizeObserver;
  };

  withObserver[POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY]?.disconnect?.();
  withObserver[POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY] = undefined;
}

function disconnectPoolCardScrollVisibility(containerEl: HTMLElement): void {
  const withCleanup = containerEl as HTMLElement & {
    [POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY]?: () => void;
  };

  const cleanup = withCleanup[POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY];
  if (typeof cleanup === "function") {
    cleanup();
  }

  withCleanup[POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY] = undefined;
}

function disconnectPoolRoamBridgeLayoutSync(workbench: HTMLElement): void {
  const withCleanup = workbench as HTMLElement & {
    [POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY]?: () => void;
  };

  const cleanup = withCleanup[POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY];
  if (typeof cleanup === "function") {
    cleanup();
  }

  withCleanup[POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY] = undefined;
}

function disconnectPoolRoamBridgeLayoutSyncWithin(containerEl: HTMLElement): void {
  const existingWorkbench = containerEl.querySelector?.(".glitter-pool-stage__workbench") as HTMLElement | null;
  if (!existingWorkbench) {
    return;
  }

  disconnectPoolRoamBridgeLayoutSync(existingWorkbench);
}

function disconnectPoolRoamPaneResize(workbench: HTMLElement): void {
  const withCleanup = workbench as HTMLElement & {
    [POOL_ROAM_PANE_RESIZE_CLEANUP_KEY]?: () => void;
  };

  const cleanup = withCleanup[POOL_ROAM_PANE_RESIZE_CLEANUP_KEY];
  if (typeof cleanup === "function") {
    cleanup();
  }

  withCleanup[POOL_ROAM_PANE_RESIZE_CLEANUP_KEY] = undefined;
}

function disconnectPoolRoamPaneResizeWithin(containerEl: HTMLElement): void {
  const existingWorkbench = containerEl.querySelector?.(".glitter-pool-stage__workbench") as HTMLElement | null;
  if (!existingWorkbench) {
    return;
  }

  disconnectPoolRoamPaneResize(existingWorkbench);
}

function readElementWidth(node: HTMLElement): number {
  const rectWidth = node.getBoundingClientRect?.().width ?? 0;
  if (rectWidth > 0) {
    return rectWidth;
  }

  return node.offsetWidth ?? 0;
}

function readElementHeight(node: HTMLElement): number {
  const rectHeight = node.getBoundingClientRect?.().height ?? 0;
  if (rectHeight > 0) {
    return rectHeight;
  }

  return node.offsetHeight ?? 0;
}

type StyleWritableElement = HTMLElement & {
  setCssStyles?: (styles: Record<string, string>) => void;
  setCssProps?: (props: Record<string, string>) => void;
  style: CSSStyleDeclaration & Record<string, string> & {
    setCssStyles?: (styles: Record<string, string>) => void;
    setCssProps?: (props: Record<string, string>) => void;
    setProperty?: (name: string, value: string) => void;
  };
};

function camelCaseToKebabCase(name: string): string {
  return name.startsWith("--") ? name : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function setInlineStyle(node: HTMLElement, property: string, value: string): void {
  const writableTarget = node as StyleWritableElement;
  const targetStyle = writableTarget.style;

  if (property.startsWith("--")) {
    if (typeof writableTarget.setCssProps === "function") {
      writableTarget.setCssProps({ [property]: value });
      return;
    }

    if (typeof targetStyle.setCssProps === "function") {
      targetStyle.setCssProps({ [property]: value });
      return;
    }
  } else {
    if (typeof writableTarget.setCssStyles === "function") {
      writableTarget.setCssStyles({ [property]: value });
      return;
    }

    if (typeof targetStyle.setCssStyles === "function") {
      targetStyle.setCssStyles({ [property]: value });
      return;
    }
  }

  targetStyle.setProperty(camelCaseToKebabCase(property), value);
}

function clearInlineStyle(node: HTMLElement, property: string): void {
  setInlineStyle(node, property, "");
}

function clampPoolRoamPaneRatio(ratio: number | undefined): number {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) {
    return DEFAULT_POOL_ROAM_PANEL_WIDTH_RATIO;
  }

  return Math.min(MAX_POOL_ROAM_PANEL_WIDTH_RATIO, Math.max(MIN_POOL_ROAM_PANEL_WIDTH_RATIO, ratio));
}

function applyPoolRoamWorkbenchLayout(workbench: HTMLElement, ratio: number | undefined): number {
  const nextRatio = clampPoolRoamPaneRatio(ratio);
  const poolWidthPercent = (1 - nextRatio) * 100;
  const roamWidthPercent = nextRatio * 100;
  setInlineStyle(
    workbench,
    "gridTemplateColumns",
    `minmax(0, ${poolWidthPercent.toFixed(4)}%) minmax(0, ${roamWidthPercent.toFixed(4)}%)`
  );

  const divider = workbench.querySelector(".glitter-pool-stage__roam-divider") as HTMLElement | null;
  if (divider) {
    setInlineStyle(divider, "left", `${poolWidthPercent.toFixed(4)}%`);
  }

  return nextRatio;
}

function bindPoolRoamPaneResize(workbench: HTMLElement, actions: PoolViewActions, ratio: number | undefined): void {
  disconnectPoolRoamPaneResize(workbench);
  const divider = workbench.querySelector(".glitter-pool-stage__roam-divider") as HTMLElement | null;
  if (!divider || typeof actions.onSetPoolRoamPaneRatio !== "function") {
    return;
  }

  const ownerDocument = (workbench.ownerDocument ?? document) as Document;
  let dragging = false;
  let nextRatio = applyPoolRoamWorkbenchLayout(workbench, ratio);

  const syncRatioFromClientX = (clientX: number): void => {
    const rect = workbench.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : readElementWidth(workbench);
    if (width <= 0) {
      return;
    }

    nextRatio = clampPoolRoamPaneRatio(1 - (clientX - rect.left) / width);
    applyPoolRoamWorkbenchLayout(workbench, nextRatio);
    syncRoamBridgeLaneLayout(workbench);
  };

  const finishDrag = (): void => {
    if (!dragging) {
      return;
    }

    dragging = false;
    setClassToken(workbench, "glitter-pool-stage__workbench--roam-resizing", false);
    ownerDocument.removeEventListener("mousemove", handleMouseMove);
    ownerDocument.removeEventListener("mouseup", handleMouseUp);
    actions.onSetPoolRoamPaneRatio?.(nextRatio);
  };

  const handleMouseMove = (event?: Event): void => {
    const mouseEvent = event as MouseEvent | undefined;
    if (!dragging || typeof mouseEvent?.clientX !== "number") {
      return;
    }

    mouseEvent.preventDefault?.();
    syncRatioFromClientX(mouseEvent.clientX);
  };

  const handleMouseUp = (): void => {
    finishDrag();
  };

  divider.addEventListener("mousedown", (event) => {
    const mouseEvent = event as MouseEvent & { button?: number };
    if (mouseEvent.button !== undefined && mouseEvent.button !== 0) {
      return;
    }

    mouseEvent.preventDefault?.();
    mouseEvent.stopPropagation?.();
    dragging = true;
    setClassToken(workbench, "glitter-pool-stage__workbench--roam-resizing", true);
    if (typeof mouseEvent.clientX === "number") {
      syncRatioFromClientX(mouseEvent.clientX);
    }
    ownerDocument.addEventListener("mousemove", handleMouseMove);
    ownerDocument.addEventListener("mouseup", handleMouseUp);
  });

  const withCleanup = workbench as HTMLElement & {
    [POOL_ROAM_PANE_RESIZE_CLEANUP_KEY]?: () => void;
  };
  withCleanup[POOL_ROAM_PANE_RESIZE_CLEANUP_KEY] = () => {
    dragging = false;
    setClassToken(workbench, "glitter-pool-stage__workbench--roam-resizing", false);
    ownerDocument.removeEventListener("mousemove", handleMouseMove);
    ownerDocument.removeEventListener("mouseup", handleMouseUp);
    withCleanup[POOL_ROAM_PANE_RESIZE_CLEANUP_KEY] = undefined;
  };
}

function setRenderedPoolCardMenuVisibility(menu: HTMLElement, open: boolean): void {
  menu.setAttribute("aria-hidden", open ? "false" : "true");
  setInlineStyle(menu, "display", open ? "grid" : "none");
}

function readCardShellOffset(cardShell: HTMLElement): { x: number; y: number } {
  const transform = (cardShell.style as CSSStyleDeclaration & Record<string, string>).transform ?? "";
  const match = transform.match(
    /translate3d\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px,\s*-?\d+(?:\.\d+)?(?:px)?\s*\)/
  );
  return {
    x: match ? Number(match[1]) : 0,
    y: match ? Number(match[2]) : 0
  };
}

function readCardShellCenter(cardShell: HTMLElement): { x: number; y: number } {
  const offset = readCardShellOffset(cardShell);
  return {
    x: offset.x + readElementWidth(cardShell) / 2,
    y: offset.y + readElementHeight(cardShell) / 2
  };
}

function getPoolCardIsolationState(containerEl: HTMLElement): PoolCardIsolationRuntimeState {
  const withState = containerEl as HTMLElement & {
    [POOL_CARD_ISOLATION_STATE_KEY]?: PoolCardIsolationRuntimeState;
  };

  if (!withState[POOL_CARD_ISOLATION_STATE_KEY]) {
    withState[POOL_CARD_ISOLATION_STATE_KEY] = {};
  }

  return withState[POOL_CARD_ISOLATION_STATE_KEY]!;
}

function resetPoolCardIsolationState(containerEl: HTMLElement): void {
  const runtimeState = getPoolCardIsolationState(containerEl);
  if (runtimeState.pendingTimer !== undefined) {
    clearTimeout(runtimeState.pendingTimer);
  }

  runtimeState.pendingTimer = undefined;
  runtimeState.pendingCardId = null;
  runtimeState.activeCardId = null;
}

function clearPoolCardIsolation(stage: HTMLElement, cardShells: HTMLElement[]): void {
  setClassToken(stage, "glitter-pool-stage--card-isolation-reading", false);

  cardShells.forEach((cardShell) => {
    setClassToken(cardShell, "glitter-pool-stage__card-shell--isolation-active", false);
    setClassToken(cardShell, "glitter-pool-stage__card-shell--isolation-muted", false);

    const surface = cardShell.querySelector(".glitter-pool-stage__card-surface") as HTMLElement | null;
    if (!surface) {
      return;
    }

    clearInlineStyle(surface, "filter");
    clearInlineStyle(surface, "opacity");
    clearInlineStyle(surface, "transform");
  });
}

function applyPoolCardIsolation(stage: HTMLElement, cardShells: HTMLElement[], activeCardShell: HTMLElement): void {
  setClassToken(stage, "glitter-pool-stage--card-isolation-reading", true);
  const activeCenter = readCardShellCenter(activeCardShell);

  cardShells.forEach((cardShell) => {
    const surface = cardShell.querySelector(".glitter-pool-stage__card-surface") as HTMLElement | null;
    if (!surface) {
      return;
    }

    const isActive = cardShell === activeCardShell;
    setClassToken(cardShell, "glitter-pool-stage__card-shell--isolation-active", isActive);
    setClassToken(cardShell, "glitter-pool-stage__card-shell--isolation-muted", !isActive);

    if (isActive) {
      setInlineStyle(surface, "filter", "blur(0px) saturate(1)");
      setInlineStyle(surface, "opacity", "1");
      setInlineStyle(surface, "transform", "translateY(-0.5px) scale(1.004)");
      return;
    }

    const currentCenter = readCardShellCenter(cardShell);
    const distance = Math.hypot(currentCenter.x - activeCenter.x, currentCenter.y - activeCenter.y);
    const falloff = Math.min(distance / POOL_CARD_ISOLATION_MAX_DISTANCE_PX, 1);
    const eased = Math.pow(falloff, 2.4);
    const blur = 1.2 + eased * 12;
    const opacity = Math.max(0.26, 0.88 - eased * 0.48);
    const scale = Math.max(0.978, 0.996 - eased * 0.014);
    const saturate = Math.max(0.64, 0.94 - eased * 0.28);

    setInlineStyle(surface, "filter", `blur(${blur.toFixed(1)}px) saturate(${saturate.toFixed(3)})`);
    setInlineStyle(surface, "opacity", opacity.toFixed(3));
    setInlineStyle(surface, "transform", `scale(${scale.toFixed(3)})`);
  });
}

function disconnectPoolCardIsolation(containerEl: HTMLElement): void {
  const withCleanup = containerEl as HTMLElement & {
    [POOL_CARD_ISOLATION_CLEANUP_KEY]?: () => void;
  };

  const cleanup = withCleanup[POOL_CARD_ISOLATION_CLEANUP_KEY];
  if (typeof cleanup === "function") {
    cleanup();
  }

  withCleanup[POOL_CARD_ISOLATION_CLEANUP_KEY] = undefined;
}

function syncRenderedPoolCardMenuState(cardShell: HTMLElement, open: boolean): boolean {
  const moreTrigger = cardShell.querySelector(".glitter-pool-stage__card-more-trigger") as HTMLButtonElement | null;
  const moreMenu = cardShell.querySelector(".glitter-pool-stage__card-more-menu") as HTMLElement | null;
  if (!moreTrigger || !moreMenu) {
    return false;
  }

  moreTrigger.setAttribute("aria-expanded", open ? "true" : "false");
  setRenderedPoolCardMenuVisibility(moreMenu, open);
  return true;
}

export function syncRenderedPoolCardMenus(containerEl: HTMLElement, activeIdeaId?: string): boolean {
  const cardShells = Array.from(containerEl.querySelectorAll(".glitter-pool-stage__card-shell")) as HTMLElement[];
  if (cardShells.length === 0) {
    return false;
  }

  let syncedAnyMenu = false;
  let foundActiveCard = !activeIdeaId;

  cardShells.forEach((cardShell) => {
    const ideaId = cardShell.dataset.ideaId ?? "";
    const shouldOpen = Boolean(activeIdeaId) && ideaId === activeIdeaId;
    const synced = syncRenderedPoolCardMenuState(cardShell, shouldOpen);
    syncedAnyMenu = syncedAnyMenu || synced;
    if (shouldOpen && synced) {
      foundActiveCard = true;
    }
  });

  return syncedAnyMenu && foundActiveCard;
}

function bindPoolCardIsolation(containerEl: HTMLElement, stage: HTMLElement, cardShells: HTMLElement[]): void {
  const withCleanup = containerEl as HTMLElement & {
    [POOL_CARD_ISOLATION_CLEANUP_KEY]?: () => void;
  };
  const runtimeState = getPoolCardIsolationState(containerEl);

  disconnectPoolCardIsolation(containerEl);

  const clearPendingTimer = (): void => {
    if (runtimeState.pendingTimer !== undefined) {
      clearTimeout(runtimeState.pendingTimer);
      runtimeState.pendingTimer = undefined;
    }
    runtimeState.pendingCardId = null;
  };

  const deactivateIsolation = (): void => {
    runtimeState.activeCardId = null;
    clearPoolCardIsolation(stage, cardShells);
  };

  const activateIsolation = (cardShell: HTMLElement): void => {
    runtimeState.activeCardId = cardShell.dataset.ideaId ?? null;
    applyPoolCardIsolation(stage, cardShells, cardShell);
  };

  const findCardShellByIdeaId = (ideaId?: string | null): HTMLElement | undefined => {
    if (!ideaId) {
      return undefined;
    }

    return cardShells.find((cardShell) => (cardShell.dataset.ideaId ?? "") === ideaId);
  };

  const listeners = cardShells.map((cardShell) => {
    const ideaId = cardShell.dataset.ideaId ?? "";
    const handleMouseEnter = (): void => {
      if (!ideaId || runtimeState.activeCardId === ideaId) {
        return;
      }

      clearPendingTimer();
      runtimeState.pendingCardId = ideaId;
      runtimeState.pendingTimer = setTimeout(() => {
        if (runtimeState.pendingCardId !== ideaId) {
          return;
        }

        runtimeState.pendingTimer = undefined;
        runtimeState.pendingCardId = null;
        activateIsolation(cardShell);
      }, POOL_CARD_ISOLATION_DELAY_MS);
    };

    const handleMouseLeave = (): void => {
      if (runtimeState.pendingCardId === ideaId) {
        clearPendingTimer();
      }

      if (runtimeState.activeCardId === ideaId) {
        deactivateIsolation();
      }
    };

    cardShell.addEventListener("mouseenter", handleMouseEnter);
    cardShell.addEventListener("mouseleave", handleMouseLeave);

    return {
      cardShell,
      handleMouseEnter,
      handleMouseLeave
    };
  });

  const restoredActiveCardShell = findCardShellByIdeaId(runtimeState.activeCardId);
  if (restoredActiveCardShell) {
    activateIsolation(restoredActiveCardShell);
  } else if (runtimeState.activeCardId) {
    runtimeState.activeCardId = null;
  }

  withCleanup[POOL_CARD_ISOLATION_CLEANUP_KEY] = () => {
    clearPendingTimer();
    listeners.forEach(({ cardShell, handleMouseEnter, handleMouseLeave }) => {
      cardShell.removeEventListener?.("mouseenter", handleMouseEnter);
      cardShell.removeEventListener?.("mouseleave", handleMouseLeave);
    });
    withCleanup[POOL_CARD_ISOLATION_CLEANUP_KEY] = undefined;
  };
}

function bindPoolCardScrollVisibility(containerEl: HTMLElement, cardGrid: HTMLElement, indicatorHost: HTMLElement): void {
  const withCleanup = containerEl as HTMLElement & {
    [POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY]?: () => void;
  };

  disconnectPoolCardScrollVisibility(containerEl);
  indicatorHost.querySelector(".glitter-pool-stage__card-scroll-indicator")?.remove();

  const indicator = createNode(indicatorHost, "div", "glitter-pool-stage__card-scroll-indicator");
  indicator.setAttribute("aria-hidden", "true");
  const thumb = createNode(indicator, "span", "glitter-pool-stage__card-scroll-indicator-thumb");
  thumb.setAttribute("aria-hidden", "true");
  setInlineStyle(
    indicator,
    "--glitter-pool-scroll-indicator-center",
    `${(POOL_CARD_SCROLL_INDICATOR_THUMB_HEIGHT_PX / 2).toFixed(2)}px`
  );

  const updateIndicatorProgress = (): void => {
    const measurableGrid = cardGrid as HTMLElement & {
      scrollTop?: number;
      scrollHeight?: number;
      clientHeight?: number;
      offsetHeight?: number;
    };
    const visibleHeight = typeof measurableGrid.clientHeight === "number"
      ? measurableGrid.clientHeight
      : typeof measurableGrid.offsetHeight === "number"
        ? measurableGrid.offsetHeight
        : 0;
    const scrollHeight = typeof measurableGrid.scrollHeight === "number" ? measurableGrid.scrollHeight : visibleHeight;
    const maxScrollTop = Math.max(scrollHeight - visibleHeight, 0);
    const rawProgress = maxScrollTop > 0
      ? Math.max(0, Math.min(1, (measurableGrid.scrollTop ?? 0) / maxScrollTop))
      : 0;
    const indicatorTrackHeight = Math.max(
      visibleHeight - POOL_CARD_SCROLL_INDICATOR_TOP_INSET_PX - POOL_CARD_SCROLL_INDICATOR_BOTTOM_INSET_PX,
      POOL_CARD_SCROLL_INDICATOR_THUMB_HEIGHT_PX
    );
    const minThumbCenter = POOL_CARD_SCROLL_INDICATOR_THUMB_HEIGHT_PX / 2;
    const maxThumbCenter = Math.max(indicatorTrackHeight - POOL_CARD_SCROLL_INDICATOR_THUMB_HEIGHT_PX / 2, minThumbCenter);
    const thumbCenter = minThumbCenter + rawProgress * (maxThumbCenter - minThumbCenter);
    setInlineStyle(indicator, "--glitter-pool-scroll-indicator-center", `${thumbCenter.toFixed(2)}px`);
  };

  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const showScrollbar = (): void => {
    updateIndicatorProgress();
    setClassToken(cardGrid, "glitter-pool-stage__card-grid--scrolling", true);
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
    }
    hideTimer = setTimeout(() => {
      hideTimer = undefined;
      setClassToken(cardGrid, "glitter-pool-stage__card-grid--scrolling", false);
    }, POOL_CARD_SCROLLBAR_VISIBILITY_TIMEOUT_MS);
  };

  cardGrid.addEventListener("scroll", showScrollbar);

  withCleanup[POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY] = () => {
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
    cardGrid.removeEventListener?.("scroll", showScrollbar);
    setClassToken(cardGrid, "glitter-pool-stage__card-grid--scrolling", false);
    withCleanup[POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY] = undefined;
  };
}

function applyPoolCardMasonry(cardGrid: HTMLElement, cardStack: HTMLElement, cardShells: HTMLElement[]): void {
  if (cardShells.length === 0) {
    setInlineStyle(cardStack, "height", "0px");
    return;
  }

  const gridWidth = readElementWidth(cardGrid);
  const availableGridWidth = Math.max(0, gridWidth - POOL_CARD_MASONRY_SAFE_INSET_X_PX * 2);
  if (availableGridWidth <= 0) {
    return;
  }

  const columnCount = Math.max(
    1,
    Math.floor((availableGridWidth + POOL_CARD_MASONRY_GAP) / (POOL_CARD_MASONRY_MIN_WIDTH + POOL_CARD_MASONRY_GAP))
  );
  const columnWidth = Math.max(
    0,
    (availableGridWidth - POOL_CARD_MASONRY_GAP * Math.max(columnCount - 1, 0)) / columnCount
  );
  const columnHeights = Array.from({ length: columnCount }, () => 0);

  cardShells.forEach((cardShell) => {
    setInlineStyle(cardShell, "width", `${Math.max(columnWidth, 0)}px`);
  });

  cardShells.forEach((cardShell) => {
    let targetColumnIndex = 0;
    let targetColumnHeight = columnHeights[0] ?? 0;

    for (let index = 1; index < columnHeights.length; index += 1) {
      const nextColumnHeight = columnHeights[index] ?? 0;
      if (nextColumnHeight < targetColumnHeight) {
        targetColumnHeight = nextColumnHeight;
        targetColumnIndex = index;
      }
    }

    const nextX = POOL_CARD_MASONRY_SAFE_INSET_X_PX + targetColumnIndex * (columnWidth + POOL_CARD_MASONRY_GAP);
    const nextY = targetColumnHeight;
    setInlineStyle(cardShell, "transform", `translate3d(${nextX}px, ${nextY}px, 0)`);

    const cardHeight = readElementHeight(cardShell);
    columnHeights[targetColumnIndex] = nextY + cardHeight + POOL_CARD_MASONRY_GAP;
  });

  const stackHeight = columnHeights.length > 0
    ? Math.max(...columnHeights) - POOL_CARD_MASONRY_GAP
    : 0;
  setInlineStyle(cardStack, "height", `${Math.max(stackHeight, 0)}px`);
}

function bindPoolCardMasonry(
  containerEl: HTMLElement,
  cardGrid: HTMLElement,
  cardStack: HTMLElement,
  cardShells: HTMLElement[]
): void {
  disconnectPoolCardMasonry(containerEl);
  applyPoolCardMasonry(cardGrid, cardStack, cardShells);

  const ResizeObserverCtor = (globalThis as typeof globalThis & {
    ResizeObserver?: new (callback: ResizeObserverCallback) => ResizeObserver;
  }).ResizeObserver;

  if (typeof ResizeObserverCtor !== "function") {
    return;
  }

  const observer = new ResizeObserverCtor(() => {
    applyPoolCardMasonry(cardGrid, cardStack, cardShells);
  });

  observer.observe(cardGrid);
  cardShells.forEach((cardShell) => observer.observe(cardShell));

  const withObserver = containerEl as HTMLElement & {
    [POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY]?: ResizeObserver;
  };
  withObserver[POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY] = observer;
}

function selectEditableTextAtRightEdge(node: HTMLElement): void {
  const doc = (node.ownerDocument ?? document) as Document & {
    createRange?: () => Range;
    getSelection?: () => Selection | null;
  };
  const selection = doc.getSelection?.();
  const range = doc.createRange?.();
  if (!selection || !range) {
    return;
  }

  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function resolveActivePoolOption(state: PoolViewState): { id: string; label: string; count: number; selected: boolean } | null {
  const poolOptions = state.poolOptions ?? [];
  if (poolOptions.length === 0) {
    return null;
  }

  return poolOptions.find((pool) => pool.selected) ?? poolOptions[0] ?? null;
}

// 池选择弹层与工具栏菜单：批量移动、单卡移动、更多菜单都共用这里的按钮结构。
function renderMoveTargetButtons(
  parent: HTMLElement,
  poolOptions: PoolViewState["poolOptions"],
  options: {
    onSelect?: (poolId: string) => void;
    includeCounts?: boolean;
    disabled?: boolean;
    query?: string;
    labels?: PoolBrowseLabelState;
  } = {}
): void {
  const normalizedQuery = options.query?.trim().toLocaleLowerCase() ?? "";
  const availablePools = (poolOptions ?? []).filter((pool) => {
    if (pool.selected) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return pool.label.toLocaleLowerCase().includes(normalizedQuery);
  });

  availablePools.forEach((pool) => {
    const label = options.includeCounts
      ? `${pool.label}（${pool.count}）`
      : pool.label;
    const button = createButton(parent, "glitter-pool-stage__toolbar-menu-item", label, () => {
      options.onSelect?.(pool.id);
    });
    button.disabled = Boolean(options.disabled);
  });

  if (availablePools.length === 0) {
    const hint = createNode(
      parent,
      "div",
      "glitter-pool-stage__toolbar-menu-item glitter-pool-stage__toolbar-menu-item--hint",
      options.labels?.noMoveTargets ?? DEFAULT_BROWSE_LABELS.noMoveTargets
    );
    hint.setAttribute("aria-hidden", "true");
  }
}

function createPoolCardTypeIcon(
  parent: HTMLElement,
  typeIcon: "text" | "link" | "image" | "video" | "mixed",
  options: { accent?: boolean } = {}
): HTMLElement {
  const classNames = [
    "glitter-pool-stage__card-icon",
    `glitter-pool-stage__card-icon--${typeIcon}`
  ];
  if (options.accent) {
    classNames.push("glitter-pool-stage__card-icon--accent");
  }

  return createNode(parent, "span", classNames.join(" "));
}

function createPoolCardMenuIcon(parent: HTMLElement, icon: "more" | "edit" | "share" | "delete" | "file" | "move"): HTMLElement {
  return createNode(
    parent,
    "span",
    `glitter-pool-stage__card-more-menu-icon glitter-pool-stage__card-more-menu-icon--${icon}`
  );
}

function createResultsToolIcon(parent: HTMLElement, icon: "status" | "filter" | "sort" | "roam" | "preview" | "batch" | "more"): HTMLElement {
  return createNode(
    parent,
    "span",
    `glitter-pool-stage__results-tool-icon glitter-pool-stage__results-tool-icon--${icon}`
  );
}

const POOL_CARD_BODY_MAX_LINES = 8;
const POOL_CARD_MEDIA_BODY_MAX_LINES = 4;
const POOL_CARD_BODY_ESTIMATED_CHARS_PER_LINE = 22;
const POOL_CARD_MEDIA_BODY_ESTIMATED_CHARS_PER_LINE = 26;
const POOL_ROAM_DRAGGING_ID_KEY = "glitterPoolRoamDraggingIdeaId";
const POOL_ROAM_DRAGGING_SOURCE_HANDLE_KEY = "glitterPoolRoamDraggingSourceHandle";
const POOL_ROAM_DRAGGING_SOURCE_CONTENT_KEY = "glitterPoolRoamDraggingSourceContent";
const POOL_ROAM_DRAGGING_CLEANUP_KEY = "glitterPoolRoamDraggingCleanup";
const POOL_ROAM_DRAG_LINE_SELECTOR = ".glitter-pool-stage__roam-source-drag-line";

function readPoolRoamDraggingIdeaId(stage: HTMLElement): string | undefined {
  return (stage as HTMLElement & { [POOL_ROAM_DRAGGING_ID_KEY]?: string })[POOL_ROAM_DRAGGING_ID_KEY];
}

function writePoolRoamDraggingIdeaId(stage: HTMLElement, ideaId?: string): void {
  const stageWithDragState = stage as HTMLElement & { [POOL_ROAM_DRAGGING_ID_KEY]?: string };
  if (ideaId) {
    stageWithDragState[POOL_ROAM_DRAGGING_ID_KEY] = ideaId;
    return;
  }

  delete stageWithDragState[POOL_ROAM_DRAGGING_ID_KEY];
}

const POOL_ROAM_SOURCE_DRAG_MIME = "application/x-glitter-pool-roam-source";

function readPoolRoamDraggingIdeaIdFromEvent(event?: Event): string | undefined {
  const dragEvent = event as DragEvent & {
    dataTransfer?: {
      getData?: (type: string) => string;
    } | null;
  };
  const draggedIdeaId = dragEvent.dataTransfer?.getData?.(POOL_ROAM_SOURCE_DRAG_MIME)?.trim()
    ?? dragEvent.dataTransfer?.getData?.("text/plain")?.trim();
  return draggedIdeaId ? draggedIdeaId : undefined;
}

function setClassToken(node: HTMLElement, token: string, enabled: boolean): void {
  const classNames = new Set(node.className.split(/\s+/).filter(Boolean));
  if (enabled) {
    classNames.add(token);
  } else {
    classNames.delete(token);
  }
  node.className = Array.from(classNames).join(" ");
}

function isPointerWithinElement(
  event: Event | undefined,
  element: HTMLElement,
  options?: { expandLeft?: number; expandRight?: number; expandTop?: number; expandBottom?: number }
): boolean {
  const mouseEvent = event as MouseEvent | undefined;
  if (typeof mouseEvent?.clientX === "number" && typeof mouseEvent?.clientY === "number") {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return mouseEvent.clientX >= rect.left - (options?.expandLeft ?? 0)
        && mouseEvent.clientX <= rect.right + (options?.expandRight ?? 0)
        && mouseEvent.clientY >= rect.top - (options?.expandTop ?? 0)
        && mouseEvent.clientY <= rect.bottom + (options?.expandBottom ?? 0);
    }
  }

  const target = event?.target as Node | null;
  return Boolean(target && element.contains(target));
}

function updatePoolRoamSourceDragPreviewLine(
  stage: HTMLElement,
  sourceHandle: HTMLElement,
  pointer?: { clientX?: number; clientY?: number }
): void {
  const stageRect = stage.getBoundingClientRect();
  const sourceHandleRect = sourceHandle.getBoundingClientRect();
  const previewLine = (stage.querySelector(POOL_ROAM_DRAG_LINE_SELECTOR) as HTMLElement | null)
    ?? createNode(stage, "div", "glitter-pool-stage__roam-source-drag-line");
  previewLine.setAttribute("aria-hidden", "true");

  const startX = sourceHandleRect.left - stageRect.left + sourceHandleRect.width / 2;
  const startY = sourceHandleRect.top - stageRect.top + sourceHandleRect.height / 2;
  const endX = typeof pointer?.clientX === "number" ? pointer.clientX - stageRect.left : startX + 56;
  const endY = typeof pointer?.clientY === "number" ? pointer.clientY - stageRect.top : startY;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.max(12, Math.hypot(deltaX, deltaY));
  const angle = Math.atan2(deltaY, deltaX);

  setInlineStyle(previewLine, "left", `${startX}px`);
  setInlineStyle(previewLine, "top", `${startY}px`);
  setInlineStyle(previewLine, "width", `${length}px`);
  setInlineStyle(previewLine, "transform", `translateY(-50%) rotate(${angle}rad)`);
}

function syncPoolRoamSourceDragPreview(
  stage: HTMLElement,
  input?: {
    sourceHandle?: HTMLElement | null;
    sourceContent?: HTMLElement | null;
    cleanup?: (() => void) | undefined;
  }
): void {
  const stageWithDragState = stage as HTMLElement & {
    [POOL_ROAM_DRAGGING_SOURCE_HANDLE_KEY]?: HTMLElement | null;
    [POOL_ROAM_DRAGGING_SOURCE_CONTENT_KEY]?: HTMLElement | null;
    [POOL_ROAM_DRAGGING_CLEANUP_KEY]?: (() => void) | undefined;
  };
  const previousSourceHandle = stageWithDragState[POOL_ROAM_DRAGGING_SOURCE_HANDLE_KEY] ?? null;
  const previousSourceContent = stageWithDragState[POOL_ROAM_DRAGGING_SOURCE_CONTENT_KEY] ?? null;
  const previousCleanup = stageWithDragState[POOL_ROAM_DRAGGING_CLEANUP_KEY];

  if (previousSourceHandle && previousSourceHandle !== input?.sourceHandle) {
    setClassToken(previousSourceHandle, "glitter-pool-stage__roam-source-handle--dragging", false);
  }
  if (previousSourceContent && previousSourceContent !== input?.sourceContent) {
    setClassToken(previousSourceContent, "glitter-pool-stage__card-content--roam-source-dragging", false);
  }
  if (previousCleanup && previousCleanup !== input?.cleanup) {
    previousCleanup();
  }

  const nextSourceHandle = input?.sourceHandle ?? null;
  const nextSourceContent = input?.sourceContent ?? null;
  setClassToken(nextSourceHandle ?? stage, "glitter-pool-stage__roam-source-handle--dragging", Boolean(nextSourceHandle));
  setClassToken(nextSourceContent ?? stage, "glitter-pool-stage__card-content--roam-source-dragging", Boolean(nextSourceContent));

  stageWithDragState[POOL_ROAM_DRAGGING_SOURCE_HANDLE_KEY] = nextSourceHandle;
  stageWithDragState[POOL_ROAM_DRAGGING_SOURCE_CONTENT_KEY] = nextSourceContent;
  stageWithDragState[POOL_ROAM_DRAGGING_CLEANUP_KEY] = input?.cleanup;
}

function clearPoolRoamSourceDragPreview(stage: HTMLElement): void {
  syncPoolRoamSourceDragPreview(stage);
  stage.querySelector(POOL_ROAM_DRAG_LINE_SELECTOR)?.remove();
}

function estimateWrappedLineCount(text: string, estimatedCharsPerLine: number): number {
  return text.split(/\r?\n/).reduce((count, line) => {
    const normalizedLine = line.trim();
    const lineLength = normalizedLine.length > 0 ? normalizedLine.length : 1;
    return count + Math.max(1, Math.ceil(lineLength / estimatedCharsPerLine));
  }, 0);
}

function shouldCollapseCardCopy(
  bodyEl: HTMLElement,
  text: string,
  options: { maxLines: number; estimatedCharsPerLine: number }
): boolean {
  const measurableBody = bodyEl as HTMLElement & { scrollHeight?: number; clientHeight?: number; offsetHeight?: number };
  if (typeof measurableBody.scrollHeight === "number") {
    const visibleHeight =
      typeof measurableBody.clientHeight === "number" && measurableBody.clientHeight > 0
        ? measurableBody.clientHeight
        : typeof measurableBody.offsetHeight === "number" && measurableBody.offsetHeight > 0
          ? measurableBody.offsetHeight
          : 0;
    if (visibleHeight > 0) {
      return measurableBody.scrollHeight > visibleHeight + 1;
    }
  }

  return estimateWrappedLineCount(text, options.estimatedCharsPerLine) > options.maxLines;
}

function attachCardBodyToggle(
  parent: HTMLElement,
  bodyEl: HTMLElement,
  text: string,
  options: { maxLines: number; estimatedCharsPerLine: number; onToggle?: () => void; labels?: PoolBrowseLabelState }
): void {
  if (!text.trim()) {
    return;
  }

  setClassToken(bodyEl, "glitter-pool-stage__card-copy--expanded", false);
  setClassToken(bodyEl, "glitter-pool-stage__card-copy--collapsed", true);

  if (!shouldCollapseCardCopy(bodyEl, text, options)) {
    setClassToken(bodyEl, "glitter-pool-stage__card-copy--collapsed", false);
    return;
  }

  let expanded = false;
  const toggleRow = createNode(parent, "div", "glitter-pool-stage__card-body-toggle-row");
  const toggle = createButton(toggleRow, "glitter-pool-stage__card-body-toggle", "", () => {
    expanded = !expanded;
    syncToggleState();
    options.onToggle?.();
  });
  const toggleText = createNode(
    toggle,
    "span",
    "glitter-pool-stage__card-body-toggle-text glitter-home-stage__visually-hidden"
  );
  const toggleIcon = createNode(toggle, "span");

  const syncToggleState = (): void => {
    setClassToken(bodyEl, "glitter-pool-stage__card-copy--collapsed", !expanded);
    setClassToken(bodyEl, "glitter-pool-stage__card-copy--expanded", expanded);
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.setAttribute("aria-label", expanded ? options.labels?.bodyCollapseLabel ?? DEFAULT_BROWSE_LABELS.bodyCollapseLabel : options.labels?.bodyExpandLabel ?? DEFAULT_BROWSE_LABELS.bodyExpandLabel);
    toggleText.textContent = expanded ? options.labels?.bodyCollapseText ?? DEFAULT_BROWSE_LABELS.bodyCollapseText : options.labels?.bodyExpandText ?? DEFAULT_BROWSE_LABELS.bodyExpandText;
    toggleIcon.className = `glitter-write-stage__icon glitter-write-stage__icon--${expanded ? "chevron-up" : "chevron-down"}`;
  };

  syncToggleState();
}

function renderCardMoveDialogOverlay(
  stage: HTMLElement,
  card: NonNullable<NonNullable<PoolViewState["browse"]>["cards"]>[number],
  state: PoolViewState,
  actions: PoolViewActions
): void {
  const labels = resolveBrowseLabels(state);
  const overlay = createNode(stage, "div", "glitter-pool-stage__card-move-overlay");
  const scrim = createNode(overlay, "div", "glitter-pool-stage__card-move-scrim");
  scrim.setAttribute("aria-hidden", "true");

  const dialog = createNode(overlay, "div", "glitter-pool-stage__card-move-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", labels.moveToLabel);

  const header = createNode(dialog, "div", "glitter-pool-stage__card-move-dialog-header");
  const headerCopy = createNode(header, "div", "glitter-pool-stage__card-move-dialog-header-copy");
  createNode(headerCopy, "strong", "glitter-pool-stage__card-move-dialog-title", labels.moveToLabel);

  const isSubmitting = Boolean(actions.isCardMovePickerSubmitting?.(card.id));

  const closeButton = createButton(
    header,
    "glitter-write-stage__close-button glitter-pool-stage__card-move-dialog-close",
    "",
    () => {
      actions.onCloseCardMovePicker?.();
    }
  );
  closeButton.disabled = isSubmitting;
  closeButton.setAttribute("aria-label", labels.closeMoveToLabel);
  createNode(closeButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--close");

  const searchInput = createNode(
    dialog,
    "input",
    "glitter-write-stage__input glitter-pool-stage__card-move-dialog-search"
  ) as HTMLInputElement;
  searchInput.type = "text";
  searchInput.placeholder = labels.moveSearchPlaceholder;
  searchInput.value = actions.getCardMovePickerSearchQuery?.() ?? "";
  searchInput.disabled = isSubmitting;
  searchInput.addEventListener("input", (event) => {
    if (searchInput.disabled) {
      return;
    }

    const compositionEvent = event as InputEvent & { isComposing?: boolean };
    actions.onCardMovePickerSearchQueryChange?.(searchInput.value, {
      isComposing: compositionEvent.isComposing
    });
  });

  const targetList = createNode(dialog, "div", "glitter-pool-stage__card-move-dialog-list");
  renderMoveTargetButtons(targetList, state.poolOptions, {
    includeCounts: true,
    disabled: isSubmitting,
    query: searchInput.value,
    labels,
    onSelect(poolId) {
      actions.onMoveIdeaToPool?.(card.id, poolId);
    }
  });
}

function runCardMenuAction(
  actions: PoolViewActions,
  ideaId: string,
  kind: "create-file" | "open-primary-file" | "open-snippet-note" | "open-snippet-locations"
): void {
  switch (kind) {
    case "create-file":
      actions.onCreateFile?.(ideaId);
      return;
    case "open-primary-file":
      actions.onOpenPrimaryFile?.(ideaId);
      return;
    case "open-snippet-note":
      actions.onOpenSnippetNote?.(ideaId);
      return;
    case "open-snippet-locations":
      actions.onOpenSnippetLocations?.(ideaId);
      return;
  }
}

type RenderedBrowseControls = {
  query: string;
  status: "all" | "referenced" | "file-created" | "with-markers";
  sort: "updated-desc" | "created-desc" | "title-asc";
  contentFilter: "all" | "text" | "link" | "image" | "video";
  selectedCount: number;
  hasSelection: boolean;
  batchMode: boolean;
  labels?: PoolBrowseLabels;
};

type BrowseCard = NonNullable<NonNullable<PoolViewState["browse"]>["cards"]>[number];

type PoolBrowseLabelState = Partial<PoolBrowseLabels>;

const DEFAULT_BROWSE_LABELS: PoolBrowseLabels = {
  browseSearchPlaceholder: "搜索当前池中的灵感",
  bodyCollapseLabel: "收起正文",
  bodyExpandLabel: "展开全部正文",
  bodyCollapseText: "收起",
  bodyExpandText: "展开全部",
  moveToLabel: "移动到",
  closeMoveToLabel: "关闭移动到",
  moveSearchPlaceholder: "搜索目标池",
  noMoveTargets: "暂无可移动目标池",
  statusFilterOptions: { all: "全部灵感", referenced: "已引用", "file-created": "已建文件", "with-markers": "带状态" },
  contentFilterOptions: { all: "全部", text: "文本", link: "链接", image: "图片", video: "视频" },
  sortOptions: { "updated-desc": "最近更新", "created-desc": "最近创建", "title-asc": "标题排序" },
  newPoolLabel: "新建池",
  selectCardLabel: "选择卡片",
  deselectCardLabel: "取消选择",
  moreActionsLabel: "更多操作",
  editAction: "编辑",
  moveToPoolAction: "移动到池",
  shareAction: "分享",
  deleteAction: "删除",
  backHomeLabel: "返回首页",
  switchPoolLabel: "切换池",
  quickCaptureLabel: "灵感速记",
  roamBackTitle: "提示",
  roamBackDescription: "漫游模式下返回首页将直接结束本次灵感漫游，可在漫游历史中重新进入。",
  roamBackContinue: "继续漫游",
  roamBackHome: "返回首页",
  statusFilterLabel: "状态筛选",
  filterLabel: "筛选",
  sortLabel: "排序",
  previewCurrentPoolMarkdown: "查看当前池 Markdown 文件",
  previewUnavailableInRoam: "漫游模式下暂不支持查看当前池 Markdown 文件",
  batchOrganizeLabel: "批量整理",
  deleteSelectedIdeasLabel: "删除选中灵感",
  moveSelectedToPoolLabel: "移动到池",
  resizeRoamAreaLabel: "调整漫游区宽度",
  emptyPoolTitle: "这个池里还没有灵感",
  emptyPoolDescription: "先记录一条灵感，之后就能在这里查看、筛选和整理。",
  filterResultEyebrow: "筛选结果",
  noFilterResultsTitle: "没有找到匹配的灵感",
  noFilterResultsDescription: "换个筛选条件或搜索词，再试一次。",
  mediaPreviewCloseLabel: "Close large preview",
  mediaPreviewImageAlt: (ideaTitle) => `${ideaTitle} large preview`,
  mediaPreviewImageAltWithPosition: (ideaTitle, positionLabel) => `${ideaTitle} large preview (${positionLabel})`,
  mediaPreviewPreviousImageLabel: "View previous large image",
  mediaPreviewNextImageLabel: "View next large image",
  mediaPreviewVideoLabel: (ideaTitle) => `${ideaTitle} large preview`,
  cardImagePositionLabel: (current, total) => `image ${current} of ${total}`,
  cardCurrentImageAnnouncement: (positionLabel) => `Current image, ${positionLabel}`,
  cardViewLargeImageLabel: (ideaTitle) => `${ideaTitle}, view large image`,
  cardViewLargeImageWithPositionLabel: (ideaTitle, positionLabel) => `${ideaTitle}, view large image (${positionLabel})`,
  cardImageThumbnailAltWithPosition: (ideaTitle, positionLabel) => `${ideaTitle} (${positionLabel})`,
  cardPreviousImageLabel: "View previous image",
  cardNextImageLabel: "View next image",
  cardViewLargeVideoLabel: (ideaTitle) => `${ideaTitle}, view large video`,
  cardVideoPreviewLabel: (ideaTitle) => `${ideaTitle} video preview`,
  cardEmptyFallback: "No content yet"
};

function resolveBrowseLabels(state: PoolViewState): PoolBrowseLabels {
  return { ...DEFAULT_BROWSE_LABELS, ...(state.browse?.labels ?? {}) };
}

type RoamBridgePoint = {
  x: number;
  y: number;
};

type RoamBridgeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type RoamBridgeSegment = {
  axis: "horizontal" | "vertical";
  left: number;
  top: number;
  width: number;
  height: number;
};

type RoamBridgeLayout = {
  traceLeft: number;
  traceTop: number;
  traceWidth: number;
  traceHeight: number;
  markerX: number;
  markerY: number;
  popoverX: number;
  popoverY: number;
  segments: RoamBridgeSegment[];
};

function hasVisibleRoamBridgeForCard(card: BrowseCard, activePoolId: string, roamState: PoolViewState["roam"] | undefined): boolean {
  return Boolean(
    activePoolId
    && roamState?.boundaryAnchors.some((anchor) => anchor.visibleBridge && anchor.poolId === activePoolId && anchor.ideaId === card.id)
  );
}

function isRoamBridgeSourceHandleVisibleInCardGrid(sourceHandleRect: DOMRect, cardGridRect: DOMRect | null): boolean {
  if (!cardGridRect || cardGridRect.width <= 0 || cardGridRect.height <= 0) {
    return true;
  }

  return (
    sourceHandleRect.bottom > cardGridRect.top
    && sourceHandleRect.top < cardGridRect.bottom
    && sourceHandleRect.right > cardGridRect.left
    && sourceHandleRect.left < cardGridRect.right
  );
}

function buildMarkerOnlyRoamBridgeLayout(
  workbenchRect: DOMRect,
  cardGridRect: DOMRect | null,
  sourceHandleRect: DOMRect,
  seamX: number
): RoamBridgeLayout {
  // 分隔线连接点需要贴着边界线中心，同时限制在当前卡片区可见范围内，避免看起来掉到边界线下面。
  const markerPadding = 12;
  const minVisibleY = clampRoamBridgeValue(
    (cardGridRect?.top ?? workbenchRect.top) - workbenchRect.top + markerPadding,
    markerPadding,
    Math.max(markerPadding, workbenchRect.height - markerPadding)
  );
  const maxVisibleY = clampRoamBridgeValue(
    (cardGridRect?.bottom ?? workbenchRect.bottom) - workbenchRect.top - markerPadding,
    minVisibleY,
    Math.max(markerPadding, workbenchRect.height - markerPadding)
  );
  const markerAbsoluteY = clampRoamBridgeValue(
    sourceHandleRect.top - workbenchRect.top + sourceHandleRect.height / 2,
    minVisibleY,
    maxVisibleY
  );
  const traceLeft = Math.max(0, seamX - markerPadding);
  const traceTop = Math.max(0, markerAbsoluteY - markerPadding);

  return {
    traceLeft,
    traceTop,
    traceWidth: markerPadding * 2,
    traceHeight: markerPadding * 2,
    markerX: seamX - traceLeft,
    markerY: markerAbsoluteY - traceTop,
    popoverX: seamX - traceLeft - 18,
    popoverY: markerAbsoluteY - traceTop,
    segments: []
  };
}

function buildDetachedMarkerOnlyRoamBridgeLayout(
  workbench: HTMLElement,
  anchorIndex: number,
  anchorCount: number
): RoamBridgeLayout | null {
  const roamPane = workbench.querySelector(".glitter-pool-stage__workbench-pane--roam") as HTMLElement | null;
  if (!roamPane) {
    return null;
  }

  const cardGrid = workbench.querySelector(".glitter-pool-stage__card-grid") as HTMLElement | null;
  const workbenchRect = workbench.getBoundingClientRect();
  const cardGridRect = cardGrid?.getBoundingClientRect() ?? null;
  const roamPaneRect = roamPane.getBoundingClientRect();
  const seamX = Math.max(0, roamPaneRect.left - workbenchRect.left);
  const markerPadding = 12;
  const lanePadding = 32;
  const minVisibleY = clampRoamBridgeValue(
    (cardGridRect?.top ?? workbenchRect.top) - workbenchRect.top + lanePadding,
    markerPadding,
    Math.max(markerPadding, workbenchRect.height - markerPadding)
  );
  const maxVisibleY = clampRoamBridgeValue(
    (cardGridRect?.bottom ?? workbenchRect.bottom) - workbenchRect.top - lanePadding,
    minVisibleY,
    Math.max(markerPadding, workbenchRect.height - markerPadding)
  );
  const normalizedIndex = anchorCount <= 1 ? 0.5 : (anchorIndex + 1) / (anchorCount + 1);
  const markerAbsoluteY = clampRoamBridgeValue(
    minVisibleY + (maxVisibleY - minVisibleY) * normalizedIndex,
    minVisibleY,
    maxVisibleY
  );
  const traceLeft = Math.max(0, seamX - markerPadding);
  const traceTop = Math.max(0, markerAbsoluteY - markerPadding);

  return {
    traceLeft,
    traceTop,
    traceWidth: markerPadding * 2,
    traceHeight: markerPadding * 2,
    markerX: seamX - traceLeft,
    markerY: markerAbsoluteY - traceTop,
    popoverX: seamX - traceLeft - 18,
    popoverY: markerAbsoluteY - traceTop,
    segments: []
  };
}

function isRoamBridgePointInsideRect(point: RoamBridgePoint, rect: RoamBridgeRect): boolean {
  return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

function doesRoamBridgeHorizontalSegmentIntersectRect(y: number, startX: number, endX: number, rect: RoamBridgeRect): boolean {
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  return y > rect.top && y < rect.bottom && right > rect.left && left < rect.right;
}

function doesRoamBridgeVerticalSegmentIntersectRect(x: number, startY: number, endY: number, rect: RoamBridgeRect): boolean {
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  return x > rect.left && x < rect.right && bottom > rect.top && top < rect.bottom;
}

function isRoamBridgeSegmentClear(start: RoamBridgePoint, end: RoamBridgePoint, obstacles: RoamBridgeRect[]): boolean {
  if (start.x === end.x) {
    return obstacles.every((rect) => !doesRoamBridgeVerticalSegmentIntersectRect(start.x, start.y, end.y, rect));
  }

  if (start.y === end.y) {
    return obstacles.every((rect) => !doesRoamBridgeHorizontalSegmentIntersectRect(start.y, start.x, end.x, rect));
  }

  return false;
}

function clampRoamBridgeValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function collectRoamBridgeObstacleRects(
  workbench: HTMLElement,
  workbenchRect: DOMRect,
  sourceIdeaId: string
): RoamBridgeRect[] {
  const obstaclePadding = 12;
  const cardShells = Array.from(workbench.querySelectorAll(".glitter-pool-stage__card-shell")) as HTMLElement[];

  return cardShells
    .filter((cardShell) => (cardShell.dataset.ideaId ?? "") !== sourceIdeaId)
    .map((cardShell) => {
      const rect = cardShell.getBoundingClientRect();
      return {
        left: rect.left - workbenchRect.left - obstaclePadding,
        top: rect.top - workbenchRect.top - obstaclePadding,
        right: rect.right - workbenchRect.left + obstaclePadding,
        bottom: rect.bottom - workbenchRect.top + obstaclePadding
      };
    })
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
}

function buildRoamBridgePath(start: RoamBridgePoint, seamX: number, workbenchHeight: number, obstacles: RoamBridgeRect[]): RoamBridgePoint[] {
  const routePadding = 12;
  const maxY = Math.max(routePadding, workbenchHeight - routePadding);
  const candidateXValues = new Set<number>([start.x, seamX]);
  const candidateYValues = new Set<number>([clampRoamBridgeValue(start.y, routePadding, maxY)]);

  obstacles.forEach((rect) => {
    candidateXValues.add(rect.left);
    candidateXValues.add(rect.right);
    candidateYValues.add(clampRoamBridgeValue(rect.top, routePadding, maxY));
    candidateYValues.add(clampRoamBridgeValue(rect.bottom, routePadding, maxY));
  });

  candidateYValues.add(routePadding);
  candidateYValues.add(maxY);

  const candidateX = Array.from(candidateXValues).sort((left, right) => left - right);
  const candidateY = Array.from(candidateYValues).sort((top, bottom) => top - bottom);
  const points: RoamBridgePoint[] = [];
  const pointIndexByKey = new Map<string, number>();
  const registerPoint = (point: RoamBridgePoint): number => {
    const key = `${point.x}:${point.y}`;
    const existingIndex = pointIndexByKey.get(key);
    if (existingIndex !== undefined) {
      return existingIndex;
    }

    const nextIndex = points.length;
    points.push(point);
    pointIndexByKey.set(key, nextIndex);
    return nextIndex;
  };

  candidateX.forEach((x) => {
    candidateY.forEach((y) => {
      const point = { x, y };
      if (obstacles.some((rect) => isRoamBridgePointInsideRect(point, rect))) {
        return;
      }
      registerPoint(point);
    });
  });

  const startIndex = registerPoint(start);
  const edges = new Map<number, Array<{ to: number; cost: number }>>();
  const pushEdge = (from: number, to: number): void => {
    const fromPoint = points[from];
    const toPoint = points[to];
    if (!fromPoint || !toPoint || !isRoamBridgeSegmentClear(fromPoint, toPoint, obstacles)) {
      return;
    }

    const cost = Math.abs(fromPoint.x - toPoint.x) + Math.abs(fromPoint.y - toPoint.y);
    const outgoing = edges.get(from) ?? [];
    outgoing.push({ to, cost });
    edges.set(from, outgoing);
  };

  const pointsByY = new Map<number, number[]>();
  const pointsByX = new Map<number, number[]>();
  points.forEach((point, index) => {
    const sameY = pointsByY.get(point.y) ?? [];
    sameY.push(index);
    pointsByY.set(point.y, sameY);

    const sameX = pointsByX.get(point.x) ?? [];
    sameX.push(index);
    pointsByX.set(point.x, sameX);
  });

  pointsByY.forEach((indices) => {
    indices.sort((left, right) => points[left]!.x - points[right]!.x);
    for (let index = 1; index < indices.length; index += 1) {
      const previous = indices[index - 1]!;
      const current = indices[index]!;
      pushEdge(previous, current);
      pushEdge(current, previous);
    }
  });

  pointsByX.forEach((indices) => {
    indices.sort((left, right) => points[left]!.y - points[right]!.y);
    for (let index = 1; index < indices.length; index += 1) {
      const previous = indices[index - 1]!;
      const current = indices[index]!;
      pushEdge(previous, current);
      pushEdge(current, previous);
    }
  });

  const distances = new Array<number>(points.length).fill(Number.POSITIVE_INFINITY);
  const previous = new Array<number>(points.length).fill(-1);
  const visited = new Set<number>();
  distances[startIndex] = 0;

  while (visited.size < points.length) {
    let currentIndex = -1;
    let currentDistance = Number.POSITIVE_INFINITY;

    distances.forEach((distance, index) => {
      if (visited.has(index) || distance >= currentDistance) {
        return;
      }
      currentIndex = index;
      currentDistance = distance;
    });

    if (currentIndex < 0) {
      break;
    }

    visited.add(currentIndex);
    const outgoing = edges.get(currentIndex) ?? [];
    outgoing.forEach(({ to, cost }) => {
      if (visited.has(to)) {
        return;
      }
      const nextDistance = currentDistance + cost;
      if (nextDistance < distances[to]!) {
        distances[to] = nextDistance;
        previous[to] = currentIndex;
      }
    });
  }

  const seamPointIndices = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.x === seamX)
    .sort((left, right) => {
      const leftDistance = distances[left.index] ?? Number.POSITIVE_INFINITY;
      const rightDistance = distances[right.index] ?? Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return Math.abs(left.point.y - start.y) - Math.abs(right.point.y - start.y);
    });

  const bestSeamPoint = seamPointIndices.find(({ index }) => Number.isFinite(distances[index] ?? Number.POSITIVE_INFINITY));
  if (!bestSeamPoint) {
    return [start, { x: seamX, y: start.y }];
  }

  const path: RoamBridgePoint[] = [];
  let cursor = bestSeamPoint.index;
  while (cursor >= 0) {
    path.push(points[cursor]!);
    cursor = previous[cursor] ?? -1;
  }

  return simplifyRoamBridgePath(path.reverse());
}

function simplifyRoamBridgePath(path: RoamBridgePoint[]): RoamBridgePoint[] {
  if (path.length <= 2) {
    return path;
  }

  const simplified: RoamBridgePoint[] = [path[0]!];
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1]!;
    const current = path[index]!;
    const next = path[index + 1]!;
    const sharesVerticalAxis = previous.x === current.x && current.x === next.x;
    const sharesHorizontalAxis = previous.y === current.y && current.y === next.y;

    if (sharesVerticalAxis || sharesHorizontalAxis) {
      continue;
    }

    simplified.push(current);
  }

  simplified.push(path[path.length - 1]!);
  return simplified;
}

function buildRoamBridgeSegments(path: RoamBridgePoint[], traceLeft: number, traceTop: number): RoamBridgeSegment[] {
  const segments: RoamBridgeSegment[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1]!;
    const current = path[index]!;

    if (previous.x === current.x) {
      segments.push({
        axis: "vertical",
        left: previous.x - traceLeft - 1,
        top: Math.min(previous.y, current.y) - traceTop,
        width: 2,
        height: Math.max(2, Math.abs(current.y - previous.y))
      });
      continue;
    }

    segments.push({
      axis: "horizontal",
      left: Math.min(previous.x, current.x) - traceLeft,
      top: previous.y - traceTop - 1,
      width: Math.max(2, Math.abs(current.x - previous.x)),
      height: 2
    });
  }

  return segments;
}

function resolveRoamBridgeLayout(
  workbench: HTMLElement,
  anchor: PoolRoamBoundaryAnchorState,
  anchorIndex: number,
  anchorCount: number
): RoamBridgeLayout | null {
  const sourceHandle = workbench.querySelector(
    `[data-glitter-pool-roam-source-handle="${anchor.ideaId}"]`
  ) as HTMLElement | null;

  if (!sourceHandle) {
    return buildDetachedMarkerOnlyRoamBridgeLayout(workbench, anchorIndex, anchorCount);
  }

  const cardGrid = workbench.querySelector(".glitter-pool-stage__card-grid") as HTMLElement | null;
  const roamPane = workbench.querySelector(".glitter-pool-stage__workbench-pane--roam") as HTMLElement | null;

  if (!roamPane) {
    return null;
  }

  const workbenchRect = workbench.getBoundingClientRect();
  const sourceHandleRect = sourceHandle.getBoundingClientRect();
  const cardGridRect = cardGrid?.getBoundingClientRect() ?? null;
  const roamPaneRect = roamPane.getBoundingClientRect();
  const seamX = Math.max(0, roamPaneRect.left - workbenchRect.left);

  if (!isRoamBridgeSourceHandleVisibleInCardGrid(sourceHandleRect, cardGridRect as DOMRect | null)) {
    return buildMarkerOnlyRoamBridgeLayout(workbenchRect as DOMRect, cardGridRect as DOMRect | null, sourceHandleRect as DOMRect, seamX);
  }

  const start = {
    x: Math.max(0, sourceHandleRect.left - workbenchRect.left + sourceHandleRect.width / 2),
    y: Math.max(0, sourceHandleRect.top - workbenchRect.top + sourceHandleRect.height / 2)
  };
  const path = buildRoamBridgePath(
    start,
    Math.max(start.x + 24, seamX),
    workbenchRect.height,
    collectRoamBridgeObstacleRects(workbench, workbenchRect as DOMRect, anchor.ideaId)
  );
  const xs = path.map((point) => point.x);
  const ys = path.map((point) => point.y);
  const routePadding = 12;
  const traceLeft = Math.max(0, Math.min(...xs) - routePadding);
  const traceTop = Math.max(0, Math.min(...ys) - routePadding);
  const traceWidth = Math.max(24, Math.max(...xs) - traceLeft + routePadding);
  const traceHeight = Math.max(24, Math.max(...ys) - traceTop + routePadding);
  const endPoint = path[path.length - 1] ?? start;

  return {
    traceLeft,
    traceTop,
    traceWidth,
    traceHeight,
    markerX: endPoint.x - traceLeft,
    markerY: endPoint.y - traceTop,
    popoverX: endPoint.x - traceLeft - 18,
    popoverY: endPoint.y - traceTop,
    segments: buildRoamBridgeSegments(path, traceLeft, traceTop)
  };
}

function syncRoamBridgeLaneLayout(workbench: HTMLElement): void {
  const traces = Array.from(
    workbench.querySelectorAll("[data-glitter-pool-roam-bridge-trace]")
  ) as HTMLElement[];

  traces.forEach((trace) => {
    const anchorId = trace.dataset.anchorId;
    const ideaId = trace.dataset.ideaId;
    const poolId = trace.dataset.poolId;
    if (!anchorId || !ideaId || !poolId) {
      return;
    }

    const anchorIndex = Number.parseInt(trace.dataset.anchorIndex ?? "0", 10);
    const anchorCount = Number.parseInt(trace.dataset.anchorCount ?? `${traces.length}`, 10);
    const layout = resolveRoamBridgeLayout(
      workbench,
      {
        anchorId,
        ideaId,
        poolId,
        poolName: trace.dataset.poolName ?? "",
        poolColor: trace.dataset.poolColor ?? "",
        ideaTitle: trace.dataset.ideaTitle ?? "",
        visibleBridge: true
      },
      Number.isFinite(anchorIndex) ? anchorIndex : 0,
      Number.isFinite(anchorCount) && anchorCount > 0 ? anchorCount : traces.length
    );
    if (!layout) {
      trace.remove();
      return;
    }

    setInlineStyle(trace, "top", `${layout.traceTop}px`);
    setInlineStyle(trace, "left", `${layout.traceLeft}px`);
    setInlineStyle(trace, "width", `${layout.traceWidth}px`);
    setInlineStyle(trace, "height", `${layout.traceHeight}px`);

    const segmentHost = trace.querySelector("[data-glitter-pool-roam-bridge-segments]") as HTMLElement | null;
    const hoverZone = trace.querySelector(".glitter-pool-stage__roam-bridge-hover-zone") as HTMLElement | null;
    const marker = trace.querySelector(".glitter-pool-stage__roam-bridge-marker") as HTMLElement | null;
    const popover = trace.querySelector(".glitter-pool-stage__roam-bridge-popover") as HTMLElement | null;

    if (segmentHost) {
      clearContainer(segmentHost);
      layout.segments.forEach((segment) => {
        const line = createNode(
          segmentHost,
          "span",
          `glitter-pool-stage__roam-bridge-line glitter-pool-stage__roam-bridge-line--${segment.axis}`
        );
        line.setAttribute("data-glitter-pool-roam-bridge-segment", segment.axis);
        setInlineStyle(line, "left", `${segment.left}px`);
        setInlineStyle(line, "top", `${segment.top}px`);
        setInlineStyle(line, "width", `${segment.width}px`);
        setInlineStyle(line, "height", `${segment.height}px`);
      });
    }

    if (hoverZone) {
      setInlineStyle(hoverZone, "left", `${Math.min(layout.markerX, layout.popoverX) - 12}px`);
      setInlineStyle(hoverZone, "top", `${layout.markerY - 24}px`);
      setInlineStyle(hoverZone, "width", `${Math.max(48, Math.abs(layout.markerX - layout.popoverX) + 24)}px`);
      setInlineStyle(hoverZone, "height", "48px");
    }

    if (marker) {
      setInlineStyle(marker, "left", `${layout.markerX}px`);
      setInlineStyle(marker, "top", `${layout.markerY}px`);
    }

    if (popover) {
      setInlineStyle(popover, "left", `${layout.popoverX}px`);
      setInlineStyle(popover, "top", `${layout.popoverY}px`);
    }
  });
}

function bindRoamBridgeLaneLayoutSync(workbench: HTMLElement): void {
  disconnectPoolRoamBridgeLayoutSync(workbench);

  const cardGrid = workbench.querySelector(".glitter-pool-stage__card-grid") as HTMLElement | null;
  const cardStack = workbench.querySelector(".glitter-pool-stage__card-stack") as HTMLElement | null;
  const roamPane = workbench.querySelector(".glitter-pool-stage__workbench-pane--roam") as HTMLElement | null;
  const sourceHandles = Array.from(workbench.querySelectorAll("[data-glitter-pool-roam-source-handle]")) as HTMLElement[];
  let pendingFrameId: number | null = null;
  const syncLayout = (): void => {
    syncRoamBridgeLaneLayout(workbench);
  };
  const scheduleLayout = (): void => {
    if (pendingFrameId !== null) {
      return;
    }
    if (typeof globalThis.requestAnimationFrame !== "function") {
      syncLayout();
      return;
    }

    pendingFrameId = globalThis.requestAnimationFrame(() => {
      pendingFrameId = null;
      syncLayout();
    });
  };

  cardGrid?.addEventListener("scroll", scheduleLayout);

  const ResizeObserverCtor = (globalThis as typeof globalThis & {
    ResizeObserver?: new (callback: ResizeObserverCallback) => ResizeObserver;
  }).ResizeObserver;

  let observer: ResizeObserver | undefined;
  if (typeof ResizeObserverCtor === "function") {
    observer = new ResizeObserverCtor(() => {
      syncLayout();
    });

    [workbench, cardGrid, cardStack, roamPane, ...sourceHandles]
      .filter((node): node is HTMLElement => Boolean(node))
      .forEach((node) => observer?.observe(node));
  }

  const withCleanup = workbench as HTMLElement & {
    [POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY]?: () => void;
  };
  withCleanup[POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY] = () => {
    cardGrid?.removeEventListener?.("scroll", scheduleLayout);
    if (pendingFrameId !== null && typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(pendingFrameId);
    }
    pendingFrameId = null;
    observer?.disconnect?.();
    withCleanup[POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY] = undefined;
  };

  syncLayout();
}

function renderRoamBridgeLane(workbench: HTMLElement, state: PoolViewState, actions: PoolViewActions): void {
  disconnectPoolRoamBridgeLayoutSync(workbench);

  if (!state.roam?.open) {
    return;
  }

  const roamLabels = state.roam.labels;
  const visibleAnchors = state.roam.boundaryAnchors.filter((anchor) => anchor.visibleBridge);
  const lane = createNode(workbench, "div", "glitter-pool-stage__roam-bridge-lane");

  visibleAnchors.forEach((anchor, anchorIndex) => {
    const trace = createNode(lane, "div", "glitter-pool-stage__roam-bridge-trace glitter-pool-stage__roam-bridge-trace--attached");
    trace.dataset.anchorId = anchor.anchorId;
    trace.dataset.ideaId = anchor.ideaId;
    trace.dataset.poolId = anchor.poolId;
    trace.dataset.poolName = anchor.poolName;
    trace.dataset.poolColor = anchor.poolColor;
    trace.dataset.ideaTitle = anchor.ideaTitle;
    trace.dataset.anchorIndex = `${anchorIndex}`;
    trace.dataset.anchorCount = `${visibleAnchors.length}`;
    trace.setAttribute("data-glitter-pool-roam-bridge-trace", anchor.anchorId);
    setInlineStyle(trace, "color", anchor.poolColor);

    const segmentHost = createNode(trace, "div", "glitter-pool-stage__roam-bridge-segments");
    segmentHost.setAttribute("data-glitter-pool-roam-bridge-segments", anchor.anchorId);

    const hoverZone = createNode(trace, "span", "glitter-pool-stage__roam-bridge-hover-zone");
    hoverZone.setAttribute("aria-hidden", "true");

    const marker = createNode(trace, "button", "glitter-pool-stage__roam-bridge-marker") as HTMLButtonElement;
    marker.type = "button";
    setInlineStyle(marker, "background", anchor.poolColor);
    marker.setAttribute("aria-label", roamLabels?.bridgeMarkerLabel(anchor.ideaTitle) ?? `查看「${anchor.ideaTitle}」的漫游链接`);
    marker.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    const popover = createNode(trace, "div", "glitter-pool-stage__roam-bridge-popover");
    createNode(popover, "div", "glitter-pool-stage__roam-bridge-popover-title", anchor.ideaTitle);
    createNode(popover, "div", "glitter-pool-stage__roam-bridge-popover-meta", roamLabels?.bridgeMeta(anchor.poolName) ?? `来自 ${anchor.poolName}`);
    const actionRow = createNode(popover, "div", "glitter-pool-stage__roam-bridge-popover-actions");

    const locateButton = createButton(actionRow, "glitter-pool-stage__roam-bridge-action", roamLabels?.locateSource ?? "定位原卡", () => {
      actions.onLocatePoolRoamSource?.(anchor.ideaId);
    });
    locateButton.setAttribute("data-glitter-pool-roam-bridge-locate", anchor.anchorId);

    const deleteButton = createButton(
      actionRow,
      "glitter-pool-stage__roam-bridge-action glitter-pool-stage__roam-bridge-action--delete",
      roamLabels?.deleteLink ?? "删除链接",
      () => {
        actions.onDeletePoolRoamSourceLink?.(anchor.anchorId);
      }
    );
    deleteButton.setAttribute("data-glitter-pool-roam-bridge-delete", anchor.anchorId);
  });

  bindRoamBridgeLaneLayoutSync(workbench);
}

function readBrowseControls(state: PoolViewState): RenderedBrowseControls {
  return {
    query: state.controls?.query ?? "",
    status: state.controls?.status ?? "all",
    sort: state.controls?.sort ?? "updated-desc",
    contentFilter: state.browse?.contentFilter ?? state.controls?.contentFilter ?? "all",
    selectedCount: state.controls?.selectedCount ?? 0,
    hasSelection: state.controls?.hasSelection ?? false,
    batchMode: state.controls?.batchMode ?? false,
    labels: resolveBrowseLabels(state)
  };
}

// 池切换浮层挂在标题旁，只负责当前池高亮、键盘活动行和切池动作，不额外承载编辑逻辑。
function renderPoolSwitcherOverlay(
  titleCluster: HTMLElement,
  state: PoolViewState,
  actions: PoolViewActions,
  activePool: { id: string; label: string; count: number; selected: boolean } | null
): void {
  const switcher = createNode(titleCluster, "div", "glitter-pool-stage__pool-switcher");
  const popup = createNode(switcher, "div", "glitter-pool-stage__pool-popup");
  const popupList = createNode(popup, "div", "glitter-pool-stage__pool-popup-list");

  (state.poolOptions ?? []).forEach((pool, index) => {
    const isSelected = Boolean(activePool && pool.id === activePool.id);
    const isActive = state.browse?.poolSwitcherActivePoolId === pool.id;
    const itemClasses = ["glitter-pool-stage__pool-popup-item"];
    if (isSelected) {
      itemClasses.push("glitter-pool-stage__pool-popup-item--selected");
    }
    if (isActive) {
      itemClasses.push("glitter-pool-stage__pool-popup-item--active");
    }

    const popupItem = createButton(popupList, itemClasses.join(" "), "", () => {
      if (isSelected) {
        actions.onBrowseOverlayClose?.();
        return;
      }
      actions.onPoolSwitch?.(pool.id);
    });
    popupItem.dataset.poolId = pool.id;
    popupItem.dataset.poolIndex = String(index);
    createNode(popupItem, "span", "glitter-pool-stage__pool-popup-item-label", pool.label);
    if (isSelected) {
      createNode(popupItem, "span", "glitter-pool-stage__pool-popup-check");
    }
  });
}

// 结果工具栏下拉层统一承接状态、内容筛选和排序三类菜单，保持触发器与菜单外壳的交互一致。
function renderResultsToolbarMenuOverlay(
  menuHost: HTMLElement,
  activeOverlay: "status" | "filter" | "sort",
  controls: RenderedBrowseControls,
  actions: PoolViewActions
): void {
  const labels = controls.labels ?? DEFAULT_BROWSE_LABELS;
  let currentHost: HTMLElement | null = menuHost;
  let isInsideRoamMoreMenu = false;
  while (currentHost) {
    const classTokens = currentHost.className.split(/\s+/);
    if (classTokens.includes("glitter-pool-stage__toolbar-menu--roam-more")) {
      isInsideRoamMoreMenu = true;
      break;
    }
    currentHost = currentHost.parentElement ?? (currentHost.parentNode as HTMLElement | null) ?? ((currentHost as unknown as { parent?: HTMLElement | null }).parent ?? null);
  }
  const menu = createNode(
    menuHost,
    "div",
    isInsideRoamMoreMenu
      ? "glitter-pool-stage__toolbar-menu glitter-pool-stage__toolbar-menu--roam-submenu"
      : "glitter-pool-stage__toolbar-menu"
  );

  if (activeOverlay === "status") {
    [
      { value: "all", label: labels.statusFilterOptions.all },
      { value: "referenced", label: labels.statusFilterOptions.referenced },
      { value: "file-created", label: labels.statusFilterOptions["file-created"] },
      { value: "with-markers", label: labels.statusFilterOptions["with-markers"] }
    ].forEach((option) => {
      const itemClassName = controls.status === option.value
        ? "glitter-pool-stage__toolbar-menu-item glitter-pool-stage__toolbar-menu-item--active"
        : "glitter-pool-stage__toolbar-menu-item";
      createButton(menu, itemClassName, option.label, () => {
        actions.onStatusChange?.(option.value as "all" | "referenced" | "file-created" | "with-markers");
      });
    });
  }

  if (activeOverlay === "filter") {
    [
      { value: "all", label: labels.contentFilterOptions.all },
      { value: "text", label: labels.contentFilterOptions.text },
      { value: "link", label: labels.contentFilterOptions.link },
      { value: "image", label: labels.contentFilterOptions.image },
      { value: "video", label: labels.contentFilterOptions.video }
    ].forEach((option) => {
      const itemClassName = controls.contentFilter === option.value
        ? "glitter-pool-stage__toolbar-menu-item glitter-pool-stage__toolbar-menu-item--active"
        : "glitter-pool-stage__toolbar-menu-item";
      createButton(menu, itemClassName, option.label, () => {
        actions.onContentFilterChange?.(option.value as "all" | "text" | "link" | "image" | "video");
      });
    });
  }

  if (activeOverlay === "sort") {
    [
      { value: "updated-desc", label: labels.sortOptions["updated-desc"] },
      { value: "created-desc", label: labels.sortOptions["created-desc"] },
      { value: "title-asc", label: labels.sortOptions["title-asc"] }
    ].forEach((option) => {
      const itemClassName = controls.sort === option.value
        ? "glitter-pool-stage__toolbar-menu-item glitter-pool-stage__toolbar-menu-item--active"
        : "glitter-pool-stage__toolbar-menu-item";
      createButton(menu, itemClassName, option.label, () => {
        actions.onSortChange?.(option.value as "updated-desc" | "created-desc" | "title-asc");
      });
    });
  }
}

function isBrowseResultsMorePanelOpen(activeOverlay: PoolBrowseOverlay | null): boolean {
  return activeOverlay === "browse-more" || activeOverlay === "status" || activeOverlay === "filter" || activeOverlay === "sort";
}

function renderBrowseResultsToolbarControls(
  parent: HTMLElement,
  actions: PoolViewActions,
  options: {
    controls: RenderedBrowseControls;
    activeOverlay: PoolBrowseOverlay | null;
    roamOpen: boolean;
    previewAvailable: boolean;
    previewOpen: boolean;
  }
): {
  statusAnchor: HTMLElement;
  filterAnchor: HTMLElement;
  sortAnchor: HTMLElement;
  previewAnchor: HTMLElement | null;
  batchAnchor: HTMLElement;
} {
  const statusAnchor = createNode(
    parent,
    "div",
    "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--status"
  );
  const statusTrigger = createButton(statusAnchor, "glitter-pool-stage__status-trigger", "", () => {
    actions.onBrowseOverlayToggle?.("status");
  });
  statusTrigger.setAttribute("aria-label", options.controls.labels?.statusFilterLabel ?? DEFAULT_BROWSE_LABELS.statusFilterLabel);
  statusTrigger.setAttribute("aria-expanded", options.activeOverlay === "status" ? "true" : "false");
  createResultsToolIcon(statusTrigger, "status");

  const filterAnchor = createNode(
    parent,
    "div",
    "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--filter"
  );
  const filterTrigger = createButton(filterAnchor, "glitter-pool-stage__results-tool glitter-pool-stage__results-tool--filter", "", () => {
    actions.onBrowseOverlayToggle?.("filter");
  });
  filterTrigger.setAttribute("aria-label", options.controls.labels?.filterLabel ?? DEFAULT_BROWSE_LABELS.filterLabel);
  filterTrigger.setAttribute("aria-expanded", options.activeOverlay === "filter" ? "true" : "false");
  createResultsToolIcon(filterTrigger, "filter");

  const sortAnchor = createNode(
    parent,
    "div",
    "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--sort"
  );
  const sortTrigger = createButton(sortAnchor, "glitter-pool-stage__results-tool glitter-pool-stage__results-tool--sort", "", () => {
    actions.onBrowseOverlayToggle?.("sort");
  });
  sortTrigger.setAttribute("aria-label", options.controls.labels?.sortLabel ?? DEFAULT_BROWSE_LABELS.sortLabel);
  sortTrigger.setAttribute("aria-expanded", options.activeOverlay === "sort" ? "true" : "false");
  createResultsToolIcon(sortTrigger, "sort");

  let previewAnchor: HTMLElement | null = null;
  if (options.previewAvailable) {
    previewAnchor = createNode(
      parent,
      "div",
      "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--preview"
    );
    const previewTrigger = createButton(
      previewAnchor,
      "glitter-pool-stage__results-tool glitter-pool-stage__results-tool--preview",
      "",
      () => {
        if (options.roamOpen) {
          return;
        }
        actions.onTogglePoolMarkdownPreview?.();
      }
    );
    previewTrigger.setAttribute("aria-label", options.controls.labels?.previewCurrentPoolMarkdown ?? DEFAULT_BROWSE_LABELS.previewCurrentPoolMarkdown);
    previewTrigger.setAttribute(
      "title",
      options.roamOpen
        ? options.controls.labels?.previewUnavailableInRoam ?? DEFAULT_BROWSE_LABELS.previewUnavailableInRoam
        : options.controls.labels?.previewCurrentPoolMarkdown ?? DEFAULT_BROWSE_LABELS.previewCurrentPoolMarkdown
    );
    previewTrigger.setAttribute("aria-pressed", options.previewOpen ? "true" : "false");
    previewTrigger.setAttribute("aria-disabled", options.roamOpen ? "true" : "false");
    previewTrigger.disabled = options.roamOpen;
    createResultsToolIcon(previewTrigger, "preview");
  }

  const batchAnchor = createNode(
    parent,
    "div",
    "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--batch"
  );
  const batchTrigger = createButton(batchAnchor, "glitter-pool-stage__batch-toggle", "", () => {
    actions.onBatchModeToggle?.();
  });
  batchTrigger.dataset.batchMode = options.controls.batchMode ? "on" : "off";
  batchTrigger.setAttribute("aria-label", options.controls.labels?.batchOrganizeLabel ?? DEFAULT_BROWSE_LABELS.batchOrganizeLabel);
  batchTrigger.setAttribute("aria-pressed", options.controls.batchMode ? "true" : "false");
  createResultsToolIcon(batchTrigger, "batch");

  return {
    statusAnchor,
    filterAnchor,
    sortAnchor,
    previewAnchor,
    batchAnchor
  };
}

// 批量移动菜单把可选池列表和底部新建池入口收在同一弹层里，避免另起第二层可见控件。
function renderBatchMoveMenu(
  moveActionAnchor: HTMLElement,
  state: PoolViewState,
  controls: RenderedBrowseControls,
  actions: PoolViewActions
): void {
  const labels = controls.labels ?? DEFAULT_BROWSE_LABELS;
  const menu = createNode(
    moveActionAnchor,
    "div",
    "glitter-pool-stage__toolbar-menu glitter-pool-stage__toolbar-menu--batch"
  );
  createNode(menu, "strong", "glitter-pool-stage__toolbar-menu-title", labels.moveToLabel);
  renderMoveTargetButtons(menu, state.poolOptions, {
    disabled: !controls.hasSelection,
    labels,
    onSelect(poolId) {
      actions.onMoveSelectionToPool?.(poolId);
    }
  });
  const createPoolButton = createButton(menu, "glitter-pool-stage__toolbar-menu-create", "", () => {
    actions.onMoveSelectionToPool?.(CREATE_NEW_POOL_ID);
  });
  createPoolButton.disabled = !controls.hasSelection;
  createPoolButton.setAttribute("aria-label", labels.newPoolLabel);
  createNode(createPoolButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--plus");
}

function isPoolRoamAvailable(state: PoolViewState): boolean {
  return state.mode === "browse" || state.mode === "empty";
}

function renderPoolRoamToggle(parent: HTMLElement, actions: PoolViewActions, open: boolean, labels?: NonNullable<PoolViewState["roam"]>["labels"]): void {
  const roamEntry = createNode(parent, "div", "glitter-pool-stage__results-entry");
  const roamTrigger = createButton(roamEntry, "glitter-pool-stage__results-entry-button", "", () => {
    actions.onTogglePoolRoam?.();
  });
  roamTrigger.dataset.glitterPoolRoamToggle = "true";
  roamTrigger.setAttribute("data-glitter-pool-roam-toggle", "true");
  roamTrigger.setAttribute("aria-label", open ? labels?.toggleClose ?? "关闭漫游模式" : labels?.toggleOpen ?? "打开漫游模式");
  roamTrigger.setAttribute("aria-pressed", open ? "true" : "false");
  createResultsToolIcon(roamTrigger, "roam");
  createNode(roamTrigger, "span", "glitter-pool-stage__results-entry-label", labels?.modeLabel ?? "漫游模式");
}

function renderRoamPanel(parent: HTMLElement, stage: HTMLElement, state: PoolViewState, actions: PoolViewActions): void {
  const roamState = state.roam;
  const roamLabels = roamState?.labels;
  const roamPanel = createNode(parent, "aside", "glitter-pool-stage__roam-panel");
  const roamCanvasStage = createNode(roamPanel, "div", "glitter-pool-stage__roam-canvas-stage");
  roamCanvasStage.setAttribute("data-glitter-pool-roam-dropzone", "true");

  const setDropTargetActive = (active: boolean): void => {
    setClassToken(roamCanvasStage, "glitter-pool-stage__roam-canvas-stage--drag-over", active);
  };

  const resolveDraggingSourceHandle = (): HTMLElement | null => {
    return (stage as HTMLElement & {
      [POOL_ROAM_DRAGGING_SOURCE_HANDLE_KEY]?: HTMLElement | null;
    })[POOL_ROAM_DRAGGING_SOURCE_HANDLE_KEY] ?? null;
  };

  const resolveDraggingIdeaId = (event?: Event): string | undefined => {
    const draggingIdeaId = readPoolRoamDraggingIdeaId(stage) ?? readPoolRoamDraggingIdeaIdFromEvent(event);
    if (draggingIdeaId) {
      writePoolRoamDraggingIdeaId(stage, draggingIdeaId);
      setClassToken(stage, "glitter-pool-stage--roam-source-dragging", true);
    }
    return draggingIdeaId;
  };

  const clearDraggingState = (): void => {
    writePoolRoamDraggingIdeaId(stage);
    clearPoolRoamSourceDragPreview(stage);
    setClassToken(stage, "glitter-pool-stage--roam-source-dragging", false);
    setDropTargetActive(false);
  };

  const attachDraggedSource = (event?: Event): void => {
    const draggingIdeaId = resolveDraggingIdeaId(event);
    if (!draggingIdeaId) {
      clearDraggingState();
      return;
    }

    actions.onAttachPoolRoamSource?.(draggingIdeaId);
    clearDraggingState();
  };

  roamCanvasStage.addEventListener("mouseenter", (event) => {
    if (!resolveDraggingIdeaId()) {
      return;
    }

    const draggingSourceHandle = resolveDraggingSourceHandle();
    if (draggingSourceHandle) {
      updatePoolRoamSourceDragPreviewLine(stage, draggingSourceHandle, event as MouseEvent);
    }
    setDropTargetActive(true);
  });
  roamCanvasStage.addEventListener("mousemove", (event) => {
    if (!resolveDraggingIdeaId()) {
      return;
    }

    const draggingSourceHandle = resolveDraggingSourceHandle();
    if (draggingSourceHandle) {
      updatePoolRoamSourceDragPreviewLine(stage, draggingSourceHandle, event as MouseEvent);
    }
    setDropTargetActive(true);
  });
  roamCanvasStage.addEventListener("mouseleave", () => {
    setDropTargetActive(false);
  });
  roamCanvasStage.addEventListener("mouseup", (event) => {
    if (!resolveDraggingIdeaId()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    attachDraggedSource();
  });
  roamCanvasStage.addEventListener("dragenter", (event) => {
    if (!resolveDraggingIdeaId(event)) {
      return;
    }

    const draggingSourceHandle = resolveDraggingSourceHandle();
    if (draggingSourceHandle) {
      updatePoolRoamSourceDragPreviewLine(stage, draggingSourceHandle, event as MouseEvent);
    }
    event.preventDefault();
    setDropTargetActive(true);
  });
  roamCanvasStage.addEventListener("dragover", (event) => {
    if (!resolveDraggingIdeaId(event)) {
      return;
    }

    const draggingSourceHandle = resolveDraggingSourceHandle();
    if (draggingSourceHandle) {
      updatePoolRoamSourceDragPreviewLine(stage, draggingSourceHandle, event as MouseEvent);
    }
    event.preventDefault();
    setDropTargetActive(true);
  });
  roamCanvasStage.addEventListener("dragleave", () => {
    setDropTargetActive(false);
  });
  roamCanvasStage.addEventListener("drop", (event) => {
    if (!resolveDraggingIdeaId(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    attachDraggedSource(event);
  });

  const floatingActionHandlers: Record<
    NonNullable<PoolViewState["roam"]>["floatingActions"][number],
    ((anchorEl: HTMLElement) => void) | undefined
  > = {
    download: actions.onDownloadPoolRoamImage ? () => actions.onDownloadPoolRoamImage?.() : undefined,
    share: actions.onSharePoolRoamBoard,
    history: actions.onOpenPoolRoamHistory ? () => actions.onOpenPoolRoamHistory?.() : undefined,
    "idea-block": actions.onAddPoolRoamIdeaBlock ? () => actions.onAddPoolRoamIdeaBlock?.() : undefined
  };
  const floatingActionLabels: Record<NonNullable<PoolViewState["roam"]>["floatingActions"][number], string> = {
    download: roamLabels?.downloadCurrentBoard ?? "下载当前漫游白板",
    share: roamLabels?.shareCurrentBoard ?? "分享当前漫游白板",
    history: roamLabels?.openHistory ?? "打开漫游白板历史",
    "idea-block": roamLabels?.addIdeaBlock ?? "增加灵感块"
  };
  const floatingActions = createNode(roamCanvasStage, "div", "glitter-pool-stage__roam-floating-actions");
  (roamState?.floatingActions ?? []).forEach((action) => {
    const actionHandler = floatingActionHandlers[action];
    const button = createButton(
      floatingActions,
      `glitter-pool-stage__roam-floating-action glitter-pool-stage__roam-floating-action--${action}`,
      "",
      () => {
        if (!actionHandler) {
          return;
        }
        actionHandler(button);
      }
    );
    button.dataset.glitterPoolRoamAction = action;
    button.setAttribute("data-glitter-pool-roam-action", action);
    button.setAttribute("aria-label", floatingActionLabels[action]);
    button.disabled = !actionHandler;
    createNode(button, "span", `glitter-pool-stage__roam-floating-action-icon glitter-pool-stage__roam-floating-action-icon--${action}`);
  });

  const roamCanvasHost = createNode(roamCanvasStage, "div", "glitter-pool-stage__roam-canvas-host");
  if (roamState?.mode === "board" && roamState.boardPath) {
    roamCanvasHost.dataset.boardPath = roamState.boardPath;
    return;
  }

  if (roamState?.mode === "error") {
    const errorState = createNode(roamCanvasHost, "div", "glitter-pool-stage__roam-error");
    createNode(errorState, "strong", "glitter-pool-stage__roam-error-title", roamLabels?.errorTitle ?? "漫游白板暂时不可用");
    createNode(
      errorState,
      "p",
      "glitter-pool-stage__roam-error-description",
      roamState.errorMessage ?? roamLabels?.errorDescription ?? "请稍后再试。"
    );
    return;
  }

  const emptyState = createNode(roamCanvasHost, "div", "glitter-pool-stage__roam-empty");
  createNode(emptyState, "strong", "glitter-pool-stage__roam-empty-title", roamLabels?.emptyTitle ?? "新的空白漫游区");
  createNode(
    emptyState,
    "p",
    "glitter-pool-stage__roam-empty-description",
    roamLabels?.emptyDescription ?? "把左侧卡片内容区右上角的圆点拖入这里后，才会创建第一块漫游白板。"
  );
}

// 预览侧板只提供当前池 Markdown 汇总的查看与导出入口，本体内容仍由宿主预览渲染器后续填充。
function renderPreviewPanel(parent: HTMLElement, state: PoolViewState, actions: PoolViewActions): void {
  const previewState = state.preview;
  const previewPanel = createNode(parent, "aside", "glitter-pool-stage__pool-markdown-preview");
  const previewHeader = createNode(previewPanel, "div", "glitter-pool-stage__pool-markdown-preview-header");
  createNode(
    previewHeader,
    "div",
    "glitter-pool-stage__pool-markdown-preview-title",
    previewState?.panelTitle ?? `${state.pool.title} Markdown 文件`
  );
  const saveButton = createButton(
    previewHeader,
    "glitter-pool-stage__pool-markdown-preview-save",
    previewState?.saveLabel ?? "保存 Markdown 文件",
    () => {
      actions.onSavePoolMarkdownFile?.();
    }
  );
  saveButton.disabled = Boolean(previewState?.saving);
  createNode(previewPanel, "div", "glitter-pool-stage__pool-markdown-preview-content");
}

function renderPoolRoamSourceHandle(
  content: HTMLElement,
  card: BrowseCard,
  stage: HTMLElement,
  actions: PoolViewActions,
  options: { roamOpen: boolean; roamSourceActive?: boolean; labels?: NonNullable<PoolViewState["roam"]>["labels"] }
): void {
  content.querySelector(".glitter-pool-stage__roam-source-handle")?.remove();
  setClassToken(content, "glitter-pool-stage__card-content--roam-source", options.roamOpen);

  if (!options.roamOpen) {
    return;
  }

  const handleClassName = options.roamSourceActive
    ? "glitter-pool-stage__roam-source-handle glitter-pool-stage__roam-source-handle--active"
    : "glitter-pool-stage__roam-source-handle";
  const sourceHandle = createNode(content, "div", handleClassName) as HTMLDivElement;
  sourceHandle.dataset.glitterPoolRoamSourceHandle = card.id;
  sourceHandle.setAttribute("data-glitter-pool-roam-source-handle", card.id);
  sourceHandle.setAttribute("aria-label", options.labels?.sourceHandleLabel(card.title) ?? `将「${card.title}」连接到漫游白板`);
  sourceHandle.setAttribute("title", options.labels?.sourceHandleTitle ?? "拖出连接线到右侧漫游白板");
  sourceHandle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  sourceHandle.addEventListener("dragstart", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  sourceHandle.addEventListener("mousedown", (event) => {
    if (typeof (event as MouseEvent).button === "number" && (event as MouseEvent).button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    writePoolRoamDraggingIdeaId(stage, card.id);
    syncPoolRoamSourceDragPreview(stage, {
      sourceHandle,
      sourceContent: content,
      cleanup: undefined
    });
    updatePoolRoamSourceDragPreviewLine(stage, sourceHandle, event as MouseEvent);
    setClassToken(stage, "glitter-pool-stage--roam-source-dragging", true);

    const ownerDocument = stage.ownerDocument as Document & {
      addEventListener?: (type: string, listener: (event?: Event) => void, options?: boolean) => void;
      removeEventListener?: (type: string, listener: (event?: Event) => void, options?: boolean) => void;
      defaultView?: (Window & {
        addEventListener?: (type: string, listener: (event?: Event) => void, options?: boolean) => void;
        removeEventListener?: (type: string, listener: (event?: Event) => void, options?: boolean) => void;
      }) | null;
    };
    const ownerWindow = ownerDocument.defaultView;
    const resolveRoamPane = (): HTMLElement | null => {
      return stage.querySelector(".glitter-pool-stage__workbench-pane--roam") as HTMLElement | null;
    };
    const clearDragSession = (): void => {
      clearPoolRoamSourceDragPreview(stage);
      writePoolRoamDraggingIdeaId(stage);
      setClassToken(stage, "glitter-pool-stage--roam-source-dragging", false);
      const roamCanvasStage = stage.querySelector(".glitter-pool-stage__roam-canvas-stage") as HTMLElement | null;
      if (roamCanvasStage) {
        setClassToken(roamCanvasStage, "glitter-pool-stage__roam-canvas-stage--drag-over", false);
      }
    };
    const handleDocumentMouseMove = (mouseMoveEvent?: Event): void => {
      if (!readPoolRoamDraggingIdeaId(stage)) {
        return;
      }

      updatePoolRoamSourceDragPreviewLine(stage, sourceHandle, mouseMoveEvent as MouseEvent);
      const roamCanvasStage = stage.querySelector(".glitter-pool-stage__roam-canvas-stage") as HTMLElement | null;
      const roamPane = resolveRoamPane();
      if (roamCanvasStage && roamPane) {
        setClassToken(
          roamCanvasStage,
          "glitter-pool-stage__roam-canvas-stage--drag-over",
          isPointerWithinElement(mouseMoveEvent, roamPane, { expandLeft: 12 })
        );
      }
    };
    const handleDocumentMouseUp = (mouseUpEvent?: Event): void => {
      const roamPane = resolveRoamPane();
      if (roamPane && isPointerWithinElement(mouseUpEvent, roamPane, { expandLeft: 12 })) {
        actions.onAttachPoolRoamSource?.(card.id);
        clearDragSession();
        return;
      }

      clearDragSession();
    };
    const handleWindowBlur = (): void => {
      if (!readPoolRoamDraggingIdeaId(stage)) {
        return;
      }

      clearDragSession();
    };

    if (typeof ownerDocument.addEventListener === "function" && typeof ownerDocument.removeEventListener === "function") {
      ownerDocument.addEventListener("mousemove", handleDocumentMouseMove, true);
      ownerDocument.addEventListener("mouseup", handleDocumentMouseUp, true);
      ownerWindow?.addEventListener?.("blur", handleWindowBlur, true);
      syncPoolRoamSourceDragPreview(stage, {
        sourceHandle,
        sourceContent: content,
        cleanup: () => {
          ownerDocument.removeEventListener?.("mousemove", handleDocumentMouseMove, true);
          ownerDocument.removeEventListener?.("mouseup", handleDocumentMouseUp, true);
          ownerWindow?.removeEventListener?.("blur", handleWindowBlur, true);
        }
      });
    }
  });
  createNode(sourceHandle, "span", "glitter-pool-stage__roam-source-handle-icon");
}

// 单卡右上角壳层会在普通态和批量态之间切换：要么显示更多菜单，要么显示圆形勾选开关。
function renderPoolCardMenuShell(
  menuShell: HTMLElement,
  card: BrowseCard,
  actions: PoolViewActions,
  options: {
    batchMode: boolean;
    selected: boolean;
    menuOpen?: boolean;
    movePickerOpen?: boolean;
    roamOpen?: boolean;
    roamSourceActive?: boolean;
    labels?: PoolBrowseLabelState;
  }
): void {
  clearContainer(menuShell);
  const labels = { ...DEFAULT_BROWSE_LABELS, ...(options.labels ?? {}) };

  if (options.batchMode) {
    const selectToggleClassName = options.selected
      ? "glitter-pool-stage__card-select-toggle glitter-pool-stage__card-select-toggle--selected"
      : "glitter-pool-stage__card-select-toggle";
    const selectToggle = createButton(menuShell, selectToggleClassName, "", () => {
      actions.onItemSelect(card.id);
    });
    selectToggle.dataset.ideaId = card.id;
    selectToggle.setAttribute("aria-label", options.selected ? labels.deselectCardLabel : labels.selectCardLabel);
    selectToggle.setAttribute("aria-pressed", options.selected ? "true" : "false");
    createNode(selectToggle, "span", "glitter-pool-stage__card-select-toggle-dot");
    return;
  }

  const moreTrigger = createButton(menuShell, "glitter-pool-stage__card-more-trigger", "", () => {
    actions.onCardMenuToggle?.(card.id);
  });
  moreTrigger.dataset.ideaId = card.id;
  moreTrigger.setAttribute("aria-label", labels.moreActionsLabel);
  moreTrigger.setAttribute("aria-haspopup", "menu");
  moreTrigger.setAttribute("aria-expanded", options.menuOpen ? "true" : "false");
  createPoolCardMenuIcon(moreTrigger, "more");

  if (options.movePickerOpen) {
    return;
  }

  const moreMenu = createNode(menuShell, "div", "glitter-pool-stage__card-more-menu");
  moreMenu.dataset.ideaId = card.id;
  moreMenu.setAttribute("role", "menu");
  setRenderedPoolCardMenuVisibility(moreMenu, Boolean(options.menuOpen));

  const editMenuItem = createButton(
    moreMenu,
    "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--edit",
    "",
    () => {
      actions.onEditIdea?.(card.id);
    }
  );
  editMenuItem.dataset.ideaId = card.id;
  createPoolCardMenuIcon(editMenuItem, "edit");
  createNode(editMenuItem, "span", undefined, labels.editAction);

  const moveMenuItem = createButton(
    moreMenu,
    "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--move",
    "",
    () => {
      actions.onOpenCardMovePicker?.(card.id);
    }
  );
  moveMenuItem.dataset.ideaId = card.id;
  createPoolCardMenuIcon(moveMenuItem, "move");
  createNode(moveMenuItem, "span", undefined, labels.moveToPoolAction);

  const shareMenuItem = createButton(
    moreMenu,
    "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--share",
    "",
    () => {
      actions.onShareIdea?.(card.id, moreTrigger);
    }
  );
  shareMenuItem.dataset.ideaId = card.id;
  createPoolCardMenuIcon(shareMenuItem, "share");
  createNode(shareMenuItem, "span", undefined, labels.shareAction);

  (card.menuActions ?? []).forEach((action) => {
    const actionMenuItem = createButton(
      moreMenu,
      "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--file",
      "",
      () => {
        runCardMenuAction(actions, card.id, action.kind);
      }
    );
    actionMenuItem.dataset.ideaId = card.id;
    createPoolCardMenuIcon(actionMenuItem, "file");
    createNode(actionMenuItem, "span", undefined, action.label);
  });

  const deleteMenuItem = createButton(
    moreMenu,
    "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--delete",
    "",
    () => {
      actions.onDeleteIdea?.(card.id);
    }
  );
  deleteMenuItem.dataset.ideaId = card.id;
  createPoolCardMenuIcon(deleteMenuItem, "delete");
  createNode(deleteMenuItem, "span", undefined, labels.deleteAction);

}

function buildPoolCardStructureSignature(card: BrowseCard): string {
  return JSON.stringify({
    id: card.id,
    title: card.title,
    typeIcon: card.typeIcon,
    contentKind: card.contentKind,
    bodyText: card.bodyText ?? "",
    updatedLabel: card.updatedLabel,
    fileCreated: card.fileCreated,
    statusLabels: card.statusLabels ?? [],
    menuActions: (card.menuActions ?? []).map((action) => `${action.kind}:${action.label}`),
    linkDisplayText: card.linkDisplayText ?? "",
    linkUrl: card.linkUrl ?? "",
    mediaPath: card.mediaPath ?? "",
    mediaThumbnailUrl: card.mediaThumbnailUrl ?? "",
    mediaThumbnailUrls: card.mediaThumbnailUrls ?? []
  });
}

function readPoolCardStructureSignature(cardShell: HTMLElement): string | undefined {
  return (cardShell as HTMLElement & {
    [POOL_CARD_STRUCTURE_SIGNATURE_KEY]?: string;
  })[POOL_CARD_STRUCTURE_SIGNATURE_KEY];
}

function writePoolCardStructureSignature(cardShell: HTMLElement, signature: string): void {
  (cardShell as HTMLElement & {
    [POOL_CARD_STRUCTURE_SIGNATURE_KEY]?: string;
  })[POOL_CARD_STRUCTURE_SIGNATURE_KEY] = signature;
}

function buildPoolCardSurfaceClassName(card: BrowseCard, controls: RenderedBrowseControls): string {
  const classNames = ["glitter-pool-stage__card-surface"];
  if (card.selected && controls.batchMode) {
    classNames.push("glitter-pool-stage__card-surface--selected");
  }
  if (card.searchHit) {
    classNames.push("glitter-pool-stage__card-surface--search-hit");
    if (card.searchHitPulse) {
      classNames.push("is-pulsing");
    }
  }
  return classNames.join(" ");
}

function syncPoolCardMoreMenuMaxHeight(cardShell: HTMLElement): void {
  const surface = cardShell.querySelector(".glitter-pool-stage__card-surface") as HTMLElement | null;
  const moreTrigger = cardShell.querySelector(".glitter-pool-stage__card-more-trigger") as HTMLButtonElement | null;
  const moreMenu = cardShell.querySelector(".glitter-pool-stage__card-more-menu") as HTMLElement | null;
  if (!surface || !moreTrigger || !moreMenu) {
    return;
  }

  const cardHeight = Math.max(readElementHeight(cardShell), readElementHeight(surface));
  if (cardHeight <= 0) {
    return;
  }

  const menuTopInset = 10;
  const menuGap = 6;
  const menuBottomInset = 10;
  const triggerHeight = Math.max(readElementHeight(moreTrigger), 28);
  const maxMenuHeight = Math.max(
    POOL_CARD_MORE_MENU_MIN_HEIGHT_PX,
    cardHeight - menuTopInset - triggerHeight - menuGap - menuBottomInset
  );
  setInlineStyle(moreMenu, "maxHeight", `${maxMenuHeight}px`);
  setInlineStyle(moreMenu, "minHeight", `${POOL_CARD_MORE_MENU_MIN_HEIGHT_PX}px`);
}

// 顶部栏渲染：承接返回、池标题与池切换、内联改名以及进入灵感速记的主入口。
function renderBrowseTopbar(
  topbar: HTMLElement,
  state: PoolViewState,
  actions: PoolViewActions,
  options: {
    activeOverlay: PoolBrowseOverlay | null;
    activePool: { id: string; label: string; count: number; selected: boolean } | null;
    canEditMetadata: boolean;
    showPoolSwitcher: boolean;
    roamOpen: boolean;
  }
): void {
  clearContainer(topbar);
  const labels = resolveBrowseLabels(state);

  const backButton = createButton(topbar, "glitter-pool-stage__back", "", () => actions.onBack());
  backButton.setAttribute("aria-label", labels.backHomeLabel);
  createNode(backButton, "span", "glitter-pool-stage__back-icon");

  const titleCluster = createNode(topbar, "div", "glitter-pool-stage__title-cluster");
  const titleSlot = createNode(titleCluster, "div", "glitter-pool-stage__title-slot");
  let currentTitle = state.header.title ?? state.pool.title;
  const title = createNode(
    titleSlot,
    "h2",
    options.canEditMetadata ? "glitter-pool-stage__title glitter-pool-stage__title--editable" : "glitter-pool-stage__title",
    currentTitle
  );

  const commitTitle = (): void => {
    if (title.getAttribute("contenteditable") !== "true") {
      return;
    }

    const nextTitle = (title.textContent ?? "").trim();
    const finalTitle = nextTitle || currentTitle;
    title.textContent = finalTitle;
    title.setAttribute("contenteditable", "false");

    if (!nextTitle || nextTitle === currentTitle) {
      return;
    }

    currentTitle = nextTitle;
    actions.onPoolTitleSave?.(nextTitle);
  };

  title.addEventListener("click", () => {
    if (!options.canEditMetadata || title.getAttribute("contenteditable") === "true") {
      return;
    }

    title.setAttribute("contenteditable", "true");
    title.focus?.();
    selectEditableTextAtRightEdge(title);
  });
  title.addEventListener("blur", commitTitle);
  title.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent & { isComposing?: boolean };
    if (keyboardEvent.key !== "Enter" || keyboardEvent.isComposing) {
      return;
    }
    keyboardEvent.preventDefault();
    commitTitle();
  });

  if (options.showPoolSwitcher) {
    const titleSwitcher = createButton(titleCluster, "glitter-pool-stage__title-switcher", "", () => {
      actions.onBrowseOverlayToggle?.("pool-switcher");
    });
    titleSwitcher.setAttribute("aria-label", labels.switchPoolLabel);
    titleSwitcher.setAttribute("aria-expanded", options.activeOverlay === "pool-switcher" ? "true" : "false");
    createNode(titleSwitcher, "span", "glitter-pool-stage__pool-trigger-arrows");

    if (options.activeOverlay === "pool-switcher") {
      renderPoolSwitcherOverlay(titleCluster, state, actions, options.activePool);
    }
  }

  const topbarTools = createNode(topbar, "div", "glitter-pool-stage__topbar-tools");
  const topbarCreate = createButton(
    topbarTools,
    options.roamOpen
      ? "glitter-pool-stage__topbar-create glitter-pool-stage__topbar-create--compact"
      : "glitter-pool-stage__topbar-create",
    "",
    () => {
      actions.onCreateIdea();
    }
  );
  topbarCreate.dataset.role = "create-idea";
  topbarCreate.setAttribute("aria-label", labels.quickCaptureLabel);
  createNode(topbarCreate, "span", "glitter-pool-stage__topbar-create-icon");
  if (!options.roamOpen) {
    createNode(topbarCreate, "span", "glitter-pool-stage__topbar-create-label", labels.quickCaptureLabel);
  }
}

// 描述条既是池简介展示位，也是可内联编辑的 metadata 入口，和标题改名共用同一提交节奏。
function renderPoolRoamBackConfirm(stage: HTMLElement, state: PoolViewState, actions: PoolViewActions): void {
  const labels = resolveBrowseLabels(state);
  const closeConfirm = createNode(
    stage,
    "div",
    "glitter-write-stage__close-confirm glitter-pool-stage__roam-back-confirm"
  );
  const dialog = createNode(closeConfirm, "div", "glitter-pool-stage__roam-back-confirm-dialog");
  createNode(dialog, "h3", "glitter-write-stage__close-confirm-title", labels.roamBackTitle);
  createNode(
    dialog,
    "p",
    "glitter-write-stage__close-confirm-description",
    labels.roamBackDescription
  );
  const closeConfirmActions = createNode(dialog, "div", "glitter-write-stage__close-confirm-actions");
  createButton(closeConfirmActions, "glitter-write-stage__close-confirm-secondary", labels.roamBackContinue, () => {
    actions.onDismissRoamBackConfirm?.();
  });
  createButton(closeConfirmActions, "glitter-write-stage__close-confirm-primary", labels.roamBackHome, () => {
    actions.onConfirmRoamBackHome?.();
  });
}

function renderBrowseDescriptionSlot(
  descriptionSlot: HTMLElement,
  state: PoolViewState,
  actions: PoolViewActions,
  canEditMetadata: boolean
): void {
  clearContainer(descriptionSlot);

  let currentDescription = state.browse?.description ?? "";
  let currentDescriptionValue = state.browse?.descriptionValue ?? currentDescription;
  const description = createNode(
    descriptionSlot,
    "div",
    canEditMetadata
      ? "glitter-pool-stage__description-strip glitter-pool-stage__description-strip--editable"
      : "glitter-pool-stage__description-strip",
    currentDescription
  );

  const commitDescription = (): void => {
    if (description.getAttribute("contenteditable") !== "true") {
      return;
    }

    const nextDescription = (description.textContent ?? "").trim();
    const finalDescription = nextDescription || currentDescription;
    description.textContent = finalDescription;
    description.setAttribute("contenteditable", "false");

    if (nextDescription === currentDescriptionValue) {
      return;
    }

    currentDescriptionValue = nextDescription;
    currentDescription = nextDescription || currentDescription;
    actions.onPoolDescriptionSave?.(nextDescription);
  };

  description.addEventListener("click", () => {
    if (!canEditMetadata || description.getAttribute("contenteditable") === "true") {
      return;
    }

    description.setAttribute("contenteditable", "true");
    description.focus?.();
    selectEditableTextAtRightEdge(description);
  });
  description.addEventListener("blur", commitDescription);
  description.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent & { isComposing?: boolean; shiftKey?: boolean };
    if (keyboardEvent.key !== "Enter" || keyboardEvent.isComposing || keyboardEvent.shiftKey) {
      return;
    }
    keyboardEvent.preventDefault();
    commitDescription();
  });
}

// 结果头把搜索框、状态/内容/排序入口、Markdown 预览开关和批量模式触发器压进同一行工具区。
function renderBrowseResultsHeader(
  resultsHeader: HTMLElement,
  state: PoolViewState,
  actions: PoolViewActions,
  options: {
    controls: RenderedBrowseControls;
    activeOverlay: PoolBrowseOverlay | null;
    roamAvailable: boolean;
    roamOpen: boolean;
    previewAvailable: boolean;
    previewOpen: boolean;
  }
): void {
  clearContainer(resultsHeader);

  const resultsLead = createNode(resultsHeader, "div", "glitter-pool-stage__results-lead");
  if (options.roamAvailable) {
    renderPoolRoamToggle(resultsLead, actions, options.roamOpen, state.roam?.labels);
  }

  const resultsControls = createNode(resultsHeader, "div", "glitter-pool-stage__results-controls");
  const resultsTools = createNode(resultsControls, "div", "glitter-pool-stage__results-tools");

  const queryInput = createNode(resultsTools, "input", "glitter-pool-stage__query") as HTMLInputElement;
  queryInput.type = "text";
  queryInput.value = options.controls.query;
  queryInput.placeholder = state.browse?.queryPlaceholder ?? options.controls.labels?.browseSearchPlaceholder ?? DEFAULT_BROWSE_LABELS.browseSearchPlaceholder;
  queryInput.addEventListener("input", (event) => {
    const compositionEvent = event as InputEvent & { isComposing?: boolean };
    actions.onQueryChange?.(queryInput.value, {
      isComposing: compositionEvent.isComposing
    });
  });
  queryInput.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent & { isComposing?: boolean };
    if (keyboardEvent.key !== "Enter" || keyboardEvent.isComposing) {
      return;
    }
    keyboardEvent.preventDefault();
    actions.onQuerySubmit?.(queryInput.value);
  });

  if (options.roamOpen) {
    const morePanelOpen = isBrowseResultsMorePanelOpen(options.activeOverlay);
    const moreAnchor = createNode(
      resultsTools,
      "div",
      "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--more"
    );
    const moreTrigger = createButton(moreAnchor, "glitter-pool-stage__results-tool glitter-pool-stage__results-tool--more", "", () => {
      if (morePanelOpen) {
        actions.onBrowseOverlayClose?.();
        return;
      }
      actions.onBrowseOverlayToggle?.("browse-more");
    });
    moreTrigger.setAttribute("aria-label", options.controls.labels?.moreActionsLabel ?? DEFAULT_BROWSE_LABELS.moreActionsLabel);
    moreTrigger.setAttribute("aria-expanded", morePanelOpen ? "true" : "false");
    createResultsToolIcon(moreTrigger, "more");

    if (morePanelOpen) {
      const morePanel = createNode(
        moreAnchor,
        "div",
        "glitter-pool-stage__toolbar-menu glitter-pool-stage__toolbar-menu--roam-more"
      );
      const toolbarAnchors = renderBrowseResultsToolbarControls(morePanel, actions, options);
      if (options.activeOverlay === "status" || options.activeOverlay === "filter" || options.activeOverlay === "sort") {
        const menuHost = options.activeOverlay === "status"
          ? toolbarAnchors.statusAnchor
          : options.activeOverlay === "filter"
            ? toolbarAnchors.filterAnchor
            : toolbarAnchors.sortAnchor;
        renderResultsToolbarMenuOverlay(menuHost, options.activeOverlay, options.controls, actions);
      }
    }
    return;
  }

  const toolbarAnchors = renderBrowseResultsToolbarControls(resultsTools, actions, options);
  if (options.activeOverlay === "status" || options.activeOverlay === "filter" || options.activeOverlay === "sort") {
    const menuHost = options.activeOverlay === "status"
      ? toolbarAnchors.statusAnchor
      : options.activeOverlay === "filter"
        ? toolbarAnchors.filterAnchor
        : toolbarAnchors.sortAnchor;
    renderResultsToolbarMenuOverlay(menuHost, options.activeOverlay, options.controls, actions);
  }
}

// 批量面板固定悬在卡片区右下角，持续显示已选数量，并把删除/移动动作收成两个圆形按钮。
function renderBrowseBatchPanel(
  parent: HTMLElement,
  state: PoolViewState,
  actions: PoolViewActions,
  options: {
    controls: RenderedBrowseControls;
    activeOverlay: PoolBrowseOverlay | null;
  }
): void {
  const batchPanel = createNode(parent, "div", "glitter-pool-stage__batch-panel");
  createNode(batchPanel, "div", "glitter-pool-stage__batch-summary", `${options.controls.selectedCount}/${state.pool.itemCount}`);

  const deleteAction = createButton(batchPanel, "glitter-pool-stage__batch-action glitter-pool-stage__batch-action--delete", "", () => {
    actions.onDeleteSelection?.();
  });
  deleteAction.setAttribute("aria-label", options.controls.labels?.deleteSelectedIdeasLabel ?? DEFAULT_BROWSE_LABELS.deleteSelectedIdeasLabel);
  createPoolCardMenuIcon(deleteAction, "delete");

  const moveActionAnchor = createNode(
    batchPanel,
    "div",
    "glitter-pool-stage__batch-action-anchor glitter-pool-stage__batch-action-anchor--move"
  );
  const moveAction = createButton(moveActionAnchor, "glitter-pool-stage__batch-action glitter-pool-stage__batch-action--move", "", () => {
    actions.onBrowseOverlayToggle?.("batch");
  });
  moveAction.setAttribute("aria-label", options.controls.labels?.moveSelectedToPoolLabel ?? DEFAULT_BROWSE_LABELS.moveSelectedToPoolLabel);
  moveAction.setAttribute("aria-expanded", options.activeOverlay === "batch" ? "true" : "false");
  createPoolCardMenuIcon(moveAction, "move");

  if (options.activeOverlay === "batch") {
    renderBatchMoveMenu(moveActionAnchor, state, options.controls, actions);
  }
}

function clearBrowseResultsContent(results: HTMLElement, resultsHeader: HTMLElement): void {
  Array.from(results.children).forEach((child) => {
    if (child !== resultsHeader) {
      child.remove();
    }
  });
}

function bindRenderedBrowseResultsRuntime(
  containerEl: HTMLElement,
  stage: HTMLElement,
  results: HTMLElement,
  controls: RenderedBrowseControls
): void {
  const cardGridShell = results.querySelector(".glitter-pool-stage__card-grid-shell") as HTMLElement | null;
  const cardGrid = cardGridShell?.querySelector(".glitter-pool-stage__card-grid") as HTMLElement | null;
  const cardStack = cardGrid?.querySelector(".glitter-pool-stage__card-stack") as HTMLElement | null;
  const cardShells = cardStack
    ? Array.from(cardStack.querySelectorAll(".glitter-pool-stage__card-shell")) as HTMLElement[]
    : [];

  if (!cardGridShell || !cardGrid || !cardStack) {
    resetPoolCardIsolationState(containerEl);
    return;
  }

  bindPoolCardScrollVisibility(containerEl, cardGrid, cardGridShell);
  bindPoolCardMasonry(containerEl, cardGrid, cardStack, cardShells);

  if (!controls.batchMode) {
    bindPoolCardIsolation(containerEl, stage, cardShells);
    return;
  }

  disconnectPoolCardIsolation(containerEl);
  clearPoolCardIsolation(stage, cardShells);
  resetPoolCardIsolationState(containerEl);
}

// 浏览结果主体通过 scratch 渲染拿到完整结果区，再把卡片层、批量层和移动浮层回贴到当前舞台上，最后补挂滚动/瀑布流/隔离态运行时。
function renderBrowseResultsContent(
  containerEl: HTMLElement,
  stage: HTMLElement,
  results: HTMLElement,
  resultsHeader: HTMLElement,
  state: PoolViewState,
  actions: PoolViewActions
): void {
  const controls = readBrowseControls(state);

  disconnectPoolCardMasonry(containerEl);
  disconnectPoolCardIsolation(containerEl);
  disconnectPoolCardScrollVisibility(containerEl);
  clearBrowseResultsContent(results, resultsHeader);
  stage.querySelector(".glitter-pool-stage__card-move-overlay")?.remove();

  const ownerDocument = containerEl.ownerDocument ?? document;
  const scratchContainer = ownerDocument.createElement("div") as HTMLElement;
  renderPoolView(scratchContainer, state, actions);

  const scratchStage = scratchContainer.querySelector(".glitter-pool-stage") as HTMLElement | null;
  const scratchResults = scratchStage?.querySelector(".glitter-pool-stage__results") as HTMLElement | null;

  disconnectPoolCardMasonry(scratchContainer);
  disconnectPoolCardIsolation(scratchContainer);
  disconnectPoolCardScrollVisibility(scratchContainer);

  if (!scratchStage || !scratchResults) {
    return;
  }

  Array.from(scratchResults.children).forEach((child) => {
    if (child.className.includes("glitter-pool-stage__results-header")) {
      return;
    }

    results.appendChild(child);
  });

  const scratchMoveOverlay = scratchStage.querySelector(".glitter-pool-stage__card-move-overlay") as HTMLElement | null;
  if (scratchMoveOverlay) {
    stage.appendChild(scratchMoveOverlay);
  }

  bindRenderedBrowseResultsRuntime(containerEl, stage, results, controls);
}

function syncRenderedPoolCardBodyToggle(
  cardShell: HTMLElement,
  card: BrowseCard,
  onToggle: () => void,
  labels?: PoolBrowseLabelState
): void {
  const bodyEl = cardShell.querySelector(".glitter-pool-stage__card-body") as HTMLElement | null;
  if (bodyEl) {
    const parent = bodyEl.parentNode as HTMLElement | null;
    parent?.querySelector(".glitter-pool-stage__card-body-toggle-row")?.remove();
    if (parent) {
      attachCardBodyToggle(parent, bodyEl, card.bodyText ?? "", {
        maxLines: POOL_CARD_BODY_MAX_LINES,
        estimatedCharsPerLine: POOL_CARD_BODY_ESTIMATED_CHARS_PER_LINE,
        onToggle,
        labels
      });
    }
  }

  const mediaBodyEl = cardShell.querySelector(".glitter-pool-stage__card-media-body") as HTMLElement | null;
  if (mediaBodyEl) {
    const parent = mediaBodyEl.parentNode as HTMLElement | null;
    parent?.querySelector(".glitter-pool-stage__card-body-toggle-row")?.remove();
    if (parent) {
      attachCardBodyToggle(parent, mediaBodyEl, card.bodyText ?? "", {
        maxLines: POOL_CARD_MEDIA_BODY_MAX_LINES,
        estimatedCharsPerLine: POOL_CARD_MEDIA_BODY_ESTIMATED_CHARS_PER_LINE,
        onToggle,
        labels
      });
    }
  }
}

// 增量复用与整屏重绘并存：优先 patch 现有卡片壳，必要时再退回完整渲染。
function syncReusablePoolCardShell(
  cardShell: HTMLElement,
  card: BrowseCard,
  controls: RenderedBrowseControls,
  actions: PoolViewActions,
  onToggle: () => void,
  options: { activePoolId?: string; roamState?: PoolViewState["roam"]; labels?: PoolBrowseLabelState } = {}
): void {
  const surface = cardShell.querySelector(".glitter-pool-stage__card-surface") as HTMLElement | null;
  if (!surface) {
    return;
  }

  cardShell.dataset.ideaId = card.id;
  writePoolCardStructureSignature(cardShell, buildPoolCardStructureSignature(card));
  surface.className = buildPoolCardSurfaceClassName(card, controls);
  surface.dataset.itemId = card.id;
  surface.setAttribute("data-item-id", card.id);

  let menuShell = surface.querySelector(".glitter-pool-stage__card-menu-shell") as HTMLElement | null;
  if (!menuShell) {
    menuShell = createNode(surface, "div", "glitter-pool-stage__card-menu-shell");
  }

  renderPoolCardMenuShell(menuShell, card, actions, {
    batchMode: controls.batchMode,
    selected: card.selected,
    menuOpen: actions.isCardMenuOpen?.(card.id),
    movePickerOpen: actions.isCardMovePickerOpen?.(card.id),
    roamOpen: Boolean(options.roamState?.open),
    roamSourceActive: options.activePoolId
      ? hasVisibleRoamBridgeForCard(card, options.activePoolId, options.roamState)
      : false,
    labels: options.labels
  });
  syncRenderedPoolCardBodyToggle(cardShell, card, onToggle, options.labels);
  syncPoolCardMoreMenuMaxHeight(cardShell);
}

function patchRenderedBrowseWorkbench(containerEl: HTMLElement, state: PoolViewState, actions: PoolViewActions): boolean {
  if (state.mode !== "browse") {
    return false;
  }

  const stage = containerEl.querySelector(".glitter-pool-stage") as HTMLElement | null;
  const existingRoamPane = stage?.querySelector(".glitter-pool-stage__workbench-pane--roam") as HTMLElement | null;
  const topbar = stage?.querySelector(".glitter-pool-stage__topbar") as HTMLElement | null;
  const descriptionSlot = stage?.querySelector(".glitter-pool-stage__description-slot") as HTMLElement | null;
  const results = stage?.querySelector(".glitter-pool-stage__results") as HTMLElement | null;
  const resultsHeader = results?.querySelector(".glitter-pool-stage__results-header") as HTMLElement | null;
  const existingCardGridShell = results?.querySelector(".glitter-pool-stage__card-grid-shell") as HTMLElement | null;
  const existingCardGrid = existingCardGridShell?.querySelector(".glitter-pool-stage__card-grid") as HTMLElement | null;
  const existingCardStack = existingCardGrid?.querySelector(".glitter-pool-stage__card-stack") as HTMLElement | null;

  if (
    !stage ||
    stage.className.includes("glitter-pool-stage--first-use") ||
    !topbar ||
    !descriptionSlot ||
    !results ||
    !resultsHeader
  ) {
    return false;
  }

  const nextCards = state.browse?.cards ?? [];
  const existingCardShells = existingCardStack
    ? Array.from(existingCardStack.querySelectorAll(".glitter-pool-stage__card-shell")) as HTMLElement[]
    : [];
  const existingCardShellById = new Map(existingCardShells.map((cardShell) => [cardShell.dataset.ideaId ?? "", cardShell]));
  const canReuseAllCards = Boolean(existingCardGridShell && existingCardGrid && existingCardStack) && nextCards.length > 0
    ? nextCards.every((card) => {
        const cardShell = existingCardShellById.get(card.id);
        if (!cardShell) {
          return false;
        }

        return readPoolCardStructureSignature(cardShell) === buildPoolCardStructureSignature(card);
      })
    : false;

  const controls = readBrowseControls(state);
  const activeOverlay = state.browse?.activeOverlay ?? null;
  const activePool = resolveActivePoolOption(state);
  const roamState = state.roam;
  const roamAvailable = isPoolRoamAvailable(state);
  const roamOpen = Boolean(roamState?.open);
  if (roamOpen || existingRoamPane) {
    return false;
  }

  const previewState = state.preview;
  const previewAvailable = Boolean(previewState?.available);
  const previewOpen = Boolean(previewState?.available && previewState.open && !roamOpen);
  const isDefaultPool = state.pool.id === DEFAULT_POOL_ID;
  const canEditMetadata = (state.metadataEditable ?? true) && !isDefaultPool;
  const showPoolSwitcher = state.showPoolSwitcher ?? true;

  renderBrowseTopbar(topbar, state, actions, {
    activeOverlay,
    activePool,
    canEditMetadata,
    showPoolSwitcher,
    roamOpen
  });
  renderBrowseDescriptionSlot(descriptionSlot, state, actions, canEditMetadata);
  renderBrowseResultsHeader(resultsHeader, state, actions, {
    controls,
    activeOverlay,
    roamAvailable,
    roamOpen,
    previewAvailable,
    previewOpen
  });

  if (!canReuseAllCards || !existingCardGridShell || !existingCardGrid || !existingCardStack) {
    renderBrowseResultsContent(containerEl, stage, results, resultsHeader, state, actions);
    return true;
  }

  const existingSplitView = results.querySelector(".glitter-pool-stage__results-split-view") as HTMLElement | null;
  results.querySelectorAll(".glitter-pool-stage__batch-panel").forEach((node) => node.remove());
  stage.querySelectorAll(".glitter-pool-stage__roam-bridge-lane").forEach((node) => node.remove());

  let resultsContentHost: HTMLElement = results;
  if (previewOpen) {
    const splitView = existingSplitView ?? createNode(results, "div", "glitter-pool-stage__results-split-view");
    const cardsPane = (splitView.querySelector(".glitter-pool-stage__results-pane--cards") as HTMLElement | null)
      ?? createNode(splitView, "div", "glitter-pool-stage__results-pane glitter-pool-stage__results-pane--cards");
    if (existingCardGridShell.parentNode !== cardsPane) {
      cardsPane.appendChild(existingCardGridShell);
    }
    splitView.querySelector(".glitter-pool-stage__pool-markdown-preview")?.remove();
    renderPreviewPanel(splitView, state, actions);
    resultsContentHost = cardsPane;
  } else if (existingSplitView) {
    if (existingCardGridShell.parentNode !== results) {
      results.appendChild(existingCardGridShell);
    }
    existingSplitView.remove();
  }

  const nextCardIds = new Set(nextCards.map((card) => card.id));
  const removedActiveIsolationCard = existingCardShells.some((cardShell) => {
    const ideaId = cardShell.dataset.ideaId ?? "";
    return !nextCardIds.has(ideaId) && cardShell.className.includes("glitter-pool-stage__card-shell--isolation-active");
  });
  existingCardShells.forEach((cardShell) => {
    if (!nextCardIds.has(cardShell.dataset.ideaId ?? "")) {
      cardShell.remove();
    }
  });
  if (removedActiveIsolationCard) {
    resetPoolCardIsolationState(containerEl);
    clearPoolCardIsolation(stage, existingCardShells);
  }

  const refreshReusableCardMasonry = (): void => {
    const currentCardShells = Array.from(existingCardStack.querySelectorAll(".glitter-pool-stage__card-shell")) as HTMLElement[];
    applyPoolCardMasonry(existingCardGrid, existingCardStack, currentCardShells);
  };

  const reusableCardShells: HTMLElement[] = [];
  nextCards.forEach((card) => {
    const cardShell = existingCardShellById.get(card.id);
    if (!cardShell) {
      return;
    }
    existingCardStack.appendChild(cardShell);
    syncReusablePoolCardShell(cardShell, card, controls, actions, refreshReusableCardMasonry, {
      activePoolId: state.pool.id,
      roamState,
      labels: controls.labels
    });
    reusableCardShells.push(cardShell);
  });

  bindPoolCardScrollVisibility(containerEl, existingCardGrid, existingCardGridShell);
  bindPoolCardMasonry(containerEl, existingCardGrid, existingCardStack, reusableCardShells);

  if (!controls.batchMode) {
    bindPoolCardIsolation(containerEl, stage, reusableCardShells);
  } else {
    disconnectPoolCardIsolation(containerEl);
    clearPoolCardIsolation(stage, reusableCardShells);
    resetPoolCardIsolationState(containerEl);
  }

  const workbench = stage.querySelector(".glitter-pool-stage__workbench") as HTMLElement | null;
  renderRoamBridgeLane(roamOpen && workbench ? workbench : resultsContentHost, state, actions);

  if (controls.batchMode) {
    renderBrowseBatchPanel(resultsContentHost, state, actions, {
      controls,
      activeOverlay
    });
  }

  stage.querySelector(".glitter-pool-stage__card-move-overlay")?.remove();
  const activeMoveCard = nextCards.find((card) => actions.isCardMovePickerOpen?.(card.id) ?? false);
  if (activeMoveCard) {
    renderCardMoveDialogOverlay(stage, activeMoveCard, state, actions);
  }

  return true;
}

function renderBrowseWorkbench(containerEl: HTMLElement, stage: HTMLElement, state: PoolViewState, actions: PoolViewActions): void {
  const controls = readBrowseControls(state);

  const activeOverlay = state.browse?.activeOverlay ?? null;
  const activePool = resolveActivePoolOption(state);
  const roamState = state.roam;
  const roamAvailable = isPoolRoamAvailable(state);
  const roamOpen = Boolean(roamState?.open);
  const previewState = state.preview;
  const previewAvailable = Boolean(previewState?.available);
  const previewOpen = Boolean(previewState?.available && previewState.open && !roamOpen);
  const isDefaultPool = state.pool.id === DEFAULT_POOL_ID;
  const canEditMetadata = (state.metadataEditable ?? true) && !isDefaultPool;
  const showPoolSwitcher = state.showPoolSwitcher ?? true;

  const labels = controls.labels ?? DEFAULT_BROWSE_LABELS;
  const workbench = createNode(
    stage,
    "div",
    roamOpen
      ? "glitter-pool-stage__workbench glitter-pool-stage__workbench--roam"
      : "glitter-pool-stage__workbench"
  );
  if (roamOpen) {
    applyPoolRoamWorkbenchLayout(workbench, roamState?.panelWidthRatio);
  }

  const poolPane = createNode(
    workbench,
    "div",
    "glitter-pool-stage__workbench-pane glitter-pool-stage__workbench-pane--pool"
  );
  const topbar = createNode(poolPane, "header", "glitter-pool-stage__topbar");
  renderBrowseTopbar(topbar, state, actions, {
    activeOverlay,
    activePool,
    canEditMetadata,
    showPoolSwitcher,
    roamOpen
  });

  const descriptionSlot = createNode(poolPane, "div", "glitter-pool-stage__description-slot");
  renderBrowseDescriptionSlot(descriptionSlot, state, actions, canEditMetadata);

  const results = createNode(poolPane, "section", "glitter-pool-stage__results");

  const resultsHeader = createNode(results, "div", "glitter-pool-stage__results-header");
  renderBrowseResultsHeader(resultsHeader, state, actions, {
    controls,
    activeOverlay,
    roamAvailable,
    roamOpen,
    previewAvailable,
    previewOpen
  });

  if (roamOpen) {
    const roamPane = createNode(
      workbench,
      "aside",
      "glitter-pool-stage__workbench-pane glitter-pool-stage__workbench-pane--roam"
    );
    renderRoamPanel(roamPane, stage, state, actions);

    const roamDivider = createNode(workbench, "div", "glitter-pool-stage__roam-divider");
    roamDivider.setAttribute("role", "separator");
    roamDivider.setAttribute("aria-label", resolveBrowseLabels(state).resizeRoamAreaLabel);
    roamDivider.setAttribute("aria-orientation", "vertical");
    createNode(roamDivider, "span", "glitter-pool-stage__roam-divider-line");
    applyPoolRoamWorkbenchLayout(workbench, roamState?.panelWidthRatio);
  }

  let resultsContentHost = results;
  if (previewOpen) {
    const splitView = createNode(results, "div", "glitter-pool-stage__results-split-view");
    resultsContentHost = createNode(splitView, "div", "glitter-pool-stage__results-pane glitter-pool-stage__results-pane--cards");
    renderPreviewPanel(splitView, state, actions);
  }

  if (state.mode === "empty") {
    resetPoolCardIsolationState(containerEl);
    renderPoolEmptyState(resultsContentHost, {
      title: state.emptyState?.title ?? resolveBrowseLabels(state).emptyPoolTitle,
      description: state.emptyState?.description ?? resolveBrowseLabels(state).emptyPoolDescription
    });
    return;
  }

  const browseCards = state.browse?.cards ?? [];
  if (browseCards.length === 0) {
    resetPoolCardIsolationState(containerEl);
    renderPoolEmptyState(resultsContentHost, {
      eyebrow: resolveBrowseLabels(state).filterResultEyebrow,
      title: resolveBrowseLabels(state).noFilterResultsTitle,
      description: resolveBrowseLabels(state).noFilterResultsDescription
    });
    return;
  }

  const cardGridShell = createNode(resultsContentHost, "div", "glitter-pool-stage__card-grid-shell");
  const cardGrid = createNode(cardGridShell, "div", "glitter-pool-stage__card-grid");
  bindPoolCardScrollVisibility(containerEl, cardGrid, cardGridShell);
  const cardStack = createNode(cardGrid, "div", "glitter-pool-stage__card-stack");
  const cardShells: HTMLElement[] = [];
  const refreshCardMasonry = (): void => {
    const currentCardShells = Array.from(cardStack.querySelectorAll(".glitter-pool-stage__card-shell")) as HTMLElement[];
    applyPoolCardMasonry(cardGrid, cardStack, currentCardShells);
  };
  browseCards.forEach((card) => {
    const cardClassName = buildPoolCardSurfaceClassName(card, controls);
    const cardNode = createNode(cardStack, "article", "glitter-pool-stage__card-shell");
    cardNode.dataset.ideaId = card.id;
    writePoolCardStructureSignature(cardNode, buildPoolCardStructureSignature(card));
    cardShells.push(cardNode);

    const isMenuOpen = actions.isCardMenuOpen?.(card.id) ?? false;
    const isMovePickerOpen = actions.isCardMovePickerOpen?.(card.id) ?? false;

    const surface = createNode(cardNode, "div", cardClassName);
    const menuShell = createNode(surface, "div", "glitter-pool-stage__card-menu-shell");

    renderPoolCardMenuShell(menuShell, card, actions, {
      batchMode: controls.batchMode,
      selected: card.selected,
      menuOpen: isMenuOpen,
      movePickerOpen: isMovePickerOpen,
      roamOpen,
      roamSourceActive: hasVisibleRoamBridgeForCard(card, state.pool.id, roamState),
      labels: controls.labels
    });
    surface.dataset.itemId = card.id;
    surface.setAttribute("data-item-id", card.id);

    const header = createNode(surface, "div", "glitter-pool-stage__card-header");
    createPoolCardTypeIcon(header, card.typeIcon, { accent: card.fileCreated });

    const content = createNode(
      surface,
      "div",
      `glitter-pool-stage__card-content glitter-pool-stage__card-content--${card.contentKind}`
    );
    renderPoolRoamSourceHandle(content, card, stage, actions, {
      roamOpen,
      roamSourceActive: hasVisibleRoamBridgeForCard(card, state.pool.id, roamState),
      labels: roamState?.labels
    });
    const footer = createNode(surface, "div", `glitter-pool-stage__card-footer glitter-pool-stage__card-footer--${card.contentKind}`);
    let supporting: HTMLElement | null = null;
    const ensureSupporting = (): HTMLElement => {
      if (supporting) {
        return supporting;
      }

      supporting = createNode(
        footer,
        "div",
        `glitter-pool-stage__card-supporting glitter-pool-stage__card-supporting--${card.contentKind}`
      );
      return supporting;
    };
    const createCardTitle = (parent: HTMLElement, className = "glitter-pool-stage__card-title"): HTMLElement =>
      createNode(parent, "strong", className, card.title);
    const formatCardLinkLabel = (value: string): string => {
      const trimmedValue = value.trim();
      if (!trimmedValue) {
        return "";
      }

      try {
        return decodeURI(trimmedValue);
      } catch {
        return trimmedValue;
      }
    };
    const resolveCardLinkLabel = (): string => {
      const displayText = card.linkDisplayText?.trim();
      const rawUrl = card.linkUrl?.trim();
      if (!rawUrl) {
        return displayText ?? "";
      }

      return formatCardLinkLabel(rawUrl);
    };

    if (card.contentKind === "text") {
      createCardTitle(content);
      const bodyText = card.bodyText ?? "";
      const body = createNode(content, "p", "glitter-pool-stage__card-body", bodyText);
      attachCardBodyToggle(content, body, bodyText, {
        maxLines: POOL_CARD_BODY_MAX_LINES,
        estimatedCharsPerLine: POOL_CARD_BODY_ESTIMATED_CHARS_PER_LINE,
        onToggle: refreshCardMasonry,
        labels: controls.labels
      });
    } else if (card.contentKind === "link") {
      createCardTitle(content);
      const bodyText = card.bodyText ?? "";
      const hasBodyText = Boolean(bodyText.trim());

      if (hasBodyText) {
        const body = createNode(content, "p", "glitter-pool-stage__card-body", bodyText);
        attachCardBodyToggle(content, body, bodyText, {
          maxLines: POOL_CARD_BODY_MAX_LINES,
          estimatedCharsPerLine: POOL_CARD_BODY_ESTIMATED_CHARS_PER_LINE,
          onToggle: refreshCardMasonry
        });
      }

      const linkParent = ensureSupporting();
      const linkBlock = card.linkUrl
        ? createAnchor(linkParent, "glitter-pool-stage__card-link-block", card.linkUrl)
        : createNode(linkParent, "div", "glitter-pool-stage__card-link-block");
      if (card.linkUrl) {
        linkBlock.setAttribute("title", card.linkUrl);
      }
      createNode(linkBlock, "span", "glitter-pool-stage__card-link-domain", resolveCardLinkLabel());
    } else if (card.contentKind === "image" || card.contentKind === "video") {
      const imageThumbnailUrls = card.contentKind === "image"
        ? (Array.isArray(card.mediaThumbnailUrls) && card.mediaThumbnailUrls.length > 0
            ? [...card.mediaThumbnailUrls]
            : card.mediaThumbnailUrl
              ? [card.mediaThumbnailUrl]
              : [])
        : [];
      const hasMultipleImageThumbnails = imageThumbnailUrls.length > 1;
      let currentImageIndex = 0;
      const resolveCurrentImageUrl = (): string | undefined => imageThumbnailUrls[currentImageIndex] ?? card.mediaThumbnailUrl;
      const resolveCurrentImagePositionLabel = (): string => controls.labels?.cardImagePositionLabel(currentImageIndex + 1, imageThumbnailUrls.length)
        ?? DEFAULT_BROWSE_LABELS.cardImagePositionLabel(currentImageIndex + 1, imageThumbnailUrls.length);
      const resolveCurrentImageLiveAnnouncement = (): string => (controls.labels ?? DEFAULT_BROWSE_LABELS).cardCurrentImageAnnouncement(resolveCurrentImagePositionLabel());
      const resolveCurrentImagePreviewLabel = (): string => hasMultipleImageThumbnails
        ? (controls.labels ?? DEFAULT_BROWSE_LABELS).cardViewLargeImageWithPositionLabel(card.title, resolveCurrentImagePositionLabel())
        : (controls.labels ?? DEFAULT_BROWSE_LABELS).cardViewLargeImageLabel(card.title);
      const resolveCurrentImageThumbnailAlt = (): string => hasMultipleImageThumbnails
        ? (controls.labels ?? DEFAULT_BROWSE_LABELS).cardImageThumbnailAltWithPosition(card.title, resolveCurrentImagePositionLabel())
        : card.title;
      const previewSrc = card.contentKind === "image" ? resolveCurrentImageUrl() : card.mediaThumbnailUrl;
      let openPreview: (() => void) | undefined;
      if (card.mediaPath) {
        content.dataset.mediaPath = card.mediaPath;
      }
      if (previewSrc) {
        setClassToken(content, "glitter-pool-stage__card-content--interactive", true);
        openPreview = (): void => {
          const currentPreviewSrc = card.contentKind === "image" ? resolveCurrentImageUrl() : card.mediaThumbnailUrl;
          if (!currentPreviewSrc) {
            return;
          }

          const currentStage = findClosestPoolStage(content, stage);
          if (card.contentKind === "image") {
            openPoolMediaPreviewOverlay(currentStage, {
              src: currentPreviewSrc,
              title: card.title,
              kind: "image",
              imageSources: imageThumbnailUrls,
              initialIndex: currentImageIndex,
              labels: controls.labels ?? DEFAULT_BROWSE_LABELS
            });
            return;
          }

          openPoolMediaPreviewOverlay(currentStage, {
            src: currentPreviewSrc,
            title: card.title,
            kind: "video",
            labels: controls.labels ?? DEFAULT_BROWSE_LABELS
          });
        };
      }
      if (card.contentKind === "image" && previewSrc) {
        const mediaStage = createNode(content, "div", "glitter-pool-stage__card-media-stage glitter-pool-stage__card-media-stage--image");
        const mediaClip = createNode(mediaStage, "div", "glitter-pool-stage__card-media-clip");
        const mediaPreviewButton = openPreview
          ? createMediaPreviewButton(mediaClip, resolveCurrentImagePreviewLabel(), openPreview)
          : undefined;
        const thumbnailHost = mediaPreviewButton ?? mediaClip;
        const thumbnail = createNode(thumbnailHost, "img", "glitter-pool-stage__card-media-thumbnail") as HTMLImageElement;
        let pagination: HTMLElement | undefined;
        let liveAnnouncement: HTMLElement | undefined;
        const syncImageThumbnailState = (): void => {
          const currentImageUrl = resolveCurrentImageUrl();
          if (!currentImageUrl) {
            return;
          }

          thumbnail.src = currentImageUrl;
          thumbnail.alt = resolveCurrentImageThumbnailAlt();
          mediaPreviewButton?.setAttribute("aria-label", resolveCurrentImagePreviewLabel());
          if (pagination) {
            pagination.textContent = `${currentImageIndex + 1} / ${imageThumbnailUrls.length}`;
          }
        };
        const updateImageIndex = (nextIndex: number): void => {
          currentImageIndex = nextIndex;
          syncImageThumbnailState();
          if (liveAnnouncement) {
            liveAnnouncement.textContent = resolveCurrentImageLiveAnnouncement();
          }
        };

        thumbnail.loading = "lazy";
        syncImageThumbnailState();

        if (hasMultipleImageThumbnails) {
          const switcher = createNode(mediaClip, "div", "glitter-pool-stage__card-media-switcher");
          const previousButton = createButton(switcher, "glitter-pool-stage__card-media-switch glitter-pool-stage__card-media-switch--previous", "", () => {
            updateImageIndex((currentImageIndex - 1 + imageThumbnailUrls.length) % imageThumbnailUrls.length);
          });
          previousButton.setAttribute("aria-label", (controls.labels ?? DEFAULT_BROWSE_LABELS).cardPreviousImageLabel);
          createNode(previousButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--chevron-left");

          pagination = createNode(switcher, "span", "glitter-pool-stage__card-media-pagination", `1 / ${imageThumbnailUrls.length}`);
          liveAnnouncement = createNode(
            switcher,
            "span",
            "glitter-pool-stage__card-media-live-announcement glitter-home-stage__visually-hidden",
            ""
          );
          liveAnnouncement.setAttribute("aria-live", "polite");
          liveAnnouncement.setAttribute("aria-atomic", "true");
          syncImageThumbnailState();

          const nextButton = createButton(switcher, "glitter-pool-stage__card-media-switch glitter-pool-stage__card-media-switch--next", "", () => {
            updateImageIndex((currentImageIndex + 1) % imageThumbnailUrls.length);
          });
          nextButton.setAttribute("aria-label", (controls.labels ?? DEFAULT_BROWSE_LABELS).cardNextImageLabel);
          createNode(nextButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--chevron-right");
        }
      } else if (card.mediaThumbnailUrl && card.contentKind === "video") {
        const mediaStage = createNode(content, "div", "glitter-pool-stage__card-media-stage glitter-pool-stage__card-media-stage--video");
        const mediaClip = createNode(mediaStage, "div", "glitter-pool-stage__card-media-clip");
        const mediaPreviewButton = openPreview
          ? createMediaPreviewButton(mediaClip, (controls.labels ?? DEFAULT_BROWSE_LABELS).cardViewLargeVideoLabel(card.title), openPreview)
          : undefined;
        const thumbnailHost = mediaPreviewButton ?? mediaClip;
        const thumbnail = createNode(thumbnailHost, "video", "glitter-pool-stage__card-media-thumbnail") as HTMLVideoElement;
        thumbnail.setAttribute("src", card.mediaThumbnailUrl);
        thumbnail.setAttribute("muted", "");
        thumbnail.setAttribute("playsinline", "");
        thumbnail.setAttribute("autoplay", "");
        thumbnail.setAttribute("loop", "");
        thumbnail.muted = true;
        thumbnail.playsInline = true;
        thumbnail.autoplay = true;
        thumbnail.loop = true;
        thumbnail.preload = "metadata";
        if (!mediaPreviewButton) {
          thumbnail.setAttribute("aria-label", (controls.labels ?? DEFAULT_BROWSE_LABELS).cardVideoPreviewLabel(card.title));
        }
      }
      createCardTitle(content);
      if (card.bodyText?.trim()) {
        const mediaBody = createNode(content, "p", "glitter-pool-stage__card-media-body", card.bodyText);
        attachCardBodyToggle(content, mediaBody, card.bodyText, {
          maxLines: POOL_CARD_MEDIA_BODY_MAX_LINES,
          estimatedCharsPerLine: POOL_CARD_MEDIA_BODY_ESTIMATED_CHARS_PER_LINE,
          onToggle: refreshCardMasonry
        });
      }
    } else {
      createCardTitle(content);
      createNode(content, "span", "glitter-pool-stage__card-empty", (controls.labels ?? DEFAULT_BROWSE_LABELS).cardEmptyFallback);
    }

    const meta = createNode(footer, "div", "glitter-pool-stage__card-time");
    createNode(meta, "span", "glitter-pool-stage__card-time-label", card.updatedLabel);
    (card.statusLabels ?? []).forEach((label) => {
      createNode(meta, "span", "glitter-pool-stage__card-reference", label);
    });

    syncPoolCardMoreMenuMaxHeight(cardNode);
  });

  bindPoolCardMasonry(containerEl, cardGrid, cardStack, cardShells);

  if (!controls.batchMode) {
    bindPoolCardIsolation(containerEl, stage, cardShells);
  } else {
    disconnectPoolCardIsolation(containerEl);
    clearPoolCardIsolation(stage, cardShells);
    resetPoolCardIsolationState(containerEl);
  }

  renderRoamBridgeLane(roamOpen ? workbench : resultsContentHost, state, actions);
  if (roamOpen) {
    bindPoolRoamPaneResize(workbench, actions, roamState?.panelWidthRatio);
  }

  if (controls.batchMode) {
    const batchPanel = createNode(resultsContentHost, "div", "glitter-pool-stage__batch-panel");
    createNode(batchPanel, "div", "glitter-pool-stage__batch-summary", `${controls.selectedCount}/${state.pool.itemCount}`);

    const deleteAction = createButton(batchPanel, "glitter-pool-stage__batch-action glitter-pool-stage__batch-action--delete", "", () => {
      actions.onDeleteSelection?.();
    });
    deleteAction.setAttribute("aria-label", controls.labels?.deleteSelectedIdeasLabel ?? DEFAULT_BROWSE_LABELS.deleteSelectedIdeasLabel);
    createPoolCardMenuIcon(deleteAction, "delete");

    const moveActionAnchor = createNode(
      batchPanel,
      "div",
      "glitter-pool-stage__batch-action-anchor glitter-pool-stage__batch-action-anchor--move"
    );
    const moveAction = createButton(moveActionAnchor, "glitter-pool-stage__batch-action glitter-pool-stage__batch-action--move", "", () => {
      actions.onBrowseOverlayToggle?.("batch");
    });
    moveAction.setAttribute("aria-label", controls.labels?.moveSelectedToPoolLabel ?? DEFAULT_BROWSE_LABELS.moveSelectedToPoolLabel);
    moveAction.setAttribute("aria-expanded", activeOverlay === "batch" ? "true" : "false");
    createPoolCardMenuIcon(moveAction, "move");

    if (activeOverlay === "batch") {
      const menu = createNode(
        moveActionAnchor,
        "div",
        "glitter-pool-stage__toolbar-menu glitter-pool-stage__toolbar-menu--batch"
      );
      createNode(menu, "strong", "glitter-pool-stage__toolbar-menu-title", labels.moveToLabel);
      renderMoveTargetButtons(menu, state.poolOptions, {
        disabled: !controls.hasSelection,
        labels,
        onSelect(poolId) {
          actions.onMoveSelectionToPool?.(poolId);
        }
      });
      const createPoolButton = createButton(menu, "glitter-pool-stage__toolbar-menu-create", "", () => {
        actions.onMoveSelectionToPool?.(CREATE_NEW_POOL_ID);
      });
      createPoolButton.disabled = !controls.hasSelection;
      createPoolButton.setAttribute("aria-label", labels.newPoolLabel);
      createNode(createPoolButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--plus");
    }
  }

  if (state.roamBackConfirmVisible) {
    renderPoolRoamBackConfirm(stage, state, actions);
  }

  const activeMoveCard = browseCards.find((card) => actions.isCardMovePickerOpen?.(card.id) ?? false);
  if (activeMoveCard) {
    renderCardMoveDialogOverlay(stage, activeMoveCard, state, actions);
  }

}

// 池页面总入口：把状态模型翻译成最终 DOM，并在渲染后补挂瀑布流、隔离态和菜单同步。
export function renderPoolView(
  containerEl: HTMLElement,
  state: PoolViewState,
  actions: PoolViewActions
): void {
  if (patchRenderedBrowseWorkbench(containerEl, state, actions)) {
    return;
  }

  disconnectPoolCardMasonry(containerEl);
  disconnectPoolCardIsolation(containerEl);
  disconnectPoolCardScrollVisibility(containerEl);
  disconnectPoolRoamBridgeLayoutSyncWithin(containerEl);
  disconnectPoolRoamPaneResizeWithin(containerEl);
  clearContainer(containerEl);

  const isFirstUseMode = state.mode === "first-use-choose" || state.mode === "first-use-create";
  const stageClassName = isFirstUseMode
    ? `glitter-plugin-root glitter-pool-stage glitter-pool-stage--first-use glitter-pool-stage--${state.mode}`
    : "glitter-plugin-root glitter-pool-stage";

  const stage = createNode(containerEl, "section", stageClassName);

  if (isFirstUseMode) {
    resetPoolCardIsolationState(containerEl);
    const surface = createNode(stage, "div", "glitter-pool-stage__first-use-surface");
    const header = createNode(surface, "header", "glitter-pool-stage__header glitter-write-stage__modal-header");

    if (state.mode === "first-use-create") {
      const createForm = state.createForm;
      const title = createForm?.title ?? state.pool.title;
      const createdPoolId = createForm?.createdPoolId ?? NEW_POOL_CREATED_ID;
      const createdPoolLabel = createForm?.createdPoolLabel ?? NEW_POOL_CREATED_LABEL;

      const headerText = createNode(header, "div", "glitter-pool-stage__header-copy");
      createNode(headerText, "h2", "glitter-pool-stage__title", title);

      const closeButton = createButton(
        header,
        "glitter-write-stage__close-button glitter-pool-stage__create-close",
        "",
        () => {
          if (actions.onClose) {
            actions.onClose();
            return;
          }
          actions.onBack();
        }
      );
      closeButton.setAttribute("aria-label", createForm?.closeLabel ?? "Close new pool window");
      createNode(closeButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--close");

      const form = createNode(surface, "div", "glitter-pool-stage__create-form");

      const nameField = createNode(form, "div", "glitter-pool-stage__field");
      createNode(nameField, "label", "glitter-pool-stage__field-label", createForm?.nameLabel ?? "Pool name");
      const nameInput = createNode(nameField, "input", "glitter-pool-stage__field-input glitter-write-stage__input") as HTMLInputElement;
      nameInput.type = "text";
      nameInput.placeholder = createForm?.namePlaceholder ?? "For example: Product pool / Writing pool / Research pool";
      nameInput.value = createdPoolLabel;

      const descriptionField = createNode(form, "div", "glitter-pool-stage__field");
      createNode(
        descriptionField,
        "label",
        "glitter-pool-stage__field-label",
        createForm?.descriptionLabel ?? "Pool description"
      );
      const descriptionPanel = createNode(
        descriptionField,
        "div",
        "glitter-pool-stage__field-body-panel glitter-write-stage__body-panel"
      );
      const descriptionInput = createNode(
        descriptionPanel,
        "textarea",
        "glitter-write-stage__body-editor glitter-pool-stage__field-input--textarea glitter-write-stage__textarea glitter-write-stage__textarea--panel-blend"
      ) as HTMLTextAreaElement;
      descriptionInput.placeholder =
        createForm?.descriptionPlaceholder ?? "Describe this pool's focus and use case to make later filtering and organization easier.";

      const colorField = createNode(form, "div", "glitter-pool-stage__field");
      createNode(colorField, "label", "glitter-pool-stage__field-label", createForm?.colorLabel ?? "Pool color");
      const swatches = createNode(colorField, "div", "glitter-pool-stage__swatches");
      const colorOptions = createForm?.colorOptions ?? [];
      const syncSelectedSwatch = (selectedColor: string): void => {
        swatches.dataset.selectedPoolColor = selectedColor;
        swatches.querySelectorAll<HTMLElement>(".glitter-pool-stage__swatch").forEach((node) => {
          node.className =
            node.dataset.poolColor === selectedColor
              ? "glitter-pool-stage__swatch glitter-pool-stage__swatch--selected"
              : "glitter-pool-stage__swatch";
        });
      };

      if (colorOptions[0]) {
        swatches.dataset.selectedPoolColor = colorOptions[0];
      }

      colorOptions.forEach((color, index) => {
        const swatchClass =
          index === 0
            ? "glitter-pool-stage__swatch glitter-pool-stage__swatch--selected"
            : "glitter-pool-stage__swatch";
        const swatch = createNode(swatches, "button", swatchClass) as HTMLButtonElement;
        swatch.type = "button";
        setInlineStyle(swatch, "background", color);
        swatch.dataset.poolColor = color;
        swatch.addEventListener("click", () => {
          syncSelectedSwatch(color);
        });
      });

      const tip = createNode(form, "div", "glitter-pool-stage__first-use-tip glitter-write-stage__success-summary");
      createNode(
        tip,
        "p",
        "glitter-pool-stage__first-use-tip-body",
        createForm?.tipText ?? "After creation, Glitter will move the current idea into this pool and show first-assignment feedback on the home page."
      );

      const footer = createNode(surface, "footer", "glitter-pool-stage__first-use-footer glitter-write-stage__quick-actions");
      const confirmButton = createButton(
        footer,
        "glitter-write-stage__action-primary glitter-write-stage__action-primary--with-icon glitter-write-stage__action-primary--capture-submit glitter-pool-stage__create-submit",
        "",
        () => actions.onItemSelect(createdPoolId)
      );
      confirmButton.dataset.itemId = createdPoolId;
      createNode(confirmButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--save");
      createNode(confirmButton, "span", "glitter-write-stage__action-primary-text", createForm?.confirmLabel ?? "Create pool");

      return;
    }

    const headerText = createNode(header, "div", "glitter-pool-stage__header-copy");
    createNode(headerText, "h2", "glitter-pool-stage__title", state.pool.title);

    const closeButton = createButton(
      header,
      "glitter-write-stage__close-button glitter-pool-stage__create-close",
      "",
      () => {
        if (actions.onClose) {
          actions.onClose();
          return;
        }
        actions.onBack();
      }
    );
    closeButton.setAttribute("aria-label", state.choice?.closeLabel ?? "Close pool assignment window");
    createNode(closeButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--close");

    createNode(surface, "p", "glitter-pool-stage__first-use-lead", state.header.hint);

    const choice = createNode(surface, "div", "glitter-pool-stage__choice glitter-pool-stage__choice--choose");
    const options = state.choice?.options ?? [];
    let selectedOptionId = options[0]?.id ?? "";
    const optionCards: Array<{
      id: string;
      card: HTMLButtonElement;
    }> = [];

    const footer = createNode(surface, "footer", "glitter-pool-stage__first-use-actions");
    const backAction = createButton(
      footer,
      "glitter-write-stage__action-secondary glitter-pool-stage__first-use-back-action",
      state.choice?.backLabel ?? "Back",
      () => actions.onBack()
    );
    backAction.dataset.role = "first-use-back";

    const continueButton = createButton(
      footer,
      "glitter-write-stage__action-primary glitter-pool-stage__first-use-continue",
      "",
      () => {
        if (!selectedOptionId) {
          return;
        }
        actions.onItemSelect(selectedOptionId);
      }
    );
    createNode(continueButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--enter-pool");
    createNode(continueButton, "span", "glitter-pool-stage__first-use-continue-text", state.choice?.continueLabel ?? "Continue");

    const resolveFirstUseOptionClassName = (optionId: string, selected: boolean): string => {
      const variantClass =
        optionId === CREATE_NEW_POOL_ID
          ? "glitter-pool-stage__choice-option--recommended"
          : "glitter-pool-stage__choice-option--default";

      return [
        "glitter-pool-stage__choice-option",
        "glitter-pool-stage__choice-option--first-use",
        variantClass,
        selected ? "glitter-pool-stage__choice-option--selected" : ""
      ]
        .filter(Boolean)
        .join(" ");
    };

    const syncSelectedOption = (): void => {
      optionCards.forEach(({ id, card }) => {
        const selected = id === selectedOptionId;
        card.className = resolveFirstUseOptionClassName(id, selected);
        card.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      continueButton.disabled = !selectedOptionId;
    };

    options.forEach((option) => {
      const optionCard = createNode(
        choice,
        "button",
        resolveFirstUseOptionClassName(option.id, option.id === selectedOptionId)
      ) as HTMLButtonElement;
      optionCard.type = "button";
      optionCard.dataset.itemId = option.id;
      optionCard.addEventListener("click", () => {
        selectedOptionId = option.id;
        syncSelectedOption();
      });

      const optionCopy = createNode(optionCard, "div", "glitter-pool-stage__choice-copy glitter-pool-stage__first-use-option-copy");
      createNode(
        optionCopy,
        "strong",
        "glitter-pool-stage__choice-label glitter-pool-stage__choice-label--first-use glitter-pool-stage__first-use-option-title",
        option.label
      );
      createNode(
        optionCopy,
        "p",
        "glitter-pool-stage__choice-description glitter-pool-stage__choice-description--first-use glitter-pool-stage__first-use-option-description",
        option.description
      );

      optionCards.push({ id: option.id, card: optionCard });
    });

    syncSelectedOption();
    return;
  }

  if (state.mode === "browse" || state.mode === "empty") {
    renderBrowseWorkbench(containerEl, stage, state, actions);
    return;
  }

}
