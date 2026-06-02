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
 * 保护灵感仓储的读写与查询边界相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import { createPluginDataStore } from "../../../src/storage/plugin-data-store";
import type { Idea } from "../../../src/domain/idea/idea-model";
import type { Pool } from "../../../src/domain/pool/pool-model";
import { createIdeaRepository } from "../../../src/domain/idea/idea-repository";

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
function createMemoryIdeaStore() {
  let persisted: unknown = {
    glitterSettings: {
      enableQuickCapture: true
    },
    glitterSnapshot: {
      version: 1,
      ideas: [],
      pools: [],
      lastSelectedPoolId: null
    }
  };

  return createPluginDataStore<Idea, Pool>({
    async loadData() {
      return persisted;
    },
    async saveData(data) {
      persisted = data;
    }
  });
}

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createIdeaRepository", () => {
  it("creates and reads back an idea", async () => {
    const repository = createIdeaRepository(createMemoryIdeaStore());
    const idea = await repository.create({
      title: "Test idea",
      body: "Hello",
      contentType: "text",
      sourceType: "manual",
      tags: []
    });

    const found = await repository.getById(idea.id);
    expect(found?.title).toBe("Test idea");
    expect(found?.inbox).toBe(true);
  });

  it("does not retain caller-owned tags array on create", async () => {
    const repository = createIdeaRepository(createMemoryIdeaStore());
    const tags = ["initial"];

    const idea = await repository.create({
      title: "Tag safety",
      body: "Hello",
      contentType: "text",
      sourceType: "manual",
      tags
    });

    tags.push("external-mutation");

    const found = await repository.getById(idea.id);
    expect(found?.tags).toEqual(["initial"]);
  });

  it("does not allow mutations on retrieved ideas to alter repository state", async () => {
    const repository = createIdeaRepository(createMemoryIdeaStore());
    const created = await repository.create({
      title: "Immutable boundary",
      body: "Body",
      contentType: "text",
      sourceType: "manual",
      tags: ["one"]
    });

    const found = await repository.getById(created.id);
    if (!found) {
      throw new Error("expected created idea to exist");
    }

    found.title = "mutated outside";
    found.tags.push("outside-tag");
    found.snippetRefs.push({ notePath: "x.md", blockId: "b1", insertedAt: "2026-01-01T00:00:00.000Z" });

    const list = await repository.list();
    list[0].body = "changed from list";
    list[0].tags.push("list-tag");

    const persisted = await repository.getById(created.id);
    expect(persisted?.title).toBe("Immutable boundary");
    expect(persisted?.body).toBe("Body");
    expect(persisted?.tags).toEqual(["one"]);
    expect(persisted?.snippetRefs).toEqual([]);
  });

  it("keeps marker fields coexisting when file and snippet refs are recorded", async () => {
    const repository = createIdeaRepository(createMemoryIdeaStore());
    const created = await repository.create({
      title: "Marker idea",
      body: "Body",
      contentType: "text",
      sourceType: "manual",
      tags: []
    });

    await repository.recordSnippetRef(created.id, {
      notePath: "note.md",
      blockId: "^block-1",
      insertedAt: "2026-01-01T00:00:00.000Z"
    });
    await repository.markFileCreated(created.id, "Glitter/Marker idea.md");

    const updated = await repository.getById(created.id);
    expect(updated?.fileCreated).toBe(true);
    expect(updated?.filePath).toBe("Glitter/Marker idea.md");
    expect(updated?.snippetRefs).toEqual([
      {
        notePath: "note.md",
        blockId: "^block-1",
        insertedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
  });

  it("moves many ideas in batch without touching unmatched ideas", async () => {
    const repository = createIdeaRepository(createMemoryIdeaStore());
    const first = await repository.create({
      title: "First",
      body: "",
      contentType: "text",
      sourceType: "manual",
      tags: []
    });
    const second = await repository.create({
      title: "Second",
      body: "",
      contentType: "text",
      sourceType: "manual",
      tags: []
    });
    const third = await repository.create({
      title: "Third",
      body: "",
      contentType: "text",
      sourceType: "manual",
      tags: []
    });

    const moved = await repository.moveMany([first.id, third.id], "pool-writing");

    expect(moved.map((idea) => idea.id)).toEqual([first.id, third.id]);
    expect((await repository.getById(first.id))?.poolId).toBe("pool-writing");
    expect((await repository.getById(third.id))?.poolId).toBe("pool-writing");
    expect((await repository.getById(second.id))?.poolId).not.toBe("pool-writing");
  });

  it("deletes an idea without mutating remaining ideas", async () => {
    const repository = createIdeaRepository(createMemoryIdeaStore());
    const first = await repository.create({
      title: "First",
      body: "One",
      contentType: "text",
      sourceType: "manual",
      tags: []
    });
    const second = await repository.create({
      title: "Second",
      body: "Two",
      contentType: "text",
      sourceType: "manual",
      tags: []
    });

    await repository.delete(first.id);

    expect(await repository.getById(first.id)).toBeNull();
    expect((await repository.list()).map((idea) => idea.id)).toEqual([second.id]);
  });

  it("allows clearing sourceUrl explicitly during update", async () => {
    const repository = createIdeaRepository(createMemoryIdeaStore());
    const created = await repository.create({
      title: "Source url idea",
      body: "",
      contentType: "link",
      sourceType: "link-import",
      sourceUrl: "https://example.com/original",
      tags: []
    });

    const updated = await repository.update(created.id, {
      sourceUrl: undefined
    });

    expect(updated?.sourceUrl).toBeUndefined();
    expect((await repository.getById(created.id))?.sourceUrl).toBeUndefined();
  });

  it("records manual editedAt only for explicit idea edits", async () => {
    vi.useFakeTimers();
    try {
      const repository = createIdeaRepository(createMemoryIdeaStore());
      vi.setSystemTime(new Date("2026-04-18T10:00:00.000Z"));
      const created = await repository.create({
        title: "Editable idea",
        body: "First body",
        contentType: "text",
        sourceType: "manual",
        tags: []
      });

      vi.setSystemTime(new Date("2026-04-18T11:22:33.000Z"));
      const edited = await repository.update(created.id, {
        body: "Second body",
        markEdited: true
      });

      vi.setSystemTime(new Date("2026-04-18T12:30:00.000Z"));
      await repository.markFileCreated(created.id, "Glitter/Editable idea.md");
      vi.setSystemTime(new Date("2026-04-18T13:40:00.000Z"));
      await repository.recordSnippetRef(created.id, {
        notePath: "note.md",
        insertedAt: "2026-04-18T13:40:00.000Z"
      });

      const found = await repository.getById(created.id);
      expect(created.editedAt).toBeUndefined();
      expect(edited?.editedAt).toBe("2026-04-18T11:22:33.000Z");
      expect(found?.editedAt).toBe("2026-04-18T11:22:33.000Z");
      expect(found?.updatedAt).toBe("2026-04-18T13:40:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});
