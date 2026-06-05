/**
 * Glitter 插件主入口，负责装配数据存储、领域服务、应用工作流与宿主视图。
 * 同时管理插件生命周期、命令注册、片段增强、视图导航与设置持久化。
 */
import { addIcon, Plugin, type ViewState, type WorkspaceLeaf } from "obsidian";
import {
  createEditorWorkflow,
  type EditorWorkflow
} from "../application/editor-integration/editor-workflow";
import { createFirstUseWorkflow, type FirstUseWorkflow } from "../application/first-use/first-use-workflow";
import {
  createPoolWorkbenchWorkflow,
  type PoolWorkbenchWorkflow
} from "../application/pool-workbench/pool-workbench-workflow";
import {
  createQuickCaptureWorkflow,
  type QuickCaptureWorkflow
} from "../application/quick-capture/quick-capture-workflow";
import {
  createQuickCaptureLinkImportService,
  type QuickCaptureLinkImportService
} from "../application/quick-capture/link-import";
import { registerCommands } from "../commands/register-commands";
import { enhanceGlitterSnippets } from "../editor/snippet-postprocessor";
import type { Idea } from "../domain/idea/idea-model";
import { createIdeaRepository } from "../domain/idea/idea-repository";
import { createIdeaService } from "../domain/idea/idea-service";
import type { Pool } from "../domain/pool/pool-model";
import { createPoolService } from "../domain/pool/pool-service";
import GlitterSettingTab from "../settings/settings-tab";
import { mergePluginSettings, DEFAULT_SETTINGS } from "../settings/defaults";
import type { GlitterPluginSettings } from "../settings/settings";
import { createIndexStore } from "../storage/index-store";
import { createPluginDataStore, type PluginDataStore } from "../storage/plugin-data-store";
import { createVaultFileStore } from "../storage/vault-file-store";
import { resolveLegacyPluginDataPaths, shouldMigrateLegacyPluginData } from "./plugin-data-migration";
import { GlitterMainView } from "../views/main-view";
import type { PoolViewNavigationOptions } from "../views/pool-view-history";
import { GlitterPoolView } from "../views/pool-view";
import { GlitterSearchView } from "../views/search-view";
import { GLITTER_ICON_ID, MAIN_VIEW_TYPE, PLUGIN_ID, POOL_VIEW_TYPE, SEARCH_VIEW_TYPE } from "./constants";

// Glitter 视图识别辅助。
const GLITTER_VIEW_TYPES = [MAIN_VIEW_TYPE, SEARCH_VIEW_TYPE, POOL_VIEW_TYPE] as const;
const GLITTER_RIBBON_ICON_SVG = "<text x=\"50%\" y=\"50%\" dominant-baseline=\"central\" text-anchor=\"middle\" font-size=\"78\" font-family=\"Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif\">✨</text>";

function getLeafViewType(leaf: WorkspaceLeaf | null): string | null {
  const view = leaf?.view as { getViewType?: () => string } | undefined;
  if (typeof view?.getViewType !== "function") {
    return null;
  }

  return view.getViewType();
}

function isGlitterLeaf(leaf: WorkspaceLeaf | null): leaf is WorkspaceLeaf {
  const viewType = getLeafViewType(leaf);
  return viewType !== null && GLITTER_VIEW_TYPES.includes(viewType as (typeof GLITTER_VIEW_TYPES)[number]);
}

// 插件主类与依赖装配。
export default class GlitterPlugin extends Plugin {
  settings: GlitterPluginSettings = DEFAULT_SETTINGS;
  dataStore!: PluginDataStore<Idea, Pool>;
  ideaService = createIdeaService();
  poolService = createPoolService();
  firstUseWorkflow!: FirstUseWorkflow;
  poolWorkbenchWorkflow!: PoolWorkbenchWorkflow;
  quickCaptureWorkflow!: QuickCaptureWorkflow;
  editorWorkflow!: EditorWorkflow;
  linkImportService!: QuickCaptureLinkImportService;
  indexStore = createIndexStore();
  vaultFileStore = createVaultFileStore();
  focusedIdeaId: string | null = null;
  pendingFocusedPoolId: string | null = null;
  private homeRibbonIconEl: HTMLElement | null = null;

