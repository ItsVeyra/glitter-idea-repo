/**
 * 保护Vault 文件存储的命名与内容生成相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("obsidian", () => ({
  normalizePath: (path: string) => path
}));

import { createVaultFileStore } from "../../src/storage/vault-file-store";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createVaultFileStore", () => {
  it("uses only the first non-empty title line for file path generation", async () => {
    const store = createVaultFileStore();

    await expect(store.createUniquePath("Glitter", "灵感标题\n这里是正文首行", ".md")).resolves.toBe(
      "Glitter/灵感标题.md"
    );
  });

  it("uses only the first non-empty title line for markdown heading", () => {
    const store = createVaultFileStore();

    expect(
      store.buildIdeaFileContent({
        title: "灵感标题\n这里是正文首行",
        body: "这里是正文首行\n这里是正文第二行",
        sourceUrl: undefined,
        attachmentPaths: []
      })
    ).toBe("# 灵感标题\n\n这里是正文首行\n这里是正文第二行");
  });
});
