/**
 * 链接导入服务，负责请求远程页面并提取可用于生成灵感的元信息。
 * 把抓取、响应校验与 HTML 元信息解析收口为单一的领域导入入口。
 */
import { requestUrl } from "obsidian";
import { parseLinkImportResult } from "./link-parser";

// 远程导入响应契约。
type LinkImportResponse = {
  status: number;
  text: string | (() => Promise<string>);
};

// 远程导入服务。
export function createLinkImportService(fetcher: (url: string) => Promise<LinkImportResponse> = requestUrl) {
  return {
    async importUrl(url: string) {
      const response = await fetcher(url);

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Failed to import link: ${response.status}`);
      }

      const html = typeof response.text === "function" ? await response.text() : response.text;
      const htmlTitleMatch = html.match(/<title>(.*?)<\/title>/i);
      const descriptionMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);

      return parseLinkImportResult({
        url,
        htmlTitle: htmlTitleMatch?.[1],
        description: descriptionMatch?.[1]
      });
    }
  };
}
