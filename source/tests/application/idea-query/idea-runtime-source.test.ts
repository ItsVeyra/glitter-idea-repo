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

import { describe, expect, it, vi } from "vitest";
import { createIdeaRuntimeSource } from "../../../src/application/idea-query/idea-runtime-source";
import { createIdeaService } from "../../../src/domain/idea/idea-service";
import { serializeIdeaSnippet } from "../../../src/editor/snippet-serializer";

function createVault(noteContents: Record<string, string> = {}, existingPaths: string[] = []) {
  const existingPathSet = new Set(existingPaths);

  return {
    getAbstractFileByPath: vi.fn((path: string) => (existingPathSet.has(path) ? { path, extension: "md" } : null)),
    read: vi.fn(async (file: { path: string }) => noteContents[file.path] ?? "")
  } as any;
}

async function createTextIdea(ideaService: ReturnType<typeof createIdeaService>, overrides: Partial<{
  title: string;
  body: string;
  poolId: string;
}> = {}) {
  return ideaService.createIdea({
    title: overrides.title ?? "Idea",
    body: overrides.body ?? "Idea body",
    contentType: "text",
    sourceType: "manual",
    tags: [],
    poolId: overrides.poolId ?? "pool-default"
  });
}

describe("createIdeaRuntimeSource", () => {
  it("clears fileCreated when the linked file no longer exists", async () => {
    const ideaService = createIdeaService();
    const idea = await createTextIdea(ideaService, { title: "Missing file idea" });
    await ideaService.markFileCreated(idea.id, "Glitter/Missing.md");

    const runtimeSource = createIdeaRuntimeSource({
      ideaService,
      vault: createVault()
    });

    const ideas = await runtimeSource.listIdeas();
    const reconciledIdea = ideas.find((entry) => entry.id === idea.id);
    const persistedIdea = await ideaService.getIdea(idea.id);

    expect(reconciledIdea).toMatchObject({
      id: idea.id,
      fileCreated: false,
      filePath: undefined
    });
    expect(persistedIdea).toMatchObject({
      fileCreated: false,
      filePath: undefined
    });
  });

  it("keeps only the snippet refs backed by current note content and normalizes their notePath", async () => {
    const ideaService = createIdeaService();
    const idea = await createTextIdea(ideaService, {
      title: "Referenced idea",
      body: "Snippet body"
    });

    await ideaService.recordSnippetRef(idea.id, {
      notePath: " Folder/Reference.md ",
      insertedAt: "2026-05-16T08:00:00.000Z"
    });
    await ideaService.recordSnippetRef(idea.id, {
      notePath: " Folder/Reference.md ",
      insertedAt: "2026-05-16T08:01:00.000Z"
    });

    const notePath = "Folder/Reference.md";
    const runtimeSource = createIdeaRuntimeSource({
      ideaService,
      vault: createVault(
        {
          [notePath]: serializeIdeaSnippet({
            id: idea.id,
            title: idea.title,
            body: idea.body,
            contentType: idea.contentType,
            sourceUrl: idea.sourceUrl,
            attachmentPaths: idea.attachmentPaths,
            tags: idea.tags,
            emoji: "✨"
          })
        },
        [notePath]
      )
    });

    const ideas = await runtimeSource.listIdeas();
    const reconciledIdea = ideas.find((entry) => entry.id === idea.id);
    const persistedIdea = await ideaService.getIdea(idea.id);

    expect(reconciledIdea?.snippetRefs).toEqual([
      {
        notePath,
        insertedAt: "2026-05-16T08:00:00.000Z"
      }
    ]);
    expect(persistedIdea?.snippetRefs).toEqual([
      {
        notePath,
        insertedAt: "2026-05-16T08:00:00.000Z"
      }
    ]);
  });

  it("clears snippet refs when note contents no longer include the idea snippet", async () => {
    const ideaService = createIdeaService();
    const idea = await createTextIdea(ideaService, { title: "Removed reference idea" });

    await ideaService.recordSnippetRef(idea.id, {
      notePath: "Folder/Removed.md",
      insertedAt: "2026-05-16T08:30:00.000Z"
    });

    const runtimeSource = createIdeaRuntimeSource({
      ideaService,
      vault: createVault(
        {
          "Folder/Removed.md": "这里只剩普通正文"
        },
        ["Folder/Removed.md"]
      )
    });

    const ideas = await runtimeSource.listIdeas();
    const reconciledIdea = ideas.find((entry) => entry.id === idea.id);
    const persistedIdea = await ideaService.getIdea(idea.id);

    expect(reconciledIdea?.snippetRefs).toEqual([]);
    expect(persistedIdea?.snippetRefs).toEqual([]);
  });
});
