/**
 * 写作与速记状态构造器。
 * 负责把快速记录运行时模型或评审场景转换成写作界面可直接渲染的视图状态。
 */

import {
  CREATE_NEW_POOL_ID,
  CREATE_NEW_POOL_LABEL,
  DEFAULT_POOL_ID,
  DEFAULT_POOL_LABEL
} from "../../plugin/constants";

// 写作与快速记录共用的视图模型。
export type WriteScenario =
  | "write-immersive-default"
  | "write-immersive-success"
  | "write-immersive-error"
  | "quick-capture-default"
  | "quick-capture-link-loading"
  | "quick-capture-link-error"
  | "quick-capture-first-use-saved";

export type WriteFlowContext = "first-use" | "global";
export type WritePhase = "capture" | "saving" | "save-failed" | "saved-feedback";
export type WriteContentKind = "text" | "link" | "media";
export type WriteImportState = "idle" | "loading" | "error";
export type WriteMediaPreviewKind = "image" | "video";
export type WriteLinkAttachmentIcon = "paperclip" | "loader" | "alert";
export type WriteAiPolishState = "idle" | "loading" | "reviewing" | "error";

const EMPTY_SUBMIT_FEEDBACK_MESSAGE = "还没有灵感写入，请再抓住它吧～";

interface WriteChoiceOption {
  id: string;
  label: string;
  description: string;
}

interface WriteChoice {
  title: string;
  options: WriteChoiceOption[];
}

export interface WritePoolOption {
  id: string;
  label: string;
}

export interface WritePoolPickerState {
  selectedId: string;
  selectedLabel: string;
  dropdownVisible: boolean;
  options: WritePoolOption[];
  createActionLabel: string;
}

export interface WriteAiPolishViewState {
  visible: boolean;
  state: WriteAiPolishState;
  sourceValue: string;
  polishedValue?: string;
  resultMatchesCurrentSource: boolean;
  errorMessage?: string;
}

export interface WriteViewState {
  shell: "immersive" | "quick-capture";
  flowContext?: WriteFlowContext;
  phase?: WritePhase;
  contentKind?: WriteContentKind;
  importState?: WriteImportState;
  title: string;
  subtitle: string;
  fields: {
    title: {
      label: string;
      placeholder: string;
      value?: string;
    };
    body: {
      label: string;
      placeholder: string;
      value?: string;
      inputPlaceholder?: string;
      autofocus: boolean;
    };
    poolHint: string;
  };
  poolPicker?: WritePoolPickerState;
  quickCapture?: {
    clipHint: string;
    shortcutHint: string;
    keyboardActionLabel: string;
    createFileActionLabel: string;
    createFileChecked?: boolean;
    hasCaptureFieldEdits?: boolean;
    aiPolish?: WriteAiPolishViewState;
    attachedMediaCount?: number;
    attachedMediaLabels?: string[];
    attachedMediaPreviewUrl?: string;
    attachedMediaPreviewKind?: WriteMediaPreviewKind;
    mediaOverlayMode?: "image-gallery" | "video";
    selectedMediaIndex?: number;
    canSelectPreviousMedia?: boolean;
    canSelectNextMedia?: boolean;
    canAddMoreImages?: boolean;
    mediaPreviewVisible?: boolean;
    captureSubtext?: string;
    closeConfirm?: {
      visible: boolean;
      title: string;
      description: string;
      resumeLabel: string;
      exitLabel: string;
    };
    emptySubmitFeedback?: {
      visible: boolean;
      message: string;
    };
  };
  linkImport?: {
    status: WriteImportState;
    message?: string;
    attachmentUrl?: string;
    attachmentLabel?: string;
    attachmentIcon?: WriteLinkAttachmentIcon;
    resultText?: string;
  };
  choice?: WriteChoice;
  footer: {
    secondaryAction: {
      label: string;
    };
    primaryAction: {
      label: string;
      tone: "primary" | "muted";
      disabled?: boolean;
    };
    statusText?: string;
  };
}

