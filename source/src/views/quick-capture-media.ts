/**
 * 快速记录弹窗媒体辅助函数。
 * 负责附件文件清理、预览与落盘路径生成。
 */

import { normalizePath } from "obsidian";
import type { WriteMediaPreviewKind } from "../ui/write/write-state";

export interface SelectedCaptureMedia {
  file: File;
  previewUrl?: string;
  previewKind?: WriteMediaPreviewKind;
}

export interface QuickCaptureMediaVaultLike {
  getAbstractFileByPath(path: string): unknown;
  createFolder(path: string): Promise<unknown>;
  createBinary(path: string, content: ArrayBuffer): Promise<unknown>;
}

export interface PickQuickCaptureAttachmentFilesOptions {
  accept?: string;
  multiple?: boolean;
}

export interface QuickCaptureImportedMediaCandidate {
  url: string;
  mediaType: "image" | "video";
  fileName: string;
}

export function sanitizeQuickCaptureMediaFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim() || "media";
}

export function sanitizeQuickCaptureMediaFolderName(name: string): string {
  const sanitized = name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .replace(/^\.+$/, "");
  return sanitized || "未命名池";
}

export function createSelectedCaptureMedia(file: File): SelectedCaptureMedia {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    return { file };
  }

  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return { file };
  }

  return {
    file,
    previewUrl: URL.createObjectURL(file),
    previewKind: isVideo ? "video" : "image"
  };
}

export function releaseSelectedCaptureMediaPreviews(selectedMedia: SelectedCaptureMedia[]): void {
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
    return;
  }

  selectedMedia.forEach((media) => {
    if (media.previewUrl) {
      URL.revokeObjectURL(media.previewUrl);
    }
  });
}

export function normalizeQuickCapturePickedMediaFiles(files: File[], maxImageAttachments = 7): File[] {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length > 0) {
    return imageFiles.slice(0, Math.max(0, maxImageAttachments));
  }

  const firstVideo = files.find((file) => file.type.startsWith("video/"));
  return firstVideo ? [firstVideo] : [];
}

export async function pickQuickCaptureAttachmentFiles(
  contentEl: HTMLElement | null | undefined,
  options: PickQuickCaptureAttachmentFilesOptions = {}
): Promise<File[]> {
  if (typeof document === "undefined" || !contentEl?.ownerDocument) {
    return [];
  }

  return new Promise((resolve) => {
    const inputEl = contentEl.ownerDocument.createElement("input") as HTMLInputElement;
    inputEl.type = "file";
    inputEl.accept = options.accept ?? "image/*,video/*";
    inputEl.multiple = options.multiple ?? true;
    inputEl.hidden = true;

    contentEl.appendChild(inputEl);

    inputEl.addEventListener("change", () => {
      const files = Array.from(inputEl.files ?? []).filter(
        (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
      );
      inputEl.remove();
      resolve(files);
    });

    inputEl.click();
  });
}

export async function createQuickCaptureUniqueMediaPath(
  vault: Pick<QuickCaptureMediaVaultLike, "getAbstractFileByPath">,
  directory: string,
  originalName: string
): Promise<string> {
  const sanitizedName = sanitizeQuickCaptureMediaFileName(originalName);
  const dotIndex = sanitizedName.lastIndexOf(".");
  const hasExtension = dotIndex > 0 && dotIndex < sanitizedName.length - 1;
  const base = hasExtension ? sanitizedName.slice(0, dotIndex) : sanitizedName;
  const extension = hasExtension ? sanitizedName.slice(dotIndex) : "";

  let attempt = 0;
  while (true) {
    const candidateName = attempt === 0 ? `${base}${extension}` : `${base}-${attempt}${extension}`;
    const candidatePath = normalizePath(`${directory}/${candidateName}`);
    if (!vault.getAbstractFileByPath(candidatePath)) {
      return candidatePath;
    }

    attempt += 1;
  }
}

export async function ensureQuickCaptureMediaDirectory(
  vault: Pick<QuickCaptureMediaVaultLike, "getAbstractFileByPath" | "createFolder">,
  path: string
): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = vault.getAbstractFileByPath(current);
    if (!existing) {
      await vault.createFolder(current);
      continue;
    }

    if (typeof existing !== "object" || existing === null || !("children" in existing)) {
      throw new Error(`Media directory is not a folder: ${current}`);
    }
  }
}

function resolveImportedMediaContentType(
  candidate: QuickCaptureImportedMediaCandidate,
  responseType: string | null
): string {
  const normalizedType = responseType?.split(";")[0]?.trim().toLowerCase();
  if (normalizedType?.startsWith("image/") || normalizedType?.startsWith("video/")) {
    return normalizedType;
  }

  return candidate.mediaType === "video" ? "video/mp4" : "image/jpeg";
}

export async function downloadQuickCaptureImportedMedia(
  candidate: QuickCaptureImportedMediaCandidate,
  fetcher: typeof fetch = fetch
): Promise<File> {
  const response = await fetcher(candidate.url);
  if (!response.ok) {
    throw new Error(`Failed to download imported media: ${response.status}`);
  }

  const type = resolveImportedMediaContentType(candidate, response.headers.get("content-type"));
  const buffer = await response.arrayBuffer();
  return new File([buffer], sanitizeQuickCaptureMediaFileName(candidate.fileName), { type });
}

function normalizeQuickCaptureImportedMediaFiles(files: File[], maxImageAttachments = 7): File[] {
  const videoFiles = files.filter((file) => file.type.startsWith("video/"));
  if (videoFiles.length > 0) {
    return [videoFiles[0]];
  }

  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  return imageFiles.slice(0, Math.max(0, maxImageAttachments));
}

export async function createSelectedCaptureMediaFromImportedCandidates(
  candidates: QuickCaptureImportedMediaCandidate[],
  fetcher: typeof fetch = fetch
): Promise<SelectedCaptureMedia[]> {
  const files = await Promise.all(candidates.map((candidate) => downloadQuickCaptureImportedMedia(candidate, fetcher)));
  return normalizeQuickCaptureImportedMediaFiles(files).map((file) => createSelectedCaptureMedia(file));
}

export async function saveQuickCaptureSelectedMediaFiles({
  selectedMedia,
  mediaStorageDirectory,
  selectedPoolLabel,
  vault
}: {
  selectedMedia: SelectedCaptureMedia[];
  mediaStorageDirectory: string;
  selectedPoolLabel: string;
  vault: QuickCaptureMediaVaultLike;
}): Promise<string[]> {
  if (selectedMedia.length === 0) {
    return [];
  }

  const mediaRootDirectory = normalizePath(mediaStorageDirectory.trim() || "Glitter");
  const poolFolderName = sanitizeQuickCaptureMediaFolderName(selectedPoolLabel);
  const mediaDirectory = normalizePath(`${mediaRootDirectory}/images/${poolFolderName}`);
  await ensureQuickCaptureMediaDirectory(vault, mediaDirectory);

  const saved: string[] = [];
  for (const media of selectedMedia) {
    const targetPath = await createQuickCaptureUniqueMediaPath(vault, mediaDirectory, media.file.name);
    const content = await media.file.arrayBuffer();
    await vault.createBinary(targetPath, content);
    saved.push(targetPath);
  }

  return saved;
}
