import {
  DEFAULT_POOL_ROAM_PANEL_WIDTH_RATIO,
  MAX_POOL_ROAM_PANEL_WIDTH_RATIO,
  MIN_POOL_ROAM_PANEL_WIDTH_RATIO,
  type PoolViewState
} from "./pool-state";
import {
  clearPoolContainer,
  createPoolButton,
  createPoolNode,
  setPoolClassToken,
  setPoolInlineStyle
} from "./pool-dom";
import { resolveRoamBridgeLayout } from "./pool-roam-bridge-layout";

const POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY = "__glitterPoolRoamBridgeLayoutCleanup";
const POOL_ROAM_PANE_RESIZE_CLEANUP_KEY = "__glitterPoolRoamPaneResizeCleanup";

export interface PoolRoamBridgeRuntimeActions {
  onSetPoolRoamPaneRatio?: (ratio: number) => void;
  onLocatePoolRoamSource?: (ideaId: string) => void;
  onDeletePoolRoamSourceLink?: (anchorId: string) => void;
}

export function disconnectPoolRoamBridgeLayoutSync(workbench: HTMLElement): void {
  const withCleanup = workbench as HTMLElement & {
    [POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY]?: () => void;
  };

  const cleanup = withCleanup[POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY];
  if (typeof cleanup === "function") {
    cleanup();
  }

  withCleanup[POOL_ROAM_BRIDGE_LAYOUT_CLEANUP_KEY] = undefined;
}

export function disconnectPoolRoamBridgeLayoutSyncWithin(containerEl: HTMLElement): void {
  const existingWorkbench = containerEl.querySelector?.(".glitter-pool-stage__workbench") as HTMLElement | null;
  if (!existingWorkbench) {
    return;
  }

  disconnectPoolRoamBridgeLayoutSync(existingWorkbench);
}

export function disconnectPoolRoamPaneResize(workbench: HTMLElement): void {
  const withCleanup = workbench as HTMLElement & {
    [POOL_ROAM_PANE_RESIZE_CLEANUP_KEY]?: () => void;
  };

  const cleanup = withCleanup[POOL_ROAM_PANE_RESIZE_CLEANUP_KEY];
  if (typeof cleanup === "function") {
    cleanup();
  }

  withCleanup[POOL_ROAM_PANE_RESIZE_CLEANUP_KEY] = undefined;
}

export function disconnectPoolRoamPaneResizeWithin(containerEl: HTMLElement): void {
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
function clampPoolRoamPaneRatio(ratio: number | undefined): number {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) {
    return DEFAULT_POOL_ROAM_PANEL_WIDTH_RATIO;
  }

  return Math.min(MAX_POOL_ROAM_PANEL_WIDTH_RATIO, Math.max(MIN_POOL_ROAM_PANEL_WIDTH_RATIO, ratio));
}

export function applyPoolRoamWorkbenchLayout(workbench: HTMLElement, ratio: number | undefined): number {
  const nextRatio = clampPoolRoamPaneRatio(ratio);
  const poolWidthPercent = (1 - nextRatio) * 100;
  const roamWidthPercent = nextRatio * 100;
  setPoolInlineStyle(
    workbench,
    "gridTemplateColumns",
    `minmax(0, ${poolWidthPercent.toFixed(4)}%) minmax(0, ${roamWidthPercent.toFixed(4)}%)`
  );

  const divider = workbench.querySelector(".glitter-pool-stage__roam-divider") as HTMLElement | null;
  if (divider) {
    setPoolInlineStyle(divider, "left", `${poolWidthPercent.toFixed(4)}%`);
  }

  return nextRatio;
}

