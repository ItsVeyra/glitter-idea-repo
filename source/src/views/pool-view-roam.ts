import type { PoolRoamBoundaryAnchorState, PoolRoamPanelState } from "../ui/pool/pool-state";
import type { PoolRoamCanvasHost } from "./pool-roam-canvas-host";

export interface PoolViewRoamController {
  buildPanelState(input: {
    open: boolean;
    boardPath?: string;
    historyEnabled: boolean;
    boundaryAnchors?: PoolRoamBoundaryAnchorState[];
    errorMessage?: string;
    floatingActions?: PoolRoamPanelState["floatingActions"];
    panelWidthRatio?: number;
  }): PoolRoamPanelState;
  rememberSessionBoundaryAnchor(anchor: Omit<PoolRoamBoundaryAnchorState, "visibleBridge">): void;
  readSessionBoundaryAnchors(activePoolId?: string): PoolRoamBoundaryAnchorState[];
  clearSession(): void;
  syncInlinePanel(containerEl: HTMLElement | null, panelState: PoolRoamPanelState | undefined): Promise<void>;
  destroy(): void;
}

function clearContainer(containerEl: HTMLElement): void {
  const withEmpty = containerEl as HTMLElement & { empty?: () => void };
  if (typeof withEmpty.empty === "function") {
    withEmpty.empty();
    return;
  }

  while (containerEl.firstChild) {
    containerEl.removeChild(containerEl.firstChild);
  }
}

export function createPoolViewRoamController(deps: { canvasHost?: PoolRoamCanvasHost } = {}): PoolViewRoamController {
  const sessionBoundaryAnchors = new Map<string, Omit<PoolRoamBoundaryAnchorState, "visibleBridge">>();
  let mountedInlineBoardPath: string | null = null;
  let mountedInlineContainerEl: HTMLElement | null = null;

  function resetMountedInlineBoard(): void {
    mountedInlineBoardPath = null;
    mountedInlineContainerEl = null;
  }

  return {
    buildPanelState(input) {
      const mode = input.errorMessage ? "error" : input.boardPath ? "board" : "empty";

      return {
        open: input.open,
        mode,
        ...(input.boardPath ? { boardPath: input.boardPath } : {}),
        historyEnabled: input.historyEnabled,
        floatingActions: [...(input.floatingActions ?? ["download", "share", "history"])],
        boundaryAnchors: (input.boundaryAnchors ?? []).map((anchor) => ({ ...anchor })),
        ...(input.panelWidthRatio !== undefined ? { panelWidthRatio: input.panelWidthRatio } : {}),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {})
      };
    },

    rememberSessionBoundaryAnchor(anchor) {
      sessionBoundaryAnchors.set(anchor.anchorId, { ...anchor });
    },

    readSessionBoundaryAnchors(_activePoolId) {
      return Array.from(sessionBoundaryAnchors.values()).map((anchor) => ({
        ...anchor,
        visibleBridge: true
      }));
    },

    clearSession() {
      sessionBoundaryAnchors.clear();
    },

    async syncInlinePanel(containerEl, panelState) {
      if (!containerEl) {
        deps.canvasHost?.destroy();
        resetMountedInlineBoard();
        return;
      }

      if (!panelState?.open || panelState.mode !== "board" || !panelState.boardPath) {
        deps.canvasHost?.destroy();
        resetMountedInlineBoard();
        return;
      }

      if (mountedInlineContainerEl === containerEl && mountedInlineBoardPath === panelState.boardPath) {
        return;
      }

      clearContainer(containerEl);

      if (!deps.canvasHost) {
        resetMountedInlineBoard();
        return;
      }

      await deps.canvasHost.mountInlineBoard(containerEl, panelState.boardPath);
      mountedInlineContainerEl = containerEl;
      mountedInlineBoardPath = panelState.boardPath;
    },

    destroy() {
      sessionBoundaryAnchors.clear();
      resetMountedInlineBoard();
      deps.canvasHost?.destroy();
    }
  };
}
