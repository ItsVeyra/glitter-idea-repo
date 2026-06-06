import { Modal } from "obsidian";
import type {
  PoolRoamBoardRecord,
  PoolRoamThumbnailBox,
  PoolRoamThumbnailEdge
} from "../application/pool-workbench/pool-roam-workflow";
import { getInterfaceText, type InterfaceText } from "../i18n/interface-language";
import type { PluginInterfaceLanguage } from "../settings/settings";
import { setElementStyles } from "../ui/shared/theme-state";

export interface PoolRoamHistoryModalHandlers {
  onSelectBoard?: (board: PoolRoamBoardRecord, index: number) => void;
  onDeleteBoards?: (boardPaths: string[]) => Promise<PoolRoamBoardRecord[]>;
  onClose?: () => void;
}

export interface PoolRoamHistoryModalOptions {
  interfaceLanguage?: PluginInterfaceLanguage;
}

type PoolRoamThumbnailPreviewBox = PoolRoamThumbnailBox & {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

type PoolRoamThumbnailPreviewEdge = PoolRoamThumbnailEdge & {
  leftPct: number;
  topPct: number;
  widthPct: number;
  angleDeg: number;
};

type PoolRoamHistoryViewMode = "grid" | "list";

function formatUpdatedAt(updatedAt: number, text: InterfaceText, interfaceLanguage?: PluginInterfaceLanguage): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return text.roamModal.updatedUnknown;
  }

  const locale = interfaceLanguage === "en" ? "en-US" : "zh-CN";
  return text.roamModal.updatedAt(new Date(updatedAt).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }));
}

function resolveBoardSourceStatus(board: PoolRoamBoardRecord, text: InterfaceText): string {
  const sourceCount = board.thumbnailBoxes.filter((box) => box.kind === "source").length;
  if (sourceCount <= 0) {
    return text.roamModal.noSourceIdeas;
  }

  return text.roamModal.sourceCount(sourceCount);
}

function buildBoardMetaLine(board: PoolRoamBoardRecord, text: InterfaceText, interfaceLanguage?: PluginInterfaceLanguage): string {
  return `${formatUpdatedAt(board.updatedAt, text, interfaceLanguage)} · ${resolveBoardSourceStatus(board, text)}`;
}

function normalizeBoardQuery(query: string, interfaceLanguage?: PluginInterfaceLanguage): string {
  const locale = interfaceLanguage === "en" ? "en-US" : "zh-CN";
  return query.trim().toLocaleLowerCase(locale);
}

function matchesBoardQuery(
  board: PoolRoamBoardRecord,
  normalizedQuery: string,
  text: InterfaceText,
  interfaceLanguage?: PluginInterfaceLanguage
): boolean {
  if (!normalizedQuery) {
    return true;
  }

  const locale = interfaceLanguage === "en" ? "en-US" : "zh-CN";
  const haystack = [
    board.name,
    buildBoardMetaLine(board, text, interfaceLanguage),
    ...board.relatedPools.map((pool) => pool.name)
  ].join("\n").toLocaleLowerCase(locale);

  return haystack.includes(normalizedQuery);
}

function buildThumbnailPreviewBoxes(thumbnailBoxes: PoolRoamThumbnailBox[]): PoolRoamThumbnailPreviewBox[] {
  if (thumbnailBoxes.length === 0) {
    return [];
  }

  const padding = 36;
  const minX = Math.min(...thumbnailBoxes.map((box) => box.x)) - padding;
  const minY = Math.min(...thumbnailBoxes.map((box) => box.y)) - padding;
  const maxRight = Math.max(...thumbnailBoxes.map((box) => box.x + box.width)) + padding;
  const maxBottom = Math.max(...thumbnailBoxes.map((box) => box.y + box.height)) + padding;
  const totalWidth = Math.max(maxRight - minX, 1);
  const totalHeight = Math.max(maxBottom - minY, 1);

  return thumbnailBoxes.map((box) => ({
    ...box,
    leftPct: ((box.x - minX) / totalWidth) * 100,
    topPct: ((box.y - minY) / totalHeight) * 100,
    widthPct: (box.width / totalWidth) * 100,
    heightPct: (box.height / totalHeight) * 100
  }));
}

