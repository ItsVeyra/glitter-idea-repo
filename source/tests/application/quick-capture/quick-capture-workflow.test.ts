/**
 * 保护快速捕获工作流的保存、建档与池状态编排相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import { PersistCapturedIdeaError } from "../../../src/application/quick-capture/persist-captured-idea";
import { createQuickCaptureWorkflow } from "../../../src/application/quick-capture/quick-capture-workflow";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createQuickCaptureWorkflow", () => {
  it("saves global link capture with link-import source type", async () => {
    const createIdea = vi.fn(async () => ({ id: "idea-1", title: "Link", body: "https://example.com", sourceUrl: "https://example.com", attachmentPaths: [] }));
    const workflow = createQuickCaptureWorkflow({
      ideaService: {
        createIdea,
        markFileCreated: vi.fn(async () => undefined)
      } as any,
      poolService: {
        listPools: vi.fn(async () => []),
        ensureDefaultPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" })),
        getPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" }))
      } as any,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "Glitter/Link.md"),
        buildIdeaFileContent: vi.fn(() => "")
      } as any,
      vault: {
        create: vi.fn(async () => undefined)
      } as any
    });

    await workflow.saveGlobalDraft({
      title: "Link",
      body: "https://example.com",
      contentType: "link",
      sourceUrl: "https://example.com",
      attachmentPaths: [],
      createFileChecked: false,
      poolId: "pool-default",
      tags: []
    });

    expect(createIdea).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "link-import",
        sourceUrl: "https://example.com"
      })
    );
  });

  it("creates a markdown file when global capture requests create-file", async () => {
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

    const workflow = createQuickCaptureWorkflow({
      ideaService: {
        createIdea,
        markFileCreated
      } as any,
      poolService: {
        listPools: vi.fn(async () => []),
        ensureDefaultPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" })),
        getPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" }))
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

    await workflow.saveGlobalDraft({
      title: "Captured idea",
      body: "Body",
      contentType: "text",
      attachmentPaths: ["Glitter/image.png"],
      createFileChecked: true,
      poolId: "pool-default",
      tags: []
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

  it("wraps file creation failures with the shared persistence error", async () => {
    const workflow = createQuickCaptureWorkflow({
      ideaService: {
        createIdea: vi.fn(async () => ({
          id: "idea-1",
          title: "Captured idea",
          body: "Body",
          attachmentPaths: []
        })),
        markFileCreated: vi.fn(async () => undefined)
      } as any,
      poolService: {
        listPools: vi.fn(async () => []),
        ensureDefaultPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" })),
        getPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" }))
      } as any,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "Glitter/Captured idea.md"),
        buildIdeaFileContent: vi.fn(() => "# Captured idea")
      } as any,
      vault: {
        create: vi.fn(async () => {
          throw new Error("vault create failed");
        })
      } as any
    });

    await expect(
      workflow.saveGlobalDraft({
        title: "Captured idea",
        body: "Body",
        contentType: "text",
        attachmentPaths: [],
        createFileChecked: true,
        poolId: "pool-default",
        tags: []
      })
    ).rejects.toMatchObject({
      name: PersistCapturedIdeaError.name,
      stage: "create-file"
    });
  });

  it("surfaces markFileCreated failures with a distinct shared persistence stage", async () => {
    const workflow = createQuickCaptureWorkflow({
      ideaService: {
        createIdea: vi.fn(async () => ({
          id: "idea-1",
          title: "Captured idea",
          body: "Body",
          attachmentPaths: []
        })),
        markFileCreated: vi.fn(async () => {
          throw new Error("mark file created failed");
        })
      } as any,
      poolService: {
        listPools: vi.fn(async () => []),
        ensureDefaultPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" })),
        getPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" }))
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

    await expect(
      workflow.saveGlobalDraft({
        title: "Captured idea",
        body: "Body",
        contentType: "text",
        attachmentPaths: [],
        createFileChecked: true,
        poolId: "pool-default",
        tags: []
      })
    ).rejects.toMatchObject({
      name: PersistCapturedIdeaError.name,
      stage: "mark-file-created"
    });
  });

  it("lists global pool options from runtime pool service", async () => {
    const workflow = createQuickCaptureWorkflow({
      ideaService: {
        createIdea: vi.fn(async () => undefined),
        markFileCreated: vi.fn(async () => undefined)
      } as any,
      poolService: {
        listPools: vi.fn(async () => [
          { id: "pool-default", name: "默认池" },
          { id: "pool-lab", name: "实验池" }
        ]),
        ensureDefaultPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" })),
        getPool: vi.fn(async () => null)
      } as any,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "Glitter/x.md"),
        buildIdeaFileContent: vi.fn(() => "")
      } as any,
      vault: {
        create: vi.fn(async () => undefined)
      } as any
    });

    await expect(workflow.listGlobalPoolOptions()).resolves.toEqual([
      { id: "pool-default", label: "默认池" },
      { id: "pool-lab", label: "实验池" }
    ]);
  });

  it("falls back to the default pool when given poolId does not exist", async () => {
    const createIdea = vi.fn(async () => ({
      id: "idea-1",
      title: "Captured idea",
      body: "Body",
      attachmentPaths: []
    }));

    const workflow = createQuickCaptureWorkflow({
      ideaService: {
        createIdea,
        markFileCreated: vi.fn(async () => undefined)
      } as any,
      poolService: {
        listPools: vi.fn(async () => []),
        ensureDefaultPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" })),
        getPool: vi.fn(async () => null)
      } as any,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "Glitter/x.md"),
        buildIdeaFileContent: vi.fn(() => "")
      } as any,
      vault: {
        create: vi.fn(async () => undefined)
      } as any
    });

    await workflow.saveGlobalDraft({
      title: "Captured idea",
      body: "Body",
      contentType: "text",
      attachmentPaths: [],
      createFileChecked: false,
      poolId: "pool-missing",
      tags: []
    });

    expect(createIdea).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: "pool-default"
      })
    );
  });

  it("uses workflow-backed global selected pool state across reads and updates", async () => {
    const workflow = createQuickCaptureWorkflow({
      ideaService: {
        createIdea: vi.fn(async () => undefined),
        markFileCreated: vi.fn(async () => undefined)
      } as any,
      poolService: {
        listPools: vi.fn(async () => [
          { id: "pool-default", name: "默认池" },
          { id: "pool-research", name: "调研池" }
        ]),
        ensureDefaultPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" })),
        getPool: vi.fn(async () => null)
      } as any,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "Glitter/x.md"),
        buildIdeaFileContent: vi.fn(() => "")
      } as any,
      vault: {
        create: vi.fn(async () => undefined)
      } as any
    });

    expect(workflow.getGlobalSelectedPoolState()).toEqual({
      id: "pool-default",
      label: "默认池"
    });

    await expect(workflow.setGlobalSelectedPoolState("pool-research")).resolves.toEqual({
      id: "pool-research",
      label: "调研池"
    });

    expect(workflow.getGlobalSelectedPoolState()).toEqual({
      id: "pool-research",
      label: "调研池"
    });
  });

  it("keeps previous label when selected pool cannot be resolved", async () => {
    let listShouldThrow = false;
    const workflow = createQuickCaptureWorkflow({
      ideaService: {
        createIdea: vi.fn(async () => undefined),
        markFileCreated: vi.fn(async () => undefined)
      } as any,
      poolService: {
        listPools: vi.fn(async () => {
          if (listShouldThrow) {
            throw new Error("pool list failed");
          }
          return [
            { id: "pool-default", name: "默认池" },
            { id: "pool-product", name: "产品池" }
          ];
        }),
        ensureDefaultPool: vi.fn(async () => ({ id: "pool-default", name: "默认池" })),
        getPool: vi.fn(async () => null)
      } as any,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "Glitter/x.md"),
        buildIdeaFileContent: vi.fn(() => "")
      } as any,
      vault: {
        create: vi.fn(async () => undefined)
      } as any
    });

    await workflow.setGlobalSelectedPoolState("pool-product");
    listShouldThrow = true;

    await expect(workflow.setGlobalSelectedPoolState("pool-missing")).resolves.toEqual({
      id: "pool-missing",
      label: "产品池"
    });
    expect(workflow.getGlobalSelectedPoolState()).toEqual({
      id: "pool-missing",
      label: "产品池"
    });
  });
});
