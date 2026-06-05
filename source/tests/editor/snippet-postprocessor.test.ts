/**
 * 保护灵感片段后处理对 callout 与链接的增强相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import { enhanceGlitterSnippets } from "../../src/editor/snippet-postprocessor";

type FakeKeyboardEvent = {
  key?: string;
  preventDefault: ReturnType<typeof vi.fn>;
};

type FakeListener = (event?: FakeKeyboardEvent) => void;

// 构造最小宿主替身，承接渲染层与事件层断言。
class FakeAnchorElement {
  constructor(public href: string) {}
}

class FakeTextElement {
  dataset: Record<string, string> = {};

  private value: string;

  constructor(text: string) {
    this.value = text;
  }

  get textContent(): string {
    return this.value;
  }

  set textContent(value: string) {
    this.value = value;
  }

  get innerHTML(): string {
    return this.value;
  }

  set innerHTML(value: string) {
    this.value = value;
  }
}

class FakeSnippetElement {
  dataset: Record<string, string> = {};
  tabIndex = -1;
  attributes: Record<string, string> = {};

  private readonly listeners = new Map<string, FakeListener[]>();

  constructor(ideaId?: string, options: { legacyDataset?: boolean } = {}) {
    if (ideaId) {
      if (options.legacyDataset) {
        this.dataset.glitterIdeaId = ideaId;
      } else {
        this.dataset.glitterideaId = ideaId;
      }
    }
  }

  addEventListener(type: string, listener: FakeListener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  querySelector(_selector: string): FakeAnchorElement | FakeTextElement | null {
    return null;
  }

  click(): void {
    const listeners = this.listeners.get("click") ?? [];
    listeners.forEach((listener) => listener());
  }

  keydown(key: string): FakeKeyboardEvent {
    const event: FakeKeyboardEvent = {
      key,
      preventDefault: vi.fn()
    };
    const listeners = this.listeners.get("keydown") ?? [];
    listeners.forEach((listener) => listener(event));
    return event;
  }
}

class FakeCalloutElement extends FakeSnippetElement {
  private readonly anchor: FakeAnchorElement;
  readonly footer: FakeTextElement;

  constructor(href: string, footerText = "✨ 来自 Glitter · 默认池") {
    super();
    this.anchor = new FakeAnchorElement(href);
    this.footer = new FakeTextElement(footerText);
  }

  override querySelector(selector: string): FakeAnchorElement | FakeTextElement | null {
    if (selector === '.callout-title-inner a[href^="glitter://idea/"]') {
      return this.anchor;
    }

    return selector === ".callout-content > :last-child" ? this.footer : null;
  }
}

class FakeContainer {
  constructor(private readonly nodes: FakeSnippetElement[]) {}

  querySelectorAll<T>(_selector: string): T[] {
    return this.nodes as T[];
  }
}

// 校验片段增强逻辑对 callout、引用与链接的补齐行为。
describe("enhanceGlitterSnippets", () => {
  it("binds click handlers to rendered Glitter snippets", async () => {
    const snippet = new FakeSnippetElement("idea-1");
    const container = new FakeContainer([snippet]);

    const onSnippetClick = vi.fn();
    await enhanceGlitterSnippets(container as any, onSnippetClick);

    snippet.click();
    expect(onSnippetClick).toHaveBeenCalledWith("idea-1");
    expect(snippet.tabIndex).toBe(0);
    expect(snippet.attributes.role).toBe("button");
  });

  it("keeps legacy glitter-idea dataset markers interactive", async () => {
    const snippet = new FakeSnippetElement("idea-legacy", { legacyDataset: true });
    const container = new FakeContainer([snippet]);

    const onSnippetClick = vi.fn();
    await enhanceGlitterSnippets(container as any, onSnippetClick);

    snippet.click();
    expect(onSnippetClick).toHaveBeenCalledWith("idea-legacy");
    expect(snippet.dataset.glitterideaId).toBe("idea-legacy");
    expect(snippet.dataset.glitterIdeaId).toBeUndefined();
  });

  it("activates snippet click on Enter key", async () => {
    const snippet = new FakeSnippetElement("idea-1");
    const container = new FakeContainer([snippet]);

    const onSnippetClick = vi.fn();
    await enhanceGlitterSnippets(container as any, onSnippetClick);

    const event = snippet.keydown("Enter");

    expect(onSnippetClick).toHaveBeenCalledWith("idea-1");
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("activates snippet click on Space key and prevents default", async () => {
    const snippet = new FakeSnippetElement("idea-1");
    const container = new FakeContainer([snippet]);

    const onSnippetClick = vi.fn();
    await enhanceGlitterSnippets(container as any, onSnippetClick);

    const event = snippet.keydown(" ");

    expect(onSnippetClick).toHaveBeenCalledWith("idea-1");
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("ignores non-activation keys", async () => {
    const snippet = new FakeSnippetElement("idea-1");
    const container = new FakeContainer([snippet]);

    const onSnippetClick = vi.fn();
    await enhanceGlitterSnippets(container as any, onSnippetClick);

    const event = snippet.keydown("Escape");

    expect(onSnippetClick).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not bind the same snippet twice", async () => {
    const snippet = new FakeSnippetElement("idea-1");
    const container = new FakeContainer([snippet]);

    const onSnippetClick = vi.fn();
    await enhanceGlitterSnippets(container as any, onSnippetClick);
    await enhanceGlitterSnippets(container as any, onSnippetClick);

    snippet.click();
    expect(onSnippetClick).toHaveBeenCalledTimes(1);
    expect(snippet.dataset.glitterBound).toBe("true");
  });

  it("marks deleted snippets invalid and disables already-bound interaction after reprocessing", async () => {
    const snippet = new FakeSnippetElement("idea-1");
    const container = new FakeContainer([snippet]);
    const onSnippetClick = vi.fn();
    let ideaStillExists = true;
    const resolveIdeaExists = vi.fn(async (ideaId: string) => ideaId === "idea-1" && ideaStillExists);

    await enhanceGlitterSnippets(container as any, onSnippetClick, resolveIdeaExists);
    snippet.click();
    expect(onSnippetClick).toHaveBeenCalledTimes(1);

    ideaStillExists = false;
    await enhanceGlitterSnippets(container as any, onSnippetClick, resolveIdeaExists);

    const keyEvent = snippet.keydown("Enter");
    snippet.click();

    expect(resolveIdeaExists).toHaveBeenCalledWith("idea-1");
    expect(snippet.dataset.glitterideaState).toBe("invalid");
    expect(snippet.attributes["aria-disabled"]).toBe("true");
    expect(snippet.tabIndex).toBe(-1);
    expect(onSnippetClick).toHaveBeenCalledTimes(1);
    expect(keyEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("extracts idea ids from glitter callout links and marks deleted callouts invalid", async () => {
    const snippet = new FakeCalloutElement("glitter://idea/idea-callout");
    const container = new FakeContainer([snippet]);
    const onSnippetClick = vi.fn();
    const resolveIdeaExists = vi.fn(async () => false);

    await enhanceGlitterSnippets(container as any, onSnippetClick, resolveIdeaExists);

    expect(resolveIdeaExists).toHaveBeenCalledWith("idea-callout");
    expect(snippet.dataset.glitterideaId).toBe("idea-callout");
    expect(snippet.dataset.glitterideaState).toBe("invalid");
    expect(snippet.attributes["aria-disabled"]).toBe("true");
    snippet.click();
    expect(onSnippetClick).not.toHaveBeenCalled();
  });

  it("replaces the invalid callout footer copy and restores it when the idea becomes valid again", async () => {
    const snippet = new FakeCalloutElement("glitter://idea/idea-callout", "✨ 来自 Glitter · 默认池");
    const container = new FakeContainer([snippet]);
    const onSnippetClick = vi.fn();
    let ideaStillExists = false;
    const resolveIdeaExists = vi.fn(async () => ideaStillExists);

    await enhanceGlitterSnippets(container as any, onSnippetClick, resolveIdeaExists);

    expect(snippet.footer.textContent).toBe("⚠ 来自 Glitter · 请重新搜索并替换该片段");
    expect(snippet.footer.dataset.glitterInvalidSource).toBe("true");
    expect(snippet.footer.dataset.glitterOriginalText).toBe("✨ 来自 Glitter · 默认池");

    ideaStillExists = true;
    await enhanceGlitterSnippets(container as any, onSnippetClick, resolveIdeaExists);

    expect(snippet.footer.textContent).toBe("✨ 来自 Glitter · 默认池");
    expect(snippet.footer.dataset.glitterInvalidSource).toBeUndefined();
    expect(snippet.footer.dataset.glitterOriginalText).toBeUndefined();
  });

  it("refreshes the callout footer pool label when the idea moves pools", async () => {
    const snippet = new FakeCalloutElement("glitter://idea/idea-callout", "✨ 来自 Glitter · 默认池");
    const container = new FakeContainer([snippet]);
    const onSnippetClick = vi.fn();
    let poolLabel = "默认池";
    const resolveIdeaExists = vi.fn(async () => true);
    const resolveIdeaPoolLabel = vi.fn(async () => poolLabel);

    await enhanceGlitterSnippets(container as any, onSnippetClick, resolveIdeaExists, resolveIdeaPoolLabel);
    expect(snippet.footer.textContent).toBe("✨ 来自 Glitter · 默认池");

    poolLabel = "设计";
    await enhanceGlitterSnippets(container as any, onSnippetClick, resolveIdeaExists, resolveIdeaPoolLabel);

    expect(snippet.footer.textContent).toBe("✨ 来自 Glitter · 设计");
  });
});
