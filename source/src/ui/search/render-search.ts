/**
 * 搜索页渲染器。
 * 负责搜索工作区的基础结构、结果列表与批量操作区的 DOM 生成。
 */

import type { SearchViewActions } from "./search-actions";
import type { SearchViewState } from "./search-state";

// 搜索页基础 DOM 工具。
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

// 搜索页面结构渲染。
export function renderSearchView(
  containerEl: HTMLElement,
  state: SearchViewState,
  actions: SearchViewActions
): void {
  clearContainer(containerEl);

  const stage = createNode(containerEl, "section", "glitter-plugin-root glitter-search-stage");
  const header = createNode(stage, "header", "glitter-search-stage__header");
  createNode(header, "h2", undefined, "Search");
  createNode(header, "p", undefined, "Search, sort, and review ideas in a design-aligned surface.");

  const queryArea = createNode(stage, "div", "glitter-search-stage__query");
  const queryInput = createNode(queryArea, "input") as HTMLInputElement;
  queryInput.placeholder = state.query.placeholder;
  queryInput.value = state.query.value ?? "";

  const queryButton = createNode(queryArea, "button", undefined, state.query.buttonLabel);
  queryButton.addEventListener("click", () => actions.onQuerySubmit());

  const controls = createNode(stage, "div", "glitter-search-stage__controls");
  createNode(controls, "span", "glitter-search-stage__filter", state.controls.filterLabel);
  createNode(controls, "span", "glitter-search-stage__sort", state.controls.sortLabel);

  switch (state.mode) {
    case "loading": {
      const loading = createNode(stage, "div", "glitter-search-stage__loading");
      createNode(loading, "strong", undefined, state.loadingState.title);
      createNode(loading, "p", undefined, state.loadingState.description);
      return;
    }

    case "empty": {
      const empty = createNode(stage, "div", "glitter-search-stage__empty");
      createNode(empty, "strong", undefined, state.emptyState.title);
      createNode(empty, "p", undefined, state.emptyState.description);
      return;
    }

    case "batch": {
      const batch = createNode(stage, "div", "glitter-search-stage__batch");
      createNode(batch, "span", undefined, `${state.batchSummary.selectedCount} selected`);

      const batchActions = createNode(batch, "div", "glitter-search-stage__batch-actions");
      state.batchSummary.actions.forEach((action) => {
        const actionButton = createNode(batchActions, "button", undefined, action.label);
        actionButton.addEventListener("click", () => actions.onBatchAction(action.id));
      });
      break;
    }

    case "results":
      break;
  }

  const results = createNode(stage, "div", "glitter-search-stage__results");
  state.results.forEach((result) => {
    const rowClass = result.selected
      ? "glitter-search-stage__result-item glitter-search-stage__result-item--selected"
      : "glitter-search-stage__result-item";
    const rowButton = createNode(results, "button", rowClass);
    rowButton.dataset.resultId = result.id;
    rowButton.addEventListener("click", () => actions.onResultSelect(result.id));

    createNode(rowButton, "strong", undefined, result.title);
    createNode(rowButton, "span", undefined, result.meta);
  });
}
