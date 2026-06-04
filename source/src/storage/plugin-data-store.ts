/**
 * 插件数据存储封装。
 * 负责串行化设置与快照写入，并通过深拷贝与归一化保证持久化读写的稳定性。
 */
// 数据结构与存储契约。
const SNAPSHOT_VERSION = 1;
const SETTINGS_KEY = "GlitterIdeaSettings";
const SNAPSHOT_KEY = "GlitterIdeaSnapshot";
const LEGACY_SETTINGS_KEY = "glitterIdeaSettings";
const LEGACY_SNAPSHOT_KEY = "glitterIdeaSnapshot";

export interface PluginDataSnapshot<TIdea = unknown, TPool = unknown> {
  version: number;
  ideas: TIdea[];
  pools: TPool[];
  lastSelectedPoolId: string | null;
}

export interface PluginDataShape<TIdea = unknown, TPool = unknown> {
  settings: Record<string, unknown>;
  snapshot: PluginDataSnapshot<TIdea, TPool>;
}

export interface PluginDataAdapter {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

type PluginDataMutator<TIdea, TPool> = (
  snapshot: PluginDataSnapshot<TIdea, TPool>
) => PluginDataSnapshot<TIdea, TPool>;

type PluginSettingsMutator = (settings: Record<string, unknown>) => Record<string, unknown>;

export interface PluginDataStore<TIdea = unknown, TPool = unknown> {
  empty(): PluginDataShape<TIdea, TPool>;
  load(): Promise<PluginDataShape<TIdea, TPool>>;
  save(data: PluginDataShape<TIdea, TPool>): Promise<void>;
  updateSettings(mutator: PluginSettingsMutator): Promise<Record<string, unknown>>;
  mutate(mutator: PluginDataMutator<TIdea, TPool>): Promise<PluginDataSnapshot<TIdea, TPool>>;
}

// 深拷贝与比较辅助。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry)) as T;
  }

  if (isRecord(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = deepClone(entry);
    }
    return cloned as T;
  }

  return value;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((entry, index) => deepEqual(entry, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    return (
      leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]))
    );
  }

  return false;
}

function cloneSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return deepClone(settings);
}

function cloneSnapshot<TIdea, TPool>(snapshot: PluginDataSnapshot<TIdea, TPool>): PluginDataSnapshot<TIdea, TPool> {
  return deepClone(snapshot);
}

function cloneData<TIdea, TPool>(data: PluginDataShape<TIdea, TPool>): PluginDataShape<TIdea, TPool> {
  return {
    settings: cloneSettings(data.settings),
    snapshot: cloneSnapshot(data.snapshot)
  };
}

// 快照归一化。
function emptySnapshot<TIdea, TPool>(): PluginDataSnapshot<TIdea, TPool> {
  return {
    version: SNAPSHOT_VERSION,
    ideas: [],
    pools: [],
    lastSelectedPoolId: null
  };
}

function normalizeSnapshot<TIdea, TPool>(value: unknown): PluginDataSnapshot<TIdea, TPool> {
  if (!isRecord(value)) {
    return emptySnapshot<TIdea, TPool>();
  }

  const ideas = Array.isArray(value.ideas) ? deepClone(value.ideas as TIdea[]) : [];
  const pools = Array.isArray(value.pools) ? deepClone(value.pools as TPool[]) : [];
  const lastSelectedPoolId = typeof value.lastSelectedPoolId === "string" ? value.lastSelectedPoolId : null;

  return {
    version: SNAPSHOT_VERSION,
    ideas,
    pools,
    lastSelectedPoolId
  };
}

export function normalizeLoadedPluginData<TIdea, TPool>(loaded: unknown): PluginDataShape<TIdea, TPool> {
  if (!isRecord(loaded)) {
    return {
      settings: {},
      snapshot: emptySnapshot<TIdea, TPool>()
    };
  }

  if (
    SETTINGS_KEY in loaded
    || SNAPSHOT_KEY in loaded
    || LEGACY_SETTINGS_KEY in loaded
    || LEGACY_SNAPSHOT_KEY in loaded
  ) {
    const settingsKey = SETTINGS_KEY in loaded ? SETTINGS_KEY : LEGACY_SETTINGS_KEY;
    const snapshotKey = SNAPSHOT_KEY in loaded ? SNAPSHOT_KEY : LEGACY_SNAPSHOT_KEY;
    const settings = isRecord(loaded[settingsKey]) ? cloneSettings(loaded[settingsKey]) : {};
    const snapshot = normalizeSnapshot<TIdea, TPool>(loaded[snapshotKey]);
    return { settings, snapshot };
  }

  return {
    settings: cloneSettings(loaded),
    snapshot: emptySnapshot<TIdea, TPool>()
  };
}

// 串行化数据存储实现。
export function createPluginDataStore<TIdea = unknown, TPool = unknown>(
  adapter: PluginDataAdapter
): PluginDataStore<TIdea, TPool> {
  let writeQueue: Promise<void> = Promise.resolve();

  async function readCurrent(): Promise<PluginDataShape<TIdea, TPool>> {
    return normalizeLoadedPluginData<TIdea, TPool>(await adapter.loadData());
  }

  async function persist(data: PluginDataShape<TIdea, TPool>): Promise<void> {
    const cloned = cloneData(data);
    await adapter.saveData({
      [SETTINGS_KEY]: cloned.settings,
      [SNAPSHOT_KEY]: cloned.snapshot
    });
  }

  function enqueueWrite<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const run = writeQueue.then(operation, operation);
    writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  return {
    empty(): PluginDataShape<TIdea, TPool> {
      return {
        settings: {},
        snapshot: emptySnapshot<TIdea, TPool>()
      };
    },

    async load(): Promise<PluginDataShape<TIdea, TPool>> {
      await writeQueue;
      return cloneData(await readCurrent());
    },

    async save(data: PluginDataShape<TIdea, TPool>): Promise<void> {
      await enqueueWrite(async () => {
        const next: PluginDataShape<TIdea, TPool> = {
          settings: isRecord(data.settings) ? cloneSettings(data.settings) : {},
          snapshot: normalizeSnapshot<TIdea, TPool>(data.snapshot)
        };
        await persist(next);
      });
    },

    async updateSettings(mutator: PluginSettingsMutator): Promise<Record<string, unknown>> {
      return enqueueWrite(async () => {
        const current = await readCurrent();
        const mutated = mutator(cloneSettings(current.settings));
        const nextSettings = isRecord(mutated) ? cloneSettings(mutated) : {};

        if (deepEqual(current.settings, nextSettings)) {
          return cloneSettings(current.settings);
        }

        await persist({
          settings: nextSettings,
          snapshot: current.snapshot
        });

        return cloneSettings(nextSettings);
      });
    },

    async mutate(mutator: PluginDataMutator<TIdea, TPool>): Promise<PluginDataSnapshot<TIdea, TPool>> {
      return enqueueWrite(async () => {
        const current = await readCurrent();
        const nextSnapshot = normalizeSnapshot<TIdea, TPool>(mutator(cloneSnapshot(current.snapshot)));

        if (deepEqual(current.snapshot, nextSnapshot)) {
          return cloneSnapshot(current.snapshot);
        }

        await persist({
          settings: current.settings,
          snapshot: nextSnapshot
        });

        return cloneSnapshot(nextSnapshot);
      });
    }
  };
}
