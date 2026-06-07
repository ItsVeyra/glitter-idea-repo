import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CREATE_NEW_POOL_ID, DEFAULT_POOL_DESCRIPTION, DEFAULT_POOL_ID, DEFAULT_POOL_LABEL } from "../../../src/plugin/constants";
import { renderPoolView, syncRenderedPoolCardMenus, type PoolViewActions } from "../../../src/ui/pool/render-pool";
import type { PoolViewState } from "../../../src/ui/pool/pool-state";
import { buildPoolViewState, buildPoolViewStateFromRuntime } from "../../../src/ui/pool/pool-state";

type Assert<T extends true> = T;
type HasLegacyOnOpenFile = "onOpenFile" extends keyof PoolViewActions ? true : false;
const _poolViewActionsDropLegacyOnOpenFile: Assert<HasLegacyOnOpenFile extends false ? true : false> = true;

type BrowseStateOverrides = Omit<Partial<PoolViewState>, "header" | "browse"> & {
  header?: Partial<PoolViewState["header"]>;
  browse?: Partial<NonNullable<PoolViewState["browse"]>>;
};

class FakeRange {
  public target: FakeElement | null = null;
  public startOffset = 0;
  public endOffset = 0;

  selectNodeContents(target: FakeElement): void {
    this.target = target;
    this.startOffset = 0;
    this.endOffset = target.textContent.length;
  }
}

class FakeSelection {
  public range: FakeRange | null = null;
  public anchorOffset = 0;
  public focusOffset = 0;
  public selectedText = "";

  removeAllRanges(): void {
    this.range = null;
    this.anchorOffset = 0;
    this.focusOffset = 0;
    this.selectedText = "";
  }

  addRange(range: FakeRange): void {
    this.range = range;
    this.anchorOffset = range.startOffset;
    this.focusOffset = range.endOffset;
    this.selectedText = range.target?.textContent ?? "";
  }
}

type FakeEventPayload = Record<string, unknown> & {
  key?: string;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

function toKebabCase(value: string): string {
  return value.startsWith("--") ? value : value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function toCamelCase(value: string): string {
  if (value.startsWith("--")) {
    return value;
  }

  return value.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

class FakeStyle {
  public setCssStylesCallCount = 0;
  public setCssPropsCallCount = 0;

  setProperty(name: string, value: string): void {
    const propertyBag = this as unknown as Record<string, string>;
    propertyBag[name] = value;
    propertyBag[toKebabCase(name)] = value;
    propertyBag[toCamelCase(name)] = value;
  }

  removeProperty(name: string): string {
    const propertyBag = this as unknown as Record<string, string>;
    const currentValue = this.getPropertyValue(name);
    propertyBag[name] = "";
    propertyBag[toKebabCase(name)] = "";
    propertyBag[toCamelCase(name)] = "";
    return currentValue;
  }

  setCssStyles(styles: Record<string, string>): void {
    this.setCssStylesCallCount += 1;
    Object.entries(styles).forEach(([name, value]) => {
      this.setProperty(name, value);
    });
  }

  setCssProps(props: Record<string, string>): void {
    this.setCssPropsCallCount += 1;
    Object.entries(props).forEach(([name, value]) => {
      this.setProperty(name, value);
    });
  }

  getPropertyValue(name: string): string {
    const propertyBag = this as unknown as Record<string, string>;
    return propertyBag[name] ?? propertyBag[toCamelCase(name)] ?? propertyBag[toKebabCase(name)] ?? "";
  }
}

class FakeElement {
  public children: FakeElement[] = [];
  public parent: FakeElement | null = null;
  public style: FakeStyle & Record<string, string> = new FakeStyle() as FakeStyle & Record<string, string>;
  public dataset: Record<string, string> = {};
  public type = "";
  public checked = false;
  public disabled = false;
  public src = "";
  public alt = "";
  public value = "";
  public href = "";
  public target = "";
  public rel = "";
  public attributes: Record<string, string> = {};
  public focused = false;
  public scrollTop = 0;
  public scrollLeft = 0;

  private _className = "";
  private _textContent = "";
  private rectWidth = 0;
  private rectHeight = 0;
  private measuredScrollHeight?: number;
  private measuredClientHeight?: number;
  private readonly listeners = new Map<string, Array<(event?: FakeEventPayload) => void>>();

  constructor(public readonly tagName: string, public readonly ownerDocument: FakeDocument) {}

  get className(): string {
    return this._className;
  }

  set className(value: string) {
    this._className = value;
    this.ownerDocument.configureElement?.(this);
  }

  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    if (child.parent) {
      const previousIndex = child.parent.children.indexOf(child);
      if (previousIndex >= 0) {
        child.parent.children.splice(previousIndex, 1);
      }
    }
    child.parent = this;
    this.children.push(child);
    return child;
  }

  setCssStyles(styles: Record<string, string>): void {
    this.style.setCssStyles(styles);
  }

  setCssProps(props: Record<string, string>): void {
    this.style.setCssProps(props);
  }

  addEventListener(
    type: string,
    listener: (event?: FakeEventPayload) => void
  ): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(
    type: string,
    listener: (event?: FakeEventPayload) => void
  ): void {
    const existing = this.listeners.get(type) ?? [];
    const filtered = existing.filter((entry) => entry !== listener);
    if (filtered.length === 0) {
      this.listeners.delete(type);
      return;
    }
    this.listeners.set(type, filtered);
  }

  click(): void {
    if (this.disabled) {
      return;
    }
    this.trigger("click");
  }

  focus(): void {
    this.focused = true;
  }

  setScrollMetrics(scrollHeight?: number, clientHeight?: number): void {
    this.measuredScrollHeight = scrollHeight;
    this.measuredClientHeight = clientHeight;
  }

  setRectSize(width: number, height: number): void {
    this.rectWidth = width;
    this.rectHeight = height;
  }

  get offsetWidth(): number {
    return this.rectWidth;
  }

  get scrollHeight(): number | undefined {
    return this.measuredScrollHeight;
  }

  get clientHeight(): number | undefined {
    return this.measuredClientHeight;
  }

  get offsetHeight(): number {
    return this.rectHeight;
  }

  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    return {
      left: 0,
      top: 0,
      right: this.rectWidth,
      bottom: this.rectHeight,
      width: this.rectWidth,
      height: this.rectHeight
    };
  }

  scrollIntoView(): void {}

  trigger(
    type: string,
    event?: Record<string, unknown> & {
      key?: string;
      preventDefault?: () => void;
      stopPropagation?: () => void;
    }
  ): void {
    const listeners = this.listeners.get(type) ?? [];
    const normalizedEvent = {
      ...event,
      key: event?.key,
      preventDefault: event?.preventDefault ?? (() => undefined),
      stopPropagation: event?.stopPropagation ?? (() => undefined)
    };
    listeners.forEach((listener) => listener(normalizedEvent));
  }

  set textContent(value: string) {
    this._textContent = value;
  }

  get textContent(): string {
    const childText = this.children.map((child) => child.textContent).join("");
    return `${this._textContent}${childText}`;
  }

  contains(target: unknown): boolean {
    if (!(target instanceof FakeElement)) {
      return false;
    }
    if (target === this) {
      return true;
    }
    return this.children.some((child) => child.contains(target));
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];

    const visit = (node: FakeElement): void => {
      if (matchesSelector(node, selector)) {
        matches.push(node);
      }

      node.children.forEach(visit);
    };

    this.children.forEach(visit);
    return matches;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  remove(): void {
    if (!this.parent) {
      return;
    }

    const index = this.parent.children.indexOf(this);
    if (index >= 0) {
      this.parent.children.splice(index, 1);
    }
    this.parent = null;
  }

  set innerHTML(_value: string) {
    if (this.ownerDocument.throwOnInnerHtmlAssignment) {
      throw new Error("innerHTML assignment is disabled in this test");
    }

    this.children = [];
    this.textContent = "";
  }
}

class FakeDocument {
  public readonly selection = new FakeSelection();
  public readonly body: FakeElement;
  public configureElement?: (element: FakeElement) => void;
  public throwOnInnerHtmlAssignment = false;

  private readonly listeners = new Map<string, Array<(event?: FakeEventPayload) => void>>();

  constructor() {
    this.body = new FakeElement("BODY", this);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName.toUpperCase(), this);
  }

  addEventListener(type: string, listener: (event?: FakeEventPayload) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: (event?: FakeEventPayload) => void): void {
    const existing = this.listeners.get(type) ?? [];
    const filtered = existing.filter((entry) => entry !== listener);
    if (filtered.length === 0) {
      this.listeners.delete(type);
      return;
    }
    this.listeners.set(type, filtered);
  }

  trigger(type: string, event?: FakeEventPayload): void {
    const listeners = this.listeners.get(type) ?? [];
    const normalizedEvent = {
      ...event,
      key: event?.key,
      preventDefault: event?.preventDefault ?? (() => undefined),
      stopPropagation: event?.stopPropagation ?? (() => undefined)
    };
    listeners.forEach((listener) => listener(normalizedEvent));
  }

  createRange(): FakeRange {
    return new FakeRange();
  }

  getSelection(): FakeSelection {
    return this.selection;
  }
}

function matchesSelector(node: FakeElement, selector: string): boolean {
  if (selector.startsWith(".")) {
    const cls = selector.slice(1);
    return node.className.split(/\s+/).filter(Boolean).includes(cls);
  }

  const attributeOnlyMatch = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (attributeOnlyMatch) {
    const [, attributeName, attributeValue] = attributeOnlyMatch;
    const currentValue = node.getAttribute(attributeName);
    return attributeValue === undefined ? currentValue !== null : currentValue === attributeValue;
  }

  const checked = selector.endsWith(":checked");
  const base = checked ? selector.slice(0, -":checked".length) : selector;
  const [tagPart, classPart] = base.split(".");

  if (tagPart && node.tagName !== tagPart.toUpperCase()) {
    return false;
  }

  if (classPart) {
    const classes = node.className.split(/\s+/).filter(Boolean);
    if (!classes.includes(classPart)) {
      return false;
    }
  }

  if (checked) {
    return Boolean((node as unknown as { checked?: boolean }).checked);
  }

  return true;
}

function createContainer(options?: {
  configureElement?: (element: FakeElement) => void;
  throwOnInnerHtmlAssignment?: boolean;
}): HTMLElement {
  const document = new FakeDocument();
  document.configureElement = options?.configureElement;
  document.throwOnInnerHtmlAssignment = options?.throwOnInnerHtmlAssignment ?? false;
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container as unknown as HTMLElement;
}

function getDocumentSelection(root: HTMLElement): FakeSelection {
  return ((root as unknown as FakeElement).ownerDocument as FakeDocument).selection;
}

