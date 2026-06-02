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

import { hasIdeaSnippetRefs, type Idea } from "../../domain/idea/idea-model";
import { createIndexStore } from "../../storage/index-store";

export type IdeaBrowseScope = "pool" | "global-status";
export type IdeaBrowseStatus = "all" | "referenced" | "file-created" | "with-markers";
export type IdeaBrowseContentFilter = "all" | "text" | "link" | "image" | "video";
export type IdeaBrowseSort = "updated-desc" | "created-desc" | "title-asc";

interface IdeaBrowseQueryBaseInput {
  ideas: Idea[];
  query: string;
  status: IdeaBrowseStatus;
  contentFilter: unknown;
  sort: IdeaBrowseSort;
}

export interface PoolIdeaBrowseQueryInput extends IdeaBrowseQueryBaseInput {
  scope: "pool";
  poolId: string;
}

export interface GlobalStatusIdeaBrowseQueryInput extends IdeaBrowseQueryBaseInput {
  scope: "global-status";
}

export type IdeaBrowseQueryInput = PoolIdeaBrowseQueryInput | GlobalStatusIdeaBrowseQueryInput;

export interface IdeaBrowseQueryResult {
  normalizedContentFilter: IdeaBrowseContentFilter;
  scopedIdeas: Idea[];
  statusMatchedIdeas: Idea[];
  visibleIdeas: Idea[];
}

export interface IdeaBrowseQueryService {
  queryIdeas(input: IdeaBrowseQueryInput): IdeaBrowseQueryResult;
}

function cloneIdea(idea: Idea): Idea {
  return {
    ...idea,
    tags: [...idea.tags],
    attachmentPaths: [...idea.attachmentPaths],
    snippetRefs: idea.snippetRefs.map((snippetRef) => ({ ...snippetRef }))
  };
}

function hasBodyContent(idea: Pick<Idea, "body">): boolean {
  return idea.body.trim().length > 0;
}

function hasAttachment(idea: Pick<Idea, "attachmentPaths">): boolean {
  return idea.attachmentPaths.some((path) => path.trim().length > 0);
}

function hasTrimmedContent(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveIdeaBrowseContentFilterType(idea: Idea): IdeaBrowseContentFilter | "empty" {
  if (idea.contentType === "text") {
    return hasBodyContent(idea) ? "text" : "empty";
  }

  if (idea.contentType === "link") {
    return hasTrimmedContent(idea.sourceUrl) || hasBodyContent(idea) ? "link" : "empty";
  }

  if (idea.contentType === "image") {
    return hasAttachment(idea) ? "image" : "empty";
  }

  if (idea.contentType === "video") {
    return hasAttachment(idea) ? "video" : "empty";
  }

  if (hasAttachment(idea)) {
    return "image";
  }

  if (hasTrimmedContent(idea.sourceUrl)) {
    return "link";
  }

  if (hasBodyContent(idea)) {
    return "text";
  }

  return "empty";
}

export function normalizeIdeaBrowseContentFilter(contentFilter: unknown): IdeaBrowseContentFilter {
  if (contentFilter === "text" || contentFilter === "link" || contentFilter === "image" || contentFilter === "video") {
    return contentFilter;
  }

  return "all";
}

export function matchIdeaBrowseStatus(idea: Idea, status: IdeaBrowseStatus): boolean {
  if (status === "all") {
    return true;
  }

  if (status === "referenced") {
    return hasIdeaSnippetRefs(idea);
  }

  if (status === "file-created") {
    return idea.fileCreated;
  }

  return hasIdeaSnippetRefs(idea) || idea.fileCreated;
}

export function compareIdeaBrowseOrder(left: Idea, right: Idea, sort: IdeaBrowseSort): number {
  if (sort === "created-desc") {
    return right.createdAt.localeCompare(left.createdAt);
  }

  if (sort === "title-asc") {
    return left.title.localeCompare(right.title, "zh-Hans-CN");
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

export function createIdeaBrowseQueryService(indexStore = createIndexStore()): IdeaBrowseQueryService {
  return {
    queryIdeas(input) {
      const normalizedContentFilter = normalizeIdeaBrowseContentFilter(input.contentFilter);
      const scopedIdeas = input.scope === "global-status"
        ? input.ideas.map(cloneIdea)
        : input.ideas.filter((idea) => idea.poolId === input.poolId).map(cloneIdea);

      const statusMatchedIdeas = scopedIdeas.filter((idea) => matchIdeaBrowseStatus(idea, input.status));
      const visibleIdeas = statusMatchedIdeas
        .filter((idea) => indexStore.matchesQuery(indexStore.buildSearchText(idea), input.query))
        .filter((idea) => normalizedContentFilter === "all" || resolveIdeaBrowseContentFilterType(idea) === normalizedContentFilter)
        .sort((left, right) => compareIdeaBrowseOrder(left, right, input.sort));

      return {
        normalizedContentFilter,
        scopedIdeas,
        statusMatchedIdeas,
        visibleIdeas
      };
    }
  };
}
