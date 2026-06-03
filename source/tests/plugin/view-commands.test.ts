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
const { registerCommandsMock, getActiveEditorMock, enhanceGlitterSnippetsMock, addIconMock } = vi.hoisted(() => ({
  registerCommandsMock: vi.fn(),
  getActiveEditorMock: vi.fn(),
  enhanceGlitterSnippetsMock: vi.fn(),
  addIconMock: vi.fn()
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
    addIcon: addIconMock
  };
});

// 校验视图相关命令与实际打开动作之间的注册连线。
describe("view command registration", () => {
  beforeEach(() => {
    registerCommandsMock.mockReset();
    getActiveEditorMock.mockReset();
    enhanceGlitterSnippetsMock.mockReset();
    addIconMock.mockReset();
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
        lastSelectedPoolId: null
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
        lastSelectedPoolId: null
      }
    });
    expect(plugin.settings.openMainViewOnNextLoad).toBe(false);
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
        lastSelectedPoolId: null
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
        lastSelectedPoolId: null
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
        lastSelectedPoolId: null
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
        lastSelectedPoolId: null
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
        lastSelectedPoolId: null
      }
    }));
    plugin.saveData = vi.fn(async () => undefined);
    plugin.registerView = vi.fn();
    plugin.addSettingTab = vi.fn();
    plugin.registerMarkdownPostProcessor = vi.fn();
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
