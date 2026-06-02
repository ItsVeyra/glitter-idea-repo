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
 * 编辑器集成辅助。
 * 负责从当前 Obsidian 工作区解析活动 Markdown 编辑器，供命令与工作流复用。
 */
import { MarkdownView } from "obsidian";
import type { Editor } from "obsidian";
import type GlitterPlugin from "../plugin/GlitterPlugin";

// 编辑器获取。
export function getActiveEditor(plugin: GlitterPlugin): Editor | null {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  return view?.editor ?? null;
}
