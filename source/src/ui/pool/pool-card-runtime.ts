import {
  clearPoolInlineStyle,
  createPoolNode,
  setPoolClassToken,
  setPoolInlineStyle
} from "./pool-dom";

const POOL_CARD_MASONRY_MIN_WIDTH = 280;
const POOL_CARD_MASONRY_GAP = 12;
const POOL_CARD_MASONRY_SAFE_INSET_X_PX = 0;
const POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY = "__glitterPoolCardMasonryResizeObserver";
const POOL_CARD_ISOLATION_CLEANUP_KEY = "__glitterPoolCardIsolationCleanup";
const POOL_CARD_ISOLATION_STATE_KEY = "__glitterPoolCardIsolationState";
const POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY = "__glitterPoolCardScrollbarVisibilityCleanup";
const POOL_CARD_ISOLATION_DELAY_MS = 3000;
const POOL_CARD_ISOLATION_MAX_DISTANCE_PX = 760;
const POOL_CARD_SCROLLBAR_VISIBILITY_TIMEOUT_MS = 900;
const POOL_CARD_SCROLL_INDICATOR_TOP_INSET_PX = 14;
const POOL_CARD_SCROLL_INDICATOR_BOTTOM_INSET_PX = 24;
const POOL_CARD_SCROLL_INDICATOR_THUMB_WIDTH_PX = 8;
const POOL_CARD_SCROLL_INDICATOR_THUMB_HEIGHT_PX = 14;

type PoolCardIsolationRuntimeState = {
  activeCardId?: string | null;
  pendingCardId?: string | null;
  pendingTimer?: ReturnType<typeof setTimeout>;
};

export function disconnectPoolCardMasonry(containerEl: HTMLElement): void {
  const withObserver = containerEl as HTMLElement & {
    [POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY]?: ResizeObserver;
  };

  withObserver[POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY]?.disconnect?.();
  withObserver[POOL_CARD_MASONRY_RESIZE_OBSERVER_KEY] = undefined;
}

