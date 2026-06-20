import { CREATE_NEW_POOL_ID, DEFAULT_POOL_ID } from "../../plugin/constants";
import type { PoolBrowseLabels, PoolBrowseOverlay, PoolViewState } from "./pool-state";
import {
  clearPoolContainer,
  createPoolAnchor,
  createPoolButton,
  createPoolNode,
  renderPoolEmptyState,
  setPoolClassToken,
  setPoolInlineStyle
} from "./pool-dom";
import {
  applyPoolCardMasonry,
  bindPoolCardIsolation,
  bindPoolCardMasonry,
  bindPoolCardScrollVisibility,
  clearPoolCardIsolation,
  disconnectPoolCardIsolation,
  disconnectPoolCardMasonry,
  disconnectPoolCardScrollVisibility,
  resetPoolCardIsolationState,
  setRenderedPoolCardMenuVisibility
} from "./pool-card-runtime";
import {
  applyPoolRoamWorkbenchLayout,
  bindPoolRoamPaneResize,
  renderRoamBridgeLane
} from "./pool-roam-bridge-runtime";
import {
  createMediaPreviewButton,
  findClosestPoolStage,
  openPoolMediaPreviewOverlay
} from "./pool-media-preview";

export interface PoolBrowseWorkbenchActions {
  onBack: () => void;
  onItemSelect: (itemId: string) => void;
  onCreateIdea: () => void;
  onQueryChange?: (query: string, options?: { isComposing?: boolean }) => void;
  onQuerySubmit?: (query: string) => void;
  onStatusChange?: (status: "all" | "referenced" | "file-created" | "with-markers") => void;
  onSortChange?: (sort: "updated-desc" | "created-desc" | "title-asc") => void;
  onBatchModeToggle?: () => void;
  onTogglePoolRoam?: () => void;
  onSetPoolRoamPaneRatio?: (ratio: number) => void;
  onLocatePoolRoamSource?: (ideaId: string) => void;
  onDeletePoolRoamSourceLink?: (anchorId: string) => void;
  onTogglePoolMarkdownPreview?: () => void;
  onSavePoolMarkdownFile?: () => void;
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
  onDismissRoamBackConfirm?: () => void;
  onConfirmRoamBackHome?: () => void;
}

type PoolBrowseWorkbenchDependencies = {
  renderPoolView: (containerEl: HTMLElement, state: PoolViewState, actions: PoolBrowseWorkbenchActions) => void;
  renderRoamPanel: (parent: HTMLElement, stage: HTMLElement, state: PoolViewState, actions: PoolBrowseWorkbenchActions) => void;
  renderPoolRoamSourceHandle: (
    content: HTMLElement,
    card: NonNullable<NonNullable<PoolViewState["browse"]>["cards"]>[number],
    stage: HTMLElement,
    actions: PoolBrowseWorkbenchActions,
    options: { roamOpen: boolean; roamSourceActive?: boolean; labels?: NonNullable<PoolViewState["roam"]>["labels"] }
  ) => void;
};

