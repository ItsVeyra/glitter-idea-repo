/**
 * 保护搜索视图宿主的状态与事件连线相关行为，避免后续重构时出现静默回退。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// 预先收口可重置的依赖替身，方便验证对外协作。
const {
  buildSearchViewStateFromRuntimeMock,
  renderSearchViewMock,
  toastShowMock
} = vi.hoisted(() => ({
  buildSearchViewStateFromRuntimeMock: vi.fn(),
  renderSearchViewMock: vi.fn(),
  toastShowMock: vi.fn()
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/ui/search/search-state", () => ({
  buildSearchViewStateFromRuntime: buildSearchViewStateFromRuntimeMock
}));

vi.mock("../../src/ui/search/render-search", () => ({
  renderSearchView: renderSearchViewMock
}));

vi.mock("../../src/feedback/toast-service", () => ({
  createToastService: () => ({
    show: toastShowMock
  })
}));

import { GlitterSearchView } from "../../src/views/search-view";

type IdeaResult = { id: string; title: string; poolId: string; updatedAt: string };

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// 覆盖视图宿主在生命周期、渲染与回调桥接上的核心契约。
describe("GlitterSearchView", () => {
  beforeEach(() => {
    buildSearchViewStateFromRuntimeMock.mockReset();
    renderSearchViewMock.mockReset();
    toastShowMock.mockReset();
  });

  it("returns the sparkle icon for the search view tab", () => {
    const view = new GlitterSearchView({} as any, {} as any);

    expect(view.getIcon()).toBe("glitter-idea-plugin-sparkles");
  });

  it("loads runtime search state even when review mode is enabled", async () => {
    const queryIdeas = vi.fn(async () => [
      {
        id: "idea-1",
        title: "Runtime result",
        poolId: "pool-default",
        updatedAt: "2026-04-12T00:00:00.000Z"
      }
    ]);

    const plugin = {
      settings: {
        enableDesignReviewMode: true,
        reviewScenario: "search-batch"
      },
      ideaService: {
        queryIdeas
      }
    };

    const runtimeState = { mode: "results" };
    buildSearchViewStateFromRuntimeMock.mockReturnValue(runtimeState);

    const view = new GlitterSearchView({} as any, plugin as any);
    await view.onOpen();

    expect(queryIdeas).toHaveBeenCalledWith({ text: "", sort: "updatedAt-desc" });
    expect(buildSearchViewStateFromRuntimeMock).toHaveBeenCalledWith({
      query: "",
      results: [
        {
          id: "idea-1",
          title: "Runtime result",
          meta: "pool-default · Updated 2026-04-12T00:00:00.000Z",
          selected: false
        }
      ],
      selectedCount: 0
    });
    expect(renderSearchViewMock).toHaveBeenCalledWith(
      view.contentEl,
      runtimeState,
      expect.objectContaining({
        onQuerySubmit: expect.any(Function),
        onResultSelect: expect.any(Function),
        onBatchAction: expect.any(Function)
      })
    );
  });

  it("loads runtime search results in non-review mode", async () => {
    const queryIdeas = vi.fn(async () => [
      {
        id: "idea-1",
        title: "Runtime result",
        poolId: "pool-default",
        updatedAt: "2026-04-12T00:00:00.000Z"
      }
    ]);

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "search-results"
      },
      ideaService: {
        queryIdeas
      }
    };

    const runtimeState = { mode: "results" };
    buildSearchViewStateFromRuntimeMock.mockReturnValue(runtimeState);

    const view = new GlitterSearchView({} as any, plugin as any);
    await view.onOpen();

    expect(queryIdeas).toHaveBeenCalledWith({ text: "", sort: "updatedAt-desc" });
    expect(buildSearchViewStateFromRuntimeMock).toHaveBeenCalledWith({
      query: "",
      results: [
        {
          id: "idea-1",
          title: "Runtime result",
          meta: "pool-default · Updated 2026-04-12T00:00:00.000Z",
          selected: false
        }
      ],
      selectedCount: 0
    });
    expect(renderSearchViewMock).toHaveBeenCalledWith(
      view.contentEl,
      runtimeState,
      expect.objectContaining({
        onQuerySubmit: expect.any(Function),
        onResultSelect: expect.any(Function),
        onBatchAction: expect.any(Function)
      })
    );
  });

  it("hydrates query from view state and reruns runtime search with the incoming home query", async () => {
    const queryIdeas = vi.fn<() => Promise<IdeaResult[]>>(async () => [])
      .mockImplementationOnce(async () => [
        {
          id: "idea-initial",
          title: "Initial",
          poolId: "pool-default",
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ])
      .mockImplementationOnce(async () => [
        {
          id: "idea-home",
          title: "已创建文件",
          poolId: "pool-file",
          updatedAt: "2026-04-12T01:00:00.000Z"
        }
      ]);

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "search-results"
      },
      ideaService: {
        queryIdeas
      }
    };

    buildSearchViewStateFromRuntimeMock.mockImplementation((runtime) => ({
      mode: "results",
      ...runtime
    }));

    const view = new GlitterSearchView({} as any, plugin as any);
    await view.onOpen();
    queryIdeas.mockClear();
    buildSearchViewStateFromRuntimeMock.mockClear();

    await view.setState({ query: "已创建文件" }, { history: false });
    await Promise.resolve();
    await Promise.resolve();

    expect(queryIdeas).toHaveBeenCalledWith({ text: "已创建文件", sort: "updatedAt-desc" });
    expect(buildSearchViewStateFromRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "已创建文件",
        results: [expect.objectContaining({ id: "idea-home" })]
      })
    );
    expect(view.getState()).toEqual({ query: "已创建文件" });
  });

  it("suppresses stale async search results from older render generations", async () => {
    const oldRequest = createDeferred<IdeaResult[]>();
    const newRequest = createDeferred<IdeaResult[]>();

    const queryIdeas = vi.fn<() => Promise<IdeaResult[]>>(async () => [])
      .mockImplementationOnce(async () => [
        {
          id: "idea-initial",
          title: "Initial",
          poolId: "pool-default",
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ])
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise);

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "search-results"
      },
      ideaService: {
        queryIdeas
      }
    };

    buildSearchViewStateFromRuntimeMock.mockImplementation((runtime) => ({
      mode: "results",
      ...runtime
    }));

    const view = new GlitterSearchView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderSearchViewMock.mock.calls.at(-1)?.[2] as {
      onQuerySubmit: () => void;
    };
    actions.onQuerySubmit();

    actions = renderSearchViewMock.mock.calls.at(-1)?.[2] as {
      onQuerySubmit: () => void;
    };
    actions.onQuerySubmit();

    newRequest.resolve([
      {
        id: "idea-new",
        title: "New",
        poolId: "pool-default",
        updatedAt: "2026-04-12T01:00:00.000Z"
      }
    ]);
    await Promise.resolve();

    oldRequest.resolve([
      {
        id: "idea-old",
        title: "Old",
        poolId: "pool-default",
        updatedAt: "2026-04-12T00:30:00.000Z"
      }
    ]);
    await Promise.resolve();

    expect(buildSearchViewStateFromRuntimeMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        results: [expect.objectContaining({ id: "idea-new" })]
      })
    );
  });

  it("suppresses rendering when async search resolves after close", async () => {
    const deferred = createDeferred<IdeaResult[]>();
    const queryIdeas = vi.fn(() => deferred.promise);

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "search-results"
      },
      ideaService: {
        queryIdeas
      }
    };

    const view = new GlitterSearchView({} as any, plugin as any);
    const openPromise = view.onOpen();
    await view.onClose();

    deferred.resolve([
      {
        id: "idea-late",
        title: "Late",
        poolId: "pool-default",
        updatedAt: "2026-04-12T00:00:00.000Z"
      }
    ]);

    await openPromise;

    expect(renderSearchViewMock).not.toHaveBeenCalled();
  });

  it("shows toast when search query fails and keeps current selection", async () => {
    const queryIdeas = vi.fn<() => Promise<IdeaResult[]>>(async () => [])
      .mockImplementationOnce(async () => [
        {
          id: "idea-1",
          title: "Runtime result",
          poolId: "pool-default",
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ])
      .mockImplementationOnce(async () => [
        {
          id: "idea-1",
          title: "Runtime result",
          poolId: "pool-default",
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ])
      .mockRejectedValueOnce(new Error("query failed"));

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "search-results"
      },
      ideaService: {
        queryIdeas
      }
    };

    buildSearchViewStateFromRuntimeMock.mockImplementation((runtime) => ({
      mode: "results",
      ...runtime
    }));

    const view = new GlitterSearchView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderSearchViewMock.mock.calls.at(-1)?.[2] as {
      onResultSelect: (id: string) => void;
      onQuerySubmit: () => void;
    };

    actions.onResultSelect("idea-1");
    await Promise.resolve();

    actions = renderSearchViewMock.mock.calls.at(-1)?.[2] as {
      onQuerySubmit: () => void;
      onResultSelect: (id: string) => void;
    };

    actions.onQuerySubmit();
    await Promise.resolve();
    await Promise.resolve();

    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        message: expect.stringContaining("搜索")
      })
    );

    expect(buildSearchViewStateFromRuntimeMock).toHaveBeenCalledTimes(2);
    expect(buildSearchViewStateFromRuntimeMock.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        selectedCount: 1,
        results: [expect.objectContaining({ id: "idea-1", selected: true })]
      })
    );
  });

  it("clears mounted content on close", async () => {
    const view = new GlitterSearchView({} as any, { settings: {} } as any);
    const emptySpy = vi.fn();
    view.contentEl = { empty: emptySpy } as any;

    await view.onClose();

    expect(emptySpy).toHaveBeenCalledOnce();
  });
});