  // 启动装配。
  override async onload(): Promise<void> {
    this.dataStore = createPluginDataStore<Idea, Pool>({
      loadData: async () => this.loadPluginDataWithLegacyMigration(),
      saveData: async (data) => {
        await this.saveData(data);
      }
    });

    const loaded = await this.dataStore.load();
    this.settings = mergePluginSettings(loaded.settings);

    const inferredHasCompletedFirstUse =
      loaded.snapshot.ideas.length > 0 || loaded.snapshot.pools.some((pool) => !pool.isDefault);

    if (!this.settings.hasCompletedFirstUse && inferredHasCompletedFirstUse) {
      this.settings = {
        ...this.settings,
        hasCompletedFirstUse: true
      };

      try {
        const savedSettings = await this.dataStore.updateSettings((settings) => ({
          ...settings,
          hasCompletedFirstUse: true
        }));
        this.settings = mergePluginSettings(savedSettings);
      } catch {
        // Keep startup resilient even if inferred-flag persistence fails.
      }
    }

    const ideaRepository = createIdeaRepository(this.dataStore);
    this.indexStore = createIndexStore();
    this.ideaService = createIdeaService(ideaRepository, this.indexStore);
    this.poolService = createPoolService(loaded.snapshot.pools, () => this.ideaService.listIdeas(), this.dataStore);
    this.vaultFileStore = createVaultFileStore(this.app.vault);
    const resolveFileStorageDirectory = () => this.settings.fileStorageDirectory;
    const resolveRoamBoardStorageDirectory = () => this.settings.roam.boardStorageDirectory;
    this.firstUseWorkflow = createFirstUseWorkflow({
      ideaService: this.ideaService,
      poolService: this.poolService,
      vaultFileStore: this.vaultFileStore,
      vault: this.app.vault,
      resolveFileStorageDirectory,
      hasCompletedFirstUse: () => this.settings.hasCompletedFirstUse,
      markFirstUseCompleted: async () => {
        if (this.settings.hasCompletedFirstUse) {
          return;
        }

        this.settings = {
          ...this.settings,
          hasCompletedFirstUse: true
        };
        await this.savePluginSettings();
      }
    });
    this.poolWorkbenchWorkflow = createPoolWorkbenchWorkflow({
      poolService: this.poolService,
      ideaService: this.ideaService,
      vaultFileStore: this.vaultFileStore,
      vault: this.app.vault,
      onIdeasMoved: () => {
        this.refreshOpenMarkdownPreviews();
      },
      onIdeaDeleted: () => {
        this.refreshOpenMarkdownPreviews();
      },
      resolveFileStorageDirectory,
      resolveRoamBoardStorageDirectory
    });
    this.quickCaptureWorkflow = createQuickCaptureWorkflow({
      ideaService: this.ideaService,
      poolService: this.poolService,
      vaultFileStore: this.vaultFileStore,
      vault: this.app.vault,
      resolveFileStorageDirectory
    });
    this.editorWorkflow = createEditorWorkflow({
      poolService: this.poolService,
      ideaService: this.ideaService
    });
    this.linkImportService = createQuickCaptureLinkImportService();

    await this.poolService.ensureDefaultPool();

    this.registerMarkdownPostProcessor(async (element) => {
      await enhanceGlitterSnippets(
        element,
        (ideaId) => {
          void this.focusIdeaById(ideaId);
        },
        async (ideaId) => Boolean(await this.ideaService.getIdea(ideaId)),
        async (ideaId) => {
          const idea = await this.ideaService.getIdea(ideaId);
          if (!idea) {
            return null;
          }

          return (await this.poolService.getPool(idea.poolId))?.name ?? null;
        }
      );
    });

    this.registerView(MAIN_VIEW_TYPE, (leaf) => new GlitterMainView(leaf, this));
    this.registerView(SEARCH_VIEW_TYPE, (leaf) => new GlitterSearchView(leaf, this));
    this.registerView(POOL_VIEW_TYPE, (leaf) => new GlitterPoolView(leaf, this));

    addIcon(GLITTER_ICON_ID, GLITTER_RIBBON_ICON_SVG);
    this.syncHomeRibbonIcon();

    registerCommands(this);

    this.addSettingTab(new GlitterSettingTab(this.app, this));
    if (this.app.workspace.layoutReady) {
      await this.maybeOpenMainViewForAutomation();
      return;
    }

    this.app.workspace.onLayoutReady(() => {
      void this.maybeOpenMainViewForAutomation();
    });
  }

  // 卸载与入口同步。
  override onunload(): void {}

  // 首页入口同步。
  syncHomeRibbonIcon(): void {
    this.homeRibbonIconEl?.remove();
    this.homeRibbonIconEl = null;

    if (!this.settings.showHomeRibbonIcon) {
      return;
    }

    this.homeRibbonIconEl = this.addRibbonIcon(GLITTER_ICON_ID, "打开 Glitter", () => {
      void this.activateMainView();
    });
  }

