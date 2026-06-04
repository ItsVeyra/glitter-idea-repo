import { Modal, type App } from "obsidian";
import type { PoolRoamBoardRecord } from "../application/pool-workbench/pool-roam-workflow";
import { createPoolRoamCanvasHost, type PoolRoamCanvasHost } from "./pool-roam-canvas-host";

export interface PoolRoamBoardModalHandlers {
  onOpenError?: (error: unknown) => void;
  onClose?: () => void;
  onDownloadBoard?: (board: PoolRoamBoardRecord) => void | Promise<void>;
  onShareBoard?: (board: PoolRoamBoardRecord, anchorEl: HTMLElement) => void;
}

function canCreatePoolRoamCanvasHost(app: unknown): app is App {
  return Boolean(app)
    && typeof app === "object"
    && typeof (app as { vault?: { getAbstractFileByPath?: unknown } }).vault?.getAbstractFileByPath === "function"
    && typeof (app as { workspace?: { getLeaf?: unknown } }).workspace?.getLeaf === "function";
}

function clampBoardIndex(index: number, boardCount: number): number {
  if (boardCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, boardCount - 1));
}

function formatUpdatedAt(updatedAt: number): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return "最近更新未知";
  }

  return `最近更新：${new Date(updatedAt).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function resolveBoardKindLabel(board: PoolRoamBoardRecord): string {
  const sourceCount = board.thumbnailBoxes.filter((box) => box.kind === "source").length;
  if (sourceCount === 0) {
    return "仅包含历史白板结构";
  }

  return `包含 ${sourceCount} 个灵感来源节点`;
}

export class PoolRoamBoardModal extends Modal {
  private readonly canvasHost?: PoolRoamCanvasHost;

  private boardMountEl: HTMLElement | null = null;

  private boardTitleEl: HTMLElement | null = null;

  private pathEl: HTMLElement | null = null;

  private metaEl: HTMLElement | null = null;

  private navCountEl: HTMLElement | null = null;

  private prevButtonEl: HTMLButtonElement | null = null;

  private nextButtonEl: HTMLButtonElement | null = null;

  private downloadButtonEl: HTMLButtonElement | null = null;

  private shareButtonEl: HTMLButtonElement | null = null;

  private openVersion = 0;

  private activeBoardIndex: number;

  constructor(
    app: unknown,
    private readonly boards: PoolRoamBoardRecord[],
    activeBoardIndex: number,
    private readonly handlers: PoolRoamBoardModalHandlers = {},
    deps: { canvasHost?: PoolRoamCanvasHost } = {}
  ) {
    super(app as never);
    this.canvasHost = deps.canvasHost ?? (canCreatePoolRoamCanvasHost(app) ? createPoolRoamCanvasHost(app) : undefined);
    this.activeBoardIndex = clampBoardIndex(activeBoardIndex, boards.length);
  }

  override onOpen(): void {
    this.containerEl?.addClass?.("glitter-pool-roam-board-modal-host");
    this.modalEl?.addClass?.("glitter-pool-roam-board-modal");
    this.contentEl?.addClass?.("glitter-pool-roam-board-modal__content");
    this.contentEl.empty();

    const surface = this.contentEl.createDiv({
      cls: "glitter-pool-roam-board-modal__surface GlitterIdea-edit-modal__surface"
    });
    const header = surface.createDiv({
      cls: "glitter-pool-roam-board-modal__header glitter-snippet-locations-modal__header GlitterIdea-edit-modal__header"
    });
    const headerCopy = header.createDiv({
      cls: "glitter-pool-roam-board-modal__header-copy"
    });
    this.boardTitleEl = headerCopy.createEl("h2", {
      cls: "glitter-pool-roam-board-modal__title glitter-snippet-locations-modal__title GlitterIdea-edit-modal__heading"
    });
    this.pathEl = headerCopy.createEl("span", {
      cls: "glitter-pool-roam-board-modal__path glitter-snippet-locations-modal__card-path"
    });

    const headerActions = header.createDiv({
      cls: "glitter-pool-roam-board-modal__header-actions"
    });
    const nav = headerActions.createDiv({
      cls: "glitter-pool-roam-board-modal__nav"
    });
    this.prevButtonEl = nav.createEl("button", {
      cls: "glitter-pool-roam-board-modal__nav-button"
    }) as HTMLButtonElement;
    this.prevButtonEl.type = "button";
    this.prevButtonEl.dataset.direction = "prev";
    this.prevButtonEl.setAttribute?.("aria-label", "查看上一块历史白板");
    this.prevButtonEl.textContent = "←";
    this.prevButtonEl.addEventListener("click", () => {
      this.navigate(-1);
    });

    this.navCountEl = nav.createEl("span", {
      cls: "glitter-pool-roam-board-modal__nav-count"
    });

    this.nextButtonEl = nav.createEl("button", {
      cls: "glitter-pool-roam-board-modal__nav-button"
    }) as HTMLButtonElement;
    this.nextButtonEl.type = "button";
    this.nextButtonEl.dataset.direction = "next";
    this.nextButtonEl.setAttribute?.("aria-label", "查看下一块历史白板");
    this.nextButtonEl.textContent = "→";
    this.nextButtonEl.addEventListener("click", () => {
      this.navigate(1);
    });

    const closeButton = headerActions.createEl("button", {
      cls: "glitter-pool-roam-board-modal__close glitter-write-stage__close-button GlitterIdea-edit-modal__close-button"
    }) as HTMLButtonElement;
    closeButton.type = "button";
    closeButton.setAttribute?.("aria-label", "关闭漫游白板预览");
    closeButton.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
    });
    closeButton.addEventListener("click", () => {
      this.close();
    });

    this.metaEl = surface.createDiv({
      cls: "glitter-pool-roam-board-modal__meta"
    });

    const canvasMountEl = surface.createDiv({
      cls: "glitter-pool-roam-board-modal__canvas"
    });
    const floatingActions = canvasMountEl.createDiv({
      cls: "glitter-pool-roam-board-modal__floating-actions"
    });
    this.downloadButtonEl = floatingActions.createEl("button", {
      cls: "glitter-pool-roam-board-modal__floating-action glitter-pool-roam-board-modal__floating-action--download"
    }) as HTMLButtonElement;
    this.downloadButtonEl.type = "button";
    this.downloadButtonEl.setAttribute?.("aria-label", "下载当前历史漫游白板");
    this.downloadButtonEl.createEl("span", {
      cls: "glitter-pool-stage__roam-floating-action-icon glitter-pool-stage__roam-floating-action-icon--download"
    });
    this.downloadButtonEl.addEventListener("click", () => {
      const board = this.getActiveBoard();
      if (!board || !this.handlers.onDownloadBoard) {
        return;
      }
      void this.handlers.onDownloadBoard(board);
    });

    this.shareButtonEl = floatingActions.createEl("button", {
      cls: "glitter-pool-roam-board-modal__floating-action glitter-pool-roam-board-modal__floating-action--share"
    }) as HTMLButtonElement;
    this.shareButtonEl.type = "button";
    this.shareButtonEl.setAttribute?.("aria-label", "分享当前历史漫游白板");
    this.shareButtonEl.createEl("span", {
      cls: "glitter-pool-stage__roam-floating-action-icon glitter-pool-stage__roam-floating-action-icon--share"
    });
    this.shareButtonEl.addEventListener("click", () => {
      const board = this.getActiveBoard();
      if (!board || !this.handlers.onShareBoard) {
        return;
      }
      this.handlers.onShareBoard(board, this.shareButtonEl as HTMLButtonElement);
    });

    const canvasHostEl = canvasMountEl.createDiv({
      cls: "glitter-pool-roam-board-modal__canvas-host"
    });
    this.boardMountEl = canvasHostEl;

    if (!this.canvasHost || !this.getActiveBoard()) {
      this.handlers.onOpenError?.(new Error("ROAM_BOARD_HOST_UNAVAILABLE"));
      this.close();
      return;
    }

    const currentOpenVersion = ++this.openVersion;
    void this.renderActiveBoard(currentOpenVersion);
  }

  override onClose(): void {
    this.openVersion += 1;
    this.boardMountEl = null;
    this.boardTitleEl = null;
    this.pathEl = null;
    this.metaEl = null;
    this.navCountEl = null;
    this.prevButtonEl = null;
    this.nextButtonEl = null;
    this.downloadButtonEl = null;
    this.shareButtonEl = null;
    this.canvasHost?.destroy();
    this.containerEl?.removeClass?.("glitter-pool-roam-board-modal-host");
    this.modalEl?.removeClass?.("glitter-pool-roam-board-modal");
    this.contentEl?.removeClass?.("glitter-pool-roam-board-modal__content");
    this.contentEl?.empty?.();
    this.handlers.onClose?.();
  }

  private getActiveBoard(): PoolRoamBoardRecord | undefined {
    return this.boards[this.activeBoardIndex];
  }

  private navigate(step: -1 | 1): void {
    const nextIndex = clampBoardIndex(this.activeBoardIndex + step, this.boards.length);
    if (nextIndex === this.activeBoardIndex) {
      return;
    }

    this.activeBoardIndex = nextIndex;
    const currentOpenVersion = ++this.openVersion;
    void this.renderActiveBoard(currentOpenVersion);
  }

  private syncBoardMeta(board: PoolRoamBoardRecord): void {
    if (!this.boardTitleEl || !this.pathEl || !this.metaEl || !this.boardMountEl) {
      return;
    }

    this.boardTitleEl.textContent = board.name;
    this.pathEl.textContent = board.path;
    this.boardMountEl.dataset.boardPath = board.path;
    this.metaEl.empty();

    this.metaEl.createEl("span", {
      cls: "glitter-pool-roam-board-modal__chip glitter-snippet-locations-modal__card-count",
      text: formatUpdatedAt(board.updatedAt)
    });
    this.metaEl.createEl("span", {
      cls: "glitter-pool-roam-board-modal__chip glitter-snippet-locations-modal__card-count",
      text: resolveBoardKindLabel(board)
    });
    this.metaEl.createEl("span", {
      cls: "glitter-pool-roam-board-modal__chip glitter-pool-roam-board-modal__chip--muted",
      text: `${this.activeBoardIndex + 1} / ${this.boards.length}`
    });

    board.relatedPools.forEach((pool) => {
      const chip = this.metaEl?.createEl("span", {
        cls: "glitter-pool-roam-board-modal__chip",
        text: pool.name
      });
      chip?.setAttribute?.("data-pool-id", pool.id);
    });
  }

  private syncNavigationState(): void {
    if (this.navCountEl) {
      this.navCountEl.textContent = `${this.activeBoardIndex + 1} / ${this.boards.length}`;
    }

    if (this.prevButtonEl) {
      this.prevButtonEl.disabled = this.activeBoardIndex <= 0;
    }

    if (this.nextButtonEl) {
      this.nextButtonEl.disabled = this.activeBoardIndex >= this.boards.length - 1;
    }

    if (this.downloadButtonEl) {
      this.downloadButtonEl.disabled = !this.getActiveBoard() || !this.handlers.onDownloadBoard;
    }

    if (this.shareButtonEl) {
      this.shareButtonEl.disabled = !this.getActiveBoard() || !this.handlers.onShareBoard;
    }
  }

  private async renderActiveBoard(openVersion: number): Promise<void> {
    const board = this.getActiveBoard();
    const mountEl = this.boardMountEl;
    if (!board || !mountEl || !this.canvasHost) {
      return;
    }

    this.syncBoardMeta(board);
    this.syncNavigationState();

    try {
      await this.canvasHost.mountModalBoard(mountEl, board.path);
    } catch (error) {
      if (openVersion !== this.openVersion) {
        return;
      }

      this.handlers.onOpenError?.(error);
      this.close();
    }
  }
}
