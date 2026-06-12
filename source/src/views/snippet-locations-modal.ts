/**
 * 片段插入位置弹窗。
 * 负责列出某条灵感在笔记中的引用位置，并支持用户选择目标文件打开。
 */

import { Modal } from "obsidian";
import { getInterfaceText } from "../i18n/interface-language";
import type { PluginInterfaceLanguage } from "../settings/settings";
import type { PoolBrowseSnippetLocation } from "../ui/pool/pool-state";

// 片段位置弹窗的渲染与打开防抖流程。
export class SnippetLocationsModal extends Modal {
  private isOpeningLocation = false;

  constructor(
    app: unknown,
    private readonly locations: PoolBrowseSnippetLocation[],
    private readonly onOpenLocation: (location: PoolBrowseSnippetLocation) => Promise<void>,
    private readonly interfaceLanguage?: PluginInterfaceLanguage
  ) {
    super(app as never);
  }

  // 打开时渲染引用位置列表与跳转入口。
  override onOpen(): void {
    this.containerEl?.addClass?.("glitter-snippet-locations-modal-host");
    this.modalEl?.addClass?.("glitter-snippet-locations-modal");
    this.contentEl?.addClass?.("glitter-snippet-locations-modal__content");
    this.contentEl.empty();

    const poolText = getInterfaceText(this.interfaceLanguage).pool;
    const surface = this.contentEl.createDiv({
      cls: "glitter-snippet-locations-modal__surface GlitterIdea-edit-modal__surface"
    });
    const header = surface.createDiv({
      cls: "glitter-snippet-locations-modal__header GlitterIdea-edit-modal__header"
    });
    header.createEl("h2", {
      cls: "glitter-snippet-locations-modal__title GlitterIdea-edit-modal__heading",
      text: poolText.snippetLocationsTitle
    });
    const closeButton = header.createEl("button", {
      cls: "glitter-snippet-locations-modal__close glitter-write-stage__close-button GlitterIdea-edit-modal__close-button"
    }) as HTMLButtonElement;
    closeButton.type = "button";
    closeButton.setAttribute?.("aria-label", poolText.snippetLocationsCloseLabel);
    closeButton.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
    });
    closeButton.addEventListener("click", () => {
      this.close();
    });

    surface.createEl("p", {
      cls: "glitter-snippet-locations-modal__summary",
      text: poolText.snippetLocationsSummary(this.locations.length)
    });

    const listEl = surface.createDiv({
      cls: "glitter-snippet-locations-modal__list"
    });

    this.locations.forEach((location) => {
      const card = listEl.createEl("button", {
        cls: "glitter-snippet-locations-modal__card"
      }) as HTMLButtonElement;
      card.type = "button";
      card.disabled = location.stale;
      card.dataset.notePath = location.notePath;

      const cardHeader = card.createDiv({
        cls: "glitter-snippet-locations-modal__card-header"
      });
      cardHeader.createEl("strong", {
        cls: "glitter-snippet-locations-modal__card-title",
        text: location.noteTitle
      });

      const meta = cardHeader.createDiv({
        cls: "glitter-snippet-locations-modal__card-meta"
      });
      meta.createEl("span", {
        cls: "glitter-snippet-locations-modal__card-count",
        text: poolText.snippetLocationsOccurrenceCount(location.occurrenceCount)
      });
      if (location.stale) {
        meta.createEl("span", {
          cls: "glitter-snippet-locations-modal__card-stale",
          text: poolText.snippetLocationsMissingFile
        });
      }

      card.createEl("span", {
        cls: "glitter-snippet-locations-modal__card-path",
        text: location.notePath
      });

      if (!location.stale) {
        card.addEventListener("click", () => {
          void this.handleOpenLocation(location);
        });
      }
    });
  }

  // 关闭时清理宿主样式和内部状态。
  override onClose(): void {
    this.isOpeningLocation = false;
    this.containerEl?.removeClass?.("glitter-snippet-locations-modal-host");
    this.modalEl?.removeClass?.("glitter-snippet-locations-modal");
    this.contentEl?.removeClass?.("glitter-snippet-locations-modal__content");
    this.contentEl?.empty?.();
  }

  // 串行打开目标位置，避免重复触发。
  private async handleOpenLocation(location: PoolBrowseSnippetLocation): Promise<void> {
    if (this.isOpeningLocation) {
      return;
    }

    this.isOpeningLocation = true;
    try {
      await this.onOpenLocation(location);
      this.close();
    } catch {
      return;
    } finally {
      this.isOpeningLocation = false;
    }
  }
}
