/**
 * 保护快速捕获弹窗的步骤切换与提交回调相关行为，避免后续重构时出现静默回退。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  QuickCapturePolishError,
  type QuickCapturePolishErrorCode
} from "../../src/ai/polish/polish-types";

// 预先收口可重置的依赖替身，方便验证对外协作。
const {
  buildWriteViewStateMock,
  renderWriteViewMock,
  registeredScopeHandlers,
  poolModalOpenMock,
  poolModalInstances,
  polishTextMock
} = vi.hoisted(() => ({
  buildWriteViewStateMock: vi.fn(),
  renderWriteViewMock: vi.fn(),
  registeredScopeHandlers: [] as Array<{
    modifiers: string[] | null;
    key: string | null;
    listener: (event: KeyboardEvent, ctx: unknown) => unknown;
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
  polishTextMock: vi.fn()
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/ui/write/write-state", () => ({
  buildWriteViewState: buildWriteViewStateMock
}));

vi.mock("../../src/ui/write/render-write", () => ({
  renderWriteView: renderWriteViewMock
}));

vi.mock("../../src/views/pool-modal", () => ({
  PoolModal: class {
    constructor(
      _plugin: unknown,
      step: "choose" | "create" = "choose",
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

    open(): void {
      poolModalOpenMock();
    }
  }
}));

vi.mock("../../src/ai/polish/polish-service", () => ({
  createQuickCapturePolishService: () => ({
    polishText: polishTextMock
  })
}));

vi.mock("obsidian", () => {
  const createMockElement = () => {
    const captureListeners = new Map<string, Array<(event: any) => void>>();
    const bubbleListeners = new Map<string, Array<(event: any) => void>>();

    const getListeners = (
      registry: Map<string, Array<(event: any) => void>>,
      type: string
    ): Array<(event: any) => void> => {
      const listeners = registry.get(type);
      if (listeners) {
        return listeners;
      }

      const nextListeners: Array<(event: any) => void> = [];
      registry.set(type, nextListeners);
      return nextListeners;
    };

    const element = {
      addClass() {},
      removeClass() {},
      empty() {},
      addEventListener(type: string, listener: (event: any) => void, options?: boolean | { capture?: boolean }) {
        const registry = options === true || (typeof options === "object" && options?.capture)
          ? captureListeners
          : bubbleListeners;
        getListeners(registry, type).push(listener);
      },
      removeEventListener(type: string, listener: (event: any) => void, options?: boolean | { capture?: boolean }) {
        const registry = options === true || (typeof options === "object" && options?.capture)
          ? captureListeners
          : bubbleListeners;
        const listeners = registry.get(type);
        if (!listeners) {
          return;
        }

        const listenerIndex = listeners.indexOf(listener);
        if (listenerIndex >= 0) {
          listeners.splice(listenerIndex, 1);
        }
      },
      dispatchEvent(event: any) {
        const normalizedEvent = {
          ...event,
          currentTarget: element,
          target: event?.target ?? element,
          defaultPrevented: false,
          propagationStopped: false,
          immediatePropagationStopped: false,
          preventDefault() {
            normalizedEvent.defaultPrevented = true;
            event?.preventDefault?.();
          },
          stopPropagation() {
            normalizedEvent.propagationStopped = true;
            event?.stopPropagation?.();
          },
          stopImmediatePropagation() {
            normalizedEvent.immediatePropagationStopped = true;
            normalizedEvent.propagationStopped = true;
            event?.stopImmediatePropagation?.();
          }
        };

        for (const listener of [...(captureListeners.get(normalizedEvent.type) ?? [])]) {
          listener(normalizedEvent);
          if (normalizedEvent.immediatePropagationStopped) {
            break;
          }
        }

        if (!normalizedEvent.propagationStopped) {
          for (const listener of [...(bubbleListeners.get(normalizedEvent.type) ?? [])]) {
            listener(normalizedEvent);
            if (normalizedEvent.immediatePropagationStopped) {
              break;
            }
          }
        }

        return !normalizedEvent.defaultPrevented;
      },
      contains(node: unknown) {
        return node === element;
      }
    };

    return element;
  };

  return {
    Modal: class {
      containerEl = createMockElement();
      modalEl = createMockElement();
      contentEl = createMockElement();
      scope = {
        register: (modifiers: string[] | null, key: string | null, listener: (event: KeyboardEvent, ctx: unknown) => unknown) => {
          registeredScopeHandlers.push({ modifiers, key, listener });
          return {
            modifiers: modifiers?.join("+") ?? null,
            key,
            scope: this.scope
          };
        },
        unregister() {}
      };

      constructor(public readonly app: unknown) {
        this.containerEl.contains = (node: unknown) =>
          node === this.containerEl || node === this.modalEl || node === this.contentEl;
        this.modalEl.contains = (node: unknown) => node === this.modalEl || node === this.contentEl;
      }

      open(): void {
        this.containerEl.addEventListener("click", (event: { target?: unknown }) => {
          if (event.target === this.containerEl) {
            this.close();
          }
        });

        const ownerDocument =
          (this.contentEl as { ownerDocument?: { activeElement?: unknown; activeElementOnOpen?: unknown } } | undefined)
            ?.ownerDocument ??
          (this.modalEl as { ownerDocument?: { activeElement?: unknown; activeElementOnOpen?: unknown } } | undefined)
            ?.ownerDocument ??
          (this.containerEl as { ownerDocument?: { activeElement?: unknown; activeElementOnOpen?: unknown } } | undefined)
            ?.ownerDocument;
        if (ownerDocument && "activeElementOnOpen" in ownerDocument) {
          ownerDocument.activeElement = ownerDocument.activeElementOnOpen;
        }

        const withOnOpen = this as { onOpen?: () => void };
        withOnOpen.onOpen?.();
      }

      close(): void {
        const ownerDocument =
          (this.contentEl as {
            ownerDocument?: { restoreActiveElementOnClose?: { focus?: () => void } };
          } | undefined)?.ownerDocument ??
          (this.modalEl as {
            ownerDocument?: { restoreActiveElementOnClose?: { focus?: () => void } };
          } | undefined)?.ownerDocument ??
          (this.containerEl as {
            ownerDocument?: { restoreActiveElementOnClose?: { focus?: () => void } };
          } | undefined)?.ownerDocument;

        const withOnClose = this as { onClose?: () => void };
        withOnClose.onClose?.();
        ownerDocument?.restoreActiveElementOnClose?.focus?.();
      }
    },
    Notice: class {
      constructor(_message: string) {}
    },
    normalizePath: (value: string) => value.replace(/\\/g, "/").replace(/\/+$/g, "")
  };
});

import { QuickCaptureModal } from "../../src/views/quick-capture-modal";

// 覆盖视图宿主在生命周期、渲染与回调桥接上的核心契约。
describe("QuickCaptureModal", () => {
  beforeEach(() => {
    buildWriteViewStateMock.mockReset();
    renderWriteViewMock.mockReset();
    poolModalOpenMock.mockReset();
    polishTextMock.mockReset();
    registeredScopeHandlers.length = 0;
    poolModalInstances.length = 0;
  });

  function attachModalHost(
    modal: QuickCaptureModal,
    overrides: Record<string, unknown> = {}
  ): {
    addClass: ReturnType<typeof vi.fn>;
    removeClass: ReturnType<typeof vi.fn>;
    empty: ReturnType<typeof vi.fn>;
  } {
    const addClass = vi.fn();
    const removeClass = vi.fn();
    const empty = vi.fn();
    const sharedOverrides = overrides.ownerDocument ? { ownerDocument: overrides.ownerDocument } : {};
    (modal as any).containerEl = { ...(modal as any).containerEl, addClass, removeClass, ...sharedOverrides };
    (modal as any).modalEl = { ...(modal as any).modalEl, addClass, removeClass, ...sharedOverrides };
    (modal as any).contentEl = {
      ...(modal as any).contentEl,
      addClass,
      removeClass,
      empty,
      ...sharedOverrides,
      ...overrides
    };
    return { addClass, removeClass, empty };
  }

  async function flushPromises(): Promise<void> {
    await Promise.resolve();
  }

  async function waitUntil(assertion: () => void, maxAttempts = 20): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        assertion();
        return;
      } catch (error) {
        lastError = error;
      }
      await flushPromises();
    }
    throw lastError instanceof Error ? lastError : new Error("waitUntil assertion did not pass");
  }

  async function waitForLatestActions<T>(): Promise<T> {
    let latestActions: T | undefined;
    await waitUntil(() => {
      const callCount = renderWriteViewMock.mock.calls.length;
      if (callCount === 0) {
        throw new Error("renderWriteView has not been called yet");
      }
      latestActions = renderWriteViewMock.mock.calls[callCount - 1]?.[2] as T | undefined;
      if (!latestActions) {
        throw new Error("renderWriteView actions are missing");
      }
    });
    return latestActions as T;
  }

  function getLatestBuildState(): Record<string, unknown> {
    const latestState = buildWriteViewStateMock.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
    expect(latestState).toBeDefined();
    return latestState!;
  }

  function createAiReadyGlobalPlugin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      app: {},
      manifest: {
        id: "glitter"
      },
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter",
        ai: {
          enabled: true,
          quickCapturePolishEnabled: true,
          provider: "openai-compatible",
          baseUrl: "https://api.example.com",
          model: "gpt-test",
          apiKey: "secret"
        }
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn()
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      },
      ...overrides
    };
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((fulfill) => {
      resolve = fulfill;
    });
    return { promise, resolve };
  }

  function getScopeHandler(key: string, modifiers: string[] | null = []): (event: KeyboardEvent, ctx: unknown) => unknown {
    const handler = registeredScopeHandlers.find(
      (entry) => entry.key === key && JSON.stringify(entry.modifiers ?? null) === JSON.stringify(modifiers)
    );
    expect(handler, `Expected scope handler for ${JSON.stringify({ key, modifiers })}`).toBeDefined();
    return handler!.listener;
  }

  it("adds first-use modal shell class only for the first-use flow", () => {
    const plugin = {
      app: {},
      settings: {},
      ideaService: {
        createIdea: vi.fn()
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const firstUseModal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "first-use" });
    const firstUseHost = attachModalHost(firstUseModal);

    firstUseModal.onOpen();

    expect(firstUseHost.addClass).toHaveBeenCalledWith("glitter-quick-capture-modal--first-use");

    firstUseModal.onClose();

    expect(firstUseHost.removeClass).toHaveBeenCalledWith("glitter-quick-capture-modal--first-use");

    const globalModal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    const globalHost = attachModalHost(globalModal);

    globalModal.onOpen();

    expect(globalHost.addClass).not.toHaveBeenCalledWith("glitter-quick-capture-modal--first-use");
  });

  it("ignores legacy review settings and opens first-use capture with runtime defaults", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: true,
        reviewScenario: "quick-capture-link-loading",
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        createIdea: vi.fn()
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "first-use",
      initialInputText: "运行时正文"
    });
    attachModalHost(modal);

    modal.onOpen();

    expect(buildWriteViewStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        contentKind: "text",
        importState: "idle",
        inputText: "运行时正文",
        generatedTitle: "我的第一条灵感",
        closeConfirmVisible: false,
        poolOptions: []
      })
    );
  });

  it("keeps first-use runtime pool options empty instead of using fake historical entries", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: true,
        reviewScenario: "quick-capture-link-loading",
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        createIdea: vi.fn()
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "first-use",
      initialInputText: "运行时正文"
    });
    attachModalHost(modal);

    modal.onOpen();

    expect(buildWriteViewStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        contentKind: "text",
        importState: "idle",
        inputText: "运行时正文",
        generatedTitle: "我的第一条灵感",
        closeConfirmVisible: false,
        poolOptions: []
      })
    );
  });

  it("stages first-use draft on capture submit without creating idea directly", async () => {
    const calls: string[] = [];
    const onSaved = vi.fn(() => {
      calls.push("saved");
    });
    const createIdea = vi.fn(async () => undefined);
    const stageFirstIdeaDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-default",
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        createIdea
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {
        onSaved
      },
      {
        flowContext: "first-use",
        initialInputText: "首次流程内容"
      }
    );
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      calls.push("close");
    });

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();

    actions.onSubmit();

    await waitUntil(() => {
      expect(stageFirstIdeaDraft).toHaveBeenCalledTimes(1);
    });

    expect(createIdea).not.toHaveBeenCalled();
    expect(stageFirstIdeaDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "首次流程内容",
        sourceType: "quick-capture"
      })
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(undefined);
    expect(calls).toEqual(["close", "saved"]);
  });

  it("routes Escape through the same close-confirm path as the close button", async () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-default",
        mediaStorageDirectory: "Glitter"
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "first-use",
      initialInputText: "保留当前记录"
    });
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
    }>();
    actions.onBodyInputChange("保留当前记录（已改）");

    const escapeHandler = getScopeHandler("Escape");
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    escapeHandler({ preventDefault, stopPropagation } as unknown as KeyboardEvent, {});

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );
  });

  it("ignores outside clicks so quick capture only dismisses from explicit close actions", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-default",
        mediaStorageDirectory: "Glitter"
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "first-use",
      initialInputText: "保留当前记录"
    });
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);

    modal.open();
    (modal as any).containerEl.dispatchEvent({ type: "click", target: (modal as any).containerEl });

    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: false
      })
    );
  });

  it("re-blurs the pre-open first-use launcher after modal close restores focus", async () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-default",
        mediaStorageDirectory: "Glitter"
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };
    const ownerDocument: {
      activeElement?: unknown;
      activeElementOnOpen?: unknown;
      restoreActiveElementOnClose?: { focus?: () => void };
    } = {};
    const modalFocusTarget = { blur: vi.fn() };
    const launcher = {
      blur: vi.fn(() => {
        ownerDocument.activeElement = null;
      }),
      focus: vi.fn(() => {
        ownerDocument.activeElement = launcher;
      })
    };
    ownerDocument.activeElement = launcher;
    ownerDocument.activeElementOnOpen = modalFocusTarget;
    ownerDocument.restoreActiveElementOnClose = launcher;

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "first-use",
      initialInputText: "保留当前记录"
    });
    attachModalHost(modal, { ownerDocument });

    modal.open();

    const editActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
    }>();
    editActions.onBodyInputChange("保留当前记录（已改）");

    const escapeHandler = getScopeHandler("Escape");
    escapeHandler({ preventDefault() {}, stopPropagation() {} } as unknown as KeyboardEvent, {});

    const actions = await waitForLatestActions<{ onConfirmClose: () => void }>();
    actions.onConfirmClose();
    await flushPromises();

    expect(launcher.focus).toHaveBeenCalledTimes(1);
    expect(launcher.blur).toHaveBeenCalledTimes(1);
    expect(ownerDocument.activeElement).toBeNull();
  });

  it("submits capture with Mod+Enter through the same save flow as the primary action", async () => {
    const calls: string[] = [];
    const onSaved = vi.fn(() => {
      calls.push("saved");
    });
    const stageFirstIdeaDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-default",
        mediaStorageDirectory: "Glitter"
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {
        onSaved
      },
      {
        flowContext: "first-use",
        initialInputText: "快捷键保存内容"
      }
    );
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      calls.push("close");
    });

    modal.onOpen();

    const submitHandler = getScopeHandler("Enter", ["Mod"]);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    submitHandler({ preventDefault, stopPropagation } as unknown as KeyboardEvent, {});

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);

    await waitUntil(() => {
      expect(stageFirstIdeaDraft).toHaveBeenCalledTimes(1);
    });

    expect(stageFirstIdeaDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "快捷键保存内容",
        sourceType: "quick-capture"
      })
    );
    expect(onSaved).toHaveBeenCalledWith(undefined);
    expect(calls).toEqual(["close", "saved"]);
  });

  it("blocks empty first-use submit, shows transient feedback, and keeps the modal open", async () => {
    vi.useFakeTimers();

    try {
      const calls: string[] = [];
      const onSaved = vi.fn(() => {
        calls.push("saved");
      });
      const stageFirstIdeaDraft = vi.fn(async () => undefined);
      const plugin = {
        app: {},
        settings: {
          enableDesignReviewMode: false,
          reviewScenario: "quick-capture-default",
          mediaStorageDirectory: "Glitter"
        },
        firstUseWorkflow: {
          stageFirstIdeaDraft
        }
      };

      buildWriteViewStateMock.mockImplementation((state) => state);

      const modal = new QuickCaptureModal(
        plugin as any,
        "capture",
        {
          onSaved
        },
        {
          flowContext: "first-use",
          initialInputText: "   "
        }
      );
      vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
        calls.push("close");
      });

      modal.onOpen();

      const actions = await waitForLatestActions<{
        onSubmit: () => void;
      }>();

      actions.onSubmit();
      await flushPromises();

      expect(stageFirstIdeaDraft).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          emptySubmitFeedbackVisible: true
        })
      );

      vi.advanceTimersByTime(3000);
      await flushPromises();

      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          emptySubmitFeedbackVisible: false
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders first-use saved-feedback and routes submit/back-home callbacks in close-first order", () => {
    const calls: string[] = [];
    const onChoosePool = vi.fn(() => {
      calls.push("choose-pool");
    });
    const onBackHome = vi.fn(() => {
      calls.push("back-home");
    });
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-default",
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        createIdea: vi.fn()
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockReturnValue({ shell: "quick-capture" });

    const modal = new QuickCaptureModal(
      plugin as any,
      "saved-feedback",
      {
        onChoosePool,
        onBackHome
      },
      {
        flowContext: "first-use",
        initialInputText: "第一条灵感正文"
      }
    );
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      calls.push("close");
    });

    modal.onOpen();

    expect(buildWriteViewStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "saved-feedback",
        generatedTitle: "我的第一条灵感"
      })
    );

    const actions = renderWriteViewMock.mock.calls[0]?.[2] as {
      onSubmit: () => void;
      onClose: () => void;
      onPoolPickerToggle: () => void;
    };

    actions.onSubmit();
    actions.onClose();

    expect(onChoosePool).toHaveBeenCalledTimes(1);
    expect(onBackHome).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["close", "choose-pool", "close", "back-home"]);
  });

  it("closes immediately when title and body were never edited", async () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-writing", label: "写作池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "全局记录内容"
    });
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onClose: () => void;
    }>();

    actions.onClose();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        closeConfirmVisible: false
      })
    );
  });

  it("shows quick-capture close confirmation after a title-only edit", async () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-writing", label: "写作池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "全局记录内容"
    });
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onTitleInputChange: (value: string) => void;
      onClose: () => void;
    }>();

    actions.onTitleInputChange("手动标题");

    const dirtyActions = await waitForLatestActions<{
      onClose: () => void;
    }>();

    dirtyActions.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        titleText: "手动标题",
        closeConfirmVisible: true
      })
    );
  });

  it("closes the inline pool dropdown before showing quick-capture close confirmation after body edits", async () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-writing", label: "写作池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "全局记录内容"
    });
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onPoolPickerToggle: () => void;
      onBodyInputChange: (value: string) => void;
      onClose: () => void;
    }>();

    actions.onPoolPickerToggle();
    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          flowContext: "global",
          phase: "capture",
          poolDropdownVisible: true,
          closeConfirmVisible: false
        })
      );
    });

    const rerenderActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
      onClose: () => void;
    }>();

    rerenderActions.onBodyInputChange("全局记录内容（已改）");

    const dirtyActions = await waitForLatestActions<{
      onClose: () => void;
    }>();

    dirtyActions.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        poolDropdownVisible: false,
        closeConfirmVisible: true
      })
    );
  });

  it("toggles/selects inline pool dropdown and submits with the chosen global pool", async () => {
    const calls: string[] = [];
    const onSaved = vi.fn(() => {
      calls.push("saved");
    });
    const createIdea = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: createIdea,
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-writing", label: "写作池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockReturnValue({ shell: "quick-capture" });

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {
        onSaved
      },
      {
        flowContext: "global",
        initialInputText: "全局记录内容"
      }
    );
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      calls.push("close");
    });

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onSubmit: () => void;
      onPoolPickerToggle: () => void;
      onPoolSelect: (poolId: string) => void;
    }>();

    actions.onPoolPickerToggle();
    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          flowContext: "global",
          phase: "capture",
          poolDropdownVisible: true
        })
      );
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          poolOptions: expect.arrayContaining([
            expect.objectContaining({ id: "pool-writing", label: "写作池" })
          ])
        })
      );
    });

    const rerenderActions = await waitForLatestActions<{
      onPoolSelect: (poolId: string) => void;
      onSubmit: () => void;
    }>();

    rerenderActions.onPoolSelect("pool-writing");
    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedPoolLabel: "写作池",
          poolDropdownVisible: false
        })
      );
    });

    rerenderActions.onSubmit();

    await waitUntil(() => {
      expect(createIdea).toHaveBeenCalledTimes(1);
    });
    expect(createIdea).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: "pool-writing",
        createFileChecked: false
      })
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({
      poolId: "pool-writing",
      poolLabel: "写作池",
      createFileChecked: false
    });
    expect(calls).toEqual(["close", "saved"]);
  });

  it("opens a global create-pool modal inline and applies the created pool back to quick capture", async () => {
    const calls: string[] = [];
    const onSaved = vi.fn(() => {
      calls.push("saved");
    });
    const onPoolPickerOpen = vi.fn();
    const createIdea = vi.fn(async () => undefined);
    const listGlobalPoolOptions = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "pool-default", label: "默认池" },
        { id: "pool-writing", label: "写作池" },
        { id: "pool-research", label: "调研池" }
      ])
      .mockResolvedValueOnce([
        { id: "pool-default", label: "默认池" },
        { id: "pool-writing", label: "写作池" },
        { id: "pool-created", label: "新池" }
      ]);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: createIdea,
        listGlobalPoolOptions
      },
      poolService: {
        getPool: vi.fn(async () => ({ id: "pool-created", name: "新池" }))
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockReturnValue({ shell: "quick-capture" });

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {
        onSaved,
        onPoolPickerOpen
      },
      {
        flowContext: "global",
        initialInputText: "全局记录内容"
      }
    );
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      calls.push("close");
    });

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onPoolPickerToggle: () => void;
      onPoolSelect: (poolId: string) => void;
    }>();

    actions.onPoolPickerToggle();
    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          poolDropdownVisible: true,
          poolOptions: expect.arrayContaining([
            expect.objectContaining({ id: "pool-writing", label: "写作池" })
          ])
        })
      );
    });

    const createActions = await waitForLatestActions<{
      onPoolSelect: (poolId: string) => void;
    }>();
    createActions.onPoolSelect("create-new-pool");
    await flushPromises();

    expect(onPoolPickerOpen).not.toHaveBeenCalled();
    expect(poolModalOpenMock).toHaveBeenCalledTimes(1);
    expect(poolModalInstances).toHaveLength(1);
    expect(poolModalInstances[0]).toEqual({
      step: "create",
      handlers: {
        onPoolChosen: expect.any(Function),
        onBackToChoose: expect.any(Function)
      },
      options: {
        flowContext: "global",
        origin: "quick-capture-pool-picker"
      }
    });
    expect(calls).toEqual([]);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        poolDropdownVisible: false
      })
    );

    poolModalInstances[0]?.handlers.onPoolChosen?.("pool-created", "新池");

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedPoolId: "pool-created",
          selectedPoolLabel: "新池",
          poolDropdownVisible: false,
          poolOptions: expect.arrayContaining([
            expect.objectContaining({ id: "pool-created", label: "新池" })
          ])
        })
      );
    });

    const submitActions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();
    submitActions.onSubmit();

    await waitUntil(() => {
      expect(createIdea).toHaveBeenCalledTimes(1);
    });
    expect(createIdea).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: "pool-created",
        createFileChecked: false
      })
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({
      poolId: "pool-created",
      poolLabel: "新池",
      createFileChecked: false
    });
    expect(calls).toEqual(["close", "saved"]);
  });

  it("reopens the inline pool dropdown when quick-capture create-pool goes back to choose", async () => {
    const onPoolPickerOpen = vi.fn();
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockReturnValue({ shell: "quick-capture" });

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {
        onPoolPickerOpen
      },
      {
        flowContext: "global",
        initialInputText: "全局记录内容"
      }
    );

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onPoolPickerToggle: () => void;
      onPoolSelect: (poolId: string) => void;
    }>();

    actions.onPoolPickerToggle();
    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          poolDropdownVisible: true
        })
      );
    });

    const createActions = await waitForLatestActions<{
      onPoolSelect: (poolId: string) => void;
    }>();
    createActions.onPoolSelect("create-new-pool");
    await flushPromises();

    expect(poolModalOpenMock).toHaveBeenCalledTimes(1);
    expect(onPoolPickerOpen).not.toHaveBeenCalled();

    poolModalInstances[0]?.handlers.onBackToChoose?.();

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          poolDropdownVisible: true
        })
      );
    });
  });

  it("keeps the created pool selected when the initial global pool refresh resolves late", async () => {
    const initialRefresh = createDeferred<Array<{ id: string; label: string }>>();
    const createdRefresh = createDeferred<Array<{ id: string; label: string }>>();
    const listGlobalPoolOptions = vi
      .fn()
      .mockImplementationOnce(() => initialRefresh.promise)
      .mockImplementationOnce(() => createdRefresh.promise);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions
      },
      poolService: {
        getPool: vi.fn(async () => ({ id: "pool-created", name: "新池" }))
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "全局记录内容"
    });

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onPoolPickerToggle: () => void;
      onPoolSelect: (poolId: string) => void;
    }>();
    actions.onPoolPickerToggle();

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          poolDropdownVisible: true
        })
      );
    });

    const createActions = await waitForLatestActions<{
      onPoolSelect: (poolId: string) => void;
    }>();
    createActions.onPoolSelect("create-new-pool");
    await flushPromises();

    poolModalInstances[0]?.handlers.onPoolChosen?.("pool-created", "新池");
    createdRefresh.resolve([
      { id: "pool-default", label: "默认池" },
      { id: "pool-created", label: "新池" }
    ]);

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedPoolId: "pool-created",
          selectedPoolLabel: "新池",
          poolOptions: expect.arrayContaining([
            expect.objectContaining({ id: "pool-created", label: "新池" })
          ])
        })
      );
    });

    initialRefresh.resolve([
      { id: "pool-default", label: "默认池" },
      { id: "pool-writing", label: "写作池" }
    ]);
    await flushPromises();

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedPoolId: "pool-created",
        selectedPoolLabel: "新池",
        poolOptions: expect.arrayContaining([
          expect.objectContaining({ id: "pool-created", label: "新池" })
        ])
      })
    );
  });

  it("uses the created pool immediately even before pool refresh finishes", async () => {
    const calls: string[] = [];
    const createdRefresh = createDeferred<Array<{ id: string; label: string }>>();
    const saveGlobalDraft = vi.fn(async () => undefined);
    const listGlobalPoolOptions = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "pool-default", label: "默认池" },
        { id: "pool-writing", label: "写作池" }
      ])
      .mockImplementationOnce(() => createdRefresh.promise);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions
      },
      poolService: {
        getPool: vi.fn(async () => ({ id: "pool-created", name: "新池" }))
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {
        onSaved: (selection?: { poolLabel?: string }) => {
          calls.push(`saved:${selection?.poolLabel ?? "none"}`);
        }
      },
      {
        flowContext: "global",
        initialInputText: "全局记录内容"
      }
    );
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      calls.push("close");
    });

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onPoolPickerToggle: () => void;
      onPoolSelect: (poolId: string) => void;
    }>();
    actions.onPoolPickerToggle();

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          poolOptions: expect.arrayContaining([
            expect.objectContaining({ id: "pool-writing", label: "写作池" })
          ])
        })
      );
    });

    const createActions = await waitForLatestActions<{
      onPoolSelect: (poolId: string) => void;
    }>();
    createActions.onPoolSelect("create-new-pool");
    await flushPromises();

    poolModalInstances[0]?.handlers.onPoolChosen?.("pool-created", "新池");

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedPoolId: "pool-created",
          selectedPoolLabel: "新池",
          poolDropdownVisible: false
        })
      );
    });

    const submitActions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();
    submitActions.onSubmit();

    await waitUntil(() => {
      expect(saveGlobalDraft).toHaveBeenCalledTimes(1);
    });
    expect(saveGlobalDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: "pool-created"
      })
    );
    expect(calls).toEqual(["close", "saved:新池"]);

    createdRefresh.resolve([
      { id: "pool-default", label: "默认池" },
      { id: "pool-writing", label: "写作池" },
      { id: "pool-created", label: "新池" }
    ]);
    await flushPromises();
  });

  it("does not overwrite a newer manual pool choice while created-pool refresh is still pending", async () => {
    const createdRefresh = createDeferred<Array<{ id: string; label: string }>>();
    const listGlobalPoolOptions = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "pool-default", label: "默认池" },
        { id: "pool-writing", label: "写作池" }
      ])
      .mockImplementationOnce(() => createdRefresh.promise);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions
      },
      poolService: {
        getPool: vi.fn(async () => ({ id: "pool-created", name: "新池" }))
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "全局记录内容"
    });

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onPoolPickerToggle: () => void;
      onPoolSelect: (poolId: string) => void;
    }>();
    actions.onPoolPickerToggle();

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          poolOptions: expect.arrayContaining([
            expect.objectContaining({ id: "pool-writing", label: "写作池" })
          ])
        })
      );
    });

    const createActions = await waitForLatestActions<{
      onPoolSelect: (poolId: string) => void;
      onPoolPickerToggle: () => void;
    }>();
    createActions.onPoolSelect("create-new-pool");
    await flushPromises();

    poolModalInstances[0]?.handlers.onPoolChosen?.("pool-created", "新池");

    const pendingActions = await waitForLatestActions<{
      onPoolPickerToggle: () => void;
      onPoolSelect: (poolId: string) => void;
    }>();
    pendingActions.onPoolPickerToggle();

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          poolDropdownVisible: true
        })
      );
    });

    const reselectionActions = await waitForLatestActions<{
      onPoolSelect: (poolId: string) => void;
    }>();
    reselectionActions.onPoolSelect("pool-writing");

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedPoolId: "pool-writing",
          selectedPoolLabel: "写作池",
          poolDropdownVisible: false
        })
      );
    });

    createdRefresh.resolve([
      { id: "pool-default", label: "默认池" },
      { id: "pool-writing", label: "写作池" },
      { id: "pool-created", label: "新池" }
    ]);
    await flushPromises();

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedPoolId: "pool-writing",
        selectedPoolLabel: "写作池",
        poolOptions: expect.arrayContaining([
          expect.objectContaining({ id: "pool-created", label: "新池" })
        ])
      })
    );
  });

  it("preserves provided runtime input for non-review global capture", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "保留传入正文",
      initialCreateFileChecked: true,
      initialSelectedPoolId: "pool-research",
      initialSelectedPoolLabel: "调研池"
    });
    modal.onOpen();

    expect(buildWriteViewStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        inputText: "保留传入正文",
        createFileChecked: true,
        selectedPoolId: "pool-research",
        selectedPoolLabel: "调研池",
        attachedMediaCount: 0
      })
    );
  });

  it("persists sourceUrl for global link capture and marks source as link-import", async () => {
    const saveGlobalDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {},
      {
        flowContext: "global",
        initialInputText: "https://example.com/article"
      }
    );

    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();

    actions.onSubmit();

    await waitUntil(() => {
      expect(saveGlobalDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: "link",
          body: "https://example.com/article",
          sourceUrl: "https://example.com/article"
        })
      );
    });
  });

  it("blocks empty global submit, shows transient feedback, and never enters saving", async () => {
    vi.useFakeTimers();

    try {
      const saveGlobalDraft = vi.fn(async () => undefined);
      const onSaved = vi.fn();
      const plugin = {
        app: {},
        settings: {
          enableDesignReviewMode: false,
          reviewScenario: "quick-capture-global-default",
          mediaStorageDirectory: "Glitter"
        },
        quickCaptureWorkflow: {
          saveGlobalDraft,
          listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
        },
        firstUseWorkflow: {
          stageFirstIdeaDraft: vi.fn(async () => undefined)
        }
      };

      buildWriteViewStateMock.mockImplementation((state) => state);

      const modal = new QuickCaptureModal(
        plugin as any,
        "capture",
        {
          onSaved
        },
        {
          flowContext: "global",
          initialInputText: ""
        }
      );
      const closeSpy = vi
        .spyOn(modal as unknown as { close: () => void }, "close")
        .mockImplementation(() => undefined);

      modal.onOpen();

      const actions = await waitForLatestActions<{
        onSubmit: () => void;
      }>();

      actions.onSubmit();
      await flushPromises();

      expect(saveGlobalDraft).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect(closeSpy).not.toHaveBeenCalled();
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          flowContext: "global",
          phase: "capture",
          emptySubmitFeedbackVisible: true
        })
      );
      expect(buildWriteViewStateMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          phase: "saving"
        })
      );

      vi.advanceTimersByTime(3000);
      await flushPromises();

      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          flowContext: "global",
          phase: "capture",
          emptySubmitFeedbackVisible: false
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps imported link excerpt in attachment metadata while preserving note text and sourceUrl", async () => {
    const saveGlobalDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async () => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: "https://example.com/article"
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
      onSubmit: () => void;
    }>();

    actions.onBodyInputChange("这是上下文 https://example.com/article");

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "这是上下文\n\n导入摘要",
          importedExcerpt: "导入摘要",
          titleText: "导入标题",
          sourceUrl: "https://example.com/article"
        })
      );
    });

    const submitActions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();
    submitActions.onSubmit();

    await waitUntil(() => {
      expect(saveGlobalDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: "link",
          body: "这是上下文\n\n导入摘要",
          sourceUrl: "https://example.com/article"
        })
      );
    });
  });

  it("imports first-use links into attachment metadata while preserving note text", async () => {
    const stageFirstIdeaDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-default",
        mediaStorageDirectory: "Glitter"
      },
      linkImportService: {
        importFromInput: vi.fn(async () => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: "https://example.com/article"
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "first-use" });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
      onSubmit: () => void;
    }>();

    actions.onBodyInputChange("这是第一次记录 https://example.com/article");

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          flowContext: "first-use",
          contentKind: "link",
          inputText: "这是第一次记录\n\n导入摘要",
          importedExcerpt: "导入摘要",
          titleText: "导入标题",
          sourceUrl: "https://example.com/article"
        })
      );
    });

    const submitActions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();
    submitActions.onSubmit();

    await waitUntil(() => {
      expect(stageFirstIdeaDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: "link",
          body: "这是第一次记录\n\n导入摘要",
          sourceUrl: "https://example.com/article"
        })
      );
    });
  });

  it("does not use the source URL as imported excerpt when link extraction returns no body", async () => {
    const saveGlobalDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async () => ({
          title: "导入标题",
          body: "",
          sourceUrl: "https://example.com/article"
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
      onSubmit: () => void;
    }>();

    actions.onBodyInputChange("只有判断 https://example.com/article");

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "只有判断",
          importedExcerpt: undefined,
          titleText: "导入标题",
          sourceUrl: "https://example.com/article"
        })
      );
    });

    const submitActions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();
    submitActions.onSubmit();

    await waitUntil(() => {
      expect(saveGlobalDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: "link",
          body: "只有判断",
          sourceUrl: "https://example.com/article"
        })
      );
    });
  });

  it("persists global media title from the first attached filename on submit", async () => {
    const saveGlobalDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async () => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: "https://example.com/article"
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);
    vi.spyOn(modal as any, "saveSelectedMediaFiles").mockResolvedValue(["Glitter/images/默认池/shot.png"]);

    modal.onOpen();
    (modal as any).selectedMedia = [{ file: { name: "shot.png", type: "image/png" } }];
    (modal as any).runtimeState = {
      ...(modal as any).runtimeState,
      input: {
        ...(modal as any).runtimeState.input,
        hasMedia: true,
        text: ""
      }
    };

    const actions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();

    actions.onSubmit();

    await waitUntil(() => {
      expect(saveGlobalDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: "image",
          title: "shot.png",
          attachmentPaths: ["Glitter/images/默认池/shot.png"]
        })
      );
    });
  });

  it("persists link fallback title when global link has no manual title or extracted sentence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 24, 10, 30));

    try {
      const saveGlobalDraft = vi.fn(async () => undefined);
      const plugin = {
        app: {},
        settings: {
          enableDesignReviewMode: false,
          reviewScenario: "quick-capture-global-default",
          mediaStorageDirectory: "Glitter"
        },
        quickCaptureWorkflow: {
          saveGlobalDraft,
          listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
        },
        linkImportService: {
          importFromInput: vi.fn(async () => ({
            title: "导入标题",
            body: "导入摘要",
            sourceUrl: "https://example.com/article"
          }))
        },
        firstUseWorkflow: {
          stageFirstIdeaDraft: vi.fn(async () => undefined)
        }
      };

      buildWriteViewStateMock.mockImplementation((state) => state);

      const modal = new QuickCaptureModal(
        plugin as any,
        "capture",
        {},
        {
          flowContext: "global",
          initialInputText: "https://cdn.example.com/media.mp4"
        }
      );
      vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);
      vi.spyOn(modal as any, "saveSelectedMediaFiles").mockResolvedValue([]);

      modal.onOpen();

      const actions = await waitForLatestActions<{
        onSubmit: () => void;
      }>();

      actions.onSubmit();

      await waitUntil(() => {
        expect(saveGlobalDraft).toHaveBeenCalledWith(
          expect.objectContaining({
            contentType: "link",
            title: "灵感 04-24 10:30"
          })
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("restarts link import after input changes during an in-flight request", async () => {
    let resolveFirst!: (value: { title: string; body: string; sourceUrl: string }) => void;
    const firstRequest = new Promise<{ title: string; body: string; sourceUrl: string }>((resolve) => {
      resolveFirst = resolve;
    });

    const importFromInput = vi
      .fn<() => Promise<{ title: string; body: string; sourceUrl: string }>>()
      .mockImplementationOnce(() => firstRequest)
      .mockImplementationOnce(async () => ({
        title: "第二次导入标题",
        body: "第二次导入摘要",
        sourceUrl: "https://example.com/second"
      }));

    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
    }>();

    actions.onBodyInputChange("https://example.com/first");
    await waitUntil(() => {
      expect(importFromInput).toHaveBeenCalledTimes(1);
    });

    const latestActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
    }>();
    latestActions.onBodyInputChange("https://example.com/second");
    await waitUntil(() => {
      expect(importFromInput).toHaveBeenCalledTimes(2);
    });

    resolveFirst({
      title: "第一次导入标题",
      body: "第一次导入摘要",
      sourceUrl: "https://example.com/first"
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          inputText: "第二次导入摘要",
          importedExcerpt: "第二次导入摘要",
          titleText: "第二次导入标题",
          importState: "idle",
          sourceUrl: "https://example.com/second"
        })
      );
    });
  });

  it("preserves global selected pool even when legacy review settings remain enabled", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: true,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialSelectedPoolId: "new-pool-created",
      initialSelectedPoolLabel: "新建池"
    });
    modal.onOpen();

    expect(buildWriteViewStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        selectedPoolId: "new-pool-created",
        selectedPoolLabel: "新建池",
        attachedMediaCount: 0
      })
    );
  });

  it("keeps typing state local and updates render when content kind changes", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(() => new Promise(() => undefined))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global", initialInputText: "初始文本" });
    modal.onOpen();

    const firstActions = renderWriteViewMock.mock.calls[0]?.[2] as {
      onBodyInputChange: (value: string) => void;
      onTitleInputChange: (value: string) => void;
      onCreateFileToggle: (checked: boolean) => void;
    };

    firstActions.onCreateFileToggle(true);

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        createFileChecked: true
      })
    );

    const secondActions = renderWriteViewMock.mock.calls[renderWriteViewMock.mock.calls.length - 1]?.[2] as {
      onBodyInputChange: (value: string) => void;
      onTitleInputChange: (value: string) => void;
    };

    const renderCountBeforeTitleTyping = renderWriteViewMock.mock.calls.length;
    secondActions.onTitleInputChange("手动标题");
    expect((modal as any).runtimeState?.input.title).toBe("手动标题");
    expect(renderWriteViewMock.mock.calls).toHaveLength(renderCountBeforeTitleTyping + 1);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        titleText: "手动标题",
        createFileChecked: true
      })
    );

    const renderCountBeforeTitleClear = renderWriteViewMock.mock.calls.length;
    secondActions.onTitleInputChange("");
    expect((modal as any).runtimeState?.input.title).toBe("");
    expect(renderWriteViewMock.mock.calls).toHaveLength(renderCountBeforeTitleClear + 1);

    const renderCountBeforePlainTyping = renderWriteViewMock.mock.calls.length;
    secondActions.onBodyInputChange("仍然是纯文本内容");
    expect((modal as any).runtimeState?.input.text).toBe("仍然是纯文本内容");
    expect(renderWriteViewMock.mock.calls).toHaveLength(renderCountBeforePlainTyping + 1);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        contentKind: "text",
        inputText: "仍然是纯文本内容",
        titleText: "",
        createFileChecked: true
      })
    );

    secondActions.onBodyInputChange("https://example.com/new-link");
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        contentKind: "link",
        importState: "loading",
        inputText: "",
        sourceUrl: "https://example.com/new-link",
        titleText: "",
        createFileChecked: true
      })
    );

    const latestActions = renderWriteViewMock.mock.calls[renderWriteViewMock.mock.calls.length - 1]?.[2] as {
      onBodyInputChange: (value: string) => void;
    };

    latestActions.onBodyInputChange("https://cdn.example.com/capture.mp4");
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        contentKind: "link",
        importState: "loading",
        inputText: "",
        sourceUrl: "https://cdn.example.com/capture.mp4",
        titleText: "",
        createFileChecked: true
      })
    );
  });

  it("preserves focused body editing when plain typing rerenders quick capture", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(() => new Promise(() => undefined))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const ownerDocument: { activeElement?: unknown } = {};
    let renderedTitleInput:
      | {
          value: string;
          selectionStart: number;
          selectionEnd: number;
          scrollTop: number;
          focus: () => void;
          setSelectionRange: (start: number, end: number) => void;
        }
      | null = null;
    let renderedBodyInput:
      | {
          value: string;
          selectionStart: number;
          selectionEnd: number;
          scrollTop: number;
          focus: () => void;
          setSelectionRange: (start: number, end: number) => void;
        }
      | null = null;

    const createEditableField = (value: string) => {
      const field = {
        value,
        selectionStart: value.length,
        selectionEnd: value.length,
        scrollTop: 0,
        focus() {
          ownerDocument.activeElement = field;
        },
        setSelectionRange(start: number, end: number) {
          field.selectionStart = start;
          field.selectionEnd = end;
        }
      };

      return field;
    };

    renderWriteViewMock.mockImplementation((_mount, state) => {
      ownerDocument.activeElement = null;
      renderedTitleInput = createEditableField(state.titleText ?? "");
      renderedBodyInput = createEditableField(state.inputText ?? "");
    });

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global", initialInputText: "111s" });
    attachModalHost(modal, {
      ownerDocument,
      querySelector(selector: string) {
        if (selector === ".glitter-write-stage__auto-title-text") {
          return renderedTitleInput;
        }

        if (selector === ".glitter-write-stage__body-editor") {
          return renderedBodyInput;
        }

        return null;
      },
      contains(node: unknown) {
        return node === renderedTitleInput || node === renderedBodyInput;
      }
    });

    modal.onOpen();

    const actions = renderWriteViewMock.mock.calls.at(-1)?.[2] as {
      onBodyInputChange: (value: string) => void;
    };
    const firstBodyInput = renderedBodyInput as unknown as {
      value: string;
      selectionStart: number;
      selectionEnd: number;
      scrollTop: number;
      focus: () => void;
      setSelectionRange: (start: number, end: number) => void;
    };

    firstBodyInput.value = "111ss";
    firstBodyInput.selectionStart = 2;
    firstBodyInput.selectionEnd = 2;
    firstBodyInput.scrollTop = 18;
    ownerDocument.activeElement = firstBodyInput;

    actions.onBodyInputChange("111ss");

    const rerenderedBodyInput = renderedBodyInput as unknown as {
      value: string;
      selectionStart: number;
      selectionEnd: number;
      scrollTop: number;
      focus: () => void;
      setSelectionRange: (start: number, end: number) => void;
    };
    expect(rerenderedBodyInput).not.toBe(firstBodyInput);
    expect(ownerDocument.activeElement).toBe(rerenderedBodyInput);
    expect(rerenderedBodyInput.selectionStart).toBe(2);
    expect(rerenderedBodyInput.selectionEnd).toBe(2);
    expect(rerenderedBodyInput.scrollTop).toBe(18);
  });

  it("does not rerender quick capture while body input is composing", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "first-use" });
    attachModalHost(modal);

    modal.onOpen();

    const actions = renderWriteViewMock.mock.calls.at(-1)?.[2] as {
      onBodyInputChange: (value: string, options?: { isComposing?: boolean }) => void;
    };
    const renderCountBeforeComposition = renderWriteViewMock.mock.calls.length;

    actions.onBodyInputChange("ni", { isComposing: true });

    expect((modal as any).runtimeState?.input.text).toBe("ni");
    expect(renderWriteViewMock.mock.calls).toHaveLength(renderCountBeforeComposition);

    actions.onBodyInputChange("你", { isComposing: false });

    expect(renderWriteViewMock.mock.calls).toHaveLength(renderCountBeforeComposition + 1);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        contentKind: "text",
        inputText: "你"
      })
    );
  });

  it("does not rerender quick capture while title input is composing", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        mediaStorageDirectory: "Glitter"
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "first-use" });
    attachModalHost(modal);

    modal.onOpen();

    const actions = renderWriteViewMock.mock.calls.at(-1)?.[2] as {
      onTitleInputChange: (value: string, options?: { isComposing?: boolean }) => void;
    };
    const renderCountBeforeComposition = renderWriteViewMock.mock.calls.length;

    actions.onTitleInputChange("ni", { isComposing: true });

    expect((modal as any).runtimeState?.input.title).toBe("ni");
    expect((modal as any).runtimeState?.input.hasManualTitle).toBe(true);
    expect(renderWriteViewMock.mock.calls).toHaveLength(renderCountBeforeComposition);

    actions.onTitleInputChange("你", { isComposing: false });

    expect(renderWriteViewMock.mock.calls).toHaveLength(renderCountBeforeComposition + 1);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        titleText: "你",
        hasManualTitle: true
      })
    );
  });

  it("does not add media or rerender when attachment picking is cancelled", () => {
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};

    const appendChild = vi.fn((node) => node);
    const remove = vi.fn();
    const addEventListener = vi.fn();
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [],
      addEventListener,
      click,
      remove
    };
    const createElement = vi.fn(() => fileInput);

    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    attachModalHost(modal, {
      ownerDocument: { createElement },
      appendChild
    });

    modal.onOpen();
    const actions = renderWriteViewMock.mock.calls[0]?.[2] as {
      onAttachmentPick: () => void;
    };

    actions.onAttachmentPick();

    expect(createElement).toHaveBeenCalledWith("input");
    expect(click).toHaveBeenCalledTimes(1);
    expect(renderWriteViewMock).toHaveBeenCalledTimes(1);

    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("normalizes picked media into a capped image gallery and previews the current image", async () => {
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};

    const appendChild = vi.fn((node) => node);
    const remove = vi.fn();
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [
        { name: "image-1.png", type: "image/png" },
        { name: "image-2.png", type: "image/png" },
        { name: "image-3.png", type: "image/png" },
        { name: "image-4.png", type: "image/png" },
        { name: "image-5.png", type: "image/png" },
        { name: "image-6.png", type: "image/png" },
        { name: "image-7.png", type: "image/png" },
        { name: "image-8.png", type: "image/png" },
        { name: "clip.mp4", type: "video/mp4" }
      ],
      addEventListener,
      click,
      remove
    };
    const createElement = vi.fn(() => fileInput);

    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((file: Blob | MediaSource) => `blob:${(file as File).name}`);

    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    attachModalHost(modal, {
      ownerDocument: { createElement },
      appendChild
    });

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onAttachmentPick: () => Promise<void> | void;
    }>();

    const pickPromise = actions.onAttachmentPick();
    changeListener?.();
    await pickPromise;
    await waitUntil(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(7);
    });

    expect((modal as any).selectedMedia.map(({ file }: { file: { name: string } }) => file.name)).toEqual([
      "image-1.png",
      "image-2.png",
      "image-3.png",
      "image-4.png",
      "image-5.png",
      "image-6.png",
      "image-7.png"
    ]);
    expect((modal as any).selectedMediaIndex).toBe(0);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachedMediaCount: 7,
        attachedMediaLabels: [
          "image-1.png",
          "image-2.png",
          "image-3.png",
          "image-4.png",
          "image-5.png",
          "image-6.png",
          "image-7.png"
        ],
        attachedMediaPreviewUrl: "blob:image-1.png",
        attachedMediaPreviewKind: "image",
        mediaOverlayMode: "image-gallery",
        selectedMediaIndex: 0,
        canSelectPreviousMedia: false,
        canSelectNextMedia: true,
        canAddMoreImages: false,
        mediaPreviewVisible: false
      })
    );

    const previewActions = await waitForLatestActions<{
      onMediaPreviewOpen: () => void;
      onMediaPreviewClose: () => void;
    }>();

    previewActions.onMediaPreviewOpen();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachedMediaPreviewUrl: "blob:image-1.png",
        attachedMediaPreviewKind: "image",
        mediaOverlayMode: "image-gallery",
        selectedMediaIndex: 0,
        mediaPreviewVisible: true
      })
    );

    previewActions.onMediaPreviewClose();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaPreviewVisible: false
      })
    );

    createObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("navigates an image gallery with non-circular clamping", async () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global", initialHasMedia: true });
    (modal as any).selectedMedia = [
      {
        file: { name: "image-1.png", type: "image/png" },
        previewUrl: "blob:image-1.png",
        previewKind: "image"
      },
      {
        file: { name: "image-2.png", type: "image/png" },
        previewUrl: "blob:image-2.png",
        previewKind: "image"
      },
      {
        file: { name: "image-3.png", type: "image/png" },
        previewUrl: "blob:image-3.png",
        previewKind: "image"
      }
    ];
    (modal as any).selectedMediaIndex = 1;
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onMediaNavigatePrevious: () => void;
      onMediaNavigateNext: () => void;
    }>();

    actions.onMediaNavigatePrevious();
    expect((modal as any).selectedMediaIndex).toBe(0);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedMediaIndex: 0,
        canSelectPreviousMedia: false,
        canSelectNextMedia: true
      })
    );

    actions.onMediaNavigatePrevious();
    expect((modal as any).selectedMediaIndex).toBe(0);

    actions.onMediaNavigateNext();
    actions.onMediaNavigateNext();
    actions.onMediaNavigateNext();
    expect((modal as any).selectedMediaIndex).toBe(2);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedMediaIndex: 2,
        canSelectPreviousMedia: true,
        canSelectNextMedia: false
      })
    );
  });

  it("appends images to an existing gallery up to remaining slots, jumps selection to the first new image, and protects close after a media-only add", async () => {
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};

    const appendChild = vi.fn((node) => node);
    const remove = vi.fn();
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [
        { name: "image-6.png", type: "image/png" },
        { name: "image-7.png", type: "image/png" },
        { name: "image-8.png", type: "image/png" },
        { name: "clip.mp4", type: "video/mp4" }
      ],
      addEventListener,
      click,
      remove
    };
    const createElement = vi.fn(() => fileInput);
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((file: Blob | MediaSource) => `blob:${(file as File).name}`);

    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global", initialHasMedia: true });
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);
    attachModalHost(modal, {
      ownerDocument: { createElement },
      appendChild
    });
    (modal as any).selectedMedia = [
      {
        file: { name: "image-1.png", type: "image/png" },
        previewUrl: "blob:image-1.png",
        previewKind: "image"
      },
      {
        file: { name: "image-2.png", type: "image/png" },
        previewUrl: "blob:image-2.png",
        previewKind: "image"
      },
      {
        file: { name: "image-3.png", type: "image/png" },
        previewUrl: "blob:image-3.png",
        previewKind: "image"
      },
      {
        file: { name: "image-4.png", type: "image/png" },
        previewUrl: "blob:image-4.png",
        previewKind: "image"
      },
      {
        file: { name: "image-5.png", type: "image/png" },
        previewUrl: "blob:image-5.png",
        previewKind: "image"
      }
    ];
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onMediaAddAttachment: () => Promise<void> | void;
    }>();

    const pickPromise = actions.onMediaAddAttachment();
    changeListener?.();
    await pickPromise;
    await waitUntil(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
    });

    expect(fileInput.accept).toBe("image/*");
    expect(fileInput.multiple).toBe(true);
    expect((modal as any).selectedMedia.map(({ file }: { file: { name: string } }) => file.name)).toEqual([
      "image-1.png",
      "image-2.png",
      "image-3.png",
      "image-4.png",
      "image-5.png",
      "image-6.png",
      "image-7.png"
    ]);
    expect((modal as any).selectedMedia.map(({ previewUrl }: { previewUrl?: string }) => previewUrl)).toEqual([
      "blob:image-1.png",
      "blob:image-2.png",
      "blob:image-3.png",
      "blob:image-4.png",
      "blob:image-5.png",
      "blob:image-6.png",
      "blob:image-7.png"
    ]);
    expect((modal as any).selectedMediaIndex).toBe(5);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachedMediaCount: 7,
        attachedMediaLabels: [
          "image-1.png",
          "image-2.png",
          "image-3.png",
          "image-4.png",
          "image-5.png",
          "image-6.png",
          "image-7.png"
        ],
        attachedMediaPreviewUrl: "blob:image-6.png",
        attachedMediaPreviewKind: "image",
        mediaOverlayMode: "image-gallery",
        selectedMediaIndex: 5,
        canSelectPreviousMedia: true,
        canSelectNextMedia: true,
        canAddMoreImages: false
      })
    );

    const dirtyActions = await waitForLatestActions<{
      onClose: () => void;
    }>();
    dirtyActions.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );

    createObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("switches to media mode, preserves typed body text, and protects close after a media-only paste", async () => {
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pasted-image");
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {},
      { flowContext: "global", initialInputText: "已有补充说明" }
    );
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string; getAsFile: () => File | null }>; preventDefault: () => void }) => void;
    }>();
    const preventDefault = vi.fn();
    const pastedFile = { name: "pasted-shot.png", type: "image/png" } as File;

    actions.onBodyPaste({
      text: "",
      items: [{ kind: "file", type: "image/png", getAsFile: () => pastedFile }],
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(createObjectUrlSpy).toHaveBeenCalledWith(pastedFile);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "media",
        inputText: "已有补充说明",
        attachedMediaCount: 1,
        attachedMediaLabels: ["pasted-shot.png"],
        attachedMediaPreviewUrl: "blob:pasted-image",
        attachedMediaPreviewKind: "image"
      })
    );

    const dirtyActions = await waitForLatestActions<{
      onClose: () => void;
    }>();
    dirtyActions.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );

    createObjectUrlSpy.mockRestore();
  });

  it("accumulates pasted images into the same gallery and caps them with the manual-attachment limit", async () => {
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockImplementation((file) => `blob:${(file as File).name}`);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {},
      { flowContext: "global", initialInputText: "已有补充说明" }
    );
    modal.onOpen();

    const firstPasteActions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string; getAsFile: () => File | null }>; preventDefault: () => void }) => void;
    }>();
    const firstPreventDefault = vi.fn();
    const firstPastedImages = [
      { name: "image-1.png", type: "image/png" },
      { name: "image-2.png", type: "image/png" }
    ] as File[];

    firstPasteActions.onBodyPaste({
      text: "",
      items: firstPastedImages.map((file) => ({ kind: "file", type: file.type, getAsFile: () => file })),
      preventDefault: firstPreventDefault
    });

    expect(firstPreventDefault).toHaveBeenCalledTimes(1);
    expect((modal as any).selectedMedia.map(({ file }: { file: { name: string } }) => file.name)).toEqual([
      "image-1.png",
      "image-2.png"
    ]);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "media",
        inputText: "已有补充说明",
        attachedMediaCount: 2,
        attachedMediaLabels: ["image-1.png", "image-2.png"],
        attachedMediaPreviewUrl: "blob:image-1.png",
        attachedMediaPreviewKind: "image",
        mediaOverlayMode: "image-gallery",
        selectedMediaIndex: 0,
        canSelectPreviousMedia: false,
        canSelectNextMedia: true,
        canAddMoreImages: true
      })
    );

    const secondPasteActions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string; getAsFile: () => File | null }>; preventDefault: () => void }) => void;
    }>();
    const secondPreventDefault = vi.fn();
    const secondPastedImages = [
      { name: "image-3.png", type: "image/png" },
      { name: "image-4.png", type: "image/png" },
      { name: "image-5.png", type: "image/png" },
      { name: "image-6.png", type: "image/png" },
      { name: "image-7.png", type: "image/png" },
      { name: "image-8.png", type: "image/png" }
    ] as File[];

    secondPasteActions.onBodyPaste({
      text: "",
      items: secondPastedImages.map((file) => ({ kind: "file", type: file.type, getAsFile: () => file })),
      preventDefault: secondPreventDefault
    });

    expect(secondPreventDefault).toHaveBeenCalledTimes(1);
    expect((modal as any).selectedMedia.map(({ file }: { file: { name: string } }) => file.name)).toEqual([
      "image-1.png",
      "image-2.png",
      "image-3.png",
      "image-4.png",
      "image-5.png",
      "image-6.png",
      "image-7.png"
    ]);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachedMediaCount: 7,
        attachedMediaLabels: [
          "image-1.png",
          "image-2.png",
          "image-3.png",
          "image-4.png",
          "image-5.png",
          "image-6.png",
          "image-7.png"
        ],
        attachedMediaPreviewUrl: "blob:image-3.png",
        attachedMediaPreviewKind: "image",
        mediaOverlayMode: "image-gallery",
        selectedMediaIndex: 2,
        canSelectPreviousMedia: true,
        canSelectNextMedia: true,
        canAddMoreImages: false
      })
    );

    createObjectUrlSpy.mockRestore();
  });

  it("keeps the image gallery at the same cap when pasted images exceed the attachment limit", async () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global", initialHasMedia: true });
    const showSpy = vi.spyOn((modal as any).toastService, "show");
    (modal as any).selectedMedia = Array.from({ length: 7 }, (_, index) => ({
      file: { name: `image-${index + 1}.png`, type: "image/png" },
      previewUrl: `blob:image-${index + 1}.png`,
      previewKind: "image"
    }));
    (modal as any).selectedMediaIndex = 6;
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string; getAsFile: () => File | null }>; preventDefault: () => void }) => void;
    }>();
    const preventDefault = vi.fn();
    const pastedFile = { name: "image-8.png", type: "image/png" } as File;

    actions.onBodyPaste({
      text: "",
      items: [{ kind: "file", type: "image/png", getAsFile: () => pastedFile }],
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(showSpy).toHaveBeenCalledWith({
      status: "info",
      message: "当前灵感最多只能附加 7 张图片"
    });
    expect((modal as any).selectedMedia.map(({ file }: { file: { name: string } }) => file.name)).toEqual([
      "image-1.png",
      "image-2.png",
      "image-3.png",
      "image-4.png",
      "image-5.png",
      "image-6.png",
      "image-7.png"
    ]);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachedMediaCount: 7,
        attachedMediaLabels: [
          "image-1.png",
          "image-2.png",
          "image-3.png",
          "image-4.png",
          "image-5.png",
          "image-6.png",
          "image-7.png"
        ],
        attachedMediaPreviewUrl: "blob:image-7.png",
        attachedMediaPreviewKind: "image",
        mediaOverlayMode: "image-gallery",
        selectedMediaIndex: 6,
        canAddMoreImages: false
      })
    );
  });

  it("keeps note text in body and moves the link into attachment metadata after paste", async () => {
    const importFromInput = vi.fn(async () => ({
      title: "导入标题",
      body: "导入摘要",
      sourceUrl: "https://example.com/article"
    }));
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {},
      { flowContext: "global", initialInputText: "已有判断" }
    );
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
    }>();
    const preventDefault = vi.fn();

    actions.onBodyPaste({
      text: "https://example.com/article",
      items: [{ kind: "string", type: "text/plain" }],
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitUntil(() => {
      expect(importFromInput).toHaveBeenCalledWith("https://example.com/article");
    });
    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "已有判断\n\n导入摘要",
          importedExcerpt: "导入摘要",
          titleText: "导入标题",
          hasManualTitle: false,
          importState: "idle",
          sourceUrl: "https://example.com/article"
        })
      );
    });
  });

  it("asks before appending a second pasted link and keeps it as plain text", async () => {
    const originalConfirm = (globalThis as { confirm?: (message: string) => boolean }).confirm;
    const confirm = vi.fn(() => true);
    (globalThis as { confirm?: (message: string) => boolean }).confirm = confirm;

    try {
      const importFromInput = vi.fn(async (input: string) => ({
        title: input.includes("first") ? "首条导入标题" : "第二条导入标题",
        body: input.includes("first") ? "首条导入摘要" : "第二条导入摘要",
        sourceUrl: input
      }));
      const plugin = {
        app: {},
        settings: {
          enableDesignReviewMode: false,
          reviewScenario: "quick-capture-global-default",
          mediaStorageDirectory: "Glitter"
        },
        quickCaptureWorkflow: {
          saveGlobalDraft: vi.fn(async () => undefined),
          listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
        },
        linkImportService: {
          importFromInput
        },
        firstUseWorkflow: {
          stageFirstIdeaDraft: vi.fn(async () => undefined)
        }
      };

      buildWriteViewStateMock.mockImplementation((state) => state);

      const modal = new QuickCaptureModal(
        plugin as any,
        "capture",
        {},
        { flowContext: "global", initialInputText: "已有判断" }
      );
      modal.onOpen();

      const firstActions = await waitForLatestActions<{
        onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
      }>();
      const firstPreventDefault = vi.fn();

      firstActions.onBodyPaste({
        text: "https://example.com/first",
        items: [{ kind: "string", type: "text/plain" }],
        preventDefault: firstPreventDefault
      });

      expect(firstPreventDefault).toHaveBeenCalledTimes(1);
      await waitUntil(() => {
        expect(importFromInput).toHaveBeenCalledTimes(1);
      });
      await waitUntil(() => {
        expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
          expect.objectContaining({
            contentKind: "link",
            inputText: "已有判断\n\n首条导入摘要",
            importedExcerpt: "首条导入摘要",
            titleText: "首条导入标题",
            importState: "idle",
            sourceUrl: "https://example.com/first"
          })
        );
      });

      const secondActions = await waitForLatestActions<{
        onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
      }>();
      const secondPreventDefault = vi.fn();

      secondActions.onBodyPaste({
        text: "https://example.com/second",
        items: [{ kind: "string", type: "text/plain" }],
        preventDefault: secondPreventDefault
      });

      expect(confirm).toHaveBeenCalledWith("第二条链接将不会自动识别内容，是否添加到本条灵感？");
      expect(secondPreventDefault).toHaveBeenCalledTimes(1);
      expect(importFromInput).toHaveBeenCalledTimes(1);
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "已有判断\n\n首条导入摘要\n\nhttps://example.com/second",
          importedExcerpt: "首条导入摘要",
          titleText: "首条导入标题",
          importState: "idle",
          sourceUrl: "https://example.com/first"
        })
      );
    } finally {
      if (originalConfirm) {
        (globalThis as { confirm?: (message: string) => boolean }).confirm = originalConfirm;
      } else {
        delete (globalThis as { confirm?: (message: string) => boolean }).confirm;
      }
    }
  });


  it("keeps loading state and preserves note edits during pasted link import", async () => {
    let resolveImport!: (value: { title: string; body: string; sourceUrl: string }) => void;
    const importFromInput = vi.fn<() => Promise<{ title: string; body: string; sourceUrl: string }>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {},
      { flowContext: "global", initialInputText: "已有判断" }
    );
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
    }>();
    const preventDefault = vi.fn();

    actions.onBodyPaste({
      text: "https://example.com/article",
      items: [{ kind: "string", type: "text/plain" }],
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitUntil(() => {
      expect(importFromInput).toHaveBeenCalledWith("https://example.com/article");
    });
    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "已有判断",
          importState: "loading",
          sourceUrl: "https://example.com/article"
        })
      );
    });

    const editActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
    }>();
    editActions.onBodyInputChange("已有判断\n\n我自己的补充判断");

    expect((modal as any).runtimeState?.input.text).toBe("已有判断\n\n我自己的补充判断");
    expect((modal as any).runtimeState?.input.importState).toBe("loading");
    expect((modal as any).runtimeState?.input.sourceUrl).toBe("https://example.com/article");

    resolveImport({
      title: "导入标题",
      body: "导入摘要",
      sourceUrl: "https://example.com/article"
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "已有判断\n\n我自己的补充判断\n\n导入摘要",
          importedExcerpt: "导入摘要",
          titleText: "导入标题",
          importState: "idle",
          sourceUrl: "https://example.com/article"
        })
      );
    });
  });

  it("does not restore cleared note text when a pasted link import finishes", async () => {
    let resolveImport!: (value: { title: string; body: string; sourceUrl: string }) => void;
    const importFromInput = vi.fn<() => Promise<{ title: string; body: string; sourceUrl: string }>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {},
      { flowContext: "global", initialInputText: "已有判断" }
    );
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
    }>();
    const preventDefault = vi.fn();

    actions.onBodyPaste({
      text: "https://example.com/article",
      items: [{ kind: "string", type: "text/plain" }],
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitUntil(() => {
      expect(importFromInput).toHaveBeenCalledWith("https://example.com/article");
    });

    const editActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
    }>();
    editActions.onBodyInputChange("");

    expect((modal as any).runtimeState?.input.text).toBe("");
    expect((modal as any).runtimeState?.input.importState).toBe("loading");
    expect((modal as any).runtimeState?.input.sourceUrl).toBe("https://example.com/article");

    resolveImport({
      title: "导入标题",
      body: "导入摘要",
      sourceUrl: "https://example.com/article"
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "",
          importedExcerpt: "导入摘要",
          titleText: "导入标题",
          importState: "idle",
          sourceUrl: "https://example.com/article"
        })
      );
    });
  });

  it("keeps link attachment metadata after editing imported body text", async () => {
    const saveGlobalDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async () => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: "https://example.com/article"
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global", initialInputText: "已有判断" });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();

    const pasteActions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
    }>();
    const preventDefault = vi.fn();

    pasteActions.onBodyPaste({
      text: "https://example.com/article",
      items: [{ kind: "string", type: "text/plain" }],
      preventDefault
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "已有判断\n\n导入摘要",
          importedExcerpt: "导入摘要",
          sourceUrl: "https://example.com/article"
        })
      );
    });

    const editActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
      onSubmit: () => void;
    }>();
    editActions.onBodyInputChange("已有判断\n\n我自己的补充判断");

    expect((modal as any).runtimeState?.input.text).toBe("已有判断\n\n我自己的补充判断");
    expect((modal as any).runtimeState?.input.importedExcerpt).toBe("导入摘要");
    expect((modal as any).runtimeState?.input.sourceUrl).toBe("https://example.com/article");

    const submitActions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();
    submitActions.onSubmit();

    await waitUntil(() => {
      expect(saveGlobalDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: "link",
          body: "已有判断\n\n我自己的补充判断",
          sourceUrl: "https://example.com/article"
        })
      );
    });
  });

  it("keeps link mode and shows guidance when an image is pasted into a link idea", async () => {
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:blocked-image");
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {},
      { flowContext: "global", initialInputText: "https://example.com/article" }
    );
    const showSpy = vi.spyOn((modal as any).toastService, "show");

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string; getAsFile: () => File | null }>; preventDefault: () => void }) => void;
    }>();
    const preventDefault = vi.fn();
    const pastedFile = { name: "pasted-shot.png", type: "image/png" } as File;

    actions.onBodyPaste({
      text: "",
      items: [{ kind: "file", type: "image/png", getAsFile: () => pastedFile }],
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(showSpy).toHaveBeenCalledWith({
      status: "info",
      message: "当前灵感已是链接类型，如需记录图片请新建一条灵感"
    });
    expect(createObjectUrlSpy).not.toHaveBeenCalled();
    expect((modal as any).selectedMedia).toEqual([]);
    expect((modal as any).runtimeState.input.hasMedia).not.toBe(true);

    createObjectUrlSpy.mockRestore();
  });

  it("keeps pasted links as supplementary text when the idea is already in media mode", async () => {
    const importFromInput = vi.fn(async (input: string) => ({
      title: "导入标题",
      body: "导入摘要",
      sourceUrl: input
    }));
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {},
      {
        flowContext: "global",
        initialInputText: "已有补充说明",
        initialHasMedia: true
      }
    );

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
      onBodyInputChange: (value: string) => void;
    }>();
    const preventDefault = vi.fn();

    actions.onBodyPaste({
      text: "https://example.com/extra",
      items: [{ kind: "string", type: "text/plain" }],
      preventDefault
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(importFromInput).not.toHaveBeenCalled();

    actions.onBodyInputChange("已有补充说明\n\nhttps://example.com/extra");

    expect((modal as any).runtimeState.input.text).toBe("已有补充说明\n\nhttps://example.com/extra");
    expect((modal as any).runtimeState.input.hasMedia).toBe(true);
    expect((modal as any).runtimeState.input.sourceUrl).toBeUndefined();
    expect((modal as any).runtimeState.input.importState ?? "idle").toBe("idle");
  });

  it("keeps a second typed URL as note text after a primary link is already imported", async () => {
    const importFromInput = vi.fn(async (input: string) => ({
      title: "导入标题",
      body: "导入摘要",
      sourceUrl: input
    }));
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
      onBodyInputChange: (value: string) => void;
    }>();
    const preventDefault = vi.fn();

    actions.onBodyPaste({
      text: "https://example.com/article",
      items: [{ kind: "string", type: "text/plain" }],
      preventDefault
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "导入摘要",
          importedExcerpt: "导入摘要",
          sourceUrl: "https://example.com/article"
        })
      );
    });

    const followupActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
    }>();
    followupActions.onBodyInputChange("https://example.com/second");

    expect(importFromInput).toHaveBeenCalledTimes(1);
    expect((modal as any).runtimeState.input.text).toBe("https://example.com/second");
    expect((modal as any).runtimeState.input.importedExcerpt).toBe("导入摘要");
    expect((modal as any).runtimeState.input.sourceUrl).toBe("https://example.com/article");
  });

  it("removes a loaded link attachment and reverts the modal back to text mode", async () => {
    const importFromInput = vi.fn(async (input: string) => ({
      title: "导入标题",
      body: "导入摘要",
      sourceUrl: input
    }));
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
    }>();
    actions.onBodyPaste({
      text: "https://example.com/article",
      items: [{ kind: "string", type: "text/plain" }],
      preventDefault: vi.fn()
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "导入摘要",
          sourceUrl: "https://example.com/article",
          importedExcerpt: "导入摘要"
        })
      );
    });

    const removalActions = await waitForLatestActions<{
      onRemoveLinkAttachment: () => void;
    }>();
    removalActions.onRemoveLinkAttachment();

    expect((modal as any).primaryPastedLink).toBeNull();
    expect((modal as any).linkImportRequestState).toBeNull();
    expect((modal as any).runtimeState.input.sourceUrl).toBeUndefined();
    expect((modal as any).runtimeState.input.importedExcerpt).toBeUndefined();
    expect((modal as any).runtimeState.input.importState ?? "idle").toBe("idle");
    expect((modal as any).runtimeState.input.text).toBe("导入摘要");
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "text",
        sourceUrl: undefined,
        importedExcerpt: undefined,
        inputText: "导入摘要"
      })
    );
  });

  it("keeps text mode after removing a link attachment even when the preserved body still contains urls", async () => {
    const importFromInput = vi.fn(async (input: string) => ({
      title: "导入标题",
      body: "导入摘要 https://docs.example.com/reference",
      sourceUrl: input
    }));
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
    }>();
    actions.onBodyPaste({
      text: "https://example.com/article",
      items: [{ kind: "string", type: "text/plain" }],
      preventDefault: vi.fn()
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          inputText: "导入摘要 https://docs.example.com/reference",
          sourceUrl: "https://example.com/article"
        })
      );
    });

    const removalActions = await waitForLatestActions<{
      onRemoveLinkAttachment: () => void;
    }>();
    removalActions.onRemoveLinkAttachment();

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "text",
        sourceUrl: undefined,
        importedExcerpt: undefined,
        inputText: "导入摘要 https://docs.example.com/reference"
      })
    );
  });

  it("removes only the current media item, revokes its preview, and clamps the current selection", async () => {
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global", initialHasMedia: true });
    (modal as any).selectedMedia = [
      {
        file: { name: "image-1.png", type: "image/png" },
        previewUrl: "blob:image-1.png",
        previewKind: "image"
      },
      {
        file: { name: "image-2.png", type: "image/png" },
        previewUrl: "blob:image-2.png",
        previewKind: "image"
      }
    ];
    (modal as any).selectedMediaIndex = 1;
    modal.onOpen();

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "media",
          attachedMediaCount: 2,
          attachedMediaLabels: ["image-1.png", "image-2.png"],
          attachedMediaPreviewUrl: "blob:image-2.png",
          attachedMediaPreviewKind: "image",
          mediaOverlayMode: "image-gallery",
          selectedMediaIndex: 1,
          canSelectPreviousMedia: true,
          canSelectNextMedia: false,
          canAddMoreImages: true
        })
      );
    });

    const removalActions = await waitForLatestActions<{
      onRemoveMediaAttachment: () => void;
    }>();
    removalActions.onRemoveMediaAttachment();

    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:image-2.png");
    expect((modal as any).selectedMedia.map(({ file }: { file: { name: string } }) => file.name)).toEqual(["image-1.png"]);
    expect((modal as any).selectedMediaIndex).toBe(0);
    expect((modal as any).runtimeState.input.hasMedia).toBe(true);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachedMediaCount: 1,
        attachedMediaLabels: ["image-1.png"],
        attachedMediaPreviewUrl: "blob:image-1.png",
        attachedMediaPreviewKind: "image",
        mediaOverlayMode: "image-gallery",
        selectedMediaIndex: 0,
        canSelectPreviousMedia: false,
        canSelectNextMedia: false,
        canAddMoreImages: true
      })
    );

    revokeObjectUrlSpy.mockRestore();
  });

  it("replaces the current image without changing gallery length or index, revokes only the replaced preview, and protects close after a media-only replace", async () => {
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};

    const appendChild = vi.fn((node) => node);
    const remove = vi.fn();
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: true,
      style: { display: "" },
      files: [{ name: "image-replaced.png", type: "image/png" }],
      addEventListener,
      click,
      remove
    };
    const createElement = vi.fn(() => fileInput);
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image-replaced.png");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global", initialHasMedia: true });
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);
    attachModalHost(modal, {
      ownerDocument: { createElement },
      appendChild
    });
    (modal as any).selectedMedia = [
      {
        file: { name: "image-1.png", type: "image/png" },
        previewUrl: "blob:image-1.png",
        previewKind: "image"
      },
      {
        file: { name: "image-2.png", type: "image/png" },
        previewUrl: "blob:image-2.png",
        previewKind: "image"
      },
      {
        file: { name: "image-3.png", type: "image/png" },
        previewUrl: "blob:image-3.png",
        previewKind: "image"
      }
    ];
    (modal as any).selectedMediaIndex = 1;
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onMediaReplaceAttachment: () => Promise<void> | void;
    }>();

    const pickPromise = actions.onMediaReplaceAttachment();
    changeListener?.();
    await pickPromise;
    await waitUntil(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    });

    expect(fileInput.accept).toBe("image/*");
    expect(fileInput.multiple).toBe(false);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:image-2.png");
    expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith("blob:image-1.png");
    expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith("blob:image-3.png");
    expect((modal as any).selectedMedia.map(({ file }: { file: { name: string } }) => file.name)).toEqual([
      "image-1.png",
      "image-replaced.png",
      "image-3.png"
    ]);
    expect((modal as any).selectedMedia.map(({ previewUrl }: { previewUrl?: string }) => previewUrl)).toEqual([
      "blob:image-1.png",
      "blob:image-replaced.png",
      "blob:image-3.png"
    ]);
    expect((modal as any).selectedMediaIndex).toBe(1);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachedMediaCount: 3,
        attachedMediaLabels: ["image-1.png", "image-replaced.png", "image-3.png"],
        attachedMediaPreviewUrl: "blob:image-replaced.png",
        attachedMediaPreviewKind: "image",
        mediaOverlayMode: "image-gallery",
        selectedMediaIndex: 1,
        canSelectPreviousMedia: true,
        canSelectNextMedia: true,
        canAddMoreImages: true
      })
    );

    const dirtyActions = await waitForLatestActions<{
      onClose: () => void;
    }>();
    dirtyActions.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("replaces the current video while keeping single-video mode", async () => {
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};

    const appendChild = vi.fn((node) => node);
    const remove = vi.fn();
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: true,
      style: { display: "" },
      files: [
        { name: "clip-replaced.mp4", type: "video/mp4" },
        { name: "ignored-image.png", type: "image/png" }
      ],
      addEventListener,
      click,
      remove
    };
    const createElement = vi.fn(() => fileInput);
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:clip-replaced.mp4");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global", initialHasMedia: true });
    attachModalHost(modal, {
      ownerDocument: { createElement },
      appendChild
    });
    (modal as any).selectedMedia = [
      {
        file: { name: "clip.mp4", type: "video/mp4" },
        previewUrl: "blob:clip.mp4",
        previewKind: "video"
      }
    ];
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onMediaReplaceAttachment: () => Promise<void> | void;
    }>();

    const pickPromise = actions.onMediaReplaceAttachment();
    changeListener?.();
    await pickPromise;
    await waitUntil(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    });

    expect(fileInput.accept).toBe("video/*");
    expect(fileInput.multiple).toBe(false);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:clip.mp4");
    expect((modal as any).selectedMedia.map(({ file }: { file: { name: string } }) => file.name)).toEqual([
      "clip-replaced.mp4"
    ]);
    expect((modal as any).selectedMediaIndex).toBe(0);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachedMediaCount: 1,
        attachedMediaLabels: ["clip-replaced.mp4"],
        attachedMediaPreviewUrl: "blob:clip-replaced.mp4",
        attachedMediaPreviewKind: "video",
        mediaOverlayMode: "video",
        selectedMediaIndex: 0,
        canSelectPreviousMedia: false,
        canSelectNextMedia: false,
        canAddMoreImages: false
      })
    );

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("clears stale link metadata when picked media replaces a link attachment", async () => {
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};

    const appendChild = vi.fn((node) => node);
    const remove = vi.fn();
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [{ name: "picked-image.png", type: "image/png" }],
      addEventListener,
      click,
      remove
    };
    const createElement = vi.fn(() => fileInput);
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:picked-image");

    const importFromInput = vi.fn(async (input: string) => ({
      title: "导入标题",
      body: "导入摘要",
      sourceUrl: input
    }));
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    attachModalHost(modal, {
      ownerDocument: { createElement },
      appendChild
    });
    modal.onOpen();

    const pasteActions = await waitForLatestActions<{
      onBodyPaste: (payload: { text: string; items: Array<{ kind: string; type: string }>; preventDefault: () => void }) => void;
    }>();
    pasteActions.onBodyPaste({
      text: "https://example.com/article",
      items: [{ kind: "string", type: "text/plain" }],
      preventDefault: vi.fn()
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "link",
          sourceUrl: "https://example.com/article",
          importedExcerpt: "导入摘要"
        })
      );
    });

    const pickActions = await waitForLatestActions<{
      onAttachmentPick: () => Promise<void> | void;
    }>();
    pickActions.onAttachmentPick();
    changeListener?.();
    await waitUntil(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    });

    expect((modal as any).primaryPastedLink).toBeNull();
    expect((modal as any).linkImportRequestState).toBeNull();
    expect((modal as any).runtimeState.input.sourceUrl).toBeUndefined();
    expect((modal as any).runtimeState.input.importedExcerpt).toBeUndefined();
    expect((modal as any).runtimeState.input.suspendInlineUrlAutoDetection).toBe(true);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "media",
        sourceUrl: undefined,
        importedExcerpt: undefined,
        attachedMediaCount: 1,
        attachedMediaLabels: ["picked-image.png"]
      })
    );

    createObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("removes loaded media, clears stale link state, reverts the modal back to text mode, and protects close after a media-only removal", async () => {
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialHasMedia: true,
      initialInputText: "保留正文 https://docs.example.com/reference"
    });
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);
    (modal as any).selectedMedia = [
      {
        file: { name: "shot.png", type: "image/png" },
        previewUrl: "blob:image-preview",
        previewKind: "image"
      }
    ];
    modal.onOpen();
    (modal as any).runtimeState = {
      ...(modal as any).runtimeState,
      input: {
        ...(modal as any).runtimeState.input,
        sourceUrl: "https://example.com/article",
        importedExcerpt: "导入摘要",
        suspendInlineUrlAutoDetection: false
      }
    };
    (modal as any).renderCurrentState();

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentKind: "media",
          attachedMediaCount: 1,
          attachedMediaLabels: ["shot.png"],
          sourceUrl: "https://example.com/article",
          importedExcerpt: "导入摘要"
        })
      );
    });

    const removalActions = await waitForLatestActions<{
      onRemoveMediaAttachment: () => void;
    }>();
    removalActions.onRemoveMediaAttachment();

    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:image-preview");
    expect((modal as any).selectedMedia).toEqual([]);
    expect((modal as any).runtimeState.input.hasMedia).toBe(false);
    expect((modal as any).runtimeState.input.sourceUrl).toBeUndefined();
    expect((modal as any).runtimeState.input.importedExcerpt).toBeUndefined();
    expect((modal as any).runtimeState.input.suspendInlineUrlAutoDetection).toBe(true);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "text",
        sourceUrl: undefined,
        importedExcerpt: undefined,
        inputText: "保留正文 https://docs.example.com/reference",
        attachedMediaCount: 0,
        attachedMediaLabels: []
      })
    );

    const dirtyActions = await waitForLatestActions<{
      onClose: () => void;
    }>();
    dirtyActions.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );

    revokeObjectUrlSpy.mockRestore();
  });

  it("does not submit link save while import is still loading", async () => {
    let resolveImport!: (value: { title: string; body: string; sourceUrl: string }) => void;
    const importFromInput = vi.fn<() => Promise<{ title: string; body: string; sourceUrl: string }>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );
    const saveGlobalDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
      onSubmit: () => void;
    }>();

    actions.onBodyInputChange("https://example.com/article");

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          importState: "loading",
          sourceUrl: "https://example.com/article"
        })
      );
    });

    const submitActions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();
    submitActions.onSubmit();

    expect(saveGlobalDraft).not.toHaveBeenCalled();

    resolveImport({
      title: "导入标题",
      body: "导入摘要",
      sourceUrl: "https://example.com/article"
    });

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          importState: "idle",
          importedExcerpt: "导入摘要"
        })
      );
    });
  });

  it("protects close after a media-only attachment pick and still revokes object URLs when the modal closes", async () => {
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};

    const appendChild = vi.fn((node) => node);
    const remove = vi.fn();
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [{ name: "cover.png", type: "image/png" }],
      addEventListener,
      click,
      remove
    };
    const createElement = vi.fn(() => fileInput);

    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image-preview");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);
    attachModalHost(modal, {
      ownerDocument: { createElement },
      appendChild
    });

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onAttachmentPick: () => void;
      onMediaPreviewOpen: () => void;
      onClose: () => void;
    }>();

    actions.onAttachmentPick();
    changeListener?.();
    await waitUntil(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    });
    actions.onMediaPreviewOpen();
    actions.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaPreviewVisible: false,
        closeConfirmVisible: false
      })
    );

    const dirtyActions = await waitForLatestActions<{
      onClose: () => void;
    }>();
    dirtyActions.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );

    modal.onClose();

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:image-preview");

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("routes global saved-feedback submit/secondary/close actions distinctly in close-first order", () => {
    const calls: string[] = [];
    const onSaved = vi.fn((selection?: { poolId?: string; poolLabel?: string; createFileChecked?: boolean }) => {
      calls.push(`continue:${selection?.poolLabel ?? "none"}:${selection?.createFileChecked ? "file" : "draft"}`);
    });
    const onBackHome = vi.fn(() => {
      calls.push("enter-main");
    });
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "pool-research", label: "调研池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockReturnValue({ shell: "quick-capture" });

    const modal = new QuickCaptureModal(
      plugin as any,
      "saved-feedback",
      {
        onSaved,
        onBackHome
      },
      {
        flowContext: "global",
        initialInputText: "全局快速记录标题。第二句不参与标题",
        initialCreateFileChecked: true,
        initialSelectedPoolId: "pool-research",
        initialSelectedPoolLabel: "调研池"
      }
    );
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      calls.push("close");
    });

    modal.onOpen();

    expect(buildWriteViewStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "saved-feedback",
        generatedTitle: expect.stringMatching(/^灵感 \d{2}-\d{2} \d{2}:\d{2}$/)
      })
    );

    const actions = renderWriteViewMock.mock.calls[0]?.[2] as {
      onSubmit: () => void;
      onSecondaryAction: () => void;
      onClose: () => void;
    };

    actions.onSubmit();
    actions.onSecondaryAction();
    actions.onClose();

    expect(onBackHome).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["close", "enter-main", "close", "continue:none:draft", "close"]);
  });

  it("handles global saved-feedback secondary action through the extracted helper in close-first order", () => {
    const calls: string[] = [];
    const onSaved = vi.fn(() => {
      calls.push("saved");
    });
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    const modal = new QuickCaptureModal(plugin as any, "saved-feedback", { onSaved }, { flowContext: "global" });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      calls.push("close");
    });

    expect(typeof (modal as any).handleSavedFeedbackSecondaryAction).toBe("function");

    (modal as any).handleSavedFeedbackSecondaryAction();

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith();
    expect(calls).toEqual(["close", "saved"]);
  });

  it("keeps first-use text title on its dedicated default instead of body text", async () => {
    const stageFirstIdeaDraft = vi.fn(async () => undefined);
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-first-use-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(
      plugin as any,
      "capture",
      {},
      {
        flowContext: "first-use",
        initialInputText: "正文第一句不能再覆盖默认标题"
      }
    );
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);
    attachModalHost(modal);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();

    actions.onSubmit();

    await waitUntil(() => {
      expect(stageFirstIdeaDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "我的第一条灵感",
          body: "正文第一句不能再覆盖默认标题",
          contentType: "text"
        })
      );
    });
  });

  it("renders safe global pool options before async global pools load", async () => {
    let resolvePools!: (value: Array<{ id: string; label: string }>) => void;
    const listGlobalPoolOptions = vi.fn(
      () =>
        new Promise<Array<{ id: string; label: string }>>((resolve) => {
          resolvePools = resolve;
        })
    );

    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    modal.onOpen();

    const firstRenderState = buildWriteViewStateMock.mock.calls[0]?.[0] as {
      poolOptions: Array<{ id: string }>;
    };
    expect(firstRenderState.poolOptions.map((option) => option.id)).toEqual([
      "pool-default",
      "create-new-pool"
    ]);

    resolvePools([
      { id: "pool-default", label: "默认池" },
      { id: "pool-lab", label: "实验池" }
    ]);

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          poolOptions: [
            { id: "pool-default", label: "默认池" },
            { id: "pool-lab", label: "实验池" },
            { id: "create-new-pool", label: "新建池" }
          ]
        })
      );
    });
  });

  it("keeps provided global selected pool after async refresh when option remains valid", async () => {
    let resolvePools!: (value: Array<{ id: string; label: string }>) => void;
    const listGlobalPoolOptions = vi.fn(
      () =>
        new Promise<Array<{ id: string; label: string }>>((resolve) => {
          resolvePools = resolve;
        })
    );

    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialSelectedPoolId: "pool-research",
      initialSelectedPoolLabel: "调研池"
    });
    modal.onOpen();

    resolvePools([
      { id: "pool-default", label: "默认池" },
      { id: "pool-research", label: "调研池" }
    ]);

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedPoolId: "pool-research",
          selectedPoolLabel: "调研池"
        })
      );
    });
  });

  it("does not fall back to a nonexistent default pool id when runtime pools differ", async () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-lab", label: "实验池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    modal.onOpen();

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedPoolId: "pool-lab",
          selectedPoolLabel: "实验池",
          poolOptions: [
            { id: "pool-lab", label: "实验池" },
            { id: "create-new-pool", label: "新建池" }
          ]
        })
      );
    });
  });

  it("keeps create-new-pool sentinel unique when global options already include it", async () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [
          { id: "pool-default", label: "默认池" },
          { id: "create-new-pool", label: "新建池" },
          { id: "pool-lab", label: "实验池" },
          { id: "create-new-pool", label: "新建池" }
        ])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    modal.onOpen();

    await waitUntil(() => {
      const latestState = buildWriteViewStateMock.mock.calls.at(-1)?.[0] as
        | { poolOptions?: Array<{ id: string }> }
        | undefined;
      const poolOptionIds = latestState?.poolOptions?.map((option) => option.id) ?? [];

      expect(poolOptionIds).toContain("pool-lab");
      expect(poolOptionIds.filter((id) => id === "create-new-pool")).toHaveLength(1);
    });
  });

  it("saves media under media root images/<pool>/ and keeps per-folder unique naming", async () => {
    const folders = new Set<string>();
    const files = new Set<string>(["Glitter/images/123/DSC01475.png"]);
    const getAbstractFileByPath = vi.fn((path: string) => {
      if (folders.has(path)) {
        return { children: [] };
      }
      if (files.has(path)) {
        return { path };
      }
      return null;
    });
    const createFolder = vi.fn(async (path: string) => {
      folders.add(path);
    });
    const createBinary = vi.fn(async (path: string) => {
      files.add(path);
    });

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath,
          createFolder,
          createBinary
        }
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    (modal as any).runtimeState = {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "",
        selectedPoolLabel: "123"
      }
    };
    (modal as any).selectedMedia = [
      {
        file: {
          name: "DSC01475.png",
          arrayBuffer: async () => new ArrayBuffer(1)
        }
      }
    ];

    const savedPaths = await (modal as any).saveSelectedMediaFiles();

    expect(savedPaths).toEqual(["Glitter/images/123/DSC01475-1.png"]);
    expect(createBinary).toHaveBeenCalledWith("Glitter/images/123/DSC01475-1.png", expect.any(ArrayBuffer));
    expect(createFolder).toHaveBeenCalledWith("Glitter");
    expect(createFolder).toHaveBeenCalledWith("Glitter/images");
    expect(createFolder).toHaveBeenCalledWith("Glitter/images/123");
  });

  it("sanitizes pool folder names when saving media", async () => {
    const folders = new Set<string>();
    const getAbstractFileByPath = vi.fn((path: string) => {
      if (folders.has(path)) {
        return { children: [] };
      }
      return null;
    });
    const createFolder = vi.fn(async (path: string) => {
      folders.add(path);
    });
    const createBinary = vi.fn(async () => undefined);

    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath,
          createFolder,
          createBinary
        }
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    (modal as any).runtimeState = {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "",
        selectedPoolLabel: "研发/池:*?"
      }
    };
    (modal as any).selectedMedia = [
      {
        file: {
          name: "shot.png",
          arrayBuffer: async () => new ArrayBuffer(1)
        }
      }
    ];

    const savedPaths = await (modal as any).saveSelectedMediaFiles();

    expect(savedPaths).toEqual(["Glitter/images/研发-池---/shot.png"]);
  });

  it("transitions global submit failures into save-failed state instead of showing a toast", async () => {
    let rejectSave!: (error: Error) => void;
    const saveGlobalDraft = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        })
    );
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "用于失败态测试的内容"
    });
    const showSpy = vi.spyOn((modal as any).toastService, "show");
    const closeSpy = vi
      .spyOn(modal as unknown as { close: () => void }, "close")
      .mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onSubmit: () => void;
      onClose: () => void;
    }>();

    actions.onSubmit();

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          flowContext: "global",
          phase: "saving"
        })
      );
    });

    const savingActions = await waitForLatestActions<{
      onClose: () => void;
    }>();
    savingActions.onClose();
    expect(closeSpy).not.toHaveBeenCalled();

    rejectSave(new Error("保存灵感失败"));

    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          flowContext: "global",
          phase: "save-failed"
        })
      );
    });
    expect(showSpy).not.toHaveBeenCalled();

    const failedActions = await waitForLatestActions<{
      onClose: () => void;
      onSecondaryAction: () => void;
    }>();

    failedActions.onSecondaryAction();
    await waitUntil(() => {
      expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          flowContext: "global",
          phase: "capture"
        })
      );
    });

    (modal as any).runtimeState = {
      ...(modal as any).runtimeState,
      phase: "save-failed"
    };
    (modal as any).renderCurrentState();
    const saveFailedCloseActions = await waitForLatestActions<{
      onClose: () => void;
    }>();
    saveFailedCloseActions.onClose();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("retries save-failed global capture through the extracted helper", () => {
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter"
      },
      quickCaptureWorkflow: {
        saveGlobalDraft: vi.fn(async () => undefined),
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      },
      linkImportService: {
        importFromInput: vi.fn(async (input: string) => ({
          title: "导入标题",
          body: "导入摘要",
          sourceUrl: input
        }))
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft: vi.fn(async () => undefined)
      }
    };

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, { flowContext: "global" });
    const renderSpy = vi.spyOn(modal as any, "renderCurrentState").mockImplementation(() => undefined);
    (modal as any).runtimeState = {
      flowContext: "global",
      phase: "save-failed",
      input: {
        text: "失败后保留的内容"
      }
    };

    expect(typeof (modal as any).retrySaveFailed).toBe("function");

    (modal as any).retrySaveFailed();

    expect((modal as any).runtimeState).toEqual(
      expect.objectContaining({
        phase: "capture",
        input: expect.objectContaining({
          text: "失败后保留的内容"
        })
      })
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the original error message for first-use submit failures", async () => {
    const stageFirstIdeaDraft = vi.fn(async () => {
      throw new Error("保存灵感失败");
    });
    const plugin = {
      app: {},
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-default",
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        createIdea: vi.fn()
      },
      firstUseWorkflow: {
        stageFirstIdeaDraft
      }
    };

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "first-use",
      initialInputText: "用于首条失败态测试的内容"
    });
    const showSpy = vi.spyOn((modal as any).toastService, "show");
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();

    const actions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();

    actions.onSubmit();

    await waitUntil(() => {
      expect(showSpy).toHaveBeenCalledWith({
        status: "error",
        message: "保存灵感失败"
      });
    });
  });

  it("forces ai polish hidden in first-use capture even when ai quick capture is enabled", async () => {
    const openSettings = vi.fn();
    const openTabById = vi.fn();
    const plugin = createAiReadyGlobalPlugin({
      app: {
        setting: {
          open: openSettings,
          openTabById
        }
      }
    });

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "first-use",
      initialInputText: "待润色原文"
    });
    attachModalHost(modal);
    modal.onOpen();

    expect(getLatestBuildState()).toEqual(
      expect.objectContaining({
        flowContext: "first-use",
        aiPolishVisible: false,
        aiPolishState: undefined,
        aiPolishSourceValue: undefined,
        aiPolishPolishedValue: undefined,
        aiPolishErrorMessage: undefined,
        inputText: "待润色原文"
      })
    );

    const actions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    actions.onAiPolishStart?.();

    expect(polishTextMock).not.toHaveBeenCalled();
    expect(openSettings).not.toHaveBeenCalled();
    expect(openTabById).not.toHaveBeenCalled();
  });

  it("keeps ai polish visible in global capture when enabled", () => {
    const plugin = createAiReadyGlobalPlugin();

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    attachModalHost(modal);
    modal.onOpen();

    expect(getLatestBuildState()).toEqual(
      expect.objectContaining({
        flowContext: "global",
        aiPolishVisible: true,
        inputText: "待润色原文"
      })
    );
  });

  it("opens plugin settings instead of calling ai polish when config is incomplete", async () => {
    const openSettings = vi.fn();
    const openTabById = vi.fn();
    const plugin = createAiReadyGlobalPlugin({
      app: {
        setting: {
          open: openSettings,
          openTabById
        }
      },
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter",
        ai: {
          enabled: true,
          quickCapturePolishEnabled: true,
          provider: "openai-compatible",
          baseUrl: "https://api.example.com",
          model: "gpt-test",
          apiKey: ""
        }
      }
    });

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    modal.onOpen();

    expect(getLatestBuildState()).toEqual(
      expect.objectContaining({
        aiPolishVisible: true,
        inputText: "待润色原文"
      })
    );

    const actions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    actions.onAiPolishStart?.();

    expect(polishTextMock).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(openTabById).toHaveBeenCalledTimes(1);
    expect(openTabById).toHaveBeenCalledWith("glitter");
  });

  it("keeps the ai polish trigger visible and routes to settings when ai is not yet globally enabled", async () => {
    const openSettings = vi.fn();
    const openTabById = vi.fn();
    const plugin = createAiReadyGlobalPlugin({
      app: {
        setting: {
          open: openSettings,
          openTabById
        }
      },
      settings: {
        enableDesignReviewMode: false,
        reviewScenario: "quick-capture-global-default",
        mediaStorageDirectory: "Glitter",
        ai: {
          enabled: false,
          quickCapturePolishEnabled: true,
          provider: "openai-compatible",
          baseUrl: "",
          model: "",
          apiKey: ""
        }
      }
    });

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    modal.onOpen();

    expect(getLatestBuildState()).toEqual(
      expect.objectContaining({
        aiPolishVisible: true,
        inputText: "待润色原文"
      })
    );

    const actions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    actions.onAiPolishStart?.();

    expect(polishTextMock).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(openTabById).toHaveBeenCalledWith("glitter");
  });

  it("enters ai polish reviewing state with source and result after a successful request", async () => {
    polishTextMock.mockResolvedValue("润色后的灵感");
    const plugin = createAiReadyGlobalPlugin();

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    actions.onAiPolishStart?.();

    await waitUntil(() => {
      expect(polishTextMock).toHaveBeenCalledWith("待润色原文", (plugin as any).settings);
    });
    await waitUntil(() => {
      expect(getLatestBuildState()).toEqual(
        expect.objectContaining({
          inputText: "待润色原文",
          aiPolishVisible: true,
          aiPolishState: "reviewing",
          aiPolishSourceValue: "待润色原文",
          aiPolishPolishedValue: "润色后的灵感"
        })
      );
    });
  });

  it("blocks Mod+Enter submit while ai polish is loading", async () => {
    const pendingRequest = createDeferred<string>();
    polishTextMock.mockImplementation(() => pendingRequest.promise);
    const saveGlobalDraft = vi.fn(async () => undefined);
    const plugin = createAiReadyGlobalPlugin({
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      }
    });

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    actions.onAiPolishStart?.();

    await waitUntil(() => {
      expect(getLatestBuildState()).toEqual(
        expect.objectContaining({
          aiPolishState: "loading"
        })
      );
    });

    const submitHandler = getScopeHandler("Enter", ["Mod"]);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    submitHandler({ preventDefault, stopPropagation } as unknown as KeyboardEvent, {});
    await flushPromises();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(saveGlobalDraft).not.toHaveBeenCalled();
    expect(getLatestBuildState()).toEqual(
      expect.objectContaining({
        inputText: "待润色原文",
        aiPolishState: "loading"
      })
    );

    pendingRequest.resolve("稍后完成的结果");
    await flushPromises();
  });

  it.each([
    {
      label: "reviewing",
      expectedState: "reviewing",
      prepare: async (actions: { onAiPolishStart?: () => void }) => {
        polishTextMock.mockResolvedValueOnce("润色后的灵感");
        actions.onAiPolishStart?.();
        await waitUntil(() => {
          expect(getLatestBuildState()).toEqual(
            expect.objectContaining({
              aiPolishState: "reviewing",
              aiPolishPolishedValue: "润色后的灵感"
            })
          );
        });
      }
    },
    {
      label: "error",
      expectedState: "error",
      prepare: async (actions: { onAiPolishStart?: () => void }) => {
        polishTextMock.mockRejectedValueOnce({
          code: "network",
          message: "AI 请求失败，请检查网络后重试。"
        });
        actions.onAiPolishStart?.();
        await waitUntil(() => {
          expect(getLatestBuildState()).toEqual(
            expect.objectContaining({
              aiPolishState: "error"
            })
          );
        });
      }
    }
  ])("does not submit while ai polish is $label", async ({ prepare, expectedState }) => {
    const saveGlobalDraft = vi.fn(async () => undefined);
    const plugin = createAiReadyGlobalPlugin({
      quickCaptureWorkflow: {
        saveGlobalDraft,
        listGlobalPoolOptions: vi.fn(async () => [{ id: "pool-default", label: "默认池" }])
      }
    });

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    modal.onOpen();

    const actions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
      onSubmit: () => void;
    }>();
    await prepare(actions);

    const submitActions = await waitForLatestActions<{
      onSubmit: () => void;
    }>();
    submitActions.onSubmit();
    await flushPromises();

    expect(saveGlobalDraft).not.toHaveBeenCalled();
    expect(getLatestBuildState()).toEqual(
      expect.objectContaining({
        inputText: "待润色原文",
        aiPolishState: expectedState
      })
    );
  });

  it.each([
    ["unauthorized", "AI 鉴权失败，请检查 API Key 后重试。"],
    ["network", "AI 请求失败，请检查网络后重试。"],
    ["unavailable", "AI 服务暂时不可用，请稍后重试。"],
    ["invalid-response", "AI 返回结果异常，请重做后再试。"],
    ["insufficient-rewrite", "AI 润色结果与原文过于接近，请重做再试。"]
  ] satisfies Array<[QuickCapturePolishErrorCode, string]>)
    ("maps %s failures to localized quick-capture copy", async (code, expectedMessage) => {
      const plugin = createAiReadyGlobalPlugin();

      buildWriteViewStateMock.mockImplementation((state) => state);
      polishTextMock.mockRejectedValueOnce(new QuickCapturePolishError(code));

      const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
        flowContext: "global",
        initialInputText: "待润色原文"
      });
      modal.onOpen();

      const actions = await waitForLatestActions<{
        onAiPolishStart?: () => void;
      }>();
      actions.onAiPolishStart?.();

      await waitUntil(() => {
        expect(getLatestBuildState()).toEqual(
          expect.objectContaining({
            aiPolishState: "error",
            aiPolishErrorMessage: expectedMessage
          })
        );
      });
    });

  it("marks ai polish result stale when the editable source changes after review", async () => {
    polishTextMock.mockResolvedValue("润色后的灵感");
    const plugin = createAiReadyGlobalPlugin();

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    modal.onOpen();

    const startActions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    startActions.onAiPolishStart?.();

    await waitUntil(() => {
      expect(getLatestBuildState()).toEqual(
        expect.objectContaining({
          aiPolishState: "reviewing",
          aiPolishSourceValue: "待润色原文",
          aiPolishPolishedValue: "润色后的灵感"
        })
      );
    });

    const reviewActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
    }>();
    reviewActions.onBodyInputChange("已改过的原文");

    expect(getLatestBuildState()).toEqual(
      expect.objectContaining({
        inputText: "已改过的原文",
        aiPolishState: "reviewing",
        aiPolishSourceValue: "待润色原文",
        aiPolishPolishedValue: "润色后的灵感"
      })
    );
  });

  it("uses the latest editable source text when redoing ai polish", async () => {
    polishTextMock.mockResolvedValueOnce("首版润色").mockResolvedValueOnce("二次润色");
    const plugin = createAiReadyGlobalPlugin();

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    modal.onOpen();

    const startActions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    startActions.onAiPolishStart?.();

    await waitUntil(() => {
      expect(getLatestBuildState()).toEqual(
        expect.objectContaining({
          aiPolishState: "reviewing",
          aiPolishPolishedValue: "首版润色"
        })
      );
    });

    const reviewActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
      onAiPolishRedo?: () => void;
    }>();
    reviewActions.onBodyInputChange("重做前的最新原文");

    const staleActions = await waitForLatestActions<{
      onAiPolishRedo?: () => void;
    }>();
    staleActions.onAiPolishRedo?.();

    await waitUntil(() => {
      expect(polishTextMock).toHaveBeenNthCalledWith(2, "重做前的最新原文", (plugin as any).settings);
    });
    await waitUntil(() => {
      expect(getLatestBuildState()).toEqual(
        expect.objectContaining({
          inputText: "重做前的最新原文",
          aiPolishState: "reviewing",
          aiPolishSourceValue: "重做前的最新原文",
          aiPolishPolishedValue: "二次润色"
        })
      );
    });
  });

  it("accepts ai polish by replacing the body text and clearing the local review session", async () => {
    polishTextMock.mockResolvedValue("润色后的灵感");
    const plugin = createAiReadyGlobalPlugin();

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    modal.onOpen();

    const startActions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    startActions.onAiPolishStart?.();

    await waitUntil(() => {
      expect(getLatestBuildState()).toEqual(
        expect.objectContaining({
          aiPolishState: "reviewing",
          aiPolishPolishedValue: "润色后的灵感"
        })
      );
    });

    const reviewActions = await waitForLatestActions<{
      onAiPolishAccept?: () => void;
    }>();
    reviewActions.onAiPolishAccept?.();

    const latestState = getLatestBuildState();
    expect(latestState.inputText).toBe("润色后的灵感");
    expect(latestState.aiPolishVisible).toBe(true);
    expect(latestState.aiPolishState).toBeUndefined();
    expect(latestState.aiPolishSourceValue).toBeUndefined();
    expect(latestState.aiPolishPolishedValue).toBeUndefined();
  });

  it("returns to editing by keeping the current source text and clearing the ai review session", async () => {
    polishTextMock.mockResolvedValue("润色后的灵感");
    const plugin = createAiReadyGlobalPlugin();

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "待润色原文"
    });
    modal.onOpen();

    const startActions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    startActions.onAiPolishStart?.();

    await waitUntil(() => {
      expect(getLatestBuildState()).toEqual(
        expect.objectContaining({
          aiPolishState: "reviewing",
          aiPolishPolishedValue: "润色后的灵感"
        })
      );
    });

    const reviewActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
      onAiPolishBackToEditing?: () => void;
    }>();
    reviewActions.onBodyInputChange("保留当前编辑的新原文");

    const staleActions = await waitForLatestActions<{
      onAiPolishBackToEditing?: () => void;
    }>();
    staleActions.onAiPolishBackToEditing?.();

    const latestState = getLatestBuildState();
    expect(latestState.inputText).toBe("保留当前编辑的新原文");
    expect(latestState.aiPolishVisible).toBe(true);
    expect(latestState.aiPolishState).toBeUndefined();
    expect(latestState.aiPolishSourceValue).toBeUndefined();
    expect(latestState.aiPolishPolishedValue).toBeUndefined();
  });

  it("ignores stale ai polish responses after a newer request supersedes them", async () => {
    const firstRequest = createDeferred<string>();
    const secondRequest = createDeferred<string>();
    polishTextMock
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);
    const plugin = createAiReadyGlobalPlugin();

    buildWriteViewStateMock.mockImplementation((state) => state);

    const modal = new QuickCaptureModal(plugin as any, "capture", {}, {
      flowContext: "global",
      initialInputText: "第一版原文"
    });
    modal.onOpen();

    const startActions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    startActions.onAiPolishStart?.();

    await waitUntil(() => {
      expect(getLatestBuildState()).toEqual(
        expect.objectContaining({
          aiPolishState: "loading",
          inputText: "第一版原文"
        })
      );
    });

    const loadingActions = await waitForLatestActions<{
      onBodyInputChange: (value: string) => void;
      onAiPolishStart?: () => void;
    }>();
    loadingActions.onBodyInputChange("第二版原文");

    const supersedingActions = await waitForLatestActions<{
      onAiPolishStart?: () => void;
    }>();
    supersedingActions.onAiPolishStart?.();

    await waitUntil(() => {
      expect(polishTextMock).toHaveBeenNthCalledWith(2, "第二版原文", (plugin as any).settings);
    });

    firstRequest.resolve("过期结果");
    await flushPromises();
    expect(getLatestBuildState()).toEqual(
      expect.objectContaining({
        aiPolishState: "loading",
        inputText: "第二版原文"
      })
    );

    secondRequest.resolve("最新结果");
    await waitUntil(() => {
      expect(getLatestBuildState()).toEqual(
        expect.objectContaining({
          inputText: "第二版原文",
          aiPolishState: "reviewing",
          aiPolishSourceValue: "第二版原文",
          aiPolishPolishedValue: "最新结果"
        })
      );
    });
  });
});
