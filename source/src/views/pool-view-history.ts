/*
Copyright (C) 2026 ItsVeyra

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3 of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

export type PoolViewScope = "pool" | "global-status";
export type PoolViewStatus = "all" | "referenced" | "file-created" | "with-markers";
export type PoolViewContentFilter = "all" | "text" | "link" | "image" | "video";
export type PoolViewSort = "updated-desc" | "created-desc" | "title-asc";

export type PoolViewNavigationOptions = {
  poolId?: string;
  mode?: "browse";
  resetFilters?: boolean;
  scope?: PoolViewScope;
  status?: PoolViewStatus;
};

export type PoolViewHistoryState = PoolViewNavigationOptions & {
  query?: string;
  contentFilter?: PoolViewContentFilter;
  sort?: PoolViewSort;
  batchMode?: boolean;
  poolMarkdownPreviewOpen?: boolean;
  poolRoamOpen?: boolean;
  poolRoamBoardPath?: string;
};

export type PoolViewLocalState = {
  activePoolId: string | undefined;
  pendingNavigationPoolId: string | undefined;
  navigationMode: "browse";
  browseScope: PoolViewScope;
  query: string;
  queryDraft: string;
  status: PoolViewStatus;
  contentFilter: PoolViewContentFilter;
  sort: PoolViewSort;
  batchMode: boolean;
  poolMarkdownPreviewOpen: boolean;
  poolRoamOpen: boolean;
  poolRoamBoardPath: string | undefined;
};

export type PoolViewLocalStateResult = PoolViewLocalState & {
  clearSelection: boolean;
  clearBrowseOverlay: boolean;
  disablePoolMarkdownPreview: boolean;
  disablePoolRoam: boolean;
};

function isPoolViewMode(value: unknown): value is "browse" {
  return value === "browse";
}

function isPoolViewScope(value: unknown): value is PoolViewScope {
  return value === "pool" || value === "global-status";
}

function isPoolViewStatus(value: unknown): value is PoolViewStatus {
  return value === "all" || value === "referenced" || value === "file-created" || value === "with-markers";
}

function isPoolViewSort(value: unknown): value is PoolViewSort {
  return value === "updated-desc" || value === "created-desc" || value === "title-asc";
}

function isPoolContentFilter(value: unknown): value is PoolViewContentFilter {
  return value === "all" || value === "text" || value === "link" || value === "image" || value === "video";
}

function withPoolRoamDefaults(current: PoolViewLocalState): PoolViewLocalState {
  return {
    ...current,
    poolRoamOpen: current.poolRoamOpen === true,
    poolRoamBoardPath: current.poolRoamBoardPath
  };
}

export function readPoolViewState(state: unknown): PoolViewHistoryState {
  if (!state || typeof state !== "object") {
    return {};
  }

  const value = state as Record<string, unknown>;
  const nextState: PoolViewHistoryState = {};

  if (Object.prototype.hasOwnProperty.call(value, "poolId") && typeof value.poolId === "string") {
    nextState.poolId = value.poolId;
  }

  if (Object.prototype.hasOwnProperty.call(value, "mode") && isPoolViewMode(value.mode)) {
    nextState.mode = value.mode;
  }

  if (Object.prototype.hasOwnProperty.call(value, "scope") && isPoolViewScope(value.scope)) {
    nextState.scope = value.scope;
  }

  if (Object.prototype.hasOwnProperty.call(value, "resetFilters") && typeof value.resetFilters === "boolean") {
    nextState.resetFilters = value.resetFilters;
  }

  if (typeof value.query === "string") {
    nextState.query = value.query;
  }

  if (isPoolViewStatus(value.status)) {
    nextState.status = value.status;
  }

  if (isPoolViewSort(value.sort)) {
    nextState.sort = value.sort;
  }

  if (isPoolContentFilter(value.contentFilter)) {
    nextState.contentFilter = value.contentFilter;
  }

  if (typeof value.batchMode === "boolean") {
    nextState.batchMode = value.batchMode;
  }

  if (typeof value.poolMarkdownPreviewOpen === "boolean") {
    nextState.poolMarkdownPreviewOpen = value.poolMarkdownPreviewOpen;
  }

  if (typeof value.poolRoamOpen === "boolean") {
    nextState.poolRoamOpen = value.poolRoamOpen;
  }

  if (typeof value.poolRoamBoardPath === "string") {
    nextState.poolRoamBoardPath = value.poolRoamBoardPath;
  }

  return nextState;
}

export function applyPoolViewHistoryState(
  current: PoolViewLocalState,
  nextState: PoolViewHistoryState
): PoolViewLocalStateResult {
  const next = withPoolRoamDefaults(current);
  let clearSelection = false;
  let clearBrowseOverlay = false;

  if (nextState.mode !== undefined) {
    next.navigationMode = nextState.mode;
  }

  if (nextState.scope !== undefined) {
    next.browseScope = nextState.scope;
  }

  if (nextState.poolId !== undefined) {
    if (nextState.scope === undefined) {
      next.browseScope = "pool";
    }
    next.activePoolId = nextState.poolId;
    next.pendingNavigationPoolId = nextState.poolId;
    next.navigationMode = "browse";
    clearSelection = true;
  } else {
    next.pendingNavigationPoolId = undefined;
  }

  if (nextState.resetFilters) {
    next.query = "";
    next.queryDraft = "";
    next.status = "all";
    next.contentFilter = "all";
    next.batchMode = false;
    clearSelection = true;
    clearBrowseOverlay = true;
  }

  if (nextState.query !== undefined) {
    next.query = nextState.query;
    next.queryDraft = nextState.query;
  }

  if (nextState.status !== undefined) {
    next.status = nextState.status;
  }

  if (nextState.sort !== undefined) {
    next.sort = nextState.sort;
  }

  if (nextState.contentFilter !== undefined) {
    next.contentFilter = nextState.contentFilter;
  }

  if (nextState.batchMode !== undefined) {
    next.batchMode = nextState.batchMode;
  }

  next.poolMarkdownPreviewOpen = nextState.poolMarkdownPreviewOpen === true;

  if (nextState.poolRoamOpen === true) {
    next.poolRoamOpen = true;
    next.poolRoamBoardPath = nextState.poolRoamBoardPath;
    next.poolMarkdownPreviewOpen = false;
  } else {
    if (nextState.poolRoamBoardPath !== undefined) {
      next.poolRoamBoardPath = nextState.poolRoamBoardPath;
    }

    next.poolRoamOpen = false;
  }

  const disablePoolMarkdownPreview = next.browseScope !== "pool";
  if (disablePoolMarkdownPreview) {
    next.poolMarkdownPreviewOpen = false;
  }

  const disablePoolRoam = next.browseScope !== "pool";
  if (disablePoolRoam) {
    next.poolRoamOpen = false;
    next.poolRoamBoardPath = undefined;
  }

  return {
    ...next,
    clearSelection,
    clearBrowseOverlay,
    disablePoolMarkdownPreview,
    disablePoolRoam
  };
}

export function applyPoolViewNavigationOptions(
  current: PoolViewLocalState,
  options: PoolViewNavigationOptions
): PoolViewLocalStateResult {
  const next = withPoolRoamDefaults(current);
  let clearSelection = false;
  let clearBrowseOverlay = false;

  if (options.mode !== undefined) {
    next.navigationMode = options.mode;
  }

  if (options.scope !== undefined) {
    next.browseScope = options.scope;
  }

  const disablePoolMarkdownPreview = next.browseScope !== "pool";
  if (disablePoolMarkdownPreview) {
    next.poolMarkdownPreviewOpen = false;
  }

  const disablePoolRoam = next.browseScope !== "pool";
  if (disablePoolRoam) {
    next.poolRoamOpen = false;
    next.poolRoamBoardPath = undefined;
  }

  if (options.poolId !== undefined) {
    if (options.scope === undefined) {
      next.browseScope = "pool";
    }
    next.activePoolId = options.poolId;
    next.pendingNavigationPoolId = options.poolId;
    next.navigationMode = "browse";
    clearSelection = true;
  } else {
    next.pendingNavigationPoolId = undefined;
  }

  if (options.resetFilters) {
    next.query = "";
    next.queryDraft = "";
    next.status = "all";
    next.contentFilter = "all";
    next.batchMode = false;
    clearSelection = true;
    clearBrowseOverlay = true;
  }

  return {
    ...next,
    clearSelection,
    clearBrowseOverlay,
    disablePoolMarkdownPreview,
    disablePoolRoam
  };
}
