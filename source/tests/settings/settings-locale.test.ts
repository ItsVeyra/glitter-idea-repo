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
 * 保护设置文案的宿主语言切换相关行为，避免后续重构时出现静默回退。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getSettingsText, resolveSettingsLocale } from "../../src/settings/settings-locale";

const expectedManifestDescription =
  "Save ideas without creating a full note first, then organize them into pools, files, or reusable snippets when needed.";

const expectedChineseText = {
  pageTitle: "Glitter 设置",
  pageSubtitle: "围绕工作区入口、快速记录、片段、灵感池、媒体与体验配置 Glitter。",
  headerOpenHome: "立即打开 Glitter 首页",
  commonGroup: "日常",
  advancedGroup: "高级",
  emptyAdvancedGroup: "此分区在第一阶段没有额外高级设置。",
  activation: {
    immediate: "立即生效",
    newContent: "仅对新创建内容立即生效",
    reload: "重载插件后生效",
    refresh: "保存后尽量刷新当前 Glitter 视图"
  },
  sections: {
    workspace: {
      title: "工作区与入口",
      description: "控制用户如何从 Obsidian 进入 Glitter，以及首页入口如何暴露。"
    },
    quickCapture: {
      title: "快速记录",
      description: "控制 Glitter 作为快速记录入口时的可用性与触发方式。"
    },
    snippets: {
      title: "片段与划词",
      description: "控制 Glitter 与编辑器的片段插入和划词创建集成。"
    },
    pools: {
      title: "灵感池与整理",
      description: "控制稳定的池默认视觉，而不是把日常操作搬到设置里。"
    },
    roam: {
      title: "漫游模式",
      description: "控制原生漫游白板文件的保存位置。"
    },
    files: {
      title: "文件与媒体",
      description: "控制 Glitter 生成媒体的保存位置与后续文件策略入口。"
    },
    appearance: {
      title: "外观与体验",
      description: "控制主题、动效与整体视觉体验。"
    },
    ai: {
      title: "AI 与快速记录润色",
      description: "配置 AI 接入方式，以及快速记录文本润色的可用性。"
    },
    about: {
      title: "关于 Glitter",
      description: "为插件介绍、GitHub 地址和开发者信息预留固定位置。"
    }
  },
  labels: {
    showHomeRibbonIcon: "在左侧功能区显示 Glitter 首页入口",
    openHome: "打开 Glitter 首页",
    resetOnboarding: "重置首次使用引导",
    enableQuickCapture: "启用快速记录",
    globalQuickCaptureHotkey: "快速记录全局快捷键",
    enableInsertIdeaReference: "启用片段插入",
    insertIdeaReferenceHotkey: "插入 Glitter 片段快捷键",
    enableCreateFromSelection: "启用划词创建灵感",
    createFromSelectionHotkey: "划词创建灵感快捷键",
    createdIdeaEmoji: "已创建文件标记",
    mediaStorageDirectory: "媒体存储目录",
    fileStorageDirectory: "文件存储目录",
    roamBoardStorageDirectory: "漫游白板存储目录",
    enableReducedMotion: "减少动效",
    enableAmbientMotion: "环境动效",
    uiThemeMode: "主题模式",
    enableAi: "启用 AI",
    enableQuickCaptureAiPolish: "启用快速记录 AI 润色",
    aiBaseUrl: "Base URL",
    aiModel: "模型",
    aiApiKey: "API Key",
    replaceAiApiKey: "替换 API Key",
    clearAiApiKey: "清空 API Key",
    poolColorUnsorted: "默认池颜色",
    poolColorProduct: "池颜色 1",
    poolColorResearch: "池颜色 2",
    poolColorWriting: "池颜色 3",
    poolColorUnnamed: "池颜色 4"
  },
  descriptions: {
    showHomeRibbonIcon: "控制左侧 ✨ 首页图标是否可见。",
    openHome: "立即打开 Glitter 主工作区。",
    resetOnboarding: "清空首次使用进度，便于再次触发引导流程。",
    enableQuickCapture: "允许 Glitter 暴露快速记录命令与入口。",
    globalQuickCaptureHotkey: "为全局快速记录命令设置快捷键，留空可恢复默认行为。",
    enableInsertIdeaReference: "允许在当前编辑器中插入 Glitter 片段。",
    insertIdeaReferenceHotkey: "为片段插入命令设置快捷键，留空可恢复默认行为。",
    enableCreateFromSelection: "允许从当前选中文本直接创建灵感。",
    createFromSelectionHotkey: "为划词创建命令设置快捷键，留空可恢复默认行为。",
    createdIdeaEmoji: "控制灵感生成文件后的标记符号。",
    mediaStorageDirectory: "填写库内相对路径，新的媒体文件会保存到这里。",
    fileStorageDirectory: "填写库内相对路径，由灵感创建的 Markdown 文件会保存到这里。",
    roamBoardStorageDirectory: "填写库内相对路径，新的漫游白板文件会保存到这里。",
    enableReducedMotion: "减少 Glitter 视图中的动效强度。",
    enableAmbientMotion: "在未开启减少动效时允许环境动效层存在。",
    uiThemeMode: "选择跟随 Obsidian、强制浅色或强制深色。",
    enableAi: "允许 Glitter 使用已配置的 AI 服务。",
    enableQuickCaptureAiPolish: "允许快速记录中的文本内容使用 AI 润色。",
    aiBaseUrl: "填写 OpenAI 兼容接口的基础地址。",
    aiModel: "填写用于快速记录润色的模型名称。",
    aiApiKey: "填写用于访问 AI 服务的 API Key。",
    aiApiKeyConfigured: "填写用于访问 AI 服务的 API Key。当前已配置，内容已隐藏。",
    replaceAiApiKey: "使用新的 API Key 覆盖当前已保存的密钥。",
    clearAiApiKey: "清除当前已保存的 API Key。",
    poolColor: "设置对应灵感池的颜色值。",
    aboutIntro: "Glitter 适合保存那些值得留下、却不一定需要立刻建成正式笔记的小点子、片段和灵感。你可以先用全局快速记录把文本、链接、图片、视频轻量收住，粘贴链接时自动识别并补全信息；之后再按灵感池整理、搜索与回看，并在需要时创建 Markdown 文件或插入笔记正文。",
    aboutGithub: "GitHub：https://github.com/ItsVeyra/glitter-idea-repo",
    aboutDeveloper: "开发者：ItsVeyra"
  },
  placeholders: {
    globalQuickCaptureHotkey: "留空则恢复默认行为",
    insertIdeaReferenceHotkey: "留空则恢复默认行为",
    createFromSelectionHotkey: "留空则恢复默认行为",
    mediaStorageDirectory: "输入库内相对路径",
    fileStorageDirectory: "输入库内相对路径",
    roamBoardStorageDirectory: "输入库内相对路径",
    aiBaseUrl: "输入 OpenAI 兼容接口地址",
    aiModel: "输入模型名称",
    aiApiKey: "输入 API Key"
  },
  themeModeOptions: {
    follow: "跟随 Obsidian",
    light: "浅色",
    dark: "深色"
  }
} as const;

