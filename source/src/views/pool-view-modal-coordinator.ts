import type { PoolRoamBoardRecord } from "../application/pool-workbench/pool-roam-workflow";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { CREATE_NEW_POOL_ID } from "../plugin/constants";
import type { PluginInterfaceLanguage } from "../settings/settings";
import type { PoolBrowseSnippetLocation } from "../ui/pool/pool-state";
import { PoolRoamBoardModal } from "./pool-roam-board-modal";
import { PoolRoamHistoryModal } from "./pool-roam-history-modal";
import { PoolModal } from "./pool-modal";
import { SnippetLocationsModal } from "./snippet-locations-modal";

type PoolRoamAttachResult = Awaited<ReturnType<GlitterPlugin["poolWorkbenchWorkflow"]["attachIdeaSourceToRoamBoard"]>>;
type PoolRoamBoardReadResult = Awaited<ReturnType<GlitterPlugin["poolWorkbenchWorkflow"]["readPoolRoamBoard"]>>;

type PoolRoamBoardUpdateResult = PoolRoamAttachResult | PoolRoamBoardReadResult;

type PoolViewToastService = {
  show: (input: { status: "error"; message: string }) => void;
};

export type PoolViewModalCoordinatorDeps = {
  plugin: GlitterPlugin;
  toastService: PoolViewToastService;
  isClosed: () => boolean;
  nextPoolRoamHistoryRequestVersion: () => number;
  shouldIgnorePoolRoamHistoryRequest: (requestVersion: number) => boolean;
  isPoolRoamOpen: () => boolean;
  getPoolRoamBoardPath: () => string | undefined;
  setPoolRoamBoardPath: (boardPath: string | undefined) => void;
  setPoolRoamErrorMessage: (message: string | undefined) => void;
  clearPoolRoamSession: () => void;
  preserveResultScrollOnNextRender: () => void;
  rerenderLastRenderedBrowseRuntime: () => boolean;
  renderPoolShell: () => void;
  disablePoolMarkdownPreview: () => void;
  applyPoolRoamBoardUpdate: (
    result: PoolRoamBoardUpdateResult,
    options?: { open?: boolean; forceInlineRemount?: boolean }
  ) => void;
  downloadPoolRoamBoardByPath: (boardPath: string) => Promise<void>;
  openPoolRoamShareMenuForBoard: (boardPath: string, anchorEl: HTMLElement) => void;
};

export type PoolViewModalCoordinator = {
  destroy: () => void;
  openPoolRoamHistory: () => Promise<void>;
};

