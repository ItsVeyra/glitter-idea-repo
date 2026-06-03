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
 * 灵感编辑弹窗。
 * 负责加载单条灵感、呈现可编辑字段、处理附件替换，并将修改保存回运行时数据。
 */

import { Modal } from "obsidian";
import { replaceIdeaSnippetMarkdown, serializeIdeaSnippet } from "../editor/snippet-serializer";
import type { IdeaContentType, IdeaSnippetRef } from "../domain/idea/idea-model";
import { createToastService } from "../feedback/toast-service";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import {
  applyMediaSurfaceActionIconToneFallback,
  bindMediaSurfaceActionIconTone
} from "../ui/write/render-write";
import { extractQuickCapturePastedImages } from "./quick-capture-link-import";

// 编辑弹窗对外回调与本地编辑模型。
export interface IdeaEditModalHandlers {
  onSaved?: () => void;
}

interface EditableIdea {
  title: string;
  body: string;
  contentType?: IdeaContentType;
  sourceUrl?: string;
  attachmentPaths?: string[];
  poolId?: string;
  tags?: string[];
  snippetRefs?: IdeaSnippetRef[];
}

interface SelectedEditMedia {
  file: File;
  previewUrl?: string;
  previewKind?: "image" | "video";
}

type EditableMediaItem =
  | { kind: "existing"; path: string }
  | { kind: "selected"; media: SelectedEditMedia };

const MAX_IMAGE_ATTACHMENTS = 7;

// 附件路径、文件名与 DOM 清理工具。
function normalizeVaultPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/g, "");
}

function joinVaultPath(...parts: string[]): string {
  return normalizeVaultPath(parts.filter(Boolean).join("/"));
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim() || "media";
}

function sanitizeFolderName(name: string): string {
  const sanitized = name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .replace(/^\.+$/, "");
  return sanitized || "未命名池";
}

