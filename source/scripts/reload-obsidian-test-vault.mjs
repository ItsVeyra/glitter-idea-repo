/**
 * 说明：该脚本负责从规范主工作区重建并同步插件产物到 Obsidian 测试库，然后重启测试库验证最新运行时效果。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 说明：集中维护同步来源、测试库目标、Obsidian 可执行文件与同步戳命名。
const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveCanonicalProjectRoot(projectRoot) {
  const normalizedProjectRoot = resolve(projectRoot);
  const worktreeDirectory = dirname(normalizedProjectRoot);
  const worktreeContainerName = worktreeDirectory.split(/[\\/]+/).pop();

  if (worktreeContainerName === ".worktrees" || worktreeContainerName === "worktrees") {
    return dirname(worktreeDirectory);
  }

  return normalizedProjectRoot;
}

const DEFAULT_PROJECT_ROOT = resolveCanonicalProjectRoot(resolve(__dirname, ".."));
const projectRoot = DEFAULT_PROJECT_ROOT;
const vaultRoot = "/Users/lqy/Documents/Test-Vault/Glitter-Test-Vault";
const pluginTarget = resolve(vaultRoot, ".obsidian/plugins/glitter-idea");
const pluginDataTarget = resolve(pluginTarget, "data.json");
const communityPluginsTarget = resolve(vaultRoot, ".obsidian/community-plugins.json");
const legacyPluginIds = ["glitter-idea-plugin"];
const obsidianBinary = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const vaultUri = "obsidian://open?vault=Glitter-Test-Vault";
const syncStampFileName = ".last-sync.json";

// 说明：暴露同步来源描述与路径守卫，避免从 worktree 或非规范路径发布旧版本插件。
export function describeSyncSource(projectRoot = resolve(process.cwd())) {
  return {
    projectRoot,
    bundleFiles: {
      mainJs: resolve(projectRoot, "main.js"),
      stylesCss: resolve(projectRoot, "styles.css"),
      manifestJson: resolve(projectRoot, "manifest.json")
    }
  };
}

function hasPathSegment(targetPath, segment) {
  return resolve(targetPath).split(/[\\/]+/).includes(segment);
}

export function ensureAllowedSyncSource(projectRoot = DEFAULT_PROJECT_ROOT) {
  const normalizedProjectRoot = resolve(projectRoot);

  if (hasPathSegment(normalizedProjectRoot, ".worktrees") || hasPathSegment(normalizedProjectRoot, "worktrees")) {
    throw new Error(`Refusing to sync from worktree path: ${normalizedProjectRoot}`);
  }

  if (normalizedProjectRoot !== projectRoot) {
    throw new Error(`Refusing to sync from non-canonical project root: ${normalizedProjectRoot}`);
  }

  return normalizedProjectRoot;
}

// 说明：同步后立即校验关键产物字节是否一致，并把来源信息写入同步戳便于追溯。
export function verifySyncedArtifactsMatchSource({ bundleFiles, pluginTarget: targetRoot }) {
  const artifactEntries = [
    ["main.js", bundleFiles.mainJs],
    ["styles.css", bundleFiles.stylesCss],
    ["manifest.json", bundleFiles.manifestJson]
  ];

  artifactEntries.forEach(([fileName, sourcePath]) => {
    const sourceBytes = readFileSync(sourcePath);
    const targetBytes = readFileSync(resolve(targetRoot, fileName));

    if (!sourceBytes.equals(targetBytes)) {
      throw new Error(`Synced artifact mismatch: ${fileName}`);
    }
  });
}

export function createSyncStamp({
  sourceProjectRoot,
  branch,
  commitSha,
  syncedAt,
  bundleFiles,
  pluginTarget: targetRoot = pluginTarget
}) {
  return {
    sourceProjectRoot,
    branch,
    commitSha,
    syncedAt,
    bundleFiles,
    syncedArtifacts: {
      mainJs: resolve(targetRoot, "main.js"),
      stylesCss: resolve(targetRoot, "styles.css"),
      manifestJson: resolve(targetRoot, "manifest.json")
    }
  };
}

export function writeSyncStamp(data, filePath = resolve(pluginTarget, syncStampFileName)) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// 说明：把子进程调用与短时等待封装起来，保持主流程可读。
function run(command, args, cwd = projectRoot) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function readCommandOutput(command, args, cwd = projectRoot) {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isObsidianRunning() {
  try {
    execFileSync("pgrep", ["-f", obsidianBinary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// 说明：只在需要时读写插件自动化数据，避免主流程直接散落 JSON 处理细节。
export function readPluginAutomationData(filePath = pluginDataTarget) {
  if (!existsSync(filePath)) {
    return {};
  }

  const raw = readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

export function buildPluginAutomationData(existingData) {
  if (!isRecord(existingData)) {
    return {
      openMainViewOnNextLoad: true
    };
  }

  const hasCurrentNestedPluginShape = Object.prototype.hasOwnProperty.call(existingData, "GlitterIdeaSettings")
    || Object.prototype.hasOwnProperty.call(existingData, "GlitterIdeaSnapshot");
  const hasLegacyNestedPluginShape = Object.prototype.hasOwnProperty.call(existingData, "glitterIdeaSettings")
    || Object.prototype.hasOwnProperty.call(existingData, "glitterIdeaSnapshot");

  if (!hasCurrentNestedPluginShape && !hasLegacyNestedPluginShape) {
    return {
      ...existingData,
      openMainViewOnNextLoad: true
    };
  }

  if (hasCurrentNestedPluginShape) {
    const GlitterIdeaSettings = isRecord(existingData.GlitterIdeaSettings) ? existingData.GlitterIdeaSettings : {};

    return {
      ...existingData,
      GlitterIdeaSettings: {
        ...GlitterIdeaSettings,
        openMainViewOnNextLoad: true
      }
    };
  }

  const glitterIdeaSettings = isRecord(existingData.glitterIdeaSettings) ? existingData.glitterIdeaSettings : {};

  return {
    ...existingData,
    glitterIdeaSettings: {
      ...glitterIdeaSettings,
      openMainViewOnNextLoad: true
    }
  };
}

export function writePluginAutomationData(data, filePath = pluginDataTarget) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function normalizeEnabledCommunityPlugins(
  enabledPluginIds,
  currentPluginId = "glitter-idea",
  previousPluginIds = legacyPluginIds
) {
  const normalized = [];
  const seen = new Set();
  const push = (pluginId) => {
    if (typeof pluginId !== "string" || seen.has(pluginId)) {
      return;
    }

    seen.add(pluginId);
    normalized.push(pluginId);
  };

  if (Array.isArray(enabledPluginIds)) {
    enabledPluginIds.forEach((pluginId) => {
      if (previousPluginIds.includes(pluginId)) {
        push(currentPluginId);
        return;
      }

      push(pluginId);
    });
  }

  push(currentPluginId);
  return normalized;
}

export function ensureCommunityPluginEnabled(
  filePath = communityPluginsTarget,
  currentPluginId = "glitter-idea",
  previousPluginIds = legacyPluginIds
) {
  let enabledPluginIds = [];

  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf8").trim();
    enabledPluginIds = raw ? JSON.parse(raw) : [];
  }

  const normalized = normalizeEnabledCommunityPlugins(enabledPluginIds, currentPluginId, previousPluginIds);
  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

// 说明：先确认环境、再构建同步、再请求下次打开首页并重启 Obsidian。
function ensureEnvironment() {
  if (!existsSync(obsidianBinary)) {
    throw new Error(`Obsidian binary not found at ${obsidianBinary}`);
  }
  if (!existsSync(vaultRoot)) {
    throw new Error(`Test vault not found at ${vaultRoot}`);
  }
  if (!existsSync(pluginTarget)) {
    throw new Error(`Plugin target not found at ${pluginTarget}`);
  }
}

function buildPlugin() {
  run("node", ["esbuild.config.mjs", "production"]);
}

function syncPluginBundle(bundleFiles) {
  copyFileSync(bundleFiles.mainJs, resolve(pluginTarget, "main.js"));
  copyFileSync(bundleFiles.stylesCss, resolve(pluginTarget, "styles.css"));
  copyFileSync(bundleFiles.manifestJson, resolve(pluginTarget, "manifest.json"));
}

function requestOpenMainViewOnNextLoad() {
  const existingData = readPluginAutomationData();
  const nextData = buildPluginAutomationData(existingData);
  writePluginAutomationData(nextData);
}

function quitObsidianIfRunning() {
  if (!isObsidianRunning()) {
    return;
  }

  try {
    run("osascript", ["-e", 'tell application "Obsidian" to quit']);
  } catch {}

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!isObsidianRunning()) {
      return;
    }
    sleep(250);
  }

  throw new Error("Obsidian did not exit before restart.");
}

function openTestVault() {
  run("open", ["-a", "Obsidian", vaultUri]);
}

// 说明：CLI 入口串联来源校验、构建、同步、校验、打戳和重启流程。
function main() {
  const syncSource = describeSyncSource(projectRoot);
  const allowedProjectRoot = ensureAllowedSyncSource(syncSource.projectRoot);
  const branch = readCommandOutput("git", ["rev-parse", "--abbrev-ref", "HEAD"], allowedProjectRoot);
  const commitSha = readCommandOutput("git", ["rev-parse", "HEAD"], allowedProjectRoot);

  console.log(`sync source project root: ${syncSource.projectRoot}`);
  console.log(`sync source bundle: ${syncSource.bundleFiles.mainJs}`);
  console.log(`sync source branch: ${branch}`);
  console.log(`sync source commit: ${commitSha}`);

  ensureEnvironment();
  buildPlugin();
  syncPluginBundle(syncSource.bundleFiles);
  verifySyncedArtifactsMatchSource({ bundleFiles: syncSource.bundleFiles, pluginTarget });
  writeSyncStamp(
    createSyncStamp({
      sourceProjectRoot: allowedProjectRoot,
      branch,
      commitSha,
      syncedAt: new Date().toISOString(),
      bundleFiles: syncSource.bundleFiles,
      pluginTarget
    })
  );
  ensureCommunityPluginEnabled();
  requestOpenMainViewOnNextLoad();
  quitObsidianIfRunning();
  openTestVault();
}

// 说明：仅在直接执行脚本时启动同步流程，导入场景下保持测试与复用安全。
const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main();
}
