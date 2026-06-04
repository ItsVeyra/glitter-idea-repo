/**
 * 后续使用指引共享视图。
 * 负责首次入池后提示文案的状态构建，以及引导弹窗主体内容的渲染。
 */

// 首次入池引导使用的数据约定。
export type FollowupGuidanceItemIcon = "quote" | "file-text" | "link-2" | "keyboard";

export interface FollowupGuidanceItem {
  title: string;
  description: string;
  icon: FollowupGuidanceItemIcon;
}

export interface FollowupGuidanceState {
  title: string;
  items: FollowupGuidanceItem[];
  footnote: string;
  continueLabel: string;
}

export interface FollowupGuidanceActions {
  onDismiss: () => void;
  onContinue?: () => void;
}

// 共享 DOM 构建工具。
function createNode(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
  const node = parent.ownerDocument.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text) {
    node.textContent = text;
  }
  parent.appendChild(node);
  return node;
}

// 引导弹窗的静态文案。
export function buildFollowupGuidanceState(): FollowupGuidanceState {
  return {
    title: "后续使用指引",
    items: [
      {
        title: "全局快捷记录",
        description: "任意场景快速记录，不打断当前工作流。",
        icon: "keyboard"
      },
      {
        title: "自动识别链接",
        description: "粘贴链接，自动识别并添入内容。",
        icon: "link-2"
      },
      {
        title: "多类型内容速记",
        description: "灵感速记窗口内粘贴链接/图片/视频，快速切换布局。",
        icon: "file-text"
      },
      {
        title: "正文内嵌入灵感片段",
        description: "正文内右键 或 自定义快捷键，快速嵌入灵感片段。",
        icon: "quote"
      }
    ],
    footnote: "本引导仅首次弹出；关闭后可在设置页重新打开。",
    continueLabel: "灵感入池"
  };
}

// 引导弹窗主体渲染。
export function renderFollowupGuidanceView(
  container: HTMLElement,
  state: FollowupGuidanceState = buildFollowupGuidanceState(),
  actions: FollowupGuidanceActions
): HTMLElement {
  const guidanceView = createNode(container, "section", "glitter-followup-guidance-view glitter-write-stage__modal-card");
  const header = createNode(guidanceView, "header", "glitter-write-stage__modal-header glitter-followup-guidance-view__header");
  const headerCopy = createNode(header, "div", "glitter-followup-guidance-view__header-copy");
  createNode(headerCopy, "h2", "glitter-followup-guidance-view__title glitter-write-stage__title", state.title);

  const closeButton = createNode(
    header,
    "button",
    "glitter-followup-guidance-view__close glitter-write-stage__close-button"
  ) as HTMLButtonElement;
  closeButton.type = "button";
  closeButton.setAttribute?.("aria-label", "关闭后续使用指引窗口");
  createNode(closeButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--close");
  closeButton.addEventListener("click", () => actions.onDismiss());

  const featureList = createNode(guidanceView, "div", "glitter-followup-guidance-view__feature-list");
  state.items.forEach((item) => {
    const featureItem = createNode(featureList, "section", "glitter-followup-guidance-view__feature-item");
    const featureIconWrap = createNode(featureItem, "div", "glitter-followup-guidance-view__feature-icon-wrap");
    createNode(
      featureIconWrap,
      "span",
      `glitter-write-stage__icon glitter-followup-guidance-view__feature-icon glitter-followup-guidance-view__feature-icon--${item.icon}`
    );

    const featureCopy = createNode(featureItem, "div", "glitter-followup-guidance-view__feature-copy");
    createNode(featureCopy, "strong", "glitter-followup-guidance-view__feature-title", item.title);
    createNode(featureCopy, "p", "glitter-followup-guidance-view__feature-description", item.description);
  });

  const footnote = createNode(guidanceView, "p", "glitter-followup-guidance-view__footnote");
  createNode(footnote, "span", "glitter-write-stage__icon glitter-followup-guidance-view__footnote-icon");
  createNode(footnote, "span", "glitter-followup-guidance-view__footnote-text", state.footnote);

  const footer = createNode(guidanceView, "footer", "glitter-followup-guidance-view__footer");
  const continueButton = createNode(
    footer,
    "button",
    "glitter-followup-guidance-view__continue glitter-write-stage__action-primary glitter-write-stage__action-primary--primary glitter-write-stage__action-primary--with-icon"
  ) as HTMLButtonElement;
  continueButton.type = "button";
  createNode(continueButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--waves");
  createNode(continueButton, "span", "glitter-write-stage__action-primary-text", state.continueLabel);
  continueButton.addEventListener("click", () => (actions.onContinue ?? actions.onDismiss)());

  return guidanceView;
}
