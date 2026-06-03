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
 * 首页主视图。
 * 负责挂载首页灵感场、同步主题、处理首页搜索，并串联快速记录与归池流程。
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import { createToastService } from "../feedback/toast-service";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import type { HomeFieldView } from "../settings/settings";
import {
  CREATE_NEW_POOL_ID,
  DEFAULT_POOL_ID,
  DEFAULT_POOL_LABEL,
  GLITTER_ICON_ID,
  MAIN_VIEW_TYPE
} from "../plugin/constants";
import {
  buildHomeViewStateFromRuntime,
  type HomeRuntimeState
} from "../ui/home/home-state";
import { renderHomeView } from "../ui/home/render-home";
import { applyThemeSnapshot, buildThemeState } from "../ui/shared/theme-state";
import { PoolModal } from "./pool-modal";
import { QuickCaptureModal, type QuickCaptureSavedSelection } from "./quick-capture-modal";
import { FollowupGuidanceModal } from "./followup-guidance-modal";

export class GlitterMainView extends ItemView {
  private globalSelectedPoolState: { id: string; label: string } = {
    id: DEFAULT_POOL_ID,
    label: DEFAULT_POOL_LABEL
  };

  private themeTargetEl: HTMLElement | null = null;

  private themeObserver: MutationObserver | null = null;

  private renderVersion = 0;

  private isClosed = false;

  private activeSearchFeedbackMessage?: string;

  private searchFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  private lastHomeRuntimeState: HomeRuntimeState | null = null;

  private pendingFirstUseReplay = false;

