import { CREATE_NEW_POOL_ID, NEW_POOL_CREATED_ID, NEW_POOL_CREATED_LABEL } from "../../plugin/constants";
import type { PoolBrowseOverlay, PoolViewState } from "./pool-state";
import {
  clearPoolContainer,
  createPoolButton,
  createPoolNode,
  setPoolClassToken,
  setPoolInlineStyle
} from "./pool-dom";
import {
  disconnectPoolCardIsolation,
  disconnectPoolCardMasonry,
  disconnectPoolCardScrollVisibility,
  resetPoolCardIsolationState,
  syncRenderedPoolCardMenus as syncRenderedPoolCardMenusRuntime
} from "./pool-card-runtime";
import {
  disconnectPoolRoamBridgeLayoutSyncWithin,
  disconnectPoolRoamPaneResizeWithin
} from "./pool-roam-bridge-runtime";
import { createPoolBrowseWorkbenchRuntime } from "./pool-browse-workbench";

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

type BrowseCard = NonNullable<NonNullable<PoolViewState["browse"]>["cards"]>[number];

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
    ?? createPoolNode(stage, "div", "glitter-pool-stage__roam-source-drag-line");
  previewLine.setAttribute("aria-hidden", "true");

  const startX = sourceHandleRect.left - stageRect.left + sourceHandleRect.width / 2;
  const startY = sourceHandleRect.top - stageRect.top + sourceHandleRect.height / 2;
  const endX = typeof pointer?.clientX === "number" ? pointer.clientX - stageRect.left : startX + 56;
  const endY = typeof pointer?.clientY === "number" ? pointer.clientY - stageRect.top : startY;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.max(12, Math.hypot(deltaX, deltaY));
  const angle = Math.atan2(deltaY, deltaX);

  setPoolInlineStyle(previewLine, "left", `${startX}px`);
  setPoolInlineStyle(previewLine, "top", `${startY}px`);
  setPoolInlineStyle(previewLine, "width", `${length}px`);
  setPoolInlineStyle(previewLine, "transform", `translateY(-50%) rotate(${angle}rad)`);
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
    setPoolClassToken(previousSourceHandle, "glitter-pool-stage__roam-source-handle--dragging", false);
  }
  if (previousSourceContent && previousSourceContent !== input?.sourceContent) {
    setPoolClassToken(previousSourceContent, "glitter-pool-stage__card-content--roam-source-dragging", false);
  }
  if (previousCleanup && previousCleanup !== input?.cleanup) {
    previousCleanup();
  }

  const nextSourceHandle = input?.sourceHandle ?? null;
  const nextSourceContent = input?.sourceContent ?? null;
  setPoolClassToken(nextSourceHandle ?? stage, "glitter-pool-stage__roam-source-handle--dragging", Boolean(nextSourceHandle));
  setPoolClassToken(nextSourceContent ?? stage, "glitter-pool-stage__card-content--roam-source-dragging", Boolean(nextSourceContent));

  stageWithDragState[POOL_ROAM_DRAGGING_SOURCE_HANDLE_KEY] = nextSourceHandle;
  stageWithDragState[POOL_ROAM_DRAGGING_SOURCE_CONTENT_KEY] = nextSourceContent;
  stageWithDragState[POOL_ROAM_DRAGGING_CLEANUP_KEY] = input?.cleanup;
}

