import { Modal, type App } from "obsidian";
import type { PoolRoamBoardRecord } from "../application/pool-workbench/pool-roam-workflow";
import { getInterfaceText } from "../i18n/interface-language";
import type { PluginInterfaceLanguage } from "../settings/settings";
import { createPoolRoamCanvasHost, type PoolRoamCanvasHost } from "./pool-roam-canvas-host";

export type PoolRoamBoardModalOpenInRoamDecision =
  | { type: "close" }
  | { type: "keep-open" }
  | { type: "confirm"; onConfirm: () => Promise<boolean> };

export interface PoolRoamBoardModalHandlers {
  onOpenError?: (error: unknown) => void;
  onClose?: () => void;
  onDownloadBoard?: (board: PoolRoamBoardRecord) => void | Promise<void>;
  onShareBoard?: (board: PoolRoamBoardRecord, anchorEl: HTMLElement) => void;
  onAddIdeaBlock?: (board: PoolRoamBoardRecord, callbacks: { onAttached: (boards?: PoolRoamBoardRecord[]) => void }) => void;
  onOpenInRoam?: (board: PoolRoamBoardRecord) => PoolRoamBoardModalOpenInRoamDecision | Promise<PoolRoamBoardModalOpenInRoamDecision>;
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

function resolveLocale(language: PluginInterfaceLanguage | undefined): "en-US" | "zh-CN" {
  return language === "en" ? "en-US" : "zh-CN";
}

function formatUpdatedAt(updatedAt: number, language: PluginInterfaceLanguage | undefined): string {
  const text = getInterfaceText(language).roamModal;
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return text.updatedUnknown;
  }

  return text.updatedAt(new Date(updatedAt).toLocaleString(resolveLocale(language), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }));
}

function resolveBoardKindLabel(board: PoolRoamBoardRecord, language: PluginInterfaceLanguage | undefined): string {
  const text = getInterfaceText(language).roamModal;
  const sourceCount = board.thumbnailBoxes.filter((box) => box.kind === "source").length;
  if (sourceCount === 0) {
    return text.structureOnly;
  }

  return text.sourceCount(sourceCount);
}

export interface PoolRoamBoardModalOptions {
  canvasHost?: PoolRoamCanvasHost;
  interfaceLanguage?: PluginInterfaceLanguage;
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

  private addIdeaBlockButtonEl: HTMLButtonElement | null = null;

  private openInRoamButtonEl: HTMLButtonElement | null = null;

  private openInRoamConfirmMountEl: HTMLElement | null = null;

  private openInRoamRequestVersion = 0;

  private openVersion = 0;

  private activeBoardIndex: number;

  constructor(
    app: unknown,
    private readonly boards: PoolRoamBoardRecord[],
    activeBoardIndex: number,
    private readonly handlers: PoolRoamBoardModalHandlers = {},
    private readonly options: PoolRoamBoardModalOptions = {}
  ) {
    super(app as never);
    this.canvasHost = options.canvasHost ?? (canCreatePoolRoamCanvasHost(app) ? createPoolRoamCanvasHost(app) : undefined);
    this.activeBoardIndex = clampBoardIndex(activeBoardIndex, boards.length);
  }

