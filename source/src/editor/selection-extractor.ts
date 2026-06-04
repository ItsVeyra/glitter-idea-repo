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
