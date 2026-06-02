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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PoolRoamBoardModal } from "../../src/views/pool-roam-board-modal";

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

  it("renders floating download and share actions for the active historical board", async () => {
    const boards = [
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
    const onDownloadBoard = vi.fn(async () => undefined);
    const onShareBoard = vi.fn();
    const modal = new PoolRoamBoardModal(
      {} as any,
      boards,
      0,
      { onDownloadBoard, onShareBoard },
      {
        canvasHost: {
          mountInlineBoard: vi.fn(async () => undefined),
          mountModalBoard: vi.fn(async () => undefined),
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
    expect(floatingActions).not.toBeNull();
    expect(downloadButton).not.toBeNull();
    expect(shareButton).not.toBeNull();
    expect(downloadButton?.disabled).toBe(false);
    expect(shareButton?.disabled).toBe(false);
    expect(downloadButton?.getAttribute("aria-label")).toBe("下载当前历史漫游白板");
    expect(shareButton?.getAttribute("aria-label")).toBe("分享当前历史漫游白板");

    downloadButton?.click();
    await flushMicrotasks();
    expect(onDownloadBoard).toHaveBeenCalledWith(boards[0]);

    const navButtons = contentEl.querySelectorAll<FakeElement>(".glitter-pool-roam-board-modal__nav-button");
    navButtons[1]?.click();
    await flushMicrotasks();

    shareButton?.click();
    expect(onShareBoard).toHaveBeenCalledWith(boards[1], shareButton);
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
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__nav", [
      "display: inline-flex;",
      "align-items: center;",
      "gap: 8px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-roam-board-modal__nav-button", [
      "display: inline-flex;",
      "justify-content: center;",
      "border-radius: 12px;"
    ]);
  });
});
