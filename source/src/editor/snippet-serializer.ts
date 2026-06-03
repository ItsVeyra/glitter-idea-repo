/**
 * 灵感片段序列化器，负责把灵感实体转换为可插入正文的参考样式 callout。
 * 统一处理标题、正文、来源、附件、标签与池来源信息的 Markdown 输出。
 */
import { DEFAULT_POOL_LABEL } from "../plugin/constants";
import type { IdeaContentType } from "../domain/idea/idea-model";

// Markdown 片段格式化辅助。
function escapeMarkdownLinkText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

const IDEA_SNIPPET_CALLOUT_START_PREFIXES = ["> [!GlitterIdea] ", "> [!glitter-idea] "];
const IDEA_SNIPPET_HTML_CLASS_NAMES = ["GlitterIdea-snippet", "glitter-idea-snippet"];
const IDEA_SNIPPET_HTML_ID_PATTERNS = [
  /data-glitteridea-id="([^"]+)"/,
  /data-glitter-idea-id="([^"]+)"/,
  /data-GlitterIdea-id="([^"]+)"/
];

function isIdeaSnippetCalloutStartLine(line: string, ideaId: string): boolean {
  return IDEA_SNIPPET_CALLOUT_START_PREFIXES.some((prefix) => line.startsWith(prefix))
    && line.includes(`](glitter://idea/${ideaId})`);
}

function extractIdeaIdFromHtmlSnippetStartLine(line: string): string | null {
  if (!line.includes("<div") || !IDEA_SNIPPET_HTML_CLASS_NAMES.some((className) => line.includes(className))) {
    return null;
  }

  for (const pattern of IDEA_SNIPPET_HTML_ID_PATTERNS) {
    const matched = line.match(pattern)?.[1];
    if (matched) {
      return matched;
    }
  }

  return null;
}

function isIdeaSnippetHtmlStartLine(line: string, ideaId: string): boolean {
  return extractIdeaIdFromHtmlSnippetStartLine(line) === ideaId;
}

export function isIdeaSnippetStartLine(line: string, ideaId: string): boolean {
  return isIdeaSnippetCalloutStartLine(line, ideaId) || isIdeaSnippetHtmlStartLine(line, ideaId);
}

export function isIdeaSnippetFooterLine(line: string): boolean {
  return line.startsWith("> ✨ 来自 Glitter · ") || line.startsWith("> ⚠ 来自 Glitter · ");
}

export function countIdeaSnippetOccurrences(markdown: string, ideaId: string): number {
  return markdown.split(/\r?\n/).filter((line) => isIdeaSnippetStartLine(line, ideaId)).length;
}

function countMatches(value: string, pattern: RegExp): number {
  return Array.from(value.matchAll(pattern)).length;
}

function resolveIdeaSnippetHtmlEndIndex(lines: string[], startIndex: number): number {
  let endIndex = startIndex;
  let depth = countMatches(lines[startIndex] ?? "", /<div\b/gi) - countMatches(lines[startIndex] ?? "", /<\/div>/gi);

  while (endIndex + 1 < lines.length && depth > 0) {
    endIndex += 1;
    const candidate = lines[endIndex] ?? "";
    depth += countMatches(candidate, /<div\b/gi) - countMatches(candidate, /<\/div>/gi);
  }

  return endIndex;
}

export function replaceIdeaSnippetMarkdown(markdown: string, ideaId: string, replacement: string): string {
  const lineEnding = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const replacementLines = replacement.split(/\r?\n/);
  const nextLines: string[] = [];
  let replaced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const isCalloutSnippet = isIdeaSnippetCalloutStartLine(line, ideaId);
    const isHtmlSnippet = isIdeaSnippetHtmlStartLine(line, ideaId);
    if (!isCalloutSnippet && !isHtmlSnippet) {
      nextLines.push(line);
      continue;
    }

    replaced = true;
    nextLines.push(...replacementLines);

    if (isHtmlSnippet) {
      index = resolveIdeaSnippetHtmlEndIndex(lines, index);
      continue;
    }

    let endIndex = index;
    let footerFound = false;
    while (endIndex + 1 < lines.length) {
      const candidate = lines[endIndex + 1] ?? "";
      if (!candidate.startsWith(">")) {
        break;
      }

      endIndex += 1;
      if (isIdeaSnippetFooterLine(candidate)) {
        footerFound = true;
        break;
      }
    }

    if (!footerFound) {
      while (endIndex + 1 < lines.length && (lines[endIndex + 1] ?? "").startsWith(">")) {
        endIndex += 1;
      }
    }

    index = endIndex;
  }

  return replaced ? nextLines.join(lineEnding) : markdown;
}

function toCalloutLines(lines: string[]): string[] {
  return lines.map((line) => (line.length > 0 ? `> ${line}` : ">"));
}

function normalizeMultilineValue(value?: string): string[] {
  const trimmed = value?.trim();
  return trimmed ? trimmed.split(/\r?\n/) : [];
}

function formatTag(tag: string): string {
  const trimmed = tag.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

// 片段序列化。
export function serializeIdeaSnippet(input: {
  id: string;
  title: string;
  body: string;
  sourceUrl?: string;
  contentType: IdeaContentType;
  attachmentPaths: string[];
  tags: string[];
  poolLabel?: string;
  emoji: string;
}): string {
  const sections: string[][] = [];
  const title = input.title.trim() || "未命名灵感";
  const bodyLines = normalizeMultilineValue(input.body);
  const sourceLines = normalizeMultilineValue(input.sourceUrl);
  const normalizedBody = bodyLines.join("\n");
  const normalizedSource = sourceLines.join("\n");

  if (sourceLines.length > 0 && normalizedSource !== normalizedBody) {
    sections.push(sourceLines);
  }

  if (bodyLines.length > 0 && !(input.contentType === "link" && normalizedBody === normalizedSource)) {
    sections.push(bodyLines);
  }

  const attachmentLines = input.attachmentPaths
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .map((path) => `![[${path}]]`);
  if (attachmentLines.length > 0) {
    sections.push(attachmentLines);
  }

  const tagLine = input.tags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map(formatTag)
    .join(" ");
  if (tagLine.length > 0) {
    sections.push([tagLine]);
  }

  sections.push([`✨ 来自 Glitter · ${input.poolLabel?.trim() || DEFAULT_POOL_LABEL}`]);

  const output = [`> [!GlitterIdea] [\\[引用灵感\\] ${escapeMarkdownLinkText(title)}](glitter://idea/${input.id})`];

  sections.forEach((section, index) => {
    if (index > 0) {
      output.push(">", ...toCalloutLines(section));
      return;
    }

    output.push(...toCalloutLines(section));
  });

  return output.join("\n");
}
