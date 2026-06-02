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
 * 保护快速记录共享持久化辅助的建档分支与错误包装行为，避免首用与全局流程后续对齐时回退。
 */

import { describe, expect, it, vi } from "vitest";
import {
  PersistCapturedIdeaError,
  persistCapturedIdea
} from "../../../src/application/quick-capture/persist-captured-idea";

describe("persistCapturedIdea", () => {
  it("creates markdown file only when createFileChecked is true", async () => {
    const createIdea = vi.fn(async () => ({
      id: "idea-1",
      title: "Captured idea",
      body: "Body",
      sourceUrl: "https://example.com/article",
      attachmentPaths: ["Glitter/image.png"]
    }));
    const markFileCreated = vi.fn(async () => undefined);
    const ensureFolder = vi.fn(async () => undefined);
    const createUniquePath = vi.fn(async () => "记录层/Glitter/Captured idea.md");
    const buildIdeaFileContent = vi.fn(() => "# Captured idea");
    const create = vi.fn(async () => undefined);

    await persistCapturedIdea({
      input: {
        title: "Captured idea",
        body: "Body",
        contentType: "text",
        sourceType: "quick-capture",
        sourceUrl: "https://example.com/article",
        attachmentPaths: ["Glitter/image.png"],
        createFileChecked: true,
        poolId: "pool-default",
        tags: ["captured"]
      },
      ideaService: {
        createIdea,
        markFileCreated
      } as any,
      vaultFileStore: {
        ensureFolder,
        createUniquePath,
        buildIdeaFileContent
      } as any,
      vault: {
        create
      } as any,
      resolveFileStorageDirectory: () => "记录层/Glitter"
    });

    expect(createIdea).toHaveBeenCalledWith({
      title: "Captured idea",
      body: "Body",
      contentType: "text",
      sourceType: "quick-capture",
      sourceUrl: "https://example.com/article",
      attachmentPaths: ["Glitter/image.png"],
      poolId: "pool-default",
      tags: ["captured"]
    });
    expect(ensureFolder).toHaveBeenCalledWith("记录层/Glitter");
    expect(createUniquePath).toHaveBeenCalledWith("记录层/Glitter", "Captured idea", ".md");
    expect(buildIdeaFileContent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "idea-1",
        title: "Captured idea"
      })
    );
    expect(create).toHaveBeenCalledWith("记录层/Glitter/Captured idea.md", "# Captured idea");
    expect(markFileCreated).toHaveBeenCalledWith("idea-1", "记录层/Glitter/Captured idea.md");
  });

  it("skips file creation when createFileChecked is false", async () => {
    const createIdea = vi.fn(async () => ({
      id: "idea-1",
      title: "Captured idea",
      body: "Body",
      attachmentPaths: []
    }));
    const markFileCreated = vi.fn(async () => undefined);
    const ensureFolder = vi.fn(async () => undefined);
    const createUniquePath = vi.fn(async () => "Glitter/Captured idea.md");
    const buildIdeaFileContent = vi.fn(() => "# Captured idea");
    const create = vi.fn(async () => undefined);
    const resolveFileStorageDirectory = vi.fn(() => "记录层/Glitter");

    await persistCapturedIdea({
      input: {
        title: "Captured idea",
        body: "Body",
        contentType: "text",
        sourceType: "quick-capture",
        attachmentPaths: [],
        createFileChecked: false,
        poolId: "pool-default",
        tags: []
      },
      ideaService: {
        createIdea,
        markFileCreated
      } as any,
      vaultFileStore: {
        ensureFolder,
        createUniquePath,
        buildIdeaFileContent
      } as any,
      vault: {
        create
      } as any,
      resolveFileStorageDirectory
    });

    expect(createIdea).toHaveBeenCalledTimes(1);
    expect(resolveFileStorageDirectory).not.toHaveBeenCalled();
    expect(ensureFolder).not.toHaveBeenCalled();
    expect(createUniquePath).not.toHaveBeenCalled();
    expect(buildIdeaFileContent).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(markFileCreated).not.toHaveBeenCalled();
  });

  it("wraps createIdea failures with create-idea stage", async () => {
    const cause = new Error("create failed");

    try {
      await persistCapturedIdea({
        input: {
          title: "Captured idea",
          body: "Body",
          contentType: "text",
          sourceType: "quick-capture",
          attachmentPaths: [],
          createFileChecked: false,
          poolId: "pool-default",
          tags: []
        },
        ideaService: {
          createIdea: vi.fn(async () => {
            throw cause;
          }),
          markFileCreated: vi.fn(async () => undefined)
        } as any,
        vaultFileStore: {
          ensureFolder: vi.fn(async () => undefined),
          createUniquePath: vi.fn(async () => "Glitter/Captured idea.md"),
          buildIdeaFileContent: vi.fn(() => "# Captured idea")
        } as any,
        vault: {
          create: vi.fn(async () => undefined)
        } as any
      });

      throw new Error("Expected persistCapturedIdea to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PersistCapturedIdeaError);
      expect(error).toMatchObject({
        stage: "create-idea",
        cause
      });
    }
  });

  it("wraps file creation failures with create-file stage", async () => {
    const cause = new Error("create file failed");

    try {
      await persistCapturedIdea({
        input: {
          title: "Captured idea",
          body: "Body",
          contentType: "text",
          sourceType: "quick-capture",
          attachmentPaths: [],
          createFileChecked: true,
          poolId: "pool-default",
          tags: []
        },
        ideaService: {
          createIdea: vi.fn(async () => ({
            id: "idea-1",
            title: "Captured idea",
            body: "Body",
            attachmentPaths: []
          })),
          markFileCreated: vi.fn(async () => undefined)
        } as any,
        vaultFileStore: {
          ensureFolder: vi.fn(async () => undefined),
          createUniquePath: vi.fn(async () => "Glitter/Captured idea.md"),
          buildIdeaFileContent: vi.fn(() => "# Captured idea")
        } as any,
        vault: {
          create: vi.fn(async () => {
            throw cause;
          })
        } as any
      });

      throw new Error("Expected persistCapturedIdea to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PersistCapturedIdeaError);
      expect(error).toMatchObject({
        stage: "create-file",
        cause
      });
    }
  });

  it("wraps markFileCreated failures with mark-file-created stage", async () => {
    const cause = new Error("mark file created failed");

    try {
      await persistCapturedIdea({
        input: {
          title: "Captured idea",
          body: "Body",
          contentType: "text",
          sourceType: "quick-capture",
          attachmentPaths: [],
          createFileChecked: true,
          poolId: "pool-default",
          tags: []
        },
        ideaService: {
          createIdea: vi.fn(async () => ({
            id: "idea-1",
            title: "Captured idea",
            body: "Body",
            attachmentPaths: []
          })),
          markFileCreated: vi.fn(async () => {
            throw cause;
          })
        } as any,
        vaultFileStore: {
          ensureFolder: vi.fn(async () => undefined),
          createUniquePath: vi.fn(async () => "Glitter/Captured idea.md"),
          buildIdeaFileContent: vi.fn(() => "# Captured idea")
        } as any,
        vault: {
          create: vi.fn(async () => undefined)
        } as any
      });

      throw new Error("Expected persistCapturedIdea to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PersistCapturedIdeaError);
      expect(error).toMatchObject({
        stage: "mark-file-created",
        cause
      });
    }
  });
});
