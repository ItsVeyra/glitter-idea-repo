/**
 * 灵感片段选择器弹窗。
 * 负责搜索可插入的 Glitter 灵感，并支持键盘导航与结果快速插入。
 */

import { Modal } from "obsidian";
import { reconcileIdeaRuntimeState } from "../application/idea-query/idea-runtime-source";
import { buildIdeaStatusLabels, countDistinctSnippetNotes, type Idea } from "../domain/idea/idea-model";
import { getInterfaceText } from "../i18n/interface-language";
import type GlitterPlugin from "../plugin/GlitterPlugin";

export type IdeaPickerModalMode = "snippet" | "canvas-block" | "roam-block";

export interface IdeaPickerModalOptions {
  mode?: IdeaPickerModalMode;
}

// 片段选择器的查询、选中与渲染流程。
export class IdeaPickerModal extends Modal {
  private query = "";

  private resultsEl?: HTMLElement;

  private sectionTitleEl?: HTMLElement;

  private queryRequestVersion = 0;

  private activeIndex = -1;

  private renderedResults: Idea[] = [];

  private readonly poolNameById = new Map<string, string>();

  private poolNamesPromise?: Promise<void>;

  private isQueryPending = false;

  private isPicking = false;

  constructor(
    private readonly plugin: GlitterPlugin,
    private readonly onPick: (ideaId: string) => Promise<void>,
    private readonly options: IdeaPickerModalOptions = {}
  ) {
    super(plugin.app);
  }

  private get pickerText() {
    return getInterfaceText(this.plugin.settings?.interfaceLanguage).picker;
  }

