/**
 * 默认设置与加载值归一化入口。
 * 负责给插件提供稳定的默认值，并把持久化读取结果整理为完整设置对象。
 */
import {
  DEFAULT_REVIEW_SCENARIO,
  normalizeReviewScenario
} from "../review/scenarios";
import type {
  AiSettings,
  GlitterPluginSettings,
  HomeFieldView,
  PluginInterfaceLanguage,
  PoolColorSettings,
  RoamSettings,
  UiThemeMode
} from "./settings";

type LoadedAiSettings = Partial<Record<keyof AiSettings, unknown>>;
type LoadedRoamSettings = Partial<Record<keyof RoamSettings, unknown>>;

type LoadedPluginSettings = Partial<
  Omit<
    GlitterPluginSettings,
    "hotkeys" | "reviewScenario" | "poolColors" | "uiThemeMode" | "homeFieldView" | "interfaceLanguage" | "ai" | "roam"
  >
> & {
  reviewScenario?: unknown;
  uiThemeMode?: unknown;
  homeFieldView?: unknown;
  interfaceLanguage?: unknown;
  hotkeys?: Partial<GlitterPluginSettings["hotkeys"]> | null;
  poolColors?: Partial<Record<keyof PoolColorSettings, unknown>> | null;
  ai?: LoadedAiSettings | null;
  roam?: LoadedRoamSettings | null;
};

// 默认值定义。
export const DEFAULT_SETTINGS: GlitterPluginSettings = {
  defaultPoolId: null,
  enableQuickCapture: true,
  enableCreateFromSelection: true,
  enableInsertIdeaReference: true,
  showHomeRibbonIcon: true,
  enableReducedMotion: false,
  enableAmbientMotion: true,
  uiThemeMode: "follow-obsidian",
  // 空态与首次进入首页都以圆满视图为默认基线，涟漪只在 populated 首页按用户选择启用。
  homeFieldView: "water",
  interfaceLanguage: "zh-CN",
  ai: {
    enabled: false,
    quickCapturePolishEnabled: true,
    provider: "openai-compatible",
    baseUrl: "",
    model: "",
    apiKey: ""
  },
  poolColors: {
    unsorted: "#6ab5ff",
    product: "#74ccba",
    research: "#ffa980",
    writing: "#ffd468",
    unnamed: "#b794ff"
  },
  createMdFileByDefault: false,
  mediaStorageDirectory: "Glitter",
  fileStorageDirectory: "Glitter",
  roam: {
    boardStorageDirectory: "Glitter/灵感漫游",
    svgStorageDirectory: "Glitter/池导出"
  },
  createdIdeaEmoji: "✨",
  referencedIdeaEmoji: "🔖",
  usePerTypeHotkeys: false,
  enableDesignReviewMode: false,
  reviewScenario: DEFAULT_REVIEW_SCENARIO,
  openMainViewOnNextLoad: false,
  hasCompletedFirstUse: false,
  hotkeys: {
    globalQuickCapture: "Mod+Shift+J",
    createFromSelection: null,
    insertIdeaReference: "Mod+Shift+I"
  }
};

// 归一化辅助。
function normalizeUiThemeMode(value: unknown): UiThemeMode {
  if (
    value === "follow-obsidian" ||
    value === "obsidian-dark" ||
    value === "obsidian-light"
  ) {
    return value;
  }

  return "follow-obsidian";
}

// 只接受首页双视图协议里的合法值，旧值或脏值统一回落到圆满基线。
function normalizeHomeFieldView(value: unknown): HomeFieldView {
  if (value === "water" || value === "spring-rain") {
    return value;
  }

  return "water";
}

function normalizePluginInterfaceLanguage(value: unknown): PluginInterfaceLanguage {
  if (value === "zh-CN" || value === "en") {
    return value;
  }

  return "zh-CN";
}

function normalizeStorageDirectory(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeAiTextValue(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function normalizeAiSettings(value: LoadedPluginSettings["ai"]): AiSettings {
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.ai.enabled,
    quickCapturePolishEnabled:
      typeof value?.quickCapturePolishEnabled === "boolean"
        ? value.quickCapturePolishEnabled
        : DEFAULT_SETTINGS.ai.quickCapturePolishEnabled,
    provider: "openai-compatible",
    baseUrl: normalizeAiTextValue(value?.baseUrl, DEFAULT_SETTINGS.ai.baseUrl),
    model: normalizeAiTextValue(value?.model, DEFAULT_SETTINGS.ai.model),
    apiKey: normalizeAiTextValue(value?.apiKey, DEFAULT_SETTINGS.ai.apiKey)
  };
}

function normalizePoolColors(value: LoadedPluginSettings["poolColors"]): PoolColorSettings {
  const normalized: PoolColorSettings = { ...DEFAULT_SETTINGS.poolColors };

  if (!value) {
    return normalized;
  }

  for (const key of Object.keys(DEFAULT_SETTINGS.poolColors) as Array<keyof PoolColorSettings>) {
    const candidate = value[key];
    if (typeof candidate === "string") {
      normalized[key] = candidate;
    }
  }

  return normalized;
}

// 设置合并入口。
export function mergePluginSettings(loaded: LoadedPluginSettings | null | undefined): GlitterPluginSettings {
  const loadedSafe = loaded ?? {};
  const {
    hotkeys,
    reviewScenario,
    poolColors,
    uiThemeMode,
    homeFieldView,
    interfaceLanguage,
    mediaStorageDirectory,
    fileStorageDirectory,
    roam,
    ai,
    ...rest
  } = loadedSafe;

  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    enableCreateFromSelection: DEFAULT_SETTINGS.enableCreateFromSelection,
    uiThemeMode: normalizeUiThemeMode(uiThemeMode),
    homeFieldView: normalizeHomeFieldView(homeFieldView),
    interfaceLanguage: normalizePluginInterfaceLanguage(interfaceLanguage),
    mediaStorageDirectory: normalizeStorageDirectory(mediaStorageDirectory, DEFAULT_SETTINGS.mediaStorageDirectory),
    fileStorageDirectory: normalizeStorageDirectory(fileStorageDirectory, DEFAULT_SETTINGS.fileStorageDirectory),
    roam: {
      boardStorageDirectory: normalizeStorageDirectory(
        roam?.boardStorageDirectory,
        DEFAULT_SETTINGS.roam.boardStorageDirectory
      ),
      svgStorageDirectory: normalizeStorageDirectory(
        roam?.svgStorageDirectory,
        DEFAULT_SETTINGS.roam.svgStorageDirectory
      )
    },
    reviewScenario: normalizeReviewScenario(reviewScenario),
    hotkeys: {
      ...DEFAULT_SETTINGS.hotkeys,
      ...(hotkeys ?? {})
    },
    ai: normalizeAiSettings(ai),
    poolColors: normalizePoolColors(poolColors)
  };
}
