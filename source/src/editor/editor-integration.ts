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
