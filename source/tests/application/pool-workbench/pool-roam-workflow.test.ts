import { describe, expect, it, vi } from "vitest";
import {
  createPoolRoamWorkflow,
  type PoolRoamAttachSourceInput
} from "../../../src/application/pool-workbench/pool-roam-workflow";

function createSettings(boardStorageDirectory = "Glitter/灵感漫游") {
  return {
    roam: {
      boardStorageDirectory
    }
  } as any;
}

function buildAttachInput(overrides: Partial<PoolRoamAttachSourceInput> = {}): PoolRoamAttachSourceInput {
  return {
    ideaId: "idea-1",
    poolId: "pool-product",
    poolName: "产品池",
    poolColor: "#6ab5ff",
    title: "灵感标题",
    body: "原始正文",
    contentType: "text",
    sourceUrl: undefined,
    attachmentPaths: [],
    ...overrides
  };
}

function createVaultHarness() {
  const folders = new Set<string>();
  const fileContents = new Map<string, string>();
  const fileMtimes = new Map<string, number>();
  const assetFiles = new Set<string>();
  let nextMtime = 1;

  function ensureFolderChain(path: string): void {
    const parts = path.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      folders.add(current);
    }
  }

  const vault = {
    getAbstractFileByPath: vi.fn((path: string) => {
      if (fileContents.has(path) || assetFiles.has(path)) {
        return {
          path,
          basename: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path,
          stat: {
            mtime: fileMtimes.get(path) ?? 0
          }
        };
      }

      if (folders.has(path)) {
        return {
          path,
          children: []
        };
      }

      return null;
    }),
    getResourcePath: vi.fn((file: { path: string }) => `app://vault/${encodeURIComponent(file.path)}`),
    createFolder: vi.fn(async (path: string) => {
      ensureFolderChain(path);
      return {
        path,
        children: []
      };
    }),
    create: vi.fn(async (path: string, content: string) => {
      fileContents.set(path, content);
      fileMtimes.set(path, nextMtime);
      nextMtime += 1;
      ensureFolderChain(path.split("/").slice(0, -1).join("/"));
      return { path };
    }),
    getFiles: vi.fn(() =>
      Array.from(fileContents.keys()).map((path) => ({
        path,
        basename: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path,
        stat: {
          mtime: fileMtimes.get(path) ?? 0
        }
      }))
    ),
    read: vi.fn(async (file: { path: string }) => fileContents.get(file.path) ?? ""),
    modify: vi.fn(async (file: { path: string }, content: string) => {
      fileContents.set(file.path, content);
      fileMtimes.set(file.path, nextMtime);
      nextMtime += 1;
      return file;
    })
  } as any;

  function seedCanvasFile(path: string, canvas: Record<string, unknown>, mtime = nextMtime): void {
    fileContents.set(path, JSON.stringify(canvas, null, 2));
    fileMtimes.set(path, mtime);
    nextMtime = Math.max(nextMtime, mtime + 1);
    ensureFolderChain(path.split("/").slice(0, -1).join("/"));
  }

  function seedRawCanvasFile(path: string, content: string, mtime = nextMtime): void {
    fileContents.set(path, content);
    fileMtimes.set(path, mtime);
    nextMtime = Math.max(nextMtime, mtime + 1);
    ensureFolderChain(path.split("/").slice(0, -1).join("/"));
  }

  function seedAssetFile(path: string): void {
    assetFiles.add(path);
    ensureFolderChain(path.split("/").slice(0, -1).join("/"));
  }

  return {
    vault,
    seedCanvasFile,
    seedRawCanvasFile,
    seedAssetFile
  };
}

