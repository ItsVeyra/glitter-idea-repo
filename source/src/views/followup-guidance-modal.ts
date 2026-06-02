/*
Copyright (C) 2026 ItsVeyra

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3 of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * 后续使用指引弹窗。
 * 负责挂载共享引导视图，并在首次入池流程结束后提供继续操作入口。
 */

import { Modal } from "obsidian";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { buildFollowupGuidanceState, renderFollowupGuidanceView } from "../ui/shared/followup-guidance";

// 引导弹窗的打开与清理生命周期。
export class FollowupGuidanceModal extends Modal {
  constructor(plugin: GlitterPlugin) {
    super(plugin.app);
  }

  // 打开时挂载共享引导视图。
  override onOpen(): void {
    this.containerEl?.addClass?.("glitter-followup-guidance-modal-host");
    this.modalEl?.addClass?.("glitter-followup-guidance-modal");
    this.contentEl?.addClass?.("glitter-followup-guidance-modal__content");

    renderFollowupGuidanceView(this.contentEl, buildFollowupGuidanceState(), {
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