const expectedEnglishText = {
  pageTitle: "Glitter Settings",
  pageSubtitle: "Configure Glitter around workspace entry, quick capture, snippets, pools, media, and experience.",
  headerOpenHome: "Open Glitter Home Now",
  commonGroup: "Common",
  advancedGroup: "Advanced",
  emptyAdvancedGroup: "No additional advanced settings are exposed in phase 1.",
  activation: {
    immediate: "Immediate effect",
    newContent: "Applies to newly created content immediately",
    reload: "Reload plugin to apply",
    refresh: "Refresh current Glitter views after save when possible"
  },
  sections: {
    workspace: {
      title: "Workspace & Entry",
      description: "Control how users enter Glitter from Obsidian and how the top-level home entry appears."
    },
    quickCapture: {
      title: "Quick Capture",
      description: "Control whether Glitter is available as a fast capture entry point and how it is invoked."
    },
    snippets: {
      title: "Snippets & Selection",
      description: "Control Glitter snippet insertion and create-from-selection editor integrations."
    },
    pools: {
      title: "Pools & Organizing",
      description: "Control stable pool defaults and visual identity without moving day-to-day pool actions into settings."
    },
    roam: {
      title: "Roam Mode",
      description: "Control where native roam board files are created."
    },
    files: {
      title: "Files & Media",
      description: "Control where Glitter stores generated media and future file-related behavior."
    },
    appearance: {
      title: "Appearance & Experience",
      description: "Control theme, motion, and overall visual experience."
    },
    ai: {
      title: "AI & Quick Capture Polish",
      description: "Configure AI access and whether quick capture text polish is available."
    },
    about: {
      title: "About Glitter",
      description: "Reserve a stable place for plugin introduction, GitHub, and developer information."
    }
  },
  labels: {
    showHomeRibbonIcon: "Show Glitter home entry in the left ribbon",
    openHome: "Open Glitter home",
    resetOnboarding: "Reset first-use onboarding",
    enableQuickCapture: "Enable quick capture",
    globalQuickCaptureHotkey: "Quick capture global hotkey",
    enableInsertIdeaReference: "Enable snippet insertion",
    insertIdeaReferenceHotkey: "Insert Glitter snippet hotkey",
    enableCreateFromSelection: "Enable create from selection",
    createFromSelectionHotkey: "Create from selection hotkey",
    createdIdeaEmoji: "File-created marker",
    mediaStorageDirectory: "Media storage directory",
    fileStorageDirectory: "File storage directory",
    roamBoardStorageDirectory: "Roam board storage directory",
    enableReducedMotion: "Reduce motion",
    enableAmbientMotion: "Ambient motion",
    uiThemeMode: "Theme mode",
    enableAi: "Enable AI",
    enableQuickCaptureAiPolish: "Enable quick capture AI polish",
    aiBaseUrl: "Base URL",
    aiModel: "Model",
    aiApiKey: "API key",
    replaceAiApiKey: "Replace API key",
    clearAiApiKey: "Clear API key",
    poolColorUnsorted: "Default pool color",
    poolColorProduct: "Pool color 1",
    poolColorResearch: "Pool color 2",
    poolColorWriting: "Pool color 3",
    poolColorUnnamed: "Pool color 4"
  },
  descriptions: {
    showHomeRibbonIcon: "Control whether the left-ribbon ✨ home icon is visible.",
    openHome: "Open the Glitter main workspace immediately.",
    resetOnboarding: "Clear first-use progress so onboarding can run again later.",
    enableQuickCapture: "Allow Glitter to expose quick capture commands and entry points.",
    globalQuickCaptureHotkey: "Set the hotkey for the global quick capture command. Leave empty to restore the default behavior.",
    enableInsertIdeaReference: "Allow Glitter snippets to be inserted into the active editor.",
    insertIdeaReferenceHotkey: "Set the hotkey for snippet insertion. Leave empty to restore the default behavior.",
    enableCreateFromSelection: "Allow ideas to be created directly from the current text selection.",
    createFromSelectionHotkey: "Set the hotkey for create-from-selection. Leave empty to restore the default behavior.",
    createdIdeaEmoji: "Control the marker used after an idea file is created.",
    mediaStorageDirectory: "Use a vault-relative path for newly created media files.",
    fileStorageDirectory: "Use a vault-relative path for Markdown files created from Glitter ideas.",
    roamBoardStorageDirectory: "Use a vault-relative path for newly created roam board files.",
    enableReducedMotion: "Reduce motion intensity across Glitter views.",
    enableAmbientMotion: "Allow ambient motion layers when reduced motion is not enabled.",
    uiThemeMode: "Choose whether Glitter follows Obsidian or forces a light or dark theme.",
    enableAi: "Allow Glitter to use the configured AI service.",
    enableQuickCaptureAiPolish: "Allow quick capture text to be polished with AI.",
    aiBaseUrl: "Enter the base URL for an OpenAI-compatible API.",
    aiModel: "Enter the model used for quick capture polish.",
    aiApiKey: "Enter the API key used to access the AI service.",
    aiApiKeyConfigured: "Enter the API key used to access the AI service. Configured and hidden.",
    replaceAiApiKey: "Replace the currently saved API key with a new one.",
    clearAiApiKey: "Clear the currently saved API key.",
    poolColor: "Set the color value for the matching pool.",
    aboutIntro: "Glitter is for ideas worth keeping but not worth turning into full notes right away. You can use global quick capture to save text, links, images, and videos in a lighter way, with automatic detail filling when you paste a link; later, organize them into pools, search and revisit them, and create a Markdown note or insert a snippet only when needed.",
    aboutGithub: "GitHub: https://github.com/ItsVeyra/glitter-idea-repo",
    aboutDeveloper: "Developer: ItsVeyra"
  },
  placeholders: {
    globalQuickCaptureHotkey: "Leave empty to restore the default behavior",
    insertIdeaReferenceHotkey: "Leave empty to restore the default behavior",
    createFromSelectionHotkey: "Leave empty to restore the default behavior",
    mediaStorageDirectory: "Enter a vault-relative path",
    fileStorageDirectory: "Enter a vault-relative path",
    roamBoardStorageDirectory: "Enter a vault-relative path",
    aiBaseUrl: "Enter an OpenAI-compatible base URL",
    aiModel: "Enter a model name",
    aiApiKey: "Enter an API key"
  },
  themeModeOptions: {
    follow: "Follow Obsidian",
    light: "Light",
    dark: "Dark"
  }
} as const;

