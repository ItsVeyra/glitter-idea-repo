import { describe, expect, it } from "vitest";
import { getInterfaceText, normalizeInterfaceLanguage } from "../../src/i18n/interface-language";

describe("interface language", () => {
  it("normalizes supported interface languages and falls back to zh-CN", () => {
    expect(normalizeInterfaceLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizeInterfaceLanguage("en")).toBe("en");
    expect(normalizeInterfaceLanguage("follow-obsidian")).toBe("zh-CN");
    expect(normalizeInterfaceLanguage(undefined)).toBe("zh-CN");
  });

  it("returns Chinese home and roam export text by default", () => {
    const text = getInterfaceText("zh-CN");

    expect(text.home.searchPlaceholder).toBe("搜索灵感、片段或池");
    expect(text.home.editPool).toBe("编辑池");
    expect(text.home.deletePool).toBe("删除池");
    expect(text.home.enterPool).toBe("进入池");
    expect(text.roamExport.emptyTitle).toBe("暂无可导出的白板节点");
    expect(text.roamExport.missingStatus).toBe("缺失");
  });

  it("returns English home, pool, write, and roam export text", () => {
    const text = getInterfaceText("en");

    expect(text.home.searchPlaceholder).toBe("Search ideas, snippets, or pools");
    expect(text.home.emptySearchFeedback).toBe("No matching content found");
    expect(text.home.editPool).toBe("Edit");
    expect(text.home.deletePool).toBe("Delete");
    expect(text.home.enterPool).toBe("Enter");
    expect(text.home.deletePoolConfirm("Product")).toBe("Delete \"Product\"? Ideas in this pool will move to the default pool.");
    expect(text.pool.markdownPreviewPanelTitle("Product")).toBe("Product Markdown file");
    expect(text.pool.markdownPreviewSaveLabel).toBe("Save Markdown file");
    expect(text.pool.filteredSearchPlaceholder).toBe("Search filtered ideas");
    expect(text.write.aiPolishErrors.unauthorized).toBe("AI authorization failed. Check your API key and try again.");
    expect(text.write.mediaAlreadyLink).toBe("This idea is already a link. Create a new idea to record images.");
    expect(text.write.appendSecondLinkConfirm).toBe("A second link will not be imported automatically. Add it to this idea?");
    expect(text.roamExport.emptyTitle).toBe("No board nodes to export");
    expect(text.roamExport.missingStatus).toBe("Missing");
  });
});
