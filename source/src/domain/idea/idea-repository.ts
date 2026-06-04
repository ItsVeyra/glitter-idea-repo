/**
 * 灵感仓储，负责基于插件数据存储执行灵感的持久化读写。
 * 涵盖草稿创建、状态更新、片段引用记录、跨池移动与删除等底层操作。
 */
import { DEFAULT_POOL_ID } from "../../plugin/constants";
import type { PluginDataStore } from "../../storage/plugin-data-store";
import { createPluginDataStore } from "../../storage/plugin-data-store";
import { createId } from "../../utils/id";
import { nowIso } from "../../utils/time";
import type { Idea, IdeaSnippetRef } from "./idea-model";

// 仓储输入契约。
export interface CreateIdeaInput {
  title: string;
  body: string;
  contentType: Idea["contentType"];
  sourceType: Idea["sourceType"];
  sourceUrl?: string;
  attachmentPaths?: string[];
  poolId?: string;
  tags: string[];
}

export interface UpdateIdeaInput {
  title?: string;
  body?: string;
  sourceUrl?: string;
  tags?: string[];
  attachmentPaths?: string[];
  poolId?: string;
  quoted?: boolean;
  inbox?: boolean;
  markEdited?: boolean;
}

// 复制与内存存储辅助。
function cloneIdea(idea: Idea): Idea {
  return {
    ...idea,
    tags: [...idea.tags],
    attachmentPaths: [...idea.attachmentPaths],
    snippetRefs: idea.snippetRefs.map((snippetRef) => ({ ...snippetRef }))
  };
}

function createInMemoryStore(): PluginDataStore<Idea, unknown> {
  let persisted: unknown = null;

  return createPluginDataStore<Idea, unknown>({
    async loadData() {
      return persisted;
    },
    async saveData(data) {
      persisted = data;
    }
  });
}

// 灵感仓储实现。
export function createIdeaRepository(dataStore: PluginDataStore<Idea, unknown> = createInMemoryStore()) {
  // 基础读写与状态变更。
  return {
    async create(input: CreateIdeaInput): Promise<Idea> {
      const timestamp = nowIso();
      const idea: Idea = {
        id: createId("idea"),
        title: input.title,
        body: input.body,
        contentType: input.contentType,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        attachmentPaths: [...(input.attachmentPaths ?? [])],
        poolId: input.poolId ?? DEFAULT_POOL_ID,
        tags: [...input.tags],
        quoted: false,
        fileCreated: false,
        inbox: true,
        filePath: undefined,
        snippetRefs: [],
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await dataStore.mutate((snapshot) => ({
        ...snapshot,
        ideas: [...snapshot.ideas, cloneIdea(idea)]
      }));

      return cloneIdea(idea);
    },

    async getById(id: string): Promise<Idea | null> {
      const loaded = await dataStore.load();
      const found = loaded.snapshot.ideas.find((idea) => idea.id === id);
      return found ? cloneIdea(found) : null;
    },

    async list(): Promise<Idea[]> {
      const loaded = await dataStore.load();
      return loaded.snapshot.ideas.map(cloneIdea);
    },

    async listByPool(poolId: string): Promise<Idea[]> {
      const loaded = await dataStore.load();
      return loaded.snapshot.ideas.filter((idea) => idea.poolId === poolId).map(cloneIdea);
    },

    async update(id: string, input: UpdateIdeaInput): Promise<Idea | null> {
      let updated: Idea | null = null;

      await dataStore.mutate((snapshot) => ({
        ...snapshot,
        ideas: snapshot.ideas.map((idea) => {
          if (idea.id !== id) {
            return idea;
          }

          const timestamp = nowIso();
          const next: Idea = {
            ...idea,
            title: input.title ?? idea.title,
            body: input.body ?? idea.body,
            sourceUrl: Object.prototype.hasOwnProperty.call(input, "sourceUrl") ? input.sourceUrl : idea.sourceUrl,
            tags: input.tags ? [...input.tags] : [...idea.tags],
            attachmentPaths: input.attachmentPaths ? [...input.attachmentPaths] : [...idea.attachmentPaths],
            poolId: input.poolId ?? idea.poolId,
            quoted: input.quoted ?? idea.quoted,
            inbox: input.inbox ?? idea.inbox,
            updatedAt: timestamp,
            editedAt: input.markEdited ? timestamp : idea.editedAt
          };
          updated = cloneIdea(next);
          return next;
        })
      }));

      return updated;
    },

    async markFileCreated(id: string, filePath: string): Promise<Idea | null> {
      let updated: Idea | null = null;

      await dataStore.mutate((snapshot) => ({
        ...snapshot,
        ideas: snapshot.ideas.map((idea) => {
          if (idea.id !== id) {
            return idea;
          }

          const next: Idea = {
            ...idea,
            fileCreated: true,
            filePath,
            updatedAt: nowIso()
          };
          updated = cloneIdea(next);
          return next;
        })
      }));

      return updated;
    },

    async clearFileCreated(id: string): Promise<Idea | null> {
      let updated: Idea | null = null;

      await dataStore.mutate((snapshot) => ({
        ...snapshot,
        ideas: snapshot.ideas.map((idea) => {
          if (idea.id !== id) {
            return idea;
          }

          const next: Idea = {
            ...idea,
            fileCreated: false,
            filePath: undefined,
            updatedAt: nowIso()
          };
          updated = cloneIdea(next);
          return next;
        })
      }));

      return updated;
    },

    async recordSnippetRef(id: string, snippetRef: IdeaSnippetRef): Promise<Idea | null> {
      let updated: Idea | null = null;

      await dataStore.mutate((snapshot) => ({
        ...snapshot,
        ideas: snapshot.ideas.map((idea) => {
          if (idea.id !== id) {
            return idea;
          }

          const next: Idea = {
            ...idea,
            snippetRefs: [...idea.snippetRefs, { ...snippetRef }],
            updatedAt: nowIso()
          };
          updated = cloneIdea(next);
          return next;
        })
      }));

      return updated;
    },

    async replaceSnippetRefs(id: string, snippetRefs: IdeaSnippetRef[]): Promise<Idea | null> {
      let updated: Idea | null = null;

      await dataStore.mutate((snapshot) => ({
        ...snapshot,
        ideas: snapshot.ideas.map((idea) => {
          if (idea.id !== id) {
            return idea;
          }

          const next: Idea = {
            ...idea,
            snippetRefs: snippetRefs.map((snippetRef) => ({ ...snippetRef }))
          };
          updated = cloneIdea(next);
          return next;
        })
      }));

      return updated;
    },

    // 批量移动与删除。
    async moveMany(ids: string[], poolId: string): Promise<Idea[]> {
      const idSet = new Set(ids);

      let moved: Idea[] = [];
      await dataStore.mutate((snapshot) => {
        moved = [];
        return {
          ...snapshot,
          ideas: snapshot.ideas.map((idea) => {
            if (!idSet.has(idea.id)) {
              return idea;
            }

            const next: Idea = {
              ...idea,
              poolId,
              updatedAt: nowIso()
            };
            moved.push(cloneIdea(next));
            return next;
          })
        };
      });

      return moved;
    },

    async delete(id: string): Promise<boolean> {
      let deleted = false;

      await dataStore.mutate((snapshot) => {
        const nextIdeas = snapshot.ideas.filter((idea) => {
          if (idea.id !== id) {
            return true;
          }

          deleted = true;
          return false;
        });

        if (!deleted) {
          return snapshot;
        }

        return {
          ...snapshot,
          ideas: nextIdeas
        };
      });

      return deleted;
    }
  };
}
