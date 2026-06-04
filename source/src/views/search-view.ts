/**
 * 搜索工作区视图。
 * 负责保存搜索条件、拉取灵感结果，并把选择与批量状态同步到搜索渲染层。
 */

import { ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { GLITTER_ICON_ID, SEARCH_VIEW_TYPE } from "../plugin/constants";
import { createToastService } from "../feedback/toast-service";
import { renderSearchView } from "../ui/search/render-search";
import { buildSearchViewStateFromRuntime } from "../ui/search/search-state";

// 从工作区状态恢复搜索词。
function readSearchQueryFromState(state: unknown): string {
  if (!state || typeof state !== "object") {
    return "";
  }

  const query = (state as { query?: unknown }).query;
  return typeof query === "string" ? query : "";
}

// 搜索工作区生命周期与结果刷新。
export class GlitterSearchView extends ItemView {
  private query = "";

  private selectedResultIds = new Set<string>();

  private renderVersion = 0;

  private isClosed = false;

  private readonly toastService = createToastService();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: GlitterPlugin) {
    super(leaf);
  }

  override getViewType(): string {
    return SEARCH_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Glitter Search";
  }

  override getIcon(): string {
    return GLITTER_ICON_ID;
  }

  override async onOpen(): Promise<void> {
    this.isClosed = false;
    this.renderSearchShell();
  }

  override async onClose(): Promise<void> {
    this.isClosed = true;
    this.renderVersion += 1;
    this.contentEl.empty();
  }

  override getState(): Record<string, unknown> {
    return { query: this.query };
  }

  override async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    this.query = readSearchQueryFromState(state);
    this.selectedResultIds.clear();

    if (!this.isClosed) {
      this.renderSearchShell();
    }
  }

  // 查询执行与渲染更新。
  private renderSearchShell(): void {
    const renderVersion = ++this.renderVersion;
    void this.renderSearchShellAsync(renderVersion);
  }

  private async renderSearchShellAsync(renderVersion: number): Promise<void> {
    let ideas;
    try {
      ideas = await this.plugin.ideaService.queryIdeas({
        text: this.query,
        sort: "updatedAt-desc"
      });
    } catch (_error) {
      if (!this.shouldSkipRender(renderVersion)) {
        this.toastService.show({
          status: "error",
          message: "Search failed. Please try again."
        });
      }
      return;
    }

    if (this.shouldSkipRender(renderVersion)) {
      return;
    }

    const state = buildSearchViewStateFromRuntime({
      query: this.query,
      results: ideas.map((idea) => ({
        id: idea.id,
        title: idea.title,
        meta: `${idea.poolId} · Updated ${idea.updatedAt}`,
        selected: this.selectedResultIds.has(idea.id)
      })),
      selectedCount: ideas.filter((idea) => this.selectedResultIds.has(idea.id)).length
    });

    renderSearchView(this.contentEl, state, {
      onQuerySubmit: () => {
        this.query = this.readQueryInputValue();
        this.renderSearchShell();
      },
      onResultSelect: (resultId) => {
        if (this.selectedResultIds.has(resultId)) {
          this.selectedResultIds.delete(resultId);
        } else {
          this.selectedResultIds.add(resultId);
        }
        this.renderSearchShell();
      },
      onBatchAction: () => {
        this.selectedResultIds.clear();
        this.renderSearchShell();
      }
    });
  }

  private shouldSkipRender(renderVersion: number): boolean {
    return this.isClosed || renderVersion !== this.renderVersion;
  }

  // 从当前界面读取最新输入值。
  private readQueryInputValue(): string {
    const querySelector = (this.contentEl as HTMLElement & {
      querySelector?: <T extends Element = Element>(selectors: string) => T | null;
    }).querySelector;

    if (typeof querySelector !== "function") {
      return this.query;
    }

    const input = querySelector<HTMLInputElement>(".glitter-search-stage__query input");
    return input?.value ?? this.query;
  }
}
