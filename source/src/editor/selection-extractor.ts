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
 * 选区解析辅助。
 * 负责把当前编辑器中的选中文本提炼为创建灵感所需的标题、正文与内容类型。
 */
// 选区内容解析。
export function extractSelectionPayload(selection: string) {
  const trimmed = selection.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  return {
    title: isUrl ? trimmed : trimmed.slice(0, 40) || "Untitled",
    body: trimmed,
    contentType: isUrl ? "link" : "text"
  } as const;
}