export function disconnectPoolCardScrollVisibility(containerEl: HTMLElement): void {
  const withCleanup = containerEl as HTMLElement & {
    [POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY]?: () => void;
  };

  const cleanup = withCleanup[POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY];
  if (typeof cleanup === "function") {
    cleanup();
  }

  withCleanup[POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY] = undefined;
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

export function setRenderedPoolCardMenuVisibility(menu: HTMLElement, open: boolean): void {
  menu.setAttribute("aria-hidden", open ? "false" : "true");
  setPoolInlineStyle(menu, "display", open ? "grid" : "none");
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

export function resetPoolCardIsolationState(containerEl: HTMLElement): void {
  const runtimeState = getPoolCardIsolationState(containerEl);
  if (runtimeState.pendingTimer !== undefined) {
    clearTimeout(runtimeState.pendingTimer);
  }

  runtimeState.pendingTimer = undefined;
  runtimeState.pendingCardId = null;
  runtimeState.activeCardId = null;
}

export function clearPoolCardIsolation(stage: HTMLElement, cardShells: HTMLElement[]): void {
  setPoolClassToken(stage, "glitter-pool-stage--card-isolation-reading", false);

  cardShells.forEach((cardShell) => {
    setPoolClassToken(cardShell, "glitter-pool-stage__card-shell--isolation-active", false);
    setPoolClassToken(cardShell, "glitter-pool-stage__card-shell--isolation-muted", false);

    const surface = cardShell.querySelector(".glitter-pool-stage__card-surface") as HTMLElement | null;
    if (!surface) {
      return;
    }

    clearPoolInlineStyle(surface, "filter");
    clearPoolInlineStyle(surface, "opacity");
    clearPoolInlineStyle(surface, "transform");
  });
}

function applyPoolCardIsolation(stage: HTMLElement, cardShells: HTMLElement[], activeCardShell: HTMLElement): void {
  setPoolClassToken(stage, "glitter-pool-stage--card-isolation-reading", true);
  const activeCenter = readCardShellCenter(activeCardShell);

  cardShells.forEach((cardShell) => {
    const surface = cardShell.querySelector(".glitter-pool-stage__card-surface") as HTMLElement | null;
    if (!surface) {
      return;
    }

    const isActive = cardShell === activeCardShell;
    setPoolClassToken(cardShell, "glitter-pool-stage__card-shell--isolation-active", isActive);
    setPoolClassToken(cardShell, "glitter-pool-stage__card-shell--isolation-muted", !isActive);

    if (isActive) {
      setPoolInlineStyle(surface, "filter", "blur(0px) saturate(1)");
      setPoolInlineStyle(surface, "opacity", "1");
      setPoolInlineStyle(surface, "transform", "translateY(-0.5px) scale(1.004)");
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

    setPoolInlineStyle(surface, "filter", `blur(${blur.toFixed(1)}px) saturate(${saturate.toFixed(3)})`);
    setPoolInlineStyle(surface, "opacity", opacity.toFixed(3));
    setPoolInlineStyle(surface, "transform", `scale(${scale.toFixed(3)})`);
  });
}

export function disconnectPoolCardIsolation(containerEl: HTMLElement): void {
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

export function bindPoolCardIsolation(containerEl: HTMLElement, stage: HTMLElement, cardShells: HTMLElement[]): void {
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

export function bindPoolCardScrollVisibility(containerEl: HTMLElement, cardGrid: HTMLElement, indicatorHost: HTMLElement): void {
  const withCleanup = containerEl as HTMLElement & {
    [POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY]?: () => void;
  };

  disconnectPoolCardScrollVisibility(containerEl);
  indicatorHost.querySelector(".glitter-pool-stage__card-scroll-indicator")?.remove();

  const indicator = createPoolNode(indicatorHost, "div", "glitter-pool-stage__card-scroll-indicator");
  indicator.setAttribute("aria-hidden", "true");
  const thumb = createPoolNode(indicator, "span", "glitter-pool-stage__card-scroll-indicator-thumb");
  thumb.setAttribute("aria-hidden", "true");
  setPoolInlineStyle(
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
    setPoolInlineStyle(indicator, "--glitter-pool-scroll-indicator-center", `${thumbCenter.toFixed(2)}px`);
  };

  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const showScrollbar = (): void => {
    updateIndicatorProgress();
    setPoolClassToken(cardGrid, "glitter-pool-stage__card-grid--scrolling", true);
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
    }
    hideTimer = setTimeout(() => {
      hideTimer = undefined;
      setPoolClassToken(cardGrid, "glitter-pool-stage__card-grid--scrolling", false);
    }, POOL_CARD_SCROLLBAR_VISIBILITY_TIMEOUT_MS);
  };

  cardGrid.addEventListener("scroll", showScrollbar);

  withCleanup[POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY] = () => {
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
    cardGrid.removeEventListener?.("scroll", showScrollbar);
    setPoolClassToken(cardGrid, "glitter-pool-stage__card-grid--scrolling", false);
    withCleanup[POOL_CARD_SCROLLBAR_VISIBILITY_CLEANUP_KEY] = undefined;
  };
}

export function applyPoolCardMasonry(cardGrid: HTMLElement, cardStack: HTMLElement, cardShells: HTMLElement[]): void {
  if (cardShells.length === 0) {
    setPoolInlineStyle(cardStack, "height", "0px");
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
    setPoolInlineStyle(cardShell, "width", `${Math.max(columnWidth, 0)}px`);
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
    setPoolInlineStyle(cardShell, "transform", `translate3d(${nextX}px, ${nextY}px, 0)`);

    const cardHeight = readElementHeight(cardShell);
    columnHeights[targetColumnIndex] = nextY + cardHeight + POOL_CARD_MASONRY_GAP;
  });

  const stackHeight = columnHeights.length > 0
    ? Math.max(...columnHeights) - POOL_CARD_MASONRY_GAP
    : 0;
  setPoolInlineStyle(cardStack, "height", `${Math.max(stackHeight, 0)}px`);
}

export function bindPoolCardMasonry(
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