  // 对外导航入口。
  async activateMainView(): Promise<void> {
    await this.activateGlitterView({ type: MAIN_VIEW_TYPE, active: true });
  }

  async reopenFirstUseOnHome(): Promise<void> {
    const leaf = await this.activateGlitterView({ type: MAIN_VIEW_TYPE, active: true });
    const view = leaf.view;
    if (view instanceof GlitterMainView) {
      view.replayFirstUseOnCurrentHome();
    }
  }

  async activateSearchView(initialQuery?: string): Promise<void> {
    await this.activateGlitterView(
      initialQuery === undefined
        ? { type: SEARCH_VIEW_TYPE, active: true }
        : { type: SEARCH_VIEW_TYPE, active: true, state: { query: initialQuery } }
    );
  }

  async activatePoolView(options: PoolViewNavigationOptions = {}): Promise<void> {
    const leaf = this.getNavigationLeaf();
    await leaf.setViewState({
      type: POOL_VIEW_TYPE,
      active: true,
      state: { ...options }
    });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    this.app.workspace.revealLeaf(leaf);
  }

  // 导航叶子复用。
  private getNavigationLeaf(): WorkspaceLeaf {
    const { workspace } = this.app;
    const mostRecentLeaf = workspace.getMostRecentLeaf();
    if (isGlitterLeaf(mostRecentLeaf)) {
      return mostRecentLeaf;
    }

    for (const viewType of GLITTER_VIEW_TYPES) {
      const existingLeaf = workspace.getLeavesOfType(viewType)[0];
      if (existingLeaf) {
        return existingLeaf;
      }
    }

    return mostRecentLeaf ?? workspace.getLeaf(false);
  }

  private async activateGlitterView(viewState: ViewState): Promise<WorkspaceLeaf> {
    const leaf = this.getNavigationLeaf();
    await leaf.setViewState(viewState);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  private async loadPluginDataWithLegacyMigration(): Promise<unknown> {
    const currentData = await this.loadData();
    const adapter = this.app?.vault?.adapter;
    const configDir = this.app?.vault?.configDir;
    const currentPluginId = this.manifest?.id ?? PLUGIN_ID;

    if (!adapter || !configDir) {
      return currentData;
    }

    for (const legacyPath of resolveLegacyPluginDataPaths(configDir, currentPluginId)) {
      try {
        if (!(await adapter.exists(legacyPath))) {
          continue;
        }

        const legacyData = JSON.parse(await adapter.read(legacyPath));
        if (!shouldMigrateLegacyPluginData(currentData, legacyData)) {
          continue;
        }

        await this.saveData(legacyData);
        return legacyData;
      } catch {
        continue;
      }
    }

    return currentData;
  }

  // 片段聚焦与预览刷新。
  async focusIdeaById(ideaId: string): Promise<void> {
    const target = await this.editorWorkflow.resolveSnippetTarget(ideaId);
    if (!target) {
      return;
    }

    this.focusedIdeaId = target.ideaId;
    this.pendingFocusedPoolId = target.poolId;
    await this.activatePoolView({
      poolId: target.poolId,
      mode: "browse"
    });
  }

  refreshOpenMarkdownPreviews(): void {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const view = leaf.view as {
        previewMode?: { rerender?: (full?: boolean) => void };
        currentMode?: { rerender?: (full?: boolean) => void };
      } | undefined;
      const rerenderTargets = [view?.currentMode, view?.previewMode];
      const visitedTargets = new Set<unknown>();

      rerenderTargets.forEach((target) => {
        if (!target || visitedTargets.has(target) || typeof target.rerender !== "function") {
          return;
        }

        visitedTargets.add(target);
        target.rerender(true);
      });
    });
  }

  refreshOpenPoolViews(): void {
    this.app.workspace.getLeavesOfType(POOL_VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (!(view instanceof GlitterPoolView)) {
        return;
      }

      view.refreshAfterExternalIdeaMutation();
    });
  }

  // 自动化启动与设置持久化。
  async maybeOpenMainViewForAutomation(): Promise<void> {
    if (!this.settings.openMainViewOnNextLoad) {
      return;
    }

    this.settings = {
      ...this.settings,
      openMainViewOnNextLoad: false
    };
    await this.savePluginSettings();
    await this.activateMainView();
  }

  async savePluginSettings(): Promise<void> {
    const saved = await this.dataStore.updateSettings(() => ({ ...this.settings }));
    this.settings = mergePluginSettings(saved);
  }
}