  // 打开时搭建搜索框与结果容器。
  override onOpen(): void {
    this.containerEl?.addClass?.("GlitterIdea-picker-modal-host");
    this.modalEl?.addClass?.("GlitterIdea-picker-modal");
    this.contentEl.empty();

    const pickerText = this.pickerText;
    const title =
      this.options.mode === "canvas-block"
        ? pickerText.canvasTitle
        : this.options.mode === "roam-block"
          ? pickerText.roamBlockTitle
          : pickerText.snippetTitle;

    const surface = this.contentEl.createDiv({
      cls: "GlitterIdea-picker-modal__surface GlitterIdea-edit-modal__surface"
    });
    const header = surface.createDiv({
      cls: "GlitterIdea-picker-modal__header GlitterIdea-edit-modal__header"
    });
    header.createEl("h2", {
      cls: "GlitterIdea-picker-modal__title GlitterIdea-edit-modal__heading",
      text: title
    });
    const closeButton = header.createEl("button", {
      cls: "GlitterIdea-picker-modal__close glitter-write-stage__close-button GlitterIdea-edit-modal__close-button"
    });
    closeButton.type = "button";
    closeButton.setAttribute?.("aria-label", pickerText.closeLabel);
    closeButton.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
    });
    closeButton.addEventListener("click", () => {
      this.close();
    });

    const queryInput = surface.createEl("input", {
      cls: "GlitterIdea-picker-modal__query"
    });
    queryInput.type = "search";
    queryInput.value = this.query;
    queryInput.placeholder = pickerText.queryPlaceholder;
    queryInput.addEventListener("input", () => {
      this.query = queryInput.value;
      this.clearSelectableResults();
      void this.renderResults();
    });
    queryInput.addEventListener("keydown", (event) => {
      this.handleKeydown(event as KeyboardEvent);
    });

    this.sectionTitleEl = surface.createDiv({
      cls: "GlitterIdea-picker-modal__section-title"
    });
    this.resultsEl = surface.createDiv({
      cls: "GlitterIdea-picker-modal__results"
    });

    queryInput.focus?.();
    void this.preloadPoolNames();
    void this.renderResults();
  }

  override onClose(): void {
    this.queryRequestVersion += 1;
    this.resultsEl = undefined;
    this.sectionTitleEl = undefined;
    this.renderedResults = [];
    this.activeIndex = -1;
    this.isQueryPending = false;
    this.isPicking = false;
    this.containerEl?.removeClass?.("GlitterIdea-picker-modal-host");
    this.modalEl?.removeClass?.("GlitterIdea-picker-modal");
    this.contentEl?.empty?.();
  }

  // 键盘导航与确认插入。
  private handleKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case "ArrowDown":
        if (this.renderedResults.length === 0) {
          return;
        }
        event.preventDefault();
        this.setActiveIndex(this.activeIndex + 1);
        return;
      case "ArrowUp":
        if (this.renderedResults.length === 0) {
          return;
        }
        event.preventDefault();
        this.setActiveIndex(this.activeIndex - 1);
        return;
      case "Enter": {
        const activeIdea = this.renderedResults[this.activeIndex];
        if (!activeIdea) {
          return;
        }
        event.preventDefault();
        void this.pickIdea(activeIdea.id);
        return;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation?.();
        this.close();
        return;
      default:
        return;
    }
  }

  private setActiveIndex(nextIndex: number): void {
    if (this.renderedResults.length === 0) {
      this.activeIndex = -1;
      return;
    }

    this.activeIndex = Math.max(0, Math.min(nextIndex, this.renderedResults.length - 1));
    this.syncActiveResult();
  }

  private syncActiveResult(): void {
    const resultEls = this.resultsEl?.querySelectorAll<HTMLElement>(".GlitterIdea-picker-modal__result") ?? [];
    Array.from(resultEls).forEach((resultEl, index) => {
      resultEl.className =
        index === this.activeIndex
          ? "GlitterIdea-picker-modal__result GlitterIdea-picker-modal__result--active"
          : "GlitterIdea-picker-modal__result";
      resultEl.setAttribute?.("aria-selected", index === this.activeIndex ? "true" : "false");
    });
  }

  private commitRenderedResults(renderedResults: Idea[]): void {
    this.renderedResults = renderedResults;
    this.activeIndex =
      renderedResults.length === 0
        ? -1
        : this.activeIndex < 0
          ? -1
          : Math.min(this.activeIndex, renderedResults.length - 1);
    this.paintResults();
  }

  private async pickIdea(ideaId: string): Promise<void> {
    if (this.isQueryPending || this.isPicking) {
      return;
    }

    this.isPicking = true;
    try {
      await this.onPick(ideaId);
      this.close();
    } catch {
      return;
    } finally {
      this.isPicking = false;
    }
  }

  private clearSelectableResults(): void {
    this.isQueryPending = true;
    this.renderedResults = [];
    this.activeIndex = -1;
    this.resultsEl?.empty();
  }

  private async hydrateResultsWithRuntimeState(results: Idea[]): Promise<Idea[]> {
    if (results.length === 0) {
      return results;
    }

    try {
      return await reconcileIdeaRuntimeState(this.plugin.ideaService, this.plugin.app.vault, results);
    } catch {
      return results;
    }
  }

  private async reconcileRenderedResults(requestVersion: number, renderedResults: Idea[]): Promise<void> {
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
    if (!this.resultsEl || requestVersion !== this.queryRequestVersion) {
      return;
    }

    const runtimeRenderedResults = await this.hydrateResultsWithRuntimeState(renderedResults);
    if (!this.resultsEl || requestVersion !== this.queryRequestVersion) {
      return;
    }

    this.commitRenderedResults(runtimeRenderedResults);
  }

  // 预加载池名称，补全结果元信息。
  private async preloadPoolNames(): Promise<void> {
    if (this.poolNamesPromise) {
      return this.poolNamesPromise;
    }

    this.poolNamesPromise = Promise.resolve(this.plugin.poolService?.listPools?.() ?? [])
      .then((pools) => {
        this.poolNameById.clear();
        (pools as Array<{ id: string; name: string }>).forEach((pool) => {
          this.poolNameById.set(pool.id, pool.name);
        });

        if (this.resultsEl && !this.isQueryPending) {
          this.paintResults();
        }
      })
      .catch(() => undefined);

    return this.poolNamesPromise;
  }

  // 将查询结果绘制为可选列表。
  private paintResults(): void {
    const resultsEl = this.resultsEl;
    if (!resultsEl) {
      return;
    }

    const interfaceText = getInterfaceText(this.plugin.settings?.interfaceLanguage);
    const pickerText = interfaceText.picker;
    const poolText = interfaceText.pool;

    resultsEl.empty();
    if (this.sectionTitleEl) {
      this.sectionTitleEl.textContent =
        this.query.trim().length === 0 ? pickerText.recentSectionTitle : pickerText.resultsSectionTitle;
    }

    if (this.renderedResults.length === 0) {
      resultsEl.createDiv({
        cls: "GlitterIdea-picker-modal__empty",
        text: pickerText.emptyResults
      });
      return;
    }

    this.renderedResults.forEach((idea, index) => {
      const row = resultsEl.createDiv({
        cls:
          index === this.activeIndex
            ? "GlitterIdea-picker-modal__result GlitterIdea-picker-modal__result--active"
            : "GlitterIdea-picker-modal__result"
      });
      row.dataset.ideaId = idea.id;

      const header = row.createDiv({
        cls: "GlitterIdea-picker-modal__result-header"
      });
      const content = header.createDiv({
        cls: "GlitterIdea-picker-modal__result-content"
      });
      content.createEl("strong", {
        cls: "GlitterIdea-picker-modal__result-title",
        text: idea.title
      });
      content.createEl("span", {
        cls: "GlitterIdea-picker-modal__result-body",
        text: idea.body.replace(/\s+/g, " ").trim() || pickerText.emptyBody
      });
      const actionButton = header.createEl("button", {
        cls: "GlitterIdea-picker-modal__result-action",
        text: "+"
      });
      actionButton.type = "button";
      actionButton.setAttribute?.(
        "aria-label",
        this.options.mode === "canvas-block"
          ? pickerText.canvasResultActionLabel(idea.title)
          : this.options.mode === "roam-block"
            ? pickerText.roamBlockResultActionLabel(idea.title)
            : pickerText.resultActionLabel(idea.title)
      );

      const meta = row.createDiv({
        cls: "GlitterIdea-picker-modal__result-meta"
      });
      meta.createEl("span", {
        cls: "GlitterIdea-picker-modal__result-pool",
        text: this.poolNameById.get(idea.poolId) ?? pickerText.untitledPool
      });
      const statusLabels = buildIdeaStatusLabels(
        {
          fileCreated: idea.fileCreated,
          snippetCount: countDistinctSnippetNotes(idea)
        },
        {
          fileCreatedStatus: poolText.cardFileCreatedStatus,
          snippetStatus: poolText.cardSnippetStatus
        }
      );
      statusLabels.forEach((label) => {
        meta.createEl("span", {
          cls: "GlitterIdea-picker-modal__result-status",
          text: label
        });
      });

      actionButton.addEventListener("click", () => {
        void this.pickIdea(idea.id);
      });
    });
  }

  // 异步查询灵感并刷新当前结果集。
  private async renderResults(): Promise<void> {
    if (!this.resultsEl) {
      return;
    }

    const requestVersion = ++this.queryRequestVersion;
    const query = this.query;
    this.isQueryPending = true;

    try {
      const results = (await this.plugin.ideaService.queryIdeas({
        text: query,
        sort: "updatedAt-desc"
      })) as Idea[];

      if (!this.resultsEl || requestVersion !== this.queryRequestVersion) {
        return;
      }

      const renderedResults = query.trim().length === 0 ? results.slice(0, 2) : results;
      this.commitRenderedResults(renderedResults);
      void this.reconcileRenderedResults(requestVersion, renderedResults);
    } catch {
      if (!this.resultsEl || requestVersion !== this.queryRequestVersion) {
        return;
      }
    } finally {
      if (this.resultsEl && requestVersion === this.queryRequestVersion) {
        this.isQueryPending = false;
      }
    }
  }
}