function clearPoolRoamSourceDragPreview(stage: HTMLElement): void {
  syncPoolRoamSourceDragPreview(stage);
  stage.querySelector(POOL_ROAM_DRAG_LINE_SELECTOR)?.remove();
}
function renderRoamPanel(parent: HTMLElement, stage: HTMLElement, state: PoolViewState, actions: PoolViewActions): void {
  const roamState = state.roam;
  const roamLabels = roamState?.labels;
  const roamPanel = createPoolNode(parent, "aside", "glitter-pool-stage__roam-panel");
  const roamCanvasStage = createPoolNode(roamPanel, "div", "glitter-pool-stage__roam-canvas-stage");
  roamCanvasStage.setAttribute("data-glitter-pool-roam-dropzone", "true");

  const setDropTargetActive = (active: boolean): void => {
    setPoolClassToken(roamCanvasStage, "glitter-pool-stage__roam-canvas-stage--drag-over", active);
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
      setPoolClassToken(stage, "glitter-pool-stage--roam-source-dragging", true);
    }
    return draggingIdeaId;
  };

  const clearDraggingState = (): void => {
    writePoolRoamDraggingIdeaId(stage);
    clearPoolRoamSourceDragPreview(stage);
    setPoolClassToken(stage, "glitter-pool-stage--roam-source-dragging", false);
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
  const floatingActions = createPoolNode(roamCanvasStage, "div", "glitter-pool-stage__roam-floating-actions");
  (roamState?.floatingActions ?? []).forEach((action) => {
    const actionHandler = floatingActionHandlers[action];
    const button = createPoolButton(
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
    createPoolNode(button, "span", `glitter-pool-stage__roam-floating-action-icon glitter-pool-stage__roam-floating-action-icon--${action}`);
  });

  const roamCanvasHost = createPoolNode(roamCanvasStage, "div", "glitter-pool-stage__roam-canvas-host");
  if (roamState?.mode === "board" && roamState.boardPath) {
    roamCanvasHost.dataset.boardPath = roamState.boardPath;
    return;
  }

  if (roamState?.mode === "error") {
    const errorState = createPoolNode(roamCanvasHost, "div", "glitter-pool-stage__roam-error");
    createPoolNode(errorState, "strong", "glitter-pool-stage__roam-error-title", roamLabels?.errorTitle ?? "漫游白板暂时不可用");
    createPoolNode(
      errorState,
      "p",
      "glitter-pool-stage__roam-error-description",
      roamState.errorMessage ?? roamLabels?.errorDescription ?? "请稍后再试。"
    );
    return;
  }

  const emptyState = createPoolNode(roamCanvasHost, "div", "glitter-pool-stage__roam-empty");
  createPoolNode(emptyState, "strong", "glitter-pool-stage__roam-empty-title", roamLabels?.emptyTitle ?? "新的空白漫游区");
  createPoolNode(
    emptyState,
    "p",
    "glitter-pool-stage__roam-empty-description",
    roamLabels?.emptyDescription ?? "把左侧卡片内容区右上角的圆点拖入这里后，才会创建第一块漫游白板。"
  );
}
function renderPoolRoamSourceHandle(
  content: HTMLElement,
  card: BrowseCard,
  stage: HTMLElement,
  actions: PoolViewActions,
  options: { roamOpen: boolean; roamSourceActive?: boolean; labels?: NonNullable<PoolViewState["roam"]>["labels"] }
): void {
  content.querySelector(".glitter-pool-stage__roam-source-handle")?.remove();
  setPoolClassToken(content, "glitter-pool-stage__card-content--roam-source", options.roamOpen);

  if (!options.roamOpen) {
    return;
  }

  const handleClassName = options.roamSourceActive
    ? "glitter-pool-stage__roam-source-handle glitter-pool-stage__roam-source-handle--active"
    : "glitter-pool-stage__roam-source-handle";
  const sourceHandle = createPoolNode(content, "div", handleClassName) as HTMLDivElement;
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
    setPoolClassToken(stage, "glitter-pool-stage--roam-source-dragging", true);

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
      setPoolClassToken(stage, "glitter-pool-stage--roam-source-dragging", false);
      const roamCanvasStage = stage.querySelector(".glitter-pool-stage__roam-canvas-stage") as HTMLElement | null;
      if (roamCanvasStage) {
        setPoolClassToken(roamCanvasStage, "glitter-pool-stage__roam-canvas-stage--drag-over", false);
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
        setPoolClassToken(
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
  createPoolNode(sourceHandle, "span", "glitter-pool-stage__roam-source-handle-icon");
}

const { patchRenderedBrowseWorkbench, renderBrowseWorkbench } = createPoolBrowseWorkbenchRuntime({
  renderPoolView,
  renderRoamPanel,
  renderPoolRoamSourceHandle
});

export function syncRenderedPoolCardMenus(containerEl: HTMLElement, activeIdeaId?: string): boolean {
  return syncRenderedPoolCardMenusRuntime(containerEl, activeIdeaId);
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
  clearPoolContainer(containerEl);

  const isFirstUseMode = state.mode === "first-use-choose" || state.mode === "first-use-create";
  const stageClassName = isFirstUseMode
    ? `glitter-plugin-root glitter-pool-stage glitter-pool-stage--first-use glitter-pool-stage--${state.mode}`
    : "glitter-plugin-root glitter-pool-stage";

  const stage = createPoolNode(containerEl, "section", stageClassName);

  if (isFirstUseMode) {
    resetPoolCardIsolationState(containerEl);
    const surface = createPoolNode(stage, "div", "glitter-pool-stage__first-use-surface");
    const header = createPoolNode(surface, "header", "glitter-pool-stage__header glitter-write-stage__modal-header");

    if (state.mode === "first-use-create") {
      const createForm = state.createForm;
      const title = createForm?.title ?? state.pool.title;
      const createdPoolId = createForm?.createdPoolId ?? NEW_POOL_CREATED_ID;
      const createdPoolLabel = createForm?.createdPoolLabel ?? NEW_POOL_CREATED_LABEL;

      const headerText = createPoolNode(header, "div", "glitter-pool-stage__header-copy");
      createPoolNode(headerText, "h2", "glitter-pool-stage__title", title);

      const closeButton = createPoolButton(
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
      createPoolNode(closeButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--close");

      const form = createPoolNode(surface, "div", "glitter-pool-stage__create-form");

      const nameField = createPoolNode(form, "div", "glitter-pool-stage__field");
      createPoolNode(nameField, "label", "glitter-pool-stage__field-label", createForm?.nameLabel ?? "Pool name");
      const nameInput = createPoolNode(nameField, "input", "glitter-pool-stage__field-input glitter-write-stage__input") as HTMLInputElement;
      nameInput.type = "text";
      nameInput.placeholder = createForm?.namePlaceholder ?? "For example: Product pool / Writing pool / Research pool";
      nameInput.value = createdPoolLabel;

      const descriptionField = createPoolNode(form, "div", "glitter-pool-stage__field");
      createPoolNode(
        descriptionField,
        "label",
        "glitter-pool-stage__field-label",
        createForm?.descriptionLabel ?? "Pool description"
      );
      const descriptionPanel = createPoolNode(
        descriptionField,
        "div",
        "glitter-pool-stage__field-body-panel glitter-write-stage__body-panel"
      );
      const descriptionInput = createPoolNode(
        descriptionPanel,
        "textarea",
        "glitter-write-stage__body-editor glitter-pool-stage__field-input--textarea glitter-write-stage__textarea glitter-write-stage__textarea--panel-blend"
      ) as HTMLTextAreaElement;
      descriptionInput.placeholder =
        createForm?.descriptionPlaceholder ?? "Describe this pool's focus and use case to make later filtering and organization easier.";

      const colorField = createPoolNode(form, "div", "glitter-pool-stage__field");
      createPoolNode(colorField, "label", "glitter-pool-stage__field-label", createForm?.colorLabel ?? "Pool color");
      const swatches = createPoolNode(colorField, "div", "glitter-pool-stage__swatches");
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
        const swatch = createPoolNode(swatches, "button", swatchClass) as HTMLButtonElement;
        swatch.type = "button";
        setPoolInlineStyle(swatch, "background", color);
        swatch.dataset.poolColor = color;
        swatch.addEventListener("click", () => {
          syncSelectedSwatch(color);
        });
      });

      const tip = createPoolNode(form, "div", "glitter-pool-stage__first-use-tip glitter-write-stage__success-summary");
      createPoolNode(
        tip,
        "p",
        "glitter-pool-stage__first-use-tip-body",
        createForm?.tipText ?? "After creation, Glitter will move the current idea into this pool and show first-assignment feedback on the home page."
      );

      const footer = createPoolNode(surface, "footer", "glitter-pool-stage__first-use-footer glitter-write-stage__quick-actions");
      const confirmButton = createPoolButton(
        footer,
        "glitter-write-stage__action-primary glitter-write-stage__action-primary--with-icon glitter-write-stage__action-primary--capture-submit glitter-pool-stage__create-submit",
        "",
        () => actions.onItemSelect(createdPoolId)
      );
      confirmButton.dataset.itemId = createdPoolId;
      createPoolNode(confirmButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--save");
      createPoolNode(confirmButton, "span", "glitter-write-stage__action-primary-text", createForm?.confirmLabel ?? "Create pool");

      return;
    }

    const headerText = createPoolNode(header, "div", "glitter-pool-stage__header-copy");
    createPoolNode(headerText, "h2", "glitter-pool-stage__title", state.pool.title);

    const closeButton = createPoolButton(
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
    createPoolNode(closeButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--close");

    createPoolNode(surface, "p", "glitter-pool-stage__first-use-lead", state.header.hint);

    const choice = createPoolNode(surface, "div", "glitter-pool-stage__choice glitter-pool-stage__choice--choose");
    const options = state.choice?.options ?? [];
    let selectedOptionId = options[0]?.id ?? "";
    const optionCards: Array<{
      id: string;
      card: HTMLButtonElement;
    }> = [];

    const footer = createPoolNode(surface, "footer", "glitter-pool-stage__first-use-actions");
    const backAction = createPoolButton(
      footer,
      "glitter-write-stage__action-secondary glitter-pool-stage__first-use-back-action",
      state.choice?.backLabel ?? "Back",
      () => actions.onBack()
    );
    backAction.dataset.role = "first-use-back";

    const continueButton = createPoolButton(
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
    createPoolNode(continueButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--enter-pool");
    createPoolNode(continueButton, "span", "glitter-pool-stage__first-use-continue-text", state.choice?.continueLabel ?? "Continue");

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
      const optionCard = createPoolNode(
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

      const optionCopy = createPoolNode(optionCard, "div", "glitter-pool-stage__choice-copy glitter-pool-stage__first-use-option-copy");
      createPoolNode(
        optionCopy,
        "strong",
        "glitter-pool-stage__choice-label glitter-pool-stage__choice-label--first-use glitter-pool-stage__first-use-option-title",
        option.label
      );
      createPoolNode(
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
