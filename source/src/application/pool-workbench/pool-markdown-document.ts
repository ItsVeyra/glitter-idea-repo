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

import { formatIdeaTimestamp, type Idea } from "../../domain/idea/idea-model";
import type { Pool } from "../../domain/pool/pool-model";

export interface PoolMarkdownDocumentInput {
  pool: Pick<Pool, "name">;
  ideas: Array<
    Pick<Idea, "title" | "body" | "contentType" | "sourceUrl" | "attachmentPaths" | "createdAt" | "updatedAt">
  >;
}

type PoolMarkdownIdea = PoolMarkdownDocumentInput["ideas"][number];

function hasText(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildAttachmentBlock(attachmentPaths: string[]): string | null {
  const embeds = attachmentPaths
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .map((path) => `![[${path}]]`);

  return embeds.length > 0 ? embeds.join("\n") : null;
}

function buildIdeaContentBlocks(idea: PoolMarkdownIdea): string[] {
  const bodyBlock = hasText(idea.body) ? idea.body : null;
  const sourceBlock = hasText(idea.sourceUrl) ? `来源链接：${idea.sourceUrl.trim()}` : null;
  const attachmentBlock = buildAttachmentBlock(idea.attachmentPaths);

  if (idea.contentType === "text") {
    return bodyBlock ? [bodyBlock] : [];
  }

  if (idea.contentType === "link") {
    return [sourceBlock, bodyBlock].filter((block): block is string => Boolean(block));
  }

  if (idea.contentType === "image" || idea.contentType === "video") {
    return [attachmentBlock, bodyBlock].filter((block): block is string => Boolean(block));
  }

  if (idea.contentType === "mixed") {
    return [sourceBlock, attachmentBlock, bodyBlock].filter((block): block is string => Boolean(block));
  }

  return [];
}

function formatYamlStringValue(value: string): string {
  return JSON.stringify(value);
}

function sanitizeMarkdownHeadingText(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

function buildIdeaSection(idea: PoolMarkdownIdea): string {
  const sections = [
    `## ${sanitizeMarkdownHeadingText(idea.title)}`,
    `创建时间：${formatIdeaTimestamp(idea.createdAt)}\n更新时间：${formatIdeaTimestamp(idea.updatedAt)}`,
    ...buildIdeaContentBlocks(idea)
  ];

  return sections.join("\n\n");
}

export function buildPoolMarkdownDocument(input: PoolMarkdownDocumentInput): string {
  const poolName = input.pool.name;
  const documentSections = [
    `---\nGlitter: ${formatYamlStringValue(poolName)}\n---`,
    `# ${sanitizeMarkdownHeadingText(poolName)}`,
    ...input.ideas.map(buildIdeaSection)
  ];

  return documentSections.join("\n\n");
}
