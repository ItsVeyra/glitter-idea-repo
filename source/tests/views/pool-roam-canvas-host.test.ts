import { beforeEach, describe, expect, it, vi } from "vitest";

const createDetachedLeafMock = vi.fn();

vi.mock("obsidian", () => {
  class TFile {
    path = "";
  }

  class WorkspaceLeaf {
    constructor(appOrWorkspace: unknown) {
      return createDetachedLeafMock(appOrWorkspace);
    }
  }

  return { TFile, WorkspaceLeaf };
});

import { TFile } from "obsidian";
import { createPoolRoamCanvasHost } from "../../src/views/pool-roam-canvas-host";

type MockContainer = HTMLElement & {
  innerHTML: string;
  lastAppended?: { dataset?: Record<string, string> };
};

function createMockFile(path: string): TFile & { path: string; basename: string } {
  const file = new TFile() as TFile & { path: string; basename: string };
  file.path = path;
  file.basename = path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path;
  return file;
}

function createContainer(): MockContainer {
  return {
    innerHTML: "",
    appendChild(node: { dataset?: Record<string, string> }) {
      (this as MockContainer).lastAppended = node;
      return node;
    }
  } as unknown as MockContainer;
}

function createChromeElement(initialDisplay: string) {
  const style = { display: initialDisplay };
  return {
    style,
    setCssStyles: vi.fn((styles: { display?: string }) => {
      if (styles.display !== undefined) {
        style.display = styles.display;
      }
    })
  };
}

beforeEach(() => {
  createDetachedLeafMock.mockReset();
  createDetachedLeafMock.mockImplementation(() => {
    throw new Error("DETACHED_LEAF_UNAVAILABLE");
  });
});

