/**
 * 灵感领域模型与共享状态辅助。
 * 负责定义灵感实体、片段引用结构，以及供界面展示复用的状态标签逻辑。
 */
// 灵感实体定义。
export type IdeaContentType = "text" | "link" | "image" | "video" | "mixed";
export type IdeaSourceType = "manual" | "selection" | "quick-capture" | "link-import";

export interface IdeaSnippetRef {
  notePath: string;
  blockId?: string;
  insertedAt: string;
}

export interface Idea {
  id: string;
  title: string;
  body: string;
  contentType: IdeaContentType;
  sourceType: IdeaSourceType;
  sourceUrl?: string;
  attachmentPaths: string[];
  poolId: string;
  tags: string[];
  quoted: boolean;
  fileCreated: boolean;
  inbox: boolean;
  filePath?: string;
  snippetRefs: IdeaSnippetRef[];
  createdAt: string;
  updatedAt: string;
  editedAt?: string;
}

// 状态展示辅助。
export function hasIdeaSnippetRefs(idea: Pick<Idea, "snippetRefs">): boolean {
  return idea.snippetRefs.length > 0;
}

export function countDistinctSnippetNotes(idea: Pick<Idea, "snippetRefs">): number {
  return new Set(
    idea.snippetRefs.map((snippetRef) => snippetRef.notePath).filter((notePath): notePath is string => Boolean(notePath))
  ).size;
}

export function buildIdeaStatusLabels(input: { fileCreated: boolean; snippetCount: number }): string[] {
  const labels: string[] = [];

  if (input.fileCreated) {
    labels.push("已创建文件");
  }

  if (input.snippetCount > 0) {
    labels.push(`已引用为 ${input.snippetCount} 个片段`);
  }

  return labels;
}

export function formatIdeaTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
