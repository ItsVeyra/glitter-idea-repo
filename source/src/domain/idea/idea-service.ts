/**
 * 灵感领域服务，负责在仓储读写之上提供查询与索引语义。
 * 大部分操作直接透传给仓储，查询场景则统一走索引构建与筛选。
 */
import { createIdeaRepository } from "./idea-repository";
import { createIndexStore, type IdeaSortOrder, type IdeaStatusMarker } from "../../storage/index-store";

// 灵感服务组装。
export function createIdeaService(
  repository = createIdeaRepository(),
  indexStore = createIndexStore()
) {
  // 仓储透传操作。
  return {
    async createIdea(input: Parameters<typeof repository.create>[0]) {
      return repository.create(input);
    },

    async listIdeas() {
      return repository.list();
    },

    async getIdea(id: string) {
      return repository.getById(id);
    },

    async updateIdea(id: string, input: Parameters<typeof repository.update>[1]) {
      return repository.update(id, input);
    },

    async listByPool(poolId: string) {
      return repository.listByPool(poolId);
    },

    async moveIdeas(ids: string[], poolId: string) {
      return repository.moveMany(ids, poolId);
    },

    async markFileCreated(id: string, filePath: string) {
      return repository.markFileCreated(id, filePath);
    },

    async clearFileCreated(id: string) {
      return repository.clearFileCreated(id);
    },

    async deleteIdea(id: string) {
      return repository.delete(id);
    },

    async recordSnippetRef(id: string, snippetRef: Parameters<typeof repository.recordSnippetRef>[1]) {
      return repository.recordSnippetRef(id, snippetRef);
    },

    async replaceSnippetRefs(id: string, snippetRefs: Parameters<typeof repository.replaceSnippetRefs>[1]) {
      return repository.replaceSnippetRefs(id, snippetRefs);
    },

    // 索引查询。
    async queryIdeas(query: {
      poolId?: string;
      text?: string;
      status?: IdeaStatusMarker;
      sort?: IdeaSortOrder;
    }) {
      const ideas = await repository.list();
      const entries = indexStore.buildEntries(ideas);
      return indexStore.query(entries, {
        poolId: query.poolId,
        query: query.text,
        status: query.status,
        sort: query.sort
      }).map((entry) => entry.idea);
    }
  };
}
