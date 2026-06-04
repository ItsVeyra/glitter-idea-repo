import { describe, expect, it } from "vitest";
import {
  createIdeaBrowseQueryService,
  type GlobalStatusIdeaBrowseQueryInput,
  type PoolIdeaBrowseQueryInput
} from "../../../src/application/idea-query/idea-browse-query";
import type { Idea } from "../../../src/domain/idea/idea-model";

function buildIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: overrides.id ?? "idea-1",
    title: overrides.title ?? "Idea",
    body: overrides.body ?? "",
    contentType: overrides.contentType ?? "text",
    sourceType: overrides.sourceType ?? "manual",
    sourceUrl: overrides.sourceUrl,
    attachmentPaths: overrides.attachmentPaths ?? [],
    poolId: overrides.poolId ?? "pool-a",
    tags: overrides.tags ?? [],
    quoted: overrides.quoted ?? false,
    fileCreated: overrides.fileCreated ?? false,
    inbox: overrides.inbox ?? true,
    filePath: overrides.filePath,
    snippetRefs: overrides.snippetRefs ?? [],
    createdAt: overrides.createdAt ?? "2026-05-16T08:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-16T08:00:00.000Z",
    editedAt: overrides.editedAt
  };
}

function buildPoolInput(overrides: Partial<PoolIdeaBrowseQueryInput> = {}): PoolIdeaBrowseQueryInput {
  return {
    ideas: overrides.ideas ?? [],
    scope: "pool",
    poolId: overrides.poolId ?? "pool-a",
    query: overrides.query ?? "",
    status: overrides.status ?? "all",
    contentFilter: overrides.contentFilter ?? "all",
    sort: overrides.sort ?? "updated-desc"
  };
}

function buildGlobalStatusInput(
  overrides: Partial<GlobalStatusIdeaBrowseQueryInput> = {}
): GlobalStatusIdeaBrowseQueryInput {
  return {
    ideas: overrides.ideas ?? [],
    scope: "global-status",
    query: overrides.query ?? "",
    status: overrides.status ?? "all",
    contentFilter: overrides.contentFilter ?? "all",
    sort: overrides.sort ?? "updated-desc"
  };
}

