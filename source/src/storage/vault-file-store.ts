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
 * Vault 文件存储辅助。
 * 负责确保 Glitter 目录存在、生成唯一文件路径，并拼装灵感文件正文内容。
 */
import { normalizePath, type Vault } from "obsidian";
import type { Idea } from "../domain/idea/idea-model";

// 文件名规范化辅助。
function normalizeNoteTitle(name: string): string {
  const firstLine = name
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() || "untitled";
}

function sanitizeFilename(name: string): string {
  return normalizeNoteTitle(name).replace(/[\\/:*?"<>|]/g, "-").trim() || "untitled";
}

// Vault 文件存储接口。
export function createVaultFileStore(vault?: Vault) {
  return {
    async ensureFolder(path: string): Promise<void> {
      if (!vault) {
        return;
      }

      const normalized = normalizePath(path);
      const parts = normalized.split("/").filter(Boolean);
      let current = "";

      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const existing = vault.getAbstractFileByPath(current);

        if (!existing) {
          await vault.createFolder(current);
          continue;
        }

        if (!("children" in existing)) {
          throw new Error(`Path exists and is not a folder: ${current}`);
        }
      }
    },

    async createUniquePath(folder: string, fileName: string, extension = ".md"): Promise<string> {
      if (!vault) {
        return normalizePath(`${folder}/${sanitizeFilename(fileName)}${extension}`);
      }

      const sanitizedFolder = normalizePath(folder);
      const sanitizedBase = sanitizeFilename(fileName);

      let attempt = 0;
      while (true) {
        const suffix = attempt === 0 ? "" : `-${attempt}`;
        const candidate = normalizePath(`${sanitizedFolder}/${sanitizedBase}${suffix}${extension}`);

        if (!vault.getAbstractFileByPath(candidate)) {
          return candidate;
        }

        attempt += 1;
      }
    },

    buildIdeaFileContent(idea: Pick<Idea, "title" | "body" | "sourceUrl" | "attachmentPaths">): string {
      const noteTitle = normalizeNoteTitle(idea.title);
      const sourceLine = idea.sourceUrl ? `\n来源：${idea.sourceUrl}\n` : "";
      const attachmentLines =
        idea.attachmentPaths.length === 0
          ? ""
          : `\n附件：\n${idea.attachmentPaths.map((path) => `- [[${path}]]`).join("\n")}\n`;

      return `# ${noteTitle}\n\n${idea.body}${sourceLine}${attachmentLines}`;
    }
  };
}
