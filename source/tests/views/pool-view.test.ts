import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildPoolViewStateFromRuntimeMock,
  renderPoolViewMock,
  syncRenderedPoolCardMenusMock,
  markdownRenderMock,
  quickCaptureOpenMock,
  quickCaptureInstances,
  poolModalOpenMock,
  poolModalInstances,
  ideaEditOpenMock,
  ideaEditInstances,
  snippetLocationsOpenMock,
  snippetLocationsInstances,
  poolRoamHistoryOpenMock,
  poolRoamHistoryCloseMock,
  poolRoamHistoryInstances,
  poolRoamBoardOpenMock,
  poolRoamBoardCloseMock,
  poolRoamBoardInstances,
  menuShowAtPositionMock,
  menuItems,
  deleteIdeaMock,
  toastShowMock
} = vi.hoisted(() => ({
  buildPoolViewStateFromRuntimeMock: vi.fn(),
  renderPoolViewMock: vi.fn(),
  syncRenderedPoolCardMenusMock: vi.fn(),
  markdownRenderMock: vi.fn(),
  quickCaptureOpenMock: vi.fn(),
  quickCaptureInstances: [] as Array<{
    step: "capture" | "saved-feedback";
    handlers: {
      onSaved?: (selection?: { poolId?: string; poolLabel?: string; createFileChecked?: boolean }) => void;
    };
    options?: {
      flowContext?: "first-use" | "global";
      initialSelectedPoolId?: string;
      initialSelectedPoolLabel?: string;
    };
  }>,
  poolModalOpenMock: vi.fn(),
  poolModalInstances: [] as Array<{
    step: "choose" | "create";
    handlers: {
      onPoolChosen?: (poolId: string, poolName?: string) => void;
      onBackToChoose?: () => void;
      onBackToPrevious?: () => void;
    };
    options?: {
      flowContext?: "first-use" | "global";
      origin?: "home-secondary-action" | "quick-capture-pool-picker" | "saved-feedback" | "capture";
    };
  }>,
  ideaEditOpenMock: vi.fn(),
  ideaEditInstances: [] as Array<{
    ideaId: string;
    handlers: {
      onSaved?: (selection?: { poolId?: string; poolLabel?: string; createFileChecked?: boolean }) => void;
    };
  }>,
  snippetLocationsOpenMock: vi.fn(),
  snippetLocationsInstances: [] as Array<{
    locations: Array<{
      notePath: string;
      noteTitle: string;
      occurrenceCount: number;
      stale: boolean;
    }>;
    onOpenLocation: (location: {
      notePath: string;
      noteTitle: string;
      occurrenceCount: number;
      stale: boolean;
    }) => Promise<void>;
  }>,
  poolRoamHistoryOpenMock: vi.fn(),
  poolRoamHistoryCloseMock: vi.fn(),
  poolRoamHistoryInstances: [] as Array<{
    boards: Array<{
      path: string;
      name: string;
      updatedAt: number;
      relatedPools: Array<{ id: string; name: string; color: string }>;
      thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
    }>;
    handlers: {
      onSelectBoard?: (board: {
        path: string;
        name: string;
        updatedAt: number;
        relatedPools: Array<{ id: string; name: string; color: string }>;
        thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
      }, index: number) => void;
      onDeleteBoards?: (boardPaths: string[]) => Promise<Array<{
        path: string;
        name: string;
        updatedAt: number;
        relatedPools: Array<{ id: string; name: string; color: string }>;
        thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
      }>>;
      onClose?: () => void;
    };
    close: () => void;
  }>,
  poolRoamBoardOpenMock: vi.fn(),
  poolRoamBoardCloseMock: vi.fn(),
  poolRoamBoardInstances: [] as Array<{
    boards: Array<{
      path: string;
      name: string;
      updatedAt: number;
      relatedPools: Array<{ id: string; name: string; color: string }>;
      thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
    }>;
    activeBoardIndex: number;
    handlers: {
      onOpenError?: (error: unknown) => void;
      onClose?: () => void;
    };
    close: () => void;
    failToOpen: (error: Error) => void;
  }>,
  menuShowAtPositionMock: vi.fn(),
  menuItems: [] as Array<{ title: string; onClick?: () => void }>,
  deleteIdeaMock: vi.fn(),
  toastShowMock: vi.fn()
}));

vi.mock("../../src/ui/pool/pool-state", () => ({
  DEFAULT_POOL_ROAM_PANEL_WIDTH_RATIO: 0.6,
  MIN_POOL_ROAM_PANEL_WIDTH_RATIO: 0.2,
  MAX_POOL_ROAM_PANEL_WIDTH_RATIO: 0.8,
  buildPoolViewStateFromRuntime: buildPoolViewStateFromRuntimeMock
}));

vi.mock("../../src/ui/pool/render-pool", () => ({
  renderPoolView: renderPoolViewMock,
  syncRenderedPoolCardMenus: syncRenderedPoolCardMenusMock
}));

vi.mock("../../src/feedback/toast-service", () => ({
  createToastService: () => ({
    show: toastShowMock
  })
}));

vi.mock("../../src/views/quick-capture-modal", () => {
  class MockQuickCaptureModal {
    constructor(
      _plugin: unknown,
      step: "capture" | "saved-feedback",
      handlers: { onSaved?: (selection?: { poolId?: string; poolLabel?: string; createFileChecked?: boolean }) => void },
      options?: {
        flowContext?: "first-use" | "global";
        initialSelectedPoolId?: string;
        initialSelectedPoolLabel?: string;
      }
    ) {
      quickCaptureInstances.push({ step, handlers, options });
    }

    open() {
      quickCaptureOpenMock();
    }
  }

  return {
    QuickCaptureModal: MockQuickCaptureModal
  };
});

vi.mock("../../src/views/pool-modal", () => {
  class MockPoolModal {
    constructor(
      _plugin: unknown,
      step: "choose" | "create",
      handlers: {
        onPoolChosen?: (poolId: string, poolName?: string) => void;
        onBackToChoose?: () => void;
        onBackToPrevious?: () => void;
      } = {},
      options?: {
        flowContext?: "first-use" | "global";
        origin?: "home-secondary-action" | "quick-capture-pool-picker" | "saved-feedback" | "capture";
      }
    ) {
      poolModalInstances.push({ step, handlers, options });
    }

    open() {
      poolModalOpenMock();
    }
  }

  return {
    PoolModal: MockPoolModal
  };
});

vi.mock("../../src/views/idea-edit-modal", () => {
  class MockIdeaEditModal {
    constructor(
      _plugin: unknown,
      ideaId: string,
      handlers: { onSaved?: () => void } = {}
    ) {
      ideaEditInstances.push({ ideaId, handlers });
    }

    open() {
      ideaEditOpenMock();
    }
  }

  return {
    IdeaEditModal: MockIdeaEditModal
  };
});

vi.mock("../../src/views/snippet-locations-modal", () => {
  class MockSnippetLocationsModal {
    constructor(
      _app: unknown,
      locations: Array<{
        notePath: string;
        noteTitle: string;
        occurrenceCount: number;
        stale: boolean;
      }>,
      onOpenLocation: (location: {
        notePath: string;
        noteTitle: string;
        occurrenceCount: number;
        stale: boolean;
      }) => Promise<void>
    ) {
      snippetLocationsInstances.push({ locations, onOpenLocation });
    }

    open() {
      snippetLocationsOpenMock();
    }
  }

  return {
    SnippetLocationsModal: MockSnippetLocationsModal
  };
});

vi.mock("../../src/views/pool-roam-history-modal", () => {
  class MockPoolRoamHistoryModal {
    private readonly handlers: {
      onSelectBoard?: (board: {
        path: string;
        name: string;
        updatedAt: number;
        relatedPools: Array<{ id: string; name: string; color: string }>;
        thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
      }, index: number) => void;
      onDeleteBoards?: (boardPaths: string[]) => Promise<Array<{
        path: string;
        name: string;
        updatedAt: number;
        relatedPools: Array<{ id: string; name: string; color: string }>;
        thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
      }>>;
      onClose?: () => void;
    };

    constructor(
      _app: unknown,
      boards: Array<{
        path: string;
        name: string;
        updatedAt: number;
        relatedPools: Array<{ id: string; name: string; color: string }>;
        thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
      }>,
      handlers: {
        onSelectBoard?: (board: {
          path: string;
          name: string;
          updatedAt: number;
          relatedPools: Array<{ id: string; name: string; color: string }>;
          thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
        }, index: number) => void;
        onDeleteBoards?: (boardPaths: string[]) => Promise<Array<{
          path: string;
          name: string;
          updatedAt: number;
          relatedPools: Array<{ id: string; name: string; color: string }>;
          thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
        }>>;
        onClose?: () => void;
      } = {}
    ) {
      this.handlers = handlers;
      poolRoamHistoryInstances.push({
        boards,
        handlers,
        close: () => this.close()
      });
    }

    open() {
      poolRoamHistoryOpenMock();
    }

    close() {
      poolRoamHistoryCloseMock();
      this.handlers.onClose?.();
    }
  }

  return {
    PoolRoamHistoryModal: MockPoolRoamHistoryModal
  };
});

vi.mock("../../src/views/pool-roam-board-modal", () => {
  class MockPoolRoamBoardModal {
    private readonly handlers: {
      onOpenError?: (error: unknown) => void;
      onClose?: () => void;
    };

    constructor(
      _app: unknown,
      boards: Array<{
        path: string;
        name: string;
        updatedAt: number;
        relatedPools: Array<{ id: string; name: string; color: string }>;
        thumbnailBoxes: Array<{ x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
      }>,
      activeBoardIndex: number,
      handlers: {
        onOpenError?: (error: unknown) => void;
        onClose?: () => void;
      } = {}
    ) {
      this.handlers = handlers;
      poolRoamBoardInstances.push({
        boards,
        activeBoardIndex,
        handlers,
        close: () => this.close(),
        failToOpen: (error: Error) => {
          this.handlers.onOpenError?.(error);
          this.close();
        }
      });
    }

    open() {
      poolRoamBoardOpenMock();
    }

    close() {
      poolRoamBoardCloseMock();
      this.handlers.onClose?.();
    }
  }

  return {
    PoolRoamBoardModal: MockPoolRoamBoardModal
  };
});

vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("obsidian")>();

  class Menu {
    addItem(configure: (item: { setTitle: (title: string) => { onClick: (handler: () => void) => void } }) => void): this {
      const slot: { title: string; onClick?: () => void } = { title: "" };
      configure({
        setTitle: (title: string) => {
          slot.title = title;
          return {
            onClick: (handler: () => void) => {
              slot.onClick = handler;
            }
          };
        }
      });
      menuItems.push(slot);
      return this;
    }

    showAtPosition(position: { x: number; y: number }): void {
      menuShowAtPositionMock(position);
    }
  }

  return {
    ...actual,
    Menu,
    MarkdownRenderer: {
      render: markdownRenderMock
    },
    TFile: class {}
  };
});

import { Component, TFile } from "obsidian";
import { GlitterPoolView } from "../../src/views/pool-view";

