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
 * 保护预览壳的页面集合与场景映射相关行为，避免后续重构时出现静默回退。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// 预先收口可重置的依赖替身，方便验证对外协作。
const {
  adapterGetPageMock,
  adapterGetScenarioMock,
  adapterSetPageMock,
  adapterSetScenarioMock,
  buildHomeViewStateMock,
  buildSearchViewStateMock,
  renderHomeViewMock,
  renderSearchViewMock
} = vi.hoisted(() => ({
  adapterGetPageMock: vi.fn<() => "home" | "search">(),
  adapterGetScenarioMock: vi.fn<(page?: "home" | "search") => string>(),
  adapterSetPageMock: vi.fn<(page: "home" | "search") => void>(),
  adapterSetScenarioMock: vi.fn<(scenario: string, page?: "home" | "search") => void>(),
  buildHomeViewStateMock: vi.fn(() => ({ mode: "populated" })),
  buildSearchViewStateMock: vi.fn(() => ({ mode: "results", results: [] })),
  renderHomeViewMock: vi.fn(),
  renderSearchViewMock: vi.fn()
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/host/browser/browser-home-adapter", () => ({
  createBrowserHomeAdapter: () => ({
    getPage: adapterGetPageMock,
    getScenario: adapterGetScenarioMock,
    setPage: adapterSetPageMock,
    setScenario: adapterSetScenarioMock
  })
}));

vi.mock("../../src/ui/home/home-state", () => ({
  buildHomeViewState: buildHomeViewStateMock
}));

vi.mock("../../src/ui/home/render-home", () => ({
  renderHomeView: renderHomeViewMock
}));

vi.mock("../../src/ui/search/search-state", () => ({
  buildSearchViewState: buildSearchViewStateMock
}));

vi.mock("../../src/ui/search/render-search", () => ({
  renderSearchView: renderSearchViewMock
}));

import { mountPreviewShell } from "../../src/preview/preview-shell";

// 构造最小宿主替身，承接渲染层与事件层断言。
class FakeElement {
  public className = "";
  public textContent = "";
  public children: FakeElement[] = [];
  public parent: FakeElement | null = null;
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public value = "";

  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(public readonly tagName: string, public readonly ownerDocument: FakeDocument) {}

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event: { type: string }): void {
    const listeners = this.listeners.get(event.type) ?? [];
    listeners.forEach((listener) => listener());
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (!selector.startsWith(".")) {
      return [];
    }

    const className = selector.slice(1);
    const matches: FakeElement[] = [];

    const visit = (node: FakeElement): void => {
      const classes = node.className.split(/\s+/).filter(Boolean);
      if (classes.includes(className)) {
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

// 校验预览壳在不同页面间切换时的场景同步。
describe("mountPreviewShell page switching", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  afterEach(() => {
    adapterGetPageMock.mockReset();
    adapterGetScenarioMock.mockReset();
    adapterSetPageMock.mockReset();
    adapterSetScenarioMock.mockReset();
    buildHomeViewStateMock.mockClear();
    buildSearchViewStateMock.mockClear();
    renderHomeViewMock.mockClear();
    renderSearchViewMock.mockClear();

    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  it("restores each page's stored scenario when switching Home and Search", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    const persistedScenarios: Record<"home" | "search", string> = {
      home: "settings-conflict",
      search: "search-empty"
    };
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => persistedScenarios[page ?? "home"]);
    adapterSetScenarioMock.mockImplementation((scenario, page = "home") => {
      persistedScenarios[page] = scenario;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    expect(buildHomeViewStateMock).toHaveBeenCalledWith("settings-conflict");
    expect(renderHomeViewMock).toHaveBeenCalledTimes(1);

    const pageSelect = root.querySelector(".glitter-preview-shell__page-select") as FakeElement | null;
    const scenarioSelect = root.querySelector(".glitter-preview-shell__scenario-select") as FakeElement | null;
    expect(pageSelect).not.toBeNull();
    expect(scenarioSelect).not.toBeNull();

    pageSelect!.value = "search";
    pageSelect!.dispatchEvent({ type: "change" });

    expect(adapterGetScenarioMock).toHaveBeenCalledWith("search");
    expect(adapterSetPageMock).toHaveBeenLastCalledWith("search");
    expect(adapterSetScenarioMock).toHaveBeenLastCalledWith("search-empty", "search");
    expect(buildSearchViewStateMock).toHaveBeenCalledWith("search-empty");

    scenarioSelect!.value = "search-batch";
    scenarioSelect!.dispatchEvent({ type: "change" });

    expect(adapterSetPageMock).toHaveBeenLastCalledWith("search");
    expect(adapterSetScenarioMock).toHaveBeenLastCalledWith("search-batch", "search");
    expect(buildSearchViewStateMock).toHaveBeenCalledWith("search-batch");
    expect(persistedScenarios.search).toBe("search-batch");

    pageSelect!.value = "home";
    pageSelect!.dispatchEvent({ type: "change" });

    expect(adapterGetScenarioMock).toHaveBeenLastCalledWith("home");
    expect(adapterSetPageMock).toHaveBeenLastCalledWith("home");
    expect(adapterSetScenarioMock).toHaveBeenLastCalledWith("settings-conflict", "home");
    expect(buildHomeViewStateMock).toHaveBeenCalledWith("settings-conflict");

    pageSelect!.value = "search";
    pageSelect!.dispatchEvent({ type: "change" });

    expect(adapterGetScenarioMock).toHaveBeenLastCalledWith("search");
    expect(adapterSetPageMock).toHaveBeenLastCalledWith("search");
    expect(adapterSetScenarioMock).toHaveBeenLastCalledWith("search-batch", "search");
    expect(buildSearchViewStateMock).toHaveBeenLastCalledWith("search-batch");
  });
});