export function createPoolBrowseWorkbenchRuntime(deps: PoolBrowseWorkbenchDependencies) {
  function readElementHeight(node: HTMLElement): number {
    const rectHeight = node.getBoundingClientRect?.().height ?? 0;
    if (rectHeight > 0) {
      return rectHeight;
    }

    return node.offsetHeight ?? 0;
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
      const button = createPoolButton(parent, "glitter-pool-stage__toolbar-menu-item", label, () => {
        options.onSelect?.(pool.id);
      });
      button.disabled = Boolean(options.disabled);
    });

    if (availablePools.length === 0) {
      const hint = createPoolNode(
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

    return createPoolNode(parent, "span", classNames.join(" "));
  }

  function createPoolCardMenuIcon(parent: HTMLElement, icon: "more" | "edit" | "share" | "delete" | "file" | "move"): HTMLElement {
    return createPoolNode(
      parent,
      "span",
      `glitter-pool-stage__card-more-menu-icon glitter-pool-stage__card-more-menu-icon--${icon}`
    );
  }

  function createResultsToolIcon(parent: HTMLElement, icon: "status" | "filter" | "sort" | "roam" | "preview" | "batch" | "more"): HTMLElement {
    return createPoolNode(
      parent,
      "span",
      `glitter-pool-stage__results-tool-icon glitter-pool-stage__results-tool-icon--${icon}`
    );
  }

  const POOL_CARD_BODY_MAX_LINES = 8;
  const POOL_CARD_MEDIA_BODY_MAX_LINES = 4;
  const POOL_CARD_BODY_ESTIMATED_CHARS_PER_LINE = 22;
  const POOL_CARD_MEDIA_BODY_ESTIMATED_CHARS_PER_LINE = 26;
  const POOL_CARD_MORE_MENU_MIN_HEIGHT_PX = 80;
  const POOL_CARD_STRUCTURE_SIGNATURE_KEY = "__glitterPoolCardStructureSignature";
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

    setPoolClassToken(bodyEl, "glitter-pool-stage__card-copy--expanded", false);
    setPoolClassToken(bodyEl, "glitter-pool-stage__card-copy--collapsed", true);

    if (!shouldCollapseCardCopy(bodyEl, text, options)) {
      setPoolClassToken(bodyEl, "glitter-pool-stage__card-copy--collapsed", false);
      return;
    }

    let expanded = false;
    const toggleRow = createPoolNode(parent, "div", "glitter-pool-stage__card-body-toggle-row");
    const toggle = createPoolButton(toggleRow, "glitter-pool-stage__card-body-toggle", "", () => {
      expanded = !expanded;
      syncToggleState();
      options.onToggle?.();
    });
    const toggleText = createPoolNode(
      toggle,
      "span",
      "glitter-pool-stage__card-body-toggle-text glitter-home-stage__visually-hidden"
    );
    const toggleIcon = createPoolNode(toggle, "span");

    const syncToggleState = (): void => {
      setPoolClassToken(bodyEl, "glitter-pool-stage__card-copy--collapsed", !expanded);
      setPoolClassToken(bodyEl, "glitter-pool-stage__card-copy--expanded", expanded);
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
    actions: PoolBrowseWorkbenchActions
  ): void {
    const labels = resolveBrowseLabels(state);
    const overlay = createPoolNode(stage, "div", "glitter-pool-stage__card-move-overlay");
    const scrim = createPoolNode(overlay, "div", "glitter-pool-stage__card-move-scrim");
    scrim.setAttribute("aria-hidden", "true");

    const dialog = createPoolNode(overlay, "div", "glitter-pool-stage__card-move-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", labels.moveToLabel);

    const header = createPoolNode(dialog, "div", "glitter-pool-stage__card-move-dialog-header");
    const headerCopy = createPoolNode(header, "div", "glitter-pool-stage__card-move-dialog-header-copy");
    createPoolNode(headerCopy, "strong", "glitter-pool-stage__card-move-dialog-title", labels.moveToLabel);

    const isSubmitting = Boolean(actions.isCardMovePickerSubmitting?.(card.id));

    const closeButton = createPoolButton(
      header,
      "glitter-write-stage__close-button glitter-pool-stage__card-move-dialog-close",
      "",
      () => {
        actions.onCloseCardMovePicker?.();
      }
    );
    closeButton.disabled = isSubmitting;
    closeButton.setAttribute("aria-label", labels.closeMoveToLabel);
    createPoolNode(closeButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--close");

    const searchInput = createPoolNode(
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

    const targetList = createPoolNode(dialog, "div", "glitter-pool-stage__card-move-dialog-list");
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
    actions: PoolBrowseWorkbenchActions,
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
  function hasVisibleRoamBridgeForCard(card: BrowseCard, activePoolId: string, roamState: PoolViewState["roam"] | undefined): boolean {
    return Boolean(
      activePoolId
      && roamState?.boundaryAnchors.some((anchor) => anchor.visibleBridge && anchor.poolId === activePoolId && anchor.ideaId === card.id)
    );
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
    actions: PoolBrowseWorkbenchActions,
    activePool: { id: string; label: string; count: number; selected: boolean } | null
  ): void {
    const switcher = createPoolNode(titleCluster, "div", "glitter-pool-stage__pool-switcher");
    const popup = createPoolNode(switcher, "div", "glitter-pool-stage__pool-popup");
    const popupList = createPoolNode(popup, "div", "glitter-pool-stage__pool-popup-list");

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

      const popupItem = createPoolButton(popupList, itemClasses.join(" "), "", () => {
        if (isSelected) {
          actions.onBrowseOverlayClose?.();
          return;
        }
        actions.onPoolSwitch?.(pool.id);
      });
      popupItem.dataset.poolId = pool.id;
      popupItem.dataset.poolIndex = String(index);
      createPoolNode(popupItem, "span", "glitter-pool-stage__pool-popup-item-label", pool.label);
      if (isSelected) {
        createPoolNode(popupItem, "span", "glitter-pool-stage__pool-popup-check");
      }
    });
  }

  function renderResultsToolbarMenuItems(
    menu: HTMLElement,
    activeOverlay: "status" | "filter" | "sort",
    controls: RenderedBrowseControls,
    actions: PoolBrowseWorkbenchActions
  ): void {
    const labels = controls.labels ?? DEFAULT_BROWSE_LABELS;

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
        createPoolButton(menu, itemClassName, option.label, () => {
          actions.onStatusChange?.(option.value as "all" | "referenced" | "file-created" | "with-markers");
        });
      });
      return;
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
        createPoolButton(menu, itemClassName, option.label, () => {
          actions.onContentFilterChange?.(option.value as "all" | "text" | "link" | "image" | "video");
        });
      });
      return;
    }

    [
      { value: "updated-desc", label: labels.sortOptions["updated-desc"] },
      { value: "created-desc", label: labels.sortOptions["created-desc"] },
      { value: "title-asc", label: labels.sortOptions["title-asc"] }
    ].forEach((option) => {
      const itemClassName = controls.sort === option.value
        ? "glitter-pool-stage__toolbar-menu-item glitter-pool-stage__toolbar-menu-item--active"
        : "glitter-pool-stage__toolbar-menu-item";
      createPoolButton(menu, itemClassName, option.label, () => {
        actions.onSortChange?.(option.value as "updated-desc" | "created-desc" | "title-asc");
      });
    });
  }

  // 结果工具栏下拉层统一承接状态、内容筛选和排序三类菜单，保持触发器与菜单外壳的交互一致。
  function renderResultsToolbarMenuOverlay(
    menuHost: HTMLElement,
    activeOverlay: "status" | "filter" | "sort",
    controls: RenderedBrowseControls,
    actions: PoolBrowseWorkbenchActions
  ): void {
    const menu = createPoolNode(
      menuHost,
      "div",
      "glitter-pool-stage__toolbar-menu glitter-pool-stage__toolbar-menu--roam-submenu"
    );
    renderResultsToolbarMenuItems(menu, activeOverlay, controls, actions);
  }

  function renderFloatingResultsToolbarMenuOverlay(
    stage: HTMLElement,
    menuHost: HTMLElement,
    activeOverlay: "status" | "filter" | "sort",
    controls: RenderedBrowseControls,
    actions: PoolBrowseWorkbenchActions
  ): void {
    const stageRect = stage.getBoundingClientRect?.();
    const anchorRect = menuHost.getBoundingClientRect?.();
    const overlayShell = createPoolNode(stage, "div", "glitter-pool-stage__results-toolbar-overlay-shell");
    const menu = createPoolNode(
      overlayShell,
      "div",
      "glitter-pool-stage__toolbar-menu glitter-pool-stage__toolbar-menu--results-overlay"
    );
    const stageLeft = stageRect?.left ?? 0;
    const stageTop = stageRect?.top ?? 0;
    const anchorRight = anchorRect?.right ?? stageLeft;
    const anchorBottom = anchorRect?.bottom ?? stageTop;
    setPoolInlineStyle(menu, "left", `${Math.max(0, anchorRight - stageLeft)}px`);
    setPoolInlineStyle(menu, "top", `${Math.max(0, anchorBottom - stageTop + 8)}px`);
    renderResultsToolbarMenuItems(menu, activeOverlay, controls, actions);
  }

  function isBrowseResultsMorePanelOpen(activeOverlay: PoolBrowseOverlay | null): boolean {
    return activeOverlay === "browse-more" || activeOverlay === "status" || activeOverlay === "filter" || activeOverlay === "sort";
  }

  function renderBrowseResultsToolbarControls(
    parent: HTMLElement,
    actions: PoolBrowseWorkbenchActions,
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
    const statusAnchor = createPoolNode(
      parent,
      "div",
      "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--status"
    );
    const statusTrigger = createPoolButton(statusAnchor, "glitter-pool-stage__status-trigger", "", () => {
      actions.onBrowseOverlayToggle?.("status");
    });
    statusTrigger.setAttribute("aria-label", options.controls.labels?.statusFilterLabel ?? DEFAULT_BROWSE_LABELS.statusFilterLabel);
    statusTrigger.setAttribute("aria-expanded", options.activeOverlay === "status" ? "true" : "false");
    createResultsToolIcon(statusTrigger, "status");

    const filterAnchor = createPoolNode(
      parent,
      "div",
      "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--filter"
    );
    const filterTrigger = createPoolButton(filterAnchor, "glitter-pool-stage__results-tool glitter-pool-stage__results-tool--filter", "", () => {
      actions.onBrowseOverlayToggle?.("filter");
    });
    filterTrigger.setAttribute("aria-label", options.controls.labels?.filterLabel ?? DEFAULT_BROWSE_LABELS.filterLabel);
    filterTrigger.setAttribute("aria-expanded", options.activeOverlay === "filter" ? "true" : "false");
    createResultsToolIcon(filterTrigger, "filter");

    const sortAnchor = createPoolNode(
      parent,
      "div",
      "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--sort"
    );
    const sortTrigger = createPoolButton(sortAnchor, "glitter-pool-stage__results-tool glitter-pool-stage__results-tool--sort", "", () => {
      actions.onBrowseOverlayToggle?.("sort");
    });
    sortTrigger.setAttribute("aria-label", options.controls.labels?.sortLabel ?? DEFAULT_BROWSE_LABELS.sortLabel);
    sortTrigger.setAttribute("aria-expanded", options.activeOverlay === "sort" ? "true" : "false");
    createResultsToolIcon(sortTrigger, "sort");

    let previewAnchor: HTMLElement | null = null;
    if (options.previewAvailable) {
      previewAnchor = createPoolNode(
        parent,
        "div",
        "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--preview"
      );
      const previewTrigger = createPoolButton(
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

    const batchAnchor = createPoolNode(
      parent,
      "div",
      "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--batch"
    );
    const batchTrigger = createPoolButton(batchAnchor, "glitter-pool-stage__batch-toggle", "", () => {
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
    actions: PoolBrowseWorkbenchActions
  ): void {
    const labels = controls.labels ?? DEFAULT_BROWSE_LABELS;
    const menu = createPoolNode(
      moveActionAnchor,
      "div",
      "glitter-pool-stage__toolbar-menu glitter-pool-stage__toolbar-menu--batch"
    );
    createPoolNode(menu, "strong", "glitter-pool-stage__toolbar-menu-title", labels.moveToLabel);
    renderMoveTargetButtons(menu, state.poolOptions, {
      disabled: !controls.hasSelection,
      labels,
      onSelect(poolId) {
        actions.onMoveSelectionToPool?.(poolId);
      }
    });
    const createPoolActionButton = createPoolButton(menu, "glitter-pool-stage__toolbar-menu-create", "", () => {
      actions.onMoveSelectionToPool?.(CREATE_NEW_POOL_ID);
    });
    createPoolActionButton.disabled = !controls.hasSelection;
    createPoolActionButton.setAttribute("aria-label", labels.newPoolLabel);
    createPoolNode(createPoolActionButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--plus");
  }

  function isPoolRoamAvailable(state: PoolViewState): boolean {
    return state.mode === "browse" || state.mode === "empty";
  }

  function renderPoolRoamToggle(parent: HTMLElement, actions: PoolBrowseWorkbenchActions, open: boolean, labels?: NonNullable<PoolViewState["roam"]>["labels"]): void {
    const roamEntry = createPoolNode(parent, "div", "glitter-pool-stage__results-entry");
    const roamTrigger = createPoolButton(roamEntry, "glitter-pool-stage__results-entry-button", "", () => {
      actions.onTogglePoolRoam?.();
    });
    roamTrigger.dataset.glitterPoolRoamToggle = "true";
    roamTrigger.setAttribute("data-glitter-pool-roam-toggle", "true");
    roamTrigger.setAttribute("aria-label", open ? labels?.toggleClose ?? "关闭漫游模式" : labels?.toggleOpen ?? "打开漫游模式");
    roamTrigger.setAttribute("aria-pressed", open ? "true" : "false");
    createResultsToolIcon(roamTrigger, "roam");
    createPoolNode(roamTrigger, "span", "glitter-pool-stage__results-entry-label", labels?.modeLabel ?? "漫游模式");
  }

  function renderPreviewPanel(parent: HTMLElement, state: PoolViewState, actions: PoolBrowseWorkbenchActions): void {
    const previewState = state.preview;
    const previewPanel = createPoolNode(parent, "aside", "glitter-pool-stage__pool-markdown-preview");
    const previewHeader = createPoolNode(previewPanel, "div", "glitter-pool-stage__pool-markdown-preview-header");
    createPoolNode(
      previewHeader,
      "div",
      "glitter-pool-stage__pool-markdown-preview-title",
      previewState?.panelTitle ?? `${state.pool.title} Markdown 文件`
    );
    const saveButton = createPoolButton(
      previewHeader,
      "glitter-pool-stage__pool-markdown-preview-save",
      previewState?.saveLabel ?? "保存 Markdown 文件",
      () => {
        actions.onSavePoolMarkdownFile?.();
      }
    );
    saveButton.disabled = Boolean(previewState?.saving);
    createPoolNode(previewPanel, "div", "glitter-pool-stage__pool-markdown-preview-content");
  }
  function renderPoolCardMenuShell(
    menuShell: HTMLElement,
    card: BrowseCard,
    actions: PoolBrowseWorkbenchActions,
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
    clearPoolContainer(menuShell);
    const labels = { ...DEFAULT_BROWSE_LABELS, ...(options.labels ?? {}) };

    if (options.batchMode) {
      const selectToggleClassName = options.selected
        ? "glitter-pool-stage__card-select-toggle glitter-pool-stage__card-select-toggle--selected"
        : "glitter-pool-stage__card-select-toggle";
      const selectToggle = createPoolButton(menuShell, selectToggleClassName, "", () => {
        actions.onItemSelect(card.id);
      });
      selectToggle.dataset.ideaId = card.id;
      selectToggle.setAttribute("aria-label", options.selected ? labels.deselectCardLabel : labels.selectCardLabel);
      selectToggle.setAttribute("aria-pressed", options.selected ? "true" : "false");
      createPoolNode(selectToggle, "span", "glitter-pool-stage__card-select-toggle-dot");
      return;
    }

    const moreTrigger = createPoolButton(menuShell, "glitter-pool-stage__card-more-trigger", "", () => {
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

    const moreMenu = createPoolNode(menuShell, "div", "glitter-pool-stage__card-more-menu");
    moreMenu.dataset.ideaId = card.id;
    moreMenu.setAttribute("role", "menu");
    setRenderedPoolCardMenuVisibility(moreMenu, Boolean(options.menuOpen));

    const editMenuItem = createPoolButton(
      moreMenu,
      "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--edit",
      "",
      () => {
        actions.onEditIdea?.(card.id);
      }
    );
    editMenuItem.dataset.ideaId = card.id;
    createPoolCardMenuIcon(editMenuItem, "edit");
    createPoolNode(editMenuItem, "span", undefined, labels.editAction);

    const moveMenuItem = createPoolButton(
      moreMenu,
      "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--move",
      "",
      () => {
        actions.onOpenCardMovePicker?.(card.id);
      }
    );
    moveMenuItem.dataset.ideaId = card.id;
    createPoolCardMenuIcon(moveMenuItem, "move");
    createPoolNode(moveMenuItem, "span", undefined, labels.moveToPoolAction);

    const shareMenuItem = createPoolButton(
      moreMenu,
      "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--share",
      "",
      () => {
        actions.onShareIdea?.(card.id, moreTrigger);
      }
    );
    shareMenuItem.dataset.ideaId = card.id;
    createPoolCardMenuIcon(shareMenuItem, "share");
    createPoolNode(shareMenuItem, "span", undefined, labels.shareAction);

    (card.menuActions ?? []).forEach((action) => {
      const actionMenuItem = createPoolButton(
        moreMenu,
        "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--file",
        "",
        () => {
          runCardMenuAction(actions, card.id, action.kind);
        }
      );
      actionMenuItem.dataset.ideaId = card.id;
      createPoolCardMenuIcon(actionMenuItem, "file");
      createPoolNode(actionMenuItem, "span", undefined, action.label);
    });

    const deleteMenuItem = createPoolButton(
      moreMenu,
      "glitter-pool-stage__card-more-menu-item glitter-pool-stage__card-more-menu-item--delete",
      "",
      () => {
        actions.onDeleteIdea?.(card.id);
      }
    );
    deleteMenuItem.dataset.ideaId = card.id;
    createPoolCardMenuIcon(deleteMenuItem, "delete");
    createPoolNode(deleteMenuItem, "span", undefined, labels.deleteAction);

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
    setPoolInlineStyle(moreMenu, "maxHeight", `${maxMenuHeight}px`);
    setPoolInlineStyle(moreMenu, "minHeight", `${POOL_CARD_MORE_MENU_MIN_HEIGHT_PX}px`);
  }

  // 顶部栏渲染：承接返回、池标题与池切换、内联改名以及进入灵感速记的主入口。
  function renderBrowseTopbar(
    topbar: HTMLElement,
    state: PoolViewState,
    actions: PoolBrowseWorkbenchActions,
    options: {
      activeOverlay: PoolBrowseOverlay | null;
      activePool: { id: string; label: string; count: number; selected: boolean } | null;
      canEditMetadata: boolean;
      showPoolSwitcher: boolean;
      roamOpen: boolean;
    }
  ): void {
    clearPoolContainer(topbar);
    const labels = resolveBrowseLabels(state);

    const backButton = createPoolButton(topbar, "glitter-pool-stage__back", "", () => actions.onBack());
    backButton.setAttribute("aria-label", labels.backHomeLabel);
    createPoolNode(backButton, "span", "glitter-pool-stage__back-icon");

    const titleCluster = createPoolNode(topbar, "div", "glitter-pool-stage__title-cluster");
    const titleSlot = createPoolNode(titleCluster, "div", "glitter-pool-stage__title-slot");
    let currentTitle = state.header.title ?? state.pool.title;
    const title = createPoolNode(
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
      const titleSwitcher = createPoolButton(titleCluster, "glitter-pool-stage__title-switcher", "", () => {
        actions.onBrowseOverlayToggle?.("pool-switcher");
      });
      titleSwitcher.setAttribute("aria-label", labels.switchPoolLabel);
      titleSwitcher.setAttribute("aria-expanded", options.activeOverlay === "pool-switcher" ? "true" : "false");
      createPoolNode(titleSwitcher, "span", "glitter-pool-stage__pool-trigger-arrows");

      if (options.activeOverlay === "pool-switcher") {
        renderPoolSwitcherOverlay(titleCluster, state, actions, options.activePool);
      }
    }

    const topbarTools = createPoolNode(topbar, "div", "glitter-pool-stage__topbar-tools");
    const topbarCreate = createPoolButton(
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
    createPoolNode(topbarCreate, "span", "glitter-pool-stage__topbar-create-icon");
    if (!options.roamOpen) {
      createPoolNode(topbarCreate, "span", "glitter-pool-stage__topbar-create-label", labels.quickCaptureLabel);
    }
  }

  // 描述条既是池简介展示位，也是可内联编辑的 metadata 入口，和标题改名共用同一提交节奏。
  function renderPoolRoamBackConfirm(stage: HTMLElement, state: PoolViewState, actions: PoolBrowseWorkbenchActions): void {
    const labels = resolveBrowseLabels(state);
    const closeConfirm = createPoolNode(
      stage,
      "div",
      "glitter-write-stage__close-confirm glitter-pool-stage__roam-back-confirm"
    );
    const dialog = createPoolNode(closeConfirm, "div", "glitter-pool-stage__roam-back-confirm-dialog");
    createPoolNode(dialog, "h3", "glitter-write-stage__close-confirm-title", labels.roamBackTitle);
    createPoolNode(
      dialog,
      "p",
      "glitter-write-stage__close-confirm-description",
      labels.roamBackDescription
    );
    const closeConfirmActions = createPoolNode(dialog, "div", "glitter-write-stage__close-confirm-actions");
    createPoolButton(closeConfirmActions, "glitter-write-stage__close-confirm-secondary", labels.roamBackContinue, () => {
      actions.onDismissRoamBackConfirm?.();
    });
    createPoolButton(closeConfirmActions, "glitter-write-stage__close-confirm-primary", labels.roamBackHome, () => {
      actions.onConfirmRoamBackHome?.();
    });
  }

  function renderBrowseDescriptionSlot(
    descriptionSlot: HTMLElement,
    state: PoolViewState,
    actions: PoolBrowseWorkbenchActions,
    canEditMetadata: boolean
  ): void {
    clearPoolContainer(descriptionSlot);

    let currentDescription = state.browse?.description ?? "";
    let currentDescriptionValue = state.browse?.descriptionValue ?? currentDescription;
    const description = createPoolNode(
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
    stage: HTMLElement,
    resultsHeader: HTMLElement,
    state: PoolViewState,
    actions: PoolBrowseWorkbenchActions,
    options: {
      controls: RenderedBrowseControls;
      activeOverlay: PoolBrowseOverlay | null;
      roamAvailable: boolean;
      roamOpen: boolean;
      previewAvailable: boolean;
      previewOpen: boolean;
    }
  ): void {
    clearPoolContainer(resultsHeader);
    stage.querySelector(".glitter-pool-stage__results-toolbar-overlay-shell")?.remove();

    const resultsLead = createPoolNode(resultsHeader, "div", "glitter-pool-stage__results-lead");
    if (options.roamAvailable) {
      renderPoolRoamToggle(resultsLead, actions, options.roamOpen, state.roam?.labels);
    }

    const resultsControls = createPoolNode(resultsHeader, "div", "glitter-pool-stage__results-controls");
    const resultsTools = createPoolNode(resultsControls, "div", "glitter-pool-stage__results-tools");

    const queryInput = createPoolNode(resultsTools, "input", "glitter-pool-stage__query") as HTMLInputElement;
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
      const moreAnchor = createPoolNode(
        resultsTools,
        "div",
        "glitter-pool-stage__results-tool-anchor glitter-pool-stage__results-tool-anchor--more"
      );
      const moreTrigger = createPoolButton(moreAnchor, "glitter-pool-stage__results-tool glitter-pool-stage__results-tool--more", "", () => {
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
        const morePanel = createPoolNode(
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
      renderFloatingResultsToolbarMenuOverlay(stage, menuHost, options.activeOverlay, options.controls, actions);
    }
  }

  // 批量面板固定悬在卡片区右下角，持续显示已选数量，并把删除/移动动作收成两个圆形按钮。
  function renderBrowseBatchPanel(
    parent: HTMLElement,
    state: PoolViewState,
    actions: PoolBrowseWorkbenchActions,
    options: {
      controls: RenderedBrowseControls;
      activeOverlay: PoolBrowseOverlay | null;
    }
  ): void {
    const batchPanel = createPoolNode(parent, "div", "glitter-pool-stage__batch-panel");
    createPoolNode(batchPanel, "div", "glitter-pool-stage__batch-summary", `${options.controls.selectedCount}/${state.pool.itemCount}`);

    const deleteAction = createPoolButton(batchPanel, "glitter-pool-stage__batch-action glitter-pool-stage__batch-action--delete", "", () => {
      actions.onDeleteSelection?.();
    });
    deleteAction.setAttribute("aria-label", options.controls.labels?.deleteSelectedIdeasLabel ?? DEFAULT_BROWSE_LABELS.deleteSelectedIdeasLabel);
    createPoolCardMenuIcon(deleteAction, "delete");

    const moveActionAnchor = createPoolNode(
      batchPanel,
      "div",
      "glitter-pool-stage__batch-action-anchor glitter-pool-stage__batch-action-anchor--move"
    );
    const moveAction = createPoolButton(moveActionAnchor, "glitter-pool-stage__batch-action glitter-pool-stage__batch-action--move", "", () => {
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
    actions: PoolBrowseWorkbenchActions
  ): void {
    const controls = readBrowseControls(state);

    disconnectPoolCardMasonry(containerEl);
    disconnectPoolCardIsolation(containerEl);
    disconnectPoolCardScrollVisibility(containerEl);
    clearBrowseResultsContent(results, resultsHeader);
    stage.querySelector(".glitter-pool-stage__card-move-overlay")?.remove();

    const ownerDocument = containerEl.ownerDocument ?? document;
    const scratchContainer = ownerDocument.createElement("div") as HTMLElement;
    deps.renderPoolView(scratchContainer, state, actions);

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
    actions: PoolBrowseWorkbenchActions,
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
      menuShell = createPoolNode(surface, "div", "glitter-pool-stage__card-menu-shell");
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

  function patchRenderedBrowseWorkbench(containerEl: HTMLElement, state: PoolViewState, actions: PoolBrowseWorkbenchActions): boolean {
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
    renderBrowseResultsHeader(stage, resultsHeader, state, actions, {
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
      const splitView = existingSplitView ?? createPoolNode(results, "div", "glitter-pool-stage__results-split-view");
      const cardsPane = (splitView.querySelector(".glitter-pool-stage__results-pane--cards") as HTMLElement | null)
        ?? createPoolNode(splitView, "div", "glitter-pool-stage__results-pane glitter-pool-stage__results-pane--cards");
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

  function renderBrowseWorkbench(containerEl: HTMLElement, stage: HTMLElement, state: PoolViewState, actions: PoolBrowseWorkbenchActions): void {
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
    const workbench = createPoolNode(
      stage,
      "div",
      roamOpen
        ? "glitter-pool-stage__workbench glitter-pool-stage__workbench--roam"
        : "glitter-pool-stage__workbench"
    );
    if (roamOpen) {
      applyPoolRoamWorkbenchLayout(workbench, roamState?.panelWidthRatio);
    }

    const poolPane = createPoolNode(
      workbench,
      "div",
      "glitter-pool-stage__workbench-pane glitter-pool-stage__workbench-pane--pool"
    );
    const topbar = createPoolNode(poolPane, "header", "glitter-pool-stage__topbar");
    renderBrowseTopbar(topbar, state, actions, {
      activeOverlay,
      activePool,
      canEditMetadata,
      showPoolSwitcher,
      roamOpen
    });

    const descriptionSlot = createPoolNode(poolPane, "div", "glitter-pool-stage__description-slot");
    renderBrowseDescriptionSlot(descriptionSlot, state, actions, canEditMetadata);

    const results = createPoolNode(poolPane, "section", "glitter-pool-stage__results");

    const resultsHeader = createPoolNode(results, "div", "glitter-pool-stage__results-header");
    renderBrowseResultsHeader(stage, resultsHeader, state, actions, {
      controls,
      activeOverlay,
      roamAvailable,
      roamOpen,
      previewAvailable,
      previewOpen
    });

    if (roamOpen) {
      const roamPane = createPoolNode(
        workbench,
        "aside",
        "glitter-pool-stage__workbench-pane glitter-pool-stage__workbench-pane--roam"
      );
      deps.renderRoamPanel(roamPane, stage, state, actions);

      const roamDivider = createPoolNode(workbench, "div", "glitter-pool-stage__roam-divider");
      roamDivider.setAttribute("role", "separator");
      roamDivider.setAttribute("aria-label", resolveBrowseLabels(state).resizeRoamAreaLabel);
      roamDivider.setAttribute("aria-orientation", "vertical");
      createPoolNode(roamDivider, "span", "glitter-pool-stage__roam-divider-line");
      applyPoolRoamWorkbenchLayout(workbench, roamState?.panelWidthRatio);
    }

    let resultsContentHost = results;
    if (previewOpen) {
      const splitView = createPoolNode(results, "div", "glitter-pool-stage__results-split-view");
      resultsContentHost = createPoolNode(splitView, "div", "glitter-pool-stage__results-pane glitter-pool-stage__results-pane--cards");
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

    const cardGridShell = createPoolNode(resultsContentHost, "div", "glitter-pool-stage__card-grid-shell");
    const cardGrid = createPoolNode(cardGridShell, "div", "glitter-pool-stage__card-grid");
    bindPoolCardScrollVisibility(containerEl, cardGrid, cardGridShell);
    const cardStack = createPoolNode(cardGrid, "div", "glitter-pool-stage__card-stack");
    const cardShells: HTMLElement[] = [];
    const refreshCardMasonry = (): void => {
      const currentCardShells = Array.from(cardStack.querySelectorAll(".glitter-pool-stage__card-shell")) as HTMLElement[];
      applyPoolCardMasonry(cardGrid, cardStack, currentCardShells);
    };
    browseCards.forEach((card) => {
      const cardClassName = buildPoolCardSurfaceClassName(card, controls);
      const cardNode = createPoolNode(cardStack, "article", "glitter-pool-stage__card-shell");
      cardNode.dataset.ideaId = card.id;
      writePoolCardStructureSignature(cardNode, buildPoolCardStructureSignature(card));
      cardShells.push(cardNode);

      const isMenuOpen = actions.isCardMenuOpen?.(card.id) ?? false;
      const isMovePickerOpen = actions.isCardMovePickerOpen?.(card.id) ?? false;

      const surface = createPoolNode(cardNode, "div", cardClassName);
      const menuShell = createPoolNode(surface, "div", "glitter-pool-stage__card-menu-shell");

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

      const header = createPoolNode(surface, "div", "glitter-pool-stage__card-header");
      createPoolCardTypeIcon(header, card.typeIcon, { accent: card.fileCreated });

      const content = createPoolNode(
        surface,
        "div",
        `glitter-pool-stage__card-content glitter-pool-stage__card-content--${card.contentKind}`
      );
      deps.renderPoolRoamSourceHandle(content, card, stage, actions, {
        roamOpen,
        roamSourceActive: hasVisibleRoamBridgeForCard(card, state.pool.id, roamState),
        labels: roamState?.labels
      });
      const footer = createPoolNode(surface, "div", `glitter-pool-stage__card-footer glitter-pool-stage__card-footer--${card.contentKind}`);
      let supporting: HTMLElement | null = null;
      const ensureSupporting = (): HTMLElement => {
        if (supporting) {
          return supporting;
        }

        supporting = createPoolNode(
          footer,
          "div",
          `glitter-pool-stage__card-supporting glitter-pool-stage__card-supporting--${card.contentKind}`
        );
        return supporting;
      };
      const createCardTitle = (parent: HTMLElement, className = "glitter-pool-stage__card-title"): HTMLElement =>
        createPoolNode(parent, "strong", className, card.title);
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
      const renderSupportingLinkBlock = (): void => {
        const linkParent = ensureSupporting();
        const linkBlock = card.linkUrl
          ? createPoolAnchor(linkParent, "glitter-pool-stage__card-link-block", card.linkUrl)
          : createPoolNode(linkParent, "div", "glitter-pool-stage__card-link-block");
        if (card.linkUrl) {
          linkBlock.setAttribute("title", card.linkUrl);
        }
        createPoolNode(linkBlock, "span", "glitter-pool-stage__card-link-domain", resolveCardLinkLabel());
      };

      if (card.contentKind === "text") {
        createCardTitle(content);
        const bodyText = card.bodyText ?? "";
        const body = createPoolNode(content, "p", "glitter-pool-stage__card-body", bodyText);
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
          const body = createPoolNode(content, "p", "glitter-pool-stage__card-body", bodyText);
          attachCardBodyToggle(content, body, bodyText, {
            maxLines: POOL_CARD_BODY_MAX_LINES,
            estimatedCharsPerLine: POOL_CARD_BODY_ESTIMATED_CHARS_PER_LINE,
            onToggle: refreshCardMasonry
          });
        }

        renderSupportingLinkBlock();
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
          setPoolClassToken(content, "glitter-pool-stage__card-content--interactive", true);
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
          const mediaStage = createPoolNode(content, "div", "glitter-pool-stage__card-media-stage glitter-pool-stage__card-media-stage--image");
          const mediaClip = createPoolNode(mediaStage, "div", "glitter-pool-stage__card-media-clip");
          const mediaPreviewButton = openPreview
            ? createMediaPreviewButton(mediaClip, resolveCurrentImagePreviewLabel(), openPreview)
            : undefined;
          const thumbnailHost = mediaPreviewButton ?? mediaClip;
          const thumbnail = createPoolNode(thumbnailHost, "img", "glitter-pool-stage__card-media-thumbnail") as HTMLImageElement;
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
            const switcher = createPoolNode(mediaClip, "div", "glitter-pool-stage__card-media-switcher");
            const previousButton = createPoolButton(switcher, "glitter-pool-stage__card-media-switch glitter-pool-stage__card-media-switch--previous", "", () => {
              updateImageIndex((currentImageIndex - 1 + imageThumbnailUrls.length) % imageThumbnailUrls.length);
            });
            previousButton.setAttribute("aria-label", (controls.labels ?? DEFAULT_BROWSE_LABELS).cardPreviousImageLabel);
            createPoolNode(previousButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--chevron-left");

            pagination = createPoolNode(switcher, "span", "glitter-pool-stage__card-media-pagination", `1 / ${imageThumbnailUrls.length}`);
            liveAnnouncement = createPoolNode(
              switcher,
              "span",
              "glitter-pool-stage__card-media-live-announcement glitter-home-stage__visually-hidden",
              ""
            );
            liveAnnouncement.setAttribute("aria-live", "polite");
            liveAnnouncement.setAttribute("aria-atomic", "true");
            syncImageThumbnailState();

            const nextButton = createPoolButton(switcher, "glitter-pool-stage__card-media-switch glitter-pool-stage__card-media-switch--next", "", () => {
              updateImageIndex((currentImageIndex + 1) % imageThumbnailUrls.length);
            });
            nextButton.setAttribute("aria-label", (controls.labels ?? DEFAULT_BROWSE_LABELS).cardNextImageLabel);
            createPoolNode(nextButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--chevron-right");
          }
        } else if (card.mediaThumbnailUrl && card.contentKind === "video") {
          const mediaStage = createPoolNode(content, "div", "glitter-pool-stage__card-media-stage glitter-pool-stage__card-media-stage--video");
          const mediaClip = createPoolNode(mediaStage, "div", "glitter-pool-stage__card-media-clip");
          const mediaPreviewButton = openPreview
            ? createMediaPreviewButton(mediaClip, (controls.labels ?? DEFAULT_BROWSE_LABELS).cardViewLargeVideoLabel(card.title), openPreview)
            : undefined;
          const thumbnailHost = mediaPreviewButton ?? mediaClip;
          const thumbnail = createPoolNode(thumbnailHost, "video", "glitter-pool-stage__card-media-thumbnail") as HTMLVideoElement;
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
          const mediaBody = createPoolNode(content, "p", "glitter-pool-stage__card-media-body", card.bodyText);
          attachCardBodyToggle(content, mediaBody, card.bodyText, {
            maxLines: POOL_CARD_MEDIA_BODY_MAX_LINES,
            estimatedCharsPerLine: POOL_CARD_MEDIA_BODY_ESTIMATED_CHARS_PER_LINE,
            onToggle: refreshCardMasonry
          });
        }
        if (card.linkUrl) {
          renderSupportingLinkBlock();
        }
      } else {
        createCardTitle(content);
        createPoolNode(content, "span", "glitter-pool-stage__card-empty", (controls.labels ?? DEFAULT_BROWSE_LABELS).cardEmptyFallback);
      }

      const meta = createPoolNode(footer, "div", "glitter-pool-stage__card-time");
      createPoolNode(meta, "span", "glitter-pool-stage__card-time-label", card.updatedLabel);
      (card.statusLabels ?? []).forEach((label) => {
        createPoolNode(meta, "span", "glitter-pool-stage__card-reference", label);
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
      const batchPanel = createPoolNode(resultsContentHost, "div", "glitter-pool-stage__batch-panel");
      createPoolNode(batchPanel, "div", "glitter-pool-stage__batch-summary", `${controls.selectedCount}/${state.pool.itemCount}`);

      const deleteAction = createPoolButton(batchPanel, "glitter-pool-stage__batch-action glitter-pool-stage__batch-action--delete", "", () => {
        actions.onDeleteSelection?.();
      });
      deleteAction.setAttribute("aria-label", controls.labels?.deleteSelectedIdeasLabel ?? DEFAULT_BROWSE_LABELS.deleteSelectedIdeasLabel);
      createPoolCardMenuIcon(deleteAction, "delete");

      const moveActionAnchor = createPoolNode(
        batchPanel,
        "div",
        "glitter-pool-stage__batch-action-anchor glitter-pool-stage__batch-action-anchor--move"
      );
      const moveAction = createPoolButton(moveActionAnchor, "glitter-pool-stage__batch-action glitter-pool-stage__batch-action--move", "", () => {
        actions.onBrowseOverlayToggle?.("batch");
      });
      moveAction.setAttribute("aria-label", controls.labels?.moveSelectedToPoolLabel ?? DEFAULT_BROWSE_LABELS.moveSelectedToPoolLabel);
      moveAction.setAttribute("aria-expanded", activeOverlay === "batch" ? "true" : "false");
      createPoolCardMenuIcon(moveAction, "move");

      if (activeOverlay === "batch") {
        const menu = createPoolNode(
          moveActionAnchor,
          "div",
          "glitter-pool-stage__toolbar-menu glitter-pool-stage__toolbar-menu--batch"
        );
        createPoolNode(menu, "strong", "glitter-pool-stage__toolbar-menu-title", labels.moveToLabel);
        renderMoveTargetButtons(menu, state.poolOptions, {
          disabled: !controls.hasSelection,
          labels,
          onSelect(poolId) {
            actions.onMoveSelectionToPool?.(poolId);
          }
        });
        const createPoolActionButton = createPoolButton(menu, "glitter-pool-stage__toolbar-menu-create", "", () => {
          actions.onMoveSelectionToPool?.(CREATE_NEW_POOL_ID);
        });
        createPoolActionButton.disabled = !controls.hasSelection;
        createPoolActionButton.setAttribute("aria-label", labels.newPoolLabel);
        createPoolNode(createPoolActionButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--plus");
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


  return {
    patchRenderedBrowseWorkbench,
    renderBrowseWorkbench
  };
}