function resolveThumbnailEdgeAnchor(
  box: PoolRoamThumbnailPreviewBox,
  targetBox: PoolRoamThumbnailPreviewBox
): { xPct: number; yPct: number } {
  const boxCenterX = box.leftPct + box.widthPct / 2;
  const boxCenterY = box.topPct + box.heightPct / 2;
  const targetCenterX = targetBox.leftPct + targetBox.widthPct / 2;
  const targetCenterY = targetBox.topPct + targetBox.heightPct / 2;
  const deltaX = targetCenterX - boxCenterX;
  const deltaY = targetCenterY - boxCenterY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return {
      xPct: deltaX >= 0 ? box.leftPct + box.widthPct : box.leftPct,
      yPct: boxCenterY
    };
  }

  return {
    xPct: boxCenterX,
    yPct: deltaY >= 0 ? box.topPct + box.heightPct : box.topPct
  };
}

function buildThumbnailPreviewEdges(
  thumbnailEdges: PoolRoamThumbnailEdge[],
  previewBoxes: PoolRoamThumbnailPreviewBox[]
): PoolRoamThumbnailPreviewEdge[] {
  if (thumbnailEdges.length === 0 || previewBoxes.length === 0) {
    return [];
  }

  const previewBoxMap = new Map(
    previewBoxes
      .filter((box): box is PoolRoamThumbnailPreviewBox & { nodeId: string } => typeof box.nodeId === "string")
      .map((box) => [box.nodeId, box] as const)
  );

  return thumbnailEdges.flatMap((edge) => {
    const fromBox = previewBoxMap.get(edge.fromNodeId);
    const toBox = previewBoxMap.get(edge.toNodeId);
    if (!fromBox || !toBox) {
      return [];
    }

    const start = resolveThumbnailEdgeAnchor(fromBox, toBox);
    const end = resolveThumbnailEdgeAnchor(toBox, fromBox);
    const deltaX = end.xPct - start.xPct;
    const deltaY = end.yPct - start.yPct;

    return [{
      ...edge,
      leftPct: start.xPct,
      topPct: start.yPct,
      widthPct: Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY), 0.5),
      angleDeg: Math.atan2(deltaY, deltaX) * (180 / Math.PI)
    }];
  });
}

function applyThumbnailBoxStyle(boxEl: HTMLElement, box: PoolRoamThumbnailPreviewBox): void {
  boxEl.setAttribute(
    "style",
    [
      `--glitter-thumbnail-left: ${box.leftPct.toFixed(3)}%`,
      `--glitter-thumbnail-top: ${box.topPct.toFixed(3)}%`,
      `--glitter-thumbnail-width: ${box.widthPct.toFixed(3)}%`,
      `--glitter-thumbnail-height: ${box.heightPct.toFixed(3)}%`
    ].join("; ")
  );
}

function applyThumbnailEdgeStyle(edgeEl: HTMLElement, edge: PoolRoamThumbnailPreviewEdge): void {
  edgeEl.setAttribute(
    "style",
    [
      `--glitter-thumbnail-edge-left: ${edge.leftPct.toFixed(3)}%`,
      `--glitter-thumbnail-edge-top: ${edge.topPct.toFixed(3)}%`,
      `--glitter-thumbnail-edge-width: ${edge.widthPct.toFixed(3)}%`,
      `--glitter-thumbnail-edge-angle: ${edge.angleDeg.toFixed(3)}deg`
    ].join("; ")
  );
}

function setElementDisplay(element: HTMLElement | null, display: string): void {
  if (!element) {
    return;
  }

  setElementStyles(element, { display });
}

function setButtonLabel(button: HTMLButtonElement | null, label: string): void {
  button?.setAttribute?.("aria-label", label);
  button?.setAttribute?.("title", label);
}

export class PoolRoamHistoryModal extends Modal {
  private boardsState: PoolRoamBoardRecord[];

  private viewMode: PoolRoamHistoryViewMode = "grid";

  private query = "";

  private batchMode = false;

  private deletingSelection = false;

  private readonly selectedBoardPaths = new Set<string>();

  private summaryEl: HTMLElement | null = null;

  private gridToggleEl: HTMLButtonElement | null = null;

  private listToggleEl: HTMLButtonElement | null = null;

  private searchInputEl: HTMLInputElement | null = null;

  private batchToggleEl: HTMLButtonElement | null = null;

  private batchFooterEl: HTMLElement | null = null;

  private batchCancelEl: HTMLButtonElement | null = null;

  private batchDeleteEl: HTMLButtonElement | null = null;

