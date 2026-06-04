/**
 * 保护本地发布版导出脚本的目录边界与发布物收口行为，避免后续迭代时把源码或本地残留带进发布目录。
 */

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-ignore Vitest imports the executable .mjs helper directly in this focused script test.
import { describeReleaseSource, ensureAllowedReleaseSource, ensureBundleFilesExist, exportReleaseBundle } from "../../scripts/export-release-package.mjs";

const sandboxesToCleanup: string[] = [];

async function createSandboxRoot() {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "glitter-release-export-"));
  sandboxesToCleanup.push(sandboxRoot);
  return sandboxRoot;
}

afterEach(async () => {
  await Promise.allSettled(
    sandboxesToCleanup.splice(0).map((sandboxRoot) => rm(sandboxRoot, { recursive: true, force: true }))
  );
});

describe("export-release-package script", () => {
  it("describes the canonical source bundle files and sibling release directory", async () => {
    const sandboxRoot = await createSandboxRoot();
    const projectRoot = path.join(sandboxRoot, "glitter-plugin");
    await mkdir(projectRoot, { recursive: true });

    expect(describeReleaseSource(projectRoot)).toEqual({
      projectRoot,
      releaseRoot: path.join(sandboxRoot, "glitter-plugin-release"),
      bundleFiles: {
        mainJs: path.join(projectRoot, "main.js"),
        stylesCss: path.join(projectRoot, "styles.css"),
        manifestJson: path.join(projectRoot, "manifest.json")
      }
    });
  });

  it("rejects worktree and non-canonical project roots", () => {
    const worktreeRoot = path.join("/tmp", "glitter-plugin", ".worktrees", "release-split");
    expect(() => ensureAllowedReleaseSource(worktreeRoot)).toThrow(
      `Refusing to export from worktree path: ${worktreeRoot}`
    );

    const rawRoot = `/tmp/glitter-plugin/../glitter-plugin`;
    expect(() => ensureAllowedReleaseSource(rawRoot)).toThrow(
      `Refusing to export from non-canonical project root: ${path.resolve(rawRoot)}`
    );
  });

  it("fails fast when a required runtime artifact is missing", async () => {
    const sandboxRoot = await createSandboxRoot();
    const projectRoot = path.join(sandboxRoot, "glitter-plugin");
    await mkdir(projectRoot, { recursive: true });
    await writeFile(path.join(projectRoot, "manifest.json"), '{"id":"glitter"}\n', "utf8");
    await writeFile(path.join(projectRoot, "styles.css"), ".glitter {}\n", "utf8");

    expect(() => ensureBundleFilesExist(describeReleaseSource(projectRoot).bundleFiles)).toThrow(
      `Missing release artifact: ${path.join(projectRoot, "main.js")}`
    );
  });

  it("rejects an unexpected release target path with a clear error", async () => {
    const sandboxRoot = await createSandboxRoot();
    const projectRoot = path.join(sandboxRoot, "glitter-plugin");
    const unexpectedReleaseRoot = path.join(sandboxRoot, "manual-export-target");

    await mkdir(projectRoot, { recursive: true });
    await mkdir(unexpectedReleaseRoot, { recursive: true });
    await writeFile(path.join(unexpectedReleaseRoot, "keep.txt"), "do not delete\n", "utf8");

    await writeFile(path.join(projectRoot, "manifest.json"), '{"id":"glitter"}\n', "utf8");
    await writeFile(path.join(projectRoot, "main.js"), "console.log('glitter');\n", "utf8");
    await writeFile(path.join(projectRoot, "styles.css"), ".glitter { color: hotpink; }\n", "utf8");

    expect(() =>
      exportReleaseBundle({
        bundleFiles: describeReleaseSource(projectRoot).bundleFiles,
        releaseRoot: unexpectedReleaseRoot
      })
    ).toThrow(
      `Refusing to export to unexpected release target: ${unexpectedReleaseRoot}. Expected sibling release directory: ${path.join(sandboxRoot, "glitter-plugin-release")}`
    );

    expect(await readdir(unexpectedReleaseRoot)).toEqual(["keep.txt"]);
    expect(await readFile(path.join(unexpectedReleaseRoot, "keep.txt"), "utf8")).toBe("do not delete\n");
  });

  it("keeps an existing release directory untouched when artifacts are missing", async () => {
    const sandboxRoot = await createSandboxRoot();
    const projectRoot = path.join(sandboxRoot, "glitter-plugin");
    const releaseRoot = path.join(sandboxRoot, "glitter-plugin-release");

    await mkdir(projectRoot, { recursive: true });
    await mkdir(path.join(releaseRoot, "stale-dir"), { recursive: true });
    await writeFile(path.join(releaseRoot, "stale.txt"), "old release file\n", "utf8");
    await writeFile(path.join(releaseRoot, "stale-dir", "nested.txt"), "nested old file\n", "utf8");

    await writeFile(path.join(projectRoot, "manifest.json"), '{"id":"glitter"}\n', "utf8");
    await writeFile(path.join(projectRoot, "styles.css"), ".glitter { color: hotpink; }\n", "utf8");

    expect(() =>
      exportReleaseBundle({
        bundleFiles: describeReleaseSource(projectRoot).bundleFiles,
        releaseRoot
      })
    ).toThrow(`Missing release artifact: ${path.join(projectRoot, "main.js")}`);

    expect((await readdir(releaseRoot)).sort()).toEqual(["stale-dir", "stale.txt"]);
    expect(await readFile(path.join(releaseRoot, "stale.txt"), "utf8")).toBe("old release file\n");
    expect(await readFile(path.join(releaseRoot, "stale-dir", "nested.txt"), "utf8")).toBe(
      "nested old file\n"
    );
  });

  it("clears stale contents and exports exactly manifest, main, and styles", async () => {
    const sandboxRoot = await createSandboxRoot();
    const projectRoot = path.join(sandboxRoot, "glitter-plugin");
    const releaseRoot = path.join(sandboxRoot, "glitter-plugin-release");

    await mkdir(projectRoot, { recursive: true });
    await mkdir(path.join(releaseRoot, "stale-dir"), { recursive: true });
    await writeFile(path.join(releaseRoot, "stale.txt"), "old release file\n", "utf8");
    await writeFile(path.join(releaseRoot, "stale-dir", "nested.txt"), "nested old file\n", "utf8");

    await writeFile(path.join(projectRoot, "manifest.json"), '{"id":"glitter"}\n', "utf8");
    await writeFile(path.join(projectRoot, "main.js"), "console.log('glitter');\n", "utf8");
    await writeFile(path.join(projectRoot, "styles.css"), ".glitter { color: hotpink; }\n", "utf8");

    const result = exportReleaseBundle({
      bundleFiles: describeReleaseSource(projectRoot).bundleFiles,
      releaseRoot
    });

    expect(result).toEqual({ releaseRoot });
    expect((await readdir(releaseRoot)).sort()).toEqual(["main.js", "manifest.json", "styles.css"]);
    expect(await readFile(path.join(releaseRoot, "manifest.json"), "utf8")).toBe('{"id":"glitter"}\n');
    expect(await readFile(path.join(releaseRoot, "main.js"), "utf8")).toBe("console.log('glitter');\n");
    expect(await readFile(path.join(releaseRoot, "styles.css"), "utf8")).toBe(
      ".glitter { color: hotpink; }\n"
    );
  });
});
