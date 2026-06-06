/**
 * 保护社区风险修复约束，防止插件卸载时重新移除 Glitter 视图叶子。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 直接锁定源码契约，避免 onunload 再次引入叶子分离行为。
const glitterPluginSource = readFileSync(resolve(process.cwd(), "src/plugin/GlitterPlugin.ts"), "utf8");
const settingsTabSource = readFileSync(resolve(process.cwd(), "src/settings/settings-tab.ts"), "utf8");
const renderHomeSource = readFileSync(resolve(process.cwd(), "src/ui/home/render-home.ts"), "utf8");
const noInnerHtmlAssignmentSourcePaths = [
  "src/editor/snippet-postprocessor.ts",
  "src/preview/preview-shell.ts",
  "src/views/pool-view-markdown-preview.ts",
  "src/ui/search/render-search.ts",
  "src/ui/settings/render-settings.ts",
  "src/ui/write/render-write.ts",
  "src/views/idea-edit-modal.ts",
  "src/views/pool-roam-canvas-host.ts",
  "src/views/pool-view-roam.ts",
  "src/ui/home/render-home.ts",
  "src/ui/pool/render-pool.ts"
] as const;
const noDirectStyleAssignmentSourcePaths = [
  "src/views/pool-roam-history-modal.ts",
  "src/views/pool-roam-canvas-host.ts",
  "src/views/idea-edit-modal.ts",
  "src/views/quick-capture-media.ts",
  "src/preview/preview-shell.ts",
  "src/ui/home/render-home.ts",
  "src/ui/home/home-spring-rain-stage.ts",
  "src/ui/shared/theme-state.ts",
  "src/ui/pool/render-pool.ts"
] as const;

function extractOnunloadBlock(source: string): string | null {
  const signatureMatch = /override\s+onunload\(\):\s+void\s*\{/u.exec(source);
  if (!signatureMatch || signatureMatch.index === undefined) {
    return null;
  }

  const bodyStart = signatureMatch.index + signatureMatch[0].length;
  let braceDepth = 1;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      braceDepth += 1;
      continue;
    }

    if (character === "}") {
      braceDepth -= 1;
      if (braceDepth === 0) {
        return source.slice(bodyStart, index);
      }
    }
  }

  return null;
}

describe("community risk contract", () => {
  it("isolates only the GlitterPlugin onunload source span", () => {
    const onunloadBlock = extractOnunloadBlock(glitterPluginSource);

    expect(onunloadBlock).not.toBeNull();
    expect(onunloadBlock).not.toContain("syncHomeRibbonIcon");
  });

  it("keeps GlitterPlugin onunload free of leaf detaches", () => {
    const onunloadBlock = extractOnunloadBlock(glitterPluginSource);

    expect(onunloadBlock).not.toBeNull();
    expect(onunloadBlock).not.toContain("detachLeavesOfType");
  });

  it("keeps the settings page title on a native Setting heading row", () => {
    const pageTitleBlockMatch = settingsTabSource.match(
      /const headerEl = containerEl\.createDiv\(\{ cls: "glitter-settings-tab__header" \}\);([\s\S]*?)const workspaceSection = this\.renderSection/u
    );

    expect(pageTitleBlockMatch).not.toBeNull();
    expect(pageTitleBlockMatch?.[1]).toContain('new Setting(headerEl)');
    expect(pageTitleBlockMatch?.[1]).toContain('.setClass("glitter-settings-tab__page-title")');
    expect(pageTitleBlockMatch?.[1]).toContain('.setHeading()');
    expect(pageTitleBlockMatch?.[1]).not.toContain('createEl("h2"');
  });

  it("keeps the Task 3 review-sensitive files free of innerHTML assignments", () => {
    noInnerHtmlAssignmentSourcePaths.forEach((sourcePath) => {
      const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8");
      expect(source, sourcePath).not.toMatch(/\.innerHTML\s*=/u);
    });
  });

  it("keeps the Task 4 review-sensitive files free of direct style assignments", () => {
    noDirectStyleAssignmentSourcePaths.forEach((sourcePath) => {
      const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8");
      expect(source, sourcePath).not.toMatch(/\.style\.[A-Za-z_$][\w$]*\s*=/u);
    });
  });

  it("keeps roam display fallbacks free of direct display style writes", () => {
    ["src/views/pool-roam-history-modal.ts", "src/views/pool-roam-canvas-host.ts"].forEach((sourcePath) => {
      const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8");
      expect(source, sourcePath).not.toContain('.style.setProperty("display"');
    });
  });

  it("keeps Task 5 render-home style-write helpers locally owned", () => {
    expect(renderHomeSource).not.toMatch(
      /import\s*\{[^}]*setElementCssProps[^}]*\}\s*from\s*"\.\.\/shared\/theme-state";?/u
    );
    expect(renderHomeSource).not.toMatch(
      /import\s*\{[^}]*setElementStyles[^}]*\}\s*from\s*"\.\.\/shared\/theme-state";?/u
    );
    expect(renderHomeSource).toMatch(/function\s+setElementStyles\(/u);
    expect(renderHomeSource).toMatch(/function\s+setElementCssProps\(/u);
  });
});
