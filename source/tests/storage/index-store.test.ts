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
 * 保护索引存储的读写与规范化相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { createIndexStore } from "../../src/storage/index-store";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createIndexStore", () => {
  it("builds normalized search text from idea fields", () => {
    const indexStore = createIndexStore();
    const text = indexStore.buildSearchText({
      title: "My Idea",
      body: "Body Text",
      sourceUrl: "HTTPS://EXAMPLE.COM",
      tags: ["TagOne", "TagTwo"]
    });

    expect(text).toBe("my idea body text tagone tagtwo https://example.com");
  });

  it("matches queries using trimmed lowercase includes", () => {
    const indexStore = createIndexStore();
    const searchText = "my idea body text tagone tagtwo https://example.com";

    expect(indexStore.matchesQuery(searchText, " IDEA ")).toBe(true);
    expect(indexStore.matchesQuery(searchText, "missing")).toBe(false);
  });

  it("returns true for empty or whitespace-only queries", () => {
    const indexStore = createIndexStore();
    const searchText = "my idea body text";

    expect(indexStore.matchesQuery(searchText, "")).toBe(true);
    expect(indexStore.matchesQuery(searchText, "   ")).toBe(true);
  });
});