// 校验设置文案会随宿主语言在中英文之间切换。
describe("settings locale", () => {
  it("resolves supported and unsupported host languages to the expected settings locale", () => {
    expect(resolveSettingsLocale("en")).toBe("en");
    expect(resolveSettingsLocale("EN-US")).toBe("en");
    expect(resolveSettingsLocale("zh-CN")).toBe("zh-CN");
    expect(resolveSettingsLocale("zh-TW")).toBe("zh-CN");
    expect(resolveSettingsLocale("ja")).toBe("zh-CN");
  });

  it("returns the exact English settings text bundle for English host languages", () => {
    expect(getSettingsText("en-US")).toEqual(expectedEnglishText);
  });

  it("returns the exact Simplified Chinese settings text bundle for Chinese host languages", () => {
    expect(getSettingsText("zh-CN")).toEqual(expectedChineseText);
  });

  it("falls back unsupported and non-mainland Chinese host languages to the Simplified Chinese bundle", () => {
    expect(getSettingsText("zh-TW")).toEqual(expectedChineseText);
    expect(getSettingsText("ja")).toEqual(expectedChineseText);
  });

  it("keeps the manifest description separate from the settings About intro", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, "../../manifest.json"), "utf8")
    ) as { description?: string };

    expect(manifest.description).toBe(expectedManifestDescription);
    expect(manifest.description).not.toBe(expectedEnglishText.descriptions.aboutIntro);
  });
});
