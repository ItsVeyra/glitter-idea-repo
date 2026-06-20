/**
 * 链接导入解析器，负责把抓取到的元信息整理为灵感草稿。
 * 当前会同时提取标题、描述、来源链接与可下载媒体候选。
 */

export interface LinkImportMediaCandidate {
  url: string;
  mediaType: "image" | "video";
  fileName: string;
}

// 链接导入结构定义。
export interface LinkImportDraft {
  title: string;
  body: string;
  sourceUrl: string;
  mediaCandidates: LinkImportMediaCandidate[];
}

export interface LinkImportSource {
  url: string;
  htmlTitle?: string;
  openGraphTitle?: string;
  description?: string;
  openGraphImageUrl?: string;
  openGraphImageUrls?: string[];
  openGraphVideoUrl?: string;
  openGraphVideoUrls?: string[];
}

function normalizeImportedMediaUrl(pageUrl: string, rawUrl?: string): string | undefined {
  if (!rawUrl?.trim()) {
    return undefined;
  }

  try {
    return new URL(rawUrl.trim(), pageUrl).toString();
  } catch {
    return undefined;
  }
}

function resolveImportedMediaFileName(url: string, mediaType: "image" | "video"): string {
  const pathname = new URL(url).pathname.split("/").pop()?.trim();
  return pathname && pathname.length > 0 ? decodeURIComponent(pathname) : `imported-${mediaType}`;
}

function createImportedMediaCandidate(
  pageUrl: string,
  rawUrl: string | undefined,
  mediaType: "image" | "video"
): LinkImportMediaCandidate | undefined {
  const normalizedUrl = normalizeImportedMediaUrl(pageUrl, rawUrl);
  if (!normalizedUrl) {
    return undefined;
  }

  return {
    url: normalizedUrl,
    mediaType,
    fileName: resolveImportedMediaFileName(normalizedUrl, mediaType)
  };
}

function createImportedMediaCandidates(
  pageUrl: string,
  rawUrls: Array<string | undefined>,
  mediaType: "image" | "video"
): LinkImportMediaCandidate[] {
  const seen = new Set<string>();

  return rawUrls.flatMap((rawUrl) => {
    const candidate = createImportedMediaCandidate(pageUrl, rawUrl, mediaType);
    if (!candidate || seen.has(candidate.url)) {
      return [];
    }

    seen.add(candidate.url);
    return [candidate];
  });
}

// 链接导入结果解析。
export function parseLinkImportResult(input: LinkImportSource): LinkImportDraft {
  const title = input.openGraphTitle || input.htmlTitle || input.url;
  const body = [input.description].filter(Boolean).join("\n\n");
  const mediaCandidates = [
    ...createImportedMediaCandidates(
      input.url,
      [...(input.openGraphVideoUrls ?? []), input.openGraphVideoUrl],
      "video"
    ),
    ...createImportedMediaCandidates(
      input.url,
      [...(input.openGraphImageUrls ?? []), input.openGraphImageUrl],
      "image"
    )
  ];

  return {
    title,
    body,
    sourceUrl: input.url,
    mediaCandidates
  };
}
