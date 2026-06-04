/**
 * 链接导入解析器，负责把抓取到的元信息整理为灵感草稿。
 * 当前只关心标题、描述与来源链接，输出领域层统一的导入结构。
 */
// 链接导入结构定义。
export interface LinkImportDraft {
  title: string;
  body: string;
  sourceUrl: string;
}

export interface LinkImportSource {
  url: string;
  htmlTitle?: string;
  openGraphTitle?: string;
  description?: string;
}

// 链接导入结果解析。
export function parseLinkImportResult(input: LinkImportSource): LinkImportDraft {
  const title = input.openGraphTitle || input.htmlTitle || input.url;
  const body = [input.description].filter(Boolean).join("\n\n");

  return {
    title,
    body,
    sourceUrl: input.url
  };
}
