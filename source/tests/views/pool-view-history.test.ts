import { describe, expect, it } from "vitest";
import {
  applyPoolViewHistoryState,
  applyPoolViewNavigationOptions,
  readPoolViewState,
  type PoolViewLocalState
} from "../../src/views/pool-view-history";

function createLocalState(overrides: Partial<PoolViewLocalState> = {}): PoolViewLocalState {
  return {
    activePoolId: "pool-default",
    pendingNavigationPoolId: undefined,
    navigationMode: "browse",
    browseScope: "pool",
    query: "query",
    queryDraft: "query draft",
    status: "referenced",
    contentFilter: "image",
    sort: "created-desc",
    batchMode: true,
    poolMarkdownPreviewOpen: true,
    poolRoamOpen: false,
    poolRoamBoardPath: undefined,
    ...overrides
  };
}

describe("pool-view-history", () => {
  it("reads only supported history fields", () => {
    expect(
      readPoolViewState({
        poolId: "pool-product",
        mode: "browse",
        scope: "global-status",
        resetFilters: true,
        query: "alpha",
        status: "with-markers",
        contentFilter: "video",
        sort: "title-asc",
        batchMode: true,
        poolMarkdownPreviewOpen: true,
        poolRoamOpen: true,
        poolRoamBoardPath: "Boards/runtime.canvas",
        queryDraft: "should be ignored",
        clearSelection: true,
        activePoolId: "ignored"
      })
    ).toStrictEqual({
      poolId: "pool-product",
      mode: "browse",
      scope: "global-status",
      resetFilters: true,
      query: "alpha",
      status: "with-markers",
      contentFilter: "video",
      sort: "title-asc",
      batchMode: true,
      poolMarkdownPreviewOpen: true,
      poolRoamOpen: true,
      poolRoamBoardPath: "Boards/runtime.canvas"
    });
  });

  it("ignores invalid field values", () => {
    expect(
      readPoolViewState({
        poolId: 7,
        mode: "edit",
        scope: "archive",
        resetFilters: "yes",
        query: ["alpha"],
        status: "draft",
        contentFilter: "audio",
        sort: "manual",
        batchMode: "true",
        poolMarkdownPreviewOpen: 1,
        poolRoamOpen: "true",
        poolRoamBoardPath: 42
      })
    ).toStrictEqual({});
  });

  it("applyPoolViewHistoryState opens roam, keeps board path, and closes markdown preview in pool scope", () => {
    expect(
      applyPoolViewHistoryState(createLocalState(), {
        poolMarkdownPreviewOpen: true,
        poolRoamOpen: true,
        poolRoamBoardPath: "Boards/product.canvas"
      })
    ).toStrictEqual({
      activePoolId: "pool-default",
      pendingNavigationPoolId: undefined,
      navigationMode: "browse",
      browseScope: "pool",
      query: "query",
      queryDraft: "query draft",
      status: "referenced",
      contentFilter: "image",
      sort: "created-desc",
      batchMode: true,
      poolMarkdownPreviewOpen: false,
      poolRoamOpen: true,
      poolRoamBoardPath: "Boards/product.canvas",
      clearSelection: false,
      clearBrowseOverlay: false,
      disablePoolMarkdownPreview: false,
      disablePoolRoam: false
    });
  });

  it("applyPoolViewHistoryState clears a stale board path for an empty roam session", () => {
    expect(
      applyPoolViewHistoryState(
        createLocalState({
          poolMarkdownPreviewOpen: false,
          poolRoamOpen: true,
          poolRoamBoardPath: "Boards/stale.canvas"
        }),
        {
          poolRoamOpen: true
        }
      )
    ).toStrictEqual({
      activePoolId: "pool-default",
      pendingNavigationPoolId: undefined,
      navigationMode: "browse",
      browseScope: "pool",
      query: "query",
      queryDraft: "query draft",
      status: "referenced",
      contentFilter: "image",
      sort: "created-desc",
      batchMode: true,
      poolMarkdownPreviewOpen: false,
      poolRoamOpen: true,
      poolRoamBoardPath: undefined,
      clearSelection: false,
      clearBrowseOverlay: false,
      disablePoolMarkdownPreview: false,
      disablePoolRoam: false
    });
  });

  it("applyPoolViewHistoryState resets filters and suppresses preview and roam in global-status scope", () => {
    expect(
      applyPoolViewHistoryState(
        createLocalState({
          poolMarkdownPreviewOpen: false,
          poolRoamOpen: true,
          poolRoamBoardPath: "Boards/current.canvas"
        }),
        {
          scope: "global-status",
          resetFilters: true,
          poolMarkdownPreviewOpen: true,
          poolRoamOpen: true,
          poolRoamBoardPath: "Boards/ignored.canvas"
        }
      )
    ).toStrictEqual({
      activePoolId: "pool-default",
      pendingNavigationPoolId: undefined,
      navigationMode: "browse",
      browseScope: "global-status",
      query: "",
      queryDraft: "",
      status: "all",
      contentFilter: "all",
      sort: "created-desc",
      batchMode: false,
      poolMarkdownPreviewOpen: false,
      poolRoamOpen: false,
      poolRoamBoardPath: undefined,
      clearSelection: true,
      clearBrowseOverlay: true,
      disablePoolMarkdownPreview: true,
      disablePoolRoam: true
    });
  });

  it("applyPoolViewNavigationOptions keeps sort unchanged and keeps preview in pool scope", () => {
    expect(
      applyPoolViewNavigationOptions(createLocalState(), {
        poolId: "pool-product",
        resetFilters: true
      })
    ).toStrictEqual({
      activePoolId: "pool-product",
      pendingNavigationPoolId: "pool-product",
      navigationMode: "browse",
      browseScope: "pool",
      query: "",
      queryDraft: "",
      status: "all",
      contentFilter: "all",
      sort: "created-desc",
      batchMode: false,
      poolMarkdownPreviewOpen: true,
      poolRoamOpen: false,
      poolRoamBoardPath: undefined,
      clearSelection: true,
      clearBrowseOverlay: true,
      disablePoolMarkdownPreview: false,
      disablePoolRoam: false
    });
  });

  it("applyPoolViewNavigationOptions disables roam when browse scope leaves pool", () => {
    expect(
      applyPoolViewNavigationOptions(
        createLocalState({
          poolMarkdownPreviewOpen: false,
          poolRoamOpen: true,
          poolRoamBoardPath: "Boards/product.canvas"
        }),
        {
          scope: "global-status"
        }
      )
    ).toStrictEqual({
      activePoolId: "pool-default",
      pendingNavigationPoolId: undefined,
      navigationMode: "browse",
      browseScope: "global-status",
      query: "query",
      queryDraft: "query draft",
      status: "referenced",
      contentFilter: "image",
      sort: "created-desc",
      batchMode: true,
      poolMarkdownPreviewOpen: false,
      poolRoamOpen: false,
      poolRoamBoardPath: undefined,
      clearSelection: false,
      clearBrowseOverlay: false,
      disablePoolMarkdownPreview: true,
      disablePoolRoam: true
    });
  });
});
