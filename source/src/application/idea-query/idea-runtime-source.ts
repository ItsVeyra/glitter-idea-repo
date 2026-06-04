import type { Vault } from "obsidian";
import type { Idea, IdeaSnippetRef } from "../../domain/idea/idea-model";
import type { createIdeaService } from "../../domain/idea/idea-service";
import { countIdeaSnippetOccurrences } from "../../editor/snippet-serializer";

export interface IdeaRuntimeSource {
  listIdeas(): Promise<Idea[]>;
}

function isFileLikeWithPath(file: unknown): file is { path: string } {
  return Boolean(file) && typeof file === "object" && typeof (file as { path?: unknown }).path === "string";
}

function canReadVaultFiles(vault: Vault): vault is Vault & { read: (file: unknown) => Promise<string> } {
  return typeof (vault as Vault & { read?: unknown }).read === "function";
}

export async function reconcileMissingIdeaFiles(
  ideaService: ReturnType<typeof createIdeaService>,
  vault: Vault,
  ideas: Idea[]
): Promise<Idea[]> {
  const reconciledIdeas: Idea[] = [];

  for (const idea of ideas) {
    if (!idea.fileCreated || !idea.filePath) {
      reconciledIdeas.push(idea);
      continue;
    }

    if (vault.getAbstractFileByPath(idea.filePath)) {
      reconciledIdeas.push(idea);
      continue;
    }

    const clearedIdea = await ideaService.clearFileCreated(idea.id);
    reconciledIdeas.push(clearedIdea ?? { ...idea, fileCreated: false, filePath: undefined });
  }

  return reconciledIdeas;
}

export async function reconcileSnippetRefsAgainstNotes(
  ideaService: ReturnType<typeof createIdeaService>,
  vault: Vault,
  ideas: Idea[]
): Promise<Idea[]> {
  if (!canReadVaultFiles(vault)) {
    return ideas;
  }

  const noteContentCache = new Map<string, string>();
  const reconciledIdeas: Idea[] = [];

  for (const idea of ideas) {
    if (idea.snippetRefs.length === 0) {
      reconciledIdeas.push(idea);
      continue;
    }

    const snippetRefsByPath = new Map<string, IdeaSnippetRef[]>();
    for (const snippetRef of idea.snippetRefs) {
      const notePath = snippetRef.notePath.trim();
      const groupedRefs = snippetRefsByPath.get(notePath) ?? [];
      groupedRefs.push(snippetRef);
      snippetRefsByPath.set(notePath, groupedRefs);
    }

    let changed = false;
    const nextSnippetRefs: IdeaSnippetRef[] = [];

    for (const [notePath, snippetRefs] of snippetRefsByPath.entries()) {
      if (!notePath) {
        nextSnippetRefs.push(...snippetRefs.map((snippetRef) => ({ ...snippetRef })));
        continue;
      }

      const file = vault.getAbstractFileByPath(notePath);
      if (!isFileLikeWithPath(file)) {
        nextSnippetRefs.push(...snippetRefs.map((snippetRef) => ({ ...snippetRef })));
        continue;
      }

      let content = noteContentCache.get(notePath);
      if (content === undefined) {
        content = await vault.read(file);
        noteContentCache.set(notePath, content);
      }

      const actualOccurrenceCount = countIdeaSnippetOccurrences(content, idea.id);
      const keptOccurrenceCount = Math.min(actualOccurrenceCount, snippetRefs.length);
      if (keptOccurrenceCount !== snippetRefs.length) {
        changed = true;
      }

      nextSnippetRefs.push(
        ...snippetRefs.slice(0, keptOccurrenceCount).map((snippetRef) => ({
          ...snippetRef,
          notePath
        }))
      );
    }

    if (!changed) {
      reconciledIdeas.push(idea);
      continue;
    }

    const updatedIdea = await ideaService.replaceSnippetRefs(idea.id, nextSnippetRefs);
    reconciledIdeas.push(updatedIdea ?? { ...idea, snippetRefs: nextSnippetRefs });
  }

  return reconciledIdeas;
}

export async function reconcileIdeaRuntimeState(
  ideaService: ReturnType<typeof createIdeaService>,
  vault: Vault,
  ideas: Idea[]
): Promise<Idea[]> {
  const fileReconciledIdeas = await reconcileMissingIdeaFiles(ideaService, vault, ideas);
  return reconcileSnippetRefsAgainstNotes(ideaService, vault, fileReconciledIdeas);
}

export function createIdeaRuntimeSource({
  ideaService,
  vault
}: {
  ideaService: ReturnType<typeof createIdeaService>;
  vault: Vault;
}): IdeaRuntimeSource {
  return {
    async listIdeas() {
      return reconcileIdeaRuntimeState(ideaService, vault, await ideaService.listIdeas());
    }
  };
}
