/**
 * 写作与速记状态构造器。
 * 负责把快速记录运行时模型或评审场景转换成写作界面可直接渲染的视图状态。
 */

import { getInterfaceText } from "../../i18n/interface-language";
import type { PluginInterfaceLanguage } from "../../settings/settings";
import {
  CREATE_NEW_POOL_ID,
  DEFAULT_POOL_ID
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
    labels?: {
      aiPolishTrigger: string;
      aiPolishLoading: string;
      aiPolishAccept: string;
      aiPolishRedo: string;
      aiPolishBack: string;
      aiPolishDefaultError: string;
      aiPolishEmptyResult: string;
      aiPolishStaleWarning: string;
      defaultSaveHelperText: string;
      closeQuickCapture: string;
      attachmentPick: string;
      linkAttachmentRemove: string;
      mediaPreviewOpen: string;
      selectedImage: string;
      selectedVideo: string;
      previousImage: string;
      nextImage: string;
      addImage: string;
      replaceImage: string;
      removeImage: string;
      replaceVideo: string;
      removeVideo: string;
      mediaPreviewClose: string;
      mediaPreviewImage: string;
      mediaPreviewVideo: string;
    };
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
    mediaReplaceConfirm?: {
      visible: boolean;
      title: string;
      description: string;
      keepLabel: string;
      replaceLabel: string;
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
  interfaceLanguage?: PluginInterfaceLanguage;
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
  mediaReplaceConfirmVisible?: boolean;
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
  const text = getInterfaceText(model.interfaceLanguage);

  if (model.flowContext === "first-use") {
    return text.write.firstIdeaTitle;
  }

  if (model.contentKind === "media") {
    const firstAttachedLabel = model.attachedMediaLabels?.[0]?.trim();
    if (firstAttachedLabel) {
      return firstAttachedLabel;
    }

    return text.write.mediaIdeaTitle;
  }

  const generated = model.generatedTitle?.trim();
  if (generated) {
    return generated;
  }

  return text.write.autoTitleFallback;
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
  const text = getInterfaceText(model.interfaceLanguage).write;

  if (model.contentKind === "link") {
    return {
      bodyPlaceholder: text.linkBodyPlaceholder,
      bodyInputPlaceholder: text.linkInputPlaceholder,
      captureSubtext: text.linkCaptureSubtext,
      clipHint: text.linkClipHint,
      loadingMessage: text.linkLoadingMessage,
      errorMessage: text.linkErrorMessage,
      successMessage: text.linkSuccessMessage,
      errorStatusText: text.linkErrorStatusText
    };
  }

  if (model.contentKind === "media") {
    return {
      bodyPlaceholder: text.mediaBodyPlaceholder,
      bodyInputPlaceholder: text.mediaInputPlaceholder,
      captureSubtext: text.mediaCaptureSubtext,
      clipHint: text.mediaClipHint,
      loadingMessage: text.mediaLoadingMessage,
      errorMessage: text.mediaErrorMessage,
      successMessage: text.mediaSuccessMessage,
      errorStatusText: text.mediaErrorStatusText
    };
  }

  return {
    bodyPlaceholder: text.textBodyPlaceholder,
    bodyInputPlaceholder: text.textInputPlaceholder,
    captureSubtext: text.textCaptureSubtext,
    clipHint: text.textClipHint,
    loadingMessage: text.textLoadingMessage,
    errorMessage: text.textErrorMessage,
    successMessage: text.textSuccessMessage,
    errorStatusText: text.textErrorStatusText
  };
}

function resolveGlobalQuickCapturePoolOptions(language?: PluginInterfaceLanguage): WritePoolOption[] {
  const text = getInterfaceText(language).pool;
  return [
    { id: DEFAULT_POOL_ID, label: text.defaultPoolName },
    { id: CREATE_NEW_POOL_ID, label: text.newPoolLabel }
  ];
}

function resolvePoolPickerState(model: QuickCaptureWriteStateModel): WritePoolPickerState {
  const text = getInterfaceText(model.interfaceLanguage).pool;
  const fallbackOptions = model.flowContext === "first-use" ? [] : resolveGlobalQuickCapturePoolOptions(model.interfaceLanguage);
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
      createActionLabel: model.poolCreateActionLabel?.trim() || `${text.newPoolLabel}...`
    };
  }

  if (selectedPoolId) {
    return {
      selectedId: selectedPoolId,
      selectedLabel: selectedPoolLabel ?? fallbackOption?.label ?? text.defaultPoolName,
      dropdownVisible: model.poolDropdownVisible ?? false,
      options,
      createActionLabel: model.poolCreateActionLabel?.trim() || `${text.newPoolLabel}...`
    };
  }

  if (selectedPoolLabel) {
    return {
      selectedId: "",
      selectedLabel: selectedPoolLabel,
      dropdownVisible: model.poolDropdownVisible ?? false,
      options,
      createActionLabel: model.poolCreateActionLabel?.trim() || `${text.newPoolLabel}...`
    };
  }

  return {
    selectedId: fallbackOption?.id ?? DEFAULT_POOL_ID,
    selectedLabel: fallbackOption?.label ?? text.defaultPoolName,
    dropdownVisible: model.poolDropdownVisible ?? false,
    options,
    createActionLabel: model.poolCreateActionLabel?.trim() || `${text.newPoolLabel}...`
  };
}

