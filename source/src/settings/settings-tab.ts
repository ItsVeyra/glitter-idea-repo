/**
 * Obsidian 设置页实现。
 * 负责渲染 Glitter 设置分区，并在交互时把修改同步回插件设置持久化层。
 */
import { App, PluginSettingTab, Setting, getLanguage } from "obsidian";
import GlitterPlugin from "../plugin/GlitterPlugin";
import { DEFAULT_SETTINGS } from "./defaults";
import { getSettingsText } from "./settings-locale";

// 设置项渲染辅助。
type SectionSkeletonSlots = {
  commonContentEl: HTMLDivElement;
  advancedContentEl: HTMLDivElement | null;
};

function withActivation(description: string, activation: string): string {
  return `${description} ${activation}`;
}

function resolveHotkeyValue(value: string | null): string {
  return value ?? "";
}

function resolveHotkeyPlaceholder(defaultValue: string | null, fallback: string): string {
  return defaultValue ?? fallback;
}

function normalizeHotkeyValue(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringValue(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeStorageDirectoryValue(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

function extractAboutLinkDescription(description: string): { prefix: string; href: string } | null {
  const match = description.match(/^(.*?)(https?:\/\/\S+)\s*$/u);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1] ?? "",
    href: match[2] ?? ""
  };
}

function renderAboutLinkSetting(containerEl: HTMLDivElement, description: string): void {
  const setting = new Setting(containerEl);
  const linkDescription = extractAboutLinkDescription(description);
  if (!linkDescription) {
    setting.setDesc(description);
    return;
  }

  if (linkDescription.prefix.length > 0) {
    setting.descEl.createEl("span", { text: linkDescription.prefix });
  }
  setting.descEl.createEl("a", {
    text: linkDescription.href,
    href: linkDescription.href,
    cls: "external-link"
  });
}

// Obsidian 设置页实现。
export default class GlitterSettingTab extends PluginSettingTab {
  private isReplacingAiApiKey = false;
  private aiApiKeyDraft = DEFAULT_SETTINGS.ai.apiKey;

  constructor(app: App, private readonly plugin: GlitterPlugin) {
    super(app, plugin);
  }

  // 完整设置页渲染。
  display(): void {
    const { containerEl } = this;
    const language = getLanguage();
    const text = getSettingsText(language);

    containerEl.empty();

    const headerEl = containerEl.createDiv({ cls: "glitter-settings-tab__header" });
    new Setting(headerEl)
      .setName(text.pageTitle)
      .setClass("glitter-settings-tab__page-title")
      .setHeading();
    const workspaceSection = this.renderSection(
      containerEl,
      text.sections.workspace.title,
      text.sections.workspace.description,
      text.advancedGroup
    );
    new Setting(workspaceSection.commonContentEl)
      .setName(text.labels.showHomeRibbonIcon)
      .setDesc(withActivation(text.descriptions.showHomeRibbonIcon, text.activation.immediate))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showHomeRibbonIcon).onChange(async (value) => {
          this.plugin.settings = {
            ...this.plugin.settings,
            showHomeRibbonIcon: value
          };
          this.plugin.syncHomeRibbonIcon();
          await this.plugin.savePluginSettings();
        })
      );
    new Setting(workspaceSection.commonContentEl)
      .setName(text.labels.openHome)
      .setDesc(text.descriptions.openHome)
      .addButton((button) =>
        button.setButtonText(text.labels.openHome).onClick(async () => {
          await this.plugin.activateMainView();
        })
      );
    new Setting(workspaceSection.advancedContentEl!)
      .setName(text.labels.resetOnboarding)
      .setDesc(text.descriptions.resetOnboarding)
      .addButton((button) =>
        button.setButtonText(text.labels.resetOnboarding).onClick(async () => {
          await this.plugin.reopenFirstUseOnHome();
        })
      );

    const quickCaptureSection = this.renderSection(
      containerEl,
      text.sections.quickCapture.title,
      text.sections.quickCapture.description
    );
    new Setting(quickCaptureSection.commonContentEl)
      .setName(text.labels.enableQuickCapture)
      .setDesc(withActivation(text.descriptions.enableQuickCapture, text.activation.reload))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableQuickCapture).onChange(async (value) => {
          this.plugin.settings = {
            ...this.plugin.settings,
            enableQuickCapture: value
          };
          await this.plugin.savePluginSettings();
        })
      );
    new Setting(quickCaptureSection.commonContentEl)
      .setName(text.labels.globalQuickCaptureHotkey)
      .setDesc(withActivation(text.descriptions.globalQuickCaptureHotkey, text.activation.reload))
      .addText((value) =>
        value
          .setPlaceholder(
            resolveHotkeyPlaceholder(
              DEFAULT_SETTINGS.hotkeys.globalQuickCapture,
              text.placeholders.globalQuickCaptureHotkey
            )
          )
          .setValue(resolveHotkeyValue(this.plugin.settings.hotkeys.globalQuickCapture))
          .onChange(async (nextValue) => {
            this.plugin.settings = {
              ...this.plugin.settings,
              hotkeys: {
                ...this.plugin.settings.hotkeys,
                globalQuickCapture: normalizeHotkeyValue(nextValue)
              }
            };
            await this.plugin.savePluginSettings();
          })
      );

    // AI 设置区集中收口快速记录润色所需的开关与直连模型配置。
    const aiSection = this.renderSection(containerEl, text.sections.ai.title, text.sections.ai.description);
    new Setting(aiSection.commonContentEl)
      .setName(text.labels.enableAi)
      .setDesc(withActivation(text.descriptions.enableAi, text.activation.immediate))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.ai.enabled).onChange(async (value) => {
          this.plugin.settings = {
            ...this.plugin.settings,
            ai: {
              ...this.plugin.settings.ai,
              enabled: value
            }
          };
          await this.plugin.savePluginSettings();
        })
      );
    new Setting(aiSection.commonContentEl)
      .setName(text.labels.enableQuickCaptureAiPolish)
      .setDesc(withActivation(text.descriptions.enableQuickCaptureAiPolish, text.activation.immediate))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.ai.quickCapturePolishEnabled).onChange(async (value) => {
          this.plugin.settings = {
            ...this.plugin.settings,
            ai: {
              ...this.plugin.settings.ai,
              quickCapturePolishEnabled: value
            }
          };
          await this.plugin.savePluginSettings();
        })
      );
    new Setting(aiSection.commonContentEl)
      .setName(text.labels.aiBaseUrl)
      .setDesc(withActivation(text.descriptions.aiBaseUrl, text.activation.immediate))
      .addText((value) =>
        value
          .setPlaceholder(text.placeholders.aiBaseUrl)
          .setValue(this.plugin.settings.ai.baseUrl)
          .onChange(async (nextValue) => {
            this.plugin.settings = {
              ...this.plugin.settings,
              ai: {
                ...this.plugin.settings.ai,
                baseUrl: normalizeStringValue(nextValue, DEFAULT_SETTINGS.ai.baseUrl)
              }
            };
            await this.plugin.savePluginSettings();
          })
      );
    new Setting(aiSection.commonContentEl)
      .setName(text.labels.aiModel)
      .setDesc(withActivation(text.descriptions.aiModel, text.activation.immediate))
      .addText((value) =>
        value
          .setPlaceholder(text.placeholders.aiModel)
          .setValue(this.plugin.settings.ai.model)
          .onChange(async (nextValue) => {
            this.plugin.settings = {
              ...this.plugin.settings,
              ai: {
                ...this.plugin.settings.ai,
                model: normalizeStringValue(nextValue, DEFAULT_SETTINGS.ai.model)
              }
            };
            await this.plugin.savePluginSettings();
          })
      );
    this.renderAiApiKeySetting(aiSection.commonContentEl, text);

    const snippetsSection = this.renderSection(
      containerEl,
      text.sections.snippets.title,
      text.sections.snippets.description,
      text.advancedGroup
    );
    new Setting(snippetsSection.commonContentEl)
      .setName(text.labels.enableInsertIdeaReference)
      .setDesc(withActivation(text.descriptions.enableInsertIdeaReference, text.activation.reload))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableInsertIdeaReference).onChange(async (value) => {
          this.plugin.settings = {
            ...this.plugin.settings,
            enableInsertIdeaReference: value
          };
          await this.plugin.savePluginSettings();
        })
      );
    new Setting(snippetsSection.commonContentEl)
      .setName(text.labels.insertIdeaReferenceHotkey)
      .setDesc(withActivation(text.descriptions.insertIdeaReferenceHotkey, text.activation.reload))
      .addText((value) =>
        value
          .setPlaceholder(
            resolveHotkeyPlaceholder(
              DEFAULT_SETTINGS.hotkeys.insertIdeaReference,
              text.placeholders.insertIdeaReferenceHotkey
            )
          )
          .setValue(resolveHotkeyValue(this.plugin.settings.hotkeys.insertIdeaReference))
          .onChange(async (nextValue) => {
            this.plugin.settings = {
              ...this.plugin.settings,
              hotkeys: {
                ...this.plugin.settings.hotkeys,
                insertIdeaReference: normalizeHotkeyValue(nextValue)
              }
            };
            await this.plugin.savePluginSettings();
          })
      );
    new Setting(snippetsSection.commonContentEl)
      .setName(text.labels.enableCreateFromSelection)
      .setDesc(withActivation(text.descriptions.enableCreateFromSelection, text.activation.reload))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableCreateFromSelection).onChange(async (value) => {
          this.plugin.settings = {
            ...this.plugin.settings,
            enableCreateFromSelection: value
          };
          await this.plugin.savePluginSettings();
        })
      );
    new Setting(snippetsSection.commonContentEl)
      .setName(text.labels.createFromSelectionHotkey)
      .setDesc(withActivation(text.descriptions.createFromSelectionHotkey, text.activation.reload))
      .addText((value) =>
        value
          .setPlaceholder(
            resolveHotkeyPlaceholder(
              DEFAULT_SETTINGS.hotkeys.createFromSelection,
              text.placeholders.createFromSelectionHotkey
            )
          )
          .setValue(resolveHotkeyValue(this.plugin.settings.hotkeys.createFromSelection))
          .onChange(async (nextValue) => {
            this.plugin.settings = {
              ...this.plugin.settings,
              hotkeys: {
                ...this.plugin.settings.hotkeys,
                createFromSelection: normalizeHotkeyValue(nextValue)
              }
            };
            await this.plugin.savePluginSettings();
          })
      );
    new Setting(snippetsSection.advancedContentEl!)
      .setName(text.labels.createdIdeaEmoji)
      .setDesc(withActivation(text.descriptions.createdIdeaEmoji, text.activation.newContent))
      .addText((value) =>
        value
          .setPlaceholder(DEFAULT_SETTINGS.createdIdeaEmoji)
          .setValue(this.plugin.settings.createdIdeaEmoji)
          .onChange(async (nextValue) => {
            this.plugin.settings = {
              ...this.plugin.settings,
              createdIdeaEmoji: normalizeStringValue(nextValue, DEFAULT_SETTINGS.createdIdeaEmoji)
            };
            await this.plugin.savePluginSettings();
          })
      );

    const poolsSection = this.renderSection(
      containerEl,
      text.sections.pools.title,
      text.sections.pools.description,
      text.advancedGroup
    );
    for (const { key, label } of [
      { key: "unsorted", label: text.labels.poolColorUnsorted },
      { key: "product", label: text.labels.poolColorProduct },
      { key: "research", label: text.labels.poolColorResearch },
      { key: "writing", label: text.labels.poolColorWriting },
      { key: "unnamed", label: text.labels.poolColorUnnamed }
    ] as const) {
      new Setting(poolsSection.advancedContentEl!)
        .setName(label)
        .setDesc(withActivation(text.descriptions.poolColor, text.activation.refresh))
        .addText((value) =>
          value
            .setPlaceholder(DEFAULT_SETTINGS.poolColors[key])
            .setValue(this.plugin.settings.poolColors[key])
            .onChange(async (nextValue) => {
              this.plugin.settings = {
                ...this.plugin.settings,
                poolColors: {
                  ...this.plugin.settings.poolColors,
                  [key]: normalizeStringValue(nextValue, DEFAULT_SETTINGS.poolColors[key])
                }
              };
              await this.plugin.savePluginSettings();
            })
        );
    }

    const roamSection = this.renderSection(
      containerEl,
      text.sections.roam.title,
      text.sections.roam.description
    );
    new Setting(roamSection.commonContentEl)
      .setName(text.labels.roamBoardStorageDirectory)
      .setDesc(withActivation(text.descriptions.roamBoardStorageDirectory, text.activation.newContent))
      .addText((value) =>
        value
          .setPlaceholder(text.placeholders.roamBoardStorageDirectory)
          .setValue(this.plugin.settings.roam.boardStorageDirectory)
          .onChange(async (nextValue) => {
            this.plugin.settings = {
              ...this.plugin.settings,
              roam: {
                ...this.plugin.settings.roam,
                boardStorageDirectory: normalizeStorageDirectoryValue(
                  nextValue,
                  DEFAULT_SETTINGS.roam.boardStorageDirectory
                )
              }
            };
            await this.plugin.savePluginSettings();
          })
      );

    const filesSection = this.renderSection(
      containerEl,
      text.sections.files.title,
      text.sections.files.description
    );
    new Setting(filesSection.commonContentEl)
      .setName(text.labels.mediaStorageDirectory)
      .setDesc(withActivation(text.descriptions.mediaStorageDirectory, text.activation.newContent))
      .addText((value) =>
        value
          .setPlaceholder(text.placeholders.mediaStorageDirectory)
          .setValue(this.plugin.settings.mediaStorageDirectory)
          .onChange(async (nextValue) => {
            this.plugin.settings = {
              ...this.plugin.settings,
              mediaStorageDirectory: normalizeStorageDirectoryValue(nextValue, DEFAULT_SETTINGS.mediaStorageDirectory)
            };
            await this.plugin.savePluginSettings();
          })
      );
    new Setting(filesSection.commonContentEl)
      .setName(text.labels.fileStorageDirectory)
      .setDesc(withActivation(text.descriptions.fileStorageDirectory, text.activation.newContent))
      .addText((value) =>
        value
          .setPlaceholder(text.placeholders.fileStorageDirectory)
          .setValue(this.plugin.settings.fileStorageDirectory)
          .onChange(async (nextValue) => {
            this.plugin.settings = {
              ...this.plugin.settings,
              fileStorageDirectory: normalizeStorageDirectoryValue(nextValue, DEFAULT_SETTINGS.fileStorageDirectory)
            };
            await this.plugin.savePluginSettings();
          })
      );

    const appearanceSection = this.renderSection(
      containerEl,
      text.sections.appearance.title,
      text.sections.appearance.description,
      text.advancedGroup
    );
    new Setting(appearanceSection.commonContentEl)
      .setName(text.labels.enableReducedMotion)
      .setDesc(withActivation(text.descriptions.enableReducedMotion, text.activation.refresh))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableReducedMotion).onChange(async (value) => {
          this.plugin.settings = {
            ...this.plugin.settings,
            enableReducedMotion: value
          };
          await this.plugin.savePluginSettings();
        })
      );
    new Setting(appearanceSection.commonContentEl)
      .setName(text.labels.uiThemeMode)
      .setDesc(withActivation(text.descriptions.uiThemeMode, text.activation.refresh))
      .addDropdown((dropdown) => {
        dropdown.addOption("follow-obsidian", text.themeModeOptions.follow);
        dropdown.addOption("obsidian-light", text.themeModeOptions.light);
        dropdown.addOption("obsidian-dark", text.themeModeOptions.dark);
        dropdown.setValue(this.plugin.settings.uiThemeMode).onChange(async (nextValue) => {
          if (
            nextValue !== "follow-obsidian" &&
            nextValue !== "obsidian-light" &&
            nextValue !== "obsidian-dark"
          ) {
            return;
          }

          this.plugin.settings = {
            ...this.plugin.settings,
            uiThemeMode: nextValue
          };
          await this.plugin.savePluginSettings();
        });
      });
    new Setting(appearanceSection.advancedContentEl!)
      .setName(text.labels.enableAmbientMotion)
      .setDesc(withActivation(text.descriptions.enableAmbientMotion, text.activation.refresh))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableAmbientMotion).onChange(async (value) => {
          this.plugin.settings = {
            ...this.plugin.settings,
            enableAmbientMotion: value
          };
          await this.plugin.savePluginSettings();
        })
      );

    const aboutSection = this.renderSection(containerEl, text.sections.about.title);
    new Setting(aboutSection.commonContentEl).setDesc(text.descriptions.aboutIntro);
    renderAboutLinkSetting(aboutSection.commonContentEl, text.descriptions.aboutGithub);
    new Setting(aboutSection.commonContentEl).setDesc(text.descriptions.aboutDeveloper);
  }

  private async commitAiApiKeyDraft(hasConfiguredApiKey: boolean): Promise<void> {
    const normalizedApiKey = normalizeStringValue(this.aiApiKeyDraft, DEFAULT_SETTINGS.ai.apiKey);
    if (normalizedApiKey.length === 0) {
      if (hasConfiguredApiKey) {
        this.aiApiKeyDraft = DEFAULT_SETTINGS.ai.apiKey;
        this.isReplacingAiApiKey = false;
        this.display();
      }
      return;
    }

    this.plugin.settings = {
      ...this.plugin.settings,
      ai: {
        ...this.plugin.settings.ai,
        apiKey: normalizedApiKey
      }
    };
    this.aiApiKeyDraft = DEFAULT_SETTINGS.ai.apiKey;
    this.isReplacingAiApiKey = false;
    await this.plugin.savePluginSettings();
    this.display();
  }

  private renderAiApiKeySetting(containerEl: HTMLDivElement, text: ReturnType<typeof getSettingsText>): void {
    const hasConfiguredApiKey = this.plugin.settings.ai.apiKey.trim().length > 0;

    if (!hasConfiguredApiKey || this.isReplacingAiApiKey) {
      new Setting(containerEl)
        .setName(text.labels.aiApiKey)
        .setDesc(text.descriptions.aiApiKey)
        .addText((value) => {
          value
            .setPlaceholder(text.placeholders.aiApiKey)
            .setValue(this.aiApiKeyDraft)
            .onChange(async (nextValue) => {
              this.aiApiKeyDraft = nextValue;
            });
          value.inputEl.addEventListener("blur", async () => {
            await this.commitAiApiKeyDraft(hasConfiguredApiKey);
          });
        });
      return;
    }

    new Setting(containerEl)
      .setName(text.labels.aiApiKey)
      .setDesc(text.descriptions.aiApiKeyConfigured);
    new Setting(containerEl)
      .setName(text.labels.replaceAiApiKey)
      .setDesc(text.descriptions.replaceAiApiKey)
      .addButton((button) =>
        button.setButtonText(text.labels.replaceAiApiKey).onClick(async () => {
          this.isReplacingAiApiKey = true;
          this.aiApiKeyDraft = DEFAULT_SETTINGS.ai.apiKey;
          this.display();
        })
      );
    new Setting(containerEl)
      .setName(text.labels.clearAiApiKey)
      .setDesc(text.descriptions.clearAiApiKey)
      .addButton((button) =>
        button.setButtonText(text.labels.clearAiApiKey).onClick(async () => {
          this.plugin.settings = {
            ...this.plugin.settings,
            ai: {
              ...this.plugin.settings.ai,
              apiKey: DEFAULT_SETTINGS.ai.apiKey
            }
          };
          this.aiApiKeyDraft = DEFAULT_SETTINGS.ai.apiKey;
          this.isReplacingAiApiKey = false;
          await this.plugin.savePluginSettings();
          this.display();
        })
      );
  }

  // 通用分区骨架。
  private renderSection(
    containerEl: HTMLElement,
    title: string,
    description?: string,
    advancedSummary?: string
  ): SectionSkeletonSlots {
    const sectionEl = containerEl.createDiv({ cls: "glitter-settings-tab__section" });
    const heading = new Setting(sectionEl).setName(title).setHeading();
    if (description) {
      heading.setDesc(description);
    }

    const commonContentEl = sectionEl.createDiv();

    if (!advancedSummary) {
      return {
        commonContentEl,
        advancedContentEl: null
      };
    }

    const advancedDetailsEl = sectionEl.createEl("details", {
      cls: "glitter-settings-tab__advanced-details"
    });
    advancedDetailsEl.open = false;
    advancedDetailsEl.createEl("summary", {
      text: advancedSummary,
      cls: "glitter-settings-tab__advanced-summary"
    });
    const advancedContentEl = advancedDetailsEl.createDiv();

    return {
      commonContentEl,
      advancedContentEl
    };
  }
}
