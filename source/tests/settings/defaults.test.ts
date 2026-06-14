/**
 * 保护默认设置与配置归并规则相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergePluginSettings } from "../../src/settings/defaults";
import { DEFAULT_REVIEW_SCENARIO } from "../../src/review/scenarios";

// 校验默认配置的基线值。
describe("DEFAULT_SETTINGS", () => {
  it("starts with conservative plugin defaults", () => {
    const settingsWithRibbonFlag = DEFAULT_SETTINGS as typeof DEFAULT_SETTINGS & {
      showHomeRibbonIcon?: boolean;
    };

    expect(DEFAULT_SETTINGS.createMdFileByDefault).toBe(false);
    expect(DEFAULT_SETTINGS.hasCompletedFirstUse).toBe(false);
    expect(DEFAULT_SETTINGS.mediaStorageDirectory).toBe("Glitter");
    expect(DEFAULT_SETTINGS.fileStorageDirectory).toBe("Glitter");
    expect(DEFAULT_SETTINGS.roam).toEqual({
      boardStorageDirectory: "Glitter/灵感漫游",
      svgStorageDirectory: "Glitter/池导出"
    });
    expect(DEFAULT_SETTINGS.enableReducedMotion).toBe(false);
    expect(DEFAULT_SETTINGS.enableQuickCapture).toBe(true);
    expect(settingsWithRibbonFlag.showHomeRibbonIcon).toBe(true);
    expect(DEFAULT_SETTINGS.createdIdeaEmoji).toBe("✨");
    expect(DEFAULT_SETTINGS.referencedIdeaEmoji).toBe("🔖");
    expect(DEFAULT_SETTINGS.hotkeys.insertIdeaReference).toBe("Mod+Shift+I");
    expect(DEFAULT_SETTINGS.enableDesignReviewMode).toBe(false);
    expect(DEFAULT_SETTINGS.reviewScenario).toBe(DEFAULT_REVIEW_SCENARIO);
    expect(DEFAULT_SETTINGS.uiThemeMode).toBe("follow-obsidian");
    expect(DEFAULT_SETTINGS.homeFieldView).toBe("water");
    expect(DEFAULT_SETTINGS.interfaceLanguage).toBe("zh-CN");
    expect(DEFAULT_SETTINGS.ai).toEqual({
      enabled: false,
      quickCapturePolishEnabled: true,
      provider: "openai-compatible",
      baseUrl: "",
      model: "",
      apiKey: ""
    });
    expect(DEFAULT_SETTINGS.poolColors).toEqual({
      unsorted: "#6ab5ff",
      product: "#74ccba",
      research: "#ffa980",
      writing: "#ffd468",
      unnamed: "#b794ff"
    });
  });
});

// 校验持久化配置回读后的归并、规范化与兜底规则。
describe("mergePluginSettings", () => {
  it("merges loaded settings over defaults", () => {
    const merged = mergePluginSettings({
      enableReducedMotion: true,
      mediaStorageDirectory: "Assets/Glitter",
      fileStorageDirectory: "Notes/Glitter",
      roam: {
        boardStorageDirectory: "Boards/Glitter",
        svgStorageDirectory: "Exports/Roam"
      },
      hotkeys: {
        createFromSelection: "Mod+Shift+I"
      }
    });

    expect(merged.enableReducedMotion).toBe(true);
    expect(merged.enableQuickCapture).toBe(DEFAULT_SETTINGS.enableQuickCapture);
    expect(merged.mediaStorageDirectory).toBe("Assets/Glitter");
    expect(merged.fileStorageDirectory).toBe("Notes/Glitter");
    expect(merged.roam.boardStorageDirectory).toBe("Boards/Glitter");
    expect(merged.roam.svgStorageDirectory).toBe("Exports/Roam");
    expect(merged.hotkeys.createFromSelection).toBe("Mod+Shift+I");
    expect(merged.hotkeys.globalQuickCapture).toBe(DEFAULT_SETTINGS.hotkeys.globalQuickCapture);
  });

  it("restores create-from-selection when older saved settings disabled it", () => {
    const merged = mergePluginSettings({
      enableCreateFromSelection: false,
      hotkeys: {
        createFromSelection: "Mod+Shift+I"
      }
    });

    expect(merged.enableCreateFromSelection).toBe(true);
    expect(merged.hotkeys.createFromSelection).toBe("Mod+Shift+I");
  });

  it("keeps a full hotkeys object when loaded hotkeys are missing", () => {
    const merged = mergePluginSettings({ enableAmbientMotion: false });

    expect(merged.hotkeys).toEqual(DEFAULT_SETTINGS.hotkeys);
    expect(merged.hotkeys).not.toBe(DEFAULT_SETTINGS.hotkeys);
  });

  it("does not mutate DEFAULT_SETTINGS hotkeys when merged hotkeys are changed", () => {
    const originalDefaultHotkeys = { ...DEFAULT_SETTINGS.hotkeys };
    const merged = mergePluginSettings({});

    merged.hotkeys.createFromSelection = "Mod+Alt+I";

    expect(DEFAULT_SETTINGS.hotkeys).toEqual(originalDefaultHotkeys);
    expect(merged.hotkeys).not.toBe(DEFAULT_SETTINGS.hotkeys);
  });

  it("merges loaded pool colors over defaults", () => {
    const merged = mergePluginSettings({
      poolColors: {
        product: "#101010",
        writing: "#202020"
      }
    });

    expect(merged.poolColors).toEqual({
      ...DEFAULT_SETTINGS.poolColors,
      product: "#101010",
      writing: "#202020"
    });
  });

  it("merges loaded ai settings over defaults and trims text fields", () => {
    const merged = mergePluginSettings({
      ai: {
        enabled: true,
        quickCapturePolishEnabled: true,
        provider: "some-other-provider",
        baseUrl: " https://api.example.com/v1/ ",
        model: " gpt-4.1-mini ",
        apiKey: " sk-test-key "
      }
    } as unknown as Parameters<typeof mergePluginSettings>[0]);

    expect(merged.ai).toEqual({
      ...DEFAULT_SETTINGS.ai,
      enabled: true,
      quickCapturePolishEnabled: true,
      provider: "openai-compatible",
      baseUrl: "https://api.example.com/v1/",
      model: "gpt-4.1-mini",
      apiKey: "sk-test-key"
    });
  });

  it("falls back to default ai settings for invalid loaded values", () => {
    const merged = mergePluginSettings({
      ai: {
        enabled: "yes",
        quickCapturePolishEnabled: 1,
        provider: null,
        baseUrl: 123,
        model: false,
        apiKey: { secret: "sk-test-key" }
      }
    } as unknown as Parameters<typeof mergePluginSettings>[0]);

    expect(merged.ai).toEqual(DEFAULT_SETTINGS.ai);
  });

  it("does not mutate DEFAULT_SETTINGS pool colors when merged pool colors are changed", () => {
    const originalDefaultPoolColors = { ...DEFAULT_SETTINGS.poolColors };
    const merged = mergePluginSettings({});

    merged.poolColors.product = "#333333";

    expect(DEFAULT_SETTINGS.poolColors).toEqual(originalDefaultPoolColors);
    expect(merged.poolColors).not.toBe(DEFAULT_SETTINGS.poolColors);
  });

  it("normalizes an invalid review scenario to the default", () => {
    const merged = mergePluginSettings({
      reviewScenario: "not-a-real-scenario"
    });

    expect(merged.reviewScenario).toBe(DEFAULT_REVIEW_SCENARIO);
  });

  it("keeps a valid review scenario from loaded settings", () => {
    const merged = mergePluginSettings({
      reviewScenario: "search-batch"
    });

    expect(merged.reviewScenario).toBe("search-batch");
  });

  it("keeps a valid ui theme mode from loaded settings", () => {
    const merged = mergePluginSettings({
      uiThemeMode: "obsidian-light"
    });

    expect(merged.uiThemeMode).toBe("obsidian-light");
  });

  it("keeps the follow-obsidian ui theme mode from loaded settings", () => {
    const merged = mergePluginSettings({
      uiThemeMode: "follow-obsidian"
    });

    expect(merged.uiThemeMode).toBe("follow-obsidian");
  });

  it("keeps a valid spring-rain home field view from loaded settings", () => {
    const merged = mergePluginSettings({
      homeFieldView: "spring-rain"
    });

    expect(merged.homeFieldView).toBe("spring-rain");
  });

  it("keeps a valid water home field view from loaded settings", () => {
    const merged = mergePluginSettings({
      homeFieldView: "water"
    });

    expect(merged.homeFieldView).toBe("water");
  });

  it("normalizes an invalid home field view to water", () => {
    const merged = mergePluginSettings({
      homeFieldView: "mist"
    } as unknown as Parameters<typeof mergePluginSettings>[0]);

    expect(merged.homeFieldView).toBe("water");
  });

  it("keeps a valid Glitter interface language from loaded settings", () => {
    const merged = mergePluginSettings({ interfaceLanguage: "en" });

    expect(merged.interfaceLanguage).toBe("en");
  });

  it("normalizes an invalid Glitter interface language to zh-CN", () => {
    const merged = mergePluginSettings({ interfaceLanguage: "follow-obsidian" } as unknown as Parameters<
      typeof mergePluginSettings
    >[0]);

    expect(merged.interfaceLanguage).toBe("zh-CN");
  });

  it("defaults and preserves showHomeRibbonIcon", () => {
    const mergedDisabled = mergePluginSettings({
      showHomeRibbonIcon: false
    } as unknown as Parameters<typeof mergePluginSettings>[0]);
    const mergedDisabledWithRibbonFlag = mergedDisabled as typeof mergedDisabled & {
      showHomeRibbonIcon?: boolean;
    };
    const mergedMissingWithRibbonFlag = mergePluginSettings({}) as ReturnType<
      typeof mergePluginSettings
    > & {
      showHomeRibbonIcon?: boolean;
    };

    expect((DEFAULT_SETTINGS as typeof DEFAULT_SETTINGS & { showHomeRibbonIcon?: boolean }).showHomeRibbonIcon).toBe(
      true
    );
    expect(mergedDisabledWithRibbonFlag.showHomeRibbonIcon).toBe(false);
    expect(mergedMissingWithRibbonFlag.showHomeRibbonIcon).toBe(true);
  });

  it("defaults and preserves openMainViewOnNextLoad automation flag", () => {
    expect(DEFAULT_SETTINGS.openMainViewOnNextLoad).toBe(false);

    const mergedEnabled = mergePluginSettings({
      openMainViewOnNextLoad: true
    });
    expect(mergedEnabled.openMainViewOnNextLoad).toBe(true);

    const mergedMissing = mergePluginSettings({});
    expect(mergedMissing.openMainViewOnNextLoad).toBe(false);
  });

  it("defaults and preserves hasCompletedFirstUse flag", () => {
    expect(DEFAULT_SETTINGS.hasCompletedFirstUse).toBe(false);

    const mergedEnabled = mergePluginSettings({
      hasCompletedFirstUse: true
    });
    expect(mergedEnabled.hasCompletedFirstUse).toBe(true);

    const mergedMissing = mergePluginSettings({});
    expect(mergedMissing.hasCompletedFirstUse).toBe(false);
  });

  it("normalizes empty media, file, and roam board storage directories to default", () => {
    const merged = mergePluginSettings({
      mediaStorageDirectory: "   ",
      fileStorageDirectory: "   ",
      roam: {
        boardStorageDirectory: "   ",
        svgStorageDirectory: "   "
      }
    });

    expect(merged.mediaStorageDirectory).toBe(DEFAULT_SETTINGS.mediaStorageDirectory);
    expect(merged.fileStorageDirectory).toBe(DEFAULT_SETTINGS.fileStorageDirectory);
    expect(merged.roam.boardStorageDirectory).toBe(DEFAULT_SETTINGS.roam.boardStorageDirectory);
    expect(merged.roam.svgStorageDirectory).toBe(DEFAULT_SETTINGS.roam.svgStorageDirectory);
  });

  it("normalizes storage directory slashes to vault-relative canonical paths", () => {
    const merged = mergePluginSettings({
      mediaStorageDirectory: "\\Assets\\Glitter//images/",
      fileStorageDirectory: "//Notes//Glitter\\drafts\\",
      roam: {
        boardStorageDirectory: "//Boards//Glitter\\roam\\",
        svgStorageDirectory: "//Exports//Roam\\svg\\"
      }
    });

    expect(merged.mediaStorageDirectory).toBe("Assets/Glitter/images");
    expect(merged.fileStorageDirectory).toBe("Notes/Glitter/drafts");
    expect(merged.roam.boardStorageDirectory).toBe("Boards/Glitter/roam");
    expect(merged.roam.svgStorageDirectory).toBe("Exports/Roam/svg");
  });

  it("normalizes an invalid ui theme mode to follow-obsidian", () => {
    const merged = mergePluginSettings({
      uiThemeMode: "not-a-real-theme"
    });

    expect(merged.uiThemeMode).toBe("follow-obsidian");
  });

  it("ignores malformed pool color values and keeps defaults for those keys", () => {
    const merged = mergePluginSettings({
      poolColors: {
        product: 123 as unknown as string,
        research: "#abcdef",
        unnamed: null as unknown as string
      }
    });

    expect(merged.poolColors).toEqual({
      ...DEFAULT_SETTINGS.poolColors,
      research: "#abcdef"
    });
  });
});