// AI 润色视图态需要同时保留当前正文与结果生成时的原文，用于控制采纳按钮和脏结果提示。
function createQuickCaptureLabels(model: QuickCaptureWriteStateModel): NonNullable<WriteViewState["quickCapture"]>["labels"] {
  const text = getInterfaceText(model.interfaceLanguage).write;
  return {
    aiPolishTrigger: text.aiPolishTrigger,
    aiPolishLoading: text.aiPolishLoading,
    aiPolishAccept: text.aiPolishAccept,
    aiPolishRedo: text.aiPolishRedo,
    aiPolishBack: text.aiPolishBack,
    aiPolishDefaultError: text.aiPolishDefaultError,
    aiPolishEmptyResult: text.aiPolishEmptyResult,
    aiPolishStaleWarning: text.aiPolishStaleWarning,
    defaultSaveHelperText: text.defaultSaveHelperText,
    closeQuickCapture: text.closeQuickCaptureLabel,
    attachmentPick: text.attachmentPickLabel,
    linkAttachmentRemove: text.linkAttachmentRemoveLabel,
    mediaPreviewOpen: text.mediaPreviewOpenLabel,
    selectedImage: text.selectedImageLabel,
    selectedVideo: text.selectedVideoLabel,
    previousImage: text.previousImageLabel,
    nextImage: text.nextImageLabel,
    addImage: text.addImageLabel,
    replaceImage: text.replaceImageLabel,
    removeImage: text.removeImageLabel,
    replaceVideo: text.replaceVideoLabel,
    removeVideo: text.removeVideoLabel,
    mediaPreviewClose: text.mediaPreviewCloseLabel,
    mediaPreviewImage: text.mediaPreviewImageLabel,
    mediaPreviewVideo: text.mediaPreviewVideoLabel
  };
}

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
  const text = getInterfaceText(model.interfaceLanguage);
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
    title: isFirstUse ? text.write.firstUseTitle : text.write.title,
    subtitle: text.write.subtitle,
    fields: {
      title: {
        label: text.write.titleLabel,
        placeholder: autoTitle,
        value: titleValue
      },
      body: {
        label: text.write.bodyLabel,
        placeholder: isLinkCapture && importState !== "idle" ? linkBodyPlaceholder : copy.bodyPlaceholder,
        value: bodyValue,
        inputPlaceholder: isLinkCapture ? linkBodyPlaceholder : isFirstUse ? copy.bodyInputPlaceholder : text.write.contentPlaceholder,
        autofocus: false
      },
      poolHint: text.write.poolHint(poolPicker.selectedLabel)
    },
    poolPicker,
    quickCapture: {
      clipHint: clipHintText,
      shortcutHint: text.write.shortcutHint,
      keyboardActionLabel: text.write.keyboardActionLabel,
      createFileActionLabel: text.write.createFileActionLabel,
      createFileChecked: model.createFileChecked ?? false,
      hasCaptureFieldEdits: model.hasCaptureFieldEdits,
      aiPolish,
      labels: createQuickCaptureLabels(model),
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
        title: text.write.closeConfirmTitle,
        description: text.write.closeConfirmDescription,
        resumeLabel: text.write.closeConfirmResume,
        exitLabel: text.write.closeConfirmExit
      },
      mediaReplaceConfirm: {
        visible: model.mediaReplaceConfirmVisible ?? false,
        title: text.write.replaceMediaWithLinkConfirmTitle,
        description: text.write.replaceMediaWithLinkConfirmDescription,
        keepLabel: text.write.replaceMediaWithLinkConfirmKeepLabel,
        replaceLabel: text.write.replaceMediaWithLinkConfirmReplaceLabel
      },
      emptySubmitFeedback: {
        visible: model.emptySubmitFeedbackVisible ?? false,
        message: text.write.emptySubmitFeedback
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
        label: text.write.close
      },
      primaryAction: {
        label: isFirstUse ? text.write.saveAndNext : text.write.completeCapture,
        tone: importState === "loading" || primaryActionDisabled ? "muted" : "primary",
        ...(primaryActionDisabled ? { disabled: true } : {})
      },
      statusText: footerStatusText
    }
  };
}

