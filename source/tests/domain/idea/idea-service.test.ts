/**
 * 保护灵感服务的创建、更新与引用语义相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { createIdeaRepository } from "../../../src/domain/idea/idea-repository";
import { createIdeaService } from "../../../src/domain/idea/idea-service";
import { createIndexStore } from "../../../src/storage/index-store";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createIdeaService", () => {
  it("creates a text idea with text content type", async () => {
    const service = createIdeaService();

    const idea = await service.createIdea({
      title: "Text idea",
      body: "Captured thought",
      contentType: "text",
      sourceType: "quick-capture",
      tags: []
    });

    expect(idea.contentType).toBe("text");
  });

  it("creates a link idea with source url", async () => {
    const service = createIdeaService();

    const idea = await service.createIdea({
      title: "Link idea",
      body: "Imported link",
      contentType: "link",
      sourceType: "link-import",
      sourceUrl: "https://example.com",
      tags: []
    });

    expect(idea.sourceUrl).toBe("https://example.com");
  });

  it("lists created ideas", async () => {
    const service = createIdeaService();

    const firstIdea = await service.createIdea({
      title: "First idea",
      body: "Body one",
      contentType: "text",
      sourceType: "quick-capture",
      tags: []
    });

    const secondIdea = await service.createIdea({
      title: "Second idea",
      body: "Body two",
      contentType: "text",
      sourceType: "quick-capture",
      tags: []
    });

    const ideas = await service.listIdeas();

    expect(ideas).toHaveLength(2);
    expect(ideas.map((idea) => idea.id)).toEqual([firstIdea.id, secondIdea.id]);
  });

  it("gets an idea by id using getIdea", async () => {
    const service = createIdeaService();

    const created = await service.createIdea({
      title: "Lookup idea",
      body: "Lookup body",
      contentType: "text",
      sourceType: "quick-capture",
      tags: []
    });

    const idea = await service.getIdea(created.id);

    expect(idea?.id).toBe(created.id);
    expect(idea?.title).toBe("Lookup idea");
  });

  it("queries ideas through the index store and preserves listByPool as the focused pool helper", async () => {
    const repository = createIdeaRepository();
    const indexStore = createIndexStore();
    const service = createIdeaService(repository, indexStore);

    const inboxIdea = await service.createIdea({
      title: "Alpha note",
      body: "Contains search text",
      contentType: "text",
      sourceType: "quick-capture",
      tags: ["search-hit"],
      poolId: "pool-a"
    });
    const quotedIdea = await service.createIdea({
      title: "Beta note",
      body: "Other body",
      contentType: "text",
      sourceType: "quick-capture",
      tags: [],
      poolId: "pool-a"
    });
    const fileIdea = await service.createIdea({
      title: "Gamma note",
      body: "Contains search text too",
      contentType: "text",
      sourceType: "quick-capture",
      tags: [],
      poolId: "pool-b"
    });

    await repository.update(quotedIdea.id, { quoted: true, inbox: false });
    await service.markFileCreated(fileIdea.id, "Glitter/Gamma note.md");

    const poolIdeas = await service.listByPool("pool-a");
    const queried = await service.queryIdeas({
      poolId: "pool-a",
      text: "search-hit",
      status: "inbox",
      sort: "createdAt-asc"
    });

    expect(poolIdeas.map((idea) => idea.id)).toEqual([inboxIdea.id, quotedIdea.id]);
    expect(queried.map((idea) => idea.id)).toEqual([inboxIdea.id]);
  });

  it("deletes an idea via service", async () => {
    const service = createIdeaService();

    const firstIdea = await service.createIdea({
      title: "First idea",
      body: "Body one",
      contentType: "text",
      sourceType: "quick-capture",
      tags: []
    });
    await service.createIdea({
      title: "Second idea",
      body: "Body two",
      contentType: "text",
      sourceType: "quick-capture",
      tags: []
    });

    await service.deleteIdea(firstIdea.id);

    const ideas = await service.listIdeas();
    expect(ideas).toHaveLength(1);
    expect(ideas[0]?.title).toBe("Second idea");
    expect(await service.getIdea(firstIdea.id)).toBeNull();
  });
});
