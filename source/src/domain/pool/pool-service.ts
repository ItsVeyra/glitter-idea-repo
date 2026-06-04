/**
 * 灵感池领域服务，负责池的创建、读取、更新、删除与默认池规范化。
 * 同时维护池列表持久化视图，并在需要时统计各池中的灵感数量。
 */
import { DEFAULT_POOL_ID, DEFAULT_POOL_LABEL } from "../../plugin/constants";
import type { PluginDataStore } from "../../storage/plugin-data-store";
import { createId } from "../../utils/id";
import { nowIso } from "../../utils/time";
import type { Idea } from "../idea/idea-model";
import type { Pool } from "./pool-model";

// 复制与规范化辅助。
function clonePool(pool: Pool): Pool {
  return { ...pool };
}

function normalizePool(
  pool: Pool,
  options: { bumpUpdatedAtOnChange: boolean }
): { pool: Pool; changed: boolean } {
  if (pool.id === DEFAULT_POOL_ID) {
    const normalizedDefault: Pool = {
      ...pool,
      name: DEFAULT_POOL_LABEL,
      isDefault: true
    };

    const changed = normalizedDefault.name !== pool.name || normalizedDefault.isDefault !== pool.isDefault;
    return {
      pool:
        changed && options.bumpUpdatedAtOnChange
          ? { ...normalizedDefault, updatedAt: nowIso() }
          : normalizedDefault,
      changed
    };
  }

  if (!pool.isDefault) {
    return {
      pool,
      changed: false
    };
  }

  const normalized: Pool = {
    ...pool,
    isDefault: false
  };

  return {
    pool: options.bumpUpdatedAtOnChange ? { ...normalized, updatedAt: nowIso() } : normalized,
    changed: true
  };
}