function buildManagedImageSourceCanvas() {
  return {
    nodes: [
      {
        id: "root-1",
        type: "group",
        x: 120,
        y: 80,
        width: 320,
        height: 300,
        glitterSource: {
          ideaId: "idea-image",
          poolId: "pool-a",
          poolName: "产品池",
          poolColor: "#6ab5ff",
          ideaTitle: "图库灵感",
          syncMode: "readonly-follow-source",
          status: "active"
        },
        glitterSourceBlock: {
          sourceBlockId: "source-block-1",
          nodeKey: "source-block-1:root",
          sourceId: "idea-image",
          kind: "image",
          role: "root"
        }
      },
      {
        id: "caption-1",
        type: "text",
        x: 120,
        y: 80,
        width: 320,
        height: 88,
        text: "> [!glitter-source] 图库灵感\n> 两张图",
        glitterSourceBlock: {
          sourceBlockId: "source-block-1",
          nodeKey: "source-block-1:caption",
          sourceId: "idea-image",
          kind: "image",
          role: "caption"
        }
      },
      {
        id: "image-1",
        type: "file",
        file: "Assets/a.png",
        x: 120,
        y: 180,
        width: 156,
        height: 104,
        glitterSourceBlock: {
          sourceBlockId: "source-block-1",
          nodeKey: "source-block-1:image:Assets/a.png:0",
          sourceId: "idea-image",
          kind: "image",
          role: "image",
          attachmentPath: "Assets/a.png",
          attachmentIndex: 0
        }
      },
      {
        id: "image-2",
        type: "file",
        file: "Assets/b.png",
        x: 284,
        y: 180,
        width: 156,
        height: 104,
        glitterSourceBlock: {
          sourceBlockId: "source-block-1",
          nodeKey: "source-block-1:image:Assets/b.png:0",
          sourceId: "idea-image",
          kind: "image",
          role: "image",
          attachmentPath: "Assets/b.png",
          attachmentIndex: 1
        }
      },
      {
        id: "plain-1",
        type: "text",
        text: "旁注",
        x: 560,
        y: 96,
        width: 180,
        height: 120
      }
    ],
    edges: [
      { id: "edge-root-note", fromNode: "root-1", toNode: "plain-1" },
      { id: "edge-caption-note", fromNode: "caption-1", toNode: "plain-1" },
      { id: "edge-image-note", fromNode: "image-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" }
    ]
  };
}

function buildManagedTextSourceCanvas() {
  return {
    nodes: [
      {
        id: "root-text-1",
        type: "text",
        text: "> [!glitter-source] 文本灵感\n> 原始正文",
        x: 120,
        y: 80,
        width: 320,
        height: 136,
        glitterSource: {
          ideaId: "idea-text",
          poolId: "pool-a",
          poolName: "产品池",
          poolColor: "#6ab5ff",
          ideaTitle: "文本灵感",
          syncMode: "readonly-follow-source",
          status: "active"
        },
        glitterSourceBlock: {
          sourceBlockId: "source-block-text-1",
          nodeKey: "source-block-text-1:root",
          sourceId: "idea-text",
          kind: "text",
          role: "root"
        }
      },
      {
        id: "plain-1",
        type: "text",
        text: "旁注",
        x: 560,
        y: 96,
        width: 180,
        height: 120
      }
    ],
    edges: [
      { id: "edge-root-note", fromNode: "root-text-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" }
    ]
  };
}

