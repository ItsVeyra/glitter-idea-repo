import { resolveIdeaCapabilityLayoutKind } from "../../domain/idea/idea-content-capabilities";
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

export function resolveIdeaBrowseContentFilterType(idea: Idea): IdeaBrowseContentFilter | "empty" {
  return resolveIdeaCapabilityLayoutKind(idea);
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
