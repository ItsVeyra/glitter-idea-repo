/**
 * 保护视图命令注册与窗口打开相关行为，避免后续重构时出现静默回退。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { addIcon } from "obsidian";
import { registerOpenMainViewCommand } from "../../src/commands/open-main-view-command";
import { registerOpenPoolViewCommand } from "../../src/commands/open-pool-view-command";
import { registerOpenSearchViewCommand } from "../../src/commands/open-search-view-command";
import GlitterPlugin from "../../src/plugin/GlitterPlugin";
import { DEFAULT_POOL_ID, DEFAULT_POOL_LABEL } from "../../src/plugin/constants";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

// 预先收口可重置的依赖替身，方便验证对外协作。
const {
  registerCommandsMock,
  getActiveEditorMock,
  enhanceGlitterSnippetsMock,
  addIconMock,
  noticeMock,
  ideaPickerOpenMock,
  capturedIdeaPicker
} = vi.hoisted(() => ({
  registerCommandsMock: vi.fn(),
  getActiveEditorMock: vi.fn(),
  enhanceGlitterSnippetsMock: vi.fn(),
  addIconMock: vi.fn(),
  noticeMock: vi.fn(),
  ideaPickerOpenMock: vi.fn(),
  capturedIdeaPicker: {
    onPick: undefined as undefined | ((ideaId: string) => Promise<void>),
    options: undefined as undefined | { mode?: string }
  }
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/commands/register-commands", async () => {
  const actual = await vi.importActual<typeof import("../../src/commands/register-commands")>(
    "../../src/commands/register-commands"
  );
  return {
    ...actual,
    registerCommands: registerCommandsMock
  };
});

vi.mock("../../src/editor/editor-integration", () => ({
  getActiveEditor: getActiveEditorMock
}));

vi.mock("../../src/editor/snippet-postprocessor", () => ({
  enhanceGlitterSnippets: enhanceGlitterSnippetsMock
}));

vi.mock("obsidian", async () => {
  const actual = await vi.importActual<typeof import("obsidian")>("obsidian");
  return {
    ...actual,
    Notice: vi.fn(function (this: unknown, message: string) {
      noticeMock(message);
    }),
    addIcon: addIconMock
  };
});

vi.mock("../../src/views/idea-picker-modal", () => ({
  IdeaPickerModal: class {
    constructor(_plugin: unknown, onPick: (ideaId: string) => Promise<void>, options?: { mode?: string }) {
      capturedIdeaPicker.onPick = onPick;
      capturedIdeaPicker.options = options;
    }

    open(): void {
      ideaPickerOpenMock();
    }
  }
}));

// 校验视图相关命令与实际打开动作之间的注册连线。
describe("view command registration", () => {
  beforeEach(() => {
    registerCommandsMock.mockReset();
    getActiveEditorMock.mockReset();
    enhanceGlitterSnippetsMock.mockReset();
    addIconMock.mockReset();
    noticeMock.mockReset();
    ideaPickerOpenMock.mockReset();
    capturedIdeaPicker.onPick = undefined;
    capturedIdeaPicker.options = undefined;
  });

  it("onunload does not detach Glitter leaves", () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const detachLeavesOfType = vi.fn();

    (plugin as unknown as {
      app: {
        workspace: {
          detachLeavesOfType: typeof detachLeavesOfType;
        };
      };
    }).app = {
      workspace: {
        detachLeavesOfType
      }
    };

    plugin.onunload();

    expect(detachLeavesOfType).not.toHaveBeenCalled();
  });

  it("savePluginSettings omits interface language before explicit persistence", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    let savedSettings: Record<string, unknown> | null = null;
    const updateSettings = vi.fn(async (mutator: (settings: Record<string, unknown>) => Record<string, unknown>) => {
      savedSettings = mutator({ showHomeRibbonIcon: true });
      return savedSettings ?? {};
    });

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      showHomeRibbonIcon: false,
      interfaceLanguage: "zh-CN"
    };
    plugin.hasPersistedInterfaceLanguageSetting = false;
    plugin.dataStore = {
      updateSettings
    } as unknown as GlitterPlugin["dataStore"];

    await plugin.savePluginSettings();

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(savedSettings).not.toHaveProperty("interfaceLanguage");
    expect(savedSettings).toMatchObject({
      showHomeRibbonIcon: false
    });
    expect(plugin.hasPersistedInterfaceLanguageSetting).toBe(false);
    expect(plugin.settings.interfaceLanguage).toBe("zh-CN");
  });

  it("savePluginSettings keeps interface language after explicit persistence", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    let savedSettings: Record<string, unknown> | null = null;
    const updateSettings = vi.fn(async (mutator: (settings: Record<string, unknown>) => Record<string, unknown>) => {
      savedSettings = mutator({ showHomeRibbonIcon: true });
      return savedSettings ?? {};
    });

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      interfaceLanguage: "en"
    };
    plugin.hasPersistedInterfaceLanguageSetting = true;
    plugin.dataStore = {
      updateSettings
    } as unknown as GlitterPlugin["dataStore"];

    await plugin.savePluginSettings();

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(savedSettings).toMatchObject({
      interfaceLanguage: "en"
    });
    expect(plugin.hasPersistedInterfaceLanguageSetting).toBe(true);
    expect(plugin.settings.interfaceLanguage).toBe("en");
  });

  it("openNativeCanvasIdeaPicker keeps the picker open when the selected idea is gone", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const getIdea = vi.fn(async () => null);
    const getPool = vi.fn(async () => null);
    const attachIdeaSourceToCanvas = vi.fn(async () => undefined);

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      interfaceLanguage: "zh-CN"
    };
    plugin.ideaService = {
      getIdea
    } as unknown as GlitterPlugin["ideaService"];
    plugin.poolService = {
      getPool
    } as unknown as GlitterPlugin["poolService"];
    plugin.poolWorkbenchWorkflow = {
      attachIdeaSourceToCanvas
    } as unknown as GlitterPlugin["poolWorkbenchWorkflow"];

    await (plugin as any).openNativeCanvasIdeaPicker({
      boardPath: "Boards/demo.canvas",
      position: { x: 120, y: 96 }
    });

    expect(ideaPickerOpenMock).toHaveBeenCalledTimes(1);
    expect(capturedIdeaPicker.options).toEqual({ mode: "canvas-block" });
    await expect(capturedIdeaPicker.onPick?.("idea-1") ?? Promise.resolve()).rejects.toThrow(
      "所选灵感已不可用，请重新选择"
    );
    expect(getPool).not.toHaveBeenCalled();
    expect(attachIdeaSourceToCanvas).not.toHaveBeenCalled();
    expect(noticeMock).toHaveBeenCalledWith("所选灵感已不可用，请重新选择");
  });

  it("openNativeCanvasIdeaPicker keeps the picker open when the selected idea pool is gone", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const getIdea = vi.fn(async () => ({
      id: "idea-1",
      poolId: "pool-missing"
    }));
    const getPool = vi.fn(async () => null);
    const attachIdeaSourceToCanvas = vi.fn(async () => undefined);

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      interfaceLanguage: "zh-CN"
    };
    plugin.ideaService = {
      getIdea
    } as unknown as GlitterPlugin["ideaService"];
    plugin.poolService = {
      getPool
    } as unknown as GlitterPlugin["poolService"];
    plugin.poolWorkbenchWorkflow = {
      attachIdeaSourceToCanvas
    } as unknown as GlitterPlugin["poolWorkbenchWorkflow"];

    await (plugin as any).openNativeCanvasIdeaPicker({
      boardPath: "Boards/demo.canvas",
      position: { x: 120, y: 96 }
    });

    await expect(capturedIdeaPicker.onPick?.("idea-1") ?? Promise.resolve()).rejects.toThrow(
      "所选灵感所属灵感池已不可用，请重新选择"
    );
    expect(attachIdeaSourceToCanvas).not.toHaveBeenCalled();
    expect(noticeMock).toHaveBeenCalledWith("所选灵感所属灵感池已不可用，请重新选择");
  });

  it("openNativeCanvasIdeaPicker forwards the selected idea into canvas insertion", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const getIdea = vi.fn(async () => ({
      id: "idea-1",
      title: "灵感标题",
      body: "灵感正文",
      poolId: "pool-1",
      contentType: "text",
      sourceUrl: "https://example.com/idea",
      attachmentPaths: ["Attachments/idea.png"]
    }));
    const getPool = vi.fn(async () => ({
      id: "pool-1",
      name: "写作池",
      color: "#7e9bda"
    }));
    const attachIdeaSourceToCanvas = vi.fn(async () => undefined);

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      interfaceLanguage: "zh-CN"
    };
    plugin.ideaService = {
      getIdea
    } as unknown as GlitterPlugin["ideaService"];
    plugin.poolService = {
      getPool
    } as unknown as GlitterPlugin["poolService"];
    plugin.poolWorkbenchWorkflow = {
      attachIdeaSourceToCanvas
    } as unknown as GlitterPlugin["poolWorkbenchWorkflow"];

    await (plugin as any).openNativeCanvasIdeaPicker({
      boardPath: "Boards/demo.canvas",
      position: { x: 120, y: 96 }
    });

    await expect(capturedIdeaPicker.onPick?.("idea-1") ?? Promise.resolve()).resolves.toBeUndefined();
    expect(attachIdeaSourceToCanvas).toHaveBeenCalledWith({
      boardPath: "Boards/demo.canvas",
      position: { x: 120, y: 96 },
      ideaId: "idea-1",
      poolId: "pool-1",
      poolName: "写作池",
      poolColor: "#7e9bda",
      title: "灵感标题",
      body: "灵感正文",
      contentType: "text",
      sourceUrl: "https://example.com/idea",
      attachmentPaths: ["Attachments/idea.png"]
    });
    expect(noticeMock).toHaveBeenCalledWith("已将灵感设为 Canvas 块标题");
  });

  it("onload auto-opens main view once when automation flag is enabled", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const activateMainView = vi.fn(async () => undefined);
    const addRibbonIcon = vi.fn(() => ({ addClass: vi.fn() }));
    const persistedData = {
      GlitterIdeaSettings: {
        ...DEFAULT_SETTINGS,
        openMainViewOnNextLoad: true
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    };
    const loadData = vi.fn(async () => persistedData);
    const saveData = vi.fn(async (data: unknown) => {
      Object.assign(persistedData, data as object);
    });

    plugin.settings = DEFAULT_SETTINGS;
    plugin.loadData = loadData;
    plugin.saveData = saveData;
    plugin.registerView = vi.fn();
    plugin.addSettingTab = vi.fn();
    plugin.registerMarkdownPostProcessor = vi.fn();
    plugin.registerEvent = vi.fn();
    plugin.activateMainView = activateMainView;
    plugin.addRibbonIcon = addRibbonIcon as unknown as GlitterPlugin["addRibbonIcon"];

    const savePluginSettingsSpy = vi.spyOn(plugin, "savePluginSettings");

    (plugin as unknown as {
      app: {
        workspace: object;
        vault: object;
      };
    }).app = {
      workspace: {
        layoutReady: true,
          on: vi.fn(() => ({})),
        onLayoutReady: vi.fn((callback: () => void) => callback()),
        getMostRecentLeaf: vi.fn(() => null),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
        detachLeavesOfType: vi.fn()
      },
      vault: {}
    };

    await plugin.onload();
    await Promise.resolve();
    await Promise.resolve();

    expect(activateMainView).toHaveBeenCalledTimes(1);
    expect(plugin.registerMarkdownPostProcessor).toHaveBeenCalledTimes(1);
    expect(addIcon).toHaveBeenCalledWith(
      "glitter-idea-plugin-sparkles",
      expect.stringContaining("font-size=\"78\"")
    );
    expect(addIcon).toHaveBeenCalledWith(
      "glitter-idea-plugin-sparkles",
      expect.stringContaining("✨")
    );
    expect(addRibbonIcon).toHaveBeenCalledWith(
      "glitter-idea-plugin-sparkles",
      "打开 Glitter",
      expect.any(Function)
    );
    expect(savePluginSettingsSpy).toHaveBeenCalledTimes(1);
    expect(loadData).toHaveBeenCalled();
    expect(saveData).toHaveBeenCalledWith({
      GlitterIdeaSettings: {
        ...DEFAULT_SETTINGS,
        openMainViewOnNextLoad: false
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [
          expect.objectContaining({
            id: DEFAULT_POOL_ID,
            name: DEFAULT_POOL_LABEL,
            isDefault: true
          })
        ],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    });
    expect(plugin.settings.openMainViewOnNextLoad).toBe(false);
  });

  it("migrates legacy plugin-folder data during onload when the current plugin id only has a fresh empty shell", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const addRibbonIcon = vi.fn(() => ({ addClass: vi.fn() }));
    const currentData = {
      GlitterIdeaSettings: {
        ...DEFAULT_SETTINGS,
        hasCompletedFirstUse: false
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [
          {
            id: DEFAULT_POOL_ID,
            name: DEFAULT_POOL_LABEL,
            isDefault: true,
            createdAt: "2026-06-04T00:00:00.000Z",
            updatedAt: "2026-06-04T00:00:00.000Z"
          }
        ],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    };
    const legacyData = {
      glitterIdeaSettings: {
        ...DEFAULT_SETTINGS,
        hasCompletedFirstUse: true
      },
      glitterIdeaSnapshot: {
        version: 1,
        ideas: [
          {
            id: "idea-legacy",
            title: "旧灵感",
            body: "body",
            poolId: DEFAULT_POOL_ID,
            contentType: "text",
            sourceType: "quick-capture",
            attachmentPaths: [],
            tags: [],
            quoted: false,
            fileCreated: false,
            inbox: true,
            snippetRefs: [],
            createdAt: "2026-06-04T00:00:00.000Z",
            updatedAt: "2026-06-04T00:00:00.000Z"
          }
        ],
        pools: [
          {
            id: DEFAULT_POOL_ID,
            name: DEFAULT_POOL_LABEL,
            isDefault: true,
            createdAt: "2026-06-04T00:00:00.000Z",
            updatedAt: "2026-06-04T00:00:00.000Z"
          }
        ],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    };
    const loadData = vi.fn(async () => currentData);
    const saveData = vi.fn(async () => undefined);
    const exists = vi.fn(async (path: string) => path === ".obsidian/plugins/glitter-idea-plugin/data.json");
    const read = vi.fn(async () => JSON.stringify(legacyData));

    plugin.settings = DEFAULT_SETTINGS;
    plugin.loadData = loadData;
    plugin.saveData = saveData;
    plugin.registerView = vi.fn();
    plugin.addSettingTab = vi.fn();
    plugin.registerMarkdownPostProcessor = vi.fn();
    plugin.registerEvent = vi.fn();
    plugin.activateMainView = vi.fn(async () => undefined);
    plugin.addRibbonIcon = addRibbonIcon as unknown as GlitterPlugin["addRibbonIcon"];
    (plugin as unknown as { manifest: GlitterPlugin["manifest"] }).manifest = {
      id: "glitter-idea"
    } as GlitterPlugin["manifest"];

    (plugin as unknown as {
      app: {
        workspace: object;
        vault: {
          configDir: string;
          adapter: {
            exists: typeof exists;
            read: typeof read;
          };
        };
      };
    }).app = {
      workspace: {
        layoutReady: true,
          on: vi.fn(() => ({})),
        onLayoutReady: vi.fn((callback: () => void) => callback()),
        getMostRecentLeaf: vi.fn(() => null),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
        detachLeavesOfType: vi.fn()
      },
      vault: {
        configDir: ".obsidian",
        adapter: {
          exists,
          read
        }
      }
    };

    await plugin.onload();

    expect(loadData).toHaveBeenCalled();
    expect(exists).toHaveBeenCalledWith(".obsidian/plugins/glitter/data.json");
    expect(exists).toHaveBeenCalledWith(".obsidian/plugins/glitter-idea-plugin/data.json");
    expect(read).toHaveBeenCalledWith(".obsidian/plugins/glitter-idea-plugin/data.json");
    expect(saveData).toHaveBeenCalledWith(legacyData);
    expect(plugin.settings.hasCompletedFirstUse).toBe(true);
  });

  it("passes idea existence and pool-label resolvers into the markdown snippet postprocessor", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const addRibbonIcon = vi.fn(() => ({ addClass: vi.fn() }));
    const persistedData = {
      GlitterIdeaSettings: {
        ...DEFAULT_SETTINGS,
        hasCompletedFirstUse: true
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [
          {
            id: "idea-1",
            title: "已有灵感",
            body: "body",
            poolId: DEFAULT_POOL_ID,
            contentType: "text",
            sourceType: "quick-capture",
            attachmentPaths: [],
            tags: [],
            quoted: false,
            fileCreated: false,
            inbox: true,
            snippetRefs: [],
            createdAt: "2026-04-18T00:00:00.000Z",
            updatedAt: "2026-04-18T00:00:00.000Z"
          }
        ],
        pools: [],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    };
    const loadData = vi.fn(async () => persistedData);
    const saveData = vi.fn(async (data: unknown) => {
      Object.assign(persistedData, data as object);
    });

    plugin.settings = DEFAULT_SETTINGS;
    plugin.loadData = loadData;
    plugin.saveData = saveData;
    plugin.registerView = vi.fn();
    plugin.addSettingTab = vi.fn();
    plugin.registerMarkdownPostProcessor = vi.fn();
    plugin.registerEvent = vi.fn();
    plugin.activateMainView = vi.fn(async () => undefined);
    plugin.addRibbonIcon = addRibbonIcon as unknown as GlitterPlugin["addRibbonIcon"];

    (plugin as unknown as {
      app: {
        workspace: object;
        vault: object;
      };
    }).app = {
      workspace: {
        layoutReady: true,
          on: vi.fn(() => ({})),
        onLayoutReady: vi.fn((callback: () => void) => callback()),
        getMostRecentLeaf: vi.fn(() => null),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
        detachLeavesOfType: vi.fn()
      },
      vault: {}
    };

    await plugin.onload();

    const postProcessor = (plugin.registerMarkdownPostProcessor as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(typeof postProcessor).toBe("function");

    const containerEl = {};
    await postProcessor?.(containerEl);

    expect(enhanceGlitterSnippetsMock).toHaveBeenCalledTimes(1);
    expect(enhanceGlitterSnippetsMock).toHaveBeenCalledWith(
      containerEl,
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );

    const resolveIdeaExists = enhanceGlitterSnippetsMock.mock.calls[0]?.[2] as
      | ((ideaId: string) => Promise<boolean>)
      | undefined;
    expect(resolveIdeaExists).toBeTypeOf("function");
    await expect(resolveIdeaExists?.("idea-1") ?? Promise.resolve(false)).resolves.toBe(true);
    await expect(resolveIdeaExists?.("idea-missing") ?? Promise.resolve(true)).resolves.toBe(false);

    const resolveIdeaPoolLabel = enhanceGlitterSnippetsMock.mock.calls[0]?.[3] as
      | ((ideaId: string) => Promise<string | null>)
      | undefined;
    expect(resolveIdeaPoolLabel).toBeTypeOf("function");
    await expect(resolveIdeaPoolLabel?.("idea-1") ?? Promise.resolve(null)).resolves.toBe(DEFAULT_POOL_LABEL);
    await expect(resolveIdeaPoolLabel?.("idea-missing") ?? Promise.resolve("missing")).resolves.toBeNull();
  });

  it("infers first-use completion from persisted ideas and saves the flag on load", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const addRibbonIcon = vi.fn(() => ({ addClass: vi.fn() }));
    const persistedData = {
      GlitterIdeaSettings: {
        ...DEFAULT_SETTINGS,
        hasCompletedFirstUse: false
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [
          {
            id: "idea-1",
            title: "已有灵感",
            body: "body",
            poolId: DEFAULT_POOL_ID,
            contentType: "text",
            sourceType: "quick-capture",
            attachmentPaths: [],
            tags: [],
            createdAt: "2026-04-18T00:00:00.000Z",
            updatedAt: "2026-04-18T00:00:00.000Z"
          }
        ],
        pools: [],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    };
    const loadData = vi.fn(async () => persistedData);
    const saveData = vi.fn(async (data: unknown) => {
      Object.assign(persistedData, data as object);
    });

    plugin.settings = DEFAULT_SETTINGS;
    plugin.loadData = loadData;
    plugin.saveData = saveData;
    plugin.registerView = vi.fn();
    plugin.addSettingTab = vi.fn();
    plugin.registerMarkdownPostProcessor = vi.fn();
    plugin.registerEvent = vi.fn();
    plugin.activateMainView = vi.fn(async () => undefined);
    plugin.addRibbonIcon = addRibbonIcon as unknown as GlitterPlugin["addRibbonIcon"];

    (plugin as unknown as {
      app: {
        workspace: object;
        vault: object;
      };
    }).app = {
      workspace: {
        layoutReady: true,
          on: vi.fn(() => ({})),
        onLayoutReady: vi.fn((callback: () => void) => callback()),
        getMostRecentLeaf: vi.fn(() => null),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
        detachLeavesOfType: vi.fn()
      },
      vault: {}
    };

    await plugin.onload();

    expect(loadData).toHaveBeenCalled();
    expect(saveData).toHaveBeenCalledWith(
      expect.objectContaining({
        GlitterIdeaSettings: expect.objectContaining({
          hasCompletedFirstUse: true
        })
      })
    );
    expect(plugin.settings.hasCompletedFirstUse).toBe(true);
  });

  it("infers first-use completion from non-default pool even when there are no ideas", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const addRibbonIcon = vi.fn(() => ({ addClass: vi.fn() }));
    const persistedData = {
      GlitterIdeaSettings: {
        ...DEFAULT_SETTINGS,
        hasCompletedFirstUse: false
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [
          {
            id: "pool-1",
            name: "写作池",
            isDefault: false,
            color: "#7e9bda",
            createdAt: "2026-04-18T00:00:00.000Z",
            updatedAt: "2026-04-18T00:00:00.000Z"
          }
        ],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    };
    const loadData = vi.fn(async () => persistedData);
    const saveData = vi.fn(async (data: unknown) => {
      Object.assign(persistedData, data as object);
    });

    plugin.settings = DEFAULT_SETTINGS;
    plugin.loadData = loadData;
    plugin.saveData = saveData;
    plugin.registerView = vi.fn();
    plugin.addSettingTab = vi.fn();
    plugin.registerMarkdownPostProcessor = vi.fn();
    plugin.registerEvent = vi.fn();
    plugin.activateMainView = vi.fn(async () => undefined);
    plugin.addRibbonIcon = addRibbonIcon as unknown as GlitterPlugin["addRibbonIcon"];

    (plugin as unknown as {
      app: {
        workspace: object;
        vault: object;
      };
    }).app = {
      workspace: {
        layoutReady: true,
          on: vi.fn(() => ({})),
        onLayoutReady: vi.fn((callback: () => void) => callback()),
        getMostRecentLeaf: vi.fn(() => null),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
        detachLeavesOfType: vi.fn()
      },
      vault: {}
    };

    await plugin.onload();

    expect(plugin.settings.hasCompletedFirstUse).toBe(true);
  });

  it("does not fail onload when inferred completion persistence fails", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const addRibbonIcon = vi.fn(() => ({ addClass: vi.fn() }));
    const persistedData = {
      GlitterIdeaSettings: {
        ...DEFAULT_SETTINGS,
        hasCompletedFirstUse: false
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [
          {
            id: "pool-1",
            name: "写作池",
            isDefault: false,
            color: "#7e9bda",
            createdAt: "2026-04-18T00:00:00.000Z",
            updatedAt: "2026-04-18T00:00:00.000Z"
          }
        ],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    };
    const loadData = vi.fn(async () => persistedData);
    const saveData = vi
      .fn()
      .mockRejectedValueOnce(new Error("persist failed"))
      .mockImplementation(async (data: unknown) => {
        Object.assign(persistedData, data as object);
      });

    plugin.settings = DEFAULT_SETTINGS;
    plugin.loadData = loadData;
    plugin.saveData = saveData;
    plugin.registerView = vi.fn();
    plugin.addSettingTab = vi.fn();
    plugin.registerMarkdownPostProcessor = vi.fn();
    plugin.registerEvent = vi.fn();
    plugin.activateMainView = vi.fn(async () => undefined);
    plugin.addRibbonIcon = addRibbonIcon as unknown as GlitterPlugin["addRibbonIcon"];

    (plugin as unknown as {
      app: {
        workspace: object;
        vault: object;
      };
    }).app = {
      workspace: {
        layoutReady: true,
          on: vi.fn(() => ({})),
        onLayoutReady: vi.fn((callback: () => void) => callback()),
        getMostRecentLeaf: vi.fn(() => null),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
        detachLeavesOfType: vi.fn()
      },
      vault: {}
    };

    await expect(plugin.onload()).resolves.toBeUndefined();
    expect(plugin.settings.hasCompletedFirstUse).toBe(true);
  });

  it("registers a sparkles ribbon entry that opens the main view", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    const ribbonClick = vi.fn();
    const addRibbonIcon = vi.fn((icon, title, callback) => {
      ribbonClick.mockImplementation(callback);
      return { addClass: vi.fn() };
    });

    plugin.settings = DEFAULT_SETTINGS;
    plugin.loadData = vi.fn(async () => ({
      GlitterIdeaSettings: DEFAULT_SETTINGS,
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    }));
    plugin.saveData = vi.fn(async () => undefined);
    plugin.registerView = vi.fn();
    plugin.addSettingTab = vi.fn();
    plugin.registerMarkdownPostProcessor = vi.fn();
    plugin.registerEvent = vi.fn();
    plugin.activateMainView = vi.fn(async () => undefined);
    plugin.addRibbonIcon = addRibbonIcon as unknown as GlitterPlugin["addRibbonIcon"];

    (plugin as unknown as {
      app: {
        workspace: object;
        vault: object;
      };
    }).app = {
      workspace: {
        layoutReady: true,
          on: vi.fn(() => ({})),
        onLayoutReady: vi.fn((callback: () => void) => callback()),
        getMostRecentLeaf: vi.fn(() => null),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
        detachLeavesOfType: vi.fn()
      },
      vault: {}
    };

    await plugin.onload();

    expect(addRibbonIcon).toHaveBeenCalledWith(
      "glitter-idea-plugin-sparkles",
      "打开 Glitter",
      expect.any(Function)
    );

    await ribbonClick();
    expect(plugin.activateMainView).toHaveBeenCalledTimes(1);
  });

  it("registerOpenMainViewCommand registers open-main-view and routes to activateMainView", async () => {
    let registeredCommand: { id: string; callback: () => Promise<void> } | undefined;
    const activateMainView = vi.fn(async () => {});

    const plugin = {
      addCommand(command: { id: string; callback: () => Promise<void> }) {
        registeredCommand = command;
      },
      activateMainView,
      addRibbonIcon: vi.fn(() => ({ addClass: vi.fn() })),
      app: {
        workspace: {
          layoutReady: true,
          on: vi.fn(() => ({})),
          onLayoutReady: vi.fn(),
          getMostRecentLeaf: vi.fn(() => null),
          getLeavesOfType: vi.fn(() => []),
          getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
          setActiveLeaf: vi.fn(),
          revealLeaf: vi.fn(),
          detachLeavesOfType: vi.fn()
        }
      }
    };

    registerOpenMainViewCommand(plugin as any);

    expect(registeredCommand?.id).toBe("open-main-view");
    await registeredCommand?.callback();
    expect(activateMainView).toHaveBeenCalledTimes(1);
  });

  it("registerOpenSearchViewCommand registers open-search-view", () => {
    let registeredCommand: { id: string } | undefined;

    const plugin = {
      addCommand(command: { id: string }) {
        registeredCommand = command;
      },
      addRibbonIcon: vi.fn(() => ({ addClass: vi.fn() })),
      app: {
        workspace: {
          layoutReady: true,
          on: vi.fn(() => ({})),
          onLayoutReady: vi.fn(),
          getMostRecentLeaf: vi.fn(() => null),
          getLeavesOfType: vi.fn(() => []),
          getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
          setActiveLeaf: vi.fn(),
          revealLeaf: vi.fn(),
          detachLeavesOfType: vi.fn()
        }
      }
    };

    registerOpenSearchViewCommand(plugin as any);

    expect(registeredCommand?.id).toBe("open-search-view");
  });

  it("search command callback routes to activateSearchView", async () => {
    let registeredCommand: { callback: () => Promise<void> } | undefined;
    const activateSearchView = vi.fn(async () => {});

    const plugin = {
      addCommand(command: { callback: () => Promise<void> }) {
        registeredCommand = command;
      },
      activateSearchView,
      addRibbonIcon: vi.fn(() => ({ addClass: vi.fn() })),
      app: {
        workspace: {
          layoutReady: true,
          on: vi.fn(() => ({})),
          onLayoutReady: vi.fn(),
          getMostRecentLeaf: vi.fn(() => null),
          getLeavesOfType: vi.fn(() => []),
          getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
          setActiveLeaf: vi.fn(),
          revealLeaf: vi.fn(),
          detachLeavesOfType: vi.fn()
        }
      }
    };

    registerOpenSearchViewCommand(plugin as any);

    await registeredCommand?.callback();

    expect(activateSearchView).toHaveBeenCalledTimes(1);
  });

  it("pool command registers open-pool-view and routes to activatePoolView", async () => {
    let registeredCommand: { id: string; name: string; callback: () => Promise<void> } | undefined;
    const activatePoolView = vi.fn(async () => {});

    const plugin = {
      addCommand(command: { id: string; name: string; callback: () => Promise<void> }) {
        registeredCommand = command;
      },
      activatePoolView,
      app: {
        workspace: {
          layoutReady: true,
          on: vi.fn(() => ({})),
          onLayoutReady: vi.fn(),
          getMostRecentLeaf: vi.fn(() => null),
          getLeavesOfType: vi.fn(() => []),
          getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
          setActiveLeaf: vi.fn(),
          revealLeaf: vi.fn(),
          detachLeavesOfType: vi.fn()
        }
      }
    };

    registerOpenPoolViewCommand(plugin as any);

    expect(registeredCommand?.id).toBe("open-pool-view");
    expect(registeredCommand?.name).toBe("Open Glitter pool view");
    await registeredCommand?.callback();

    expect(activatePoolView).toHaveBeenCalledTimes(1);
  });

});
