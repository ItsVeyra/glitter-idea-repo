/**
 * 说明：该脚本负责把 Obsidian 测试库插件目录安全地链接到当前主 glitter-plugin 工作副本，并阻止从 worktree 或非规范路径误连。
 */
import { lstat, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 说明：集中维护规范项目根目录、测试库根目录与备份命名规则。
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = resolve(__dirname, "..");
const DEFAULT_VAULT_ROOT = "/Users/lqy/Documents/Test-Vault/Glitter-Test-Vault";
const DEFAULT_BACKUP_SUFFIX = ".backup-before-live-dev";

// 说明：暴露可复用的来源描述与路径校验，供脚本与测试共用同一套语义。
export function describeLinkSource(projectRoot = resolve(process.cwd())) {
  return {
    projectRoot,
    hotReloadMarker: resolve(projectRoot, ".hotreload")
  };
}

function hasPathSegment(targetPath, segment) {
  return resolve(targetPath).split(/[\\/]+/).includes(segment);
}

export function ensureAllowedLinkSource(projectRoot = DEFAULT_PROJECT_ROOT) {
  const normalizedProjectRoot = resolve(projectRoot);

  if (hasPathSegment(normalizedProjectRoot, ".worktrees") || hasPathSegment(normalizedProjectRoot, "worktrees")) {
    throw new Error(`Refusing to link from worktree path: ${normalizedProjectRoot}`);
  }

  if (normalizedProjectRoot !== projectRoot) {
    throw new Error(`Refusing to link from non-canonical project root: ${normalizedProjectRoot}`);
  }

  return normalizedProjectRoot;
}

// 说明：基础文件系统判断封装，避免主流程散落重复的 lstat 与 realpath 逻辑。
async function pathExists(targetPath) {
  try {
    await lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isSymlinkToProjectRoot(targetPath, projectRoot) {
  try {
    const targetStats = await lstat(targetPath);
    if (!targetStats.isSymbolicLink()) {
      return false;
    }

    return (await realpath(targetPath)) === (await realpath(projectRoot));
  } catch {
    return false;
  }
}

// 说明：链接流程先准备 hot reload 标记，再在必要时备份原插件目录后创建符号链接。
export async function ensureHotReloadMarker({ projectRoot = DEFAULT_PROJECT_ROOT } = {}) {
  const markerPath = resolve(projectRoot, ".hotreload");
  await writeFile(markerPath, "", "utf8");
  return markerPath;
}

export async function ensurePluginTargetLinked({
  projectRoot = DEFAULT_PROJECT_ROOT,
  vaultRoot = DEFAULT_VAULT_ROOT,
  pluginId,
  backupSuffix = DEFAULT_BACKUP_SUFFIX
}) {
  const pluginTarget = resolve(vaultRoot, ".obsidian", "plugins", pluginId);
  const backupTarget = resolve(vaultRoot, ".obsidian", "plugin-dev-backups", `${pluginId}${backupSuffix}`);

  if (await isSymlinkToProjectRoot(pluginTarget, projectRoot)) {
    return { pluginTarget, backupTarget, alreadyLinked: true };
  }

  await mkdir(dirname(pluginTarget), { recursive: true });
  await mkdir(dirname(backupTarget), { recursive: true });

  if (await pathExists(pluginTarget)) {
    if (!(await pathExists(backupTarget))) {
      await rename(pluginTarget, backupTarget);
    } else {
      const existingPluginTargetStats = await lstat(pluginTarget);
      if (existingPluginTargetStats.isDirectory()) {
        await rm(pluginTarget, { recursive: true, force: true });
      } else {
        await rm(pluginTarget, { force: true });
      }
    }
  }

  await symlink(projectRoot, pluginTarget, "dir");

  return { pluginTarget, backupTarget, alreadyLinked: false };
}

// 说明：从 manifest 读取插件 id，避免在脚本内硬编码目标目录名。
async function readPluginId(projectRoot = DEFAULT_PROJECT_ROOT) {
  const manifestPath = resolve(projectRoot, "manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);

  if (!manifest?.id || typeof manifest.id !== "string") {
    throw new Error(`Could not read plugin id from ${manifestPath}`);
  }

  return manifest.id;
}

// 说明：CLI 入口负责串联来源校验、标记创建、链接执行与结果输出。
async function main() {
  const linkSource = describeLinkSource(DEFAULT_PROJECT_ROOT);
  const allowedProjectRoot = ensureAllowedLinkSource(linkSource.projectRoot);
  console.log(`link source project root: ${linkSource.projectRoot}`);
  const pluginId = await readPluginId(allowedProjectRoot);
  const markerPath = await ensureHotReloadMarker({ projectRoot: allowedProjectRoot });
  const result = await ensurePluginTargetLinked({ projectRoot: allowedProjectRoot, pluginId });

  console.log(`hotreload marker ready: ${markerPath}`);
  if (result.alreadyLinked) {
    console.log(`plugin target already linked: ${result.pluginTarget}`);
    return;
  }

  console.log(`plugin target linked: ${result.pluginTarget}`);
  console.log(`backup target: ${result.backupTarget}`);
}

// 说明：仅在直接执行脚本时运行 main，导入场景下保持测试友好。
const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
