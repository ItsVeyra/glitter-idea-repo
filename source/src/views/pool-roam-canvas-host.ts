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

import { TFile, WorkspaceLeaf as ObsidianWorkspaceLeaf, type App, type WorkspaceLeaf } from "obsidian";
import { formatPoolRoamBoardDisplayName } from "../application/pool-workbench/pool-roam-workflow";

export interface PoolRoamCanvasHost {
  mountInlineBoard(containerEl: HTMLElement, boardPath: string): Promise<void>;
  mountModalBoard(containerEl: HTMLElement, boardPath: string): Promise<void>;
  destroy(): void;
}

type MountedLeaf = {
  leaf: WorkspaceLeaf;
  mode: "detached" | "workspace";
};

type RuntimeWorkspaceLeaf = WorkspaceLeaf & {
  containerEl?: HTMLElement | null;
  tabHeaderEl?: HTMLElement | null;
  getDisplayText?: () => string;
  updateHeader?: () => void;
};

type RuntimeView = WorkspaceLeaf["view"] & {
  getDisplayText?: () => string;
  containerEl?: HTMLElement | null;
};

type HiddenLeafChrome = {
  element: HTMLElement;
  display: string;
};

type WorkspaceLeafConstructor = new (appOrWorkspace: unknown) => WorkspaceLeaf;

function clearContainer(containerEl: HTMLElement): void {
  const withEmpty = containerEl as HTMLElement & { empty?: () => void };
  if (typeof withEmpty.empty === "function") {
    withEmpty.empty();
    return;
  }

  containerEl.innerHTML = "";
}

function resolveBoardBaseName(path: string): string {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.canvas$/i, "");
}

function resolveBoardDisplayName(file: TFile): string {
  const withBasename = file as TFile & { basename?: string; path: string };
  return formatPoolRoamBoardDisplayName(withBasename.basename ?? resolveBoardBaseName(withBasename.path));
}

function syncMountedBoardDisplayText(viewContainerEl: HTMLElement, displayName: string): void {
  const titleSelectors = [
    ".view-header-title",
    ".workspace-tab-header-inner-title",
    ".canvas-title",
    ".canvas-file-title"
  ];
  const querySelectorAll = (viewContainerEl as HTMLElement & {
    querySelectorAll?: (selector: string) => Iterable<Element>;
  }).querySelectorAll;
  if (typeof querySelectorAll !== "function") {
    return;
  }

  const titleElements = new Set<HTMLElement>();

  titleSelectors.forEach((selector) => {
    Array.from(querySelectorAll.call(viewContainerEl, selector)).forEach((element) => {
      titleElements.add(element as HTMLElement);
    });
  });

  titleElements.forEach((element) => {
    element.textContent = displayName;
    element.setAttribute?.("aria-label", displayName);
    element.setAttribute?.("title", displayName);
  });
}

function applyMountedBoardDisplayName(leaf: WorkspaceLeaf, file: TFile, viewContainerEl: HTMLElement | null): void {
  const displayName = resolveBoardDisplayName(file);
  const runtimeLeaf = leaf as RuntimeWorkspaceLeaf;
  const runtimeView = leaf.view as RuntimeView | null;

  runtimeLeaf.getDisplayText = () => displayName;
  if (runtimeView) {
    runtimeView.getDisplayText = () => displayName;
  }
  if (viewContainerEl) {
    syncMountedBoardDisplayText(viewContainerEl, displayName);
  }
  runtimeLeaf.updateHeader?.();
}

async function waitForViewContainerEl(leaf: WorkspaceLeaf): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const viewContainerEl = leaf.view?.containerEl ?? null;
    if (viewContainerEl) {
      return viewContainerEl;
    }
    await Promise.resolve();
  }

  return null;
}

