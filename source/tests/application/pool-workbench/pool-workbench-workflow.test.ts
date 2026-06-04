import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPoolMarkdownDocument } from "../../../src/application/pool-workbench/pool-markdown-document";
import { collectPoolRoamManagedSourceBlocks } from "../../../src/application/pool-workbench/pool-roam-source-blocks";
import { createPoolWorkbenchWorkflow } from "../../../src/application/pool-workbench/pool-workbench-workflow";
import type { Idea } from "../../../src/domain/idea/idea-model";
import { createIdeaService } from "../../../src/domain/idea/idea-service";
import { createPoolService } from "../../../src/domain/pool/pool-service";
import { serializeIdeaSnippet } from "../../../src/editor/snippet-serializer";

function buildIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: overrides.id ?? "idea-1",
    title: overrides.title ?? "Idea",
    body: overrides.body ?? "Idea body",
    contentType: overrides.contentType ?? "text",
    sourceType: overrides.sourceType ?? "manual",
    sourceUrl: overrides.sourceUrl,
    attachmentPaths: overrides.attachmentPaths ?? [],
    poolId: overrides.poolId ?? "pool-default",
    tags: overrides.tags ?? [],
    quoted: overrides.quoted ?? false,
    fileCreated: overrides.fileCreated ?? false,
    inbox: overrides.inbox ?? true,
    filePath: overrides.filePath,
    snippetRefs: overrides.snippetRefs ?? [],
    createdAt: overrides.createdAt ?? "2026-05-16T08:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-16T08:00:00.000Z",
    editedAt: overrides.editedAt
  };
}

function createRoamVaultHarness() {
  const folders = new Set<string>();
  const fileContents = new Map<string, string>();
  const fileMtimes = new Map<string, number>();
  let nextMtime = 1;

  const touchFile = (path: string, content: string): void => {
    fileContents.set(path, content);
    fileMtimes.set(path, nextMtime);
    nextMtime += 1;
  };

  const vault = {
    getAbstractFileByPath: vi.fn((path: string) => {
      if (fileContents.has(path)) {
        return {
          path,
          basename: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path,
          stat: { mtime: fileMtimes.get(path) ?? 0 }
        };
      }

      if (folders.has(path)) {
        return { path, children: [] };
      }

      return null;
    }),
    createFolder: vi.fn(async (path: string) => {
      const parts = path.split("/").filter(Boolean);
      let current = "";

      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        folders.add(current);
      }

      return { path, children: [] };
    }),
    create: vi.fn(async (path: string, content: string) => {
      touchFile(path, content);
      return { path };
    }),
    getFiles: vi.fn(() =>
      Array.from(fileContents.keys()).map((path) => ({
        path,
        basename: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path,
        stat: { mtime: fileMtimes.get(path) ?? 0 }
      }))
    ),
    read: vi.fn(async (file: { path: string }) => fileContents.get(file.path) ?? ""),
    modify: vi.fn(async (file: { path: string }, content: string) => {
      touchFile(file.path, content);
      return file;
    })
  } as any;

  return { vault };
}

function collectRoamBlocksForIdea(canvas: { nodes: any[]; edges: any[] }, ideaId: string) {
  return collectPoolRoamManagedSourceBlocks(canvas).filter((block) =>
    block.nodes.some((node) => node.glitterSourceBlock.sourceId === ideaId)
  );
}