describe("GlitterPoolView", () => {
  beforeEach(() => {
    quickCaptureOpenMock.mockReset();
    quickCaptureInstances.length = 0;
    poolModalOpenMock.mockReset();
    poolModalInstances.length = 0;
    ideaEditOpenMock.mockReset();
    ideaEditInstances.length = 0;
    snippetLocationsOpenMock.mockReset();
    snippetLocationsInstances.length = 0;
    poolRoamHistoryOpenMock.mockReset();
    poolRoamHistoryCloseMock.mockReset();
    poolRoamHistoryInstances.length = 0;
    poolRoamBoardOpenMock.mockReset();
    poolRoamBoardCloseMock.mockReset();
    poolRoamBoardInstances.length = 0;
    menuShowAtPositionMock.mockReset();
    menuItems.length = 0;
    deleteIdeaMock.mockReset();
    renderPoolViewMock.mockReset();
    syncRenderedPoolCardMenusMock.mockReset();
    syncRenderedPoolCardMenusMock.mockReturnValue(false);
    markdownRenderMock.mockReset();
    buildPoolViewStateFromRuntimeMock.mockReset();
    toastShowMock.mockReset();
  });

  it("returns the sparkle icon for the pool view tab", () => {
    const view = new GlitterPoolView({} as any, {} as any);

    expect(view.getIcon()).toBe("glitter-idea-plugin-sparkles");
  });

  it("refreshes external idea mutations with scroll preservation and no load toast", () => {
    const view = new GlitterPoolView({} as any, {} as any);
    const renderPoolShellSafely = vi.fn();

    (view as any).renderPoolShellSafely = renderPoolShellSafely;
    (view as any).preserveResultScrollOnNextRender = false;
    (view as any).isClosed = false;

    view.refreshAfterExternalIdeaMutation();

    expect((view as any).preserveResultScrollOnNextRender).toBe(true);
    expect(renderPoolShellSafely).toHaveBeenCalledTimes(1);
    expect(renderPoolShellSafely).toHaveBeenCalledWith({ showLoadErrorToast: false });
  });

  it("adds and removes the workspace host class on open and close", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 0,
        visibleItemCount: 0,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 0, selected: true }]
    }));

    const plugin = {
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
                setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "empty", ...runtime }));

    const addClass = vi.fn();
    const removeClass = vi.fn();
    const empty = vi.fn();
    const view = new GlitterPoolView({} as any, plugin as any);
    (view as any).contentEl = { addClass, removeClass, empty };

    await view.onOpen();
    expect(addClass).toHaveBeenCalledWith("glitter-idea-pool-view-host");

    await view.onClose();
    expect(removeClass).toHaveBeenCalledWith("glitter-idea-pool-view-host");
    expect(empty).toHaveBeenCalled();
  });

  it("serializes and restores browse history state", async () => {
    const loadPoolState = vi.fn(async (input?: {
      poolId?: string;
      query?: string;
      status?: "all" | "referenced" | "file-created" | "with-markers";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => ({
      pool: {
        id: input?.poolId ?? "pool-default",
        title: "目标池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: input?.status ?? ("all" as const),
        sort: (input?.sort ?? "updated-desc") as "updated-desc" | "created-desc" | "title-asc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: input?.poolId ?? "pool-default", label: "目标池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
                setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.setState(
      {
        poolId: "pool-product",
        mode: "browse",
        query: "alpha",
        status: "referenced",
        contentFilter: "image",
        sort: "title-asc",
        batchMode: true
      },
      {} as any
    );
    await Promise.resolve();

    expect(loadPoolState).toHaveBeenLastCalledWith({
      poolId: "pool-product",
      query: "alpha",
      status: "referenced",
      contentFilter: "image",
      sort: "title-asc",
      selectedIdeaIds: []
    });
    expect(view.getState()).toStrictEqual({
      poolId: "pool-product",
      mode: "browse",
      poolMarkdownPreviewOpen: false,
      query: "alpha",
      status: "referenced",
      contentFilter: "image",
      sort: "title-asc",
      batchMode: true
    });
  });

  it("restores roam history state through the live view and keeps roam serialized on pool switch", async () => {
    const loadPoolState = vi.fn(async (input?: {
      poolId?: string;
      query?: string;
      status?: "all" | "referenced" | "file-created" | "with-markers";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => ({
      pool: {
        id: input?.poolId ?? "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: input?.status ?? ("all" as const),
        contentFilter: "all" as const,
        sort: (input?.sort ?? "updated-desc") as "updated-desc" | "created-desc" | "title-asc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: input?.poolId ?? "pool-product", label: "产品池", count: 1, selected: true }]
    }));

    const leafSetViewState = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolMarkdownPreviewOpen: true,
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/demo.canvas"
          }
        }),
        setViewState: leafSetViewState
      } as any,
      plugin as any
    );

    await view.onOpen();
    await Promise.resolve();

    expect(view.getState()).toEqual(
      expect.objectContaining({
        poolId: "pool-product",
        mode: "browse",
        poolMarkdownPreviewOpen: false,
        poolRoamOpen: true,
        poolRoamBoardPath: "Glitter/灵感漫游/demo.canvas"
      })
    );

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onPoolSwitch: (poolId: string) => void;
    };
    actions.onPoolSwitch("pool-other");
    await Promise.resolve();
    await Promise.resolve();

    expect(leafSetViewState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          poolId: "pool-other",
          mode: "browse",
          poolRoamOpen: true,
          poolRoamBoardPath: "Glitter/灵感漫游/demo.canvas"
        })
      })
    );
    const latestViewState = (
      leafSetViewState.mock.calls as Array<Array<{ state?: Record<string, unknown> }>>
    ).at(-1)?.[0];
    expect(latestViewState?.state).not.toHaveProperty("poolMarkdownPreviewOpen");
  });

  it("restores an empty roam session without carrying over a stale board path", async () => {
    const loadPoolState = vi.fn(async (input?: {
      poolId?: string;
      query?: string;
      status?: "all" | "referenced" | "file-created" | "with-markers";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => ({
      pool: {
        id: input?.poolId ?? "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: input?.status ?? ("all" as const),
        contentFilter: "all" as const,
        sort: (input?.sort ?? "updated-desc") as "updated-desc" | "created-desc" | "title-asc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: input?.poolId ?? "pool-product", label: "产品池", count: 1, selected: true }]
    }));

    const leafSetViewState = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolMarkdownPreviewOpen: true,
            poolRoamOpen: true
          }
        }),
        setViewState: leafSetViewState
      } as any,
      plugin as any
    );

    await view.onOpen();
    await Promise.resolve();

    expect(view.getState()).toEqual(
      expect.objectContaining({
        poolId: "pool-product",
        mode: "browse",
        poolMarkdownPreviewOpen: false,
        poolRoamOpen: true
      })
    );
    expect(view.getState()).not.toHaveProperty("poolRoamBoardPath");

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onPoolSwitch: (poolId: string) => void;
    };
    actions.onPoolSwitch("pool-other");
    await Promise.resolve();
    await Promise.resolve();

    expect(leafSetViewState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          poolId: "pool-other",
          mode: "browse",
          poolRoamOpen: true
        })
      })
    );
    const latestViewState = (
      leafSetViewState.mock.calls as Array<Array<{ state?: Record<string, unknown> }>>
    ).at(-1)?.[0];
    expect(latestViewState?.state).not.toHaveProperty("poolRoamBoardPath");
    expect(latestViewState?.state).not.toHaveProperty("poolMarkdownPreviewOpen");
  });

  it("opens roam mode as a new empty session, closes markdown preview, and keeps one boundary anchor for composite source blocks", async () => {
    const loadPoolState = vi.fn(async (input?: {
      poolId?: string;
      query?: string;
      status?: "all" | "referenced" | "file-created" | "with-markers";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => ({
      pool: {
        id: input?.poolId ?? "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          body: "Idea 1 body",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "image" as const,
          sourceUrl: "https://example.com/idea-1",
          attachmentPaths: ["assets/cover.png", "assets/detail.png"],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: input?.status ?? ("all" as const),
        contentFilter: "all" as const,
        sort: (input?.sort ?? "updated-desc") as "updated-desc" | "created-desc" | "title-asc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: input?.poolId ?? "pool-product", label: "产品池", count: 1, selected: true }]
    }));
    const attachIdeaSourceToRoamBoard = vi.fn(async () => ({
      path: "Glitter/灵感漫游/current.canvas",
      canvas: {
        nodes: [
          {
            id: "node-1",
            type: "group",
            width: 540,
            height: 420,
            glitterSource: {
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1",
              syncMode: "readonly-follow-source",
              status: "active"
            },
            glitterSourceBlock: {
              sourceBlockId: "source-block-1",
              role: "root"
            }
          },
          {
            id: "node-1-caption",
            type: "text",
            text: "> [!glitter-source] Idea 1\n> https://example.com/idea-1\n>\n> Idea 1 body",
            glitterSource: {
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1",
              syncMode: "readonly-follow-source",
              status: "active"
            },
            glitterSourceBlock: {
              sourceBlockId: "source-block-1",
              role: "caption"
            }
          },
          {
            id: "node-1-file-1",
            type: "file",
            file: "assets/cover.png",
            glitterSource: {
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1",
              syncMode: "readonly-follow-source",
              status: "active"
            },
            glitterSourceBlock: {
              sourceBlockId: "source-block-1",
              role: "image"
            }
          },
          {
            id: "node-1-file-2",
            type: "file",
            file: "assets/detail.png",
            glitterSource: {
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1",
              syncMode: "readonly-follow-source",
              status: "active"
            },
            glitterSourceBlock: {
              sourceBlockId: "source-block-1",
              role: "image"
            }
          }
        ],
        edges: []
      }
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview: vi.fn(async () => ({
          poolId: "pool-product",
          poolTitle: "产品池",
          markdown: "# 产品池"
        })),
        attachIdeaSourceToRoamBoard,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolMarkdownPreviewOpen: true,
            poolRoamOpen: true
          }
        })
      } as any,
      plugin as any
    );

    await view.onOpen();
    await Promise.resolve();

    const attachActions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onAttachPoolRoamSource: (ideaId: string) => void;
    };
    attachActions.onAttachPoolRoamSource("idea-1");
    await Promise.resolve();
    await Promise.resolve();

    expect(attachIdeaSourceToRoamBoard).toHaveBeenCalledWith({
      ideaId: "idea-1",
      poolId: "pool-product",
      poolName: "产品池",
      poolColor: "#6ab5ff",
      title: "Idea 1",
      body: "Idea 1 body",
      contentType: "image",
      sourceUrl: "https://example.com/idea-1",
      attachmentPaths: ["assets/cover.png", "assets/detail.png"]
    });
    expect(view.getState()).toMatchObject({
      poolId: "pool-product",
      mode: "browse",
      poolRoamOpen: true,
      poolRoamBoardPath: "Glitter/灵感漫游/current.canvas",
      poolMarkdownPreviewOpen: false
    });
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          open: true,
          mode: "board",
          boardPath: "Glitter/灵感漫游/current.canvas",
          boundaryAnchors: [
            {
              anchorId: "node-1",
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1",
              visibleBridge: true
            }
          ]
        })
      })
    );

    const toggleActions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onTogglePoolRoam: () => void;
    };
    toggleActions.onTogglePoolRoam();
    await Promise.resolve();

    expect(view.getState()).toMatchObject({
      poolId: "pool-product",
      mode: "browse",
      poolMarkdownPreviewOpen: false
    });
    expect(view.getState()).not.toHaveProperty("poolRoamOpen");
    expect(view.getState()).not.toHaveProperty("poolRoamBoardPath");
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          open: false,
          mode: "empty",
          historyEnabled: true,
          floatingActions: ["download", "share", "history", "idea-block"],
          boundaryAnchors: []
        }),
        preview: expect.objectContaining({
          open: false
        })
      })
    );
  });

  it("rehydrates saved roam boundary anchors when reopening an existing board session", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          body: "Idea 1 body",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));
    const readPoolRoamBoard = vi.fn(async () => ({
      path: "Glitter/灵感漫游/current.canvas",
      canvas: {
        nodes: [
          {
            id: "node-1",
            type: "text",
            text: "Idea 1 body",
            glitterSource: {
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1",
              syncMode: "readonly-follow-source",
              status: "active"
            }
          }
        ],
        edges: []
      }
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        readPoolRoamBoard,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
          }
        })
      } as any,
      plugin as any
    );

    await view.onOpen();

    expect(readPoolRoamBoard).toHaveBeenCalledWith({
      boardPath: "Glitter/灵感漫游/current.canvas"
    });
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          open: true,
          mode: "board",
          boardPath: "Glitter/灵感漫游/current.canvas",
          boundaryAnchors: [
            {
              anchorId: "node-1",
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1",
              visibleBridge: true
            }
          ]
        })
      })
    );
  });

  it("prefers normalizePoolRoamBoard for active-board anchors and refreshes from normalized canvases on modify", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          body: "Idea 1 body",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));
    const normalizePoolRoamBoard = vi
      .fn<() => Promise<{ path: string; canvas: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> } }>>()
      .mockResolvedValueOnce({
        path: "Glitter/灵感漫游/current.canvas",
        canvas: {
          nodes: [
            {
              id: "node-1-root",
              type: "group",
              glitterSource: {
                ideaId: "idea-1",
                poolId: "pool-product",
                poolName: "产品池",
                poolColor: "#6ab5ff",
                ideaTitle: "Idea 1",
                syncMode: "readonly-follow-source",
                status: "active"
              },
              glitterSourceBlock: {
                sourceBlockId: "source-block-1",
                role: "root"
              }
            },
            {
              id: "node-1-caption",
              type: "text",
              text: "> [!glitter-source] Idea 1\n> Idea 1 body",
              glitterSource: {
                ideaId: "idea-1",
                poolId: "pool-product",
                poolName: "产品池",
                poolColor: "#6ab5ff",
                ideaTitle: "Idea 1",
                syncMode: "readonly-follow-source",
                status: "active"
              },
              glitterSourceBlock: {
                sourceBlockId: "source-block-1",
                role: "caption"
              }
            },
            {
              id: "node-1-image",
              type: "file",
              file: "assets/cover.png",
              glitterSource: {
                ideaId: "idea-1",
                poolId: "pool-product",
                poolName: "产品池",
                poolColor: "#6ab5ff",
                ideaTitle: "Idea 1",
                syncMode: "readonly-follow-source",
                status: "active"
              },
              glitterSourceBlock: {
                sourceBlockId: "source-block-1",
                role: "image"
              }
            }
          ],
          edges: []
        }
      })
      .mockResolvedValueOnce({
        path: "Glitter/灵感漫游/current.canvas",
        canvas: {
          nodes: [
            {
              id: "node-2-root",
              type: "group",
              glitterSource: {
                ideaId: "idea-1",
                poolId: "pool-product",
                poolName: "产品池",
                poolColor: "#6ab5ff",
                ideaTitle: "Idea 1 normalized",
                syncMode: "readonly-follow-source",
                status: "active"
              },
              glitterSourceBlock: {
                sourceBlockId: "source-block-1",
                role: "root"
              }
            },
            {
              id: "node-2-caption",
              type: "text",
              text: "> [!glitter-source] Idea 1 normalized\n> Idea 1 body",
              glitterSource: {
                ideaId: "idea-1",
                poolId: "pool-product",
                poolName: "产品池",
                poolColor: "#6ab5ff",
                ideaTitle: "Idea 1 normalized",
                syncMode: "readonly-follow-source",
                status: "active"
              },
              glitterSourceBlock: {
                sourceBlockId: "source-block-1",
                role: "caption"
              }
            }
          ],
          edges: []
        }
      });
    const readPoolRoamBoard = vi.fn(async () => ({
      path: "Glitter/灵感漫游/current.canvas",
      canvas: {
        nodes: [
          {
            id: "read-node",
            type: "text",
            glitterSource: {
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1 from read",
              syncMode: "readonly-follow-source",
              status: "active"
            }
          }
        ],
        edges: []
      }
    }));

    let modifyHandler: ((file: { path: string }) => void) | undefined;
    const plugin = {
      app: {
        vault: {
          on: vi.fn((_name: string, callback: (file: { path: string }) => void) => {
            modifyHandler = callback;
            return {};
          })
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        normalizePoolRoamBoard,
        readPoolRoamBoard,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { registerEvent: ReturnType<typeof vi.fn> }).registerEvent = vi.fn();

    await view.onOpen();

    expect(normalizePoolRoamBoard).toHaveBeenCalledWith({
      boardPath: "Glitter/灵感漫游/current.canvas"
    });
    expect(readPoolRoamBoard).not.toHaveBeenCalled();
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          boundaryAnchors: [
            {
              anchorId: "node-1-root",
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1",
              visibleBridge: true
            }
          ]
        })
      })
    );

    modifyHandler?.({ path: "Glitter/灵感漫游/current.canvas" });
    await flush();

    expect(normalizePoolRoamBoard).toHaveBeenCalledTimes(2);
    expect(readPoolRoamBoard).not.toHaveBeenCalled();
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          boundaryAnchors: [
            {
              anchorId: "node-2-root",
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1 normalized",
              visibleBridge: true
            }
          ]
        })
      })
    );
  });

  it("removes boundary anchors after the active roam board deletes its source block", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          body: "Idea 1 body",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));
    const readPoolRoamBoard = vi
      .fn<() => Promise<{ path: string; canvas: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> } }>>()
      .mockResolvedValueOnce({
        path: "Glitter/灵感漫游/current.canvas",
        canvas: {
          nodes: [
            {
              id: "node-1",
              type: "text",
              text: "Idea 1 body",
              glitterSource: {
                ideaId: "idea-1",
                poolId: "pool-product",
                poolName: "产品池",
                poolColor: "#6ab5ff",
                ideaTitle: "Idea 1",
                syncMode: "readonly-follow-source",
                status: "active"
              }
            }
          ],
          edges: []
        }
      })
      .mockResolvedValueOnce({
        path: "Glitter/灵感漫游/current.canvas",
        canvas: {
          nodes: [
            {
              id: "note-1",
              type: "text",
              text: "旁注"
            }
          ],
          edges: []
        }
      });

    let modifyHandler: ((file: { path: string }) => void) | undefined;
    const plugin = {
      app: {
        vault: {
          on: vi.fn((_name: string, callback: (file: { path: string }) => void) => {
            modifyHandler = callback;
            return {};
          })
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        readPoolRoamBoard,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { registerEvent: ReturnType<typeof vi.fn> }).registerEvent = vi.fn();

    await view.onOpen();
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          boundaryAnchors: [
            expect.objectContaining({
              anchorId: "node-1",
              ideaId: "idea-1"
            })
          ]
        })
      })
    );

    modifyHandler?.({ path: "Glitter/灵感漫游/current.canvas" });
    await flush();

    expect(readPoolRoamBoard).toHaveBeenCalledTimes(2);
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          boundaryAnchors: []
        })
      })
    );
  });

  it("deletes the persisted source block immediately from the seam delete action", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          body: "Idea 1 body",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));
    const readPoolRoamBoard = vi.fn(async () => ({
      path: "Glitter/灵感漫游/current.canvas",
      canvas: {
        nodes: [
          {
            id: "node-1",
            type: "text",
            text: "Idea 1 body",
            glitterSource: {
              ideaId: "idea-1",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Idea 1",
              syncMode: "readonly-follow-source",
              status: "active"
            }
          }
        ],
        edges: []
      }
    }));
    const detachIdeaSourceFromRoamBoard = vi.fn(async () => ({
      path: "Glitter/灵感漫游/current.canvas",
      canvas: {
        nodes: [
          {
            id: "note-1",
            type: "text",
            text: "旁注"
          }
        ],
        edges: []
      }
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        readPoolRoamBoard,
        detachIdeaSourceFromRoamBoard,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
          }
        })
      } as any,
      plugin as any
    );

    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onDeletePoolRoamSourceLink?: (anchorId: string) => void;
    };
    actions.onDeletePoolRoamSourceLink?.("node-1");
    await flush();

    expect(detachIdeaSourceFromRoamBoard).toHaveBeenCalledWith({
      boardPath: "Glitter/灵感漫游/current.canvas",
      nodeId: "node-1"
    });
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          boundaryAnchors: []
        })
      })
    );
  });

  it("keeps cross-pool roam anchors visible after switching pools and locates back to their source pool", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async (input?: {
      poolId?: string;
      query?: string;
      status?: "all" | "referenced" | "file-created" | "with-markers";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => {
      const activePoolId = input?.poolId ?? "pool-product";
      const isProductPool = activePoolId === "pool-product";
      return {
        pool: {
          id: activePoolId,
          title: isProductPool ? "产品池" : "写作池",
          description: "desc",
          totalItemCount: 1,
          visibleItemCount: 1,
          color: isProductPool ? "#6ab5ff" : "#ffd468",
          tone: "bluegray" as const
        },
        header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
        cards: [
          {
            id: isProductPool ? "idea-product" : "idea-writing",
            title: isProductPool ? "Product idea" : "Writing idea",
            body: isProductPool ? "Product body" : "Writing body",
            excerpt: "excerpt",
            hasBodyContent: true,
            selected: Boolean(input?.selectedIdeaIds?.includes(isProductPool ? "idea-product" : "idea-writing")),
            contentType: "text" as const,
            sourceUrl: undefined,
            attachmentPaths: [],
            fileCreated: false,
            filePath: undefined,
            referenced: false,
            updatedAt: "2026-04-12T00:00:00.000Z"
          }
        ],
        controls: {
          query: input?.query ?? "",
          status: input?.status ?? ("all" as const),
          contentFilter: "all" as const,
          sort: (input?.sort ?? "updated-desc") as "updated-desc" | "created-desc" | "title-asc",
          selectedCount: input?.selectedIdeaIds?.length ?? 0,
          hasSelection: Boolean(input?.selectedIdeaIds?.length)
        },
        poolOptions: [
          { id: "pool-product", label: "产品池", count: 1, selected: isProductPool },
          { id: "pool-writing", label: "写作池", count: 1, selected: !isProductPool }
        ]
      };
    });
    const attachIdeaSourceToRoamBoard = vi.fn(async () => ({
      path: "Glitter/灵感漫游/session.canvas",
      canvas: {
        nodes: [
          {
            id: "node-product",
            type: "text",
            text: "Product body",
            glitterSource: {
              ideaId: "idea-product",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Product idea",
              syncMode: "readonly-follow-source",
              status: "active"
            }
          }
        ],
        edges: []
      }
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        attachIdeaSourceToRoamBoard,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolRoamOpen: true
          }
        })
      } as any,
      plugin as any
    );

    await view.onOpen();
    await flush();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onAttachPoolRoamSource: (ideaId: string) => void;
      onLocatePoolRoamSource: (ideaId: string) => void;
    };
    actions.onAttachPoolRoamSource("idea-product");
    await flush();

    expect(attachIdeaSourceToRoamBoard).toHaveBeenCalledWith({
      ideaId: "idea-product",
      poolId: "pool-product",
      poolName: "产品池",
      poolColor: "#6ab5ff",
      title: "Product idea",
      body: "Product body",
      contentType: "text",
      sourceUrl: undefined,
      attachmentPaths: []
    });
    const sessionBoardPath = (view.getState() as { poolRoamBoardPath?: string }).poolRoamBoardPath;
    expect(sessionBoardPath).toBe("Glitter/灵感漫游/session.canvas");
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          boardPath: "Glitter/灵感漫游/session.canvas",
          boundaryAnchors: [
            expect.objectContaining({
              anchorId: "node-product",
              ideaId: "idea-product",
              poolId: "pool-product",
              visibleBridge: true
            })
          ]
        })
      })
    );

    await view.setState(
      {
        poolId: "pool-writing",
        mode: "browse",
        poolRoamOpen: true,
        poolRoamBoardPath: sessionBoardPath
      },
      {} as any
    );
    await flush();

    expect(view.getState()).toMatchObject({
      poolId: "pool-writing",
      mode: "browse",
      poolRoamOpen: true,
      poolRoamBoardPath: "Glitter/灵感漫游/session.canvas"
    });
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          boardPath: "Glitter/灵感漫游/session.canvas",
          boundaryAnchors: [
            {
              anchorId: "node-product",
              ideaId: "idea-product",
              poolId: "pool-product",
              poolName: "产品池",
              poolColor: "#6ab5ff",
              ideaTitle: "Product idea",
              visibleBridge: true
            }
          ]
        })
      })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onAttachPoolRoamSource: (ideaId: string) => void;
      onLocatePoolRoamSource: (ideaId: string) => void;
    };
    actions.onLocatePoolRoamSource("idea-product");
    await flush();

    expect(loadPoolState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        poolId: "pool-product",
        selectedIdeaIds: ["idea-product"]
      })
    );
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pool: expect.objectContaining({ id: "pool-product" }),
        cards: [
          expect.objectContaining({
            id: "idea-product",
            selected: true,
            searchHit: true,
            searchHitPulse: true
          })
        ]
      })
    );
    expect(plugin.focusedIdeaId).toBeNull();
    expect(plugin.pendingFocusedPoolId).toBeNull();
  });

  it("rerenders roam panel as an error state when inline board mounting fails", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));

    const abstractFile = new TFile();
    const openFile = vi.fn(async () => {
      throw new Error("open failed");
    });
    const getLeaf = vi.fn(() => ({
      openFile,
      detach: vi.fn()
    }));
    const roamMountEl = {
      innerHTML: ""
    } as unknown as HTMLElement;

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => abstractFile)
        },
        workspace: {
          getLeaf
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__roam-canvas-host" && state.roam?.open) {
          return roamMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/demo.canvas"
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();
    await flush();

    expect(getLeaf).not.toHaveBeenCalled();
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Load roam board failed. Please try again."
    });
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          open: true,
          mode: "error",
          errorMessage: "加载漫游白板失败，请稍后再试。"
        })
      })
    );
  });

  it("ignores stale roam mount failures after the view closes", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));

    const abstractFile = new TFile();
    let rejectOpenFile: ((error?: unknown) => void) | undefined;
    const openFile = vi.fn(
      async () =>
        new Promise<void>((_resolve, reject) => {
          rejectOpenFile = reject;
        })
    );
    const getLeaf = vi.fn(() => ({
      openFile,
      detach: vi.fn()
    }));
    const roamMountEl = {
      innerHTML: ""
    } as unknown as HTMLElement;

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => abstractFile)
        },
        workspace: {
          getLeaf
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__roam-canvas-host" && state.roam?.open) {
          return roamMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/demo.canvas"
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();
    await view.onClose();
    rejectOpenFile?.(new Error("open failed"));
    await flush();

    expect(getLeaf).not.toHaveBeenCalled();
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it("ignores stale roam mount failures after the active board changes", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));

    const abstractFile = new TFile();
    let rejectFirstOpenFile: ((error?: unknown) => void) | undefined;
    const openFile = vi.fn(() => {
      if (!rejectFirstOpenFile) {
        return new Promise<void>((_resolve, reject) => {
          rejectFirstOpenFile = reject;
        });
      }

      return Promise.resolve();
    });
    const getLeaf = vi.fn(() => ({
      openFile,
      detach: vi.fn(),
      view: {
        containerEl: {
          innerHTML: ""
        }
      }
    }));
    const roamMountEl = {
      innerHTML: ""
    } as unknown as HTMLElement;

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => abstractFile)
        },
        workspace: {
          getLeaf
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__roam-canvas-host" && state.roam?.open) {
          return roamMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-product",
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/board-a.canvas"
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();
    await view.setState(
      {
        poolId: "pool-product",
        mode: "browse",
        poolRoamOpen: true,
        poolRoamBoardPath: "Glitter/灵感漫游/board-b.canvas"
      },
      {} as any
    );
    rejectFirstOpenFile?.(new Error("open failed"));
    await flush();

    expect(getLeaf).not.toHaveBeenCalled();
    expect(toastShowMock).not.toHaveBeenCalled();
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          open: true,
          mode: "board",
          boardPath: "Glitter/灵感漫游/board-b.canvas"
        })
      })
    );
  });

  it("restores pool markdown preview state for a real empty pool and renders with an ID-based source path", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池 / 已存在导出",
        description: "desc",
        totalItemCount: 0,
        visibleItemCount: 0,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池 / 已存在导出", count: 0, selected: true }]
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-product",
      poolTitle: "产品池 / 已存在导出",
      markdown: "# 产品池 / 已存在导出"
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({
          filePath: "Glitter/池导出/产品池 / 已存在导出.md",
          poolTitle: "产品池 / 已存在导出"
        })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const previewMountEl = {} as HTMLElement;
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const hostLeaf = {
      getViewState: () => ({
        state: {
          mode: "browse",
          poolMarkdownPreviewOpen: true
        }
      })
    };

    const view = new GlitterPoolView(hostLeaf as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();

    expect(loadPoolMarkdownPreview).toHaveBeenCalledWith({
      poolId: "pool-product",
      sort: "updated-desc"
    });
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: {
          available: true,
          open: true,
          saving: false,
          panelTitle: "产品池 / 已存在导出 Markdown 文件",
          saveLabel: "保存 Markdown 文件"
        }
      })
    );
    expect(markdownRenderMock).toHaveBeenCalledWith(
      plugin.app,
      "# 产品池 / 已存在导出",
      previewMountEl,
      "Glitter/池导出/产品池 - 已存在导出.md",
      expect.anything()
    );
    expect(view.getState()).toEqual(
      expect.objectContaining({
        poolMarkdownPreviewOpen: true
      })
    );
  });

  it("clears the pool markdown preview when a later history state omits the preview flag", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-product",
      poolTitle: "产品池",
      markdown: "# 产品池\n\n- Idea 1"
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({ filePath: "Glitter/池导出/产品池.md", poolTitle: "产品池" })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const previewMountEl = {} as HTMLElement;
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolId: "pool-product",
            poolMarkdownPreviewOpen: true
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();
    const previewLoadCountBeforeCloseState = loadPoolMarkdownPreview.mock.calls.length;

    await view.setState(
      {
        poolId: "pool-product",
        mode: "browse"
      },
      {} as any
    );
    await flush();

    expect(loadPoolMarkdownPreview.mock.calls.length).toBe(previewLoadCountBeforeCloseState);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preview: expect.objectContaining({
          available: true,
          open: false,
          saving: false
        })
      })
    );
    expect(view.getState()).toEqual(
      expect.objectContaining({
        poolMarkdownPreviewOpen: false
      })
    );
  });

  it("suppresses pool markdown preview loading and rendering in global-status mode even when history says it is open", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-global-status",
        title: "已引用 / 已建文件",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "全局状态", hint: "筛选所有池中的已引用与已建文件灵感" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: true,
          filePath: "Glitter/Idea 1.md",
          referenced: true,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: []
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-global-status",
      poolTitle: "已引用 / 已建文件",
      markdown: "# 已引用 / 已建文件\n\n- Idea 1"
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({ filePath: "Glitter/池导出/全局状态.md", poolTitle: "已引用 / 已建文件" })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const previewMountEl = {} as HTMLElement;
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const hostLeaf = {
      getViewState: () => ({
        state: {
          mode: "browse",
          scope: "global-status",
          poolMarkdownPreviewOpen: true
        }
      })
    };

    const view = new GlitterPoolView(hostLeaf as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();

    expect(loadPoolMarkdownPreview).not.toHaveBeenCalled();
    expect(markdownRenderMock).not.toHaveBeenCalled();
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: undefined,
        viewOptions: expect.objectContaining({
          showPoolSwitcher: false,
          metadataEditable: false,
          queryPlaceholder: "搜索当前筛选灵感"
        })
      })
    );
    expect(view.getState()).toEqual(
      expect.objectContaining({
        mode: "browse",
        scope: "global-status"
      })
    );
    expect(view.getState()).not.toHaveProperty("poolMarkdownPreviewOpen");
  });

  it("suppresses pool markdown preview when browse mode has no real pool target", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-empty",
        title: "Idea Pool",
        description: "desc",
        totalItemCount: 0,
        visibleItemCount: 0,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: []
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-empty",
      poolTitle: "Idea Pool",
      markdown: "# Idea Pool"
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({ filePath: "Glitter/池导出/Idea Pool.md", poolTitle: "Idea Pool" })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const previewMountEl = {} as HTMLElement;
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolMarkdownPreviewOpen: true
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();

    expect(loadPoolMarkdownPreview).not.toHaveBeenCalled();
    expect(markdownRenderMock).not.toHaveBeenCalled();
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: undefined,
        pool: expect.objectContaining({ id: "pool-empty" })
      })
    );
    expect(view.getState()).toEqual(
      expect.objectContaining({
        mode: "browse",
        poolMarkdownPreviewOpen: false
      })
    );
    expect(view.getState()).not.toHaveProperty("poolId");
  });

  it("shows an error toast when markdown preview rendering rejects", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-product",
      poolTitle: "产品池",
      markdown: "# 产品池\n\n- Idea 1"
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({ filePath: "Glitter/池导出/产品池.md", poolTitle: "产品池" })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));
    markdownRenderMock.mockRejectedValueOnce(new Error("render failed"));

    const previewMountEl = {
      empty: vi.fn()
    } as unknown as HTMLElement;
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolMarkdownPreviewOpen: true
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();
    await flush();

    expect(loadPoolMarkdownPreview).toHaveBeenCalledWith({
      poolId: "pool-product",
      sort: "updated-desc"
    });
    expect(markdownRenderMock).toHaveBeenCalledTimes(1);
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Load Markdown preview failed. Please try again."
    });
    expect(renderPoolViewMock).toHaveBeenCalled();
  });

  it("toggles pool markdown preview and saves the markdown file only once while save is in flight", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-product",
      poolTitle: "产品池",
      markdown: "# 产品池\n\n- Idea 1"
    }));

    let resolveSave: (() => void) | undefined;
    const savePoolMarkdownFile = vi.fn(
      () =>
        new Promise<{ filePath: string; poolTitle: string }>((resolve) => {
          resolveSave = () => {
            resolve({
              filePath: "Glitter/池导出/产品池 1.md",
              poolTitle: "产品池"
            });
          };
        })
    );

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const previewMountEl = {} as HTMLElement;
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onTogglePoolMarkdownPreview: () => void;
      onSavePoolMarkdownFile: () => void;
    };

    const loadPoolStateCountBeforePreviewOpen = loadPoolState.mock.calls.length;
    actions.onTogglePoolMarkdownPreview();
    await flush();

    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCountBeforePreviewOpen);
    expect(loadPoolMarkdownPreview).toHaveBeenCalledWith({
      poolId: "pool-product",
      sort: "updated-desc"
    });

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    const previewLoadCountBeforeSave = loadPoolMarkdownPreview.mock.calls.length;

    actions.onSavePoolMarkdownFile();
    actions.onSavePoolMarkdownFile();
    await flush();

    expect(savePoolMarkdownFile).toHaveBeenCalledTimes(1);
    expect(savePoolMarkdownFile).toHaveBeenCalledWith({
      poolId: "pool-product",
      sort: "updated-desc"
    });
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preview: expect.objectContaining({
          available: true,
          open: true,
          saving: true,
          saveLabel: "保存中..."
        })
      })
    );

    resolveSave?.();
    await flush();

    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success" })
    );
    expect(loadPoolMarkdownPreview.mock.calls.length).toBeGreaterThan(previewLoadCountBeforeSave);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preview: expect.objectContaining({
          available: true,
          open: true,
          saving: false,
          saveLabel: "保存 Markdown 文件"
        })
      })
    );
  });

  it("keeps an in-flight runtime reload authoritative when cached preview-open starts mid-load", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const initialRuntime = {
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    };

    const queriedRuntime = {
      ...initialRuntime,
      cards: [
        {
          id: "idea-alpha",
          title: "Alpha idea",
          excerpt: "alpha excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-13T00:00:00.000Z"
        }
      ]
    };

    let resolveQueriedRuntime: ((runtime: typeof queriedRuntime) => void) | undefined;
    const loadPoolState = vi.fn((input?: { query?: string }) => {
      if (input?.query === "alpha") {
        return new Promise<typeof queriedRuntime>((resolve) => {
          resolveQueriedRuntime = resolve;
        });
      }
      return Promise.resolve(initialRuntime);
    });

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-product",
      poolTitle: "产品池",
      markdown: "# 产品池\n\n- Idea 1"
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({ filePath: "Glitter/池导出/产品池.md", poolTitle: "产品池" })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const previewMountEl = {} as HTMLElement;
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onQuerySubmit: (query: string) => void;
      onTogglePoolMarkdownPreview: () => void;
    };

    actions.onQuerySubmit("alpha");
    await Promise.resolve();
    actions.onTogglePoolMarkdownPreview();
    await flush();

    resolveQueriedRuntime?.(queriedRuntime);
    await flush();

    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cards: [expect.objectContaining({ id: "idea-alpha", title: "Alpha idea" })],
        preview: expect.objectContaining({ available: true, open: true })
      })
    );
  });

  it("does not replay a stale cached runtime after a local browse rerender during preview loading", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const runtime = {
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    };

    let resolvePreview: ((preview: { poolId: string; poolTitle: string; markdown: string }) => void) | undefined;
    const loadPoolMarkdownPreview = vi.fn(
      () =>
        new Promise<{ poolId: string; poolTitle: string; markdown: string }>((resolve) => {
          resolvePreview = resolve;
        })
    );

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState: vi.fn(async () => runtime),
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({ filePath: "Glitter/池导出/产品池.md", poolTitle: "产品池" })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((nextRuntime) => ({ mode: "browse", ...nextRuntime }));

    const previewMountEl = {} as HTMLElement;
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onTogglePoolMarkdownPreview: () => void;
      onBatchModeToggle: () => void;
    };

    actions.onTogglePoolMarkdownPreview();
    await flush();

    (view as unknown as { selectedIdeaIds: Set<string> }).selectedIdeaIds = new Set(["idea-1"]);
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBatchModeToggle();
    await flush();

    resolvePreview?.({
      poolId: "pool-product",
      poolTitle: "产品池",
      markdown: "# 产品池\n\n- Idea 1"
    });
    await flush();

    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        batchMode: true,
        cards: [expect.objectContaining({ id: "idea-1", selected: true })],
        controls: expect.objectContaining({ selectedCount: 1, hasSelection: true }),
        preview: expect.objectContaining({ available: true, open: true })
      })
    );
    expect(markdownRenderMock).toHaveBeenCalledWith(
      plugin.app,
      "# 产品池\n\n- Idea 1",
      previewMountEl,
      expect.any(String),
      expect.anything()
    );
  });

  it("shows the save failure toast and allows a later markdown save retry", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-product",
      poolTitle: "产品池",
      markdown: "# 产品池\n\n- Idea 1"
    }));

    let rejectFirstSave: ((error: Error) => void) | undefined;
    let saveAttempt = 0;
    const savePoolMarkdownFile = vi.fn(() => {
      saveAttempt += 1;
      if (saveAttempt === 1) {
        return new Promise<{ filePath: string; poolTitle: string }>((_resolve, reject) => {
          rejectFirstSave = reject;
        });
      }

      return Promise.resolve({
        filePath: `Glitter/池导出/产品池 ${saveAttempt}.md`,
        poolTitle: "产品池"
      });
    });

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const previewMountEl = {} as HTMLElement;
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onTogglePoolMarkdownPreview: () => void;
      onSavePoolMarkdownFile: () => void;
    };

    actions.onTogglePoolMarkdownPreview();
    await flush();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onSavePoolMarkdownFile();
    await flush();

    expect(savePoolMarkdownFile).toHaveBeenCalledTimes(1);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preview: expect.objectContaining({
          available: true,
          open: true,
          saving: true,
          saveLabel: "保存中..."
        })
      })
    );

    rejectFirstSave?.(new Error("save failed"));
    await flush();

    expect(toastShowMock).toHaveBeenNthCalledWith(1, {
      status: "error",
      message: "Save Markdown file failed. Please try again."
    });
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preview: expect.objectContaining({
          available: true,
          open: true,
          saving: false,
          saveLabel: "保存 Markdown 文件"
        })
      })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onSavePoolMarkdownFile();
    await flush();

    expect(savePoolMarkdownFile).toHaveBeenCalledTimes(2);
    expect(toastShowMock).toHaveBeenNthCalledWith(2, {
      status: "success",
      message: "Saved Markdown file."
    });
  });

  it("preserves the open pool markdown preview state when switching pools", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        { id: "pool-default", label: "默认池", count: 1, selected: true },
        { id: "pool-other", label: "其他池", count: 1, selected: false }
      ]
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-default",
      poolTitle: "默认池",
      markdown: "# 默认池"
    }));

    const leafSetViewState = vi.fn(async () => undefined);

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({ filePath: "Glitter/池导出/默认池.md", poolTitle: "默认池" })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return {} as HTMLElement;
        }
        return null;
      };
    });

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolMarkdownPreviewOpen: true
          }
        }),
        setViewState: leafSetViewState
      } as any,
      plugin as any
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      empty: vi.fn(),
      querySelector: () => null
    } as unknown as HTMLElement;

    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onPoolSwitch: (poolId: string) => void;
    };

    actions.onPoolSwitch("pool-other");
    await Promise.resolve();
    await Promise.resolve();

    expect(leafSetViewState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          poolId: "pool-other",
          poolMarkdownPreviewOpen: true
        })
      })
    );
  });

  it("rerenders the cached pool markdown preview during pool-switcher keyboard rerenders", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        { id: "pool-product", label: "产品池", count: 1, selected: true },
        { id: "pool-other", label: "其他池", count: 1, selected: false }
      ]
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-product",
      poolTitle: "产品池",
      markdown: "# 产品池\n\n- Idea 1"
    }));

    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const previewMountEl = {
      empty: vi.fn()
    } as unknown as HTMLElement;
    const contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: () => null
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({ filePath: "Glitter/池导出/产品池.md", poolTitle: "产品池" })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolMarkdownPreviewOpen: true
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = contentEl as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
    };
    actions.onBrowseOverlayToggle("pool-switcher");
    await flush();

    const keydownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "keydown"
    )?.[1] as
      | ((event: { key: string; preventDefault?: () => void; stopPropagation?: () => void }) => void)
      | undefined;

    const loadPoolStateCallCountBeforeArrowDown = loadPoolState.mock.calls.length;
    const previewLoadCallCountBeforeArrowDown = loadPoolMarkdownPreview.mock.calls.length;
    const markdownRenderCallCountBeforeArrowDown = markdownRenderMock.mock.calls.length;
    const firstRenderComponent = markdownRenderMock.mock.calls.at(-1)?.[4] as Component | undefined;

    expect(firstRenderComponent).toBeDefined();
    const firstRenderUnloadSpy = vi.spyOn(firstRenderComponent as Component, "unload");

    keydownHandler?.({
      key: "ArrowDown",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    });
    await flush();

    const secondRenderComponent = markdownRenderMock.mock.calls.at(-1)?.[4] as Component | undefined;

    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCallCountBeforeArrowDown);
    expect(loadPoolMarkdownPreview.mock.calls.length).toBe(previewLoadCallCountBeforeArrowDown);
    expect(markdownRenderMock).toHaveBeenCalledTimes(markdownRenderCallCountBeforeArrowDown + 1);
    expect(markdownRenderMock).toHaveBeenLastCalledWith(
      plugin.app,
      "# 产品池\n\n- Idea 1",
      previewMountEl,
      "Glitter/池导出/产品池.md",
      expect.anything()
    );
    expect(secondRenderComponent).toBeDefined();
    expect(secondRenderComponent).not.toBe(firstRenderComponent);
    expect(firstRenderUnloadSpy).toHaveBeenCalledTimes(1);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeOverlay: "pool-switcher",
        poolSwitcherActivePoolId: "pool-other"
      })
    );
  });

  it("ignores stale pool markdown preview render rejections after a newer rerender starts", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        { id: "pool-product", label: "产品池", count: 1, selected: true },
        { id: "pool-other", label: "其他池", count: 1, selected: false }
      ]
    }));

    const loadPoolMarkdownPreview = vi.fn(async () => ({
      poolId: "pool-product",
      poolTitle: "产品池",
      markdown: "# 产品池\n\n- Idea 1"
    }));

    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const previewMountEl = {
      empty: vi.fn()
    } as unknown as HTMLElement;
    const contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: () => null
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        loadPoolMarkdownPreview,
        savePoolMarkdownFile: vi.fn(async () => ({ filePath: "Glitter/池导出/产品池.md", poolTitle: "产品池" })),
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));
    renderPoolViewMock.mockImplementation((containerEl, state) => {
      (containerEl as { querySelector?: (selector: string) => HTMLElement | null }).querySelector = (selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content" && state.preview?.open) {
          return previewMountEl;
        }
        return null;
      };
    });
    markdownRenderMock.mockImplementation(async () => undefined);

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolMarkdownPreviewOpen: true
          }
        })
      } as any,
      plugin as any
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = contentEl as unknown as HTMLElement;

    await view.onOpen();
    await flush();

    let rejectStaleRender: (() => void) | undefined;
    let resolveCurrentRender: (() => void) | undefined;
    markdownRenderMock
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectStaleRender = () => reject(new Error("stale render failed"));
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveCurrentRender = () => resolve();
          })
      );

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
    };
    actions.onBrowseOverlayToggle("pool-switcher");
    await flush();

    const keydownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "keydown"
    )?.[1] as
      | ((event: { key: string; preventDefault?: () => void; stopPropagation?: () => void }) => void)
      | undefined;

    const staleRenderComponent = markdownRenderMock.mock.calls.at(-1)?.[4] as Component | undefined;
    expect(staleRenderComponent).toBeDefined();
    const staleRenderUnloadSpy = vi.spyOn(staleRenderComponent as Component, "unload");

    keydownHandler?.({
      key: "ArrowDown",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    });
    await flush();

    const currentRenderComponent = markdownRenderMock.mock.calls.at(-1)?.[4] as Component | undefined;
    expect(currentRenderComponent).toBeDefined();
    const currentRenderUnloadSpy = vi.spyOn(currentRenderComponent as Component, "unload");

    rejectStaleRender?.();
    await flush();

    expect(markdownRenderMock).toHaveBeenCalledTimes(3);
    expect(currentRenderComponent).not.toBe(staleRenderComponent);
    expect(staleRenderUnloadSpy).toHaveBeenCalledTimes(1);
    expect(currentRenderUnloadSpy).not.toHaveBeenCalled();
    expect(toastShowMock).not.toHaveBeenCalled();

    resolveCurrentRender?.();
    await flush();
    await view.onClose();

    expect(currentRenderUnloadSpy).toHaveBeenCalledTimes(1);
  });

  it("loads the global status scope when pool navigation is opened from the home status icon", async () => {
    const loadPoolState = vi.fn(async (input?: {
      scope?: "pool" | "global-status";
      status?: "all" | "referenced" | "file-created" | "with-markers";
      query?: string;
      contentFilter?: "all" | "text" | "link" | "image" | "video";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => ({
      pool: {
        id: input?.scope === "global-status" ? "pool-global-status" : "pool-default",
        title: input?.scope === "global-status" ? "已引用 / 已建文件" : "默认池",
        description: "desc",
        totalItemCount: 2,
        visibleItemCount: 2,
        tone: "bluegray" as const
      },
      header: {
        eyebrow: input?.scope === "global-status" ? "全局状态" : "灵感池",
        hint: input?.scope === "global-status" ? "筛选所有池中的已引用与已建文件灵感" : "进入当前池继续整理与筛选"
      },
      cards: [],
      controls: {
        query: input?.query ?? "",
        status: input?.status ?? ("all" as const),
        contentFilter: input?.contentFilter ?? ("all" as const),
        sort: input?.sort ?? ("updated-desc" as const),
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: []
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
                setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const hostLeaf = {
      getViewState: () => ({
        state: {
          mode: "browse",
          scope: "global-status",
          status: "with-markers",
          resetFilters: true
        }
      })
    };

    const view = new GlitterPoolView(hostLeaf as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    expect(loadPoolState).toHaveBeenCalledWith({
      scope: "global-status",
      query: "",
      status: "with-markers",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });
    expect(view.getState()).toStrictEqual({
      mode: "browse",
      query: "",
      status: "with-markers",
      contentFilter: "all",
      sort: "updated-desc",
      batchMode: false,
      scope: "global-status"
    });
  });

  it("loads runtime pool state even when review mode is enabled", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 0,
        visibleItemCount: 0,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "0 ideas · runtime" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 0, selected: true }]
    }));

    const plugin = {
      settings: {
        enableDesignReviewMode: true,
        reviewScenario: "pool-empty"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    const runtimeState = { mode: "browse" };
    buildPoolViewStateFromRuntimeMock.mockReturnValue(runtimeState);

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    expect(loadPoolState).toHaveBeenCalledWith({
      poolId: undefined,
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: expect.objectContaining({ id: "pool-default" }),
        batchMode: false
      })
    );
    expect(renderPoolViewMock).toHaveBeenCalledWith(
      view.contentEl,
      runtimeState,
      expect.objectContaining({
        onBack: expect.any(Function),
        onCreateIdea: expect.any(Function)
      })
    );
  });

  it("delegates browse action creation through createPoolViewActions", async () => {
    const sentinelActions = {
      onBack: vi.fn(),
      onItemSelect: vi.fn(),
      onCreateIdea: vi.fn()
    };
    const createPoolViewActionsMock = vi.fn(() => sentinelActions);

    vi.resetModules();
    vi.doMock("../../src/views/pool-view-actions", () => ({
      createPoolViewActions: createPoolViewActionsMock
    }));

    try {
      const { GlitterPoolView: RefactoredPoolView } = await import("../../src/views/pool-view");

      const loadPoolState = vi.fn(async () => ({
        pool: {
          id: "pool-default",
          title: "默认池",
          description: "desc",
          totalItemCount: 0,
          visibleItemCount: 0,
          tone: "bluegray" as const
        },
        header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
        cards: [],
        controls: {
          query: "",
          status: "all" as const,
          contentFilter: "all" as const,
          sort: "updated-desc" as const,
          selectedCount: 0,
          hasSelection: false
        },
        poolOptions: [{ id: "pool-default", label: "默认池", count: 0, selected: true }]
      }));

      const plugin = {
        app: {},
        focusedIdeaId: null,
        pendingFocusedPoolId: null,
        activateMainView: vi.fn(async () => undefined),
        poolWorkbenchWorkflow: {
          loadPoolState,
          setActivePoolId: vi.fn(async () => undefined),
          moveIdeasToPool: vi.fn(async () => undefined),
          createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
        }
      };

      buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

      const view = new RefactoredPoolView({} as any, plugin as any);
      await view.onOpen();

      expect(createPoolViewActionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          runtime: expect.objectContaining({
            pool: expect.objectContaining({ id: "pool-default" })
          }),
          toggleBrowseOverlay: expect.any(Function),
          clearBrowseOverlay: expect.any(Function),
          locatePoolRoamSource: expect.any(Function),
          deletePoolRoamSourceLink: expect.any(Function)
        })
      );
      expect(renderPoolViewMock).toHaveBeenCalledWith(view.contentEl, expect.any(Object), sentinelActions);
    } finally {
      vi.doUnmock("../../src/views/pool-view-actions");
      vi.resetModules();
    }
  });

  it("loads runtime state and wires create/filter/pool-switch/file actions", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 2,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "灵感池", hint: "进入当前池继续整理与筛选" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 2, selected: true }]
    }));

    const leafSetViewState = vi.fn(async () => undefined);
    const moveIdeasToPool = vi.fn(async () => undefined);
    const createIdeaFile = vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }));
    const savePoolMarkdownFile = vi.fn(async () => ({ filePath: "Glitter/池导出/默认池.md", poolTitle: "默认池" }));
    const updatePool = vi.fn(async () => undefined);

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool,
        createIdeaFile,
        savePoolMarkdownFile,
        updatePool
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({ setViewState: leafSetViewState } as any, plugin as any);
    await view.onOpen();

    expect(loadPoolState).toHaveBeenCalledWith({
      poolId: undefined,
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onCreateIdea: () => void;
      onStatusChange: (status: "all" | "referenced" | "file-created" | "with-markers") => void;
      onContentFilterChange: (filter: "all" | "text" | "link" | "image" | "video") => void;
      onSortChange: (sort: "updated-desc" | "created-desc" | "title-asc") => void;
      onItemSelect: (itemId: string) => void;
      onBatchModeToggle: () => void;
      onMoveSelectionToPool: (poolId: string) => void;
      onCreateFile: (ideaId: string) => void;
      onSavePoolMarkdownFile: () => void;
      onPoolSwitch: (poolId: string) => void;
      onPoolTitleSave: (title: string) => void;
      onPoolDescriptionSave: (description: string) => void;
      onBack: () => void;
    };

    actions.onCreateIdea();
    await Promise.resolve();
    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(1);
    expect(quickCaptureInstances[0]?.step).toBe("capture");
    expect(quickCaptureInstances[0]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-default",
        initialSelectedPoolLabel: "默认池"
      })
    );

    quickCaptureInstances[0]?.handlers.onSaved?.({
      poolId: "pool-default",
      poolLabel: "默认池",
      createFileChecked: true
    });
    await Promise.resolve();
    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(2);
    expect(quickCaptureInstances[1]?.step).toBe("saved-feedback");
    expect(quickCaptureInstances[1]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-default",
        initialSelectedPoolLabel: "默认池"
      })
    );

    actions.onStatusChange("referenced");
    actions.onContentFilterChange("text");
    actions.onSortChange("created-desc");
    actions.onItemSelect("idea-1");
    actions.onBatchModeToggle();
    actions.onMoveSelectionToPool("pool-other");
    await Promise.resolve();
    await Promise.resolve();
    expect(moveIdeasToPool).toHaveBeenCalledWith(["idea-1"], "pool-other");

    actions.onCreateFile("idea-1");
    await Promise.resolve();
    expect(createIdeaFile).toHaveBeenCalledWith("idea-1");

    actions.onSavePoolMarkdownFile();
    await Promise.resolve();
    await Promise.resolve();
    expect(savePoolMarkdownFile).toHaveBeenCalledTimes(1);
    expect(savePoolMarkdownFile).toHaveBeenCalledWith({
      poolId: "pool-default",
      sort: "created-desc"
    });

    actions.onPoolTitleSave("新的池标题");
    await Promise.resolve();
    expect(updatePool).toHaveBeenCalledWith("pool-default", { name: "新的池标题" });

    actions.onPoolDescriptionSave("新的池描述");
    await Promise.resolve();
    expect(updatePool).toHaveBeenCalledWith("pool-default", { description: "新的池描述" });

    actions.onPoolSwitch("pool-other");
    await Promise.resolve();
    expect(leafSetViewState).toHaveBeenCalledWith({
      type: "glitter-idea-pool-view",
      active: true,
      state: {
        poolId: "pool-other",
        mode: "browse",
        query: "",
        status: "referenced",
        contentFilter: "text",
        sort: "created-desc",
        batchMode: false
      }
    });

    actions.onBack();
    expect(plugin.activateMainView).toHaveBeenCalledTimes(1);
  });

  it("prompts before leaving roam mode from the back button and only returns home after confirmation", async () => {
    const loadPoolState = vi.fn(async (input?: {
      poolId?: string;
      query?: string;
      status?: "all" | "referenced" | "file-created" | "with-markers";
      contentFilter?: "all" | "text" | "link" | "image" | "video";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => ({
      pool: {
        id: input?.poolId ?? "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          contentType: "text" as const,
          attachmentPaths: [],
          fileCreated: false,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: input?.status ?? ("all" as const),
        contentFilter: input?.contentFilter ?? ("all" as const),
        sort: input?.sort ?? ("updated-desc" as const),
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: input?.poolId ?? "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-default",
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/demo.canvas"
          }
        })
      } as any,
      plugin as any
    );

    await view.onOpen();
    await Promise.resolve();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBack: () => void;
      onDismissRoamBackConfirm: () => void;
      onConfirmRoamBackHome: () => void;
    };

    actions.onBack();
    expect(plugin.activateMainView).toHaveBeenCalledTimes(0);
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          open: true,
          boardPath: "Glitter/灵感漫游/demo.canvas"
        }),
        roamBackConfirmVisible: true
      })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onDismissRoamBackConfirm();
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        roam: expect.objectContaining({
          open: true,
          boardPath: "Glitter/灵感漫游/demo.canvas"
        }),
        roamBackConfirmVisible: false
      })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBack();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onConfirmRoamBackHome();

    expect(plugin.activateMainView).toHaveBeenCalledTimes(1);
    expect(view.getState()).not.toHaveProperty("poolRoamOpen");
    expect(view.getState()).not.toHaveProperty("poolRoamBoardPath");
  });

  it("stores the roam pane ratio after divider resize actions", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [{
        id: "idea-1",
        title: "Idea 1",
        body: "Idea 1 body",
        excerpt: "excerpt",
        hasBodyContent: true,
        selected: false,
        contentType: "text" as const,
        sourceUrl: undefined,
        attachmentPaths: [],
        fileCreated: false,
        filePath: undefined,
        referenced: false,
        updatedAt: "2026-04-12T00:00:00.000Z"
      }],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            poolId: "pool-default",
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/demo.canvas"
          }
        })
      } as any,
      plugin as any
    );

    await view.onOpen();
    await Promise.resolve();

    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        roam: expect.objectContaining({
          panelWidthRatio: 0.6
        })
      })
    );

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onSetPoolRoamPaneRatio?: (ratio: number) => void;
    };
    actions.onSetPoolRoamPaneRatio?.(0.76);

    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        roam: expect.objectContaining({
          panelWidthRatio: 0.76
        })
      })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onSetPoolRoamPaneRatio?.(0.95);

    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        roam: expect.objectContaining({
          panelWidthRatio: 0.8
        })
      })
    );
  });

  it("passes contentFilter/activeOverlay into state builder and supports unified overlay close paths", async () => {
    const loadPoolState = vi.fn(async (input?: { query?: string; contentFilter?: "all" | "text" | "link" | "image" | "video" }) => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: "all" as const,
        contentFilter: input?.contentFilter ?? "all",
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn()
    } as unknown as HTMLElement;

    await view.onOpen();

    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        controls: expect.objectContaining({ contentFilter: "all" }),
        activeOverlay: undefined
      })
    );

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onQueryChange: (query: string, options?: { isComposing?: boolean }) => void;
      onQuerySubmit: (query: string) => void;
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
      onBrowseOverlayClose: () => void;
      onContentFilterChange: (filter: "all" | "text" | "link" | "image" | "video") => void;
    };

    actions.onQueryChange("alpha");
    await Promise.resolve();

    expect(loadPoolState).toHaveBeenCalledTimes(1);
    expect(view.getState()).toEqual(expect.objectContaining({ query: "" }));

    actions.onQuerySubmit("alpha");
    await Promise.resolve();

    const loadPoolStateCountBeforeOverlayToggle = loadPoolState.mock.calls.length;
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBrowseOverlayToggle("pool-switcher");
    await Promise.resolve();
    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCountBeforeOverlayToggle);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: "pool-switcher", poolSwitcherActivePoolId: "pool-default" })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBrowseOverlayToggle("filter");
    await Promise.resolve();
    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCountBeforeOverlayToggle);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: "filter", poolSwitcherActivePoolId: undefined })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onContentFilterChange("video");
    await Promise.resolve();

    expect(loadPoolState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "alpha",
        contentFilter: "video"
      })
    );
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        controls: expect.objectContaining({ contentFilter: "video" }),
        activeOverlay: undefined
      })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBrowseOverlayToggle("status");
    await Promise.resolve();
    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCountBeforeOverlayToggle + 1);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: "status" })
    );

    const loadPoolStateCountBeforeOverlayClose = loadPoolState.mock.calls.length;
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBrowseOverlayClose();
    await Promise.resolve();
    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCountBeforeOverlayClose);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: undefined })
    );

    const pointerdownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "pointerdown"
    )?.[1] as ((event: { target: EventTarget | null }) => void) | undefined;
    const keydownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "keydown"
    )?.[1] as ((event: { key: string; preventDefault?: () => void; stopPropagation?: () => void }) => void) | undefined;

    expect(pointerdownHandler).toBeTypeOf("function");
    expect(keydownHandler).toBeTypeOf("function");

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBrowseOverlayToggle("pool-switcher");
    await Promise.resolve();

    const switcherEl = {
      nodeType: 1,
      matches: (selector: string) => selector === ".glitter-pool-stage__pool-switcher",
      parentNode: null
    };
    const switcherTextNode = {
      nodeType: 3,
      parentNode: switcherEl
    };

    pointerdownHandler?.({ target: switcherTextNode as unknown as EventTarget });
    await Promise.resolve();
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: "pool-switcher" })
    );

    const toolbarMenuEl = {
      nodeType: 1,
      matches: (selector: string) => selector === ".glitter-pool-stage__toolbar-menu",
      parentNode: null
    };
    const toolbarMenuTextNode = {
      nodeType: 3,
      parentNode: toolbarMenuEl
    };

    pointerdownHandler?.({ target: toolbarMenuTextNode as unknown as EventTarget });
    await Promise.resolve();
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: "pool-switcher" })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBrowseOverlayToggle("status");
    await Promise.resolve();

    const toolbarTriggerAnchorEl = {
      nodeType: 1,
      matches: (selector: string) => selector === ".glitter-pool-stage__results-tool-anchor",
      parentNode: null
    };
    const toolbarTriggerButtonEl = {
      nodeType: 1,
      matches: () => false,
      parentNode: toolbarTriggerAnchorEl
    };
    const toolbarTriggerIconEl = {
      nodeType: 1,
      matches: () => false,
      parentNode: toolbarTriggerButtonEl
    };

    pointerdownHandler?.({ target: toolbarTriggerIconEl as unknown as EventTarget });
    await Promise.resolve();
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: "status" })
    );

    pointerdownHandler?.({ target: {} as EventTarget });
    await Promise.resolve();
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: undefined })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBrowseOverlayToggle("status");
    await Promise.resolve();

    keydownHandler?.({ key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() });
    await Promise.resolve();
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: undefined })
    );

    await view.onClose();
    expect(documentEl.removeEventListener).toHaveBeenCalledWith("pointerdown", pointerdownHandler);
    expect(documentEl.removeEventListener).toHaveBeenCalledWith("keydown", keydownHandler);
  });

  it("preserves query input focus and caret across rerender on query submit", async () => {
    const loadPoolState = vi.fn(async (input?: { query?: string }) => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const oldQueryInput = {
      selectionStart: 2,
      selectionEnd: 5
    } as unknown as HTMLInputElement;
    const nextQueryInput = {
      focus: vi.fn(),
      setSelectionRange: vi.fn()
    } as unknown as HTMLInputElement;

    let queryLookupCount = 0;
    const documentEl = {
      activeElement: oldQueryInput,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: (selector: string) => {
        if (selector !== ".glitter-pool-stage__query") {
          return null;
        }
        queryLookupCount += 1;
        return queryLookupCount === 1 ? oldQueryInput : nextQueryInput;
      }
    } as unknown as HTMLElement;

    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onQuerySubmit: (query: string) => void;
    };
    actions.onQuerySubmit("alpha");
    await Promise.resolve();

    expect(nextQueryInput.focus).toHaveBeenCalledTimes(1);
    expect(nextQueryInput.setSelectionRange).toHaveBeenCalledWith(2, 5);
    expect(loadPoolState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "alpha"
      })
    );
  });

  it("preserves move-dialog search focus and caret across local rerender", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const oldMoveSearchInput = {
      selectionStart: 1,
      selectionEnd: 2
    } as unknown as HTMLInputElement;
    const nextMoveSearchInput = {
      focus: vi.fn(),
      setSelectionRange: vi.fn()
    } as unknown as HTMLInputElement;

    let moveSearchLookupCount = 0;
    const documentEl = {
      activeElement: oldMoveSearchInput,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: (selector: string) => {
        if (selector !== ".glitter-pool-stage__card-move-dialog-search") {
          return null;
        }
        moveSearchLookupCount += 1;
        return moveSearchLookupCount === 1 ? oldMoveSearchInput : nextMoveSearchInput;
      }
    } as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenCardMovePicker?: (ideaId: string) => void;
      onCardMovePickerSearchQueryChange?: (query: string) => void;
      getCardMovePickerSearchQuery?: () => string;
    };

    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onCardMovePickerSearchQueryChange?.("归");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("归");
    expect(nextMoveSearchInput.focus).toHaveBeenCalledTimes(1);
    expect(nextMoveSearchInput.setSelectionRange).toHaveBeenCalledWith(1, 2);
  });

  it("keeps move-dialog search drafts local during IME composition and rerenders after composition ends", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenCardMovePicker?: (ideaId: string) => void;
      onCardMovePickerSearchQueryChange?: (query: string, options?: { isComposing?: boolean }) => void;
      getCardMovePickerSearchQuery?: () => string;
    };

    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    const renderCountAfterOpen = renderPoolViewMock.mock.calls.length;

    actions.onCardMovePickerSearchQueryChange?.("归", { isComposing: true });
    await Promise.resolve();
    expect(renderPoolViewMock.mock.calls).toHaveLength(renderCountAfterOpen);
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("归");

    actions.onCardMovePickerSearchQueryChange?.("归档", { isComposing: false });
    await Promise.resolve();
    expect(renderPoolViewMock.mock.calls).toHaveLength(renderCountAfterOpen + 1);
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("归档");
  });

  it("preserves card-grid scroll position when toggling browse overlays", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const oldCardGrid = {
      scrollTop: 168,
      scrollLeft: 12
    } as unknown as HTMLElement;
    const nextCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;

    let cardGridLookupCount = 0;
    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: (selector: string) => {
        if (selector !== ".glitter-pool-stage__card-grid") {
          return null;
        }
        cardGridLookupCount += 1;
        return cardGridLookupCount === 1 ? oldCardGrid : nextCardGrid;
      }
    } as unknown as HTMLElement;

    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
    };
    actions.onBrowseOverlayToggle("pool-switcher");
    await Promise.resolve();

    expect(nextCardGrid.scrollTop).toBe(168);
    expect(nextCardGrid.scrollLeft).toBe(12);
  });

  it("preserves card-grid scroll position when outside pointerdown closes browse overlays", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const oldCardGrid = {
      scrollTop: 168,
      scrollLeft: 12
    } as unknown as HTMLElement;
    const overlayCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const closedOverlayCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;

    let cardGridLookupCount = 0;
    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: (selector: string) => {
        if (selector !== ".glitter-pool-stage__card-grid") {
          return null;
        }
        cardGridLookupCount += 1;
        if (cardGridLookupCount === 1) {
          return oldCardGrid;
        }
        if (cardGridLookupCount === 2 || cardGridLookupCount === 3) {
          return overlayCardGrid;
        }
        return closedOverlayCardGrid;
      }
    } as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
    };
    actions.onBrowseOverlayToggle("status");
    await Promise.resolve();

    expect(overlayCardGrid.scrollTop).toBe(168);
    expect(overlayCardGrid.scrollLeft).toBe(12);

    const pointerdownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "pointerdown"
    )?.[1] as ((event: { target: EventTarget | null }) => void) | undefined;

    expect(pointerdownHandler).toBeTypeOf("function");

    pointerdownHandler?.({ target: {} as EventTarget });
    await Promise.resolve();

    expect(closedOverlayCardGrid.scrollTop).toBe(168);
    expect(closedOverlayCardGrid.scrollLeft).toBe(12);
  });

  it("opens a card more menu without remounting the rendered pool stage", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const cardGrid = {
      scrollTop: 168,
      scrollLeft: 12
    } as unknown as HTMLElement;
    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    syncRenderedPoolCardMenusMock.mockReturnValue(true);
    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: (selector: string) => {
        if (selector !== ".glitter-pool-stage__card-grid") {
          return null;
        }
        return cardGrid;
      }
    } as unknown as HTMLElement;

    await view.onOpen();

    const initialRenderCount = renderPoolViewMock.mock.calls.length;
    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
    };
    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();

    expect(syncRenderedPoolCardMenusMock).toHaveBeenCalledWith((view as unknown as { contentEl: HTMLElement }).contentEl, "idea-1");
    expect(renderPoolViewMock).toHaveBeenCalledTimes(initialRenderCount);
    expect(cardGrid.scrollTop).toBe(168);
    expect(cardGrid.scrollLeft).toBe(12);
  });

  it("closes a card more menu for edit actions without remounting the rendered pool stage", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const cardGrid = {
      scrollTop: 168,
      scrollLeft: 12
    } as unknown as HTMLElement;
    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    syncRenderedPoolCardMenusMock.mockReturnValue(true);
    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: (selector: string) => {
        if (selector !== ".glitter-pool-stage__card-grid") {
          return null;
        }
        return cardGrid;
      }
    } as unknown as HTMLElement;

    await view.onOpen();

    const initialRenderCount = renderPoolViewMock.mock.calls.length;
    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      onEditIdea: (ideaId: string) => void;
    };
    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();
    actions.onEditIdea("idea-1");
    await Promise.resolve();

    expect(syncRenderedPoolCardMenusMock).toHaveBeenNthCalledWith(1, (view as unknown as { contentEl: HTMLElement }).contentEl, "idea-1");
    expect(syncRenderedPoolCardMenusMock).toHaveBeenNthCalledWith(2, (view as unknown as { contentEl: HTMLElement }).contentEl, undefined);
    expect(renderPoolViewMock).toHaveBeenCalledTimes(initialRenderCount);
    expect(ideaEditOpenMock).toHaveBeenCalledTimes(1);
    expect(cardGrid.scrollTop).toBe(168);
    expect(cardGrid.scrollLeft).toBe(12);
  });

  it("rerenders when opening a card more menu also needs to close a browse overlay", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    syncRenderedPoolCardMenusMock.mockReturnValue(true);
    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    actions.onBrowseOverlayToggle("status");
    await Promise.resolve();

    const renderCountAfterOverlayOpen = renderPoolViewMock.mock.calls.length;
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();

    expect(syncRenderedPoolCardMenusMock).not.toHaveBeenCalled();
    expect(renderPoolViewMock).toHaveBeenCalledTimes(renderCountAfterOverlayOpen + 1);
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMenuOpen("idea-1")).toBe(true);
  });

  it("rerenders when opening a card more menu also needs to close a move picker", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    syncRenderedPoolCardMenusMock.mockReturnValue(true);
    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenCardMovePicker: (ideaId: string) => void;
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    actions.onOpenCardMovePicker("idea-1");
    await Promise.resolve();

    const renderCountAfterMovePickerOpen = renderPoolViewMock.mock.calls.length;
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();

    expect(syncRenderedPoolCardMenusMock).not.toHaveBeenCalled();
    expect(renderPoolViewMock).toHaveBeenCalledTimes(renderCountAfterMovePickerOpen + 1);
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMenuOpen("idea-1")).toBe(true);
  });

  it("closes card menu on Escape without remounting when local sync succeeds", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    syncRenderedPoolCardMenusMock.mockReturnValue(true);
    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn()
    } as unknown as HTMLElement;

    await view.onOpen();

    const initialRenderCount = renderPoolViewMock.mock.calls.length;
    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();

    const keydownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "keydown"
    )?.[1] as ((event: { key: string; preventDefault?: () => void; stopPropagation?: () => void }) => void) | undefined;

    const preventDefault = vi.fn();
    keydownHandler?.({ key: "Escape", preventDefault, stopPropagation: vi.fn() });
    await Promise.resolve();

    expect(preventDefault).toHaveBeenCalled();
    expect(syncRenderedPoolCardMenusMock).toHaveBeenNthCalledWith(1, (view as unknown as { contentEl: HTMLElement }).contentEl, "idea-1");
    expect(syncRenderedPoolCardMenusMock).toHaveBeenNthCalledWith(2, (view as unknown as { contentEl: HTMLElement }).contentEl, undefined);
    expect(renderPoolViewMock).toHaveBeenCalledTimes(initialRenderCount);
    expect(loadPoolState).toHaveBeenCalledTimes(1);
    expect(actions.isCardMenuOpen("idea-1")).toBe(false);
  });

  it("keeps query drafts local during IME composition and only reloads after explicit submit", async () => {
    const loadPoolState = vi.fn(async (input?: { query?: string }) => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const initialRenderCount = renderPoolViewMock.mock.calls.length;
    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onQueryChange: (query: string, options?: { isComposing?: boolean }) => void;
      onQuerySubmit: (query: string) => void;
    };

    actions.onQueryChange("中文候选", { isComposing: true });
    await Promise.resolve();

    expect(view.getState()).toEqual(
      expect.objectContaining({
        query: ""
      })
    );
    expect(loadPoolState).toHaveBeenCalledTimes(1);
    expect(renderPoolViewMock).toHaveBeenCalledTimes(initialRenderCount);

    actions.onQueryChange("中文输入", { isComposing: false });
    await Promise.resolve();

    expect(loadPoolState).toHaveBeenCalledTimes(1);
    expect(renderPoolViewMock).toHaveBeenCalledTimes(initialRenderCount);

    actions.onQuerySubmit("中文输入");
    await Promise.resolve();

    expect(loadPoolState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "中文输入"
      })
    );
    expect(renderPoolViewMock.mock.calls.length).toBeGreaterThan(initialRenderCount);
    expect(view.getState()).toEqual(
      expect.objectContaining({
        query: "中文输入"
      })
    );
  });

  it("batch trigger toggles direct batch mode and keeps other overlays independent", async () => {
    const loadPoolState = vi.fn(
      async (input?: {
        selectedIdeaIds?: string[];
        status?: "all" | "referenced" | "file-created" | "with-markers";
        contentFilter?: "all" | "text" | "link" | "image" | "video";
        sort?: "updated-desc" | "created-desc" | "title-asc";
      }) => ({
        pool: {
          id: "pool-default",
          title: "默认池",
          description: "desc",
          totalItemCount: 2,
          visibleItemCount: 2,
          tone: "bluegray" as const
        },
        header: { eyebrow: "Idea Pool", hint: "2 ideas · runtime" },
        cards: [
          {
            id: "idea-1",
            title: "Idea 1",
            excerpt: "excerpt",
            hasBodyContent: true,
            selected: Boolean(input?.selectedIdeaIds?.includes("idea-1")),
            contentType: "text" as const,
            sourceUrl: undefined,
            attachmentPaths: [],
            fileCreated: false,
            filePath: undefined,
            referenced: false,
            updatedAt: "2026-04-12T00:00:00.000Z"
          },
          {
            id: "idea-2",
            title: "Idea 2",
            excerpt: "excerpt",
            hasBodyContent: true,
            selected: Boolean(input?.selectedIdeaIds?.includes("idea-2")),
            contentType: "text" as const,
            sourceUrl: undefined,
            attachmentPaths: [],
            fileCreated: false,
            filePath: undefined,
            referenced: false,
            updatedAt: "2026-04-12T00:00:00.000Z"
          }
        ],
        controls: {
          query: "",
          status: input?.status ?? ("all" as const),
          contentFilter: input?.contentFilter ?? ("all" as const),
          sort: input?.sort ?? ("updated-desc" as const),
          selectedCount: input?.selectedIdeaIds?.length ?? 0,
          hasSelection: Boolean(input?.selectedIdeaIds?.length)
        },
        poolOptions: [{ id: "pool-default", label: "默认池", count: 2, selected: true }]
      })
    );

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBatchModeToggle: () => void;
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
      onItemSelect: (itemId: string) => void;
    };

    const loadPoolStateCountBeforeBatchMode = loadPoolState.mock.calls.length;
    actions.onBatchModeToggle();
    await Promise.resolve();
    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCountBeforeBatchMode);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ batchMode: true, activeOverlay: undefined })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onBrowseOverlayToggle("status");
    await Promise.resolve();
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ batchMode: true, activeOverlay: "status" })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onItemSelect("idea-1");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onItemSelect("idea-2");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    const loadPoolStateCountBeforeBatchExit = loadPoolState.mock.calls.length;
    actions.onBatchModeToggle();
    await Promise.resolve();

    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCountBeforeBatchExit);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        batchMode: false,
        activeOverlay: undefined,
        controls: expect.objectContaining({ selectedCount: 1, hasSelection: true })
      })
    );
  });

  it("deletes all selected ideas from batch panel and clears batch mode", async () => {
    const loadPoolState = vi.fn(
      async (input?: {
        selectedIdeaIds?: string[];
      }) => ({
        pool: {
          id: "pool-default",
          title: "默认池",
          description: "desc",
          totalItemCount: 2,
          visibleItemCount: 2,
          tone: "bluegray" as const
        },
        header: { eyebrow: "Idea Pool", hint: "2 ideas · runtime" },
        cards: [
          {
            id: "idea-1",
            title: "Idea 1",
            excerpt: "excerpt",
            hasBodyContent: true,
            selected: Boolean(input?.selectedIdeaIds?.includes("idea-1")),
            contentType: "text" as const,
            sourceUrl: undefined,
            attachmentPaths: [],
            fileCreated: false,
            filePath: undefined,
            referenced: false,
            updatedAt: "2026-04-12T00:00:00.000Z"
          },
          {
            id: "idea-2",
            title: "Idea 2",
            excerpt: "excerpt",
            hasBodyContent: true,
            selected: Boolean(input?.selectedIdeaIds?.includes("idea-2")),
            contentType: "text" as const,
            sourceUrl: undefined,
            attachmentPaths: [],
            fileCreated: false,
            filePath: undefined,
            referenced: false,
            updatedAt: "2026-04-12T00:00:00.000Z"
          }
        ],
        controls: {
          query: "",
          status: "all" as const,
          contentFilter: "all" as const,
          sort: "updated-desc" as const,
          selectedCount: input?.selectedIdeaIds?.length ?? 0,
          hasSelection: Boolean(input?.selectedIdeaIds?.length)
        },
        poolOptions: [{ id: "pool-default", label: "默认池", count: 2, selected: true }]
      })
    );

    deleteIdeaMock.mockResolvedValue(true);

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" })),
        deleteIdea: deleteIdeaMock
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBatchModeToggle: () => void;
      onItemSelect: (itemId: string) => void;
      onDeleteSelection: () => void;
    };

    actions.onBatchModeToggle();
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onItemSelect("idea-1");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onItemSelect("idea-2");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onDeleteSelection();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(deleteIdeaMock).toHaveBeenNthCalledWith(1, "idea-1");
    expect(deleteIdeaMock).toHaveBeenNthCalledWith(2, "idea-2");
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ batchMode: true, activeOverlay: undefined })
    );
    expect(loadPoolState).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedIdeaIds: [] })
    );
  });

  it("keeps only one card more-menu open at a time", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 2,
        visibleItemCount: 2,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "2 ideas · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        },
        {
          id: "idea-2",
          title: "Idea 2",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 2, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    const loadPoolStateCallCountAfterOpen = loadPoolState.mock.calls.length;

    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();
    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCallCountAfterOpen);
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    expect(actions.isCardMenuOpen("idea-1")).toBe(true);
    expect(actions.isCardMenuOpen("idea-2")).toBe(false);

    actions.onCardMenuToggle("idea-2");
    await Promise.resolve();
    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCallCountAfterOpen);
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    expect(actions.isCardMenuOpen("idea-1")).toBe(false);
    expect(actions.isCardMenuOpen("idea-2")).toBe(true);
  });

  it("closes card menu on outside pointerdown but not inside menu shell", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn()
    } as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();
    const loadPoolStateCallCountAfterOpen = loadPoolState.mock.calls.length;

    const pointerdownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "pointerdown"
    )?.[1] as ((event: { target: EventTarget | null }) => void) | undefined;

    const menuShellEl = {
      nodeType: 1,
      matches: (selector: string) => selector === ".glitter-pool-stage__card-menu-shell",
      parentNode: null
    };
    const menuShellTextNode = {
      nodeType: 3,
      parentNode: menuShellEl
    };

    const renderCallCountBeforeInside = renderPoolViewMock.mock.calls.length;
    pointerdownHandler?.({ target: menuShellTextNode as unknown as EventTarget });
    await Promise.resolve();
    expect(renderPoolViewMock.mock.calls.length).toBe(renderCallCountBeforeInside);

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    expect(actions.isCardMenuOpen("idea-1")).toBe(true);

    pointerdownHandler?.({ target: {} as EventTarget });
    await Promise.resolve();
    expect(loadPoolState.mock.calls.length).toBe(loadPoolStateCallCountAfterOpen);
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    expect(actions.isCardMenuOpen("idea-1")).toBe(false);
  });

  it("closes card menu on outside pointerdown without remounting when local sync succeeds", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    syncRenderedPoolCardMenusMock.mockReturnValue(true);
    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn()
    } as unknown as HTMLElement;

    await view.onOpen();

    const initialRenderCount = renderPoolViewMock.mock.calls.length;
    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();

    const pointerdownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "pointerdown"
    )?.[1] as ((event: { target: EventTarget | null }) => void) | undefined;

    pointerdownHandler?.({ target: {} as EventTarget });
    await Promise.resolve();

    expect(syncRenderedPoolCardMenusMock).toHaveBeenNthCalledWith(1, (view as unknown as { contentEl: HTMLElement }).contentEl, "idea-1");
    expect(syncRenderedPoolCardMenusMock).toHaveBeenNthCalledWith(2, (view as unknown as { contentEl: HTMLElement }).contentEl, undefined);
    expect(renderPoolViewMock).toHaveBeenCalledTimes(initialRenderCount);
    expect(loadPoolState).toHaveBeenCalledTimes(1);
    expect(actions.isCardMenuOpen("idea-1")).toBe(false);
  });

  it("closes card menu on Escape", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const oldCardGrid = {
      scrollTop: 168,
      scrollLeft: 12
    } as unknown as HTMLElement;
    const openedMenuCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const closedMenuCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;

    let cardGridLookupCount = 0;
    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: (selector: string) => {
        if (selector !== ".glitter-pool-stage__card-grid") {
          return null;
        }
        cardGridLookupCount += 1;
        if (cardGridLookupCount === 1) {
          return oldCardGrid;
        }
        if (cardGridLookupCount === 2 || cardGridLookupCount === 3) {
          return openedMenuCardGrid;
        }
        return closedMenuCardGrid;
      }
    } as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();

    expect(openedMenuCardGrid.scrollTop).toBe(168);
    expect(openedMenuCardGrid.scrollLeft).toBe(12);

    const keydownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "keydown"
    )?.[1] as ((event: { key: string; preventDefault?: () => void; stopPropagation?: () => void }) => void) | undefined;

    const preventDefault = vi.fn();
    keydownHandler?.({ key: "Escape", preventDefault, stopPropagation: vi.fn() });
    await Promise.resolve();

    expect(preventDefault).toHaveBeenCalled();
    expect(closedMenuCardGrid.scrollTop).toBe(168);
    expect(closedMenuCardGrid.scrollLeft).toBe(12);
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    expect(actions.isCardMenuOpen("idea-1")).toBe(false);
  });

  it("opens the single-card move dialog as exclusive transient UI and resets its search query when closed and reopened", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
      onOpenCardMovePicker?: (ideaId: string) => void;
      onCloseCardMovePicker?: () => void;
      isCardMovePickerOpen?: (ideaId: string) => boolean;
      isCardMovePickerSubmitting?: (ideaId: string) => boolean;
      onCardMovePickerSearchQueryChange?: (query: string) => void;
      getCardMovePickerSearchQuery?: () => string;
    };

    expect(actions.onOpenCardMovePicker).toBeTypeOf("function");
    expect(actions.onCloseCardMovePicker).toBeTypeOf("function");
    expect(actions.isCardMovePickerOpen).toBeTypeOf("function");
    expect(actions.onCardMovePickerSearchQueryChange).toBeTypeOf("function");
    expect(actions.getCardMovePickerSearchQuery).toBeTypeOf("function");

    actions.onBrowseOverlayToggle("status");
    await Promise.resolve();
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: "status" })
    );

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeOverlay: undefined })
    );
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("");

    actions.onCardMovePickerSearchQueryChange?.("归档");
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("归档");

    (view as any).cardMoveSubmittingIdeaId = "idea-1";
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(true);
    actions.onCardMovePickerSearchQueryChange?.("写作");
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("归档");

    (view as any).cardMoveSubmittingIdeaId = undefined;
    actions.onCloseCardMovePicker?.();
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(false);
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("");

    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMenuOpen("idea-1")).toBe(true);
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(false);

    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMenuOpen("idea-1")).toBe(false);
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("");
  });

  it("closes the single-card move dialog on outside pointerdown and Escape, but not inside the dialog", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn()
    } as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenCardMovePicker?: (ideaId: string) => void;
      isCardMovePickerOpen?: (ideaId: string) => boolean;
    };

    expect(actions.onOpenCardMovePicker).toBeTypeOf("function");
    expect(actions.isCardMovePickerOpen).toBeTypeOf("function");

    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();

    const pointerdownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "pointerdown"
    )?.[1] as ((event: { target: EventTarget | null }) => void) | undefined;
    const keydownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "keydown"
    )?.[1] as ((event: { key: string; preventDefault?: () => void; stopPropagation?: () => void }) => void) | undefined;

    expect(pointerdownHandler).toBeTypeOf("function");
    expect(keydownHandler).toBeTypeOf("function");

    const dialogEl = {
      nodeType: 1,
      matches: (selector: string) => selector === ".glitter-pool-stage__card-move-dialog",
      parentNode: null
    };
    const dialogTextNode = {
      nodeType: 3,
      parentNode: dialogEl
    };

    const renderCallCountBeforeInside = renderPoolViewMock.mock.calls.length;
    pointerdownHandler?.({ target: dialogTextNode as unknown as EventTarget });
    await Promise.resolve();
    expect(renderPoolViewMock.mock.calls.length).toBe(renderCallCountBeforeInside);

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);

    pointerdownHandler?.({ target: {} as EventTarget });
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(false);

    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();

    const preventDefault = vi.fn();
    keydownHandler?.({ key: "Escape", preventDefault, stopPropagation: vi.fn() });
    await Promise.resolve();
    expect(preventDefault).toHaveBeenCalled();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(false);
  });

  it("keeps the single-card move picker open while that card move is submitting", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn()
    } as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenCardMovePicker?: (ideaId: string) => void;
      isCardMovePickerOpen?: (ideaId: string) => boolean;
      isCardMovePickerSubmitting?: (ideaId: string) => boolean;
    };

    expect(actions.onOpenCardMovePicker).toBeTypeOf("function");
    expect(actions.isCardMovePickerOpen).toBeTypeOf("function");
    expect(actions.isCardMovePickerSubmitting).toBeTypeOf("function");

    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();
    (view as any).cardMoveSubmittingIdeaId = "idea-1";

    const pointerdownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "pointerdown"
    )?.[1] as ((event: { target: EventTarget | null }) => void) | undefined;
    const keydownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "keydown"
    )?.[1] as ((event: { key: string; preventDefault?: () => void; stopPropagation?: () => void }) => void) | undefined;

    expect(pointerdownHandler).toBeTypeOf("function");
    expect(keydownHandler).toBeTypeOf("function");

    pointerdownHandler?.({ target: {} as EventTarget });
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(true);

    keydownHandler?.({ key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() });
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(true);
  });

  it("clears single-card move picker state when the active card disappears from runtime results", async () => {
    const buildCards = (cards: Array<{
      id: string;
      title: string;
      excerpt: string;
      hasBodyContent: boolean;
      selected: boolean;
      contentType: "text";
      sourceUrl: undefined;
      attachmentPaths: string[];
      fileCreated: boolean;
      filePath: undefined;
      referenced: boolean;
      updatedAt: string;
    }>) => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: cards.length,
        visibleItemCount: cards.length,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: `${cards.length} ideas · runtime` },
      cards,
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: cards.length, selected: true }]
    });

    let runtimeCards = [
      {
        id: "idea-1",
        title: "Idea 1",
        excerpt: "excerpt",
        hasBodyContent: true,
        selected: false,
        contentType: "text" as const,
        sourceUrl: undefined,
        attachmentPaths: [],
        fileCreated: false,
        filePath: undefined,
        referenced: false,
        updatedAt: "2026-04-12T00:00:00.000Z"
      }
    ];
    const loadPoolState = vi.fn(async () => buildCards(runtimeCards));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenCardMovePicker?: (ideaId: string) => void;
      isCardMovePickerOpen?: (ideaId: string) => boolean;
      isCardMovePickerSubmitting?: (ideaId: string) => boolean;
    };

    expect(actions.onOpenCardMovePicker).toBeTypeOf("function");
    expect(actions.isCardMovePickerSubmitting).toBeTypeOf("function");

    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    (view as any).cardMoveSubmittingIdeaId = "idea-1";
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(true);

    runtimeCards = [];
    await view.setState({ mode: "browse" } as any, {} as any);
    await Promise.resolve();
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(false);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(false);
  });

  it("moves a single card to another pool and clears picker state after the card disappears", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const baseCard = {
      id: "idea-1",
      title: "Idea 1",
      excerpt: "excerpt",
      hasBodyContent: true,
      selected: false,
      contentType: "text" as const,
      sourceUrl: undefined,
      attachmentPaths: [],
      fileCreated: false,
      filePath: undefined,
      referenced: false,
      updatedAt: "2026-04-12T00:00:00.000Z"
    };

    let runtimeCards = [baseCard];
    let resolveMove: (() => void) | undefined;
    const loadPoolState = vi.fn(async (input?: { selectedIdeaIds?: string[] }) => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: runtimeCards.length,
        visibleItemCount: runtimeCards.length,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: `${runtimeCards.length} ideas · runtime` },
      cards: runtimeCards.map((card) => ({
        ...card,
        selected: Boolean(input?.selectedIdeaIds?.includes(card.id))
      })),
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: input?.selectedIdeaIds?.length ?? 0,
        hasSelection: Boolean(input?.selectedIdeaIds?.length)
      },
      poolOptions: [
        { id: "pool-default", label: "默认池", count: runtimeCards.length, selected: true },
        { id: "pool-other", label: "其他池", count: 3, selected: false }
      ]
    }));
    const moveIdeasToPool = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMove = () => {
            runtimeCards = [];
            resolve();
          };
        })
    );

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool,
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onItemSelect: (ideaId: string) => void;
      onOpenCardMovePicker?: (ideaId: string) => void;
      onMoveIdeaToPool?: (ideaId: string, poolId: string) => void;
      isCardMovePickerOpen?: (ideaId: string) => boolean;
      isCardMovePickerSubmitting?: (ideaId: string) => boolean;
    };

    actions.onItemSelect("idea-1");
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;

    expect(actions.onOpenCardMovePicker).toBeTypeOf("function");
    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;

    expect(actions.onMoveIdeaToPool).toBeTypeOf("function");
    actions.onMoveIdeaToPool?.("idea-1", "pool-other");
    await flush();

    expect(moveIdeasToPool).toHaveBeenCalledWith(["idea-1"], "pool-other");
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(true);

    resolveMove?.();
    await flush();

    expect(loadPoolState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedIdeaIds: []
      })
    );
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        controls: expect.objectContaining({ selectedCount: 0, hasSelection: false }),
        cards: []
      })
    );
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(false);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(false);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it("keeps the single-card move picker open and shows the existing error toast when move fails", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    let rejectMove: ((error: Error) => void) | undefined;
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        { id: "pool-default", label: "默认池", count: 1, selected: true },
        { id: "pool-other", label: "其他池", count: 3, selected: false }
      ]
    }));
    const moveIdeasToPool = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectMove = reject;
        })
    );

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool,
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenCardMovePicker?: (ideaId: string) => void;
      onMoveIdeaToPool?: (ideaId: string, poolId: string) => void;
      isCardMovePickerOpen?: (ideaId: string) => boolean;
      isCardMovePickerSubmitting?: (ideaId: string) => boolean;
    };

    expect(actions.onOpenCardMovePicker).toBeTypeOf("function");
    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;

    expect(actions.onMoveIdeaToPool).toBeTypeOf("function");
    actions.onMoveIdeaToPool?.("idea-1", "pool-other");
    await flush();

    expect(moveIdeasToPool).toHaveBeenCalledWith(["idea-1"], "pool-other");
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(true);

    rejectMove?.(new Error("move failed"));
    await flush();

    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Move failed. Please try again."
    });
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        cards: [expect.objectContaining({ id: "idea-1" })]
      })
    );
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(false);
  });

  it("ignores a second single-card submit while the first move is still in flight despite stray picker/menu callbacks", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        { id: "pool-default", label: "默认池", count: 1, selected: true },
        { id: "pool-other", label: "其他池", count: 3, selected: false }
      ]
    }));
    let resolveMove: (() => void) | undefined;
    const moveIdeasToPool = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMove = resolve;
        })
    );

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool,
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenCardMovePicker?: (ideaId: string) => void;
      onCloseCardMovePicker?: () => void;
      onMoveIdeaToPool?: (ideaId: string, poolId: string) => void;
      onCardMenuToggle: (ideaId: string) => void;
    };

    expect(actions.onOpenCardMovePicker).toBeTypeOf("function");
    expect(actions.onCloseCardMovePicker).toBeTypeOf("function");
    expect(actions.onMoveIdeaToPool).toBeTypeOf("function");

    actions.onOpenCardMovePicker?.("idea-1");
    await flush();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;

    actions.onMoveIdeaToPool?.("idea-1", "pool-other");
    await flush();
    expect(moveIdeasToPool).toHaveBeenCalledTimes(1);

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onCloseCardMovePicker?.();
    await flush();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onCardMenuToggle("idea-1");
    await flush();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onOpenCardMovePicker?.("idea-1");
    await flush();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onMoveIdeaToPool?.("idea-1", "pool-other");
    await flush();

    expect(moveIdeasToPool).toHaveBeenCalledTimes(1);

    resolveMove?.();
    await flush();
  });

  it("keeps the visible single-card move state sane when the post-submit reload fails", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const baseCard = {
      id: "idea-1",
      title: "Idea 1",
      excerpt: "excerpt",
      hasBodyContent: true,
      selected: false,
      contentType: "text" as const,
      sourceUrl: undefined,
      attachmentPaths: [],
      fileCreated: false,
      filePath: undefined,
      referenced: false,
      updatedAt: "2026-04-12T00:00:00.000Z"
    };

    let runtimeCards = [baseCard];
    let failNextLoad = false;
    let resolveMove: (() => void) | undefined;
    const loadPoolState = vi.fn(async (input?: { selectedIdeaIds?: string[] }) => {
      if (failNextLoad) {
        failNextLoad = false;
        throw new Error("reload failed");
      }

      return {
        pool: {
          id: "pool-default",
          title: "默认池",
          description: "desc",
          totalItemCount: runtimeCards.length,
          visibleItemCount: runtimeCards.length,
          tone: "bluegray" as const
        },
        header: { eyebrow: "Idea Pool", hint: `${runtimeCards.length} ideas · runtime` },
        cards: runtimeCards.map((card) => ({
          ...card,
          selected: Boolean(input?.selectedIdeaIds?.includes(card.id))
        })),
        controls: {
          query: "",
          status: "all" as const,
          contentFilter: "all" as const,
          sort: "updated-desc" as const,
          selectedCount: input?.selectedIdeaIds?.length ?? 0,
          hasSelection: Boolean(input?.selectedIdeaIds?.length)
        },
        poolOptions: [
          { id: "pool-default", label: "默认池", count: runtimeCards.length, selected: true },
          { id: "pool-other", label: "其他池", count: 3, selected: false }
        ]
      };
    });
    const moveIdeasToPool = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMove = () => {
            runtimeCards = [];
            failNextLoad = true;
            resolve();
          };
        })
    );

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool,
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onItemSelect: (ideaId: string) => void;
      onOpenCardMovePicker?: (ideaId: string) => void;
      onMoveIdeaToPool?: (ideaId: string, poolId: string) => void;
      isCardMovePickerOpen?: (ideaId: string) => boolean;
      isCardMovePickerSubmitting?: (ideaId: string) => boolean;
    };

    actions.onItemSelect("idea-1");
    await flush();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;

    expect(actions.onOpenCardMovePicker).toBeTypeOf("function");
    actions.onOpenCardMovePicker?.("idea-1");
    await flush();
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;

    expect(actions.onMoveIdeaToPool).toBeTypeOf("function");
    actions.onMoveIdeaToPool?.("idea-1", "pool-other");
    await flush();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(true);

    resolveMove?.();
    await flush();

    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Load pool failed. Please try again."
    });
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        controls: expect.objectContaining({ selectedCount: 0, hasSelection: false }),
        cards: [expect.objectContaining({ id: "idea-1", selected: false })]
      })
    );
    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(false);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(false);
  });

  it("clears active card menu state across close and reopen lifecycle", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as any).contentEl = {
      addClass: vi.fn(),
      removeClass: vi.fn(),
      empty: vi.fn()
    };

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    actions.onCardMenuToggle("idea-1");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    expect(actions.isCardMenuOpen("idea-1")).toBe(true);

    await view.onClose();
    await view.onOpen();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
    };
    expect(actions.isCardMenuOpen("idea-1")).toBe(false);
  });

  it("clears single-card move dialog state and search query across close and reopen lifecycle", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as any).contentEl = {
      ownerDocument: documentEl,
      addClass: vi.fn(),
      removeClass: vi.fn(),
      empty: vi.fn()
    };

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenCardMovePicker?: (ideaId: string) => void;
      onCardMovePickerSearchQueryChange?: (query: string) => void;
      getCardMovePickerSearchQuery?: () => string;
      isCardMovePickerOpen?: (ideaId: string) => boolean;
      isCardMovePickerSubmitting?: (ideaId: string) => boolean;
    };

    actions.onOpenCardMovePicker?.("idea-1");
    await Promise.resolve();
    actions.onCardMovePickerSearchQueryChange?.("归档");
    await Promise.resolve();
    (view as any).cardMoveSubmittingIdeaId = "idea-1";

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(true);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(true);
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("归档");

    await view.onClose();
    await view.onOpen();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    expect(actions.isCardMovePickerOpen?.("idea-1")).toBe(false);
    expect(actions.isCardMovePickerSubmitting?.("idea-1")).toBe(false);
    expect(actions.getCardMovePickerSearchQuery?.()).toBe("");
  });

  it("closes card menu for edit/share/create/open file while preserving behavior", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: true,
          filePath: "Glitter/Idea 1.md",
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const createIdeaFile = vi.fn(() => new Promise<{ filePath: string }>(() => {}));
    deleteIdeaMock.mockImplementation(() => new Promise<void>(() => {}));
    const openFile = vi.fn(async () => undefined);
    const getLeaf = vi.fn(() => ({ openFile }));
    const abstractFile = new TFile();
    const oldCardGrid = {
      scrollTop: 168,
      scrollLeft: 12
    } as unknown as HTMLElement;
    const openedEditMenuCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const editActionCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const openedShareMenuCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const shareActionCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const openedDeleteMenuCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const deleteActionCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const openedCreateMenuCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const createActionCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const openedOpenMenuCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const openActionCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as unknown as HTMLElement;
    const cardGrids = [
      oldCardGrid,
      openedEditMenuCardGrid,
      openedEditMenuCardGrid,
      editActionCardGrid,
      editActionCardGrid,
      openedShareMenuCardGrid,
      openedShareMenuCardGrid,
      shareActionCardGrid,
      shareActionCardGrid,
      openedDeleteMenuCardGrid,
      openedDeleteMenuCardGrid,
      deleteActionCardGrid,
      deleteActionCardGrid,
      openedCreateMenuCardGrid,
      openedCreateMenuCardGrid,
      createActionCardGrid,
      createActionCardGrid,
      openedOpenMenuCardGrid,
      openedOpenMenuCardGrid,
      openActionCardGrid
    ];
    let cardGridLookupCount = 0;
    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => abstractFile)
        },
        workspace: {
          getLeaf
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile,
        deleteIdea: deleteIdeaMock
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: (selector: string) => {
        if (selector !== ".glitter-pool-stage__card-grid") {
          return null;
        }
        const grid = cardGrids[cardGridLookupCount] ?? cardGrids.at(-1) ?? null;
        cardGridLookupCount += 1;
        return grid;
      }
    } as unknown as HTMLElement;
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCardMenuToggle: (ideaId: string) => void;
      isCardMenuOpen: (ideaId: string) => boolean;
      onEditIdea: (ideaId: string) => void;
      onShareIdea: (ideaId: string, anchorEl: HTMLElement) => void;
      onDeleteIdea: (ideaId: string) => void;
      onCreateFile: (ideaId: string) => void;
      onOpenPrimaryFile: (ideaId: string) => void;
    };

    const openMenu = async (expectedGrid: HTMLElement) => {
      actions.onCardMenuToggle("idea-1");
      await Promise.resolve();
      expect(expectedGrid.scrollTop).toBe(168);
      expect(expectedGrid.scrollLeft).toBe(12);
      actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    };

    const expectMenuClosedOnFirstPostActionRender = async (
      renderCallsBeforeAction: number,
      expectedGrid: HTMLElement
    ) => {
      await Promise.resolve();
      expect(renderPoolViewMock.mock.calls.length).toBeGreaterThan(renderCallsBeforeAction);
      const firstPostActionRenderActions = renderPoolViewMock.mock.calls[renderCallsBeforeAction]?.[2] as typeof actions;
      expect(firstPostActionRenderActions.isCardMenuOpen("idea-1")).toBe(false);
      expect(expectedGrid.scrollTop).toBe(168);
      expect(expectedGrid.scrollLeft).toBe(12);
      actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    };

    await openMenu(openedEditMenuCardGrid);
    let renderCallsBeforeAction = renderPoolViewMock.mock.calls.length;
    actions.onEditIdea("idea-1");
    expect(ideaEditOpenMock).toHaveBeenCalledTimes(1);
    await expectMenuClosedOnFirstPostActionRender(renderCallsBeforeAction, editActionCardGrid);

    await openMenu(openedShareMenuCardGrid);
    renderCallsBeforeAction = renderPoolViewMock.mock.calls.length;
    const anchorEl = {
      getBoundingClientRect: () => ({ right: 300, bottom: 180 })
    } as HTMLElement;
    actions.onShareIdea("idea-1", anchorEl);
    expect(menuShowAtPositionMock).toHaveBeenCalledWith({ x: 300, y: 180 });
    await expectMenuClosedOnFirstPostActionRender(renderCallsBeforeAction, shareActionCardGrid);

    await openMenu(openedDeleteMenuCardGrid);
    renderCallsBeforeAction = renderPoolViewMock.mock.calls.length;
    actions.onDeleteIdea("idea-1");
    expect(deleteIdeaMock).toHaveBeenCalledWith("idea-1");
    await expectMenuClosedOnFirstPostActionRender(renderCallsBeforeAction, deleteActionCardGrid);

    await openMenu(openedCreateMenuCardGrid);
    renderCallsBeforeAction = renderPoolViewMock.mock.calls.length;
    actions.onCreateFile("idea-1");
    expect(createIdeaFile).toHaveBeenCalledWith("idea-1");
    await expectMenuClosedOnFirstPostActionRender(renderCallsBeforeAction, createActionCardGrid);

    await openMenu(openedOpenMenuCardGrid);
    renderCallsBeforeAction = renderPoolViewMock.mock.calls.length;
    actions.onOpenPrimaryFile("idea-1");
    await expectMenuClosedOnFirstPostActionRender(renderCallsBeforeAction, openActionCardGrid);
    expect(getLeaf).toHaveBeenCalledWith(true);
    expect(openFile).toHaveBeenCalledWith(abstractFile);
  });

  it("opens edit modal and reloads when edit save callback fires", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onEditIdea: (ideaId: string) => void;
    };

    actions.onEditIdea("idea-1");
    expect(ideaEditOpenMock).toHaveBeenCalledTimes(1);
    expect(ideaEditInstances[0]?.ideaId).toBe("idea-1");

    const loadCountBeforeSave = loadPoolState.mock.calls.length;
    ideaEditInstances[0]?.handlers.onSaved?.();
    await Promise.resolve();
    expect(loadPoolState.mock.calls.length).toBeGreaterThan(loadCountBeforeSave);
  });

  it("opens share menu at anchor right-bottom and uses localized English share hint text", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      app: {},
      settings: {
        interfaceLanguage: "en" as const
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onShareIdea: (ideaId: string, anchorEl: HTMLElement) => void;
    };

    const anchorEl = {
      getBoundingClientRect: () => ({ right: 320, bottom: 188 })
    } as HTMLElement;

    actions.onShareIdea("idea-1", anchorEl);

    expect(menuShowAtPositionMock).toHaveBeenCalledWith({ x: 320, y: 188 });
    expect(menuItems[0]?.title).toBe("More sharing options coming soon");

    menuItems[0]?.onClick?.();
    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "info",
        message: "More sharing options are coming soon."
      })
    );
  });

  it("falls back to create file when open-file action targets card without filePath", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const createIdeaFile = vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }));

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn()
        },
        workspace: {
          getLeaf: vi.fn(() => ({
            openFile: vi.fn(async () => undefined)
          }))
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenPrimaryFile: (ideaId: string) => void;
    };

    actions.onOpenPrimaryFile("idea-1");
    await Promise.resolve();

    expect(createIdeaFile).toHaveBeenCalledWith("idea-1");
  });

  it("opens existing file via workspace leaf when card has filePath", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: true,
          filePath: "Glitter/Idea 1.md",
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const openFile = vi.fn(async () => undefined);
    const getLeaf = vi.fn(() => ({ openFile }));
    const abstractFile = new TFile();
    const getAbstractFileByPath = vi.fn(() => abstractFile);

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath
        },
        workspace: {
          getLeaf
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenPrimaryFile: (ideaId: string) => void;
    };

    actions.onOpenPrimaryFile("idea-1");
    await Promise.resolve();

    expect(getAbstractFileByPath).toHaveBeenCalledWith("Glitter/Idea 1.md");
    expect(getLeaf).toHaveBeenCalledWith(true);
    expect(openFile).toHaveBeenCalledWith(abstractFile);
  });

  it("shows open-file error toast when resolved file is not TFile", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: true,
          filePath: "Glitter/Idea 1.md",
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const openFile = vi.fn(async () => undefined);
    const getLeaf = vi.fn(() => ({ openFile }));
    const getAbstractFileByPath = vi.fn(() => ({}));

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath
        },
        workspace: {
          getLeaf
        }
      },
      settings: { interfaceLanguage: "zh-CN" as const },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenPrimaryFile: (ideaId: string) => void;
    };

    actions.onOpenPrimaryFile("idea-1");
    await Promise.resolve();

    expect(getAbstractFileByPath).toHaveBeenCalledWith("Glitter/Idea 1.md");
    expect(getLeaf).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        message: "打开文件失败，请重试。"
      })
    );
  });

  it("shows open-file error toast when leaf.openFile rejects", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: true,
          filePath: "Glitter/Idea 1.md",
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const openFile = vi.fn(async () => {
      throw new Error("open failed");
    });
    const getLeaf = vi.fn(() => ({ openFile }));
    const abstractFile = new TFile();
    const getAbstractFileByPath = vi.fn(() => abstractFile);

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath
        },
        workspace: {
          getLeaf
        }
      },
      settings: { interfaceLanguage: "en" as const },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenPrimaryFile: (ideaId: string) => void;
    };

    actions.onOpenPrimaryFile("idea-1");
    await Promise.resolve();
    await Promise.resolve();

    expect(getAbstractFileByPath).toHaveBeenCalledWith("Glitter/Idea 1.md");
    expect(getLeaf).toHaveBeenCalledWith(true);
    expect(openFile).toHaveBeenCalledWith(abstractFile);
    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        message: "Open file failed. Please try again."
      })
    );
  });

  it("opens a single snippet note and best-effort scrolls to the glitter marker when present", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: true,
          snippetLocations: [
            {
              notePath: "Folder/Note A.md",
              noteTitle: "Note A",
              occurrenceCount: 2,
              stale: false
            }
          ],
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const markerScrollIntoView = vi.fn();
    const querySelector = vi.fn(() => ({
      scrollIntoView: markerScrollIntoView
    }));
    const openFile = vi.fn(async () => undefined);
    const leaf = {
      openFile,
      view: {
        containerEl: {
          querySelector
        }
      }
    };
    const getLeaf = vi.fn(() => leaf);
    const abstractFile = new TFile();
    const getAbstractFileByPath = vi.fn(() => abstractFile);

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath
        },
        workspace: {
          getLeaf
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenSnippetNote: (ideaId: string) => void;
    };

    actions.onOpenSnippetNote("idea-1");
    await Promise.resolve();
    await Promise.resolve();

    expect(getAbstractFileByPath).toHaveBeenCalledWith("Folder/Note A.md");
    expect(getLeaf).toHaveBeenCalledWith(true);
    expect(openFile).toHaveBeenCalledWith(abstractFile);
    expect(querySelector).toHaveBeenCalledWith('[data-glitteridea-id="idea-1"], [data-glitter-idea-id="idea-1"]');
    expect(markerScrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("falls back to source-editor snippet targeting when the rendered marker is unavailable", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: true,
          snippetLocations: [
            {
              notePath: "Folder/Note A.md",
              noteTitle: "Note A",
              occurrenceCount: 2,
              stale: false
            }
          ],
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const querySelector = vi.fn(() => null);
    const setCursor = vi.fn();
    const editorScrollIntoView = vi.fn();
    const focus = vi.fn();
    const openFile = vi.fn(async () => undefined);
    const leaf = {
      openFile,
      view: {
        containerEl: {
          querySelector
        },
        editor: {
          lineCount: () => 4,
          getLine: (line: number) => line === 2 ? "> [!GlitterIdea] [Idea 1](glitter://idea/idea-1)" : "Plain text",
          setCursor,
          scrollIntoView: editorScrollIntoView,
          focus
        }
      }
    };
    const getLeaf = vi.fn(() => leaf);
    const abstractFile = new TFile();
    const getAbstractFileByPath = vi.fn(() => abstractFile);

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath
        },
        workspace: {
          getLeaf
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenSnippetNote: (ideaId: string) => void;
    };

    actions.onOpenSnippetNote("idea-1");
    await Promise.resolve();
    await Promise.resolve();

    expect(getAbstractFileByPath).toHaveBeenCalledWith("Folder/Note A.md");
    expect(getLeaf).toHaveBeenCalledWith(true);
    expect(openFile).toHaveBeenCalledWith(abstractFile);
    expect(querySelector).toHaveBeenCalledWith('[data-glitteridea-id="idea-1"], [data-glitter-idea-id="idea-1"]');
    expect(setCursor).toHaveBeenCalledWith({ line: 2, ch: 0 });
    expect(editorScrollIntoView).toHaveBeenCalledWith({ line: 2, ch: 0 }, { line: 2, ch: 0 });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("routes stale single-location snippet opens to the locations modal", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: true,
          snippetLocations: [
            {
              notePath: "Folder/Missing.md",
              noteTitle: "Missing",
              occurrenceCount: 1,
              stale: true
            }
          ],
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const getLeaf = vi.fn();

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn()
        },
        workspace: {
          getLeaf
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenSnippetNote: (ideaId: string) => void;
    };

    actions.onOpenSnippetNote("idea-1");

    expect(snippetLocationsOpenMock).toHaveBeenCalledTimes(1);
    expect(snippetLocationsInstances[0]?.locations).toEqual([
      {
        notePath: "Folder/Missing.md",
        noteTitle: "Missing",
        occurrenceCount: 1,
        stale: true
      }
    ]);
    expect(getLeaf).not.toHaveBeenCalled();
  });

  it("opens snippet locations modal and wires selection back to file opening", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: true,
          snippetLocations: [
            {
              notePath: "Folder/Note A.md",
              noteTitle: "Note A",
              occurrenceCount: 2,
              stale: false
            },
            {
              notePath: "Folder/Note B.md",
              noteTitle: "Note B",
              occurrenceCount: 1,
              stale: false
            }
          ],
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const markerScrollIntoView = vi.fn();
    const querySelector = vi.fn(() => ({
      scrollIntoView: markerScrollIntoView
    }));
    const openFile = vi.fn(async () => undefined);
    const leaf = {
      openFile,
      view: {
        containerEl: {
          querySelector
        }
      }
    };
    const getLeaf = vi.fn(() => leaf);
    const abstractFile = new TFile();
    const getAbstractFileByPath = vi.fn(() => abstractFile);

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath
        },
        workspace: {
          getLeaf
        }
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenSnippetLocations: (ideaId: string) => void;
    };

    actions.onOpenSnippetLocations("idea-1");
    expect(snippetLocationsOpenMock).toHaveBeenCalledTimes(1);

    await snippetLocationsInstances[0]?.onOpenLocation({
      notePath: "Folder/Note B.md",
      noteTitle: "Note B",
      occurrenceCount: 1,
      stale: false
    });
    await Promise.resolve();

    expect(getAbstractFileByPath).toHaveBeenCalledWith("Folder/Note B.md");
    expect(getLeaf).toHaveBeenCalledWith(true);
    expect(openFile).toHaveBeenCalledWith(abstractFile);
    expect(querySelector).toHaveBeenCalledWith('[data-glitteridea-id="idea-1"], [data-glitter-idea-id="idea-1"]');
    expect(markerScrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("shows toast and keeps selection when move-to-pool fails", async () => {
    const buildState = (selected: boolean) => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 2,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "2 ideas · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: selected ? 1 : 0,
        hasSelection: selected
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 2, selected: true }]
    });

    const loadPoolState = vi.fn(async (input?: { selectedIdeaIds?: string[] }) =>
      buildState(Boolean(input?.selectedIdeaIds?.length))
    );

    const moveIdeasToPool = vi.fn(async () => {
      throw new Error("move failed");
    });

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool,
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onItemSelect: (itemId: string) => void;
      onMoveSelectionToPool: (poolId: string) => void;
    };

    actions.onItemSelect("idea-1");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onMoveSelectionToPool: (poolId: string) => void;
      onItemSelect: (itemId: string) => void;
    };
    actions.onMoveSelectionToPool("pool-other");
    await Promise.resolve();
    await Promise.resolve();

    expect(moveIdeasToPool).toHaveBeenCalledWith(["idea-1"], "pool-other");
    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" })
    );

    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        controls: expect.objectContaining({ selectedCount: 1, hasSelection: true }),
        cards: [expect.objectContaining({ id: "idea-1", selected: true })]
      })
    );
  });

  it("opens the create-pool modal from batch move and moves the current selection after creation", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async (input?: { selectedIdeaIds?: string[] }) => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 2,
        visibleItemCount: 2,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "2 ideas · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: Boolean(input?.selectedIdeaIds?.includes("idea-1")),
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        },
        {
          id: "idea-2",
          title: "Idea 2",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: Boolean(input?.selectedIdeaIds?.includes("idea-2")),
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-13T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: input?.selectedIdeaIds?.length ?? 0,
        hasSelection: Boolean(input?.selectedIdeaIds?.length)
      },
      poolOptions: [
        { id: "pool-default", label: "默认池", count: 2, selected: true },
        { id: "pool-writing", label: "写作池", count: 5, selected: false }
      ]
    }));
    const moveIdeasToPool = vi.fn(async () => undefined);
    const deletePool = vi.fn(async () => true);

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool,
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onItemSelect: (itemId: string) => void;
      onMoveSelectionToPool: (poolId: string) => void;
    };

    actions.onItemSelect("idea-1");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onMoveSelectionToPool("create-new-pool");

    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ activeOverlay: undefined }));
    expect(moveIdeasToPool).not.toHaveBeenCalled();
    expect(deletePool).not.toHaveBeenCalled();
    expect(poolModalOpenMock).toHaveBeenCalledTimes(1);
    expect(poolModalInstances.at(-1)).toEqual(
      expect.objectContaining({
        step: "create",
        options: expect.objectContaining({ flowContext: "global" })
      })
    );

    poolModalInstances.at(-1)?.handlers.onPoolChosen?.("pool-new", "新建池");
    await flush();

    expect(moveIdeasToPool).toHaveBeenCalledWith(["idea-1"], "pool-new");
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        controls: expect.objectContaining({ selectedCount: 0, hasSelection: false })
      })
    );
  });

  it("rolls back the newly created pool when the follow-up batch move fails", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const loadPoolState = vi.fn(async (input?: { selectedIdeaIds?: string[] }) => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: Boolean(input?.selectedIdeaIds?.includes("idea-1")),
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: input?.selectedIdeaIds?.length ?? 0,
        hasSelection: Boolean(input?.selectedIdeaIds?.length)
      },
      poolOptions: [
        { id: "pool-default", label: "默认池", count: 1, selected: true },
        { id: "pool-writing", label: "写作池", count: 5, selected: false }
      ]
    }));
    const moveIdeasToPool = vi.fn(async () => {
      throw new Error("move failed");
    });
    const deletePool = vi.fn(async () => true);

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolService: {
        deletePool
      },
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool,
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onItemSelect: (itemId: string) => void;
      onMoveSelectionToPool: (poolId: string) => void;
    };

    actions.onItemSelect("idea-1");
    await Promise.resolve();

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as typeof actions;
    actions.onMoveSelectionToPool("create-new-pool");
    poolModalInstances.at(-1)?.handlers.onPoolChosen?.("pool-new", "新建池");
    await flush();

    expect(moveIdeasToPool).toHaveBeenCalledWith(["idea-1"], "pool-new");
    expect(deletePool).toHaveBeenCalledWith("pool-new");
    expect(toastShowMock).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        controls: expect.objectContaining({ selectedCount: 1, hasSelection: true })
      })
    );
  });

  it("shows toast and keeps previous pool when pool switch fails", async () => {
    const loadPoolState = vi
      .fn()
      .mockResolvedValue({
        pool: {
          id: "pool-default",
          title: "默认池",
          description: "desc",
          totalItemCount: 1,
          visibleItemCount: 1,
          tone: "bluegray" as const
        },
        header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
        cards: [
          {
            id: "idea-1",
            title: "Idea 1",
            excerpt: "excerpt",
            hasBodyContent: true,
            selected: false,
            contentType: "text" as const,
            sourceUrl: undefined,
            attachmentPaths: [],
            fileCreated: false,
            filePath: undefined,
            referenced: false,
            updatedAt: "2026-04-12T00:00:00.000Z"
          }
        ],
        controls: {
          query: "",
          status: "all" as const,
          contentFilter: "all" as const,
        sort: "updated-desc" as const,
          selectedCount: 0,
          hasSelection: false
        },
        poolOptions: [
          { id: "pool-default", label: "默认池", count: 1, selected: true },
          { id: "pool-other", label: "其他池", count: 1, selected: false }
        ]
      });

    const leafSetViewState = vi.fn(async () => {
      throw new Error("switch failed");
    });

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({ setViewState: leafSetViewState } as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onPoolSwitch: (poolId: string) => void;
    };

    actions.onPoolSwitch("pool-other");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(leafSetViewState).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "glitter-idea-pool-view",
        active: true,
        state: expect.objectContaining({ poolId: "pool-other", mode: "browse" })
      })
    );
    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" })
    );

    const lastState = renderPoolViewMock.mock.calls.at(-1)?.[1] as {
      pool?: { id?: string };
      poolOptions?: Array<{ id: string; selected: boolean }>;
    };
    expect(lastState.pool?.id).toBe("pool-default");
    expect(lastState.poolOptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "pool-default", selected: true })])
    );
  });

  it("shows toast when create-file action fails", async () => {
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const createIdeaFile = vi.fn(async () => {
      throw new Error("create file failed");
    });

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onCreateFile: (ideaId: string) => void;
    };

    actions.onCreateFile("idea-1");
    await Promise.resolve();
    await Promise.resolve();

    expect(createIdeaFile).toHaveBeenCalledWith("idea-1");
    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" })
    );
  });

  it("uses focused idea id from snippet jump-back on next render", async () => {
    const loadPoolState = vi.fn(
      async (input?: {
        query?: string;
        status?: "all" | "referenced" | "file-created" | "with-markers";
        selectedIdeaIds?: string[];
      }) => ({
        pool: {
          id: "pool-product",
          title: "产品池",
          description: "desc",
          totalItemCount: 1,
          visibleItemCount: 1,
          tone: "bluegray" as const
        },
        header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
        cards: [
          {
            id: "idea-2",
            title: "Idea 2",
            excerpt: "excerpt",
            hasBodyContent: true,
            selected: Boolean(input?.selectedIdeaIds?.includes("idea-2")),
            contentType: "text" as const,
            sourceUrl: undefined,
            attachmentPaths: [],
            fileCreated: false,
            filePath: undefined,
            referenced: true,
            updatedAt: "2026-04-12T00:00:00.000Z"
          }
        ],
        controls: {
          query: input?.query ?? "",
          status: input?.status ?? ("all" as const),
          contentFilter: "all" as const,
        sort: "updated-desc" as const,
          selectedCount: input?.selectedIdeaIds?.length ?? 0,
          hasSelection: Boolean(input?.selectedIdeaIds?.length)
        },
        poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }]
      })
    );

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: "idea-2",
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 2.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { query: string }).query = "stale query";
    (view as unknown as { status: "all" | "referenced" | "file-created" | "with-markers" }).status =
      "referenced";
    (view as unknown as { batchMode: boolean }).batchMode = true;
    (view as unknown as { selectedIdeaIds: Set<string> }).selectedIdeaIds = new Set(["idea-1", "idea-3"]);

    await view.onOpen();

    expect((view as unknown as { navigationMode: "browse" | "overview" }).navigationMode).toBe("browse");
    expect(loadPoolState).toHaveBeenCalledWith({
      poolId: undefined,
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: ["idea-2"]
    });
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        batchMode: false,
        controls: expect.objectContaining({ query: "", status: "all" })
      })
    );
    expect(plugin.focusedIdeaId).toBeNull();
  });

  it("ignores stale active pool when snippet jump-back targets a different pool", async () => {
    const loadPoolState = vi.fn(async (input?: { poolId?: string; selectedIdeaIds?: string[] }) => ({
      pool: {
        id: input?.poolId ?? "pool-default",
        title: input?.poolId === "pool-target" ? "目标池" : "默认池",
        description: "desc",
        totalItemCount: input?.poolId === "pool-target" ? 1 : 0,
        visibleItemCount: input?.poolId === "pool-target" ? 1 : 0,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards:
        input?.poolId === "pool-target"
          ? [
              {
                id: "idea-target",
                title: "Idea target",
                excerpt: "excerpt",
                hasBodyContent: true,
                selected: Boolean(input?.selectedIdeaIds?.includes("idea-target")),
                contentType: "text" as const,
                sourceUrl: undefined,
                attachmentPaths: [],
                fileCreated: false,
                filePath: undefined,
                referenced: true,
                updatedAt: "2026-04-12T00:00:00.000Z"
              }
            ]
          : [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: input?.selectedIdeaIds?.length ?? 0,
        hasSelection: Boolean(input?.selectedIdeaIds?.length)
      },
      poolOptions: [
        { id: "pool-default", label: "默认池", count: 0, selected: input?.poolId !== "pool-target" },
        { id: "pool-target", label: "目标池", count: 1, selected: input?.poolId === "pool-target" }
      ]
    }));

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: "idea-target",
      pendingFocusedPoolId: "pool-target",
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea target.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { activePoolId?: string }).activePoolId = "pool-stale";
    await view.setState({ poolId: "pool-target", mode: "browse" }, {} as any);
    await Promise.resolve();
    await Promise.resolve();

    expect(loadPoolState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        poolId: "pool-target",
        contentFilter: "all",
        selectedIdeaIds: ["idea-target"]
      })
    );
    expect(plugin.focusedIdeaId).toBeNull();
  });

  it("scrolls the focused search-hit card into view, keeps the accent border after pulse, and clears it after the next outside click", async () => {
    vi.useFakeTimers();

    try {
      const loadPoolState = vi.fn(async (input?: { poolId?: string; selectedIdeaIds?: string[] }) => ({
        pool: {
          id: input?.poolId ?? "pool-target",
          title: "目标池",
          description: "desc",
          totalItemCount: 1,
          visibleItemCount: 1,
          tone: "bluegray" as const
        },
        header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
        cards: [
          {
            id: "idea-target",
            title: "Idea target",
            excerpt: "excerpt",
            hasBodyContent: true,
            selected: Boolean(input?.selectedIdeaIds?.includes("idea-target")),
            contentType: "text" as const,
            sourceUrl: undefined,
            attachmentPaths: [],
            fileCreated: false,
            filePath: undefined,
            referenced: true,
            updatedAt: "2026-04-12T00:00:00.000Z"
          }
        ],
        controls: {
          query: "",
          status: "all" as const,
          contentFilter: "all" as const,
          sort: "updated-desc" as const,
          selectedCount: input?.selectedIdeaIds?.length ?? 0,
          hasSelection: Boolean(input?.selectedIdeaIds?.length)
        },
        poolOptions: [{ id: "pool-target", label: "目标池", count: 1, selected: true }]
      }));

      const targetCardScrollIntoView = vi.fn();
      const targetCardClassListRemove = vi.fn();
      let cardGridLookupCount = 0;
      const documentEl = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      const cardGrid = {
        scrollTop: 168,
        scrollLeft: 12
      };
      const contentEl = {
        ownerDocument: documentEl,
        empty: vi.fn(),
        querySelector: (selector: string) => {
          if (selector === ".glitter-pool-stage__card-grid") {
            cardGridLookupCount += 1;
            if (cardGridLookupCount === 1) {
              return cardGrid;
            }
            return pulseEndedCardGrid;
          }
          if (selector === '.glitter-pool-stage__card-surface[data-item-id="idea-target"]') {
            return {
              dataset: { itemId: "idea-target" },
              scrollIntoView: targetCardScrollIntoView,
              classList: {
                remove: targetCardClassListRemove
              }
            };
          }
          return null;
        }
      };

      const plugin = {
        settings: {
          enableDesignReviewMode: false,
          reviewScenario: "pool-browse"
        },
        focusedIdeaId: "idea-target",
        pendingFocusedPoolId: "pool-target",
        activateMainView: vi.fn(async () => undefined),
        poolWorkbenchWorkflow: {
          loadPoolState,
          setActivePoolId: vi.fn(async () => undefined),
          moveIdeasToPool: vi.fn(async () => undefined),
          createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea target.md" }))
        }
      };

      buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

      const view = new GlitterPoolView({} as any, plugin as any);
      (view as unknown as { contentEl: HTMLElement }).contentEl = contentEl as unknown as HTMLElement;

      await view.onOpen();
      await Promise.resolve();
      await Promise.resolve();

      expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cards: expect.arrayContaining([
            expect.objectContaining({
              id: "idea-target",
              selected: true,
              searchHit: true
            })
          ])
        })
      );
      expect(targetCardScrollIntoView).toHaveBeenCalledWith({
        block: "center",
        behavior: "smooth"
      });
      expect(plugin.focusedIdeaId).toBeNull();
      expect(plugin.pendingFocusedPoolId).toBeNull();

      const pulseEndedCardGrid = {
        scrollTop: 0,
        scrollLeft: 0
      };
      const cardGridLookupCountBeforePulseEnd = cardGridLookupCount;

      vi.advanceTimersByTime(1600);
      await Promise.resolve();
      await Promise.resolve();

      expect(cardGridLookupCount).toBe(cardGridLookupCountBeforePulseEnd + 2);
      expect(pulseEndedCardGrid.scrollTop).toBe(168);
      expect(pulseEndedCardGrid.scrollLeft).toBe(12);

      let lastBuilderInput = buildPoolViewStateFromRuntimeMock.mock.calls.at(-1)?.[0] as {
        cards: Array<{ id: string; selected: boolean; searchHit?: boolean; searchHitPulse?: boolean }>;
        controls: { selectedCount: number; hasSelection: boolean };
      };
      expect(lastBuilderInput.cards.find((card) => card.id === "idea-target")).toEqual(
        expect.objectContaining({
          id: "idea-target",
          selected: false,
          searchHit: true,
          searchHitPulse: false
        })
      );
      expect(lastBuilderInput.controls).toMatchObject({
        selectedCount: 0,
        hasSelection: false
      });

      const pointerdownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
        ([eventName]) => eventName === "pointerdown"
      )?.[1] as ((event: Event) => void) | undefined;
      expect(pointerdownHandler).toBeTypeOf("function");

      pointerdownHandler?.({
        target: {
          nodeType: 1,
          parentNode: null,
          matches: (selector: string) => selector === ".glitter-pool-stage__card-menu-shell"
        } as unknown as EventTarget
      } as Event);

      expect(targetCardClassListRemove).toHaveBeenCalledWith(
        "glitter-pool-stage__card-surface--search-hit",
        "is-pulsing"
      );
      expect((view as unknown as { activeSearchHitIdeaId: string | null }).activeSearchHitIdeaId).toBeNull();
      expect((view as unknown as { activeSearchHitPulse: boolean }).activeSearchHitPulse).toBe(false);
      expect((view as unknown as { selectedIdeaIds: Set<string> }).selectedIdeaIds.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores legacy overview mode state and keeps rendering browse runtime", async () => {
    const loadPoolState = vi.fn(async (input?: {
      poolId?: string;
      query?: string;
      status?: "all" | "referenced" | "file-created" | "with-markers";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => ({
      pool: {
        id: input?.poolId ?? "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: Boolean(input?.selectedIdeaIds?.includes("idea-1")),
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: input?.status ?? ("all" as const),
        sort: (input?.sort ?? "updated-desc") as "updated-desc" | "created-desc" | "title-asc",
        selectedCount: input?.selectedIdeaIds?.length ?? 0,
        hasSelection: Boolean(input?.selectedIdeaIds?.length)
      },
      poolOptions: [{ id: input?.poolId ?? "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = {
      ownerDocument: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      },
      empty: vi.fn()
    } as unknown as HTMLElement;

    await view.onOpen();
    await view.setState({ mode: "browse", resetFilters: true } as any, {} as any);
    await Promise.resolve();

    expect(renderPoolViewMock.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ mode: "browse" }));
    expect((view as unknown as { navigationMode: "browse" }).navigationMode).toBe("browse");
  });


  it("uses the incoming leaf view state poolId on first open before any fallback pool render", async () => {
    const loadPoolState = vi.fn(async (input?: {
      poolId?: string;
      query?: string;
      status?: "all" | "referenced" | "file-created" | "with-markers";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => ({
      pool: {
        id: input?.poolId ?? "pool-default",
        title: input?.poolId === "pool-product" ? "产品池" : "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [],
      controls: {
        query: input?.query ?? "",
        status: input?.status ?? ("all" as const),
        contentFilter: "all" as const,
        sort: (input?.sort ?? "updated-desc") as "updated-desc" | "created-desc" | "title-asc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        { id: "pool-default", label: "默认池", count: 1, selected: input?.poolId !== "pool-product" },
        { id: "pool-product", label: "产品池", count: 1, selected: input?.poolId === "pool-product" }
      ]
    }));

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: vi.fn(() => ({
          type: "glitter-idea-pool-view",
          state: {
            poolId: "pool-product",
            resetFilters: true
          }
        }))
      } as any,
      plugin as any
    );

    await view.onOpen();

    expect(loadPoolState).toHaveBeenCalledTimes(1);
    expect(loadPoolState).toHaveBeenCalledWith({
      poolId: "pool-product",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });
    expect(renderPoolViewMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ pool: expect.objectContaining({ id: "pool-product", title: "产品池" }) })
    );
  });

  it("setState applies poolId, resets filters/selection, and preserves sort", async () => {
    const loadPoolState = vi.fn(async (input?: {
      poolId?: string;
      query?: string;
      status?: "all" | "referenced" | "file-created" | "with-markers";
      sort?: "updated-desc" | "created-desc" | "title-asc";
      selectedIdeaIds?: string[];
    }) => ({
      pool: {
        id: input?.poolId ?? "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: Boolean(input?.selectedIdeaIds?.includes("idea-1")),
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: input?.query ?? "",
        status: input?.status ?? ("all" as const),
        sort: (input?.sort ?? "updated-desc") as "updated-desc" | "created-desc" | "title-asc",
        selectedCount: input?.selectedIdeaIds?.length ?? 0,
        hasSelection: Boolean(input?.selectedIdeaIds?.length)
      },
      poolOptions: [{ id: input?.poolId ?? "pool-default", label: "默认池", count: 1, selected: true }]
    }));

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "pool-browse"
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({} as any, plugin as any);
    (view as unknown as { query: string }).query = "stale";
    (view as unknown as {
      status: "all" | "referenced" | "file-created" | "with-markers";
    }).status = "referenced";
    (view as unknown as { sort: "updated-desc" | "created-desc" | "title-asc" }).sort = "created-desc";
    (view as unknown as { batchMode: boolean }).batchMode = true;
    (view as unknown as { selectedIdeaIds: Set<string> }).selectedIdeaIds = new Set(["idea-x"]);

    await view.onOpen();

    await view.setState(
      {
        poolId: "pool-product",
        resetFilters: true
      },
      {} as any
    );
    await Promise.resolve();

    expect(loadPoolState).toHaveBeenLastCalledWith({
      poolId: "pool-product",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "created-desc",
      selectedIdeaIds: []
    });
  });

  it("supports popup keyboard browse/confirm with open alignment and active-row reveal", async () => {
    const poolOptions = Array.from({ length: 8 }, (_entry, index) => ({
      id: `pool-${index}`,
      label: `池 ${index}`,
      count: index + 1,
      selected: index === 5
    }));

    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-5",
        title: "池 5",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions
    }));

    const leafSetViewState = vi.fn(async () => undefined);
    const documentEl = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const popupItemScrollMap = new Map<string, ReturnType<typeof vi.fn>>();
    const popupIndexScrollMap = new Map<number, ReturnType<typeof vi.fn>>();
    const popupItems = poolOptions.map((pool, index) => {
      const scrollIntoView = vi.fn();
      popupItemScrollMap.set(pool.id, scrollIntoView);
      popupIndexScrollMap.set(index, scrollIntoView);
      return {
        dataset: {
          poolId: pool.id,
          poolIndex: String(index)
        },
        scrollIntoView
      };
    });

    const contentEl = {
      ownerDocument: documentEl,
      empty: vi.fn(),
      querySelector: (selector: string) => {
        const poolIdMatch = selector.match(/data-pool-id="([^"]+)"/);
        if (poolIdMatch) {
          return popupItems.find((item) => item.dataset.poolId === poolIdMatch[1]);
        }
        const poolIndexMatch = selector.match(/data-pool-index="([^"]+)"/);
        if (poolIndexMatch) {
          return popupItems.find((item) => item.dataset.poolIndex === poolIndexMatch[1]);
        }
        return null;
      }
    };

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView({ setViewState: leafSetViewState } as any, plugin as any);
    (view as unknown as { contentEl: HTMLElement }).contentEl = contentEl as unknown as HTMLElement;

    await view.onOpen();

    let actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
    };
    actions.onBrowseOverlayToggle("pool-switcher");
    await Promise.resolve();

    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeOverlay: "pool-switcher",
        poolSwitcherActivePoolId: "pool-5"
      })
    );
    expect(popupIndexScrollMap.get(2)).toHaveBeenCalledTimes(1);

    const keydownHandler = (documentEl.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "keydown"
    )?.[1] as
      | ((event: {
          key: string;
          preventDefault?: () => void;
          stopPropagation?: () => void;
        }) => void)
      | undefined;

    const loadCallCountBeforeArrowDown = loadPoolState.mock.calls.length;
    const arrowDownPreventDefault = vi.fn();
    keydownHandler?.({
      key: "ArrowDown",
      preventDefault: arrowDownPreventDefault,
      stopPropagation: vi.fn()
    });
    await Promise.resolve();

    expect(arrowDownPreventDefault).toHaveBeenCalled();
    expect(leafSetViewState).not.toHaveBeenCalled();
    expect(loadPoolState.mock.calls.length).toBe(loadCallCountBeforeArrowDown);
    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeOverlay: "pool-switcher",
        poolSwitcherActivePoolId: "pool-6"
      })
    );
    expect(popupItemScrollMap.get("pool-6")).toHaveBeenCalledWith({ block: "nearest" });

    const enterPreventDefault = vi.fn();
    keydownHandler?.({
      key: "Enter",
      preventDefault: enterPreventDefault,
      stopPropagation: vi.fn()
    });
    await Promise.resolve();

    expect(enterPreventDefault).toHaveBeenCalled();
    expect(leafSetViewState).toHaveBeenCalledWith({
      type: "glitter-idea-pool-view",
      active: true,
      state: {
        poolId: "pool-6",
        mode: "browse",
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        batchMode: false
      }
    });

    actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onBrowseOverlayToggle: (overlay: "pool-switcher" | "status" | "filter" | "sort" | "batch") => void;
    };
    actions.onBrowseOverlayToggle("pool-switcher");
    await Promise.resolve();

    expect(buildPoolViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeOverlay: "pool-switcher",
        poolSwitcherActivePoolId: "pool-5"
      })
    );

    keydownHandler?.({
      key: "Enter",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    });
    await Promise.resolve();

    expect(leafSetViewState).toHaveBeenCalledTimes(1);
    expect(view.getState()).toEqual(
      expect.objectContaining({
        contentFilter: "all",
        query: ""
      })
    );
  });

  it("opens roam history, keeps the history modal usable after a historical board fails, and preserves the live roam session", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [
        {
          id: "idea-1",
          title: "Idea 1",
          body: "Idea 1 body",
          excerpt: "excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text" as const,
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));
    const boards = [
      {
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [{ id: "pool-default", name: "默认池", color: "#6ab5ff" }],
        thumbnailBoxes: []
      },
      {
        path: "Glitter/灵感漫游/broken.canvas",
        name: "broken",
        updatedAt: 1716700000000,
        relatedPools: [],
        thumbnailBoxes: []
      }
    ];
    const listPoolRoamBoards = vi.fn(async () => boards);

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        listPoolRoamBoards,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
          }
        })
      } as any,
      plugin as any
    );
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenPoolRoamHistory?: () => void;
    };

    actions.onOpenPoolRoamHistory?.();
    await flush();

    expect(listPoolRoamBoards).toHaveBeenCalledTimes(1);
    expect(poolRoamHistoryOpenMock).toHaveBeenCalledTimes(1);
    expect(poolRoamHistoryInstances[0]?.boards).toEqual(boards);

    poolRoamHistoryInstances[0]?.handlers.onSelectBoard?.(boards[1]!, 1);
    expect(poolRoamBoardOpenMock).toHaveBeenCalledTimes(1);
    expect(poolRoamBoardInstances[0]?.boards).toEqual(boards);
    expect(poolRoamBoardInstances[0]?.activeBoardIndex).toBe(1);

    poolRoamBoardInstances[0]?.failToOpen(new Error("broken board"));

    expect(poolRoamBoardCloseMock).toHaveBeenCalledTimes(1);
    expect(poolRoamHistoryCloseMock).not.toHaveBeenCalled();
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Open roam board failed. Please try again."
    });
    expect(view.getState()).toMatchObject({
      poolRoamOpen: true,
      poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
    });

    poolRoamHistoryInstances[0]?.handlers.onSelectBoard?.(boards[0]!, 0);
    expect(poolRoamBoardOpenMock).toHaveBeenCalledTimes(2);
    expect(poolRoamBoardInstances[1]?.boards).toEqual(boards);
    expect(poolRoamBoardInstances[1]?.activeBoardIndex).toBe(0);
  });

  it("deletes roam history boards through the modal and clears the live board when the active file is removed", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));
    const initialBoards = [
      {
        path: "Glitter/灵感漫游/current.canvas",
        name: "current",
        updatedAt: 2,
        relatedPools: [{ id: "pool-default", name: "默认池", color: "#6ab5ff" }],
        thumbnailBoxes: []
      },
      {
        path: "Glitter/灵感漫游/archive.canvas",
        name: "archive",
        updatedAt: 1,
        relatedPools: [],
        thumbnailBoxes: []
      }
    ];
    const deletePoolRoamBoards = vi.fn(async () => 1);
    const listPoolRoamBoards = vi.fn(async () => {
      if (deletePoolRoamBoards.mock.calls.length === 0) {
        return initialBoards;
      }

      return initialBoards.filter((board) => board.path !== "Glitter/灵感漫游/current.canvas");
    });

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        listPoolRoamBoards,
        deletePoolRoamBoards,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
          }
        })
      } as any,
      plugin as any
    );
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenPoolRoamHistory?: () => void;
    };

    actions.onOpenPoolRoamHistory?.();
    await flush();

    const remainingBoards = await poolRoamHistoryInstances[0]?.handlers.onDeleteBoards?.([
      "Glitter/灵感漫游/current.canvas"
    ]);
    await flush();

    expect(deletePoolRoamBoards).toHaveBeenCalledWith(["Glitter/灵感漫游/current.canvas"]);
    expect(listPoolRoamBoards).toHaveBeenCalledTimes(2);
    expect(remainingBoards).toEqual([
      {
        path: "Glitter/灵感漫游/archive.canvas",
        name: "archive",
        updatedAt: 1,
        relatedPools: [],
        thumbnailBoxes: []
      }
    ]);
    expect(view.getState()).toMatchObject({
      poolRoamOpen: true
    });
    expect(view.getState()).not.toHaveProperty("poolRoamBoardPath");

    poolRoamHistoryInstances[0]?.handlers.onSelectBoard?.(remainingBoards?.[0]!, 0);
    expect(poolRoamBoardOpenMock).toHaveBeenCalledTimes(1);
    expect(poolRoamBoardInstances[0]?.boards).toEqual(remainingBoards);
    expect(poolRoamBoardInstances[0]?.activeBoardIndex).toBe(0);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it("ignores stale roam history results after a newer history request succeeds", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));
    const firstBoards = [{
      path: "Glitter/灵感漫游/older.canvas",
      name: "older",
      updatedAt: 1,
      relatedPools: [],
      thumbnailBoxes: []
    }];
    const secondBoards = [{
      path: "Glitter/灵感漫游/current.canvas",
      name: "current",
      updatedAt: 2,
      relatedPools: [{ id: "pool-default", name: "默认池", color: "#6ab5ff" }],
      thumbnailBoxes: []
    }];
    let resolveFirstHistory: ((boards: typeof firstBoards) => void) | undefined;
    let resolveSecondHistory: ((boards: typeof secondBoards) => void) | undefined;
    const listPoolRoamBoards = vi.fn(() => {
      if (!resolveFirstHistory) {
        return new Promise<typeof firstBoards>((resolve) => {
          resolveFirstHistory = resolve;
        });
      }

      return new Promise<typeof secondBoards>((resolve) => {
        resolveSecondHistory = resolve;
      });
    });

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        listPoolRoamBoards,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/live.canvas"
          }
        })
      } as any,
      plugin as any
    );
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenPoolRoamHistory?: () => void;
    };

    actions.onOpenPoolRoamHistory?.();
    await flush();
    actions.onOpenPoolRoamHistory?.();
    await flush();

    resolveSecondHistory?.(secondBoards);
    await flush();

    expect(poolRoamHistoryOpenMock).toHaveBeenCalledTimes(1);
    expect(poolRoamHistoryInstances).toHaveLength(1);
    expect(poolRoamHistoryInstances[0]?.boards).toEqual(secondBoards);

    resolveFirstHistory?.(firstBoards);
    await flush();

    expect(poolRoamHistoryOpenMock).toHaveBeenCalledTimes(1);
    expect(poolRoamHistoryInstances).toHaveLength(1);
    expect(poolRoamHistoryInstances[0]?.boards).toEqual(secondBoards);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it("ignores late roam history failures after the view closes", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));
    let rejectHistory: ((error: Error) => void) | undefined;
    const listPoolRoamBoards = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectHistory = reject;
        })
    );

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        listPoolRoamBoards,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
          }
        })
      } as any,
      plugin as any
    );
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenPoolRoamHistory?: () => void;
    };

    actions.onOpenPoolRoamHistory?.();
    await flush();
    await view.onClose();
    rejectHistory?.(new Error("history unavailable"));
    await flush();

    expect(poolRoamHistoryOpenMock).not.toHaveBeenCalled();
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it("shows a toast when roam history loading fails and leaves the live roam session untouched", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));
    const listPoolRoamBoards = vi.fn(async () => {
      throw new Error("history unavailable");
    });

    const plugin = {
      app: {},
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        listPoolRoamBoards,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
          }
        })
      } as any,
      plugin as any
    );
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onOpenPoolRoamHistory?: () => void;
    };
    const renderCountBeforeAction = renderPoolViewMock.mock.calls.length;

    actions.onOpenPoolRoamHistory?.();
    await flush();

    expect(poolRoamHistoryOpenMock).not.toHaveBeenCalled();
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Load roam history failed. Please try again."
    });
    expect(view.getState()).toMatchObject({
      poolRoamOpen: true,
      poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
    });
    expect(renderPoolViewMock.mock.calls).toHaveLength(renderCountBeforeAction);
  });

  it("exports the current roam board as an image and isolates download failures to that action", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));
    const boardFile = Object.assign(new TFile(), {
      path: "Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas",
      basename: "Glitter灵感漫游 2026-05-27 10：00"
    });
    const read = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce(
        JSON.stringify({
          nodes: [
            {
              id: "node-1",
              type: "text",
              text: "# Idea 1\n\nBody copy",
              x: 24,
              y: 48,
              width: 280,
              height: 180,
              glitterSource: {
                ideaId: "idea-1",
                poolId: "pool-default",
                poolName: "默认池",
                poolColor: "#6ab5ff",
                ideaTitle: "Idea 1",
                syncMode: "readonly-follow-source",
                status: "active"
              }
            }
          ],
          edges: []
        })
      )
      .mockRejectedValueOnce(new Error("export failed"));
    const create = vi.fn(async () => undefined);
    const ensureFolder = vi.fn(async () => undefined);
    const createUniquePath = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Glitter/池导出/export.svg");

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => boardFile),
          read,
          create
        }
      },
      vaultFileStore: {
        ensureFolder,
        createUniquePath
      },
      settings: {
        interfaceLanguage: "zh-CN" as const
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas"
          }
        })
      } as any,
      plugin as any
    );
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onDownloadPoolRoamImage?: () => void;
    };

    actions.onDownloadPoolRoamImage?.();
    await flush();

    expect(ensureFolder).toHaveBeenCalledWith("Glitter/池导出");
    expect(createUniquePath).toHaveBeenCalledWith("Glitter/池导出", "Glitter灵感漫游 2026-05-27 10:00", ".svg");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      "Glitter/池导出/export.svg",
      expect.stringContaining("<svg")
    );
    const firstCreateCall = create.mock.calls[0] as unknown as [string, string] | undefined;
    if (!firstCreateCall || typeof firstCreateCall[1] !== "string") {
      throw new Error("Expected SVG export content");
    }
    const exportedSvg = firstCreateCall[1];
    expect(exportedSvg).toContain("Idea 1");
    expect(exportedSvg).toContain("默认池");
    expect(exportedSvg).toContain("✨");
    expect(exportedSvg).toContain("clipPath");
    expect(exportedSvg).toContain("glitter-roam-export-node-clip");
    expect(exportedSvg).toContain("Glitter灵感漫游 2026-05-27 10:00");
    expect(exportedSvg).toContain("Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas");
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "success",
      message: "漫游白板图片已导出到 Glitter/池导出/export.svg。"
    });
    expect(view.getState()).toMatchObject({
      poolRoamOpen: true,
      poolRoamBoardPath: "Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas"
    });

    actions.onDownloadPoolRoamImage?.();
    await flush();

    expect(toastShowMock).toHaveBeenLastCalledWith({
      status: "error",
      message: "下载漫游白板失败，请重试。"
    });
    expect(view.getState()).toMatchObject({
      poolRoamOpen: true,
      poolRoamBoardPath: "Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas"
    });
  });

  it("clips long roam board idea text in exported SVG cards", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));
    const sentinel = "This part should never be fully visible in the exported SVG because it exceeds the card boundary sentinel";
    const longText = `${"A long exported roam idea should wrap inside the card boundary. ".repeat(8)} ${sentinel}`;
    const boardFile = Object.assign(new TFile(), {
      path: "Glitter/灵感漫游/long.canvas",
      basename: "long"
    });
    const read = vi.fn(async () => JSON.stringify({
      nodes: [
        {
          id: "node-long",
          type: "text",
          text: longText,
          x: 24,
          y: 48,
          width: 220,
          height: 120
        }
      ],
      edges: []
    }));
    const create = vi.fn(async () => undefined);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => boardFile),
          read,
          create
        }
      },
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "Glitter/池导出/long.svg")
      },
      settings: { interfaceLanguage: "zh-CN" as const },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/long.canvas"
          }
        })
      } as any,
      plugin as any
    );
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onDownloadPoolRoamImage?: () => void;
    };
    actions.onDownloadPoolRoamImage?.();
    await flush();

    const createCall = create.mock.calls[0] as unknown as [string, string] | undefined;
    if (!createCall || typeof createCall[1] !== "string") {
      throw new Error("Expected SVG export content");
    }
    const exportedSvg = createCall[1];
    expect(exportedSvg).toContain("…");
    expect(exportedSvg).not.toContain(sentinel);
  });

  it("exports English empty roam board SVG preview text", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "Default Pool",
        description: "desc",
        totalItemCount: 0,
        visibleItemCount: 0,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "empty" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "Default Pool", count: 0, selected: true }]
    }));
    const boardFile = Object.assign(new TFile(), {
      path: "Glitter/灵感漫游/empty.canvas",
      basename: "empty"
    });
    const read = vi.fn(async () => JSON.stringify({ nodes: [], edges: [] }));
    const create = vi.fn(async () => undefined);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => boardFile),
          read,
          create
        }
      },
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "Glitter/池导出/empty.svg")
      },
      settings: { interfaceLanguage: "en" as const },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/empty.canvas"
          }
        })
      } as any,
      plugin as any
    );
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onDownloadPoolRoamImage?: () => void;
    };
    actions.onDownloadPoolRoamImage?.();
    await flush();

    const createCall = create.mock.calls[0] as unknown as [string, string] | undefined;
    if (!createCall || typeof createCall[1] !== "string") {
      throw new Error("Expected SVG export content");
    }
    const exportedSvg = createCall[1];
    expect(exportedSvg).toContain("No board nodes to export");
    expect(exportedSvg).toContain("This is an SVG preview exported from a Glitter roam board");
  });

  it("exports a composite source block as one logical SVG box", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));
    const boardFile = Object.assign(new TFile(), {
      path: "Glitter/灵感漫游/composite.canvas",
      basename: "composite"
    });
    const read = vi.fn(async () => JSON.stringify({
      nodes: [
        {
          id: "source-root",
          type: "group",
          x: 24,
          y: 48,
          width: 540,
          height: 360,
          glitterSource: {
            ideaId: "idea-1",
            poolId: "pool-default",
            poolName: "默认池",
            poolColor: "#6ab5ff",
            ideaTitle: "Idea 1",
            syncMode: "readonly-follow-source",
            status: "active"
          },
          glitterSourceBlock: {
            sourceBlockId: "source-block-1",
            role: "root"
          }
        },
        {
          id: "source-caption",
          type: "text",
          text: "> [!glitter-source] Idea 1\n> https://example.com/source\n>\n> Body copy",
          x: 24,
          y: 48,
          width: 540,
          height: 96,
          glitterSourceBlock: {
            sourceBlockId: "source-block-1",
            role: "caption"
          }
        },
        {
          id: "source-file-1",
          type: "file",
          file: "assets/cover.png",
          x: 24,
          y: 156,
          width: 264,
          height: 252,
          glitterSourceBlock: {
            sourceBlockId: "source-block-1",
            role: "image"
          }
        },
        {
          id: "source-file-2",
          type: "file",
          file: "assets/detail.png",
          x: 300,
          y: 156,
          width: 264,
          height: 252,
          glitterSourceBlock: {
            sourceBlockId: "source-block-1",
            role: "image"
          }
        }
      ],
      edges: []
    }));
    const create = vi.fn(async () => undefined);
    const ensureFolder = vi.fn(async () => undefined);
    const createUniquePath = vi.fn(async () => "Glitter/池导出/composite.svg");

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => boardFile),
          read,
          create
        }
      },
      vaultFileStore: {
        ensureFolder,
        createUniquePath
      },
      settings: { interfaceLanguage: "zh-CN" as const },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      activateMainView: vi.fn(async () => undefined),
      poolWorkbenchWorkflow: {
        loadPoolState,
        setActivePoolId: vi.fn(async () => undefined),
        moveIdeasToPool: vi.fn(async () => undefined),
        createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
      }
    };

    buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

    const view = new GlitterPoolView(
      {
        getViewState: () => ({
          state: {
            mode: "browse",
            poolRoamOpen: true,
            poolRoamBoardPath: "Glitter/灵感漫游/composite.canvas"
          }
        })
      } as any,
      plugin as any
    );
    await view.onOpen();

    const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
      onDownloadPoolRoamImage?: () => void;
    };

    actions.onDownloadPoolRoamImage?.();
    await flush();

    const createCall = create.mock.calls[0] as unknown as [string, string] | undefined;
    if (!createCall || typeof createCall[1] !== "string") {
      throw new Error("Expected SVG export content");
    }
    const exportedSvg = createCall[1];
    expect(exportedSvg).toContain("data-node-id=\"source-root\"");
    expect(exportedSvg).not.toContain("data-node-id=\"source-caption\"");
    expect(exportedSvg).not.toContain("data-node-id=\"source-file-1\"");
    expect(exportedSvg).not.toContain("data-node-id=\"source-file-2\"");
    expect(exportedSvg).not.toContain("Node 2");
    expect(exportedSvg).not.toContain("Node 3");
    expect(exportedSvg).toContain("Idea 1");
    expect(exportedSvg).toContain("默认池");
  });

  it("opens the roam share menu with open and copy actions and keeps the session after copy failure", async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const loadPoolState = vi.fn(async () => ({
      pool: {
        id: "pool-default",
        title: "默认池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        color: "#6ab5ff",
        tone: "bluegray" as const
      },
      header: { eyebrow: "Idea Pool", hint: "1 idea · runtime" },
      cards: [],
      controls: {
        query: "",
        status: "all" as const,
        contentFilter: "all" as const,
        sort: "updated-desc" as const,
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-default", label: "默认池", count: 1, selected: true }]
    }));
    const boardFile = Object.assign(new TFile(), {
      path: "Glitter/灵感漫游/current.canvas",
      basename: "current"
    });
    const openFile = vi.fn(async () => undefined);
    const getLeaf = vi.fn(() => ({
      openFile
    }));
    const writeText = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("clipboard unavailable"))
      .mockResolvedValueOnce(undefined);
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: {
          writeText
        }
      },
      configurable: true
    });

    try {
      const plugin = {
        app: {
          vault: {
            getAbstractFileByPath: vi.fn(() => boardFile)
          },
          workspace: {
            getLeaf
          }
        },
        focusedIdeaId: null,
        pendingFocusedPoolId: null,
        activateMainView: vi.fn(async () => undefined),
        poolWorkbenchWorkflow: {
          loadPoolState,
          setActivePoolId: vi.fn(async () => undefined),
          moveIdeasToPool: vi.fn(async () => undefined),
          createIdeaFile: vi.fn(async () => ({ filePath: "Glitter/Idea 1.md" }))
        }
      };

      buildPoolViewStateFromRuntimeMock.mockImplementation((runtime) => ({ mode: "browse", ...runtime }));

      const view = new GlitterPoolView(
        {
          getViewState: () => ({
            state: {
              mode: "browse",
              poolRoamOpen: true,
              poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
            }
          })
        } as any,
        plugin as any
      );
      await view.onOpen();

      const actions = renderPoolViewMock.mock.calls.at(-1)?.[2] as {
        onSharePoolRoamBoard?: (anchorEl: HTMLElement) => void;
      };
      const anchorEl = {
        getBoundingClientRect: () => ({ right: 240, bottom: 168 })
      } as HTMLElement;

      actions.onSharePoolRoamBoard?.(anchorEl);

      expect(menuShowAtPositionMock).toHaveBeenCalledWith({ x: 240, y: 168 });
      expect(menuItems.map((item) => item.title)).toEqual(["打开白板文件", "复制白板路径"]);

      menuItems[0]?.onClick?.();
      await flush();

      expect(openFile).toHaveBeenCalledWith(boardFile);

      menuItems[1]?.onClick?.();
      await flush();

      expect(writeText).toHaveBeenCalledWith("Glitter/灵感漫游/current.canvas");
      expect(toastShowMock).toHaveBeenLastCalledWith({
        status: "error",
        message: "复制白板路径失败，请重试。"
      });
      expect(view.getState()).toMatchObject({
        poolRoamOpen: true,
        poolRoamBoardPath: "Glitter/灵感漫游/current.canvas"
      });

      actions.onSharePoolRoamBoard?.(anchorEl);
      menuItems[1]?.onClick?.();
      await flush();

      expect(writeText).toHaveBeenCalledTimes(2);
      expect(toastShowMock).toHaveBeenLastCalledWith({
        status: "success",
        message: "已复制白板路径。"
      });
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true
      });
    }
  });
});
