/**
 * 全局快速记录工作流，负责把弹窗输入落到灵感与文件创建流程。
 * 同时维护跨弹窗复用的当前选池状态，供全局快速记录流程回填与切换。
 */
import type { Vault } from "obsidian";
import { DEFAULT_POOL_ID, DEFAULT_POOL_LABEL } from "../../plugin/constants";
import type { IdeaContentType } from "../../domain/idea/idea-model";
import type { createIdeaService } from "../../domain/idea/idea-service";
import type { createPoolService } from "../../domain/pool/pool-service";
import type { createVaultFileStore } from "../../storage/vault-file-store";
import { persistCapturedIdea } from "./persist-captured-idea";

// 全局快速记录工作流契约。
export interface GlobalQuickCaptureDraftInput {
  title: string;
  body: string;
  contentType: IdeaContentType;
  sourceUrl?: string;
  attachmentPaths: string[];
  createFileChecked: boolean;
  poolId: string;
  tags: string[];
}

export interface QuickCapturePoolOption {
  id: string;
  label: string;
}

export interface GlobalSelectedPoolState {
  id: string;
  label: string;
}

export interface QuickCaptureWorkflow {
  saveGlobalDraft(input: GlobalQuickCaptureDraftInput): Promise<void>;
  listGlobalPoolOptions(): Promise<QuickCapturePoolOption[]>;
  getGlobalSelectedPoolState(): GlobalSelectedPoolState;
  setGlobalSelectedPoolState(poolId: string): Promise<GlobalSelectedPoolState>;
}

export function createQuickCaptureWorkflow({
  ideaService,
  poolService,
  vaultFileStore,
  vault,
  resolveFileStorageDirectory = () => "Glitter"
}: {
  ideaService: ReturnType<typeof createIdeaService>;
  poolService: ReturnType<typeof createPoolService>;
  vaultFileStore: ReturnType<typeof createVaultFileStore>;
  vault: Vault;
  resolveFileStorageDirectory?: () => string;
}): QuickCaptureWorkflow {
  // 全局选池状态。
  let globalSelectedPoolState: GlobalSelectedPoolState = {
    id: DEFAULT_POOL_ID,
    label: DEFAULT_POOL_LABEL
  };

  // 快速记录工作流对外接口。
  return {
    async saveGlobalDraft(input) {
      const defaultPool = await poolService.ensureDefaultPool();
      const targetPool = input.poolId ? await poolService.getPool(input.poolId) : null;
      const resolvedPoolId = targetPool?.id ?? defaultPool.id;

      await persistCapturedIdea({
        input: {
          title: input.title,
          body: input.body,
          contentType: input.contentType,
          sourceType: input.contentType === "link" ? "link-import" : "quick-capture",
          sourceUrl: input.sourceUrl,
          attachmentPaths: input.attachmentPaths,
          createFileChecked: input.createFileChecked,
          poolId: resolvedPoolId,
          tags: input.tags
        },
        ideaService,
        vaultFileStore,
        vault,
        resolveFileStorageDirectory
      });
    },

    async listGlobalPoolOptions() {
      const pools = await poolService.listPools();
      return pools.map((pool) => ({
        id: pool.id,
        label: pool.name
      }));
    },

    getGlobalSelectedPoolState() {
      return {
        ...globalSelectedPoolState
      };
    },

    async setGlobalSelectedPoolState(poolId) {
      const fallbackLabel = globalSelectedPoolState.label;

      try {
        const options = await this.listGlobalPoolOptions();
        const matched = options.find((option) => option.id === poolId);
        globalSelectedPoolState = {
          id: poolId,
          label: matched?.label ?? fallbackLabel
        };
      } catch {
        globalSelectedPoolState = {
          id: poolId,
          label: fallbackLabel
        };
      }

      return {
        ...globalSelectedPoolState
      };
    }
  };
}
