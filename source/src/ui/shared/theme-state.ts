/**
 * 共享主题状态工具。
 * 负责读取 Obsidian 运行时主题、生成 Glitter 主题快照，并同步到 UI 容器。
 */

import type {
  AppliedUiThemeMode,
  GlitterPluginSettings,
  PoolColorSettings
} from "../../settings/settings";

// 运行时主题快照与共享主题状态。
export interface RuntimeThemeSnapshot {
  mode: AppliedUiThemeMode;
  baseBackground: string;
  secondaryBackground: string;
  accent: string;
  accentHover: string;
  textNormal: string;
  textMuted: string;
}

export interface ThemeState {
  mode: AppliedUiThemeMode;
  motion: {
    reduced: boolean;
  };
  poolColors: PoolColorSettings;
  runtime: RuntimeThemeSnapshot;
}

type StyleWritableElement = HTMLElement & {
  setCssStyles?: (styles: Record<string, string>) => void;
  setCssProps?: (props: Record<string, string>) => void;
  style: CSSStyleDeclaration & {
    setCssStyles?: (styles: Record<string, string>) => void;
    setCssProps?: (props: Record<string, string>) => void;
  };
};

function camelCaseToKebabCase(name: string): string {
  return name.startsWith("--") ? name : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export function setElementStyles(targetEl: HTMLElement, styles: Record<string, string>): void {
  const writableTarget = targetEl as StyleWritableElement;
  const targetStyle = writableTarget.style;
  const targetSetCssStyles = writableTarget.setCssStyles;
  const styleSetCssStyles = targetStyle.setCssStyles;

  if (typeof targetSetCssStyles === "function") {
    targetSetCssStyles.call(writableTarget, styles);
    return;
  }

  if (typeof styleSetCssStyles === "function") {
    styleSetCssStyles.call(targetStyle, styles);
    return;
  }

  Object.entries(styles).forEach(([name, value]) => {
    targetStyle.setProperty(camelCaseToKebabCase(name), value);
  });
}

export function setElementCssProps(targetEl: HTMLElement, props: Record<string, string>): void {
  const writableTarget = targetEl as StyleWritableElement;
  const targetStyle = writableTarget.style;
  const targetSetCssProps = writableTarget.setCssProps;
  const styleSetCssProps = targetStyle.setCssProps;

  if (typeof targetSetCssProps === "function") {
    targetSetCssProps.call(writableTarget, props);
    return;
  }

  if (typeof styleSetCssProps === "function") {
    styleSetCssProps.call(targetStyle, props);
    return;
  }

  Object.entries(props).forEach(([name, value]) => {
    targetStyle.setProperty(name, value);
  });
}

// 从宿主文档读取主题变量的基础工具。
function readCssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

function resolveThemeMode(ownerDocument: Document | null | undefined): AppliedUiThemeMode {
  const body = ownerDocument?.body ?? globalThis.document?.body;
  if (body?.classList.contains("theme-light")) {
    return "obsidian-light";
  }
  return "obsidian-dark";
}

function resolveThemeStyles(ownerDocument: Document | null | undefined): CSSStyleDeclaration {
  const target = ownerDocument?.body ?? globalThis.document?.body ?? null;
  const readComputedStyle =
    ownerDocument?.defaultView?.getComputedStyle ?? globalThis.getComputedStyle;

  if (!target || typeof readComputedStyle !== "function") {
    return {
      getPropertyValue() {
        return "";
      }
    } as unknown as CSSStyleDeclaration;
  }

  return readComputedStyle(target);
}

// 运行时主题快照采集。
export function readRuntimeThemeSnapshot(
  ownerDocument: Document | null | undefined
): RuntimeThemeSnapshot {
  const styles = resolveThemeStyles(ownerDocument);
  const mode = resolveThemeMode(ownerDocument);

  return {
    mode,
    baseBackground: readCssVar(
      styles,
      "--background-primary",
      mode === "obsidian-light" ? "#f7f9fc" : "#111729"
    ),
    secondaryBackground: readCssVar(
      styles,
      "--background-secondary",
      mode === "obsidian-light" ? "#eef3fb" : "#162034"
    ),
    accent: readCssVar(styles, "--interactive-accent", "#7397ff"),
    accentHover: readCssVar(styles, "--interactive-accent-hover", "#8ea9e3"),
    textNormal: readCssVar(
      styles,
      "--text-normal",
      mode === "obsidian-light" ? "#24324a" : "#dce5ff"
    ),
    textMuted: readCssVar(
      styles,
      "--text-muted",
      mode === "obsidian-light" ? "#61708a" : "#aeb7d0"
    )
  };
}

// 将主题快照写回 Glitter 容器。
export function applyThemeSnapshot(targetEl: HTMLElement, snapshot: RuntimeThemeSnapshot): void {
  targetEl.dataset.glitterTheme = snapshot.mode;
  setElementCssProps(targetEl, {
    "--glitter-runtime-bg-base": snapshot.baseBackground,
    "--glitter-runtime-bg-secondary": snapshot.secondaryBackground,
    "--glitter-runtime-accent": snapshot.accent,
    "--glitter-runtime-accent-hover": snapshot.accentHover,
    "--glitter-runtime-text-normal": snapshot.textNormal,
    "--glitter-runtime-text-muted": snapshot.textMuted
  });
}

// 共享主题状态构建入口。
export function buildThemeState(
  settings: GlitterPluginSettings,
  ownerDocument?: Document | null
): ThemeState {
  const runtime = readRuntimeThemeSnapshot(ownerDocument);
  const mode = settings.uiThemeMode === "follow-obsidian" ? runtime.mode : settings.uiThemeMode;

  return {
    mode,
    motion: {
      reduced: settings.enableReducedMotion
    },
    poolColors: {
      ...settings.poolColors
    },
    runtime
  };
}
