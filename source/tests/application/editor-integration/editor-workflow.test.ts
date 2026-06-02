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
 * 保护编辑器工作流的选区建灵感、引用与落盘编排相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import { createEditorWorkflow } from "../../../src/application/editor-integration/editor-workflow";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createEditorWorkflow", () => {
  it("creates an idea from selection into the default pool when no explicit context exists", async () => {
    const createIdea = vi.fn(async (input) => ({ id: "idea-1", ...input }));
    const workflow = createEditorWorkflow({
      poolService: {
        ensureDefaultPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" }))
      } as any,
      ideaService: {
        createIdea,
        getIdea: vi.fn(),
        recordSnippetRef: vi.fn()
      } as any
    });

    await workflow.createIdeaFromSelection({
      selection: "这是一段正文选区"
    });

    expect(createIdea).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: "pool-default",
        sourceType: "selection"
      })
    );
  });

  it("inserts a reference-style callout snippet and records the reference", async () => {
    const replaceSelection = vi.fn();
    const recordSnippetRef = vi.fn(async () => undefined);
    const workflow = createEditorWorkflow({
      poolService: {
        ensureDefaultPool: vi.fn(),
        getPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" }))
      } as any,
      ideaService: {
        createIdea: vi.fn(),
        getIdea: vi.fn(async () => ({
          id: "idea-1",
          title: "灵感标题",
          body: "灵感正文",
          sourceUrl: "https://example.com",
          contentType: "text",
          attachmentPaths: ["Glitter/images/默认池/image.png"],
          poolId: "pool-default",
          tags: ["tagA", "tagB"]
        })),
        recordSnippetRef
      } as any
    });

    await workflow.insertIdeaReference({
      ideaId: "idea-1",
      editor: { replaceSelection } as any,
      notePath: "Welcome.md",
      emoji: "🔖"
    });

    expect(replaceSelection).toHaveBeenCalledWith(expect.stringContaining("> [!glitter-idea] [\\[引用灵感\\] 灵感标题](glitter://idea/idea-1)"));
    expect(replaceSelection).toHaveBeenCalledWith(expect.stringContaining("> 灵感正文"));
    expect(replaceSelection).toHaveBeenCalledWith(expect.stringContaining("> ![[Glitter/images/默认池/image.png]]"));
    expect(replaceSelection).toHaveBeenCalledWith(expect.stringContaining("> #tagA #tagB"));
    expect(replaceSelection).toHaveBeenCalledWith(expect.stringContaining("> ✨ 来自 Glitter · 默认池"));
    expect(replaceSelection).not.toHaveBeenCalledWith(expect.stringContaining("<div class=\"glitter-idea-snippet\""));
    expect(recordSnippetRef).toHaveBeenCalledWith(
      "idea-1",
      expect.objectContaining({
        notePath: "Welcome.md"
      })
    );
  });

  it("throws when inserting a reference for a missing idea", async () => {
    const replaceSelection = vi.fn();
    const recordSnippetRef = vi.fn(async () => undefined);
    const workflow = createEditorWorkflow({
      poolService: {
        ensureDefaultPool: vi.fn()
      } as any,
      ideaService: {
        createIdea: vi.fn(),
        getIdea: vi.fn(async () => null),
        recordSnippetRef
      } as any
    });

    await expect(
      workflow.insertIdeaReference({
        ideaId: "idea-missing",
        editor: { replaceSelection } as any,
        notePath: "Welcome.md",
        emoji: "🔖"
      })
    ).rejects.toThrow("Idea not found: idea-missing");

    expect(replaceSelection).not.toHaveBeenCalled();
    expect(recordSnippetRef).not.toHaveBeenCalled();
  });

  it("resolves snippet target back to idea and pool ids", async () => {
    const workflow = createEditorWorkflow({
      poolService: {
        ensureDefaultPool: vi.fn()
      } as any,
      ideaService: {
        createIdea: vi.fn(),
        getIdea: vi.fn(async () => ({
          id: "idea-1",
          poolId: "pool-product"
        })),
        recordSnippetRef: vi.fn()
      } as any
    });

    await expect(workflow.resolveSnippetTarget("idea-1")).resolves.toEqual({
      ideaId: "idea-1",
      poolId: "pool-product"
    });
  });
});