function attachmentLabel(path: string): string {
  const normalized = normalizeVaultPath(path);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function normalizeEditableSourceUrl(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function clearElement(element: { empty?: () => void; clear?: () => void; innerHTML?: string }): void {
  if (typeof element.empty === "function") {
    element.empty();
    return;
  }

  if (typeof element.clear === "function") {
    element.clear();
    return;
  }

  if ("innerHTML" in element) {
    element.innerHTML = "";
  }
}

function detachElement(
  parent: { removeChild?: (child: unknown) => void; children?: unknown[] },
  child: unknown
): void {
  if (typeof parent.removeChild === "function") {
    try {
      parent.removeChild(child);
      return;
    } catch {
      // Fall through to array-backed test doubles.
    }
  }

  if (!Array.isArray(parent.children)) {
    return;
  }

  const childIndex = parent.children.indexOf(child);
  if (childIndex >= 0) {
    parent.children.splice(childIndex, 1);
  }
}

function isVideoAttachmentPath(path: string): boolean {
  return /\.(mp4|mov|m4v|webm|ogv|ogg)$/i.test(path);
}

function isVaultFolderLike(value: unknown): value is { children: unknown[] } {
  return Boolean(value && typeof value === "object" && "children" in value);
}

function isVaultFileLike(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && ("stat" in value || "extension" in value));
}

async function syncReferencedIdeaSnippets(args: {
  ideaId: string;
  title: string;
  body: string;
  sourceUrl?: string;
  contentType: IdeaContentType;
  attachmentPaths: string[];
  tags: string[];
  poolLabel?: string;
  snippetRefs: IdeaSnippetRef[];
  vault: {
    getAbstractFileByPath?: (path: string) => any;
    process?: (file: any, updater: (content: string) => string) => Promise<unknown>;
    read?: (file: any) => Promise<string>;
    modify?: (file: any, content: string) => Promise<unknown>;
  };
}): Promise<boolean> {
  const notePaths = Array.from(new Set(args.snippetRefs.map((snippetRef) => snippetRef.notePath.trim()).filter(Boolean)));
  if (notePaths.length === 0) {
    return false;
  }

  const replacement = serializeIdeaSnippet({
    id: args.ideaId,
    title: args.title,
    body: args.body,
    sourceUrl: args.sourceUrl,
    contentType: args.contentType,
    attachmentPaths: args.attachmentPaths,
    tags: args.tags,
    poolLabel: args.poolLabel,
    emoji: "✨"
  });

  let changedAny = false;
  for (const notePath of notePaths) {
    const file = args.vault.getAbstractFileByPath?.(notePath);
    if (!file) {
      continue;
    }

    let changedForNote = false;
    if (typeof args.vault.process === "function") {
      await args.vault.process(file, (content) => {
        const next = replaceIdeaSnippetMarkdown(content, args.ideaId, replacement);
        changedForNote = next !== content;
        return next;
      });
    } else if (typeof args.vault.read === "function" && typeof args.vault.modify === "function") {
      const content = await args.vault.read(file);
      const next = replaceIdeaSnippetMarkdown(content, args.ideaId, replacement);
      if (next !== content) {
        changedForNote = true;
        await args.vault.modify(file, next);
      }
    }

    if (changedForNote) {
      changedAny = true;
    }
  }

  return changedAny;
}

// 灵感编辑弹窗主流程。
export class IdeaEditModal extends Modal {
  private readonly toastService = createToastService();

  private selectedMedia: SelectedEditMedia[] = [];

  constructor(
    private readonly plugin: GlitterPlugin,
    private readonly ideaId: string,
    private readonly handlers: IdeaEditModalHandlers = {}
  ) {
    super(plugin.app);
  }

  // 读取灵感、搭建表单并绑定标题、正文与附件编辑交互。
  override async onOpen(): Promise<void> {
    this.containerEl?.addClass?.("GlitterIdea-edit-modal-host");
    this.modalEl?.addClass?.("GlitterIdea-edit-modal");
    this.contentEl?.addClass?.("GlitterIdea-edit-modal__content");
    this.contentEl?.empty?.();
    this.releaseSelectedMediaPreviews();
    this.selectedMedia = [];

    let idea: EditableIdea | null = null;
    try {
      idea = (await this.plugin.ideaService.getIdea(this.ideaId)) as EditableIdea | null;
    } catch (_error) {
      this.toastService.show({
        status: "error",
        message: "Load idea failed. Please try again."
      });
      this.close();
      return;
    }

    if (!idea) {
      this.toastService.show({
        status: "error",
        message: "Load idea failed. Please try again."
      });
      this.close();
      return;
    }

    const contentType = idea.contentType ?? "text";
    const isLinkIdea = contentType === "link";
    const isMediaIdea = contentType === "image" || contentType === "video";
    const existingAttachmentPaths = (idea.attachmentPaths ?? []).filter((path) => path.trim().length > 0);
    const expectedMediaKind = contentType === "video" ? "video" : contentType === "image" ? "image" : undefined;
    const mediaPickerAccept = expectedMediaKind === "video" ? "video/*" : "image/*";
    const initialMediaItems: EditableMediaItem[] =
      contentType === "image"
        ? existingAttachmentPaths.map((path) => ({ kind: "existing", path }))
        : contentType === "video" && existingAttachmentPaths[0]
          ? [{ kind: "existing", path: existingAttachmentPaths[0] }]
          : [];
    let editableMediaItems = [...initialMediaItems];
    let selectedMediaIndex = 0;
    const initialSourceUrl = normalizeEditableSourceUrl(idea.sourceUrl);
    let currentSourceUrl = initialSourceUrl;
    const mediaPoolLabel = isLinkIdea || isMediaIdea ? await this.resolvePoolLabel(idea.poolId) : "";

    const surface = this.contentEl.createDiv({ cls: "GlitterIdea-edit-modal__surface" });

    const header = surface.createDiv({ cls: "GlitterIdea-edit-modal__header" });
    header.createEl("h2", {
      cls: "GlitterIdea-edit-modal__heading",
      text: "编辑灵感"
    });

    const closeButton = header.createEl("button", {
      cls: "GlitterIdea-edit-modal__close glitter-write-stage__close-button"
    });
    closeButton.type = "button";
    closeButton.setAttr("aria-label", "关闭编辑窗口");
    closeButton.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
    });
    closeButton.addEventListener("click", () => {
      this.close();
    });

    const fields = surface.createDiv({ cls: "GlitterIdea-edit-modal__fields" });

    const titleInput = fields.createEl("input", {
      cls: isLinkIdea ? "GlitterIdea-edit-modal__title GlitterIdea-edit-modal__title--link" : "GlitterIdea-edit-modal__title",
      type: "text"
    }) as HTMLInputElement;
    titleInput.value = idea.title;

    let bodyInputHost: HTMLElement = fields;
    let linkBodyPanel: HTMLElement | null = null;
    let mediaThumbnailHost: HTMLElement | null = null;
    let linkSourceAttachmentRow: HTMLElement | null = null;
    let isLinkSourceRowVisible = isLinkIdea;
    let mediaPreviewVisible = false;
    let mediaPreviewOverlay: HTMLElement | null = null;

    if (isLinkIdea) {
      linkBodyPanel = fields.createEl("section", {
        cls: "GlitterIdea-edit-modal__link-body-panel glitter-write-stage__body-panel glitter-write-stage__body-panel--link"
      });
      bodyInputHost = linkBodyPanel;
    }

    if (isMediaIdea) {
      const mediaLayout = fields.createDiv({
        cls: "GlitterIdea-edit-modal__media-layout glitter-write-stage__media-layout"
      });
      mediaThumbnailHost = mediaLayout.createDiv({
        cls: "glitter-write-stage__media-thumbnail-surface"
      });
      const mediaInputsColumn = mediaLayout.createDiv({
        cls: "glitter-write-stage__media-inputs-column"
      });
      bodyInputHost = mediaInputsColumn.createDiv({
        cls: "GlitterIdea-edit-modal__media-editor-shell glitter-write-stage__media-editor-shell"
      });
    }

    const bodyInput = bodyInputHost.createEl("textarea", {
      cls:
        isMediaIdea || isLinkIdea
          ? "GlitterIdea-edit-modal__body glitter-write-stage__body-editor glitter-write-stage__textarea glitter-write-stage__textarea--panel-blend"
          : "GlitterIdea-edit-modal__body"
    }) as HTMLTextAreaElement;
    bodyInput.value = idea.body;

    const attachmentList = isLinkIdea
      ? fields.createDiv({
          cls: "GlitterIdea-edit-modal__attachment-list"
        })
      : null;

    let updateSaveButtonState = (): void => {};

    const appendPastedImageFiles = (
      imageFiles: File[]
    ): "appended" | "limit-reached" | "unsupported-kind" | "no-images" => {
      const nextImageFiles = imageFiles.filter((file) => file.type.startsWith("image/"));
      if (nextImageFiles.length === 0) {
        return "no-images";
      }

      if (contentType === "image") {
        const remainingSlots = MAX_IMAGE_ATTACHMENTS - editableMediaItems.length;
        if (remainingSlots <= 0) {
          return "limit-reached";
        }

        appendSelectedMedia(nextImageFiles.map((file) => modal.createSelectedMedia(file)));
        return "appended";
      }

      if (!isLinkIdea) {
        return "unsupported-kind";
      }

      const remainingSlots = MAX_IMAGE_ATTACHMENTS - existingAttachmentPaths.length - modal.selectedMedia.length;
      if (remainingSlots <= 0) {
        return "limit-reached";
      }

      const acceptedMedia = nextImageFiles.slice(0, remainingSlots).map((file) => modal.createSelectedMedia(file));
      if (acceptedMedia.length === 0) {
        return "no-images";
      }

      modal.selectedMedia = [...modal.selectedMedia, ...acceptedMedia];
      renderAttachmentItems();
      updateSaveButtonState();
      return "appended";
    };

    const renderAttachmentItems = (): void => {
      if (!attachmentList) {
        return;
      }

      clearElement(attachmentList);

      existingAttachmentPaths.forEach((path) => {
        const item = attachmentList.createDiv({
          cls: "GlitterIdea-edit-modal__attachment-item glitter-write-stage__link-attachment-row"
        });
        const primary = item.createDiv({ cls: "glitter-write-stage__link-attachment-primary" });
        primary.createEl("span", {
          cls: "glitter-write-stage__icon glitter-write-stage__icon--paperclip"
        });
        primary.createEl("span", {
          cls: "glitter-write-stage__link-attachment-text",
          text: attachmentLabel(path)
        });
      });

      this.selectedMedia.forEach(({ file }) => {
        const item = attachmentList.createDiv({
          cls: "GlitterIdea-edit-modal__attachment-item glitter-write-stage__link-attachment-row"
        });
        const primary = item.createDiv({ cls: "glitter-write-stage__link-attachment-primary" });
        primary.createEl("span", {
          cls: "glitter-write-stage__icon glitter-write-stage__icon--paperclip"
        });
        primary.createEl("span", {
          cls: "glitter-write-stage__link-attachment-text",
          text: file.name
        });
      });
    };

    const modal = this;

    const syncSelectedMediaCollection = (): void => {
      modal.selectedMedia = editableMediaItems.flatMap((item) => (item.kind === "selected" ? [item.media] : []));
    };

    const clampSelectedMediaIndex = (index = selectedMediaIndex): number => {
      if (editableMediaItems.length === 0) {
        selectedMediaIndex = 0;
        return 0;
      }

      const clampedIndex = Math.max(0, Math.min(index, editableMediaItems.length - 1));
      selectedMediaIndex = clampedIndex;
      return clampedIndex;
    };

    const getCurrentMediaItem = (): EditableMediaItem | undefined => {
      if (editableMediaItems.length === 0) {
        selectedMediaIndex = 0;
        return undefined;
      }

      return editableMediaItems[clampSelectedMediaIndex()];
    };

    const setEditableMediaItems = (nextItems: EditableMediaItem[], nextIndex = selectedMediaIndex): void => {
      editableMediaItems = nextItems;
      if (editableMediaItems.length === 0) {
        selectedMediaIndex = 0;
      } else {
        selectedMediaIndex = Math.max(0, Math.min(nextIndex, editableMediaItems.length - 1));
      }
      syncSelectedMediaCollection();
    };

    const hasMediaChanges = (): boolean => {
      if (!isMediaIdea) {
        return false;
      }

      if (editableMediaItems.length !== initialMediaItems.length) {
        return true;
      }

      return editableMediaItems.some((item, index) => {
        if (item.kind !== "existing") {
          return true;
        }

        const initialMediaItem = initialMediaItems[index];
        if (initialMediaItem?.kind !== "existing") {
          return true;
        }

        return item.path !== initialMediaItem.path;
      });
    };

    const revokeEditableMediaItemPreview = (item?: EditableMediaItem): void => {
      if (item?.kind !== "selected") {
        return;
      }

      modal.revokeSelectedMediaPreview(item.media);
    };

    const resolveDisplayedMedia = (): {
      hasAttachedMedia: boolean;
      previewUrl?: string;
      previewKind?: "image" | "video";
    } => {
      const currentMediaItem = getCurrentMediaItem();
      if (!currentMediaItem) {
        return {
          hasAttachedMedia: false
        };
      }

      if (currentMediaItem.kind === "selected") {
        return {
          hasAttachedMedia: true,
          previewUrl: currentMediaItem.media.previewUrl,
          previewKind: currentMediaItem.media.previewKind
        };
      }

      const existingFile = this.plugin.app.vault.getAbstractFileByPath?.(currentMediaItem.path);
      const previewUrl =
        existingFile && typeof this.plugin.app.vault.getResourcePath === "function"
          ? this.plugin.app.vault.getResourcePath(existingFile as any)
          : undefined;

      return {
        hasAttachedMedia: true,
        previewUrl,
        previewKind: isVideoAttachmentPath(currentMediaItem.path) ? "video" : "image"
      };
    };

    function createMediaThumbnailPreviewButton(
      parent: HTMLElement,
      label: string,
      onClick: () => void
    ): HTMLButtonElement {
      const button = parent.createEl("button", {
        cls: "glitter-write-stage__media-thumbnail-preview-trigger"
      }) as HTMLButtonElement;
      button.type = "button";
      button.setAttr("aria-label", label);
      button.addEventListener("click", onClick);
      return button;
    }

    function createMediaSurfaceActionButton(
      parent: HTMLElement,
      className: string,
      label: string,
      iconClassName: string,
      onClick: () => void
    ): HTMLButtonElement {
      const button = parent.createEl("button", { cls: className }) as HTMLButtonElement;
      button.type = "button";
      button.setAttr("aria-label", label);
      button.setAttr("title", label);
      button.createEl("span", { cls: `glitter-write-stage__icon ${iconClassName}` });
      button.addEventListener("click", () => {
        onClick();
      });
      return button;
    }

    function renderMediaPreviewOverlay(): void {
      if (mediaPreviewOverlay) {
        detachElement(surface as unknown as { removeChild?: (child: unknown) => void; children?: unknown[] }, mediaPreviewOverlay);
        mediaPreviewOverlay = null;
      }

      const mediaDisplay = resolveDisplayedMedia();
      if (!mediaPreviewVisible || mediaDisplay.previewKind !== "image" || !mediaDisplay.previewUrl) {
        return;
      }

      mediaPreviewOverlay = surface.createDiv({ cls: "glitter-write-stage__media-preview-overlay" });
      const mediaPreviewDialog = mediaPreviewOverlay.createDiv({ cls: "glitter-write-stage__media-preview-dialog" });
      const mediaPreviewClose = mediaPreviewDialog.createEl("button", {
        cls: "glitter-write-stage__media-preview-close"
      }) as HTMLButtonElement;
      mediaPreviewClose.type = "button";
      mediaPreviewClose.setAttr("aria-label", "关闭大图预览");
      mediaPreviewClose.createEl("span", {
        cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
      });
      mediaPreviewClose.addEventListener("click", () => {
        mediaPreviewVisible = false;
        renderMediaPreviewOverlay();
      });
      const mediaPreviewImage = mediaPreviewDialog.createEl("img", {
        cls: "glitter-write-stage__media-preview-image"
      }) as HTMLImageElement;
      mediaPreviewImage.setAttr("src", mediaDisplay.previewUrl);
      mediaPreviewImage.setAttr("alt", "媒体大图预览");
    }

    function openMediaReplacePicker(): void {
      mediaPreviewVisible = false;
      renderMediaPreviewOverlay();
      modal.pickAttachmentFiles(replaceSelectedMedia, {
        multiple: false,
        accept: mediaPickerAccept,
        allowedKind: expectedMediaKind
      });
    }

    function openMediaAddPicker(): void {
      if (contentType !== "image") {
        return;
      }

      const remainingSlots = MAX_IMAGE_ATTACHMENTS - editableMediaItems.length;
      if (remainingSlots <= 0) {
        return;
      }

      mediaPreviewVisible = false;
      renderMediaPreviewOverlay();
      modal.pickAttachmentFiles(appendSelectedMedia, {
        multiple: true,
        accept: "image/*",
        allowedKind: "image"
      });
    }

    function navigateDisplayedMedia(offset: -1 | 1): void {
      if (contentType !== "image" || editableMediaItems.length < 2) {
        return;
      }

      const currentSelectedMediaIndex = clampSelectedMediaIndex();
      const nextSelectedMediaIndex = Math.max(
        0,
        Math.min(currentSelectedMediaIndex + offset, editableMediaItems.length - 1)
      );
      if (nextSelectedMediaIndex === currentSelectedMediaIndex) {
        return;
      }

      selectedMediaIndex = nextSelectedMediaIndex;
      renderMediaThumbnail();
    }

    function removeDisplayedMedia(): void {
      const currentSelectedMediaIndex = clampSelectedMediaIndex();
      const currentMediaItem = editableMediaItems[currentSelectedMediaIndex];
      if (!currentMediaItem) {
        return;
      }

      mediaPreviewVisible = false;
      revokeEditableMediaItemPreview(currentMediaItem);
      const remainingMediaItems = editableMediaItems.filter((_, index) => index !== currentSelectedMediaIndex);
      setEditableMediaItems(remainingMediaItems, currentSelectedMediaIndex);
      renderMediaThumbnail();
      updateSaveButtonState();
    }

    function renderMediaThumbnail(): void {
      if (!mediaThumbnailHost) {
        return;
      }

      clearElement(mediaThumbnailHost);
      const mediaDisplay = resolveDisplayedMedia();
      const currentSelectedMediaIndex = clampSelectedMediaIndex();
      if (mediaDisplay.previewKind !== "image" || !mediaDisplay.previewUrl) {
        mediaPreviewVisible = false;
      }

      if (mediaDisplay.previewUrl && mediaDisplay.previewKind === "image") {
        const mediaThumbnailTrigger = createMediaThumbnailPreviewButton(mediaThumbnailHost, "查看大图", () => {
          mediaPreviewVisible = true;
          renderMediaPreviewOverlay();
        });
        const mediaThumbnailImage = mediaThumbnailTrigger.createEl("img", {
          cls: "glitter-write-stage__media-thumbnail-image"
        }) as HTMLImageElement;
        mediaThumbnailImage.setAttr("src", mediaDisplay.previewUrl);
        mediaThumbnailImage.setAttr("alt", "已选择媒体缩略图");
        bindMediaSurfaceActionIconTone(mediaThumbnailHost, mediaThumbnailImage, "image");
      } else if (mediaDisplay.previewUrl && mediaDisplay.previewKind === "video") {
        const mediaThumbnailVideo = mediaThumbnailHost.createEl("video", {
          cls: "glitter-write-stage__media-thumbnail-video"
        }) as HTMLVideoElement;
        mediaThumbnailVideo.setAttr("src", mediaDisplay.previewUrl);
        mediaThumbnailVideo.setAttr("muted", "");
        mediaThumbnailVideo.setAttr("playsinline", "");
        mediaThumbnailVideo.setAttr("autoplay", "");
        mediaThumbnailVideo.setAttr("loop", "");
        mediaThumbnailVideo.setAttr("aria-label", "已选择媒体缩略视频");
        bindMediaSurfaceActionIconTone(mediaThumbnailHost, mediaThumbnailVideo, "video");
      } else {
        applyMediaSurfaceActionIconToneFallback(mediaThumbnailHost);
        mediaThumbnailHost.createEl("span", {
          cls: "glitter-write-stage__icon glitter-write-stage__icon--media"
        });
      }

      const controls = mediaThumbnailHost.createDiv({ cls: "glitter-write-stage__media-surface-controls" });

      if (contentType === "image" && editableMediaItems.length > 0) {
        controls.createEl("span", {
          cls: "glitter-write-stage__media-surface-page-chip",
          text: `${Math.min(currentSelectedMediaIndex + 1, editableMediaItems.length)} / ${editableMediaItems.length}`
        });
      }

      if (contentType === "image" && editableMediaItems.length >= 2) {
        const navRow = controls.createDiv({ cls: "glitter-write-stage__media-surface-nav" });
        const previousButton = createMediaSurfaceActionButton(
          navRow,
          "glitter-write-stage__media-surface-nav-button glitter-write-stage__media-surface-nav-button--previous",
          "上一张",
          "glitter-write-stage__icon--chevron-left",
          () => navigateDisplayedMedia(-1)
        );
        previousButton.disabled = currentSelectedMediaIndex <= 0;

        const nextButton = createMediaSurfaceActionButton(
          navRow,
          "glitter-write-stage__media-surface-nav-button glitter-write-stage__media-surface-nav-button--next",
          "下一张",
          "glitter-write-stage__icon--chevron-right",
          () => navigateDisplayedMedia(1)
        );
        nextButton.disabled = currentSelectedMediaIndex >= editableMediaItems.length - 1;
      }

      const actionRow = controls.createDiv({ cls: "glitter-write-stage__media-surface-actions" });

      if (contentType === "image") {
        const addButton = createMediaSurfaceActionButton(
          actionRow,
          "glitter-write-stage__media-surface-action glitter-write-stage__media-surface-action--add",
          "增加图片",
          "glitter-write-stage__icon--plus",
          openMediaAddPicker
        );
        addButton.disabled = editableMediaItems.length >= MAX_IMAGE_ATTACHMENTS;

        if (mediaDisplay.hasAttachedMedia) {
          createMediaSurfaceActionButton(
            actionRow,
            "glitter-write-stage__media-surface-action glitter-write-stage__media-surface-action--replace",
            "替换当前图片",
            "glitter-write-stage__icon--replace",
            openMediaReplacePicker
          );
          createMediaSurfaceActionButton(
            actionRow,
            "glitter-write-stage__media-surface-action glitter-write-stage__media-surface-action--remove",
            "删除当前图片",
            "glitter-write-stage__icon--trash",
            removeDisplayedMedia
          );
        }

        renderMediaPreviewOverlay();
        return;
      }

      if (mediaDisplay.hasAttachedMedia) {
        createMediaSurfaceActionButton(
          actionRow,
          "glitter-write-stage__media-surface-action glitter-write-stage__media-surface-action--replace",
          "替换视频",
          "glitter-write-stage__icon--replace",
          openMediaReplacePicker
        );
        createMediaSurfaceActionButton(
          actionRow,
          "glitter-write-stage__media-surface-action glitter-write-stage__media-surface-action--remove",
          "删除视频",
          "glitter-write-stage__icon--trash",
          removeDisplayedMedia
        );
      } else {
        createMediaSurfaceActionButton(
          actionRow,
          "glitter-write-stage__media-surface-action glitter-write-stage__media-surface-action--add",
          "添加视频",
          "glitter-write-stage__icon--plus",
          openMediaReplacePicker
        );
      }

      renderMediaPreviewOverlay();
    }

    function appendSelectedMedia(picked: SelectedEditMedia[]): void {
      if (picked.length === 0) {
        return;
      }

      const remainingSlots = MAX_IMAGE_ATTACHMENTS - editableMediaItems.length;
      const nextSelectedMedia = picked.slice(0, remainingSlots);
      picked.slice(remainingSlots).forEach((media) => {
        modal.revokeSelectedMediaPreview(media);
      });
      if (nextSelectedMedia.length === 0) {
        return;
      }

      mediaPreviewVisible = false;
      const firstNewSelectedMediaIndex = editableMediaItems.length;
      setEditableMediaItems(
        [...editableMediaItems, ...nextSelectedMedia.map((media) => ({ kind: "selected", media }) satisfies EditableMediaItem)],
        firstNewSelectedMediaIndex
      );
      renderMediaThumbnail();
      updateSaveButtonState();
    }

    function replaceSelectedMedia(picked: SelectedEditMedia[]): void {
      const replacementMedia = picked[0];
      picked.slice(1).forEach((media) => {
        modal.revokeSelectedMediaPreview(media);
      });
      if (!replacementMedia) {
        return;
      }

      mediaPreviewVisible = false;
      const currentSelectedMediaIndex = clampSelectedMediaIndex();
      const currentMediaItem = editableMediaItems[currentSelectedMediaIndex];
      if (!currentMediaItem) {
        setEditableMediaItems([{ kind: "selected", media: replacementMedia }], 0);
        renderMediaThumbnail();
        updateSaveButtonState();
        return;
      }

      revokeEditableMediaItemPreview(currentMediaItem);
      const nextMediaItems = [...editableMediaItems];
      nextMediaItems[currentSelectedMediaIndex] = { kind: "selected", media: replacementMedia };
      setEditableMediaItems(nextMediaItems, currentSelectedMediaIndex);
      renderMediaThumbnail();
      updateSaveButtonState();
    }

    const renderLinkSourceRow = (): void => {
      if (!linkBodyPanel) {
        return;
      }

      if (linkSourceAttachmentRow) {
        detachElement(linkBodyPanel as unknown as { removeChild?: (child: unknown) => void; children?: unknown[] }, linkSourceAttachmentRow);
        linkSourceAttachmentRow = null;
      }

      if (!isLinkSourceRowVisible) {
        return;
      }

      const rawSourceUrl = currentSourceUrl ?? "";

      const linkAttachmentHost = linkBodyPanel.createDiv({
        cls: "glitter-write-stage__link-attachment-row"
      });
      linkSourceAttachmentRow = linkAttachmentHost;

      const linkAttachmentRemove = linkAttachmentHost.createEl("button", {
        cls: "glitter-write-stage__attachment-remove"
      }) as HTMLButtonElement;
      linkAttachmentRemove.type = "button";
      linkAttachmentRemove.setAttr("aria-label", "移除已加载链接");
      linkAttachmentRemove.createEl("span", {
        cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
      });
      linkAttachmentRemove.addEventListener("click", () => {
        currentSourceUrl = undefined;
        isLinkSourceRowVisible = false;
        renderLinkSourceRow();
        updateSaveButtonState();
      });

      const linkAttachmentPrimary = linkAttachmentHost.createEl("div", {
        cls: "glitter-write-stage__link-attachment-primary"
      });
      linkAttachmentPrimary.createEl("span", {
        cls: "glitter-write-stage__icon glitter-write-stage__icon--link"
      });
      const sourceInlineInput = linkAttachmentPrimary.createEl("input", {
        cls: "GlitterIdea-edit-modal__source-inline-input",
        type: "text"
      }) as HTMLInputElement;
      sourceInlineInput.value = rawSourceUrl;
      sourceInlineInput.addEventListener("input", () => {
        currentSourceUrl = sourceInlineInput.value;
        updateSaveButtonState();
      });
    };

    renderAttachmentItems();
    renderMediaThumbnail();
    renderLinkSourceRow();

    const footer = surface.createDiv({ cls: "GlitterIdea-edit-modal__footer" });

    const cancelButton = footer.createEl("button", {
      cls: "GlitterIdea-edit-modal__button GlitterIdea-edit-modal__button--ghost",
      text: "取消"
    });
    cancelButton.type = "button";
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const saveButton = footer.createEl("button", {
      cls: "GlitterIdea-edit-modal__button GlitterIdea-edit-modal__button--save",
      text: "保存"
    });
    saveButton.type = "button";

    const initialSavedTitle = idea.title.trim() || idea.title;
    const initialSavedBody = idea.body.trim();

    const hasMeaningfulChanges = (): boolean => {
      const nextTitle = titleInput.value.trim() || initialSavedTitle;
      const nextBody = bodyInput.value.trim();
      const nextSourceUrl = normalizeEditableSourceUrl(currentSourceUrl);

      return (
        nextTitle !== initialSavedTitle ||
        nextBody !== initialSavedBody ||
        nextSourceUrl !== initialSourceUrl ||
        hasMediaChanges() ||
        this.selectedMedia.length > 0
      );
    };

    updateSaveButtonState = (): void => {
      saveButton.setAttr("data-dirty", hasMeaningfulChanges() ? "true" : "false");
    };

    titleInput.addEventListener("input", updateSaveButtonState);
    bodyInput.addEventListener("input", updateSaveButtonState);
    bodyInput.addEventListener("paste", (event) => {
      const pastedImages = extractQuickCapturePastedImages(Array.from(event.clipboardData?.items ?? []));
      if (pastedImages.length === 0) {
        return;
      }

      if (contentType !== "image" && !isLinkIdea) {
        return;
      }

      event.preventDefault();
      const appendResult = appendPastedImageFiles(pastedImages);
      if (appendResult === "limit-reached") {
        this.toastService.show({
          status: "info",
          message: `当前灵感最多只能附加 ${MAX_IMAGE_ATTACHMENTS} 张图片`
        });
      }
    });
    updateSaveButtonState();

    saveButton.addEventListener("click", async () => {
      if (!hasMeaningfulChanges()) {
        this.close();
        return;
      }

      const trimmedTitle = titleInput.value.trim();
      const trimmedBody = bodyInput.value.trim();
      const nextAttachmentPaths = existingAttachmentPaths.length > 0 ? [...existingAttachmentPaths] : [];
      const newlySavedAttachmentPaths: string[] = [];
      const normalizedTitle = trimmedTitle || initialSavedTitle;
      const nextTitle = normalizedTitle === initialSavedTitle ? idea.title : normalizedTitle;
      const nextBody = trimmedBody === initialSavedBody ? idea.body : trimmedBody;
      const nextSourceUrl = isLinkIdea ? normalizeEditableSourceUrl(currentSourceUrl) : undefined;

      try {
        if (isMediaIdea) {
          if (contentType === "video" && !hasMediaChanges()) {
            nextAttachmentPaths.splice(0, nextAttachmentPaths.length, ...existingAttachmentPaths);
          } else {
            const savedMediaAttachmentPaths: string[] = [];
            for (const mediaItem of editableMediaItems) {
              if (mediaItem.kind === "existing") {
                savedMediaAttachmentPaths.push(mediaItem.path);
                continue;
              }

              const savedAttachmentPath = await this.saveSelectedMediaFile(mediaItem.media, mediaPoolLabel);
              newlySavedAttachmentPaths.push(savedAttachmentPath);
              savedMediaAttachmentPaths.push(savedAttachmentPath);
            }
            nextAttachmentPaths.splice(0, nextAttachmentPaths.length, ...savedMediaAttachmentPaths);
          }
        } else if (this.selectedMedia.length > 0) {
          const savedAttachmentPaths = await this.saveSelectedMediaFiles(mediaPoolLabel);
          newlySavedAttachmentPaths.push(...savedAttachmentPaths);
          nextAttachmentPaths.push(...savedAttachmentPaths);
        }

        await this.plugin.ideaService.updateIdea(this.ideaId, {
          title: nextTitle,
          body: nextBody,
          sourceUrl: nextSourceUrl,
          attachmentPaths: nextAttachmentPaths.length > 0 ? nextAttachmentPaths : undefined,
          markEdited: true
        });
      } catch (_error) {
        await this.deleteAttachmentFiles(newlySavedAttachmentPaths);
        this.toastService.show({
          status: "error",
          message: "Save idea failed. Please try again."
        });
        return;
      }

      try {
        await this.plugin.poolWorkbenchWorkflow?.syncIdeaSourceInRoamBoards?.(this.ideaId);
      } catch (_error) {
        this.toastService.show({
          status: "info",
          message: "Idea saved, but roam source blocks did not refresh. Please try again."
        });
      }

      try {
        const didRefreshReferencedSnippets = await syncReferencedIdeaSnippets({
          ideaId: this.ideaId,
          title: nextTitle,
          body: nextBody,
          sourceUrl: nextSourceUrl,
          contentType,
          attachmentPaths: nextAttachmentPaths,
          tags: idea.tags ?? [],
          poolLabel: await this.resolvePoolLabel(idea.poolId),
          snippetRefs: idea.snippetRefs ?? [],
          vault: this.plugin.app.vault
        });
        if (didRefreshReferencedSnippets) {
          this.plugin.refreshOpenMarkdownPreviews?.();
        }
      } catch (_error) {
        this.toastService.show({
          status: "info",
          message: "Idea saved, but referenced snippets did not refresh. Please try again."
        });
      }

      this.close();
      this.handlers.onSaved?.();
    });
  }

  // 关闭时释放预览资源并清理宿主样式。
  override onClose(): void {
    this.releaseSelectedMediaPreviews();
    this.selectedMedia = [];
    this.containerEl?.removeClass?.("GlitterIdea-edit-modal-host");
    this.modalEl?.removeClass?.("GlitterIdea-edit-modal");
    this.contentEl?.removeClass?.("GlitterIdea-edit-modal__content");
    this.contentEl?.empty?.();
  }

  // 附件选择与本地预览对象管理。
  private pickAttachmentFiles(
    onPicked: (picked: SelectedEditMedia[]) => void,
    options: { multiple?: boolean; accept?: string; allowedKind?: "image" | "video" } = {}
  ): void {
    const ownerDocument = ((this.contentEl as unknown as { ownerDocument?: Document }).ownerDocument ??
      globalThis.document) as Document | undefined;
    if (!ownerDocument?.createElement) {
      onPicked([]);
      return;
    }

    const inputEl = ownerDocument.createElement("input") as HTMLInputElement;
    inputEl.type = "file";
    inputEl.accept = options.accept ?? "image/*,video/*";
    inputEl.multiple = options.multiple ?? true;
    inputEl.style.display = "none";

    this.contentEl?.appendChild?.(inputEl);

    inputEl.addEventListener("change", () => {
      const allowedPrefix = options.allowedKind ? `${options.allowedKind}/` : undefined;
      const files = Array.from(inputEl.files ?? []).filter((file) => {
        const isSupportedMedia = file.type.startsWith("image/") || file.type.startsWith("video/");
        if (!isSupportedMedia) {
          return false;
        }
        if (allowedPrefix && !file.type.startsWith(allowedPrefix)) {
          return false;
        }
        return true;
      });
      inputEl.remove();
      const contentChildren = (this.contentEl as unknown as { children?: unknown[] }).children;
      if (Array.isArray(contentChildren)) {
        const inputIndex = contentChildren.indexOf(inputEl as unknown);
        if (inputIndex >= 0) {
          contentChildren.splice(inputIndex, 1);
        }
      }
      onPicked(files.map((file) => this.createSelectedMedia(file)));
    });

    inputEl.click();
  }

  private createSelectedMedia(file: File): SelectedEditMedia {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if ((!isImage && !isVideo) || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      return { file };
    }

    return {
      file,
      previewUrl: URL.createObjectURL(file),
      previewKind: isVideo ? "video" : "image"
    };
  }

  private revokeSelectedMediaPreview(media?: SelectedEditMedia): void {
    if (!media?.previewUrl || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
      return;
    }

    URL.revokeObjectURL(media.previewUrl);
  }

  private releaseSelectedMediaPreviews(): void {
    this.selectedMedia.forEach((media) => {
      this.revokeSelectedMediaPreview(media);
    });
  }

  // 媒体落盘与目录管理。
  private async resolvePoolLabel(poolId?: string): Promise<string> {
    if (!poolId || !this.plugin.poolService?.getPool) {
      return "";
    }

    try {
      const pool = await this.plugin.poolService.getPool(poolId);
      return pool?.name ?? "";
    } catch {
      return "";
    }
  }

  private async saveSelectedMediaFile(media: SelectedEditMedia, poolLabel: string): Promise<string> {
    const mediaRootDirectory = (this.plugin.settings?.mediaStorageDirectory ?? "Glitter").trim() || "Glitter";
    const mediaDirectory = joinVaultPath(mediaRootDirectory, "images", sanitizeFolderName(poolLabel));
    await this.ensureVaultDirectory(mediaDirectory);

    const targetPath = await this.createUniqueMediaPath(mediaDirectory, media.file.name);
    const content = await media.file.arrayBuffer();
    await this.plugin.app.vault.createBinary(targetPath, content);
    return targetPath;
  }

  private async saveSelectedMediaFiles(poolLabel: string): Promise<string[]> {
    if (this.selectedMedia.length === 0) {
      return [];
    }

    const saved: string[] = [];
    for (const media of this.selectedMedia) {
      saved.push(await this.saveSelectedMediaFile(media, poolLabel));
    }

    return saved;
  }

  private async deleteAttachmentFiles(paths: string[]): Promise<void> {
    if (paths.length === 0 || !this.plugin.app.vault.delete) {
      return;
    }

    for (const path of paths) {
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!file) {
        continue;
      }
      await this.plugin.app.vault.delete(file, true);
    }
  }

  private async ensureVaultDirectory(path: string): Promise<void> {
    const parts = normalizeVaultPath(path).split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.plugin.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.plugin.app.vault.createFolder(current);
        continue;
      }

      if (isVaultFolderLike(existing)) {
        continue;
      }

      if (isVaultFileLike(existing)) {
        throw new Error(`Media directory is not a folder: ${current}`);
      }

      await this.plugin.app.vault.createFolder(current);
    }
  }

  private async createUniqueMediaPath(directory: string, originalName: string): Promise<string> {
    const sanitizedName = sanitizeFilename(originalName);
    const dotIndex = sanitizedName.lastIndexOf(".");
    const hasExtension = dotIndex > 0 && dotIndex < sanitizedName.length - 1;
    const base = hasExtension ? sanitizedName.slice(0, dotIndex) : sanitizedName;
    const extension = hasExtension ? sanitizedName.slice(dotIndex) : "";

    let attempt = 0;
    while (true) {
      const candidateName = attempt === 0 ? `${base}${extension}` : `${base}-${attempt}${extension}`;
      const candidatePath = joinVaultPath(directory, candidateName);
      const existing = this.plugin.app.vault.getAbstractFileByPath(candidatePath);
      if (!existing || (!isVaultFolderLike(existing) && !isVaultFileLike(existing))) {
        return candidatePath;
      }

      attempt += 1;
    }
  }
}
