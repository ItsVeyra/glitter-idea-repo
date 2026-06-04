/**
 * 设置页渲染器。
 * 负责设置工作区分区、条目列表与文案信息的 DOM 结构生成。
 */

import type { SettingsViewState } from "./settings-state";

// 设置页基础 DOM 工具。
function clearContainer(containerEl: HTMLElement): void {
  const withEmpty = containerEl as HTMLElement & { empty?: () => void };
  if (typeof withEmpty.empty === "function") {
    withEmpty.empty();
    return;
  }

  containerEl.innerHTML = "";
}

function createNode(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
  const doc = (parent.ownerDocument ?? document) as Document;
  const node = doc.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  parent.appendChild(node);
  return node;
}

// 设置页面结构渲染。
export function renderSettingsView(containerEl: HTMLElement, state: SettingsViewState): void {
  clearContainer(containerEl);

  const stage = createNode(containerEl, "section", "glitter-plugin-root glitter-settings-stage");

  createNode(stage, "h2", "glitter-settings-stage__title", state.title);
  createNode(stage, "p", "glitter-settings-stage__subtitle", state.subtitle);

  const sections = createNode(stage, "div", "glitter-settings-stage__sections");

  state.sections.forEach((section) => {
    const sectionEl = createNode(sections, "section", "glitter-settings-stage__section");
    createNode(sectionEl, "h3", "glitter-settings-stage__section-title", section.title);
    createNode(sectionEl, "p", "glitter-settings-stage__section-description", section.description);

    const items = createNode(sectionEl, "div", "glitter-settings-stage__items");

    section.items.forEach((item) => {
      const row = createNode(items, "div", "glitter-settings-stage__item-row");
      createNode(row, "span", "glitter-settings-stage__item-label", item.label);
      createNode(row, "code", "glitter-settings-stage__item-value", item.value);
      createNode(row, "span", "glitter-settings-stage__item-hint", item.hint);
    });
  });
}
