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
 * 保护各页面 host 的挂载连线相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import GlitterPlugin from "../../src/plugin/GlitterPlugin";
import { registerOpenSearchViewCommand } from "../../src/commands/open-search-view-command";
import { MAIN_VIEW_TYPE, POOL_VIEW_TYPE, SEARCH_VIEW_TYPE } from "../../src/plugin/constants";
import { GlitterPoolView } from "../../src/views/pool-view";

// 校验页面 host 与具体状态构造器、渲染器之间的装配连线。
describe("page host wiring", () => {
  it("exposes stable main/search/pool view type IDs", () => {
    expect(MAIN_VIEW_TYPE).toBe("glitter-main-view");
    expect(SEARCH_VIEW_TYPE).toBe("glitter-search-view");
    expect(POOL_VIEW_TYPE).toBe("glitter-pool-view");
  });

  it("GlitterPlugin prototype exposes view activation helpers", () => {
    expect(typeof GlitterPlugin.prototype.activateMainView).toBe("function");
    expect(typeof GlitterPlugin.prototype.activateSearchView).toBe("function");
    expect(typeof GlitterPlugin.prototype.activatePoolView).toBe("function");
    expect(typeof GlitterPlugin.prototype.focusIdeaById).toBe("function");
    expect(typeof GlitterPlugin.prototype.refreshOpenMarkdownPreviews).toBe("function");
    expect(typeof GlitterPlugin.prototype.refreshOpenPoolViews).toBe("function");
  });

  it("forces full rerender on open markdown previews so moved or deleted snippet state refreshes", () => {
    const rerenderA = vi.fn();
    const rerenderB = vi.fn();
    const getLeavesOfType = vi.fn((viewType: string) => {
      if (viewType !== "markdown") {
        return [];
      }

      return [
        { view: { previewMode: { rerender: rerenderA } } },
        { view: { previewMode: { rerender: rerenderB } } },
        { view: {} }
      ];
    });
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;

    (plugin as unknown as {
      app: {
        workspace: {
          getLeavesOfType: (viewType: string) => unknown[];
        };
      };
    }).app = {
      workspace: {
        getLeavesOfType
      }
    };

    plugin.refreshOpenMarkdownPreviews();

    expect(getLeavesOfType).toHaveBeenCalledWith("markdown");
    expect(rerenderA).toHaveBeenCalledTimes(1);
    expect(rerenderA).toHaveBeenCalledWith(true);
    expect(rerenderB).toHaveBeenCalledTimes(1);
    expect(rerenderB).toHaveBeenCalledWith(true);
  });

  it("refreshes already open pool views without changing navigation", () => {
    const refreshAfterExternalIdeaMutation = vi.fn();
    const poolView = Object.create(GlitterPoolView.prototype) as GlitterPoolView;
    poolView.refreshAfterExternalIdeaMutation = refreshAfterExternalIdeaMutation;
    const getLeavesOfType = vi.fn((viewType: string) => {
      if (viewType !== POOL_VIEW_TYPE) {
        return [];
      }

      return [{ view: poolView }, { view: {} }];
    });
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;

    (plugin as unknown as {
      app: {
        workspace: {
          getLeavesOfType: (viewType: string) => unknown[];
        };
      };
    }).app = {
      workspace: {
        getLeavesOfType
      }
    };

    plugin.refreshOpenPoolViews();

    expect(getLeavesOfType).toHaveBeenCalledWith(POOL_VIEW_TYPE);
    expect(refreshAfterExternalIdeaMutation).toHaveBeenCalledTimes(1);
  });

  it("activates main, search, and pool views through one reusable workspace leaf", async () => {
    const setViewState = vi.fn(async () => undefined);
    const setActiveLeaf = vi.fn();
    const revealLeaf = vi.fn();
    const leaf = {
      setViewState,
      view: {
        getViewType: () => MAIN_VIEW_TYPE
      }
    };
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;

    ;(plugin as unknown as {
      app: {
        workspace: {
          getMostRecentLeaf: () => unknown;
          getLeavesOfType: (viewType: string) => unknown[];
          getLeaf: (newLeaf?: boolean) => unknown;
          setActiveLeaf: (target: unknown, options?: { focus?: boolean }) => void;
          revealLeaf: (target: unknown) => void;
        };
      };
    }).app = {
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => leaf),
        setActiveLeaf,
        revealLeaf
      }
    };

    await plugin.activateMainView();
    await plugin.activateSearchView();
    await plugin.activatePoolView();

    expect(setViewState).toHaveBeenNthCalledWith(1, { type: MAIN_VIEW_TYPE, active: true });
    expect(setViewState).toHaveBeenNthCalledWith(2, { type: SEARCH_VIEW_TYPE, active: true });
    expect(setViewState).toHaveBeenNthCalledWith(3, { type: POOL_VIEW_TYPE, active: true, state: {} });
    expect(setActiveLeaf).toHaveBeenCalledTimes(3);
    expect(setActiveLeaf).toHaveBeenNthCalledWith(1, leaf, { focus: true });
    expect(revealLeaf).toHaveBeenCalledTimes(3);
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
  });

  it("activateSearchView passes query state when an initial query is provided", async () => {
    const setViewState = vi.fn(async () => undefined);
    const setActiveLeaf = vi.fn();
    const revealLeaf = vi.fn();
    const leaf = {
      setViewState,
      view: {
        getViewType: () => MAIN_VIEW_TYPE
      }
    };
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;

    (plugin as unknown as {
      app: {
        workspace: {
          getMostRecentLeaf: () => unknown;
          getLeavesOfType: (viewType: string) => unknown[];
          getLeaf: (newLeaf?: boolean) => unknown;
          setActiveLeaf: (target: unknown, options?: { focus?: boolean }) => void;
          revealLeaf: (target: unknown) => void;
        };
      };
    }).app = {
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => leaf),
        setActiveLeaf,
        revealLeaf
      }
    };

    await plugin.activateSearchView("来自首页");

    expect(setViewState).toHaveBeenCalledWith({
      type: SEARCH_VIEW_TYPE,
      active: true,
      state: { query: "来自首页" }
    });
    expect(setActiveLeaf).toHaveBeenCalledWith(leaf, { focus: true });
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
  });

  it("focusIdeaById switches active pool and opens pool view for snippet jump-back", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    plugin.editorWorkflow = {
      resolveSnippetTarget: vi.fn(async () => ({
        ideaId: "idea-1",
        poolId: "pool-product"
      }))
    } as any;
    plugin.poolWorkbenchWorkflow = {
      setActivePoolId: vi.fn(async () => undefined)
    } as any;
    plugin.activatePoolView = vi.fn(async () => undefined);
    plugin.focusedIdeaId = null;
    plugin.pendingFocusedPoolId = null;

    await plugin.focusIdeaById("idea-1");

    expect(plugin.editorWorkflow.resolveSnippetTarget).toHaveBeenCalledWith("idea-1");
    expect(plugin.poolWorkbenchWorkflow.setActivePoolId).not.toHaveBeenCalled();
    expect(plugin.focusedIdeaId).toBe("idea-1");
    expect(plugin.pendingFocusedPoolId).toBe("pool-product");
    expect(plugin.activatePoolView).toHaveBeenCalledTimes(1);
    expect(plugin.activatePoolView).toHaveBeenCalledWith({
      poolId: "pool-product",
      mode: "browse"
    });
  });

  it("focusIdeaById does nothing when snippet target cannot be resolved", async () => {
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;
    plugin.editorWorkflow = {
      resolveSnippetTarget: vi.fn(async () => null)
    } as any;
    plugin.poolWorkbenchWorkflow = {
      setActivePoolId: vi.fn(async () => undefined)
    } as any;
    plugin.activatePoolView = vi.fn(async () => undefined);
    plugin.focusedIdeaId = "idea-existing";
    plugin.pendingFocusedPoolId = "pool-existing";

    await plugin.focusIdeaById("idea-missing");

    expect(plugin.editorWorkflow.resolveSnippetTarget).toHaveBeenCalledWith("idea-missing");
    expect(plugin.poolWorkbenchWorkflow.setActivePoolId).not.toHaveBeenCalled();
    expect(plugin.activatePoolView).not.toHaveBeenCalled();
    expect(plugin.focusedIdeaId).toBe("idea-existing");
    expect(plugin.pendingFocusedPoolId).toBe("pool-existing");
  });

  it("writes pool navigation state through setViewState even when reusing an existing pool leaf", async () => {
    const setViewState = vi.fn(async () => undefined);
    const setActiveLeaf = vi.fn();
    const revealLeaf = vi.fn();
    const getViewType = vi.fn(() => POOL_VIEW_TYPE);
    const leaf = {
      setViewState,
      view: {
        getViewType
      }
    };
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;

    (plugin as unknown as {
      app: {
        workspace: {
          getMostRecentLeaf: () => unknown;
          getLeavesOfType: (viewType: string) => unknown[];
          getLeaf: (newLeaf?: boolean) => unknown;
          setActiveLeaf: (target: unknown, options?: { focus?: boolean }) => void;
          revealLeaf: (target: unknown) => void;
        };
      };
    }).app = {
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => leaf),
        setActiveLeaf,
        revealLeaf
      }
    };

    expect(leaf.view.getViewType()).toBe(POOL_VIEW_TYPE);

    await plugin.activatePoolView({ poolId: "pool-product", resetFilters: true });

    expect(setViewState).toHaveBeenCalledWith({
      type: POOL_VIEW_TYPE,
      active: true,
      state: { poolId: "pool-product", resetFilters: true }
    });
    expect(setActiveLeaf).toHaveBeenCalledWith(leaf, { focus: true });
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
  });

  it("activates pool view with navigation state payload", async () => {
    const setViewState = vi.fn(async () => undefined);
    const setActiveLeaf = vi.fn();
    const revealLeaf = vi.fn();
    const leaf = {
      setViewState,
      view: {
        getViewType: () => MAIN_VIEW_TYPE
      }
    };
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;

    (plugin as unknown as {
      app: {
        workspace: {
          getMostRecentLeaf: () => unknown;
          getLeavesOfType: (viewType: string) => unknown[];
          getLeaf: (newLeaf?: boolean) => unknown;
          setActiveLeaf: (target: unknown, options?: { focus?: boolean }) => void;
          revealLeaf: (target: unknown) => void;
        };
      };
    }).app = {
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => leaf),
        setActiveLeaf,
        revealLeaf
      }
    };

    await plugin.activatePoolView({ poolId: "pool-product", resetFilters: true });

    expect(setViewState).toHaveBeenCalledWith({
      type: POOL_VIEW_TYPE,
      active: true,
      state: { poolId: "pool-product", resetFilters: true }
    });
    expect(setActiveLeaf).toHaveBeenCalledWith(leaf, { focus: true });
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
  });

  it("writes overview navigation state when opening pool view without poolId", async () => {
    const setViewState = vi.fn(async () => undefined);
    const setActiveLeaf = vi.fn();
    const revealLeaf = vi.fn();
    const leaf = {
      setViewState,
      view: {
        getViewType: () => MAIN_VIEW_TYPE
      }
    };
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;

    (plugin as unknown as {
      app: {
        workspace: {
          getMostRecentLeaf: () => unknown;
          getLeavesOfType: (viewType: string) => unknown[];
          getLeaf: (newLeaf?: boolean) => unknown;
          setActiveLeaf: (target: unknown, options?: { focus?: boolean }) => void;
          revealLeaf: (target: unknown) => void;
        };
      };
    }).app = {
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => leaf),
        setActiveLeaf,
        revealLeaf
      }
    };

    await plugin.activatePoolView({ resetFilters: true });

    expect(setViewState).toHaveBeenCalledWith({
      type: POOL_VIEW_TYPE,
      active: true,
      state: { resetFilters: true }
    });
    expect(setActiveLeaf).toHaveBeenCalledWith(leaf, { focus: true });
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
  });

  it("does not focus or reveal a pool leaf when setViewState fails", async () => {
    const setViewState = vi.fn(async () => {
      throw new Error("setViewState failed");
    });
    const setActiveLeaf = vi.fn();
    const revealLeaf = vi.fn();
    const leaf = {
      setViewState,
      view: {
        getViewType: () => MAIN_VIEW_TYPE
      }
    };
    const plugin = Object.create(GlitterPlugin.prototype) as GlitterPlugin;

    (plugin as unknown as {
      app: {
        workspace: {
          getMostRecentLeaf: () => unknown;
          getLeavesOfType: (viewType: string) => unknown[];
          getLeaf: (newLeaf?: boolean) => unknown;
          setActiveLeaf: (target: unknown, options?: { focus?: boolean }) => void;
          revealLeaf: (target: unknown) => void;
        };
      };
    }).app = {
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeavesOfType: vi.fn(() => []),
        getLeaf: vi.fn(() => leaf),
        setActiveLeaf,
        revealLeaf
      }
    };

    await expect(plugin.activatePoolView({ poolId: "pool-product", resetFilters: true })).rejects.toThrow(
      "setViewState failed"
    );

    expect(setActiveLeaf).not.toHaveBeenCalled();
    expect(revealLeaf).not.toHaveBeenCalled();
  });

  it("registers the open search command through plugin.activateSearchView", async () => {
    const activateSearchView = vi.fn(async () => undefined);
    const addCommand = vi.fn();
    const plugin = {
      activateSearchView,
      addCommand
    } as unknown as GlitterPlugin;

    registerOpenSearchViewCommand(plugin);

    expect(addCommand).toHaveBeenCalledTimes(1);
    const command = addCommand.mock.calls[0]?.[0] as {
      id: string;
      name: string;
      callback: () => Promise<void>;
    };
    expect(command.id).toBe("open-search-view");
    expect(command.name).toBe("Open Glitter search view");

    await command.callback();
    expect(activateSearchView).toHaveBeenCalledTimes(1);
  });
});