export function createPoolViewModalCoordinator(
  deps: PoolViewModalCoordinatorDeps
): PoolViewModalCoordinator {
  let activePoolRoamHistoryModal: PoolRoamHistoryModal | undefined;
  let activePoolRoamBoardModal: PoolRoamBoardModal | undefined;

  const closeActivePoolRoamBoardModal = (): void => {
    activePoolRoamBoardModal?.close();
    activePoolRoamBoardModal = undefined;
  };

  const closeActivePoolRoamHistoryModal = (): void => {
    activePoolRoamHistoryModal?.close();
    activePoolRoamHistoryModal = undefined;
  };

  const rerenderAfterRoamBoardRemoval = (): void => {
    deps.preserveResultScrollOnNextRender();
    if (!deps.rerenderLastRenderedBrowseRuntime()) {
      deps.renderPoolShell();
    }
  };

  const openHistoricalRoamBoardInLivePane = async (
    boardPath: string,
    shouldApply: (() => boolean) | undefined = undefined
  ): Promise<boolean> => {
    try {
      const result = await deps.plugin.poolWorkbenchWorkflow.readPoolRoamBoard({ boardPath });
      if (deps.isClosed() || (shouldApply && !shouldApply())) {
        return false;
      }

      deps.disablePoolMarkdownPreview();
      deps.applyPoolRoamBoardUpdate(result, {
        open: true,
        forceInlineRemount: true
      });
      return true;
    } catch {
      if (deps.isClosed() || (shouldApply && !shouldApply())) {
        return false;
      }

      deps.toastService.show({
        status: "error",
        message: "Open roam board failed. Please try again."
      });
      return false;
    }
  };

  const openPoolRoamBoardModal = (boards: PoolRoamBoardRecord[], activeBoardIndex: number): void => {
    closeActivePoolRoamBoardModal();

    const historyModal = activePoolRoamHistoryModal;
    const closeLinkedPoolRoamHistoryModal = () => {
      if (activePoolRoamHistoryModal === historyModal) {
        historyModal?.close();
      }
    };

    let modal: PoolRoamBoardModal;
    const shouldApplyDirectOpenBoard = (boardPath: string, openInRoamRequestVersion: number): boolean => {
      return !deps.isClosed()
        && deps.isPoolRoamOpen()
        && !deps.getPoolRoamBoardPath()
        && activePoolRoamBoardModal === modal
        && modal.getActiveBoardPath() === boardPath
        && modal.isOpenInRoamRequestCurrent(openInRoamRequestVersion);
    };
    const shouldApplyConfirmedReplaceBoard = (
      boardPath: string,
      replacedBoardPath: string,
      openInRoamRequestVersion: number
    ): boolean => {
      return !deps.isClosed()
        && deps.isPoolRoamOpen()
        && deps.getPoolRoamBoardPath() === replacedBoardPath
        && activePoolRoamBoardModal === modal
        && modal.getActiveBoardPath() === boardPath
        && modal.isOpenInRoamRequestCurrent(openInRoamRequestVersion);
    };

    modal = new PoolRoamBoardModal(deps.plugin.app, boards, activeBoardIndex, {
      onOpenError: () => {
        deps.toastService.show({
          status: "error",
          message: "Open roam board failed. Please try again."
        });
      },
      onDownloadBoard: (board) => deps.downloadPoolRoamBoardByPath(board.path),
      onShareBoard: (board, anchorEl) => {
        deps.openPoolRoamShareMenuForBoard(board.path, anchorEl);
      },
      onAddIdeaBlock: (board, callbacks) => {
        deps.plugin.openRoamIdeaBlockPicker({
          boardPath: board.path,
          onAttached: async (result) => {
            if (deps.isPoolRoamOpen() && deps.getPoolRoamBoardPath() === result.path && !deps.isClosed()) {
              deps.disablePoolMarkdownPreview();
              deps.applyPoolRoamBoardUpdate(result, {
                open: true,
                forceInlineRemount: true
              });
            }

            let latestBoards: PoolRoamBoardRecord[] | undefined;
            try {
              latestBoards = await deps.plugin.poolWorkbenchWorkflow.listPoolRoamBoards();
            } catch {
              latestBoards = undefined;
            }

            callbacks.onAttached(latestBoards);
          }
        });
      },
      onOpenInRoam: async (board) => {
        if (deps.isPoolRoamOpen() && deps.getPoolRoamBoardPath() === board.path) {
          closeLinkedPoolRoamHistoryModal();
          return { type: "close" };
        }

        const liveBoardPath = deps.getPoolRoamBoardPath();
        if (deps.isPoolRoamOpen() && liveBoardPath) {
          const openInRoamRequestVersion = modal.getOpenInRoamRequestVersion();
          return {
            type: "confirm",
            onConfirm: async () => {
              const opened = await openHistoricalRoamBoardInLivePane(
                board.path,
                () => shouldApplyConfirmedReplaceBoard(board.path, liveBoardPath, openInRoamRequestVersion)
              );
              if (opened) {
                closeLinkedPoolRoamHistoryModal();
              }
              return opened;
            }
          };
        }

        const openInRoamRequestVersion = modal.getOpenInRoamRequestVersion();
        const opened = await openHistoricalRoamBoardInLivePane(
          board.path,
          () => shouldApplyDirectOpenBoard(board.path, openInRoamRequestVersion)
        );
        if (opened) {
          closeLinkedPoolRoamHistoryModal();
          return { type: "close" };
        }
        return { type: "keep-open" };
      },
      onClose: () => {
        if (activePoolRoamBoardModal === modal) {
          activePoolRoamBoardModal = undefined;
        }
      }
    }, {
      interfaceLanguage: deps.plugin.settings?.interfaceLanguage
    });
    activePoolRoamBoardModal = modal;
    modal.open();
  };

  return {
    destroy: () => {
      closeActivePoolRoamBoardModal();
      closeActivePoolRoamHistoryModal();
    },
    openPoolRoamHistory: async () => {
      const requestVersion = deps.nextPoolRoamHistoryRequestVersion();

      try {
        const boards = await deps.plugin.poolWorkbenchWorkflow.listPoolRoamBoards();
        if (deps.shouldIgnorePoolRoamHistoryRequest(requestVersion)) {
          return;
        }

        closeActivePoolRoamBoardModal();
        closeActivePoolRoamHistoryModal();

        let latestBoards = boards;
        const modal = new PoolRoamHistoryModal(deps.plugin.app, boards, {
          onSelectBoard: (board, index) => {
            const nextIndex = latestBoards.findIndex((entry) => entry.path === board.path);
            openPoolRoamBoardModal(latestBoards, nextIndex >= 0 ? nextIndex : index);
          },
          onDeleteBoards: async (boardPaths) => {
            try {
              await deps.plugin.poolWorkbenchWorkflow.deletePoolRoamBoards(boardPaths);

              const liveBoardPath = deps.getPoolRoamBoardPath();
              if (liveBoardPath && boardPaths.includes(liveBoardPath)) {
                deps.setPoolRoamBoardPath(undefined);
                deps.setPoolRoamErrorMessage(undefined);
                deps.clearPoolRoamSession();
                rerenderAfterRoamBoardRemoval();
              }

              latestBoards = await deps.plugin.poolWorkbenchWorkflow.listPoolRoamBoards();
              return latestBoards;
            } catch (_error) {
              deps.toastService.show({
                status: "error",
                message: "Delete roam boards failed. Please try again."
              });
              throw _error;
            }
          },
          onClose: () => {
            if (activePoolRoamHistoryModal === modal) {
              activePoolRoamHistoryModal = undefined;
            }
          }
        }, {
          interfaceLanguage: deps.plugin.settings?.interfaceLanguage
        });
        activePoolRoamHistoryModal = modal;
        modal.open();
      } catch (_error) {
        if (deps.shouldIgnorePoolRoamHistoryRequest(requestVersion)) {
          return;
        }

        deps.toastService.show({
          status: "error",
          message: "Load roam history failed. Please try again."
        });
      }
    }
  };
}

export function openCreatePoolModalForSelection(input: {
  plugin: GlitterPlugin;
  onPoolChosen: (poolId: string) => void;
}): void {
  const modal = new PoolModal(
    input.plugin,
    "create",
    {
      onPoolChosen: (poolId) => {
        if (poolId === CREATE_NEW_POOL_ID) {
          return;
        }

        input.onPoolChosen(poolId);
      }
    },
    {
      flowContext: "global"
    }
  );
  modal.open();
}

export function openSnippetLocationsModal(input: {
  app: unknown;
  locations: PoolBrowseSnippetLocation[];
  interfaceLanguage?: PluginInterfaceLanguage;
  onOpenLocation: (location: PoolBrowseSnippetLocation) => Promise<void>;
}): void {
  const modal = new SnippetLocationsModal(
    input.app,
    input.locations,
    input.onOpenLocation,
    input.interfaceLanguage
  );
  modal.open();
}