describe("createIdeaBrowseQueryService", () => {
  it("filters pool-scoped ideas by query, marker status, content filter, and updated-desc sort", () => {
    const service = createIdeaBrowseQueryService();
    const plainText = buildIdea({
      id: "text",
      title: "Plain text idea",
      body: "match me",
      poolId: "pool-a",
      updatedAt: "2026-05-16T09:00:00.000Z"
    });
    const olderReferencedLink = buildIdea({
      id: "link-older",
      title: "Older linked idea",
      body: "match me earlier",
      contentType: "link",
      sourceUrl: "https://example.com/reference-older",
      poolId: "pool-a",
      snippetRefs: [{ notePath: "Reference-Older.md", insertedAt: "2026-05-16T08:20:00.000Z" }],
      updatedAt: "2026-05-16T09:30:00.000Z"
    });
    const referencedText = buildIdea({
      id: "text-ref",
      title: "Referenced text idea",
      body: "match me but keep me out of link results",
      contentType: "text",
      poolId: "pool-a",
      snippetRefs: [{ notePath: "Reference-Text.md", insertedAt: "2026-05-16T08:22:00.000Z" }],
      updatedAt: "2026-05-16T10:30:00.000Z"
    });
    const queryMissReferencedLink = buildIdea({
      id: "link-miss",
      title: "Filtered linked idea",
      body: "nothing to see here",
      contentType: "link",
      sourceUrl: "https://example.com/hidden",
      poolId: "pool-a",
      snippetRefs: [{ notePath: "Reference-Miss.md", insertedAt: "2026-05-16T08:25:00.000Z" }],
      updatedAt: "2026-05-16T11:00:00.000Z"
    });
    const referencedLink = buildIdea({
      id: "link",
      title: "Linked idea",
      body: "match me too",
      contentType: "link",
      sourceUrl: "https://example.com/reference",
      poolId: "pool-a",
      snippetRefs: [{ notePath: "Reference.md", insertedAt: "2026-05-16T08:30:00.000Z" }],
      updatedAt: "2026-05-16T10:00:00.000Z"
    });
    const otherPoolMarked = buildIdea({
      id: "other",
      title: "Other pool",
      body: "match me three",
      poolId: "pool-b",
      fileCreated: true,
      filePath: "Glitter/Other.md",
      updatedAt: "2026-05-16T12:00:00.000Z"
    });

    const result = service.queryIdeas(
      buildPoolInput({
        ideas: [plainText, olderReferencedLink, referencedText, queryMissReferencedLink, referencedLink, otherPoolMarked],
        scope: "pool",
        poolId: "pool-a",
        query: "match",
        status: "referenced",
        contentFilter: "link",
        sort: "updated-desc"
      })
    );

    expect(result.normalizedContentFilter).toBe("link");
    expect(result.scopedIdeas.map((idea) => idea.id)).toEqual(["text", "link-older", "text-ref", "link-miss", "link"]);
    expect(result.statusMatchedIdeas.map((idea) => idea.id)).toEqual(["link-older", "text-ref", "link-miss", "link"]);
    expect(result.visibleIdeas.map((idea) => idea.id)).toEqual(["link", "link-older"]);
  });

  it("uses the required poolId contract to scope pool queries to one pool only", () => {
    const service = createIdeaBrowseQueryService();
    const poolALink = buildIdea({
      id: "pool-a-link",
      title: "Pool A link",
      body: "shared referenced text",
      contentType: "link",
      sourceUrl: "https://example.com/a",
      poolId: "pool-a",
      snippetRefs: [{ notePath: "Pool-A.md", insertedAt: "2026-05-16T08:40:00.000Z" }]
    });
    const poolBLink = buildIdea({
      id: "pool-b-link",
      title: "Pool B link",
      body: "shared referenced text",
      contentType: "link",
      sourceUrl: "https://example.com/b",
      poolId: "pool-b",
      snippetRefs: [{ notePath: "Pool-B.md", insertedAt: "2026-05-16T08:41:00.000Z" }]
    });

    const result = service.queryIdeas(
      buildPoolInput({
        ideas: [poolALink, poolBLink],
        poolId: "pool-b",
        query: "shared",
        status: "referenced",
        contentFilter: "link",
        sort: "updated-desc"
      })
    );

    expect(result.scopedIdeas.map((idea) => idea.id)).toEqual(["pool-b-link"]);
    expect(result.statusMatchedIdeas.map((idea) => idea.id)).toEqual(["pool-b-link"]);
    expect(result.visibleIdeas.map((idea) => idea.id)).toEqual(["pool-b-link"]);
  });

  it("returns all marked ideas across pools for global-status scope and title-asc sort", () => {
    const service = createIdeaBrowseQueryService();
    const referenced = buildIdea({
      id: "beta",
      title: "Beta idea",
      poolId: "pool-a",
      snippetRefs: [{ notePath: "Folder/Beta.md", insertedAt: "2026-05-16T08:10:00.000Z" }]
    });
    const createdFile = buildIdea({
      id: "alpha",
      title: "Alpha idea",
      poolId: "pool-b",
      fileCreated: true,
      filePath: "Glitter/Alpha.md"
    });
    const clean = buildIdea({
      id: "gamma",
      title: "Gamma idea",
      poolId: "pool-b"
    });

    const result = service.queryIdeas(
      buildGlobalStatusInput({
        ideas: [referenced, createdFile, clean],
        status: "with-markers",
        contentFilter: "all",
        sort: "title-asc"
      })
    );

    expect(result.scopedIdeas.map((idea) => idea.id).sort()).toEqual(["alpha", "beta", "gamma"]);
    expect(result.statusMatchedIdeas.map((idea) => idea.id).sort()).toEqual(["alpha", "beta"]);
    expect(result.visibleIdeas.map((idea) => idea.title)).toEqual(["Alpha idea", "Beta idea"]);
  });

  it("normalizes unknown contentFilter to all and still classifies mixed ideas by actual content", () => {
    const service = createIdeaBrowseQueryService();
    const mixedText = buildIdea({
      id: "mixed-text",
      title: "Mixed text",
      contentType: "mixed",
      body: "plain body",
      createdAt: "2026-05-16T11:00:00.000Z"
    });
    const mixedLink = buildIdea({
      id: "mixed-link",
      title: "Mixed link",
      contentType: "mixed",
      body: "",
      sourceUrl: "https://example.com/mixed",
      createdAt: "2026-05-16T10:00:00.000Z"
    });
    const emptyMixed = buildIdea({
      id: "mixed-empty",
      title: "Mixed empty",
      contentType: "mixed",
      body: "",
      sourceUrl: "   ",
      createdAt: "2026-05-16T09:00:00.000Z"
    });

    const fallback = service.queryIdeas(
      buildPoolInput({
        ideas: [mixedText, mixedLink, emptyMixed],
        contentFilter: "unknown" as any,
        sort: "created-desc"
      })
    );
    const textOnly = service.queryIdeas(
      buildPoolInput({
        ideas: [mixedText, mixedLink, emptyMixed],
        contentFilter: "text",
        sort: "created-desc"
      })
    );

    expect(fallback.normalizedContentFilter).toBe("all");
    expect(fallback.visibleIdeas.map((idea) => idea.id)).toEqual(["mixed-text", "mixed-link", "mixed-empty"]);
    expect(textOnly.visibleIdeas.map((idea) => idea.id)).toEqual(["mixed-text"]);
  });
});
