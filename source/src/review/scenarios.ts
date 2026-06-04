/**
 * 评审场景注册表。
 * 负责集中维护预览场景枚举，并为快速记录演示场景提供对应的运行时假数据。
 */
import type { QuickCaptureRuntimeState } from "../ui/write/quick-capture-runtime";
import type { QuickCaptureWriteStateModel } from "../ui/write/write-state";

// 场景枚举。
export const HOME_REVIEW_SCENARIOS = ["home-empty", "home-populated"] as const;

export const SEARCH_REVIEW_SCENARIOS = [
  "search-results",
  "search-empty",
  "search-loading",
  "search-batch"
] as const;

export const QUICK_CAPTURE_REVIEW_SCENARIOS = [
  "quick-capture-default",
  "quick-capture-link-loading",
  "quick-capture-link-error",
  "quick-capture-media-loading",
  "quick-capture-media-error",
  "quick-capture-first-use-saved",
  "quick-capture-global-default",
  "quick-capture-global-link-loading",
  "quick-capture-global-link-error",
  "quick-capture-global-media-loading",
  "quick-capture-global-media-error",
  "quick-capture-global-saved",
  "quick-capture-ai-ready",
  "quick-capture-ai-reviewing",
  "quick-capture-ai-error",
  "write-immersive-default",
  "write-immersive-success",
  "write-immersive-error"
] as const;

export const POOL_REVIEW_SCENARIOS = [
  "pool-browse",
  "pool-empty",
  "pool-reduced-motion",
  "pool-first-use-choose",
  "pool-first-use-create"
] as const;

export const SETTINGS_REVIEW_SCENARIOS = [
  "settings-default",
  "settings-reduced-motion",
  "settings-conflict"
] as const;

export const REVIEW_SCENARIOS = [
  ...HOME_REVIEW_SCENARIOS,
  ...SEARCH_REVIEW_SCENARIOS,
  ...QUICK_CAPTURE_REVIEW_SCENARIOS,
  ...POOL_REVIEW_SCENARIOS,
  ...SETTINGS_REVIEW_SCENARIOS
] as const;

export type ReviewScenario = (typeof REVIEW_SCENARIOS)[number];

export const DEFAULT_REVIEW_SCENARIO: ReviewScenario = "home-empty";

const QUICK_CAPTURE_AI_SOURCE_TEXT = "我先写一版原文，再看润色结果。";
const QUICK_CAPTURE_AI_POLISHED_TEXT = "我先写一版原文，然后查看润色结果。";
const QUICK_CAPTURE_AI_ERROR_MESSAGE = "AI 请求失败，请检查网络或 API 配置后重试。";
const QUICK_CAPTURE_AI_GLOBAL_TITLE = "灵感 04-08 09:12";

export function createQuickCaptureWriteStateOverridesForScenario(
  scenario: ReviewScenario
): Partial<QuickCaptureWriteStateModel> {
  if (scenario === "quick-capture-ai-ready") {
    return {
      contentKind: "text",
      importState: "idle",
      hasManualTitle: false,
      attachedMediaCount: 0,
      aiPolishVisible: true,
      aiPolishState: "idle"
    };
  }

  if (scenario === "quick-capture-ai-reviewing") {
    return {
      contentKind: "text",
      importState: "idle",
      hasManualTitle: false,
      inputText: QUICK_CAPTURE_AI_SOURCE_TEXT,
      attachedMediaCount: 0,
      aiPolishVisible: true,
      aiPolishState: "reviewing",
      aiPolishSourceValue: QUICK_CAPTURE_AI_SOURCE_TEXT,
      aiPolishPolishedValue: QUICK_CAPTURE_AI_POLISHED_TEXT
    };
  }

  if (scenario === "quick-capture-ai-error") {
    return {
      contentKind: "text",
      importState: "idle",
      hasManualTitle: false,
      inputText: QUICK_CAPTURE_AI_SOURCE_TEXT,
      attachedMediaCount: 0,
      aiPolishVisible: true,
      aiPolishState: "error",
      aiPolishSourceValue: QUICK_CAPTURE_AI_SOURCE_TEXT,
      aiPolishErrorMessage: QUICK_CAPTURE_AI_ERROR_MESSAGE
    };
  }

  return {};
}

// 快速记录预览数据。
export function createQuickCaptureRuntimeStateForScenario(
  scenario: ReviewScenario,
  fallback: QuickCaptureRuntimeState
): QuickCaptureRuntimeState {
  const createFileChecked = fallback.input.createFileChecked ?? false;
  const selectedPoolId = fallback.input.selectedPoolId;
  const selectedPoolLabel = fallback.input.selectedPoolLabel;
  const poolDropdownVisible = fallback.input.poolDropdownVisible;

  if (scenario === "quick-capture-ai-ready") {
    return {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "",
        title: QUICK_CAPTURE_AI_GLOBAL_TITLE,
        hasManualTitle: false,
        importState: "idle"
      }
    };
  }

  if (scenario === "quick-capture-ai-reviewing" || scenario === "quick-capture-ai-error") {
    return {
      flowContext: "global",
      phase: "capture",
      input: {
        text: QUICK_CAPTURE_AI_SOURCE_TEXT,
        title: QUICK_CAPTURE_AI_GLOBAL_TITLE,
        hasManualTitle: false,
        importState: "idle"
      }
    };
  }

  if (scenario === "quick-capture-default") {
    return {
      flowContext: "first-use",
      phase: "capture",
      input: {
        text: "",
        importState: "idle",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-link-loading") {
    return {
      flowContext: "first-use",
      phase: "capture",
      input: {
        text: "https://example.com/article",
        importState: "loading",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-link-error") {
    return {
      flowContext: "first-use",
      phase: "capture",
      input: {
        text: "https://example.com/article",
        importState: "error",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-media-loading") {
    return {
      flowContext: "first-use",
      phase: "capture",
      input: {
        text: "补充媒体备注",
        hasMedia: true,
        importState: "loading",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-media-error") {
    return {
      flowContext: "first-use",
      phase: "capture",
      input: {
        text: "补充媒体备注",
        hasMedia: true,
        importState: "error",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-first-use-saved") {
    return {
      flowContext: "first-use",
      phase: "saved-feedback",
      input: {
        text: "今天想到一个可以马上验证的小点子",
        importState: "idle",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-global-default") {
    return {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "这是全局捕获的标题来源。下一句不会进入标题",
        importState: "idle",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-global-link-loading") {
    return {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "https://example.com/article",
        importState: "loading",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-global-link-error") {
    return {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "https://example.com/article",
        importState: "error",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-global-media-loading") {
    return {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "补充媒体备注",
        hasMedia: true,
        importState: "loading",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-global-media-error") {
    return {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "补充媒体备注",
        hasMedia: true,
        importState: "error",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  if (scenario === "quick-capture-global-saved") {
    return {
      flowContext: "global",
      phase: "saved-feedback",
      input: {
        text: "这是全局捕获的标题来源。下一句不会进入标题",
        importState: "idle",
        createFileChecked,
        selectedPoolId,
        selectedPoolLabel,
        poolDropdownVisible
      }
    };
  }

  return fallback;
}

// 场景校验。
export function isReviewScenario(value: unknown): value is ReviewScenario {
  return typeof value === "string" && REVIEW_SCENARIOS.includes(value as ReviewScenario);
}

export function normalizeReviewScenario(value: unknown): ReviewScenario {
  return isReviewScenario(value) ? value : DEFAULT_REVIEW_SCENARIO;
}
