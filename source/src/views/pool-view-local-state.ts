import type { PoolBrowseOverlay } from "../ui/pool/pool-state";
import type { PoolViewLocalState, PoolViewLocalStateResult } from "./pool-view-history";

export type PoolViewLocalStateSnapshotInput = {
  activePoolId: PoolViewLocalState["activePoolId"];
  pendingNavigationPoolId: PoolViewLocalState["pendingNavigationPoolId"];
  navigationMode: PoolViewLocalState["navigationMode"];
  browseScope: PoolViewLocalState["browseScope"];
  query: PoolViewLocalState["query"];
  queryDraft: PoolViewLocalState["queryDraft"];
  status: PoolViewLocalState["status"];
  contentFilter: PoolViewLocalState["contentFilter"];
  sort: PoolViewLocalState["sort"];
  batchMode: PoolViewLocalState["batchMode"];
  poolMarkdownPreviewOpen: PoolViewLocalState["poolMarkdownPreviewOpen"];
  poolRoamOpen: PoolViewLocalState["poolRoamOpen"];
  poolRoamBoardPath: PoolViewLocalState["poolRoamBoardPath"];
};

export function snapshotPoolViewLocalState(input: PoolViewLocalStateSnapshotInput): PoolViewLocalState {
  return {
    activePoolId: input.activePoolId,
    pendingNavigationPoolId: input.pendingNavigationPoolId,
    navigationMode: input.navigationMode,
    browseScope: input.browseScope,
    query: input.query,
    queryDraft: input.queryDraft,
    status: input.status,
    contentFilter: input.contentFilter,
    sort: input.sort,
    batchMode: input.batchMode,
    poolMarkdownPreviewOpen: input.poolMarkdownPreviewOpen,
    poolRoamOpen: input.poolRoamOpen,
    poolRoamBoardPath: input.poolRoamBoardPath
  };
}

export type PoolViewLocalStateApplicationInput = {
  result: PoolViewLocalStateResult;
  poolRoamBoardPath: PoolViewLocalState["poolRoamBoardPath"];
  poolRoamErrorMessage: string | undefined;
  poolRoamBackConfirmVisible: boolean;
  activeBrowseOverlay: PoolBrowseOverlay | undefined;
};

export type PoolViewLocalStateApplication = {
  nextState: PoolViewLocalStateSnapshotInput & {
    poolRoamErrorMessage: string | undefined;
    poolRoamBackConfirmVisible: boolean;
  };
  shouldClearPoolRoamSession: boolean;
  shouldClearSelection: boolean;
  shouldClearBrowseOverlay: boolean;
  shouldDisablePoolMarkdownPreview: boolean;
  shouldDisablePoolRoam: boolean;
};

export function applyPoolViewLocalStateResult(
  input: PoolViewLocalStateApplicationInput
): PoolViewLocalStateApplication {
  const nextPoolRoamOpen = input.result.poolRoamOpen === true;
  const shouldClearPoolRoamSession = !nextPoolRoamOpen || input.result.poolRoamBoardPath !== input.poolRoamBoardPath;
  const shouldCloseBrowseMoreOverlay = !nextPoolRoamOpen && input.activeBrowseOverlay === "browse-more";

  return {
    nextState: {
      activePoolId: input.result.activePoolId,
      pendingNavigationPoolId: input.result.pendingNavigationPoolId,
      navigationMode: input.result.navigationMode,
      browseScope: input.result.browseScope,
      query: input.result.query,
      queryDraft: input.result.queryDraft,
      status: input.result.status,
      contentFilter: input.result.contentFilter,
      sort: input.result.sort,
      batchMode: input.result.batchMode,
      poolMarkdownPreviewOpen: input.result.poolMarkdownPreviewOpen,
      poolRoamOpen: nextPoolRoamOpen,
      poolRoamBoardPath: input.result.poolRoamBoardPath,
      poolRoamErrorMessage: shouldClearPoolRoamSession ? undefined : input.poolRoamErrorMessage,
      poolRoamBackConfirmVisible: nextPoolRoamOpen ? input.poolRoamBackConfirmVisible : false
    },
    shouldClearPoolRoamSession,
    shouldClearSelection: input.result.clearSelection,
    shouldClearBrowseOverlay: input.result.clearBrowseOverlay || shouldCloseBrowseMoreOverlay,
    shouldDisablePoolMarkdownPreview: input.result.disablePoolMarkdownPreview,
    shouldDisablePoolRoam: input.result.disablePoolRoam
  };
}