describe("createPoolWorkbenchWorkflow", () => {
  const createdFiles: Array<{ path: string; content: string }> = [];
  const createdFolders: string[] = [];
  const noteContents: Record<string, string> = {};

  const vault = {
    getAbstractFileByPath: vi.fn((_path: string) => null),
    getResourcePath: vi.fn((file: { path: string }) => `app://local/${file.path}`),
    read: vi.fn(async (file: { path: string }) => noteContents[file.path] ?? ""),
    createFolder: vi.fn(async (path: string) => {
      createdFolders.push(path);
      return {};
    }),
    create: vi.fn(async (path: string, content: string) => {
      createdFiles.push({ path, content });
      return {};
    })
  } as any;

  beforeEach(() => {
    createdFiles.length = 0;
    createdFolders.length = 0;
    Object.keys(noteContents).forEach((path) => delete noteContents[path]);
    vault.getAbstractFileByPath.mockClear();
    vault.getResourcePath.mockClear();
    vault.read.mockClear();
    vault.createFolder.mockClear();
    vault.create.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads filtered and sorted runtime pool state", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    await ideaService.createIdea({
      title: "Beta idea",
      body: "has file",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });
    const alpha = await ideaService.createIdea({
      title: "Alpha idea",
      body: "has refs",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });
    const gamma = await ideaService.createIdea({
      title: "Gamma idea",
      body: "clean",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    await ideaService.markFileCreated(gamma.id, "Glitter/Gamma.md");
    vault.getAbstractFileByPath.mockImplementation((path: string) => {
      if (path === "Glitter/Gamma.md") {
        return { path };
      }
      return null;
    });
    await ideaService.recordSnippetRef(alpha.id, {
      notePath: "Note.md",
      insertedAt: "2026-04-12T00:00:00.000Z"
    });

    const vaultFileStore = {
      ensureFolder: vi.fn(async () => undefined),
      createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
      buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: vaultFileStore as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "with-markers",
      contentFilter: "all",
      sort: "title-asc",
      selectedIdeaIds: [alpha.id]
    });

    expect(state.pool).toMatchObject({
      id: "pool-default",
      totalItemCount: 3,
      visibleItemCount: 2,
      tone: "bluegray"
    });
    expect(state.header).toEqual({
      eyebrow: "灵感池",
      hint: "进入当前池继续整理与筛选"
    });
    expect(state.pool.description.length).toBeGreaterThan(0);
    expect(state.cards.map((card) => card.title)).toEqual(["Alpha idea", "Gamma idea"]);

    const selectedCard = state.cards.find((card) => card.id === alpha.id);
    expect(selectedCard).toMatchObject({
      id: alpha.id,
      selected: true,
      contentType: "text",
      hasBodyContent: true,
      fileCreated: false,
      referenced: true
    });
    expect(selectedCard?.excerpt).toBe("has refs");
    expect(selectedCard?.updatedAt).toEqual(expect.any(String));

    const createdFileCard = state.cards.find((card) => card.id === gamma.id);
    expect(createdFileCard).toMatchObject({
      id: gamma.id,
      hasBodyContent: true,
      fileCreated: true,
      filePath: "Glitter/Gamma.md",
      contentType: "text",
      referenced: false
    });

    expect(state.controls.selectedCount).toBe(1);
    expect(state.poolOptions.some((pool) => pool.selected && pool.id === "pool-default")).toBe(true);
  });

  it("keeps the active pool color on pool while leaving poolOptions narrow", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    const defaultPool = await poolService.ensureDefaultPool();
    const productPool = await poolService.createPool({
      name: "产品池",
      description: "带颜色的池",
      color: "#6ab5ff"
    });

    await ideaService.createIdea({
      title: "Colored idea",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: productPool.id
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: productPool.id,
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.pool).toMatchObject({
      id: productPool.id,
      title: productPool.name,
      color: "#6ab5ff"
    });
    expect(state.poolOptions).toEqual([
      { id: defaultPool.id, label: defaultPool.name, count: 0, selected: false },
      { id: productPool.id, label: productPool.name, count: 1, selected: true }
    ]);
    expect(state.poolOptions.every((pool) => !("color" in pool))).toBe(true);
  });

  it("loads a global status view across all pools for referenced and file-created ideas", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    const defaultPool = await poolService.ensureDefaultPool();
    const researchPool = await poolService.createPool({
      name: "研究池",
      description: "研究素材",
      color: "#ffa980"
    });

    const referencedIdea = await ideaService.createIdea({
      title: "Referenced idea",
      body: "has refs",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: defaultPool.id
    });
    await ideaService.recordSnippetRef(referencedIdea.id, {
      notePath: "Reference.md",
      insertedAt: "2026-04-12T00:00:00.000Z"
    });

    const createdFileIdea = await ideaService.createIdea({
      title: "Created file idea",
      body: "has file",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: researchPool.id
    });
    await ideaService.markFileCreated(createdFileIdea.id, "Glitter/Created file idea.md");
    vault.getAbstractFileByPath.mockImplementation((path: string) => {
      if (path === "Glitter/Created file idea.md") {
        return { path };
      }
      return null;
    });

    await ideaService.createIdea({
      title: "Unmarked default idea",
      body: "no markers",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: defaultPool.id
    });
    await ideaService.createIdea({
      title: "Unmarked research idea",
      body: "still no markers",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: researchPool.id
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      scope: "global-status",
      query: "",
      status: "with-markers",
      contentFilter: "all",
      sort: "title-asc",
      selectedIdeaIds: []
    });

    expect(state.pool).toMatchObject({
      id: "pool-global-status",
      title: "已引用 / 已建文件",
      totalItemCount: 2,
      visibleItemCount: 2,
      tone: "bluegray"
    });
    expect(state.header).toEqual({
      eyebrow: "全局状态",
      hint: "筛选所有池中的已引用与已建文件灵感"
    });
    expect(state.cards.map((card) => card.title)).toEqual(["Created file idea", "Referenced idea"]);
    expect(state.cards.every((card) => card.referenced || card.fileCreated)).toBe(true);
    expect(state.poolOptions).toEqual([
      { id: defaultPool.id, label: defaultPool.name, count: 2, selected: false },
      { id: researchPool.id, label: researchPool.name, count: 2, selected: false }
    ]);
  });

  it("delegates pool runtime loading and browse filtering to injected shared services", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    await ideaService.createIdea({
      title: "Stored idea",
      body: "stored body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const listIdeasSpy = vi.spyOn(ideaService, "listIdeas");
    const runtimeIdeas = [
      buildIdea({
        id: "runtime-idea",
        title: "Delegated runtime idea",
        body: "runtime body",
        poolId: "pool-default",
        snippetRefs: [{ notePath: "Note.md", insertedAt: "2026-05-16T09:00:00.000Z" }]
      })
    ];
    const ideaRuntimeSource = {
      listIdeas: vi.fn(async () => runtimeIdeas)
    };
    const ideaBrowseQueryService = {
      queryIdeas: vi.fn(() => ({
        normalizedContentFilter: "text",
        scopedIdeas: runtimeIdeas,
        statusMatchedIdeas: runtimeIdeas,
        visibleIdeas: runtimeIdeas
      }))
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault,
      ideaRuntimeSource,
      ideaBrowseQueryService
    } as any);

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "delegated",
      status: "referenced",
      contentFilter: "text",
      sort: "title-asc",
      selectedIdeaIds: ["runtime-idea"]
    });

    expect(ideaRuntimeSource.listIdeas).toHaveBeenCalledTimes(1);
    expect(listIdeasSpy).toHaveBeenCalledTimes(1);
    expect(ideaBrowseQueryService.queryIdeas).toHaveBeenCalledWith({
      ideas: runtimeIdeas,
      scope: "pool",
      poolId: "pool-default",
      query: "delegated",
      status: "referenced",
      contentFilter: "text",
      sort: "title-asc"
    });
    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]).toMatchObject({
      id: "runtime-idea",
      title: "Delegated runtime idea",
      referenced: true,
      selected: true
    });
  });

  it("keeps global-status totalItemCount based on status-matched ideas after shared browse filtering", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    const defaultPool = await poolService.ensureDefaultPool();
    const researchPool = await poolService.createPool({
      name: "研究池"
    });

    const statusMatchedIdeas = [
      buildIdea({
        id: "alpha",
        title: "Alpha idea",
        poolId: defaultPool.id,
        snippetRefs: [{ notePath: "Folder/Alpha.md", insertedAt: "2026-05-16T08:10:00.000Z" }]
      }),
      buildIdea({
        id: "beta",
        title: "Beta idea",
        poolId: researchPool.id,
        fileCreated: true,
        filePath: "Glitter/Beta.md"
      })
    ];
    const ideaRuntimeSource = {
      listIdeas: vi.fn(async () => statusMatchedIdeas)
    };
    const ideaBrowseQueryService = {
      queryIdeas: vi.fn(() => ({
        normalizedContentFilter: "all",
        scopedIdeas: statusMatchedIdeas,
        statusMatchedIdeas,
        visibleIdeas: [statusMatchedIdeas[0]]
      }))
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault,
      ideaRuntimeSource,
      ideaBrowseQueryService
    } as any);

    const state = await workflow.loadPoolState({
      scope: "global-status",
      query: "alpha",
      status: "with-markers",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.pool).toMatchObject({
      id: "pool-global-status",
      totalItemCount: 2,
      visibleItemCount: 1,
      tone: "bluegray"
    });
    expect(state.cards.map((card) => card.id)).toEqual(["alpha"]);
  });

  it("reverts file-created card state when the backing file has been deleted", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const idea = await ideaService.createIdea({
      title: "Deleted file idea",
      body: "stale file marker",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });
    await ideaService.markFileCreated(idea.id, "Glitter/Deleted file idea.md");

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]).toMatchObject({
      id: idea.id,
      fileCreated: false,
      filePath: undefined
    });
    expect(await ideaService.getIdea(idea.id)).toMatchObject({
      fileCreated: false,
      filePath: undefined
    });
  });

  it("groups snippet refs into note-level runtime location summaries", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const idea = await ideaService.createIdea({
      title: "Grouped snippet idea",
      body: "has grouped snippets",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    await ideaService.recordSnippetRef(idea.id, {
      notePath: "Folder/A.md",
      insertedAt: "2026-04-12T00:00:00.000Z"
    });
    await ideaService.recordSnippetRef(idea.id, {
      notePath: "Folder/A.md",
      insertedAt: "2026-04-12T00:01:00.000Z"
    });
    await ideaService.recordSnippetRef(idea.id, {
      notePath: "Folder/B.md",
      insertedAt: "2026-04-12T00:02:00.000Z"
    });

    const snippet = serializeIdeaSnippet({
      id: idea.id,
      title: idea.title,
      body: idea.body,
      sourceUrl: idea.sourceUrl,
      contentType: idea.contentType,
      attachmentPaths: idea.attachmentPaths,
      tags: idea.tags,
      poolLabel: "默认池",
      emoji: "✨"
    });

    noteContents["Folder/A.md"] = `${snippet}\n\n段落\n\n${snippet}`;
    noteContents["Folder/B.md"] = snippet;

    vault.getAbstractFileByPath.mockImplementation((path: string) => {
      if (path === "Folder/A.md" || path === "Folder/B.md") {
        return { path };
      }
      return null;
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "referenced",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]).toMatchObject({
      id: idea.id,
      referenced: true,
      snippetNoteCount: 2,
      snippetLocations: [
        {
          notePath: "Folder/A.md",
          noteTitle: "A",
          occurrenceCount: 2,
          stale: false
        },
        {
          notePath: "Folder/B.md",
          noteTitle: "B",
          occurrenceCount: 1,
          stale: false
        }
      ]
    });
  });

  it("reconciles snippet counts against current note contents", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const idea = await ideaService.createIdea({
      title: "Referenced idea",
      body: "snippet body",
      contentType: "text",
      sourceType: "manual",
      tags: ["test"],
      poolId: "pool-default"
    });

    await ideaService.recordSnippetRef(idea.id, {
      notePath: "Folder/A.md",
      insertedAt: "2026-04-12T00:00:00.000Z"
    });
    await ideaService.recordSnippetRef(idea.id, {
      notePath: "Folder/A.md",
      insertedAt: "2026-04-12T00:01:00.000Z"
    });
    await ideaService.recordSnippetRef(idea.id, {
      notePath: "Folder/B.md",
      insertedAt: "2026-04-12T00:02:00.000Z"
    });

    const snippet = serializeIdeaSnippet({
      id: idea.id,
      title: idea.title,
      body: idea.body,
      sourceUrl: idea.sourceUrl,
      contentType: idea.contentType,
      attachmentPaths: idea.attachmentPaths,
      tags: idea.tags,
      poolLabel: "默认池",
      emoji: "✨"
    });

    noteContents["Folder/A.md"] = `${snippet}\n\n普通正文`;
    noteContents["Folder/B.md"] = "普通正文，没有灵感片段";

    vault.getAbstractFileByPath.mockImplementation((path: string) => {
      if (path === "Folder/A.md" || path === "Folder/B.md") {
        return { path, extension: "md" };
      }
      return null;
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]).toMatchObject({
      id: idea.id,
      referenced: true,
      snippetNoteCount: 1,
      snippetLocations: [
        {
          notePath: "Folder/A.md",
          noteTitle: "A",
          occurrenceCount: 1,
          stale: false
        }
      ]
    });

    const refreshedIdea = await ideaService.getIdea(idea.id);
    expect(refreshedIdea?.snippetRefs).toHaveLength(1);
    expect(refreshedIdea?.snippetRefs[0]).toMatchObject({
      notePath: "Folder/A.md"
    });
  });

  it("clears referenced status when note contents no longer include the idea snippet", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const idea = await ideaService.createIdea({
      title: "Removed reference idea",
      body: "snippet body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    await ideaService.recordSnippetRef(idea.id, {
      notePath: "Folder/Removed.md",
      insertedAt: "2026-04-12T00:00:00.000Z"
    });

    noteContents["Folder/Removed.md"] = "这里只剩普通正文";
    vault.getAbstractFileByPath.mockImplementation((path: string) => {
      if (path === "Folder/Removed.md") {
        return { path, extension: "md" };
      }
      return null;
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "referenced",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards).toHaveLength(0);

    const refreshedIdea = await ideaService.getIdea(idea.id);
    expect(refreshedIdea?.snippetRefs).toEqual([]);
  });

  it("does not bump updatedAt when passive snippet reconciliation removes stale note refs", async () => {
    vi.useFakeTimers();

    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    vi.setSystemTime(new Date("2026-05-02T08:00:00.000Z"));
    const older = await ideaService.createIdea({
      title: "Older referenced idea",
      body: "older body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    vi.setSystemTime(new Date("2026-05-02T08:30:00.000Z"));
    await ideaService.recordSnippetRef(older.id, {
      notePath: "Folder/Older.md",
      insertedAt: "2026-05-02T08:30:00.000Z"
    });

    vi.setSystemTime(new Date("2026-05-02T09:00:00.000Z"));
    const newer = await ideaService.createIdea({
      title: "Newer idea",
      body: "newer body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    noteContents["Folder/Older.md"] = "这里已经没有引用片段";
    vault.getAbstractFileByPath.mockImplementation((path: string) => {
      if (path === "Folder/Older.md") {
        return { path, extension: "md" };
      }
      return null;
    });

    vi.setSystemTime(new Date("2026-05-02T10:00:00.000Z"));

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards.map((card) => card.id)).toEqual([newer.id, older.id]);

    const refreshedOlder = await ideaService.getIdea(older.id);
    expect(refreshedOlder).toMatchObject({
      updatedAt: "2026-05-02T08:30:00.000Z",
      snippetRefs: []
    });
  });

  it("preserves line breaks in text card excerpts for pool cards", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const multilineIdea = await ideaService.createIdea({
      title: "Multiline idea",
      body: "第一行\n第二行\n\n第三行",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    const card = state.cards.find((entry) => entry.id === multilineIdea.id);
    expect(card?.excerpt).toBe("第一行\n第二行\n\n第三行");
  });

  it("keeps full link body text in runtime cards instead of truncating it to excerpt length", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const fullBody = [
      "这是链接正文的第一段，用来验证卡片不会只保留 excerpt，并且保存后的卡片正文仍需完整显示。",
      "这是第二段，长度继续增长，超过旧的 120 字截断限制，避免测试文本太短导致 excerpt 没有被截断。",
      "这是第三段，继续补充更长的正文内容，确保 runtime card 同时保留完整 body 与截断 excerpt 两套数据。"
    ].join("\n\n");

    const linkIdea = await ideaService.createIdea({
      title: "Long link idea",
      body: fullBody,
      contentType: "link",
      sourceType: "manual",
      sourceUrl: "https://example.com/full-link-body",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    const card = state.cards.find((entry) => entry.id === linkIdea.id);
    expect(card?.excerpt).toContain("...");
    expect(card?.body).toBe(fullBody);
  });

  it("orders cards by the latest edit-or-create time when using updated-desc", async () => {
    vi.useFakeTimers();

    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    vi.setSystemTime(new Date("2026-04-29T10:00:00.000Z"));
    const first = await ideaService.createIdea({
      title: "First idea",
      body: "older body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    vi.setSystemTime(new Date("2026-04-29T11:00:00.000Z"));
    const second = await ideaService.createIdea({
      title: "Second idea",
      body: "newer body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    await ideaService.updateIdea(first.id, {
      body: "older body, but edited later",
      markEdited: true
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards.map((card) => card.id)).toEqual([first.id, second.id]);
    expect(state.cards[0]).toMatchObject({
      id: first.id,
      editedAt: "2026-04-29T12:00:00.000Z"
    });
  });

  it("filters by link content and persists link contentFilter control", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const linkIdea = await ideaService.createIdea({
      title: "Link-only idea",
      body: "",
      contentType: "link",
      sourceType: "manual",
      sourceUrl: "https://example.com/link-only",
      tags: [],
      poolId: "pool-default"
    });
    await ideaService.createIdea({
      title: "Text idea",
      body: "plain text",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "link",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]).toMatchObject({
      id: linkIdea.id,
      title: "Link-only idea"
    });
    expect(state.controls.contentFilter).toBe("link");
  });

  it("does not treat whitespace-only sourceUrl as link content", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    await ideaService.createIdea({
      title: "Whitespace link",
      body: "",
      contentType: "link",
      sourceType: "manual",
      sourceUrl: "   \n\t  ",
      tags: [],
      poolId: "pool-default"
    });
    await ideaService.createIdea({
      title: "Whitespace mixed",
      body: "",
      contentType: "mixed",
      sourceType: "manual",
      sourceUrl: "   ",
      tags: [],
      poolId: "pool-default"
    });
    const validLinkIdea = await ideaService.createIdea({
      title: "Valid link",
      body: "",
      contentType: "link",
      sourceType: "manual",
      sourceUrl: "https://example.com/valid",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "link",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]?.id).toBe(validLinkIdea.id);
    expect(state.controls.contentFilter).toBe("link");
  });

  it("includes mixed ideas with body under text contentFilter and persists control", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const mixedIdea = await ideaService.createIdea({
      title: "Mixed with body",
      body: "body from mixed",
      contentType: "mixed",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });
    await ideaService.createIdea({
      title: "Link idea",
      body: "",
      contentType: "link",
      sourceType: "manual",
      sourceUrl: "https://example.com/link",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "text",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards.some((card) => card.id === mixedIdea.id)).toBe(true);
    expect(state.cards.every((card) => card.contentType !== "link")).toBe(true);
    expect(state.controls.contentFilter).toBe("text");
  });

  it("falls back unknown contentFilter to all and returns all cards", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const textIdea = await ideaService.createIdea({
      title: "Text idea",
      body: "text",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });
    const linkIdea = await ideaService.createIdea({
      title: "Link idea",
      body: "",
      contentType: "link",
      sourceType: "manual",
      sourceUrl: "https://example.com/all",
      tags: [],
      poolId: "pool-default"
    });
    const imageIdea = await ideaService.createIdea({
      title: "Image idea",
      body: "",
      contentType: "image",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default",
      attachmentPaths: ["assets/image.png"]
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "unknown" as any,
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.cards.map((card) => card.id).sort()).toEqual([textIdea.id, linkIdea.id, imageIdea.id].sort());
    expect(state.controls.contentFilter).toBe("all");
  });

  it("falls back to first valid pool when requested pool is invalid", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    await ideaService.createIdea({
      title: "Default pool idea",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const otherPool = await poolService.createPool({
      name: "Other Pool",
      description: "other"
    });
    await ideaService.createIdea({
      title: "Other pool idea",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: otherPool.id
    });

    const vaultFileStore = {
      ensureFolder: vi.fn(async () => undefined),
      createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
      buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: vaultFileStore as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-missing",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.pool).toMatchObject({
      id: "pool-default",
      totalItemCount: 1,
      visibleItemCount: 1,
      tone: "bluegray"
    });
    expect(state.cards.map((card) => card.title)).toEqual(["Default pool idea"]);
  });
  it("falls back when persisted activePoolId is invalid", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    await ideaService.createIdea({
      title: "Default pool idea",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    await workflow.setActivePoolId("pool-missing");

    const state = await workflow.loadPoolState({
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.pool).toMatchObject({
      id: "pool-default",
      totalItemCount: 1,
      visibleItemCount: 1,
      tone: "bluegray"
    });
    expect(state.cards.map((card) => card.title)).toEqual(["Default pool idea"]);
  });
  it("returns empty browse state when there is no valid pool", async () => {
    const ideaService = createIdeaService();
    const poolService = {
      listPoolsWithCounts: vi.fn(async () => [])
    } as any;

    await ideaService.createIdea({
      title: "Orphan idea",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const vaultFileStore = {
      ensureFolder: vi.fn(async () => undefined),
      createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
      buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: vaultFileStore as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-missing",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.pool).toMatchObject({
      id: "pool-empty",
      totalItemCount: 0,
      visibleItemCount: 0,
      tone: "bluegray"
    });
    expect(state.pool.description).toBe("继续在当前池中筛选、整理并沉淀灵感。");
    expect(state.cards).toHaveLength(0);
  });
  it("loads overview state with required ordering and Chinese card metadata", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const alphaPool = await poolService.createPool({
      name: "阿尔法池",
      color: "#112233"
    });
    const betaPool = await poolService.createPool({
      name: "贝塔池",
      color: "#223344"
    });
    const emptyPool = await poolService.createPool({
      name: "空池"
    });

    await ideaService.createIdea({
      title: "Default idea 1",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });
    await ideaService.createIdea({
      title: "Default idea 2",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });
    await ideaService.createIdea({
      title: "Default idea 3",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    await ideaService.createIdea({
      title: "Alpha idea 1",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: alphaPool.id
    });
    await ideaService.createIdea({
      title: "Alpha idea 2",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: alphaPool.id
    });
    await ideaService.createIdea({
      title: "Beta idea 1",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: betaPool.id
    });
    await ideaService.createIdea({
      title: "Beta idea 2",
      body: "body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: betaPool.id
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

  });

  it("keeps browse runtime fields needed for slot-based cards", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const idea = await ideaService.createIdea({
      title: "Link idea",
      body: "Link body",
      contentType: "link",
      sourceType: "manual",
      sourceUrl: "https://example.com/slot-runtime",
      tags: [],
      poolId: "pool-default",
      attachmentPaths: ["", "assets/example.png"]
    });

    const vaultFileStore = {
      ensureFolder: vi.fn(async () => undefined),
      createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
      buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: vaultFileStore as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: [idea.id]
    });

    const card = state.cards.find((entry) => entry.id === idea.id);
    expect(card).toMatchObject({
      id: idea.id,
      contentType: "link",
      hasBodyContent: true,
      sourceUrl: "https://example.com/slot-runtime",
      attachmentPaths: ["", "assets/example.png"],
      selected: true
    });
  });

  it("resolves media thumbnail urls from vault resources for media cards", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const imageIdea = await ideaService.createIdea({
      title: "Image idea",
      body: "thumbnail",
      contentType: "image",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default",
      attachmentPaths: ["assets/image.png"]
    });

    vault.getAbstractFileByPath.mockImplementation((path: string) => {
      if (path === "assets/image.png") {
        return { path };
      }
      return null;
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    const card = state.cards.find((entry) => entry.id === imageIdea.id);
    expect(card).toMatchObject({
      id: imageIdea.id,
      attachmentPaths: ["assets/image.png"],
      mediaThumbnailUrl: "app://local/assets/image.png"
    });
    expect(vault.getAbstractFileByPath).toHaveBeenCalledWith("assets/image.png");
    expect(vault.getResourcePath).toHaveBeenCalledWith({ path: "assets/image.png" });
  });

  it("keeps every valid image thumbnail url for multi-image pool cards", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const imageIdea = await ideaService.createIdea({
      title: "Multi image idea",
      body: "thumbnail gallery",
      contentType: "image",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default",
      attachmentPaths: ["", "assets/image-a.png", "assets/missing.png", "assets/image-b.png"]
    });

    vault.getAbstractFileByPath.mockImplementation((path: string) => {
      if (path === "assets/image-a.png" || path === "assets/image-b.png") {
        return { path };
      }
      return null;
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    const card = state.cards.find((entry) => entry.id === imageIdea.id);
    expect(card).toMatchObject({
      id: imageIdea.id,
      mediaThumbnailUrl: "app://local/assets/image-a.png",
      mediaThumbnailUrls: [
        "app://local/assets/image-a.png",
        "app://local/assets/image-b.png"
      ]
    });
    expect(vault.getResourcePath).toHaveBeenCalledWith({ path: "assets/image-a.png" });
    expect(vault.getResourcePath).toHaveBeenCalledWith({ path: "assets/image-b.png" });
  });

  it("sets hasBodyContent from raw idea body presence", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const whitespaceBodyIdea = await ideaService.createIdea({
      title: "Whitespace body",
      body: "   \n\t  ",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    const card = state.cards.find((entry) => entry.id === whitespaceBodyIdea.id);
    expect(card).toMatchObject({
      id: whitespaceBodyIdea.id,
      excerpt: "(empty)",
      hasBodyContent: false
    });
  });

  it("moves selected ideas into a newly created pool", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const first = await ideaService.createIdea({
      title: "First",
      body: "first",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });
    const second = await ideaService.createIdea({
      title: "Second",
      body: "second",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const vaultFileStore = {
      ensureFolder: vi.fn(async () => undefined),
      createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
      buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: vaultFileStore as any,
      vault
    });

    const createdPool = await workflow.moveIdeasToNewPool([first.id, second.id], {
      name: "Writing Pool",
      description: "task3",
      color: "#7e9bda"
    });

    const moved = await ideaService.queryIdeas({ poolId: createdPool.id });
    expect(moved.map((idea) => idea.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("updates pool metadata and returns renamed runtime state", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const createdPool = await poolService.createPool({
      name: "原始池名",
      description: "原始描述"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    await workflow.updatePool(createdPool.id, {
      name: "更新后的池名",
      description: "更新后的池描述"
    });

    const updatedPool = await poolService.getPool(createdPool.id);
    expect(updatedPool).toMatchObject({
      id: createdPool.id,
      name: "更新后的池名",
      description: "更新后的池描述"
    });

    const state = await workflow.loadPoolState({
      poolId: createdPool.id,
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });

    expect(state.pool.title).toBe("更新后的池名");
    expect(state.pool.description).toBe("更新后的池描述");
  });

  it("loads pool markdown preview from the injected runtime source instead of local pool listing", async () => {
    const ideaService = createIdeaService();
    const listByPoolSpy = vi.spyOn(ideaService, "listByPool");
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const researchPool = await poolService.createPool({
      name: "研究池",
      description: "研究素材"
    });
    const archivePool = await poolService.createPool({
      name: "归档池"
    });

    const alpha = buildIdea({
      id: "alpha",
      title: "Alpha idea",
      body: "alpha body",
      poolId: researchPool.id,
      createdAt: "2026-05-16T08:00:00.000Z",
      updatedAt: "2026-05-16T09:00:00.000Z"
    });
    const zulu = buildIdea({
      id: "zulu",
      title: "Zulu idea",
      body: "zulu body",
      poolId: researchPool.id,
      createdAt: "2026-05-16T08:10:00.000Z",
      updatedAt: "2026-05-16T10:00:00.000Z"
    });
    const otherPoolIdea = buildIdea({
      id: "archive",
      title: "Archive idea",
      body: "archive body",
      poolId: archivePool.id,
      createdAt: "2026-05-16T08:20:00.000Z",
      updatedAt: "2026-05-16T11:00:00.000Z"
    });
    const ideaRuntimeSource = {
      listIdeas: vi.fn(async () => [zulu, otherPoolIdea, alpha])
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/池导出/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault,
      ideaRuntimeSource
    } as any);

    const preview = await workflow.loadPoolMarkdownPreview({
      poolId: researchPool.id,
      sort: "title-asc"
    });

    expect(ideaRuntimeSource.listIdeas).toHaveBeenCalledTimes(1);
    expect(listByPoolSpy).not.toHaveBeenCalled();
    expect(preview).toEqual({
      poolId: researchPool.id,
      poolTitle: researchPool.name,
      markdown: buildPoolMarkdownDocument({
        pool: { name: researchPool.name },
        ideas: [alpha, zulu]
      })
    });
  });

  it("loads pool markdown preview for the current pool using the requested sort", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const researchPool = await poolService.createPool({
      name: "研究池",
      description: "研究素材"
    });
    const archivePool = await poolService.createPool({
      name: "归档池"
    });

    const zulu = await ideaService.createIdea({
      title: "Zulu idea",
      body: "zulu body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: researchPool.id
    });
    const alpha = await ideaService.createIdea({
      title: "Alpha idea",
      body: "alpha body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: researchPool.id
    });
    await ideaService.createIdea({
      title: "Archive idea",
      body: "other pool body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: archivePool.id
    });
    await ideaService.markFileCreated(zulu.id, "Glitter/Missing preview file.md");

    const vaultFileStore = {
      ensureFolder: vi.fn(async () => undefined),
      createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/池导出/${fileName}.md`),
      buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: vaultFileStore as any,
      vault
    });

    const preview = await workflow.loadPoolMarkdownPreview({
      poolId: researchPool.id,
      sort: "title-asc"
    });

    const refreshedAlpha = await ideaService.getIdea(alpha.id);
    const refreshedZulu = await ideaService.getIdea(zulu.id);

    expect(preview).toEqual({
      poolId: researchPool.id,
      poolTitle: researchPool.name,
      markdown: buildPoolMarkdownDocument({
        pool: { name: researchPool.name },
        ideas: [refreshedAlpha!, refreshedZulu!]
      })
    });
    expect(await ideaService.getIdea(zulu.id)).toMatchObject({
      fileCreated: false,
      filePath: undefined
    });
    expect(vaultFileStore.createUniquePath).not.toHaveBeenCalled();
    expect(vault.create).not.toHaveBeenCalled();
  });

  it("keeps updated-desc preview order when stale file reconciliation clears an older idea", async () => {
    vi.useFakeTimers();

    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const previewPool = await poolService.createPool({
      name: "预览池"
    });

    vault.getAbstractFileByPath.mockImplementation(() => null);

    vi.setSystemTime(new Date("2026-05-02T08:00:00.000Z"));
    const older = await ideaService.createIdea({
      title: "Older stale idea",
      body: "older body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: previewPool.id
    });
    vi.setSystemTime(new Date("2026-05-02T08:30:00.000Z"));
    await ideaService.markFileCreated(older.id, "Glitter/Missing preview file.md");

    vi.setSystemTime(new Date("2026-05-02T09:00:00.000Z"));
    const newer = await ideaService.createIdea({
      title: "Newer idea",
      body: "newer body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: previewPool.id
    });

    vi.setSystemTime(new Date("2026-05-02T10:00:00.000Z"));

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/池导出/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault
    });

    const preview = await workflow.loadPoolMarkdownPreview({
      poolId: previewPool.id,
      sort: "updated-desc"
    });

    const refreshedOlder = await ideaService.getIdea(older.id);
    const refreshedNewer = await ideaService.getIdea(newer.id);

    expect(preview).toEqual({
      poolId: previewPool.id,
      poolTitle: previewPool.name,
      markdown: buildPoolMarkdownDocument({
        pool: { name: previewPool.name },
        ideas: [refreshedNewer!, refreshedOlder!]
      })
    });
    expect(refreshedOlder).toMatchObject({
      fileCreated: false,
      filePath: undefined,
      updatedAt: "2026-05-02T10:00:00.000Z"
    });
  });

  it("saves a combined pool markdown file under Glitter/池导出 using a unique pool title path", async () => {
    vi.useFakeTimers();

    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();
    const exportPool = await poolService.createPool({
      name: "导出池"
    });
    const otherPool = await poolService.createPool({
      name: "其他池"
    });

    vi.setSystemTime(new Date("2026-05-01T08:00:00.000Z"));
    const older = await ideaService.createIdea({
      title: "Older idea",
      body: "older body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: exportPool.id
    });
    vi.setSystemTime(new Date("2026-05-01T09:00:00.000Z"));
    const newer = await ideaService.createIdea({
      title: "Newer idea",
      body: "newer body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: exportPool.id
    });
    vi.setSystemTime(new Date("2026-05-01T10:00:00.000Z"));
    await ideaService.createIdea({
      title: "Other pool idea",
      body: "should not be exported",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: otherPool.id
    });
    await ideaService.markFileCreated(older.id, "Glitter/Missing export file.md");

    const vaultFileStore = {
      ensureFolder: vi.fn(async () => undefined),
      createUniquePath: vi.fn(async () => "Glitter/池导出/导出池-1.md"),
      buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: vaultFileStore as any,
      vault
    });

    const result = await workflow.savePoolMarkdownFile({
      poolId: exportPool.id,
      sort: "created-desc"
    });

    const refreshedOlder = await ideaService.getIdea(older.id);
    const refreshedNewer = await ideaService.getIdea(newer.id);
    const expectedMarkdown = buildPoolMarkdownDocument({
      pool: { name: exportPool.name },
      ideas: [refreshedNewer!, refreshedOlder!]
    });

    expect(result).toEqual({
      filePath: "Glitter/池导出/导出池-1.md",
      poolTitle: exportPool.name
    });
    expect(vaultFileStore.ensureFolder).toHaveBeenCalledWith("Glitter/池导出");
    expect(vaultFileStore.createUniquePath).toHaveBeenCalledWith("Glitter/池导出", exportPool.name, ".md");
    expect(vault.create).toHaveBeenCalledWith("Glitter/池导出/导出池-1.md", expectedMarkdown);
    expect(createdFiles[0]).toEqual({
      path: "Glitter/池导出/导出池-1.md",
      content: expectedMarkdown
    });
    expect(vaultFileStore.buildIdeaFileContent).not.toHaveBeenCalled();
    expect(await ideaService.getIdea(older.id)).toMatchObject({
      fileCreated: false,
      filePath: undefined
    });
  });

  it("wires roam board lifecycle through the workbench workflow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00"));

    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const folders = new Set<string>();
    const fileContents = new Map<string, string>();

    const localVault = {
      getAbstractFileByPath: vi.fn((path: string) => {
        if (fileContents.has(path)) {
          return {
            path,
            basename: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path,
            stat: { mtime: 1 }
          };
        }

        if (folders.has(path)) {
          return { path, children: [] };
        }

        return null;
      }),
      createFolder: vi.fn(async (path: string) => {
        const parts = path.split("/").filter(Boolean);
        let current = "";

        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          folders.add(current);
        }

        return { path, children: [] };
      }),
      create: vi.fn(async (path: string, content: string) => {
        fileContents.set(path, content);
        return { path };
      }),
      getFiles: vi.fn(() =>
        Array.from(fileContents.keys()).map((path) => ({
          path,
          basename: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path,
          stat: { mtime: 1 }
        }))
      ),
      read: vi.fn(async (file: { path: string }) => fileContents.get(file.path) ?? ""),
      modify: vi.fn(async (file: { path: string }, content: string) => {
        fileContents.set(file.path, content);
        return file;
      })
    } as any;

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault: localVault,
      resolveRoamBoardStorageDirectory: () => "Glitter/灵感漫游"
    });

    const board = await workflow.attachIdeaSourceToNewRoamBoard({
      ideaId: "idea-1",
      poolId: "pool-default",
      poolName: "默认池",
      poolColor: "#6ab5ff",
      title: "工作流来源",
      body: "通过工作流创建白板",
      contentType: "text",
      sourceUrl: undefined,
      attachmentPaths: []
    });

    expect(board.path).toBe("Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas");

    const records = await workflow.listPoolRoamBoards();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      path: "Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas",
      name: "Glitter灵感漫游 2026-05-27 10:00",
      relatedPools: [{ id: "pool-default", name: "默认池", color: "#6ab5ff" }]
    });
  });

  it("reads the latest roam board directory from the resolver on each workflow call", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00"));

    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const folders = new Set<string>();
    const fileContents = new Map<string, string>();

    const localVault = {
      getAbstractFileByPath: vi.fn((path: string) => {
        if (fileContents.has(path)) {
          return {
            path,
            basename: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path,
            stat: { mtime: 1 }
          };
        }

        if (folders.has(path)) {
          return { path, children: [] };
        }

        return null;
      }),
      createFolder: vi.fn(async (path: string) => {
        const parts = path.split("/").filter(Boolean);
        let current = "";

        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          folders.add(current);
        }

        return { path, children: [] };
      }),
      create: vi.fn(async (path: string, content: string) => {
        fileContents.set(path, content);
        return { path };
      }),
      getFiles: vi.fn(() =>
        Array.from(fileContents.keys()).map((path) => ({
          path,
          basename: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path,
          stat: { mtime: 1 }
        }))
      ),
      read: vi.fn(async (file: { path: string }) => fileContents.get(file.path) ?? ""),
      modify: vi.fn(async (file: { path: string }, content: string) => {
        fileContents.set(file.path, content);
        return file;
      })
    } as any;

    let roamBoardStorageDirectory = "Glitter/灵感漫游-A";
    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
      } as any,
      vault: localVault,
      resolveRoamBoardStorageDirectory: () => roamBoardStorageDirectory
    });

    const firstBoard = await workflow.attachIdeaSourceToNewRoamBoard({
      ideaId: "idea-a",
      poolId: "pool-default",
      poolName: "默认池",
      poolColor: "#6ab5ff",
      title: "目录 A",
      body: "A 内容",
      contentType: "text",
      sourceUrl: undefined,
      attachmentPaths: []
    });
    expect(firstBoard.path).toBe("Glitter/灵感漫游-A/Glitter灵感漫游 2026-05-27 10：00.canvas");

    roamBoardStorageDirectory = "Glitter/灵感漫游-B";

    const secondBoard = await workflow.attachIdeaSourceToNewRoamBoard({
      ideaId: "idea-b",
      poolId: "pool-default",
      poolName: "默认池",
      poolColor: "#6ab5ff",
      title: "目录 B",
      body: "B 内容",
      contentType: "text",
      sourceUrl: undefined,
      attachmentPaths: []
    });
    expect(secondBoard.path).toBe("Glitter/灵感漫游-B/Glitter灵感漫游 2026-05-27 10：00.canvas");

    const records = await workflow.listPoolRoamBoards();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      path: "Glitter/灵感漫游-B/Glitter灵感漫游 2026-05-27 10：00.canvas",
      name: "Glitter灵感漫游 2026-05-27 10:00",
      relatedPools: [{ id: "pool-default", name: "默认池", color: "#6ab5ff" }]
    });
  });

  it("syncs a single idea source block across every referencing roam board", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T10:00:00.000Z"));

    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    const defaultPool = await poolService.ensureDefaultPool();
    const idea = await ideaService.createIdea({
      title: "Old roam title",
      body: "Old roam body",
      contentType: "link",
      sourceType: "manual",
      sourceUrl: "https://old.example.com",
      attachmentPaths: ["Attachments/old-reference.pdf"],
      tags: [],
      poolId: defaultPool.id
    });
    const otherIdea = await ideaService.createIdea({
      title: "Other roam title",
      body: "Other roam body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: defaultPool.id
    });
    const { vault: localVault } = createRoamVaultHarness();

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault: localVault,
      resolveRoamBoardStorageDirectory: () => "Glitter/灵感漫游"
    });

    const firstBoard = await workflow.attachIdeaSourceToNewRoamBoard({
      ideaId: idea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: idea.title,
      body: idea.body,
      contentType: idea.contentType,
      sourceUrl: idea.sourceUrl,
      attachmentPaths: idea.attachmentPaths
    });
    await workflow.attachIdeaSourceToRoamBoard({
      boardPath: firstBoard.path,
      ideaId: idea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: idea.title,
      body: idea.body,
      contentType: idea.contentType,
      sourceUrl: idea.sourceUrl,
      attachmentPaths: idea.attachmentPaths
    });
    const secondBoard = await workflow.attachIdeaSourceToNewRoamBoard({
      ideaId: idea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: idea.title,
      body: idea.body,
      contentType: idea.contentType,
      sourceUrl: idea.sourceUrl,
      attachmentPaths: idea.attachmentPaths
    });
    await workflow.attachIdeaSourceToRoamBoard({
      boardPath: firstBoard.path,
      ideaId: otherIdea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: otherIdea.title,
      body: otherIdea.body,
      contentType: otherIdea.contentType,
      sourceUrl: otherIdea.sourceUrl,
      attachmentPaths: otherIdea.attachmentPaths
    });

    await ideaService.updateIdea(idea.id, {
      title: "New roam title",
      body: "New roam body",
      sourceUrl: "https://new.example.com",
      attachmentPaths: ["Attachments/new-reference.pdf"],
      markEdited: true
    });

    const updatedBoards = await workflow.syncIdeaSourceInRoamBoards(idea.id);

    const firstBoardAfterSync = await workflow.readPoolRoamBoard({ boardPath: firstBoard.path });
    const secondBoardAfterSync = await workflow.readPoolRoamBoard({ boardPath: secondBoard.path });
    const firstBoardBlocks = collectRoamBlocksForIdea(firstBoardAfterSync.canvas, idea.id);
    const secondBoardBlocks = collectRoamBlocksForIdea(secondBoardAfterSync.canvas, idea.id);
    const syncedBlocks = [...firstBoardBlocks, ...secondBoardBlocks];

    expect(updatedBoards).toBe(2);
    expect(firstBoardBlocks).toHaveLength(2);
    expect(secondBoardBlocks).toHaveLength(1);
    syncedBlocks.forEach((block) => {
      expect(block.sourceContent).toEqual({
        title: "New roam title",
        body: "New roam body",
        contentType: "link",
        sourceUrl: "https://new.example.com",
        attachmentPaths: ["Attachments/new-reference.pdf"]
      });
      expect(block.rootNode?.glitterSource).toMatchObject({
        ideaId: idea.id,
        ideaTitle: "New roam title",
        status: "active"
      });
    });

    const otherIdeaBlocks = collectRoamBlocksForIdea(firstBoardAfterSync.canvas, otherIdea.id);
    expect(otherIdeaBlocks).toHaveLength(1);
    expect(otherIdeaBlocks[0]?.sourceContent).toMatchObject({
      title: "Other roam title",
      body: "Other roam body",
      contentType: "text",
      attachmentPaths: []
    });
  });

  it("keeps syncing later roam boards after one board write fails and then throws", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T10:30:00.000Z"));

    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    const defaultPool = await poolService.ensureDefaultPool();
    const idea = await ideaService.createIdea({
      title: "Old roam title",
      body: "Old roam body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: defaultPool.id
    });
    const { vault: localVault } = createRoamVaultHarness();

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault: localVault,
      resolveRoamBoardStorageDirectory: () => "Glitter/灵感漫游"
    });

    const firstBoard = await workflow.attachIdeaSourceToNewRoamBoard({
      ideaId: idea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: idea.title,
      body: idea.body,
      contentType: idea.contentType,
      sourceUrl: idea.sourceUrl,
      attachmentPaths: idea.attachmentPaths
    });
    const failedBoard = await workflow.attachIdeaSourceToNewRoamBoard({
      ideaId: idea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: idea.title,
      body: idea.body,
      contentType: idea.contentType,
      sourceUrl: idea.sourceUrl,
      attachmentPaths: idea.attachmentPaths
    });
    const laterBoard = await workflow.attachIdeaSourceToNewRoamBoard({
      ideaId: idea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: idea.title,
      body: idea.body,
      contentType: idea.contentType,
      sourceUrl: idea.sourceUrl,
      attachmentPaths: idea.attachmentPaths
    });

    const originalModify = localVault.modify;
    localVault.modify = vi.fn(async (file: { path: string }, content: string) => {
      if (file.path === failedBoard.path) {
        throw new Error("simulated board write failure");
      }
      return originalModify(file, content);
    });

    await ideaService.updateIdea(idea.id, {
      title: "New roam title",
      body: "New roam body",
      markEdited: true
    });

    let syncError: unknown;
    try {
      await workflow.syncIdeaSourceInRoamBoards(idea.id);
    } catch (error) {
      syncError = error;
    }

    expect(syncError).toBeInstanceOf(Error);
    expect((syncError as Error).message).toContain(failedBoard.path);

    const firstBoardAfterSync = await workflow.readPoolRoamBoard({ boardPath: firstBoard.path });
    const failedBoardAfterSync = await workflow.readPoolRoamBoard({ boardPath: failedBoard.path });
    const laterBoardAfterSync = await workflow.readPoolRoamBoard({ boardPath: laterBoard.path });

    expect(collectRoamBlocksForIdea(firstBoardAfterSync.canvas, idea.id)[0]?.sourceContent).toMatchObject({
      title: "New roam title",
      body: "New roam body"
    });
    expect(collectRoamBlocksForIdea(failedBoardAfterSync.canvas, idea.id)[0]?.sourceContent).toMatchObject({
      title: "Old roam title",
      body: "Old roam body"
    });
    expect(collectRoamBlocksForIdea(laterBoardAfterSync.canvas, idea.id)[0]?.sourceContent).toMatchObject({
      title: "New roam title",
      body: "New roam body"
    });
  });

  it("marks roam source blocks as missing instead of removing them when deleting an idea", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T11:00:00.000Z"));

    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    const defaultPool = await poolService.ensureDefaultPool();
    const idea = await ideaService.createIdea({
      title: "Delete roam title",
      body: "Delete roam body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: defaultPool.id
    });
    const otherIdea = await ideaService.createIdea({
      title: "Keep roam title",
      body: "Keep roam body",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: defaultPool.id
    });
    const { vault: localVault } = createRoamVaultHarness();

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault: localVault,
      resolveRoamBoardStorageDirectory: () => "Glitter/灵感漫游"
    });

    const board = await workflow.attachIdeaSourceToNewRoamBoard({
      ideaId: idea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: idea.title,
      body: idea.body,
      contentType: idea.contentType,
      sourceUrl: idea.sourceUrl,
      attachmentPaths: idea.attachmentPaths
    });
    await workflow.attachIdeaSourceToRoamBoard({
      boardPath: board.path,
      ideaId: idea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: idea.title,
      body: idea.body,
      contentType: idea.contentType,
      sourceUrl: idea.sourceUrl,
      attachmentPaths: idea.attachmentPaths
    });
    await workflow.attachIdeaSourceToRoamBoard({
      boardPath: board.path,
      ideaId: otherIdea.id,
      poolId: defaultPool.id,
      poolName: defaultPool.name,
      poolColor: "#6ab5ff",
      title: otherIdea.title,
      body: otherIdea.body,
      contentType: otherIdea.contentType,
      sourceUrl: otherIdea.sourceUrl,
      attachmentPaths: otherIdea.attachmentPaths
    });

    const boardBeforeDelete = await workflow.readPoolRoamBoard({ boardPath: board.path });
    const deletedRootNodeIdsBefore = collectRoamBlocksForIdea(boardBeforeDelete.canvas, idea.id)
      .map((block) => block.rootNode?.id)
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    const nodeCountBeforeDelete = boardBeforeDelete.canvas.nodes.length;

    await workflow.deleteIdea(idea.id);

    const boardAfterDelete = await workflow.readPoolRoamBoard({ boardPath: board.path });
    const deletedBlocks = collectRoamBlocksForIdea(boardAfterDelete.canvas, idea.id);

    expect(await ideaService.getIdea(idea.id)).toBeNull();
    expect(deletedBlocks).toHaveLength(2);
    expect(deletedBlocks.map((block) => block.rootNode?.id)).toEqual(deletedRootNodeIdsBefore);
    expect(boardAfterDelete.canvas.nodes).toHaveLength(nodeCountBeforeDelete);
    deletedBlocks.forEach((block) => {
      expect(block.rootNode?.glitterSource).toMatchObject({
        ideaId: idea.id,
        status: "missing"
      });
    });

    const otherIdeaBlocks = collectRoamBlocksForIdea(boardAfterDelete.canvas, otherIdea.id);
    expect(otherIdeaBlocks).toHaveLength(1);
    expect(otherIdeaBlocks[0]?.rootNode?.glitterSource).toMatchObject({
      ideaId: otherIdea.id,
      status: "active"
    });
  });

  it("creates idea file and marks idea as file-created", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const idea = await ideaService.createIdea({
      title: "File idea",
      body: "Body text",
      contentType: "text",
      sourceType: "manual",
      tags: ["tag"],
      poolId: "pool-default"
    });

    const vaultFileStore = {
      ensureFolder: vi.fn(async () => undefined),
      createUniquePath: vi.fn(async (_folder: string, fileName: string) => `记录层/Glitter/${fileName}.md`),
      buildIdeaFileContent: vi.fn((idea: { title: string; body: string }) => `# ${idea.title}\n\n${idea.body}`)
    };

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: vaultFileStore as any,
      vault,
      resolveFileStorageDirectory: () => "记录层/Glitter"
    });

    const result = await workflow.createIdeaFile(idea.id);

    expect(vaultFileStore.ensureFolder).toHaveBeenCalledWith("记录层/Glitter");
    expect(vaultFileStore.createUniquePath).toHaveBeenCalledWith("记录层/Glitter", "File idea", ".md");
    expect(result.filePath).toBe("记录层/Glitter/File idea.md");
    expect(vault.create).toHaveBeenCalledTimes(1);
    expect(createdFiles[0]?.content).toContain("# File idea");

    const updated = await ideaService.getIdea(idea.id);
    expect(updated?.fileCreated).toBe(true);
    expect(updated?.filePath).toBe("记录层/Glitter/File idea.md");
  });

  it("deletes idea through workflow so pool cards can remove drafts", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    await poolService.ensureDefaultPool();

    const idea = await ideaService.createIdea({
      title: "Delete me",
      body: "Body text",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault
    });

    await workflow.deleteIdea(idea.id);

    expect(await ideaService.getIdea(idea.id)).toBeNull();
    const state = await workflow.loadPoolState({
      poolId: "pool-default",
      query: "",
      status: "all",
      contentFilter: "all",
      sort: "updated-desc",
      selectedIdeaIds: []
    });
    expect(state.cards.some((card) => card.id === idea.id)).toBe(false);
  });

  it("calls the move hook so open markdown snippets can refresh after pool changes", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    const onIdeasMoved = vi.fn();
    await poolService.ensureDefaultPool();
    const targetPool = await poolService.createPool({ name: "设计" });

    const idea = await ideaService.createIdea({
      title: "Move me",
      body: "Body text",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault,
      onIdeasMoved
    });

    await workflow.moveIdeasToPool([idea.id], targetPool.id);

    expect(onIdeasMoved).toHaveBeenCalledWith([idea.id]);
  });

  it("calls the delete hook so open markdown snippets can refresh after idea removal", async () => {
    const ideaService = createIdeaService();
    const poolService = createPoolService([], () => ideaService.listIdeas());
    const onIdeaDeleted = vi.fn();
    await poolService.ensureDefaultPool();

    const idea = await ideaService.createIdea({
      title: "Delete me too",
      body: "Body text",
      contentType: "text",
      sourceType: "manual",
      tags: [],
      poolId: "pool-default"
    });

    const workflow = createPoolWorkbenchWorkflow({
      poolService,
      ideaService,
      vaultFileStore: {
        ensureFolder: vi.fn(async () => undefined),
        createUniquePath: vi.fn(async (_folder: string, fileName: string) => `Glitter/${fileName}.md`),
        buildIdeaFileContent: vi.fn((entry: { title: string; body: string }) => `# ${entry.title}\n\n${entry.body}`)
      } as any,
      vault,
      onIdeaDeleted
    });

    await workflow.deleteIdea(idea.id);

    expect(onIdeaDeleted).toHaveBeenCalledWith(idea.id);
  });
});
