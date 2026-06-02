/*
Copyright (C) 2026 ItsVeyra

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3 of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * 保护主题状态推断与快照应用相关行为，避免后续重构时出现静默回退。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import {
  applyThemeSnapshot,
  buildThemeState,
  readRuntimeThemeSnapshot
} from "../../../src/ui/shared/theme-state";

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
function createOwnerDocument(mode: "light" | "dark"): Document {
  return {
    body: {
      classList: {
        contains(name: string) {
          return name === (mode === "light" ? "theme-light" : "theme-dark");
        }
      }
    }
  } as unknown as Document;
}

// 校验主题模式解析与主题快照应用的边界。
describe("theme-state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reads runtime light theme tokens from the owner document", () => {
    const ownerDocument = createOwnerDocument("light");
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({
        getPropertyValue(name: string) {
          const values: Record<string, string> = {
            "--background-primary": "#f7f9fc",
            "--background-secondary": "#eef3fb",
            "--interactive-accent": "#7397ff",
            "--interactive-accent-hover": "#5d7eff",
            "--text-normal": "#24324a",
            "--text-muted": "#61708a"
          };
          return values[name] ?? "";
        }
      } as unknown as CSSStyleDeclaration))
    );

    expect(readRuntimeThemeSnapshot(ownerDocument)).toEqual({
      mode: "obsidian-light",
      baseBackground: "#f7f9fc",
      secondaryBackground: "#eef3fb",
      accent: "#7397ff",
      accentHover: "#5d7eff",
      textNormal: "#24324a",
      textMuted: "#61708a"
    });
  });

  it("applies runtime theme snapshot to a host element", () => {
    const setProperty = vi.fn();
    const host = {
      dataset: {},
      style: { setProperty }
    } as unknown as HTMLElement;

    applyThemeSnapshot(host, {
      mode: "obsidian-dark",
      baseBackground: "#111729",
      secondaryBackground: "#162034",
      accent: "#7397ff",
      accentHover: "#8ea9e3",
      textNormal: "#dce5ff",
      textMuted: "#aeb7d0"
    });

    expect(host.dataset.glitterTheme).toBe("obsidian-dark");
    expect(setProperty).toHaveBeenCalledWith("--glitter-runtime-bg-base", "#111729");
    expect(setProperty).toHaveBeenCalledWith("--glitter-runtime-bg-secondary", "#162034");
    expect(setProperty).toHaveBeenCalledWith("--glitter-runtime-accent", "#7397ff");
    expect(setProperty).toHaveBeenCalledWith("--glitter-runtime-accent-hover", "#8ea9e3");
    expect(setProperty).toHaveBeenCalledWith("--glitter-runtime-text-normal", "#dce5ff");
    expect(setProperty).toHaveBeenCalledWith("--glitter-runtime-text-muted", "#aeb7d0");
  });

  it("builds theme state with runtime snapshot included", () => {
    const ownerDocument = createOwnerDocument("dark");
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({
        getPropertyValue(name: string) {
          const values: Record<string, string> = {
            "--background-primary": "#111729",
            "--background-secondary": "#162034",
            "--interactive-accent": "#7397ff",
            "--interactive-accent-hover": "#8ea9e3",
            "--text-normal": "#dce5ff",
            "--text-muted": "#aeb7d0"
          };
          return values[name] ?? "";
        }
      } as unknown as CSSStyleDeclaration))
    );

    const themeState = buildThemeState(DEFAULT_SETTINGS, ownerDocument);

    expect(themeState.mode).toBe("obsidian-dark");
    expect(themeState.motion.reduced).toBe(DEFAULT_SETTINGS.enableReducedMotion);
    expect(themeState.poolColors).toEqual(DEFAULT_SETTINGS.poolColors);
    expect(themeState.runtime).toEqual({
      mode: "obsidian-dark",
      baseBackground: "#111729",
      secondaryBackground: "#162034",
      accent: "#7397ff",
      accentHover: "#8ea9e3",
      textNormal: "#dce5ff",
      textMuted: "#aeb7d0"
    });
  });

  it("uses the runtime theme mode when settings follow Obsidian", () => {
    const ownerDocument = createOwnerDocument("light");
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({
        getPropertyValue(name: string) {
          const values: Record<string, string> = {
            "--background-primary": "#f7f9fc",
            "--background-secondary": "#eef3fb",
            "--interactive-accent": "#7397ff",
            "--interactive-accent-hover": "#5d7eff",
            "--text-normal": "#24324a",
            "--text-muted": "#61708a"
          };
          return values[name] ?? "";
        }
      } as unknown as CSSStyleDeclaration))
    );

    const themeState = buildThemeState(
      {
        ...DEFAULT_SETTINGS,
        uiThemeMode: "follow-obsidian"
      } as unknown as typeof DEFAULT_SETTINGS,
      ownerDocument
    );

    expect(themeState.mode).toBe("obsidian-light");
    expect(themeState.runtime.mode).toBe("obsidian-light");
  });

  it("uses the configured theme mode when settings do not follow Obsidian", () => {
    const ownerDocument = createOwnerDocument("dark");
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({
        getPropertyValue(name: string) {
          const values: Record<string, string> = {
            "--background-primary": "#111729",
            "--background-secondary": "#162034",
            "--interactive-accent": "#7397ff",
            "--interactive-accent-hover": "#8ea9e3",
            "--text-normal": "#dce5ff",
            "--text-muted": "#aeb7d0"
          };
          return values[name] ?? "";
        }
      } as unknown as CSSStyleDeclaration))
    );

    const themeState = buildThemeState(
      {
        ...DEFAULT_SETTINGS,
        uiThemeMode: "obsidian-light"
      },
      ownerDocument
    );

    expect(themeState.mode).toBe("obsidian-light");
    expect(themeState.runtime.mode).toBe("obsidian-dark");
  });

  it("uses fallback defaults when css variables are missing without an owner document", () => {
    const body = {
      classList: {
        contains() {
          return false;
        }
      }
    };

    vi.stubGlobal("document", { body } as unknown as Document);
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(
        () =>
          ({
            getPropertyValue() {
              return "";
            }
          }) as unknown as CSSStyleDeclaration
      )
    );

    expect(readRuntimeThemeSnapshot(undefined)).toEqual({
      mode: "obsidian-dark",
      baseBackground: "#111729",
      secondaryBackground: "#162034",
      accent: "#7397ff",
      accentHover: "#8ea9e3",
      textNormal: "#dce5ff",
      textMuted: "#aeb7d0"
    });
  });

  it("prefers owner document getComputedStyle when available", () => {
    const ownerGetComputedStyle = vi.fn(() => ({
      getPropertyValue(name: string) {
        const values: Record<string, string> = {
          "--background-primary": "#ffffff",
          "--background-secondary": "#f5f5f5",
          "--interactive-accent": "#123456",
          "--interactive-accent-hover": "#234567",
          "--text-normal": "#345678",
          "--text-muted": "#456789"
        };
        return values[name] ?? "";
      }
    } as unknown as CSSStyleDeclaration));
    const globalGetComputedStyle = vi.fn(() => ({
      getPropertyValue() {
        return "";
      }
    } as unknown as CSSStyleDeclaration));
    const ownerDocument = {
      body: {
        classList: {
          contains(name: string) {
            return name === "theme-light";
          }
        }
      },
      defaultView: {
        getComputedStyle: ownerGetComputedStyle
      }
    } as unknown as Document;

    vi.stubGlobal("getComputedStyle", globalGetComputedStyle);

    expect(readRuntimeThemeSnapshot(ownerDocument)).toEqual({
      mode: "obsidian-light",
      baseBackground: "#ffffff",
      secondaryBackground: "#f5f5f5",
      accent: "#123456",
      accentHover: "#234567",
      textNormal: "#345678",
      textMuted: "#456789"
    });
    expect(ownerGetComputedStyle).toHaveBeenCalledWith(ownerDocument.body);
    expect(globalGetComputedStyle).not.toHaveBeenCalled();
  });
});
