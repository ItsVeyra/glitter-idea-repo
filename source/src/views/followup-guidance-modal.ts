/**
 * 后续使用指引弹窗。
 * 负责挂载共享引导视图，并在首次入池流程结束后提供继续操作入口。
 */

import { Modal } from "obsidian";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { buildFollowupGuidanceState, renderFollowupGuidanceView } from "../ui/shared/followup-guidance";

// 引导弹窗的打开与清理生命周期。
export class FollowupGuidanceModal extends Modal {
  constructor(private readonly plugin: GlitterPlugin) {
    super(plugin.app);
  }

  // 打开时挂载共享引导视图。
  override onOpen(): void {
    this.containerEl?.addClass?.("glitter-followup-guidance-modal-host");
    this.modalEl?.addClass?.("glitter-followup-guidance-modal");
    this.contentEl?.addClass?.("glitter-followup-guidance-modal__content");

    renderFollowupGuidanceView(this.contentEl, buildFollowupGuidanceState(this.plugin.settings?.interfaceLanguage), {
      onDismiss: () => {
        this.close();
      },
      onContinue: () => {
        this.close();
      }
    });
  }

  // 关闭时清理宿主样式与内容。
  override onClose(): void {
    this.containerEl?.removeClass?.("glitter-followup-guidance-modal-host");
    this.modalEl?.removeClass?.("glitter-followup-guidance-modal");
    this.contentEl?.removeClass?.("glitter-followup-guidance-modal__content");
    this.contentEl?.empty?.();
  }
}