  override onOpen(): void {
    this.containerEl?.addClass?.("glitter-pool-roam-board-modal-host");
    this.modalEl?.addClass?.("glitter-pool-roam-board-modal");
    this.contentEl?.addClass?.("glitter-pool-roam-board-modal__content");
    this.contentEl.empty();

    const text = getInterfaceText(this.options.interfaceLanguage).roamModal;
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
    this.prevButtonEl.setAttribute?.("aria-label", text.previousBoard);
    this.prevButtonEl.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--chevron-left"
    });
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
    this.nextButtonEl.setAttribute?.("aria-label", text.nextBoard);
    this.nextButtonEl.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--chevron-right"
    });
    this.nextButtonEl.addEventListener("click", () => {
      this.navigate(1);
    });

    const closeButton = headerActions.createEl("button", {
      cls: "glitter-pool-roam-board-modal__close glitter-write-stage__close-button GlitterIdea-edit-modal__close-button"
    }) as HTMLButtonElement;
    closeButton.type = "button";
    closeButton.setAttribute?.("aria-label", text.closeBoardPreview);
    closeButton.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
    });
    closeButton.addEventListener("click", () => {
      this.close();
    });

    const metaRow = surface.createDiv({
      cls: "glitter-pool-roam-board-modal__meta-row"
    });
    this.metaEl = metaRow.createDiv({
      cls: "glitter-pool-roam-board-modal__meta"
    });
    this.openInRoamButtonEl = metaRow.createEl("button", {
      cls: "glitter-pool-roam-board-modal__open-in-roam"
    }) as HTMLButtonElement;
    this.openInRoamButtonEl.type = "button";
    this.openInRoamButtonEl.setAttribute?.("aria-label", text.openInRoam);
    this.openInRoamButtonEl.setAttribute?.("title", text.openInRoam);
    this.openInRoamButtonEl.createEl("span", {
      cls: "glitter-pool-stage__results-tool-icon glitter-pool-stage__results-tool-icon--roam"
    });
    this.openInRoamButtonEl.createEl("span", {
      cls: "glitter-pool-roam-board-modal__open-in-roam-label",
      text: text.openInRoam
    });
    this.openInRoamButtonEl.addEventListener("click", () => {
      void this.handleOpenInRoam();
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
    this.downloadButtonEl.setAttribute?.("aria-label", text.downloadCurrentBoard);
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
    this.shareButtonEl.setAttribute?.("aria-label", text.shareCurrentBoard);
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

    this.addIdeaBlockButtonEl = floatingActions.createEl("button", {
      cls: "glitter-pool-roam-board-modal__floating-action glitter-pool-roam-board-modal__floating-action--idea-block"
    }) as HTMLButtonElement;
    this.addIdeaBlockButtonEl.type = "button";
    this.addIdeaBlockButtonEl.setAttribute?.("aria-label", text.addCurrentBoardIdeaBlock);
    this.addIdeaBlockButtonEl.createEl("span", {
      cls: "glitter-pool-stage__roam-floating-action-icon glitter-pool-stage__roam-floating-action-icon--idea-block"
    });
    this.addIdeaBlockButtonEl.addEventListener("click", () => {
      const board = this.getActiveBoard();
      if (!board || !this.handlers.onAddIdeaBlock) {
        return;
      }
      this.handlers.onAddIdeaBlock(board, {
        onAttached: (boards) => {
          if (boards) {
            this.replaceBoards(boards, board.path);
          }
          const currentOpenVersion = ++this.openVersion;
          void this.renderActiveBoard(currentOpenVersion);
        }
      });
    });

    const canvasHostEl = canvasMountEl.createDiv({
      cls: "glitter-pool-roam-board-modal__canvas-host"
    });
    this.boardMountEl = canvasHostEl;
    this.openInRoamConfirmMountEl = canvasMountEl.createDiv();

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
    this.invalidateOpenInRoamRequests();
    this.boardMountEl = null;
    this.boardTitleEl = null;
    this.pathEl = null;
    this.metaEl = null;
    this.navCountEl = null;
    this.prevButtonEl = null;
    this.nextButtonEl = null;
    this.downloadButtonEl = null;
    this.shareButtonEl = null;
    this.addIdeaBlockButtonEl = null;
    this.openInRoamButtonEl = null;
    this.openInRoamConfirmMountEl = null;
    this.canvasHost?.destroy();
    this.containerEl?.removeClass?.("glitter-pool-roam-board-modal-host");
    this.modalEl?.removeClass?.("glitter-pool-roam-board-modal");
    this.contentEl?.removeClass?.("glitter-pool-roam-board-modal__content");
    this.contentEl?.empty?.();
    this.handlers.onClose?.();
  }

  getActiveBoardPath(): string | undefined {
    return this.getActiveBoard()?.path;
  }

  getOpenInRoamRequestVersion(): number {
    return this.openInRoamRequestVersion;
  }

  isOpenInRoamRequestCurrent(version: number): boolean {
    return version === this.openInRoamRequestVersion;
  }

  private getActiveBoard(): PoolRoamBoardRecord | undefined {
    return this.boards[this.activeBoardIndex];
  }

  private navigate(step: -1 | 1): void {
    const nextIndex = clampBoardIndex(this.activeBoardIndex + step, this.boards.length);
    if (nextIndex === this.activeBoardIndex) {
      return;
    }

    this.invalidateOpenInRoamRequests();
    this.activeBoardIndex = nextIndex;
    const currentOpenVersion = ++this.openVersion;
    void this.renderActiveBoard(currentOpenVersion);
  }

  private replaceBoards(boards: PoolRoamBoardRecord[], activeBoardPath: string): void {
    this.invalidateOpenInRoamRequests();
    this.boards.splice(0, this.boards.length, ...boards);
    const nextIndex = boards.findIndex((candidate) => candidate.path === activeBoardPath);
    this.activeBoardIndex = clampBoardIndex(nextIndex >= 0 ? nextIndex : this.activeBoardIndex, boards.length);
  }

  private syncBoardMeta(board: PoolRoamBoardRecord): void {
    if (!this.boardTitleEl || !this.pathEl || !this.metaEl || !this.boardMountEl) {
      return;
    }

    this.boardTitleEl.textContent = board.name;
    this.pathEl.textContent = board.path;
    this.boardMountEl.dataset.boardPath = board.path;
    this.metaEl.empty();

    board.relatedPools.forEach((pool) => {
      const chip = this.metaEl?.createEl("span", {
        cls: "glitter-pool-roam-board-modal__chip",
        text: pool.name
      });
      chip?.setAttribute?.("data-pool-id", pool.id);
    });

    this.metaEl.createEl("span", {
      cls: "glitter-pool-roam-board-modal__chip glitter-snippet-locations-modal__card-count",
      text: formatUpdatedAt(board.updatedAt, this.options.interfaceLanguage)
    });
    this.metaEl.createEl("span", {
      cls: "glitter-pool-roam-board-modal__chip glitter-snippet-locations-modal__card-count",
      text: resolveBoardKindLabel(board, this.options.interfaceLanguage)
    });
  }

  private syncNavigationState(): void {
    const activeBoard = this.getActiveBoard();

    if (this.navCountEl) {
      this.navCountEl.textContent = `${activeBoard ? this.activeBoardIndex + 1 : 0} / ${this.boards.length}`;
    }

    if (this.prevButtonEl) {
      this.prevButtonEl.disabled = !activeBoard || this.activeBoardIndex <= 0;
    }

    if (this.nextButtonEl) {
      this.nextButtonEl.disabled = !activeBoard || this.activeBoardIndex >= this.boards.length - 1;
    }

    if (this.downloadButtonEl) {
      this.downloadButtonEl.disabled = !activeBoard || !this.handlers.onDownloadBoard;
    }

    if (this.shareButtonEl) {
      this.shareButtonEl.disabled = !activeBoard || !this.handlers.onShareBoard;
    }

    if (this.addIdeaBlockButtonEl) {
      this.addIdeaBlockButtonEl.disabled = !activeBoard || !this.handlers.onAddIdeaBlock;
    }

    if (this.openInRoamButtonEl) {
      this.openInRoamButtonEl.disabled = !activeBoard || !this.handlers.onOpenInRoam;
    }
  }

  private clearOpenInRoamConfirm(): void {
    this.openInRoamConfirmMountEl?.empty();
  }

  private invalidateOpenInRoamRequests(): void {
    this.openInRoamRequestVersion += 1;
    this.clearOpenInRoamConfirm();
  }

  private clearActiveBoardContent(): void {
    this.boardTitleEl?.empty?.();
    this.pathEl?.empty?.();
    this.metaEl?.empty?.();
    if (this.boardMountEl) {
      this.boardMountEl.empty();
      this.boardMountEl.dataset.boardPath = "";
    }
  }

  private async handleOpenInRoam(): Promise<void> {
    const board = this.getActiveBoard();
    if (!board || !this.handlers.onOpenInRoam) {
      return;
    }

    const requestVersion = ++this.openInRoamRequestVersion;
    this.clearOpenInRoamConfirm();

    try {
      const decision = await this.handlers.onOpenInRoam(board);
      if (requestVersion !== this.openInRoamRequestVersion || board !== this.getActiveBoard()) {
        return;
      }

      if (decision.type === "close") {
        this.close();
        return;
      }

      if (decision.type === "confirm") {
        this.renderOpenInRoamConfirm(board, decision.onConfirm, requestVersion);
      }
    } catch (error) {
      if (requestVersion !== this.openInRoamRequestVersion) {
        return;
      }
      this.handlers.onOpenError?.(error);
    }
  }

  private renderOpenInRoamConfirm(board: PoolRoamBoardRecord, onConfirm: () => Promise<boolean>, requestVersion: number): void {
    const confirmMountEl = this.openInRoamConfirmMountEl;
    if (!confirmMountEl || requestVersion !== this.openInRoamRequestVersion) {
      return;
    }

    const text = getInterfaceText(this.options.interfaceLanguage).roamModal;
    confirmMountEl.empty();
    const confirmHost = confirmMountEl.createDiv({
      cls: "glitter-write-stage__close-confirm glitter-pool-roam-board-modal__open-in-roam-confirm"
    });
    const dialog = confirmHost.createDiv({
      cls: "glitter-pool-roam-board-modal__open-in-roam-confirm-dialog"
    });
    dialog.createEl("h3", {
      cls: "glitter-write-stage__close-confirm-title",
      text: text.openInRoamReplaceTitle
    });
    dialog.createEl("p", {
      cls: "glitter-write-stage__close-confirm-description",
      text: text.openInRoamReplaceDescription(board.name)
    });
    const actions = dialog.createDiv({
      cls: "glitter-write-stage__close-confirm-actions"
    });
    const secondaryButton = actions.createEl("button", {
      cls: "glitter-write-stage__close-confirm-secondary",
      text: text.keepPreviewingHistory
    }) as HTMLButtonElement;
    secondaryButton.type = "button";
    secondaryButton.addEventListener("click", () => {
      this.invalidateOpenInRoamRequests();
    });
    const primaryButton = actions.createEl("button", {
      cls: "glitter-write-stage__close-confirm-primary",
      text: text.openInRoam
    }) as HTMLButtonElement;
    primaryButton.type = "button";
    primaryButton.addEventListener("click", () => {
      void this.confirmOpenInRoam(onConfirm, requestVersion);
    });
  }

  private async confirmOpenInRoam(onConfirm: () => Promise<boolean>, requestVersion: number): Promise<void> {
    try {
      const confirmed = await onConfirm();
      if (requestVersion !== this.openInRoamRequestVersion) {
        return;
      }

      if (confirmed) {
        this.close();
        return;
      }
    } catch (error) {
      if (requestVersion !== this.openInRoamRequestVersion) {
        return;
      }
      this.handlers.onOpenError?.(error);
    }

    if (requestVersion === this.openInRoamRequestVersion) {
      this.clearOpenInRoamConfirm();
    }
  }

  private async renderActiveBoard(openVersion: number): Promise<void> {
    const board = this.getActiveBoard();
    const mountEl = this.boardMountEl;

    this.syncNavigationState();
    if (!board) {
      this.clearActiveBoardContent();
      return;
    }

    if (!mountEl || !this.canvasHost) {
      return;
    }

    this.syncBoardMeta(board);

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
