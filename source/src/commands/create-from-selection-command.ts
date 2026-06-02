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
 * 划词创建命令注册器。
 * 负责声明命令元数据，并把命令回调接到编辑器工作流的创建入口。
 */
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { getActiveEditor } from "../editor/editor-integration";

// 命令注册。
export function registerCreateFromSelectionCommand(plugin: GlitterPlugin): void {
  plugin.addCommand({
    id: "create-idea-from-selection",
    name: "Create Glitter idea from selection",
    callback: async () => {
      const editor = getActiveEditor(plugin);
      if (!editor) {
        return;
      }

      await plugin.editorWorkflow.createIdeaFromSelection({
        selection: editor.getSelection()
      });
    }
  });
}
