/**
 * 保护测试库插件重载脚本的命令拼装与参数处理相关行为，避免后续重构时出现静默回退。
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-ignore Vitest imports the executable .mjs helper directly in this focused script test.
import { buildPluginAutomationData, createSyncStamp, describeSyncSource, ensureAllowedSyncSource, ensureCommunityPluginEnabled, normalizeEnabledCommunityPlugins, resolveDefaultSyncSourceProjectRoot, verifySyncedArtifactsMatchSource, writeSyncStamp } from "../../scripts/reload-obsidian-test-vault.mjs";

const sandboxesToCleanup: string[] = [];

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
async function createSandboxRoot() {
  const sandboxRoot = await mkdtemp(resolve(tmpdir(), "glitter-reload-script-"));
  sandboxesToCleanup.push(sandboxRoot);
  return sandboxRoot;
}

afterEach(async () => {
  await Promise.allSettled(
    sandboxesToCleanup.splice(0).map((sandboxRoot) => rm(sandboxRoot, { recursive: true, force: true }))
  );
});

// 校验重载脚本辅助函数对命令参数与输出的处理。
describe("reload-obsidian-test-vault script helpers", () => {
  it("enables openMainViewOnNextLoad in flat persisted plugin data", () => {
    expect(
      buildPluginAutomationData({ enableQuickCapture: true })
    ).toEqual({
      enableQuickCapture: true,
      openMainViewOnNextLoad: true
    });
  });

  it("enables openMainViewOnNextLoad inside nested GlitterIdeaSettings data", () => {
    expect(
      buildPluginAutomationData({
        GlitterIdeaSettings: {
          enableQuickCapture: true,
          openMainViewOnNextLoad: false
        },
        GlitterIdeaSnapshot: {
          version: 1,
          ideas: [],
          pools: [],
          lastSelectedPoolId: null
        }
      })
    ).toEqual({
      GlitterIdeaSettings: {
        enableQuickCapture: true,
        openMainViewOnNextLoad: true
      },
      GlitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [],
        lastSelectedPoolId: null
      }
    });
  });

  it("enables openMainViewOnNextLoad inside legacy glitterIdeaSettings data", () => {
    expect(
      buildPluginAutomationData({
        glitterIdeaSettings: {
          enableQuickCapture: true,
          openMainViewOnNextLoad: false
        },
        glitterIdeaSnapshot: {
          version: 1,
          ideas: [],
          pools: [],
          lastSelectedPoolId: null
        }
      })
    ).toEqual({
      glitterIdeaSettings: {
        enableQuickCapture: true,
        openMainViewOnNextLoad: true
      },
      glitterIdeaSnapshot: {
        version: 1,
        ideas: [],
        pools: [],
        lastSelectedPoolId: null
      }
    });
  });

  it("describes the actual project root and bundle files used for sync", () => {
    expect(describeSyncSource()).toEqual({
      projectRoot: resolve(process.cwd()),
      bundleFiles: {
        mainJs: resolve(process.cwd(), "main.js"),
        stylesCss: resolve(process.cwd(), "styles.css"),
        manifestJson: resolve(process.cwd(), "manifest.json")
      }
    });
  });

  it("keeps a worktree script directory rooted in the current worktree", () => {
    expect(
      resolveDefaultSyncSourceProjectRoot("/tmp/glitter-plugin/.worktrees/glitter-structure-refactor/scripts")
    ).toBe("/tmp/glitter-plugin/.worktrees/glitter-structure-refactor");
  });

  it("accepts the canonical glitter-plugin root when no sync source is provided", () => {
    expect(ensureAllowedSyncSource()).toBe(resolve(process.cwd()));
  });

  it("normalizes enabled community plugins by replacing legacy Glitter ids and keeping current id", () => {
    expect(
      normalizeEnabledCommunityPlugins(["calendar", "glitter-idea-plugin", "glitter-idea", "calendar"])
    ).toEqual(["calendar", "glitter-idea"]);
  });

  it("rewrites community-plugins.json to the current Glitter id", async () => {
    const sandboxRoot = await createSandboxRoot();
    const filePath = resolve(sandboxRoot, "community-plugins.json");

    await writeFile(filePath, JSON.stringify(["calendar", "glitter-idea-plugin"], null, 2), {
      encoding: "utf8",
      flag: "w"
    });

    expect(ensureCommunityPluginEnabled(filePath)).toEqual(["calendar", "glitter-idea"]);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(["calendar", "glitter-idea"]);
  });

  it("creates community-plugins.json with the current Glitter id when the file is missing", async () => {
    const sandboxRoot = await createSandboxRoot();
    const filePath = resolve(sandboxRoot, "community-plugins.json");

    expect(ensureCommunityPluginEnabled(filePath)).toEqual(["glitter-idea"]);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(["glitter-idea"]);
  });

  it("fills empty community-plugins.json with the current Glitter id", async () => {
    const sandboxRoot = await createSandboxRoot();
    const filePath = resolve(sandboxRoot, "community-plugins.json");

    await writeFile(filePath, "   \n", { encoding: "utf8", flag: "w" });

    expect(ensureCommunityPluginEnabled(filePath)).toEqual(["glitter-idea"]);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(["glitter-idea"]);
  });

  it("rejects sync sources from nested worktree directories", () => {
    expect(() =>
      ensureAllowedSyncSource("/tmp/glitter-plugin/.worktrees/home-stage-pointer-centered-zoom")
    ).toThrow(/Refusing to sync from worktree path/);
  });

  it("accepts the canonical glitter-plugin root as a sync source", () => {
    expect(() => ensureAllowedSyncSource("/Users/lqy/Documents/灵感插件/glitter-plugin")).not.toThrow();
  });

  it("writes a sync stamp with source path, branch, commit, and artifact paths", async () => {
    const sandboxRoot = await createSandboxRoot();
    const stampFile = resolve(sandboxRoot, ".obsidian-test-vault-sync.json");
    const stamp = createSyncStamp({
      sourceProjectRoot: "/Users/lqy/Documents/灵感插件/glitter-plugin",
      branch: "main",
      commitSha: "401cf69",
      syncedAt: "2026-04-29T08:00:00.000Z",
      bundleFiles: {
        mainJs: "/Users/lqy/Documents/灵感插件/glitter-plugin/main.js",
        stylesCss: "/Users/lqy/Documents/灵感插件/glitter-plugin/styles.css",
        manifestJson: "/Users/lqy/Documents/灵感插件/glitter-plugin/manifest.json"
      }
    });

    await writeSyncStamp(stamp, stampFile);

    expect(JSON.parse(await readFile(stampFile, "utf8"))).toEqual(stamp);
  });

  it("fails verification when any synced artifact differs from the source bundle", async () => {
    const sandboxRoot = await createSandboxRoot();
    const sourceRoot = resolve(sandboxRoot, "source");
    const targetRoot = resolve(sandboxRoot, "target");

    await mkdir(sourceRoot, { recursive: true });
    await mkdir(targetRoot, { recursive: true });

    await writeFile(resolve(sourceRoot, "main.js"), "source-main\n", { encoding: "utf8", flag: "w" });
    await writeFile(resolve(sourceRoot, "styles.css"), "source-styles\n", { encoding: "utf8", flag: "w" });
    await writeFile(resolve(sourceRoot, "manifest.json"), '{"id":"GlitterIdea"}\n', { encoding: "utf8", flag: "w" });
    await writeFile(resolve(targetRoot, "main.js"), "source-main\n", { encoding: "utf8", flag: "w" });
    await writeFile(resolve(targetRoot, "styles.css"), "stale-styles\n", { encoding: "utf8", flag: "w" });
    await writeFile(resolve(targetRoot, "manifest.json"), '{"id":"GlitterIdea"}\n', { encoding: "utf8", flag: "w" });

    expect(() =>
      verifySyncedArtifactsMatchSource({
        bundleFiles: {
          mainJs: resolve(sourceRoot, "main.js"),
          stylesCss: resolve(sourceRoot, "styles.css"),
          manifestJson: resolve(sourceRoot, "manifest.json")
        },
        pluginTarget: targetRoot
      })
    ).toThrow(/Synced artifact mismatch: styles\.css/);
  });
});
