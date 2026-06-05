import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PoolRoamHistoryModal } from "../../src/views/pool-roam-history-modal";

const stylesCss = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

type FakeEvent = {
  key?: string;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

type FakeListener = (event?: FakeEvent) => void;

type RoamBoardRecord = {
  path: string;
  name: string;
  updatedAt: number;
  relatedPools: Array<{ id: string; name: string; color: string }>;
  thumbnailBoxes: Array<{ nodeId?: string; x: number; y: number; width: number; height: number; kind: "source" | "plain" }>;
  thumbnailEdges?: Array<{ fromNodeId: string; toNodeId: string }>;
};

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
  value = "";
  placeholder = "";
  disabled = false;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: FakeElement[] = [];

  private _textContent = "";
  private _scrollTop = 0;
  private readonly listeners = new Map<string, FakeListener[]>();

  get scrollTop(): number {
    return this._scrollTop;
  }

  set scrollTop(value: number) {
    this._scrollTop = this.children.length === 0 ? 0 : value;
  }

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
    this._scrollTop = 0;
  }

  empty(): void {
    this.clear();
  }

  setCssStyles(styles: Record<string, string>): void {
    Object.assign(this.style, styles);
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
    if (this.disabled) {
      return;
    }

    this.trigger("click", {
      stopPropagation() {}
    });
  }

  keydown(key: string): void {
    this.trigger("keydown", {
      key,
      preventDefault() {},
      stopPropagation() {}
    });
  }

  trigger(type: string, event?: FakeEvent): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.forEach((listener) => listener(event));
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name === "type") {
      this.type = value;
    }
  }

  getAttribute(name: string): string | null {
    if (name === "type") {
      return this.type || null;
    }

    return this.attributes[name] ?? null;
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

describe("PoolRoamHistoryModal", () => {
  function attachModalHost(modal: PoolRoamHistoryModal) {
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

  it("renders the fixed history toolbar, supports view switching, and filters records by search", () => {
    const boards: RoamBoardRecord[] = [
      {
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [{ id: "pool-product", name: "产品池", color: "#6ab5ff" }],
        thumbnailBoxes: [
          { nodeId: "source-block-1", x: 24, y: 48, width: 280, height: 180, kind: "source" },
          { nodeId: "node-plain", x: 360, y: 72, width: 180, height: 120, kind: "plain" }
        ],
        thumbnailEdges: [{ fromNodeId: "source-block-1", toNodeId: "node-plain" }]
      },
      {
        path: "Glitter/灵感漫游/board-b.canvas",
        name: "board-b",
        updatedAt: 1716700000000,
        relatedPools: [{ id: "pool-research", name: "研究池", color: "#ffd468" }],
        thumbnailBoxes: []
      }
    ];
    const onSelectBoard = vi.fn();
    const modal = new PoolRoamHistoryModal({} as any, boards, { onSelectBoard });
    const { addClass, contentAddClass, contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();

    expect(addClass).toHaveBeenCalledWith("glitter-pool-roam-history-modal-host");
    expect(addClass).toHaveBeenCalledWith("glitter-pool-roam-history-modal");
    expect(contentAddClass).toHaveBeenCalledWith("glitter-pool-roam-history-modal__content");
    expect(contentEl.textContent).toContain("漫游白板历史");
    expect(contentEl.textContent).toContain("共 2 块漫游白板");
    expect(contentEl.textContent).toContain("1 个来源灵感");

    const toolbar = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__toolbar");
    const recordsFooter = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__records-footer");
    const searchInput = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__search");
    const gridToggle = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__view-toggle--grid");
    const listToggle = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__view-toggle--list");
    const batchToggle = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-toggle");
    const batchFooter = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-footer");
    const batchCancel = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-cancel");
    const batchDelete = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-delete");
    const closeButton = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__close");
    const list = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__list");
    const previewBoxes = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__thumbnail-box");
    const previewEdges = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__thumbnail-edge");
    const previewLines = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__thumbnail-box-line");
    const emptyPreview = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__preview-empty");
    const poolTags = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__chip");
    const updatedTimes = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card-updated");
    const cards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card");

    expect(toolbar).not.toBeNull();
    expect(recordsFooter?.textContent).toContain("共 2 块漫游白板");
    expect(searchInput?.type).toBe("text");
    expect(searchInput?.placeholder).toBe("搜索漫游板记录");
    expect(gridToggle?.getAttribute("aria-label")).toBe("切换到缩略图模式");
    expect(listToggle?.getAttribute("aria-label")).toBe("切换到列表模式");
    expect(batchToggle?.getAttribute("aria-label")).toBe("批量整理");
    expect(gridToggle?.getAttribute("aria-pressed")).toBe("true");
    expect(listToggle?.getAttribute("aria-pressed")).toBe("false");
    expect(batchFooter?.style.display).toBe("none");
    expect(batchCancel?.textContent).toBe("");
    expect(batchDelete?.textContent).toBe("");
    expect(batchCancel?.getAttribute("aria-label")).toBe("取消批量整理");
    expect(batchDelete?.getAttribute("aria-label")).toBe("删除选中的漫游白板");
    expect(batchCancel?.querySelector<FakeElement>(".glitter-write-stage__icon--close")).not.toBeNull();
    expect(batchDelete?.querySelector<FakeElement>(".glitter-write-stage__icon--trash")).not.toBeNull();
    expect(closeButton?.type).toBe("button");
    expect(closeButton?.getAttribute("aria-label")).toBe("关闭漫游白板历史");
    expect(list?.className).toContain("glitter-pool-roam-history-modal__list--grid");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.type).toBe("div");
    expect(cards[0]?.getAttribute("role")).toBe("button");
    expect(cards[0]?.getAttribute("tabindex")).toBe("0");
    expect(cards[0]?.getAttribute("aria-label")).toBe("打开漫游白板 board-a");
    expect(cards[0]?.getAttribute("aria-pressed")).toBeNull();
    expect(cards[0]?.dataset.boardPath).toBe("Glitter/灵感漫游/board-a.canvas");
    expect(cards[0]?.dataset.boardIndex).toBe("0");
    expect(previewBoxes).toHaveLength(2);
    expect(previewBoxes[0]?.dataset.boxKind).toBe("source");
    expect(previewBoxes[0]?.dataset.nodeId).toBe("source-block-1");
    expect(previewBoxes[0]?.dataset.boxWidth).toBe("280");
    expect(previewEdges).toHaveLength(1);
    expect(previewEdges[0]?.dataset.fromNodeId).toBe("source-block-1");
    expect(previewEdges[0]?.dataset.toNodeId).toBe("node-plain");
    expect(previewLines).toHaveLength(4);
    expect(emptyPreview?.textContent).toContain("暂无缩略图");
    expect(updatedTimes[0]?.dataset.role).toBe("updated-time");
    expect(poolTags[0]?.dataset.role).toBe("pool-tag");
    expect(poolTags[0]?.dataset.poolId).toBe("pool-product");

    cards[1]?.keydown("Enter");
    expect(onSelectBoard).toHaveBeenCalledWith(boards[1], 1);
    expect(closeSpy).not.toHaveBeenCalled();

    listToggle?.click();
    const listModeList = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__list");
    const listModeCards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card");
    expect(gridToggle?.getAttribute("aria-pressed")).toBe("false");
    expect(listToggle?.getAttribute("aria-pressed")).toBe("true");
    expect(listModeList?.className).toContain("glitter-pool-roam-history-modal__list--list");
    expect(listModeCards[0]?.className).toContain("glitter-pool-roam-history-modal__card--list");

    expect(batchToggle).not.toBeNull();
    searchInput!.value = "研究池";
    searchInput?.trigger("input");

    const filteredCards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card");
    expect(filteredCards).toHaveLength(1);
    expect(filteredCards[0]?.dataset.boardPath).toBe("Glitter/灵感漫游/board-b.canvas");
  });

  it("keeps the current scroll position when clicking the batch selection circle re-renders the history list", () => {
    const boards: RoamBoardRecord[] = Array.from({ length: 12 }, (_, index) => ({
      path: `Glitter/灵感漫游/board-${index + 1}.canvas`,
      name: `board-${index + 1}`,
      updatedAt: 1716800000000 - index,
      relatedPools: [],
      thumbnailBoxes: []
    }));
    const modal = new PoolRoamHistoryModal({} as any, boards, {});
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();

    contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-toggle")?.click();
    let list = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__list");
    list!.scrollTop = 248;

    const selectionIndicators = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card-select");
    selectionIndicators[8]?.click();

    list = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__list");
    const selectedCards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card--selected");
    expect(list?.scrollTop).toBe(248);
    expect(selectedCards).toHaveLength(1);
    expect(selectedCards[0]?.dataset.boardPath).toBe("Glitter/灵感漫游/board-9.canvas");
  });

  it("supports batch selection, batch cancel, and deleting selected boards without leaving residue", async () => {
    const boards: RoamBoardRecord[] = [
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
        relatedPools: [],
        thumbnailBoxes: []
      }
    ];
    const onSelectBoard = vi.fn();
    const onDeleteBoards = vi.fn(async (boardPaths: string[]) => boards.filter((board) => !boardPaths.includes(board.path)));
    const modal = new PoolRoamHistoryModal({} as any, boards, { onSelectBoard, onDeleteBoards });
    const { contentEl } = attachModalHost(modal);
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    modal.onOpen();

    const batchToggle = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-toggle");
    const batchFooter = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-footer");
    const batchCancel = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-cancel");
    const batchDeleteBeforeSelection = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-delete");
    expect(batchFooter?.style.display).toBe("none");
    expect(batchDeleteBeforeSelection?.disabled).toBe(true);

    batchToggle?.click();

    let cards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card");
    let batchDelete = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-delete");
    expect(batchToggle?.getAttribute("aria-pressed")).toBe("true");
    expect(batchFooter?.style.display).toBe("flex");
    expect(cards[0]?.className).not.toContain("glitter-pool-roam-history-modal__card--selected");

    cards[0]?.keydown(" ");
    cards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card");
    batchDelete = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-delete");
    const selectionIndicators = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card-select--selected");
    const selectionIndicatorDots = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card-select-dot");
    expect(onSelectBoard).not.toHaveBeenCalled();
    expect(cards[0]?.className).toContain("glitter-pool-roam-history-modal__card--selected");
    expect(cards[0]?.getAttribute("aria-label")).toBe("取消选择漫游白板 board-a");
    expect(cards[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(selectionIndicators).toHaveLength(1);
    expect(selectionIndicatorDots).toHaveLength(2);
    expect(batchDelete?.disabled).toBe(false);
    expect(batchDelete?.textContent).toBe("");
    expect(batchDelete?.getAttribute("aria-label")).toContain("删除选中的漫游白板（1）");

    batchCancel?.click();
    cards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card");
    batchDelete = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-delete");
    expect(batchToggle?.getAttribute("aria-pressed")).toBe("false");
    expect(batchFooter?.style.display).toBe("none");
    expect(cards[0]?.className).not.toContain("glitter-pool-roam-history-modal__card--selected");
    expect(batchDelete?.disabled).toBe(true);
    expect(batchDelete?.textContent).toBe("");

    batchToggle?.click();
    cards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card");
    cards[0]?.click();
    batchDelete = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-delete");
    batchDelete?.click();
    await flush();

    expect(onDeleteBoards).toHaveBeenCalledWith(["Glitter/灵感漫游/board-a.canvas"]);
    const remainingCards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card");
    const batchDeleteAfterDelete = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-delete");
    expect(remainingCards).toHaveLength(1);
    expect(remainingCards[0]?.dataset.boardPath).toBe("Glitter/灵感漫游/board-b.canvas");
    expect(batchToggle?.getAttribute("aria-pressed")).toBe("false");
    expect(batchFooter?.style.display).toBe("none");
    expect(batchDeleteAfterDelete?.disabled).toBe(true);
  });

  it("restores the batch toolbar state after a failed delete so the user can retry", async () => {
    const boards: RoamBoardRecord[] = [
      {
        path: "Glitter/灵感漫游/board-a.canvas",
        name: "board-a",
        updatedAt: 1716800000000,
        relatedPools: [],
        thumbnailBoxes: []
      }
    ];
    const onDeleteBoards = vi.fn(async () => {
      throw new Error("delete failed");
    });
    const modal = new PoolRoamHistoryModal({} as any, boards, { onDeleteBoards });
    const { contentEl } = attachModalHost(modal);
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    modal.onOpen();

    const batchToggle = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-toggle");
    batchToggle?.click();
    contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card")[0]?.click();

    let batchDelete = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-delete");
    batchDelete?.click();
    await flush();

    batchDelete = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__batch-delete");
    const selectedCards = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-history-modal__card--selected");
    expect(onDeleteBoards).toHaveBeenCalledWith(["Glitter/灵感漫游/board-a.canvas"]);
    expect(batchToggle?.disabled).toBe(false);
    expect(batchDelete?.disabled).toBe(false);
    expect(batchDelete?.getAttribute("aria-label")).toContain("删除选中的漫游白板（1）");
    expect(selectedCards).toHaveLength(1);
  });

  it("renders a stable empty history body without changing the modal shell", () => {
    const modal = new PoolRoamHistoryModal({} as any, [], {});
    const { contentEl } = attachModalHost(modal);

    modal.onOpen();

    const recordsShell = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__records-shell");
    const emptyState = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__empty");
    const list = contentEl.querySelector<FakeElement>(".glitter-pool-roam-history-modal__list");

    expect(recordsShell).not.toBeNull();
    expect(emptyState?.textContent).toContain("还没有漫游白板");
    expect(list).toBeNull();
  });

  it("clears host classes and fires onClose callback when closing history", () => {
    const onClose = vi.fn();
    const modal = new PoolRoamHistoryModal({} as any, [], { onClose });
    const { removeClass, contentRemoveClass, empty } = attachModalHost(modal);

    modal.onClose();

    expect(removeClass).toHaveBeenCalledWith("glitter-pool-roam-history-modal-host");
    expect(removeClass).toHaveBeenCalledWith("glitter-pool-roam-history-modal");
    expect(contentRemoveClass).toHaveBeenCalledWith("glitter-pool-roam-history-modal__content");
    expect(empty).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("styles the history modal as a fixed-size toolbar plus scrollable grid/list surface", () => {
    expect(stylesCss).toContain(".glitter-pool-roam-history-modal-host .modal-bg");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal", [
      "width: min(760px, calc(100vw - 40px));",
      "height: min(640px, calc(100vh - 40px));",
      "min-height: min(640px, calc(100vh - 40px));"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__header", [
      "display: grid;",
      "grid-template-columns: minmax(0, 1fr) auto;",
      "align-items: start;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__toolbar", [
      "display: grid;",
      "grid-template-columns: auto minmax(0, 1fr) auto;",
      "align-items: center;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__search-shell", [
      "justify-self: end;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 96%, var(--glitter-ui-bg) 4%);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__records-footer", [
      "display: flex;",
      "justify-content: flex-end;",
      "align-items: flex-end;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__search", [
      "min-height: 38px;",
      "appearance: none;",
      "background: transparent !important;"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-roam-history-modal__view-toggle,\n.glitter-pool-roam-history-modal__toolbar-button",
      ["appearance: none;", "background: transparent;", "border: 0;"]
    );
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__batch-footer", [
      "display: none;",
      "justify-content: flex-end;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__batch-footer-button", [
      "border: 0;",
      "background: transparent;",
      "appearance: none;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__records-shell", [
      "display: flex;",
      "flex: 1 1 auto;",
      "flex-direction: column;",
      "min-height: 0;",
      "overflow: hidden;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__records-content", [
      "flex: 1 1 auto;",
      "min-height: 0;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__list", [
      "height: 100%;",
      "overflow-y: auto;",
      "padding-right: 4px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__list--grid", [
      "display: grid;",
      "grid-template-columns: repeat(2, minmax(0, 1fr));"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__card", [
      "position: relative;",
      "min-width: 0;",
      "cursor: pointer;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__card--list", [
      "display: grid;",
      "grid-template-columns: 148px minmax(0, 1fr);",
      "align-items: center;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__card-select", [
      "all: unset;",
      "box-sizing: border-box;",
      "position: absolute;",
      "top: 12px;",
      "right: 12px;",
      "z-index: 3;",
      "display: grid;",
      "place-items: center;",
      "padding: 0;",
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "background-image: none !important;",
      "cursor: pointer;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__card-select-dot", [
      "width: 8px;",
      "height: 8px;",
      "border-radius: 999px;",
      "background: transparent;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__card-select--selected .glitter-pool-roam-history-modal__card-select-dot", [
      "background: var(--glitter-ui-accent);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__card-preview", [
      "position: relative;",
      "aspect-ratio: 16 / 10;",
      "overflow: hidden;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__preview-edges", [
      "position: absolute;",
      "inset: 0;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__thumbnail-edge", [
      "position: absolute;",
      "height: 2px;",
      "transform: translateY(-50%) rotate(var(--glitter-thumbnail-edge-angle));"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__thumbnail-box", [
      "position: absolute;",
      "overflow: hidden;",
      "border-radius: 12px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__thumbnail-box-silhouette", [
      "position: absolute;",
      "inset: 10px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-history-modal__card-main", [
      "display: grid;",
      "gap: 8px;"
    ]);
  });
});
