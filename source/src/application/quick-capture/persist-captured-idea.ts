/**
 * 快速记录共享持久化辅助。
 * 统一负责灵感创建、可选建档与错误阶段包装，供多个入口复用同一路径。
 */
import type { Vault } from "obsidian";
import type { IdeaContentType, IdeaSourceType } from "../../domain/idea/idea-model";
import type { createIdeaService } from "../../domain/idea/idea-service";
import type { createVaultFileStore } from "../../storage/vault-file-store";

export interface PersistCapturedIdeaInput {
  title: string;
  body: string;
  contentType: IdeaContentType;
  sourceType: IdeaSourceType;
  sourceUrl?: string;
  attachmentPaths: string[];
  createFileChecked: boolean;
  poolId: string;
  tags: string[];
}

export type PersistCapturedIdeaStage = "create-idea" | "create-file" | "mark-file-created";

export class PersistCapturedIdeaError extends Error {
  readonly stage: PersistCapturedIdeaStage;
  readonly cause: unknown;

  constructor(stage: PersistCapturedIdeaStage, cause: unknown) {
    super(
      stage === "create-idea"
        ? "Failed to create captured idea."
        : stage === "create-file"
          ? "Failed to create captured idea file."
          : "Failed to link captured idea with its created file."
    );
    this.name = "PersistCapturedIdeaError";
    this.stage = stage;
    this.cause = cause;
  }
}

export async function persistCapturedIdea({
  input,
  ideaService,
  vaultFileStore,
  vault,
  resolveFileStorageDirectory = () => "Glitter"
}: {
  input: PersistCapturedIdeaInput;
  ideaService: ReturnType<typeof createIdeaService>;
  vaultFileStore: ReturnType<typeof createVaultFileStore>;
  vault: Vault;
  resolveFileStorageDirectory?: () => string;
}): Promise<void> {
  const idea = await createIdea();

  if (!input.createFileChecked) {
    return;
  }

  let filePath: string;

  try {
    const fileStorageDirectory = resolveFileStorageDirectory().trim() || "Glitter";
    await vaultFileStore.ensureFolder(fileStorageDirectory);
    filePath = await vaultFileStore.createUniquePath(fileStorageDirectory, idea.title, ".md");
    const content = vaultFileStore.buildIdeaFileContent(idea);

    await vault.create(filePath, content);
  } catch (error) {
    throw new PersistCapturedIdeaError("create-file", error);
  }

  try {
    await ideaService.markFileCreated(idea.id, filePath);
  } catch (error) {
    throw new PersistCapturedIdeaError("mark-file-created", error);
  }

  async function createIdea() {
    try {
      return await ideaService.createIdea({
        title: input.title,
        body: input.body,
        contentType: input.contentType,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        attachmentPaths: [...input.attachmentPaths],
        poolId: input.poolId,
        tags: [...input.tags]
      });
    } catch (error) {
      throw new PersistCapturedIdeaError("create-idea", error);
    }
  }
}
