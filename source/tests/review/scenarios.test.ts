/**
 * 保护设计评审场景定义相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_REVIEW_SCENARIO,
  REVIEW_SCENARIOS,
  createQuickCaptureRuntimeStateForScenario,
  createQuickCaptureWriteStateOverridesForScenario,
  isReviewScenario,
  normalizeReviewScenario
} from "../../src/review/scenarios";
import {
  deriveQuickCaptureStateModel,
  detectQuickCaptureContentKind
} from "../../src/ui/write/quick-capture-runtime";
import { buildWriteViewState } from "../../src/ui/write/write-state";

// 校验评审场景集合与预设状态的基线定义。
describe("review scenarios", () => {
  it("keeps a stable list of supported review scenarios", () => {
    expect(REVIEW_SCENARIOS).toEqual([
      "home-empty",
      "home-populated",
      "search-results",
      "search-empty",
      "search-loading",
      "search-batch",
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
      "write-immersive-error",
      "pool-browse",
      "pool-empty",
      "pool-reduced-motion",
      "pool-first-use-choose",
      "pool-first-use-create",
      "settings-default",
      "settings-reduced-motion",
      "settings-conflict"
    ]);
  });

  it("identifies valid review scenarios", () => {
    expect(isReviewScenario("search-results")).toBe(true);
    expect(isReviewScenario("unknown-scenario")).toBe(false);
    expect(isReviewScenario(null)).toBe(false);
  });

  it("normalizes invalid review scenarios to the default", () => {
    expect(normalizeReviewScenario("settings-conflict")).toBe("settings-conflict");
    expect(normalizeReviewScenario("not-real")).toBe(DEFAULT_REVIEW_SCENARIO);
    expect(normalizeReviewScenario(undefined)).toBe(DEFAULT_REVIEW_SCENARIO);
  });

  it("detects content kind with precedence media > link > text", () => {
    expect(
      detectQuickCaptureContentKind({
        text: "https://example.com/article",
        hasMedia: true
      })
    ).toBe("media");
    expect(detectQuickCaptureContentKind({ text: "https://cdn.example.com/shot.png" })).toBe("link");
    expect(detectQuickCaptureContentKind({ text: "https://example.com/article" })).toBe("link");
    expect(detectQuickCaptureContentKind({ text: "纯文本输入" })).toBe("text");
  });
  it("derives timestamp title for global text flow by default", () => {
    const state = deriveQuickCaptureStateModel(
      {
        flowContext: "global",
        phase: "capture",
        input: {
          text: "这是第一句标题。第二句不参与标题"
        }
      },
      {
        now: new Date(2026, 3, 8, 9, 12)
      }
    );

    expect(state.generatedTitle).toBe("灵感 04-08 09:12");
    expect(state.titleText).toBe("灵感 04-08 09:12");
  });

  it("falls back to localized timestamp title in global flow when leading text unavailable", () => {
    const state = deriveQuickCaptureStateModel(
      {
        flowContext: "global",
        phase: "capture",
        input: {
          text: "https://example.com/only-link"
        }
      },
      {
        now: new Date(2026, 3, 8, 9, 12),
        interfaceLanguage: "en"
      }
    );

    expect(state.generatedTitle).toBe("Idea 04-08 09:12");
    expect(state.titleText).toBe("Idea 04-08 09:12");
    expect(state.selectedPoolLabel).toBe("Default pool");
  });

  it("keeps user-overridden title when provided", () => {
    const state = deriveQuickCaptureStateModel(
      {
        flowContext: "global",
        phase: "capture",
        input: {
          text: "这是第一句标题。第二句不参与标题",
          title: "用户手动标题"
        }
      },
      {
        now: new Date(2026, 3, 8, 9, 12)
      }
    );

    expect(state.generatedTitle).toBe("灵感 04-08 09:12");
    expect(state.titleText).toBe("用户手动标题");
  });

  it("maps global review scenarios into runtime state", () => {
    const fallback = {
      flowContext: "first-use" as const,
      phase: "capture" as const,
      input: {
        text: "fallback"
      }
    };

    const state = createQuickCaptureRuntimeStateForScenario("quick-capture-global-media-error", fallback);

    expect(state).toEqual({
      flowContext: "global",
      phase: "capture",
      input: {
        text: "补充媒体备注",
        hasMedia: true,
        importState: "error",
        createFileChecked: false
      }
    });
  });

  it("maps first-use default review scenario to an empty input body", () => {
    const runtimeState = createQuickCaptureRuntimeStateForScenario("quick-capture-default", {
      flowContext: "first-use",
      phase: "capture",
      input: {
        text: "fallback"
      }
    });

    expect(runtimeState.input.text).toBe("");
  });

  it("adds AI quick-capture review scenarios and write-state overrides", () => {
    expect(createQuickCaptureWriteStateOverridesForScenario("quick-capture-ai-ready")).toEqual({
      contentKind: "text",
      importState: "idle",
      hasManualTitle: false,
      attachedMediaCount: 0,
      aiPolishVisible: true,
      aiPolishState: "idle"
    });

    expect(createQuickCaptureWriteStateOverridesForScenario("quick-capture-ai-reviewing")).toMatchObject({
      contentKind: "text",
      importState: "idle",
      hasManualTitle: false,
      inputText: "我先写一版原文，再看润色结果。",
      attachedMediaCount: 0,
      aiPolishVisible: true,
      aiPolishState: "reviewing",
      aiPolishSourceValue: "我先写一版原文，再看润色结果。",
      aiPolishPolishedValue: "我先写一版原文，然后查看润色结果。"
    });

    expect(createQuickCaptureWriteStateOverridesForScenario("quick-capture-ai-error")).toMatchObject({
      contentKind: "text",
      importState: "idle",
      hasManualTitle: false,
      inputText: "我先写一版原文，再看润色结果。",
      attachedMediaCount: 0,
      aiPolishVisible: true,
      aiPolishState: "error",
      aiPolishSourceValue: "我先写一版原文，再看润色结果。",
      aiPolishErrorMessage: "AI 请求失败，请检查网络或 API 配置后重试。"
    });
  });

  it("maps AI quick-capture review scenarios to deterministic runtime state", () => {
    const staleFallback = {
      flowContext: "first-use" as const,
      phase: "capture" as const,
      input: {
        text: "https://example.com/live",
        title: "手动标题",
        hasMedia: true,
        importState: "loading" as const,
        createFileChecked: true,
        selectedPoolId: "pool-research",
        selectedPoolLabel: "调研池",
        poolDropdownVisible: true
      }
    };

    expect(createQuickCaptureRuntimeStateForScenario("quick-capture-ai-ready", staleFallback)).toEqual({
      flowContext: "global",
      phase: "capture",
      input: {
        text: "",
        title: "灵感 04-08 09:12",
        hasManualTitle: false,
        importState: "idle"
      }
    });

    expect(createQuickCaptureRuntimeStateForScenario("quick-capture-ai-reviewing", staleFallback)).toEqual({
      flowContext: "global",
      phase: "capture",
      input: {
        text: "我先写一版原文，再看润色结果。",
        title: "灵感 04-08 09:12",
        hasManualTitle: false,
        importState: "idle"
      }
    });

    expect(createQuickCaptureRuntimeStateForScenario("quick-capture-ai-error", staleFallback)).toEqual({
      flowContext: "global",
      phase: "capture",
      input: {
        text: "我先写一版原文，再看润色结果。",
        title: "灵感 04-08 09:12",
        hasManualTitle: false,
        importState: "idle"
      }
    });
  });

  it("preserves deterministic non-manual AI titles through the shared runtime-to-write path", () => {
    const runtimeState = createQuickCaptureRuntimeStateForScenario("quick-capture-ai-ready", {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "fallback"
      }
    });

    const model = deriveQuickCaptureStateModel(runtimeState, {
      now: new Date(2026, 0, 1, 7, 30)
    });

    expect(model.generatedTitle).toBe("灵感 04-08 09:12");
    expect(model.titleText).toBe("灵感 04-08 09:12");
    expect(buildWriteViewState(model).fields.title).toEqual({
      label: "标题（自动）",
      placeholder: "灵感 04-08 09:12",
      value: "灵感 04-08 09:12"
    });
  });

  it("preserves create-file checked flag in runtime and derived quick-capture model", () => {
    const runtimeState = createQuickCaptureRuntimeStateForScenario("quick-capture-global-default", {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "fallback",
        createFileChecked: true
      }
    });

    expect(runtimeState.input.createFileChecked).toBe(true);

    const model = deriveQuickCaptureStateModel(runtimeState);
    expect(model.createFileChecked).toBe(true);
  });

  it("preserves fallback selected pool state when mapping quick-capture review scenarios", () => {
    const runtimeState = createQuickCaptureRuntimeStateForScenario("quick-capture-global-default", {
      flowContext: "global",
      phase: "capture",
      input: {
        text: "fallback",
        selectedPoolId: "new-pool-created",
        selectedPoolLabel: "新建池",
        poolDropdownVisible: true
      }
    });

    expect(runtimeState.input.selectedPoolId).toBe("new-pool-created");
    expect(runtimeState.input.selectedPoolLabel).toBe("新建池");
    expect(runtimeState.input.poolDropdownVisible).toBe(true);

    const model = deriveQuickCaptureStateModel(runtimeState);
    expect(model.selectedPoolId).toBe("new-pool-created");
    expect(model.selectedPoolLabel).toBe("新建池");
    expect(model.poolDropdownVisible).toBe(true);
  });
});
