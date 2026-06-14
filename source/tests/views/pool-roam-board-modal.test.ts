import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PoolRoamBoardRecord } from "../../src/application/pool-workbench/pool-roam-workflow";
import { PoolRoamBoardModal, type PoolRoamBoardModalOpenInRoamDecision } from "../../src/views/pool-roam-board-modal";

const stylesCss = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

type FakeListener = () => void;

function getSelectorBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  if (!match) {
    throw new Error(`Selector not found: ${selector}`);
  }

  return match[0];
}

function expectDeclarationsInSelectorBlock(css: string, selector: string, declarations: string[]): void {
  const block = getSelectorBlock(css, selector);
  declarations.forEach((declaration) => {
    expect(block).toContain(declaration);
  });
}

class FakeElement {
  className = "";
  type = "";
  disabled = false;
  dataset: Record<string, string> = {};
  children: FakeElement[] = [];

  private _textContent = "";
  private readonly listeners = new Map<string, FakeListener[]>();
  private readonly attributes = new Map<string, string>();

  get textContent(): string {
    const childText = this.children.map((child) => child.textContent).join("");
    return `${this._textContent}${childText}`;
  }

  set textContent(value: string) {
    this._textContent = value;
  }

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

  addClass(className: string): void {
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    classes.add(className);
    this.className = Array.from(classes).join(" ");
  }

  removeClass(className: string): void {
    this.className = this.className
      .split(/\s+/)
      .filter((token) => token && token !== className)
      .join(" ");
  }

