/**
 * 搜索页状态构造器。
 * 负责把搜索运行时结果或固定评审场景转换成搜索工作区可渲染的视图状态。
 */

import { getInterfaceText } from "../../i18n/interface-language";
import type { ReviewScenario } from "../../review/scenarios";
import type { PluginInterfaceLanguage } from "../../settings/settings";
import { SEARCH_DEMO_RESULTS } from "./search-demo-data";

// 搜索页的视图模型定义。
interface SearchQueryState {
  placeholder: string;
  buttonLabel: string;
  value?: string;
}

interface SearchControlsState {
  filterLabel: string;
  sortLabel: string;
}

interface SearchResultRow {
  id: string;
  title: string;
  meta: string;
  selected?: boolean;
}

interface SearchEmptyState {
  title: string;
  description: string;
}

interface SearchLoadingState {
  title: string;
  description: string;
}

interface SearchBatchAction {
  id: string;
  label: string;
}

interface SearchBatchSummary {
  selectedCount: number;
  actions: SearchBatchAction[];
}

interface SearchViewStateBase {
  title: string;
  subtitle: string;
  query: SearchQueryState;
  controls: SearchControlsState;
  results: SearchResultRow[];
}

interface SearchResultsViewState extends SearchViewStateBase {
  mode: "results";
}

interface SearchEmptyViewState extends SearchViewStateBase {
  mode: "empty";
  emptyState: SearchEmptyState;
}

interface SearchLoadingViewState extends SearchViewStateBase {
  mode: "loading";
  loadingState: SearchLoadingState;
}

interface SearchBatchViewState extends SearchViewStateBase {
  mode: "batch";
  batchSummary: SearchBatchSummary;
}

export type SearchViewState =
  | SearchResultsViewState
  | SearchEmptyViewState
  | SearchLoadingViewState
  | SearchBatchViewState;

// 运行时搜索结果适配。
export function buildSearchViewStateFromRuntime(input: {
  query: string;
  results: Array<{ id: string; title: string; meta: string; selected?: boolean }>;
  selectedCount: number;
  interfaceLanguage?: PluginInterfaceLanguage;
}): SearchViewState {
  const text = getInterfaceText(input.interfaceLanguage);
  const baseState: SearchViewStateBase = {
    title: text.search.title,
    subtitle: text.search.subtitle,
    query: {
      placeholder: text.search.queryPlaceholder,
      buttonLabel: text.search.submitLabel,
      value: input.query
    },
    controls: {
      filterLabel: "Filter",
      sortLabel: "Sort"
    },
    results: input.results.map((result) => ({ ...result }))
  };

  if (input.results.length === 0) {
    return {
      mode: "empty",
      ...baseState,
      emptyState: {
        title: "No matches yet",
        description: "Try broader keywords or remove one filter."
      }
    };
  }

  if (input.selectedCount > 0) {
    return {
      mode: "batch",
      ...baseState,
      batchSummary: {
        selectedCount: input.selectedCount,
        actions: [{ id: "clear", label: "Clear selection" }]
      }
    };
  }

  return {
    mode: "results",
    ...baseState
  };
}

// 固定评审场景状态构造。
export function buildSearchViewState(scenario: ReviewScenario, options: { interfaceLanguage?: PluginInterfaceLanguage } = {}): SearchViewState {
  const text = getInterfaceText(options.interfaceLanguage);
  const baseState: SearchViewStateBase = {
    title: text.search.title,
    subtitle: text.search.subtitle,
    query: {
      placeholder: text.search.queryPlaceholder,
      buttonLabel: text.search.submitLabel
    },
    controls: {
      filterLabel: "Filter",
      sortLabel: "Sort"
    },
    results: SEARCH_DEMO_RESULTS.map((result) => ({ ...result }))
  };

  if (scenario === "search-results") {
    return {
      mode: "results",
      ...baseState
    };
  }

  if (scenario === "search-empty") {
    return {
      mode: "empty",
      ...baseState,
      emptyState: {
        title: "No matches yet",
        description: "Try broader keywords or remove one filter."
      }
    };
  }

  if (scenario === "search-loading") {
    return {
      mode: "loading",
      ...baseState,
      loadingState: {
        title: "Searching indexed ideas...",
        description: "Loading deterministic review state."
      }
    };
  }

  if (scenario === "search-batch") {
    return {
      mode: "batch",
      ...baseState,
      batchSummary: {
        selectedCount: 8,
        actions: [
          { id: "move", label: "Move to Pool" },
          { id: "tag", label: "Tag" },
          { id: "archive", label: "Archive" }
        ]
      }
    };
  }

  throw new Error(`buildSearchViewState does not support scenario: ${scenario}`);
}
