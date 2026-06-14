import type { PluginInterfaceLanguage } from "../settings/settings";

type InterfaceLanguageOptionText = {
  value: PluginInterfaceLanguage;
  label: string;
};

export interface InterfaceText {
  home: {
    heroTitle: string;
    populatedHeroSubtitle: string;
    searchPlaceholder: string;
    quickCapture: string;
    openSearch: string;
    viewSwitch: string;
    settings: string;
    fileFilter: string;
    createPool: string;
    emptySearchFeedback: string;
    firstUseBadge: string;
    firstUseOrbTitle: string;
    firstUseOrbSubtitle: string;
    firstUseLanguageLabel: string;
    firstUseLanguageOptions: ReadonlyArray<InterfaceLanguageOptionText>;
    firstUseLanguageSaveFailed: string;
    followupGuidanceTitle: string;
    followupGuidanceCloseLabel: string;
    followupGuidanceContinueLabel: string;
    followupGuidanceFootnote: string;
    followupGuidanceGlobalShortcutTitle: string;
    followupGuidanceGlobalShortcutDescription: string;
    followupGuidanceAutoLinkTitle: string;
    followupGuidanceAutoLinkDescription: string;
    followupGuidanceMultiContentTitle: string;
    followupGuidanceMultiContentDescription: string;
    followupGuidanceSnippetTitle: string;
    followupGuidanceSnippetDescription: string;
    followupGuidanceRoamModeTitle: string;
    followupGuidanceRoamModeDescription: string;
    editPool: string;
    deletePool: string;
    enterPool: string;
    deletePoolConfirm: (poolName: string) => string;
  };
  search: {
    title: string;
    subtitle: string;
    failed: string;
    queryPlaceholder: string;
    submitLabel: string;
  };
  write: {
    title: string;
    firstUseTitle: string;
    save: string;
    cancel: string;
    close: string;
    contentPlaceholder: string;
    attachmentSaveFailed: string;
    firstIdeaTitle: string;
    mediaIdeaTitle: string;
    autoTitleFallback: string;
    timedIdeaTitle: (timestamp: string) => string;
    subtitle: string;
    titleLabel: string;
    bodyLabel: string;
    poolHint: (poolName: string) => string;
    shortcutHint: string;
    keyboardActionLabel: string;
    createFileActionLabel: string;
    saveAndNext: string;
    completeCapture: string;
    closeConfirmTitle: string;
    closeConfirmDescription: string;
    closeConfirmResume: string;
    closeConfirmExit: string;
    emptySubmitFeedback: string;
    textBodyPlaceholder: string;
    textInputPlaceholder: string;
    textCaptureSubtext: string;
    textClipHint: string;
    textLoadingMessage: string;
    textErrorMessage: string;
    textSuccessMessage: string;
    textErrorStatusText: string;
    linkBodyPlaceholder: string;
    linkInputPlaceholder: string;
    linkCaptureSubtext: string;
    linkClipHint: string;
    linkLoadingMessage: string;
    linkErrorMessage: string;
    linkSuccessMessage: string;
    linkErrorStatusText: string;
    mediaBodyPlaceholder: string;
    mediaInputPlaceholder: string;
    mediaCaptureSubtext: string;
    mediaClipHint: string;
    mediaLoadingMessage: string;
    mediaErrorMessage: string;
    mediaSuccessMessage: string;
    mediaErrorStatusText: string;
    aiPolishTrigger: string;
    aiPolishLoading: string;
    aiPolishAccept: string;
    aiPolishRedo: string;
    aiPolishBack: string;
    aiPolishDefaultError: string;
    aiPolishEmptyResult: string;
    aiPolishStaleWarning: string;
    defaultSaveHelperText: string;
    closeQuickCaptureLabel: string;
    attachmentPickLabel: string;
    linkAttachmentRemoveLabel: string;
    mediaPreviewOpenLabel: string;
    selectedImageLabel: string;
    selectedVideoLabel: string;
    previousImageLabel: string;
    nextImageLabel: string;
    addImageLabel: string;
    replaceImageLabel: string;
    removeImageLabel: string;
    replaceVideoLabel: string;
    removeVideoLabel: string;
    mediaPreviewCloseLabel: string;
    mediaPreviewImageLabel: string;
    mediaPreviewVideoLabel: string;
    savingTitle: string;
    savingSubtitle: string;
    savingChoiceTitle: string;
    savingChoiceDescription: string;
    savingSecondaryLabel: string;
    savingPrimaryLabel: string;
    saveFailedTitle: string;
    saveFailedSubtitle: string;
    saveFailedChoiceTitle: string;
    saveFailedChoiceDescription: string;
    saveFailedSecondaryLabel: string;
    saveFailedPrimaryLabel: string;
    savedFeedbackTitle: string;
    savedFeedbackDescription: (poolName: string) => string;
    savedFeedbackSecondaryLabel: string;
    savedFeedbackPrimaryLabel: string;
    firstUseSavedTitle: string;
    firstUseSavedSubtitle: string;
    firstUseSavedBodyPlaceholder: string;
    firstUseSavedChoiceTitle: string;
    firstUseSavedChoiceLabel: string;
    firstUseSavedChoiceDescription: string;
    firstUseSavedSecondaryLabel: string;
    firstUseSavedPrimaryLabel: string;
    mediaAlreadyLink: string;
    mediaAlreadyVideo: string;
    mediaImageLimitReached: (maxCount: number) => string;
    appendSecondLinkConfirm: string;
    aiPolishErrors: Record<"missing-config" | "unauthorized" | "network" | "unavailable" | "invalid-response" | "insufficient-rewrite" | "default", string>;
  };
  ideaEdit: {
    title: string;
    close: string;
    cancel: string;
    save: string;
    linkAttachmentRemove: string;
    mediaPreviewOpen: string;
    selectedImage: string;
    selectedVideo: string;
    previousImage: string;
    nextImage: string;
    addImage: string;
    replaceImage: string;
    removeImage: string;
    addVideo: string;
    replaceVideo: string;
    removeVideo: string;
    mediaPreviewClose: string;
    mediaPreviewImage: string;
  };
  picker: {
    snippetMenuTitle: (hotkey: string) => string;
    snippetInsertedNotice: string;
    canvasMenuItemTitle: string;
    canvasInsertedNotice: string;
    canvasIdeaUnavailableNotice: string;
    canvasPoolUnavailableNotice: string;
    roamBlockInsertedNotice: string;
    snippetTitle: string;
    canvasTitle: string;
    roamBlockTitle: string;
    closeLabel: string;
    queryPlaceholder: string;
    recentSectionTitle: string;
    resultsSectionTitle: string;
    emptyResults: string;
    emptyBody: string;
    untitledPool: string;
    resultActionLabel: (ideaTitle: string) => string;
    canvasResultActionLabel: (ideaTitle: string) => string;
    roamBlockResultActionLabel: (ideaTitle: string) => string;
  };
  pool: {
    shareOpenBoard: string;
    shareCopyBoardPath: string;
    copyBoardPathSucceeded: string;
    copyBoardPathFailed: string;
    downloadSucceeded: (path: string) => string;
    downloadFailed: string;
    moreShareComingSoonTitle: string;
    moreShareComingSoonMessage: string;
    roamToggleOpen: string;
    roamToggleClose: string;
    roamModeLabel: string;
    roamDownloadCurrentBoard: string;
    roamShareCurrentBoard: string;
    roamOpenHistory: string;
    roamAddIdeaBlock: string;
    roamErrorTitle: string;
    roamErrorDescription: string;
    roamEmptyTitle: string;
    roamEmptyDescription: string;
    roamSourceHandleTitle: string;
    roamSourceHandleLabel: (ideaTitle: string) => string;
    roamBridgeMarkerLabel: (ideaTitle: string) => string;
    roamBridgeMeta: (poolName: string) => string;
    roamLocateSource: string;
    roamDeleteLink: string;
    roamLoadFailed: string;
    markdownPreviewPanelTitle: (poolTitle: string) => string;
    markdownPreviewSavingLabel: string;
    markdownPreviewSaveLabel: string;
    filteredSearchPlaceholder: string;
    browseSearchPlaceholder: string;
    browseResultSummary: (visible: number, total: number) => string;
    updatedLabel: (displayTime: string) => string;
    cardCreateFile: string;
    cardOpenPrimaryFile: string;
    cardOpenSnippetNote: string;
    cardOpenSnippetLocations: (count: number) => string;
    snippetLocationsTitle: string;
    snippetLocationsCloseLabel: string;
    snippetLocationsSummary: (count: number) => string;
    snippetLocationsOccurrenceCount: (count: number) => string;
    snippetLocationsMissingFile: string;
    openFileFailed: string;
    cardFileCreatedStatus: string;
    cardSnippetStatus: (count: number) => string;
    createPoolGlobalTitle: string;
    createPoolFirstUseTitle: string;
    createPoolGlobalEyebrow: string;
    createPoolFirstUseEyebrow: string;
    createPoolGlobalHint: string;
    createPoolFirstUseHint: string;
    createPoolNameLabel: string;
    createPoolNamePlaceholder: string;
    createPoolDescriptionLabel: string;
    createPoolDescriptionPlaceholder: string;
    createPoolColorLabel: string;
    createPoolGlobalTipTitle: string;
    createPoolFirstUseTipTitle: string;
    createPoolGlobalTipText: string;
    createPoolFirstUseTipText: string;
    createPoolConfirmLabel: string;
    bodyCollapseLabel: string;
    bodyExpandLabel: string;
    bodyCollapseText: string;
    bodyExpandText: string;
    moveToLabel: string;
    closeMoveToLabel: string;
    moveSearchPlaceholder: string;
    noMoveTargets: string;
    statusFilterOptions: Record<"all" | "referenced" | "file-created" | "with-markers", string>;
    contentFilterOptions: Record<"all" | "text" | "link" | "image" | "video", string>;
    sortOptions: Record<"updated-desc" | "created-desc" | "title-asc", string>;
    newPoolLabel: string;
    selectCardLabel: string;
    deselectCardLabel: string;
    moreActionsLabel: string;
    editAction: string;
    moveToPoolAction: string;
    shareAction: string;
    deleteAction: string;
    backHomeLabel: string;
    switchPoolLabel: string;
    quickCaptureLabel: string;
    roamBackTitle: string;
    roamBackDescription: string;
    roamBackContinue: string;
    roamBackHome: string;
    statusFilterLabel: string;
    filterLabel: string;
    sortLabel: string;
    previewCurrentPoolMarkdown: string;
    previewUnavailableInRoam: string;
    batchOrganizeLabel: string;
    deleteSelectedIdeasLabel: string;
    moveSelectedToPoolLabel: string;
    resizeRoamAreaLabel: string;
    emptyPoolTitle: string;
    emptyPoolDescription: string;
    filterResultEyebrow: string;
    noFilterResultsTitle: string;
    noFilterResultsDescription: string;
    mediaPreviewCloseLabel: string;
    mediaPreviewImageAlt: (ideaTitle: string) => string;
    mediaPreviewImageAltWithPosition: (ideaTitle: string, positionLabel: string) => string;
    mediaPreviewPreviousImageLabel: string;
    mediaPreviewNextImageLabel: string;
    mediaPreviewVideoLabel: (ideaTitle: string) => string;
    cardImagePositionLabel: (current: number, total: number) => string;
    cardCurrentImageAnnouncement: (positionLabel: string) => string;
    cardViewLargeImageLabel: (ideaTitle: string) => string;
    cardViewLargeImageWithPositionLabel: (ideaTitle: string, positionLabel: string) => string;
    cardImageThumbnailAltWithPosition: (ideaTitle: string, positionLabel: string) => string;
    cardPreviousImageLabel: string;
    cardNextImageLabel: string;
    cardViewLargeVideoLabel: (ideaTitle: string) => string;
    cardVideoPreviewLabel: (ideaTitle: string) => string;
    cardEmptyFallback: string;
    firstUseChooseTitle: string;
    firstUseChooseEyebrow: string;
    firstUseChooseHint: string;
    firstUseChooseChoiceTitle: string;
    firstUseChooseCreateLabel: string;
    firstUseChooseCreateDescription: string;
    firstUseChooseDefaultLabel: string;
    firstUseChooseDefaultDescription: (poolName: string) => string;
    firstUseChooseDefaultPoolName: string;
    firstUseChooseCloseLabel: string;
    firstUseChooseBackLabel: string;
    firstUseChooseContinueLabel: string;
    createPoolCloseLabel: string;
    defaultPoolName: string;
    defaultPoolDescription: string;
    headerEyebrow: string;
    headerHint: string;
    globalStatusEyebrow: string;
    globalStatusTitles: Record<"all" | "referenced" | "file-created" | "with-markers", string>;
    globalStatusDescriptions: Record<"all" | "referenced" | "file-created" | "with-markers", string>;
    globalStatusHints: Record<"all" | "referenced" | "file-created" | "with-markers", string>;
  };
  roamModal: {
    downloadCurrentBoard: string;
    shareCurrentBoard: string;
    addCurrentBoardIdeaBlock: string;
    openInRoam: string;
    openInRoamReplaceTitle: string;
    openInRoamReplaceDescription: (boardName: string) => string;
    keepPreviewingHistory: string;
    previousBoard: string;
    nextBoard: string;
    title: string;
    closeHistory: string;
    closeBoardPreview: string;
    switchToGrid: string;
    switchToList: string;
    searchPlaceholder: string;
    batchOrganize: string;
    finishBatchOrganize: string;
    cancelBatchOrganize: string;
    deleteSelectedBoards: string;
    deletingSelectedBoards: string;
    deleteSelectedBoardsWithCount: (count: number) => string;
    summary: (count: number) => string;
    emptyNoBoards: string;
    emptyNoMatches: string;
    openBoard: (boardName: string) => string;
    selectBoard: (boardName: string) => string;
    deselectBoard: (boardName: string) => string;
    updatedUnknown: string;
    updatedAt: (value: string) => string;
    noSourceIdeas: string;
    sourceCount: (count: number) => string;
    noThumbnail: string;
    noLinkedPool: string;
    structureOnly: string;
  };
  roamExport: {
    emptyTitle: string;
    emptySubtitle: string;
    missingStatus: string;
  };
}