  addEventListener(type: string, listener: FakeListener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  click(): void {
    const listeners = this.listeners.get("click") ?? [];
    listeners.forEach((listener) => listener());
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "type") {
      this.type = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
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

vi.mock("obsidian", () => ({
  Modal: class {
    containerEl = { addClass() {}, removeClass() {} };
    modalEl = { addClass() {}, removeClass() {} };
    contentEl = { empty() {} };

    constructor(public readonly app: unknown) {}

    close() {}
  }
}));

describe("PoolRoamBoardModal", () => {
  function flushMicrotasks(times = 3): Promise<void> {
    let chain = Promise.resolve();
    for (let index = 0; index < times; index += 1) {
      chain = chain.then(() => Promise.resolve());
    }
    return chain;
  }

  function createDeferred<T>() {
    let resolve: (value: T) => void;
    let reject: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return {
      promise,
      resolve: resolve!,
      reject: reject!
    };
  }

  function attachModalHost(modal: PoolRoamBoardModal) {
    const addClass = vi.fn();
    const removeClass = vi.fn();
    const empty = vi.fn(function (this: FakeElement) {
      this.clear();
    });

    const containerEl = { addClass, removeClass };
    const modalEl = { addClass, removeClass };
    const contentEl = new FakeElement() as FakeElement & {
      empty: () => void;
      addClass: (className: string) => void;
      removeClass: (className: string) => void;
    };
    const applyContentAddClass = FakeElement.prototype.addClass.bind(contentEl);
    const applyContentRemoveClass = FakeElement.prototype.removeClass.bind(contentEl);
    const contentAddClass = vi.fn((className: string) => {
      applyContentAddClass(className);
    });
    const contentRemoveClass = vi.fn((className: string) => {
      applyContentRemoveClass(className);
    });
    contentEl.empty = empty.bind(contentEl);
    contentEl.addClass = contentAddClass;
    contentEl.removeClass = contentRemoveClass;

    (modal as any).containerEl = containerEl;
    (modal as any).modalEl = modalEl;
    (modal as any).contentEl = contentEl;

    return { addClass, removeClass, contentAddClass, contentRemoveClass, empty, contentEl };
  }

  it("mounts the active historical board and navigates across the full board list inside one modal", async () => {
    const boards = [
      {
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [{ id: "pool-product", name: "产品池", color: "#6ab5ff" }],
        thumbnailBoxes: []
      },
      {
        path: "Glitter/灵感漫游/board-b.canvas",
        name: "board-b",
        updatedAt: 1716700000000,
        relatedPools: [{ id: "pool-writing", name: "写作池", color: "#ffd468" }],
        thumbnailBoxes: []
      },
      {
        path: "Glitter/灵感漫游/board-c.canvas",
        name: "board-c",
        updatedAt: 1716600000000,
        relatedPools: [],
        thumbnailBoxes: []
      }
    ];
    const mountModalBoard = vi.fn(async () => undefined);
    const modal = new PoolRoamBoardModal(
      {} as any,
      boards,
      1,
      {},
      {
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard,
          destroy: vi.fn()
        }
      }
    );
    const { addClass, contentAddClass, contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    expect(addClass).toHaveBeenCalledWith("glitter-pool-roam-board-modal-host");
    expect(addClass).toHaveBeenCalledWith("glitter-pool-roam-board-modal");
    expect(contentAddClass).toHaveBeenCalledWith("glitter-pool-roam-board-modal__content");
    expect(contentEl.textContent).toContain("board-b");
    expect(contentEl.textContent).toContain("Glitter/灵感漫游/board-b.canvas");
    expect(contentEl.textContent).toContain("写作池");

    const canvasHostEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__canvas-host");
    expect(canvasHostEl).not.toBeNull();
    expect(mountModalBoard).toHaveBeenCalledWith(canvasHostEl, "Glitter/灵感漫游/board-b.canvas");

    let navButtons = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-board-modal__nav-button");
    expect(navButtons).toHaveLength(2);
    expect(navButtons[0]?.disabled).toBe(false);
    expect(navButtons[1]?.disabled).toBe(false);

    navButtons[0]?.click();
    await flushMicrotasks();

    expect(mountModalBoard).toHaveBeenNthCalledWith(2, canvasHostEl, "Glitter/灵感漫游/board-a.canvas");
    expect(contentEl.textContent).toContain("board-a");

    navButtons = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-board-modal__nav-button");
    expect(navButtons[0]?.disabled).toBe(true);
    expect(navButtons[1]?.disabled).toBe(false);

    navButtons[1]?.click();
    await flushMicrotasks();

    expect(mountModalBoard).toHaveBeenNthCalledWith(3, canvasHostEl, "Glitter/灵感漫游/board-b.canvas");

    navButtons = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-board-modal__nav-button");
    navButtons[1]?.click();
    await flushMicrotasks();

    expect(mountModalBoard).toHaveBeenNthCalledWith(4, canvasHostEl, "Glitter/灵感漫游/board-c.canvas");
    expect(contentEl.textContent).toContain("board-c");

    navButtons = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-board-modal__nav-button");
    expect(navButtons[0]?.disabled).toBe(false);
    expect(navButtons[1]?.disabled).toBe(true);
  });

  it("renders the open-in-roam meta-row action, ordered meta row, and forwards the active board", async () => {
    const boards: PoolRoamBoardRecord[] = [
      {
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [
          { id: "pool-product", name: "Product Pool", color: "#6ab5ff" },
          { id: "pool-writing", name: "Writing Pool", color: "#ffd468" }
        ],
        thumbnailBoxes: [
          { id: "source-1", kind: "source" },
          { id: "source-2", kind: "source" },
          { id: "group-1", kind: "group" }
        ] as any
      },
      {
        path: "Glitter/灵感漫游/board-b.canvas",
        name: "board-b",
        updatedAt: 1716700000000,
        relatedPools: [],
        thumbnailBoxes: []
      }
    ];
    const mountModalBoard = vi.fn(async () => undefined);
    const onOpenInRoam = vi.fn(() => ({ type: "keep-open" }));
    const modal = new PoolRoamBoardModal(
      {} as any,
      boards,
      0,
      { onOpenInRoam } as any,
      {
        interfaceLanguage: "en",
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard,
          destroy: vi.fn()
        }
      }
    );
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    const openInRoamButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__open-in-roam");
    const metaRowEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__meta-row");
    const metaEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__meta");
    const navCountEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__nav-count");
    const navButtons = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-board-modal__nav-button");
    expect(openInRoamButton).not.toBeNull();
    expect(metaRowEl).not.toBeNull();
    expect(metaEl).not.toBeNull();
    expect(navCountEl).not.toBeNull();
    expect(navButtons).toHaveLength(2);
    expect(navButtons[0]?.querySelector(".glitter-write-stage__icon--chevron-left")).not.toBeNull();
    expect(navButtons[1]?.querySelector(".glitter-write-stage__icon--chevron-right")).not.toBeNull();
    expect(openInRoamButton?.textContent).toBe("Open in Roam");
    expect(openInRoamButton?.getAttribute("aria-label")).toBe("Open in Roam");
    expect(openInRoamButton?.getAttribute("title")).toBe("Open in Roam");
    expect(openInRoamButton?.querySelector(".glitter-pool-stage__results-tool-icon--roam")).not.toBeNull();
    expect(openInRoamButton?.querySelector<FakeElement>(".glitter-pool-roam-board-modal__open-in-roam-label")?.textContent).toBe("Open in Roam");
    expect(openInRoamButton?.disabled).toBe(false);
    expect(navCountEl?.textContent).toBe("1 / 2");
    expect(metaRowEl?.children[0]?.className).toBe("glitter-pool-roam-board-modal__meta");
    expect(metaRowEl?.children[1]?.className).toBe("glitter-pool-roam-board-modal__open-in-roam");

    const metaTexts = metaEl?.children.map((child) => child.textContent) ?? [];
    expect(metaTexts).toHaveLength(4);
    expect(metaTexts[0]).toBe("Product Pool");
    expect(metaTexts[1]).toBe("Writing Pool");
    expect(metaTexts[2]).toContain("Last updated:");
    expect(metaTexts[3]).toBe("2 source ideas");
    expect(metaTexts).not.toContain("1 / 2");

    openInRoamButton?.click();
    await flushMicrotasks();

    expect(onOpenInRoam).toHaveBeenCalledWith(boards[0]);
  });

  it("renders floating download, share, and add-idea-block actions for the active historical board", async () => {
    const boards: PoolRoamBoardRecord[] = [
      {
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [],
        thumbnailBoxes: []
      },
      {
        path: "Glitter/灵感漫游/board-b.canvas",
        name: "board-b",
        updatedAt: 1716700000000,
        relatedPools: [],
        thumbnailBoxes: []
      }
    ];
    const updatedBoards: PoolRoamBoardRecord[] = [
      boards[0],
      {
        ...boards[1],
        updatedAt: 1716801000000,
        relatedPools: [{ id: "pool-product", name: "产品池", color: "#6ab5ff" }]
      }
    ];
    const onDownloadBoard = vi.fn(async () => undefined);
    const onShareBoard = vi.fn();
    const mountModalBoard = vi.fn(async () => undefined);
    const onAddIdeaBlock = vi.fn((_board: unknown, callbacks: { onAttached: (nextBoards?: PoolRoamBoardRecord[]) => void }) => {
      callbacks.onAttached(updatedBoards);
    });
    const modal = new PoolRoamBoardModal(
      {} as any,
      boards,
      0,
      { onDownloadBoard, onShareBoard, onAddIdeaBlock },
      {
        interfaceLanguage: "en",
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard,
          destroy: vi.fn()
        }
      }
    );
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    const floatingActions = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__floating-actions");
    const downloadButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__floating-action--download");
    const shareButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__floating-action--share");
    const addIdeaBlockButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__floating-action--idea-block");
    const closeButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__close");
    const canvasHostEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__canvas-host");
    expect(floatingActions).not.toBeNull();
    expect(downloadButton).not.toBeNull();
    expect(shareButton).not.toBeNull();
    expect(addIdeaBlockButton).not.toBeNull();
    expect(closeButton).not.toBeNull();
    expect(canvasHostEl).not.toBeNull();
    expect(downloadButton?.disabled).toBe(false);
    expect(shareButton?.disabled).toBe(false);
    expect(addIdeaBlockButton?.disabled).toBe(false);
    expect(downloadButton?.getAttribute("aria-label")).toBe("Download current historical roam board");
    expect(shareButton?.getAttribute("aria-label")).toBe("Share current historical roam board");
    expect(addIdeaBlockButton?.getAttribute("aria-label")).toBe("Add idea block to the current historical roam board");
    expect(closeButton?.getAttribute("aria-label")).toBe("Close roam board preview");

    downloadButton?.click();
    await flushMicrotasks();
    expect(onDownloadBoard).toHaveBeenCalledWith(boards[0]);

    const navButtons = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-board-modal__nav-button");
    navButtons[1]?.click();
    await flushMicrotasks();

    shareButton?.click();
    expect(onShareBoard).toHaveBeenCalledWith(boards[1], shareButton);

    addIdeaBlockButton?.click();
    await flushMicrotasks();
    expect(onAddIdeaBlock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Glitter/灵感漫游/board-b.canvas" }),
      expect.objectContaining({ onAttached: expect.any(Function) })
    );
    expect(contentEl.textContent).toContain("产品池");
    expect(mountModalBoard).toHaveBeenNthCalledWith(3, canvasHostEl, "Glitter/灵感漫游/board-b.canvas");
  });

  it("routes open-in-roam handler rejections through onOpenError", async () => {
    const error = new Error("open-in-roam failed");
    const boards: PoolRoamBoardRecord[] = [{
      path: "Glitter/灵感漫游/board-a.canvas",
      name: "board-a",
      updatedAt: 1716800000000,
      relatedPools: [],
      thumbnailBoxes: []
    }];
    const onOpenError = vi.fn();
    const onOpenInRoam = vi.fn(async () => {
      throw error;
    });
    const modal = new PoolRoamBoardModal(
      {} as any,
      boards,
      0,
      { onOpenError, onOpenInRoam } as any,
      {
        interfaceLanguage: "en",
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard: vi.fn(async () => undefined),
          destroy: vi.fn()
        }
      }
    );
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const openInRoamButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__open-in-roam");
    openInRoamButton?.click();
    await flushMicrotasks();

    expect(onOpenError).toHaveBeenCalledWith(error);
    expect(closeSpy).not.toHaveBeenCalled();
    expect(contentEl.querySelector(".glitter-pool-roam-board-modal__open-in-roam-confirm")).toBeNull();
  });

  it("ignores stale open-in-roam async results after navigation and board replacement", async () => {
    const boards: PoolRoamBoardRecord[] = [
      {
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [],
        thumbnailBoxes: []
      },
      {
        path: "Glitter/灵感漫游/board-b.canvas",
        name: "board-b",
        updatedAt: 1716700000000,
        relatedPools: [],
        thumbnailBoxes: []
      }
    ];
    const replacementBoards: PoolRoamBoardRecord[] = [{
      path: "Glitter/灵感漫游/board-c.canvas",
      name: "board-c",
      updatedAt: 1716600000000,
      relatedPools: [],
      thumbnailBoxes: []
    }];
    const firstDecision = createDeferred<PoolRoamBoardModalOpenInRoamDecision>();
    const secondDecision = createDeferred<PoolRoamBoardModalOpenInRoamDecision>();
    const onOpenInRoam = vi.fn()
      .mockImplementationOnce(() => firstDecision.promise)
      .mockImplementationOnce(() => secondDecision.promise);
    const onAddIdeaBlock = vi.fn((_board: unknown, callbacks: { onAttached: (nextBoards?: PoolRoamBoardRecord[]) => void }) => {
      callbacks.onAttached(replacementBoards);
    });
    const modal = new PoolRoamBoardModal(
      {} as any,
      boards,
      0,
      { onOpenInRoam, onAddIdeaBlock } as any,
      {
        interfaceLanguage: "en",
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard: vi.fn(async () => undefined),
          destroy: vi.fn()
        }
      }
    );
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const openInRoamButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__open-in-roam");
    const addIdeaBlockButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__floating-action--idea-block");
    const navButtons = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-board-modal__nav-button");
    const titleEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__title");

    openInRoamButton?.click();
    navButtons[1]?.click();
    await flushMicrotasks();

    firstDecision.resolve({
      type: "confirm",
      onConfirm: vi.fn(async () => true)
    });
    await flushMicrotasks();

    expect(titleEl?.textContent).toBe("board-b");
    expect(contentEl.querySelector(".glitter-pool-roam-board-modal__open-in-roam-confirm")).toBeNull();
    expect(closeSpy).not.toHaveBeenCalled();

    openInRoamButton?.click();
    addIdeaBlockButton?.click();
    await flushMicrotasks();

    secondDecision.resolve({ type: "close" });
    await flushMicrotasks();

    expect(titleEl?.textContent).toBe("board-c");
    expect(contentEl.querySelector(".glitter-pool-roam-board-modal__open-in-roam-confirm")).toBeNull();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("ignores stale open-in-roam async results after close", async () => {
    const boards: PoolRoamBoardRecord[] = [{
      path: "Glitter/灵感漫游/board-a.canvas",
      name: "board-a",
      updatedAt: 1716800000000,
      relatedPools: [],
      thumbnailBoxes: []
    }];
    const deferredDecision = createDeferred<PoolRoamBoardModalOpenInRoamDecision>();
    const onOpenInRoam = vi.fn(() => deferredDecision.promise);
    const modal = new PoolRoamBoardModal(
      {} as any,
      boards,
      0,
      { onOpenInRoam } as any,
      {
        interfaceLanguage: "en",
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard: vi.fn(async () => undefined),
          destroy: vi.fn()
        }
      }
    );
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const openInRoamButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__open-in-roam");
    openInRoamButton?.click();
    modal.onClose();

    deferredDecision.resolve({ type: "close" });
    await flushMicrotasks();

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("clears stale board content and disables controls when board replacement leaves no active board", async () => {
    const boards: PoolRoamBoardRecord[] = [
      {
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [{ id: "pool-product", name: "Product Pool", color: "#6ab5ff" }],
        thumbnailBoxes: [{ id: "source-1", kind: "source" }] as any
      }
    ];
    const onDownloadBoard = vi.fn(async () => undefined);
    const onShareBoard = vi.fn();
    const onOpenInRoam = vi.fn(() => ({ type: "keep-open" }));
    const onAddIdeaBlock = vi.fn((_board: unknown, callbacks: { onAttached: (nextBoards?: PoolRoamBoardRecord[]) => void }) => {
      callbacks.onAttached([]);
    });
    const mountModalBoard = vi.fn(async (mountEl: HTMLElement, boardPath: string) => {
      const fakeMountEl = mountEl as unknown as FakeElement;
      fakeMountEl.empty();
      fakeMountEl.createDiv({ text: `rendered:${boardPath}` });
    });
    const modal = new PoolRoamBoardModal(
      {} as any,
      boards,
      0,
      { onDownloadBoard, onShareBoard, onAddIdeaBlock, onOpenInRoam } as any,
      {
        interfaceLanguage: "en",
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard,
          destroy: vi.fn()
        }
      }
    );
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();
    await flushMicrotasks();

    const titleEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__title");
    const pathEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__path");
    const metaEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__meta");
    const canvasHostEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__canvas-host");
    const navCountEl = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__nav-count");
    const openInRoamButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__open-in-roam");
    const downloadButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__floating-action--download");
    const shareButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__floating-action--share");
    const addIdeaBlockButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__floating-action--idea-block");
    const navButtons = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-board-modal__nav-button");

    expect(titleEl?.textContent).toBe("board-a");
    expect(pathEl?.textContent).toBe("Glitter/灵感漫游/board-a.canvas");
    expect(metaEl?.children).toHaveLength(3);
    expect(canvasHostEl?.textContent).toBe("rendered:Glitter/灵感漫游/board-a.canvas");
    expect(navCountEl?.textContent).toBe("1 / 1");
    expect(openInRoamButton?.disabled).toBe(false);
    expect(downloadButton?.disabled).toBe(false);
    expect(shareButton?.disabled).toBe(false);
    expect(addIdeaBlockButton?.disabled).toBe(false);
    expect(navButtons[0]?.disabled).toBe(true);
    expect(navButtons[1]?.disabled).toBe(true);

    addIdeaBlockButton?.click();
    await flushMicrotasks();

    expect(titleEl?.textContent).toBe("");
    expect(pathEl?.textContent).toBe("");
    expect(metaEl?.children).toHaveLength(0);
    expect(canvasHostEl?.textContent).toBe("");
    expect(canvasHostEl?.dataset.boardPath ?? "").toBe("");
    expect(navCountEl?.textContent).toBe("0 / 0");
    expect(openInRoamButton?.disabled).toBe(true);
    expect(downloadButton?.disabled).toBe(true);
    expect(shareButton?.disabled).toBe(true);
    expect(addIdeaBlockButton?.disabled).toBe(true);
    expect(navButtons[0]?.disabled).toBe(true);
    expect(navButtons[1]?.disabled).toBe(true);
  });

  it("shows an in-modal confirm flow for opening a historical board in roam", async () => {
    const boards: PoolRoamBoardRecord[] = [
      {
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [],
        thumbnailBoxes: []
      }
    ];
    const onConfirm = vi.fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const onOpenInRoam = vi.fn(() => ({
      type: "confirm",
      onConfirm
    }));
    const modal = new PoolRoamBoardModal(
      {} as any,
      boards,
      0,
      { onOpenInRoam } as any,
      {
        interfaceLanguage: "en",
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard: vi.fn(async () => undefined),
          destroy: vi.fn()
        }
      }
    );
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    const openInRoamButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__open-in-roam");
    expect(openInRoamButton).not.toBeNull();

    openInRoamButton?.click();
    await flushMicrotasks();

    let confirmHost = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__open-in-roam-confirm");
    let confirmDialog = contentEl.querySelector<FakeElement>(".glitter-pool-roam-board-modal__open-in-roam-confirm-dialog");
    let confirmTitle = contentEl.querySelector<FakeElement>(".glitter-write-stage__close-confirm-title");
    let confirmDescription = contentEl.querySelector<FakeElement>(".glitter-write-stage__close-confirm-description");
    let secondaryButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__close-confirm-secondary");
    let primaryButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__close-confirm-primary");
    expect(confirmHost).not.toBeNull();
    expect(confirmDialog).not.toBeNull();
    expect(confirmTitle?.textContent).toBe("Another roam board is open");
    expect(confirmDescription?.textContent).toContain("board-a");
    expect(secondaryButton?.textContent).toBe("Keep previewing history");
    expect(primaryButton?.textContent).toBe("Open in Roam");

    secondaryButton?.click();
    await flushMicrotasks();

    expect(contentEl.querySelector(".glitter-pool-roam-board-modal__open-in-roam-confirm")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    openInRoamButton?.click();
    await flushMicrotasks();

    primaryButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__close-confirm-primary");
    primaryButton?.click();
    await flushMicrotasks();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(closeSpy).not.toHaveBeenCalled();
    expect(contentEl.querySelector(".glitter-pool-roam-board-modal__open-in-roam-confirm")).toBeNull();

    openInRoamButton?.click();
    await flushMicrotasks();

    primaryButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__close-confirm-primary");
    primaryButton?.click();
    await flushMicrotasks();

    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("reports mount failures and closes only the board modal", async () => {
    const onOpenError = vi.fn();
    const modal = new PoolRoamBoardModal(
      {} as any,
      [{
        path: "Glitter/灵感漫游/broken.canvas",
        name: "broken",
        updatedAt: 1716800000000,
        relatedPools: [],
        thumbnailBoxes: []
      }],
      0,
      { onOpenError },
      {
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard: vi.fn(async () => {
            throw new Error("broken");
          }),
          destroy: vi.fn()
        }
      }
    );
    attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();
    await flushMicrotasks();

    expect(onOpenError).toHaveBeenCalledWith(expect.any(Error));
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("destroys the modal canvas host and clears classes on close", () => {
    const destroy = vi.fn();
    const onClose = vi.fn();
    const modal = new PoolRoamBoardModal(
      {} as any,
      [{
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [],
        thumbnailBoxes: []
      }],
      0,
      { onClose },
      {
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard: vi.fn(async () => undefined),
          destroy
        }
      }
    );
    const { removeClass, contentRemoveClass, empty } = attachModalHost(modal);

    modal.onClose();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(removeClass).toHaveBeenCalledWith("glitter-pool-roam-board-modal-host");
    expect(removeClass).toHaveBeenCalledWith("glitter-pool-roam-board-modal");
    expect(contentRemoveClass).toHaveBeenCalledWith("glitter-pool-roam-board-modal__content");
    expect(empty).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("styles the board modal as a large glass canvas surface with inline history navigation", () => {
    expect(stylesCss).toContain(".glitter-pool-roam-board-modal-host .modal-bg");
    expect(stylesCss).toContain(".glitter-pool-roam-board-modal {\n  width: min(1120px, calc(100vw - 40px));");
    expect(stylesCss).toContain("height: min(760px, calc(100vh - 40px));");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__canvas", [
      "position: relative;",
      "min-height: 0;",
      "border-radius: 16px;",
      "overflow: hidden;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__floating-actions", [
      "position: absolute;",
      "display: inline-flex;",
      "left: 16px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__floating-action", [
      "display: grid;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 76%, transparent);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__canvas-host", [
      "width: 100%;",
      "height: 100%;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__meta", [
      "display: flex;",
      "flex-wrap: wrap;",
      "gap: 8px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__meta-row", [
      "display: flex;",
      "align-items: center;",
      "justify-content: space-between;",
      "flex-wrap: wrap;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__header-actions", [
      "display: flex;",
      "align-items: center;",
      "gap: 10px;",
      "flex-wrap: wrap;",
      "justify-content: flex-end;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__nav", [
      "display: inline-flex;",
      "align-items: center;",
      "gap: 8px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, "button.glitter-pool-roam-board-modal__nav-button,\nbutton.glitter-pool-roam-board-modal__open-in-roam", [
      "all: unset;",
      "display: grid;",
      "place-items: center;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, transparent);",
      "border: none;",
      "color: var(--glitter-ui-text);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__nav-button", [
      "width: 32px;",
      "height: 32px;",
      "min-width: 32px;",
      "min-height: 32px;",
      "border-radius: 999px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__open-in-roam", [
      "flex: 0 0 auto;",
      "margin-left: auto;"
    ]);
    expect(stylesCss).toContain(`button.glitter-pool-roam-board-modal__open-in-roam {
  width: auto;
  min-width: 0;
  min-height: 32px;
  padding: 0 12px 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}`);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__open-in-roam-label", [
      "font-size: 12px;",
      "line-height: 1;",
      "font-weight: 600;",
      "white-space: nowrap;"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-roam-board-modal__nav-button:hover:not(:disabled),\n.glitter-pool-roam-board-modal__nav-button:focus-visible,\n.glitter-pool-roam-board-modal__open-in-roam:hover:not(:disabled),\n.glitter-pool-roam-board-modal__open-in-roam:focus-visible",
      [
        "background: color-mix(in srgb, var(--glitter-ui-surface) 72%, var(--glitter-ui-accent) 24%);",
        "color: var(--glitter-ui-accent);"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-roam-board-modal__nav-button:focus-visible,\n.glitter-pool-roam-board-modal__open-in-roam:focus-visible",
      [
        "outline: 2px solid color-mix(in srgb, var(--glitter-ui-accent) 68%, white 32%);",
        "outline-offset: 2px;"
      ]
    );
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__open-in-roam:disabled", [
      "opacity: 0.42;",
      "cursor: default;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__open-in-roam-confirm", [
      "position: absolute;",
      "inset: 0;",
      "display: grid;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__open-in-roam-confirm-dialog", [
      "width: min(420px, calc(100% - 24px));"
    ]);
  });
});
