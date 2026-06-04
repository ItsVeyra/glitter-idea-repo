/**
 * 首次使用工作流，负责首页空态到首条灵感落库之间的引导语义。
 * 维护待提交草稿、首页展示状态与首条灵感写入目标池的提交流程。
 */
import type { Vault } from "obsidian";
import type { IdeaContentType, IdeaSourceType } from "../../domain/idea/idea-model";
import type { createIdeaService } from "../../domain/idea/idea-service";
import type { Pool } from "../../domain/pool/pool-model";
import type { createPoolService } from "../../domain/pool/pool-service";
import { createVaultFileStore } from "../../storage/vault-file-store";
import {
  PersistCapturedIdeaError,
  persistCapturedIdea,
  type PersistCapturedIdeaStage
} from "../quick-capture/persist-captured-idea";

const DEFAULT_VAULT_FILE_STORE: ReturnType<typeof createVaultFileStore> = {
  async ensureFolder() {
    throw new Error("First-use workflow vault file store is not configured.");
  },
  async createUniquePath(_folder, _fileName, _extension = ".md") {
    throw new Error("First-use workflow vault file store is not configured.");
  },
  buildIdeaFileContent(_idea) {
    throw new Error("First-use workflow vault file store is not configured.");
  }
};

const DEFAULT_VAULT = {
  create: (async () => {
    throw new Error("First-use workflow vault is not configured.");
  }) as Vault["create"]
} as Pick<Vault, "create"> as Vault;

// 首次使用工作流契约。
export interface FirstUseIdeaDraftInput {
  title: string;
  body: string;
  contentType: IdeaContentType;
  sourceType: IdeaSourceType;
  sourceUrl?: string;
  attachmentPaths: string[];
  createFileChecked: boolean;
  tags: string[];
}

export interface FirstUseHomeRuntimePoolSummary {
  id: string;
  name: string;
  ideaCount: number;
  isDefault: boolean;
  color?: string;
  lastUsedAt?: string;
}

export interface FirstUseHomeRuntimeState {
  mode: "empty" | "populated";
  pools: FirstUseHomeRuntimePoolSummary[];
}

export type FirstUseCommitWarningStage = Extract<PersistCapturedIdeaStage, "create-file" | "mark-file-created">;

export interface FirstUseCommitWarning {
  stage: FirstUseCommitWarningStage;
  message: string;
}

export interface FirstUseCommitResult {
  warning?: FirstUseCommitWarning;
}

export interface FirstUseWorkflow {
  getHomeRuntimeState(): Promise<FirstUseHomeRuntimeState>;
  stageFirstIdeaDraft(input: FirstUseIdeaDraftInput): Promise<void>;
  hasPendingDraft(): boolean;
  commitDraftToExistingPool(poolId: string): Promise<FirstUseCommitResult>;
  commitDraftToNewPool(input: { name: string; description?: string; color?: string }): Promise<{
    pool: Pool;
    commitResult: FirstUseCommitResult;
  }>;
}

const FIRST_USE_COMMIT_WARNING_MESSAGES: Record<FirstUseCommitWarningStage, string> = {
  "create-file": "灵感已保存，但创建对应文件未完成。你可以稍后再为这条灵感建档。",
  "mark-file-created": "灵感已保存，但文件已创建但关联未完成。你可以稍后检查这条灵感的建档状态。"
};

function buildFirstUseCommitWarning(stage: FirstUseCommitWarningStage): FirstUseCommitWarning {
  return {
    stage,
    message: FIRST_USE_COMMIT_WARNING_MESSAGES[stage]
  };
}

