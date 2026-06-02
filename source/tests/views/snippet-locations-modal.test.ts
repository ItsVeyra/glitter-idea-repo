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

/**
 * 保护片段定位弹窗的渲染与样式约束相关行为，避免后续重构时出现静默回退。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SnippetLocationsModal } from "../../src/views/snippet-locations-modal";

// 直接载入真实样式文本，确保结构断言与当前界面契约保持一致。
const stylesCss = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

type FakeListener = () => void;

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
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

// 构造最小宿主替身，承接渲染层与事件层断言。
class FakeElement {
  className = "";
  type = "";
  dataset: Record<string, string> = {};
  disabled = false;
  children: FakeElement[] = [];

  private _textContent = "";
  private readonly listeners = new Map<string, FakeListener[]>();

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

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("obsidian", () => ({
  Modal: class {
    containerEl = { addClass() {}, removeClass() {} };
    modalEl = { addClass() {}, removeClass() {} };
    contentEl = { empty() {} };

    constructor(public readonly app: unknown) {}

    close() {}
  }
}));

// 覆盖视图宿主在生命周期、渲染与回调桥接上的核心契约。
describe("SnippetLocationsModal", () => {
  function flushMicrotasks(times = 2): Promise<void> {
    let chain = Promise.resolve();
    for (let index = 0; index < times; index += 1) {
      chain = chain.then(() => Promise.resolve());
    }
    return chain;
  }

  function attachModalHost(modal: SnippetLocationsModal) {
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

  it("renders plugin-styled location cards and opens the chosen file", async () => {
    const onOpenLocation = vi.fn(async () => undefined);
    const modal = new SnippetLocationsModal(
      {} as any,
      [
        {
          notePath: "Folder/Note A.md",
          noteTitle: "Note A",
          occurrenceCount: 2,
          stale: false
        },
        {
          notePath: "Folder/Missing.md",
          noteTitle: "Missing",
          occurrenceCount: 1,
          stale: true
        }
      ],
      onOpenLocation
    );
    const { addClass, contentAddClass, contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();

    expect(addClass).toHaveBeenCalledWith("glitter-snippet-locations-modal-host");
    expect(addClass).toHaveBeenCalledWith("glitter-snippet-locations-modal");
    expect(contentAddClass).toHaveBeenCalledWith("glitter-snippet-locations-modal__content");
    expect(contentEl.textContent).toContain("选择文件");

    const header = contentEl.querySelector<FakeElement>(".glitter-snippet-locations-modal__header");
    const closeButton = contentEl.querySelector<FakeElement>(".glitter-snippet-locations-modal__close");
    const cards = contentEl.querySelectorAll<FakeElement>(".glitter-snippet-locations-modal__card");
    expect(header).not.toBeNull();
    expect(closeButton?.type).toBe("button");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.type).toBe("div");
    expect(cards[0]?.dataset.notePath).toBe("Folder/Note A.md");
    expect(contentEl.textContent).toContain("Note A");
    expect(contentEl.textContent).toContain("Missing");
    expect(contentEl.textContent).toContain("文件缺失");

    cards[1]?.click();
    await flushMicrotasks();

    expect(onOpenLocation).toHaveBeenCalledWith({
      notePath: "Folder/Missing.md",
      noteTitle: "Missing",
      occurrenceCount: 1,
      stale: true
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open and allows retry when opening a location rejects", async () => {
    const onOpenLocation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("open failed"))
      .mockResolvedValueOnce(undefined);
    const modal = new SnippetLocationsModal(
      {} as any,
      [
        {
          notePath: "Folder/Note A.md",
          noteTitle: "Note A",
          occurrenceCount: 2,
          stale: false
        }
      ],
      onOpenLocation
    );
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    modal.onOpen();

    const card = contentEl.querySelector<FakeElement>(".glitter-snippet-locations-modal__card");
    card?.click();
    await flushMicrotasks(3);

    expect(onOpenLocation).toHaveBeenCalledTimes(1);
    expect(closeSpy).not.toHaveBeenCalled();

    card?.click();
    await flushMicrotasks(3);

    expect(onOpenLocation).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("styles the modal with plugin scrim, aligned header, and spaced hoverable cards", () => {
    expect(stylesCss).toContain(".glitter-snippet-locations-modal-host .modal-bg");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-snippet-locations-modal__header", [
      "display: flex;",
      "align-items: center;",
      "justify-content: space-between;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-snippet-locations-modal__list", [
      "display: grid;",
      "gap: 12px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-snippet-locations-modal__card", [
      "display: grid;",
      "gap: 12px;",
      "border-radius: 16px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, black 6%);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-snippet-locations-modal__card::before", [
      "inset: -24% -36%;",
      "filter: blur(18px);",
      "transform: translate3d(-36%, 0, 0);"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-snippet-locations-modal__card:hover::before,\n.glitter-snippet-locations-modal__card:focus-within::before",
      ["opacity: 1;", "transform: translate3d(16%, 0, 0);"]
    );
  });

  it("removes host classes and clears content on close", () => {
    const modal = new SnippetLocationsModal(
      {} as any,
      [
        {
          notePath: "Folder/Note A.md",
          noteTitle: "Note A",
          occurrenceCount: 2,
          stale: false
        }
      ],
      vi.fn(async () => undefined)
    );
    const { removeClass, contentRemoveClass, empty } = attachModalHost(modal);

    modal.onClose();

    expect(removeClass).toHaveBeenCalledWith("glitter-snippet-locations-modal-host");
    expect(removeClass).toHaveBeenCalledWith("glitter-snippet-locations-modal");
    expect(contentRemoveClass).toHaveBeenCalledWith("glitter-snippet-locations-modal__content");
    expect(empty).toHaveBeenCalled();
  });
});
