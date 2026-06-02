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
 * 保护链接导入结果的解析与字段兜底相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { parseLinkImportResult } from "../../../src/domain/link/link-parser";

// 校验链接解析结果在成功、缺省与异常输入下的字段产出。
describe("parseLinkImportResult", () => {
  it("prefers title and description fields from fetched metadata", () => {
    const result = parseLinkImportResult({
      url: "https://example.com",
      htmlTitle: "Example",
      openGraphTitle: "",
      description: "Example description"
    });

    expect(result.title).toBe("Example");
    expect(result.body).toContain("Example description");
  });
});
