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
 * 保护预览壳的页面切换与首次使用流模拟相关行为，避免后续重构时出现静默回退。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATE_NEW_POOL_ID } from "../../src/plugin/constants";

// 预先收口可重置的依赖替身，方便验证对外协作。
const {
  adapterGetPageMock,
  adapterGetScenarioMock,
  adapterSetPageMock,
  adapterSetScenarioMock,
  buildHomeViewStateMock,
  buildSearchViewStateMock,
  buildPoolViewStateMock,
  buildWriteViewStateMock,
  buildSettingsViewStateMock,
  renderHomeViewMock,
  renderSearchViewMock,
  renderPoolViewMock,
  renderWriteViewMock,
  renderSettingsViewMock
} = vi.hoisted(() => ({
  adapterGetPageMock: vi.fn<() => "home" | "search">(),
  adapterGetScenarioMock: vi.fn<(page?: "home" | "search") => string>(),
  adapterSetPageMock: vi.fn<(page: "home" | "search") => void>(),
  adapterSetScenarioMock: vi.fn<(scenario: string, page?: "home" | "search") => void>(),
  buildHomeViewStateMock: vi.fn<(scenario: string) => { mode: "empty" | "populated" }>(
    (scenario: string) => ({ mode: scenario === "home-empty" ? "empty" : "populated" })
  ),
  buildSearchViewStateMock: vi.fn(() => ({ mode: "results", results: [] })),
  buildPoolViewStateMock: vi.fn(() => ({ mode: "browse", items: [] })),
  buildWriteViewStateMock: vi.fn(),
  buildSettingsViewStateMock: vi.fn(() => ({ section: "general" })),
  renderHomeViewMock: vi.fn(),
  renderSearchViewMock: vi.fn(),
  renderPoolViewMock: vi.fn(),
  renderWriteViewMock: vi.fn(),
  renderSettingsViewMock: vi.fn()
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

vi.mock("../../src/ui/pool/pool-state", () => ({
  buildPoolViewState: buildPoolViewStateMock
}));

vi.mock("../../src/ui/pool/render-pool", () => ({
  renderPoolView: renderPoolViewMock
}));

vi.mock("../../src/ui/write/write-state", async () => {
  const actual = await vi.importActual<typeof import("../../src/ui/write/write-state")>(
    "../../src/ui/write/write-state"
  );
  buildWriteViewStateMock.mockImplementation(actual.buildWriteViewState);
  return {
    buildWriteViewState: buildWriteViewStateMock
  };
});

vi.mock("../../src/ui/write/render-write", () => ({
  renderWriteView: renderWriteViewMock
}));

vi.mock("../../src/ui/settings/settings-state", () => ({
  buildSettingsViewState: buildSettingsViewStateMock
}));

vi.mock("../../src/ui/settings/render-settings", () => ({
  renderSettingsView: renderSettingsViewMock
}));

import { PREVIEW_PAGES, mountPreviewShell, scenariosForPage } from "../../src/preview/preview-shell";

// 构造最小宿主替身，承接渲染层与事件层断言。
class FakeElement {
  public className = "";
  public textContent = "";
  public children: FakeElement[] = [];
  public parent: FakeElement | null = null;
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public value = "";
  public type = "";
  public accept = "";
  public multiple = false;
  public files: Array<{ type: string }> = [];
  public removed = false;

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

  click(): void {
    const listeners = this.listeners.get("click") ?? [];
    listeners.forEach((listener) => listener());
  }

  remove(): void {
    this.removed = true;
    if (!this.parent) {
      return;
    }

    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
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

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
function findElements(root: FakeElement, predicate: (node: FakeElement) => boolean): FakeElement[] {
  const matches: FakeElement[] = [];

  const visit = (node: FakeElement): void => {
    if (predicate(node)) {
      matches.push(node);
    }
    node.children.forEach(visit);
  };

  visit(root);
  return matches;
}

// 校验预览壳对页面与场景集合的静态定义。
describe("preview shell page scenarios", () => {
  it("includes all five preview pages", () => {
    expect(PREVIEW_PAGES).toEqual(["home", "search", "pool", "write", "settings"]);
  });

  it("keeps explicit scenario sets for home and search pages", () => {
    expect(scenariosForPage("home")).toEqual([
      "home-empty",
      "home-populated",
      "settings-conflict"
    ]);
    expect(scenariosForPage("search")).toEqual([
      "search-results",
      "search-empty",
      "search-loading",
      "search-batch"
    ]);
  });

  it("returns write scenarios including first-use and global quick-capture variants", () => {
    expect(scenariosForPage("write")).toEqual([
      "quick-capture-default",
      "quick-capture-link-loading",
      "quick-capture-link-error",
      "quick-capture-media-loading",
      "quick-capture-media-error",
      "quick-capture-first-use-saved",
      "quick-capture-global-default",
      "quick-capture-global-link-loading",
      "quick-capture-global-link-error",
      "quick-capture-global-media-loading",
      "quick-capture-global-media-error",
      "quick-capture-global-saved",
      "quick-capture-ai-ready",
      "quick-capture-ai-reviewing",
      "quick-capture-ai-error",
      "write-immersive-default",
      "write-immersive-success",
      "write-immersive-error"
    ]);
  });

  it("returns pool and settings scenario sets including first-use pool steps", () => {
    expect(scenariosForPage("pool")).toEqual([
      "pool-browse",
      "pool-empty",
      "pool-reduced-motion",
      "pool-first-use-choose",
      "pool-first-use-create"
    ]);
    expect(scenariosForPage("settings")).toEqual([
      "settings-default",
      "settings-reduced-motion",
      "settings-conflict"
    ]);
  });
});

// 校验预览壳中首次使用流的关键交互串联。
describe("mountPreviewShell first-use flow simulation", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  afterEach(() => {
    adapterGetPageMock.mockReset();
    adapterGetScenarioMock.mockReset();
    adapterSetPageMock.mockReset();
    adapterSetScenarioMock.mockReset();

    buildHomeViewStateMock.mockClear();
    buildSearchViewStateMock.mockClear();
    buildPoolViewStateMock.mockClear();
    buildWriteViewStateMock.mockClear();
    buildSettingsViewStateMock.mockClear();

    renderHomeViewMock.mockClear();
    renderSearchViewMock.mockClear();
    renderPoolViewMock.mockClear();
    renderWriteViewMock.mockClear();
    renderSettingsViewMock.mockClear();

    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  it("runs first-use home-empty flow through capture, choose/create pool, and returns home with guidance", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-empty"));

    let homeActions: any;
    let writeActions: any;
    let poolActions: any;

    renderHomeViewMock.mockImplementation((_mount, _state, actions) => {
      homeActions = actions;
    });
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });
    renderPoolViewMock.mockImplementation((_mount, _state, actions) => {
      poolActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    expect(buildHomeViewStateMock).toHaveBeenCalledWith("home-empty");
    expect(renderWriteViewMock).not.toHaveBeenCalled();
    expect(root.querySelector(".glitter-preview-shell__overlay-mount")).toBeNull();

    homeActions.onPrimaryAction();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        contentKind: "text"
      })
    );
    expect(renderWriteViewMock).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".glitter-preview-shell__overlay-mount--capture")).not.toBeNull();

    writeActions.onSubmit();
    expect(buildPoolViewStateMock).toHaveBeenLastCalledWith("pool-first-use-choose");
    expect(renderPoolViewMock).toHaveBeenCalledTimes(1);
    expect(renderWriteViewMock).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".glitter-preview-shell__overlay-mount--pool-choose")).not.toBeNull();

    poolActions.onItemSelect("create-new-pool");
    expect(buildPoolViewStateMock).toHaveBeenLastCalledWith("pool-first-use-create");
    expect(renderPoolViewMock).toHaveBeenCalledTimes(2);

    poolActions.onItemSelect("new-pool-created");
    expect(buildHomeViewStateMock).toHaveBeenLastCalledWith("home-populated");
    expect(root.querySelector(".glitter-preview-shell__overlay-mount--followup-guidance")).not.toBeNull();
    expect(root.querySelector(".glitter-preview-shell__base-surface--overlay-dimmed")).not.toBeNull();

    const scenarioSelect = root.querySelector(".glitter-preview-shell__scenario-select") as FakeElement | null;
    expect(scenarioSelect?.value).toBe("home-populated");
  });

  it("rerenders first-use capture preview on plain typing while preserving create-file toggle", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-empty"));

    let homeActions: any;
    let writeActions: any;

    renderHomeViewMock.mockImplementation((_mount, _state, actions) => {
      homeActions = actions;
    });
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    homeActions.onPrimaryAction();
    writeActions.onCreateFileToggle(true);
    writeActions.onBodyInputChange("仍然是纯文本");

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        contentKind: "text",
        inputText: "仍然是纯文本",
        createFileChecked: true
      })
    );
    expect(renderWriteViewMock).toHaveBeenCalledTimes(3);

    writeActions.onBodyInputChange("https://example.com/live");

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        contentKind: "link",
        createFileChecked: true
      })
    );
    expect(renderWriteViewMock).toHaveBeenCalledTimes(4);
  });

  it("toggles/selects inline pool in first-use capture and create action opens pool choose", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-empty"));

    let homeActions: any;
    let writeActions: any;
    let poolActions: any;

    renderHomeViewMock.mockImplementation((_mount, _state, actions) => {
      homeActions = actions;
    });
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });
    renderPoolViewMock.mockImplementation((_mount, _state, actions) => {
      poolActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    homeActions.onPrimaryAction();

    writeActions.onPoolPickerToggle();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        poolDropdownVisible: true
      })
    );

    writeActions.onPoolSelect("pool-research");
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedPoolLabel: "调研池",
        poolDropdownVisible: false
      })
    );

    writeActions.onPoolPickerToggle();
    writeActions.onPoolSelect(CREATE_NEW_POOL_ID);

    expect(buildPoolViewStateMock).toHaveBeenLastCalledWith("pool-first-use-choose");
    expect(poolActions).toBeDefined();
  });

  it("opens a real attachment picker in first-use preview and rerenders only after files are chosen", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-empty"));

    let homeActions: any;
    let writeActions: any;

    renderHomeViewMock.mockImplementation((_mount, _state, actions) => {
      homeActions = actions;
    });
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as FakeElement;
    mountPreviewShell(root as unknown as HTMLElement);

    homeActions.onPrimaryAction();
    writeActions.onTitleInputChange("手动标题");

    expect(renderWriteViewMock).toHaveBeenCalledTimes(2);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        titleText: "手动标题",
        hasManualTitle: true
      })
    );
    expect(renderWriteViewMock.mock.calls.at(-1)?.[1]).toMatchObject({
      fields: {
        title: {
          value: "手动标题"
        }
      }
    });

    writeActions.onAttachmentPick();

    const fileInputs = findElements(root, (node) => node.tagName === "INPUT" && node.type === "file");
    const picker = fileInputs[fileInputs.length - 1] ?? null;

    expect(picker).not.toBeNull();
    expect(picker?.accept).toBe("image/*,video/*");
    expect(picker?.multiple).toBe(true);
    expect(renderWriteViewMock).toHaveBeenCalledTimes(2);

    picker!.files = [{ type: "image/png" }];
    picker!.dispatchEvent({ type: "change" });

    expect(renderWriteViewMock).toHaveBeenCalledTimes(3);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "first-use",
        phase: "capture",
        contentKind: "media",
        titleText: "手动标题",
        hasManualTitle: true,
        attachedMediaCount: 1
      })
    );
    expect(renderWriteViewMock.mock.calls.at(-1)?.[1]).toMatchObject({
      fields: {
        title: {
          value: "手动标题"
        }
      }
    });
    expect(picker?.removed).toBe(true);
  });

  it("shows close confirmation from capture and resumes or exits correctly", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-empty"));

    let homeActions: any;
    let writeActions: any;

    renderHomeViewMock.mockImplementation((_mount, _state, actions) => {
      homeActions = actions;
    });
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    homeActions.onPrimaryAction();
    writeActions.onClose();

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );

    writeActions.onResumeCapture();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: false
      })
    );

    writeActions.onClose();
    writeActions.onConfirmClose();
    expect(root.querySelector(".glitter-preview-shell__overlay-mount")).toBeNull();
  });

  it("returns pool-choose back to capture when opened directly from capture", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-empty"));

    let homeActions: any;
    let writeActions: any;
    let poolActions: any;

    renderHomeViewMock.mockImplementation((_mount, _state, actions) => {
      homeActions = actions;
    });
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });
    renderPoolViewMock.mockImplementation((_mount, _state, actions) => {
      poolActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    homeActions.onPrimaryAction();
    writeActions.onPoolSelect(CREATE_NEW_POOL_ID);
    expect(root.querySelector(".glitter-preview-shell__overlay-mount--pool-choose")).not.toBeNull();

    poolActions.onBack();
    expect(root.querySelector(".glitter-preview-shell__overlay-mount--capture")).not.toBeNull();
  });

  it("routes direct write page interactions without first-use simulation", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-populated"));

    let writeActions: any;
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    const pageSelect = root.querySelector(".glitter-preview-shell__page-select") as FakeElement | null;
    const scenarioSelect = root.querySelector(".glitter-preview-shell__scenario-select") as FakeElement | null;

    pageSelect!.value = "write";
    pageSelect!.dispatchEvent({ type: "change" });

    expect(scenarioSelect?.value).toBe("write-immersive-default");
    expect(renderWriteViewMock).toHaveBeenCalledTimes(1);

    writeActions.onSubmit();
    expect(renderPoolViewMock).not.toHaveBeenCalled();
  });

  it("renders global quick-capture scenario on write page with runtime-derived title", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-populated"));

    let writeActions: any;
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    const pageSelect = root.querySelector(".glitter-preview-shell__page-select") as FakeElement | null;
    const scenarioSelect = root.querySelector(".glitter-preview-shell__scenario-select") as FakeElement | null;

    pageSelect!.value = "write";
    pageSelect!.dispatchEvent({ type: "change" });

    scenarioSelect!.value = "quick-capture-global-default";
    scenarioSelect!.dispatchEvent({ type: "change" });

    writeActions.onCreateFileToggle(true);

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        generatedTitle: expect.stringMatching(/^灵感 \d{2}-\d{2} \d{2}:\d{2}$/),
        createFileChecked: true
      })
    );
  });

  it("resets stale quick-capture preview state before rendering AI scenarios", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-populated"));

    let writeActions: any;
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as FakeElement;
    mountPreviewShell(root as unknown as HTMLElement);

    const pageSelect = root.querySelector(".glitter-preview-shell__page-select") as FakeElement | null;
    const scenarioSelect = root.querySelector(".glitter-preview-shell__scenario-select") as FakeElement | null;

    pageSelect!.value = "write";
    pageSelect!.dispatchEvent({ type: "change" });

    scenarioSelect!.value = "quick-capture-default";
    scenarioSelect!.dispatchEvent({ type: "change" });

    writeActions.onBodyInputChange("https://example.com/live");
    writeActions.onTitleInputChange("手动标题");
    writeActions.onAttachmentPick();

    const fileInputs = findElements(root, (node) => node.tagName === "INPUT" && node.type === "file");
    const picker = fileInputs[fileInputs.length - 1] ?? null;

    expect(picker).not.toBeNull();

    picker!.files = [{ type: "image/png" }];
    picker!.dispatchEvent({ type: "change" });

    scenarioSelect!.value = "quick-capture-link-loading";
    scenarioSelect!.dispatchEvent({ type: "change" });

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "media",
        importState: "loading",
        titleText: "手动标题",
        attachedMediaCount: 1
      })
    );

    scenarioSelect!.value = "quick-capture-ai-ready";
    scenarioSelect!.dispatchEvent({ type: "change" });

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "text",
        importState: "idle",
        generatedTitle: "灵感 04-08 09:12",
        titleText: "灵感 04-08 09:12",
        inputText: "",
        attachedMediaCount: 0,
        aiPolishVisible: true,
        aiPolishState: "idle"
      })
    );

    const aiScenarioFileInputCount = findElements(
      root,
      (node) => node.tagName === "INPUT" && node.type === "file"
    ).length;

    writeActions.onBodyInputChange("AI 污染正文");
    writeActions.onTitleInputChange("AI 污染标题");
    writeActions.onCreateFileToggle(true);
    writeActions.onPoolPickerToggle();
    writeActions.onPoolSelect("pool-research");
    writeActions.onAttachmentPick();

    expect(
      findElements(root, (node) => node.tagName === "INPUT" && node.type === "file").length
    ).toBe(aiScenarioFileInputCount);

    scenarioSelect!.value = "quick-capture-default";
    scenarioSelect!.dispatchEvent({ type: "change" });

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "media",
        importState: "idle",
        titleText: "手动标题",
        inputText: "",
        attachedMediaCount: 1,
        createFileChecked: false,
        selectedPoolLabel: "默认池"
      })
    );

    scenarioSelect!.value = "quick-capture-ai-reviewing";
    scenarioSelect!.dispatchEvent({ type: "change" });

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "text",
        importState: "idle",
        generatedTitle: "灵感 04-08 09:12",
        titleText: "灵感 04-08 09:12",
        inputText: "我先写一版原文，再看润色结果。",
        attachedMediaCount: 0,
        aiPolishVisible: true,
        aiPolishState: "reviewing",
        aiPolishSourceValue: "我先写一版原文，再看润色结果。",
        aiPolishPolishedValue: "我先写一版原文，然后查看润色结果。"
      })
    );

    scenarioSelect!.value = "quick-capture-ai-error";
    scenarioSelect!.dispatchEvent({ type: "change" });

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentKind: "text",
        importState: "idle",
        generatedTitle: "灵感 04-08 09:12",
        titleText: "灵感 04-08 09:12",
        inputText: "我先写一版原文，再看润色结果。",
        attachedMediaCount: 0,
        aiPolishVisible: true,
        aiPolishState: "error",
        aiPolishSourceValue: "我先写一版原文，再看润色结果。",
        aiPolishErrorMessage: "AI 请求失败，请检查网络或 API 配置后重试。"
      })
    );
  });

  it("does not leak quick-capture close-confirm state into or out of AI scenarios", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-populated"));

    let writeActions: any;
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    const pageSelect = root.querySelector(".glitter-preview-shell__page-select") as FakeElement | null;
    const scenarioSelect = root.querySelector(".glitter-preview-shell__scenario-select") as FakeElement | null;

    pageSelect!.value = "write";
    pageSelect!.dispatchEvent({ type: "change" });

    scenarioSelect!.value = "quick-capture-default";
    scenarioSelect!.dispatchEvent({ type: "change" });

    writeActions.onClose();

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );

    scenarioSelect!.value = "quick-capture-ai-ready";
    scenarioSelect!.dispatchEvent({ type: "change" });

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: false,
        aiPolishVisible: true,
        aiPolishState: "idle"
      })
    );

    writeActions.onClose();

    scenarioSelect!.value = "quick-capture-default";
    scenarioSelect!.dispatchEvent({ type: "change" });

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: false
      })
    );
  });

  it("restores previously open page and scenario when confirming close from write quick-capture", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-populated"));

    let writeActions: any;
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    const pageSelect = root.querySelector(".glitter-preview-shell__page-select") as FakeElement | null;
    const scenarioSelect = root.querySelector(".glitter-preview-shell__scenario-select") as FakeElement | null;

    pageSelect!.value = "search";
    pageSelect!.dispatchEvent({ type: "change" });

    scenarioSelect!.value = "search-empty";
    scenarioSelect!.dispatchEvent({ type: "change" });

    pageSelect!.value = "write";
    pageSelect!.dispatchEvent({ type: "change" });

    scenarioSelect!.value = "quick-capture-global-default";
    scenarioSelect!.dispatchEvent({ type: "change" });

    writeActions.onClose();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );

    writeActions.onResumeCapture();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: false
      })
    );

    writeActions.onClose();
    writeActions.onConfirmClose();

    expect(pageSelect?.value).toBe("search");
    expect(scenarioSelect?.value).toBe("search-empty");
  });

  it("clears close confirmation state when leaving write quick-capture for another page", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-populated"));

    let writeActions: any;
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as HTMLElement;
    mountPreviewShell(root);

    const pageSelect = root.querySelector(".glitter-preview-shell__page-select") as FakeElement | null;
    const scenarioSelect = root.querySelector(".glitter-preview-shell__scenario-select") as FakeElement | null;

    pageSelect!.value = "write";
    pageSelect!.dispatchEvent({ type: "change" });

    scenarioSelect!.value = "quick-capture-global-default";
    scenarioSelect!.dispatchEvent({ type: "change" });

    writeActions.onClose();
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: true
      })
    );

    pageSelect!.value = "search";
    pageSelect!.dispatchEvent({ type: "change" });
    pageSelect!.value = "write";
    pageSelect!.dispatchEvent({ type: "change" });
    scenarioSelect!.value = "quick-capture-global-default";
    scenarioSelect!.dispatchEvent({ type: "change" });

    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        closeConfirmVisible: false
      })
    );
  });

  it("opens a real attachment picker on the write page and rerenders only after files are chosen", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-populated"));

    let writeActions: any;
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as FakeElement;
    mountPreviewShell(root as unknown as HTMLElement);

    const pageSelect = root.querySelector(".glitter-preview-shell__page-select") as FakeElement | null;
    const scenarioSelect = root.querySelector(".glitter-preview-shell__scenario-select") as FakeElement | null;

    pageSelect!.value = "write";
    pageSelect!.dispatchEvent({ type: "change" });

    scenarioSelect!.value = "quick-capture-global-default";
    scenarioSelect!.dispatchEvent({ type: "change" });

    writeActions.onTitleInputChange("全局手动标题");

    expect(renderWriteViewMock).toHaveBeenCalledTimes(3);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        titleText: "全局手动标题",
        hasManualTitle: true
      })
    );
    expect(renderWriteViewMock.mock.calls.at(-1)?.[1]).toMatchObject({
      fields: {
        title: {
          value: "全局手动标题"
        }
      }
    });

    writeActions.onAttachmentPick();

    const fileInputs = findElements(root, (node) => node.tagName === "INPUT" && node.type === "file");
    const picker = fileInputs[fileInputs.length - 1] ?? null;

    expect(picker).not.toBeNull();
    expect(renderWriteViewMock).toHaveBeenCalledTimes(3);

    picker!.files = [{ type: "video/mp4" }];
    picker!.dispatchEvent({ type: "change" });

    expect(renderWriteViewMock).toHaveBeenCalledTimes(4);
    expect(buildWriteViewStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        flowContext: "global",
        phase: "capture",
        contentKind: "media",
        titleText: "全局手动标题",
        hasManualTitle: true,
        attachedMediaCount: 1
      })
    );
    expect(renderWriteViewMock.mock.calls.at(-1)?.[1]).toMatchObject({
      fields: {
        title: {
          value: "全局手动标题"
        }
      }
    });
    expect(picker?.removed).toBe(true);
  });

  it("opens the design-matched follow-up guidance overlay with a single wave action and closes back to populated home", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-empty"));

    let homeActions: any;
    let writeActions: any;
    let poolActions: any;

    renderHomeViewMock.mockImplementation((_mount, _state, actions) => {
      homeActions = actions;
    });
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });
    renderPoolViewMock.mockImplementation((_mount, _state, actions) => {
      poolActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as FakeElement;
    mountPreviewShell(root as unknown as HTMLElement);

    homeActions.onPrimaryAction();
    writeActions.onSubmit();
    writeActions.onSubmit();
    poolActions.onItemSelect("use-default-pool");

    expect(buildHomeViewStateMock).toHaveBeenLastCalledWith("home-populated");
    expect(root.querySelector(".glitter-preview-shell__overlay-mount--followup-guidance")).not.toBeNull();

    expect(findElements(root, (node) => node.textContent === "后续使用指引")).toHaveLength(1);
    expect(
      findElements(
        root,
        (node) => node.textContent === "核心优势优先：先看正文入灵感、Markdown 嵌入与文件链路双回溯。"
      )
    ).toHaveLength(0);
    expect(root.querySelectorAll(".glitter-followup-guidance-view__feature-item")).toHaveLength(4);
    expect(root.querySelectorAll(".glitter-followup-guidance-view__feature-icon-wrap")).toHaveLength(4);
    expect(root.querySelectorAll(".glitter-followup-guidance-view__feature-icon")).toHaveLength(4);
    expect(root.querySelectorAll(".glitter-followup-guidance-view__feature-copy")).toHaveLength(4);
    expect(root.querySelectorAll(".glitter-followup-guidance-view__feature-title").map((node) => node.textContent)).toEqual([
      "全局快捷记录",
      "自动识别链接",
      "多类型内容速记",
      "正文内嵌入灵感片段"
    ]);
    expect(root.querySelectorAll(".glitter-followup-guidance-view__feature-description").map((node) => node.textContent)).toEqual([
      "任意场景快速记录，不打断当前工作流。",
      "粘贴链接，自动识别并添入内容。",
      "灵感速记窗口内粘贴链接/图片/视频，快速切换布局。",
      "正文内右键 或 自定义快捷键，快速嵌入灵感片段。"
    ]);
    expect(
      findElements(root, (node) => node.textContent === "本引导仅首次弹出；关闭后可在设置页重新打开。")
    ).toHaveLength(1);
    expect(root.querySelectorAll(".glitter-followup-guidance-view__footnote-icon")).toHaveLength(1);
    expect(root.querySelectorAll(".glitter-followup-guidance-view__footnote-text")).toHaveLength(1);

    const footerButtons = findElements(
      root,
      (node) => node.tagName === "BUTTON" && (node.parent?.className.includes("glitter-followup-guidance-view__footer") ?? false)
    );
    const continueButton = root.querySelector(".glitter-followup-guidance-view__continue") as FakeElement | null;

    expect(footerButtons).toHaveLength(1);
    expect(
      findElements(root, (node) => node.tagName === "BUTTON" && node.textContent === "关闭引导")
    ).toHaveLength(0);
    expect(continueButton).not.toBeNull();
    expect(continueButton?.querySelector(".glitter-write-stage__icon--waves")).not.toBeNull();
    expect(continueButton?.querySelector(".glitter-write-stage__action-primary-text")?.textContent).toBe("灵感入池");

    continueButton?.click();

    expect(root.querySelector(".glitter-preview-shell__overlay-mount--followup-guidance")).toBeNull();
    expect(buildHomeViewStateMock).toHaveBeenLastCalledWith("home-populated");
  });

  it("does not leak follow-up guidance overlay into non-home preview pages", () => {
    const fakeDocument = new FakeDocument();
    const fakeStorage = {};
    (globalThis as any).document = fakeDocument;
    (globalThis as any).window = { localStorage: fakeStorage };

    adapterGetPageMock.mockReturnValue("home");
    adapterGetScenarioMock.mockImplementation((page) => (page === "search" ? "search-results" : "home-empty"));

    let homeActions: any;
    let writeActions: any;
    let poolActions: any;

    renderHomeViewMock.mockImplementation((_mount, _state, actions) => {
      homeActions = actions;
    });
    renderWriteViewMock.mockImplementation((_mount, _state, actions) => {
      writeActions = actions;
    });
    renderPoolViewMock.mockImplementation((_mount, _state, actions) => {
      poolActions = actions;
    });

    const root = fakeDocument.createElement("div") as unknown as FakeElement;
    mountPreviewShell(root as unknown as HTMLElement);

    homeActions.onPrimaryAction();
    writeActions.onSubmit();
    writeActions.onSubmit();
    poolActions.onItemSelect("use-default-pool");

    expect(root.querySelector(".glitter-preview-shell__overlay-mount--followup-guidance")).not.toBeNull();

    const pageSelect = root.querySelector(".glitter-preview-shell__page-select") as FakeElement | null;
    pageSelect!.value = "write";
    pageSelect!.dispatchEvent({ type: "change" });
    pageSelect!.value = "home";
    pageSelect!.dispatchEvent({ type: "change" });

    expect(root.querySelector(".glitter-preview-shell__overlay-mount--followup-guidance")).toBeNull();
    expect(buildHomeViewStateMock.mock.calls.at(-1)?.[0]).toMatch(/^home-/);
  });
});
