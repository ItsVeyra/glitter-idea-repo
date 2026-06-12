/**
 * 保护灵感池服务的创建、排序与默认池语义相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import type { Idea } from "../../../src/domain/idea/idea-model";
import type { Pool } from "../../../src/domain/pool/pool-model";
import { createPoolService } from "../../../src/domain/pool/pool-service";
import { DEFAULT_POOL_ID, DEFAULT_POOL_LABEL } from "../../../src/plugin/constants";
import { createPluginDataStore } from "../../../src/storage/plugin-data-store";
import type { PluginDataShape, PluginDataStore } from "../../../src/storage/plugin-data-store";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createPoolService", () => {
  it("creates non-default pools and lists them", async () => {
    const service = createPoolService();
    const pool = await service.createPool({ name: "写作池", color: "#4A5F84" });

    expect(pool.name).toBe("写作池");
    expect(pool.color).toBe("#4A5F84");
    expect(pool.isDefault).toBe(false);

    const pools = await service.listPools();
    expect(pools.some((item) => item.id === pool.id)).toBe(true);
  });

  it("ensures default pool exists exactly once", async () => {
    const service = createPoolService();

    const first = await service.ensureDefaultPool();
    const second = await service.ensureDefaultPool();
    const pools = await service.listPools();

    expect(first.id).toBe(DEFAULT_POOL_ID);
    expect(first.name).toBe(DEFAULT_POOL_LABEL);
    expect(first.isDefault).toBe(true);
    expect(second.id).toBe(DEFAULT_POOL_ID);

    const defaults = pools.filter((pool) => pool.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe(DEFAULT_POOL_ID);
  });

  it("normalizes legacy default pool record", async () => {
    const service = createPoolService([
      {
        id: DEFAULT_POOL_ID,
        name: "旧默认池",
        isDefault: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    const ensured = await service.ensureDefaultPool();

    expect(ensured.id).toBe(DEFAULT_POOL_ID);
    expect(ensured.name).toBe(DEFAULT_POOL_LABEL);
    expect(ensured.isDefault).toBe(true);
  });

  it("returns pool idea counts", async () => {
    const service = createPoolService(
      [
        {
          id: DEFAULT_POOL_ID,
          name: DEFAULT_POOL_LABEL,
          isDefault: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        {
          id: "pool-writing",
          name: "写作池",
          isDefault: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      async () => [
        {
          id: "idea-1",
          title: "A",
          body: "",
          contentType: "text",
          sourceType: "manual",
          attachmentPaths: [],
          poolId: DEFAULT_POOL_ID,
          tags: [],
          quoted: false,
          fileCreated: false,
          inbox: true,
          snippetRefs: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        {
          id: "idea-2",
          title: "B",
          body: "",
          contentType: "text",
          sourceType: "manual",
          attachmentPaths: [],
          poolId: "pool-writing",
          tags: [],
          quoted: false,
          fileCreated: false,
          inbox: true,
          snippetRefs: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    );

    const withCounts = await service.listPoolsWithCounts();
    const defaultPool = withCounts.find((pool) => pool.id === DEFAULT_POOL_ID);
    const writingPool = withCounts.find((pool) => pool.id === "pool-writing");

    expect(defaultPool?.ideaCount).toBe(1);
    expect(writingPool?.ideaCount).toBe(1);
  });

  it("persists both pools when createPool calls overlap against a data store", async () => {
    let persisted: PluginDataShape<Idea, Pool> = {
      settings: {},
      snapshot: {
        version: 1,
        ideas: [],
        pools: [],
        lastSelectedPoolId: null,
        managedCanvasPaths: []
      }
    };

    const baseStore = createPluginDataStore<Idea, Pool>({
      async loadData() {
        return {
          GlitterIdeaSettings: JSON.parse(JSON.stringify(persisted.settings)) as Record<string, unknown>,
          GlitterIdeaSnapshot: JSON.parse(JSON.stringify(persisted.snapshot)) as PluginDataShape<Idea, Pool>["snapshot"]
        };
      },
      async saveData(data) {
        const normalized = data as {
          GlitterIdeaSettings?: Record<string, unknown>;
          GlitterIdeaSnapshot?: PluginDataShape<Idea, Pool>["snapshot"];
        };
        persisted = {
          settings: normalized.GlitterIdeaSettings ?? {},
          snapshot: normalized.GlitterIdeaSnapshot ?? {
            version: 1,
            ideas: [],
            pools: [],
            lastSelectedPoolId: null,
            managedCanvasPaths: []
          }
        };
      }
    });

    let gateLoads = false;
    let pendingLoads = 0;
    let releaseLoads: () => void = () => undefined;
    let loadsReleased: Promise<void> = Promise.resolve();

    const store = {
      ...baseStore,
      async load() {
        if (gateLoads) {
          pendingLoads += 1;
          if (pendingLoads === 2) {
            gateLoads = false;
            releaseLoads();
          }
          await loadsReleased;
        }

        return baseStore.load();
      },
      startConcurrentLoadGate() {
        gateLoads = true;
        pendingLoads = 0;
        loadsReleased = new Promise<void>((resolve) => {
          releaseLoads = resolve;
        });
      },
      stopConcurrentLoadGate() {
        gateLoads = false;
        releaseLoads();
      }
    } satisfies PluginDataStore<Idea, Pool> & {
      startConcurrentLoadGate(): void;
      stopConcurrentLoadGate(): void;
    };

    const service = createPoolService([], async () => [], store);
    await store.load();

    store.startConcurrentLoadGate();
    const creation = Promise.all([service.createPool({ name: "A" }), service.createPool({ name: "B" })]);
    await Promise.resolve();
    store.stopConcurrentLoadGate();

    const [firstCreated, secondCreated] = await creation;

    expect([firstCreated.name, secondCreated.name].sort()).toEqual(["A", "B"]);

    await expect(service.listPools()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: DEFAULT_POOL_LABEL, isDefault: true }),
        expect.objectContaining({ name: "A", isDefault: false }),
        expect.objectContaining({ name: "B", isDefault: false })
      ])
    );

    const storedPools = (await store.load()).snapshot.pools.map((pool) => pool.name).sort();
    expect(storedPools).toEqual(["A", "B"]);
  });

  it("updates an existing pool name and description", async () => {
    const service = createPoolService([
      {
        id: DEFAULT_POOL_ID,
        name: DEFAULT_POOL_LABEL,
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "pool-writing",
        name: "写作池",
        description: "旧描述",
        isDefault: false,
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z"
      }
    ]);

    const before = await service.getPool("pool-writing");
    await service.updatePool("pool-writing", {
      name: "重命名后的写作池",
      description: "新描述"
    });
    const after = await service.getPool("pool-writing");

    expect(before).toMatchObject({
      id: "pool-writing",
      name: "写作池",
      description: "旧描述"
    });
    expect(after).toMatchObject({
      id: "pool-writing",
      name: "重命名后的写作池",
      description: "新描述"
    });
    expect(after?.updatedAt).not.toBe(before?.updatedAt);
  });

  it("does not allow changing the default pool title or description", async () => {
    const service = createPoolService([
      {
        id: DEFAULT_POOL_ID,
        name: DEFAULT_POOL_LABEL,
        description: "默认描述",
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await expect(
      service.updatePool(DEFAULT_POOL_ID, {
        name: "新的默认池名字"
      })
    ).rejects.toThrow("Default pool metadata cannot be changed");

    await expect(
      service.updatePool(DEFAULT_POOL_ID, {
        description: "新的默认池描述"
      })
    ).rejects.toThrow("Default pool metadata cannot be changed");
  });

  it("does not allow deleting the default pool", async () => {
    const service = createPoolService([
      {
        id: DEFAULT_POOL_ID,
        name: DEFAULT_POOL_LABEL,
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await expect(service.deletePool(DEFAULT_POOL_ID)).rejects.toThrow("Default pool cannot be deleted");
  });

  it("deletes a non-default pool and rehomes its ideas into the default pool", async () => {
    let persisted: PluginDataShape<Idea, Pool> = {
      settings: {},
      snapshot: {
        version: 1,
        ideas: [
          {
            id: "idea-default",
            title: "默认池灵感",
            body: "",
            contentType: "text",
            sourceType: "manual",
            attachmentPaths: [],
            poolId: DEFAULT_POOL_ID,
            tags: [],
            quoted: false,
            fileCreated: false,
            inbox: true,
            snippetRefs: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          },
          {
            id: "idea-writing",
            title: "写作池灵感",
            body: "",
            contentType: "text",
            sourceType: "manual",
            attachmentPaths: [],
            poolId: "pool-writing",
            tags: [],
            quoted: false,
            fileCreated: false,
            inbox: true,
            snippetRefs: [],
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z"
          }
        ],
        pools: [
          {
            id: DEFAULT_POOL_ID,
            name: DEFAULT_POOL_LABEL,
            isDefault: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          },
          {
            id: "pool-writing",
            name: "写作池",
            isDefault: false,
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z"
          }
        ],
        lastSelectedPoolId: "pool-writing",
        managedCanvasPaths: []
      }
    };

    const store = createPluginDataStore<Idea, Pool>({
      async loadData() {
        return {
          GlitterIdeaSettings: JSON.parse(JSON.stringify(persisted.settings)) as Record<string, unknown>,
          GlitterIdeaSnapshot: JSON.parse(JSON.stringify(persisted.snapshot)) as PluginDataShape<Idea, Pool>["snapshot"]
        };
      },
      async saveData(data) {
        const normalized = data as {
          GlitterIdeaSettings?: Record<string, unknown>;
          GlitterIdeaSnapshot?: PluginDataShape<Idea, Pool>["snapshot"];
        };
        persisted = {
          settings: normalized.GlitterIdeaSettings ?? {},
          snapshot: normalized.GlitterIdeaSnapshot ?? persisted.snapshot
        };
      }
    });

    const service = createPoolService([], async () => (await store.load()).snapshot.ideas, store);

    await expect(service.deletePool("pool-writing")).resolves.toBe(true);
    await expect(service.listPools()).resolves.toEqual([
      {
        id: DEFAULT_POOL_ID,
        name: DEFAULT_POOL_LABEL,
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    await expect(service.listPoolsWithCounts()).resolves.toEqual([
      {
        id: DEFAULT_POOL_ID,
        name: DEFAULT_POOL_LABEL,
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ideaCount: 2
      }
    ]);

    await expect(store.load()).resolves.toMatchObject({
      snapshot: {
        pools: [
          {
            id: DEFAULT_POOL_ID,
            name: DEFAULT_POOL_LABEL,
            isDefault: true
          }
        ],
        ideas: [
          expect.objectContaining({ id: "idea-default", poolId: DEFAULT_POOL_ID }),
          expect.objectContaining({ id: "idea-writing", poolId: DEFAULT_POOL_ID })
        ]
      }
    });
  });

  it("does not rewrite persisted pools when read paths only inspect already-normalized data", async () => {
    let persisted: unknown = {
      GlitterIdeaSettings: {},
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [
          {
            id: DEFAULT_POOL_ID,
            name: DEFAULT_POOL_LABEL,
            isDefault: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          },
          {
            id: "pool-writing",
            name: "写作池",
            isDefault: false,
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z"
          }
        ],
        lastSelectedPoolId: DEFAULT_POOL_ID
      }
    };

    const saveData = vi.fn(async (data: unknown) => {
      persisted = data;
    });

    const store = createPluginDataStore<Idea, Pool>({
      async loadData() {
        return persisted;
      },
      saveData
    });

    const service = createPoolService([], async () => [], store);

    await expect(service.listPools()).resolves.toEqual([
      {
        id: DEFAULT_POOL_ID,
        name: DEFAULT_POOL_LABEL,
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "pool-writing",
        name: "写作池",
        isDefault: false,
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z"
      }
    ]);

    await service.getPool(DEFAULT_POOL_ID);
    await service.listPoolsWithCounts();

    expect(saveData).not.toHaveBeenCalled();
    await expect(store.load()).resolves.toEqual({
      settings: {},
      snapshot: {
        version: 1,
        ideas: [],
        pools: [
          {
            id: DEFAULT_POOL_ID,
            name: DEFAULT_POOL_LABEL,
            isDefault: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          },
          {
            id: "pool-writing",
            name: "写作池",
            isDefault: false,
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z"
          }
        ],
        managedCanvasPaths: [],
        lastSelectedPoolId: DEFAULT_POOL_ID
      }
    });
  });

  it("does not persist normalization when read methods encounter legacy default-pool data", async () => {
    const legacyUpdatedAt = "2026-01-01T00:00:00.000Z";
    let persisted: unknown = {
      GlitterIdeaSettings: {},
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [
          {
            id: DEFAULT_POOL_ID,
            name: "旧默认池",
            isDefault: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: legacyUpdatedAt
          }
        ],
        lastSelectedPoolId: null
      }
    };

    const saveData = vi.fn(async (data: unknown) => {
      persisted = data;
    });

    const store = createPluginDataStore<Idea, Pool>({
      async loadData() {
        return persisted;
      },
      saveData
    });

    const service = createPoolService([], async () => [], store);

    await expect(service.listPools()).resolves.toEqual([
      {
        id: DEFAULT_POOL_ID,
        name: DEFAULT_POOL_LABEL,
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: legacyUpdatedAt
      }
    ]);
    await expect(service.getPool(DEFAULT_POOL_ID)).resolves.toEqual({
      id: DEFAULT_POOL_ID,
      name: DEFAULT_POOL_LABEL,
      isDefault: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: legacyUpdatedAt
    });
    await expect(service.listPoolsWithCounts()).resolves.toEqual([
      {
        id: DEFAULT_POOL_ID,
        name: DEFAULT_POOL_LABEL,
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: legacyUpdatedAt,
        ideaCount: 0
      }
    ]);

    expect(saveData).not.toHaveBeenCalled();
    await expect(store.load()).resolves.toEqual({
      settings: {},
      snapshot: {
        version: 1,
        ideas: [],
        pools: [
          {
            id: DEFAULT_POOL_ID,
            name: "旧默认池",
            isDefault: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: legacyUpdatedAt
          }
        ],
        managedCanvasPaths: [],
        lastSelectedPoolId: null
      }
    });
  });

  it("persists normalization when ensureDefaultPool encounters legacy default-pool data", async () => {
    let persisted: unknown = {
      GlitterIdeaSettings: {},
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [
          {
            id: DEFAULT_POOL_ID,
            name: "旧默认池",
            isDefault: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        lastSelectedPoolId: null
      }
    };

    const saveData = vi.fn(async (data: unknown) => {
      persisted = data;
    });

    const store = createPluginDataStore<Idea, Pool>({
      async loadData() {
        return persisted;
      },
      saveData
    });

    const service = createPoolService([], async () => [], store);

    const ensured = await service.ensureDefaultPool();

    expect(ensured).toMatchObject({
      id: DEFAULT_POOL_ID,
      name: DEFAULT_POOL_LABEL,
      isDefault: true
    });
    expect(saveData).toHaveBeenCalledTimes(1);
  });
});