describe("createPoolRoamCanvasHost", () => {
  it("mounts through a detached leaf without creating a workspace tab when available", async () => {
    const board = createMockFile("Boards/detached.canvas");
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>
    } as unknown as HTMLElement & { dataset: Record<string, string> };
    const detachedLeaf = {
      view: { containerEl: viewContainerEl },
      openFile: vi.fn(async () => undefined),
      detach: vi.fn()
    };
    createDetachedLeafMock.mockImplementation(() => detachedLeaf);

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => {
          throw new Error("WORKSPACE_LEAF_SHOULD_NOT_BE_USED");
        })
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();

    await host.mountInlineBoard(container, board.path);

    expect(detachedLeaf.openFile).toHaveBeenCalledWith(board, { active: false });
    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    expect(container.lastAppended?.dataset?.boardPath).toBe(board.path);

    host.destroy();
    expect(detachedLeaf.detach).toHaveBeenCalledTimes(1);
  });

  it("normalizes the mounted native canvas title to the ASCII display name", async () => {
    const board = createMockFile("Boards/Glitter灵感漫游 2026-05-27 10：00.canvas");
    const titleEl = {
      textContent: board.basename,
      setAttribute: vi.fn()
    } as unknown as HTMLElement & {
      textContent: string;
      setAttribute: ReturnType<typeof vi.fn>;
    };
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>,
      querySelectorAll: vi.fn((selector: string) => (selector === ".view-header-title" ? [titleEl] : []))
    } as unknown as HTMLElement & {
      dataset: Record<string, string>;
      querySelectorAll: (selector: string) => HTMLElement[];
    };
    const detachedLeaf = {
      view: {
        containerEl: viewContainerEl,
        getDisplayText: vi.fn(() => board.basename)
      },
      getDisplayText: vi.fn(() => board.basename),
      updateHeader: vi.fn(),
      openFile: vi.fn(async () => undefined),
      detach: vi.fn()
    };
    createDetachedLeafMock.mockImplementation(() => detachedLeaf);

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => {
          throw new Error("WORKSPACE_LEAF_SHOULD_NOT_BE_USED");
        })
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();

    await host.mountInlineBoard(container, board.path);

    expect(detachedLeaf.getDisplayText()).toBe("Glitter灵感漫游 2026-05-27 10:00");
    expect(detachedLeaf.view.getDisplayText()).toBe("Glitter灵感漫游 2026-05-27 10:00");
    expect(titleEl.textContent).toBe("Glitter灵感漫游 2026-05-27 10:00");
    expect(titleEl.setAttribute).toHaveBeenCalledWith("aria-label", "Glitter灵感漫游 2026-05-27 10:00");
    expect(titleEl.setAttribute).toHaveBeenCalledWith("title", "Glitter灵感漫游 2026-05-27 10:00");
    expect(detachedLeaf.updateHeader).toHaveBeenCalled();
  });

  it("does not fall back to a workspace leaf for inline mounts when detached mounting fails", async () => {
    const board = createMockFile("Boards/fallback.canvas");
    const detachedLeaf = {
      view: { containerEl: null },
      openFile: vi.fn(async () => {
        throw new Error("DETACHED_OPEN_FAILED");
      }),
      detach: vi.fn()
    };
    createDetachedLeafMock.mockImplementation(() => detachedLeaf);

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn()
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();

    await expect(host.mountInlineBoard(container, board.path)).rejects.toThrow("DETACHED_OPEN_FAILED");

    expect(detachedLeaf.openFile).toHaveBeenCalledWith(board, { active: false });
    expect(detachedLeaf.detach).toHaveBeenCalledTimes(1);
    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    expect(container.lastAppended).toBeUndefined();
  });

  it("falls back to a workspace leaf for modal mounts when detached mounting fails", async () => {
    const board = createMockFile("Boards/fallback.canvas");
    const detachedLeaf = {
      view: { containerEl: null },
      openFile: vi.fn(async () => {
        throw new Error("DETACHED_OPEN_FAILED");
      }),
      detach: vi.fn()
    };
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>
    } as unknown as HTMLElement & { dataset: Record<string, string> };
    const workspaceLeaf = {
      view: { containerEl: viewContainerEl },
      openFile: vi.fn(async () => undefined),
      detach: vi.fn()
    };
    createDetachedLeafMock.mockImplementation(() => detachedLeaf);

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => workspaceLeaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();

    await host.mountModalBoard(container, board.path);

    expect(detachedLeaf.openFile).toHaveBeenCalledWith(board, { active: false });
    expect(detachedLeaf.detach).toHaveBeenCalledTimes(1);
    expect(app.workspace.getLeaf).toHaveBeenCalledTimes(1);
    expect(workspaceLeaf.openFile).toHaveBeenCalledWith(board, { active: false });
    expect(container.lastAppended?.dataset?.boardPath).toBe(board.path);
  });

  it("does not reuse a previous workspace fallback leaf for later inline mounts", async () => {
    const board = createMockFile("Boards/reuse.canvas");
    const detachedLeaf = {
      view: { containerEl: null },
      openFile: vi.fn(async () => {
        throw new Error("DETACHED_OPEN_FAILED");
      }),
      detach: vi.fn()
    };
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>
    } as unknown as HTMLElement & { dataset: Record<string, string> };
    const workspaceLeaf = {
      view: { containerEl: viewContainerEl },
      openFile: vi.fn(async () => undefined),
      detach: vi.fn()
    };
    createDetachedLeafMock.mockImplementationOnce(() => detachedLeaf);

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => workspaceLeaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const modalContainer = createContainer();
    const inlineContainer = createContainer();

    await host.mountModalBoard(modalContainer, board.path);
    await expect(host.mountInlineBoard(inlineContainer, board.path)).rejects.toThrow(
      "ROAM_BOARD_INLINE_LEAF_UNAVAILABLE"
    );

    expect(detachedLeaf.detach).toHaveBeenCalledTimes(1);
    expect(app.workspace.getLeaf).toHaveBeenCalledTimes(1);
    expect(workspaceLeaf.openFile).toHaveBeenCalledTimes(1);
    expect(workspaceLeaf.detach).toHaveBeenCalledTimes(1);
    expect(inlineContainer.lastAppended).toBeUndefined();
  });

  it("hides the backing leaf shell and tab header before the modal open finishes", async () => {
    const board = createMockFile("Boards/inline.canvas");
    const backingLeafShell = {
      style: { display: "flex" }
    };
    const tabHeaderEl = {
      style: { display: "grid" }
    };
    let resolveOpenFile: (() => void) | undefined;
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>,
      closest: vi.fn((selector: string) => (selector === ".workspace-leaf" ? backingLeafShell : null))
    } as unknown as HTMLElement & {
      dataset: Record<string, string>;
      closest: (selector: string) => { style: { display: string } } | null;
    };
    const leaf = {
      view: { containerEl: viewContainerEl },
      tabHeaderEl,
      openFile: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveOpenFile = resolve;
          })
      ),
      detach: vi.fn()
    };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => leaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();
    const mountPromise = host.mountModalBoard(container, board.path);

    await Promise.resolve();
    await Promise.resolve();

    expect(leaf.openFile).toHaveBeenCalledWith(board, { active: false });
    expect(backingLeafShell.style.display).toBe("none");
    expect(tabHeaderEl.style.display).toBe("none");

    resolveOpenFile?.();
    await mountPromise;

    host.destroy();

    expect(backingLeafShell.style.display).toBe("flex");
    expect(tabHeaderEl.style.display).toBe("grid");
  });

  it("restores leaf chrome through setCssStyles when the safe API is available", async () => {
    const board = createMockFile("Boards/safe-api.canvas");
    const backingLeafShell = createChromeElement("flex");
    const tabHeaderEl = createChromeElement("grid");
    let resolveOpenFile: (() => void) | undefined;
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>,
      closest: vi.fn((selector: string) => (selector === ".workspace-leaf" ? backingLeafShell : null))
    } as unknown as HTMLElement & {
      dataset: Record<string, string>;
      closest: (selector: string) => ReturnType<typeof createChromeElement> | null;
    };
    const leaf = {
      view: { containerEl: viewContainerEl },
      tabHeaderEl,
      openFile: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveOpenFile = resolve;
          })
      ),
      detach: vi.fn()
    };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => leaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();
    const mountPromise = host.mountModalBoard(container, board.path);

    await Promise.resolve();
    await Promise.resolve();

    expect(leaf.openFile).toHaveBeenCalledWith(board, { active: false });
    expect(backingLeafShell.setCssStyles).toHaveBeenCalledWith({ display: "none" });
    expect(tabHeaderEl.setCssStyles).toHaveBeenCalledWith({ display: "none" });
    expect(backingLeafShell.style.display).toBe("none");
    expect(tabHeaderEl.style.display).toBe("none");

    resolveOpenFile?.();
    await mountPromise;

    host.destroy();

    expect(backingLeafShell.setCssStyles).toHaveBeenLastCalledWith({ display: "flex" });
    expect(tabHeaderEl.setCssStyles).toHaveBeenLastCalledWith({ display: "grid" });
    expect(backingLeafShell.style.display).toBe("flex");
    expect(tabHeaderEl.style.display).toBe("grid");
  });

  it("hides the direct leaf shell even before the view container exists", async () => {
    const board = createMockFile("Boards/direct-shell.canvas");
    const backingLeafShell = {
      style: { display: "flex" }
    };
    let resolveOpenFile: (() => void) | undefined;
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>,
      closest: vi.fn((selector: string) => (selector === ".workspace-leaf" ? backingLeafShell : null))
    } as unknown as HTMLElement & {
      dataset: Record<string, string>;
      closest: (selector: string) => { style: { display: string } } | null;
    };
    const leaf = {
      containerEl: backingLeafShell,
      view: null as { containerEl: HTMLElement } | null,
      openFile: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveOpenFile = () => {
              leaf.view = { containerEl: viewContainerEl };
              resolve();
            };
          })
      ),
      detach: vi.fn()
    };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => leaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();
    const mountPromise = host.mountModalBoard(container, board.path);

    await Promise.resolve();
    await Promise.resolve();
    expect(backingLeafShell.style.display).toBe("none");

    resolveOpenFile?.();
    await mountPromise;

    host.destroy();
    expect(backingLeafShell.style.display).toBe("flex");
  });

  it("restores the backing leaf shell when the inline open fails", async () => {
    const board = createMockFile("Boards/failure.canvas");
    const backingLeafShell = {
      style: { display: "flex" }
    };
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>,
      closest: vi.fn((selector: string) => (selector === ".workspace-leaf" ? backingLeafShell : null))
    } as unknown as HTMLElement & {
      dataset: Record<string, string>;
      closest: (selector: string) => { style: { display: string } } | null;
    };
    const leaf = {
      view: { containerEl: viewContainerEl },
      openFile: vi.fn(async () => {
        throw new Error("OPEN_FAILED");
      }),
      detach: vi.fn()
    };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => leaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();

    await expect(host.mountModalBoard(container, board.path)).rejects.toThrow("OPEN_FAILED");
    expect(backingLeafShell.style.display).toBe("flex");
  });

  it("ignores late open failures after destroy", async () => {
    const board = createMockFile("Boards/late-failure.canvas");
    const backingLeafShell = {
      style: { display: "flex" }
    };
    let rejectOpenFile: ((error: Error) => void) | undefined;
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>,
      closest: vi.fn((selector: string) => (selector === ".workspace-leaf" ? backingLeafShell : null))
    } as unknown as HTMLElement & {
      dataset: Record<string, string>;
      closest: (selector: string) => { style: { display: string } } | null;
    };
    const leaf = {
      view: { containerEl: viewContainerEl },
      openFile: vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectOpenFile = reject;
          })
      ),
      detach: vi.fn()
    };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => leaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();
    const mountPromise = host.mountModalBoard(container, board.path);

    await Promise.resolve();
    await Promise.resolve();
    expect(backingLeafShell.style.display).toBe("none");

    host.destroy();
    rejectOpenFile?.(new Error("LATE_OPEN_FAILED"));

    await expect(mountPromise).resolves.toBeUndefined();
    expect(leaf.detach).toHaveBeenCalledTimes(1);
    expect(backingLeafShell.style.display).toBe("flex");
    expect(container.lastAppended).toBeUndefined();
  });

  it("applies queued board requests in call order so the latest request wins", async () => {
    const boardA = createMockFile("Boards/a.canvas");
    const boardB = createMockFile("Boards/b.canvas");
    const viewContainerEl = {
      dataset: {} as Record<string, string>
    } as unknown as HTMLElement & { dataset: Record<string, string> };
    const openResolvers: Array<() => void> = [];
    const leaf = {
      view: { containerEl: viewContainerEl },
      openFile: vi.fn((file: TFile & { path: string }) =>
        new Promise<void>((resolve) => {
          openResolvers.push(() => {
            viewContainerEl.dataset.boardPath = file.path;
            resolve();
          });
        })
      ),
      detach: vi.fn()
    };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => {
          if (path === boardA.path) {
            return boardA;
          }
          if (path === boardB.path) {
            return boardB;
          }
          return null;
        })
      },
      workspace: {
        getLeaf: vi.fn(() => leaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const firstContainer = createContainer();
    const secondContainer = createContainer();
    const thirdContainer = createContainer();

    const firstMount = host.mountModalBoard(firstContainer, boardA.path);
    const secondMount = host.mountModalBoard(secondContainer, boardB.path);
    const thirdMount = host.mountModalBoard(thirdContainer, boardA.path);

    await Promise.resolve();
    await Promise.resolve();
    expect(leaf.openFile).toHaveBeenNthCalledWith(1, boardA, { active: false });

    openResolvers.shift()?.();
    await firstMount;
    await Promise.resolve();
    expect(leaf.openFile).toHaveBeenNthCalledWith(2, boardB, { active: false });

    openResolvers.shift()?.();
    await secondMount;
    await Promise.resolve();
    expect(leaf.openFile).toHaveBeenNthCalledWith(3, boardA, { active: false });

    openResolvers.shift()?.();
    await thirdMount;

    expect(app.workspace.getLeaf).toHaveBeenCalledTimes(1);
    expect(thirdContainer.lastAppended?.dataset?.boardPath).toBe(boardA.path);
  });

  it("loads deferred leaves before reading the mounted canvas view", async () => {
    const board = createMockFile("Boards/deferred.canvas");
    const viewContainerEl = {
      dataset: { boardPath: board.path } as Record<string, string>
    } as unknown as HTMLElement & { dataset: Record<string, string> };
    const leaf = {
      view: null as { containerEl: HTMLElement } | null,
      isDeferred: true,
      openFile: vi.fn(async () => undefined),
      loadIfDeferred: vi.fn(async () => {
        leaf.view = { containerEl: viewContainerEl };
      }),
      detach: vi.fn()
    };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => leaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();

    await host.mountModalBoard(container, board.path);

    expect(leaf.openFile).toHaveBeenCalledWith(board, { active: false });
    expect(leaf.loadIfDeferred).toHaveBeenCalledTimes(1);
    expect(container.lastAppended?.dataset?.boardPath).toBe(board.path);
  });

  it("drops in-flight mount work after destroy", async () => {
    const board = createMockFile("Boards/demo.canvas");
    const viewContainerEl = {
      dataset: {} as Record<string, string>
    } as unknown as HTMLElement & { dataset: Record<string, string> };
    let resolveOpenFile: (() => void) | undefined;
    const leaf = {
      view: { containerEl: viewContainerEl },
      openFile: vi.fn((file: TFile & { path: string }) =>
        new Promise<void>((resolve) => {
          resolveOpenFile = () => {
            viewContainerEl.dataset.boardPath = file.path;
            resolve();
          };
        })
      ),
      detach: vi.fn()
    };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => board)
      },
      workspace: {
        getLeaf: vi.fn(() => leaf)
      }
    } as any;

    const host = createPoolRoamCanvasHost(app);
    const container = createContainer();
    const mountPromise = host.mountModalBoard(container, board.path);

    await Promise.resolve();
    await Promise.resolve();
    host.destroy();
    resolveOpenFile?.();
    await mountPromise;

    expect(leaf.detach).toHaveBeenCalledTimes(1);
    expect(container.lastAppended).toBeUndefined();
  });
});