export interface QuickCaptureWriteStateModel {
  shell?: "quick-capture";
  flowContext: WriteFlowContext;
  phase: WritePhase;
  contentKind: WriteContentKind;
  importState?: WriteImportState;
  generatedTitle?: string;
  titleText?: string;
  hasManualTitle?: boolean;
  inputText?: string;
  importedExcerpt?: string;
  sourceUrl?: string;
  createFileChecked?: boolean;
  hasCaptureFieldEdits?: boolean;
  attachedMediaCount?: number;
  attachedMediaLabels?: string[];
  attachedMediaPreviewUrl?: string;
  attachedMediaPreviewKind?: WriteMediaPreviewKind;
  mediaOverlayMode?: "image-gallery" | "video";
  selectedMediaIndex?: number;
  canSelectPreviousMedia?: boolean;
  canSelectNextMedia?: boolean;
  canAddMoreImages?: boolean;
  mediaPreviewVisible?: boolean;
  closeConfirmVisible?: boolean;
  emptySubmitFeedbackVisible?: boolean;
  selectedPoolId?: string;
  selectedPoolLabel?: string;
  poolDropdownVisible?: boolean;
  poolOptions?: WritePoolOption[];
  poolCreateActionLabel?: string;
  aiPolishVisible?: boolean;
  aiPolishState?: WriteAiPolishState;
  aiPolishSourceValue?: string;
  aiPolishPolishedValue?: string;
  aiPolishErrorMessage?: string;
}

interface ImmersiveWriteStateModel {
  shell: "immersive";
  status?: "default" | "success" | "error";
}

export type WriteStateInput = WriteScenario | QuickCaptureWriteStateModel | ImmersiveWriteStateModel;

// 沉浸写作的基础状态。
function createImmersiveBaseState(): WriteViewState {
  return {
    shell: "immersive",
    title: "Immersive Write",
    subtitle: "Draft an idea with enough detail to shape it into a pool.",
    fields: {
      title: {
        label: "Title",
        placeholder: "Idea title"
      },
      body: {
        label: "Body",
        placeholder: "What should be captured?",
        autofocus: true
      },
      poolHint: "Pool: Unsorted"
    },
    footer: {
      secondaryAction: {
        label: "Close"
      },
      primaryAction: {
        label: "Save Draft",
        tone: "primary"
      }
    }
  };
}

// 快速记录文案与池选择派生。
function resolveAutoTitle(model: QuickCaptureWriteStateModel): string {
  if (model.flowContext === "first-use") {
    return "我的第一条灵感";
  }

  if (model.contentKind === "media") {
    const firstAttachedLabel = model.attachedMediaLabels?.[0]?.trim();
    if (firstAttachedLabel) {
      return firstAttachedLabel;
    }

    return "媒体灵感";
  }

  const generated = model.generatedTitle?.trim();
  if (generated) {
    return generated;
  }

  return "自动生成标题";
}

function createCaptureCopy(model: QuickCaptureWriteStateModel): {
  bodyPlaceholder: string;
  bodyInputPlaceholder: string;
  captureSubtext: string;
  clipHint: string;
  loadingMessage: string;
  errorMessage: string;
  successMessage: string;
  errorStatusText: string;
} {
  if (model.contentKind === "link") {
    return {
      bodyPlaceholder: "粘贴链接后自动提取标题与摘要，可继续补充你的判断。",
      bodyInputPlaceholder: "可选：补充备注或行动项...",
      captureSubtext: "支持 URL 粘贴；识别中可继续编辑下方文本。",
      clipHint: "粘贴链接后自动识别",
      loadingMessage: "正在识别链接，请稍后…",
      errorMessage: "读取链接内容失败，可手动书写灵感",
      successMessage: "识别完成，可继续补充灵感",
      errorStatusText: "链接识别失败，可重试后再保存。"
    };
  }

  if (model.contentKind === "media") {
    return {
      bodyPlaceholder: "粘贴媒体链接或附件后可提取关键信息，保留上下文更高效。",
      bodyInputPlaceholder: "可选：补充媒体备注或灵感说明...",
      captureSubtext: "支持图片/音视频链接或附件，识别完成后可继续编辑。",
      clipHint: "粘贴附件/媒体链接后自动识别",
      loadingMessage: "正在识别媒体内容...",
      errorMessage: "媒体识别失败，请重试",
      successMessage: "识别完成，可继续补充灵感",
      errorStatusText: "媒体识别失败，可重试后再保存。"
    };
  }

  return {
    bodyPlaceholder: "输入你现在想到的内容，保存后可继续整理到目标池。",
    bodyInputPlaceholder: "记录灵感，后续可继续补充...",
    captureSubtext: "可选：勾选\"保存灵感并创建文件\"，直接生成 Obsidian 文件。",
    clipHint: "粘贴附件/链接后自动识别",
    loadingMessage: "正在识别内容...",
    errorMessage: "内容识别失败，请重试",
    successMessage: "识别完成，可继续补充灵感",
    errorStatusText: "识别失败，可重试后再保存。"
  };
}

