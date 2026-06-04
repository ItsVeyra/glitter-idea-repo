/**
 * 保护测试库插件链接脚本的路径解析与校验相关行为，避免后续重构时出现静默回退。
 */

import { lstat, mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-ignore Vitest imports the executable .mjs helper directly in this focused script test.
import { describeLinkSource, ensureAllowedLinkSource, ensureHotReloadMarker, ensurePluginTargetLinked } from "../../scripts/link-obsidian-test-vault-plugin.mjs";

const sandboxesToCleanup: string[] = [];

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
async function createSandboxRoot() {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "glitter-link-script-"));
  sandboxesToCleanup.push(sandboxRoot);
  return sandboxRoot;
}

afterEach(async () => {
  await Promise.all(
    sandboxesToCleanup.splice(0).map((sandboxRoot) => rm(sandboxRoot, { recursive: true, force: true }))
  );
});

// 校验链接脚本辅助函数对路径与符号链接的处理。
describe("link-obsidian-test-vault-plugin script helpers", () => {
  it("backs up existing plugin directory, links target to project root, and writes empty hotreload marker", async () => {
    const sandboxRoot = await createSandboxRoot();
    const projectRoot = path.join(sandboxRoot, "project-root");
    const vaultRoot = path.join(sandboxRoot, "vault-root");
    const pluginId = "glitter";

    await mkdir(projectRoot, { recursive: true });
    const pluginTarget = path.join(vaultRoot, ".obsidian", "plugins", pluginId);
    await mkdir(pluginTarget, { recursive: true });
    await writeFile(path.join(pluginTarget, "main.js"), "copied plugin build", "utf8");

    const linkResult = await ensurePluginTargetLinked({ projectRoot, vaultRoot, pluginId });

    expect(linkResult.alreadyLinked).toBe(false);
    expect(linkResult.pluginTarget).toBe(pluginTarget);
    expect(linkResult.backupTarget).toBe(
      path.join(vaultRoot, ".obsidian", "plugin-dev-backups", `${pluginId}.backup-before-live-dev`)
    );

    const linkedTargetStats = await lstat(pluginTarget);
    expect(linkedTargetStats.isSymbolicLink()).toBe(true);
    expect(await realpath(pluginTarget)).toBe(await realpath(projectRoot));

    const backupMainPath = path.join(linkResult.backupTarget, "main.js");
    expect((await stat(backupMainPath)).isFile()).toBe(true);
    expect(await readFile(backupMainPath, "utf8")).toBe("copied plugin build");

    const markerPath = await ensureHotReloadMarker({ projectRoot });
    expect(markerPath).toBe(path.join(projectRoot, ".hotreload"));
    expect(await readFile(markerPath, "utf8")).toBe("");
  });

  it("replaces existing plugin target when backup already exists and keeps backup intact", async () => {
    const sandboxRoot = await createSandboxRoot();
    const projectRoot = path.join(sandboxRoot, "project-root");
    const vaultRoot = path.join(sandboxRoot, "vault-root");
    const pluginId = "glitter";
    const pluginTarget = path.join(vaultRoot, ".obsidian", "plugins", pluginId);
    const backupTarget = path.join(vaultRoot, ".obsidian", "plugin-dev-backups", `${pluginId}.backup-before-live-dev`);

    await mkdir(projectRoot, { recursive: true });
    await mkdir(pluginTarget, { recursive: true });
    await mkdir(backupTarget, { recursive: true });

    await writeFile(path.join(pluginTarget, "stale-main.js"), "stale plugin build", "utf8");
    await writeFile(path.join(backupTarget, "main.js"), "existing backup build", "utf8");

    const linkResult = await ensurePluginTargetLinked({ projectRoot, vaultRoot, pluginId });

    expect(linkResult.alreadyLinked).toBe(false);
    expect(linkResult.pluginTarget).toBe(pluginTarget);
    expect(linkResult.backupTarget).toBe(backupTarget);

    expect((await lstat(pluginTarget)).isSymbolicLink()).toBe(true);
    expect(await realpath(pluginTarget)).toBe(await realpath(projectRoot));

    const backupMainPath = path.join(backupTarget, "main.js");
    expect((await stat(backupMainPath)).isFile()).toBe(true);
    expect(await readFile(backupMainPath, "utf8")).toBe("existing backup build");
  });

  it("returns alreadyLinked when target symlink already points to project root", async () => {
    const sandboxRoot = await createSandboxRoot();
    const projectRoot = path.join(sandboxRoot, "project-root");
    const vaultRoot = path.join(sandboxRoot, "vault-root");
    const pluginId = "glitter";
    const pluginTarget = path.join(vaultRoot, ".obsidian", "plugins", pluginId);

    await mkdir(projectRoot, { recursive: true });
    await mkdir(path.dirname(pluginTarget), { recursive: true });
    await symlink(projectRoot, pluginTarget, "dir");

    const linkResult = await ensurePluginTargetLinked({ projectRoot, vaultRoot, pluginId });

    expect(linkResult.alreadyLinked).toBe(true);
    expect(linkResult.pluginTarget).toBe(pluginTarget);
    expect(linkResult.backupTarget).toBe(
      path.join(vaultRoot, ".obsidian", "plugin-dev-backups", `${pluginId}.backup-before-live-dev`)
    );
    expect((await lstat(pluginTarget)).isSymbolicLink()).toBe(true);
    expect(await realpath(pluginTarget)).toBe(await realpath(projectRoot));
  });

  it("describes the actual project root used for linking", () => {
    expect(describeLinkSource()).toEqual({
      projectRoot: path.resolve(process.cwd()),
      hotReloadMarker: path.resolve(process.cwd(), ".hotreload")
    });
  });

  it("rejects link sources from nested worktree directories", () => {
    expect(() =>
      ensureAllowedLinkSource("/tmp/glitter-plugin/.worktrees/home-stage-pointer-centered-zoom")
    ).toThrow(/Refusing to link from worktree path/);
  });

  it("accepts the canonical glitter-plugin root as a link source", () => {
    expect(() => ensureAllowedLinkSource("/Users/lqy/Documents/灵感插件/glitter-plugin")).not.toThrow();
  });
});
