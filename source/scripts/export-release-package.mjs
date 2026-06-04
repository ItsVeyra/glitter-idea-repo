/**
 * 说明：该脚本负责从规范主工作区导出本地发布版目录，只收口运行时必需产物并清空旧残留。
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 说明：集中维护规范项目根目录与发布目录命名，避免脚本入口和测试各自散落路径语义。
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = resolve(__dirname, "..");
const DEFAULT_RELEASE_DIRECTORY_NAME = "glitter-plugin-release";

// 说明：暴露发布来源描述与产物路径，供脚本入口和测试共用同一套收口规则。
export function describeReleaseSource(projectRoot = resolve(process.cwd())) {
  return {
    projectRoot,
    releaseRoot: resolve(projectRoot, "..", DEFAULT_RELEASE_DIRECTORY_NAME),
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

export function ensureAllowedReleaseSource(projectRoot = DEFAULT_PROJECT_ROOT) {
  const normalizedProjectRoot = resolve(projectRoot);

  if (hasPathSegment(normalizedProjectRoot, ".worktrees") || hasPathSegment(normalizedProjectRoot, "worktrees")) {
    throw new Error(`Refusing to export from worktree path: ${normalizedProjectRoot}`);
  }

  if (normalizedProjectRoot !== projectRoot) {
    throw new Error(`Refusing to export from non-canonical project root: ${normalizedProjectRoot}`);
  }

  return normalizedProjectRoot;
}

// 说明：发布目标目录必须严格等于规范源码目录对应的同级发布目录，避免误删任意路径。
export function ensureAllowedReleaseTarget({ bundleFiles, releaseRoot }) {
  const normalizedBundleFiles = {
    mainJs: resolve(bundleFiles.mainJs),
    stylesCss: resolve(bundleFiles.stylesCss),
    manifestJson: resolve(bundleFiles.manifestJson)
  };
  const candidateProjectRoots = new Set(Object.values(normalizedBundleFiles).map((artifactPath) => dirname(artifactPath)));

  if (candidateProjectRoots.size !== 1) {
    throw new Error("Refusing to export from mismatched bundle file roots");
  }

  const [projectRoot] = candidateProjectRoots;
  const canonicalReleaseSource = describeReleaseSource(projectRoot);
  const usesCanonicalBundleFiles = Object.entries(canonicalReleaseSource.bundleFiles).every(
    ([bundleName, artifactPath]) => normalizedBundleFiles[bundleName] === artifactPath
  );

  if (!usesCanonicalBundleFiles) {
    throw new Error(`Refusing to export non-canonical release bundle from project root: ${projectRoot}`);
  }

  const normalizedReleaseRoot = resolve(releaseRoot);
  if (normalizedReleaseRoot !== canonicalReleaseSource.releaseRoot) {
    throw new Error(
      `Refusing to export to unexpected release target: ${normalizedReleaseRoot}. Expected sibling release directory: ${canonicalReleaseSource.releaseRoot}`
    );
  }

  return {
    bundleFiles: canonicalReleaseSource.bundleFiles,
    releaseRoot: canonicalReleaseSource.releaseRoot
  };
}

// 说明：先统一校验运行时产物存在，再允许进入发布目录清理与复制流程。
export function ensureBundleFilesExist(bundleFiles) {
  const requiredArtifacts = [bundleFiles.mainJs, bundleFiles.stylesCss, bundleFiles.manifestJson];

  requiredArtifacts.forEach((artifactPath) => {
    if (!existsSync(artifactPath)) {
      throw new Error(`Missing release artifact: ${artifactPath}`);
    }
  });

  return bundleFiles;
}

export function exportReleaseBundle({ bundleFiles, releaseRoot }) {
  const allowedReleaseTarget = ensureAllowedReleaseTarget({ bundleFiles, releaseRoot });

  ensureBundleFilesExist(allowedReleaseTarget.bundleFiles);
  rmSync(allowedReleaseTarget.releaseRoot, { recursive: true, force: true });
  mkdirSync(allowedReleaseTarget.releaseRoot, { recursive: true });

  copyFileSync(allowedReleaseTarget.bundleFiles.manifestJson, resolve(allowedReleaseTarget.releaseRoot, "manifest.json"));
  copyFileSync(allowedReleaseTarget.bundleFiles.mainJs, resolve(allowedReleaseTarget.releaseRoot, "main.js"));
  copyFileSync(allowedReleaseTarget.bundleFiles.stylesCss, resolve(allowedReleaseTarget.releaseRoot, "styles.css"));

  return { releaseRoot: allowedReleaseTarget.releaseRoot };
}

// 说明：CLI 入口负责串联来源校验与发布目录导出，导入场景下保持测试与复用安全。
function main() {
  const releaseSource = describeReleaseSource(DEFAULT_PROJECT_ROOT);
  const allowedProjectRoot = ensureAllowedReleaseSource(releaseSource.projectRoot);
  const canonicalReleaseSource = describeReleaseSource(allowedProjectRoot);

  console.log(`release source project root: ${canonicalReleaseSource.projectRoot}`);
  console.log(`release target root: ${canonicalReleaseSource.releaseRoot}`);

  exportReleaseBundle({
    bundleFiles: canonicalReleaseSource.bundleFiles,
    releaseRoot: canonicalReleaseSource.releaseRoot
  });

  console.log(`release package exported: ${canonicalReleaseSource.releaseRoot}`);
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
