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
 * 保护首次使用工作流的首页与引导编排相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import { createFirstUseWorkflow } from "../../../src/application/first-use/first-use-workflow";
import { createIdeaService } from "../../../src/domain/idea/idea-service";
import { createPoolService } from "../../../src/domain/pool/pool-service";
import { DEFAULT_POOL_ID } from "../../../src/plugin/constants";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createFirstUseWorkflow", () => {
  it("stages first draft without persisting idea until pool commit", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted: () => undefined
    });

    await workflow.stageFirstIdeaDraft({
      title: "我的第一条灵感",
      body: "先暂存，不立即入库",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: false,
      tags: []
    });

    expect(workflow.hasPendingDraft()).toBe(true);
    await expect(ideaService.listIdeas()).resolves.toHaveLength(0);

    await workflow.commitDraftToExistingPool(DEFAULT_POOL_ID);

    expect(workflow.hasPendingDraft()).toBe(false);
    await expect(ideaService.listIdeas()).resolves.toEqual([
      expect.objectContaining({
        title: "我的第一条灵感",
        body: "先暂存，不立即入库",
        poolId: DEFAULT_POOL_ID
      })
    ]);
  });

  it("creates a new pool and commits the staged first idea only into that pool", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted: () => undefined
    });

    await workflow.stageFirstIdeaDraft({
      title: "新池首条",
      body: "创建新池后再保存",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: true,
      tags: ["first-use"]
    });

    const result = await workflow.commitDraftToNewPool({
      name: "写作池",
      description: "用于写作灵感",
      color: "#7e9bda"
    });

    expect(result.pool.name).toBe("写作池");
    expect(workflow.hasPendingDraft()).toBe(false);

    const ideas = await ideaService.listIdeas();
    expect(ideas).toHaveLength(1);
    expect(ideas[0]?.poolId).toBe(result.pool.id);

    const defaultPoolIdeas = await ideaService.listByPool(DEFAULT_POOL_ID);
    expect(defaultPoolIdeas).toHaveLength(0);
  });

  it("shows a newly created empty pool in populated home runtime", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted: () => undefined
    });

    await poolService.createPool({
      name: "写作池",
      color: "#7e9bda"
    });

    await expect(workflow.getHomeRuntimeState()).resolves.toEqual({
      mode: "populated",
      pools: [
        expect.objectContaining({
          name: "写作池",
          ideaCount: 0,
          isDefault: false,
          color: "#7e9bda"
        })
      ]
    });
  });

  it("keeps an empty default pool visible after first-use finishes through a newly created pool", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    let completed = false;
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => completed,
      markFirstUseCompleted: () => {
        completed = true;
      }
    });

    await workflow.stageFirstIdeaDraft({
      title: "新池首条",
      body: "创建新池后完成首次流程",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: false,
      tags: []
    });

    const result = await workflow.commitDraftToNewPool({
      name: "写作池",
      color: "#7e9bda"
    });

    const state = await workflow.getHomeRuntimeState();

    expect(state.mode).toBe("populated");
    expect(state.pools).toHaveLength(2);
    expect(state.pools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: DEFAULT_POOL_ID,
          name: "默认池",
          ideaCount: 0,
          isDefault: true
        }),
        expect.objectContaining({
          id: result.pool.id,
          name: "写作池",
          ideaCount: 1,
          isDefault: false,
          color: "#7e9bda"
        })
      ])
    );
  });

  it("keeps home empty when only the default pool exists with no ideas", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted: () => undefined
    });

    await expect(workflow.getHomeRuntimeState()).resolves.toEqual({
      mode: "empty",
      pools: []
    });
  });

  it("adds pool lastUsedAt from latest idea createdAt/updatedAt in runtime summary", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    const defaultPool = await poolService.ensureDefaultPool();
    const writingPool = await poolService.createPool({ name: "写作池" });

    const createdDefaultIdea = await ideaService.createIdea({
      title: "默认池灵感",
      body: "初始",
      contentType: "text",
      sourceType: "manual",
      attachmentPaths: [],
      poolId: defaultPool.id,
      tags: []
    });
    const updatedDefaultIdea = await ideaService.updateIdea(createdDefaultIdea.id, {
      body: "更新后",
      title: "默认池灵感"
    });
    if (!updatedDefaultIdea) {
      throw new Error("Expected updated default idea to exist");
    }

    await ideaService.createIdea({
      title: "写作池灵感",
      body: "创建后不更新",
      contentType: "text",
      sourceType: "manual",
      attachmentPaths: [],
      poolId: writingPool.id,
      tags: []
    });

    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted: () => undefined
    });

    const state = await workflow.getHomeRuntimeState();

    expect(state.mode).toBe("populated");
    const defaultPoolSummary = state.pools.find((pool) => pool.id === defaultPool.id);
    const writingPoolSummary = state.pools.find((pool) => pool.id === writingPool.id);

    expect(defaultPoolSummary?.lastUsedAt).toBe(updatedDefaultIdea.updatedAt);
    expect(writingPoolSummary?.lastUsedAt).toBeDefined();
  });

  it("throws when committing to an existing pool without a pending draft", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted: () => undefined
    });

    await expect(workflow.commitDraftToExistingPool(DEFAULT_POOL_ID)).rejects.toThrow(
      "No pending first-use draft to commit."
    );
  });

  it("throws when creating a new pool without a pending draft", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted: () => undefined
    });

    await expect(
      workflow.commitDraftToNewPool({
        name: "写作池",
        color: "#7e9bda"
      })
    ).rejects.toThrow("No pending first-use draft to commit.");
  });

  it("returns populated with empty pools when first-use is already completed and only empty default pool exists", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => true,
      markFirstUseCompleted: () => undefined
    });

    await expect(workflow.getHomeRuntimeState()).resolves.toEqual({
      mode: "populated",
      pools: []
    });
  });

  it("marks first-use completed exactly once when committing staged draft to existing pool", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const markFirstUseCompleted = vi.fn(async () => undefined);
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "完成首条",
      body: "提交到默认池",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: false,
      tags: []
    });

    await workflow.commitDraftToExistingPool(DEFAULT_POOL_ID);

    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
  });

  it("creates markdown file and marks the idea fileCreated when first-use commit opts into create-file", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const markFirstUseCompleted = vi.fn(async () => undefined);
    const ensureFolder = vi.fn(async () => undefined);
    const createUniquePath = vi.fn(async () => "记录层/Glitter/我的第一条灵感.md");
    const buildIdeaFileContent = vi.fn(() => "# 我的第一条灵感");
    const create = vi.fn(async () => undefined);
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      vaultFileStore: {
        ensureFolder,
        createUniquePath,
        buildIdeaFileContent
      } as any,
      vault: {
        create
      } as any,
      resolveFileStorageDirectory: () => "记录层/Glitter",
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "我的第一条灵感",
      body: "正文",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: true,
      tags: []
    });

    await workflow.commitDraftToExistingPool(DEFAULT_POOL_ID);

    expect(ensureFolder).toHaveBeenCalledWith("记录层/Glitter");
    expect(createUniquePath).toHaveBeenCalledWith("记录层/Glitter", "我的第一条灵感", ".md");
    expect(create).toHaveBeenCalledWith("记录层/Glitter/我的第一条灵感.md", "# 我的第一条灵感");
    await expect(ideaService.listIdeas()).resolves.toEqual([
      expect.objectContaining({
        title: "我的第一条灵感",
        poolId: DEFAULT_POOL_ID,
        fileCreated: true,
        filePath: "记录层/Glitter/我的第一条灵感.md"
      })
    ]);
    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
  });

  it("marks first-use completed exactly once when committing staged draft to a new pool", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const markFirstUseCompleted = vi.fn(async () => undefined);
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "完成首条",
      body: "提交到新池",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: false,
      tags: []
    });

    await workflow.commitDraftToNewPool({ name: "新池" });

    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
  });

  it("preserves and returns create-file warning when committing staged draft to a new pool", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    let completed = false;
    const markFirstUseCompleted = vi.fn(async () => {
      completed = true;
    });
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "记录层/Glitter/新池失败建档.md"),
        buildIdeaFileContent: vi.fn(() => "# 新池失败建档")
      } as any,
      vault: {
        create: vi.fn(async () => {
          throw new Error("create file failed");
        })
      } as any,
      resolveFileStorageDirectory: () => "记录层/Glitter",
      hasCompletedFirstUse: () => completed,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "新池失败建档",
      body: "创建新池后建档失败",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: true,
      tags: []
    });

    const result = await workflow.commitDraftToNewPool({ name: "写作池" });

    expect(result.pool.name).toBe("写作池");
    expect(result.commitResult).toEqual({
      warning: {
        stage: "create-file",
        message: "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。"
      }
    });
    expect(workflow.hasPendingDraft()).toBe(false);
    expect(completed).toBe(true);
    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
  });

  it("keeps pending draft and does not mark completion when idea creation fails", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const markFirstUseCompleted = vi.fn(async () => undefined);
    vi.spyOn(ideaService, "createIdea").mockRejectedValueOnce(new Error("create failed"));
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "完成首条",
      body: "创建失败时保持待提交",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: false,
      tags: []
    });

    await expect(workflow.commitDraftToExistingPool(DEFAULT_POOL_ID)).rejects.toThrow("create failed");

    expect(workflow.hasPendingDraft()).toBe(true);
    expect(markFirstUseCompleted).not.toHaveBeenCalled();
    await expect(ideaService.listIdeas()).resolves.toHaveLength(0);
  });

  it("returns create-file warning when file creation is requested without real vault dependencies", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    let completed = false;
    const markFirstUseCompleted = vi.fn(async () => {
      completed = true;
    });
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => completed,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "失败建档",
      body: "缺少真实建档依赖时不应伪装成功",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: true,
      tags: []
    });

    await expect(workflow.commitDraftToExistingPool(DEFAULT_POOL_ID)).resolves.toEqual({
      warning: {
        stage: "create-file",
        message: "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。"
      }
    });

    expect(workflow.hasPendingDraft()).toBe(false);
    expect(completed).toBe(true);
    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
    await expect(ideaService.listIdeas()).resolves.toEqual([
      expect.objectContaining({
        title: "失败建档",
        poolId: DEFAULT_POOL_ID,
        fileCreated: false,
        filePath: undefined
      })
    ]);
  });

  it("returns create-file warning and still completes first-use after idea persistence succeeds", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    let completed = false;
    const markFirstUseCompleted = vi.fn(async () => {
      completed = true;
    });
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "记录层/Glitter/失败建档.md"),
        buildIdeaFileContent: vi.fn(() => "# 失败建档")
      } as any,
      vault: {
        create: vi.fn(async () => {
          throw new Error("create file failed");
        })
      } as any,
      resolveFileStorageDirectory: () => "记录层/Glitter",
      hasCompletedFirstUse: () => completed,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "失败建档",
      body: "先落库再建档失败",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: true,
      tags: []
    });

    await expect(workflow.commitDraftToExistingPool(DEFAULT_POOL_ID)).resolves.toEqual({
      warning: {
        stage: "create-file",
        message: "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。"
      }
    });

    expect(workflow.hasPendingDraft()).toBe(false);
    expect(completed).toBe(true);
    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
    await expect(ideaService.listIdeas()).resolves.toEqual([
      expect.objectContaining({
        title: "失败建档",
        poolId: DEFAULT_POOL_ID,
        fileCreated: false,
        filePath: undefined
      })
    ]);
  });

  it("returns the propagated create-file warning when commitDraftToNewPool requests file creation without injected file services", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const markFirstUseCompleted = vi.fn(async () => undefined);
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "新池建档警告",
      body: "未注入建档依赖时也要显式返回警告",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: true,
      tags: []
    });

    const result = await workflow.commitDraftToNewPool({ name: "写作池" });

    expect(result.commitResult).toEqual({
      warning: {
        stage: "create-file",
        message: "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。"
      }
    });
    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
    await expect(ideaService.listIdeas()).resolves.toEqual([
      expect.objectContaining({
        title: "新池建档警告",
        poolId: result.pool.id,
        fileCreated: false,
        filePath: undefined
      })
    ]);
  });

  it("returns mark-file-created warning and still completes first-use after the vault file already exists", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const markFirstUseCompleted = vi.fn(async () => undefined);
    vi.spyOn(ideaService, "markFileCreated").mockRejectedValueOnce(new Error("mark file created failed"));
    const create = vi.fn(async () => undefined);
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async () => "记录层/Glitter/已建档但未回链.md"),
        buildIdeaFileContent: vi.fn(() => "# 已建档但未回链")
      } as any,
      vault: {
        create
      } as any,
      resolveFileStorageDirectory: () => "记录层/Glitter",
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "已建档但未回链",
      body: "建档成功后回链失败",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: true,
      tags: []
    });

    await expect(workflow.commitDraftToExistingPool(DEFAULT_POOL_ID)).resolves.toEqual({
      warning: {
        stage: "mark-file-created",
        message: "灵感已保存，但文件已创建但关联未完成。你可以稍后检查这条灵感的建档状态。"
      }
    });

    expect(create).toHaveBeenCalledWith("记录层/Glitter/已建档但未回链.md", "# 已建档但未回链");
    expect(workflow.hasPendingDraft()).toBe(false);
    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
    await expect(ideaService.listIdeas()).resolves.toEqual([
      expect.objectContaining({
        title: "已建档但未回链",
        poolId: DEFAULT_POOL_ID,
        fileCreated: false,
        filePath: undefined
      })
    ]);
  });

  it("does not keep pending draft after idea creation succeeds but completion persistence fails", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const markFirstUseCompleted = vi.fn(async () => {
      throw new Error("persist failed");
    });
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "完成首条",
      body: "持久化失败时不应重复落库",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: false,
      tags: []
    });

    await expect(workflow.commitDraftToExistingPool(DEFAULT_POOL_ID)).rejects.toThrow("persist failed");

    expect(workflow.hasPendingDraft()).toBe(false);
    await expect(ideaService.listIdeas()).resolves.toHaveLength(1);
  });

  it("rejects overlapping commitDraftToExistingPool while another commit is in flight", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    let resolveCreateIdea: (() => void) | undefined;
    const createIdeaGate = new Promise<void>((resolve) => {
      resolveCreateIdea = resolve;
    });

    const originalCreateIdea = ideaService.createIdea.bind(ideaService);
    const createIdeaSpy = vi.spyOn(ideaService, "createIdea").mockImplementationOnce(async (...args) => {
      await createIdeaGate;
      return originalCreateIdea(...args);
    });

    const markFirstUseCompleted = vi.fn(async () => undefined);
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "并发提交",
      body: "应只创建一次",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: false,
      tags: []
    });

    const firstCommit = workflow.commitDraftToExistingPool(DEFAULT_POOL_ID);
    const secondCommit = workflow.commitDraftToExistingPool(DEFAULT_POOL_ID);

    await expect(secondCommit).rejects.toThrow("First-use draft commit already in progress.");

    resolveCreateIdea?.();
    await firstCommit;

    expect(createIdeaSpy).toHaveBeenCalledTimes(1);
    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
    expect(workflow.hasPendingDraft()).toBe(false);
    await expect(ideaService.listIdeas()).resolves.toHaveLength(1);
  });

  it("blocks overlapping commitDraftToNewPool while another commit is in flight", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    let resolveCreateIdea: (() => void) | undefined;
    const createIdeaGate = new Promise<void>((resolve) => {
      resolveCreateIdea = resolve;
    });

    const originalCreateIdea = ideaService.createIdea.bind(ideaService);
    vi.spyOn(ideaService, "createIdea").mockImplementationOnce(async (...args) => {
      await createIdeaGate;
      return originalCreateIdea(...args);
    });

    const createPoolSpy = vi.spyOn(poolService, "createPool");
    const markFirstUseCompleted = vi.fn(async () => undefined);
    const workflow = createFirstUseWorkflow({
      ideaService,
      poolService,
      hasCompletedFirstUse: () => false,
      markFirstUseCompleted
    });

    await workflow.stageFirstIdeaDraft({
      title: "并发提交",
      body: "新池路径应被阻止",
      contentType: "text",
      sourceType: "quick-capture",
      attachmentPaths: [],
      createFileChecked: false,
      tags: []
    });

    const inFlightCommit = workflow.commitDraftToExistingPool(DEFAULT_POOL_ID);

    await expect(workflow.commitDraftToNewPool({ name: "新池" })).rejects.toThrow(
      "First-use draft commit already in progress."
    );

    resolveCreateIdea?.();
    await inFlightCommit;

    expect(createPoolSpy).not.toHaveBeenCalled();
    expect(markFirstUseCompleted).toHaveBeenCalledTimes(1);
    await expect(ideaService.listIdeas()).resolves.toHaveLength(1);
  });
});
