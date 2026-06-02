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
 * 灵感索引构建器。
 * 负责从灵感实体生成可搜索条目，并提供池、状态与排序维度的查询逻辑。
 */
import type { Idea } from "../domain/idea/idea-model";

export type IdeaStatusMarker = "inbox" | "quoted" | "fileCreated";
export type IdeaSortOrder = "createdAt-desc" | "createdAt-asc" | "updatedAt-desc" | "updatedAt-asc";

export interface IdeaIndexEntry {
  id: string;
  poolId: string;
  searchText: string;
  createdAt: string;
  updatedAt: string;
  markers: {
    inbox: boolean;
    quoted: boolean;
    fileCreated: boolean;
  };
  idea: Idea;
}

// 排序辅助。
function compareBySort(a: IdeaIndexEntry, b: IdeaIndexEntry, sort: IdeaSortOrder): number {
  if (sort === "createdAt-asc") {
    return a.createdAt.localeCompare(b.createdAt);
  }
  if (sort === "createdAt-desc") {
    return b.createdAt.localeCompare(a.createdAt);
  }
  if (sort === "updatedAt-asc") {
    return a.updatedAt.localeCompare(b.updatedAt);
  }
  return b.updatedAt.localeCompare(a.updatedAt);
}

// 索引存储接口。
export function createIndexStore() {
  return {
    buildSearchText(idea: Pick<Idea, "title" | "body" | "tags" | "sourceUrl">): string {
      return [idea.title, idea.body, ...idea.tags, idea.sourceUrl ?? ""].join(" ").toLowerCase();
    },

    matchesQuery(searchText: string, query: string): boolean {
      const normalized = query.trim().toLowerCase();
      if (!normalized) {
        return true;
      }
      return searchText.includes(normalized);
    },

    buildEntries(ideas: Idea[]): IdeaIndexEntry[] {
      return ideas.map((idea) => ({
        id: idea.id,
        poolId: idea.poolId,
        searchText: this.buildSearchText(idea),
        createdAt: idea.createdAt,
        updatedAt: idea.updatedAt,
        markers: {
          inbox: idea.inbox,
          quoted: idea.quoted,
          fileCreated: idea.fileCreated
        },
        idea: {
          ...idea,
          tags: [...idea.tags],
          attachmentPaths: [...idea.attachmentPaths],
          snippetRefs: idea.snippetRefs.map((snippetRef) => ({ ...snippetRef }))
        }
      }));
    },

    query(
      entries: IdeaIndexEntry[],
      options: {
        poolId?: string;
        query?: string;
        status?: IdeaStatusMarker;
        sort?: IdeaSortOrder;
      }
    ): IdeaIndexEntry[] {
      const queryText = options.query ?? "";
      const filtered = entries.filter((entry) => {
        if (options.poolId && entry.poolId !== options.poolId) {
          return false;
        }

        if (!this.matchesQuery(entry.searchText, queryText)) {
          return false;
        }

        if (options.status && !entry.markers[options.status]) {
          return false;
        }

        return true;
      });

      const sort = options.sort ?? "updatedAt-desc";
      return [...filtered].sort((a, b) => compareBySort(a, b, sort));
    }
  };
}