const INTERFACE_TEXT: Record<PluginInterfaceLanguage, InterfaceText> = {
  "zh-CN": {
    home: {
      heroTitle: "Glitter · 灵感池",
      populatedHeroSubtitle: "先校准主舞台、池球层级和关键操作位。",
      searchPlaceholder: "搜索灵感、片段或池",
      quickCapture: "快速记录",
      openSearch: "打开搜索",
      viewSwitch: "切换视图",
      settings: "设置",
      fileFilter: "已引用 / 已建文件快速筛选",
      createPool: "创建池",
      emptySearchFeedback: "未读取到搜索内容",
      firstUseBadge: "首次引导",
      firstUseOrbTitle: "灵感待录入",
      firstUseOrbSubtitle: "点击开始首次记录",
      firstUseLanguageLabel: "界面语言",
      firstUseLanguageOptions: [
        { value: "zh-CN", label: "简体中文" },
        { value: "en", label: "English" }
      ],
      firstUseLanguageSaveFailed: "界面语言保存失败，请稍后重试。",
      followupGuidanceTitle: "后续使用指引",
      followupGuidanceCloseLabel: "关闭后续使用指引窗口",
      followupGuidanceContinueLabel: "灵感入池",
      followupGuidanceFootnote: "本引导仅首次弹出；关闭后可在设置页重新打开。",
      followupGuidanceGlobalShortcutTitle: "全局快捷记录",
      followupGuidanceGlobalShortcutDescription: "任意场景快速记录，不打断当前工作流。",
      followupGuidanceAutoLinkTitle: "自动识别链接",
      followupGuidanceAutoLinkDescription: "粘贴链接，自动识别并添入内容。",
      followupGuidanceMultiContentTitle: "多类型内容速记",
      followupGuidanceMultiContentDescription: "灵感速记窗口内粘贴链接/图片/视频，快速切换布局。",
      followupGuidanceSnippetTitle: "正文内嵌入灵感片段",
      followupGuidanceSnippetDescription: "正文内右键 或 自定义快捷键，快速嵌入灵感片段。",
      followupGuidanceRoamModeTitle: "漫游模式",
      followupGuidanceRoamModeDescription: "在漫游模式里沿着灵感之间的连接继续浏览，快速展开关联与脉络。",
      editPool: "编辑池",
      deletePool: "删除池",
      enterPool: "进入池",
      deletePoolConfirm: (poolName) => `确认删除“${poolName}”吗？池内灵感将归入默认池。`
    },
    search: {
      title: "搜索 Glitter",
      subtitle: "在灵感、片段与池中快速定位内容。",
      failed: "搜索失败，请重试。",
      queryPlaceholder: "搜索灵感、池、标签",
      submitLabel: "搜索"
    },
    write: {
      title: "灵感速记",
      firstUseTitle: "记录第一条灵感",
      save: "保存",
      cancel: "取消",
      close: "关闭",
      contentPlaceholder: "写下一个想法、片段或链接",
      attachmentSaveFailed: "保存附件失败，请检查文件夹设置后重试。",
      firstIdeaTitle: "我的第一条灵感",
      mediaIdeaTitle: "媒体灵感",
      autoTitleFallback: "自动生成标题",
      timedIdeaTitle: (timestamp) => `灵感 ${timestamp}`,
      subtitle: "输入内容后保存，稍后可继续归池整理。",
      titleLabel: "标题（自动）",
      bodyLabel: "灵感内容",
      poolHint: (poolName) => `池：${poolName}`,
      shortcutHint: "Esc 关闭 · Cmd/Ctrl+Enter 保存",
      keyboardActionLabel: "快捷键设置",
      createFileActionLabel: "保存灵感并创建文件",
      saveAndNext: "保存并下一步",
      completeCapture: "完成记录",
      closeConfirmTitle: "关闭将打断灵感记录",
      closeConfirmDescription: "当前内容会留在本次记录窗口中，继续记录可返回当前编辑状态。",
      closeConfirmResume: "继续记录",
      closeConfirmExit: "立即关闭",
      emptySubmitFeedback: "还没有灵感写入，请再抓住它吧～",
      textBodyPlaceholder: "输入你现在想到的内容，保存后可继续整理到目标池。",
      textInputPlaceholder: "记录灵感，后续可继续补充...",
      textCaptureSubtext: "可选：勾选\"保存灵感并创建文件\"，直接生成 Obsidian 文件。",
      textClipHint: "粘贴附件/链接后自动识别",
      textLoadingMessage: "正在识别内容...",
      textErrorMessage: "内容识别失败，请重试",
      textSuccessMessage: "识别完成，可继续补充灵感",
      textErrorStatusText: "识别失败，可重试后再保存。",
      linkBodyPlaceholder: "粘贴链接后自动提取标题与摘要，可继续补充你的判断。",
      linkInputPlaceholder: "可选：补充备注或行动项...",
      linkCaptureSubtext: "支持 URL 粘贴；识别中可继续编辑下方文本。",
      linkClipHint: "粘贴链接后自动识别",
      linkLoadingMessage: "正在识别链接，请稍后…",
      linkErrorMessage: "读取链接内容失败，可手动书写灵感",
      linkSuccessMessage: "识别完成，可继续补充灵感",
      linkErrorStatusText: "链接识别失败，可重试后再保存。",
      mediaBodyPlaceholder: "粘贴媒体链接或附件后可提取关键信息，保留上下文更高效。",
      mediaInputPlaceholder: "可选：补充媒体备注或灵感说明...",
      mediaCaptureSubtext: "支持图片/音视频链接或附件，识别完成后可继续编辑。",
      mediaClipHint: "粘贴附件/媒体链接后自动识别",
      mediaLoadingMessage: "正在识别媒体内容...",
      mediaErrorMessage: "媒体识别失败，请重试",
      mediaSuccessMessage: "识别完成，可继续补充灵感",
      mediaErrorStatusText: "媒体识别失败，可重试后再保存。",
      aiPolishTrigger: "AI 润色",
      aiPolishLoading: "AI 润色中…",
      aiPolishAccept: "采纳结果",
      aiPolishRedo: "重做",
      aiPolishBack: "取消",
      aiPolishDefaultError: "AI 润色失败，请重做后再试。",
      aiPolishEmptyResult: "暂无润色结果",
      aiPolishStaleWarning: "原文已更新，请重做后再采纳当前结果。",
      defaultSaveHelperText: "默认仅保存为灵感（不创建 .md 文件）",
      closeQuickCaptureLabel: "关闭快速记录",
      attachmentPickLabel: "添加图片或视频附件",
      linkAttachmentRemoveLabel: "移除已加载链接",
      mediaPreviewOpenLabel: "查看大图",
      selectedImageLabel: "已选择媒体缩略图",
      selectedVideoLabel: "已选择媒体缩略视频",
      previousImageLabel: "上一张",
      nextImageLabel: "下一张",
      addImageLabel: "增加图片",
      replaceImageLabel: "替换当前图片",
      removeImageLabel: "删除当前图片",
      replaceVideoLabel: "替换视频",
      removeVideoLabel: "删除视频",
      mediaPreviewCloseLabel: "关闭大图预览",
      mediaPreviewImageLabel: "媒体大图预览",
      mediaPreviewVideoLabel: "媒体大图预览",
      savingTitle: "灵感保存中",
      savingSubtitle: "正在写入灵感池与索引，请稍候…",
      savingChoiceTitle: "处理中",
      savingChoiceDescription: "· 正在保存标题与正文\n· 正在同步池归属与状态标记",
      savingSecondaryLabel: "请稍候",
      savingPrimaryLabel: "保存中…",
      saveFailedTitle: "灵感保存失败",
      saveFailedSubtitle: "保存未完成，请检查必填信息或稍后重试。",
      saveFailedChoiceTitle: "需处理",
      saveFailedChoiceDescription: "· 池名称或内容可能为空\n· 网络或文件系统暂不可用",
      saveFailedSecondaryLabel: "返回编辑",
      saveFailedPrimaryLabel: "重试保存",
      savedFeedbackTitle: "灵感已入池",
      savedFeedbackDescription: (poolName) => `· 已保存到${poolName}\n· 可在池内继续编辑与创建文件`,
      savedFeedbackSecondaryLabel: "继续记录",
      savedFeedbackPrimaryLabel: "进入池内",
      firstUseSavedTitle: "灵感已保存",
      firstUseSavedSubtitle: "继续选择这条灵感要进入的灵感池。",
      firstUseSavedBodyPlaceholder: "已保存成功",
      firstUseSavedChoiceTitle: "下一步",
      firstUseSavedChoiceLabel: "选择归池",
      firstUseSavedChoiceDescription: "继续为这条灵感选择目标池。",
      firstUseSavedSecondaryLabel: "返回首页",
      firstUseSavedPrimaryLabel: "选择归池",
      mediaAlreadyLink: "当前灵感已是链接类型，如需记录图片请新建一条灵感",
      mediaAlreadyVideo: "当前灵感已含视频附件，如需追加图片请先移除视频",
      mediaImageLimitReached: (maxCount) => `当前灵感最多只能附加 ${maxCount} 张图片`,
      appendSecondLinkConfirm: "第二条链接将不会自动识别内容，是否添加到本条灵感？",
      aiPolishErrors: {
        "missing-config": "AI 设置未完成，请先配置后再试。",
        unauthorized: "AI 鉴权失败，请检查 API Key 后重试。",
        network: "AI 请求失败，请检查网络后重试。",
        unavailable: "AI 服务暂时不可用，请稍后重试。",
        "invalid-response": "AI 返回结果异常，请重做后再试。",
        "insufficient-rewrite": "AI 润色结果与原文过于接近，请重做再试。",
        default: "AI 润色失败，请重做后再试。"
      }
    },
    ideaEdit: {
      title: "编辑灵感",
      close: "关闭编辑窗口",
      cancel: "取消",
      save: "保存",
      linkAttachmentRemove: "移除已加载链接",
      mediaPreviewOpen: "查看大图",
      selectedImage: "已选择媒体缩略图",
      selectedVideo: "已选择媒体缩略视频",
      previousImage: "上一张",
      nextImage: "下一张",
      addImage: "增加图片",
      replaceImage: "替换当前图片",
      removeImage: "删除当前图片",
      addVideo: "添加视频",
      replaceVideo: "替换视频",
      removeVideo: "删除视频",
      mediaPreviewClose: "关闭大图预览",
      mediaPreviewImage: "媒体大图预览"
    },
    picker: {
      snippetMenuTitle: (hotkey) => (hotkey ? `插入灵感片段（${hotkey}）` : "插入灵感片段"),
      snippetInsertedNotice: "已插入灵感片段",
      canvasMenuItemTitle: "将灵感设为 Canvas 块标题",
      canvasInsertedNotice: "已将灵感设为 Canvas 块标题",
      canvasIdeaUnavailableNotice: "所选灵感已不可用，请重新选择",
      canvasPoolUnavailableNotice: "所选灵感所属灵感池已不可用，请重新选择",
      roamBlockInsertedNotice: "已向漫游白板加入灵感块",
      snippetTitle: "插入 Glitter 灵感",
      canvasTitle: "为 Canvas 块选择灵感标题",
      roamBlockTitle: "为漫游白板选择灵感块",
      closeLabel: "关闭灵感选择窗口",
      queryPlaceholder: "搜索灵感标题或正文",
      recentSectionTitle: "最近使用",
      resultsSectionTitle: "搜索结果",
      emptyResults: "没有找到匹配的灵感",
      emptyBody: "无正文",
      untitledPool: "未命名池",
      resultActionLabel: (ideaTitle) => `插入灵感 ${ideaTitle}`,
      canvasResultActionLabel: (ideaTitle) => `将灵感 ${ideaTitle} 设为 Canvas 块标题`,
      roamBlockResultActionLabel: (ideaTitle) => `向漫游白板加入灵感 ${ideaTitle}`
    },
    pool: {
      shareOpenBoard: "打开白板文件",
      shareCopyBoardPath: "复制白板路径",
      copyBoardPathSucceeded: "已复制白板路径。",
      copyBoardPathFailed: "复制白板路径失败，请重试。",
      downloadSucceeded: (path) => `漫游白板图片已导出到 ${path}。`,
      downloadFailed: "下载漫游白板失败，请重试。",
      moreShareComingSoonTitle: "更多分享方式即将开放",
      moreShareComingSoonMessage: "更多分享方式即将开放。",
      roamToggleOpen: "打开漫游模式",
      roamToggleClose: "关闭漫游模式",
      roamModeLabel: "漫游模式",
      roamDownloadCurrentBoard: "下载当前漫游白板",
      roamShareCurrentBoard: "分享当前漫游白板",
      roamOpenHistory: "打开漫游白板历史",
      roamAddIdeaBlock: "增加灵感块",
      roamErrorTitle: "漫游白板暂时不可用",
      roamErrorDescription: "请稍后再试。",
      roamEmptyTitle: "新的空白漫游区",
      roamEmptyDescription: "把左侧卡片内容区右上角的圆点拖入这里后，才会创建第一块漫游白板。",
      roamSourceHandleTitle: "拖出连接线到右侧漫游白板",
      roamSourceHandleLabel: (ideaTitle) => `将「${ideaTitle}」连接到漫游白板`,
      roamBridgeMarkerLabel: (ideaTitle) => `查看「${ideaTitle}」的漫游链接`,
      roamBridgeMeta: (poolName) => `来自 ${poolName}`,
      roamLocateSource: "定位原卡",
      roamDeleteLink: "删除链接",
      roamLoadFailed: "加载漫游白板失败，请稍后再试。",
      markdownPreviewPanelTitle: (poolTitle) => `${poolTitle} Markdown 文件`,
      markdownPreviewSavingLabel: "保存中...",
      markdownPreviewSaveLabel: "保存 Markdown 文件",
      filteredSearchPlaceholder: "搜索当前筛选灵感",
      browseSearchPlaceholder: "搜索当前池中的灵感",
      browseResultSummary: (visible, total) => visible === total ? `共 ${total} 条灵感` : `命中 ${visible} / 共 ${total} 条灵感`,
      updatedLabel: (displayTime) => `${displayTime} 已更新`,
      cardCreateFile: "创建文件",
      cardOpenPrimaryFile: "打开主文件",
      cardOpenSnippetNote: "打开插入笔记",
      cardOpenSnippetLocations: (count) => `查看插入位置（${count}）`,
      snippetLocationsTitle: "选择文件",
      snippetLocationsCloseLabel: "关闭选择文件窗口",
      snippetLocationsSummary: (count) => `当前灵感已在 ${count} 个文件中插入，选择要打开的文件。`,
      snippetLocationsOccurrenceCount: (count) => `出现 ${count} 次`,
      snippetLocationsMissingFile: "文件缺失",
      openFileFailed: "打开文件失败，请重试。",
      cardFileCreatedStatus: "已创建文件",
      cardSnippetStatus: (count) => `已引用为 ${count} 个片段`,
      createPoolGlobalTitle: "新建池",
      createPoolFirstUseTitle: "新建池分类（首次）",
      createPoolGlobalEyebrow: "池管理",
      createPoolFirstUseEyebrow: "首次归池",
      createPoolGlobalHint: "创建一个新池，便于后续筛选与整理。",
      createPoolFirstUseHint: "为这条灵感创建一个新池，后续筛选和整理会更清晰。",
      createPoolNameLabel: "池名称",
      createPoolNamePlaceholder: "例如：产品池 / 写作池 / 研究池",
      createPoolDescriptionLabel: "池描述",
      createPoolDescriptionPlaceholder: "填写该池聚焦的方向与使用场景，便于后续筛选和整理。",
      createPoolColorLabel: "池颜色",
      createPoolGlobalTipTitle: "提示",
      createPoolFirstUseTipTitle: "首次说明",
      createPoolGlobalTipText: "创建完成后会返回首页并刷新数据。",
      createPoolFirstUseTipText: "创建后会自动把当前灵感归入该池，并在首页显示首次入池反馈。",
      createPoolConfirmLabel: "创建池",
      bodyCollapseLabel: "收起正文",
      bodyExpandLabel: "展开全部正文",
      bodyCollapseText: "收起",
      bodyExpandText: "展开全部",
      moveToLabel: "移动到",
      closeMoveToLabel: "关闭移动到",
      moveSearchPlaceholder: "搜索目标池",
      noMoveTargets: "暂无可移动目标池",
      statusFilterOptions: { all: "全部灵感", referenced: "已引用", "file-created": "已建文件", "with-markers": "带状态" },
      contentFilterOptions: { all: "全部", text: "文本", link: "链接", image: "图片", video: "视频" },
      sortOptions: { "updated-desc": "最近更新", "created-desc": "最近创建", "title-asc": "标题排序" },
      newPoolLabel: "新建池",
      selectCardLabel: "选择卡片",
      deselectCardLabel: "取消选择",
      moreActionsLabel: "更多操作",
      editAction: "编辑",
      moveToPoolAction: "移动到池",
      shareAction: "分享",
      deleteAction: "删除",
      backHomeLabel: "返回首页",
      switchPoolLabel: "切换池",
      quickCaptureLabel: "灵感速记",
      roamBackTitle: "提示",
      roamBackDescription: "漫游模式下返回首页将直接结束本次灵感漫游，可在漫游历史中重新进入。",
      roamBackContinue: "继续漫游",
      roamBackHome: "返回首页",
      statusFilterLabel: "状态筛选",
      filterLabel: "筛选",
      sortLabel: "排序",
      previewCurrentPoolMarkdown: "查看当前池 Markdown 文件",
      previewUnavailableInRoam: "漫游模式下暂不支持查看当前池 Markdown 文件",
      batchOrganizeLabel: "批量整理",
      deleteSelectedIdeasLabel: "删除选中灵感",
      moveSelectedToPoolLabel: "移动到池",
      resizeRoamAreaLabel: "调整漫游区宽度",
      emptyPoolTitle: "这个池里还没有灵感",
      emptyPoolDescription: "先记录一条灵感，之后就能在这里查看、筛选和整理。",
      filterResultEyebrow: "筛选结果",
      noFilterResultsTitle: "没有找到匹配的灵感",
      noFilterResultsDescription: "换个筛选条件或搜索词，再试一次。",
      mediaPreviewCloseLabel: "关闭大图预览",
      mediaPreviewImageAlt: (ideaTitle) => `${ideaTitle} 大图预览`,
      mediaPreviewImageAltWithPosition: (ideaTitle, positionLabel) => `${ideaTitle} 大图预览（${positionLabel}）`,
      mediaPreviewPreviousImageLabel: "查看上一张大图",
      mediaPreviewNextImageLabel: "查看下一张大图",
      mediaPreviewVideoLabel: (ideaTitle) => `${ideaTitle} 大图预览`,
      cardImagePositionLabel: (current, total) => `第 ${current} 张，共 ${total} 张`,
      cardCurrentImageAnnouncement: (positionLabel) => `当前图片，${positionLabel}`,
      cardViewLargeImageLabel: (ideaTitle) => `${ideaTitle}，查看大图`,
      cardViewLargeImageWithPositionLabel: (ideaTitle, positionLabel) => `${ideaTitle}，查看大图（${positionLabel}）`,
      cardImageThumbnailAltWithPosition: (ideaTitle, positionLabel) => `${ideaTitle}（${positionLabel}）`,
      cardPreviousImageLabel: "查看上一张图片",
      cardNextImageLabel: "查看下一张图片",
      cardViewLargeVideoLabel: (ideaTitle) => `${ideaTitle}，查看大图视频`,
      cardVideoPreviewLabel: (ideaTitle) => `${ideaTitle} 预览视频`,
      cardEmptyFallback: "内容暂缺",
      firstUseChooseTitle: "归池选择（首次）",
      firstUseChooseEyebrow: "首次归池",
      firstUseChooseHint: "第一条灵感已保存。你可以直接归入默认池，或现在创建一个新池来分类。",
      firstUseChooseChoiceTitle: "选择归池方式",
      firstUseChooseCreateLabel: "方案 A：新建池后归类（推荐）",
      firstUseChooseCreateDescription: "先创建池名称、描述与池色，再将这条灵感归入新池。",
      firstUseChooseDefaultLabel: "方案 B：归入默认池",
      firstUseChooseDefaultDescription: (poolName) => `立即完成首次流程，并归入当前默认池「${poolName}」。系统随后展示后续使用指引。`,
      firstUseChooseDefaultPoolName: "默认池",
      firstUseChooseCloseLabel: "关闭归池窗口",
      firstUseChooseBackLabel: "返回上一步",
      firstUseChooseContinueLabel: "继续",
      createPoolCloseLabel: "关闭新建池窗口",
      defaultPoolName: "默认池",
      defaultPoolDescription: "继续在当前池中筛选、整理并沉淀灵感。",
      headerEyebrow: "灵感池",
      headerHint: "进入当前池继续整理与筛选",
      globalStatusEyebrow: "全局状态",
      globalStatusTitles: { all: "全部灵感", referenced: "已引用", "file-created": "已建文件", "with-markers": "已引用 / 已建文件" },
      globalStatusDescriptions: {
        all: "汇总所有池中的灵感，便于继续搜索、筛选与整理。",
        referenced: "汇总所有池中已引用到正文的灵感，便于继续定位、筛选与整理。",
        "file-created": "汇总所有池中已创建文件的灵感，便于继续筛选、检索与整理。",
        "with-markers": "汇总所有池中已引用或已建文件的灵感，便于继续搜索、筛选与整理。"
      },
      globalStatusHints: {
        all: "浏览所有池中的灵感",
        referenced: "筛选所有池中已引用到正文的灵感",
        "file-created": "筛选所有池中已建文件的灵感",
        "with-markers": "筛选所有池中的已引用与已建文件灵感"
      }
    },
    roamModal: {
      downloadCurrentBoard: "下载当前历史漫游白板",
      shareCurrentBoard: "分享当前历史漫游白板",
      addCurrentBoardIdeaBlock: "向当前历史漫游白板增加灵感块",
      openInRoam: "在漫游区打开",
      openInRoamReplaceTitle: "当前漫游区正在编辑其他漫游板",
      openInRoamReplaceDescription: (boardName) => `是否关闭当前漫游区正在编辑的漫游板，并打开《${boardName}》？`,
      keepPreviewingHistory: "继续查看历史",
      previousBoard: "上一张历史漫游白板",
      nextBoard: "下一张历史漫游白板",
      title: "漫游白板历史",
      closeHistory: "关闭漫游白板历史",
      closeBoardPreview: "关闭漫游白板预览",
      switchToGrid: "切换到缩略图模式",
      switchToList: "切换到列表模式",
      searchPlaceholder: "搜索漫游板记录",
      batchOrganize: "批量整理",
      finishBatchOrganize: "结束批量整理",
      cancelBatchOrganize: "取消批量整理",
      deleteSelectedBoards: "删除选中的漫游白板",
      deletingSelectedBoards: "正在删除选中的漫游白板",
      deleteSelectedBoardsWithCount: (count) => `删除选中的漫游白板（${count}）`,
      summary: (count) => `共 ${count} 块漫游白板，可按名称、来源池或视图方式继续整理。`,
      emptyNoBoards: "还没有漫游白板。先把灵感拖入当前漫游区，历史会在这里累计。",
      emptyNoMatches: "没有匹配的漫游白板，换个关键词试试。",
      openBoard: (boardName) => `打开漫游白板 ${boardName}`,
      selectBoard: (boardName) => `选择漫游白板 ${boardName}`,
      deselectBoard: (boardName) => `取消选择漫游白板 ${boardName}`,
      updatedUnknown: "最近更新未知",
      updatedAt: (value) => `最近更新：${value}`,
      noSourceIdeas: "未关联来源灵感",
      sourceCount: (count) => `${count} 个来源灵感`,
      noThumbnail: "暂无缩略图",
      noLinkedPool: "未关联池",
      structureOnly: "仅包含历史白板结构"
    },
    roamExport: {
      emptyTitle: "暂无可导出的白板节点",
      emptySubtitle: "当前导出为 Glitter 漫游白板的 SVG 预览图",
      missingStatus: "缺失"
    }
  },
  en: {
    home: {
      heroTitle: "Glitter · Idea Pools",
      populatedHeroSubtitle: "Calibrate the main stage, pool hierarchy, and key actions first.",
      searchPlaceholder: "Search ideas, snippets, or pools",
      quickCapture: "Quick capture",
      openSearch: "Open search",
      viewSwitch: "Switch view",
      settings: "Settings",
      fileFilter: "Referenced / file-created quick filter",
      createPool: "Create pool",
      emptySearchFeedback: "No matching content found",
      firstUseBadge: "First-use",
      firstUseOrbTitle: "Idea waiting to be captured",
      firstUseOrbSubtitle: "Click to start your first capture",
      firstUseLanguageLabel: "Interface language",
      firstUseLanguageOptions: [
        { value: "zh-CN", label: "简体中文" },
        { value: "en", label: "English" }
      ],
      firstUseLanguageSaveFailed: "Failed to save the interface language. Please try again.",
      followupGuidanceTitle: "Next-use guide",
      followupGuidanceCloseLabel: "Close next-use guide",
      followupGuidanceContinueLabel: "Go to idea pool",
      followupGuidanceFootnote: "This guide appears only once. You can reopen it later from Settings.",
      followupGuidanceGlobalShortcutTitle: "Global quick capture",
      followupGuidanceGlobalShortcutDescription: "Capture ideas from anywhere without breaking your flow.",
      followupGuidanceAutoLinkTitle: "Automatic link detection",
      followupGuidanceAutoLinkDescription: "Paste a link and Glitter will detect it and bring the content in.",
      followupGuidanceMultiContentTitle: "Multi-content quick capture",
      followupGuidanceMultiContentDescription: "Paste links, images, or videos in Quick Capture and switch layouts quickly.",
      followupGuidanceSnippetTitle: "Embed idea snippets in notes",
      followupGuidanceSnippetDescription: "Use the note context menu or your custom shortcut to insert idea snippets quickly.",
      followupGuidanceRoamModeTitle: "Roam mode",
      followupGuidanceRoamModeDescription: "Follow connections between ideas in Roam mode and expand related threads quickly.",
      editPool: "Edit",
      deletePool: "Delete",
      enterPool: "Enter",
      deletePoolConfirm: (poolName) => `Delete \"${poolName}\"? Ideas in this pool will move to the default pool.`
    },
    search: {
      title: "Search Glitter",
      subtitle: "Find ideas, snippets, and pools quickly.",
      failed: "Search failed. Please try again.",
      queryPlaceholder: "Search ideas, pools, tags",
      submitLabel: "Search"
    },
    write: {
      title: "Quick Capture",
      firstUseTitle: "Capture your first idea",
      save: "Save",
      cancel: "Cancel",
      close: "Close",
      contentPlaceholder: "Write an idea, snippet, or link",
      attachmentSaveFailed: "Saving attachments failed. Check the folder setting and try again.",
      firstIdeaTitle: "My first idea",
      mediaIdeaTitle: "Media idea",
      autoTitleFallback: "Auto-generated title",
      timedIdeaTitle: (timestamp) => `Idea ${timestamp}`,
      subtitle: "Save now, then organize it into a pool later.",
      titleLabel: "Title (auto)",
      bodyLabel: "Idea content",
      poolHint: (poolName) => `Pool: ${poolName}`,
      shortcutHint: "Esc to close · Cmd/Ctrl+Enter to save",
      keyboardActionLabel: "Keyboard shortcuts",
      createFileActionLabel: "Save idea and create file",
      saveAndNext: "Save and continue",
      completeCapture: "Complete capture",
      closeConfirmTitle: "Closing will interrupt this capture",
      closeConfirmDescription: "Current content will stay in this capture window. Continue capture to return to the current edit state.",
      closeConfirmResume: "Continue capture",
      closeConfirmExit: "Close now",
      emptySubmitFeedback: "No idea has been written yet. Capture it before it slips away.",
      textBodyPlaceholder: "Write what you are thinking now. You can organize it into a target pool after saving.",
      textInputPlaceholder: "Capture the idea, then add more later...",
      textCaptureSubtext: "Optional: turn on \"Save idea and create file\" to generate an Obsidian file directly.",
      textClipHint: "Paste attachments or links to auto-detect",
      textLoadingMessage: "Detecting content...",
      textErrorMessage: "Content detection failed. Please try again.",
      textSuccessMessage: "Detected. You can keep adding to this idea.",
      textErrorStatusText: "Detection failed. Retry before saving.",
      linkBodyPlaceholder: "Paste a link to extract its title and summary automatically. You can add your own notes too.",
      linkInputPlaceholder: "Optional: add notes or action items...",
      linkCaptureSubtext: "URL paste is supported. You can keep editing while Glitter detects it.",
      linkClipHint: "Paste a link to auto-detect",
      linkLoadingMessage: "Detecting link. Please wait...",
      linkErrorMessage: "Reading link content failed. You can write the idea manually.",
      linkSuccessMessage: "Detected. You can keep adding to this idea.",
      linkErrorStatusText: "Link detection failed. Retry before saving.",
      mediaBodyPlaceholder: "Paste a media link or attachment to extract key context and keep the idea grounded.",
      mediaInputPlaceholder: "Optional: add media notes or idea context...",
      mediaCaptureSubtext: "Image, audio, video links, and attachments are supported. You can keep editing after detection.",
      mediaClipHint: "Paste attachments or media links to auto-detect",
      mediaLoadingMessage: "Detecting media content...",
      mediaErrorMessage: "Media detection failed. Please try again.",
      mediaSuccessMessage: "Detected. You can keep adding to this idea.",
      mediaErrorStatusText: "Media detection failed. Retry before saving.",
      aiPolishTrigger: "AI polish",
      aiPolishLoading: "AI polishing...",
      aiPolishAccept: "Accept result",
      aiPolishRedo: "Redo",
      aiPolishBack: "Cancel",
      aiPolishDefaultError: "AI polish failed. Please redo and try again.",
      aiPolishEmptyResult: "No polished result yet",
      aiPolishStaleWarning: "The original text has changed. Redo before accepting this result.",
      defaultSaveHelperText: "Saved as an idea by default (no .md file created)",
      closeQuickCaptureLabel: "Close quick capture",
      attachmentPickLabel: "Add image or video attachments",
      linkAttachmentRemoveLabel: "Remove loaded link",
      mediaPreviewOpenLabel: "View large preview",
      selectedImageLabel: "Selected media image thumbnail",
      selectedVideoLabel: "Selected media video thumbnail",
      previousImageLabel: "Previous image",
      nextImageLabel: "Next image",
      addImageLabel: "Add image",
      replaceImageLabel: "Replace current image",
      removeImageLabel: "Remove current image",
      replaceVideoLabel: "Replace video",
      removeVideoLabel: "Remove video",
      mediaPreviewCloseLabel: "Close large preview",
      mediaPreviewImageLabel: "Media large preview",
      mediaPreviewVideoLabel: "Media large preview",
      savingTitle: "Saving idea",
      savingSubtitle: "Writing to the idea pool and index. Please wait...",
      savingChoiceTitle: "Processing",
      savingChoiceDescription: "· Saving title and body\n· Syncing pool assignment and status markers",
      savingSecondaryLabel: "Please wait",
      savingPrimaryLabel: "Saving...",
      saveFailedTitle: "Idea save failed",
      saveFailedSubtitle: "Save was not completed. Check required fields or try again later.",
      saveFailedChoiceTitle: "Needs attention",
      saveFailedChoiceDescription: "· Pool name or content may be empty\n· Network or file system may be unavailable",
      saveFailedSecondaryLabel: "Back to edit",
      saveFailedPrimaryLabel: "Retry save",
      savedFeedbackTitle: "Idea saved to pool",
      savedFeedbackDescription: (poolName) => `· Saved to ${poolName}\n· You can keep editing and creating files in the pool`,
      savedFeedbackSecondaryLabel: "Keep capturing",
      savedFeedbackPrimaryLabel: "Enter pool",
      firstUseSavedTitle: "Idea saved",
      firstUseSavedSubtitle: "Choose which idea pool this idea should enter next.",
      firstUseSavedBodyPlaceholder: "Saved successfully",
      firstUseSavedChoiceTitle: "Next step",
      firstUseSavedChoiceLabel: "Choose pool",
      firstUseSavedChoiceDescription: "Continue by choosing a target pool for this idea.",
      firstUseSavedSecondaryLabel: "Back home",
      firstUseSavedPrimaryLabel: "Choose pool",
      mediaAlreadyLink: "This idea is already a link. Create a new idea to record images.",
      mediaAlreadyVideo: "This idea already has a video attachment. Remove the video before adding images.",
      mediaImageLimitReached: (maxCount) => `This idea can only attach up to ${maxCount} images.`,
      appendSecondLinkConfirm: "A second link will not be imported automatically. Add it to this idea?",
      aiPolishErrors: {
        "missing-config": "AI settings are incomplete. Configure them and try again.",
        unauthorized: "AI authorization failed. Check your API key and try again.",
        network: "AI request failed. Check your network and try again.",
        unavailable: "AI service is temporarily unavailable. Please try again later.",
        "invalid-response": "AI returned an unexpected result. Please redo and try again.",
        "insufficient-rewrite": "The polished result is too close to the original. Please redo and try again.",
        default: "AI polish failed. Please redo and try again."
      }
    },
    ideaEdit: {
      title: "Edit idea",
      close: "Close edit window",
      cancel: "Cancel",
      save: "Save",
      linkAttachmentRemove: "Remove loaded link",
      mediaPreviewOpen: "View large preview",
      selectedImage: "Selected media image thumbnail",
      selectedVideo: "Selected media video thumbnail",
      previousImage: "Previous image",
      nextImage: "Next image",
      addImage: "Add image",
      replaceImage: "Replace current image",
      removeImage: "Remove current image",
      addVideo: "Add video",
      replaceVideo: "Replace video",
      removeVideo: "Remove video",
      mediaPreviewClose: "Close large preview",
      mediaPreviewImage: "Media large preview"
    },
    picker: {
      snippetMenuTitle: (hotkey) => (hotkey ? `Insert Glitter snippet (${hotkey})` : "Insert Glitter snippet"),
      snippetInsertedNotice: "Glitter snippet inserted",
      canvasMenuItemTitle: "Use idea for canvas block title",
      canvasInsertedNotice: "Idea set as canvas block title",
      canvasIdeaUnavailableNotice: "The selected idea is no longer available. Please pick another one.",
      canvasPoolUnavailableNotice: "The selected idea's pool is no longer available. Please pick another one.",
      roamBlockInsertedNotice: "Idea block added to the roam board",
      snippetTitle: "Insert Glitter snippet",
      canvasTitle: "Use idea for canvas block title",
      roamBlockTitle: "Choose an idea block for the roam board",
      closeLabel: "Close idea picker",
      queryPlaceholder: "Search idea title or body",
      recentSectionTitle: "Recent",
      resultsSectionTitle: "Results",
      emptyResults: "No matching ideas found",
      emptyBody: "No body",
      untitledPool: "Untitled pool",
      resultActionLabel: (ideaTitle) => `Insert idea ${ideaTitle}`,
      canvasResultActionLabel: (ideaTitle) => `Use idea ${ideaTitle} for canvas block title`,
      roamBlockResultActionLabel: (ideaTitle) => `Add idea ${ideaTitle} to the roam board`
    },
    pool: {
      shareOpenBoard: "Open board file",
      shareCopyBoardPath: "Copy board path",
      copyBoardPathSucceeded: "Board path copied.",
      copyBoardPathFailed: "Copy board path failed. Please try again.",
      downloadSucceeded: (path) => `Roam board image exported to ${path}.`,
      downloadFailed: "Download roam board failed. Please try again.",
      moreShareComingSoonTitle: "More sharing options coming soon",
      moreShareComingSoonMessage: "More sharing options are coming soon.",
      roamToggleOpen: "Open roam mode",
      roamToggleClose: "Close roam mode",
      roamModeLabel: "Roam mode",
      roamDownloadCurrentBoard: "Download current roam board",
      roamShareCurrentBoard: "Share current roam board",
      roamOpenHistory: "Open roam board history",
      roamAddIdeaBlock: "Add idea block",
      roamErrorTitle: "Roam board is temporarily unavailable",
      roamErrorDescription: "Please try again later.",
      roamEmptyTitle: "New blank roam area",
      roamEmptyDescription: "Drag a dot from the top-right of a left card into this area to create the first roam board block.",
      roamSourceHandleTitle: "Drag a connection line to the roam board on the right",
      roamSourceHandleLabel: (ideaTitle) => `Connect \"${ideaTitle}\" to the roam board`,
      roamBridgeMarkerLabel: (ideaTitle) => `View roam link for \"${ideaTitle}\"`,
      roamBridgeMeta: (poolName) => `From ${poolName}`,
      roamLocateSource: "Locate source card",
      roamDeleteLink: "Delete link",
      roamLoadFailed: "Load roam board failed. Please try again later.",
      markdownPreviewPanelTitle: (poolTitle) => `${poolTitle} Markdown file`,
      markdownPreviewSavingLabel: "Saving...",
      markdownPreviewSaveLabel: "Save Markdown file",
      filteredSearchPlaceholder: "Search filtered ideas",
      browseSearchPlaceholder: "Search ideas in this pool",
      browseResultSummary: (visible, total) => visible === total ? `${total} idea${total === 1 ? "" : "s"}` : `${visible} of ${total} ideas matched`,
      updatedLabel: (displayTime) => `${displayTime} updated`,
      cardCreateFile: "Create file",
      cardOpenPrimaryFile: "Open primary file",
      cardOpenSnippetNote: "Open inserted note",
      cardOpenSnippetLocations: (count) => `View insertion locations (${count})`,
      snippetLocationsTitle: "Choose a file",
      snippetLocationsCloseLabel: "Close file picker",
      snippetLocationsSummary: (count) => `This idea has been inserted in ${count} file${count === 1 ? "" : "s"}. Choose one to open.`,
      snippetLocationsOccurrenceCount: (count) => `Appears ${count} time${count === 1 ? "" : "s"}`,
      snippetLocationsMissingFile: "File missing",
      openFileFailed: "Open file failed. Please try again.",
      cardFileCreatedStatus: "File created",
      cardSnippetStatus: (count) => `Referenced in ${count} snippet${count === 1 ? "" : "s"}`,
      createPoolGlobalTitle: "New pool",
      createPoolFirstUseTitle: "Create pool category (first time)",
      createPoolGlobalEyebrow: "Pool management",
      createPoolFirstUseEyebrow: "First pool assignment",
      createPoolGlobalHint: "Create a new pool for easier filtering and organization later.",
      createPoolFirstUseHint: "Create a new pool for this idea so later filtering and organization stay clear.",
      createPoolNameLabel: "Pool name",
      createPoolNamePlaceholder: "For example: Product pool / Writing pool / Research pool",
      createPoolDescriptionLabel: "Pool description",
      createPoolDescriptionPlaceholder: "Describe this pool's focus and use case to make later filtering and organization easier.",
      createPoolColorLabel: "Pool color",
      createPoolGlobalTipTitle: "Tip",
      createPoolFirstUseTipTitle: "First-time note",
      createPoolGlobalTipText: "After creation, Glitter will return home and refresh the data.",
      createPoolFirstUseTipText: "After creation, Glitter will move the current idea into this pool and show first-assignment feedback on the home page.",
      createPoolConfirmLabel: "Create pool",
      bodyCollapseLabel: "Collapse body",
      bodyExpandLabel: "Expand full body",
      bodyCollapseText: "Collapse",
      bodyExpandText: "Expand all",
      moveToLabel: "Move to",
      closeMoveToLabel: "Close move dialog",
      moveSearchPlaceholder: "Search target pool",
      noMoveTargets: "No movable target pools",
      statusFilterOptions: { all: "All ideas", referenced: "Referenced", "file-created": "File created", "with-markers": "With status" },
      contentFilterOptions: { all: "All", text: "Text", link: "Link", image: "Image", video: "Video" },
      sortOptions: { "updated-desc": "Recently updated", "created-desc": "Recently created", "title-asc": "Sort by title" },
      newPoolLabel: "New pool",
      selectCardLabel: "Select card",
      deselectCardLabel: "Deselect",
      moreActionsLabel: "More actions",
      editAction: "Edit",
      moveToPoolAction: "Move to pool",
      shareAction: "Share",
      deleteAction: "Delete",
      backHomeLabel: "Back home",
      switchPoolLabel: "Switch pool",
      quickCaptureLabel: "Quick capture",
      roamBackTitle: "Notice",
      roamBackDescription: "Returning home in roam mode will end this idea roam session. You can reopen it from roam history.",
      roamBackContinue: "Continue roaming",
      roamBackHome: "Back home",
      statusFilterLabel: "Status filter",
      filterLabel: "Filter",
      sortLabel: "Sort",
      previewCurrentPoolMarkdown: "View current pool Markdown file",
      previewUnavailableInRoam: "Viewing the current pool Markdown file is unavailable in roam mode",
      batchOrganizeLabel: "Batch organize",
      deleteSelectedIdeasLabel: "Delete selected ideas",
      moveSelectedToPoolLabel: "Move to pool",
      resizeRoamAreaLabel: "Resize roam area",
      emptyPoolTitle: "No ideas in this pool yet",
      emptyPoolDescription: "Capture an idea first, then you can view, filter, and organize it here.",
      filterResultEyebrow: "Filter results",
      noFilterResultsTitle: "No matching ideas found",
      noFilterResultsDescription: "Try another filter or search term.",
      mediaPreviewCloseLabel: "Close large preview",
      mediaPreviewImageAlt: (ideaTitle) => `${ideaTitle} large preview`,
      mediaPreviewImageAltWithPosition: (ideaTitle, positionLabel) => `${ideaTitle} large preview (${positionLabel})`,
      mediaPreviewPreviousImageLabel: "View previous large image",
      mediaPreviewNextImageLabel: "View next large image",
      mediaPreviewVideoLabel: (ideaTitle) => `${ideaTitle} large preview`,
      cardImagePositionLabel: (current, total) => `image ${current} of ${total}`,
      cardCurrentImageAnnouncement: (positionLabel) => `Current image, ${positionLabel}`,
      cardViewLargeImageLabel: (ideaTitle) => `${ideaTitle}, view large image`,
      cardViewLargeImageWithPositionLabel: (ideaTitle, positionLabel) => `${ideaTitle}, view large image (${positionLabel})`,
      cardImageThumbnailAltWithPosition: (ideaTitle, positionLabel) => `${ideaTitle} (${positionLabel})`,
      cardPreviousImageLabel: "View previous image",
      cardNextImageLabel: "View next image",
      cardViewLargeVideoLabel: (ideaTitle) => `${ideaTitle}, view large video`,
      cardVideoPreviewLabel: (ideaTitle) => `${ideaTitle} video preview`,
      cardEmptyFallback: "No content yet",
      firstUseChooseTitle: "Choose pool assignment (first time)",
      firstUseChooseEyebrow: "First pool assignment",
      firstUseChooseHint: "Your first idea has been saved. Add it to the default pool, or create a new pool now to categorize it.",
      firstUseChooseChoiceTitle: "Choose how to assign this idea",
      firstUseChooseCreateLabel: "Option A: Create a new pool first (recommended)",
      firstUseChooseCreateDescription: "Create the pool name, description, and color first, then move this idea into the new pool.",
      firstUseChooseDefaultLabel: "Option B: Use the default pool",
      firstUseChooseDefaultDescription: (poolName) => `Finish the first-time flow now and move this idea into the current default pool \"${poolName}\". Glitter will then show the next-use guide.`,
      firstUseChooseDefaultPoolName: "Default pool",
      firstUseChooseCloseLabel: "Close pool assignment window",
      firstUseChooseBackLabel: "Back",
      firstUseChooseContinueLabel: "Continue",
      createPoolCloseLabel: "Close new pool window",
      defaultPoolName: "Default pool",
      defaultPoolDescription: "Keep filtering, organizing, and developing ideas in this pool.",
      headerEyebrow: "Idea pool",
      headerHint: "Keep organizing and filtering in the current pool",
      globalStatusEyebrow: "Global status",
      globalStatusTitles: { all: "All ideas", referenced: "Referenced", "file-created": "File created", "with-markers": "Referenced / file-created" },
      globalStatusDescriptions: {
        all: "Collects ideas from every pool so you can keep searching, filtering, and organizing them.",
        referenced: "Collects ideas referenced in note bodies across all pools so you can locate, filter, and organize them.",
        "file-created": "Collects ideas with created files across all pools so you can filter, search, and organize them.",
        "with-markers": "Collects referenced or file-created ideas across all pools so you can keep searching, filtering, and organizing them."
      },
      globalStatusHints: {
        all: "Browse ideas across all pools",
        referenced: "Filter ideas referenced in note bodies across all pools",
        "file-created": "Filter file-created ideas across all pools",
        "with-markers": "Filter referenced and file-created ideas across all pools"
      }
    },
    roamModal: {
      downloadCurrentBoard: "Download current historical roam board",
      shareCurrentBoard: "Share current historical roam board",
      addCurrentBoardIdeaBlock: "Add idea block to the current historical roam board",
      openInRoam: "Open in Roam",
      openInRoamReplaceTitle: "Another roam board is open",
      openInRoamReplaceDescription: (boardName) => `Close the board currently open in Roam and open “${boardName}” instead?`,
      keepPreviewingHistory: "Keep previewing history",
      previousBoard: "Previous historical roam board",
      nextBoard: "Next historical roam board",
      title: "Roam board history",
      closeHistory: "Close roam board history",
      closeBoardPreview: "Close roam board preview",
      switchToGrid: "Switch to thumbnail mode",
      switchToList: "Switch to list mode",
      searchPlaceholder: "Search roam board records",
      batchOrganize: "Batch organize",
      finishBatchOrganize: "Finish batch organize",
      cancelBatchOrganize: "Cancel batch organize",
      deleteSelectedBoards: "Delete selected roam boards",
      deletingSelectedBoards: "Deleting selected roam boards",
      deleteSelectedBoardsWithCount: (count) => `Delete selected roam boards (${count})`,
      summary: (count) => `${count} roam board${count === 1 ? "" : "s"}. Organize by name, source pool, or view mode.`,
      emptyNoBoards: "No roam boards yet. Drag ideas into the current roam area and history will accumulate here.",
      emptyNoMatches: "No matching roam boards. Try another keyword.",
      openBoard: (boardName) => `Open roam board ${boardName}`,
      selectBoard: (boardName) => `Select roam board ${boardName}`,
      deselectBoard: (boardName) => `Deselect roam board ${boardName}`,
      updatedUnknown: "Last update unknown",
      updatedAt: (value) => `Last updated: ${value}`,
      noSourceIdeas: "No linked source ideas",
      sourceCount: (count) => `${count} source idea${count === 1 ? "" : "s"}`,
      noThumbnail: "No thumbnail yet",
      noLinkedPool: "No linked pool",
      structureOnly: "Only historical board structure"
    },
    roamExport: {
      emptyTitle: "No board nodes to export",
      emptySubtitle: "This is an SVG preview exported from a Glitter roam board",
      missingStatus: "Missing"
    }
  }
};

export function normalizeInterfaceLanguage(value: unknown): PluginInterfaceLanguage {
  if (value === "zh-CN" || value === "en") {
    return value;
  }

  return "zh-CN";
}

export function getInterfaceText(language: unknown): InterfaceText {
  return INTERFACE_TEXT[normalizeInterfaceLanguage(language)];
}
