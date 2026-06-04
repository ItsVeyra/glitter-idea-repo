/**
 * 处理跨插件 id 的 data.json 兼容迁移，避免升级后读取到新的空存储壳。
 */

import type { Idea } from "../domain/idea/idea-model";
import type { Pool } from "../domain/pool/pool-model";
import { normalizeLoadedPluginData } from "../storage/plugin-data-store";

const LEGACY_PLUGIN_IDS = ["glitter", "glitter-idea-plugin"] as const;

function isFreshCurrentShell(data: unknown): boolean {
  const current = normalizeLoadedPluginData<Idea, Pool>(data);
  const hasCompletedFirstUse = current.settings.hasCompletedFirstUse === true;
  const hasOnlyDefaultPools = current.snapshot.pools.every((pool) => pool.isDefault);

  return !hasCompletedFirstUse && current.snapshot.ideas.length === 0 && hasOnlyDefaultPools;
}

function hasLegacyUserContent(data: unknown): boolean {
  const legacy = normalizeLoadedPluginData<Idea, Pool>(data);
  return legacy.snapshot.ideas.length > 0 || legacy.snapshot.pools.some((pool) => !pool.isDefault);
}

export function resolveLegacyPluginDataPaths(configDir: string, currentPluginId: string): string[] {
  return LEGACY_PLUGIN_IDS
    .filter((pluginId) => pluginId !== currentPluginId)
    .map((pluginId) => `${configDir}/plugins/${pluginId}/data.json`);
}

export function shouldMigrateLegacyPluginData(currentData: unknown, legacyData: unknown): boolean {
  return isFreshCurrentShell(currentData) && hasLegacyUserContent(legacyData);
}
