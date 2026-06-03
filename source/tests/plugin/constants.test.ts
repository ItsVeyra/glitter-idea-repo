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
