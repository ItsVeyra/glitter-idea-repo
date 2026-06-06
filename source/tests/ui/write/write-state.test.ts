/**
 * 保护快速捕获页状态装配相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { buildWriteViewState } from "../../../src/ui/write/write-state";

// 覆盖状态装配函数在主要输入场景下的输出契约。
describe("buildWriteViewState", () => {
  it("builds immersive default state", () => {
    const state = buildWriteViewState("write-immersive-default");

    expect(state.shell).toBe("immersive");
    expect(state.title).toBe("Immersive Write");
    expect(state.fields.title).toEqual({
      label: "Title",
      placeholder: "Idea title"
    });
    expect(state.fields.body).toEqual({
      label: "Body",
      placeholder: "What should be captured?",
      autofocus: true
    });
    expect(state.footer.primaryAction).toEqual({
      label: "Save Draft",
      tone: "primary"
    });
    expect(state.linkImport).toBeUndefined();
    expect(state.choice).toBeUndefined();
  });

  it("builds immersive success state with status text", () => {
    const state = buildWriteViewState("write-immersive-success");

    expect(state.shell).toBe("immersive");
    expect(state.footer.primaryAction).toEqual({
      label: "Saved",
      tone: "muted"
    });
    expect(state.footer.statusText).toBe("Idea saved to Unsorted pool.");
  });

  it("builds immersive error state with retry copy", () => {
    const state = buildWriteViewState("write-immersive-error");

    expect(state.shell).toBe("immersive");
    expect(state.footer.primaryAction).toEqual({
      label: "Retry Save",
      tone: "primary"
    });
    expect(state.footer.statusText).toBe("Could not save draft. Try again.");
  });

  it("reuses formal text capture copy while keeping first-use title semantics and ai hidden", () => {
    const state = buildWriteViewState({
      flowContext: "first-use",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      aiPolishVisible: true,
      aiPolishState: "reviewing",
      aiPolishSourceValue: "待润色原文",
      aiPolishPolishedValue: "润色后的灵感",
      aiPolishErrorMessage: "不应显示的错误"
    });

    expect(state.shell).toBe("quick-capture");
    expect(state.flowContext).toBe("first-use");
    expect(state.phase).toBe("capture");
    expect(state.contentKind).toBe("text");
    expect(state.importState).toBe("idle");
    expect(state.title).toBe("记录第一条灵感");
    expect(state.subtitle).toBe("输入内容后保存，稍后可继续归池整理。");
    expect(state.fields.title).toEqual({
      label: "标题（自动）",
      placeholder: "我的第一条灵感",
      value: "我的第一条灵感"
    });
    expect(state.fields.body.placeholder).toBe("输入你现在想到的内容，保存后可继续整理到目标池。");
    expect(state.fields.body.inputPlaceholder).toBe("记录灵感，后续可继续补充...");
    expect(state.quickCapture?.captureSubtext).toBe("可选：勾选\"保存灵感并创建文件\"，直接生成 Obsidian 文件。");
    expect(state.quickCapture?.clipHint).toBe("粘贴附件/链接后自动识别");
    expect(state.quickCapture?.createFileChecked).toBe(false);
    expect(state.quickCapture?.aiPolish).toEqual({
      visible: false,
      state: "idle",
      sourceValue: "",
      polishedValue: undefined,
      resultMatchesCurrentSource: true,
      errorMessage: undefined
    });
    expect(state.poolPicker).toEqual({
      selectedId: "pool-default",
      selectedLabel: "默认池",
      dropdownVisible: false,
      options: [],
      createActionLabel: "新建池..."
    });
    expect(state.linkImport).toEqual({
      status: "idle",
      message: undefined
    });
    expect(state.footer.primaryAction).toEqual({
      label: "保存并下一步",
      tone: "primary"
    });
  });

  it("builds English fixed quick capture interface text when requested", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      interfaceLanguage: "en"
    });

    expect(state.title).toBe("Quick Capture");
    expect(state.fields.title.label).toBe("Title (auto)");
    expect(state.fields.title.placeholder).toBe("Auto-generated title");
    expect(state.fields.body.label).toBe("Idea content");
    expect(state.fields.body.inputPlaceholder).toBe("Write an idea, snippet, or link");
    expect(state.fields.poolHint).toBe("Pool: Default pool");
    expect(state.poolPicker?.selectedLabel).toBe("Default pool");
    expect(state.poolPicker?.createActionLabel).toBe("New pool...");
    expect(state.quickCapture?.clipHint).toBe("Paste attachments or links to auto-detect");
    expect(state.quickCapture?.createFileActionLabel).toBe("Save idea and create file");
    expect(state.footer.primaryAction.label).toBe("Complete capture");
  });

  it("exposes English quick capture detail labels for renderer-only controls", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "media",
      importState: "idle",
      interfaceLanguage: "en",
      attachedMediaCount: 2,
      attachedMediaPreviewUrl: "app://image.png",
      attachedMediaPreviewKind: "image",
      mediaOverlayMode: "image-gallery",
      aiPolishVisible: true,
      aiPolishState: "reviewing",
      aiPolishSourceValue: "rough note",
      aiPolishPolishedValue: "polished note"
    });

    expect(state.quickCapture?.labels).toMatchObject({
      aiPolishTrigger: "AI polish",
      aiPolishLoading: "AI polishing...",
      aiPolishAccept: "Accept result",
      aiPolishRedo: "Redo",
      aiPolishBack: "Cancel",
      defaultSaveHelperText: "Saved as an idea by default (no .md file created)",
      closeQuickCapture: "Close quick capture",
      attachmentPick: "Add image or video attachments",
      linkAttachmentRemove: "Remove loaded link",
      mediaPreviewOpen: "View large preview",
      selectedImage: "Selected media image thumbnail",
      selectedVideo: "Selected media video thumbnail",
      previousImage: "Previous image",
      nextImage: "Next image",
      addImage: "Add image",
      replaceImage: "Replace current image",
      removeImage: "Remove current image",
      replaceVideo: "Replace video",
      removeVideo: "Remove video",
      mediaPreviewClose: "Close large preview",
      mediaPreviewImage: "Media large preview"
    });
  });

  it("builds English global quick capture save feedback states", () => {
    const saving = buildWriteViewState({
      flowContext: "global",
      phase: "saving",
      contentKind: "text",
      importState: "idle",
      interfaceLanguage: "en"
    });
    const failed = buildWriteViewState({
      flowContext: "global",
      phase: "save-failed",
      contentKind: "text",
      importState: "idle",
      interfaceLanguage: "en"
    });
    const saved = buildWriteViewState({
      flowContext: "global",
      phase: "saved-feedback",
      contentKind: "text",
      importState: "idle",
      interfaceLanguage: "en",
      selectedPoolLabel: "Product"
    });

    expect(saving.title).toBe("Saving idea");
    expect(saving.choice?.options[0]?.description).toBe("· Saving title and body\n· Syncing pool assignment and status markers");
    expect(saving.footer.primaryAction.label).toBe("Saving...");
    expect(failed.title).toBe("Idea save failed");
    expect(failed.footer.secondaryAction.label).toBe("Back to edit");
    expect(saved.title).toBe("Idea saved to pool");
    expect(saved.choice?.options[0]?.description).toBe("· Saved to Product\n· You can keep editing and creating files in the pool");
    expect(saved.footer.secondaryAction.label).toBe("Keep capturing");
    expect(saved.footer.primaryAction.label).toBe("Enter pool");
  });

  it("builds English first-use saved feedback state", () => {
    const state = buildWriteViewState({
      flowContext: "first-use",
      phase: "saved-feedback",
      contentKind: "text",
      importState: "idle",
      interfaceLanguage: "en",
      inputText: "First idea"
    });

    expect(state.title).toBe("Idea saved");
    expect(state.subtitle).toBe("Choose which idea pool this idea should enter next.");
    expect(state.fields.title.label).toBe("Title (auto)");
    expect(state.fields.body.label).toBe("Idea content");
    expect(state.fields.body.placeholder).toBe("Saved successfully");
    expect(state.choice?.title).toBe("Next step");
    expect(state.choice?.options[0]).toMatchObject({
      label: "Choose pool",
      description: "Continue by choosing a target pool for this idea."
    });
    expect(state.footer.secondaryAction.label).toBe("Back home");
    expect(state.footer.primaryAction.label).toBe("Choose pool");
  });

  it("keeps global text auto titles timestamp-based by default", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      generatedTitle: "灵感 04-24 10:30",
      inputText: "正文第一句不再占用默认标题"
    });

    expect(state.title).toBe("灵感速记");
    expect(state.flowContext).toBe("global");
    expect(state.phase).toBe("capture");
    expect(state.contentKind).toBe("text");
    expect(state.fields.title.placeholder).toBe("灵感 04-24 10:30");
    expect(state.fields.title.value).toBe("灵感 04-24 10:30");
    expect(state.footer.primaryAction).toEqual({
      label: "完成记录",
      tone: "primary"
    });
  });

  it("builds quick-capture empty-submit feedback overlay copy", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      emptySubmitFeedbackVisible: true
    });

    expect(state.quickCapture?.emptySubmitFeedback).toEqual({
      visible: true,
      message: "还没有灵感写入，请再抓住它吧～"
    });
  });

  it("exposes idle ai polish metadata for quick capture", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      inputText: "待润色原文",
      aiPolishVisible: true
    });

    expect(state.quickCapture?.aiPolish).toEqual({
      visible: true,
      state: "idle",
      sourceValue: "待润色原文",
      polishedValue: undefined,
      resultMatchesCurrentSource: true,
      errorMessage: undefined
    });
    expect(state.footer.primaryAction).toEqual({
      label: "完成记录",
      tone: "primary"
    });
  });

  it("exposes ai polish reviewing state and disables save", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      inputText: "待润色原文",
      aiPolishState: "reviewing",
      aiPolishSourceValue: "待润色原文",
      aiPolishPolishedValue: "润色后的灵感"
    });

    expect(state.fields.body.value).toBe("待润色原文");
    expect(state.quickCapture?.aiPolish).toEqual({
      visible: true,
      state: "reviewing",
      sourceValue: "待润色原文",
      polishedValue: "润色后的灵感",
      resultMatchesCurrentSource: true,
      errorMessage: undefined
    });
    expect(state.footer.primaryAction).toEqual({
      label: "完成记录",
      tone: "muted",
      disabled: true
    });
  });

  it("marks ai polish review result stale when source changes and still disables save", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      inputText: "已改过的原文",
      aiPolishState: "reviewing",
      aiPolishSourceValue: "待润色原文",
      aiPolishPolishedValue: "基于旧原文的润色"
    });

    expect(state.fields.body.value).toBe("已改过的原文");
    expect(state.quickCapture?.aiPolish).toEqual({
      visible: true,
      state: "reviewing",
      sourceValue: "已改过的原文",
      polishedValue: "基于旧原文的润色",
      resultMatchesCurrentSource: false,
      errorMessage: undefined
    });
    expect(state.footer.primaryAction).toEqual({
      label: "完成记录",
      tone: "muted",
      disabled: true
    });
  });

  it("keeps editable source and disables save in ai polish error state", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      inputText: "正在修改的原文",
      aiPolishState: "error",
      aiPolishSourceValue: "正在修改的原文",
      aiPolishErrorMessage: "AI 请求失败，请检查网络后重试。"
    });

    expect(state.fields.body.value).toBe("正在修改的原文");
    expect(state.quickCapture?.aiPolish).toEqual({
      visible: true,
      state: "error",
      sourceValue: "正在修改的原文",
      polishedValue: undefined,
      resultMatchesCurrentSource: true,
      errorMessage: "AI 请求失败，请检查网络后重试。"
    });
    expect(state.footer.primaryAction).toEqual({
      label: "完成记录",
      tone: "muted",
      disabled: true
    });
  });

  it("prefers imported link title over generated fallback and keeps attachment metadata", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "link",
      importState: "idle",
      generatedTitle: "灵感 04-24 10:30",
      titleText: "导入标题",
      inputText: "导入摘要",
      importedExcerpt: "导入摘要",
      sourceUrl: "https://help.obsidian.md/plugins"
    });

    expect(state.title).toBe("灵感速记");
    expect(state.flowContext).toBe("global");
    expect(state.phase).toBe("capture");
    expect(state.contentKind).toBe("link");
    expect(state.fields.title.placeholder).toBe("灵感 04-24 10:30");
    expect(state.fields.title.value).toBe("导入标题");
    expect(state.fields.body.value).toBe("导入摘要");
    expect(state.fields.body.placeholder).toBe("粘贴链接后自动提取标题与摘要，可继续补充你的判断。");
    expect(state.fields.body.inputPlaceholder).toBe("可选：补充备注或行动项...");
    expect(state.quickCapture?.clipHint).toBe("粘贴链接后自动识别");
    expect(state.linkImport).toEqual({
      status: "idle",
      message: undefined,
      attachmentUrl: "https://help.obsidian.md/plugins",
      attachmentLabel: "https://help.obsidian.md/plugins",
      attachmentIcon: "paperclip",
      resultText: "导入摘要"
    });
    expect(state.footer.primaryAction).toEqual({
      label: "完成记录",
      tone: "primary"
    });
  });

  it("keeps cleared link body empty after imported excerpt is available", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "link",
      importState: "idle",
      titleText: "导入标题",
      inputText: "",
      importedExcerpt: "导入摘要",
      sourceUrl: "https://help.obsidian.md/plugins"
    });

    expect(state.fields.body.value).toBe("");
    expect(state.linkImport?.resultText).toBe("导入摘要");
    expect(state.linkImport?.attachmentUrl).toBe("https://help.obsidian.md/plugins");
  });

  it("keeps explicit create-file checked state in quick-capture model", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      createFileChecked: true
    });

    expect(state.quickCapture?.createFileChecked).toBe(true);
  });

  it("supports quick-capture pool picker state overrides", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      selectedPoolLabel: "写作池",
      poolDropdownVisible: true,
      poolOptions: [
        { id: "pool-writing", label: "写作池" },
        { id: "pool-research", label: "调研池" }
      ],
      poolCreateActionLabel: "新建池 / Create"
    });

    expect(state.fields.poolHint).toBe("池：写作池");
    expect(state.poolPicker).toEqual({
      selectedId: "",
      selectedLabel: "写作池",
      dropdownVisible: true,
      options: [
        { id: "pool-writing", label: "写作池" },
        { id: "pool-research", label: "调研池" }
      ],
      createActionLabel: "新建池 / Create"
    });
  });

  it("falls back to global pool defaults when global poolOptions is empty", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "text",
      importState: "idle",
      poolOptions: []
    });

    expect(state.poolPicker?.options).toEqual([
      { id: "pool-default", label: "默认池" },
      { id: "create-new-pool", label: "新建池" }
    ]);
    expect(state.poolPicker?.selectedId).toBe("pool-default");
    expect(state.poolPicker?.selectedLabel).toBe("默认池");
  });

  it("preserves user-edited title and keeps attachment hint copy stable", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "media",
      importState: "idle",
      generatedTitle: "自动标题",
      titleText: "手动标题",
      hasManualTitle: true,
      attachedMediaCount: 2,
      attachedMediaLabels: ["image-1.png", "clip.mov"]
    });

    expect(state.fields.title.placeholder).toBe("image-1.png");
    expect(state.fields.title.value).toBe("手动标题");
    expect(state.quickCapture?.clipHint).toBe("粘贴附件/媒体链接后自动识别");
    expect(state.quickCapture?.attachedMediaCount).toBe(2);
    expect(state.quickCapture?.attachedMediaLabels).toEqual(["image-1.png", "clip.mov"]);
  });

  it("builds media capture loading state", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "media",
      importState: "loading"
    });

    expect(state.contentKind).toBe("media");
    expect(state.importState).toBe("loading");
    expect(state.linkImport).toEqual({
      status: "loading",
      message: "正在识别媒体内容...",
      attachmentUrl: undefined,
      attachmentLabel: undefined,
      attachmentIcon: "loader"
    });
    expect(state.footer.primaryAction).toEqual({
      label: "完成记录",
      tone: "muted"
    });
  });

  it("builds link capture error state with retry copy in the inline hint", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "link",
      importState: "error",
      sourceUrl: "https://help.obsidian.md/plugins"
    });

    expect(state.fields.body.placeholder).toBe("读取链接内容失败，可手动书写灵感");
    expect(state.fields.body.inputPlaceholder).toBe("读取链接内容失败，可手动书写灵感");
    expect(state.linkImport).toEqual({
      status: "error",
      message: "读取链接内容失败，可手动书写灵感",
      attachmentUrl: "https://help.obsidian.md/plugins",
      attachmentLabel: "https://help.obsidian.md/plugins",
      attachmentIcon: "paperclip"
    });
    expect(state.footer.statusText).toBeUndefined();
  });

  it("builds link capture loading state with placeholder copy", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "capture",
      contentKind: "link",
      importState: "loading",
      sourceUrl: "https://help.obsidian.md/plugins"
    });

    expect(state.fields.body.placeholder).toBe("正在识别链接，请稍后…");
    expect(state.fields.body.inputPlaceholder).toBe("正在识别链接，请稍后…");
    expect(state.linkImport?.message).toBe("正在识别链接，请稍后…");
  });

  it("builds global saved-feedback as a dedicated confirmation state", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "saved-feedback",
      contentKind: "text",
      importState: "idle",
      selectedPoolId: "pool-default",
      selectedPoolLabel: "默认池"
    });

    expect(state.shell).toBe("quick-capture");
    expect(state.flowContext).toBe("global");
    expect(state.phase).toBe("saved-feedback");
    expect(state.title).toBe("灵感已入池");
    expect(state.subtitle).toBe("");
    expect(state.footer.primaryAction).toEqual({
      label: "进入池内",
      tone: "primary"
    });
    expect(state.footer.secondaryAction.label).toBe("继续记录");
    expect(state.footer.statusText).toBeUndefined();
    expect(state.fields.title.label).toBe("");
    expect(state.fields.body.label).toBe("");
    expect(state.fields.poolHint).toBe("");
    expect(state.poolPicker).toBeUndefined();
    expect(state.choice).toEqual({
      title: "",
      options: [
        {
          id: "saved",
          label: "",
          description: "· 已保存到默认池\n· 可在池内继续编辑与创建文件"
        }
      ]
    });
  });

  it("builds global saving feedback state with muted processing copy", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "saving",
      contentKind: "text",
      importState: "idle",
      selectedPoolLabel: "产品池"
    });

    expect(state.shell).toBe("quick-capture");
    expect(state.flowContext).toBe("global");
    expect(state.phase).toBe("saving");
    expect(state.title).toBe("灵感保存中");
    expect(state.subtitle).toBe("正在写入灵感池与索引，请稍候…");
    expect(state.choice).toEqual({
      title: "处理中",
      options: [
        {
          id: "processing",
          label: "",
          description: "· 正在保存标题与正文\n· 正在同步池归属与状态标记"
        }
      ]
    });
    expect(state.footer.secondaryAction.label).toBe("请稍候");
    expect(state.footer.primaryAction).toEqual({
      label: "保存中…",
      tone: "muted"
    });
  });

  it("builds global save-failed feedback state with retry copy", () => {
    const state = buildWriteViewState({
      flowContext: "global",
      phase: "save-failed",
      contentKind: "text",
      importState: "idle",
      selectedPoolLabel: "产品池"
    });

    expect(state.shell).toBe("quick-capture");
    expect(state.flowContext).toBe("global");
    expect(state.phase).toBe("save-failed");
    expect(state.title).toBe("灵感保存失败");
    expect(state.subtitle).toBe("保存未完成，请检查必填信息或稍后重试。");
    expect(state.choice).toEqual({
      title: "需处理",
      options: [
        {
          id: "failed",
          label: "",
          description: "· 池名称或内容可能为空\n· 网络或文件系统暂不可用"
        }
      ]
    });
    expect(state.footer.secondaryAction.label).toBe("返回编辑");
    expect(state.footer.primaryAction).toEqual({
      label: "重试保存",
      tone: "primary"
    });
  });

  it("uses bullet guidance lines in global saved-feedback regardless of create-file toggle", () => {
    const withoutFile = buildWriteViewState({
      flowContext: "global",
      phase: "saved-feedback",
      contentKind: "text",
      importState: "idle",
      selectedPoolLabel: "产品池",
      createFileChecked: false
    });

    const withFile = buildWriteViewState({
      flowContext: "global",
      phase: "saved-feedback",
      contentKind: "text",
      importState: "idle",
      selectedPoolLabel: "产品池",
      createFileChecked: true
    });

    expect(withoutFile.choice?.options).toEqual([
      {
        id: "saved",
        label: "",
        description: "· 已保存到产品池\n· 可在池内继续编辑与创建文件"
      }
    ]);
    expect(withFile.choice?.options).toEqual([
      {
        id: "saved",
        label: "",
        description: "· 已保存到产品池\n· 可在池内继续编辑与创建文件"
      }
    ]);
  });

  it("keeps first-use saved feedback on choose-pool semantics without default-pool copy", () => {
    const state = buildWriteViewState({
      flowContext: "first-use",
      phase: "saved-feedback",
      contentKind: "text",
      importState: "idle",
      inputText: "今天想到一个可验证的小点子"
    });

    expect(state.shell).toBe("quick-capture");
    expect(state.flowContext).toBe("first-use");
    expect(state.phase).toBe("saved-feedback");
    expect(state.title).toBe("灵感已保存");
    expect(state.subtitle).toBe("继续选择这条灵感要进入的灵感池。");
    expect(state.choice).toEqual({
      title: "下一步",
      options: [
        {
          id: "choose-pool",
          label: "选择归池",
          description: "继续为这条灵感选择目标池。"
        }
      ]
    });
    expect(state.footer.secondaryAction.label).toBe("返回首页");
    expect(state.footer.primaryAction).toEqual({
      label: "选择归池",
      tone: "primary"
    });
    expect(state.footer.statusText).toBeUndefined();
  });

  it("keeps scenario compatibility for quick capture loading and error states", () => {
    const loading = buildWriteViewState("quick-capture-link-loading");
    const error = buildWriteViewState("quick-capture-link-error");

    expect(loading.contentKind).toBe("link");
    expect(loading.importState).toBe("loading");
    expect(loading.fields.body.placeholder).toBe("正在识别链接，请稍后…");
    expect(loading.fields.body.inputPlaceholder).toBe("正在识别链接，请稍后…");
    expect(loading.linkImport?.message).toBe("正在识别链接，请稍后…");

    expect(error.contentKind).toBe("link");
    expect(error.importState).toBe("error");
    expect(error.fields.body.placeholder).toBe("读取链接内容失败，可手动书写灵感");
    expect(error.fields.body.inputPlaceholder).toBe("读取链接内容失败，可手动书写灵感");
    expect(error.linkImport?.message).toBe("读取链接内容失败，可手动书写灵感");
  });

  it("throws for unsupported scenarios", () => {
    expect(() => buildWriteViewState("home-empty" as never)).toThrow(
      "buildWriteViewState does not support scenario: home-empty"
    );
  });
});
