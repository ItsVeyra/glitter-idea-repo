import type { Idea } from "./idea-model";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".wmv", ".ogv", ".ogg"]);

export type IdeaAttachmentMediaKind = "image" | "video" | null;
export type IdeaCapabilityLayoutKind = "text" | "link" | "image" | "video" | "empty";

function hasText(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeIdeaSourceUrl(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^www\./i.test(trimmed)
      ? `https://${trimmed}`
      : undefined;

  if (!candidate) {
    return undefined;
  }

  try {
    return new URL(candidate).toString();
  } catch {
    return undefined;
  }
}

function resolveExtension(path: string): string {
  const normalized = path.trim().toLowerCase();
  const fileName = normalized.split("?")[0] ?? normalized;
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex >= 0 ? fileName.slice(lastDotIndex) : "";
}

export function inferIdeaAttachmentMediaKind(path: string): IdeaAttachmentMediaKind {
  if (!hasText(path)) {
    return null;
  }

  return VIDEO_EXTENSIONS.has(resolveExtension(path)) ? "video" : "image";
}

export function resolveIdeaContentCapabilities(input: Pick<Idea, "body" | "sourceUrl" | "attachmentPaths">): {
  hasBodyContent: boolean;
  hasLinkCapability: boolean;
  mediaKind: "none" | "image" | "video";
} {
  const hasBodyContent = hasText(input.body);
  const hasLinkCapability = Boolean(normalizeIdeaSourceUrl(input.sourceUrl));
  const mediaKind = input.attachmentPaths.some((path) => inferIdeaAttachmentMediaKind(path) === "video")
    ? "video"
    : input.attachmentPaths.some((path) => inferIdeaAttachmentMediaKind(path) === "image")
      ? "image"
      : "none";

  return {
    hasBodyContent,
    hasLinkCapability,
    mediaKind
  };
}

export function resolveIdeaCapabilityLayoutKind(input: Pick<Idea, "body" | "sourceUrl" | "attachmentPaths">): IdeaCapabilityLayoutKind {
  const capabilities = resolveIdeaContentCapabilities(input);
  if (capabilities.mediaKind === "video") {
    return "video";
  }
  if (capabilities.mediaKind === "image") {
    return "image";
  }
  if (capabilities.hasLinkCapability) {
    return "link";
  }
  if (capabilities.hasBodyContent) {
    return "text";
  }
  return "empty";
}