function resolveLeafShellEl(leaf: WorkspaceLeaf): HTMLElement | null {
  const directLeafShellEl = (leaf as RuntimeWorkspaceLeaf).containerEl ?? null;
  if (directLeafShellEl) {
    return directLeafShellEl;
  }

  const viewContainerEl = leaf.view?.containerEl ?? null;
  if (!viewContainerEl) {
    return null;
  }

  const leafShellEl = typeof viewContainerEl.closest === "function"
    ? viewContainerEl.closest(".workspace-leaf")
    : null;

  return (leafShellEl as HTMLElement | null) ?? viewContainerEl.parentElement;
}

function resolveLeafTabHeaderEl(leaf: WorkspaceLeaf): HTMLElement | null {
  return (leaf as RuntimeWorkspaceLeaf).tabHeaderEl ?? null;
}

function createDetachedLeaf(app: App): WorkspaceLeaf | null {
  const WorkspaceLeafCtor = ObsidianWorkspaceLeaf as unknown as WorkspaceLeafConstructor | undefined;
  if (typeof WorkspaceLeafCtor !== "function") {
    return null;
  }

  for (const candidate of [app, app.workspace]) {
    try {
      const leaf = new WorkspaceLeafCtor(candidate);
      if (leaf && typeof leaf.openFile === "function") {
        return leaf;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function createMountedLeaf(
  app: App,
  options: { preferDetached?: boolean; allowWorkspaceFallback?: boolean } = {}
): MountedLeaf {
  const preferDetached = options.preferDetached ?? true;
  const allowWorkspaceFallback = options.allowWorkspaceFallback ?? true;

  if (preferDetached) {
    const detachedLeaf = createDetachedLeaf(app);
    if (detachedLeaf) {
      return {
        leaf: detachedLeaf,
        mode: "detached"
      };
    }
  }

  if (!allowWorkspaceFallback) {
    throw new Error("ROAM_BOARD_INLINE_LEAF_UNAVAILABLE");
  }

  return {
    leaf: app.workspace.getLeaf(true),
    mode: "workspace"
  };
}

export function createPoolRoamCanvasHost(app: App): PoolRoamCanvasHost {
  let mountedLeaf: MountedLeaf | null = null;
  let mountedBoardPath: string | null = null;
  let mountChain: Promise<void> = Promise.resolve();
  let generation = 0;
  let hiddenLeafChrome: HiddenLeafChrome[] = [];

  function resolveMountedViewContainerEl(): HTMLElement | null {
    return mountedLeaf?.leaf.view?.containerEl ?? null;
  }

  function restoreHiddenLeafChrome(): void {
    hiddenLeafChrome.forEach(({ element, display }) => {
      element.style.display = display;
    });
    hiddenLeafChrome = [];
  }

  function hideLeafChrome(nextMountedLeaf: MountedLeaf): void {
    if (nextMountedLeaf.mode !== "workspace") {
      return;
    }

    const elements = [resolveLeafShellEl(nextMountedLeaf.leaf), resolveLeafTabHeaderEl(nextMountedLeaf.leaf)]
      .filter((element): element is HTMLElement => Boolean(element));

    if (elements.length === 0) {
      return;
    }

    const nextHiddenElements = new Map(elements.map((element) => [element, element.style.display]));
    const isSameChrome = hiddenLeafChrome.length === nextHiddenElements.size
      && hiddenLeafChrome.every(({ element }) => nextHiddenElements.has(element));

    if (!isSameChrome) {
      restoreHiddenLeafChrome();
      hiddenLeafChrome = Array.from(nextHiddenElements.entries()).map(([element, display]) => ({ element, display }));
    }

    hiddenLeafChrome.forEach(({ element }) => {
      element.style.display = "none";
    });
  }

  async function mountBoardIntoLeaf(
    nextMountedLeaf: MountedLeaf,
    containerEl: HTMLElement,
    boardPath: string,
    mountGeneration: number
  ): Promise<void> {
    const reattachedViewContainerEl = resolveMountedViewContainerEl();
    if (reattachedViewContainerEl && mountedBoardPath === boardPath) {
      clearContainer(containerEl);
      containerEl.appendChild(reattachedViewContainerEl);
      return;
    }

    const file = app.vault.getAbstractFileByPath(boardPath);
    if (!(file instanceof TFile)) {
      throw new Error("ROAM_BOARD_NOT_FOUND");
    }

    hideLeafChrome(nextMountedLeaf);

    try {
      await nextMountedLeaf.leaf.openFile(file, { active: false });
      if (mountGeneration !== generation) {
        return;
      }

      applyMountedBoardDisplayName(nextMountedLeaf.leaf, file, nextMountedLeaf.leaf.view?.containerEl ?? null);

      if (nextMountedLeaf.leaf.isDeferred && typeof nextMountedLeaf.leaf.loadIfDeferred === "function") {
        await nextMountedLeaf.leaf.loadIfDeferred();
        if (mountGeneration !== generation) {
          return;
        }
      }

      const viewContainerEl = await waitForViewContainerEl(nextMountedLeaf.leaf);
      if (mountGeneration !== generation) {
        return;
      }

      if (!viewContainerEl) {
        throw new Error("ROAM_BOARD_VIEW_NOT_READY");
      }

      applyMountedBoardDisplayName(nextMountedLeaf.leaf, file, viewContainerEl);
      hideLeafChrome(nextMountedLeaf);
      mountedBoardPath = boardPath;
      clearContainer(containerEl);
      containerEl.appendChild(viewContainerEl);
    } catch (error) {
      if (mountGeneration !== generation) {
        return;
      }

      restoreHiddenLeafChrome();
      throw error;
    }
  }

  async function mountBoard(
    containerEl: HTMLElement,
    boardPath: string,
    options: { allowWorkspaceFallback: boolean }
  ): Promise<void> {
    const mountGeneration = generation;

    mountChain = mountChain.catch(() => undefined).then(async () => {
      if (mountGeneration !== generation) {
        return;
      }

      if (!options.allowWorkspaceFallback && mountedLeaf?.mode === "workspace") {
        restoreHiddenLeafChrome();
        mountedLeaf.leaf.detach?.();
        mountedLeaf = null;
        mountedBoardPath = null;
      }

      const activeMountedLeaf = mountedLeaf ?? createMountedLeaf(app, {
        allowWorkspaceFallback: options.allowWorkspaceFallback
      });
      mountedLeaf = activeMountedLeaf;

      try {
        await mountBoardIntoLeaf(activeMountedLeaf, containerEl, boardPath, mountGeneration);
      } catch (error) {
        if (mountGeneration !== generation) {
          return;
        }

        if (activeMountedLeaf.mode === "detached") {
          activeMountedLeaf.leaf.detach?.();
          if (mountedLeaf === activeMountedLeaf) {
            mountedLeaf = null;
          }
        }

        if (activeMountedLeaf.mode !== "detached" || !options.allowWorkspaceFallback) {
          throw error;
        }

        const fallbackMountedLeaf = createMountedLeaf(app, {
          preferDetached: false,
          allowWorkspaceFallback: true
        });
        mountedLeaf = fallbackMountedLeaf;
        await mountBoardIntoLeaf(fallbackMountedLeaf, containerEl, boardPath, mountGeneration);
      }
    });

    await mountChain;
  }

  return {
    async mountInlineBoard(containerEl, boardPath) {
      await mountBoard(containerEl, boardPath, { allowWorkspaceFallback: false });
    },
    async mountModalBoard(containerEl, boardPath) {
      await mountBoard(containerEl, boardPath, { allowWorkspaceFallback: true });
    },
    destroy() {
      generation += 1;
      mountedBoardPath = null;
      restoreHiddenLeafChrome();
      mountedLeaf?.leaf.detach?.();
      mountedLeaf = null;
      mountChain = Promise.resolve();
    }
  };
}
