/**
 * 保护插件数据存储的持久化读写相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import { createPluginDataStore } from "../../src/storage/plugin-data-store";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createPluginDataStore", () => {
  it("loads empty snapshot when plugin has no persisted data", async () => {
    const store = createPluginDataStore({
      async loadData() {
        return null;
      },
      async saveData() {
        return;
      }
    });

    await expect(store.load()).resolves.toEqual({
      settings: {},
      snapshot: {
        version: 1,
        ideas: [],
        pools: [],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    });
  });

  it("keeps legacy settings payload without losing fields", async () => {
    const store = createPluginDataStore({
      async loadData() {
        return {
          enableQuickCapture: false,
          referencedIdeaEmoji: "⭐"
        };
      },
      async saveData() {
        return;
      }
    });

    const loaded = await store.load();

    expect(loaded.settings).toEqual({
      enableQuickCapture: false,
      referencedIdeaEmoji: "⭐"
    });
    expect(loaded.snapshot).toEqual({
      version: 1,
      ideas: [],
      pools: [],
      lastSelectedPoolId: null,
      managedCanvasPaths: []
    });
  });

  it("loads wrapped settings and snapshot and saves with wrapped shape", async () => {
    const saveData = vi.fn(async () => undefined);
    const store = createPluginDataStore({
      async loadData() {
        return {
          GlitterIdeaSettings: {
            enableQuickCapture: true
          },
          GlitterIdeaSnapshot: {
            version: 999,
            ideas: [{ id: "idea-1" }],
            pools: [{ id: "pool-1" }],
            lastSelectedPoolId: "pool-1"
          }
        };
      },
      saveData
    });

    const loaded = await store.load();
    expect(loaded).toEqual({
      settings: {
        enableQuickCapture: true
      },
      snapshot: {
        version: 1,
        ideas: [{ id: "idea-1" }],
        pools: [{ id: "pool-1" }],
        lastSelectedPoolId: "pool-1",
        managedCanvasPaths: []
      }
    });

    await store.save(loaded);

    expect(saveData).toHaveBeenCalledWith({
      GlitterIdeaSettings: {
        enableQuickCapture: true
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [{ id: "idea-1" }],
        pools: [{ id: "pool-1" }],
        lastSelectedPoolId: "pool-1",
        managedCanvasPaths: []
      }
    });
  });

  it("normalizes managed canvas registry paths in snapshot", async () => {
    const store = createPluginDataStore({
      async loadData() {
        return {
          GlitterIdeaSettings: {},
          GlitterIdeaSnapshot: {
            version: 1,
            ideas: [],
            pools: [],
            lastSelectedPoolId: null,
            managedCanvasPaths: ["Boards/native.canvas", "", "Boards/native.canvas", 42, "Boards/extra.canvas"]
          }
        };
      },
      async saveData() {
        return;
      }
    });

    await expect(store.load()).resolves.toEqual({
      settings: {},
      snapshot: {
        version: 1,
        ideas: [],
        pools: [],
        lastSelectedPoolId: null,
        managedCanvasPaths: ["Boards/native.canvas", "Boards/extra.canvas"]
      }
    });
  });

  it("loads legacy wrapped settings and snapshot and rewrites them with the current keys", async () => {
    const saveData = vi.fn(async () => undefined);
    const store = createPluginDataStore({
      async loadData() {
        return {
          glitterIdeaSettings: {
            enableQuickCapture: true
          },
          glitterIdeaSnapshot: {
            version: 999,
            ideas: [{ id: "idea-legacy" }],
            pools: [{ id: "pool-legacy" }],
            lastSelectedPoolId: "pool-legacy"
          }
        };
      },
      saveData
    });

    const loaded = await store.load();
    expect(loaded).toEqual({
      settings: {
        enableQuickCapture: true
      },
      snapshot: {
        version: 1,
        ideas: [{ id: "idea-legacy" }],
        pools: [{ id: "pool-legacy" }],
        lastSelectedPoolId: "pool-legacy",
        managedCanvasPaths: []
      }
    });

    await store.save(loaded);

    expect(saveData).toHaveBeenCalledWith({
      GlitterIdeaSettings: {
        enableQuickCapture: true
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [{ id: "idea-legacy" }],
        pools: [{ id: "pool-legacy" }],
        lastSelectedPoolId: "pool-legacy",
        managedCanvasPaths: []
      }
    });
  });

  it("mutates snapshot while preserving settings", async () => {
    let persisted: unknown = {
      GlitterIdeaSettings: {
        createdIdeaEmoji: "✨"
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [],
        lastSelectedPoolId: null
      }
    };

    const store = createPluginDataStore<{ id: string }, { id: string }>({
      async loadData() {
        return persisted;
      },
      async saveData(data) {
        persisted = data;
      }
    });

    await store.mutate((snapshot) => ({
      ...snapshot,
      ideas: [...snapshot.ideas, { id: "idea-1" }],
      pools: [...snapshot.pools, { id: "pool-1" }],
      lastSelectedPoolId: "pool-1"
    }));

    await expect(store.load()).resolves.toEqual({
      settings: {
        createdIdeaEmoji: "✨"
      },
      snapshot: {
        version: 1,
        ideas: [{ id: "idea-1" }],
        pools: [{ id: "pool-1" }],
        lastSelectedPoolId: "pool-1",
        managedCanvasPaths: []
      }
    });
  });

  it("deep clones nested settings and snapshot data on load and save", async () => {
    let persisted: unknown = {
      GlitterIdeaSettings: {
        appearance: {
          accents: ["blue"]
        }
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [{ id: "idea-1", meta: { tags: ["initial"] } }],
        pools: [{ id: "pool-1", config: { colors: ["#4A5F84"] } }],
        lastSelectedPoolId: "pool-1"
      }
    };

    const store = createPluginDataStore<
      { id: string; meta: { tags: string[] } },
      { id: string; config: { colors: string[] } }
    >({
      async loadData() {
        return persisted;
      },
      async saveData(data) {
        persisted = data;
      }
    });

    const loaded = await store.load();
    (loaded.settings as { appearance: { accents: string[] } }).appearance.accents.push("mutated");
    loaded.snapshot.ideas[0].meta.tags.push("outside");
    loaded.snapshot.pools[0].config.colors.push("#000000");

    await expect(store.load()).resolves.toEqual({
      settings: {
        appearance: {
          accents: ["blue"]
        }
      },
      snapshot: {
        version: 1,
        ideas: [{ id: "idea-1", meta: { tags: ["initial"] } }],
        pools: [{ id: "pool-1", config: { colors: ["#4A5F84"] } }],
        lastSelectedPoolId: "pool-1",
        managedCanvasPaths: []
      }
    });

    const nextData = {
      settings: {
        appearance: {
          accents: ["violet"]
        }
      },
      snapshot: {
        version: 1,
        ideas: [{ id: "idea-2", meta: { tags: ["saved"] } }],
        pools: [{ id: "pool-2", config: { colors: ["#111111"] } }],
        lastSelectedPoolId: "pool-2",
        managedCanvasPaths: []
      }
    };

    await store.save(nextData);
    nextData.settings.appearance.accents.push("mutated-after-save");
    nextData.snapshot.ideas[0].meta.tags.push("outside-save");
    nextData.snapshot.pools[0].config.colors.push("#222222");

    await expect(store.load()).resolves.toEqual({
      settings: {
        appearance: {
          accents: ["violet"]
        }
      },
      snapshot: {
        version: 1,
        ideas: [{ id: "idea-2", meta: { tags: ["saved"] } }],
        pools: [{ id: "pool-2", config: { colors: ["#111111"] } }],
        lastSelectedPoolId: "pool-2",
        managedCanvasPaths: []
      }
    });
  });

  it("serializes settings updates with snapshot mutations so neither write is lost", async () => {
    let persisted: unknown = {
      GlitterIdeaSettings: {
        mode: "light"
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [],
        lastSelectedPoolId: null
      }
    };

    const saveData = vi.fn(async (data: unknown) => {
      const wrapped = data as {
        GlitterIdeaSettings?: { mode?: string };
        GlitterIdeaSnapshot?: { ideas?: Array<{ id: string }> };
      };

      if (wrapped.GlitterIdeaSettings?.mode === "light" && wrapped.GlitterIdeaSnapshot?.ideas?.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      persisted = data;
    });

    const store = createPluginDataStore<{ id: string }, { id: string }>({
      async loadData() {
        return persisted;
      },
      saveData
    });

    await Promise.all([
      store.mutate((snapshot) => ({
        ...snapshot,
        ideas: [...snapshot.ideas, { id: "idea-1" }]
      })),
      store.updateSettings((settings) => ({
        ...settings,
        mode: "dark"
      }))
    ]);

    expect(saveData).toHaveBeenCalledTimes(2);
    await expect(store.load()).resolves.toEqual({
      settings: {
        mode: "dark"
      },
      snapshot: {
        version: 1,
        ideas: [{ id: "idea-1" }],
        pools: [],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    });
  });
});
