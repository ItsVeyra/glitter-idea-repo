/**
 * 保护设置页渲染分支与交互相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { buildSettingsViewState } from "../../../src/ui/settings/settings-state";
import { renderSettingsView } from "../../../src/ui/settings/render-settings";

// 构造最小宿主替身，承接渲染层与事件层断言。
class FakeElement {
  public className = "";
  public children: FakeElement[] = [];
  public parent: FakeElement | null = null;

  private _textContent = "";

  constructor(public readonly tagName: string, public readonly ownerDocument: FakeDocument) {}

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
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

// 覆盖渲染单元在主要状态分支下的结构与交互契约。
describe("renderSettingsView", () => {
  it("renders root shell, title/subtitle, sections and item rows", () => {
    const container = createContainer();
    const state = buildSettingsViewState("settings-default");

    renderSettingsView(container, state);

    const stage = container.querySelector(".glitter-settings-stage") as
      | (HTMLElement & { className: string })
      | null;

    expect(stage).not.toBeNull();
    expect(stage?.className).toContain("glitter-plugin-root");
    expect(container.querySelector(".glitter-settings-stage__title")?.textContent).toContain("Settings");
    expect(container.querySelector(".glitter-settings-stage__subtitle")?.textContent).toContain(
      "Adjust motion, theme, and deterministic pool color mappings."
    );

    expect(container.querySelectorAll(".glitter-settings-stage__section")).toHaveLength(3);
    expect(container.querySelectorAll(".glitter-settings-stage__item-row")).toHaveLength(8);
    expect(container.querySelector(".glitter-settings-stage__item-value")?.textContent).toContain("Off");
  });

  it("clears previous content before rerendering", () => {
    const container = createContainer();

    renderSettingsView(container, buildSettingsViewState("settings-default"));
    expect(container.querySelectorAll(".glitter-settings-stage__item-row")).toHaveLength(8);

    renderSettingsView(container, buildSettingsViewState("settings-conflict"));
    expect(container.querySelectorAll(".glitter-settings-stage")).toHaveLength(1);
    expect(container.querySelector(".glitter-settings-stage__subtitle")?.textContent).toContain(
      "Conflict diagnostics"
    );
    expect(container.querySelectorAll(".glitter-settings-stage__item-row")).toHaveLength(8);
  });
});
