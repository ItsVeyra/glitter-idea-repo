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

/**
 * 灵感片段选择器弹窗。
 * 负责搜索可插入的 Glitter 灵感，并支持键盘导航与结果快速插入。
 */

import { Modal } from "obsidian";
import { buildIdeaStatusLabels, countDistinctSnippetNotes, type Idea } from "../domain/idea/idea-model";
import type GlitterPlugin from "../plugin/GlitterPlugin";

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
    private readonly onPick: (ideaId: string) => Promise<void>
  ) {
    super(plugin.app);
  }

  // 打开时搭建搜索框与结果容器。
  override onOpen(): void {
    this.containerEl?.addClass?.("glitter-idea-picker-modal-host");
    this.modalEl?.addClass?.("glitter-idea-picker-modal");
    this.contentEl.empty();

    const surface = this.contentEl.createDiv({
      cls: "glitter-idea-picker-modal__surface glitter-idea-edit-modal__surface"
    });
    const header = surface.createDiv({
      cls: "glitter-idea-picker-modal__header glitter-idea-edit-modal__header"
    });
    header.createEl("h2", {
      cls: "glitter-idea-picker-modal__title glitter-idea-edit-modal__heading",
      text: "插入 Glitter 灵感"
    });
    const closeButton = header.createEl("button", {
      cls: "glitter-idea-picker-modal__close glitter-write-stage__close-button glitter-idea-edit-modal__close-button"
    });
    closeButton.type = "button";
    closeButton.setAttribute?.("aria-label", "关闭插入灵感窗口");
    closeButton.createEl("span", {
      cls: "glitter-write-stage__icon glitter-write-stage__icon--close"
    });
    closeButton.addEventListener("click", () => {
      this.close();
    });

    const queryInput = surface.createEl("input", {
      cls: "glitter-idea-picker-modal__query"
    });
    queryInput.type = "search";
    queryInput.value = this.query;
    queryInput.placeholder = "搜索灵感标题或正文";
    queryInput.addEventListener("input", () => {
      this.query = queryInput.value;
      this.clearSelectableResults();
      void this.renderResults();
    });
    queryInput.addEventListener("keydown", (event) => {
      this.handleKeydown(event as KeyboardEvent);
    });

    this.sectionTitleEl = surface.createDiv({
      cls: "glitter-idea-picker-modal__section-title"
    });
    this.resultsEl = surface.createDiv({
      cls: "glitter-idea-picker-modal__results"
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
    this.containerEl?.removeClass?.("glitter-idea-picker-modal-host");
    this.modalEl?.removeClass?.("glitter-idea-picker-modal");
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
    const resultEls = this.resultsEl?.querySelectorAll<HTMLElement>(".glitter-idea-picker-modal__result") ?? [];
    Array.from(resultEls).forEach((resultEl, index) => {
      resultEl.className =
        index === this.activeIndex
          ? "glitter-idea-picker-modal__result glitter-idea-picker-modal__result--active"
          : "glitter-idea-picker-modal__result";
      resultEl.setAttribute?.("aria-selected", index === this.activeIndex ? "true" : "false");
    });
  }

  private async pickIdea(ideaId: string): Promise<void> {
    if (this.isQueryPending || this.isPicking) {
      return;
    }

    this.isPicking = true;
    try {
      await this.onPick(ideaId);
      this.close();
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

    resultsEl.empty();
    if (this.sectionTitleEl) {
      this.sectionTitleEl.textContent = this.query.trim().length === 0 ? "最近使用" : "搜索结果";
    }

    if (this.renderedResults.length === 0) {
      resultsEl.createDiv({
        cls: "glitter-idea-picker-modal__empty",
        text: "没有找到匹配的灵感"
      });
      return;
    }

    this.renderedResults.forEach((idea, index) => {
      const row = resultsEl.createDiv({
        cls:
          index === this.activeIndex
            ? "glitter-idea-picker-modal__result glitter-idea-picker-modal__result--active"
            : "glitter-idea-picker-modal__result"
      });
      row.dataset.ideaId = idea.id;

      const header = row.createDiv({
        cls: "glitter-idea-picker-modal__result-header"
      });
      const content = header.createDiv({
        cls: "glitter-idea-picker-modal__result-content"
      });
      content.createEl("strong", {
        cls: "glitter-idea-picker-modal__result-title",
        text: idea.title
      });
      content.createEl("span", {
        cls: "glitter-idea-picker-modal__result-body",
        text: idea.body.replace(/\s+/g, " ").trim() || "无正文"
      });
      const actionButton = header.createEl("button", {
        cls: "glitter-idea-picker-modal__result-action",
        text: "+"
      });
      actionButton.type = "button";
      actionButton.setAttribute?.("aria-label", `插入灵感 ${idea.title}`);

      const meta = row.createDiv({
        cls: "glitter-idea-picker-modal__result-meta"
      });
      meta.createEl("span", {
        cls: "glitter-idea-picker-modal__result-pool",
        text: this.poolNameById.get(idea.poolId) ?? "未命名池"
      });
      buildIdeaStatusLabels({
        fileCreated: idea.fileCreated,
        snippetCount: countDistinctSnippetNotes(idea)
      }).forEach((label) => {
        meta.createEl("span", {
          cls: "glitter-idea-picker-modal__result-status",
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
      this.renderedResults = renderedResults;
      this.activeIndex =
        renderedResults.length === 0 ? -1 : this.activeIndex < 0 ? -1 : Math.min(this.activeIndex, renderedResults.length - 1);
      this.paintResults();
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
