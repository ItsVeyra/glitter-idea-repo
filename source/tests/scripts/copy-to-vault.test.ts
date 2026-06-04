/**
 * 保护测试库同步脚本的复制与覆盖边界相关行为，避免后续重构时出现静默回退。
 */

import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const sandboxesToCleanup: string[] = [];

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
async function createSandboxRoot() {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "glitter-copy-script-"));
  sandboxesToCleanup.push(sandboxRoot);
  return sandboxRoot;
}

afterEach(async () => {
  await Promise.allSettled(
    sandboxesToCleanup.splice(0).map((sandboxRoot) => rm(sandboxRoot, { recursive: true, force: true }))
  );
});

// 校验复制脚本对目标目录、忽略规则与覆盖行为的处理。
describe("copy-to-vault script", () => {
  it("refuses the retired copy entrypoint and points callers at the live-safe commands", async () => {
    const sandboxRoot = await createSandboxRoot();
    const fakeVault = path.join(sandboxRoot, "fake-vault");
    const fakeVaultConfig = path.join(fakeVault, ".obsidian");
    const targetPluginDir = path.join(fakeVaultConfig, "plugins", "glitter");

    await mkdir(fakeVaultConfig, { recursive: true });

    const scriptPath = path.resolve(process.cwd(), "scripts", "copy-to-vault.mjs");

    let thrownError: Error & { status?: number; stdout?: string; stderr?: string } | undefined;

    try {
      execFileSync("node", [scriptPath, fakeVault], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe"
      });
    } catch (error) {
      thrownError = error as Error & { status?: number; stdout?: string; stderr?: string };
    }

    expect(thrownError).toBeDefined();
    expect(thrownError?.status).toBe(1);
    expect(thrownError?.stdout).toBe("");
    expect(thrownError?.stderr).toContain("scripts/copy-to-vault.mjs has been retired");
    expect(thrownError?.stderr).toContain("npm run obsidian:test-vault:link");
    expect(thrownError?.stderr).toContain("npm run obsidian:test-vault");
    await expect(lstat(targetPluginDir)).rejects.toThrow();
  });
});