function normalizePools(
  pools: Pool[],
  options: { bumpUpdatedAtOnChange: boolean }
): { pools: Pool[]; defaultPool: Pool; changed: boolean } {
  const deduped = new Map<string, Pool>();

  for (const pool of pools) {
    deduped.set(pool.id, clonePool(pool));
  }

  const normalized: Pool[] = [];
  let changed = deduped.size !== pools.length;

  for (const pool of deduped.values()) {
    const result = normalizePool(pool, options);
    normalized.push(result.pool);
    changed = changed || result.changed;
  }

  let defaultPool = normalized.find((pool) => pool.id === DEFAULT_POOL_ID);
  if (!defaultPool) {
    const timestamp = nowIso();
    defaultPool = {
      id: DEFAULT_POOL_ID,
      name: DEFAULT_POOL_LABEL,
      isDefault: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    normalized.push(defaultPool);
    changed = true;
  }

  return {
    pools: normalized,
    defaultPool: clonePool(defaultPool),
    changed
  };
}

// 灵感池服务组装。
export function createPoolService(
  initial: Pool[] = [],
  listIdeas: () => Promise<Idea[]> = async () => [],
  dataStore?: PluginDataStore<Idea, Pool>
) {
  const pools = new Map(initial.map((pool) => [pool.id, clonePool(pool)]));

  const seedPromise = dataStore
    ? dataStore.mutate((snapshot) => {
        if (snapshot.pools.length > 0 || initial.length === 0) {
          return snapshot;
        }
        return {
          ...snapshot,
          pools: initial.map(clonePool)
        };
      })
    : Promise.resolve();

  // 底层读写。
  async function readPools(): Promise<Pool[]> {
    await seedPromise;
    if (!dataStore) {
      return [...pools.values()].map(clonePool);
    }

    const loaded = await dataStore.load();
    return loaded.snapshot.pools.map(clonePool);
  }

  async function writePools(nextPools: Pool[]): Promise<void> {
    if (!dataStore) {
      pools.clear();
      for (const pool of nextPools) {
        pools.set(pool.id, clonePool(pool));
      }
      return;
    }

    await dataStore.mutate((snapshot) => ({
      ...snapshot,
      pools: nextPools.map(clonePool)
    }));
  }

  // 规范化视图。
  async function ensureNormalizedPools(): Promise<{ pools: Pool[]; defaultPool: Pool }> {
    const currentPools = await readPools();
    const {
      pools: normalizedPools,
      defaultPool,
      changed
    } = normalizePools(currentPools, { bumpUpdatedAtOnChange: true });

    if (changed) {
      await writePools(normalizedPools);
    }

    return {
      pools: normalizedPools.map(clonePool),
      defaultPool: clonePool(defaultPool)
    };
  }

  async function readNormalizedPoolsView(): Promise<{ pools: Pool[]; defaultPool: Pool }> {
    const currentPools = await readPools();
    const { pools: normalizedPools, defaultPool } = normalizePools(currentPools, {
      bumpUpdatedAtOnChange: false
    });

    return {
      pools: normalizedPools.map(clonePool),
      defaultPool: clonePool(defaultPool)
    };
  }

  // 灵感池领域操作。
  return {
    async ensureDefaultPool(): Promise<Pool> {
      const { defaultPool } = await ensureNormalizedPools();
      return defaultPool;
    },

    async createPool(input: { name: string; description?: string; color?: string }): Promise<Pool> {
      const timestamp = nowIso();
      const pool: Pool = {
        id: createId("pool"),
        name: input.name,
        description: input.description,
        color: input.color,
        isDefault: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      if (!dataStore) {
        const currentPools = await readPools();
        await writePools([...currentPools, clonePool(pool)]);
        return clonePool(pool);
      }

      await seedPromise;
      await dataStore.mutate((snapshot) => ({
        ...snapshot,
        pools: [...snapshot.pools, clonePool(pool)]
      }));
      return clonePool(pool);
    },

    async listPools(): Promise<Pool[]> {
      const { pools } = await readNormalizedPoolsView();
      return pools.map(clonePool);
    },

    async getPool(id: string): Promise<Pool | null> {
      const { pools } = await readNormalizedPoolsView();
      const found = pools.find((pool) => pool.id === id);
      return found ? clonePool(found) : null;
    },

    async updatePool(id: string, input: { name?: string; description?: string }): Promise<Pool> {
      const currentPools = await readPools();
      const targetIndex = currentPools.findIndex((pool) => pool.id === id);
      if (targetIndex < 0) {
        throw new Error(`Pool not found: ${id}`);
      }

      const targetPool = currentPools[targetIndex]!;
      if (targetPool.isDefault) {
        const wantsNameChange = typeof input.name === "string" && input.name.trim() !== DEFAULT_POOL_LABEL;
        const wantsDescriptionChange = Object.prototype.hasOwnProperty.call(input, "description")
          && (input.description?.trim() || undefined) !== targetPool.description;

        if (wantsNameChange || wantsDescriptionChange) {
          throw new Error("Default pool metadata cannot be changed");
        }
      }

      const nextName = typeof input.name === "string"
        ? (targetPool.isDefault ? DEFAULT_POOL_LABEL : input.name.trim())
        : targetPool.name;
      const nextDescription = Object.prototype.hasOwnProperty.call(input, "description")
        ? (targetPool.isDefault ? targetPool.description : (input.description?.trim() || undefined))
        : targetPool.description;

      const hasChanged = nextName !== targetPool.name || nextDescription !== targetPool.description;
      if (!hasChanged) {
        return clonePool(targetPool);
      }

      const updatedPool: Pool = {
        ...targetPool,
        name: nextName,
        description: nextDescription,
        updatedAt: nowIso()
      };
      const nextPools = [...currentPools];
      nextPools[targetIndex] = updatedPool;
      await writePools(nextPools);
      return clonePool(updatedPool);
    },

    async deletePool(id: string): Promise<boolean> {
      const { pools: currentPools, defaultPool } = await ensureNormalizedPools();
      const targetPool = currentPools.find((pool) => pool.id === id);
      if (!targetPool) {
        return false;
      }
      if (targetPool.isDefault) {
        throw new Error("Default pool cannot be deleted");
      }

      const nextPools = currentPools.filter((pool) => pool.id !== id);

      if (!dataStore) {
        await writePools(nextPools);
        return true;
      }

      await seedPromise;
      await dataStore.mutate((snapshot) => ({
        ...snapshot,
        ideas: snapshot.ideas.map((idea) =>
          idea.poolId !== id
            ? idea
            : {
                ...idea,
                poolId: defaultPool.id,
                updatedAt: nowIso()
              }
        ),
        pools: nextPools.map(clonePool),
        lastSelectedPoolId: snapshot.lastSelectedPoolId === id ? defaultPool.id : snapshot.lastSelectedPoolId
      }));
      return true;
    },

    async listPoolsWithCounts(): Promise<Array<Pool & { ideaCount: number }>> {
      const { pools: currentPools } = await readNormalizedPoolsView();
      const ideas = await listIdeas();
      const counts = new Map<string, number>();

      for (const idea of ideas) {
        counts.set(idea.poolId, (counts.get(idea.poolId) ?? 0) + 1);
      }

      return currentPools.map((pool) => ({
        ...clonePool(pool),
        ideaCount: counts.get(pool.id) ?? 0
      }));
    }
  };
}