function createBrowseState(overrides: BrowseStateOverrides = {}): PoolViewState {
  const browseState = buildPoolViewState("pool-browse");
  return {
    ...browseState,
    ...overrides,
    header: {
      ...browseState.header,
      ...(overrides.header ?? {})
    },
    browse: {
      ...browseState.browse!,
      ...(overrides.browse ?? {})
    },
    controls: overrides.controls
      ? {
          ...browseState.controls,
          ...overrides.controls
        }
      : browseState.controls,
    poolOptions: overrides.poolOptions ?? browseState.poolOptions
  };
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

const stylesCss = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSelectorBlock(css: string, selector: string): string {
  const blockMatch = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`));
  expect(blockMatch).not.toBeNull();
  return blockMatch?.[1] ?? "";
}

function getMediaQueryBlock(css: string, mediaQuery: string): string {
  const atRule = `@media ${mediaQuery}`;
  const startIndex = css.indexOf(atRule);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const openBraceIndex = css.indexOf("{", startIndex);
  expect(openBraceIndex).toBeGreaterThanOrEqual(0);

  let depth = 1;
  let cursor = openBraceIndex + 1;
  while (cursor < css.length && depth > 0) {
    const char = css[cursor];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }
    cursor += 1;
  }

  expect(depth).toBe(0);
  return css.slice(openBraceIndex + 1, cursor - 1);
}

function expectDeclarationsInSelectorBlock(css: string, selector: string, declarations: string[]): void {
  const block = getSelectorBlock(css, selector);
  declarations.forEach((declaration) => {
    expect(block).toContain(declaration);
  });
}

describe("renderPoolView", () => {
  it("renders browse no-sidebar shell with required controls and sections", () => {
    const container = createContainer();
    const state = createBrowseState({
      header: {
        title: "写作池"
      },
      browse: {
        description: "沉淀写作主题与段落素材"
      },
      poolOptions: [
        { id: "pool-writing", label: "写作池", count: 12, selected: true },
        { id: "pool-product", label: "产品池", count: 3, selected: false }
      ]
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    expect(container.querySelector(".glitter-pool-stage__topbar")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__back")?.getAttribute("aria-label")).toBe("返回首页");
    expect(container.querySelector(".glitter-pool-stage__title")?.textContent).toContain("写作池");
    expect(container.querySelector(".glitter-pool-stage__title-switcher")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__topbar-tools")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__topbar-create-icon")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__topbar-create-label")?.textContent).toContain("灵感速记");
    expect((container.querySelector(".glitter-pool-stage__topbar-create") as unknown as FakeElement | null)?.parent?.className).toContain(
      "glitter-pool-stage__topbar-tools"
    );
    expect(container.querySelector(".glitter-pool-stage__topbar-tools")?.querySelector(".glitter-pool-stage__query")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__topbar-tools")?.querySelector(".glitter-pool-stage__status-trigger")).toBeNull();

    expect(container.querySelector(".glitter-pool-stage__description-strip")?.textContent).toContain("沉淀写作主题与段落素材");

    expect(container.querySelector(".glitter-pool-stage__workbench")).not.toBeNull();
    const poolPane = container.querySelector(".glitter-pool-stage__workbench-pane--pool") as unknown as FakeElement | null;
    expect(poolPane).not.toBeNull();
    expect((container.querySelector(".glitter-pool-stage__topbar") as unknown as FakeElement | null)?.parent).toBe(poolPane);
    expect(container.querySelector(".glitter-pool-stage__results")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-header")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-lead")).not.toBeNull();
    const resultsControls = container.querySelector(".glitter-pool-stage__results-controls") as unknown as FakeElement | null;
    expect(resultsControls).not.toBeNull();
    expect(resultsControls?.children[0]?.className).toContain("glitter-pool-stage__results-tools");
    expect(resultsControls?.children[1]).toBeUndefined();
    expect(container.querySelector(".glitter-pool-stage__results-summary")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-entry-button")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-entry-label")?.textContent).toBe("漫游模式");
    expect(container.querySelector(".glitter-pool-stage__results-tools")).not.toBeNull();
    expect((container.querySelector(".glitter-pool-stage__results-tools") as unknown as FakeElement | null)?.children[0]?.className).toContain("glitter-pool-stage__query");
    expect((container.querySelector(".glitter-pool-stage__results-tools") as unknown as FakeElement | null)?.children[1]?.className).toContain("glitter-pool-stage__results-tool-anchor--status");
    expect((container.querySelector(".glitter-pool-stage__results-tools") as unknown as FakeElement | null)?.children[2]?.className).toContain("glitter-pool-stage__results-tool-anchor--filter");
    expect((container.querySelector(".glitter-pool-stage__results-tools") as unknown as FakeElement | null)?.children[3]?.className).toContain("glitter-pool-stage__results-tool-anchor--sort");
    expect((container.querySelector(".glitter-pool-stage__results-tools") as unknown as FakeElement | null)?.children[4]?.className).toContain("glitter-pool-stage__results-tool-anchor--batch");
    expect((container.querySelector(".glitter-pool-stage__query") as unknown as { placeholder?: string })?.placeholder).toBe("搜索当前池中的灵感");
    expect(container.querySelector(".glitter-pool-stage__status-trigger")?.getAttribute("aria-label")).toBe("状态筛选");
    expect(container.querySelector(".glitter-pool-stage__results-tool-icon--status")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-tool--filter")?.getAttribute("aria-label")).toBe("筛选");
    expect(container.querySelector(".glitter-pool-stage__results-tool--sort")?.getAttribute("aria-label")).toBe("排序");
    expect(container.querySelector("[data-glitter-pool-roam-toggle]")?.getAttribute("aria-label")).toBe("打开漫游模式");
    expect(container.querySelector(".glitter-pool-stage__batch-toggle")?.getAttribute("aria-label")).toBe("批量整理");
    expect(container.querySelectorAll("[data-glitter-pool-roam-source-handle]")).toHaveLength(0);
    expect(container.querySelector(".glitter-pool-stage__results-tool-icon--filter")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-tool-icon--sort")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-tool-icon--roam")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-tool-icon--batch")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__create-fab")).toBeNull();

    expect(container.querySelector(".glitter-pool-stage__title-edit")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__sidebar")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__pool-dock")).toBeNull();

    expect(container.querySelectorAll(".glitter-pool-stage__card-shell")).toHaveLength(3);
    expect(container.querySelectorAll(".glitter-pool-stage__card-menu-shell")).toHaveLength(3);
    expect(container.querySelectorAll(".glitter-pool-stage__card-more-trigger")).toHaveLength(3);
    expect(container.querySelectorAll(".glitter-pool-stage__card-header")).toHaveLength(3);
    expect(container.querySelectorAll(".glitter-pool-stage__card-content")).toHaveLength(3);
    expect(
      (container.querySelectorAll(".glitter-pool-stage__card-menu-shell")[0] as unknown as FakeElement | undefined)?.parent?.className
    ).toContain("glitter-pool-stage__card-surface");
  });

  it("clears stale container children without falling back to innerHTML when empty is unavailable", () => {
    const container = createContainer({ throwOnInnerHtmlAssignment: true });
    const ownerDocument = (container as unknown as FakeElement).ownerDocument as FakeDocument;
    const staleNode = ownerDocument.createElement("div");
    staleNode.className = "stale-node";
    (container as unknown as FakeElement).appendChild(staleNode);

    expect(() => {
      renderPoolView(container, createBrowseState(), {
        onBack() {},
        onItemSelect() {},
        onCreateIdea() {}
      });
    }).not.toThrow();

    expect(staleNode.parent).toBeNull();
    expect(container.querySelector(".stale-node")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__topbar")).not.toBeNull();
  });

  it("renders English toolbar, menu, and empty labels from view state", () => {
    const container = createContainer();
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "Product pool",
        description: "Product notes",
        totalItemCount: 1,
        visibleItemCount: 0,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "missing",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        {
          id: "pool-product",
          label: "Product pool",
          count: 1,
          selected: true
        }
      ],
      batchMode: false,
      activeOverlay: "status",
      interfaceLanguage: "en",
      roamBackConfirmVisible: true
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    expect((container.querySelector(".glitter-pool-stage__query") as unknown as { placeholder?: string })?.placeholder).toBe("Search ideas in this pool");
    expect(container.querySelector(".glitter-pool-stage__status-trigger")?.getAttribute("aria-label")).toBe("Status filter");
    expect(container.querySelector(".glitter-pool-stage__toolbar-menu")?.textContent).toContain("All ideas");
    expect(container.querySelector(".glitter-pool-stage__toolbar-menu")?.textContent).toContain("File created");
    expect(container.querySelector(".glitter-pool-stage__empty-eyebrow")?.textContent).toBe("Filter results");
    expect(container.querySelector(".glitter-pool-stage__empty-title")?.textContent).toBe("No matching ideas found");
    expect(container.textContent).not.toContain("筛选结果");
  });

  it("renders English roam-back labels from view state", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        labels: buildPoolViewStateFromRuntime({
          pool: {
            id: "pool-product",
            title: "Product pool",
            description: "Product notes",
            totalItemCount: 1,
            visibleItemCount: 1,
            tone: "bluegray"
          },
          header: { eyebrow: "Idea Pool", hint: "runtime" },
          cards: [],
          controls: {
            query: "",
            status: "all",
            contentFilter: "all",
            sort: "updated-desc",
            selectedCount: 0,
            hasSelection: false
          },
          poolOptions: [],
          batchMode: false,
          interfaceLanguage: "en"
        }).browse?.labels
      },
      roamBackConfirmVisible: true
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    expect(container.querySelector(".glitter-write-stage__close-confirm-title")?.textContent).toBe("Notice");
    expect(container.querySelector(".glitter-write-stage__close-confirm-description")?.textContent).toBe(
      "Returning home in roam mode will end this idea roam session. You can reopen it from roam history."
    );
    expect(container.querySelector(".glitter-write-stage__close-confirm-secondary")?.textContent).toBe("Continue roaming");
    expect(container.querySelector(".glitter-write-stage__close-confirm-primary")?.textContent).toBe("Back home");
    expect(container.textContent).not.toContain("提示");
  });

  it("renders English roam panel labels from view state", () => {
    const container = createContainer();
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "empty",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [],
        labels: {
          toggleOpen: "Open roam mode",
          toggleClose: "Close roam mode",
          modeLabel: "Roam mode",
          downloadCurrentBoard: "Download current roam board",
          shareCurrentBoard: "Share current roam board",
          openHistory: "Open roam board history",
          errorTitle: "Roam board is temporarily unavailable",
          errorDescription: "Please try again later.",
          emptyTitle: "New blank roam area",
          emptyDescription: "Drag a dot from the top-right of a left card into this area to create the first roam board block.",
          sourceHandleTitle: "Drag a connection line to the roam board on the right",
          sourceHandleLabel: (ideaTitle) => `Connect \"${ideaTitle}\" to the roam board`,
          bridgeMarkerLabel: (ideaTitle) => `View roam link for \"${ideaTitle}\"`,
          bridgeMeta: (poolName) => `From ${poolName}`,
          locateSource: "Locate source card",
          deleteLink: "Delete link"
        }
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    expect(container.querySelector("[data-glitter-pool-roam-toggle]")?.getAttribute("aria-label")).toBe("Close roam mode");
    expect(container.querySelector(".glitter-pool-stage__results-entry-label")?.textContent).toBe("Roam mode");
    expect(container.querySelector("[data-glitter-pool-roam-action=\"download\"]")?.getAttribute("aria-label")).toBe("Download current roam board");
    expect(container.querySelector("[data-glitter-pool-roam-action=\"share\"]")?.getAttribute("aria-label")).toBe("Share current roam board");
    expect(container.querySelector("[data-glitter-pool-roam-action=\"history\"]")?.getAttribute("aria-label")).toBe("Open roam board history");
    expect(container.querySelector(".glitter-pool-stage__roam-empty-title")?.textContent).toBe("New blank roam area");
    expect(container.querySelector(".glitter-pool-stage__roam-empty-description")?.textContent).toBe(
      "Drag a dot from the top-right of a left card into this area to create the first roam board block."
    );
    expect(container.querySelector("[data-glitter-pool-roam-source-handle=\"idea-product-1\"]")?.getAttribute("aria-label")).toBe(
      "Connect \"Design weekly notes\" to the roam board"
    );
    expect(container.querySelector("[data-glitter-pool-roam-source-handle=\"idea-product-1\"]")?.getAttribute("title")).toBe(
      "Drag a connection line to the roam board on the right"
    );
  });

  it("renders roam source handles with a divider-centered seam trace and hover actions without duplicated boundary anchors", () => {
    const container = createContainer();
    const calls = {
      toggles: 0,
      attaches: [] as string[],
      locates: [] as string[],
      deletes: [] as string[]
    };
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [
          {
            anchorId: "anchor-visible",
            ideaId: "idea-product-1",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Design weekly notes",
            visibleBridge: true
          },
          {
            anchorId: "anchor-missing",
            ideaId: "idea-missing",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#ffd468",
            ideaTitle: "Missing source idea",
            visibleBridge: true
          }
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onTogglePoolRoam() {
        calls.toggles += 1;
      },
      onAttachPoolRoamSource(ideaId) {
        calls.attaches.push(ideaId);
      },
      onLocatePoolRoamSource(ideaId) {
        calls.locates.push(ideaId);
      },
      onDeletePoolRoamSourceLink(anchorId) {
        calls.deletes.push(anchorId);
      }
    });

    const roamToggle = container.querySelector("[data-glitter-pool-roam-toggle]") as unknown as FakeElement | null;
    const workbench = container.querySelector(".glitter-pool-stage__workbench") as unknown as FakeElement | null;
    const poolPane = container.querySelector(".glitter-pool-stage__workbench-pane--pool") as unknown as FakeElement | null;
    const roamPane = container.querySelector(".glitter-pool-stage__workbench-pane--roam") as unknown as FakeElement | null;
    const roamPanel = container.querySelector(".glitter-pool-stage__roam-panel") as unknown as FakeElement | null;
    const roamCanvasStage = container.querySelector(".glitter-pool-stage__roam-canvas-stage") as unknown as FakeElement | null;
    const roamCanvasHost = container.querySelector(".glitter-pool-stage__roam-canvas-host") as unknown as FakeElement | null;
    const bridgeLane = container.querySelector(".glitter-pool-stage__roam-bridge-lane") as unknown as FakeElement | null;
    const bridgeTrace = container.querySelector("[data-glitter-pool-roam-bridge-trace=\"anchor-visible\"]") as unknown as FakeElement | null;
    const bridgeSegments = container.querySelector(
      "[data-glitter-pool-roam-bridge-segments=\"anchor-visible\"]"
    ) as unknown as FakeElement | null;
    const bridgeLine = container.querySelector(".glitter-pool-stage__roam-bridge-line") as unknown as FakeElement | null;
    const bridgeHoverZone = container.querySelector(".glitter-pool-stage__roam-bridge-hover-zone") as unknown as FakeElement | null;
    const bridgeMarker = container.querySelector(".glitter-pool-stage__roam-bridge-marker") as unknown as FakeElement | null;
    const bridgePopover = container.querySelector(".glitter-pool-stage__roam-bridge-popover") as unknown as FakeElement | null;
    const bridgeTitle = container.querySelector(".glitter-pool-stage__roam-bridge-popover-title") as unknown as FakeElement | null;
    const bridgeMeta = container.querySelector(".glitter-pool-stage__roam-bridge-popover-meta") as unknown as FakeElement | null;
    const locateButton = container.querySelector("[data-glitter-pool-roam-bridge-locate=\"anchor-visible\"]") as unknown as FakeElement | null;
    const deleteButton = container.querySelector("[data-glitter-pool-roam-bridge-delete=\"anchor-visible\"]") as unknown as FakeElement | null;
    const sourceHandle = container.querySelector(
      "[data-glitter-pool-roam-source-handle=\"idea-product-1\"]"
    ) as unknown as FakeElement | null;

    expect(roamToggle).not.toBeNull();
    expect(roamToggle?.getAttribute("aria-pressed")).toBe("true");
    expect(workbench?.className).toContain("glitter-pool-stage__workbench--roam");
    expect(poolPane).not.toBeNull();
    expect(roamPane).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-split-view")).toBeNull();
    expect(roamPanel).not.toBeNull();
    expect(roamCanvasStage?.getAttribute("data-glitter-pool-roam-dropzone")).toBe("true");
    expect(roamCanvasHost?.dataset.boardPath).toBe("Glitter/灵感漫游/demo.canvas");
    expect(container.querySelectorAll("[data-glitter-pool-roam-action]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-glitter-pool-roam-source-handle]")).toHaveLength(3);
    expect(container.querySelectorAll(".glitter-pool-stage__roam-boundary-anchor")).toHaveLength(0);
    expect(container.querySelectorAll(".glitter-pool-stage__roam-bridge-trace")).toHaveLength(2);
    expect(container.querySelectorAll(".glitter-pool-stage__roam-bridge-label")).toHaveLength(0);
    expect(bridgeLane?.parent).toBe(workbench);
    expect(bridgeTrace?.parent).toBe(bridgeLane);
    expect(bridgeSegments?.parent).toBe(bridgeTrace);
    expect(bridgeHoverZone?.parent).toBe(bridgeTrace);
    expect(bridgeLine?.parent).toBe(bridgeSegments);
    expect(bridgeMarker?.parent).toBe(bridgeTrace);
    expect(bridgePopover?.parent).toBe(bridgeTrace);
    expect(bridgeTrace?.style.color).toBe("#6ab5ff");
    expect(bridgeMarker?.style.background).toBe("#6ab5ff");
    expect(bridgeTitle?.textContent).toBe("Design weekly notes");
    expect(bridgeMeta?.textContent).toBe("来自 产品池");
    expect(sourceHandle?.getAttribute("draggable")).toBeNull();
    expect((container.querySelector(".glitter-pool-stage__topbar") as unknown as FakeElement | null)?.parent).toBe(poolPane);

    locateButton?.click();
    deleteButton?.click();
    sourceHandle?.click();
    roamToggle?.click();

    expect(calls.locates).toEqual(["idea-product-1"]);
    expect(calls.deletes).toEqual(["anchor-visible"]);
    expect(calls.attaches).toEqual([]);
    expect(calls.toggles).toBe(1);
  });

  it("renders a roam exit confirm layer before returning home", () => {
    const container = createContainer();
    const calls = {
      dismisses: 0,
      confirms: 0
    };
    const state = createBrowseState({
      roamBackConfirmVisible: true,
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: []
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onDismissRoamBackConfirm() {
        calls.dismisses += 1;
      },
      onConfirmRoamBackHome() {
        calls.confirms += 1;
      },
      onItemSelect() {},
      onCreateIdea() {}
    });

    const stage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
    const poolPane = container.querySelector(".glitter-pool-stage__workbench-pane--pool") as unknown as FakeElement | null;
    const closeConfirm = container.querySelector(".glitter-pool-stage__roam-back-confirm") as unknown as FakeElement | null;
    const dialog = container.querySelector(".glitter-pool-stage__roam-back-confirm-dialog") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-write-stage__close-confirm-title") as unknown as FakeElement | null;
    const description = container.querySelector(".glitter-write-stage__close-confirm-description") as unknown as FakeElement | null;
    const continueButton = container.querySelector(".glitter-write-stage__close-confirm-secondary") as unknown as FakeElement | null;
    const homeButton = container.querySelector(".glitter-write-stage__close-confirm-primary") as unknown as FakeElement | null;

    expect(poolPane).not.toBeNull();
    expect(closeConfirm?.parent).toBe(stage);
    expect(dialog?.parent).toBe(closeConfirm);
    expect(title?.textContent).toBe("提示");
    expect(description?.textContent).toBe("漫游模式下返回首页将直接结束本次灵感漫游，可在漫游历史中重新进入。");
    expect(continueButton?.textContent).toBe("继续漫游");
    expect(homeButton?.textContent).toBe("返回首页");

    continueButton?.click();
    homeButton?.click();

    expect(calls.dismisses).toBe(1);
    expect(calls.confirms).toBe(1);
  });

  it("resizes the roam pane within the configured clamp range", () => {
    const container = createContainer();
    const calls = {
      ratios: [] as number[]
    };
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [],
        panelWidthRatio: 0.6
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onSetPoolRoamPaneRatio(ratio) {
        calls.ratios.push(ratio);
      },
      onItemSelect() {},
      onCreateIdea() {}
    });

    const workbench = container.querySelector(".glitter-pool-stage__workbench") as unknown as FakeElement | null;
    const divider = container.querySelector(".glitter-pool-stage__roam-divider") as unknown as FakeElement | null;
    const ownerDocument = (container as unknown as FakeElement).ownerDocument as FakeDocument;

    expect(workbench).not.toBeNull();
    expect(divider).not.toBeNull();

    (workbench as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 100,
      top: 0,
      right: 1100,
      bottom: 640,
      width: 1000,
      height: 640,
      x: 100,
      y: 0,
      toJSON: () => ({})
    });

    expect((workbench as FakeElement).style.gridTemplateColumns).toBe("minmax(0, 40.0000%) minmax(0, 60.0000%)");
    expect((divider as FakeElement).style.left).toBe("40.0000%");
    expect((workbench as FakeElement).style.setCssStylesCallCount).toBeGreaterThan(0);
    expect((divider as FakeElement).style.setCssStylesCallCount).toBeGreaterThan(0);

    divider?.trigger("mousedown", { clientX: 80, button: 0 });
    expect((workbench as FakeElement).style.gridTemplateColumns).toBe("minmax(0, 20.0000%) minmax(0, 80.0000%)");
    expect((divider as FakeElement).style.left).toBe("20.0000%");

    ownerDocument.trigger("mousemove", { clientX: 980 });
    expect((workbench as FakeElement).style.gridTemplateColumns).toBe("minmax(0, 80.0000%) minmax(0, 20.0000%)");
    expect((divider as FakeElement).style.left).toBe("80.0000%");

    ownerDocument.trigger("mouseup");
    expect(calls.ratios).toEqual([0.2]);
  });

  it("repositions seam traces when the card grid scrolls after render", () => {
    const container = createContainer();
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [
          {
            anchorId: "anchor-visible",
            ideaId: "idea-product-1",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Design weekly notes",
            visibleBridge: true
          }
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    const workbench = container.querySelector(".glitter-pool-stage__workbench") as unknown as FakeElement | null;
    const cardGrid = container.querySelector(".glitter-pool-stage__card-grid") as unknown as FakeElement | null;
    const roamPane = container.querySelector(".glitter-pool-stage__workbench-pane--roam") as unknown as FakeElement | null;
    const sourceHandle = container.querySelector(
      "[data-glitter-pool-roam-source-handle=\"idea-product-1\"]"
    ) as unknown as FakeElement | null;
    const bridgeTrace = container.querySelector("[data-glitter-pool-roam-bridge-trace=\"anchor-visible\"]") as unknown as FakeElement | null;

    expect(workbench).not.toBeNull();
    expect(cardGrid).not.toBeNull();
    expect(roamPane).not.toBeNull();
    expect(sourceHandle).not.toBeNull();
    expect(bridgeTrace).not.toBeNull();

    (workbench as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 20,
      top: 40,
      right: 820,
      bottom: 640,
      width: 800,
      height: 600,
      x: 20,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);
    (sourceHandle as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 120,
      top: 240,
      right: 130,
      bottom: 250,
      width: 10,
      height: 10,
      x: 120,
      y: 240,
      toJSON: () => ({})
    } as DOMRect);
    (roamPane as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 420,
      top: 40,
      right: 820,
      bottom: 640,
      width: 400,
      height: 600,
      x: 420,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);

    cardGrid?.trigger("scroll");

    const bridgeLine = container.querySelector(".glitter-pool-stage__roam-bridge-line") as unknown as FakeElement | null;
    const bridgeHoverZone = container.querySelector(".glitter-pool-stage__roam-bridge-hover-zone") as unknown as FakeElement | null;
    const bridgeMarker = container.querySelector(".glitter-pool-stage__roam-bridge-marker") as unknown as FakeElement | null;
    const bridgePopover = container.querySelector(".glitter-pool-stage__roam-bridge-popover") as unknown as FakeElement | null;

    expect(bridgeLine).not.toBeNull();
    expect(bridgeHoverZone).not.toBeNull();
    expect(bridgeMarker).not.toBeNull();
    expect(bridgePopover).not.toBeNull();
    expect(bridgeTrace?.style.left).toBe("93px");
    expect(bridgeTrace?.style.top).toBe("193px");
    expect(bridgeTrace?.style.width).toBe("319px");
    expect(bridgeTrace?.style.height).toBe("24px");
    expect(bridgeLine?.style.left).toBe("12px");
    expect(bridgeLine?.style.top).toBe("11px");
    expect(bridgeLine?.style.width).toBe("295px");
    expect(bridgeLine?.style.height).toBe("2px");
    expect(bridgeHoverZone?.style.left).toBe("277px");
    expect(bridgeHoverZone?.style.top).toBe("-12px");
    expect(bridgeHoverZone?.style.width).toBe("48px");
    expect(bridgeHoverZone?.style.height).toBe("48px");
    expect(bridgeMarker?.style.left).toBe("307px");
    expect(bridgeMarker?.style.top).toBe("12px");
    expect(bridgePopover?.style.left).toBe("289px");
    expect(bridgePopover?.style.top).toBe("12px");
  });

  it("keeps only the boundary marker visible when the source handle scrolls out of the card grid and restores the line when it returns", () => {
    const container = createContainer();
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [
          {
            anchorId: "anchor-visible",
            ideaId: "idea-product-1",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Design weekly notes",
            visibleBridge: true
          }
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    const workbench = container.querySelector(".glitter-pool-stage__workbench") as unknown as FakeElement | null;
    const cardGrid = container.querySelector(".glitter-pool-stage__card-grid") as unknown as FakeElement | null;
    const roamPane = container.querySelector(".glitter-pool-stage__workbench-pane--roam") as unknown as FakeElement | null;
    const sourceHandle = container.querySelector(
      "[data-glitter-pool-roam-source-handle=\"idea-product-1\"]"
    ) as unknown as FakeElement | null;
    const bridgeTrace = container.querySelector("[data-glitter-pool-roam-bridge-trace=\"anchor-visible\"]") as unknown as FakeElement | null;

    expect(workbench).not.toBeNull();
    expect(cardGrid).not.toBeNull();
    expect(roamPane).not.toBeNull();
    expect(sourceHandle).not.toBeNull();
    expect(bridgeTrace).not.toBeNull();

    (workbench as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 20,
      top: 40,
      right: 820,
      bottom: 640,
      width: 800,
      height: 600,
      x: 20,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);
    (cardGrid as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 20,
      top: 100,
      right: 420,
      bottom: 540,
      width: 400,
      height: 440,
      x: 20,
      y: 100,
      toJSON: () => ({})
    } as DOMRect);
    (roamPane as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 420,
      top: 40,
      right: 820,
      bottom: 640,
      width: 400,
      height: 600,
      x: 420,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);
    (sourceHandle as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 120,
      top: 60,
      right: 130,
      bottom: 70,
      width: 10,
      height: 10,
      x: 120,
      y: 60,
      toJSON: () => ({})
    } as DOMRect);

    cardGrid?.trigger("scroll");

    let bridgeSegments = container.querySelectorAll(".glitter-pool-stage__roam-bridge-line") as unknown as FakeElement[];
    let bridgeMarker = container.querySelector(".glitter-pool-stage__roam-bridge-marker") as unknown as FakeElement | null;

    expect(bridgeSegments).toHaveLength(0);
    expect(bridgeMarker).not.toBeNull();
    expect(bridgeTrace?.style.left).toBe("388px");
    expect(bridgeTrace?.style.top).toBe("60px");
    expect(bridgeTrace?.style.width).toBe("24px");
    expect(bridgeTrace?.style.height).toBe("24px");
    expect(bridgeMarker?.style.left).toBe("12px");
    expect(bridgeMarker?.style.top).toBe("12px");

    (sourceHandle as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 120,
      top: 240,
      right: 130,
      bottom: 250,
      width: 10,
      height: 10,
      x: 120,
      y: 240,
      toJSON: () => ({})
    } as DOMRect);

    cardGrid?.trigger("scroll");

    bridgeSegments = container.querySelectorAll(".glitter-pool-stage__roam-bridge-line") as unknown as FakeElement[];
    bridgeMarker = container.querySelector(".glitter-pool-stage__roam-bridge-marker") as unknown as FakeElement | null;

    expect(bridgeSegments).toHaveLength(1);
    expect(bridgeTrace?.style.left).toBe("93px");
    expect(bridgeTrace?.style.top).toBe("193px");
    expect(bridgeTrace?.style.width).toBe("319px");
    expect(bridgeTrace?.style.height).toBe("24px");
    expect(bridgeMarker?.style.left).toBe("307px");
    expect(bridgeMarker?.style.top).toBe("12px");
  });

  it("disconnects old roam bridge layout listeners before a full rerender clears the workbench", () => {
    const container = createContainer();
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [
          {
            anchorId: "anchor-visible",
            ideaId: "idea-product-1",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Design weekly notes",
            visibleBridge: true
          }
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    const oldWorkbench = container.querySelector(".glitter-pool-stage__workbench") as unknown as FakeElement | null;
    const oldCardGrid = container.querySelector(".glitter-pool-stage__card-grid") as unknown as FakeElement | null;

    expect(oldWorkbench).not.toBeNull();
    expect(oldCardGrid).not.toBeNull();

    let oldWorkbenchSyncCalls = 0;
    (oldWorkbench as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => {
      oldWorkbenchSyncCalls += 1;
      return {
        left: 20,
        top: 40,
        right: 820,
        bottom: 640,
        width: 800,
        height: 600,
        x: 20,
        y: 40,
        toJSON: () => ({})
      } as DOMRect;
    };

    renderPoolView(container, createBrowseState({ mode: "first-use-choose" }), {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    oldCardGrid?.trigger("scroll");

    expect(oldWorkbenchSyncCalls).toBe(0);
  });

  it("routes attached seam traces around other cards before reaching the roam boundary", () => {
    const container = createContainer();
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [
          {
            anchorId: "anchor-visible",
            ideaId: "idea-product-1",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Design weekly notes",
            visibleBridge: true
          }
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    const workbench = container.querySelector(".glitter-pool-stage__workbench") as unknown as FakeElement | null;
    const cardGrid = container.querySelector(".glitter-pool-stage__card-grid") as unknown as FakeElement | null;
    const roamPane = container.querySelector(".glitter-pool-stage__workbench-pane--roam") as unknown as FakeElement | null;
    const sourceHandle = container.querySelector(
      "[data-glitter-pool-roam-source-handle=\"idea-product-1\"]"
    ) as unknown as FakeElement | null;
    const cardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];

    expect(workbench).not.toBeNull();
    expect(cardGrid).not.toBeNull();
    expect(roamPane).not.toBeNull();
    expect(sourceHandle).not.toBeNull();
    expect(cardShells.length).toBeGreaterThanOrEqual(2);

    (workbench as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 20,
      top: 40,
      right: 820,
      bottom: 640,
      width: 800,
      height: 600,
      x: 20,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);
    (sourceHandle as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 120,
      top: 240,
      right: 130,
      bottom: 250,
      width: 10,
      height: 10,
      x: 120,
      y: 240,
      toJSON: () => ({})
    } as DOMRect);
    (roamPane as FakeElement & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 420,
      top: 40,
      right: 820,
      bottom: 640,
      width: 400,
      height: 600,
      x: 420,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);

    const obstacleCard = cardShells.find((cardShell) => cardShell.dataset.ideaId === "idea-product-2") as
      | (FakeElement & { getBoundingClientRect: () => DOMRect })
      | undefined;
    expect(obstacleCard).toBeDefined();
    obstacleCard!.getBoundingClientRect = () => ({
      left: 200,
      top: 150,
      right: 340,
      bottom: 260,
      width: 140,
      height: 110,
      x: 200,
      y: 150,
      toJSON: () => ({})
    } as DOMRect);

    cardGrid?.trigger("scroll");

    const bridgeSegments = container.querySelectorAll(".glitter-pool-stage__roam-bridge-line") as unknown as FakeElement[];
    const bridgeMarker = container.querySelector(".glitter-pool-stage__roam-bridge-marker") as unknown as FakeElement | null;

    expect(bridgeSegments).toHaveLength(2);
    expect(bridgeSegments.map((segment) => ({
      left: segment.style.left,
      top: segment.style.top,
      width: segment.style.width,
      height: segment.style.height
    }))).toEqual([
      { left: "11px", top: "12px", width: "2px", height: "27px" },
      { left: "12px", top: "38px", width: "295px", height: "2px" }
    ]);
    expect(bridgeMarker?.style.left).toBe("307px");
    expect(bridgeMarker?.style.top).toBe("39px");
  });

  it("attaches roam source from the handle drag gesture and clears preview state after drop and cancel", () => {
    const container = createContainer();
    const calls = {
      attaches: [] as string[]
    };
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download"],
        boundaryAnchors: []
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onAttachPoolRoamSource(ideaId) {
        calls.attaches.push(ideaId);
      }
    });

    const stage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
    const roamCanvasStage = container.querySelector(".glitter-pool-stage__roam-canvas-stage") as unknown as FakeElement | null;
    const bridgeLane = container.querySelector(".glitter-pool-stage__roam-bridge-lane") as unknown as FakeElement | null;
    const sourceContent = container.querySelector(".glitter-pool-stage__card-content") as unknown as FakeElement | null;
    const sourceHandle = container.querySelector(
      "[data-glitter-pool-roam-source-handle=\"idea-product-1\"]"
    ) as unknown as FakeElement | null;
    const ownerDocument = (container as unknown as FakeElement).ownerDocument as FakeDocument;

    expect(bridgeLane).not.toBeNull();
    expect(container.querySelectorAll(".glitter-pool-stage__roam-bridge-trace")).toHaveLength(0);

    sourceHandle?.trigger("mousedown", {
      button: 0,
      clientX: 24,
      clientY: 32,
      target: sourceHandle
    });
    roamCanvasStage?.trigger("mouseenter", {
      clientX: 420,
      clientY: 160,
      target: roamCanvasStage
    });

    expect(stage?.className).toContain("glitter-pool-stage--roam-source-dragging");
    expect(sourceHandle?.className).toContain("glitter-pool-stage__roam-source-handle--dragging");
    expect(sourceContent?.className).toContain("glitter-pool-stage__card-content--roam-source-dragging");
    expect(roamCanvasStage?.className).toContain("glitter-pool-stage__roam-canvas-stage--drag-over");
    expect(container.querySelector(".glitter-pool-stage__roam-source-drag-line")).not.toBeNull();

    ownerDocument.trigger("mouseup", {
      clientX: 420,
      clientY: 160,
      target: roamCanvasStage
    });

    expect(calls.attaches).toEqual(["idea-product-1"]);
    expect(stage?.className).not.toContain("glitter-pool-stage--roam-source-dragging");
    expect(sourceHandle?.className).not.toContain("glitter-pool-stage__roam-source-handle--dragging");
    expect(sourceContent?.className).not.toContain("glitter-pool-stage__card-content--roam-source-dragging");
    expect(roamCanvasStage?.className).not.toContain("glitter-pool-stage__roam-canvas-stage--drag-over");
    expect(container.querySelector(".glitter-pool-stage__roam-source-drag-line")).toBeNull();

    sourceHandle?.trigger("mousedown", {
      button: 0,
      clientX: 24,
      clientY: 32,
      target: sourceHandle
    });
    ownerDocument.trigger("mouseup", {
      clientX: 96,
      clientY: 96,
      target: stage
    });

    expect(calls.attaches).toEqual(["idea-product-1"]);
    expect(stage?.className).not.toContain("glitter-pool-stage--roam-source-dragging");
    expect(roamCanvasStage?.className).not.toContain("glitter-pool-stage__roam-canvas-stage--drag-over");
    expect(container.querySelector(".glitter-pool-stage__roam-source-drag-line")).toBeNull();
  });

  it("renders seam traces only after anchors exist in a roam rerender", () => {
    const container = createContainer();
    const actions = {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    };
    const emptyState = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download"],
        boundaryAnchors: []
      }
    });
    const attachedState = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download"],
        boundaryAnchors: [
          {
            anchorId: "anchor-product-1",
            ideaId: "idea-product-1",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Design weekly notes",
            visibleBridge: true
          }
        ]
      }
    });

    renderPoolView(container, emptyState, actions);
    expect(container.querySelectorAll(".glitter-pool-stage__roam-bridge-trace")).toHaveLength(0);

    renderPoolView(container, attachedState, actions);

    const attachedTrace = container.querySelector(
      "[data-glitter-pool-roam-bridge-trace=\"anchor-product-1\"]"
    ) as unknown as FakeElement | null;

    expect(container.querySelectorAll(".glitter-pool-stage__roam-bridge-trace")).toHaveLength(1);
    expect(attachedTrace?.className).toContain("glitter-pool-stage__roam-bridge-trace--attached");
  });

  it("attaches roam source when the mouse is released over the roam half by pointer position", () => {
    const container = createContainer();
    const calls = {
      attaches: [] as string[]
    };
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download"],
        boundaryAnchors: []
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onAttachPoolRoamSource(ideaId) {
        calls.attaches.push(ideaId);
      }
    });

    const stage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
    const sourceHandle = container.querySelector(
      "[data-glitter-pool-roam-source-handle=\"idea-product-1\"]"
    ) as unknown as FakeElement | null;
    const roamPane = container.querySelector(".glitter-pool-stage__workbench-pane--roam") as unknown as FakeElement | null;
    const ownerDocument = (container as unknown as FakeElement).ownerDocument as FakeDocument;

    roamPane?.setRectSize(560, 640);
    sourceHandle?.trigger("mousedown", {
      button: 0,
      clientX: 24,
      clientY: 32,
      target: sourceHandle
    });
    ownerDocument.trigger("mouseup", {
      clientX: 420,
      clientY: 180,
      target: stage
    });

    expect(calls.attaches).toEqual(["idea-product-1"]);
    expect(container.querySelector(".glitter-pool-stage__roam-source-drag-line")).toBeNull();
  });

  it("attaches roam source when the mouse is released over a descendant inside the native roam host", () => {
    const container = createContainer();
    const calls = {
      attaches: [] as string[]
    };
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download"],
        boundaryAnchors: []
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onAttachPoolRoamSource(ideaId) {
        calls.attaches.push(ideaId);
      }
    });

    const sourceHandle = container.querySelector(
      "[data-glitter-pool-roam-source-handle=\"idea-product-1\"]"
    ) as unknown as FakeElement | null;
    const roamCanvasHost = container.querySelector(".glitter-pool-stage__roam-canvas-host") as unknown as FakeElement | null;
    const ownerDocument = (container as unknown as FakeElement).ownerDocument as FakeDocument;
    const descendantTarget = ownerDocument.createElement("div");
    roamCanvasHost?.appendChild(descendantTarget);

    sourceHandle?.trigger("mousedown", {
      button: 0,
      clientX: 24,
      clientY: 32,
      target: sourceHandle
    });
    ownerDocument.trigger("mouseup", {
      clientX: 460,
      clientY: 180,
      target: descendantTarget
    });

    expect(calls.attaches).toEqual(["idea-product-1"]);
    expect(container.querySelector(".glitter-pool-stage__roam-source-drag-line")).toBeNull();
  });

  it("attaches roam source from drop data even when drag state is restored from the event payload", () => {
    const container = createContainer();
    const calls = {
      attaches: [] as string[]
    };
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "empty",
        historyEnabled: true,
        floatingActions: ["download"],
        boundaryAnchors: []
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onAttachPoolRoamSource(ideaId) {
        calls.attaches.push(ideaId);
      }
    });

    const stage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
    const roamCanvasStage = container.querySelector(".glitter-pool-stage__roam-canvas-stage") as unknown as FakeElement | null;

    roamCanvasStage?.trigger("dragover", {
      dataTransfer: {
        getData: () => "idea-product-2"
      }
    });
    roamCanvasStage?.trigger("drop", {
      dataTransfer: {
        getData: () => "idea-product-2"
      }
    });

    expect(calls.attaches).toEqual(["idea-product-2"]);
    expect(stage?.className).not.toContain("glitter-pool-stage--roam-source-dragging");
    expect(roamCanvasStage?.className).not.toContain("glitter-pool-stage__roam-canvas-stage--drag-over");
  });

  it("keeps residual roam anchors hidden when roam mode is closed", () => {
    const container = createContainer();
    const state = createBrowseState({
      roam: {
        open: false,
        mode: "empty",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [
          {
            anchorId: "anchor-residual",
            ideaId: "idea-product-1",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Design weekly notes",
            visibleBridge: true
          }
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    expect(container.querySelector(".glitter-pool-stage__workbench-pane--roam")).toBeNull();
    expect(container.querySelectorAll(".glitter-pool-stage__roam-bridge-trace")).toHaveLength(0);
    expect(container.querySelectorAll("[data-glitter-pool-roam-source-handle]")).toHaveLength(0);
  });

  it("only marks the attached duplicate-title card as the active roam source", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-dup-1",
            title: "重复标题",
            selected: false,
            typeIcon: "text",
            contentKind: "text",
            bodyText: "第一条正文",
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [{ kind: "create-file", label: "创建文件" }],
            snippetLocations: []
          },
          {
            id: "idea-dup-2",
            title: "重复标题",
            selected: false,
            typeIcon: "text",
            contentKind: "text",
            bodyText: "第二条正文",
            updatedLabel: "2026-04-18 09:30",
            fileCreated: false,
            statusLabels: [],
            menuActions: [{ kind: "create-file", label: "创建文件" }],
            snippetLocations: []
          }
        ]
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 2, selected: true }],
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/duplicate.canvas",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [
          {
            anchorId: "anchor-dup",
            ideaId: "idea-dup-2",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "重复标题",
            visibleBridge: true
          }
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    });

    const firstHandle = container.querySelector(
      "[data-glitter-pool-roam-source-handle=\"idea-dup-1\"]"
    ) as unknown as FakeElement | null;
    const secondHandle = container.querySelector(
      "[data-glitter-pool-roam-source-handle=\"idea-dup-2\"]"
    ) as unknown as FakeElement | null;
    const bridgeTrace = container.querySelector("[data-glitter-pool-roam-bridge-trace=\"anchor-dup\"]") as unknown as FakeElement | null;

    expect(firstHandle?.className).toBe("glitter-pool-stage__roam-source-handle");
    expect(secondHandle?.className).toContain("glitter-pool-stage__roam-source-handle--active");
    expect(bridgeTrace).not.toBeNull();
    expect(container.querySelectorAll(".glitter-pool-stage__roam-bridge-label")).toHaveLength(0);
  });

  it("renders a pool markdown toolbar toggle for pool-level preview state", () => {
    const container = createContainer();
    const calls = {
      toggles: 0
    };
    const state = createBrowseState({
      preview: {
        available: true,
        open: false,
        saving: false,
        panelTitle: "写作池 Markdown 文件",
        saveLabel: "保存 Markdown 文件"
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onTogglePoolMarkdownPreview() {
        calls.toggles += 1;
      }
    });

    const resultsTools = container.querySelector(".glitter-pool-stage__results-tools") as unknown as FakeElement | null;
    const previewAnchor = container.querySelector(".glitter-pool-stage__results-tool-anchor--preview") as unknown as FakeElement | null;
    const batchAnchor = container.querySelector(".glitter-pool-stage__results-tool-anchor--batch") as unknown as FakeElement | null;
    const previewTrigger = container.querySelector(".glitter-pool-stage__results-tool--preview") as unknown as FakeElement | null;
    const previewIndex = previewAnchor ? (resultsTools?.children.indexOf(previewAnchor) ?? -1) : -1;
    const batchIndex = batchAnchor ? (resultsTools?.children.indexOf(batchAnchor) ?? -1) : -1;

    expect(previewAnchor).not.toBeNull();
    expect(batchAnchor).not.toBeNull();
    expect(previewAnchor?.parent).toBe(resultsTools);
    expect(batchAnchor?.parent).toBe(resultsTools);
    expect(previewIndex).toBeGreaterThanOrEqual(0);
    expect(batchIndex).toBe(previewIndex + 1);
    expect(previewTrigger?.getAttribute("aria-label")).toBe("查看当前池 Markdown 文件");
    expect(previewTrigger?.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector(".glitter-pool-stage__pool-markdown-preview")).toBeNull();

    previewTrigger?.click();
    expect(calls.toggles).toBe(1);
  });

  it("disables the pool markdown preview trigger while roam mode is open", () => {
    const container = createContainer();
    const calls = {
      toggles: 0
    };
    const state = createBrowseState({
      preview: {
        available: true,
        open: false,
        saving: false,
        panelTitle: "写作池 Markdown 文件",
        saveLabel: "保存 Markdown 文件"
      },
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: []
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onTogglePoolMarkdownPreview() {
        calls.toggles += 1;
      }
    });

    const previewTrigger = container.querySelector(".glitter-pool-stage__results-tool--preview") as unknown as FakeElement | null;

    expect(previewTrigger).not.toBeNull();
    expect(previewTrigger?.disabled).toBe(true);
    expect(previewTrigger?.getAttribute("aria-disabled")).toBe("true");
    expect(previewTrigger?.getAttribute("title")).toBe("漫游模式下暂不支持查看当前池 Markdown 文件");

    previewTrigger?.click();
    expect(calls.toggles).toBe(0);
  });

  it("renders the pool markdown split-view shell while keeping the card pane visible", () => {
    const container = createContainer();
    const calls = {
      saves: 0
    };
    const state = createBrowseState({
      preview: {
        available: true,
        open: true,
        saving: false,
        panelTitle: "写作池 Markdown 文件",
        saveLabel: "保存 Markdown 文件"
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onSavePoolMarkdownFile() {
        calls.saves += 1;
      }
    });

    const previewTrigger = container.querySelector(".glitter-pool-stage__results-tool--preview") as unknown as FakeElement | null;
    const splitView = container.querySelector(".glitter-pool-stage__results-split-view") as unknown as FakeElement | null;
    const browsePane = container.querySelector(".glitter-pool-stage__results-pane--cards") as unknown as FakeElement | null;
    const previewPanel = container.querySelector(".glitter-pool-stage__pool-markdown-preview") as unknown as FakeElement | null;
    const previewTitle = container.querySelector(".glitter-pool-stage__pool-markdown-preview-title") as unknown as FakeElement | null;
    const saveButton = container.querySelector(".glitter-pool-stage__pool-markdown-preview-save") as unknown as FakeElement | null;
    const previewContent = container.querySelector(".glitter-pool-stage__pool-markdown-preview-content") as unknown as FakeElement | null;

    expect(previewTrigger?.getAttribute("aria-pressed")).toBe("true");
    expect(splitView).not.toBeNull();
    expect(browsePane).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__card-grid")).not.toBeNull();
    expect(previewPanel).not.toBeNull();
    expect(previewTitle?.textContent).toBe("写作池 Markdown 文件");
    expect(saveButton?.textContent).toBe("保存 Markdown 文件");
    expect(previewContent).not.toBeNull();

    saveButton?.click();
    expect(calls.saves).toBe(1);
  });

  it("shows the pool card scrollbar indicator only while the card grid is actively scrolling", () => {
    vi.useFakeTimers();
    try {
      const container = createContainer();
      renderPoolView(container, createBrowseState(), {
        onBack() {},
        onItemSelect() {},
        onCreateIdea() {}
      });

      const cardGrid = container.querySelector(".glitter-pool-stage__card-grid") as unknown as FakeElement | null;
      const cardGridShell = container.querySelector(".glitter-pool-stage__card-grid-shell") as unknown as FakeElement | null;
      const indicator = container.querySelector(".glitter-pool-stage__card-scroll-indicator") as unknown as FakeElement | null;
      const thumb = container.querySelector(".glitter-pool-stage__card-scroll-indicator-thumb") as unknown as FakeElement | null;
      expect(cardGrid).not.toBeNull();
      expect(cardGridShell).not.toBeNull();
      expect(indicator).not.toBeNull();
      expect(thumb).not.toBeNull();
      expect(cardGridShell?.children[0]).toBe(cardGrid);
      expect(cardGridShell?.children[1]).toBe(indicator);
      expect(cardGrid?.className).not.toContain("glitter-pool-stage__card-grid--scrolling");
      expect((indicator?.style as Record<string, string>)["--glitter-pool-scroll-indicator-center"]).toBe("7.00px");
      expect((indicator as FakeElement).style.setCssPropsCallCount).toBeGreaterThan(0);

      cardGrid?.setScrollMetrics(900, 300);
      cardGrid!.scrollTop = 300;
      cardGrid?.trigger("scroll");
      expect(cardGrid?.className).toContain("glitter-pool-stage__card-grid--scrolling");
      expect((indicator?.style as Record<string, string>)["--glitter-pool-scroll-indicator-center"]).toBe("131.00px");

      vi.advanceTimersByTime(899);
      expect(cardGrid?.className).toContain("glitter-pool-stage__card-grid--scrolling");

      vi.advanceTimersByTime(1);
      expect(cardGrid?.className).not.toContain("glitter-pool-stage__card-grid--scrolling");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a single card-grid scroll indicator when the pool view rerenders in place", () => {
    const container = createContainer();
    const actions = {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    };

    renderPoolView(container, createBrowseState(), actions);
    const previousCardGrid = container.querySelector(".glitter-pool-stage__card-grid") as unknown as FakeElement | null;
    expect(previousCardGrid).not.toBeNull();

    renderPoolView(container, createBrowseState(), actions);

    const currentCardGrid = container.querySelector(".glitter-pool-stage__card-grid") as unknown as FakeElement | null;
    const indicators = container.querySelectorAll(".glitter-pool-stage__card-scroll-indicator") as unknown as FakeElement[];
    expect(currentCardGrid).toBe(previousCardGrid);
    expect(indicators).toHaveLength(1);

    previousCardGrid?.trigger("scroll");
    expect(previousCardGrid?.className).toContain("glitter-pool-stage__card-grid--scrolling");
  });

  it("keeps a single seam bridge lane on the workbench when roam mode rerenders in place", () => {
    const container = createContainer();
    const actions = {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {}
    };
    const state = createBrowseState({
      roam: {
        open: true,
        mode: "board",
        boardPath: "Glitter/灵感漫游/demo.canvas",
        historyEnabled: true,
        floatingActions: ["download"],
        boundaryAnchors: [
          {
            anchorId: "anchor-product",
            ideaId: "idea-product-1",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Design weekly notes",
            visibleBridge: true
          }
        ]
      }
    });

    renderPoolView(container, state, actions);
    renderPoolView(container, state, actions);

    const workbench = container.querySelector(".glitter-pool-stage__workbench") as unknown as FakeElement | null;
    const bridgeLanes = container.querySelectorAll(".glitter-pool-stage__roam-bridge-lane") as unknown as FakeElement[];

    expect(bridgeLanes).toHaveLength(1);
    expect(bridgeLanes[0]?.parent).toBe(workbench);
  });

  it("disables the preview save button while the pool markdown file is saving", () => {
    const container = createContainer();
    const calls = {
      saves: 0
    };
    const state = createBrowseState({
      preview: {
        available: true,
        open: true,
        saving: true,
        panelTitle: "写作池 Markdown 文件",
        saveLabel: "保存 Markdown 文件"
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onSavePoolMarkdownFile() {
        calls.saves += 1;
      }
    });

    const saveButton = container.querySelector(".glitter-pool-stage__pool-markdown-preview-save") as unknown as FakeElement | null;

    expect(saveButton).not.toBeNull();
    expect(saveButton?.disabled).toBe(true);

    saveButton?.click();
    expect(calls.saves).toBe(0);
  });

  it("renders batch controls inside the card pane while the pool markdown preview is open", () => {
    const container = createContainer();
    const state = createBrowseState({
      pool: {
        id: "pool-product",
        title: "产品池",
        itemCount: 20,
        tone: "bluegray"
      },
      preview: {
        available: true,
        open: true,
        saving: false,
        panelTitle: "产品池 Markdown 文件",
        saveLabel: "保存 Markdown 文件"
      },
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 1,
        hasSelection: true,
        batchMode: true
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const browsePane = container.querySelector(".glitter-pool-stage__results-pane--cards") as unknown as FakeElement | null;
    const batchPanel = container.querySelector(".glitter-pool-stage__batch-panel") as unknown as FakeElement | null;
    const previewPanel = container.querySelector(".glitter-pool-stage__pool-markdown-preview") as unknown as FakeElement | null;

    expect(batchPanel).not.toBeNull();
    expect(batchPanel?.parent).toBe(browsePane);
    expect(previewPanel?.querySelector(".glitter-pool-stage__batch-panel")).toBeNull();
  });

  it("renders the pool-empty state as a themed summary block", () => {
    const container = createContainer();
    const state = buildPoolViewState("pool-empty");

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const results = container.querySelector(".glitter-pool-stage__results") as unknown as FakeElement | null;
    const emptyCard = container.querySelector(".glitter-pool-stage__empty") as unknown as FakeElement | null;

    expect(results).not.toBeNull();
    expect(emptyCard).not.toBeNull();
    expect(emptyCard?.parent).toBe(results);
    expect(container.querySelector(".glitter-pool-stage__empty-eyebrow")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__empty-title")?.textContent).toBe("这个池里还没有灵感");
    expect(container.querySelector(".glitter-pool-stage__empty-description")?.textContent).toBe(
      "先记录一条灵感，之后就能在这里查看、筛选和整理。"
    );
    expect(container.querySelector(".glitter-pool-stage__card-grid")).toBeNull();
  });

  it("renders the zero-result empty state inside the card pane while the pool markdown preview is open", () => {
    const container = createContainer();
    const state = createBrowseState({
      preview: {
        available: true,
        open: true,
        saving: false,
        panelTitle: "写作池 Markdown 文件",
        saveLabel: "保存 Markdown 文件"
      },
      browse: {
        cards: []
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const browsePane = container.querySelector(".glitter-pool-stage__results-pane--cards") as unknown as FakeElement | null;
    const emptyState = container.querySelector(".glitter-pool-stage__empty") as unknown as FakeElement | null;

    expect(container.querySelector(".glitter-pool-stage__pool-markdown-preview")).not.toBeNull();
    expect(emptyState).not.toBeNull();
    expect(emptyState?.parent).toBe(browsePane);
    expect(container.querySelector(".glitter-pool-stage__empty-eyebrow")?.textContent).toBe("筛选结果");
    expect(container.querySelector(".glitter-pool-stage__empty-title")?.textContent).toBe("没有找到匹配的灵感");
    expect(container.querySelector(".glitter-pool-stage__empty-description")?.textContent).toBe(
      "换个筛选条件或搜索词，再试一次。"
    );
  });

  it("keeps the pool markdown split-view CSS contract for Task 5", () => {
    const roamIconBlock = getSelectorBlock(stylesCss, ".glitter-pool-stage__results-tool-icon--roam");
    expect(roamIconBlock).toContain("-webkit-mask-image:");
    expect(roamIconBlock).toContain("mask-image:");

    const previewIconBlock = getSelectorBlock(stylesCss, ".glitter-pool-stage__results-tool-icon--preview");
    expect(previewIconBlock).toContain("-webkit-mask-image:");
    expect(previewIconBlock).toContain("mask-image:");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__status-trigger[aria-expanded=\"true\"]", [
      "background: color-mix(in srgb, var(--glitter-ui-surface) 72%, var(--glitter-ui-accent) 24%);",
      "color: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__results-tool[aria-expanded=\"true\"]", [
      "background: color-mix(in srgb, var(--glitter-ui-surface) 72%, var(--glitter-ui-accent) 24%);",
      "color: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__results-tool[aria-pressed=\"true\"]", [
      "background: color-mix(in srgb, var(--glitter-ui-surface) 72%, var(--glitter-ui-accent) 24%);",
      "color: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__results-tool:disabled", [
      "opacity: 0.42;",
      "cursor: default;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__batch-toggle[aria-pressed=\"true\"]", [
      "background: color-mix(in srgb, var(--glitter-ui-surface) 72%, var(--glitter-ui-accent) 24%);",
      "color: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__workbench", [
      "position: relative;",
      "display: flex;",
      "flex: 1 1 auto;",
      "min-height: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__workbench--roam", [
      "display: grid;",
      "grid-template-columns: minmax(0, 40%) minmax(0, 60%);",
      "gap: 0;",
      "align-items: stretch;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__workbench-pane--pool", [
      "min-width: 0;",
      "min-height: 0;",
      "display: flex;",
      "flex: 1 1 auto;",
      "flex-direction: column;",
      "gap: 14px;",
      "overflow: hidden;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__workbench--roam > .glitter-pool-stage__workbench-pane--pool", [
      "box-sizing: border-box;",
      "padding-right: var(--glitter-pool-stage-side-padding);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-back-confirm", [
      "z-index: 8;",
      "align-items: center;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-back-confirm-dialog", [
      "width: min(100%, 520px);",
      "display: flex;",
      "flex-direction: column;",
      "box-sizing: border-box;",
      "padding: 28px 30px 24px;",
      "border-radius: 22px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 92%, transparent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__workbench-pane--roam", [
      "position: relative;",
      "min-width: 0;",
      "min-height: 0;",
      "display: flex;",
      "overflow: hidden;",
      "box-sizing: border-box;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-divider", [
      "position: absolute;",
      "top: 0;",
      "bottom: 0;",
      "left: 40%;",
      "width: 20px;",
      "transform: translateX(-50%);",
      "cursor: col-resize;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-divider-line", [
      "width: 1px;",
      "height: 100%;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-entry", [
      "display: flex;",
      "align-items: center;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__results-entry-button", [
      "min-height: 32px;",
      "padding: 0 12px;",
      "border-radius: 999px;",
      "display: inline-flex;",
      "gap: 8px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 84%, transparent);",
      "color: var(--glitter-ui-text);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__results-entry-button[aria-pressed=\"true\"]", [
      "background: color-mix(in srgb, var(--glitter-ui-surface) 72%, var(--glitter-ui-accent) 24%);",
      "color: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-split-view", [
      "display: grid;",
      "grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);",
      "gap: 14px;",
      "flex: 1 1 auto;",
      "min-height: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-pane", [
      "min-width: 0;",
      "min-height: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-pane--cards", [
      "position: relative;",
      "display: flex;",
      "flex-direction: column;",
      "min-width: 0;",
      "min-height: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results", [
      "position: relative;",
      "min-width: 0;",
      "min-height: 0;",
      "flex: 1 1 auto;",
      "display: flex;",
      "flex-direction: column;",
      "gap: 22px;",
      "margin-top: 8px;",
      "padding-bottom: 0;",
      "overflow: visible;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-grid-shell", [
      "position: relative;",
      "display: flex;",
      "flex: 1 1 auto;",
      "flex-direction: column;",
      "min-width: 0;",
      "min-height: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-panel", [
      "position: relative;",
      "min-width: 0;",
      "min-height: 0;",
      "display: flex;",
      "flex: 1 1 auto;",
      "overflow: hidden;",
      "border-radius: 0;",
      "background: transparent;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-canvas-stage", [
      "position: relative;",
      "flex: 1 1 auto;",
      "min-width: 0;",
      "min-height: 0;",
      "border-radius: 0;",
      "overflow: hidden;",
      "border: none;",
      "background: var(--background-primary, var(--glitter-ui-bg));"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-canvas-host", [
      "position: relative;",
      "z-index: 1;",
      "display: flex;",
      "flex: 1 1 auto;",
      "align-items: stretch;",
      "justify-content: stretch;",
      "width: 100%;",
      "height: 100%;",
      "min-height: 0;",
      "padding: 0;",
      "overflow: hidden;",
      "background: transparent;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-bridge-lane", [
      "position: absolute;",
      "inset: 0;",
      "pointer-events: none;",
      "z-index: 4;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-bridge-trace", [
      "position: absolute;",
      "min-width: 24px;",
      "min-height: 24px;",
      "pointer-events: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-bridge-segments", [
      "position: absolute;",
      "inset: 0;",
      "pointer-events: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-bridge-line", [
      "position: absolute;",
      "border-radius: 999px;",
      "background: currentColor;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-bridge-hover-zone", [
      "position: absolute;",
      "z-index: 1;",
      "pointer-events: auto;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-bridge-popover", [
      "position: absolute;",
      "z-index: 3;",
      "transform: translate(-100%, -50%);",
      "pointer-events: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-source-drag-line", [
      "position: absolute;",
      "left: 0;",
      "top: 0;",
      "height: 2px;",
      "pointer-events: none;",
      "z-index: 5;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-content--roam-source-dragging", [
      "box-shadow:",
      "inset 0 0 0 1px color-mix(in srgb, var(--glitter-ui-accent) 18%, transparent),"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__roam-source-handle", [
      "position: absolute;",
      "top: 12px;",
      "right: 12px;",
      "width: 14px;",
      "height: 14px;",
      "border-radius: 999px;",
      "cursor: grab;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__roam-source-handle--dragging", [
      "cursor: grabbing !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__pool-markdown-preview", [
      "min-width: 0;",
      "min-height: 0;",
      "display: flex;",
      "flex-direction: column;",
      "gap: 12px;",
      "padding: 14px;",
      "border: 1px solid color-mix(in srgb, var(--glitter-ui-border) 82%, transparent);",
      "border-radius: 16px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 92%, transparent);",
      "overflow: hidden;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__pool-markdown-preview-content", [
      "flex: 1 1 auto;",
      "min-height: 0;",
      "overflow: auto;",
      "scrollbar-gutter: stable;",
      "padding: 14px;",
      "border-radius: 12px;"
    ]);

    const stackedSplitViewCss = getMediaQueryBlock(stylesCss, "(max-width: 1120px)");
    expect(stackedSplitViewCss).not.toContain(".glitter-pool-stage__workbench--roam {");
    expect(stackedSplitViewCss).not.toContain(".glitter-pool-stage__workbench-pane--roam {");
    expect(stackedSplitViewCss).not.toContain(".glitter-pool-stage__workbench--roam .glitter-pool-stage__roam-bridge-lane {");
    expectDeclarationsInSelectorBlock(stackedSplitViewCss, ".glitter-pool-stage__results-split-view", [
      "grid-template-columns: minmax(0, 1fr);"
    ]);
    expectDeclarationsInSelectorBlock(stackedSplitViewCss, ".glitter-pool-stage__pool-markdown-preview", [
      "min-height: 280px;"
    ]);
  });

  it("uses the rolled-back pool empty-state styling with lighter description copy", () => {
    const emptyBlock = getSelectorBlock(stylesCss, ".glitter-pool-stage__empty");
    expect(stylesCss).not.toContain(".glitter-pool-stage__empty-shell {");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__empty", [
      "display: grid;",
      "gap: 10px;",
      "padding: 18px;",
      "border: 1px solid color-mix(in srgb, var(--background-modifier-border, #4a5f84) 72%, transparent);",
      "border-radius: 16px;",
      "background: color-mix(in srgb, var(--background-secondary, #162034) 84%, transparent);",
      "color: var(--text-normal, #dce5ff);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__empty-eyebrow", [
      "display: inline-flex;",
      "width: fit-content;",
      "min-height: 22px;",
      "padding: 0 8px;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--background-secondary-alt, #222b3b) 92%, transparent);",
      "color: var(--text-muted, #9fb0d3);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__empty-title", [
      "display: block;",
      "font-size: 15px;",
      "line-height: 1.5;",
      "color: var(--text-normal, #dce5ff);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__empty-description", [
      "margin: 0;",
      "font-size: 13px;",
      "line-height: 1.6;",
      "color: var(--glitter-ui-text-faint);"
    ]);
    expect(emptyBlock).not.toContain("#c6d5f4");
    expect(emptyBlock).not.toContain("rgba(112, 139, 191, 0.46)");
    expect(emptyBlock).not.toContain("text-align: center;");
    expect(emptyBlock).not.toContain("width: min(100%, 520px);");
  });

  it("hides pool-only title affordances and uses a custom query placeholder for global status results", () => {
    const container = createContainer();
    const state = createBrowseState({
      header: {
        title: "已引用 / 已建文件"
      },
      browse: {
        description: "汇总所有池中的状态灵感",
        queryPlaceholder: "搜索当前筛选灵感"
      },
      showPoolSwitcher: false,
      metadataEditable: false,
      poolOptions: [
        { id: "pool-default", label: "默认池", count: 2, selected: false },
        { id: "pool-writing", label: "写作池", count: 2, selected: false }
      ]
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    expect(container.querySelector(".glitter-pool-stage__title-switcher")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__title--editable")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__description-strip--editable")).toBeNull();
    expect((container.querySelector(".glitter-pool-stage__query") as unknown as { placeholder?: string })?.placeholder).toBe("搜索当前筛选灵感");
  });

  it("renders browse zero-result state with topbar create button and no bottom fab", () => {
    const container = createContainer();
    const filteredState = createBrowseState({
      browse: {
        resultSummary: "命中 0 / 共 3 条灵感",
        cards: []
      }
    });

    renderPoolView(container, filteredState, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    expect(container.querySelector(".glitter-pool-stage__results")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__results-summary")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__empty")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__empty-eyebrow")?.textContent).toBe("筛选结果");
    expect(container.querySelector(".glitter-pool-stage__empty-title")?.textContent).toBe("没有找到匹配的灵感");
    expect(container.querySelector(".glitter-pool-stage__empty-description")?.textContent).toBe(
      "换个筛选条件或搜索词，再试一次。"
    );
    expect(container.querySelector(".glitter-pool-stage__card-grid")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__topbar-create-label")?.textContent).toContain("灵感速记");
    expect(container.querySelector(".glitter-pool-stage__topbar-create-icon")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__create-fab")).toBeNull();
  });

  it("renders toolbar menus for status, filter, and sort overlays", () => {
    const overlays = ["status", "filter", "sort"] as const;

    overlays.forEach((overlay) => {
      const container = createContainer();
      const state = createBrowseState({
        browse: {
          activeOverlay: overlay
        }
      });

      renderPoolView(container, state, {
        onBack() {},
        onItemSelect() {},
        onCreateIdea() {},
        onQueryChange() {},
        onBrowseOverlayToggle() {},
        onBrowseOverlayClose() {},
        onContentFilterChange() {},
        onStatusChange() {},
        onSortChange() {},
        onBatchModeToggle() {},
        onMoveSelectionToPool() {},
        onCreateFile() {},
        onOpenPrimaryFile() {},
        onEditIdea() {},
        onShareIdea() {},
        onPoolSwitch() {}
      });

      const menu = container.querySelector(".glitter-pool-stage__toolbar-menu") as unknown as FakeElement | null;
      expect(menu).not.toBeNull();

      if (overlay === "status") {
        expect(menu?.parent?.className).toContain("glitter-pool-stage__results-tool-anchor--status");
        const text = container.querySelector(".glitter-pool-stage__toolbar-menu")?.textContent ?? "";
        expect(text).toContain("全部灵感");
        expect(text).toContain("已引用");
        expect(text).toContain("已建文件");
        expect(text).toContain("带状态");
      }

      if (overlay === "filter") {
        expect(menu?.parent?.className).toContain("glitter-pool-stage__results-tool-anchor--filter");
        const text = container.querySelector(".glitter-pool-stage__toolbar-menu")?.textContent ?? "";
        expect(text).toContain("全部");
        expect(text).toContain("文本");
        expect(text).toContain("链接");
        expect(text).toContain("图片");
        expect(text).toContain("视频");
      }

      if (overlay === "sort") {
        expect(menu?.parent?.className).toContain("glitter-pool-stage__results-tool-anchor--sort");
      }

      if (overlay === "sort") {
        const text = container.querySelector(".glitter-pool-stage__toolbar-menu")?.textContent ?? "";
        expect(text).toContain("最近更新");
        expect(text).toContain("最近创建");
        expect(text).toContain("标题排序");
      }
    });
  });

  it("renders batch organize controls with round card selectors and move menu", () => {
    const container = createContainer();
    const state = createBrowseState({
      pool: {
        id: "pool-product",
        title: "产品池",
        itemCount: 20,
        tone: "bluegray"
      },
      browse: {
        activeOverlay: "batch"
      },
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 1,
        hasSelection: true,
        batchMode: true
      },
      poolOptions: [
        { id: "pool-product", label: "产品池", count: 20, selected: true },
        { id: "pool-writing", label: "写作池", count: 12, selected: false }
      ]
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onDeleteSelection() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    expect(container.querySelectorAll(".glitter-pool-stage__card-select-toggle")).toHaveLength(3);
    expect(container.querySelectorAll(".glitter-pool-stage__card-more-trigger")).toHaveLength(0);
    expect(container.querySelector(".glitter-pool-stage__batch-summary")?.textContent).toContain("1/20");
    expect(container.querySelector(".glitter-pool-stage__batch-action--delete")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__batch-action--move")).not.toBeNull();
    const batchMenu = container.querySelector(".glitter-pool-stage__toolbar-menu") as unknown as FakeElement | null;
    const createPoolButton = container.querySelector(".glitter-pool-stage__toolbar-menu-create") as unknown as FakeElement | null;

    expect(container.querySelector(".glitter-pool-stage__toolbar-menu-title")?.textContent).toBe("移动到");
    expect(batchMenu?.textContent).toContain("写作池");
    expect(
      Array.from(container.querySelectorAll(".glitter-pool-stage__toolbar-menu-item")).map((item) => item.textContent)
    ).toEqual(["写作池"]);
    expect(createPoolButton).not.toBeNull();
    expect(createPoolButton?.parent).toBe(batchMenu);
    expect(createPoolButton?.disabled).toBe(false);
    expect(createPoolButton?.getAttribute("aria-label")).toBe("新建池");
    expect(createPoolButton?.children[0]?.className).toContain("glitter-write-stage__icon--plus");
    expect(batchMenu?.parent?.className).toContain("glitter-pool-stage__batch-action-anchor--move");
    expect(batchMenu?.className).toContain("glitter-pool-stage__toolbar-menu--batch");
  });

  it("routes batch create button through the create-new-pool selection callback", () => {
    const calls = {
      movedPoolIds: [] as string[]
    };
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        activeOverlay: "batch"
      },
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 1,
        hasSelection: true,
        batchMode: true
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool(poolId) {
        calls.movedPoolIds.push(poolId);
      },
      onDeleteSelection() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const createPoolButton = container.querySelector(".glitter-pool-stage__toolbar-menu-create") as unknown as { click: () => void };
    createPoolButton.click();

    expect(calls.movedPoolIds).toEqual([CREATE_NEW_POOL_ID]);
  });

  it("keeps the batch create button disabled when nothing is selected", () => {
    const calls = {
      movedPoolIds: [] as string[]
    };
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        activeOverlay: "batch"
      },
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false,
        batchMode: true
      },
      poolOptions: [
        { id: "pool-product", label: "产品池", count: 20, selected: true },
        { id: "pool-writing", label: "写作池", count: 12, selected: false }
      ]
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool(poolId) {
        calls.movedPoolIds.push(poolId);
      },
      onDeleteSelection() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const moveTargetButton = container.querySelector(".glitter-pool-stage__toolbar-menu-item") as unknown as FakeElement | null;
    const createPoolButton = container.querySelector(".glitter-pool-stage__toolbar-menu-create") as unknown as FakeElement | null;
    expect(moveTargetButton?.disabled).toBe(true);
    expect(createPoolButton?.disabled).toBe(true);
    moveTargetButton?.click();
    createPoolButton?.click();

    expect(calls.movedPoolIds).toEqual([]);
  });

  it("routes batch panel actions through delete and move callbacks", () => {
    const calls = {
      deleted: 0,
      toggledOverlays: [] as string[]
    };
    const container = createContainer();
    const state = createBrowseState({
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 1,
        hasSelection: true,
        batchMode: true
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle(overlay) {
        calls.toggledOverlays.push(overlay);
      },
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onDeleteSelection() {
        calls.deleted += 1;
      },
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const deleteButton = container.querySelector(".glitter-pool-stage__batch-action--delete") as unknown as { click: () => void };
    const moveButton = container.querySelector(".glitter-pool-stage__batch-action--move") as unknown as { click: () => void };

    deleteButton.click();
    moveButton.click();

    expect(calls.deleted).toBe(1);
    expect(calls.toggledOverlays).toEqual(["batch"]);
  });

  it("renders pool switcher popup from activeOverlay with selected and active semantics", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        activeOverlay: "pool-switcher",
        poolSwitcherActivePoolId: "pool-product"
      },
      poolOptions: [
        { id: "pool-writing", label: "写作池", count: 12, selected: true },
        { id: "pool-product", label: "产品池", count: 3, selected: false }
      ]
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const popupItems = container.querySelectorAll(".glitter-pool-stage__pool-popup-item");
    expect(popupItems).toHaveLength(2);
    expect(popupItems[0]?.className).toContain("glitter-pool-stage__pool-popup-item--selected");
    expect(popupItems[1]?.className).toContain("glitter-pool-stage__pool-popup-item--active");
    expect(container.querySelectorAll(".glitter-pool-stage__pool-popup-check")).toHaveLength(1);
    expect((container.querySelector(".glitter-pool-stage__pool-switcher") as unknown as FakeElement | null)?.parent?.className).toContain(
      "glitter-pool-stage__title-cluster"
    );
  });

  it("renders image card thumbnail with body text below the media and no image label", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-image-1",
            title: "Image idea",
            selected: false,
            typeIcon: "image",
            contentKind: "image",
            bodyText: "supplemental body",
            mediaPath: "assets/image-a.png",
            mediaThumbnailUrl: "app://local/assets/image-a.png",
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--image") as unknown as FakeElement | null;
    const mediaStage = container.querySelector(".glitter-pool-stage__card-media-stage--image") as unknown as FakeElement | null;
    const mediaClip = container.querySelector(".glitter-pool-stage__card-media-clip") as unknown as FakeElement | null;
    const thumbnail = container.querySelector("img.glitter-pool-stage__card-media-thumbnail") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-title") as unknown as FakeElement | null;
    const mediaBody = container.querySelector(".glitter-pool-stage__card-media-body") as unknown as FakeElement | null;
    expect(content?.children).toHaveLength(3);
    expect(content?.children[0]).toBe(mediaStage);
    expect(content?.children[1]).toBe(title);
    expect(content?.children[2]).toBe(mediaBody);
    expect(content?.className).toContain("glitter-pool-stage__card-content--interactive");
    expect((content as unknown as FakeElement | null)?.dataset.mediaPath).toBe("assets/image-a.png");
    const previewButton = mediaClip?.children[0] as unknown as FakeElement | undefined;
    expect(mediaStage?.children[0]).toBe(mediaClip);
    expect(previewButton?.tagName).toBe("BUTTON");
    expect(previewButton?.className).toContain("glitter-pool-stage__card-media-hitbox");
    expect(previewButton?.children[0]).toBe(thumbnail);
    expect(thumbnail).not.toBeNull();
    expect((thumbnail as unknown as { src?: string })?.src).toBe("app://local/assets/image-a.png");
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Image idea，查看大图");
    expect(mediaBody).not.toBeNull();
    expect(mediaBody?.parent).toBe(content);
    expect(mediaBody?.textContent).toContain("supplemental body");
    expect(mediaBody?.className).not.toContain("glitter-pool-stage__card-copy--collapsed");
    expect(container.querySelector(".glitter-pool-stage__card-supporting--image")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__card-body-toggle")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__card-media-label")).toBeNull();
  });

  it("renders video cards with an actual inline video preview instead of an image tag", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-video-1",
            title: "Video idea",
            selected: false,
            typeIcon: "video",
            contentKind: "video",
            bodyText: "video body",
            mediaPath: "assets/video-a.mp4",
            mediaThumbnailUrl: "app://local/assets/video-a.mp4",
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--video") as unknown as FakeElement | null;
    const mediaStage = container.querySelector(".glitter-pool-stage__card-media-stage--video") as unknown as FakeElement | null;
    const mediaClip = container.querySelector(".glitter-pool-stage__card-media-clip") as unknown as FakeElement | null;
    const previewButton = container.querySelector("button.glitter-pool-stage__card-media-hitbox") as unknown as FakeElement | null;
    const previewVideo = container.querySelector("video.glitter-pool-stage__card-media-thumbnail") as unknown as FakeElement | null;
    expect(content?.className).toContain("glitter-pool-stage__card-content--interactive");
    expect((content as unknown as FakeElement | null)?.dataset.mediaPath).toBe("assets/video-a.mp4");
    expect(previewButton).not.toBeNull();
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Video idea，查看大图视频");
    expect(previewVideo).not.toBeNull();
    expect(content?.children[0]).toBe(mediaStage);
    expect(mediaStage?.children[0]).toBe(mediaClip);
    expect(mediaClip?.children[0]).toBe(previewButton);
    expect(previewButton?.children[0]).toBe(previewVideo);
    expect(previewVideo?.getAttribute?.("src")).toBe("app://local/assets/video-a.mp4");
    expect(previewVideo?.getAttribute?.("muted")).toBe("");
    expect(previewVideo?.getAttribute?.("playsinline")).toBe("");
    expect(previewVideo?.getAttribute?.("autoplay")).toBe("");
    expect(previewVideo?.getAttribute?.("loop")).toBe("");
    expect(container.querySelector("img.glitter-pool-stage__card-media-thumbnail")).toBeNull();
  });

  it("keeps video media, title, and body inside one unified content panel", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-video-body-layout",
            title: "Video body layout idea",
            selected: false,
            typeIcon: "video",
            contentKind: "video",
            bodyText: "video body layout",
            mediaPath: "assets/video-body.mp4",
            mediaThumbnailUrl: "app://local/assets/video-body.mp4",
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--video") as unknown as FakeElement | null;
    const mediaStage = container.querySelector(".glitter-pool-stage__card-media-stage--video") as unknown as FakeElement | null;
    const mediaClip = container.querySelector(".glitter-pool-stage__card-media-clip") as unknown as FakeElement | null;
    const previewButton = container.querySelector("button.glitter-pool-stage__card-media-hitbox") as unknown as FakeElement | null;
    const previewVideo = container.querySelector("video.glitter-pool-stage__card-media-thumbnail") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-title") as unknown as FakeElement | null;
    const mediaBody = container.querySelector(".glitter-pool-stage__card-media-body") as unknown as FakeElement | null;

    expect(content?.children).toHaveLength(3);
    expect(content?.children[0]).toBe(mediaStage);
    expect(content?.children[1]).toBe(title);
    expect(content?.children[2]).toBe(mediaBody);
    expect(mediaStage?.children[0]).toBe(mediaClip);
    expect(mediaClip?.children[0]).toBe(previewButton);
    expect(previewButton?.children[0]).toBe(previewVideo);
    expect(mediaBody?.parent).toBe(content);
    expect(mediaBody?.textContent).toBe("video body layout");
    expect(container.querySelector(".glitter-pool-stage__card-supporting--video")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__card-body-toggle")).toBeNull();
  });

  it("opens a large image preview overlay when clicking the image preview trigger", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-image-preview",
            title: "Image preview idea",
            selected: false,
            typeIcon: "image",
            contentKind: "image",
            bodyText: "supplemental body",
            mediaPath: "assets/image-preview.png",
            mediaThumbnailUrl: "app://local/assets/image-preview.png",
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const previewButton = container.querySelector("button.glitter-pool-stage__card-media-hitbox") as unknown as FakeElement | null;
    const thumbnail = container.querySelector("img.glitter-pool-stage__card-media-thumbnail") as unknown as FakeElement | null;
    expect(previewButton).not.toBeNull();
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Image preview idea，查看大图");
    expect(thumbnail).not.toBeNull();
    expect(thumbnail?.tagName).toBe("IMG");
    expect(container.querySelector(".glitter-pool-stage__card-media-switcher")).toBeNull();
    previewButton?.click();

    const previewOverlay = container.querySelector(".glitter-pool-stage__media-preview-overlay") as unknown as FakeElement | null;
    const previewImage = container.querySelector(".glitter-pool-stage__media-preview-image") as unknown as FakeElement | null;
    const previewClose = container.querySelector(".glitter-pool-stage__media-preview-close") as unknown as FakeElement | null;
    expect(previewOverlay).not.toBeNull();
    expect(previewImage?.getAttribute?.("src")).toBe("app://local/assets/image-preview.png");
    expect(previewClose?.getAttribute?.("aria-label")).toBe("关闭大图预览");
    previewClose?.click();
    expect(container.querySelector(".glitter-pool-stage__media-preview-overlay")).toBeNull();
  });

  it("keeps media preview triggers attached to the visible stage after a newly created media card is rendered", () => {
    const container = createContainer();
    const actions = {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    };
    const existingImageCard = {
      id: "idea-image-existing",
      title: "Existing image idea",
      selected: false,
      typeIcon: "image",
      contentKind: "image",
      bodyText: "existing body",
      mediaPath: "assets/image-existing.png",
      mediaThumbnailUrl: "app://local/assets/image-existing.png",
      updatedLabel: "2026-04-18 10:00",
      fileCreated: false,
      statusLabels: [],
      menuActions: [],
      snippetLocations: []
    } as any;
    const newVideoCard = {
      id: "idea-video-new",
      title: "New video idea",
      selected: false,
      typeIcon: "video",
      contentKind: "video",
      bodyText: "new video body",
      mediaPath: "assets/video-new.mp4",
      mediaThumbnailUrl: "app://local/assets/video-new.mp4",
      updatedLabel: "2026-04-18 10:01",
      fileCreated: false,
      statusLabels: [],
      menuActions: [],
      snippetLocations: []
    } as any;

    renderPoolView(container, createBrowseState({ browse: { cards: [existingImageCard] } }), actions);
    renderPoolView(container, createBrowseState({ browse: { cards: [newVideoCard, existingImageCard] } }), actions);

    const previewButtons = container.querySelectorAll("button.glitter-pool-stage__card-media-hitbox") as unknown as FakeElement[];
    expect(previewButtons).toHaveLength(2);

    const stage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
    const firstCardContent = container.querySelector(".glitter-pool-stage__card-content") as unknown as FakeElement | null;

    previewButtons[0]?.click();
    const videoOverlay = container.querySelector(".glitter-pool-stage__media-preview-overlay") as unknown as FakeElement | null;
    expect(container.querySelector(".glitter-pool-stage__media-preview-video")).not.toBeNull();
    expect(videoOverlay?.parent).toBe(stage);
    expect(videoOverlay?.parent).not.toBe(firstCardContent);

    const closeButton = container.querySelector(".glitter-pool-stage__media-preview-close") as unknown as FakeElement | null;
    closeButton?.click();
    expect(container.querySelector(".glitter-pool-stage__media-preview-overlay")).toBeNull();

    previewButtons[1]?.click();
    const previewImage = container.querySelector(".glitter-pool-stage__media-preview-image") as unknown as FakeElement | null;
    expect(previewImage?.getAttribute?.("src")).toBe("app://local/assets/image-existing.png");
  });

  it("renders image preview trigger as a native button for keyboard accessibility", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-image-preview-keyboard",
            title: "Image preview keyboard idea",
            selected: false,
            typeIcon: "image",
            contentKind: "image",
            bodyText: "supplemental body",
            mediaPath: "assets/image-preview-keyboard.png",
            mediaThumbnailUrl: "app://local/assets/image-preview-keyboard.png",
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const previewButton = container.querySelector("button.glitter-pool-stage__card-media-hitbox") as unknown as FakeElement | null;
    expect(previewButton).not.toBeNull();
    expect(previewButton?.tagName).toBe("BUTTON");
    expect((previewButton as unknown as { type?: string } | null)?.type).toBe("button");
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Image preview keyboard idea，查看大图");
  });

  it("keeps thumbnail hit testing on the preview button instead of the media element", () => {
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-thumbnail", ["pointer-events: none;"]);
  });

  it("renders inline image switching controls on the media content without a separate preview button", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-image-gallery",
            title: "Image gallery idea",
            selected: false,
            typeIcon: "image",
            contentKind: "image",
            bodyText: "gallery body",
            mediaPath: "assets/image-a.png",
            mediaThumbnailUrl: "app://local/assets/image-a.png",
            mediaThumbnailUrls: [
              "app://local/assets/image-a.png",
              "app://local/assets/image-b.png",
              "app://local/assets/image-c.png"
            ],
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--image") as unknown as FakeElement | null;
    const previewButton = container.querySelector("button.glitter-pool-stage__card-media-hitbox") as unknown as FakeElement | null;
    const thumbnail = container.querySelector("img.glitter-pool-stage__card-media-thumbnail") as unknown as FakeElement | null;
    const previousButton = container.querySelector(".glitter-pool-stage__card-media-switch--previous") as unknown as FakeElement | null;
    const nextButton = container.querySelector(".glitter-pool-stage__card-media-switch--next") as unknown as FakeElement | null;
    const pagination = container.querySelector(".glitter-pool-stage__card-media-pagination") as unknown as FakeElement | null;
    const liveAnnouncement = container.querySelector(".glitter-pool-stage__card-media-live-announcement") as unknown as FakeElement | null;

    expect(content?.className).toContain("glitter-pool-stage__card-content--interactive");
    expect(previewButton).not.toBeNull();
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Image gallery idea，查看大图（第 1 张，共 3 张）");
    expect(thumbnail).not.toBeNull();
    expect(content?.querySelector(".glitter-pool-stage__card-media-switcher")).not.toBeNull();
    expect(content?.querySelector("img.glitter-pool-stage__card-media-thumbnail")).toBe(thumbnail);
    expect(thumbnail?.src).toBe("app://local/assets/image-a.png");
    expect(thumbnail?.alt).toBe("Image gallery idea（第 1 张，共 3 张）");
    expect(previousButton?.getAttribute?.("aria-label")).toBe("查看上一张图片");
    expect(nextButton?.getAttribute?.("aria-label")).toBe("查看下一张图片");
    expect(pagination?.textContent).toContain("1 / 3");
    expect(liveAnnouncement).not.toBeNull();
    expect(liveAnnouncement?.getAttribute?.("aria-live")).toBe("polite");
    expect(liveAnnouncement?.getAttribute?.("aria-atomic")).toBe("true");
    expect(liveAnnouncement?.textContent ?? "").toBe("");

    nextButton?.click();
    expect(thumbnail?.src).toBe("app://local/assets/image-b.png");
    expect(thumbnail?.alt).toBe("Image gallery idea（第 2 张，共 3 张）");
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Image gallery idea，查看大图（第 2 张，共 3 张）");
    expect(pagination?.textContent).toContain("2 / 3");
    expect(liveAnnouncement?.textContent).toBe("当前图片，第 2 张，共 3 张");
    expect(container.querySelector(".glitter-pool-stage__media-preview-overlay")).toBeNull();

    previousButton?.click();
    expect(thumbnail?.src).toBe("app://local/assets/image-a.png");
    expect(thumbnail?.alt).toBe("Image gallery idea（第 1 张，共 3 张）");
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Image gallery idea，查看大图（第 1 张，共 3 张）");
    expect(pagination?.textContent).toContain("1 / 3");
    expect(liveAnnouncement?.textContent).toBe("当前图片，第 1 张，共 3 张");
  });

  it("opens the currently selected inline image in the large preview overlay and supports previous/next navigation", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-image-gallery-preview",
            title: "Image gallery preview idea",
            selected: false,
            typeIcon: "image",
            contentKind: "image",
            bodyText: "gallery body",
            mediaPath: "assets/image-a.png",
            mediaThumbnailUrl: "app://local/assets/image-a.png",
            mediaThumbnailUrls: [
              "app://local/assets/image-a.png",
              "app://local/assets/image-b.png",
              "app://local/assets/image-c.png"
            ],
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const previewButton = container.querySelector("button.glitter-pool-stage__card-media-hitbox") as unknown as FakeElement | null;
    const thumbnail = container.querySelector("img.glitter-pool-stage__card-media-thumbnail") as unknown as FakeElement | null;
    const nextButton = container.querySelector(".glitter-pool-stage__card-media-switch--next") as unknown as FakeElement | null;
    expect(previewButton).not.toBeNull();
    expect(thumbnail).not.toBeNull();

    nextButton?.click();
    nextButton?.click();
    expect(thumbnail?.src).toBe("app://local/assets/image-c.png");
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Image gallery preview idea，查看大图（第 3 张，共 3 张）");

    previewButton?.click();

    const previewImage = container.querySelector(".glitter-pool-stage__media-preview-image") as unknown as FakeElement | null;
    const previewPreviousButton = container.querySelector(".glitter-pool-stage__media-preview-nav--previous") as unknown as FakeElement | null;
    const previewNextButton = container.querySelector(".glitter-pool-stage__media-preview-nav--next") as unknown as FakeElement | null;
    const previewPagination = container.querySelector(".glitter-pool-stage__media-preview-pagination") as unknown as FakeElement | null;

    expect(previewImage?.getAttribute?.("src")).toBe("app://local/assets/image-c.png");
    expect(previewImage?.getAttribute?.("alt")).toBe("Image gallery preview idea 大图预览（第 3 张，共 3 张）");
    expect(previewPreviousButton?.getAttribute?.("aria-label")).toBe("查看上一张大图");
    expect(previewNextButton?.getAttribute?.("aria-label")).toBe("查看下一张大图");
    expect(previewPagination?.textContent).toBe("3 / 3");

    previewPreviousButton?.click();
    expect(previewImage?.getAttribute?.("src")).toBe("app://local/assets/image-b.png");
    expect(previewPagination?.textContent).toBe("2 / 3");

    previewNextButton?.click();
    expect(previewImage?.getAttribute?.("src")).toBe("app://local/assets/image-c.png");
    expect(previewPagination?.textContent).toBe("3 / 3");

    previewNextButton?.click();
    expect(previewImage?.getAttribute?.("src")).toBe("app://local/assets/image-a.png");
    expect(previewPagination?.textContent).toBe("1 / 3");
  });

  it("opens a large video preview overlay when clicking the video thumbnail", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-video-preview",
            title: "Video preview idea",
            selected: false,
            typeIcon: "video",
            contentKind: "video",
            bodyText: "video body",
            mediaPath: "assets/video-preview.mp4",
            mediaThumbnailUrl: "app://local/assets/video-preview.mp4",
            updatedLabel: "2026-04-18 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const previewButton = container.querySelector("button.glitter-pool-stage__card-media-hitbox") as unknown as FakeElement | null;
    const thumbnail = container.querySelector("video.glitter-pool-stage__card-media-thumbnail") as unknown as FakeElement | null;
    expect(previewButton).not.toBeNull();
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Video preview idea，查看大图视频");
    expect(thumbnail).not.toBeNull();
    previewButton?.click();

    const previewVideo = container.querySelector(".glitter-pool-stage__media-preview-video") as unknown as FakeElement | null;
    expect(previewVideo).not.toBeNull();
    expect(previewVideo?.getAttribute?.("src")).toBe("app://local/assets/video-preview.mp4");
    expect(previewVideo?.getAttribute?.("controls")).toBe("");
    expect(previewVideo?.getAttribute?.("playsinline")).toBe("");
    expect(container.querySelector(".glitter-pool-stage__media-preview-image")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__media-preview-nav--previous")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__media-preview-nav--next")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__media-preview-pagination")).toBeNull();
  });

  it("renders English media and empty card fallback labels from browse state labels", () => {
    const container = createContainer();
    const state = buildPoolViewStateFromRuntime({
      interfaceLanguage: "en",
      pool: {
        id: "pool-media",
        title: "Media pool",
        description: "Media ideas",
        totalItemCount: 3,
        visibleItemCount: 3,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "Media hint"
      },
      cards: [
        {
          id: "idea-image-gallery-en",
          title: "Gallery idea",
          excerpt: "gallery body",
          hasBodyContent: true,
          selected: false,
          contentType: "image",
          sourceUrl: undefined,
          attachmentPaths: ["assets/image-a.png", "assets/image-b.png"],
          mediaThumbnailUrls: ["app://local/assets/image-a.png", "app://local/assets/image-b.png"],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "idea-video-en",
          title: "Video idea",
          excerpt: "video body",
          hasBodyContent: true,
          selected: false,
          contentType: "video",
          sourceUrl: undefined,
          attachmentPaths: ["assets/video-a.mp4"],
          mediaThumbnailUrl: "app://local/assets/video-a.mp4",
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "idea-empty-en",
          title: "Empty idea",
          excerpt: "",
          hasBodyContent: false,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const previewButton = container.querySelector("button.glitter-pool-stage__card-media-hitbox") as unknown as FakeElement | null;
    const thumbnail = container.querySelector("img.glitter-pool-stage__card-media-thumbnail") as unknown as FakeElement | null;
    const nextButton = container.querySelector(".glitter-pool-stage__card-media-switch--next") as unknown as FakeElement | null;
    const videoPreviewButton = container.querySelectorAll("button.glitter-pool-stage__card-media-hitbox")[1] as unknown as FakeElement | undefined;
    const emptyFallback = container.querySelector(".glitter-pool-stage__card-empty") as unknown as FakeElement | null;

    expect(previewButton?.getAttribute?.("aria-label")).toBe("Gallery idea, view large image (image 1 of 2)");
    expect(thumbnail?.alt).toBe("Gallery idea (image 1 of 2)");
    expect(nextButton?.getAttribute?.("aria-label")).toBe("View next image");
    nextButton?.click();
    expect(previewButton?.getAttribute?.("aria-label")).toBe("Gallery idea, view large image (image 2 of 2)");
    expect(container.querySelector(".glitter-pool-stage__card-media-live-announcement")?.textContent).toBe("Current image, image 2 of 2");

    previewButton?.click();
    expect(container.querySelector(".glitter-pool-stage__media-preview-close")?.getAttribute("aria-label")).toBe("Close large preview");
    expect(container.querySelector(".glitter-pool-stage__media-preview-image")?.getAttribute("alt")).toBe("Gallery idea large preview (image 2 of 2)");
    expect(container.querySelector(".glitter-pool-stage__media-preview-nav--previous")?.getAttribute("aria-label")).toBe("View previous large image");
    expect(container.querySelector(".glitter-pool-stage__media-preview-nav--next")?.getAttribute("aria-label")).toBe("View next large image");

    expect(videoPreviewButton?.getAttribute?.("aria-label")).toBe("Video idea, view large video");
    expect(emptyFallback?.textContent).toBe("No content yet");
  });

  it("renders link cards with body above a single clickable link row", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-link-1",
            title: "Link idea",
            selected: false,
            typeIcon: "link",
            contentKind: "link",
            bodyText: "第一行\n第二行",
            linkUrl: "https://example.com/article",
            linkDisplayText: "example.com",
            updatedLabel: "2026-04-18 11:22 已更新",
            fileCreated: true,
            statusLabels: ["已创建文件", "已插入 1 个正文"],
            menuActions: [{ kind: "open-primary-file", label: "打开主文件" }],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const icon = container.querySelector(".glitter-pool-stage__card-icon") as unknown as FakeElement | null;
    const meta = container.querySelector(".glitter-pool-stage__card-time") as unknown as FakeElement | null;
    const content = container.querySelector(".glitter-pool-stage__card-content--link") as unknown as FakeElement | null;
    const footer = container.querySelector(".glitter-pool-stage__card-footer--link") as unknown as FakeElement | null;
    const supporting = container.querySelector(".glitter-pool-stage__card-supporting--link") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-title") as unknown as FakeElement | null;
    const body = container.querySelector(".glitter-pool-stage__card-body") as unknown as FakeElement | null;
    const linkBlock = container.querySelector(".glitter-pool-stage__card-link-block") as unknown as FakeElement | null;
    const linkBlockAnchor = container.querySelector("a.glitter-pool-stage__card-link-block") as unknown as FakeElement | null;
    const linkDomain = container.querySelector(".glitter-pool-stage__card-link-domain") as unknown as FakeElement | null;

    expect(icon?.className).toContain("glitter-pool-stage__card-icon--accent");
    expect(content?.children[0]).toBe(title);
    expect(content?.children[1]).toBe(body);
    expect(content?.children).toHaveLength(2);
    expect(footer?.children[0]).toBe(supporting);
    expect(footer?.children[1]).toBe(meta);
    expect(supporting?.children[0]).toBe(linkBlockAnchor);
    expect(body?.textContent).toBe("第一行\n第二行");
    expect(linkBlock).toBe(linkBlockAnchor);
    expect(linkBlockAnchor?.children).toHaveLength(1);
    expect(linkBlockAnchor?.children[0]).toBe(linkDomain);
    expect(linkDomain?.textContent).toBe("https://example.com/article");
    expect(linkBlockAnchor?.href).toBe("https://example.com/article");
    expect(linkBlockAnchor?.getAttribute?.("title")).toBe("https://example.com/article");
    expect(linkBlockAnchor?.target).toBe("_blank");
    expect(linkBlockAnchor?.rel).toBe("noopener noreferrer");
    expect(body?.className).not.toContain("glitter-pool-stage__card-copy--collapsed");
    expect(container.querySelector(".glitter-pool-stage__card-body-toggle")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__card-link-text")).toBeNull();
    expect(meta?.querySelector(".glitter-pool-stage__card-time-label")?.textContent).toBe("2026-04-18 11:22 已更新");
    expect(
      meta?.querySelectorAll(".glitter-pool-stage__card-reference").map((node) => node.textContent)
    ).toEqual(["已创建文件", "已插入 1 个正文"]);
    expect(meta?.querySelector(".glitter-pool-stage__card-file-status")).toBeNull();
  });

  it("keeps only the original clickable link row without rendering an extra second line", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-link-inline",
            title: "Inline link idea",
            selected: false,
            typeIcon: "link",
            contentKind: "link",
            bodyText:
              "介绍文字\nhttps://www.xiaohongshu.com/explore/678f3025000000002900cbdf?xsec_token=AB_uuSMGxlk8OC4U1habZCPUew0T4FEYcrS2edDjoreSw=&xsec_source=pc_search&source=web_profile_page",
            linkUrl:
              "https://www.xiaohongshu.com/explore/678f3025000000002900cbdf?xsec_token=AB_uuSMGxlk8OC4U1habZCPUew0T4FEYcrS2edDjoreSw=&xsec_source=pc_search&source=web_profile_page",
            linkDisplayText: "xiaohongshu.com",
            updatedLabel: "2026-04-18 11:22 已更新",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--link") as unknown as FakeElement | null;
    const supporting = container.querySelector(".glitter-pool-stage__card-supporting--link") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-title") as unknown as FakeElement | null;
    const body = container.querySelector(".glitter-pool-stage__card-body") as unknown as FakeElement | null;
    const toggleRow = container.querySelector(".glitter-pool-stage__card-body-toggle-row") as unknown as FakeElement | null;
    const toggle = container.querySelector(".glitter-pool-stage__card-body-toggle") as unknown as FakeElement | null;
    const inlineLink = container.querySelector("a.glitter-pool-stage__card-inline-link") as unknown as FakeElement | null;
    const linkBlockAnchor = container.querySelector("a.glitter-pool-stage__card-link-block") as unknown as FakeElement | null;
    const linkDomain = container.querySelector(".glitter-pool-stage__card-link-domain") as unknown as FakeElement | null;

    expect(content?.children).toHaveLength(3);
    expect(content?.children[0]).toBe(title);
    expect(content?.children[1]).toBe(body);
    expect(content?.children[2]).toBe(toggleRow);
    expect(supporting?.children[0]).toBe(linkBlockAnchor);
    expect(toggle?.parent).toBe(toggleRow);
    const toggleText = toggle?.querySelector(".glitter-pool-stage__card-body-toggle-text") as FakeElement | null;
    expect(toggleText?.textContent).toBe("展开全部");
    expect(toggleText?.className).toContain("glitter-home-stage__visually-hidden");
    expect(body?.textContent).toContain(
      "介绍文字\nhttps://www.xiaohongshu.com/explore/678f3025000000002900cbdf?xsec_token=AB_uuSMGxlk8OC4U1habZCPUew0T4FEYcrS2edDjoreSw=&xsec_source=pc_search&source=web_profile_page"
    );
    expect(inlineLink).toBeNull();
    expect(linkBlockAnchor).not.toBeNull();
    expect(linkBlockAnchor?.children).toHaveLength(1);
    expect(linkBlockAnchor?.children[0]).toBe(linkDomain);
    expect(linkDomain?.textContent).toBe(
      "https://www.xiaohongshu.com/explore/678f3025000000002900cbdf?xsec_token=AB_uuSMGxlk8OC4U1habZCPUew0T4FEYcrS2edDjoreSw=&xsec_source=pc_search&source=web_profile_page"
    );
    expect(container.querySelector(".glitter-pool-stage__card-link-text")).toBeNull();
  });

  it("keeps a bodyless link card title inside the inner content panel while the link row stays below", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-link-no-body",
            title: "Bodyless link idea",
            selected: false,
            typeIcon: "link",
            contentKind: "link",
            bodyText: "",
            linkUrl: "https://example.com/bodyless",
            linkDisplayText: "example.com",
            updatedLabel: "2026-04-18 11:22 已更新",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--link") as unknown as FakeElement | null;
    const footer = container.querySelector(".glitter-pool-stage__card-footer--link") as unknown as FakeElement | null;
    const supporting = container.querySelector(".glitter-pool-stage__card-supporting--link") as unknown as FakeElement | null;
    const meta = container.querySelector(".glitter-pool-stage__card-time") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-title") as unknown as FakeElement | null;
    const linkBlockAnchor = container.querySelector("a.glitter-pool-stage__card-link-block") as unknown as FakeElement | null;
    const linkDomain = container.querySelector(".glitter-pool-stage__card-link-domain") as unknown as FakeElement | null;

    expect(content?.children).toHaveLength(1);
    expect(content?.children[0]).toBe(title);
    expect(footer?.children[0]).toBe(supporting);
    expect(footer?.children[1]).toBe(meta);
    expect(supporting?.children[0]).toBe(linkBlockAnchor);
    expect(linkDomain?.textContent).toBe("https://example.com/bodyless");
    expect(container.querySelector(".glitter-pool-stage__card-body")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__card-body-toggle")).toBeNull();
  });

  it("adds a collapse toggle when the mounted body overflows only after the collapsed clamp is applied", () => {
    const container = createContainer({
      configureElement(element) {
        if (element.className.includes("glitter-pool-stage__card-body")) {
          element.setScrollMetrics(120, element.className.includes("glitter-pool-stage__card-copy--collapsed") ? 48 : 120);
        }
      }
    });
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-link-measured-overflow",
            title: "Measured overflow link idea",
            selected: false,
            typeIcon: "link",
            contentKind: "link",
            bodyText: "短正文",
            linkUrl: "https://example.com/measured-overflow",
            linkDisplayText: "example.com",
            updatedLabel: "2026-04-18 11:22 已更新",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--link") as unknown as FakeElement | null;
    const supporting = container.querySelector(".glitter-pool-stage__card-supporting--link") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-title") as unknown as FakeElement | null;
    const body = container.querySelector(".glitter-pool-stage__card-body") as unknown as FakeElement | null;
    const toggleRow = container.querySelector(".glitter-pool-stage__card-body-toggle-row") as unknown as FakeElement | null;
    const toggle = container.querySelector(".glitter-pool-stage__card-body-toggle") as unknown as FakeElement | null;

    expect(toggle).not.toBeNull();
    expect(content?.children[0]).toBe(title);
    expect(content?.children[1]).toBe(body);
    expect(content?.children[2]).toBe(toggleRow);
    expect(supporting?.children[0]?.className).toContain("glitter-pool-stage__card-link-block");
    expect(toggle?.parent).toBe(toggleRow);
    const toggleText = toggle?.querySelector(".glitter-pool-stage__card-body-toggle-text") as FakeElement | null;
    expect(toggleText?.textContent).toBe("展开全部");
    expect(toggleText?.className).toContain("glitter-home-stage__visually-hidden");
    expect(body?.className).toContain("glitter-pool-stage__card-copy--collapsed");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });

  it("collapses long link card body text and expands it when the arrow is clicked", () => {
    const longBody = Array.from({ length: 12 }, (_value, index) => `第${index + 1}段很长的链接正文内容，用来验证卡片正文会先折叠显示。`).join("\n");
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-link-collapsed",
            title: "Long link idea",
            selected: false,
            typeIcon: "link",
            contentKind: "link",
            bodyText: longBody,
            linkUrl: "https://example.com/long-article",
            linkDisplayText: "example.com",
            updatedLabel: "2026-04-18 11:22 已更新",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--link") as unknown as FakeElement | null;
    const supporting = container.querySelector(".glitter-pool-stage__card-supporting--link") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-title") as unknown as FakeElement | null;
    const body = container.querySelector(".glitter-pool-stage__card-body") as unknown as FakeElement | null;
    const toggleRow = container.querySelector(".glitter-pool-stage__card-body-toggle-row") as unknown as FakeElement | null;
    const toggle = container.querySelector(".glitter-pool-stage__card-body-toggle") as unknown as FakeElement | null;
    const linkBlockAnchor = container.querySelector("a.glitter-pool-stage__card-link-block") as unknown as FakeElement | null;
    const toggleIcon = toggle?.querySelector(".glitter-write-stage__icon") as FakeElement | null;

    expect(content?.children[0]).toBe(title);
    expect(content?.children[1]).toBe(body);
    expect(content?.children[2]).toBe(toggleRow);
    expect(supporting?.children[0]).toBe(linkBlockAnchor);
    expect(toggle?.parent).toBe(toggleRow);
    expect(body?.className).toContain("glitter-pool-stage__card-copy--collapsed");
    const toggleText = toggle?.querySelector(".glitter-pool-stage__card-body-toggle-text") as FakeElement | null;
    expect(toggleText?.textContent).toBe("展开全部");
    expect(toggleText?.className).toContain("glitter-home-stage__visually-hidden");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggleIcon?.className).toContain("glitter-write-stage__icon--chevron-down");

    toggle?.click();

    expect(body?.className).toContain("glitter-pool-stage__card-copy--expanded");
    expect(body?.className).not.toContain("glitter-pool-stage__card-copy--collapsed");
    expect(toggleText?.textContent).toBe("收起");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.getAttribute("aria-label")).toBe("收起正文");
    expect(toggleIcon?.className).toContain("glitter-write-stage__icon--chevron-up");
  });

  it("collapses long media card body text and expands it when the arrow is clicked", () => {
    const longBody = Array.from({ length: 8 }, (_value, index) => `第${index + 1}段很长的媒体正文内容，用来验证图片视频卡片会先折叠显示。`).join("\n");
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-image-collapsed",
            title: "Long image idea",
            selected: false,
            typeIcon: "image",
            contentKind: "image",
            bodyText: longBody,
            mediaThumbnailUrl: "app://local/assets/image-long.png",
            updatedLabel: "2026-04-18 11:22 已更新",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--image") as unknown as FakeElement | null;
    const mediaStage = container.querySelector(".glitter-pool-stage__card-media-stage--image") as unknown as FakeElement | null;
    const footer = container.querySelector(".glitter-pool-stage__card-footer--image") as unknown as FakeElement | null;
    const meta = container.querySelector(".glitter-pool-stage__card-time") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-title") as unknown as FakeElement | null;
    const mediaBody = container.querySelector(".glitter-pool-stage__card-media-body") as unknown as FakeElement | null;
    const toggleRow = container.querySelector(".glitter-pool-stage__card-body-toggle-row") as unknown as FakeElement | null;
    const toggle = container.querySelector(".glitter-pool-stage__card-body-toggle") as unknown as FakeElement | null;
    const toggleIcon = toggle?.querySelector(".glitter-write-stage__icon") as FakeElement | null;

    expect(content?.children).toHaveLength(4);
    expect(content?.children[0]).toBe(mediaStage);
    expect(content?.children[1]).toBe(title);
    expect(content?.children[2]).toBe(mediaBody);
    expect(content?.children[3]).toBe(toggleRow);
    expect(footer?.children[0]).toBe(meta);
    expect(container.querySelector(".glitter-pool-stage__card-supporting--image")).toBeNull();
    expect(toggle?.parent).toBe(toggleRow);
    expect(mediaBody?.className).toContain("glitter-pool-stage__card-copy--collapsed");
    const toggleText = toggle?.querySelector(".glitter-pool-stage__card-body-toggle-text") as FakeElement | null;
    expect(toggleText?.textContent).toBe("展开全部");
    expect(toggleText?.className).toContain("glitter-home-stage__visually-hidden");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggleIcon?.className).toContain("glitter-write-stage__icon--chevron-down");

    toggle?.click();

    expect(mediaBody?.className).toContain("glitter-pool-stage__card-copy--expanded");
    expect(mediaBody?.className).not.toContain("glitter-pool-stage__card-copy--collapsed");
    expect(toggleText?.textContent).toBe("收起");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.getAttribute("aria-label")).toBe("收起正文");
    expect(toggleIcon?.className).toContain("glitter-write-stage__icon--chevron-up");
  });

  it("collapses long text card body text and expands it when the arrow is clicked", () => {
    const longBody = Array.from({ length: 12 }, (_value, index) => `第${index + 1}段很长的文字正文内容，用来验证文字卡片会先折叠显示。`).join("\n");
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-text-collapsed",
            title: "Long text idea",
            selected: false,
            typeIcon: "text",
            contentKind: "text",
            bodyText: longBody,
            updatedLabel: "2026-04-18 11:22 已更新",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const content = container.querySelector(".glitter-pool-stage__card-content--text") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-title") as unknown as FakeElement | null;
    const body = container.querySelector(".glitter-pool-stage__card-body") as unknown as FakeElement | null;
    const toggleRow = container.querySelector(".glitter-pool-stage__card-body-toggle-row") as unknown as FakeElement | null;
    const toggle = container.querySelector(".glitter-pool-stage__card-body-toggle") as unknown as FakeElement | null;
    const toggleIcon = toggle?.querySelector(".glitter-write-stage__icon") as FakeElement | null;

    expect(content?.children[0]).toBe(title);
    expect(content?.children[1]).toBe(body);
    expect(content?.children[2]).toBe(toggleRow);
    expect(toggle?.parent).toBe(toggleRow);
    expect(body?.className).toContain("glitter-pool-stage__card-copy--collapsed");
    const toggleText = toggle?.querySelector(".glitter-pool-stage__card-body-toggle-text") as FakeElement | null;
    expect(toggleText?.textContent).toBe("展开全部");
    expect(toggleText?.className).toContain("glitter-home-stage__visually-hidden");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggleIcon?.className).toContain("glitter-write-stage__icon--chevron-down");

    toggle?.click();

    expect(body?.className).toContain("glitter-pool-stage__card-copy--expanded");
    expect(body?.className).not.toContain("glitter-pool-stage__card-copy--collapsed");
    expect(toggleText?.textContent).toBe("收起");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.getAttribute("aria-label")).toBe("收起正文");
    expect(toggleIcon?.className).toContain("glitter-write-stage__icon--chevron-up");
  });

  it("lays out cards into a script-driven masonry stack without row gaps", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();
      const state = createBrowseState();

      renderPoolView(container, state, {
        onBack() {},
        onItemSelect() {},
        onCreateIdea() {},
        onQueryChange() {},
        onBrowseOverlayToggle() {},
        onBrowseOverlayClose() {},
        onContentFilterChange() {},
        onStatusChange() {},
        onSortChange() {},
        onBatchModeToggle() {},
        onMoveSelectionToPool() {},
        onCreateFile() {},
        onOpenPrimaryFile() {},
        onEditIdea() {},
        onShareIdea() {},
        onPoolSwitch() {}
      });

      const cardGrid = container.querySelector(".glitter-pool-stage__card-grid") as unknown as FakeElement | null;
      const cardStack = container.querySelector(".glitter-pool-stage__card-stack") as unknown as FakeElement | null;
      const cardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];

      cardGrid?.setRectSize(900, 640);
      cardShells[0]?.setRectSize(292, 220);
      cardShells[1]?.setRectSize(292, 120);
      cardShells[2]?.setRectSize(292, 170);

      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();
      observer?.trigger();

      expect(cardStack?.style.height).toBe("220px");
      expect(cardShells[0]?.style.width).toBe("292px");
      expect(cardShells[1]?.style.width).toBe("292px");
      expect(cardShells[2]?.style.width).toBe("292px");
      expect(cardShells[0]?.style.transform).toBe("translate3d(0px, 0px, 0)");
      expect(cardShells[1]?.style.transform).toBe("translate3d(304px, 0px, 0)");
      expect(cardShells[2]?.style.transform).toBe("translate3d(608px, 0px, 0)");
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("enters card isolation reading mode only after a 3-second hover dwell and clears it on mouse leave", () => {
    vi.useFakeTimers();
    try {
      const container = createContainer();
      const state = createBrowseState();

      renderPoolView(container, state, {
        onBack() {},
        onItemSelect() {},
        onCreateIdea() {},
        onQueryChange() {},
        onBrowseOverlayToggle() {},
        onBrowseOverlayClose() {},
        onContentFilterChange() {},
        onStatusChange() {},
        onSortChange() {},
        onBatchModeToggle() {},
        onMoveSelectionToPool() {},
        onCreateFile() {},
        onOpenPrimaryFile() {},
        onEditIdea() {},
        onShareIdea() {},
        onPoolSwitch() {}
      });

      const stage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
      const cardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];
      const cardSurfaces = container.querySelectorAll(".glitter-pool-stage__card-surface") as unknown as FakeElement[];

      cardShells[0]?.setRectSize(280, 180);
      cardShells[1]?.setRectSize(280, 180);
      cardShells[2]?.setRectSize(280, 180);
      cardShells[0]!.style.transform = "translate3d(120px, 0px, 0px)";
      cardShells[1]!.style.transform = "translate3d(304px, 0px, 0px)";
      cardShells[2]!.style.transform = "translate3d(880px, 0px, 0px)";

      cardShells[1]?.trigger("mouseenter");
      vi.advanceTimersByTime(2999);
      expect(stage?.className).not.toContain("glitter-pool-stage--card-isolation-reading");
      expect(cardShells[1]?.className).not.toContain("glitter-pool-stage__card-shell--isolation-active");

      vi.advanceTimersByTime(1);
      expect(stage?.className).toContain("glitter-pool-stage--card-isolation-reading");
      expect(cardShells[1]?.className).toContain("glitter-pool-stage__card-shell--isolation-active");
      expect(cardShells[0]?.className).toContain("glitter-pool-stage__card-shell--isolation-muted");
      expect(cardShells[2]?.className).toContain("glitter-pool-stage__card-shell--isolation-muted");
      expect(cardSurfaces[1]?.style.filter).toBe("blur(0px) saturate(1)");
      expect(cardSurfaces[1]?.style.opacity).toBe("1");
      expect(cardSurfaces[0]?.style.filter).toContain("blur(");
      expect(cardSurfaces[0]?.style.opacity).not.toBe("1");
      expect(cardSurfaces[2]?.style.filter).toContain("blur(");
      expect(cardSurfaces[2]?.style.opacity).not.toBe("1");

      const nearBlur = Number(cardSurfaces[0]?.style.filter.match(/blur\((\d+(?:\.\d+)?)px\)/)?.[1] ?? 0);
      const farBlur = Number(cardSurfaces[2]?.style.filter.match(/blur\((\d+(?:\.\d+)?)px\)/)?.[1] ?? 0);
      const nearOpacity = Number(cardSurfaces[0]?.style.opacity ?? 1);
      const farOpacity = Number(cardSurfaces[2]?.style.opacity ?? 1);
      expect(nearBlur).toBeLessThan(2);
      expect(farBlur).toBeGreaterThan(nearBlur);
      expect(farOpacity).toBeLessThan(nearOpacity);

      cardShells[1]?.trigger("mouseleave");
      expect(stage?.className).not.toContain("glitter-pool-stage--card-isolation-reading");
      expect(cardShells[1]?.className).not.toContain("glitter-pool-stage__card-shell--isolation-active");
      expect(cardSurfaces[0]?.style.filter).toBe("");
      expect(cardSurfaces[1]?.style.opacity).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps isolation active when the hovered card re-renders for its more-menu interactions", () => {
    vi.useFakeTimers();
    try {
      const container = createContainer();
      const state = createBrowseState();
      let openMenuIdeaId: string | null = null;

      const render = (): void => {
        renderPoolView(container, state, {
          onBack() {},
          onItemSelect() {},
          onCreateIdea() {},
          onQueryChange() {},
          onBrowseOverlayToggle() {},
          onBrowseOverlayClose() {},
          onContentFilterChange() {},
          onStatusChange() {},
          onSortChange() {},
          onBatchModeToggle() {},
          onMoveSelectionToPool() {},
          onCreateFile() {},
          onOpenPrimaryFile() {},
          onEditIdea() {},
          onShareIdea() {},
          onPoolSwitch() {},
          onCardMenuToggle(ideaId) {
            openMenuIdeaId = openMenuIdeaId === ideaId ? null : ideaId;
            render();
          },
          isCardMenuOpen(ideaId: string) {
            return openMenuIdeaId === ideaId;
          }
        });
      };

      render();

      const initialCardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];
      const initialStage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
      const initialCardSurfaces = container.querySelectorAll(".glitter-pool-stage__card-surface") as unknown as FakeElement[];
      initialCardShells[0]?.setRectSize(280, 180);
      initialCardShells[1]?.setRectSize(280, 180);
      initialCardShells[2]?.setRectSize(280, 180);
      initialCardShells[0]!.style.transform = "translate3d(120px, 0px, 0px)";
      initialCardShells[1]!.style.transform = "translate3d(304px, 0px, 0px)";
      initialCardShells[2]!.style.transform = "translate3d(880px, 0px, 0px)";

      initialCardShells[1]?.trigger("mouseenter");
      vi.advanceTimersByTime(3000);

      const activeMoreTrigger = container.querySelectorAll(".glitter-pool-stage__card-more-trigger")[1] as unknown as FakeElement | undefined;
      activeMoreTrigger?.click();

      expect(initialCardSurfaces[1]?.style.filter).toBe("blur(0px) saturate(1)");
      expect(initialCardSurfaces[1]?.style.opacity).toBe("1");
      expect(initialCardSurfaces[1]?.style.transform).toBe("translateY(-0.5px) scale(1.004)");

      const rerenderedStage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
      const rerenderedCardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];
      const rerenderedMenus = container.querySelectorAll(".glitter-pool-stage__card-more-menu") as unknown as FakeElement[];
      expect(rerenderedStage).toBe(initialStage);
      expect(rerenderedStage?.className).toContain("glitter-pool-stage--card-isolation-reading");
      expect(rerenderedCardShells[1]).toBe(initialCardShells[1]);
      expect(rerenderedCardShells[1]?.className).toContain("glitter-pool-stage__card-shell--isolation-active");
      expect(rerenderedMenus).toHaveLength(3);
      expect(rerenderedMenus[0]?.style.display).toBe("none");
      expect(rerenderedMenus[1]?.style.display).toBe("grid");
      expect(rerenderedMenus[2]?.style.display).toBe("none");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears card isolation when the isolated card is removed after deletion", () => {
    vi.useFakeTimers();
    try {
      const container = createContainer();
      const cardA = {
        id: "idea-a",
        title: "Idea A",
        selected: false,
        typeIcon: "text",
        contentKind: "text",
        bodyText: "A",
        updatedLabel: "2026-04-18 11:22 已更新",
        fileCreated: false,
        statusLabels: [],
        menuActions: [],
        snippetLocations: []
      } as any;
      const cardB = { ...cardA, id: "idea-b", title: "Idea B", bodyText: "B" };
      const cardC = { ...cardA, id: "idea-c", title: "Idea C", bodyText: "C" };
      const actions = {
        onBack() {},
        onItemSelect() {},
        onCreateIdea() {},
        onQueryChange() {},
        onBrowseOverlayToggle() {},
        onBrowseOverlayClose() {},
        onContentFilterChange() {},
        onStatusChange() {},
        onSortChange() {},
        onBatchModeToggle() {},
        onMoveSelectionToPool() {},
        onCreateFile() {},
        onOpenPrimaryFile() {},
        onEditIdea() {},
        onShareIdea() {},
        onPoolSwitch() {}
      };

      renderPoolView(container, createBrowseState({ browse: { cards: [cardA, cardB, cardC] } }), actions);

      const stage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
      const cardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];
      cardShells[0]?.setRectSize(280, 180);
      cardShells[1]?.setRectSize(280, 180);
      cardShells[2]?.setRectSize(280, 180);
      cardShells[0]!.style.transform = "translate3d(120px, 0px, 0px)";
      cardShells[1]!.style.transform = "translate3d(304px, 0px, 0px)";
      cardShells[2]!.style.transform = "translate3d(880px, 0px, 0px)";

      cardShells[1]?.trigger("mouseenter");
      vi.advanceTimersByTime(3000);
      expect(stage?.className).toContain("glitter-pool-stage--card-isolation-reading");
      expect(cardShells[1]?.className).toContain("glitter-pool-stage__card-shell--isolation-active");

      renderPoolView(container, createBrowseState({ browse: { cards: [cardA, cardC] } }), actions);

      const remainingShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];
      expect(remainingShells.map((cardShell) => cardShell.dataset.ideaId)).toEqual(["idea-a", "idea-c"]);
      expect(stage?.className).not.toContain("glitter-pool-stage--card-isolation-reading");
      expect(remainingShells.some((cardShell) => cardShell.className.includes("glitter-pool-stage__card-shell--isolation-active"))).toBe(false);
      expect(remainingShells.some((cardShell) => cardShell.className.includes("glitter-pool-stage__card-shell--isolation-muted"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens and closes a rendered card more menu in place without remounting the isolated card", () => {
    vi.useFakeTimers();
    try {
      const container = createContainer();
      const state = createBrowseState();

      renderPoolView(container, state, {
        onBack() {},
        onItemSelect() {},
        onCreateIdea() {},
        onQueryChange() {},
        onBrowseOverlayToggle() {},
        onBrowseOverlayClose() {},
        onContentFilterChange() {},
        onStatusChange() {},
        onSortChange() {},
        onBatchModeToggle() {},
        onMoveSelectionToPool() {},
        onCreateFile() {},
        onOpenPrimaryFile() {},
        onEditIdea() {},
        onShareIdea() {},
        onPoolSwitch() {}
      });

      const stage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
      const cardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];
      const cardSurfaces = container.querySelectorAll(".glitter-pool-stage__card-surface") as unknown as FakeElement[];
      const moreTriggers = container.querySelectorAll(".glitter-pool-stage__card-more-trigger") as unknown as FakeElement[];
      const moreMenus = container.querySelectorAll(".glitter-pool-stage__card-more-menu") as unknown as FakeElement[];

      cardShells[0]?.setRectSize(280, 180);
      cardShells[1]?.setRectSize(280, 180);
      cardShells[2]?.setRectSize(280, 180);
      cardShells[0]!.style.transform = "translate3d(120px, 0px, 0px)";
      cardShells[1]!.style.transform = "translate3d(304px, 0px, 0px)";
      cardShells[2]!.style.transform = "translate3d(880px, 0px, 0px)";

      cardShells[1]?.trigger("mouseenter");
      vi.advanceTimersByTime(3000);

      const activeIdeaId = cardShells[1]?.dataset.ideaId;

      expect(stage?.className).toContain("glitter-pool-stage--card-isolation-reading");
      expect(cardSurfaces[1]?.style.transform).toBe("translateY(-0.5px) scale(1.004)");
      expect(moreTriggers[1]?.getAttribute("aria-expanded")).toBe("false");
      expect(moreMenus[0]?.style.display).toBe("none");
      expect(moreMenus[1]?.style.display).toBe("none");
      expect(moreMenus[2]?.style.display).toBe("none");

      expect(syncRenderedPoolCardMenus(container, activeIdeaId)).toBe(true);
      expect(container.querySelector(".glitter-pool-stage")).toBe(stage);
      expect(container.querySelectorAll(".glitter-pool-stage__card-shell")[1]).toBe(cardShells[1]);
      expect(cardSurfaces[1]?.style.filter).toBe("blur(0px) saturate(1)");
      expect(cardSurfaces[1]?.style.opacity).toBe("1");
      expect(cardSurfaces[1]?.style.transform).toBe("translateY(-0.5px) scale(1.004)");
      expect(moreTriggers[1]?.getAttribute("aria-expanded")).toBe("true");
      expect(moreMenus[0]?.style.display).toBe("none");
      expect(moreMenus[1]?.style.display).toBe("grid");
      expect(moreMenus[2]?.style.display).toBe("none");

      expect(syncRenderedPoolCardMenus(container, undefined)).toBe(true);
      expect(container.querySelector(".glitter-pool-stage")).toBe(stage);
      expect(cardSurfaces[1]?.style.transform).toBe("translateY(-0.5px) scale(1.004)");
      expect(moreTriggers[1]?.getAttribute("aria-expanded")).toBe("false");
      expect(moreMenus[1]?.style.display).toBe("none");
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes reused card body toggles after an in-place card reorder", () => {
    const longBody = Array.from({ length: 10 }, (_value, index) => `第${index + 1}段很长的文字正文内容，用来验证折叠按钮。`).join("\n");
    const container = createContainer({
      configureElement(element) {
        if (element.className.includes("glitter-pool-stage__card-grid")) {
          element.setRectSize(320, 640);
        }

        if (element.className.includes("glitter-pool-stage__card-shell")) {
          element.setRectSize(280, 160);
        }
      }
    });

    const createCard = (id: string, title: string) => ({
      id,
      title,
      selected: false,
      typeIcon: "text",
      contentKind: "text",
      bodyText: longBody,
      updatedLabel: "2026-04-18 11:22 已更新",
      fileCreated: false,
      statusLabels: [],
      menuActions: [],
      snippetLocations: []
    } as any);

    const cardA = createCard("idea-a", "Idea A");
    const cardB = createCard("idea-b", "Idea B");
    const cardC = createCard("idea-c", "Idea C");
    const actions = {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    };

    renderPoolView(
      container,
      createBrowseState({
        browse: {
          cards: [cardA, cardB, cardC]
        }
      }),
      actions
    );

    renderPoolView(
      container,
      createBrowseState({
        browse: {
          cards: [cardC, cardB, cardA]
        }
      }),
      actions
    );

    const reorderedCardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];
    expect(reorderedCardShells.map((cardShell) => cardShell.dataset.ideaId)).toEqual(["idea-c", "idea-b", "idea-a"]);

    const readCardShellOffsets = (): Record<string, number> => {
      const cardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];
      return Object.fromEntries(
        cardShells.map((cardShell) => {
          const match = cardShell.style.transform.match(/translate3d\(0px,\s*(-?\d+(?:\.\d+)?)px,\s*0\)/);
          return [cardShell.dataset.ideaId ?? "", Number(match?.[1] ?? -1)];
        })
      );
    };

    expect(readCardShellOffsets()).toEqual({
      "idea-c": 0,
      "idea-b": 172,
      "idea-a": 344
    });

    const toggle = container.querySelector(".glitter-pool-stage__card-body-toggle") as unknown as FakeElement | null;
    toggle?.click();

    expect(readCardShellOffsets()).toEqual({
      "idea-c": 0,
      "idea-b": 172,
      "idea-a": 344
    });
  });

  it("keeps the browse stage mounted when the toolbar rerender reaches an empty result set", () => {
    const container = createContainer();
    const actions = {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    };

    renderPoolView(container, createBrowseState(), actions);

    const initialStage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;
    const initialTopbar = container.querySelector(".glitter-pool-stage__topbar") as unknown as FakeElement | null;

    renderPoolView(
      container,
      createBrowseState({
        browse: {
          cards: []
        }
      }),
      actions
    );

    expect(container.querySelector(".glitter-pool-stage")).toBe(initialStage);
    expect(container.querySelector(".glitter-pool-stage__topbar")).toBe(initialTopbar);
    expect(container.querySelector(".glitter-pool-stage__empty")).not.toBeNull();
    expect(container.querySelectorAll(".glitter-pool-stage__card-shell")).toHaveLength(0);
  });

  it("does not reappend the existing card grid shell when toggling a toolbar overlay", () => {
    const container = createContainer();
    const actions = {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    };

    const cards = [
      {
        id: "idea-a",
        title: "Idea A",
        selected: false,
        typeIcon: "text",
        contentKind: "text",
        bodyText: "A",
        updatedLabel: "2026-04-18 11:22 已更新",
        fileCreated: false,
        statusLabels: [],
        menuActions: []
      } as any,
      {
        id: "idea-b",
        title: "Idea B",
        selected: false,
        typeIcon: "text",
        contentKind: "text",
        bodyText: "B",
        updatedLabel: "2026-04-18 11:22 已更新",
        fileCreated: false,
        statusLabels: [],
        menuActions: []
      } as any
    ];

    renderPoolView(
      container,
      createBrowseState({
        browse: {
          cards
        }
      }),
      actions
    );

    const results = container.querySelector(".glitter-pool-stage__results") as unknown as FakeElement | null;
    const cardGridShell = container.querySelector(".glitter-pool-stage__card-grid-shell") as unknown as FakeElement | null;
    expect(results).not.toBeNull();
    expect(cardGridShell).not.toBeNull();

    const originalAppendChild = results?.appendChild.bind(results);
    let reappendedCardGridShell = false;
    if (results && originalAppendChild && cardGridShell) {
      results.appendChild = ((child: FakeElement) => {
        if (child === cardGridShell) {
          reappendedCardGridShell = true;
        }
        return originalAppendChild(child);
      }) as typeof results.appendChild;
    }

    renderPoolView(
      container,
      createBrowseState({
        browse: {
          activeOverlay: "filter",
          cards
        }
      }),
      actions
    );

    expect(reappendedCardGridShell).toBe(false);
    expect(container.querySelector(".glitter-pool-stage__card-grid-shell")).toBe(cardGridShell);
  });

  it("keeps the browse stage mounted when the toolbar rerender swaps to a different card set", () => {
    const container = createContainer();
    const actions = {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    };

    renderPoolView(
      container,
      createBrowseState({
        browse: {
          cards: [
            {
              id: "idea-a",
              title: "Idea A",
              selected: false,
              typeIcon: "text",
              contentKind: "text",
              bodyText: "A",
              updatedLabel: "2026-04-18 11:22 已更新",
              fileCreated: false,
              statusLabels: [],
              menuActions: []
            } as any,
            {
              id: "idea-b",
              title: "Idea B",
              selected: false,
              typeIcon: "text",
              contentKind: "text",
              bodyText: "B",
              updatedLabel: "2026-04-18 11:22 已更新",
              fileCreated: false,
              statusLabels: [],
              menuActions: []
            } as any
          ]
        }
      }),
      actions
    );

    const initialStage = container.querySelector(".glitter-pool-stage") as unknown as FakeElement | null;

    renderPoolView(
      container,
      createBrowseState({
        browse: {
          cards: [
            {
              id: "idea-b",
              title: "Idea B",
              selected: false,
              typeIcon: "text",
              contentKind: "text",
              bodyText: "B",
              updatedLabel: "2026-04-18 11:22 已更新",
              fileCreated: false,
              statusLabels: [],
              menuActions: []
            } as any,
            {
              id: "idea-c",
              title: "Idea C",
              selected: false,
              typeIcon: "text",
              contentKind: "text",
              bodyText: "C",
              updatedLabel: "2026-04-18 11:22 已更新",
              fileCreated: false,
              statusLabels: [],
              menuActions: []
            } as any
          ]
        }
      }),
      actions
    );

    const rerenderedCardShells = container.querySelectorAll(".glitter-pool-stage__card-shell") as unknown as FakeElement[];
    expect(container.querySelector(".glitter-pool-stage")).toBe(initialStage);
    expect(rerenderedCardShells.map((cardShell) => cardShell.dataset.ideaId)).toEqual(["idea-b", "idea-c"]);
  });

  it("suppresses card-surface selection outside batch mode and only uses round selectors in batch mode", () => {
    const selectedIds: string[] = [];
    const container = createContainer();
    const baseState = buildPoolViewState("pool-browse");

    renderPoolView(container, baseState, {
      onBack() {},
      onItemSelect(itemId) {
        selectedIds.push(itemId);
      },
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    expect(container.querySelectorAll(".glitter-pool-stage__card-surface--selected")).toHaveLength(0);
    const normalCard = container.querySelector(".glitter-pool-stage__card-surface") as unknown as { click: () => void; role?: string };
    normalCard.click();
    expect(selectedIds).toEqual([]);
    expect(normalCard.role).toBeUndefined();

    const batchState = createBrowseState({
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 1,
        hasSelection: true,
        batchMode: true
      }
    });

    renderPoolView(container, batchState, {
      onBack() {},
      onItemSelect(itemId) {
        selectedIds.push(itemId);
      },
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    expect(container.querySelectorAll(".glitter-pool-stage__card-surface--selected")).toHaveLength(1);
    const batchCard = container.querySelector(".glitter-pool-stage__card-surface--selected") as unknown as { click: () => void; role?: string };
    batchCard.click();
    expect(selectedIds).toEqual([]);
    expect(batchCard.role).toBeUndefined();

    const batchSelector = container.querySelector(".glitter-pool-stage__card-select-toggle--selected") as unknown as { click: () => void };
    batchSelector.click();
    expect(selectedIds).toContain("idea-product-1");
  });

  it("renders search-hit emphasis class on the matched card surface", () => {
    const container = createContainer();
    const state = createBrowseState({
      browse: {
        cards: [
          {
            id: "idea-search-hit",
            title: "Search hit",
            selected: true,
            searchHit: true,
            searchHitPulse: true,
            typeIcon: "text",
            contentKind: "text",
            bodyText: "matched content",
            updatedLabel: "2026-04-26 10:00",
            fileCreated: false,
            statusLabels: [],
            menuActions: [],
            snippetLocations: []
          } as any
        ]
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const surface = container.querySelector(".glitter-pool-stage__card-surface") as unknown as FakeElement | null;
    expect(surface?.className).toContain("glitter-pool-stage__card-surface--search-hit");
    expect(surface?.className).toContain("is-pulsing");
    expect(surface?.dataset.itemId).toBe("idea-search-hit");

    expect(stylesCss).toContain(".glitter-pool-stage__card-surface--search-hit {");
    expect(stylesCss).toContain("inset 0 0 0 1px color-mix(in srgb, var(--glitter-ui-accent) 18%, transparent)");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-surface--search-hit.is-pulsing", [
      "animation: glitter-pool-search-hit-pulse 1.6s ease;"
    ]);
    expect(stylesCss).toContain("@keyframes glitter-pool-search-hit-pulse {");
  });

  it("routes browse shell callbacks through overlays and direct batch toggle actions", () => {
    const calls = {
      toggledOverlays: [] as string[],
      closedOverlay: 0,
      contentFilters: [] as string[],
      statuses: [] as string[],
      sorts: [] as string[],
      batchToggles: 0,
      creates: 0,
      switchedPools: [] as string[],
      topbarCreateParentClassName: ""
    };

    const state = createBrowseState({
      browse: {
        activeOverlay: "filter"
      },
      poolOptions: [
        { id: "pool-writing", label: "写作池", count: 12, selected: true },
        { id: "pool-product", label: "产品池", count: 3, selected: false }
      ]
    });

    const container = createContainer();
    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {
        calls.creates += 1;
      },
      onQueryChange() {},
      onBrowseOverlayToggle(overlay) {
        calls.toggledOverlays.push(overlay);
      },
      onBrowseOverlayClose() {
        calls.closedOverlay += 1;
      },
      onContentFilterChange(filter) {
        calls.contentFilters.push(filter);
      },
      onStatusChange(status) {
        calls.statuses.push(status);
      },
      onSortChange(sort) {
        calls.sorts.push(sort);
      },
      onBatchModeToggle() {
        calls.batchToggles += 1;
      },
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch(poolId) {
        calls.switchedPools.push(poolId);
      }
    });

    const titleSwitcher = container.querySelector(".glitter-pool-stage__title-switcher") as unknown as { click: () => void };
    const statusTrigger = container.querySelector(".glitter-pool-stage__status-trigger") as unknown as { click: () => void };
    const filterTrigger = container.querySelector(".glitter-pool-stage__results-tool--filter") as unknown as { click: () => void };
    const sortTrigger = container.querySelector(".glitter-pool-stage__results-tool--sort") as unknown as { click: () => void };
    const batchTrigger = container.querySelector(".glitter-pool-stage__batch-toggle") as unknown as { click: () => void };
    const topbarCreate = container.querySelector(".glitter-pool-stage__topbar-create") as unknown as { click: () => void };

    const topbarTools = container.querySelector(".glitter-pool-stage__topbar-tools") as unknown as FakeElement | null;
    const resultsTools = container.querySelector(".glitter-pool-stage__results-tools") as unknown as FakeElement | null;
    calls.topbarCreateParentClassName = ((container.querySelector(".glitter-pool-stage__topbar-create") as unknown as FakeElement | null)?.parent?.className) ?? "";

    titleSwitcher.click();
    statusTrigger.click();
    filterTrigger.click();
    sortTrigger.click();
    batchTrigger.click();
    topbarCreate.click();

    const filterItems = container.querySelectorAll(".glitter-pool-stage__toolbar-menu-item") as unknown as Array<{ click: () => void; textContent?: string }>;
    const textFilterItem = filterItems.find((item) => item.textContent?.includes("文本"));
    textFilterItem?.click();

    expect(calls.toggledOverlays).toEqual(["pool-switcher", "status", "filter", "sort"]);
    expect(calls.batchToggles).toBe(1);
    expect(calls.contentFilters).toEqual(["text"]);
    expect(calls.creates).toBe(1);
    expect(calls.topbarCreateParentClassName).toContain("glitter-pool-stage__topbar-tools");
    expect(topbarTools?.children[0]?.className).toContain("glitter-pool-stage__topbar-create");
    expect(resultsTools?.children[0]?.className).toContain("glitter-pool-stage__query");
    expect(resultsTools?.children[1]?.className).toContain("glitter-pool-stage__results-tool-anchor--status");
    expect(resultsTools?.children[2]?.className).toContain("glitter-pool-stage__results-tool-anchor--filter");
    expect(resultsTools?.children[3]?.className).toContain("glitter-pool-stage__results-tool-anchor--sort");
    expect(resultsTools?.children[4]?.className).toContain("glitter-pool-stage__results-tool-anchor--batch");
    expect(resultsTools?.children[5]).toBeUndefined();
    expect(container.querySelector(".glitter-pool-stage__results-entry-button")).not.toBeNull();
    expect(calls.closedOverlay).toBe(0);
    expect(calls.statuses).toEqual([]);
    expect(calls.sorts).toEqual([]);
    expect(calls.switchedPools).toEqual([]);
  });

  it("opens status and filter menus from their own trigger anchors", () => {
    const filterContainer = createContainer();
    renderPoolView(filterContainer, createBrowseState({ browse: { activeOverlay: "filter" } }), {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const filterMenu = filterContainer.querySelector(".glitter-pool-stage__toolbar-menu") as unknown as FakeElement | null;
    expect(filterMenu?.parent?.className).toContain("glitter-pool-stage__results-tool-anchor--filter");

    const statusContainer = createContainer();
    renderPoolView(statusContainer, createBrowseState({ browse: { activeOverlay: "status" } }), {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const statusMenu = statusContainer.querySelector(".glitter-pool-stage__toolbar-menu") as unknown as FakeElement | null;
    expect(statusMenu?.parent?.className).toContain("glitter-pool-stage__results-tool-anchor--status");
  });

  it("routes pool switcher selected row to close and other row to switch", () => {
    const calls = {
      closedOverlay: 0,
      switchedPools: [] as string[]
    };

    const state = createBrowseState({
      browse: {
        activeOverlay: "pool-switcher",
        poolSwitcherActivePoolId: "pool-product"
      },
      poolOptions: [
        { id: "pool-writing", label: "写作池", count: 12, selected: true },
        { id: "pool-product", label: "产品池", count: 3, selected: false }
      ]
    });

    const container = createContainer();
    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {
        calls.closedOverlay += 1;
      },
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch(poolId) {
        calls.switchedPools.push(poolId);
      }
    });

    const popupItems = container.querySelectorAll(".glitter-pool-stage__pool-popup-item") as unknown as Array<{ click: () => void }>;
    popupItems[0]?.click();
    popupItems[1]?.click();

    expect(calls.closedOverlay).toBe(1);
    expect(calls.switchedPools).toEqual(["pool-product"]);
  });

  it("renders card more menu actions from menuActions and routes each supported kind", () => {
    const calls = {
      created: [] as string[],
      openedPrimary: [] as string[],
      openedSnippetNote: [] as string[],
      openedSnippetLocations: [] as string[]
    };
    const container = createContainer();

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithSingleWritingCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-writing-1",
            menuActions: [
              { kind: "create-file", label: "创建文件" },
              { kind: "open-primary-file", label: "打开主文件" },
              { kind: "open-snippet-note", label: "打开插入笔记" },
              { kind: "open-snippet-locations", label: "查看插入位置（2）" }
            ]
          }
        ]
      }
    });

    renderPoolView(container, stateWithSingleWritingCard, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile(ideaId) {
        calls.created.push(ideaId);
      },
      onOpenPrimaryFile(ideaId) {
        calls.openedPrimary.push(ideaId);
      },
      onOpenSnippetNote(ideaId) {
        calls.openedSnippetNote.push(ideaId);
      },
      onOpenSnippetLocations(ideaId) {
        calls.openedSnippetLocations.push(ideaId);
      },
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMenuOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      }
    });

    expect(container.querySelectorAll(".glitter-pool-stage__card-more-menu")).toHaveLength(1);
    const menuItems = container.querySelectorAll(".glitter-pool-stage__card-more-menu-item") as unknown as Array<{ click: () => void; textContent?: string }>;
    expect(menuItems).toHaveLength(8);
    expect(container.querySelector(".glitter-pool-stage__card-more-menu")?.textContent).toContain("编辑");
    expect(container.querySelector(".glitter-pool-stage__card-more-menu")?.textContent).toContain("移动到池");
    expect(container.querySelector(".glitter-pool-stage__card-more-menu")?.textContent).toContain("分享");
    expect(container.querySelector(".glitter-pool-stage__card-more-menu")?.textContent).toContain("删除");
    expect(container.querySelector(".glitter-pool-stage__card-more-menu")?.textContent).toContain("创建文件");
    expect(container.querySelector(".glitter-pool-stage__card-more-menu")?.textContent).toContain("打开主文件");
    expect(container.querySelector(".glitter-pool-stage__card-more-menu")?.textContent).toContain("打开插入笔记");
    expect(container.querySelector(".glitter-pool-stage__card-more-menu")?.textContent).toContain("查看插入位置（2）");
    expect(container.querySelector(".glitter-pool-stage__card-more-menu")?.getAttribute("role")).toBe("menu");
    expect(container.querySelector(".glitter-pool-stage__card-more-trigger")?.getAttribute("aria-label")).toBe("更多操作");

    menuItems[3]?.click();
    menuItems[4]?.click();
    menuItems[5]?.click();
    menuItems[6]?.click();

    expect(calls.created).toEqual(["idea-writing-1"]);
    expect(calls.openedPrimary).toEqual(["idea-writing-1"]);
    expect(calls.openedSnippetNote).toEqual(["idea-writing-1"]);
    expect(calls.openedSnippetLocations).toEqual(["idea-writing-1"]);
  });

  it("suppresses the card more menu and renders the move dialog overlay when the move modal is open", () => {
    const container = createContainer();

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithSingleWritingCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-writing-1",
            menuActions: [{ kind: "create-file", label: "创建文件" }]
          }
        ]
      },
      poolOptions: [
        { id: "pool-product", label: "产品池", count: 3, selected: true },
        { id: "pool-writing", label: "写作池", count: 12, selected: false }
      ]
    });

    renderPoolView(container, stateWithSingleWritingCard, ({
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMenuOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      },
      isCardMovePickerOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      },
      getCardMovePickerSearchQuery() {
        return "";
      }
    }) as any);

    const overlay = container.querySelector(".glitter-pool-stage__card-move-overlay") as unknown as FakeElement | null;
    const scrim = container.querySelector(".glitter-pool-stage__card-move-scrim") as unknown as FakeElement | null;
    const dialog = container.querySelector(".glitter-pool-stage__card-move-dialog") as unknown as FakeElement | null;

    expect(overlay).not.toBeNull();
    expect(scrim).not.toBeNull();
    expect(dialog).not.toBeNull();
    expect(dialog?.parent?.className).toContain("glitter-pool-stage__card-move-overlay");
    expect(container.querySelectorAll(".glitter-pool-stage__card-more-menu")).toHaveLength(0);
    expect(container.querySelectorAll(".glitter-pool-stage__card-more-menu-item")).toHaveLength(0);
    expect(container.querySelectorAll(".glitter-pool-stage__card-move-picker")).toHaveLength(0);
  });

  it("renders card more menu items in the planned order", () => {
    const container = createContainer();

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithSingleWritingCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-writing-1",
            menuActions: [{ kind: "create-file", label: "创建文件" }]
          }
        ]
      }
    });

    renderPoolView(container, stateWithSingleWritingCard, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMenuOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      }
    });

    const menuItems = container.querySelectorAll(".glitter-pool-stage__card-more-menu-item") as unknown as Array<{ textContent: string }>;

    expect(menuItems.map((item) => item.textContent)).toEqual(["编辑", "移动到池", "分享", "创建文件", "删除"]);
  });

  it("caps the card more menu below the card height and keeps it scrollable", () => {
    const container = createContainer({
      configureElement(element) {
        if (element.className.includes("glitter-pool-stage__card-shell")) {
          element.setRectSize(280, 140);
        }

        if (element.className.includes("glitter-pool-stage__card-surface")) {
          element.setRectSize(280, 140);
        }

        if (element.className.includes("glitter-pool-stage__card-more-trigger")) {
          element.setRectSize(28, 28);
        }
      }
    });

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithSingleWritingCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-writing-1",
            menuActions: [
              { kind: "create-file", label: "创建文件" },
              { kind: "open-primary-file", label: "打开主文件" },
              { kind: "open-snippet-note", label: "打开插入笔记" },
              { kind: "open-snippet-locations", label: "查看插入位置（2）" }
            ]
          }
        ]
      }
    });

    renderPoolView(container, stateWithSingleWritingCard, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onOpenSnippetNote() {},
      onOpenSnippetLocations() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMenuOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      }
    });

    const menu = container.querySelector(".glitter-pool-stage__card-more-menu") as unknown as FakeElement | null;

    expect(menu).toBeTruthy();
    expect(menu?.style.maxHeight).toBe("86px");
    expect(menu?.style.minHeight).toBe("80px");
  });

  it("keeps the more menu scrollable when missing media collapses a card below menu height", () => {
    const container = createContainer({
      configureElement(element) {
        if (element.className.includes("glitter-pool-stage__card-shell")) {
          element.setRectSize(280, 36);
        }

        if (element.className.includes("glitter-pool-stage__card-surface")) {
          element.setRectSize(280, 36);
        }

        if (element.className.includes("glitter-pool-stage__card-more-trigger")) {
          element.setRectSize(28, 28);
        }
      }
    });

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithMissingMediaCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-missing-media",
            title: "Missing media",
            typeIcon: "image",
            contentKind: "empty",
            bodyText: undefined,
            mediaPath: "assets/deleted-image.png",
            mediaThumbnailUrl: undefined,
            menuActions: [
              { kind: "create-file", label: "创建文件" },
              { kind: "open-primary-file", label: "打开主文件" },
              { kind: "open-snippet-note", label: "打开插入笔记" },
              { kind: "open-snippet-locations", label: "查看插入位置（2）" }
            ]
          }
        ]
      }
    });

    renderPoolView(container, stateWithMissingMediaCard, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onOpenSnippetNote() {},
      onOpenSnippetLocations() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMenuOpen(ideaId: string) {
        return ideaId === "idea-missing-media";
      }
    });

    const menu = container.querySelector(".glitter-pool-stage__card-more-menu") as unknown as FakeElement | null;

    expect(menu).toBeTruthy();
    expect(menu?.style.maxHeight).toBe("80px");
    expect(menu?.style.minHeight).toBe("80px");
  });

  it("calls onOpenCardMovePicker when clicking the move menu item", () => {
    const movedIdeaIds: string[] = [];
    const container = createContainer();

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithSingleWritingCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-writing-1",
            menuActions: [{ kind: "create-file", label: "创建文件" }]
          }
        ]
      }
    });

    renderPoolView(container, stateWithSingleWritingCard, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onOpenCardMovePicker(ideaId) {
        movedIdeaIds.push(ideaId);
      },
      onCreateFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMenuOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      }
    });

    const menuItems = container.querySelectorAll(".glitter-pool-stage__card-more-menu-item") as unknown as Array<{
      textContent: string;
      click: () => void;
    }>;
    const moveMenuItem = menuItems.find((item) => item.textContent === "移动到池");

    expect(moveMenuItem).toBeTruthy();
    moveMenuItem?.click();
    expect(movedIdeaIds).toEqual(["idea-writing-1"]);
  });

  it("renders the single-card move dialog with scrim, context, search, and move callbacks", () => {
    const calls = {
      closed: 0,
      moved: [] as Array<{ ideaId: string; poolId: string }>,
      searches: [] as string[]
    };
    const container = createContainer();

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithSingleWritingCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-writing-1",
            title: "Design weekly notes",
            menuActions: [{ kind: "create-file", label: "创建文件" }]
          }
        ]
      },
      poolOptions: [
        { id: "pool-product", label: "产品池", count: 3, selected: true },
        { id: "pool-writing", label: "写作池", count: 12, selected: false },
        { id: "pool-archive", label: "归档池", count: 4, selected: false }
      ]
    });

    renderPoolView(container, stateWithSingleWritingCard, ({
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCloseCardMovePicker() {
        calls.closed += 1;
      },
      onMoveIdeaToPool(ideaId: string, poolId: string) {
        calls.moved.push({ ideaId, poolId });
      },
      onCardMovePickerSearchQueryChange(query: string) {
        calls.searches.push(query);
      },
      onCreateFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMovePickerOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      },
      getCardMovePickerSearchQuery() {
        return "";
      }
    }) as any);

    const overlay = container.querySelector(".glitter-pool-stage__card-move-overlay") as unknown as FakeElement | null;
    const scrim = container.querySelector(".glitter-pool-stage__card-move-scrim") as unknown as FakeElement | null;
    const dialog = container.querySelector(".glitter-pool-stage__card-move-dialog") as unknown as FakeElement | null;
    const title = container.querySelector(".glitter-pool-stage__card-move-dialog-title") as unknown as FakeElement | null;
    const context = container.querySelector(".glitter-pool-stage__card-move-dialog-context") as unknown as FakeElement | null;
    const searchInput = container.querySelector(".glitter-pool-stage__card-move-dialog-search") as unknown as FakeElement | null;
    const closeButton = container.querySelector(".glitter-pool-stage__card-move-dialog-close") as unknown as FakeElement | null;
    const list = container.querySelector(".glitter-pool-stage__card-move-dialog-list") as unknown as FakeElement | null;
    const targetButtons = list?.querySelectorAll("button.glitter-pool-stage__toolbar-menu-item") ?? [];

    expect(overlay).not.toBeNull();
    expect(scrim).not.toBeNull();
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.getAttribute("aria-label")).toBe("移动到");
    expect(title?.textContent).toBe("移动到");
    expect(context).toBeNull();
    expect(searchInput?.value).toBe("");
    expect(closeButton?.querySelector(".glitter-write-stage__icon--close")).not.toBeNull();
    expect(list).not.toBeNull();
    expect(targetButtons).toHaveLength(2);
    expect(targetButtons[0]?.textContent).toBe("写作池（12）");
    expect(targetButtons[1]?.textContent).toBe("归档池（4）");
    expect(targetButtons.map((button) => button.textContent).join(" ")).not.toContain("产品池");

    searchInput!.value = "归";
    searchInput?.trigger("input");
    closeButton?.click();
    targetButtons[0]?.click();

    expect(calls.searches).toEqual(["归"]);
    expect(calls.closed).toBe(1);
    expect(calls.moved).toEqual([{ ideaId: "idea-writing-1", poolId: "pool-writing" }]);
  });

  it("renders a move-dialog hint when no other pool targets exist", () => {
    const container = createContainer();

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithSingleWritingCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-writing-1",
            menuActions: [{ kind: "create-file", label: "创建文件" }]
          }
        ]
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 3, selected: true }]
    });

    renderPoolView(container, stateWithSingleWritingCard, ({
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMovePickerOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      },
      getCardMovePickerSearchQuery() {
        return "";
      }
    }) as any);

    const dialog = container.querySelector(".glitter-pool-stage__card-move-dialog") as unknown as FakeElement | null;
    const list = container.querySelector(".glitter-pool-stage__card-move-dialog-list") as unknown as FakeElement | null;
    const targetButtons = list?.querySelectorAll("button.glitter-pool-stage__toolbar-menu-item") ?? [];
    const hint = list?.querySelector(".glitter-pool-stage__toolbar-menu-item--hint") as FakeElement | null;

    expect(dialog).not.toBeNull();
    expect(targetButtons).toHaveLength(0);
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toBe("暂无可移动目标池");
    expect(hint?.getAttribute("aria-hidden")).toBe("true");
  });

  it("filters the move dialog pool list by pool label and keeps the list container scrollable", () => {
    const container = createContainer();

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithSingleWritingCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-writing-1",
            menuActions: [{ kind: "create-file", label: "创建文件" }]
          }
        ]
      },
      poolOptions: [
        { id: "pool-product", label: "产品池", count: 3, selected: true },
        { id: "pool-writing", label: "写作池", count: 12, selected: false },
        { id: "pool-archive", label: "归档池", count: 4, selected: false }
      ]
    });

    renderPoolView(container, stateWithSingleWritingCard, ({
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMovePickerOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      },
      getCardMovePickerSearchQuery() {
        return "归";
      }
    }) as any);

    const searchInput = container.querySelector(".glitter-pool-stage__card-move-dialog-search") as unknown as FakeElement | null;
    const list = container.querySelector(".glitter-pool-stage__card-move-dialog-list") as unknown as FakeElement | null;
    const targetButtons = list?.querySelectorAll("button.glitter-pool-stage__toolbar-menu-item") ?? [];

    expect(searchInput?.value).toBe("归");
    expect(list).not.toBeNull();
    expect(list?.className).toContain("glitter-pool-stage__card-move-dialog-list");
    expect(targetButtons).toHaveLength(1);
    expect(targetButtons[0]?.textContent).toBe("归档池（4）");
    expect(targetButtons.map((button) => button.textContent).join(" ")).not.toContain("写作池");
  });

  it("disables the single-card move dialog while a move is submitting", () => {
    const calls = {
      closed: 0,
      moved: [] as Array<{ ideaId: string; poolId: string }>,
      searches: [] as string[]
    };
    const container = createContainer();

    const baseState = buildPoolViewState("pool-browse");
    const firstCard = baseState.browse!.cards[0]!;
    const stateWithSingleWritingCard = createBrowseState({
      browse: {
        cards: [
          {
            ...firstCard,
            id: "idea-writing-1",
            menuActions: [{ kind: "create-file", label: "创建文件" }]
          }
        ]
      },
      poolOptions: [
        { id: "pool-product", label: "产品池", count: 3, selected: true },
        { id: "pool-writing", label: "写作池", count: 12, selected: false }
      ]
    });

    renderPoolView(container, stateWithSingleWritingCard, ({
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCloseCardMovePicker() {
        calls.closed += 1;
      },
      onMoveIdeaToPool(ideaId: string, poolId: string) {
        calls.moved.push({ ideaId, poolId });
      },
      onCardMovePickerSearchQueryChange(query: string) {
        calls.searches.push(query);
      },
      onCreateFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      isCardMovePickerOpen(ideaId: string) {
        return ideaId === "idea-writing-1";
      },
      isCardMovePickerSubmitting(ideaId: string) {
        return ideaId === "idea-writing-1";
      },
      getCardMovePickerSearchQuery() {
        return "";
      }
    }) as any);

    const list = container.querySelector(".glitter-pool-stage__card-move-dialog-list") as unknown as FakeElement | null;
    const closeButton = container.querySelector(".glitter-pool-stage__card-move-dialog-close") as unknown as FakeElement | null;
    const searchInput = container.querySelector(".glitter-pool-stage__card-move-dialog-search") as unknown as FakeElement | null;
    const targetButtons = list?.querySelectorAll("button.glitter-pool-stage__toolbar-menu-item") ?? [];

    expect(closeButton?.disabled).toBe(true);
    expect(searchInput?.disabled).toBe(true);
    expect(targetButtons).toHaveLength(1);
    targetButtons.forEach((button) => {
      expect(button.disabled).toBe(true);
    });

    searchInput!.value = "归档";
    searchInput?.trigger("input");
    closeButton?.click();
    targetButtons[0]?.click();

    expect(calls.searches).toEqual([]);
    expect(calls.closed).toBe(0);
    expect(calls.moved).toEqual([]);
  });

  it("keeps the single-card move dialog CSS contract for Task 2", () => {
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-move-overlay", [
      "position: absolute;",
      "inset: 0;",
      "display: grid;",
      "place-items: center;",
      "z-index: 8;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-move-scrim", [
      "position: absolute;",
      "inset: 0;",
      "background: color-mix(in srgb, var(--glitter-ui-bg) 52%, transparent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-move-dialog", [
      "position: relative;",
      "display: flex;",
      "flex-direction: column;",
      "gap: 12px;",
      "border-radius: 18px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-move-dialog-header", [
      "position: relative;",
      "justify-content: center;",
      "min-height: 32px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-move-dialog-close", [
      "position: absolute;",
      "top: 0;",
      "right: 0;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 88%, transparent);",
      "box-shadow: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-move-dialog-search", [
      "width: 100%;",
      "min-height: 36px;",
      "padding: 0 12px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-move-dialog-list", [
      "display: grid;",
      "gap: 6px;",
      "overflow-y: auto;",
      "min-height: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-move-dialog-list .glitter-pool-stage__toolbar-menu-item", [
      "border: none;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 88%, transparent);",
      "box-shadow: none;",
      "appearance: none;",
      "-webkit-appearance: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-move-dialog-list .glitter-pool-stage__toolbar-menu-item:hover", [
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 84%, var(--glitter-ui-accent) 16%);",
      "color: var(--glitter-ui-accent);",
      "box-shadow: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-move-dialog-close:disabled", [
      "cursor: default;",
      "opacity: 0.48;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-move-dialog-list .glitter-pool-stage__toolbar-menu-item:disabled", [
      "cursor: default;",
      "opacity: 0.48;"
    ]);
  });

  it("renders the pool query as a plain text input to avoid native search chrome", () => {
    const container = createContainer();

    renderPoolView(container, buildPoolViewState("pool-browse"), {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    expect((container.querySelector(".glitter-pool-stage__query") as unknown as { type?: string })?.type).toBe("text");
  });

  it("keeps query drafting local and only submits on Enter outside composition", () => {
    const changes: Array<{ query: string; isComposing?: boolean }> = [];
    const submits: string[] = [];
    const container = createContainer();

    renderPoolView(container, buildPoolViewState("pool-browse"), {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange(query, options) {
        changes.push({ query, isComposing: options?.isComposing });
      },
      onQuerySubmit(query) {
        submits.push(query);
      },
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {}
    });

    const queryInput = container.querySelector(".glitter-pool-stage__query") as unknown as FakeElement;
    queryInput.value = "中文候选";
    queryInput.trigger("input", { isComposing: true });
    queryInput.trigger("keydown", { key: "Enter", isComposing: true });

    queryInput.value = "中文输入";
    queryInput.trigger("input");
    queryInput.trigger("keydown", { key: "Enter" });

    expect(changes).toEqual([
      { query: "中文候选", isComposing: true },
      { query: "中文输入", isComposing: undefined }
    ]);
    expect(submits).toEqual(["中文输入"]);
  });

  it("edits the title in place on click, auto-selects the text, and commits the trimmed value on Enter", () => {
    const savedTitles: string[] = [];
    const container = createContainer();

    renderPoolView(container, buildPoolViewState("pool-browse"), {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      onPoolTitleSave(title) {
        savedTitles.push(title);
      }
    });

    const title = container.querySelector(".glitter-pool-stage__title") as unknown as FakeElement;
    title.click();

    const selection = getDocumentSelection(container);
    expect(container.querySelector(".glitter-pool-stage__title-inline-input")).toBeNull();
    expect(title.getAttribute("contenteditable")).toBe("true");
    expect(title.textContent).toBe("产品池");
    expect(title.focused).toBe(true);
    expect(selection.selectedText).toBe("产品池");
    expect(selection.anchorOffset).toBe(0);
    expect(selection.focusOffset).toBe("产品池".length);

    let prevented = 0;
    title.textContent = "  重命名后的池  ";
    title.trigger("keydown", {
      key: "Enter",
      preventDefault() {
        prevented += 1;
      }
    });

    expect(prevented).toBe(1);
    expect(savedTitles).toEqual(["重命名后的池"]);
    expect(container.querySelector(".glitter-pool-stage__title")?.textContent).toContain("重命名后的池");
    expect(container.querySelector(".glitter-pool-stage__title")?.getAttribute("contenteditable")).not.toBe("true");
  });

  it("edits the description in place on click, auto-selects the text, and commits the trimmed value on blur", () => {
    const savedDescriptions: string[] = [];
    const container = createContainer();

    renderPoolView(container, buildPoolViewState("pool-browse"), {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      onPoolDescriptionSave(description) {
        savedDescriptions.push(description);
      }
    });

    const description = container.querySelector(".glitter-pool-stage__description-strip") as unknown as FakeElement;
    description.click();

    const selection = getDocumentSelection(container);
    expect(container.querySelector(".glitter-pool-stage__description-inline-input")).toBeNull();
    expect(description.getAttribute("contenteditable")).toBe("true");
    expect(description.textContent).toBe("继续在当前池中筛选、整理并沉淀灵感。");
    expect(description.focused).toBe(true);
    expect(selection.selectedText).toBe("继续在当前池中筛选、整理并沉淀灵感。");
    expect(selection.anchorOffset).toBe(0);
    expect(selection.focusOffset).toBe("继续在当前池中筛选、整理并沉淀灵感。".length);

    description.textContent = "  更新后的池描述  ";
    description.trigger("blur");

    expect(savedDescriptions).toEqual(["更新后的池描述"]);
    expect(container.querySelector(".glitter-pool-stage__description-strip")?.textContent).toContain("更新后的池描述");
    expect(container.querySelector(".glitter-pool-stage__description-strip")?.getAttribute("contenteditable")).not.toBe("true");
  });

  it("keeps the pool switcher immediately after the title while the title changes", () => {
    const container = createContainer();

    renderPoolView(container, buildPoolViewState("pool-browse"), {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      onPoolTitleSave() {}
    });

    const titleCluster = container.querySelector(".glitter-pool-stage__title-cluster") as unknown as FakeElement | null;
    expect(titleCluster?.children[0]?.className).toContain("glitter-pool-stage__title-slot");
    expect(titleCluster?.children[1]?.className).toContain("glitter-pool-stage__title-switcher");

    const title = container.querySelector(".glitter-pool-stage__title") as unknown as FakeElement;
    title.click();

    expect(container.querySelector(".glitter-pool-stage__title-inline-input")).toBeNull();
    expect(titleCluster?.children[0]?.className).toContain("glitter-pool-stage__title-slot");
    expect(titleCluster?.children[1]?.className).toContain("glitter-pool-stage__title-switcher");

    title.textContent = "一个明显更长的新标题名称";
    title.trigger("keydown", { key: "Enter" });

    expect(container.querySelector(".glitter-pool-stage__title")?.textContent).toContain("一个明显更长的新标题名称");
    expect(titleCluster?.children[0]?.className).toContain("glitter-pool-stage__title-slot");
    expect(titleCluster?.children[1]?.className).toContain("glitter-pool-stage__title-switcher");
  });

  it("does not allow editing the default pool title or description", () => {
    const savedTitles: string[] = [];
    const savedDescriptions: string[] = [];
    const container = createContainer();
    const state = createBrowseState({
      pool: {
        id: DEFAULT_POOL_ID,
        title: DEFAULT_POOL_LABEL,
        itemCount: 3,
        tone: "bluegray"
      },
      header: {
        title: DEFAULT_POOL_LABEL
      },
      browse: {
        description: DEFAULT_POOL_DESCRIPTION,
        descriptionValue: DEFAULT_POOL_DESCRIPTION
      }
    });

    renderPoolView(container, state, {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onOpenPrimaryFile() {},
      onEditIdea() {},
      onShareIdea() {},
      onPoolSwitch() {},
      onPoolTitleSave(title) {
        savedTitles.push(title);
      },
      onPoolDescriptionSave(description) {
        savedDescriptions.push(description);
      }
    });

    const title = container.querySelector(".glitter-pool-stage__title") as unknown as FakeElement;
    const description = container.querySelector(".glitter-pool-stage__description-strip") as unknown as FakeElement;

    title.click();
    description.click();

    expect(title.getAttribute("contenteditable")).not.toBe("true");
    expect(description.getAttribute("contenteditable")).not.toBe("true");
    expect(savedTitles).toEqual([]);
    expect(savedDescriptions).toEqual([]);
  });

  it("sets rendered buttons to type=button", () => {
    const container = createContainer();

    renderPoolView(container, buildPoolViewState("pool-browse"), {
      onBack() {},
      onItemSelect() {},
      onCreateIdea() {},
      onQueryChange() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onContentFilterChange() {},
      onStatusChange() {},
      onSortChange() {},
      onBatchModeToggle() {},
      onMoveSelectionToPool() {},
      onCreateFile() {},
      onPoolSwitch() {}
    });

    const buttons = findDescendantsByTag(container, "button");
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => {
      expect(button.type).toBe("button");
    });
  });

  it("renders the revised first-use choose window with recommended new-pool ordering and real footer actions", () => {
    const selected: string[] = [];
    let closed = 0;
    let backed = 0;
    const container = createContainer();

    renderPoolView(container, buildPoolViewState("pool-first-use-choose"), {
      onBack() {
        backed += 1;
      },
      onClose() {
        closed += 1;
      },
      onItemSelect(itemId: string) {
        selected.push(itemId);
      },
      onCreateIdea() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onPoolSwitch() {}
    });

    const firstUseSurface = container.querySelector(".glitter-pool-stage__first-use-surface") as unknown as FakeElement | null;
    expect(firstUseSurface).not.toBeNull();
    expect(firstUseSurface?.className).not.toContain("glitter-write-stage__modal-card");
    expect(container.querySelector(".glitter-pool-stage__back")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__eyebrow")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__hint")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__choice-title")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__title")?.textContent).toBe("归池选择（首次）");
    expect(container.querySelector(".glitter-pool-stage__first-use-lead")?.textContent).toContain(
      "第一条灵感已保存。你可以直接归入默认池，或现在创建一个新池来分类。"
    );

    const closeButton = container.querySelector(".glitter-write-stage__close-button") as unknown as FakeElement | null;
    expect(closeButton).not.toBeNull();
    expect(closeButton?.getAttribute("aria-label")).toBe("关闭归池窗口");
    closeButton?.click();
    expect(closed).toBe(1);

    const options = container.querySelectorAll(".glitter-pool-stage__choice-option");
    expect(options).toHaveLength(2);
    expect(options[0]?.className).toContain("glitter-pool-stage__choice-option--first-use");
    expect(options[0]?.className).toContain("glitter-pool-stage__choice-option--recommended");
    expect(options[0]?.className).toContain("glitter-pool-stage__choice-option--selected");
    expect(options[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(options[0]?.querySelector(".glitter-pool-stage__first-use-option-title")?.textContent).toBe("方案 A：新建池后归类（推荐）");
    expect(options[0]?.querySelector(".glitter-pool-stage__first-use-option-description")?.textContent).toContain("描述与池色");
    expect(options[0]?.querySelector(".glitter-pool-stage__first-use-option-button")).toBeNull();
    expect(options[1]?.className).toContain("glitter-pool-stage__choice-option--default");
    expect(options[1]?.querySelector(".glitter-pool-stage__first-use-option-title")?.textContent).toBe("方案 B：归入默认池");
    expect(options[1]?.querySelector(".glitter-pool-stage__first-use-option-description")?.textContent).toContain("当前默认池");
    expect(options[1]?.querySelector(".glitter-pool-stage__first-use-option-button")).toBeNull();

    expect(container.querySelector(".glitter-pool-stage__first-use-note")).toBeNull();

    const continueButton = container.querySelector(".glitter-pool-stage__first-use-continue") as unknown as FakeElement | null;
    const backButton = container.querySelector(".glitter-pool-stage__first-use-back-action") as unknown as FakeElement | null;
    expect(continueButton?.textContent).toContain("继续");
    expect(backButton?.textContent).toContain("返回上一步");

    continueButton?.click();
    expect(selected).toEqual(["create-new-pool"]);

    (options[1] as unknown as FakeElement | null)?.click();
    expect(options[0]?.className).not.toContain("glitter-pool-stage__choice-option--selected");
    expect(options[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(options[1]?.className).toContain("glitter-pool-stage__choice-option--selected");
    expect(options[1]?.getAttribute("aria-pressed")).toBe("true");

    continueButton?.click();
    backButton?.click();

    expect(selected).toEqual(["create-new-pool", "use-default-pool"]);
    expect(backed).toBe(1);
  });

  it("renders create-pool mode with quick-capture-aligned structure and actions", () => {
    const selected: string[] = [];
    let closed = 0;
    const container = createContainer();

    renderPoolView(container, buildPoolViewState("pool-first-use-create"), {
      onBack() {
        closed += 1;
      },
      onClose() {
        closed += 1;
      },
      onItemSelect(itemId: string) {
        selected.push(itemId);
      },
      onCreateIdea() {},
      onBrowseOverlayToggle() {},
      onBrowseOverlayClose() {},
      onPoolSwitch() {}
    });

    expect(container.querySelector(".glitter-pool-stage__back")).toBeNull();
    expect(container.querySelector(".glitter-pool-stage__hint")).toBeNull();

    const surface = container.querySelector(".glitter-pool-stage__first-use-surface") as unknown as FakeElement | null;
    const header = container.querySelector(".glitter-pool-stage__header") as unknown as FakeElement | null;
    const closeButton = container.querySelector(".glitter-write-stage__close-button") as unknown as FakeElement | null;
    const submitButton = container.querySelector(".glitter-pool-stage__create-submit") as unknown as FakeElement | null;
    const nameInput = container.querySelector(".glitter-pool-stage__field-input") as unknown as FakeElement | null;
    const descriptionPanel = container.querySelector(".glitter-pool-stage__field-body-panel") as unknown as FakeElement | null;
    const descriptionInput = container.querySelector(".glitter-pool-stage__field-input--textarea") as unknown as FakeElement | null;
    const tip = container.querySelector(".glitter-pool-stage__first-use-tip") as unknown as FakeElement | null;
    const tipTitle = container.querySelector(".glitter-pool-stage__first-use-tip-title") as unknown as FakeElement | null;
    const swatches = container.querySelector(".glitter-pool-stage__swatches") as unknown as FakeElement | null;

    expect(surface?.className).not.toContain("glitter-write-stage__modal-card");
    expect(header?.className).toContain("glitter-write-stage__modal-header");
    expect(closeButton).not.toBeNull();
    expect(closeButton?.getAttribute("aria-label")).toBe("关闭新建池窗口");
    expect(container.querySelector(".glitter-write-stage__icon--close")).not.toBeNull();
    expect(container.querySelector(".glitter-pool-stage__footer-button--ghost")).toBeNull();

    expect(nameInput?.className).toContain("glitter-write-stage__input");
    expect(descriptionPanel?.className).toContain("glitter-write-stage__body-panel");
    expect(descriptionInput?.className).toContain("glitter-write-stage__body-editor");
    expect(descriptionInput?.className).toContain("glitter-write-stage__textarea");
    expect(descriptionInput?.className).toContain("glitter-write-stage__textarea--panel-blend");
    expect(descriptionInput?.className.split(/\s+/)).not.toContain("glitter-pool-stage__field-input");
    expect(tip?.className).toContain("glitter-write-stage__success-summary");
    expect(tipTitle).toBeNull();
    expect(swatches?.dataset.selectedPoolColor).toBe("#6ab5ff");

    const colorSwatches = container.querySelectorAll(".glitter-pool-stage__swatch") as unknown as FakeElement[];
    expect(colorSwatches).toHaveLength(5);
    expect(colorSwatches[0]?.className).toContain("glitter-pool-stage__swatch--selected");
    expect(colorSwatches[2]?.className).not.toContain("glitter-pool-stage__swatch--selected");
    colorSwatches[2]?.click();
    expect(swatches?.dataset.selectedPoolColor).toBe("#ffa980");
    expect(colorSwatches[0]?.className).not.toContain("glitter-pool-stage__swatch--selected");
    expect(colorSwatches[2]?.className).toContain("glitter-pool-stage__swatch--selected");

    expect(submitButton).not.toBeNull();
    expect(submitButton?.className).toContain("glitter-write-stage__action-primary");
    expect(submitButton?.className).toContain("glitter-write-stage__action-primary--with-icon");
    expect(submitButton?.className).toContain("glitter-write-stage__action-primary--capture-submit");
    expect(submitButton?.textContent).toContain("创建池");

    closeButton?.click();
    expect(closed).toBe(1);

    submitButton?.click();
    expect(selected).toEqual(["new-pool-created"]);
  });

  it("keeps browse no-sidebar CSS contract for Task 3", () => {
    const cardGridBlock = getSelectorBlock(stylesCss, "\n.glitter-pool-stage__card-grid");

    [
      "position: relative;",
      "display: block;",
      "overflow-y: auto;",
      "overflow-x: hidden;"
    ].forEach((declaration) => {
      expect(cardGridBlock).toContain(declaration);
    });
    expect(cardGridBlock).not.toContain("background:");
    expect(cardGridBlock).not.toContain("scrollbar-gutter: stable;");
    expect(cardGridBlock).not.toContain("scrollbar-width: thin;");

    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__card-grid,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__card-grid::-webkit-scrollbar,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__card-grid::-webkit-scrollbar-track,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__card-grid::-webkit-scrollbar-track-piece:vertical:start,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__card-grid::-webkit-scrollbar-track-piece:vertical:end,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__card-grid::-webkit-scrollbar-thumb,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__card-grid::-webkit-scrollbar-thumb:horizontal,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__card-grid {\n  scrollbar-width: none;\n  scrollbar-color: transparent transparent;\n}");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__card-grid::-webkit-scrollbar {\n  width: 0;\n  height: 0;\n}");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-scroll-indicator", [
      "position: absolute;",
      "right: calc(var(--glitter-pool-stage-side-padding, 32px) * -1 + 4px);",
      "pointer-events: none;",
      "opacity: 0;",
      "z-index: 5;"
    ]);
    const indicatorBaseBlock = getSelectorBlock(stylesCss, ".glitter-pool-stage__card-scroll-indicator::before");
    expect(indicatorBaseBlock).toContain("center / 12px 100% no-repeat");
    expect(indicatorBaseBlock).toContain("center / 2px 100% no-repeat");
    expect(indicatorBaseBlock).toContain("color-mix(in srgb, var(--glitter-ui-bg-alt) 56%, transparent) 0%");
    expect(indicatorBaseBlock).toContain("color-mix(in srgb, var(--glitter-ui-bg-alt) 56%, transparent) 100%");
    const indicatorActiveLineBlock = getSelectorBlock(stylesCss, ".glitter-pool-stage__card-scroll-indicator::after");
    expect(indicatorActiveLineBlock).toContain("top: calc(var(--glitter-pool-scroll-indicator-center) - 24px);");
    expect(indicatorActiveLineBlock).toContain("width: 2px;");
    expect(indicatorActiveLineBlock).toContain("height: 48px;");
    expect(indicatorActiveLineBlock).toContain("color-mix(in srgb, var(--glitter-ui-bg-alt) 56%, transparent) 10%");
    expect(indicatorActiveLineBlock).toContain("color-mix(in srgb, var(--glitter-ui-text-muted) 70%, var(--glitter-ui-bg-alt) 30%) 30%");
    expect(indicatorActiveLineBlock).toContain("color-mix(in srgb, var(--glitter-ui-text) 88%, var(--glitter-ui-accent) 12%) 50%");
    expect(indicatorActiveLineBlock).toContain("color-mix(in srgb, var(--glitter-ui-bg-alt) 56%, transparent) 90%");
    const lightThemeActiveLineBlock = getSelectorBlock(
      stylesCss,
      ".glitter-pool-stage[data-glitter-theme=\"obsidian-light\"] .glitter-pool-stage__card-scroll-indicator::after"
    );
    expect(lightThemeActiveLineBlock).toContain("color-mix(in srgb, var(--glitter-ui-accent) 6%, transparent) 10%");
    expect(lightThemeActiveLineBlock).toContain("color-mix(in srgb, var(--glitter-ui-accent) 14%, white 86%) 30%");
    expect(lightThemeActiveLineBlock).toContain("color-mix(in srgb, var(--glitter-ui-accent) 26%, white 74%) 50%");
    expect(lightThemeActiveLineBlock).toContain("0 0 8px color-mix(in srgb, var(--glitter-ui-accent) 7%, transparent)");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-scroll-indicator-thumb", [
      "position: absolute;",
      "left: 50%;",
      "width: 8px;",
      "height: 14px;",
      "transform: translate(-50%, -50%);",
      "clip-path: polygon(50% 0%, 82% 16%, 100% 50%, 82% 84%, 50% 100%, 18% 84%, 0% 50%, 18% 16%);"
    ]);
    const lightThemeThumbBlock = getSelectorBlock(
      stylesCss,
      ".glitter-pool-stage[data-glitter-theme=\"obsidian-light\"] .glitter-pool-stage__card-scroll-indicator-thumb"
    );
    expect(lightThemeThumbBlock).toContain("color-mix(in srgb, var(--glitter-ui-accent) 62%, white 38%) 0%");
    expect(lightThemeThumbBlock).toContain("color-mix(in srgb, var(--glitter-ui-accent) 28%, white 72%) 100%");
    expect(lightThemeThumbBlock).toContain("0 0 10px color-mix(in srgb, var(--glitter-ui-accent) 10%, transparent)");
    expect(stylesCss).toContain("top: var(--glitter-pool-scroll-indicator-center);");
    expect(stylesCss).toContain(".glitter-pool-stage__card-grid.glitter-pool-stage__card-grid--scrolling + .glitter-pool-stage__card-scroll-indicator {\n  opacity: 1;\n}");
    expect(stylesCss).toContain(".glitter-pool-stage__card-grid.glitter-pool-stage__card-grid--scrolling + .glitter-pool-stage__card-scroll-indicator::after {\n  opacity: 1;\n}");
    expect(stylesCss).toContain(".glitter-pool-stage__card-grid.glitter-pool-stage__card-grid--scrolling + .glitter-pool-stage__card-scroll-indicator .glitter-pool-stage__card-scroll-indicator-thumb {\n  opacity: 1;");
    expect(stylesCss).toContain("animation: glitter-pool-scroll-indicator-pulse-light 520ms ease-in-out infinite;");
    expect(stylesCss).toContain("@keyframes glitter-pool-scroll-indicator-pulse-light {");
    expect(stylesCss).toContain("min-height: 42px;");
    expect(stylesCss).toContain("radial-gradient(\n      92% 18px at 50% 100%,");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-shell", [
      "position: absolute;",
      "top: 0;",
      "left: 0;",
      "width: 280px;",
      "min-width: 0;"
    ]);

    expectDeclarationsInSelectorBlock(getMediaQueryBlock(stylesCss, "(max-width: 760px)"), ".glitter-pool-stage__card-shell", [
      "width: 100%;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage", [
      "--glitter-pool-stage-side-padding: clamp(28px, 2.6vw, 40px);",
      "width: 100%;",
      "padding: 20px var(--glitter-pool-stage-side-padding) 0;",
      "display: flex;",
      "flex-direction: column;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__topbar", [
      "display: flex;",
      "align-items: center;",
      "justify-content: space-between;",
      "gap: 12px;",
      "flex-wrap: wrap;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__back", [
      "all: unset;",
      "box-sizing: border-box;",
      "border: none;",
      "background: transparent;",
      "box-shadow: none;",
      "padding: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__create-close", [
      "width: 32px;",
      "height: 32px;",
      "border-radius: 8px;",
      "border: none;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, black 6%);",
      "box-shadow: none;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__create-close", [
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "border: none !important;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, black 6%) !important;",
      "background-image: none !important;",
      "box-shadow: none !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__title-switcher", [
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "background-image: none !important;",
      "text-shadow: none;",
      "filter: none !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__status-trigger", [
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "background-image: none !important;",
      "text-shadow: none;",
      "filter: none !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-tool", [
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "background-image: none !important;",
      "text-shadow: none;",
      "filter: none !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__batch-toggle", [
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "background-image: none !important;",
      "text-shadow: none;",
      "filter: none !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-more-trigger", [
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "background-image: none !important;",
      "text-shadow: none;",
      "filter: none !important;"
    ]);
    expect(stylesCss).toContain(`.glitter-pool-stage__back:focus-visible,
.glitter-pool-stage__back:active {
  outline: none;
  box-shadow: none;
}`);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__back-icon", [
      "width: 14px;",
      "height: 14px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__title-slot", [
      "min-width: 0;",
      "flex: 0 1 auto;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__description-slot", [
      "min-width: 0;"
    ]);
    expect(getSelectorBlock(stylesCss, ".glitter-pool-stage__description-slot")).not.toContain("flex:");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__description-strip", [
      "display: block;",
      "width: 100%;",
      "box-sizing: border-box;",
      "margin-top: 0;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 88%, transparent);"
    ]);

    expect(stylesCss).not.toContain(".glitter-pool-stage__title-inline-input {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__description-inline-input {");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__title-switcher", [
      "all: unset;",
      "box-sizing: border-box;",
      "width: 24px;",
      "height: 24px;",
      "border: none;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, transparent);",
      "box-shadow: none;",
      "padding: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__pool-trigger-arrows", [
      "width: 8px;",
      "height: 12px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__topbar-tools", [
      "display: flex;",
      "align-items: center;",
      "justify-content: flex-end;",
      "gap: 8px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-controls", [
      "margin-left: auto;",
      "max-width: 100%;",
      "min-width: 0;",
      "display: inline-flex;",
      "flex-direction: column;",
      "align-items: flex-end;",
      "gap: 8px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-tools", [
      "display: flex;",
      "align-items: center;",
      "justify-content: flex-end;",
      "gap: 8px;",
      "flex-wrap: nowrap;",
      "min-width: 0;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-tool-anchor", [
      "position: relative;",
      "display: grid;",
      "flex: 0 0 auto;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__topbar-create", [
      "all: unset;",
      "min-height: 32px;",
      "padding: 0 18px;",
      "border: none;",
      "border-radius: 999px;",
      "background: var(--glitter-ui-accent);",
      "color: var(--glitter-ui-accent-contrast);",
      "box-shadow: none;",
      "white-space: nowrap;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__topbar-create-icon", [
      "width: 12px;",
      "height: 12px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__first-use-footer", [
      "margin-top: 18px;",
      "display: flex;",
      "align-items: center;",
      "gap: 10px;",
      "flex-wrap: wrap;",
      "justify-content: flex-end;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__create-submit", [
      "height: 34px;",
      "min-width: 132px;",
      "border: none;",
      "background: var(--glitter-ui-accent);",
      "background-image: none;",
      "color: var(--glitter-ui-accent-contrast);",
      "box-shadow: none;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__create-submit", [
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "border: none !important;",
      "background: var(--glitter-ui-accent) !important;",
      "background-image: none !important;",
      "color: var(--glitter-ui-accent-contrast) !important;",
      "box-shadow: none !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-modal", [
      "padding: 0;",
      "border: 1px solid color-mix(in srgb, var(--glitter-ui-border) 58%, transparent);",
      "border-radius: 16px;",
      "background: var(--glitter-ui-bg);",
      "box-shadow: none;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-modal.glitter-pool-modal--choose", [
      "width: min(720px, calc(100vw - 56px));",
      "max-width: min(720px, calc(100vw - 56px));",
      "min-width: min(720px, calc(100vw - 56px));"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-modal.glitter-pool-modal--create", [
      "width: min(576px, calc(100% - 28px));",
      "max-width: min(576px, calc(100% - 28px));",
      "min-width: min(576px, calc(100% - 28px));"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-quick-capture-modal.glitter-quick-capture-modal--first-use", [
      "padding: 0;",
      "border: 1px solid color-mix(in srgb, var(--glitter-ui-border) 58%, transparent);",
      "border-radius: 16px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg) 72%, transparent);",
      "box-shadow: none;",
      "overflow: hidden;",
      "position: relative;",
      "isolation: isolate;",
      "-webkit-backdrop-filter: blur(28px) saturate(148%);",
      "backdrop-filter: blur(28px) saturate(148%);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-modal.glitter-pool-modal--first-use", [
      "padding: 0;",
      "border: 1px solid color-mix(in srgb, var(--glitter-ui-border) 58%, transparent);",
      "border-radius: 16px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg) 72%, transparent);",
      "box-shadow: none;",
      "overflow: hidden;",
      "position: relative;",
      "isolation: isolate;",
      "-webkit-backdrop-filter: blur(28px) saturate(148%);",
      "backdrop-filter: blur(28px) saturate(148%);"
    ]);
    expect(stylesCss).toContain(".glitter-followup-guidance-modal-host,");
    expect(stylesCss).toContain(".glitter-followup-guidance-modal {");
    expect(stylesCss).toContain(`.glitter-followup-guidance-modal {
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--glitter-ui-border) 58%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--glitter-ui-bg) 72%, transparent);
  box-shadow: none;
  overflow: hidden;
  -webkit-backdrop-filter: blur(28px) saturate(148%);
  backdrop-filter: blur(28px) saturate(148%);
  width: min(576px, calc(100% - 28px));
  max-width: min(576px, calc(100% - 28px));
  min-width: min(576px, calc(100% - 28px));
`);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-modal-host .modal-bg", [
      "rgba(255, 255, 255, 0.22)",
      "rgba(184, 207, 215, 0.16)",
      "rgba(118, 147, 162, 0.3)",
      "-webkit-backdrop-filter: blur(68px) saturate(118%);",
      "backdrop-filter: blur(68px) saturate(118%);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-modal .modal-close-button", [
      "display: none;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__header", [
      "display: flex;",
      "align-items: flex-start;",
      "justify-content: space-between;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-list", [
      "gap: 14px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-item", [
      "display: grid;",
      "grid-template-columns: 44px minmax(0, 1fr);",
      "align-items: center;",
      "width: 100%;",
      "gap: 16px;",
      "min-height: 0;",
      "padding: 16px 18px;",
      "border: none;",
      "border-radius: 20px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 92%, black 8%);",
      "box-shadow: none;"
    ]);
    const featureItemBlock = getSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-item");
    expect(featureItemBlock).not.toContain("inset 0 1px 0");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-icon-wrap", [
      "width: 44px;",
      "height: 44px;",
      "border: none;",
      "border-radius: 16px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 82%, black 18%);",
      "box-shadow: none;"
    ]);
    const featureIconWrapBlock = getSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-icon-wrap");
    expect(featureIconWrapBlock).not.toContain("inset 0 1px 0");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__header-copy", [
      "min-width: 0;",
      "flex: 1 1 auto;",
      "display: flex;",
      "flex-direction: column;",
      "align-items: flex-start;",
      "gap: 8px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__title", [
      "text-align: left;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__close", [
      "flex: 0 0 auto;",
      "margin-top: 2px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-copy", [
      "min-width: 0;",
      "display: flex;",
      "flex-direction: column;",
      "gap: 8px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-icon", [
      "width: 24px;",
      "height: 24px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-icon.glitter-write-stage__icon", [
      "width: 24px;",
      "height: 24px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__footnote", [
      "display: flex;",
      "align-items: center;",
      "gap: 8px;",
      "padding: 0;",
      "border: none;",
      "background: transparent;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__footnote-icon", [
      "width: 16px;",
      "height: 16px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__footnote-icon.glitter-write-stage__icon", [
      "width: 16px;",
      "height: 16px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__continue.glitter-write-stage__action-primary--primary", [
      "border: none;",
      "background: var(--glitter-ui-accent);",
      "background-image: none;",
      "box-shadow: none;",
      "color: var(--glitter-ui-accent-contrast);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-followup-guidance-view__continue .glitter-write-stage__icon--waves", [
      "color: var(--glitter-ui-accent-contrast);"
    ]);
    expect(stylesCss).toContain(
      ".glitter-followup-guidance-view__continue.glitter-write-stage__action-primary--primary:hover,\n.glitter-followup-guidance-view__continue.glitter-write-stage__action-primary--primary:focus-visible {\n  background: var(--glitter-ui-accent-hover);"
    );
    expectDeclarationsInSelectorBlock(stylesCss, ".modal-content.glitter-followup-guidance-modal__content", [
      "width: 100%;",
      "max-width: 100%;",
      "min-width: 100%;",
      "height: auto;"
    ]);
    expect(getSelectorBlock(stylesCss, ".modal-content.glitter-followup-guidance-modal__content")).not.toContain("height: 100%;");
    const fileTextIconBlock = getSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-icon--file-text");
    expect(fileTextIconBlock).toContain("stroke='black'");
    expect(fileTextIconBlock).toContain("stroke-width='1.6'");
    const linkIconBlock = getSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-icon--link-2");
    expect(linkIconBlock).toContain("stroke='black'");
    expect(linkIconBlock).toContain("stroke-width='1.8'");
    expect(linkIconBlock).toContain("M8.35 8.35H7.2");
    expect(linkIconBlock).toContain("M10.35 12h3.3");
    const keyboardIconBlock = getSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-icon--keyboard");
    expect(keyboardIconBlock).toContain("stroke='black'");
    expect(keyboardIconBlock).toContain("stroke-width='1.6'");
    const quoteIconBlock = getSelectorBlock(stylesCss, ".glitter-followup-guidance-view__feature-icon--quote");
    expect(quoteIconBlock).toContain("stroke='black'");
    expect(quoteIconBlock).toContain("stroke-width='1.8'");
    expect(quoteIconBlock).toContain("stroke-linecap='round'");
    expect(quoteIconBlock).toContain("M6 5v14");
    expect(quoteIconBlock).toContain("M10 7h8");
    expect(quoteIconBlock).toContain("M10 12h6");
    expect(quoteIconBlock).toContain("M10 17h8");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-quick-capture-modal.glitter-quick-capture-modal--first-use .glitter-quick-capture-modal__content", [
      "height: auto;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-modal.glitter-pool-modal--first-use .glitter-pool-modal__content", [
      "height: auto;"
    ]);
    expect(stylesCss).not.toContain(
      ".glitter-quick-capture-modal.glitter-quick-capture-modal--first-use::after"
    );
    expect(stylesCss).not.toContain(
      ".glitter-pool-modal.glitter-pool-modal--first-use::after"
    );
    expect(stylesCss).not.toContain(
      ".glitter-quick-capture-modal--first-use .glitter-quick-capture-modal__content {\n  position: relative;"
    );
    expect(stylesCss).not.toContain(
      ".glitter-pool-modal--first-use .glitter-pool-modal__content {\n  position: relative;"
    );
    expect(stylesCss).not.toContain(
      ".glitter-quick-capture-modal--first-use .glitter-write-stage__modal-card::after"
    );
    expect(stylesCss).not.toContain(
      ".glitter-pool-modal--first-use .glitter-pool-stage__first-use-surface::after"
    );
    expect(stylesCss).not.toContain(
      ".glitter-quick-capture-modal--first-use .glitter-write-stage__footer--quick-capture {\n  border-top:"
    );
    expect(stylesCss).not.toContain(
      ".glitter-pool-modal--first-use .glitter-pool-stage__first-use-actions {\n  border-top:"
    );
    expect(stylesCss).not.toContain(
      ".glitter-pool-modal--first-use .glitter-pool-stage__first-use-footer {\n  border-top:"
    );
    expect(stylesCss).not.toContain(".glitter-followup-guidance-view::after {");
    expect(stylesCss).not.toContain("height: 176px;");
    expect(stylesCss).not.toContain("border-top: 1px solid color-mix(in srgb, var(--glitter-ui-border) 26%, transparent);");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__first-use-surface", [
      "width: 100%;",
      "max-width: 100%;",
      "padding: 26px 28px 24px;",
      "border: none;",
      "border-radius: 0;",
      "background: transparent;",
      "box-shadow: none;"
    ]);
    expect(stylesCss).not.toContain(".glitter-pool-stage__first-use-back {");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__choice-option", [
      "all: unset;",
      "box-sizing: border-box;",
      "width: 100%;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__choice-option--first-use", [
      "min-height: 88px;",
      "border-radius: 18px;",
      "padding: 18px 18px 16px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__choice-option--recommended", [
      "border-color: color-mix(in srgb, var(--glitter-ui-accent) 28%, var(--glitter-ui-border-strong) 72%);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__choice-option--default", [
      "background: color-mix(in srgb, var(--glitter-ui-surface) 90%, var(--glitter-ui-bg-alt) 10%);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__choice-option--first-use.glitter-pool-stage__choice-option--selected", [
      "border-color: color-mix(in srgb, var(--glitter-ui-accent) 84%, var(--glitter-ui-border-strong) 16%);",
      "background: color-mix(in srgb, var(--glitter-ui-accent) 18%, var(--glitter-ui-bg-alt) 82%);",
      "box-shadow: 0 0 0 1px color-mix(in srgb, var(--glitter-ui-accent) 54%, transparent);"
    ]);
    expect(stylesCss).not.toContain(".glitter-pool-stage__first-use-option-button {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__first-use-option-button--primary {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__first-use-option-button--secondary {");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__header", [
      "display: flex;",
      "align-items: flex-start;",
      "justify-content: space-between;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__field-input", [
      "border: 1px solid color-mix(in srgb, var(--glitter-ui-border) 76%, transparent);",
      "border-radius: 10px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, black 6%);",
      "padding: 10px 16px;",
      "box-shadow: none;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__field-input.glitter-write-stage__input", [
      "border-radius: 10px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, black 6%);",
      "padding: 10px 16px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__field-body-panel", [
      "min-height: 144px;",
      "border-radius: 10px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, black 6%);",
      "padding: 18px 16px 16px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__field-body-panel.glitter-write-stage__body-panel", [
      "border-radius: 10px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__field-input--textarea", [
      "border: none !important;",
      "background: transparent !important;",
      "padding: 0;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__swatches", [
      "display: flex;",
      "gap: 8px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__swatch", [
      "width: 20px;",
      "height: 20px;",
      "border-radius: 999px;",
      "border: 1px solid color-mix(in srgb, var(--glitter-ui-border) 76%, transparent);",
      "cursor: pointer;",
      "padding: 0;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__swatch--selected", [
      "outline: 2px solid color-mix(in srgb, var(--glitter-ui-border-strong) 56%, transparent);",
      "outline-offset: 0;",
      "box-shadow: none;"
    ]);
    expect(stylesCss).not.toContain(".glitter-pool-stage__first-use-note {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__first-use-note-title {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__first-use-note-body {");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__first-use-tip", [
      "border-radius: 10px;",
      "border: none;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, black 6%);",
      "padding: 22px 24px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__first-use-tip.glitter-write-stage__success-summary", [
      "border-radius: 10px;",
      "border: none;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, black 6%);"
    ]);

    expect(stylesCss).not.toContain(".glitter-pool-stage__footer-button {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__footer-button--ghost {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__footer-button--primary {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__first-use-tip-title {");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__query", [
      "all: unset;",
      "display: block;",
      "width: min(320px, 100%);",
      "height: 32px;",
      "flex: 1 1 220px;",
      "border: none;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, transparent);",
      "box-shadow: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__query:focus,\n.glitter-pool-stage .glitter-pool-stage__query:focus-visible", [
      "outline: none !important;",
      "box-shadow: none !important;",
      "border-color: transparent !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__status-trigger", [
      "all: unset;",
      "box-sizing: border-box;",
      "width: 32px;",
      "height: 32px;",
      "min-width: 32px;",
      "min-height: 32px;",
      "border: none;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, transparent);",
      "box-shadow: none;",
      "padding: 0;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-tool-icon--status", [
      "-webkit-mask-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z'/%3E%3Cpath d='M19 3v4'/%3E%3Cpath d='M21 5h-4'/%3E%3Cpath d='M5 17v3'/%3E%3Cpath d='M6.5 18.5h-3'/%3E%3C/svg%3E\");",
      "mask-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z'/%3E%3Cpath d='M19 3v4'/%3E%3Cpath d='M21 5h-4'/%3E%3Cpath d='M5 17v3'/%3E%3Cpath d='M6.5 18.5h-3'/%3E%3C/svg%3E\");"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-header", [
      "display: flex;",
      "align-items: flex-start;",
      "justify-content: space-between;",
      "gap: 16px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__toolbar-menu", [
      "position: absolute;",
      "top: calc(100% + 8px);",
      "right: 0;",
      "max-height: min(240px, calc(100vh - 220px));",
      "overflow-y: auto;",
      "padding: 6px;",
      "border-radius: 14px;"
    ]);

    expect(stylesCss).not.toContain(".glitter-pool-stage__card-media-frame {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__card-media-frame--with-preview {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__card-media-preview-trigger {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__card-media-frame--interactive {");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-content--image,\n.glitter-pool-stage__card-content--video", [
      "position: relative;",
      "display: grid;",
      "gap: 12px;",
      "padding: 0 0 16px;",
      "align-content: start;"
    ]);
    expect(getSelectorBlock(stylesCss, ".glitter-pool-stage__card-content--image,\n.glitter-pool-stage__card-content--video")).not.toContain("aspect-ratio:");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-stage", [
      "position: relative;",
      "width: 100%;",
      "overflow: visible;",
      "border-radius: 18px;",
      "isolation: isolate;"
    ]);
    expect(stylesCss).not.toContain(".glitter-pool-stage__card-media-stage::after {");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-stage--image", [
      "aspect-ratio: 4 / 3;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-clip", [
      "position: relative;",
      "z-index: 1;",
      "width: 100%;",
      "overflow: hidden;",
      "border-radius: inherit;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-stage--image .glitter-pool-stage__card-media-clip", [
      "height: 100%;"
    ]);
    expect(stylesCss).not.toContain(".glitter-pool-stage__card-content--interactive {");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-thumbnail", [
      "position: relative;",
      "z-index: 1;",
      "width: 100%;",
      "height: 100%;",
      "display: block;",
      "border-radius: inherit;",
      "object-position: center;",
      "pointer-events: none;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-hitbox", [
      "width: 100%;",
      "height: 100%;",
      "display: grid;",
      "place-items: center;",
      "cursor: zoom-in;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-hitbox:focus-visible", [
      "outline: 1px solid color-mix(in srgb, var(--glitter-ui-border-strong) 72%, transparent);",
      "outline-offset: -1px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, "img.glitter-pool-stage__card-media-thumbnail", ["object-fit: cover;"]);
    expectDeclarationsInSelectorBlock(stylesCss, "video.glitter-pool-stage__card-media-thumbnail", [
      "height: auto;",
      "object-fit: contain;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-switcher", [
      "position: absolute;",
      "inset: 0;",
      "z-index: 2;",
      "pointer-events: none;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage button.glitter-pool-stage__card-media-switch", [
      "position: absolute;",
      "top: 50%;",
      "pointer-events: none;",
      "width: 30px;",
      "height: 30px;",
      "overflow: hidden;",
      "border-radius: 999px;",
      "opacity: 0;",
      "-webkit-backdrop-filter: blur(22px) saturate(164%);",
      "transform: translateY(calc(-50% + 6px));"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage button.glitter-pool-stage__card-media-switch::before", [
      "content: \"\";",
      "position: absolute;",
      "inset: 0;",
      "border-radius: inherit;"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__card-media-clip:hover .glitter-pool-stage__card-media-switch,\n.glitter-pool-stage__card-media-hitbox:focus-visible ~ .glitter-pool-stage__card-media-switcher .glitter-pool-stage__card-media-switch,\n.glitter-pool-stage button.glitter-pool-stage__card-media-switch:focus-visible",
      ["opacity: 1;", "pointer-events: auto;", "transform: translateY(-50%);"]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage button.glitter-pool-stage__card-media-switch:not(:disabled):hover,\n.glitter-pool-stage button.glitter-pool-stage__card-media-switch:not(:disabled):focus-visible",
      [
        "color: var(--glitter-ui-accent);",
        "border-color: color-mix(in srgb, var(--glitter-ui-accent) 68%, white 20%);",
        "outline: none;"
      ]
    );
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage button.glitter-pool-stage__card-media-switch:not(:disabled):hover", [
      "transform: translateY(calc(-50% - 1px));"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-switch--previous", ["left: 8px;"]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-switch--next", ["right: 8px;"]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-pagination", [
      "position: absolute;",
      "left: 50%;",
      "bottom: 8px;",
      "transform: translateX(-50%);",
      "min-width: 44px;",
      "text-align: center;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__media-preview-overlay", [
      "position: absolute;",
      "inset: 0;",
      "display: flex;",
      "z-index: 9;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__media-preview-image,\n.glitter-pool-stage__media-preview-video", [
      "max-width: 100%;",
      "max-height: 100%;",
      "display: block;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__media-preview-close", [
      "position: absolute;",
      "top: 0;",
      "right: 0;",
      "width: 34px;",
      "height: 34px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__media-preview-nav", [
      "position: absolute;",
      "top: 50%;",
      "width: 38px;",
      "height: 38px;",
      "border-radius: 999px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__media-preview-nav--previous", ["left: 12px;"]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__media-preview-nav--next", ["right: 12px;"]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__media-preview-pagination", [
      "position: absolute;",
      "left: 50%;",
      "bottom: 8px;",
      "transform: translateX(-50%);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__batch-panel", [
      "position: absolute;",
      "right: 20px;",
      "bottom: 20px;",
      "display: inline-flex;",
      "align-items: center;",
      "gap: 8px;",
      "z-index: 6;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__batch-action-anchor", [
      "position: relative;",
      "display: grid;",
      "flex: 0 0 auto;",
      "width: 40px;",
      "height: 40px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__toolbar-menu--batch", [
      "top: auto;",
      "right: 0;",
      "bottom: calc(100% + 8px);",
      "left: auto;",
      "transform: none;",
      "scrollbar-width: thin;",
      "scrollbar-color: color-mix(in srgb, var(--glitter-ui-accent) 18%, var(--glitter-ui-text) 32%) transparent;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__toolbar-menu--batch::-webkit-scrollbar", [
      "width: 8px;",
      "height: 8px;"
    ]);
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__toolbar-menu--batch::-webkit-scrollbar-track,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__toolbar-menu--batch::-webkit-scrollbar-track-piece:vertical:start,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__toolbar-menu--batch::-webkit-scrollbar-track-piece:vertical:end,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__toolbar-menu--batch::-webkit-scrollbar-thumb,");
    expect(stylesCss).toContain(".glitter-pool-stage .glitter-pool-stage__toolbar-menu--batch::-webkit-scrollbar-thumb:hover,");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__toolbar-menu--batch::-webkit-scrollbar-thumb", [
      "border-radius: 999px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__toolbar-menu-title", [
      "display: block;",
      "font-weight: 600;",
      "text-align: center;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__toolbar-menu--batch .glitter-pool-stage__toolbar-menu-title", [
      "position: sticky;",
      "top: 0;",
      "z-index: 1;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__toolbar-menu-create", [
      "position: sticky;",
      "bottom: 0;",
      "width: 100%;",
      "min-height: 34px;",
      "place-items: center;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, var(--glitter-ui-accent) 12%);",
      "color: var(--glitter-ui-accent);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__toolbar-menu-create:disabled", [
      "opacity: 0.46;",
      "cursor: default;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__batch-summary", [
      "min-height: 40px;",
      "padding: 0 14px;",
      "border-radius: 999px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-time-label", [
      "white-space: nowrap;",
      "overflow-wrap: normal;",
      "flex: 0 0 auto;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__batch-action", [
      "min-width: 40px;",
      "height: 40px;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 90%, transparent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-select-toggle", [
      "all: unset;",
      "width: 24px;",
      "height: 24px;",
      "border-radius: 999px;",
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "background-image: none !important;",
      "box-shadow: none !important;",
      "filter: none !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-select-toggle:focus-visible", [
      "outline: none !important;",
      "box-shadow: none !important;",
      "filter: none !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-select-toggle--selected", [
      "background: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-select-toggle--selected .glitter-pool-stage__card-select-toggle-dot", [
      "background: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__results-tool", [
      "all: unset;",
      "box-sizing: border-box;",
      "border: none;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, transparent);",
      "box-shadow: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__batch-toggle", [
      "all: unset;",
      "box-sizing: border-box;",
      "border: none;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, transparent);",
      "box-shadow: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-trigger", [
      "all: unset;",
      "box-sizing: border-box;",
      "border: none;",
      "border-radius: 999px;",
      "background: transparent;",
      "box-shadow: none;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__pool-popup", [
      "left: 50%;",
      "transform: translateX(-50%);"
    ]);

    expect(stylesCss).not.toContain(".glitter-pool-stage__create-fab {");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results", [
      "gap: 22px;",
      "margin-top: 8px;",
      "padding-bottom: 0;",
      "overflow: visible;"
    ]);

    expect(stylesCss).not.toContain(".glitter-pool-stage__sidebar {");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__workbench", [
      "position: relative;",
      "display: flex;",
      "flex: 1 1 auto;",
      "min-height: 0;"
    ]);

    const poolCardGridBlock = getSelectorBlock(stylesCss, "\n.glitter-pool-stage__card-grid");
    [
      "position: relative;",
      "display: block;",
      "overflow-y: auto;",
      "overflow-x: hidden;"
    ].forEach((declaration) => {
      expect(poolCardGridBlock).toContain(declaration);
    });
    expect(poolCardGridBlock).not.toContain("background:");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-stack", [
      "position: relative;",
      "width: 100%;",
      "padding: 0 0 24px;",
      "box-sizing: border-box;",
      "overflow: visible;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-shell", [
      "position: absolute;",
      "top: 0;",
      "left: 0;",
      "width: 280px;",
      "min-width: 0;",
      "z-index: 1;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-surface", [
      "position: relative;",
      "border-radius: 24px;",
      "border: 0.5px solid color-mix(in srgb, var(--glitter-ui-border) 34%, white 12%);",
      "box-shadow: none;",
      "-webkit-backdrop-filter: blur(20px) saturate(146%);",
      "backdrop-filter: blur(20px) saturate(146%);",
      "-webkit-user-select: text;",
      "user-select: text;",
      "transform-origin: center top;",
      "will-change: filter, opacity, transform;"
    ]);
    const cardSurfaceBlock = getSelectorBlock(stylesCss, ".glitter-pool-stage__card-surface");
    expect(cardSurfaceBlock).toContain("transition:");
    expect(cardSurfaceBlock).toContain("filter 560ms cubic-bezier(0.24, 0.82, 0.32, 1)");
    expect(cardSurfaceBlock).toContain("transform 500ms cubic-bezier(0.24, 0.82, 0.32, 1)");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-shell--isolation-active", [
      "z-index: 6;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage--card-isolation-reading .glitter-pool-stage__card-shell--isolation-active .glitter-pool-stage__card-surface", [
      "border-color: color-mix(in srgb, var(--glitter-ui-accent) 26%, white 26%);",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 78%, white 6%);",
      "0 12px 26px color-mix(in srgb, black 11%, transparent)"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-header", [
      "display: flex;",
      "align-items: center;",
      "min-height: 20px;",
      "padding: 0 34px 0 4px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-content", [
      "min-width: 0;",
      "overflow: hidden;",
      "display: grid;",
      "padding: 18px 15px 16px;",
      "border: none;",
      "border-radius: 20px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, var(--glitter-ui-bg) 18%);"
    ]);
    const cardContentBlock = getSelectorBlock(stylesCss, ".glitter-pool-stage__card-content");
    expect(cardContentBlock).toContain("0 10px 22px color-mix(in srgb, black 8%, transparent)");
    expect(cardContentBlock).toContain("0 2px 6px color-mix(in srgb, black 4%, transparent)");
    expect(cardContentBlock).toContain("inset 0 1px 0 color-mix(in srgb, white 22%, transparent)");
    expect(stylesCss).not.toContain(".glitter-pool-stage__card-supporting-panel {");

    expect(stylesCss).not.toContain(".glitter-pool-stage__card-title--supporting {");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-title", [
      "min-width: 0;",
      "overflow-wrap: anywhere;",
      "font-size: var(--font-text-size);",
      "line-height: 1.5;",
      "font-weight: 700;",
      "color: var(--glitter-ui-text);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-content--text,\n.glitter-pool-stage__card-content--link", [
      "display: grid;",
      "gap: 10px;",
      "min-height: 136px;",
      "grid-template-rows: auto minmax(0, 1fr) auto;",
      "align-content: start;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-footer", [
      "min-width: 0;",
      "display: grid;",
      "gap: 10px;",
      "padding: 0 4px 2px;"
    ]);

    expect(stylesCss).not.toContain(".glitter-pool-stage__card-footer--link {");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-supporting", [
      "min-width: 0;",
      "display: grid;",
      "gap: 4px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-supporting--link", [
      "gap: 2px;"
    ]);

    expect(stylesCss).not.toContain(".glitter-pool-stage__card-media-overlay {");
    expect(stylesCss).not.toContain(".glitter-pool-stage__card-media-label {");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-body", [
      "margin: 0;",
      "font-size: max(12px, calc(var(--font-text-size) - 1px));",
      "line-height: 1.5;",
      "color: var(--glitter-ui-text-muted);",
      "white-space: pre-wrap;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-body.glitter-pool-stage__card-copy--collapsed", [
      "display: -webkit-box;",
      "line-clamp: 8;",
      "-webkit-line-clamp: 8;",
      "overflow: hidden;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-body.glitter-pool-stage__card-copy--collapsed", [
      "display: -webkit-box;",
      "line-clamp: 4;",
      "-webkit-line-clamp: 4;",
      "overflow: hidden;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-copy--expanded", [
      "display: block;",
      "overflow: visible;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-body-toggle-row", [
      "width: 100%;",
      "display: flex;",
      "justify-content: center;",
      "margin-top: auto;",
      "padding-top: 4px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-body-toggle", [
      "all: unset;",
      "display: inline-flex;",
      "align-items: center;",
      "gap: 4px;",
      "padding: 0;",
      "border: none;",
      "background: transparent !important;",
      "cursor: pointer;",
      "color: var(--glitter-ui-text-faint);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-body-toggle:focus-visible", [
      "outline: 1px solid color-mix(in srgb, var(--glitter-ui-border-strong) 72%, transparent);",
      "outline-offset: 2px;",
      "border-radius: 6px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-body-toggle-text", [
      "font-size: 11px;",
      "line-height: 1.4;"
    ]);
    expect(stylesCss).not.toContain(".glitter-pool-stage__card-copy--collapsed > .glitter-pool-stage__card-body-toggle {");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-copy--collapsed > .glitter-pool-stage__card-body-toggle .glitter-pool-stage__card-body-toggle-text", [
      "order: 1;"
    ]);
    expect(stylesCss).not.toContain(".glitter-pool-stage__card-content--link > .glitter-pool-stage__card-link-block {");
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-link-block", [
      "display: grid;",
      "width: 100%;",
      "min-width: 0;",
      "padding: 0;",
      "border: none;",
      "border-radius: 0;",
      "background: transparent;",
      "background-image: none;",
      "text-decoration: none;",
      "box-shadow: none;",
      "overflow: visible;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-link-domain", [
      "display: block;",
      "width: 100%;",
      "white-space: normal;",
      "word-break: break-all;",
      "overflow: visible;",
      "font-size: 11px;",
      "line-height: 1.45;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-icon--accent", [
      "color: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-media-body", [
      "margin: 0;",
      "font-size: max(12px, calc(var(--font-text-size) - 1px));",
      "line-height: 1.5;",
      "color: var(--glitter-ui-text-muted);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-menu-shell", [
      "position: absolute;",
      "top: 10px;",
      "right: 10px;",
      "z-index: 2;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__results-tool", [
      "width: 32px;",
      "min-width: 32px;",
      "min-height: 32px;",
      "border: none;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, transparent);",
      "box-shadow: none;",
      "padding: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__batch-toggle", [
      "width: 32px;",
      "min-width: 32px;",
      "min-height: 32px;",
      "border: none;",
      "border-radius: 999px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 82%, transparent);",
      "box-shadow: none;",
      "padding: 0;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-more-trigger", [
      "border: none;",
      "border-radius: 999px;",
      "background: transparent;",
      "box-shadow: none;",
      "padding: 0;"
    ]);

    expect(stylesCss).not.toContain(".glitter-pool-stage__card-file-status {");

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage__card-more-menu", [
      "position: absolute;",
      "top: calc(100% + 6px);",
      "right: 0;",
      "min-width: 160px;",
      "display: grid;",
      "overflow-x: hidden;",
      "overflow-y: auto;",
      "padding: 2px;",
      "border: 1px solid color-mix(in srgb, var(--glitter-ui-border) 82%, transparent);",
      "border-radius: 24px;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item", [
      "all: unset;",
      "box-sizing: border-box;",
      "width: 100%;",
      "min-height: 32px;",
      "padding: 0 10px;",
      "border-radius: 0;",
      "background: transparent !important;",
      "appearance: none !important;",
      "-webkit-appearance: none !important;",
      "background-image: none !important;",
      "text-shadow: none;",
      "filter: none !important;",
      "box-shadow: none !important;"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item:hover", [
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, transparent) !important;",
      "color: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item > span", [
      "min-width: 0;",
      "overflow: hidden;",
      "text-overflow: ellipsis;",
      "white-space: nowrap;",
      "color: var(--glitter-ui-text-muted);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item:hover > span", [
      "color: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item .glitter-pool-stage__card-more-menu-icon", [
      "color: var(--glitter-ui-text-muted);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item:hover .glitter-pool-stage__card-more-menu-icon", [
      "color: var(--glitter-ui-accent);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item--delete", [
      "color: var(--glitter-ui-text-muted);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item--delete:hover", [
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 94%, transparent) !important;",
      "color: var(--text-error, #ff6b6b);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item--delete:hover > span", [
      "color: var(--text-error, #ff6b6b);"
    ]);

    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-pool-stage .glitter-pool-stage__card-more-menu-item--delete:hover .glitter-pool-stage__card-more-menu-icon", [
      "color: var(--text-error, #ff6b6b);"
    ]);
  });

  it("styles glitter-source callouts with the Glitter caption treatment", () => {
    expectDeclarationsInSelectorBlock(stylesCss, ".callout[data-callout=\"glitter-source\"]", [
      "--callout-color: 126, 155, 218;",
      "padding: 0;",
      "overflow: hidden;"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".callout[data-callout=\"glitter-source\"] .callout-icon,\n.callout[data-callout=\"glitter-source\"] .callout-fold",
      ["display: none;"]
    );
    expectDeclarationsInSelectorBlock(stylesCss, ".callout[data-callout=\"glitter-source\"] .callout-title-inner::before", [
      "content: \"✨\";",
      "color: var(--interactive-accent, #7e9bda);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".callout[data-callout=\"glitter-source\"] .callout-content", [
      "display: grid;",
      "gap: 12px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".callout[data-callout=\"glitter-source\"] .callout-content > blockquote", [
      "margin: 0;",
      "padding-left: 12px;"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) > .canvas-node-container,\n.glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]).is-selected > .canvas-node-container,\n.glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]).is-focused > .canvas-node-container,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) > .canvas-node-container,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]).is-selected > .canvas-node-container,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]).is-focused > .canvas-node-container",
      [
        "padding: 0;",
        "border: 1px solid color-mix(in srgb, var(--interactive-accent, #7e9bda) 30%, var(--background-modifier-border, #4a5f84) 70%);",
        "border-radius: 24px;",
        "box-shadow: inset 0 1px 0 color-mix(in srgb, var(--interactive-accent, #7e9bda) 18%, transparent);",
        "overflow: hidden;"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content,\n.glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .markdown-embed,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .markdown-embed",
      [
        "height: 100%;",
        "padding: 0;",
        "border: none;",
        "box-shadow: none;",
        "background: transparent;",
        "overflow: hidden;"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content",
      [
        "height: 100%;",
        "min-height: 0;",
        "overflow: hidden;"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view",
      [
        "height: 100%;",
        "min-height: 0;",
        "padding: 0;",
        "overflow: auto;"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view .callout[data-callout=\"glitter-source\"],\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view .callout[data-callout=\"glitter-source\"]",
      [
        "margin: 0;",
        "padding: 0;",
        "border: none;",
        "border-radius: 0;",
        "box-shadow: none;",
        "background: transparent;",
        "overflow: visible;"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view::before,\n.glitter-pool-stage__roam-canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view::after,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view::before,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node:has(.callout[data-callout=\"glitter-source\"]) .canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view::after",
      [
        "content: none;",
        "display: none;"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node-group:has(.canvas-group-label:empty) > .canvas-node-container,\n.glitter-pool-stage__roam-canvas-host .canvas-node-group:has(.canvas-group-label:empty).is-selected > .canvas-node-container,\n.glitter-pool-stage__roam-canvas-host .canvas-node-group:has(.canvas-group-label:empty).is-focused > .canvas-node-container,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node-group:has(.canvas-group-label:empty) > .canvas-node-container,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node-group:has(.canvas-group-label:empty).is-selected > .canvas-node-container,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node-group:has(.canvas-group-label:empty).is-focused > .canvas-node-container",
      [
        "padding: 0;",
        "border: none;",
        "border-radius: 0;",
        "box-shadow: none;",
        "background: transparent;"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node-group:has(.canvas-group-label:empty) .canvas-node-content,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node-group:has(.canvas-group-label:empty) .canvas-node-content",
      ["background: transparent;"]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node-group:has(.canvas-group-label:empty) .canvas-node-connection-point,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node-group:has(.canvas-group-label:empty) .canvas-node-connection-point",
      [
        "z-index: 3;",
        "pointer-events: auto;"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-pool-stage__roam-canvas-host .canvas-node-group:has(.canvas-group-label:empty) .canvas-group-label,\n.glitter-pool-roam-board-modal__canvas-host .canvas-node-group:has(.canvas-group-label:empty) .canvas-group-label",
      ["display: none;"]
    );
  });
});
