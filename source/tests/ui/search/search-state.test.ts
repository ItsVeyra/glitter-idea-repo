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
 * 保护搜索页状态装配相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { buildSearchViewState } from "../../../src/ui/search/search-state";

// 覆盖状态装配函数在主要输入场景下的输出契约。
describe("buildSearchViewState", () => {
  it("builds results state with query, controls, and result rows", () => {
    const state = buildSearchViewState("search-results");

    expect(state.mode).toBe("results");
    expect(state.query.placeholder).toBe("Search ideas, pools, tags");
    expect(state.results).toHaveLength(3);
  });

  it("builds empty state with guidance copy", () => {
    const state = buildSearchViewState("search-empty");

    expect(state.mode).toBe("empty");
    if (state.mode !== "empty") {
      throw new Error(`Expected empty mode, got ${state.mode}`);
    }
    expect(state.emptyState.title).toBe("No matches yet");
    expect(state.emptyState.description).toBe("Try broader keywords or remove one filter.");
  });

  it("builds loading state with loading copy", () => {
    const state = buildSearchViewState("search-loading");

    expect(state.mode).toBe("loading");
    if (state.mode !== "loading") {
      throw new Error(`Expected loading mode, got ${state.mode}`);
    }
    expect(state.loadingState.title).toBe("Searching indexed ideas...");
    expect(state.loadingState.description).toBe("Loading deterministic review state.");
  });

  it("builds batch state with batch action summary", () => {
    const state = buildSearchViewState("search-batch");

    expect(state.mode).toBe("batch");
    if (state.mode !== "batch") {
      throw new Error(`Expected batch mode, got ${state.mode}`);
    }
    expect(state.batchSummary.selectedCount).toBe(8);
    expect(state.batchSummary.actions).toEqual([
      { id: "move", label: "Move to Pool" },
      { id: "tag", label: "Tag" },
      { id: "archive", label: "Archive" }
    ]);
  });

  it("throws for unsupported non-search scenarios", () => {
    expect(() => buildSearchViewState("home-empty")).toThrow(
      "buildSearchViewState does not support scenario: home-empty"
    );
  });
});