describe("createPoolRoamWorkflow", () => {
  it("creates no canvas file before the first source drop", async () => {
    const { vault } = createVaultHarness();
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings()
    });

    await expect(workflow.listRoamBoards()).resolves.toEqual([]);
    expect(vault.create).not.toHaveBeenCalled();
  });

  it("creates a managed text source block on first source attach", async () => {
    const { vault } = createVaultHarness();
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings(),
      clock: () => new Date("2026-05-27T10:00:00")
    });

    const board = await workflow.attachIdeaSourceToNewBoard(buildAttachInput());

    expect(board.path).toBe("Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas");
    expect(board.canvas.nodes).toHaveLength(1);
    expect(board.canvas.nodes[0]).toMatchObject({
      type: "text",
      text: "> [!glitter-source] 灵感标题\n> 原始正文",
      glitterSource: {
        ideaId: "idea-1",
        poolId: "pool-product",
        poolName: "产品池",
        poolColor: "#6ab5ff",
        ideaTitle: "灵感标题",
        syncMode: "readonly-follow-source",
        status: "active"
      },
      glitterSourceBlock: {
        role: "root",
        kind: "text",
        sourceId: "idea-1"
      }
    });
    expect(vault.create).toHaveBeenCalledWith(
      "Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas",
      JSON.stringify(board.canvas, null, 2)
    );
  });

  it("appends a composite image source block to an existing board", async () => {
    const { vault, seedAssetFile, seedCanvasFile } = createVaultHarness();
    seedAssetFile("assets/cover.png");
    seedAssetFile("assets/detail.png");
    seedCanvasFile("Glitter/灵感漫游/current.canvas", {
      nodes: [
        {
          id: "note-1",
          type: "text",
          text: "旁注",
          x: 24,
          y: 48,
          width: 280,
          height: 180
        }
      ],
      edges: []
    });
    const measureMediaSize = vi.fn(async ({ resourceUrl }: { resourceUrl: string; mediaType: "image" | "video" }) => {
      if (resourceUrl.includes(encodeURIComponent("assets/cover.png"))) {
        return { width: 1600, height: 900 };
      }

      if (resourceUrl.includes(encodeURIComponent("assets/detail.png"))) {
        return { width: 900, height: 900 };
      }

      return null;
    });
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings(),
      measureMediaSize
    });

    const result = await workflow.attachIdeaSourceToBoard({
      ...buildAttachInput({
        ideaId: "idea-image",
        title: "图片灵感",
        body: "图片说明",
        contentType: "image",
        attachmentPaths: ["assets/cover.png", "assets/detail.png"]
      }),
      boardPath: "Glitter/灵感漫游/current.canvas"
    });

    expect(measureMediaSize).toHaveBeenCalledTimes(2);
    expect(measureMediaSize).toHaveBeenNthCalledWith(1, {
      mediaType: "image",
      resourceUrl: `app://vault/${encodeURIComponent("assets/cover.png")}`
    });
    expect(measureMediaSize).toHaveBeenNthCalledWith(2, {
      mediaType: "image",
      resourceUrl: `app://vault/${encodeURIComponent("assets/detail.png")}`
    });
    expect(result.path).toBe("Glitter/灵感漫游/current.canvas");
    expect(result.canvas.nodes).toHaveLength(5);
    expect(result.canvas.nodes.map((node) => node.type)).toEqual(["text", "group", "text", "file", "file"]);
    expect(result.canvas.nodes[1]).toMatchObject({
      type: "group",
      x: 400,
      y: 48,
      glitterSource: {
        ideaId: "idea-image",
        poolId: "pool-product",
        poolName: "产品池",
        poolColor: "#6ab5ff",
        ideaTitle: "图片灵感",
        syncMode: "readonly-follow-source",
        status: "active"
      },
      glitterSourceBlock: {
        role: "root",
        kind: "image",
        sourceId: "idea-image"
      }
    });
    expect(result.canvas.nodes[2]).toMatchObject({
      type: "text",
      x: 400,
      y: 48,
      text: "> [!glitter-source] 图片灵感\n> 图片说明",
      glitterSourceBlock: {
        role: "caption",
        kind: "image",
        sourceId: "idea-image"
      }
    });
    expect(result.canvas.nodes[2]?.glitterSource).toBeUndefined();
    expect(result.canvas.nodes.slice(3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          file: "assets/cover.png",
          glitterSourceBlock: expect.objectContaining({ role: "image", attachmentPath: "assets/cover.png" })
        }),
        expect.objectContaining({
          type: "file",
          file: "assets/detail.png",
          glitterSourceBlock: expect.objectContaining({ role: "image", attachmentPath: "assets/detail.png" })
        })
      ])
    );
    expect(result.canvas.nodes.slice(3).every((node) => node.glitterSource === undefined)).toBe(true);
    expect(vault.modify).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Glitter/灵感漫游/current.canvas" }),
      JSON.stringify(result.canvas, null, 2)
    );
  });

  it("creates source nodes even when crypto.randomUUID is unavailable", async () => {
    const { vault } = createVaultHarness();
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings(),
      clock: () => new Date("2026-05-27T10:00:00")
    });
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true
    });

    try {
      const board = await workflow.attachIdeaSourceToNewBoard(
        buildAttachInput({
          ideaId: "idea-fallback",
          title: "缺少 crypto 的灵感"
        })
      );

      expect(board.canvas.nodes[0]?.id).toMatch(/^glitter-roam-/);
      expect(board.canvas.nodes[0]?.glitterSourceBlock?.sourceBlockId).toMatch(/^glitter-roam-source-block-/);
    } finally {
      if (originalCryptoDescriptor) {
        Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor);
      } else {
        delete (globalThis as { crypto?: Crypto }).crypto;
      }
    }
  });

  it("creates a unique board file when the timestamped path already exists", async () => {
    const { vault, seedCanvasFile } = createVaultHarness();
    seedCanvasFile("Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas", {
      nodes: [],
      edges: []
    });
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings(),
      clock: () => new Date("2026-05-27T10:00:00")
    });

    const board = await workflow.attachIdeaSourceToNewBoard(
      buildAttachInput({
        ideaId: "idea-2",
        title: "第二条灵感",
        body: "新的正文"
      })
    );

    expect(board.path).toBe("Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00-1.canvas");
    expect(vault.create).toHaveBeenCalledWith(
      "Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00-1.canvas",
      JSON.stringify(board.canvas, null, 2)
    );
  });

  it("keeps the saved board path safe while exposing the requested display title", async () => {
    const { vault, seedCanvasFile } = createVaultHarness();
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings()
    });

    seedCanvasFile("Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas", {
      nodes: [],
      edges: []
    });

    await expect(workflow.listRoamBoards()).resolves.toEqual([
      expect.objectContaining({
        path: "Glitter/灵感漫游/Glitter灵感漫游 2026-05-27 10：00.canvas",
        name: "Glitter灵感漫游 2026-05-27 10:00"
      })
    ]);
  });

  it("lists all roam boards with related pool tags and thumbnail boxes", async () => {
    const { vault, seedCanvasFile } = createVaultHarness();
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings()
    });

    seedCanvasFile("Glitter/灵感漫游/board-a.canvas", {
      nodes: [
        {
          id: "node-1",
          type: "text",
          text: "内容 A",
          x: 24,
          y: 48,
          width: 280,
          height: 180,
          glitterSource: {
            ideaId: "idea-a",
            poolId: "pool-a",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "内容 A",
            syncMode: "readonly-follow-source",
            status: "active"
          }
        },
        {
          id: "node-2",
          type: "text",
          text: "旁注",
          x: 360,
          y: 64,
          width: 180,
          height: 120
        }
      ],
      edges: [
        {
          id: "edge-1",
          fromNode: "node-1",
          toNode: "node-2"
        }
      ]
    });
    seedCanvasFile("Glitter/其它目录/ignored.canvas", {
      nodes: [],
      edges: []
    });

    const records = await workflow.listRoamBoards();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      path: "Glitter/灵感漫游/board-a.canvas",
      name: "board-a",
      relatedPools: [{ id: "pool-a", name: "产品池", color: "#6ab5ff" }],
      thumbnailBoxes: [
        { nodeId: "node-1", x: 24, y: 48, width: 280, height: 180, kind: "source" },
        { nodeId: "node-2", x: 360, y: 64, width: 180, height: 120, kind: "plain" }
      ],
      thumbnailEdges: [{ fromNodeId: "node-1", toNodeId: "node-2" }]
    });
  });

  it("aggregates a managed composite media source block into one logical thumbnail box keyed by sourceBlockId", async () => {
    const { vault, seedCanvasFile } = createVaultHarness();
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings()
    });

    seedCanvasFile("Glitter/灵感漫游/composite.canvas", buildManagedImageSourceCanvas());

    const records = await workflow.listRoamBoards();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      path: "Glitter/灵感漫游/composite.canvas",
      name: "composite",
      relatedPools: [{ id: "pool-a", name: "产品池", color: "#6ab5ff" }],
      thumbnailBoxes: [
        { nodeId: "source-block-1", x: 120, y: 80, width: 320, height: 300, kind: "source" },
        { nodeId: "plain-1", x: 560, y: 96, width: 180, height: 120, kind: "plain" }
      ],
      thumbnailEdges: [{ fromNodeId: "source-block-1", toNodeId: "plain-1" }]
    });
    expect(records[0]?.thumbnailBoxes).toHaveLength(2);
    expect(records[0]?.thumbnailEdges).toHaveLength(1);
  });

  it("keeps damaged historical boards visible while isolating their metadata parsing failures", async () => {
    const { vault, seedCanvasFile, seedRawCanvasFile } = createVaultHarness();
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings()
    });

    seedCanvasFile(
      "Glitter/灵感漫游/healthy.canvas",
      {
        nodes: [],
        edges: []
      },
      2
    );
    seedRawCanvasFile("Glitter/灵感漫游/broken.canvas", "{not-json}", 3);

    const records = await workflow.listRoamBoards();

    expect(records).toEqual([
      {
        path: "Glitter/灵感漫游/broken.canvas",
        name: "broken",
        updatedAt: 3,
        relatedPools: [],
        thumbnailBoxes: [],
        thumbnailEdges: []
      },
      {
        path: "Glitter/灵感漫游/healthy.canvas",
        name: "healthy",
        updatedAt: 2,
        relatedPools: [],
        thumbnailBoxes: [],
        thumbnailEdges: []
      }
    ]);
  });

  it("deletes a roam source block and its connected edges", async () => {
    const { vault, seedCanvasFile } = createVaultHarness();
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings()
    });

    seedCanvasFile("Glitter/灵感漫游/board-a.canvas", {
      nodes: [
        {
          id: "node-1",
          type: "text",
          text: "内容 A",
          glitterSource: {
            ideaId: "idea-a",
            poolId: "pool-a",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "内容 A",
            syncMode: "readonly-follow-source",
            status: "active"
          }
        },
        {
          id: "node-2",
          type: "text",
          text: "旁注"
        }
      ],
      edges: [
        { id: "edge-1", fromNode: "node-1", toNode: "node-2" },
        { id: "edge-2", fromNode: "node-2", toNode: "node-3" }
      ]
    });

    const result = await workflow.detachSourceNode({
      boardPath: "Glitter/灵感漫游/board-a.canvas",
      nodeId: "node-1"
    });

    expect(result.path).toBe("Glitter/灵感漫游/board-a.canvas");
    expect(result.canvas.nodes).toEqual([
      {
        id: "node-2",
        type: "text",
        text: "旁注"
      }
    ]);
    expect(result.canvas.edges).toEqual([{ id: "edge-2", fromNode: "node-2", toNode: "node-3" }]);
    expect(vault.modify).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Glitter/灵感漫游/board-a.canvas" }),
      JSON.stringify(result.canvas, null, 2)
    );
  });

  it("deletes every node in a managed composite source block and removes edges touching any removed child", async () => {
    const { vault, seedCanvasFile } = createVaultHarness();
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings()
    });

    seedCanvasFile("Glitter/灵感漫游/board-image.canvas", {
      nodes: [
        {
          id: "source-root",
          type: "group",
          glitterSource: {
            ideaId: "idea-image",
            poolId: "pool-a",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "图片灵感",
            syncMode: "readonly-follow-source",
            status: "active"
          },
          glitterSourceBlock: {
            sourceBlockId: "source-block-1",
            role: "root"
          }
        },
        {
          id: "source-caption",
          type: "text",
          text: "> [!glitter-source] 图片灵感",
          glitterSourceBlock: {
            sourceBlockId: "source-block-1",
            role: "caption"
          }
        },
        {
          id: "source-file-1",
          type: "file",
          file: "assets/cover.png",
          glitterSourceBlock: {
            sourceBlockId: "source-block-1",
            role: "image"
          }
        },
        {
          id: "note-1",
          type: "text",
          text: "保留旁注"
        }
      ],
      edges: [
        { id: "edge-root-note", fromNode: "source-root", toNode: "note-1" },
        { id: "edge-note-file", fromNode: "note-1", toNode: "source-file-1" },
        { id: "edge-caption-file", fromNode: "source-caption", toNode: "source-file-1" },
        { id: "edge-note-other", fromNode: "note-1", toNode: "other-node" }
      ]
    });

    const result = await workflow.detachSourceNode({
      boardPath: "Glitter/灵感漫游/board-image.canvas",
      nodeId: "source-root"
    });

    expect(result.path).toBe("Glitter/灵感漫游/board-image.canvas");
    expect(result.canvas.nodes).toEqual([
      {
        id: "note-1",
        type: "text",
        text: "保留旁注"
      }
    ]);
    expect(result.canvas.edges).toEqual([{ id: "edge-note-other", fromNode: "note-1", toNode: "other-node" }]);
    expect(vault.modify).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Glitter/灵感漫游/board-image.canvas" }),
      JSON.stringify(result.canvas, null, 2)
    );
  });

  it("normalizes managed source blocks by keeping image-root and image-child edges while removing caption edges", async () => {
    const { vault, seedAssetFile, seedCanvasFile } = createVaultHarness();
    seedAssetFile("Assets/a.png");
    seedAssetFile("Assets/b.png");
    seedCanvasFile("Glitter/灵感漫游/board.canvas", buildManagedImageSourceCanvas());
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings(),
      measureMediaSize: vi.fn(async ({ resourceUrl }: { resourceUrl: string; mediaType: "image" | "video" }) => {
        if (resourceUrl.includes(encodeURIComponent("Assets/a.png"))) {
          return { width: 1600, height: 900 };
        }

        if (resourceUrl.includes(encodeURIComponent("Assets/b.png"))) {
          return { width: 900, height: 900 };
        }

        return null;
      })
    });

    const normalized = await workflow.normalizeManagedSourceBlocks({
      boardPath: "Glitter/灵感漫游/board.canvas"
    });

    expect(normalized.canvas.edges).toEqual([
      { id: "edge-root-note", fromNode: "root-1", toNode: "plain-1" },
      { id: "edge-image-note", fromNode: "image-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" }
    ]);
  });

  it("preserves valid image-root and image-child edges when replacing managed source block content", async () => {
    const { vault, seedAssetFile, seedCanvasFile } = createVaultHarness();
    seedAssetFile("Assets/a.png");
    seedAssetFile("Assets/b.png");
    seedCanvasFile("Glitter/灵感漫游/board.canvas", buildManagedImageSourceCanvas());
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings(),
      measureMediaSize: vi.fn(async ({ resourceUrl }: { resourceUrl: string; mediaType: "image" | "video" }) => {
        if (resourceUrl.includes(encodeURIComponent("Assets/a.png"))) {
          return { width: 1600, height: 900 };
        }

        if (resourceUrl.includes(encodeURIComponent("Assets/b.png"))) {
          return { width: 900, height: 900 };
        }

        return null;
      })
    });

    const replaced = await workflow.replaceSourceNodeContent({
      boardPath: "Glitter/灵感漫游/board.canvas",
      nodeId: "root-1",
      content: {
        title: "图库灵感（已更新）",
        body: "两张图（已更新）",
        contentType: "image",
        sourceUrl: undefined,
        attachmentPaths: ["Assets/a.png", "Assets/b.png"]
      }
    });

    expect(replaced.canvas.edges).toEqual([
      { id: "edge-root-note", fromNode: "root-1", toNode: "plain-1" },
      { id: "edge-image-note", fromNode: "image-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" }
    ]);
    expect(replaced.canvas.nodes.find((node) => node.id === "caption-1")).toMatchObject({
      text: "> [!glitter-source] 图库灵感（已更新）\n> 两张图（已更新）"
    });
  });

  it("marks the rebuilt managed image source block root as missing while preserving valid root and image edges", async () => {
    const { vault, seedAssetFile, seedCanvasFile } = createVaultHarness();
    seedAssetFile("Assets/a.png");
    seedAssetFile("Assets/b.png");
    seedCanvasFile("Glitter/灵感漫游/board.canvas", buildManagedImageSourceCanvas());
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings(),
      measureMediaSize: vi.fn(async ({ resourceUrl }: { resourceUrl: string; mediaType: "image" | "video" }) => {
        if (resourceUrl.includes(encodeURIComponent("Assets/a.png"))) {
          return { width: 1600, height: 900 };
        }

        if (resourceUrl.includes(encodeURIComponent("Assets/b.png"))) {
          return { width: 900, height: 900 };
        }

        return null;
      })
    });

    const marked = await workflow.markSourceNodeMissing({
      boardPath: "Glitter/灵感漫游/board.canvas",
      nodeId: "root-1"
    });

    expect(marked.canvas.edges).toEqual([
      { id: "edge-root-note", fromNode: "root-1", toNode: "plain-1" },
      { id: "edge-image-note", fromNode: "image-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" }
    ]);
    expect(marked.canvas.nodes.find((node) => node.id === "root-1")).toMatchObject({
      glitterSource: expect.objectContaining({
        status: "missing"
      }),
      glitterSourceBlock: expect.objectContaining({
        role: "root"
      })
    });
  });

  it("keeps whole-block root edges and preserves manual text block boundaries across normalize, replace, and missing rewrites", async () => {
    const { vault, seedCanvasFile } = createVaultHarness();
    const canvas = buildManagedTextSourceCanvas() as { nodes: any[]; edges: any[] };
    canvas.nodes[0] = {
      ...canvas.nodes[0],
      x: 96,
      y: 72,
      width: 520,
      height: 260
    };
    seedCanvasFile("Glitter/灵感漫游/text.canvas", canvas);
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings()
    });

    const normalized = await workflow.normalizeManagedSourceBlocks({
      boardPath: "Glitter/灵感漫游/text.canvas"
    });

    expect(normalized.canvas.edges).toEqual([
      { id: "edge-root-note", fromNode: "root-text-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" }
    ]);
    expect(normalized.canvas.nodes.find((node) => node.id === "root-text-1")).toMatchObject({
      x: 96,
      y: 72,
      width: 520,
      height: 260,
      glitterSourceBlock: expect.objectContaining({
        role: "root",
        kind: "text",
        connectorEnabled: true
      })
    });

    const replaced = await workflow.replaceSourceNodeContent({
      boardPath: "Glitter/灵感漫游/text.canvas",
      nodeId: "root-text-1",
      content: {
        title: "文本灵感（已更新）",
        body: "更新正文",
        contentType: "text",
        sourceUrl: undefined,
        attachmentPaths: []
      }
    });

    expect(replaced.canvas.edges).toEqual([
      { id: "edge-root-note", fromNode: "root-text-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" }
    ]);
    expect(replaced.canvas.nodes.find((node) => node.id === "root-text-1")).toMatchObject({
      x: 96,
      y: 72,
      width: 520,
      height: 260,
      text: "> [!glitter-source] 文本灵感（已更新）\n> 更新正文",
      glitterSourceBlock: expect.objectContaining({
        connectorEnabled: true
      })
    });

    const marked = await workflow.markSourceNodeMissing({
      boardPath: "Glitter/灵感漫游/text.canvas",
      nodeId: "root-text-1"
    });

    expect(marked.canvas.edges).toEqual([
      { id: "edge-root-note", fromNode: "root-text-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" }
    ]);
    expect(marked.canvas.nodes.find((node) => node.id === "root-text-1")).toMatchObject({
      x: 96,
      y: 72,
      width: 520,
      height: 260,
      glitterSource: expect.objectContaining({
        status: "missing"
      }),
      glitterSourceBlock: expect.objectContaining({
        connectorEnabled: true
      })
    });
  });

  it("rewrites a managed image source block even when selection starts from a child node", async () => {
    const { vault, seedAssetFile, seedCanvasFile } = createVaultHarness();
    seedAssetFile("Assets/a.png");
    seedAssetFile("Assets/b.png");
    seedCanvasFile("Glitter/灵感漫游/board.canvas", buildManagedImageSourceCanvas());
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings(),
      measureMediaSize: vi.fn(async ({ resourceUrl }: { resourceUrl: string; mediaType: "image" | "video" }) => {
        if (resourceUrl.includes(encodeURIComponent("Assets/a.png"))) {
          return { width: 1600, height: 900 };
        }

        if (resourceUrl.includes(encodeURIComponent("Assets/b.png"))) {
          return { width: 900, height: 900 };
        }

        return null;
      })
    });

    const replaced = await workflow.replaceSourceNodeContent({
      boardPath: "Glitter/灵感漫游/board.canvas",
      nodeId: "caption-1",
      content: {
        title: "图库灵感（子节点更新）",
        body: "两张图（子节点更新）",
        contentType: "image",
        sourceUrl: undefined,
        attachmentPaths: ["Assets/a.png", "Assets/b.png"]
      }
    });

    expect(replaced.canvas.edges).toEqual([
      { id: "edge-root-note", fromNode: "root-1", toNode: "plain-1" },
      { id: "edge-image-note", fromNode: "image-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" }
    ]);
    expect(replaced.canvas.nodes.find((node) => node.id === "caption-1")).toMatchObject({
      text: "> [!glitter-source] 图库灵感（子节点更新）\n> 两张图（子节点更新）"
    });

    const marked = await workflow.markSourceNodeMissing({
      boardPath: "Glitter/灵感漫游/board.canvas",
      nodeId: "image-1"
    });

    expect(marked.canvas.nodes.find((node) => node.id === "root-1")).toMatchObject({
      glitterSource: expect.objectContaining({
        status: "missing"
      })
    });
  });

  it("preserves valid root connectors on older managed text blocks when rebuilding another block", async () => {
    const { vault, seedAssetFile, seedCanvasFile } = createVaultHarness();
    seedAssetFile("Assets/a.png");
    seedAssetFile("Assets/b.png");
    const canvas = buildManagedImageSourceCanvas() as { nodes: any[]; edges: any[] };
    canvas.nodes.push({
      id: "root-text-legacy",
      type: "text",
      text: "> [!glitter-source] 旧文本块\n> 旧正文",
      x: 800,
      y: 80,
      width: 320,
      height: 136,
      glitterSource: {
        ideaId: "idea-text-legacy",
        poolId: "pool-a",
        poolName: "产品池",
        poolColor: "#6ab5ff",
        ideaTitle: "旧文本块",
        syncMode: "readonly-follow-source",
        status: "active"
      },
      glitterSourceBlock: {
        sourceBlockId: "source-block-text-legacy",
        nodeKey: "source-block-text-legacy:root",
        sourceId: "idea-text-legacy",
        kind: "text",
        role: "root"
      }
    });
    canvas.edges.push({ id: "edge-text-note", fromNode: "root-text-legacy", toNode: "plain-1" });
    seedCanvasFile("Glitter/灵感漫游/mixed.canvas", canvas);
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings(),
      measureMediaSize: vi.fn(async ({ resourceUrl }: { resourceUrl: string; mediaType: "image" | "video" }) => {
        if (resourceUrl.includes(encodeURIComponent("Assets/a.png"))) {
          return { width: 1600, height: 900 };
        }

        if (resourceUrl.includes(encodeURIComponent("Assets/b.png"))) {
          return { width: 900, height: 900 };
        }

        return null;
      })
    });

    const replaced = await workflow.replaceSourceNodeContent({
      boardPath: "Glitter/灵感漫游/mixed.canvas",
      nodeId: "root-1",
      content: {
        title: "图库灵感（已更新）",
        body: "两张图（已更新）",
        contentType: "image",
        sourceUrl: undefined,
        attachmentPaths: ["Assets/a.png", "Assets/b.png"]
      }
    });

    expect(replaced.canvas.edges).toEqual([
      { id: "edge-root-note", fromNode: "root-1", toNode: "plain-1" },
      { id: "edge-image-note", fromNode: "image-1", toNode: "plain-1" },
      { id: "edge-note-other", fromNode: "plain-1", toNode: "other-node" },
      { id: "edge-text-note", fromNode: "root-text-legacy", toNode: "plain-1" }
    ]);
  });

  it("migrates legacy single-node glitterSource cards into managed glitter-source blocks", async () => {
    const { vault, seedCanvasFile } = createVaultHarness();
    seedCanvasFile("Glitter/灵感漫游/legacy.canvas", {
      nodes: [
        {
          id: "legacy-1",
          type: "text",
          x: 120,
          y: 80,
          width: 320,
          height: 220,
          text: "# 旧来源块\n\n旧正文",
          glitterSource: {
            ideaId: "idea-legacy",
            poolId: "pool-a",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "旧来源块",
            syncMode: "readonly-follow-source",
            status: "active"
          }
        }
      ],
      edges: []
    });
    const workflow = createPoolRoamWorkflow({
      vault,
      settings: createSettings()
    });

    const normalized = await workflow.normalizeManagedSourceBlocks({
      boardPath: "Glitter/灵感漫游/legacy.canvas"
    });

    expect(normalized.canvas.nodes).toHaveLength(1);
    expect(normalized.canvas.nodes[0]).toMatchObject({
      id: "legacy-1",
      type: "text",
      glitterSourceBlock: expect.objectContaining({
        role: "root"
      })
    });
    expect((normalized.canvas.nodes[0] as { text?: string }).text).toContain("> [!glitter-source] 旧来源块");
    expect((normalized.canvas.nodes[0] as { text?: string }).text).toContain("> 旧正文");
  });
});