export function bindPoolRoamPaneResize(workbench: HTMLElement, actions: PoolRoamBridgeRuntimeActions, ratio: number | undefined): void {
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
    setPoolClassToken(workbench, "glitter-pool-stage__workbench--roam-resizing", false);
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

  const handleDividerMouseDown = (event: Event): void => {
    const mouseEvent = event as MouseEvent & { button?: number };
    if (mouseEvent.button !== undefined && mouseEvent.button !== 0) {
      return;
    }

    mouseEvent.preventDefault?.();
    mouseEvent.stopPropagation?.();
    dragging = true;
    setPoolClassToken(workbench, "glitter-pool-stage__workbench--roam-resizing", true);
    if (typeof mouseEvent.clientX === "number") {
      syncRatioFromClientX(mouseEvent.clientX);
    }
    ownerDocument.addEventListener("mousemove", handleMouseMove);
    ownerDocument.addEventListener("mouseup", handleMouseUp);
  };

  divider.addEventListener("mousedown", handleDividerMouseDown);

  const withCleanup = workbench as HTMLElement & {
    [POOL_ROAM_PANE_RESIZE_CLEANUP_KEY]?: () => void;
  };
  withCleanup[POOL_ROAM_PANE_RESIZE_CLEANUP_KEY] = () => {
    dragging = false;
    setPoolClassToken(workbench, "glitter-pool-stage__workbench--roam-resizing", false);
    divider.removeEventListener?.("mousedown", handleDividerMouseDown);
    ownerDocument.removeEventListener("mousemove", handleMouseMove);
    ownerDocument.removeEventListener("mouseup", handleMouseUp);
    withCleanup[POOL_ROAM_PANE_RESIZE_CLEANUP_KEY] = undefined;
  };
}
export function syncRoamBridgeLaneLayout(workbench: HTMLElement): void {
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

    setPoolInlineStyle(trace, "top", `${layout.traceTop}px`);
    setPoolInlineStyle(trace, "left", `${layout.traceLeft}px`);
    setPoolInlineStyle(trace, "width", `${layout.traceWidth}px`);
    setPoolInlineStyle(trace, "height", `${layout.traceHeight}px`);

    const segmentHost = trace.querySelector("[data-glitter-pool-roam-bridge-segments]") as HTMLElement | null;
    const hoverZone = trace.querySelector(".glitter-pool-stage__roam-bridge-hover-zone") as HTMLElement | null;
    const marker = trace.querySelector(".glitter-pool-stage__roam-bridge-marker") as HTMLElement | null;
    const popover = trace.querySelector(".glitter-pool-stage__roam-bridge-popover") as HTMLElement | null;

    if (segmentHost) {
      clearPoolContainer(segmentHost);
      layout.segments.forEach((segment) => {
        const line = createPoolNode(
          segmentHost,
          "span",
          `glitter-pool-stage__roam-bridge-line glitter-pool-stage__roam-bridge-line--${segment.axis}`
        );
        line.setAttribute("data-glitter-pool-roam-bridge-segment", segment.axis);
        setPoolInlineStyle(line, "left", `${segment.left}px`);
        setPoolInlineStyle(line, "top", `${segment.top}px`);
        setPoolInlineStyle(line, "width", `${segment.width}px`);
        setPoolInlineStyle(line, "height", `${segment.height}px`);
      });
    }

    if (hoverZone) {
      setPoolInlineStyle(hoverZone, "left", `${Math.min(layout.markerX, layout.popoverX) - 12}px`);
      setPoolInlineStyle(hoverZone, "top", `${layout.markerY - 24}px`);
      setPoolInlineStyle(hoverZone, "width", `${Math.max(48, Math.abs(layout.markerX - layout.popoverX) + 24)}px`);
      setPoolInlineStyle(hoverZone, "height", "48px");
    }

    if (marker) {
      setPoolInlineStyle(marker, "left", `${layout.markerX}px`);
      setPoolInlineStyle(marker, "top", `${layout.markerY}px`);
    }

    if (popover) {
      setPoolInlineStyle(popover, "left", `${layout.popoverX}px`);
      setPoolInlineStyle(popover, "top", `${layout.popoverY}px`);
    }
  });
}

export function bindRoamBridgeLaneLayoutSync(workbench: HTMLElement): void {
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

export function renderRoamBridgeLane(workbench: HTMLElement, state: PoolViewState, actions: PoolRoamBridgeRuntimeActions): void {
  disconnectPoolRoamBridgeLayoutSync(workbench);

  if (!state.roam?.open) {
    return;
  }

  const roamLabels = state.roam.labels;
  const visibleAnchors = state.roam.boundaryAnchors.filter((anchor) => anchor.visibleBridge);
  const lane = createPoolNode(workbench, "div", "glitter-pool-stage__roam-bridge-lane");

  visibleAnchors.forEach((anchor, anchorIndex) => {
    const trace = createPoolNode(lane, "div", "glitter-pool-stage__roam-bridge-trace glitter-pool-stage__roam-bridge-trace--attached");
    trace.dataset.anchorId = anchor.anchorId;
    trace.dataset.ideaId = anchor.ideaId;
    trace.dataset.poolId = anchor.poolId;
    trace.dataset.poolName = anchor.poolName;
    trace.dataset.poolColor = anchor.poolColor;
    trace.dataset.ideaTitle = anchor.ideaTitle;
    trace.dataset.anchorIndex = `${anchorIndex}`;
    trace.dataset.anchorCount = `${visibleAnchors.length}`;
    trace.setAttribute("data-glitter-pool-roam-bridge-trace", anchor.anchorId);
    setPoolInlineStyle(trace, "color", anchor.poolColor);

    const segmentHost = createPoolNode(trace, "div", "glitter-pool-stage__roam-bridge-segments");
    segmentHost.setAttribute("data-glitter-pool-roam-bridge-segments", anchor.anchorId);

    const hoverZone = createPoolNode(trace, "span", "glitter-pool-stage__roam-bridge-hover-zone");
    hoverZone.setAttribute("aria-hidden", "true");

    const marker = createPoolNode(trace, "button", "glitter-pool-stage__roam-bridge-marker") as HTMLButtonElement;
    marker.type = "button";
    setPoolInlineStyle(marker, "background", anchor.poolColor);
    marker.setAttribute("aria-label", roamLabels?.bridgeMarkerLabel(anchor.ideaTitle) ?? `查看「${anchor.ideaTitle}」的漫游链接`);
    marker.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    const popover = createPoolNode(trace, "div", "glitter-pool-stage__roam-bridge-popover");
    createPoolNode(popover, "div", "glitter-pool-stage__roam-bridge-popover-title", anchor.ideaTitle);
    createPoolNode(popover, "div", "glitter-pool-stage__roam-bridge-popover-meta", roamLabels?.bridgeMeta(anchor.poolName) ?? `来自 ${anchor.poolName}`);
    const actionRow = createPoolNode(popover, "div", "glitter-pool-stage__roam-bridge-popover-actions");

    const locateButton = createPoolButton(actionRow, "glitter-pool-stage__roam-bridge-action", roamLabels?.locateSource ?? "定位原卡", () => {
      actions.onLocatePoolRoamSource?.(anchor.ideaId);
    });
    locateButton.setAttribute("data-glitter-pool-roam-bridge-locate", anchor.anchorId);

    const deleteButton = createPoolButton(
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