  private recordsShellEl: HTMLElement | null = null;

  private recordsContentEl: HTMLElement | null = null;

  private recordsScrollTop = 0;

  private get text(): InterfaceText {
    return getInterfaceText(this.options.interfaceLanguage);
  }

  constructor(
    app: unknown,
    boards: PoolRoamBoardRecord[],
    private readonly handlers: PoolRoamHistoryModalHandlers = {},
    private readonly options: PoolRoamHistoryModalOptions = {}
  ) {
    super(app as never);
    this.boardsState = [...boards];
  }

  override onOpen(): void {
    const text = this.text;
    this.containerEl?.addClass?.("glitter-pool-roam-history-modal-host");
    this.modalEl?.addClass?.("glitter-pool-roam-history-modal");
    this.contentEl?.addClass?.("glitter-pool-roam-history-modal__content");
    this.contentEl.empty();

    const surface = this.contentEl.createDiv({
      cls: "glitter-pool-roam-history-modal__surface GlitterIdea-edit-modal__surface"
    });
    const header = surface.createDiv({
      cls: "glitter-pool-roam-history-modal__header GlitterIdea-edit-modal__header"
    });
    const heading = header.createDiv({
      cls: "glitter-pool-roam-history-modal__heading"
    });
    heading.createEl("h2", {
      cls: "glitter-pool-roam-history-modal__title glitter-snippet-locations-modal__title GlitterIdea-edit-modal__heading",
      text: text.roamModal.title
    });

    const closeButton = header.createEl("button", {
      cls: "glitter-pool-roam-history-modal__close glitter-write-stage__close-button GlitterIdea-edit-modal__close-button"
    }) as HTMLButtonElement;
    closeButton.type = "button";
    closeButton.setAttribute?.("aria-label", text.roamModal.closeHistory);
    closeButton.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
    });
    closeButton.addEventListener("click", () => {
      this.close();
    });

    const toolbar = surface.createDiv({
      cls: "glitter-pool-roam-history-modal__toolbar"
    });
    const viewToggleGroup = toolbar.createDiv({
      cls: "glitter-pool-roam-history-modal__view-toggle-group"
    });

    this.gridToggleEl = viewToggleGroup.createEl("button", {
      cls: "glitter-pool-roam-history-modal__view-toggle glitter-pool-roam-history-modal__view-toggle--grid"
    }) as HTMLButtonElement;
    this.gridToggleEl.type = "button";
    setButtonLabel(this.gridToggleEl, text.roamModal.switchToGrid);
    this.gridToggleEl.createEl("span", {
      cls: "glitter-write-stage__icon glitter-pool-roam-history-modal__icon--grid"
    });
    this.gridToggleEl.addEventListener("click", () => {
      this.viewMode = "grid";
      this.renderBoardRecords();
    });

    this.listToggleEl = viewToggleGroup.createEl("button", {
      cls: "glitter-pool-roam-history-modal__view-toggle glitter-pool-roam-history-modal__view-toggle--list"
    }) as HTMLButtonElement;
    this.listToggleEl.type = "button";
    setButtonLabel(this.listToggleEl, text.roamModal.switchToList);
    this.listToggleEl.createEl("span", {
      cls: "glitter-write-stage__icon glitter-pool-roam-history-modal__icon--list"
    });
    this.listToggleEl.addEventListener("click", () => {
      this.viewMode = "list";
      this.renderBoardRecords();
    });

    const searchShell = toolbar.createDiv({
      cls: "glitter-pool-roam-history-modal__search-shell"
    });
    this.searchInputEl = searchShell.createEl("input", {
      cls: "glitter-pool-roam-history-modal__search"
    }) as HTMLInputElement;
    this.searchInputEl.type = "text";
    this.searchInputEl.value = this.query;
    this.searchInputEl.placeholder = text.roamModal.searchPlaceholder;
    this.searchInputEl.addEventListener("input", () => {
      this.query = this.searchInputEl?.value ?? "";
      this.renderBoardRecords();
    });

    const toolbarActions = toolbar.createDiv({
      cls: "glitter-pool-roam-history-modal__toolbar-actions"
    });
    this.batchToggleEl = toolbarActions.createEl("button", {
      cls: "glitter-pool-roam-history-modal__toolbar-button glitter-pool-roam-history-modal__batch-toggle"
    }) as HTMLButtonElement;
    this.batchToggleEl.type = "button";
    setButtonLabel(this.batchToggleEl, text.roamModal.batchOrganize);
    this.batchToggleEl.createEl("span", {
      cls: "glitter-write-stage__icon glitter-pool-roam-history-modal__icon--batch"
    });
    this.batchToggleEl.addEventListener("click", () => {
      this.batchMode = !this.batchMode;
      if (!this.batchMode) {
        this.selectedBoardPaths.clear();
      }
      this.renderBoardRecords();
    });

    this.recordsShellEl = surface.createDiv({
      cls: "glitter-pool-roam-history-modal__records-shell"
    });
    this.recordsContentEl = this.recordsShellEl.createDiv({
      cls: "glitter-pool-roam-history-modal__records-content"
    });
    const recordsFooter = this.recordsShellEl.createDiv({
      cls: "glitter-pool-roam-history-modal__records-footer"
    });
    this.summaryEl = recordsFooter.createEl("p", {
      cls: "glitter-pool-roam-history-modal__summary glitter-snippet-locations-modal__summary"
    });

    this.batchFooterEl = surface.createDiv({
      cls: "glitter-pool-roam-history-modal__batch-footer"
    });
    this.batchCancelEl = this.batchFooterEl.createEl("button", {
      cls: "glitter-pool-roam-history-modal__batch-footer-button glitter-pool-roam-history-modal__batch-cancel"
    }) as HTMLButtonElement;
    this.batchCancelEl.type = "button";
    setButtonLabel(this.batchCancelEl, text.roamModal.cancelBatchOrganize);
    this.batchCancelEl.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
    });
    this.batchCancelEl.addEventListener("click", () => {
      this.batchMode = false;
      this.selectedBoardPaths.clear();
      this.renderBoardRecords();
    });

    this.batchDeleteEl = this.batchFooterEl.createEl("button", {
      cls: "glitter-pool-roam-history-modal__batch-footer-button glitter-pool-roam-history-modal__batch-delete"
    }) as HTMLButtonElement;
    this.batchDeleteEl.type = "button";
    setButtonLabel(this.batchDeleteEl, text.roamModal.deleteSelectedBoards);
    this.batchDeleteEl.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--trash"
    });
    this.batchDeleteEl.addEventListener("click", () => {
      void this.deleteSelectedBoards();
    });

    this.renderBoardRecords();
  }

  override onClose(): void {
    this.containerEl?.removeClass?.("glitter-pool-roam-history-modal-host");
    this.modalEl?.removeClass?.("glitter-pool-roam-history-modal");
    this.contentEl?.removeClass?.("glitter-pool-roam-history-modal__content");
    this.batchFooterEl = null;
    this.batchCancelEl = null;
    this.batchDeleteEl = null;
    this.recordsShellEl = null;
    this.recordsContentEl = null;
    this.recordsScrollTop = 0;
    this.summaryEl = null;
    this.contentEl?.empty?.();
    this.handlers.onClose?.();
  }

  private getFilteredBoards(): Array<{ board: PoolRoamBoardRecord; index: number }> {
    const text = this.text;
    const normalizedQuery = normalizeBoardQuery(this.query, this.options.interfaceLanguage);
    return this.boardsState
      .map((board, index) => ({ board, index }))
      .filter(({ board }) => matchesBoardQuery(board, normalizedQuery, text, this.options.interfaceLanguage));
  }

  private syncToolbarState(): void {
    const text = this.text;
    if (this.summaryEl) {
      this.summaryEl.textContent = text.roamModal.summary(this.boardsState.length);
    }

    this.gridToggleEl?.setAttribute?.("aria-pressed", String(this.viewMode === "grid"));
    this.listToggleEl?.setAttribute?.("aria-pressed", String(this.viewMode === "list"));

    if (this.batchToggleEl) {
      const batchToggleLabel = this.batchMode ? text.roamModal.finishBatchOrganize : text.roamModal.batchOrganize;
      setButtonLabel(this.batchToggleEl, batchToggleLabel);
      this.batchToggleEl.setAttribute?.("aria-pressed", String(this.batchMode));
      this.batchToggleEl.disabled = this.deletingSelection;
    }

    setElementDisplay(this.batchFooterEl, this.batchMode ? "flex" : "none");

    if (this.batchCancelEl) {
      setButtonLabel(this.batchCancelEl, text.roamModal.cancelBatchOrganize);
      this.batchCancelEl.disabled = this.deletingSelection;
    }

    if (this.batchDeleteEl) {
      const selectedCount = this.selectedBoardPaths.size;
      const batchDeleteLabel = this.deletingSelection
        ? text.roamModal.deletingSelectedBoards
        : selectedCount > 0
          ? text.roamModal.deleteSelectedBoardsWithCount(selectedCount)
          : text.roamModal.deleteSelectedBoards;
      setButtonLabel(this.batchDeleteEl, batchDeleteLabel);
      this.batchDeleteEl.disabled = this.deletingSelection || selectedCount === 0;
    }
  }

  private renderBoardRecords(): void {
    const text = this.text;
    this.syncToolbarState();

    if (!this.recordsContentEl) {
      return;
    }

    const previousListEl = this.recordsContentEl.querySelector<HTMLElement>(".glitter-pool-roam-history-modal__list");
    if (previousListEl) {
      this.recordsScrollTop = previousListEl.scrollTop;
    }

    this.recordsContentEl.empty();
    const filteredBoards = this.getFilteredBoards();
    if (filteredBoards.length === 0) {
      this.recordsContentEl.createEl("div", {
        cls: "glitter-pool-roam-history-modal__empty glitter-snippet-locations-modal__summary",
        text: this.boardsState.length === 0
          ? text.roamModal.emptyNoBoards
          : text.roamModal.emptyNoMatches
      });
      return;
    }

    const listEl = this.recordsContentEl.createDiv({
      cls: `glitter-pool-roam-history-modal__list glitter-pool-roam-history-modal__list--${this.viewMode}`
    });

    filteredBoards.forEach(({ board, index }) => {
      const card = listEl.createDiv({
        cls: `glitter-pool-roam-history-modal__card glitter-pool-roam-history-modal__card--${this.viewMode}`
      });
      const isSelected = this.selectedBoardPaths.has(board.path);
      card.setAttribute?.("role", "button");
      card.setAttribute?.("tabindex", "0");
      card.setAttribute?.(
        "aria-label",
        this.batchMode
          ? isSelected
            ? text.roamModal.deselectBoard(board.name)
            : text.roamModal.selectBoard(board.name)
          : text.roamModal.openBoard(board.name)
      );
      if (this.batchMode) {
        card.setAttribute?.("aria-pressed", String(isSelected));
      }
      card.dataset.boardPath = board.path;
      card.dataset.boardIndex = `${index}`;
      if (this.batchMode && isSelected) {
        card.addClass("glitter-pool-roam-history-modal__card--selected");
      }

      // 选圈和整卡都复用这条路径，避免批量态出现“视觉选中了但数据没切换”或滚动位置丢失的分叉逻辑。
      const toggleBoardSelection = (): void => {
        if (isSelected) {
          this.selectedBoardPaths.delete(board.path);
        } else {
          this.selectedBoardPaths.add(board.path);
        }
        this.renderBoardRecords();
      };

      if (this.batchMode) {
        const cardSelect = card.createEl("button", {
          cls: "glitter-pool-roam-history-modal__card-select"
        });
        cardSelect.type = "button";
        cardSelect.setAttribute?.(
          "aria-label",
          isSelected ? text.roamModal.deselectBoard(board.name) : text.roamModal.selectBoard(board.name)
        );
        cardSelect.setAttribute?.("aria-pressed", String(isSelected));
        if (isSelected) {
          cardSelect.addClass("glitter-pool-roam-history-modal__card-select--selected");
        }
        cardSelect.createDiv({
          cls: "glitter-pool-roam-history-modal__card-select-dot"
        });
        cardSelect.dataset.role = "selection-indicator";
        cardSelect.addEventListener("click", (event) => {
          event?.stopPropagation?.();
          toggleBoardSelection();
        });
      }

      const preview = card.createDiv({
        cls: "glitter-pool-roam-history-modal__card-preview"
      });
      preview.dataset.role = "thumbnail-preview";

      const previewBoxes = buildThumbnailPreviewBoxes(board.thumbnailBoxes);
      const previewEdges = buildThumbnailPreviewEdges(board.thumbnailEdges ?? [], previewBoxes);
      if (previewBoxes.length === 0) {
        preview.createEl("span", {
          cls: "glitter-pool-roam-history-modal__preview-empty",
          text: text.roamModal.noThumbnail
        });
      } else {
        const previewStage = preview.createDiv({
          cls: "glitter-pool-roam-history-modal__preview-stage"
        });
        const previewEdgeLayer = previewStage.createDiv({
          cls: "glitter-pool-roam-history-modal__preview-edges"
        });
        previewEdges.forEach((edge, edgeIndex) => {
          const edgeEl = previewEdgeLayer.createDiv({
            cls: "glitter-pool-roam-history-modal__thumbnail-edge"
          });
          edgeEl.dataset.edgeIndex = `${edgeIndex}`;
          edgeEl.dataset.fromNodeId = edge.fromNodeId;
          edgeEl.dataset.toNodeId = edge.toNodeId;
          applyThumbnailEdgeStyle(edgeEl, edge);
        });
        previewBoxes.forEach((box, boxIndex) => {
          const boxEl = previewStage.createDiv({
            cls: `glitter-pool-roam-history-modal__thumbnail-box glitter-pool-roam-history-modal__thumbnail-box--${box.kind}`
          });
          boxEl.dataset.boxIndex = `${boxIndex}`;
          boxEl.dataset.boxKind = box.kind;
          boxEl.dataset.boxWidth = `${box.width}`;
          boxEl.dataset.boxHeight = `${box.height}`;
          if (box.nodeId) {
            boxEl.dataset.nodeId = box.nodeId;
          }
          applyThumbnailBoxStyle(boxEl, box);

          const silhouette = boxEl.createDiv({
            cls: "glitter-pool-roam-history-modal__thumbnail-box-silhouette"
          });
          silhouette.createDiv({
            cls: "glitter-pool-roam-history-modal__thumbnail-box-line glitter-pool-roam-history-modal__thumbnail-box-line--primary"
          });
          silhouette.createDiv({
            cls: "glitter-pool-roam-history-modal__thumbnail-box-line glitter-pool-roam-history-modal__thumbnail-box-line--secondary"
          });
          silhouette.createDiv({
            cls: "glitter-pool-roam-history-modal__thumbnail-box-chip"
          });
        });
      }

      const cardBody = card.createDiv({
        cls: "glitter-pool-roam-history-modal__card-body"
      });
      const main = cardBody.createDiv({
        cls: "glitter-pool-roam-history-modal__card-main"
      });
      main.createEl("strong", {
        cls: "glitter-pool-roam-history-modal__card-title glitter-snippet-locations-modal__card-title",
        text: board.name
      });
      const updatedEl = main.createEl("span", {
        cls: "glitter-pool-roam-history-modal__card-updated glitter-snippet-locations-modal__card-count",
        text: buildBoardMetaLine(board, text, this.options.interfaceLanguage)
      });
      updatedEl.dataset.role = "updated-time";

      const meta = cardBody.createDiv({
        cls: "glitter-pool-roam-history-modal__card-meta"
      });
      if (board.relatedPools.length === 0) {
        meta.createEl("span", {
          cls: "glitter-pool-roam-history-modal__chip glitter-pool-roam-history-modal__chip--muted",
          text: text.roamModal.noLinkedPool
        });
      } else {
        board.relatedPools.forEach((pool) => {
          const chip = meta.createEl("span", {
            cls: "glitter-pool-roam-history-modal__chip",
            text: pool.name
          });
          chip.dataset.role = "pool-tag";
          chip.dataset.poolId = pool.id;
        });
      }

      const handleCardActivation = (): void => {
        if (this.batchMode) {
          toggleBoardSelection();
          return;
        }

        this.handlers.onSelectBoard?.(board, index);
      };

      card.addEventListener("click", handleCardActivation);
      card.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        handleCardActivation();
      });
    });

    // 必须等列表节点全部挂完再回填 scrollTop，真实运行时否则会被浏览器重新压回顶部。
    listEl.scrollTop = this.recordsScrollTop;
  }

  private async deleteSelectedBoards(): Promise<void> {
    if (!this.handlers.onDeleteBoards || this.selectedBoardPaths.size === 0 || this.deletingSelection) {
      return;
    }

    this.deletingSelection = true;
    this.syncToolbarState();

    try {
      this.boardsState = await this.handlers.onDeleteBoards(Array.from(this.selectedBoardPaths));
      this.selectedBoardPaths.clear();
      this.batchMode = false;
    } catch {
      // Keep current selection so the user can retry after the toolbar state is restored.
    } finally {
      this.deletingSelection = false;
    }

    this.renderBoardRecords();
  }
}
