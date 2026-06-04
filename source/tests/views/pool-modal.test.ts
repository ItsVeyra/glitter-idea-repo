/**
 * 保护池选择与创建弹窗的步骤切换相关行为，避免后续重构时出现静默回退。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// 预先收口可重置的依赖替身，方便验证对外协作。
const {
  buildFirstUseChoosePoolStateMock,
  buildFirstUseCreatePoolStateMock,
  renderPoolViewMock
} = vi.hoisted(() => ({
  buildFirstUseChoosePoolStateMock: vi.fn(),
  buildFirstUseCreatePoolStateMock: vi.fn(),
  renderPoolViewMock: vi.fn()
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/ui/pool/pool-state", () => ({
  buildFirstUseChoosePoolState: buildFirstUseChoosePoolStateMock,
  buildFirstUseCreatePoolState: buildFirstUseCreatePoolStateMock
}));

vi.mock("../../src/ui/pool/render-pool", () => ({
  renderPoolView: renderPoolViewMock
}));

import { PoolModal } from "../../src/views/pool-modal";

// 覆盖视图宿主在生命周期、渲染与回调桥接上的核心契约。
describe("PoolModal", () => {
  beforeEach(() => {
    buildFirstUseChoosePoolStateMock.mockReset();
    buildFirstUseCreatePoolStateMock.mockReset();
    renderPoolViewMock.mockReset();
  });

  function createMockElement() {
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
      querySelector() {
        return null;
      },
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
  }

  function attachModalHost(
    modal: PoolModal,
    overrides: Record<string, unknown> = {}
  ): {
    addClass: ReturnType<typeof vi.fn>;
    removeClass: ReturnType<typeof vi.fn>;
    empty: ReturnType<typeof vi.fn>;
  } {
    const addClass = vi.fn();
    const removeClass = vi.fn();
    const empty = vi.fn();
    const containerEl = { ...createMockElement(), addClass, removeClass };
    const modalEl = { ...createMockElement(), addClass, removeClass };
    const contentEl = { ...createMockElement(), addClass, removeClass, empty, ...overrides };

    (containerEl as any).addEventListener("click", (event: { target?: unknown }) => {
      if (event.target === containerEl) {
        (modal as any).close();
      }
    });

    (modal as any).containerEl = containerEl;
    (modal as any).modalEl = modalEl;
    (modal as any).contentEl = contentEl;
    return { addClass, removeClass, empty };
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });
    return { promise, resolve, reject };
  }

  async function flushRender(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it("renders choose step in modal surface and closes before forwarding first-use commit result", async () => {
    const callOrder: string[] = [];
    const commitResult = {
      warning: {
        stage: "create-file" as const,
        message: "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。"
      }
    };
    const onPoolChosen = vi.fn(() => {
      callOrder.push("chosen");
    });
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => [{ id: "pool-default", name: "默认池" }])
      },
      firstUseWorkflow: {
        commitDraftToExistingPool: vi.fn(async () => commitResult)
      }
    };

    buildFirstUseChoosePoolStateMock.mockReturnValue({ mode: "first-use-choose" });

    const modal = new PoolModal(plugin as any, "choose", { onPoolChosen });
    const { addClass } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      callOrder.push("close");
    });

    modal.onOpen();
    await flushRender();

    expect(addClass).toHaveBeenCalledTimes(5);
    expect(buildFirstUseChoosePoolStateMock).toHaveBeenCalledWith({
      pools: [{ id: "pool-default", name: "默认池", ideaCount: 0 }]
    });

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onItemSelect: (poolId: string) => Promise<void>;
    };

    await actions.onItemSelect("use-default-pool");

    expect(callOrder).toEqual(["close", "chosen"]);
    expect(onPoolChosen).toHaveBeenCalledWith("use-default-pool", undefined, commitResult);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("renders create step and forwards first-use commit result after closing", async () => {
    const callOrder: string[] = [];
    const commitResult = {
      warning: {
        stage: "mark-file-created" as const,
        message: "灵感已保存，但文件已创建但关联未完成。你可以稍后检查这条灵感的建档状态。"
      }
    };
    const onPoolChosen = vi.fn(() => {
      callOrder.push("chosen");
    });
    const plugin = {
      app: {},
      firstUseWorkflow: {
        commitDraftToNewPool: vi.fn(async () => ({
          pool: { id: "pool-created" },
          commitResult
        }))
      }
    };

    buildFirstUseCreatePoolStateMock.mockReturnValue({ mode: "first-use-create" });

    const modal = new PoolModal(plugin as any, "create", { onPoolChosen });
    const host = attachModalHost(modal, {
      querySelector: vi.fn((selector: string) => {
        if (selector === ".glitter-pool-stage__field-input") {
          return { value: "新建池" };
        }
        if (selector === ".glitter-pool-stage__field-input--textarea") {
          return { value: "说明" };
        }
        if (selector === ".glitter-pool-stage__swatch--selected") {
          return { dataset: { poolColor: "#7e9bda" } };
        }
        return null;
      })
    });
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      callOrder.push("close");
    });

    modal.onOpen();
    await flushRender();

    expect(host.addClass).toHaveBeenCalledWith("glitter-pool-modal--create");
    expect(buildFirstUseCreatePoolStateMock).toHaveBeenCalledWith({
      flowContext: "first-use",
      poolColors: undefined
    });

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onItemSelect: (poolId: string) => void;
    };

    await actions.onItemSelect("new-pool-created");

    expect(callOrder).toEqual(["close", "chosen"]);
    expect(onPoolChosen).toHaveBeenCalledWith("pool-created", "新建池", commitResult);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not close or advance early when first-use choose submit is triggered twice", async () => {
    const callOrder: string[] = [];
    const deferredCommit = createDeferred<{ warning?: { stage: "create-file"; message: string } }>();
    const commitDraftToExistingPool = vi.fn()
      .mockImplementationOnce(() => deferredCommit.promise)
      .mockResolvedValueOnce({});
    const onPoolChosen = vi.fn(() => {
      callOrder.push("chosen");
    });
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => [{ id: "pool-default", name: "默认池" }])
      },
      firstUseWorkflow: {
        commitDraftToExistingPool
      }
    };

    buildFirstUseChoosePoolStateMock.mockReturnValue({ mode: "first-use-choose" });

    const modal = new PoolModal(plugin as any, "choose", { onPoolChosen });
    attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      callOrder.push("close");
    });

    modal.onOpen();
    await flushRender();

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onItemSelect: (poolId: string) => Promise<void>;
    };

    const firstSubmit = actions.onItemSelect("use-default-pool");
    const secondSubmit = actions.onItemSelect("use-default-pool");
    await Promise.resolve();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(onPoolChosen).not.toHaveBeenCalled();
    expect(commitDraftToExistingPool).toHaveBeenCalledTimes(1);

    deferredCommit.resolve({
      warning: {
        stage: "create-file",
        message: "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。"
      }
    });
    await Promise.all([firstSubmit, secondSubmit]);

    expect(callOrder).toEqual(["close", "chosen"]);
    expect(onPoolChosen).toHaveBeenCalledTimes(1);
    expect(onPoolChosen).toHaveBeenCalledWith("use-default-pool", undefined, {
      warning: {
        stage: "create-file",
        message: "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。"
      }
    });
  });

  it("does not close or advance early when first-use create submit is triggered twice", async () => {
    const callOrder: string[] = [];
    const deferredCommit = createDeferred<{
      pool: { id: string; name: string };
      commitResult: { warning?: { stage: "mark-file-created"; message: string } };
    }>();
    const commitDraftToNewPool = vi.fn()
      .mockImplementationOnce(() => deferredCommit.promise)
      .mockResolvedValueOnce({
        pool: { id: "pool-created-2", name: "重复提交池" },
        commitResult: {}
      });
    const onPoolChosen = vi.fn(() => {
      callOrder.push("chosen");
    });
    const plugin = {
      app: {},
      firstUseWorkflow: {
        commitDraftToNewPool
      }
    };

    buildFirstUseCreatePoolStateMock.mockReturnValue({ mode: "first-use-create" });

    const modal = new PoolModal(plugin as any, "create", { onPoolChosen });
    attachModalHost(modal, {
      querySelector: vi.fn((selector: string) => {
        if (selector === ".glitter-pool-stage__field-input") {
          return { value: "新建池" };
        }
        if (selector === ".glitter-pool-stage__field-input--textarea") {
          return { value: "说明" };
        }
        if (selector === ".glitter-pool-stage__swatch--selected") {
          return { dataset: { poolColor: "#7e9bda" } };
        }
        return null;
      })
    });
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => {
      callOrder.push("close");
    });

    modal.onOpen();
    await flushRender();

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onItemSelect: (poolId: string) => Promise<void>;
    };

    const firstSubmit = actions.onItemSelect("new-pool-created");
    const secondSubmit = actions.onItemSelect("new-pool-created");
    await Promise.resolve();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(onPoolChosen).not.toHaveBeenCalled();
    expect(commitDraftToNewPool).toHaveBeenCalledTimes(1);

    deferredCommit.resolve({
      pool: { id: "pool-created", name: "新建池" },
      commitResult: {
        warning: {
          stage: "mark-file-created",
          message: "灵感已保存，但文件已创建但关联未完成。你可以稍后检查这条灵感的建档状态。"
        }
      }
    });
    await Promise.all([firstSubmit, secondSubmit]);

    expect(callOrder).toEqual(["close", "chosen"]);
    expect(onPoolChosen).toHaveBeenCalledTimes(1);
    expect(onPoolChosen).toHaveBeenCalledWith("pool-created", "新建池", {
      warning: {
        stage: "mark-file-created",
        message: "灵感已保存，但文件已创建但关联未完成。你可以稍后检查这条灵感的建档状态。"
      }
    });
  });

  it("closes the modal when choose-step close is pressed", async () => {
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    buildFirstUseChoosePoolStateMock.mockReturnValue({ mode: "first-use-choose" });

    const modal = new PoolModal(plugin as any, "choose");
    attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushRender();

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onClose: () => void;
    };

    actions.onClose();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("returns to the previous first-use step when choose-step back is pressed", async () => {
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };
    const onBackToPrevious = vi.fn();

    buildFirstUseChoosePoolStateMock.mockReturnValue({ mode: "first-use-choose" });

    const modal = new PoolModal(plugin as any, "choose", { onBackToPrevious });
    attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushRender();

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onBack: () => void;
    };

    actions.onBack();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onBackToPrevious).toHaveBeenCalledTimes(1);
  });

  it("only closes when create-step close is pressed and does not return to choose flow", async () => {
    const plugin = {
      app: {},
      firstUseWorkflow: {
        commitDraftToNewPool: vi.fn(async () => ({ pool: { id: "pool-created" } }))
      }
    };
    const onBackToChoose = vi.fn();

    buildFirstUseCreatePoolStateMock.mockReturnValue({ mode: "first-use-create" });

    const modal = new PoolModal(plugin as any, "create", { onBackToChoose });
    attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushRender();

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onClose: () => void;
    };

    actions.onClose();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onBackToChoose).not.toHaveBeenCalled();
  });

  it("only closes when create-step back has no choose-return handler", async () => {
    const plugin = {
      app: {},
      poolService: {
        createPool: vi.fn(async () => ({ id: "pool-created" }))
      }
    };

    buildFirstUseCreatePoolStateMock.mockReturnValue({ mode: "first-use-create" });

    const modal = new PoolModal(plugin as any, "create", {}, { flowContext: "global" });
    attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushRender();

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onBack: () => void;
    };

    actions.onBack();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores outside clicks so the pool modal only closes from explicit close actions", async () => {
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    buildFirstUseChoosePoolStateMock.mockReturnValue({ mode: "first-use-choose" });

    const modal = new PoolModal(plugin as any, "choose");
    attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();
    await flushRender();

    (modal as any).containerEl.dispatchEvent({ type: "click", target: (modal as any).containerEl });

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("adds first-use shell class only for first-use pool modals", async () => {
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    buildFirstUseChoosePoolStateMock.mockReturnValue({ mode: "first-use-choose" });

    const firstUseModal = new PoolModal(plugin as any, "choose");
    const firstUseHost = attachModalHost(firstUseModal);

    firstUseModal.onOpen();
    await flushRender();

    expect(firstUseHost.addClass).toHaveBeenCalledWith("glitter-pool-modal--first-use");

    firstUseModal.onClose();

    expect(firstUseHost.removeClass).toHaveBeenCalledWith("glitter-pool-modal--first-use");

    buildFirstUseCreatePoolStateMock.mockReturnValue({ mode: "first-use-create" });

    const globalModal = new PoolModal(plugin as any, "create", {}, { flowContext: "global" });
    const globalHost = attachModalHost(globalModal);

    globalModal.onOpen();
    await flushRender();

    expect(globalHost.addClass).not.toHaveBeenCalledWith("glitter-pool-modal--first-use");
  });

  it("adds and clears pool-modal host classes across modal lifecycle", async () => {
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    buildFirstUseChoosePoolStateMock.mockReturnValue({ mode: "first-use-choose" });

    const modal = new PoolModal(plugin as any, "choose");
    const host = attachModalHost(modal);

    modal.onOpen();
    await flushRender();

    expect(host.addClass).toHaveBeenCalledWith("glitter-pool-modal-host");
    expect(host.addClass).toHaveBeenCalledWith("glitter-pool-modal");
    expect(host.addClass).toHaveBeenCalledWith("glitter-pool-modal--choose");
    expect(host.addClass).toHaveBeenCalledWith("glitter-pool-modal--first-use");
    expect(host.addClass).toHaveBeenCalledWith("glitter-pool-modal__content");

    modal.onClose();

    expect(host.removeClass).toHaveBeenCalledWith("glitter-pool-modal-host");
    expect(host.removeClass).toHaveBeenCalledWith("glitter-pool-modal");
    expect(host.removeClass).toHaveBeenCalledWith("glitter-pool-modal--choose");
    expect(host.removeClass).toHaveBeenCalledWith("glitter-pool-modal--first-use");
    expect(host.removeClass).toHaveBeenCalledWith("glitter-pool-modal__content");
    expect(host.empty).toHaveBeenCalledTimes(1);
  });

  it("uses deterministic settings color when selected swatch style is unavailable", async () => {
    const commitDraftToNewPool = vi.fn(async () => ({
      pool: { id: "pool-created" }
    }));
    const plugin = {
      app: {},
      settings: {
        poolColors: {
          unsorted: "#6ab5ff",
          product: "#74ccba",
          research: "#ffa980",
          writing: "#ffd468",
          unnamed: "#b794ff"
        }
      },
      firstUseWorkflow: {
        commitDraftToNewPool
      }
    };

    buildFirstUseCreatePoolStateMock.mockReturnValue({ mode: "first-use-create" });

    const modal = new PoolModal(plugin as any, "create");
    attachModalHost(modal, {
      querySelector: vi.fn((selector: string) => {
        if (selector === ".glitter-pool-stage__field-input") {
          return { value: "新建池" };
        }
        if (selector === ".glitter-pool-stage__field-input--textarea") {
          return { value: "说明" };
        }
        if (selector === ".glitter-pool-stage__swatch--selected") {
          return { dataset: {} };
        }
        return null;
      })
    });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();
    await flushRender();

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onItemSelect: (poolId: string) => Promise<void>;
    };

    await actions.onItemSelect("new-pool-created");

    expect(commitDraftToNewPool).toHaveBeenCalledWith({
      name: "新建池",
      description: "说明",
      color: "#b794ff"
    });
  });

  it("prefers the swatch-group selected color dataset before falling back to settings", async () => {
    const createPool = vi.fn(async () => ({ id: "pool-created" }));
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => []),
        createPool
      },
      settings: {
        poolColors: {
          unsorted: "#6ab5ff",
          product: "#74ccba",
          research: "#ffa980",
          writing: "#ffd468",
          unnamed: "#b794ff"
        }
      }
    };

    buildFirstUseCreatePoolStateMock.mockReturnValue({ mode: "first-use-create" });

    const modal = new PoolModal(plugin as any, "create", {}, { flowContext: "global" });
    attachModalHost(modal, {
      querySelector: vi.fn((selector: string) => {
        if (selector === ".glitter-pool-stage__field-input") {
          return { value: "新建池" };
        }
        if (selector === ".glitter-pool-stage__field-input--textarea") {
          return { value: "说明" };
        }
        if (selector === ".glitter-pool-stage__swatch--selected") {
          return null;
        }
        if (selector === ".glitter-pool-stage__swatches") {
          return { dataset: { selectedPoolColor: "#ffd468" } };
        }
        return null;
      })
    });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();
    await flushRender();

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onItemSelect: (poolId: string) => Promise<void>;
    };

    await actions.onItemSelect("new-pool-created");

    expect(createPool).toHaveBeenCalledWith({
      name: "新建池",
      description: "说明",
      color: "#ffd468"
    });
  });

  it("uses global choose flow without first-use draft commit", async () => {
    const createPool = vi.fn(async () => ({ id: "pool-created" }));
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => [{ id: "pool-default", name: "默认池" }]),
        createPool
      },
      settings: {
        poolColors: {
          unnamed: "#b794ff"
        }
      }
    };

    buildFirstUseChoosePoolStateMock.mockReturnValue({ mode: "first-use-choose" });

    const onPoolChosen = vi.fn();
    const modal = new PoolModal(plugin as any, "choose", { onPoolChosen }, { flowContext: "global" });
    attachModalHost(modal, {
      querySelector: vi.fn(() => null)
    });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();
    await flushRender();

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onItemSelect: (poolId: string) => Promise<void>;
    };

    await actions.onItemSelect("pool-default");

    expect(onPoolChosen).toHaveBeenCalledWith("pool-default");
    expect(createPool).not.toHaveBeenCalled();
  });

  it("uses the selected swatch color in global create flow without falling back to another pool color", async () => {
    const createPool = vi.fn(async () => ({ id: "pool-created" }));
    const commitDraftToNewPool = vi.fn(async () => ({ pool: { id: "should-not-be-used" } }));
    const plugin = {
      app: {},
      poolService: {
        listPools: vi.fn(async () => []),
        createPool
      },
      settings: {
        poolColors: {
          unsorted: "#6ab5ff",
          product: "#74ccba",
          research: "#ffa980",
          writing: "#ffd468",
          unnamed: "#b794ff"
        }
      },
      firstUseWorkflow: {
        commitDraftToNewPool
      }
    };

    buildFirstUseCreatePoolStateMock.mockReturnValue({ mode: "first-use-create" });

    const onPoolChosen = vi.fn();
    const modal = new PoolModal(plugin as any, "create", { onPoolChosen }, { flowContext: "global" });
    attachModalHost(modal, {
      querySelector: vi.fn((selector: string) => {
        if (selector === ".glitter-pool-stage__field-input") {
          return { value: "新建池" };
        }
        if (selector === ".glitter-pool-stage__field-input--textarea") {
          return { value: "说明" };
        }
        if (selector === ".glitter-pool-stage__swatch--selected") {
          return { dataset: { poolColor: "#7e9bda" } };
        }
        return null;
      })
    });
    vi.spyOn(modal as unknown as { close: () => void }, "close").mockImplementation(() => undefined);

    modal.onOpen();
    await flushRender();

    expect(buildFirstUseCreatePoolStateMock).toHaveBeenCalledWith({
      flowContext: "global",
      poolColors: {
        unsorted: "#6ab5ff",
        product: "#74ccba",
        research: "#ffa980",
        writing: "#ffd468",
        unnamed: "#b794ff"
      }
    });

    const actions = renderPoolViewMock.mock.calls[0]?.[2] as {
      onItemSelect: (poolId: string) => Promise<void>;
    };

    await actions.onItemSelect("new-pool-created");

    expect(createPool).toHaveBeenCalledWith({
      name: "新建池",
      description: "说明",
      color: "#7e9bda"
    });
    expect(commitDraftToNewPool).not.toHaveBeenCalled();
    expect(onPoolChosen).toHaveBeenCalledWith("pool-created", "新建池");
  });
});