function formatSavedPoolLabel(label: string | undefined, language?: PluginInterfaceLanguage): string {
  const trimmed = label?.trim();
  if (!trimmed) {
    return getInterfaceText(language).pool.defaultPoolName;
  }

  if (language === "en") {
    return trimmed;
  }

  return trimmed.endsWith("池") ? trimmed : `${trimmed}池`;
}

// 全局速记的保存反馈状态。
function createQuickCaptureGlobalSaveState(model: QuickCaptureWriteStateModel): WriteViewState {
  const text = getInterfaceText(model.interfaceLanguage);
  const savedPoolLabel = formatSavedPoolLabel(model.selectedPoolLabel, model.interfaceLanguage);

  if (model.phase === "saving") {
    return {
      shell: "quick-capture",
      flowContext: model.flowContext,
      phase: "saving",
      contentKind: model.contentKind,
      importState: model.importState ?? "idle",
      title: text.write.savingTitle,
      subtitle: text.write.savingSubtitle,
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
        title: text.write.savingChoiceTitle,
        options: [
          {
            id: "processing",
            label: "",
            description: text.write.savingChoiceDescription
          }
        ]
      },
      quickCapture: {
        clipHint: "",
        shortcutHint: "",
        keyboardActionLabel: "",
        createFileActionLabel: "",
        labels: createQuickCaptureLabels(model)
      },
      footer: {
        secondaryAction: {
          label: text.write.savingSecondaryLabel
        },
        primaryAction: {
          label: text.write.savingPrimaryLabel,
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
      title: text.write.saveFailedTitle,
      subtitle: text.write.saveFailedSubtitle,
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
        title: text.write.saveFailedChoiceTitle,
        options: [
          {
            id: "failed",
            label: "",
            description: text.write.saveFailedChoiceDescription
          }
        ]
      },
      quickCapture: {
        clipHint: "",
        shortcutHint: "",
        keyboardActionLabel: "",
        createFileActionLabel: "",
        labels: createQuickCaptureLabels(model)
      },
      footer: {
        secondaryAction: {
          label: text.write.saveFailedSecondaryLabel
        },
        primaryAction: {
          label: text.write.saveFailedPrimaryLabel,
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
    title: text.write.savedFeedbackTitle,
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
    quickCapture: {
      clipHint: "",
      shortcutHint: "",
      keyboardActionLabel: "",
      createFileActionLabel: "",
      labels: createQuickCaptureLabels(model)
    },
    choice: {
      title: "",
      options: [
        {
          id: "saved",
          label: "",
          description: text.write.savedFeedbackDescription(savedPoolLabel)
        }
      ]
    },
    footer: {
      secondaryAction: {
        label: text.write.savedFeedbackSecondaryLabel
      },
      primaryAction: {
        label: text.write.savedFeedbackPrimaryLabel,
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

  const text = getInterfaceText(model.interfaceLanguage);
  const poolPicker = resolvePoolPickerState(model);

  return {
    shell: "quick-capture",
    flowContext: model.flowContext,
    phase: "saved-feedback",
    contentKind: model.contentKind,
    importState: model.importState ?? "idle",
    title: text.write.firstUseSavedTitle,
    subtitle: text.write.firstUseSavedSubtitle,
    fields: {
      title: {
        label: text.write.titleLabel,
        placeholder: resolveAutoTitle(model)
      },
      body: {
        label: text.write.bodyLabel,
        placeholder: text.write.firstUseSavedBodyPlaceholder,
        value: model.inputText ?? "",
        autofocus: false
      },
      poolHint: text.write.poolHint(poolPicker.selectedLabel)
    },
    poolPicker,
    quickCapture: {
      clipHint: "",
      shortcutHint: "",
      keyboardActionLabel: "",
      createFileActionLabel: "",
      labels: createQuickCaptureLabels(model)
    },
    choice: {
      title: text.write.firstUseSavedChoiceTitle,
      options: [
        {
          id: "choose-pool",
          label: text.write.firstUseSavedChoiceLabel,
          description: text.write.firstUseSavedChoiceDescription
        }
      ]
    },
    footer: {
      secondaryAction: {
        label: text.write.firstUseSavedSecondaryLabel
      },
      primaryAction: {
        label: text.write.firstUseSavedPrimaryLabel,
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