  private readonly toastService = createToastService();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: GlitterPlugin) {
    super(leaf);
  }

  override getViewType(): string {
    return MAIN_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Glitter";
  }

  override getIcon(): string {
    return GLITTER_ICON_ID;
  }

  // 工作区生命周期与首页初始渲染。
  override async onOpen(): Promise<void> {
    this.isClosed = false;
    this.contentEl?.addClass?.("glitter-idea-main-view-host");
    this.renderMainShell();
    this.startThemeSync();
  }

  override async onClose(): Promise<void> {
    this.isClosed = true;
    this.renderVersion += 1;
    this.clearSearchFeedbackTimer();
    this.stopThemeSync();
    this.themeTargetEl = null;
    this.contentEl?.removeClass?.("glitter-idea-main-view-host");
    this.contentEl.empty();
  }

  // 允许外部在当前首页重新触发首次使用流程。
  replayFirstUseOnCurrentHome(): void {
    this.pendingFirstUseReplay = true;
    if (!this.isClosed) {
      this.renderMainShell();
    }
  }

  // 首页数据加载与渲染。
  private renderMainShell(): void {
    const renderVersion = ++this.renderVersion;
    void this.renderMainShellAsync(renderVersion);
  }

  private async renderMainShellAsync(renderVersion: number): Promise<void> {
    const plugin = this.getPlugin();
    const runtime = await this.plugin.firstUseWorkflow.getHomeRuntimeState();
    if (this.shouldSkipRender(renderVersion)) {
      return;
    }

    this.lastHomeRuntimeState = runtime;

    const state = buildHomeViewStateFromRuntime(runtime, {
      poolColors: this.plugin.settings.poolColors,
      homeFieldView: this.plugin.settings.homeFieldView,
      searchFeedbackMessage: runtime.mode === "populated" ? this.activeSearchFeedbackMessage : undefined
    });

    if (this.shouldSkipRender(renderVersion)) {
      return;
    }

    const flowContext = state.mode === "empty" ? "first-use" : "global";
    const openHomePool = (poolId: string): void => {
      void plugin.activatePoolView({
        poolId,
        resetFilters: true
      });
    };
    const stage = renderHomeView(this.contentEl, state, {
      onPrimaryAction: () => this.openQuickCapture("capture", flowContext),
      onSecondaryAction: () => {
        if (state.mode === "empty") {
          this.openPoolModal("choose");
          return;
        }

        this.openPoolModal("create", {
          flowContext: "global",
          origin: "home-secondary-action"
        });
      },
      onPoolSelect: openHomePool,
      onPoolTitleSelect: openHomePool,
      onPoolRename: (poolId, name) => {
        void this.handleHomePoolRename(poolId, name);
      },
      onPoolDelete: (poolId) => {
        void this.handleHomePoolDelete(poolId);
      },
      onSearchSubmit: (query) => {
        void this.handleHomeSearchSubmit(query);
      },
      onOpenSettings: () => {
        this.openPluginSettings();
      },
      onFieldViewSelect: (homeFieldView) => {
        void this.handleHomeFieldViewSelect(homeFieldView);
      },
      onStatusFilterSelect: () => {
        void plugin.activatePoolView({
          mode: "browse",
          scope: "global-status",
          status: "with-markers",
          resetFilters: true
        });
      }
    });

    if (this.shouldSkipRender(renderVersion)) {
      return;
    }

    this.themeTargetEl = stage;
    this.syncThemeState();

    if (this.pendingFirstUseReplay) {
      this.pendingFirstUseReplay = false;
      this.openQuickCapture("capture", "first-use");
    }
  }

  // 首页主题同步与搜索反馈控制。
  private syncThemeState(): void {
    if (!this.themeTargetEl || this.isClosed) {
      return;
    }

    const themeState = buildThemeState(this.plugin.settings, this.themeTargetEl.ownerDocument ?? null);
    applyThemeSnapshot(this.themeTargetEl, themeState.runtime);
  }

  private async handleHomeSearchSubmit(rawQuery: string): Promise<void> {
    const query = rawQuery.trim();
    if (!query) {
      return;
    }

    const runtime = this.lastHomeRuntimeState ?? await this.plugin.firstUseWorkflow.getHomeRuntimeState();
    this.lastHomeRuntimeState = runtime;
    const normalizedQuery = query.toLowerCase();
    const matchedPool = runtime.pools.find((pool) => pool.name.trim().toLowerCase() === normalizedQuery);
    if (matchedPool) {
      await this.plugin.activatePoolView({
        poolId: matchedPool.id,
        resetFilters: true
      });
      return;
    }

    const matchedIdeas = await this.plugin.ideaService.queryIdeas({
      text: query,
      sort: "updatedAt-desc"
    });
    const matchedIdea = matchedIdeas[0];
    if (matchedIdea) {
      this.plugin.focusedIdeaId = matchedIdea.id;
      this.plugin.pendingFocusedPoolId = matchedIdea.poolId;
      await this.plugin.activatePoolView({
        poolId: matchedIdea.poolId,
        mode: "browse",
        resetFilters: true
      });
      return;
    }

    this.showSearchFeedback("未读取到搜索内容");
  }

  private showSearchFeedback(message: string): void {
    this.activeSearchFeedbackMessage = message;
    this.renderMainShell();
    this.clearSearchFeedbackTimer();
    this.searchFeedbackTimer = setTimeout(() => {
      this.activeSearchFeedbackMessage = undefined;
      this.searchFeedbackTimer = null;
      this.renderMainShell();
    }, 3000);
  }

  private openPluginSettings(): void {
    const setting = (this.plugin.app as {
      setting?: {
        open?: () => void;
        openTabById?: (id: string) => void;
      };
    }).setting;

    setting?.open?.();
    setting?.openTabById?.(this.plugin.manifest.id);
  }

  // 首页切换底层池场视图时，直接持久化选择，让下次回到 populated 首页时恢复同一视图。
  private async handleHomeFieldViewSelect(homeFieldView: HomeFieldView): Promise<void> {
    if (this.plugin.settings.homeFieldView === homeFieldView) {
      return;
    }

    this.plugin.settings.homeFieldView = homeFieldView;
    await this.plugin.savePluginSettings();
    this.renderMainShell();
  }

  private clearSearchFeedbackTimer(): void {
    if (!this.searchFeedbackTimer) {
      return;
    }

    clearTimeout(this.searchFeedbackTimer);
    this.searchFeedbackTimer = null;
  }

  private startThemeSync(): void {
    const body = this.contentEl.ownerDocument?.body;
    if (!body) {
      return;
    }

    this.stopThemeSync();
    this.themeObserver = new MutationObserver(() => this.syncThemeState());
    this.themeObserver.observe(body, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  private stopThemeSync(): void {
    this.themeObserver?.disconnect();
    this.themeObserver = null;
  }

  private shouldSkipRender(renderVersion: number): boolean {
    return this.isClosed || renderVersion !== this.renderVersion;
  }

  // 首页发起的速记流程编排。
  private openQuickCapture(
    step: "capture" | "saved-feedback",
    flowContext: "first-use" | "global" = "first-use",
    savedSelection?: QuickCaptureSavedSelection
  ): void {
    const modal = new QuickCaptureModal(
      this.plugin,
      step,
      {
        onSaved: (selection) => {
          if (flowContext === "global" && step === "saved-feedback") {
            this.openQuickCapture("capture", "global");
            return;
          }

          const nextSavedSelection =
            flowContext === "global"
              ? {
                  poolId: selection?.poolId ?? this.globalSelectedPoolState.id,
                  poolLabel: selection?.poolLabel ?? this.globalSelectedPoolState.label,
                  createFileChecked: selection?.createFileChecked ?? false
                }
              : undefined;

          if (flowContext === "first-use" && step === "capture") {
            this.openPoolModal("choose", {
              flowContext: "first-use",
              origin: "capture"
            });
            return;
          }

          if (flowContext === "global" && step === "capture") {
            if (nextSavedSelection) {
              this.globalSelectedPoolState = {
                id: nextSavedSelection.poolId ?? this.globalSelectedPoolState.id,
                label: nextSavedSelection.poolLabel ?? this.globalSelectedPoolState.label
              };
            }
            this.renderMainShell();
          }

          this.openQuickCapture("saved-feedback", flowContext, nextSavedSelection);
        },
        onChoosePool: () =>
          this.openPoolModal("choose", {
            flowContext,
            origin: flowContext === "global" ? "quick-capture-pool-picker" : "saved-feedback"
          }),
        onBackHome: () => {
          void this.plugin.activatePoolView({
            poolId: this.globalSelectedPoolState.id,
            resetFilters: true
          });
        },
        onPoolPickerOpen: (poolStep = "choose") => {
          if (flowContext === "global") {
            this.openPoolModal(poolStep, {
              flowContext: "global",
              origin: "quick-capture-pool-picker"
            });
            return;
          }

          this.openPoolModal(poolStep, {
            flowContext: "first-use",
            origin: "capture"
          });
        }
      },
      {
        flowContext,
        initialCreateFileChecked: step === "saved-feedback" ? savedSelection?.createFileChecked ?? false : undefined,
        initialSelectedPoolId:
          flowContext === "global"
            ? (savedSelection?.poolId ?? this.globalSelectedPoolState.id)
            : undefined,
        initialSelectedPoolLabel:
          flowContext === "global"
            ? (savedSelection?.poolLabel ?? this.globalSelectedPoolState.label)
            : undefined
      }
    );
    modal.open();
  }

  // 归池流程与首次使用引导编排。
  private openPoolModal(
    step: "choose" | "create",
    options: {
      flowContext?: "first-use" | "global";
      origin?: "home-secondary-action" | "quick-capture-pool-picker" | "saved-feedback" | "capture";
    } = {}
  ): void {
    const flowContext = options.flowContext ?? "first-use";
    const origin = options.origin;

    const modal = new PoolModal(
      this.plugin,
      step,
      {
        onPoolChosen: (poolId, _poolName, commitResult) => {
          if (poolId === CREATE_NEW_POOL_ID) {
            this.openPoolModal("create", { flowContext, origin });
            return;
          }

          if (flowContext === "global") {
            void this.handleGlobalPoolChosen(poolId, step, origin);
            return;
          }

          this.renderMainShell();
          this.openFollowupGuidanceModal();
          if (commitResult?.warning) {
            this.toastService.show({
              status: "info",
              message: commitResult.warning.message
            });
          }
        },
        onBackToPrevious:
          step !== "choose"
            ? undefined
            : flowContext === "global" && origin === "quick-capture-pool-picker"
              ? () => this.openQuickCapture("capture", "global")
              : flowContext === "first-use" && origin === "capture"
                ? () => this.openQuickCapture("capture", "first-use")
                : flowContext === "first-use" && origin === "saved-feedback"
                  ? () => this.openQuickCapture("saved-feedback", "first-use")
                  : undefined,
        onBackToChoose:
          step !== "create"
            ? undefined
            : flowContext === "global" && origin === "home-secondary-action"
              ? undefined
              : flowContext === "global" && origin === "quick-capture-pool-picker"
                ? () => this.openQuickCapture("capture", "global")
                : () => this.openPoolModal("choose", { flowContext, origin })
      },
      {
        flowContext,
        origin
      }
    );
    modal.open();
  }

  private openFollowupGuidanceModal(): void {
    const modal = new FollowupGuidanceModal(this.plugin);
    modal.open();
  }

  private async handleGlobalPoolChosen(
    poolId: string,
    sourceStep: "choose" | "create",
    origin?: "home-secondary-action" | "quick-capture-pool-picker" | "saved-feedback" | "capture"
  ): Promise<void> {
    try {
      const pool = await this.plugin.poolService.getPool(poolId);
      this.globalSelectedPoolState = {
        id: poolId,
        label: pool?.name ?? DEFAULT_POOL_LABEL
      };
    } catch {
      this.globalSelectedPoolState = {
        id: poolId,
        label: DEFAULT_POOL_LABEL
      };
    }

    if (sourceStep === "create" && origin === "home-secondary-action") {
      this.renderMainShell();
      return;
    }

    this.openQuickCapture("capture", "global");
  }

  // 首页球体上的池元数据操作。
  private async handleHomePoolRename(poolId: string, name: string): Promise<void> {
    const nextName = name.trim();
    if (!nextName) {
      return;
    }

    const pool = await this.plugin.poolService.getPool(poolId);
    if (!pool || pool.isDefault || pool.name === nextName) {
      return;
    }

    await this.plugin.poolWorkbenchWorkflow.updatePool(poolId, { name: nextName });
    if (this.globalSelectedPoolState.id === poolId) {
      this.globalSelectedPoolState = {
        id: poolId,
        label: nextName
      };
    }

    this.renderMainShell();
  }

  private async handleHomePoolDelete(poolId: string): Promise<void> {
    const pool = await this.plugin.poolService.getPool(poolId);
    if (!pool || pool.isDefault) {
      return;
    }

    const confirmed = globalThis.confirm?.(`确认删除“${pool.name}”吗？池内灵感将归入默认池。`) ?? false;
    if (!confirmed) {
      return;
    }

    const deleted = await this.plugin.poolService.deletePool(poolId);
    if (!deleted) {
      return;
    }

    if (this.globalSelectedPoolState.id === poolId) {
      this.globalSelectedPoolState = {
        id: DEFAULT_POOL_ID,
        label: DEFAULT_POOL_LABEL
      };
    }

    this.renderMainShell();
  }

  private getPlugin(): GlitterPlugin {
    return this.plugin;
  }
}
