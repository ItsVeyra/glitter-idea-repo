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
 * 应用层链接导入适配器，连接快速记录输入与领域层链接导入能力。
 * 负责解析原始输入中的 URL，并把领域导入结果映射为弹窗可直接消费的数据结构。
 */
import { createLinkImportService as createDomainLinkImportService } from "../../domain/link/link-import-service";

// 应用层导入契约。
export interface QuickCaptureLinkImportResult {
  title: string;
  body: string;
  sourceUrl: string;
}

export interface QuickCaptureLinkImportService {
  importFromInput(input: string): Promise<QuickCaptureLinkImportResult>;
}

// 链接输入解析。
const URL_CANDIDATE_PATTERN = /(?:https?:\/\/|www\.)\S+/i;

function resolveUrlFromInput(input: string): string {
  const match = input.match(URL_CANDIDATE_PATTERN)?.[0]?.trim();
  if (!match) {
    throw new Error("未检测到可导入的链接，请输入有效 URL。");
  }

  const normalized = /^https?:\/\//i.test(match) ? match : `https://${match}`;

  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error("链接格式无效，请检查后重试。");
  }
}

// 应用层链接导入服务。
export function createQuickCaptureLinkImportService(
  domainService = createDomainLinkImportService()
): QuickCaptureLinkImportService {
  return {
    async importFromInput(input) {
      const resolvedUrl = resolveUrlFromInput(input);
      const result = await domainService.importUrl(resolvedUrl);
      return {
        title: result.title,
        body: result.body,
        sourceUrl: result.sourceUrl
      };
    }
  };
}