export function createFirstUseWorkflow({
  ideaService,
  poolService,
  vaultFileStore = DEFAULT_VAULT_FILE_STORE,
  vault = DEFAULT_VAULT,
  resolveFileStorageDirectory = () => "Glitter",
  hasCompletedFirstUse,
  markFirstUseCompleted
}: {
  ideaService: ReturnType<typeof createIdeaService>;
  poolService: ReturnType<typeof createPoolService>;
  vaultFileStore?: ReturnType<typeof createVaultFileStore>;
  vault?: Vault;
  resolveFileStorageDirectory?: () => string;
  hasCompletedFirstUse: () => boolean;
  markFirstUseCompleted: () => Promise<void> | void;
}): FirstUseWorkflow {
  let pendingDraft: FirstUseIdeaDraftInput | null = null;
  let isCommittingDraft = false;

  // 暂存草稿提交辅助。
  const commitDraftToPool = async (poolId: string): Promise<FirstUseCommitResult> => {
    if (!pendingDraft) {
      throw new Error("No pending first-use draft to commit.");
    }

    const draft = pendingDraft;
    pendingDraft = null;
    let warning: FirstUseCommitWarning | undefined;

    try {
      await persistCapturedIdea({
        input: {
          title: draft.title,
          body: draft.body,
          contentType: draft.contentType,
          sourceType: draft.sourceType,
          sourceUrl: draft.sourceUrl,
          attachmentPaths: draft.attachmentPaths,
          createFileChecked: draft.createFileChecked,
          poolId,
          tags: draft.tags
        },
        ideaService,
        vaultFileStore,
        vault,
        resolveFileStorageDirectory
      });
    } catch (error) {
      if (error instanceof PersistCapturedIdeaError) {
        if (error.stage === "create-idea") {
          if (pendingDraft === null) {
            pendingDraft = draft;
          }

          throw error.cause;
        }

        if (error.stage === "create-file" || error.stage === "mark-file-created") {
          warning = buildFirstUseCommitWarning(error.stage);
        } else {
          throw error.cause;
        }
      } else {
        throw error;
      }
    }

    await markFirstUseCompleted();
    return warning ? { warning } : {};
  };

  // 首次使用工作流对外接口。
  return {
    async getHomeRuntimeState() {
      const [poolsWithCounts, ideas] = await Promise.all([
        poolService.listPoolsWithCounts(),
        ideaService.listIdeas()
      ]);
      const completedFirstUse = hasCompletedFirstUse();
      const shouldKeepEmptyDefaultPool = completedFirstUse && poolsWithCounts.some((pool) => !pool.isDefault);
      const visiblePools = poolsWithCounts.filter(
        (pool) => !pool.isDefault || pool.ideaCount > 0 || shouldKeepEmptyDefaultPool
      );

      if (visiblePools.length === 0) {
        return {
          mode: completedFirstUse ? "populated" : "empty",
          pools: []
        };
      }

      const poolLastUsedAt = new Map<string, string>();
      for (const idea of ideas) {
        const candidate = idea.updatedAt > idea.createdAt ? idea.updatedAt : idea.createdAt;
        const current = poolLastUsedAt.get(idea.poolId);
        if (!current || candidate > current) {
          poolLastUsedAt.set(idea.poolId, candidate);
        }
      }

      return {
        mode: "populated",
        pools: visiblePools.map((pool) => ({
          id: pool.id,
          name: pool.name,
          ideaCount: pool.ideaCount,
          isDefault: pool.isDefault,
          color: pool.color,
          lastUsedAt: poolLastUsedAt.get(pool.id)
        }))
      };
    },

    async stageFirstIdeaDraft(input) {
      pendingDraft = {
        ...input,
        attachmentPaths: [...input.attachmentPaths],
        tags: [...input.tags]
      };
    },

    hasPendingDraft() {
      return pendingDraft !== null;
    },

    async commitDraftToExistingPool(poolId) {
      if (isCommittingDraft) {
        throw new Error("First-use draft commit already in progress.");
      }

      isCommittingDraft = true;
      try {
        return await commitDraftToPool(poolId);
      } finally {
        isCommittingDraft = false;
      }
    },

    async commitDraftToNewPool(input) {
      if (isCommittingDraft) {
        throw new Error("First-use draft commit already in progress.");
      }

      if (!pendingDraft) {
        throw new Error("No pending first-use draft to commit.");
      }

      isCommittingDraft = true;
      try {
        const pool = await poolService.createPool(input);
        const commitResult = await commitDraftToPool(pool.id);
        return { pool, commitResult };
      } finally {
        isCommittingDraft = false;
      }
    }
  };
}
