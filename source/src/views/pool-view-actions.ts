import type GlitterPlugin from "../plugin/GlitterPlugin";
import { CREATE_NEW_POOL_ID } from "../plugin/constants";
import type { PoolBrowseOverlay } from "../ui/pool/pool-state";
import type { PoolViewActions } from "../ui/pool/render-pool";
import type { PoolViewContentFilter, PoolViewSort, PoolViewStatus } from "./pool-view-history";
import { IdeaEditModal } from "./idea-edit-modal";
import { QuickCaptureModal, type QuickCaptureSavedSelection } from "./quick-capture-modal";

type PoolBrowseRuntimeState = Awaited<ReturnType<GlitterPlugin["poolWorkbenchWorkflow"]["loadPoolState"]>>;

type PoolMetadataUpdateInput = {
  name?: string;
  description?: string;
};

export type PoolViewActionFactoryDeps = {
  plugin: GlitterPlugin;
  runtime: PoolBrowseRuntimeState;
  activePoolId: string | undefined;
  activateMainView: () => Promise<void>;
  dismissRoamBackConfirm: () => void;
  confirmRoamBackHome: () => void;
  setPoolRoamPaneRatio: (ratio: number) => void;
  closeCardMenu: (options?: { rerender?: boolean }) => void;
  renderPoolShell: () => void;
  isBatchModeEnabled: () => boolean;
  clearSelection: () => void;
  selectOnly: (ideaId: string) => void;
  toggleBatchSelection: (ideaId: string) => void;
  getQueryValue: () => string;
  setQueryValue: (query: string) => void;
  setQueryDraftValue: (query: string) => void;
  setStatusValue: (status: PoolViewStatus) => void;
  setContentFilterValue: (contentFilter: PoolViewContentFilter) => void;
  setSortValue: (sort: PoolViewSort) => void;
  preserveQueryFocusOnNextRender: () => void;
  preserveResultScrollOnNextRender: () => void;
  togglePoolRoam: () => void;
  attachPoolRoamSource: (ideaId: string) => Promise<void>;
  locatePoolRoamSource: (ideaId: string) => void;
  deletePoolRoamSourceLink: (anchorId: string) => Promise<void>;
  poolRoamBoardPath?: string;
  openPoolRoamHistory: () => Promise<void>;
  downloadPoolRoamBoard: () => Promise<void>;
  openPoolRoamShareMenu: (anchorEl: HTMLElement) => void;
  addIdeaBlockToPoolRoam: () => void;
  togglePoolMarkdownPreview: () => void;
  savePoolMarkdownFile: () => Promise<void>;
  toggleBatchMode: () => void;
  moveSelectedToPool: (poolId: string) => Promise<void>;
  createPoolForSelection: () => void;
  rerenderBrowseRuntime: () => boolean;
  deleteSelectedIdeas: () => Promise<void>;
  toggleBrowseOverlay: (overlay: PoolBrowseOverlay) => void;
  clearBrowseOverlay: () => void;
  getActiveBrowseOverlay: () => PoolBrowseOverlay | undefined;
  isCardMovePickerOpen: (ideaId: string) => boolean;
  isCardMovePickerSubmitting: (ideaId: string) => boolean;
  openCardMovePicker: (ideaId: string) => void;
  closeCardMovePicker: () => void;
  updateCardMoveSearchQuery: (query: string, options?: { isComposing?: boolean }) => void;
  getCardMovePickerSearchQuery: () => string;
  moveIdeaToPool: (ideaId: string, poolId: string) => Promise<void>;
  isCardMenuOpen: (ideaId: string) => boolean;
  toggleCardMenu: (ideaId: string) => void;
  deleteIdea: (ideaId: string) => Promise<void>;
  createIdeaFile: (ideaId: string) => Promise<void>;
  openPrimaryFileForCard: (runtime: PoolBrowseRuntimeState, ideaId: string) => Promise<void>;
  openSnippetNote: (runtime: PoolBrowseRuntimeState, ideaId: string) => Promise<void>;
  openSnippetLocations: (runtime: PoolBrowseRuntimeState, ideaId: string) => void;
  openShareMenu: (anchorEl: HTMLElement) => void;
  onPoolSwitch: (poolId: string) => void;
  updatePoolMetadata: (input: PoolMetadataUpdateInput) => Promise<void>;
};

