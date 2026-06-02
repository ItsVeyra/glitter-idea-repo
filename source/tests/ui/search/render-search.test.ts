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
 * 保护搜索页渲染分支与交互相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { buildSearchViewState } from "../../../src/ui/search/search-state";
import { renderSearchView } from "../../../src/ui/search/render-search";

// 构造最小宿主替身，承接渲染层与事件层断言。
class FakeElement {
  public className = "";
  public children: FakeElement[] = [];
  public parent: FakeElement | null = null;
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public placeholder = "";

  private _textContent = "";
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(public readonly tagName: string, public readonly ownerDocument: FakeDocument) {}

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  click(): void {
    const listeners = this.listeners.get("click") ?? [];
    listeners.forEach((listener) => listener());
  }

  set textContent(value: string) {
    this._textContent = value;
  }

  get textContent(): string {
    const childText = this.children.map((child) => child.textContent).join("");
    return `${this._textContent}${childText}`;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
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
    return matches;
  }

  set innerHTML(_value: string) {
    this.children = [];
    this.textContent = "";
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName.toUpperCase(), this);
  }
}

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
function createContainer(): HTMLElement {
  const document = new FakeDocument();
  return document.createElement("div") as unknown as HTMLElement;
}

function findDescendantsByTag(root: HTMLElement, tagName: string): FakeElement[] {
  const matches: FakeElement[] = [];
  const visit = (node: FakeElement): void => {
    if (node.tagName === tagName.toUpperCase()) {
      matches.push(node);
    }
    node.children.forEach(visit);
  };

  (root as unknown as FakeElement).children.forEach(visit);
  return matches;
}

// 覆盖渲染单元在主要状态分支下的结构与交互契约。
describe("renderSearchView", () => {
  it("renders result rows for search-results", () => {
    const container = createContainer();
    renderSearchView(container, buildSearchViewState("search-results"), {
      onQuerySubmit() {},
      onResultSelect() {},
      onBatchAction() {}
    });

    expect(container.querySelector(".glitter-search-stage__query")?.textContent).not.toBeNull();
    expect(container.querySelectorAll(".glitter-search-stage__result-item")).toHaveLength(3);
    expect(container.querySelector(".glitter-search-stage__loading")).toBeNull();
    expect(container.querySelector(".glitter-search-stage__empty")).toBeNull();
  });

  it("renders batch summary for search-batch", () => {
    const container = createContainer();
    renderSearchView(container, buildSearchViewState("search-batch"), {
      onQuerySubmit() {},
      onResultSelect() {},
      onBatchAction() {}
    });

    expect(container.querySelector(".glitter-search-stage__batch")?.textContent).toContain("8 selected");
    expect(container.querySelectorAll(".glitter-search-stage__result-item")).toHaveLength(3);
  });

  it("renders empty branch for search-empty", () => {
    const container = createContainer();
    renderSearchView(container, buildSearchViewState("search-empty"), {
      onQuerySubmit() {},
      onResultSelect() {},
      onBatchAction() {}
    });

    expect(container.querySelector(".glitter-search-stage__empty")?.textContent).toContain("No matches yet");
    expect(container.querySelector(".glitter-search-stage__results")).toBeNull();
  });

  it("renders loading branch for search-loading", () => {
    const container = createContainer();
    renderSearchView(container, buildSearchViewState("search-loading"), {
      onQuerySubmit() {},
      onResultSelect() {},
      onBatchAction() {}
    });

    expect(container.querySelector(".glitter-search-stage__loading")?.textContent).toContain(
      "Searching indexed ideas..."
    );
    expect(container.querySelector(".glitter-search-stage__results")).toBeNull();
  });

  it("wires callbacks for query submit, result select, and batch actions", () => {
    const querySubmitCalls: string[] = [];
    const resultSelectCalls: string[] = [];
    const batchActionCalls: string[] = [];

    const batchContainer = createContainer();
    renderSearchView(batchContainer, buildSearchViewState("search-batch"), {
      onQuerySubmit() {
        querySubmitCalls.push("batch");
      },
      onResultSelect(resultId: string) {
        resultSelectCalls.push(resultId);
      },
      onBatchAction(actionId: string) {
        batchActionCalls.push(actionId);
      }
    });

    const batchButtons = findDescendantsByTag(batchContainer, "button");
    expect(batchButtons.length).toBeGreaterThanOrEqual(5);

    batchButtons[0].click();
    batchButtons[1].click();
    batchButtons[4].click();

    expect(querySubmitCalls).toEqual(["batch"]);
    expect(batchActionCalls).toEqual(["move"]);
    expect(resultSelectCalls).toEqual(["result-1"]);

    const resultsContainer = createContainer();
    renderSearchView(resultsContainer, buildSearchViewState("search-results"), {
      onQuerySubmit() {},
      onResultSelect(resultId: string) {
        resultSelectCalls.push(resultId);
      },
      onBatchAction() {}
    });

    const resultButtons = resultsContainer.querySelectorAll(
      ".glitter-search-stage__result-item"
    ) as unknown as FakeElement[];
    resultButtons[1].click();
    expect(resultSelectCalls).toContain("result-2");
  });
});