const GLOBAL_QUICK_CAPTURE_POOL_OPTIONS: WritePoolOption[] = [
  { id: DEFAULT_POOL_ID, label: DEFAULT_POOL_LABEL },
  { id: CREATE_NEW_POOL_ID, label: CREATE_NEW_POOL_LABEL }
];

function resolvePoolPickerState(model: QuickCaptureWriteStateModel): WritePoolPickerState {
  const fallbackOptions = model.flowContext === "first-use" ? [] : GLOBAL_QUICK_CAPTURE_POOL_OPTIONS;
  const options =
    model.poolOptions && (model.flowContext === "first-use" || model.poolOptions.length > 0)
      ? model.poolOptions
      : fallbackOptions;
  const selectedPoolId = model.selectedPoolId?.trim();
  const selectedPoolLabel = model.selectedPoolLabel?.trim();

  const selectedById = selectedPoolId ? options.find((option) => option.id === selectedPoolId) : undefined;
  const fallbackOption = options.find((option) => option.id === DEFAULT_POOL_ID) ?? options[0];

  if (selectedById) {
    return {
      selectedId: selectedById.id,
      selectedLabel: selectedById.label,
      dropdownVisible: model.poolDropdownVisible ?? false,
      options,
      createActionLabel: model.poolCreateActionLabel?.trim() || "新建池..."
    };
  }

  if (selectedPoolId) {
    return {
      selectedId: selectedPoolId,
      selectedLabel: selectedPoolLabel ?? fallbackOption?.label ?? DEFAULT_POOL_LABEL,
      dropdownVisible: model.poolDropdownVisible ?? false,
      options,
      createActionLabel: model.poolCreateActionLabel?.trim() || "新建池..."
    };
  }

  if (selectedPoolLabel) {
    return {
      selectedId: "",
      selectedLabel: selectedPoolLabel,
      dropdownVisible: model.poolDropdownVisible ?? false,
      options,
      createActionLabel: model.poolCreateActionLabel?.trim() || "新建池..."
    };
  }

  return {
    selectedId: fallbackOption?.id ?? DEFAULT_POOL_ID,
    selectedLabel: fallbackOption?.label ?? DEFAULT_POOL_LABEL,
    dropdownVisible: model.poolDropdownVisible ?? false,
    options,
    createActionLabel: model.poolCreateActionLabel?.trim() || "新建池..."
  };
}

// AI 润色视图态需要同时保留当前正文与结果生成时的原文，用于控制采纳按钮和脏结果提示。
function createAiPolishState(model: QuickCaptureWriteStateModel): WriteAiPolishViewState {
  const state = model.flowContext === "global" ? (model.aiPolishState ?? "idle") : "idle";
  const sourceValue = model.flowContext === "global" ? (model.inputText ?? model.aiPolishSourceValue ?? "") : "";
  const sourceValueAtResultTime = model.flowContext === "global" ? (model.aiPolishSourceValue ?? sourceValue) : sourceValue;

  return {
    visible: model.flowContext === "global" && (model.aiPolishVisible === true || state !== "idle"),
    state,
    sourceValue,
    polishedValue: state === "idle" ? undefined : model.aiPolishPolishedValue,
    resultMatchesCurrentSource: sourceValueAtResultTime === sourceValue,
    errorMessage: state === "idle" ? undefined : model.aiPolishErrorMessage
  };
}

