/**
 * 编辑器工作流，连接选区创建灵感与正文插入引用片段两条路径。
 * 负责协调池服务、灵感服务与编辑器序列化逻辑，输出编辑器侧可直接调用的 API。
 */
import type { Editor } from "obsidian";
import { extractSelectionPayload } from "../../editor/selection-extractor";
import { serializeIdeaSnippet } from "../../editor/snippet-serializer";
import type { createIdeaService } from "../../domain/idea/idea-service";
import type { createPoolService } from "../../domain/pool/pool-service";
import { DEFAULT_POOL_LABEL } from "../../plugin/constants";
import { nowIso } from "../../utils/time";

// 编辑器工作流契约。
export interface CreateIdeaFromSelectionInput {
  selection: string;
  poolId?: string;
}

export interface InsertIdeaReferenceInput {
  ideaId: string;
  editor: Pick<Editor, "replaceSelection">;
  notePath: string;
  emoji: string;
}

export interface SnippetTarget {
  ideaId: string;
  poolId: string;
}

export interface EditorWorkflow {
  createIdeaFromSelection(input: CreateIdeaFromSelectionInput): Promise<{ id: string }>;
  insertIdeaReference(input: InsertIdeaReferenceInput): Promise<void>;
  resolveSnippetTarget(ideaId: string): Promise<SnippetTarget | null>;
}

export function createEditorWorkflow({
  poolService,
  ideaService
}: {
  poolService: ReturnType<typeof createPoolService>;
  ideaService: ReturnType<typeof createIdeaService>;
}): EditorWorkflow {
  // 编辑器工作流对外接口。
  return {
    async createIdeaFromSelection(input) {
      const payload = extractSelectionPayload(input.selection);
      const poolId = input.poolId ?? (await poolService.ensureDefaultPool()).id;

      return ideaService.createIdea({
        title: payload.title,
        body: payload.body,
        contentType: payload.contentType,
        sourceType: "selection",
        sourceUrl: payload.contentType === "link" ? payload.body : undefined,
        attachmentPaths: [],
        poolId,
        tags: []
      });
    },

    async insertIdeaReference(input) {
      const idea = await ideaService.getIdea(input.ideaId);
      if (!idea) {
        throw new Error(`Idea not found: ${input.ideaId}`);
      }

      const pool = await poolService.getPool(idea.poolId);

      input.editor.replaceSelection(
        serializeIdeaSnippet({
          id: idea.id,
          title: idea.title,
          body: idea.body,
          sourceUrl: idea.sourceUrl,
          contentType: idea.contentType,
          attachmentPaths: idea.attachmentPaths,
          tags: idea.tags,
          poolLabel: pool?.name ?? DEFAULT_POOL_LABEL,
          emoji: input.emoji
        })
      );

      await ideaService.recordSnippetRef(idea.id, {
        notePath: input.notePath,
        insertedAt: nowIso()
      });
    },

    async resolveSnippetTarget(ideaId) {
      const idea = await ideaService.getIdea(ideaId);
      if (!idea) {
        return null;
      }

      return {
        ideaId: idea.id,
        poolId: idea.poolId
      };
    }
  };
}
