/**
 * 保护主视图宿主的打开、主题同步与回调编排相关行为，避免后续重构时出现静默回退。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATE_NEW_POOL_ID,
  DEFAULT_POOL_ID,
  DEFAULT_POOL_LABEL,
  NEW_POOL_CREATED_ID
} from "../../src/plugin/constants";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

// 预先收口可重置的依赖替身，方便验证对外协作。
const {
  buildHomeViewStateFromRuntimeMock,
  renderHomeViewMock,
  buildThemeStateMock,
  applyThemeSnapshotMock,
  activatePoolViewMock,
  getHomeRuntimeStateMock,
  commitDraftToExistingPoolMock,
  commitDraftToNewPoolMock,
  quickCaptureOpenMock,
  poolOpenMock,
  followupGuidanceOpenMock,
  toastShowMock,
  savePluginSettingsMock,
  quickCaptureInstances,
  poolModalInstances,
  followupGuidanceInstances
} = vi.hoisted(() => ({
  buildHomeViewStateFromRuntimeMock: vi.fn(),
  renderHomeViewMock: vi.fn(),
  buildThemeStateMock: vi.fn(),
  applyThemeSnapshotMock: vi.fn(),
  activatePoolViewMock: vi.fn(async () => undefined),
  getHomeRuntimeStateMock: vi.fn(async () => ({
    mode: "empty",
    pools: [] as Array<{ id: string; name: string; ideaCount: number; isDefault: boolean }>
  })),
  commitDraftToExistingPoolMock: vi.fn(async () => undefined),
  commitDraftToNewPoolMock: vi.fn(async () => ({ pool: { id: "pool-created" } })),
  quickCaptureOpenMock: vi.fn(),
  poolOpenMock: vi.fn(),
  followupGuidanceOpenMock: vi.fn(),
  toastShowMock: vi.fn(),
  savePluginSettingsMock: vi.fn(async () => undefined),
  quickCaptureInstances: [] as Array<{
    step: "capture" | "saved-feedback";
    handlers: {
      onSaved: (selection?: {
        poolId?: string;
        poolLabel?: string;
        createFileChecked?: boolean;
      }) => void;
      onChoosePool: () => void;
      onBackHome: () => void;
      onPoolPickerOpen: (step?: "choose" | "create") => void;
    };
    options?: {
      flowContext?: "first-use" | "global";
      initialCreateFileChecked?: boolean;
      initialSelectedPoolId?: string;
      initialSelectedPoolLabel?: string;
    };
  }>,
  poolModalInstances: [] as Array<{
    step: "choose" | "create";
    handlers: {
      onPoolChosen: (poolId: string, poolName?: string, commitResult?: unknown) => void;
      onBackToChoose?: () => void;
      onBackToPrevious?: () => void;
    };
    options?: {
      flowContext?: "first-use" | "global";
      origin?: "home-secondary-action" | "quick-capture-pool-picker" | "saved-feedback" | "capture";
    };
  }>,
  followupGuidanceInstances: [] as Array<Record<string, never>>
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/ui/home/home-state", () => ({
  buildHomeViewStateFromRuntime: buildHomeViewStateFromRuntimeMock,
  HOME_FIELD_VIEW_OPTIONS: ["water", "spring-rain"]
}));

vi.mock("../../src/ui/home/render-home", () => ({
  renderHomeView: renderHomeViewMock
}));

vi.mock("obsidian", async (importOriginal) => await importOriginal<typeof import("obsidian")>());

vi.mock("../../src/ui/shared/theme-state", () => ({
  buildThemeState: buildThemeStateMock,
  applyThemeSnapshot: applyThemeSnapshotMock
}));

vi.mock("../../src/views/quick-capture-modal", () => ({
  QuickCaptureModal: vi.fn().mockImplementation((_plugin, step, handlers, options) => {
    quickCaptureInstances.push({ step, handlers, options });
    return {
      open: quickCaptureOpenMock
    };
  })
}));

vi.mock("../../src/views/pool-modal", () => ({
  PoolModal: vi.fn().mockImplementation((_plugin, step, handlers, options) => {
    poolModalInstances.push({ step, handlers, options });
    return {
      open: poolOpenMock
    };
  })
}));

vi.mock("../../src/views/followup-guidance-modal", () => ({
  FollowupGuidanceModal: vi.fn().mockImplementation(() => {
    followupGuidanceInstances.push({});
    return {
      open: followupGuidanceOpenMock
    };
  })
}));

vi.mock("../../src/feedback/toast-service", () => ({
  createToastService: () => ({
    show: toastShowMock
  })
}));

import { GlitterMainView } from "../../src/views/main-view";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
function installMutationObserverStub() {
  const observeMock = vi.fn();
  const disconnectMock = vi.fn();
  const OriginalMutationObserver = globalThis.MutationObserver;

  (globalThis as { MutationObserver: typeof MutationObserver }).MutationObserver = class {
    constructor(_callback: MutationCallback) {}

    observe = observeMock;

    disconnect = disconnectMock;
  } as unknown as typeof MutationObserver;

  return {
    observeMock,
    disconnectMock,
    restore() {
      (globalThis as { MutationObserver: typeof MutationObserver }).MutationObserver =
        OriginalMutationObserver;
    }
  };
}

// 覆盖视图宿主在生命周期、渲染与回调桥接上的核心契约。
describe("GlitterMainView", () => {
  beforeEach(() => {
    buildHomeViewStateFromRuntimeMock.mockReset();
    renderHomeViewMock.mockReset();
    buildThemeStateMock.mockReset();
    applyThemeSnapshotMock.mockReset();
    activatePoolViewMock.mockReset();
    getHomeRuntimeStateMock.mockReset();
    commitDraftToExistingPoolMock.mockReset();
    commitDraftToNewPoolMock.mockReset();
    quickCaptureOpenMock.mockReset();
    poolOpenMock.mockReset();
    followupGuidanceOpenMock.mockReset();
    toastShowMock.mockReset();
    savePluginSettingsMock.mockReset();
    quickCaptureInstances.length = 0;
    poolModalInstances.length = 0;
    followupGuidanceInstances.length = 0;
    buildThemeStateMock.mockReturnValue({ runtime: {} });
    getHomeRuntimeStateMock.mockResolvedValue({ mode: "empty", pools: [] });
    buildHomeViewStateFromRuntimeMock.mockImplementation((runtime: { mode: string }) => ({ mode: runtime.mode }));
  });

  it("returns the sparkle icon for the main view tab", () => {
    const view = new GlitterMainView({} as any, {} as any);

    expect(view.getIcon()).toBe("glitter-idea-plugin-sparkles");
  });

  it("marks the main view host as a non-scrolling full-height shell on open and removes it on close", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    const addClass = vi.fn();
    const removeClass = vi.fn();
    const empty = vi.fn();
    const view = new GlitterMainView({} as any, plugin as any);
    (view as any).contentEl = {
      addClass,
      removeClass,
      empty,
      ownerDocument: { body: { classList: { contains: vi.fn() } } }
    };
    renderHomeViewMock.mockReturnValue({ ownerDocument: (view as any).contentEl.ownerDocument });

    const themeObserver = installMutationObserverStub();

    try {
      await view.onOpen();
      expect(addClass).toHaveBeenCalledWith("glitter-idea-main-view-host");

      await view.onClose();
      expect(removeClass).toHaveBeenCalledWith("glitter-idea-main-view-host");
      expect(empty).toHaveBeenCalled();
    } finally {
      themeObserver.restore();
    }
  });

  it("applies runtime theme on open and still uses runtime home state when review mode is enabled", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: true,
        reviewScenario: "settings-conflict",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({ mode: "populated", pools: [] });
    const state = { mode: "populated" };
    buildHomeViewStateFromRuntimeMock.mockReturnValue(state);

    const lightRuntime = {
      mode: "obsidian-light",
      baseBackground: "#f7f9fc",
      secondaryBackground: "#eef3fb",
      accent: "#7397ff",
      accentHover: "#8ea9e3",
      textNormal: "#24324a",
      textMuted: "#61708a"
    };
    const darkRuntime = {
      mode: "obsidian-dark",
      baseBackground: "#111729",
      secondaryBackground: "#162034",
      accent: "#7397ff",
      accentHover: "#8ea9e3",
      textNormal: "#dce5ff",
      textMuted: "#aeb7d0"
    };

    buildThemeStateMock
      .mockReturnValueOnce({ runtime: lightRuntime })
      .mockReturnValueOnce({ runtime: darkRuntime });

    let observerCallback: MutationCallback | undefined;
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    const OriginalMutationObserver = globalThis.MutationObserver;

    (globalThis as { MutationObserver: typeof MutationObserver }).MutationObserver = class {
      constructor(callback: MutationCallback) {
        observerCallback = callback;
      }

      observe = observeMock;

      disconnect = disconnectMock;
    } as unknown as typeof MutationObserver;

    try {
      const view = new GlitterMainView({} as any, plugin as any);
      const body = { classList: { contains: vi.fn() } };
      const contentEl = {
        ownerDocument: { body },
        empty: vi.fn()
      };
      (view as any).contentEl = contentEl;
      const stage = { ownerDocument: contentEl.ownerDocument };
      renderHomeViewMock.mockReturnValue(stage);

      await view.onOpen();

      expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(1);
      expect(buildHomeViewStateFromRuntimeMock).toHaveBeenCalledWith(
        { mode: "populated", pools: [] },
        {
          poolColors: DEFAULT_SETTINGS.poolColors,
          homeFieldView: DEFAULT_SETTINGS.homeFieldView,
          searchFeedbackMessage: undefined
        }
      );
      expect(renderHomeViewMock).toHaveBeenCalledWith(
        view.contentEl,
        state,
        expect.objectContaining({
          onPrimaryAction: expect.any(Function),
          onSecondaryAction: expect.any(Function),
          onPoolSelect: expect.any(Function),
          onSearchSubmit: expect.any(Function)
        })
      );

      expect(applyThemeSnapshotMock).toHaveBeenCalledTimes(1);
      expect(applyThemeSnapshotMock).toHaveBeenNthCalledWith(1, stage, lightRuntime);
      expect(observeMock).toHaveBeenCalledWith(view.contentEl.ownerDocument.body, {
        attributes: true,
        attributeFilter: ["class"]
      });

      observerCallback?.([], {} as MutationObserver);

      expect(applyThemeSnapshotMock).toHaveBeenCalledTimes(2);
      expect(applyThemeSnapshotMock).toHaveBeenNthCalledWith(2, stage, darkRuntime);
    } finally {
      (globalThis as { MutationObserver: typeof MutationObserver }).MutationObserver =
        OriginalMutationObserver;
    }
  });

  it("opens the plugin settings tab from the home settings action", async () => {
    const openSettings = vi.fn();
    const openTabById = vi.fn();
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      app: {
        setting: {
          open: openSettings,
          openTabById
        }
      },
      manifest: {
        id: "GlitterIdea"
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: []
    });
    buildHomeViewStateFromRuntimeMock.mockImplementation((runtime: { mode: string }) => ({ mode: runtime.mode }));

    let actions!: {
      onOpenSettings: () => void;
    } & Record<string, unknown>;
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onOpenSettings();

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(openTabById).toHaveBeenCalledTimes(1);
    expect(openTabById).toHaveBeenCalledWith("GlitterIdea");
  });

  it("passes persisted home field view into the home state builder and routes pool title selection like pool select", async () => {
    const populatedRuntime = {
      mode: "populated" as const,
      pools: [{ id: "pool-a", name: "默认池", ideaCount: 2, isDefault: true }]
    };
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: "spring-rain" as const
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue(populatedRuntime);
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPoolSelect: (poolId: string) => void;
      onPoolTitleSelect?: (poolId: string) => void;
    } & Record<string, unknown>;
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    expect(buildHomeViewStateFromRuntimeMock).toHaveBeenCalledWith(populatedRuntime, {
      poolColors: DEFAULT_SETTINGS.poolColors,
      homeFieldView: "spring-rain",
      searchFeedbackMessage: undefined
    });

    actions.onPoolSelect("pool-a");
    actions.onPoolTitleSelect?.("pool-b");

    expect(activatePoolViewMock).toHaveBeenNthCalledWith(1, {
      poolId: "pool-a",
      resetFilters: true
    });
    expect(activatePoolViewMock).toHaveBeenNthCalledWith(2, {
      poolId: "pool-b",
      resetFilters: true
    });
  });

  it("saves a selected field view and rerenders the home stage", async () => {
    const populatedRuntime = {
      mode: "populated" as const,
      pools: [{ id: "pool-a", name: "默认池", ideaCount: 2, isDefault: true }]
    };
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      savePluginSettings: savePluginSettingsMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue(populatedRuntime);
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onFieldViewSelect?: (homeFieldView: "water" | "spring-rain") => void;
    } & Record<string, unknown>;
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onFieldViewSelect?.("spring-rain");
    await Promise.resolve();
    await Promise.resolve();

    expect(savePluginSettingsMock).toHaveBeenCalledTimes(1);
    expect(plugin.settings.homeFieldView).toBe("spring-rain");
    expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(2);
    expect(renderHomeViewMock).toHaveBeenCalledTimes(2);
    expect(buildHomeViewStateFromRuntimeMock).toHaveBeenNthCalledWith(2, populatedRuntime, {
      poolColors: DEFAULT_SETTINGS.poolColors,
      homeFieldView: "spring-rain",
      searchFeedbackMessage: undefined
    });
  });

  it("replays first-use capture over the current populated home state", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    const populatedRuntime = {
      mode: "populated" as const,
      pools: [{ id: "pool-a", name: "默认池", ideaCount: 3, isDefault: true }]
    };
    getHomeRuntimeStateMock.mockResolvedValue(populatedRuntime);
    buildHomeViewStateFromRuntimeMock.mockImplementation((runtime: { mode: string }) => ({ mode: runtime.mode }));
    renderHomeViewMock.mockImplementation(() => undefined);

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(0);

    view.replayFirstUseOnCurrentHome();
    await Promise.resolve();
    await Promise.resolve();

    expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(2);
    expect(buildHomeViewStateFromRuntimeMock).toHaveBeenNthCalledWith(2, populatedRuntime, {
      poolColors: DEFAULT_SETTINGS.poolColors,
      homeFieldView: DEFAULT_SETTINGS.homeFieldView,
      searchFeedbackMessage: undefined
    });
    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(1);
    expect(quickCaptureInstances[0]?.step).toBe("capture");
    expect(quickCaptureInstances[0]?.options?.flowContext).toBe("first-use");
  });

  it("orchestrates first-use flow from capture directly to choose/create pool, rerenders populated home, and opens follow-up guidance", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "empty",
      pools: []
    });
    buildHomeViewStateFromRuntimeMock.mockImplementation((runtime: { mode: string }) => ({ mode: runtime.mode }));

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    } & Record<string, unknown>;
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(1);
    expect(buildHomeViewStateFromRuntimeMock).toHaveBeenNthCalledWith(
      1,
      { mode: "empty", pools: [] },
      {
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView,
        searchFeedbackMessage: undefined
      }
    );

    actions.onPrimaryAction();
    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(1);
    expect(quickCaptureInstances[0]?.step).toBe("capture");
    expect(quickCaptureInstances[0]?.options?.flowContext).toBe("first-use");

    quickCaptureInstances[0]?.handlers.onSaved();
    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(1);
    expect(poolOpenMock).toHaveBeenCalledTimes(1);
    expect(poolModalInstances[0]?.step).toBe("choose");
    expect(poolModalInstances[0]?.options).toEqual(
      expect.objectContaining({
        flowContext: "first-use",
        origin: "capture"
      })
    );

    poolModalInstances[0]?.handlers.onPoolChosen(CREATE_NEW_POOL_ID);
    expect(poolOpenMock).toHaveBeenCalledTimes(2);
    expect(poolModalInstances[1]?.step).toBe("create");

    getHomeRuntimeStateMock.mockResolvedValueOnce({
      mode: "populated",
      pools: [{ id: NEW_POOL_CREATED_ID, name: "新建池", ideaCount: 1, isDefault: false }]
    });
    poolModalInstances[1]?.handlers.onPoolChosen(NEW_POOL_CREATED_ID);
    await Promise.resolve();
    await Promise.resolve();

    expect(buildHomeViewStateFromRuntimeMock).toHaveBeenNthCalledWith(
      2,
      { mode: "populated", pools: [{ id: NEW_POOL_CREATED_ID, name: "新建池", ideaCount: 1, isDefault: false }] },
      {
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView,
        searchFeedbackMessage: undefined
      }
    );
    expect(renderHomeViewMock).toHaveBeenCalledTimes(2);
    expect(followupGuidanceInstances).toHaveLength(1);
    expect(followupGuidanceOpenMock).toHaveBeenCalledTimes(1);

    actions.onPoolSelect("pool-a");
    expect(activatePoolViewMock).toHaveBeenCalledTimes(1);
    expect(activatePoolViewMock).toHaveBeenNthCalledWith(1, {
      poolId: "pool-a",
      resetFilters: true
    });

    expect(actions.onOverflowOpen).toBeUndefined();
    expect(activatePoolViewMock).toHaveBeenCalledTimes(1);
  });

  it("still rerenders home, opens follow-up guidance, and shows a toast when first-use commit returns a warning", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    const warningResult = {
      warning: {
        stage: "create-file" as const,
        message: "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。"
      }
    };

    getHomeRuntimeStateMock
      .mockResolvedValueOnce({
        mode: "empty",
        pools: []
      })
      .mockResolvedValueOnce({
        mode: "populated",
        pools: [{ id: "pool-a", name: "默认池", ideaCount: 1, isDefault: true }]
      });
    buildHomeViewStateFromRuntimeMock.mockImplementation((runtime: { mode: string }) => ({ mode: runtime.mode }));

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    } & Record<string, unknown>;
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onPrimaryAction();
    quickCaptureInstances[0]?.handlers.onSaved();

    expect(poolOpenMock).toHaveBeenCalledTimes(1);
    expect(poolModalInstances[0]?.step).toBe("choose");

    poolModalInstances[0]?.handlers.onPoolChosen("pool-a", undefined, warningResult);
    await Promise.resolve();
    await Promise.resolve();

    expect(buildHomeViewStateFromRuntimeMock).toHaveBeenNthCalledWith(
      2,
      { mode: "populated", pools: [{ id: "pool-a", name: "默认池", ideaCount: 1, isDefault: true }] },
      {
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView,
        searchFeedbackMessage: undefined
      }
    );
    expect(renderHomeViewMock).toHaveBeenCalledTimes(2);
    expect(followupGuidanceInstances).toHaveLength(1);
    expect(followupGuidanceOpenMock).toHaveBeenCalledTimes(1);
    expect(toastShowMock).toHaveBeenCalledTimes(1);
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "info",
      message: "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。"
    });
  });

  it("returns first-use choose modal back to capture", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "empty",
      pools: []
    });
    buildHomeViewStateFromRuntimeMock.mockImplementation((runtime: { mode: string }) => ({ mode: runtime.mode }));

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    } & Record<string, unknown>;
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onPrimaryAction();
    quickCaptureInstances[0]?.handlers.onSaved();

    expect(poolOpenMock).toHaveBeenCalledTimes(1);
    expect(poolModalInstances[0]?.step).toBe("choose");
    expect(poolModalInstances[0]?.options).toEqual(
      expect.objectContaining({
        flowContext: "first-use",
        origin: "capture"
      })
    );
    expect(poolModalInstances[0]?.handlers.onBackToPrevious).toEqual(expect.any(Function));

    poolModalInstances[0]?.handlers.onBackToPrevious?.();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(2);
    expect(quickCaptureInstances[1]?.step).toBe("capture");
    expect(quickCaptureInstances[1]?.options).toEqual(
      expect.objectContaining({
        flowContext: "first-use"
      })
    );
  });

  it("opens global create-pool modal from populated-home secondary action and refreshes home after create", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      poolService: {
        getPool: vi.fn(async (id: string) => ({ id, name: "新建池" }))
      },
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock
      .mockResolvedValueOnce({
        mode: "populated",
        pools: [{ id: "pool-a", name: "默认池", ideaCount: 2, isDefault: true }]
      })
      .mockResolvedValueOnce({
        mode: "populated",
        pools: [{ id: "pool-a", name: "默认池", ideaCount: 2, isDefault: true }, { id: "pool-new", name: "新建池", ideaCount: 0, isDefault: false }]
      });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onSecondaryAction();
    expect(poolOpenMock).toHaveBeenCalledTimes(1);
    expect(poolModalInstances[0]?.step).toBe("create");
    expect(poolModalInstances[0]?.options?.flowContext).toBe("global");
    expect(poolModalInstances[0]?.options?.origin).toBe("home-secondary-action");
    expect(poolModalInstances[0]?.handlers.onBackToChoose).toBeUndefined();

    poolModalInstances[0]?.handlers.onPoolChosen("pool-new");
    await Promise.resolve();
    await Promise.resolve();

    expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(2);
    expect(renderHomeViewMock).toHaveBeenCalledTimes(2);
    expect(quickCaptureOpenMock).not.toHaveBeenCalled();
    expect(activatePoolViewMock).not.toHaveBeenCalled();
  });

  it("confirms populated-home pool deletion before deleting and refreshing home", async () => {
    const getPoolMock = vi.fn(async (id: string) => ({
      id,
      name: id === DEFAULT_POOL_ID ? DEFAULT_POOL_LABEL : "写作池",
      isDefault: id === DEFAULT_POOL_ID
    }));
    const deletePoolMock = vi.fn(async () => true);
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      poolService: {
        getPool: getPoolMock,
        deletePool: deletePoolMock
      },
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock
      .mockResolvedValueOnce({
        mode: "populated",
        pools: [
          { id: DEFAULT_POOL_ID, name: DEFAULT_POOL_LABEL, ideaCount: 2, isDefault: true },
          { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false }
        ]
      })
      .mockResolvedValueOnce({
        mode: "populated",
        pools: [{ id: DEFAULT_POOL_ID, name: DEFAULT_POOL_LABEL, ideaCount: 5, isDefault: true }]
      });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onPoolDelete?: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const originalConfirm = globalThis.confirm;
    const confirmMock = vi.fn(() => false);
    (globalThis as typeof globalThis & { confirm?: (message?: string) => boolean }).confirm = confirmMock;

    try {
      const view = new GlitterMainView({} as any, plugin as any);
      await view.onOpen();
      await Promise.resolve();

      expect(actions.onPoolDelete).toBeTypeOf("function");

      actions.onPoolDelete?.("pool-writing");
      await Promise.resolve();
      await Promise.resolve();

      expect(getPoolMock).toHaveBeenCalledWith("pool-writing");
      expect(confirmMock).toHaveBeenCalledWith("确认删除“写作池”吗？池内灵感将归入默认池。");
      expect(deletePoolMock).not.toHaveBeenCalled();
      expect(renderHomeViewMock).toHaveBeenCalledTimes(1);

      confirmMock.mockReturnValue(true);
      actions.onPoolDelete?.("pool-writing");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(deletePoolMock).toHaveBeenCalledWith("pool-writing");
      expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(2);
      expect(renderHomeViewMock).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as typeof globalThis & { confirm?: (message?: string) => boolean }).confirm = originalConfirm;
    }
  });

  it("uses global capture after onboarding in runtime populated mode", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: [{ id: "pool-a", name: "默认池", ideaCount: 2, isDefault: true }]
    });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onPrimaryAction();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(1);
    expect(quickCaptureInstances[0]?.step).toBe("capture");
    expect(quickCaptureInstances[0]?.options?.flowContext).toBe("global");
  });

  it("opens the global status results page from the populated-home status icon", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: [{ id: "pool-default", name: "默认池", ideaCount: 2, isDefault: true }]
    });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onStatusFilterSelect: () => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onStatusFilterSelect();

    expect(activatePoolViewMock).toHaveBeenCalledTimes(1);
    expect(activatePoolViewMock).toHaveBeenCalledWith({
      mode: "browse",
      scope: "global-status",
      status: "with-markers",
      resetFilters: true
    });
  });

  it("routes populated-home pool search directly to the matching pool view", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      ideaService: {
        queryIdeas: vi.fn(async () => [])
      },
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: [
        { id: "pool-product", name: "产品池", ideaCount: 3, isDefault: false },
        { id: "pool-default", name: "默认池", ideaCount: 2, isDefault: true }
      ]
    });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onSearchSubmit("产品池");
    await Promise.resolve();

    expect(activatePoolViewMock).toHaveBeenCalledWith({
      poolId: "pool-product",
      resetFilters: true
    });
    expect(plugin.ideaService.queryIdeas).not.toHaveBeenCalled();
  });

  it("routes populated-home idea search to the containing pool and stores focus target", async () => {
    const queryIdeasMock = vi.fn(async () => [
      {
        id: "idea-7",
        poolId: "pool-product"
      }
    ]);
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      ideaService: {
        queryIdeas: queryIdeasMock
      },
      focusedIdeaId: null,
      pendingFocusedPoolId: null,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: [{ id: "pool-default", name: "默认池", ideaCount: 2, isDefault: true }]
    });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onSearchSubmit("访谈摘要");
    await Promise.resolve();

    expect(queryIdeasMock).toHaveBeenCalledWith({
      text: "访谈摘要",
      sort: "updatedAt-desc"
    });
    expect(plugin.focusedIdeaId).toBe("idea-7");
    expect(plugin.pendingFocusedPoolId).toBe("pool-product");
    expect(activatePoolViewMock).toHaveBeenCalledWith({
      poolId: "pool-product",
      mode: "browse",
      resetFilters: true
    });
  });

  it("shows populated-home miss feedback for 3 seconds when search finds nothing", async () => {
    vi.useFakeTimers();

    try {
      const queryIdeasMock = vi.fn(async () => []);
      const plugin = {
        settings: {
          enableDesignReviewMode: false,
          reviewScenario: "home-populated",
          poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
        },
        activatePoolView: activatePoolViewMock,
        ideaService: {
          queryIdeas: queryIdeasMock
        },
        firstUseWorkflow: {
          getHomeRuntimeState: getHomeRuntimeStateMock,
          commitDraftToExistingPool: commitDraftToExistingPoolMock,
          commitDraftToNewPool: commitDraftToNewPoolMock
        }
      };

      getHomeRuntimeStateMock.mockResolvedValue({
        mode: "populated",
        pools: [{ id: "pool-default", name: "默认池", ideaCount: 2, isDefault: true }]
      });
      buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

      let actions!: {
        onPrimaryAction: () => void;
        onSecondaryAction: () => void;
        onPoolSelect: (poolId: string) => void;
        onSearchSubmit: (query: string) => void;
        onDismissGuidance: () => void;
      };
      renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
        actions = nextActions;
      });

      const view = new GlitterMainView({} as any, plugin as any);
      await view.onOpen();
      await Promise.resolve();
      renderHomeViewMock.mockClear();
      buildHomeViewStateFromRuntimeMock.mockClear();
      getHomeRuntimeStateMock.mockClear();

      actions.onSearchSubmit("不存在的内容");
      await Promise.resolve();
      await Promise.resolve();

      expect(queryIdeasMock).toHaveBeenCalledWith({
        text: "不存在的内容",
        sort: "updatedAt-desc"
      });
      expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(1);
      expect(buildHomeViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
        { mode: "populated", pools: [{ id: "pool-default", name: "默认池", ideaCount: 2, isDefault: true }] },
        {
          poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView,
          searchFeedbackMessage: "未读取到搜索内容"
        }
      );

      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();

      expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(2);
      expect(buildHomeViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
        { mode: "populated", pools: [{ id: "pool-default", name: "默认池", ideaCount: 2, isDefault: true }] },
        {
          poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView,
          searchFeedbackMessage: undefined
        }
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("orchestrates global saved-feedback follow-up actions from populated home", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      poolService: {
        getPool: vi.fn(async () => ({ id: "pool-a", name: "默认池" }))
      },
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock
      .mockResolvedValueOnce({
        mode: "populated",
        pools: [{ id: "pool-a", name: "默认池", ideaCount: 2, isDefault: true }]
      })
      .mockResolvedValueOnce({
        mode: "populated",
        pools: [{ id: "pool-a", name: "默认池", ideaCount: 3, isDefault: true }]
      })
      .mockResolvedValueOnce({
        mode: "populated",
        pools: [{ id: "pool-a", name: "默认池", ideaCount: 3, isDefault: true }]
      });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onPrimaryAction();
    expect(quickCaptureInstances[0]?.step).toBe("capture");
    expect(quickCaptureInstances[0]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: DEFAULT_POOL_ID,
        initialSelectedPoolLabel: DEFAULT_POOL_LABEL
      })
    );

    quickCaptureInstances[0]?.handlers.onSaved({
      poolId: "pool-a",
      poolLabel: "默认池",
      createFileChecked: true
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(2);
    expect(renderHomeViewMock).toHaveBeenCalledTimes(2);
    expect(quickCaptureInstances[1]?.step).toBe("saved-feedback");
    expect(quickCaptureInstances[1]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialCreateFileChecked: true,
        initialSelectedPoolId: "pool-a",
        initialSelectedPoolLabel: "默认池"
      })
    );

    quickCaptureInstances[1]?.handlers.onSaved();
    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(3);
    expect(quickCaptureInstances[2]?.step).toBe("capture");
    expect(quickCaptureInstances[2]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-a",
        initialSelectedPoolLabel: "默认池"
      })
    );

    quickCaptureInstances[1]?.handlers.onBackHome();
    await Promise.resolve();
    await Promise.resolve();

    expect(activatePoolViewMock).toHaveBeenCalledTimes(1);
    expect(activatePoolViewMock).toHaveBeenLastCalledWith({
      poolId: "pool-a",
      resetFilters: true
    });
    expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(2);
    expect(renderHomeViewMock).toHaveBeenCalledTimes(2);
  });

  it("reopens global capture with chosen pool after opening pool picker", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      poolService: {
        getPool: vi.fn(async (id: string) => ({ id, name: id === "pool-product" ? "产品池" : "默认池" }))
      },
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: [{ id: "pool-a", name: "默认池", ideaCount: 2, isDefault: true }]
    });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onPrimaryAction();
    quickCaptureInstances[0]?.handlers.onPoolPickerOpen("choose");

    expect(poolModalInstances[0]?.step).toBe("choose");
    expect(poolModalInstances[0]?.options?.flowContext).toBe("global");

    poolModalInstances[0]?.handlers.onPoolChosen("pool-product");
    await Promise.resolve();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(2);
    expect(quickCaptureInstances[1]?.step).toBe("capture");
    expect(quickCaptureInstances[1]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-product",
        initialSelectedPoolLabel: "产品池"
      })
    );
    expect((plugin.poolService.getPool as any)).toHaveBeenCalledWith("pool-product");
  });

  it("reopens global capture after pool-picker create flow chooses a new pool", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      poolService: {
        getPool: vi.fn(async (id: string) => ({ id, name: id === "pool-new" ? "新建池" : "默认池" }))
      },
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: [{ id: "pool-a", name: "默认池", ideaCount: 2, isDefault: true }]
    });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onPrimaryAction();
    quickCaptureInstances[0]?.handlers.onPoolPickerOpen("create");

    expect(poolModalInstances[0]?.step).toBe("create");
    expect(poolModalInstances[0]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        origin: "quick-capture-pool-picker"
      })
    );
    expect(poolModalInstances[0]?.handlers.onBackToChoose).toEqual(expect.any(Function));

    poolModalInstances[0]?.handlers.onBackToChoose?.();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(2);
    expect(quickCaptureInstances[1]?.step).toBe("capture");
    expect(quickCaptureInstances[1]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: DEFAULT_POOL_ID,
        initialSelectedPoolLabel: DEFAULT_POOL_LABEL
      })
    );

    quickCaptureInstances[1]?.handlers.onPoolPickerOpen?.("create");
    expect(poolOpenMock).toHaveBeenCalledTimes(2);
    expect(poolModalInstances[1]?.step).toBe("create");

    poolModalInstances[1]?.handlers.onPoolChosen("pool-new");
    await Promise.resolve();

    expect(getHomeRuntimeStateMock).toHaveBeenCalledTimes(1);
    expect(renderHomeViewMock).toHaveBeenCalledTimes(1);
    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(3);
    expect(quickCaptureInstances[2]?.step).toBe("capture");
    expect(quickCaptureInstances[2]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-new",
        initialSelectedPoolLabel: "新建池"
      })
    );
  });

  it("reopens global capture even when selected pool lookup fails", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      poolService: {
        getPool: vi.fn(async () => {
          throw new Error("lookup failed");
        })
      },
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: [{ id: "pool-a", name: "默认池", ideaCount: 2, isDefault: true }]
    });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onPrimaryAction();
    quickCaptureInstances[0]?.handlers.onPoolPickerOpen("choose");
    poolModalInstances[0]?.handlers.onPoolChosen("pool-product");
    await Promise.resolve();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(2);
    expect(quickCaptureInstances[1]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-product",
        initialSelectedPoolLabel: "默认池"
      })
    );
  });

  it("uses runtime populated flow context even when review mode is enabled", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: true,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: [{ id: "pool-a", name: "默认池", ideaCount: 1, isDefault: true }]
    });
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "populated" });

    let actions!: {
      onPrimaryAction: () => void;
      onSecondaryAction: () => void;
      onPoolSelect: (poolId: string) => void;
      onSearchSubmit: (query: string) => void;
      onDismissGuidance: () => void;
    };
    renderHomeViewMock.mockImplementation((_container, _state, nextActions) => {
      actions = nextActions;
    });

    const view = new GlitterMainView({} as any, plugin as any);
    await view.onOpen();
    await Promise.resolve();

    actions.onPrimaryAction();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(1);
    expect(quickCaptureInstances[0]?.options?.flowContext).toBe("global");
  });

  it("ignores stale async runtime renders after a newer render starts", async () => {
    const observer = installMutationObserverStub();
    const firstRender = createDeferred<{ mode: "empty"; pools: [] }>();
    const secondRender = createDeferred<{
      mode: "populated";
      pools: Array<{ id: string; name: string; ideaCount: number; isDefault: boolean }>;
    }>();

    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock
      .mockReturnValueOnce(firstRender.promise)
      .mockReturnValueOnce(secondRender.promise);
    buildHomeViewStateFromRuntimeMock
      .mockReturnValueOnce({ mode: "empty" })
      .mockReturnValueOnce({ mode: "populated" });
    renderHomeViewMock.mockReturnValue({ ownerDocument: { body: {} } });

    const view = new GlitterMainView({} as any, plugin as any);
    (view as any).contentEl = {
      ownerDocument: { body: {} },
      empty: vi.fn()
    };

    try {
      await view.onOpen();
      (view as any).renderMainShell();

      secondRender.resolve({
        mode: "populated",
        pools: [{ id: "pool-a", name: "默认池", ideaCount: 1, isDefault: true }]
      });
      await Promise.resolve();
      await Promise.resolve();

      firstRender.resolve({ mode: "empty", pools: [] });
      await Promise.resolve();
      await Promise.resolve();

      expect(renderHomeViewMock).toHaveBeenCalledTimes(1);
      expect(buildHomeViewStateFromRuntimeMock).toHaveBeenCalledTimes(1);
      expect(buildHomeViewStateFromRuntimeMock).toHaveBeenCalledWith(
        {
          mode: "populated",
          pools: [{ id: "pool-a", name: "默认池", ideaCount: 1, isDefault: true }]
        },
        {
          poolColors: DEFAULT_SETTINGS.poolColors,
          homeFieldView: DEFAULT_SETTINGS.homeFieldView,
          searchFeedbackMessage: undefined
        }
      );
    } finally {
      observer.restore();
    }
  });

  it("uses English empty search feedback when interface language is English", async () => {
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-populated",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView,
        interfaceLanguage: "en"
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      },
      ideaService: {
        queryIdeas: vi.fn(async () => [])
      }
    };

    getHomeRuntimeStateMock.mockResolvedValue({
      mode: "populated",
      pools: [{ id: "pool-a", name: "产品池", ideaCount: 1, isDefault: false }]
    });
    buildHomeViewStateFromRuntimeMock.mockImplementation((_runtime, options) => ({ mode: "populated", options }));
    renderHomeViewMock.mockReturnValue({ ownerDocument: { body: {} } });

    const view = new GlitterMainView({} as any, plugin as any);
    (view as any).contentEl = {
      ownerDocument: { body: {} },
      empty: vi.fn()
    };

    await (view as any).handleHomeSearchSubmit("missing");

    expect(buildHomeViewStateFromRuntimeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "populated" }),
      expect.objectContaining({
        searchFeedbackMessage: "No matching content found",
        interfaceLanguage: "en"
      })
    );
  });

  it("does not render stale async result after close", async () => {
    const observer = installMutationObserverStub();
    const deferred = createDeferred<{ mode: "empty"; pools: [] }>();
    const plugin = {
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "home-empty",
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: DEFAULT_SETTINGS.homeFieldView
      },
      activatePoolView: activatePoolViewMock,
      firstUseWorkflow: {
        getHomeRuntimeState: getHomeRuntimeStateMock,
        commitDraftToExistingPool: commitDraftToExistingPoolMock,
        commitDraftToNewPool: commitDraftToNewPoolMock
      }
    };

    getHomeRuntimeStateMock.mockReturnValueOnce(deferred.promise);
    buildHomeViewStateFromRuntimeMock.mockReturnValue({ mode: "empty" });
    renderHomeViewMock.mockReturnValue({ ownerDocument: { body: {} } });

    const view = new GlitterMainView({} as any, plugin as any);
    (view as any).contentEl = {
      ownerDocument: { body: {} },
      empty: vi.fn()
    };

    try {
      await view.onOpen();
      await view.onClose();

      deferred.resolve({ mode: "empty", pools: [] });
      await Promise.resolve();
      await Promise.resolve();

      expect(buildHomeViewStateFromRuntimeMock).not.toHaveBeenCalled();
      expect(renderHomeViewMock).not.toHaveBeenCalled();
    } finally {
      observer.restore();
    }
  });

  it("disconnects theme observer and clears content on close", async () => {
    const view = new GlitterMainView(
      {} as any,
      {
        settings: {},
        firstUseWorkflow: {
          getHomeRuntimeState: getHomeRuntimeStateMock,
          commitDraftToExistingPool: commitDraftToExistingPoolMock,
          commitDraftToNewPool: commitDraftToNewPoolMock
        }
      } as any
    );
    const empty = vi.fn();
    const body = { classList: { contains: vi.fn() } };
    (view as any).contentEl = {
      ownerDocument: { body },
      empty
    };

    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    const OriginalMutationObserver = globalThis.MutationObserver;

    (globalThis as { MutationObserver: typeof MutationObserver }).MutationObserver = class {
      constructor(_callback: MutationCallback) {}

      observe = observeMock;

      disconnect = disconnectMock;
    } as unknown as typeof MutationObserver;

    try {
      await view.onOpen();
      await view.onClose();

      expect(observeMock).toHaveBeenCalledTimes(1);
      expect(disconnectMock).toHaveBeenCalledTimes(1);
      expect(empty).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as { MutationObserver: typeof MutationObserver }).MutationObserver =
        OriginalMutationObserver;
    }
  });
});