// 快速记录采集态状态构造。
function createQuickCaptureCaptureState(model: QuickCaptureWriteStateModel): WriteViewState {
  const importState: WriteImportState = model.importState ?? "idle";
  const copy = createCaptureCopy(model);
  const isFirstUse = model.flowContext === "first-use";
  const mediaCount = model.attachedMediaCount ?? 0;
  const poolPicker = resolvePoolPickerState(model);
  const aiPolish = createAiPolishState(model);
  const shouldUseAiPolishSourceInBody = aiPolish.state === "reviewing" || aiPolish.state === "error";

  const footerStatusText = model.contentKind === "link" ? undefined : importState === "error" ? copy.errorStatusText : undefined;
  const isLinkCapture = model.contentKind === "link";
  const linkImportMessage =
    !isLinkCapture
      ? importState === "loading"
        ? copy.loadingMessage
        : importState === "error"
          ? copy.errorMessage
          : undefined
      : importState === "loading"
        ? copy.loadingMessage
        : importState === "error"
          ? copy.errorMessage
          : undefined;
  const linkBodyPlaceholder =
    importState === "loading"
      ? copy.loadingMessage
      : importState === "error"
        ? copy.errorMessage
        : copy.bodyInputPlaceholder;
  const linkBodyValue = isLinkCapture ? (model.inputText ?? "") : model.inputText ?? "";
  const linkAttachmentLabel = model.sourceUrl;
  const linkAttachmentIcon =
    isLinkCapture && model.sourceUrl
      ? "paperclip"
      : importState === "loading"
        ? "loader"
        : undefined;
  const clipHintText = copy.clipHint;
  const hasManualTitle = model.hasManualTitle ?? false;
  const autoTitle = resolveAutoTitle(model);
  const importedTitle = model.contentKind === "link" ? model.titleText?.trim() : undefined;
  const titleValue = hasManualTitle ? (model.titleText ?? "") : importedTitle || autoTitle;
  const bodyValue = shouldUseAiPolishSourceInBody
    ? aiPolish.sourceValue
    : isLinkCapture
      ? linkBodyValue
      : model.inputText ?? "";
  const primaryActionDisabled = aiPolish.state !== "idle";
  return {
    shell: "quick-capture",
    flowContext: model.flowContext,
    phase: "capture",
    contentKind: model.contentKind,
    importState,
    title: isFirstUse ? "记录第一条灵感" : "灵感速记",
    subtitle: "输入内容后保存，稍后可继续归池整理。",
    fields: {
      title: {
        label: "标题（自动）",
        placeholder: autoTitle,
        value: titleValue
      },
      body: {
        label: "灵感内容",
        placeholder: isLinkCapture && importState !== "idle" ? linkBodyPlaceholder : copy.bodyPlaceholder,
        value: bodyValue,
        inputPlaceholder: isLinkCapture ? linkBodyPlaceholder : copy.bodyInputPlaceholder,
        autofocus: false
      },
      poolHint: `池：${poolPicker.selectedLabel}`
    },
    poolPicker,
    quickCapture: {
      clipHint: clipHintText,
      shortcutHint: "Esc 关闭 · Cmd/Ctrl+Enter 保存",
      keyboardActionLabel: "快捷键设置",
      createFileActionLabel: "保存灵感并创建文件",
      createFileChecked: model.createFileChecked ?? false,
      hasCaptureFieldEdits: model.hasCaptureFieldEdits,
      aiPolish,
      attachedMediaCount: mediaCount,
      attachedMediaLabels: model.attachedMediaLabels,
      attachedMediaPreviewUrl: model.attachedMediaPreviewUrl,
      attachedMediaPreviewKind: model.attachedMediaPreviewKind,
      mediaOverlayMode: model.mediaOverlayMode,
      selectedMediaIndex: model.selectedMediaIndex,
      canSelectPreviousMedia: model.canSelectPreviousMedia,
      canSelectNextMedia: model.canSelectNextMedia,
      canAddMoreImages: model.canAddMoreImages,
      mediaPreviewVisible: model.mediaPreviewVisible ?? false,
      captureSubtext: copy.captureSubtext,
      closeConfirm: {
        visible: model.closeConfirmVisible ?? false,
        title: "关闭将打断灵感记录",
        description: "当前内容会留在本次记录窗口中，继续记录可返回当前编辑状态。",
        resumeLabel: "继续记录",
        exitLabel: "立即关闭"
      },
      emptySubmitFeedback: {
        visible: model.emptySubmitFeedbackVisible ?? false,
        message: EMPTY_SUBMIT_FEEDBACK_MESSAGE
      }
    },
    linkImport: {
      status: importState,
      message: linkImportMessage,
      attachmentUrl: model.sourceUrl,
      attachmentLabel: linkAttachmentLabel,
      attachmentIcon: linkAttachmentIcon,
      resultText: model.importedExcerpt?.trim() || undefined
    },
    footer: {
      secondaryAction: {
        label: "关闭"
      },
      primaryAction: {
        label: isFirstUse ? "保存并下一步" : "完成记录",
        tone: importState === "loading" || primaryActionDisabled ? "muted" : "primary",
        ...(primaryActionDisabled ? { disabled: true } : {})
      },
      statusText: footerStatusText
    }
  };
}

