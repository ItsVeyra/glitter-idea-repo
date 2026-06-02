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
 * 搜索页状态构造器。
 * 负责把搜索运行时结果或固定评审场景转换成搜索工作区可渲染的视图状态。
 */

import type { ReviewScenario } from "../../review/scenarios";
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
}): SearchViewState {
  const baseState: SearchViewStateBase = {
    query: {
      placeholder: "Search ideas, pools, tags",
      buttonLabel: "Search",
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
export function buildSearchViewState(scenario: ReviewScenario): SearchViewState {
  const baseState: SearchViewStateBase = {
    query: {
      placeholder: "Search ideas, pools, tags",
      buttonLabel: "Search"
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
