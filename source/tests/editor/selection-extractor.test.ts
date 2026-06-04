/**
 * 保护编辑器选区提取与上下文归档相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { extractSelectionPayload } from "../../src/editor/selection-extractor";

// 校验选区提取结果对正文、标题与上下文信息的收集边界。
describe("extractSelectionPayload", () => {
  it("normalizes selection by trimming and deriving text payload", () => {
    const payload = extractSelectionPayload("   Hello world   ");

    expect(payload).toEqual({
      title: "Hello world",
      body: "Hello world",
      contentType: "text"
    });
  });

  it("falls back to Untitled for empty selection", () => {
    const payload = extractSelectionPayload("    ");

    expect(payload).toEqual({
      title: "Untitled",
      body: "",
      contentType: "text"
    });
  });
});
