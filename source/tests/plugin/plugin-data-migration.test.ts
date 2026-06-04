/**
 * 保护插件跨 id 数据迁移行为，避免升级后因 data.json 路径切换回到空态。
 */

import { describe, expect, it } from "vitest";
import { resolveLegacyPluginDataPaths, shouldMigrateLegacyPluginData } from "../../src/plugin/plugin-data-migration";

describe("plugin data migration", () => {
  it("prefers legacy plugin data when the current plugin id only has a fresh empty shell", () => {
    expect(resolveLegacyPluginDataPaths(".obsidian", "glitter-idea")).toEqual([
      ".obsidian/plugins/glitter/data.json",
      ".obsidian/plugins/glitter-idea-plugin/data.json"
    ]);

    expect(
      shouldMigrateLegacyPluginData(
        {
          GlitterIdeaSettings: {
            hasCompletedFirstUse: false
          },
          GlitterIdeaSnapshot: {
            version: 1,
            ideas: [],
            pools: [
              {
                id: "pool-default",
                isDefault: true
              }
            ],
            lastSelectedPoolId: null
          }
        },
        {
          glitterIdeaSettings: {
            hasCompletedFirstUse: true
          },
          glitterIdeaSnapshot: {
            version: 1,
            ideas: [
              {
                id: "idea-1"
              }
            ],
            pools: [
              {
                id: "pool-default",
                isDefault: true
              }
            ],
            lastSelectedPoolId: null
          }
        }
      )
    ).toBe(true);
  });
});