function formatSavedPoolLabel(label?: string): string {
  const trimmed = label?.trim();
  if (!trimmed) {
    return DEFAULT_POOL_LABEL;
  }

  return trimmed.endsWith("池") ? trimmed : `${trimmed}池`;
}

// 全局速记的保存反馈状态。
function createQuickCaptureGlobalSaveState(model: QuickCaptureWriteStateModel): WriteViewState {
  const savedPoolLabel = formatSavedPoolLabel(model.selectedPoolLabel);

  if (model.phase === "saving") {
    return {
      shell: "quick-capture",
      flowContext: model.flowContext,
      phase: "saving",
      contentKind: model.contentKind,
      importState: model.importState ?? "idle",
      title: "灵感保存中",
      subtitle: "正在写入灵感池与索引，请稍候…",
      fields: {
        title: {
          label: "",
          placeholder: ""
        },
        body: {
          label: "",
          placeholder: "",
          autofocus: false
        },
        poolHint: ""
      },
      choice: {
        title: "处理中",
        options: [
          {
            id: "processing",
            label: "",
            description: "· 正在保存标题与正文\n· 正在同步池归属与状态标记"
          }
        ]
      },
      footer: {
        secondaryAction: {
          label: "请稍候"
        },
        primaryAction: {
          label: "保存中…",
          tone: "muted"
        }
      }
    };
  }

  if (model.phase === "save-failed") {
    return {
      shell: "quick-capture",
      flowContext: model.flowContext,
      phase: "save-failed",
      contentKind: model.contentKind,
      importState: model.importState ?? "idle",
      title: "灵感保存失败",
      subtitle: "保存未完成，请检查必填信息或稍后重试。",
      fields: {
        title: {
          label: "",
          placeholder: ""
        },
        body: {
          label: "",
          placeholder: "",
          autofocus: false
        },
        poolHint: ""
      },
      choice: {
        title: "需处理",
        options: [
          {
            id: "failed",
            label: "",
            description: "· 池名称或内容可能为空\n· 网络或文件系统暂不可用"
          }
        ]
      },
      footer: {
        secondaryAction: {
          label: "返回编辑"
        },
        primaryAction: {
          label: "重试保存",
          tone: "primary"
        }
      }
    };
  }

  return {
    shell: "quick-capture",
    flowContext: model.flowContext,
    phase: "saved-feedback",
    contentKind: model.contentKind,
    importState: model.importState ?? "idle",
    title: "灵感已入池",
    subtitle: "",
    fields: {
      title: {
        label: "",
        placeholder: ""
      },
      body: {
        label: "",
        placeholder: "",
        autofocus: false
      },
      poolHint: ""
    },
    choice: {
      title: "",
      options: [
        {
          id: "saved",
          label: "",
          description: `· 已保存到${savedPoolLabel}\n· 可在池内继续编辑与创建文件`
        }
      ]
    },
    footer: {
      secondaryAction: {
        label: "继续记录"
      },
      primaryAction: {
        label: "进入池内",
        tone: "primary"
      }
    }
  };
}

