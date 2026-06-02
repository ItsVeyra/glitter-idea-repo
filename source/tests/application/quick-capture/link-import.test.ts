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
 * 保护快速捕获链接导入流程的抓取与落库编排相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import { createQuickCaptureLinkImportService } from "../../../src/application/quick-capture/link-import";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createQuickCaptureLinkImportService", () => {
  it("imports from normalized url input", async () => {
    const importUrl = vi.fn(async (url: string) => ({
      title: "Example",
      body: "desc",
      sourceUrl: url
    }));

    const service = createQuickCaptureLinkImportService({ importUrl } as any);
    const result = await service.importFromInput("www.example.com/article");

    expect(importUrl).toHaveBeenCalledWith("https://www.example.com/article");
    expect(result).toEqual({
      title: "Example",
      body: "desc",
      sourceUrl: "https://www.example.com/article"
    });
  });

  it("throws when input does not contain url", async () => {
    const service = createQuickCaptureLinkImportService({
      importUrl: vi.fn(async () => ({ title: "", body: "", sourceUrl: "" }))
    } as any);

    await expect(service.importFromInput("这是一段普通文本")).rejects.toThrow("未检测到可导入的链接");
  });

  it("throws when extracted url is invalid", async () => {
    const service = createQuickCaptureLinkImportService({
      importUrl: vi.fn(async () => ({ title: "", body: "", sourceUrl: "" }))
    } as any);

    await expect(service.importFromInput("http://[]")).rejects.toThrow("链接格式无效");
  });

  it("imports only the first url when input contains multiple links", async () => {
    const importUrl = vi.fn(async (url: string) => ({
      title: "Example",
      body: "desc",
      sourceUrl: url
    }));

    const service = createQuickCaptureLinkImportService({ importUrl } as any);
    const result = await service.importFromInput("先看 https://example.com/article 再看 https://second.example.com");

    expect(importUrl).toHaveBeenCalledWith("https://example.com/article");
    expect(result.sourceUrl).toBe("https://example.com/article");
  });
});