export function createPoolViewActions(deps: PoolViewActionFactoryDeps): PoolViewActions {
  return {
    onBack: () => {
      void deps.activateMainView();
    },
    onDismissRoamBackConfirm: () => {
      deps.dismissRoamBackConfirm();
    },
    onConfirmRoamBackHome: () => {
      deps.confirmRoamBackHome();
    },
    onSetPoolRoamPaneRatio: (ratio) => {
      deps.setPoolRoamPaneRatio(ratio);
    },
    onItemSelect: (itemId) => {
      deps.closeCardMenu({ rerender: false });
      if (deps.isBatchModeEnabled()) {
        deps.preserveResultScrollOnNextRender();
        deps.toggleBatchSelection(itemId);
      } else {
        deps.selectOnly(itemId);
      }
      deps.renderPoolShell();
    },
    onCreateIdea: () => {
      deps.closeCardMenu({ rerender: false });
      if (deps.getActiveBrowseOverlay()) {
        deps.preserveResultScrollOnNextRender();
        deps.clearBrowseOverlay();
        if (!deps.rerenderBrowseRuntime()) {
          deps.renderPoolShell();
        }
      }
      const activePool = deps.runtime.poolOptions.find((pool) => pool.selected);
      const openSavedFeedback = (selection?: QuickCaptureSavedSelection): void => {
        const savedPoolId = selection?.poolId ?? deps.activePoolId;
        const savedPoolLabel = selection?.poolLabel ?? activePool?.label;
        deps.renderPoolShell();
        const feedbackModal = new QuickCaptureModal(
          deps.plugin,
          "saved-feedback",
          {
            onSaved: () => {
              openCapture();
            },
            onBackHome: () => {
              deps.renderPoolShell();
            }
          },
          {
            flowContext: "global",
            initialCreateFileChecked: selection?.createFileChecked ?? false,
            initialSelectedPoolId: savedPoolId,
            initialSelectedPoolLabel: savedPoolLabel
          }
        );
        feedbackModal.open();
      };
      const openCapture = (): void => {
        const modal = new QuickCaptureModal(
          deps.plugin,
          "capture",
          {
            onSaved: openSavedFeedback
          },
          {
            flowContext: "global",
            initialSelectedPoolId: deps.activePoolId,
            initialSelectedPoolLabel: activePool?.label
          }
        );
        modal.open();
      };
      openCapture();
    },
    onQueryChange: (query) => {
      deps.closeCardMenu({ rerender: false });
      deps.setQueryDraftValue(query);
    },
    onQuerySubmit: (query) => {
      deps.closeCardMenu({ rerender: false });
      deps.setQueryDraftValue(query);
      if (deps.getQueryValue() === query) {
        return;
      }
      deps.setQueryValue(query);
      deps.preserveQueryFocusOnNextRender();
      deps.renderPoolShell();
    },
    onStatusChange: (status) => {
      deps.closeCardMenu({ rerender: false });
      deps.clearBrowseOverlay();
      deps.setStatusValue(status);
      deps.clearSelection();
      deps.renderPoolShell();
    },
    onContentFilterChange: (contentFilter) => {
      deps.closeCardMenu({ rerender: false });
      deps.clearBrowseOverlay();
      deps.setContentFilterValue(contentFilter);
      deps.clearSelection();
      deps.renderPoolShell();
    },
    onSortChange: (sort) => {
      deps.closeCardMenu({ rerender: false });
      deps.clearBrowseOverlay();
      deps.setSortValue(sort);
      deps.clearSelection();
      deps.renderPoolShell();
    },
    onTogglePoolRoam: () => {
      deps.closeCardMenu({ rerender: false });
      deps.preserveResultScrollOnNextRender();
      deps.togglePoolRoam();
    },
    onAttachPoolRoamSource: (ideaId) => {
      deps.closeCardMenu({ rerender: false });
      deps.preserveResultScrollOnNextRender();
      void deps.attachPoolRoamSource(ideaId);
    },
    onLocatePoolRoamSource: (ideaId) => {
      deps.closeCardMenu({ rerender: false });
      deps.preserveResultScrollOnNextRender();
      deps.locatePoolRoamSource(ideaId);
    },
    onDeletePoolRoamSourceLink: (anchorId) => {
      deps.closeCardMenu({ rerender: false });
      deps.preserveResultScrollOnNextRender();
      void deps.deletePoolRoamSourceLink(anchorId);
    },
    onOpenPoolRoamHistory: () => {
      deps.preserveResultScrollOnNextRender();
      void deps.openPoolRoamHistory();
    },
    onDownloadPoolRoamImage: deps.poolRoamBoardPath
      ? () => {
          void deps.downloadPoolRoamBoard();
        }
      : undefined,
    onSharePoolRoamBoard: deps.poolRoamBoardPath
      ? (anchorEl) => {
          deps.openPoolRoamShareMenu(anchorEl);
        }
      : undefined,
    onAddPoolRoamIdeaBlock: deps.poolRoamBoardPath
      ? () => {
          deps.preserveResultScrollOnNextRender();
          deps.addIdeaBlockToPoolRoam();
        }
      : undefined,
    onTogglePoolMarkdownPreview: () => {
      deps.preserveResultScrollOnNextRender();
      deps.togglePoolMarkdownPreview();
    },
    onSavePoolMarkdownFile: () => {
      void deps.savePoolMarkdownFile();
    },
    onBatchModeToggle: () => {
      deps.closeCardMenu({ rerender: false });
      deps.preserveResultScrollOnNextRender();
      deps.toggleBatchMode();
      if (deps.rerenderBrowseRuntime()) {
        return;
      }
      deps.renderPoolShell();
    },
    onMoveSelectionToPool: (poolId) => {
      deps.closeCardMenu({ rerender: false });
      deps.preserveResultScrollOnNextRender();
      deps.clearBrowseOverlay();
      if (poolId === CREATE_NEW_POOL_ID) {
        if (!deps.rerenderBrowseRuntime()) {
          deps.renderPoolShell();
        }
        if (!deps.runtime.controls.hasSelection) {
          return;
        }
        deps.createPoolForSelection();
        return;
      }
      void deps.moveSelectedToPool(poolId);
    },
    onDeleteSelection: () => {
      deps.closeCardMenu({ rerender: false });
      deps.preserveResultScrollOnNextRender();
      void deps.deleteSelectedIdeas();
    },
    onBrowseOverlayToggle: (overlay) => {
      deps.closeCardMenu({ rerender: false });
      deps.preserveResultScrollOnNextRender();
      deps.toggleBrowseOverlay(overlay);
      if (deps.rerenderBrowseRuntime()) {
        return;
      }
      deps.renderPoolShell();
    },
    onBrowseOverlayClose: () => {
      deps.preserveResultScrollOnNextRender();
      deps.clearBrowseOverlay();
      if (deps.rerenderBrowseRuntime()) {
        return;
      }
      deps.renderPoolShell();
    },
    isCardMovePickerOpen: (ideaId) => deps.isCardMovePickerOpen(ideaId),
    isCardMovePickerSubmitting: (ideaId) => deps.isCardMovePickerSubmitting(ideaId),
    onOpenCardMovePicker: (ideaId) => {
      deps.openCardMovePicker(ideaId);
    },
    onCloseCardMovePicker: () => {
      deps.closeCardMovePicker();
    },
    onCardMovePickerSearchQueryChange: (query, options) => {
      deps.updateCardMoveSearchQuery(query, options);
    },
    getCardMovePickerSearchQuery: () => deps.getCardMovePickerSearchQuery(),
    onMoveIdeaToPool: (ideaId, poolId) => {
      void deps.moveIdeaToPool(ideaId, poolId);
    },
    isCardMenuOpen: (ideaId) => deps.isCardMenuOpen(ideaId),
    onCardMenuToggle: (ideaId) => {
      deps.toggleCardMenu(ideaId);
    },
    onEditIdea: (ideaId) => {
      deps.closeCardMenu();
      const modal = new IdeaEditModal(deps.plugin, ideaId, {
        onSaved: () => {
          deps.renderPoolShell();
        }
      });
      modal.open();
    },
    onShareIdea: (_ideaId, anchorEl) => {
      deps.closeCardMenu();
      deps.openShareMenu(anchorEl);
    },
    onDeleteIdea: (ideaId) => {
      deps.closeCardMenu();
      void deps.deleteIdea(ideaId);
    },
    onCreateFile: (ideaId) => {
      deps.closeCardMenu();
      void deps.createIdeaFile(ideaId);
    },
    onOpenPrimaryFile: (ideaId) => {
      deps.closeCardMenu();
      void deps.openPrimaryFileForCard(deps.runtime, ideaId);
    },
    onOpenSnippetNote: (ideaId) => {
      deps.closeCardMenu();
      void deps.openSnippetNote(deps.runtime, ideaId);
    },
    onOpenSnippetLocations: (ideaId) => {
      deps.closeCardMenu();
      deps.openSnippetLocations(deps.runtime, ideaId);
    },
    onPoolSwitch: (poolId) => {
      deps.closeCardMenu({ rerender: false });
      deps.clearBrowseOverlay();
      deps.onPoolSwitch(poolId);
    },
    onPoolTitleSave: (title) => {
      void deps.updatePoolMetadata({ name: title });
    },
    onPoolDescriptionSave: (description) => {
      void deps.updatePoolMetadata({ description });
    }
  };
}
