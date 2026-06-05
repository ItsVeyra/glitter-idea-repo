/**
 * 保护设置页 Tab 的渲染与交互桥接相关行为，避免后续重构时出现静默回退。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AsyncOrSync<T> = T | Promise<T>;

type HeaderButtonRecord = {
  text: string;
  onClick?: () => AsyncOrSync<void>;
};

type DetailRecord = {
  summary: string;
  open: boolean;
};

type SettingRecord = {
  name: string;
  isHeading?: boolean;
  classes?: string[];
  sectionTitle?: string;
  group?: "common" | "advanced";
  desc?: string;
  buttonText?: string;
  buttonOnClick?: () => AsyncOrSync<void>;
  toggleValue?: boolean;
  toggleOnChange?: (value: boolean) => AsyncOrSync<void>;
  textPlaceholder?: string;
  textValue?: string;
  textOnChange?: (value: string) => AsyncOrSync<void>;
  textOnBlur?: () => AsyncOrSync<void>;
  dropdownOptions: Array<{ value: string; label: string }>;
  dropdownValue?: string;
  dropdownOnChange?: (value: string) => AsyncOrSync<void>;
};
type ElementRecord = {
  tag: string;
  text: string;
  cls?: string;
  href?: string;
};
type MockElementAttrs = {
  text?: string;
  cls?: string;
  href?: string;
};

type MockElement = {
  tag: string;
  text: string;
  open?: boolean;
  sectionTitle?: string;
  settingGroup?: "common" | "advanced";
  empty: () => void;
  createEl: (tag: string, attrs?: MockElementAttrs) => MockElement;
  createDiv: (attrs?: MockElementAttrs | string) => MockElement;
  addEventListener: (event: string, handler: () => AsyncOrSync<void>) => void;
};
// 直接载入真实样式文本，确保结构断言与当前界面契约保持一致。
const stylesCss = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

// 预先收口可重置的依赖替身，方便验证对外协作。
const obsidianMockState = vi.hoisted(() => ({
  language: "zh-CN",
  headings: [] as string[],
  paragraphs: [] as string[],
  settings: [] as SettingRecord[],
  headerButtons: [] as HeaderButtonRecord[],
  details: [] as DetailRecord[],
  elements: [] as ElementRecord[]
}));

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
function resetObsidianMockState(): void {
  obsidianMockState.headings.length = 0;
  obsidianMockState.paragraphs.length = 0;
  obsidianMockState.settings.length = 0;
  obsidianMockState.headerButtons.length = 0;
  obsidianMockState.details.length = 0;
  obsidianMockState.elements.length = 0;
}

function createMockElement(
  tag: string,
  attrs?: MockElementAttrs,
  activeDetailRecord?: DetailRecord,
  context: Pick<MockElement, "sectionTitle" | "settingGroup"> = {}
): MockElement {
  const text = attrs?.text ?? "";

  obsidianMockState.elements.push({
    tag,
    text,
    cls: attrs?.cls,
    href: attrs?.href
  });

  if (tag === "h1" || tag === "h2" || tag === "h3") {
    obsidianMockState.headings.push(text);
  }

  if (tag === "p") {
    obsidianMockState.paragraphs.push(text);
  }

  let detailRecord = activeDetailRecord;
  if (tag === "details") {
    detailRecord = {
      summary: "",
      open: false
    };
    obsidianMockState.details.push(detailRecord);
  }

  let buttonRecordIndex: number | undefined;
  if (tag === "button") {
    buttonRecordIndex = obsidianMockState.headerButtons.push({ text }) - 1;
  }

  const element: MockElement = {
    tag,
    text,
    sectionTitle: context.sectionTitle,
    settingGroup: context.settingGroup,
    empty: resetObsidianMockState,
    createEl: (childTag: string, childAttrs?: MockElementAttrs) => {
      if (childTag === "summary" && detailRecord) {
        detailRecord.summary = childAttrs?.text ?? "";
      }

      if (childTag === "h3") {
        element.sectionTitle = childAttrs?.text;
      }

      const childContext =
        childTag === "details"
          ? { sectionTitle: element.sectionTitle }
          : {
              sectionTitle: element.sectionTitle,
              settingGroup: element.settingGroup
            };

      return createMockElement(childTag, childAttrs, detailRecord, childContext);
    },
    createDiv: (childAttrs?: MockElementAttrs | string) => {
      const normalizedAttrs = typeof childAttrs === "string" ? undefined : childAttrs;
      const childContext =
        tag === "details"
          ? {
              sectionTitle: element.sectionTitle,
              settingGroup: "advanced" as const
            }
          : element.sectionTitle && !element.settingGroup
            ? {
                sectionTitle: element.sectionTitle,
                settingGroup: "common" as const
              }
            : {
                sectionTitle: element.sectionTitle,
                settingGroup: element.settingGroup
              };

      return createMockElement("div", normalizedAttrs, detailRecord, childContext);
    },
    addEventListener: (event: string, handler: () => AsyncOrSync<void>) => {
      if (tag === "button" && event === "click" && buttonRecordIndex !== undefined) {
        obsidianMockState.headerButtons[buttonRecordIndex].onClick = handler;
      }
    }
  };

  if (tag === "details" && detailRecord) {
    Object.defineProperty(element, "open", {
      get: () => detailRecord.open,
      set: (value: boolean) => {
        detailRecord.open = value;
      },
      enumerable: true,
      configurable: true
    });
  }

  return element;
}

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("obsidian", () => {
  class App {}

  class PluginSettingTab {
    containerEl: MockElement;

    constructor(_app: unknown, _plugin: unknown) {
      this.containerEl = createMockElement("div");
    }
  }

  class Setting {
    private readonly container: MockElement;
    private readonly record: SettingRecord;
    readonly descEl: MockElement;

    constructor(containerEl: unknown) {
      this.container = containerEl as MockElement;
      this.record = {
        name: "",
        classes: [],
        sectionTitle: this.container.sectionTitle,
        group: this.container.settingGroup,
        dropdownOptions: []
      };
      this.descEl = createMockElement("div", undefined, undefined, {
        sectionTitle: this.container.sectionTitle,
        settingGroup: this.container.settingGroup
      });
      obsidianMockState.settings.push(this.record);
    }

    setName(name: string): this {
      this.record.name = name;
      return this;
    }

    setDesc(desc: string): this {
      this.record.desc = desc;
      return this;
    }

    setClass(className: string): this {
      this.record.classes?.push(className);
      return this;
    }

    setHeading(): this {
      this.record.isHeading = true;
      this.container.sectionTitle = this.record.name;
      return this;
    }

    addButton(
      callback: (button: {
        setButtonText: (text: string) => { onClick: (fn: () => AsyncOrSync<void>) => unknown };
        onClick: (fn: () => AsyncOrSync<void>) => unknown;
      }) => unknown
    ): this {
      const button = {
        setButtonText: (text: string) => {
          this.record.buttonText = text;
          return button;
        },
        onClick: (fn: () => AsyncOrSync<void>) => {
          this.record.buttonOnClick = fn;
          return undefined;
        }
      };
      callback(button);
      return this;
    }

    addToggle(
      callback: (toggle: {
        setValue: (value: boolean) => {
          onChange: (fn: (value: boolean) => AsyncOrSync<void>) => unknown;
        };
        onChange: (fn: (value: boolean) => AsyncOrSync<void>) => unknown;
      }) => unknown
    ): this {
      const toggle = {
        setValue: (value: boolean) => {
          this.record.toggleValue = value;
          return toggle;
        },
        onChange: (fn: (nextValue: boolean) => AsyncOrSync<void>) => {
          this.record.toggleOnChange = fn;
          return undefined;
        }
      };
      callback(toggle);
      return this;
    }

    addText(
      callback: (text: {
        inputEl: {
          addEventListener: (event: string, handler: () => AsyncOrSync<void>) => unknown;
        };
        setPlaceholder: (value: string) => {
          setValue: (value: string) => {
            onChange: (fn: (value: string) => AsyncOrSync<void>) => unknown;
          };
          onChange: (fn: (value: string) => AsyncOrSync<void>) => unknown;
        };
        setValue: (value: string) => {
          setPlaceholder: (value: string) => {
            onChange: (fn: (value: string) => AsyncOrSync<void>) => unknown;
          };
          onChange: (fn: (value: string) => AsyncOrSync<void>) => unknown;
        };
        onChange: (fn: (value: string) => AsyncOrSync<void>) => unknown;
      }) => unknown
    ): this {
      const text = {
        inputEl: {
          addEventListener: (event: string, handler: () => AsyncOrSync<void>) => {
            if (event === "blur") {
              this.record.textOnBlur = handler;
            }
            return undefined;
          }
        },
        setPlaceholder: (value: string) => {
          this.record.textPlaceholder = value;
          return text;
        },
        setValue: (nextValue: string) => {
          this.record.textValue = nextValue;
          return text;
        },
        onChange: (fn: (value: string) => AsyncOrSync<void>) => {
          this.record.textOnChange = fn;
          return undefined;
        }
      };
      callback(text);
      return this;
    }

    addDropdown(
      callback: (dropdown: {
        addOption: (value: string, label: string) => unknown;
        setValue: (value: string) => { onChange: (fn: (value: string) => AsyncOrSync<void>) => unknown };
        onChange: (fn: (value: string) => AsyncOrSync<void>) => unknown;
      }) => unknown
    ): this {
      const dropdown = {
        addOption: (value: string, label: string) => {
          this.record.dropdownOptions.push({ value, label });
          return undefined;
        },
        setValue: (value: string) => {
          this.record.dropdownValue = value;
          return dropdown;
        },
        onChange: (fn: (nextValue: string) => AsyncOrSync<void>) => {
          this.record.dropdownOnChange = fn;
          return undefined;
        }
      };
      callback(dropdown);
      return this;
    }
  }

  return {
    App,
    PluginSettingTab,
    Setting,
    getLanguage: () => obsidianMockState.language
  };
});

import GlitterSettingTab from "../../src/settings/settings-tab";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

// 覆盖视图宿主在生命周期、渲染与回调桥接上的核心契约。
describe("GlitterSettingTab", () => {
  beforeEach(() => {
    obsidianMockState.language = "zh-CN";
    resetObsidianMockState();
  });

  it("returns both common and advanced insertion containers only when a section has advanced content", () => {
    const plugin = {
      settings: DEFAULT_SETTINGS,
      activateMainView: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    const withAdvanced = (tab as any).renderSection((tab as any).containerEl, "Section title", "Section description", "Advanced");

    expect(withAdvanced).toHaveProperty("commonContentEl");
    expect(withAdvanced).toHaveProperty("advancedContentEl");
    expect(withAdvanced.commonContentEl).not.toBe(withAdvanced.advancedContentEl);
    expect(obsidianMockState.details).toEqual([
      {
        summary: "Advanced",
        open: false
      }
    ]);

    resetObsidianMockState();
    const withoutAdvanced = (tab as any).renderSection((tab as any).containerEl, "Section title", "Section description");
    expect(withoutAdvanced.advancedContentEl).toBeNull();
    expect(obsidianMockState.details).toEqual([]);
  });

  it("renders each section intro as a native setting heading row instead of custom title blocks", () => {
    const plugin = {
      settings: DEFAULT_SETTINGS,
      activateMainView: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    (tab as any).renderSection((tab as any).containerEl, "Section title", "Section description", "Advanced");

    expect(obsidianMockState.settings[0]).toMatchObject({
      name: "Section title",
      desc: "Section description",
      isHeading: true
    });
    expect(obsidianMockState.elements.some((element) => element.tag === "h3" && element.text === "Section title")).toBe(false);
    expect(obsidianMockState.elements.some((element) => element.tag === "p" && element.text === "Section description")).toBe(false);
  });

  it("renders the redesigned settings sections in the approved order without a duplicate header action", () => {
    obsidianMockState.language = "en";

    const plugin = {
      settings: DEFAULT_SETTINGS,
      activateMainView: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const headingSettings = obsidianMockState.settings.filter((setting) => setting.isHeading);

    expect(headingSettings[0]).toMatchObject({
      name: "Glitter Settings",
      classes: ["glitter-settings-tab__page-title"]
    });
    expect(headingSettings.slice(1).map((setting) => setting.name)).toEqual([
      "Workspace & Entry",
      "Quick Capture",
      "AI & Quick Capture Polish",
      "Snippets & Selection",
      "Pools & Organizing",
      "Roam Mode",
      "Files & Media",
      "Appearance & Experience",
      "About Glitter"
    ]);

    expect(obsidianMockState.headerButtons).toHaveLength(0);
    expect(obsidianMockState.details).toHaveLength(4);
    expect(obsidianMockState.details.map((detail) => detail.summary)).toEqual([
      "Advanced",
      "Advanced",
      "Advanced",
      "Advanced"
    ]);
    expect(obsidianMockState.details.every((detail) => detail.open === false)).toBe(true);
  });

  it("uses native setting heading rows, a larger page title, and dividers between groups", () => {
    const plugin = {
      settings: DEFAULT_SETTINGS,
      activateMainView: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const headingSettings = obsidianMockState.settings.filter((setting) => setting.isHeading);
    const pageTitleSetting = headingSettings.find((setting) =>
      setting.classes?.includes("glitter-settings-tab__page-title")
    );

    expect(obsidianMockState.elements.filter((element) => element.cls === "glitter-settings-tab__header")).toHaveLength(1);
    expect(pageTitleSetting).toMatchObject({
      name: "Glitter 设置",
      isHeading: true
    });
    expect(obsidianMockState.elements.filter((element) => element.cls === "glitter-settings-tab__page-subtitle")).toHaveLength(0);
    expect(obsidianMockState.elements.filter((element) => element.cls === "glitter-settings-tab__section")).toHaveLength(9);
    expect(headingSettings).toHaveLength(10);
    expect(obsidianMockState.elements.some((element) => element.tag === "h2")).toBe(false);
    expect(obsidianMockState.elements.some((element) => element.tag === "h3")).toBe(false);
    expect(stylesCss).toContain(".glitter-settings-tab__header,");
    expect(stylesCss).toContain(".glitter-settings-tab__section {");
    expect(stylesCss).toContain("padding-left: 0;");
    expect(stylesCss).toContain("padding-right: 0;");
    expect(stylesCss).not.toContain(".glitter-settings-tab__page-title,");
    expect(stylesCss).not.toContain(".glitter-settings-tab__page-subtitle {");
    expect(stylesCss).not.toContain(".glitter-settings-tab__section-title {");
    expect(stylesCss).not.toContain(".glitter-settings-tab__section-description {");
    expect(stylesCss).toContain(".glitter-settings-tab__section > .setting-item-heading {");
    expect(stylesCss).not.toContain("margin-left: 28px;");
    expect(stylesCss).toContain(".vertical-tab-content .glitter-settings-tab__page-title {");
    expect(stylesCss).toContain("font-size: 2em;");
    expect(stylesCss).not.toContain("font-size: calc(var(--h1-size) * 1.5);");
    expect(stylesCss).toContain("line-height: var(--h1-line-height);");
    expect(stylesCss).toContain("font-weight: var(--h1-weight);");
    expect(stylesCss).toContain("margin-left: 0;");
    expect(stylesCss).toContain("text-align: left;");
    expect(stylesCss).toContain(".glitter-settings-tab__section .setting-item {");
    expect(stylesCss).toContain("margin-left: 0;");
    expect(stylesCss).toContain("margin-right: 0;");
    expect(stylesCss).toContain(".glitter-settings-tab__advanced-summary {");
    expect(stylesCss).toContain("display: flex;");
    expect(stylesCss).toContain(".glitter-settings-tab__advanced-summary::-webkit-details-marker {");
    expect(stylesCss).toContain(".glitter-settings-tab__advanced-summary::before {");
    expect(stylesCss).toContain(".glitter-settings-tab__advanced-details[open] > .glitter-settings-tab__advanced-summary::before {");
    expect(stylesCss).toContain(".glitter-settings-tab__section + .glitter-settings-tab__section {");
    expect(stylesCss).toContain("margin-top: 32px;");
    expect(stylesCss).toContain("padding-top: 24px;");
    expect(stylesCss).toContain("border-top: 1px solid var(--background-modifier-border);");
  });

  it("renders Task 4 controls for the first three sections and syncs home ribbon changes immediately", async () => {
    obsidianMockState.language = "en";

    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        hotkeys: {
          ...DEFAULT_SETTINGS.hotkeys,
          globalQuickCapture: null
        }
      },
      activateMainView: vi.fn(async () => undefined),
      savePluginSettings: vi.fn(async () => undefined),
      syncHomeRibbonIcon: vi.fn()
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const getSetting = (name: string) => obsidianMockState.settings.find((setting) => setting.name === name);

    const showHomeSetting = getSetting("Show Glitter home entry in the left ribbon");
    expect(showHomeSetting).toMatchObject({
      sectionTitle: "Workspace & Entry",
      group: "common",
      toggleValue: true
    });
    expect(showHomeSetting?.desc).toContain("Immediate effect");

    const openHomeSetting = getSetting("Open Glitter home");
    expect(openHomeSetting).toMatchObject({
      sectionTitle: "Workspace & Entry",
      group: "common",
      buttonText: "Open Glitter home"
    });
    await openHomeSetting?.buttonOnClick?.();
    expect(plugin.activateMainView).toHaveBeenCalledTimes(1);

    expect(getSetting("Enable quick capture")).toMatchObject({
      sectionTitle: "Quick Capture",
      group: "common",
      toggleValue: true
    });

    const quickCaptureHotkeySetting = getSetting("Quick capture global hotkey");
    expect(quickCaptureHotkeySetting).toMatchObject({
      sectionTitle: "Quick Capture",
      group: "common",
      textPlaceholder: DEFAULT_SETTINGS.hotkeys.globalQuickCapture,
      textValue: ""
    });
    expect(quickCaptureHotkeySetting?.desc).toContain("Reload plugin to apply");

    const enableSnippetInsertionSetting = getSetting("Enable snippet insertion");
    expect(enableSnippetInsertionSetting).toMatchObject({
      sectionTitle: "Snippets & Selection",
      group: "common",
      toggleValue: true
    });
    expect(enableSnippetInsertionSetting?.desc).toContain("Reload plugin to apply");

    const insertSnippetHotkeySetting = getSetting("Insert Glitter snippet hotkey");
    expect(insertSnippetHotkeySetting).toMatchObject({
      sectionTitle: "Snippets & Selection",
      group: "common"
    });
    expect(insertSnippetHotkeySetting?.desc).toContain("Reload plugin to apply");

    const enableCreateFromSelectionSetting = getSetting("Enable create from selection");
    expect(enableCreateFromSelectionSetting).toMatchObject({
      sectionTitle: "Snippets & Selection",
      group: "common",
      toggleValue: true
    });
    expect(enableCreateFromSelectionSetting?.desc).toContain("Reload plugin to apply");

    const createFromSelectionHotkeySetting = getSetting("Create from selection hotkey");
    expect(createFromSelectionHotkeySetting).toMatchObject({
      sectionTitle: "Snippets & Selection",
      group: "common"
    });
    expect(createFromSelectionHotkeySetting?.desc).toContain("Reload plugin to apply");

    expect(getSetting("Snippet inserted-state marker")).toBeUndefined();

    const createdIdeaEmojiSetting = getSetting("File-created marker");
    expect(createdIdeaEmojiSetting).toMatchObject({
      sectionTitle: "Snippets & Selection",
      group: "advanced"
    });
    expect(createdIdeaEmojiSetting?.desc).toContain("Applies to newly created content immediately");

    expect(
      obsidianMockState.settings.some((setting) => /search entry|pool entry|global status/i.test(setting.name))
    ).toBe(false);

    await showHomeSetting?.toggleOnChange?.(false);
    expect(plugin.settings.showHomeRibbonIcon).toBe(false);
    expect(plugin.syncHomeRibbonIcon).toHaveBeenCalledTimes(1);
    expect(plugin.savePluginSettings).toHaveBeenCalledTimes(1);
    expect(plugin.syncHomeRibbonIcon.mock.invocationCallOrder[0]).toBeLessThan(
      plugin.savePluginSettings.mock.invocationCallOrder[0]
    );
  });

  it("reopens first-use onboarding from Glitter home without changing current usage state", async () => {
    obsidianMockState.language = "en";

    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        hasCompletedFirstUse: true
      },
      activateMainView: vi.fn(async () => undefined),
      reopenFirstUseOnHome: vi.fn(async () => undefined),
      savePluginSettings: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const resetOnboardingSetting = obsidianMockState.settings.find(
      (setting) => setting.name === "Reset first-use onboarding"
    );
    expect(resetOnboardingSetting).toMatchObject({
      sectionTitle: "Workspace & Entry",
      group: "advanced",
      buttonText: "Reset first-use onboarding"
    });

    await resetOnboardingSetting?.buttonOnClick?.();

    expect(plugin.settings.hasCompletedFirstUse).toBe(true);
    expect(plugin.reopenFirstUseOnHome).toHaveBeenCalledTimes(1);
    expect(plugin.savePluginSettings).not.toHaveBeenCalled();
    expect(plugin.activateMainView).not.toHaveBeenCalled();
  });

  it("renders the AI section after Quick Capture and trims base URL and model via plugin settings persistence", async () => {
    obsidianMockState.language = "en";

    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        ai: {
          ...DEFAULT_SETTINGS.ai,
          enabled: true,
          quickCapturePolishEnabled: false,
          baseUrl: "",
          model: "",
          apiKey: ""
        }
      },
      activateMainView: vi.fn(async () => undefined),
      savePluginSettings: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const getSetting = (name: string) => obsidianMockState.settings.find((setting) => setting.name === name);
    const sectionHeadingNames = obsidianMockState.settings
      .filter((setting) => setting.isHeading)
      .map((setting) => setting.name)
      .slice(1);

    expect(sectionHeadingNames).toEqual(
      expect.arrayContaining(["Quick Capture", "AI & Quick Capture Polish", "Snippets & Selection"])
    );
    expect(sectionHeadingNames.slice(1, 4)).toEqual(["Quick Capture", "AI & Quick Capture Polish", "Snippets & Selection"]);

    const enableAiSetting = getSetting("Enable AI");
    expect(enableAiSetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      toggleValue: true
    });

    const enableQuickCaptureAiPolishSetting = getSetting("Enable quick capture AI polish");
    expect(enableQuickCaptureAiPolishSetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      toggleValue: false
    });

    const baseUrlSetting = getSetting("Base URL");
    expect(baseUrlSetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      textPlaceholder: "Enter an OpenAI-compatible base URL",
      textValue: ""
    });

    const modelSetting = getSetting("Model");
    expect(modelSetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      textPlaceholder: "Enter a model name",
      textValue: ""
    });

    const apiKeySetting = getSetting("API key");
    expect(apiKeySetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      textPlaceholder: "Enter an API key",
      textValue: ""
    });

    await enableAiSetting?.toggleOnChange?.(false);
    await enableQuickCaptureAiPolishSetting?.toggleOnChange?.(true);
    await baseUrlSetting?.textOnChange?.("  https://api.example.com/v1  ");
    await modelSetting?.textOnChange?.("  gpt-4.1-mini  ");

    expect(plugin.settings.ai).toMatchObject({
      enabled: false,
      quickCapturePolishEnabled: true,
      baseUrl: "https://api.example.com/v1",
      model: "gpt-4.1-mini",
      apiKey: ""
    });
    expect(plugin.savePluginSettings).toHaveBeenCalledTimes(4);
  });

  it("keeps the API key input visible while typing and only hides it after blur saves the key", async () => {
    obsidianMockState.language = "en";

    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        ai: {
          ...DEFAULT_SETTINGS.ai,
          apiKey: ""
        }
      },
      activateMainView: vi.fn(async () => undefined),
      savePluginSettings: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const getSetting = (name: string) => obsidianMockState.settings.find((setting) => setting.name === name);

    const apiKeySetting = getSetting("API key");
    expect(apiKeySetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      textPlaceholder: "Enter an API key",
      textValue: ""
    });

    await apiKeySetting?.textOnChange?.("n");
    expect(apiKeySetting?.textOnBlur).toBeDefined();
    expect(plugin.settings.ai.apiKey).toBe("");
    expect(plugin.savePluginSettings).not.toHaveBeenCalled();
    expect(getSetting("API key")).toBe(apiKeySetting);

    await apiKeySetting?.textOnChange?.("new-secret-key");
    await apiKeySetting?.textOnBlur?.();

    expect(plugin.settings.ai.apiKey).toBe("new-secret-key");
    expect(plugin.savePluginSettings).toHaveBeenCalledTimes(1);

    const hiddenApiKeySetting = getSetting("API key");
    expect(hiddenApiKeySetting?.textValue).toBeUndefined();
    expect(hiddenApiKeySetting?.textPlaceholder).toBeUndefined();
    expect(hiddenApiKeySetting?.desc).toContain("hidden");
    expect(hiddenApiKeySetting?.desc).not.toContain("new-secret-key");
  });

  it("uses locale-resolved configured API key copy for unsupported app languages", async () => {
    obsidianMockState.language = "ja";

    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        ai: {
          ...DEFAULT_SETTINGS.ai,
          apiKey: "existing-secret-key"
        }
      },
      activateMainView: vi.fn(async () => undefined),
      savePluginSettings: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const apiKeySetting = obsidianMockState.settings.find((setting) => setting.name === "API Key");
    expect(apiKeySetting?.desc).toContain("当前已配置，内容已隐藏。");
    expect(apiKeySetting?.desc).not.toContain("Configured and hidden.");
  });

  it("hides saved API keys and supports replace and clear flows without revealing the stored value", async () => {
    obsidianMockState.language = "en";

    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        ai: {
          ...DEFAULT_SETTINGS.ai,
          apiKey: "existing-secret-key"
        }
      },
      activateMainView: vi.fn(async () => undefined),
      savePluginSettings: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const getSetting = (name: string) => obsidianMockState.settings.find((setting) => setting.name === name);

    const apiKeySetting = getSetting("API key");
    expect(apiKeySetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common"
    });
    expect(apiKeySetting?.textValue).toBeUndefined();
    expect(apiKeySetting?.textPlaceholder).toBeUndefined();
    expect(apiKeySetting?.desc).toContain("hidden");
    expect(apiKeySetting?.desc).not.toContain("existing-secret-key");

    const replaceApiKeySetting = getSetting("Replace API key");
    expect(replaceApiKeySetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      buttonText: "Replace API key"
    });

    const clearApiKeySetting = getSetting("Clear API key");
    expect(clearApiKeySetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      buttonText: "Clear API key"
    });

    await replaceApiKeySetting?.buttonOnClick?.();
    expect(plugin.savePluginSettings).not.toHaveBeenCalled();

    const replacementInputSetting = getSetting("API key");
    expect(replacementInputSetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      textPlaceholder: "Enter an API key",
      textValue: ""
    });

    await replacementInputSetting?.textOnChange?.("r");
    expect(replacementInputSetting?.textOnBlur).toBeDefined();
    expect(plugin.settings.ai.apiKey).toBe("existing-secret-key");
    expect(plugin.savePluginSettings).not.toHaveBeenCalled();
    expect(getSetting("API key")).toBe(replacementInputSetting);

    await replacementInputSetting?.textOnChange?.("replacement-secret-key");
    await replacementInputSetting?.textOnBlur?.();
    expect(plugin.settings.ai.apiKey).toBe("replacement-secret-key");
    expect(plugin.savePluginSettings).toHaveBeenCalledTimes(1);

    const hiddenReplacementSetting = getSetting("API key");
    expect(hiddenReplacementSetting?.textValue).toBeUndefined();
    expect(hiddenReplacementSetting?.textPlaceholder).toBeUndefined();
    expect(hiddenReplacementSetting?.desc).toContain("hidden");
    expect(hiddenReplacementSetting?.desc).not.toContain("replacement-secret-key");

    const clearAfterReplaceSetting = getSetting("Clear API key");
    await clearAfterReplaceSetting?.buttonOnClick?.();
    expect(plugin.settings.ai.apiKey).toBe("");
    expect(plugin.savePluginSettings).toHaveBeenCalledTimes(2);

    const clearedApiKeySetting = getSetting("API key");
    expect(clearedApiKeySetting).toMatchObject({
      sectionTitle: "AI & Quick Capture Polish",
      group: "common",
      textPlaceholder: "Enter an API key",
      textValue: ""
    });
  });

  it("renders Task 5 controls for the remaining sections and keeps About intro as a native row below the heading", async () => {
    obsidianMockState.language = "en";

    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        poolColors: {
          ...DEFAULT_SETTINGS.poolColors,
          unsorted: "#111111",
          product: "#222222",
          research: "#333333",
          writing: "#444444",
          unnamed: "#555555"
        },
        mediaStorageDirectory: "Assets/Glitter",
        fileStorageDirectory: "Notes/Glitter",
        roam: {
          boardStorageDirectory: "Boards/Glitter"
        },
        enableReducedMotion: true,
        enableAmbientMotion: false,
        uiThemeMode: "obsidian-dark" as const
      },
      activateMainView: vi.fn(async () => undefined),
      savePluginSettings: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const getSetting = (name: string) => obsidianMockState.settings.find((setting) => setting.name === name);

    for (const [name, value] of [
      ["Default pool color", "#111111"],
      ["Pool color 1", "#222222"],
      ["Pool color 2", "#333333"],
      ["Pool color 3", "#444444"],
      ["Pool color 4", "#555555"]
    ] as const) {
      const setting = getSetting(name);
      expect(setting).toMatchObject({
        sectionTitle: "Pools & Organizing",
        group: "advanced",
        textValue: value
      });
      expect(setting?.desc).toContain("Refresh current Glitter views after save when possible");
    }

    const mediaStorageDirectorySetting = getSetting("Media storage directory");
    expect(mediaStorageDirectorySetting).toMatchObject({
      sectionTitle: "Files & Media",
      group: "common",
      textPlaceholder: "Enter a vault-relative path",
      textValue: "Assets/Glitter"
    });
    expect(mediaStorageDirectorySetting?.desc).toContain("Applies to newly created content immediately");

    const fileStorageDirectorySetting = getSetting("File storage directory");
    expect(fileStorageDirectorySetting).toMatchObject({
      sectionTitle: "Files & Media",
      group: "common",
      textPlaceholder: "Enter a vault-relative path",
      textValue: "Notes/Glitter"
    });
    expect(fileStorageDirectorySetting?.desc).toContain("Applies to newly created content immediately");

    const roamBoardStorageDirectorySetting = getSetting("Roam board storage directory");
    expect(roamBoardStorageDirectorySetting).toMatchObject({
      sectionTitle: "Roam Mode",
      group: "common",
      textPlaceholder: "Enter a vault-relative path",
      textValue: "Boards/Glitter"
    });
    expect(roamBoardStorageDirectorySetting?.desc).toContain("Applies to newly created content immediately");

    const reduceMotionSetting = getSetting("Reduce motion");
    expect(reduceMotionSetting).toMatchObject({
      sectionTitle: "Appearance & Experience",
      group: "common",
      toggleValue: true
    });
    expect(reduceMotionSetting?.desc).toContain("Refresh current Glitter views after save when possible");

    const themeModeSetting = getSetting("Theme mode");
    expect(themeModeSetting).toMatchObject({
      sectionTitle: "Appearance & Experience",
      group: "common",
      dropdownValue: "obsidian-dark"
    });
    expect(themeModeSetting?.desc).toContain("Refresh current Glitter views after save when possible");
    expect(themeModeSetting?.dropdownOptions).toEqual([
      { value: "follow-obsidian", label: "Follow Obsidian" },
      { value: "obsidian-light", label: "Light" },
      { value: "obsidian-dark", label: "Dark" }
    ]);

    const ambientMotionSetting = getSetting("Ambient motion");
    expect(ambientMotionSetting).toMatchObject({
      sectionTitle: "Appearance & Experience",
      group: "advanced",
      toggleValue: false
    });
    expect(ambientMotionSetting?.desc).toContain("Refresh current Glitter views after save when possible");

    expect(
      obsidianMockState.settings.some((setting) =>
        ["Default pool", "Create markdown files by default", "Open Glitter on next load"].includes(setting.name)
      )
    ).toBe(false);

    const aboutHeading = getSetting("About Glitter");
    expect(aboutHeading?.desc).toBeUndefined();
    expect(obsidianMockState.paragraphs).not.toContain(
      "Glitter is for ideas worth keeping but not worth turning into full notes right away. You can use global quick capture to save text, links, images, and videos in a lighter way, with automatic detail filling when you paste a link; later, organize them into pools, search and revisit them, and create a Markdown note or insert a snippet only when needed."
    );
    const aboutRows = obsidianMockState.settings.filter(
      (setting) => setting.sectionTitle === "About Glitter" && setting.group === "common" && !setting.isHeading
    );
    expect(aboutRows).toHaveLength(3);
    expect(aboutRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "",
          desc: "Glitter is for ideas worth keeping but not worth turning into full notes right away. You can use global quick capture to save text, links, images, and videos in a lighter way, with automatic detail filling when you paste a link; later, organize them into pools, search and revisit them, and create a Markdown note or insert a snippet only when needed."
        }),
        expect.objectContaining({
          name: "",
          desc: "Developer: ItsVeyra"
        })
      ])
    );
    expect(obsidianMockState.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "span", text: "GitHub: " }),
        expect.objectContaining({
          tag: "a",
          text: "https://github.com/ItsVeyra/glitter-idea-repo",
          href: "https://github.com/ItsVeyra/glitter-idea-repo",
          cls: "external-link"
        })
      ])
    );

    await getSetting("Default pool color")?.textOnChange?.("   ");
    expect(plugin.settings.poolColors.unsorted).toBe(DEFAULT_SETTINGS.poolColors.unsorted);

    await mediaStorageDirectorySetting?.textOnChange?.("  \\Assets\\Glitter//images/  ");
    expect(plugin.settings.mediaStorageDirectory).toBe("Assets/Glitter/images");

    await fileStorageDirectorySetting?.textOnChange?.("  //Notes//Glitter\\drafts\\  ");
    expect(plugin.settings.fileStorageDirectory).toBe("Notes/Glitter/drafts");

    await roamBoardStorageDirectorySetting?.textOnChange?.("  //Boards//Glitter\\nested\\  ");
    expect(plugin.settings.roam.boardStorageDirectory).toBe("Boards/Glitter/nested");

    await mediaStorageDirectorySetting?.textOnChange?.("   ");
    expect(plugin.settings.mediaStorageDirectory).toBe(DEFAULT_SETTINGS.mediaStorageDirectory);

    await fileStorageDirectorySetting?.textOnChange?.("   ");
    expect(plugin.settings.fileStorageDirectory).toBe(DEFAULT_SETTINGS.fileStorageDirectory);

    await roamBoardStorageDirectorySetting?.textOnChange?.("   ");
    expect(plugin.settings.roam.boardStorageDirectory).toBe(DEFAULT_SETTINGS.roam.boardStorageDirectory);

    await themeModeSetting?.dropdownOnChange?.("invalid-theme");
    expect(plugin.settings.uiThemeMode).toBe("obsidian-dark");
    expect(plugin.savePluginSettings).toHaveBeenCalledTimes(7);

    await themeModeSetting?.dropdownOnChange?.("obsidian-light");
    expect(plugin.settings.uiThemeMode).toBe("obsidian-light");
    expect(plugin.savePluginSettings).toHaveBeenCalledTimes(8);
  });

  it("renders About intro as a native description row alongside GitHub and developer info", () => {
    obsidianMockState.language = "en";

    const plugin = {
      settings: DEFAULT_SETTINGS,
      activateMainView: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const aboutHeading = obsidianMockState.settings.find((setting) => setting.name === "About Glitter");
    expect(aboutHeading?.desc).toBeUndefined();
    expect(obsidianMockState.paragraphs).not.toContain(
      "Glitter is for ideas worth keeping but not worth turning into full notes right away. You can use global quick capture to save text, links, images, and videos in a lighter way, with automatic detail filling when you paste a link; later, organize them into pools, search and revisit them, and create a Markdown note or insert a snippet only when needed."
    );
    const aboutRows = obsidianMockState.settings.filter(
      (setting) => setting.sectionTitle === "About Glitter" && setting.group === "common" && !setting.isHeading
    );
    expect(aboutRows).toHaveLength(3);
    expect(aboutRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "",
          desc: "Glitter is for ideas worth keeping but not worth turning into full notes right away. You can use global quick capture to save text, links, images, and videos in a lighter way, with automatic detail filling when you paste a link; later, organize them into pools, search and revisit them, and create a Markdown note or insert a snippet only when needed."
        }),
        expect.objectContaining({
          name: "",
          desc: "Developer: ItsVeyra"
        })
      ])
    );
    expect(obsidianMockState.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "span", text: "GitHub: " }),
        expect.objectContaining({
          tag: "a",
          text: "https://github.com/ItsVeyra/glitter-idea-repo",
          href: "https://github.com/ItsVeyra/glitter-idea-repo",
          cls: "external-link"
        })
      ])
    );
    expect(stylesCss).not.toContain(".glitter-settings-tab__about-meta {");
  });

  it("renders the localized skeleton in zh-CN", () => {
    const plugin = {
      settings: DEFAULT_SETTINGS,
      activateMainView: vi.fn(async () => undefined)
    };

    const tab = new GlitterSettingTab({} as never, plugin as never);
    tab.display();

    const headingSettings = obsidianMockState.settings.filter((setting) => setting.isHeading);

    expect(headingSettings[0]).toMatchObject({
      name: "Glitter 设置",
      classes: ["glitter-settings-tab__page-title"]
    });
    expect(headingSettings.slice(1).map((setting) => setting.name)).toEqual([
      "工作区与入口",
      "快速记录",
      "AI 与快速记录润色",
      "片段与划词",
      "灵感池与整理",
      "漫游模式",
      "文件与媒体",
      "外观与体验",
      "关于 Glitter"
    ]);
    expect(obsidianMockState.paragraphs).not.toContain("围绕工作区入口、快速记录、片段、灵感池、媒体与体验配置 Glitter。");
    expect(obsidianMockState.headerButtons).toHaveLength(0);
    expect(obsidianMockState.details.map((detail) => detail.summary)).toEqual([
      "高级",
      "高级",
      "高级",
      "高级"
    ]);
  });
});
