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
 * 保护插件常量约定相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { MAIN_VIEW_TYPE, SEARCH_VIEW_TYPE } from "../../src/plugin/constants";

// 校验跨模块共享常量的稳定值与命名约定。
describe("plugin constants", () => {
  it("exposes stable view IDs", () => {
    expect(MAIN_VIEW_TYPE).toBe("glitter-idea-main-view");
    expect(SEARCH_VIEW_TYPE).toBe("glitter-idea-search-view");
  });
});
