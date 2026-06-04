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
