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
