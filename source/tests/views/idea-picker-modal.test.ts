/**
 * 保护灵感选择弹窗的列表与确认行为相关行为，避免后续重构时出现静默回退。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runtimeReconcileMock } = vi.hoisted(() => ({
  runtimeReconcileMock: vi.fn()
}));

vi.mock("../../src/application/idea-query/idea-runtime-source", () => ({
  reconcileIdeaRuntimeState: runtimeReconcileMock
}));

import { IdeaPickerModal } from "../../src/views/idea-picker-modal";

type FakeEvent = {
  key?: string;
  preventDefault?: ReturnType<typeof vi.fn>;
  stopPropagation?: ReturnType<typeof vi.fn>;
};

type FakeListener = (event?: FakeEvent) => void;

type QueryIdea = {
  id: string;
  title: string;
  body: string;
  poolId: string;
  fileCreated: boolean;
  snippetRefs: Array<{ notePath: string }>;
};

// 构造最小宿主替身，承接渲染层与事件层断言。
class FakeElement {
  className = "";
  type = "";
  value = "";
  placeholder = "";
  textContent = "";
  isFocused = false;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: FakeElement[] = [];

  private readonly listeners = new Map<string, FakeListener[]>();

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  clear(): void {
    this.children = [];
    this.textContent = "";
  }

  empty(): void {
    this.clear();
  }

  createEl(tag: string, options?: { cls?: string; text?: string }): FakeElement {
    const node = new FakeElement();
    node.type = tag;
    if (options?.cls) {
      node.className = options.cls;
    }
    if (options?.text !== undefined) {
      node.textContent = options.text;
    }
    this.appendChild(node);
    return node;
  }

  createDiv(options?: { cls?: string; text?: string }): FakeElement {
    return this.createEl("div", options);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(type: string, listener: FakeListener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  dispatchEvent(type: string, event?: FakeEvent): FakeEvent | undefined {
    const listeners = this.listeners.get(type) ?? [];
    listeners.forEach((listener) => listener(event));
    return event;
  }

  click(): void {
    this.dispatchEvent("click");
  }

  focus(): void {
    this.isFocused = true;
  }

  keydown(key: string): FakeEvent {
    const event: FakeEvent = {
      key,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    };
    this.dispatchEvent("keydown", event);
    return event;
  }

  querySelector<T>(selector: string): T | null {
    return (this.querySelectorAll<T>(selector)[0] ?? null) as T | null;
  }

  querySelectorAll<T>(selector: string): T[] {
    if (!selector.startsWith(".")) {
      return [];
    }

    const cls = selector.slice(1);
    const matches: FakeElement[] = [];
    const visit = (node: FakeElement): void => {
      const classes = node.className.split(/\s+/).filter(Boolean);
      if (classes.includes(cls)) {
        matches.push(node);
      }
      node.children.forEach(visit);
    };

    this.children.forEach(visit);
    return matches as T[];
  }
}

// 覆盖视图宿主在生命周期、渲染与回调桥接上的核心契约。
describe("IdeaPickerModal", () => {
  beforeEach(() => {
    runtimeReconcileMock.mockReset();
    runtimeReconcileMock.mockImplementation(async (_ideaService, _vault, ideas) => ideas);
  });

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolver, rejecter) => {
      resolve = resolver;
      reject = rejecter;
    });
    return { promise, resolve, reject };
  }

  function buildIdea(overrides: Partial<QueryIdea> = {}): QueryIdea {
    return {
      id: "idea-1",
      title: "灵感标题",
      body: "灵感正文",
      poolId: "pool-1",
      fileCreated: false,
      snippetRefs: [],
      ...overrides
    };
  }

  function flushMicrotasks(times = 2): Promise<void> {
    let chain = Promise.resolve();
    for (let index = 0; index < times; index += 1) {
      chain = chain.then(() => Promise.resolve());
    }
    return chain.then(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        })
    );
  }

  function attachModalHost(modal: IdeaPickerModal) {
    const addClass = vi.fn();
    const removeClass = vi.fn();
    const empty = vi.fn(function (this: FakeElement) {
      this.clear();
    });

    const containerEl = { addClass, removeClass };
    const modalEl = { addClass, removeClass };
    const contentEl = new FakeElement() as FakeElement & {
      empty: () => void;
    };
    contentEl.empty = empty.bind(contentEl);

    (modal as any).containerEl = containerEl;
    (modal as any).modalEl = modalEl;
    (modal as any).contentEl = contentEl;

    return { addClass, removeClass, empty, contentEl };
  }

  it("inserts only from the plus button, not from the whole idea row", async () => {
    const onPick = vi.fn(async () => undefined);
    const queryIdeas = vi.fn(async () => [buildIdea()]);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, onPick);
    const { addClass, removeClass, empty, contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    expect(addClass).toHaveBeenCalledWith("GlitterIdea-picker-modal-host");
    expect(addClass).toHaveBeenCalledWith("GlitterIdea-picker-modal");
    expect(queryIdeas).toHaveBeenCalledWith({ text: "", sort: "updatedAt-desc" });
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query")?.isFocused).toBe(true);

    const row = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result");
    const plusButton = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-action");
    expect(row?.dataset.ideaId).toBe("idea-1");
    expect(row?.type).toBe("div");
    expect(plusButton?.type).toBe("button");

    row?.click();
    await flushMicrotasks();

    expect(onPick).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();

    plusButton?.click();
    await flushMicrotasks();

    expect(onPick).toHaveBeenCalledWith("idea-1");
    expect(closeSpy).toHaveBeenCalledTimes(1);

    modal.onClose();
    expect(removeClass).toHaveBeenCalledWith("GlitterIdea-picker-modal-host");
    expect(removeClass).toHaveBeenCalledWith("GlitterIdea-picker-modal");
    expect(empty).toHaveBeenCalled();
  });

  it("keeps the picker open when the pick callback rejects", async () => {
    const onPick = vi.fn(async () => {
      throw new Error("pick failed");
    });
    const queryIdeas = vi.fn(async () => [buildIdea()]);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, onPick);
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-action")?.click();
    await flushMicrotasks();

    expect(onPick).toHaveBeenCalledWith("idea-1");
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("renders a plugin-standard close button and closes when clicked", async () => {
    const queryIdeas = vi.fn(async () => [buildIdea()]);
    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const closeButton = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__close");
    expect(closeButton).not.toBeNull();
    expect(closeButton?.className).toContain("glitter-write-stage__close-button");

    closeButton?.click();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("renders shared English picker copy in snippet mode", async () => {
    const queryIdeas = vi.fn(async ({ text }: { text: string }) => {
      if (text === "third") {
        return [
          buildIdea({
            id: "idea-3",
            title: "Third idea",
            body: "Idea body",
            fileCreated: true,
            snippetRefs: [{ notePath: "A.md" }, { notePath: "B.md" }]
          })
        ];
      }

      return [
        buildIdea({
          id: "idea-3",
          title: "Third idea",
          body: "Idea body",
          fileCreated: true,
          snippetRefs: [{ notePath: "A.md" }, { notePath: "B.md" }]
        }),
        buildIdea({ id: "idea-2", title: "Second idea", body: "" }),
        buildIdea({ id: "idea-1", title: "First idea", body: "First body" })
      ];
    });

    const plugin = {
      app: {},
      settings: {
        interfaceLanguage: "en"
      },
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    const closeButton = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__close");
    const actionButton = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-action");

    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__title")?.textContent).toBe(
      "Insert Glitter snippet"
    );
    expect(closeButton?.getAttribute("aria-label")).toBe("Close idea picker");
    expect(queryInput?.placeholder).toBe("Search idea title or body");
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__section-title")?.textContent).toBe("Recent");
    expect(
      contentEl
        .querySelectorAll<FakeElement>(".GlitterIdea-picker-modal__result-body")
        .map((body) => body.textContent)
    ).toEqual(["Idea body", "No body"]);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-pool")?.textContent).toBe(
      "Untitled pool"
    );
    expect(
      contentEl
        .querySelectorAll<FakeElement>(".GlitterIdea-picker-modal__result-status")
        .map((marker) => marker.textContent)
    ).toEqual(["File created", "Referenced in 2 snippets"]);
    expect(actionButton?.getAttribute("aria-label")).toBe("Insert idea Third idea");

    queryInput!.value = "third";
    queryInput!.dispatchEvent("input");
    await flushMicrotasks();

    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__section-title")?.textContent).toBe("Results");
  });

  it("renders status chips from the reconciled runtime idea snapshot", async () => {
    const queryIdeas = vi.fn(async () => [
      buildIdea({
        id: "idea-1",
        title: "Third idea",
        body: "Idea body",
        fileCreated: true,
        snippetRefs: [{ notePath: "A.md" }, { notePath: "B.md" }]
      })
    ]);
    runtimeReconcileMock.mockImplementation(async (_ideaService, _vault, _ideas) => [
      buildIdea({
        id: "idea-1",
        title: "Third idea",
        body: "Idea body",
        fileCreated: false,
        snippetRefs: [{ notePath: "A.md" }]
      })
    ]);

    const plugin = {
      app: {},
      settings: {
        interfaceLanguage: "en"
      },
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    expect(
      contentEl
        .querySelectorAll<FakeElement>(".GlitterIdea-picker-modal__result-status")
        .map((marker) => marker.textContent)
    ).toEqual(["Referenced in 1 snippet"]);
  });

  it("renders the sketch-style shell with a recent section and two ideas before searching", async () => {
    const queryIdeas = vi.fn(async () => [
      buildIdea({ id: "idea-3", title: "第三条" }),
      buildIdea({ id: "idea-2", title: "第二条", body: "" }),
      buildIdea({ id: "idea-1", title: "第一条" })
    ]);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__title")?.textContent).toBe(
      "插入 Glitter 灵感"
    );
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__section-title")?.textContent).toBe(
      "最近使用"
    );
    expect(
      contentEl
        .querySelectorAll<FakeElement>(".GlitterIdea-picker-modal__result")
        .map((result) => result.dataset.ideaId)
    ).toEqual(["idea-3", "idea-2"]);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-content")).not.toBeNull();
    expect(
      contentEl
        .querySelectorAll<FakeElement>(".GlitterIdea-picker-modal__result-body")
        .map((body) => body.textContent)
    ).toEqual(["灵感正文", "无正文"]);
    expect(runtimeReconcileMock).toHaveBeenCalledTimes(1);
    expect(runtimeReconcileMock.mock.calls[0]?.[2].map((idea: QueryIdea) => idea.id)).toEqual(["idea-3", "idea-2"]);
  });

  it("uses the canvas-block title override without changing the shared picker body", async () => {
    const plugin = {
      app: {},
      settings: {
        interfaceLanguage: "en"
      },
      ideaService: {
        queryIdeas: vi.fn(async () => [buildIdea({ id: "idea-1", title: "Canvas idea", body: "Canvas body" })])
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined), { mode: "canvas-block" });
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__title")?.textContent).toBe(
      "Use idea for canvas block title"
    );
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query")?.placeholder).toBe(
      "Search idea title or body"
    );
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result")?.dataset.ideaId).toBe("idea-1");
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-action")?.getAttribute("aria-label")).toBe(
      "Use idea Canvas idea for canvas block title"
    );
  });

  it("defines non-overflow layout rules for recent idea rows", () => {
    const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(css).toMatch(/\.GlitterIdea-picker-modal__result\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(css).toMatch(/\.GlitterIdea-picker-modal__result-header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/);
    expect(css).toMatch(/\.GlitterIdea-picker-modal__result-content\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/);
  });

  it("defines a fixed in-row plus position and stable recent row height", () => {
    const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(css).toMatch(/\.GlitterIdea-picker-modal__result\s*\{[\s\S]*?position:\s*relative;[\s\S]*?min-height:\s*64px;[\s\S]*?padding-right:\s*56px;/);
    expect(css).toMatch(/\.GlitterIdea-picker-modal__result-action\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*14px;[\s\S]*?top:\s*50%;[\s\S]*?transform:\s*translateY\(-50%\);/);
  });

  it("aligns picker cards and controls with quick capture chrome", () => {
    const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(css).toMatch(
      /\.GlitterIdea-picker-modal__result\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--glitter-ui-bg-alt\)\s*94%,\s*black\s*6%\);/
    );
    expect(css).toMatch(
      /\.GlitterIdea-picker-modal__close\.glitter-write-stage__close-button\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;[^}]*border-radius:\s*8px;[^}]*background:\s*color-mix\(in srgb,\s*var\(--glitter-ui-bg-alt\)\s*88%,\s*transparent\);[^}]*box-shadow:\s*none;/
    );
    expect(css).toMatch(
      /\.GlitterIdea-picker-modal__query\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--glitter-ui-bg-alt\)\s*94%,\s*black\s*6%\);[^}]*appearance:\s*none;[^}]*-webkit-appearance:\s*none;[^}]*background-image:\s*none;[^}]*box-shadow:\s*none;/
    );
    expect(css).toMatch(
      /\.GlitterIdea-picker-modal\s+\.GlitterIdea-picker-modal__query\s*\{[^}]*border:\s*1px\s+solid\s+color-mix\(in srgb,\s*var\(--background-modifier-border,\s*#4a5f84\)\s*72%,\s*transparent\)\s*!important;[^}]*background:\s*color-mix\(in srgb,\s*var\(--glitter-ui-bg-alt\)\s*94%,\s*black\s*6%\)\s*!important;[^}]*appearance:\s*none\s*!important;[^}]*-webkit-appearance:\s*none\s*!important;[^}]*background-image:\s*none\s*!important;[^}]*box-shadow:\s*none\s*!important;/
    );
    expect(css).toMatch(
      /\.GlitterIdea-picker-modal__result-action\s*\{[^}]*border:\s*none;[^}]*background:\s*color-mix\(in srgb,\s*var\(--glitter-ui-bg-alt\)\s*94%,\s*black\s*6%\);[^}]*box-shadow:\s*none;[^}]*appearance:\s*none;[^}]*-webkit-appearance:\s*none;/
    );
    expect(css).toMatch(
      /\.GlitterIdea-picker-modal\s+\.GlitterIdea-picker-modal__result-action\s*\{[^}]*border:\s*none\s*!important;[^}]*background:\s*color-mix\(in srgb,\s*var\(--glitter-ui-bg-alt\)\s*94%,\s*black\s*6%\)\s*!important;[^}]*background-image:\s*none\s*!important;[^}]*box-shadow:\s*none\s*!important;[^}]*appearance:\s*none\s*!important;[^}]*-webkit-appearance:\s*none\s*!important;/
    );
  });

  it("aligns all plugin window shells on the same shared background", () => {
    const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(css).toMatch(
      /\.glitter-quick-capture-modal,\s*\.glitter-pool-modal,\s*\.GlitterIdea-edit-modal,\s*\.GlitterIdea-picker-modal,\s*\.glitter-snippet-locations-modal,\s*\.glitter-pool-roam-history-modal,\s*\.glitter-pool-roam-board-modal\s*\{[^}]*background:\s*var\(--glitter-ui-bg\);/
    );
  });

  it("uses the same water-surface glass scrim behind every plugin modal", () => {
    const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(css).toMatch(
      /\.glitter-quick-capture-modal-host \.modal-bg,\s*\.glitter-pool-modal-host \.modal-bg,\s*\.GlitterIdea-edit-modal-host \.modal-bg,\s*\.GlitterIdea-picker-modal-host \.modal-bg,\s*\.glitter-snippet-locations-modal-host \.modal-bg,\s*\.glitter-pool-roam-history-modal-host \.modal-bg,\s*\.glitter-pool-roam-board-modal-host \.modal-bg\s*\{[^}]*background:\s*radial-gradient\(\s*circle at 50% 18%,\s*rgba\(255,\s*255,\s*255,\s*0\.22\)\s*0%,\s*rgba\(255,\s*255,\s*255,\s*0\.1\)\s*24%,\s*rgba\(255,\s*255,\s*255,\s*0\)\s*52%\s*\)\s*,\s*radial-gradient\(\s*circle at 62% 52%,\s*rgba\(246,\s*221,\s*182,\s*0\.16\)\s*0%,\s*rgba\(246,\s*221,\s*182,\s*0\)\s*26%\s*\)\s*,\s*radial-gradient\(\s*circle at 18% 78%,\s*rgba\(120,\s*174,\s*187,\s*0\.14\)\s*0%,\s*rgba\(120,\s*174,\s*187,\s*0\)\s*34%\s*\)\s*,\s*radial-gradient\(\s*circle at 88% 78%,\s*rgba\(242,\s*214,\s*221,\s*0\.12\)\s*0%,\s*rgba\(242,\s*214,\s*221,\s*0\)\s*32%\s*\)\s*,\s*linear-gradient\(\s*180deg,\s*rgba\(238,\s*244,\s*246,\s*0\.12\)\s*0%,\s*rgba\(184,\s*207,\s*215,\s*0\.16\)\s*38%,\s*rgba\(118,\s*147,\s*162,\s*0\.3\)\s*100%\s*\);[^}]*-webkit-backdrop-filter:\s*blur\(68px\)\s+saturate\(118%\);[^}]*backdrop-filter:\s*blur\(68px\)\s+saturate\(118%\);/
    );
  });

  it("renders pool labels, normalizes snippet note paths for status markers, and keeps explicit insert actions", async () => {
    const queryIdeas = vi.fn(async () => [
      buildIdea({
        fileCreated: true,
        snippetRefs: [{ notePath: "A.md" }, { notePath: "A.md " }, { notePath: "   " }, { notePath: "B.md" }]
      })
    ]);
    const listPools = vi.fn(async () => [{ id: "pool-1", name: "产品池" }]);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    expect(listPools).toHaveBeenCalledTimes(1);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-pool")?.textContent).toBe(
      "产品池"
    );
    expect(
      contentEl
        .querySelectorAll<FakeElement>(".GlitterIdea-picker-modal__result-status")
        .map((marker) => marker.textContent)
    ).toEqual(["已创建文件", "已引用为 2 个片段"]);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-action")?.textContent).toBe("+");
  });

  it("renders query results before pool names resolve and reuses the pool lookup across queries", async () => {
    const pools = createDeferred<Array<{ id: string; name: string }>>();
    const queryIdeas = vi.fn(async ({ text }: { text: string }) =>
      text === "flow"
        ? [buildIdea({ id: "idea-flow", title: "Flow" })]
        : [buildIdea({ id: "idea-1", title: "Start" })]
    );
    const listPools = vi.fn(() => pools.promise);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    expect(listPools).toHaveBeenCalledTimes(1);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result")?.dataset.ideaId).toBe("idea-1");
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-pool")?.textContent).toBe(
      "未命名池"
    );

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    queryInput!.value = "flow";
    queryInput!.dispatchEvent("input");
    await flushMicrotasks();

    expect(listPools).toHaveBeenCalledTimes(1);
    expect(queryIdeas).toHaveBeenNthCalledWith(2, { text: "flow", sort: "updatedAt-desc" });
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result")?.dataset.ideaId).toBe("idea-flow");

    pools.resolve([{ id: "pool-1", name: "产品池" }]);
    await flushMicrotasks(3);

    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-pool")?.textContent).toBe(
      "产品池"
    );
  });

  it("does not insert stale results while the latest query is still loading", async () => {
    const latestQuery = createDeferred<QueryIdea[]>();
    const onPick = vi.fn(async () => undefined);
    const queryIdeas = vi
      .fn<({ text }: { text: string }) => Promise<QueryIdea[]>>()
      .mockResolvedValueOnce([buildIdea({ id: "idea-old", title: "Old" })])
      .mockImplementationOnce(() => latestQuery.promise);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, onPick);
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    queryInput!.value = "new";
    queryInput!.dispatchEvent("input");
    await flushMicrotasks();

    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result--active")).toBeNull();

    const enterEvent = queryInput!.keydown("Enter");
    await flushMicrotasks();

    expect(enterEvent.preventDefault).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();

    latestQuery.resolve([buildIdea({ id: "idea-new", title: "New" })]);
    await flushMicrotasks(3);

    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result--active")).toBeNull();

    queryInput!.keydown("ArrowDown");
    queryInput!.keydown("Enter");
    await flushMicrotasks();

    expect(onPick).toHaveBeenCalledWith("idea-new");
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not insert stale mouse results after the latest query rejects", async () => {
    const rejectedQuery = createDeferred<QueryIdea[]>();
    void rejectedQuery.promise.catch(() => undefined);
    const onPick = vi.fn(async () => undefined);
    const queryIdeas = vi
      .fn<({ text }: { text: string }) => Promise<QueryIdea[]>>()
      .mockResolvedValueOnce([buildIdea({ id: "idea-old", title: "Old" })])
      .mockImplementationOnce(() => rejectedQuery.promise);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, onPick);
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    expect(queryInput).not.toBeNull();
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result")?.dataset.ideaId).toBe("idea-old");

    queryInput!.value = "broken";
    queryInput!.dispatchEvent("input");

    rejectedQuery.reject(new Error("latest query failed"));
    await flushMicrotasks(3);

    const staleButton = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result");
    staleButton?.click();
    await flushMicrotasks();

    expect(onPick).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(staleButton).toBeNull();
    expect((modal as any).isQueryPending).toBe(false);
  });

  it("shows localized English empty-state copy when there are no matching ideas", async () => {
    const plugin = {
      app: {},
      settings: {
        interfaceLanguage: "en"
      },
      ideaService: {
        queryIdeas: vi.fn(async () => [])
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__empty")?.textContent).toBe(
      "No matching ideas found"
    );
  });

  it("moves the active selection with arrow keys and inserts it on Enter", async () => {
    const onPick = vi.fn(async () => undefined);
    const queryIdeas = vi.fn(async () => [
      buildIdea({ id: "idea-1", title: "第一条" }),
      buildIdea({ id: "idea-2", title: "第二条" })
    ]);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, onPick);
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    expect(queryInput).not.toBeNull();
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result--active")).toBeNull();

    const firstDownEvent = queryInput!.keydown("ArrowDown");
    expect(firstDownEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result--active")?.dataset.ideaId).toBe(
      "idea-1"
    );

    const downEvent = queryInput!.keydown("ArrowDown");
    expect(downEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result--active")?.dataset.ideaId).toBe(
      "idea-2"
    );

    const upEvent = queryInput!.keydown("ArrowUp");
    expect(upEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result--active")?.dataset.ideaId).toBe(
      "idea-1"
    );

    queryInput!.keydown("ArrowDown");
    const enterEvent = queryInput!.keydown("Enter");
    await flushMicrotasks();

    expect(enterEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("idea-2");
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores repeated Enter while a pick is already in flight", async () => {
    const pickRequest = createDeferred<void>();
    const onPick = vi.fn(() => pickRequest.promise);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas: vi.fn(async () => [buildIdea({ id: "idea-1", title: "Only" })])
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, onPick);
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    queryInput!.keydown("ArrowDown");
    queryInput!.keydown("Enter");
    queryInput!.keydown("Enter");
    await flushMicrotasks();

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(closeSpy).not.toHaveBeenCalled();

    pickRequest.resolve();
    await flushMicrotasks(3);

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores double click while a pick is already in flight", async () => {
    const pickRequest = createDeferred<void>();
    const onPick = vi.fn(() => pickRequest.promise);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas: vi.fn(async () => [buildIdea({ id: "idea-1", title: "Only" })])
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, onPick);
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const button = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result-action");
    button?.click();
    button?.click();
    await flushMicrotasks();

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(closeSpy).not.toHaveBeenCalled();

    pickRequest.resolve();
    await flushMicrotasks(3);

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("closes the modal on Escape key", async () => {
    const plugin = {
      app: {},
      ideaService: {
        queryIdeas: vi.fn(async () => [buildIdea()])
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    const escapeEvent = queryInput!.keydown("Escape");

    expect(escapeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the same query input while updating results on typing", async () => {
    const responses = new Map<string, QueryIdea[]>([
      ["", []],
      ["design", [buildIdea({ id: "idea-design", title: "Design note", body: "Body text" })]],
      ["design flow", [buildIdea({ id: "idea-flow", title: "Design flow", body: "Flow body" })]]
    ]);
    const queryIdeas = vi.fn(async ({ text }: { text: string }) => responses.get(text) ?? []);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    expect(queryInput).not.toBeNull();

    queryInput!.value = "design";
    queryInput!.dispatchEvent("input");
    await flushMicrotasks();

    const sameQueryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    expect(sameQueryInput).toBe(queryInput);
    expect(queryIdeas).toHaveBeenNthCalledWith(2, { text: "design", sort: "updatedAt-desc" });
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result")?.dataset.ideaId).toBe(
      "idea-design"
    );

    queryInput!.value = "design flow";
    queryInput!.dispatchEvent("input");
    await flushMicrotasks();

    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query")).toBe(queryInput);
    expect(queryIdeas).toHaveBeenNthCalledWith(3, { text: "design flow", sort: "updatedAt-desc" });
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result")?.dataset.ideaId).toBe(
      "idea-flow"
    );
  });

  it("skips runtime reconciliation for fast query results that are superseded immediately", async () => {
    const queryIdeas = vi.fn(async ({ text }: { text: string }) => {
      if (text === "first") {
        return [buildIdea({ id: "idea-first", title: "First", body: "First body" })];
      }

      if (text === "second") {
        return [buildIdea({ id: "idea-second", title: "Second", body: "Second body" })];
      }

      return [];
    });

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    expect(queryInput).not.toBeNull();

    queryInput!.value = "first";
    queryInput!.dispatchEvent("input");
    queryInput!.value = "second";
    queryInput!.dispatchEvent("input");
    await flushMicrotasks(4);

    expect(runtimeReconcileMock).toHaveBeenCalledTimes(1);
    expect(runtimeReconcileMock.mock.calls[0]?.[2].map((idea: QueryIdea) => idea.id)).toEqual(["idea-second"]);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result")?.dataset.ideaId).toBe("idea-second");
  });

  it("keeps the latest query results when responses resolve out of order", async () => {
    const initialQuery = createDeferred<QueryIdea[]>();
    const olderQuery = createDeferred<QueryIdea[]>();
    const latestQuery = createDeferred<QueryIdea[]>();

    const queryIdeas = vi
      .fn<({ text }: { text: string }) => Promise<QueryIdea[]>>()
      .mockImplementationOnce(() => initialQuery.promise)
      .mockImplementationOnce(() => olderQuery.promise)
      .mockImplementationOnce(() => latestQuery.promise);

    const plugin = {
      app: {},
      ideaService: {
        queryIdeas
      },
      poolService: {
        listPools: vi.fn(async () => [])
      }
    };

    const modal = new IdeaPickerModal(plugin as any, vi.fn(async () => undefined));
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();

    const queryInput = contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__query");
    expect(queryInput).not.toBeNull();

    initialQuery.resolve([]);
    await flushMicrotasks(3);

    queryInput!.value = "first";
    queryInput!.dispatchEvent("input");
    queryInput!.value = "second";
    queryInput!.dispatchEvent("input");

    expect(queryIdeas).toHaveBeenNthCalledWith(2, { text: "first", sort: "updatedAt-desc" });
    expect(queryIdeas).toHaveBeenNthCalledWith(3, { text: "second", sort: "updatedAt-desc" });

    latestQuery.resolve([buildIdea({ id: "idea-second", title: "Second", body: "Latest" })]);
    await flushMicrotasks(3);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result")?.dataset.ideaId).toBe(
      "idea-second"
    );
    expect(runtimeReconcileMock).toHaveBeenCalledTimes(1);
    expect(runtimeReconcileMock.mock.calls[0]?.[2].map((idea: QueryIdea) => idea.id)).toEqual(["idea-second"]);

    olderQuery.resolve([buildIdea({ id: "idea-first", title: "First", body: "Stale" })]);
    await flushMicrotasks(3);
    expect(contentEl.querySelector<FakeElement>(".GlitterIdea-picker-modal__result")?.dataset.ideaId).toBe(
      "idea-second"
    );
    expect(runtimeReconcileMock).toHaveBeenCalledTimes(1);
  });
});