// 首次使用与全局流程的保存完成态分流。
function createQuickCaptureSavedFeedbackState(model: QuickCaptureWriteStateModel): WriteViewState {
  if (model.flowContext === "global") {
    return createQuickCaptureGlobalSaveState(model);
  }

  const poolPicker = resolvePoolPickerState(model);

  return {
    shell: "quick-capture",
    flowContext: model.flowContext,
    phase: "saved-feedback",
    contentKind: model.contentKind,
    importState: model.importState ?? "idle",
    title: "灵感已保存",
    subtitle: "继续选择这条灵感要进入的灵感池。",
    fields: {
      title: {
        label: "标题（自动）",
        placeholder: resolveAutoTitle(model)
      },
      body: {
        label: "灵感内容",
        placeholder: "已保存成功",
        value: model.inputText ?? "",
        autofocus: false
      },
      poolHint: `池：${poolPicker.selectedLabel}`
    },
    poolPicker,
    choice: {
      title: "下一步",
      options: [
        {
          id: "choose-pool",
          label: "选择归池",
          description: "继续为这条灵感选择目标池。"
        }
      ]
    },
    footer: {
      secondaryAction: {
        label: "返回首页"
      },
      primaryAction: {
        label: "选择归池",
        tone: "primary"
      }
    }
  };
}

// 沉浸写作状态派生。
function createImmersiveState(status: "default" | "success" | "error"): WriteViewState {
  if (status === "default") {
    return createImmersiveBaseState();
  }

  if (status === "success") {
    return {
      ...createImmersiveBaseState(),
      footer: {
        secondaryAction: {
          label: "Close"
        },
        primaryAction: {
          label: "Saved",
          tone: "muted"
        },
        statusText: "Idea saved to Unsorted pool."
      }
    };
  }

  return {
    ...createImmersiveBaseState(),
    footer: {
      secondaryAction: {
        label: "Close"
      },
      primaryAction: {
        label: "Retry Save",
        tone: "primary"
      },
      statusText: "Could not save draft. Try again."
    }
  };
}

// 评审场景到通用模型的适配。
function adaptScenario(scenario: WriteScenario): QuickCaptureWriteStateModel | ImmersiveWriteStateModel {
  if (scenario === "write-immersive-default") {
    return {
      shell: "immersive",
      status: "default"
    };
  }

  if (scenario === "write-immersive-success") {
    return {
      shell: "immersive",
      status: "success"
    };
  }

  if (scenario === "write-immersive-error") {
    return {
      shell: "immersive",
      status: "error"
    };
  }

  if (scenario === "quick-capture-default") {
    return {
      flowContext: "first-use",
      phase: "capture",
      contentKind: "text",
      importState: "idle"
    };
  }

  if (scenario === "quick-capture-link-loading") {
    return {
      flowContext: "first-use",
      phase: "capture",
      contentKind: "link",
      importState: "loading",
      sourceUrl: "https://example.com/article"
    };
  }

  if (scenario === "quick-capture-link-error") {
    return {
      flowContext: "first-use",
      phase: "capture",
      contentKind: "link",
      importState: "error",
      sourceUrl: "https://example.com/article"
    };
  }

  if (scenario === "quick-capture-first-use-saved") {
    return {
      flowContext: "first-use",
      phase: "saved-feedback",
      contentKind: "text",
      importState: "idle"
    };
  }

  throw new Error(`buildWriteViewState does not support scenario: ${scenario}`);
}

// 写作视图状态构建入口。
export function buildWriteViewState(input: WriteStateInput): WriteViewState {
  const normalized = typeof input === "string" ? adaptScenario(input) : input;

  if (normalized.shell === "immersive") {
    return createImmersiveState(normalized.status ?? "default");
  }

  if (normalized.phase === "saving" || normalized.phase === "save-failed" || normalized.phase === "saved-feedback") {
    return createQuickCaptureSavedFeedbackState(normalized);
  }

  return createQuickCaptureCaptureState(normalized);
}
