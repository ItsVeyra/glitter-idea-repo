/**
 * 保护首页状态装配相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { HOME_PRIMARY_ORB, HOME_SUPPORTING_ORBS } from "../../../src/ui/home/home-demo-data";
import {
  HOME_FIELD_VIEW_OPTIONS,
  buildHomeViewState,
  buildHomeViewStateFromRuntime
} from "../../../src/ui/home/home-state";

const POPULATED_TOPBAR_CONTROLS = [
  { id: "view-switch", label: "切换视图", kind: "text" },
  { id: "settings", label: "设置", kind: "text" },
  { id: "file-filter", label: "已引用 / 已建文件快速筛选", kind: "icon" }
] as const;

// 覆盖状态装配函数在主要输入场景下的输出契约。
describe("buildHomeViewState", () => {
  it("exports home field view options in water-first order", () => {
    expect(HOME_FIELD_VIEW_OPTIONS).toEqual(["water", "spring-rain"]);
  });

  it("keeps empty home on water even when spring-rain is requested", () => {
    const state = buildHomeViewState("home-empty", { homeFieldView: "spring-rain" });

    expect(state.fieldView).toBe("water");
  });

  it("applies requested spring-rain to populated runtime home state", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          {
            id: "pool-alpha",
            name: "默认池",
            ideaCount: 30,
            isDefault: true,
            color: DEFAULT_SETTINGS.poolColors.unsorted
          }
        ]
      },
      {
        poolColors: DEFAULT_SETTINGS.poolColors,
        homeFieldView: "spring-rain"
      }
    );

    expect(state.fieldView).toBe("spring-rain");
  });

  it("localizes populated runtime home hero title when English is requested", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          {
            id: "pool-alpha",
            name: "Default Pool",
            ideaCount: 30,
            isDefault: true,
            color: DEFAULT_SETTINGS.poolColors.unsorted
          }
        ]
      },
      {
        poolColors: DEFAULT_SETTINGS.poolColors,
        interfaceLanguage: "en"
      }
    );

    expect(state.hero.title).toBe("Glitter · Idea Pools");
    expect(state.hero.subtitle).toBe("Calibrate the main stage, pool hierarchy, and key actions first.");
    expect(state.firstUseEntry).toBeUndefined();
  });

  it("localizes default-pool orb labels from runtime data when English is requested", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          {
            id: "pool-alpha",
            name: "默认池",
            ideaCount: 30,
            isDefault: true,
            color: DEFAULT_SETTINGS.poolColors.unsorted
          }
        ]
      },
      {
        poolColors: DEFAULT_SETTINGS.poolColors,
        interfaceLanguage: "en"
      }
    );

    expect(state.primaryOrb?.label).toBe("Default pool");
  });

  it("defaults populated review/demo states to water", () => {
    expect(buildHomeViewState("home-populated").fieldView).toBe("water");
    expect(buildHomeViewState("settings-conflict").fieldView).toBe("water");
  });

  it("builds the zh first-use entry with localized copy and no bottom action CTAs", () => {
    const state = buildHomeViewState("home-empty", { interfaceLanguage: "zh-CN" });

    expect(state.mode).toBe("empty");
    expect(state.hero).toMatchObject({
      title: "Glitter · 灵感池",
      emphasis: "single-center"
    });
    expect(state.topbar).toEqual({ controls: [] });
    expect(state.topbar.search).toBeUndefined();
    expect(state.firstUseEntry).toEqual({
      badge: "首次引导",
      orbTitle: "灵感待录入",
      orbSubtitle: "点击开始首次记录",
      languageLabel: "界面语言",
      currentLanguageLabel: "简体中文",
      options: [
        { value: "zh-CN", label: "简体中文", selected: true },
        { value: "en", label: "English", selected: false }
      ]
    });
    expect(state.emptyGuide).toBeUndefined();
    expect(state.primaryAction).toEqual({ label: "快速记录", tone: "primary" });
    expect(state.secondaryAction).toBeUndefined();
    expect(state.primaryOrb).toBeNull();
    expect(state.poolOrbs).toEqual([]);
  });

  it("builds the en first-use entry with localized hero title and language state", () => {
    const state = buildHomeViewState("home-empty", { interfaceLanguage: "en" });

    expect(state.mode).toBe("empty");
    expect(state.hero).toMatchObject({
      title: "Glitter · Idea Pools",
      emphasis: "single-center"
    });
    expect(state.firstUseEntry).toEqual({
      badge: "First-use",
      orbTitle: "Idea waiting to be captured",
      orbSubtitle: "Click to start your first capture",
      languageLabel: "Interface language",
      currentLanguageLabel: "English",
      options: [
        { value: "zh-CN", label: "简体中文", selected: false },
        { value: "en", label: "English", selected: true }
      ]
    });
    expect(state.emptyGuide).toBeUndefined();
    expect(state.primaryAction).toEqual({ label: "Quick capture", tone: "primary" });
    expect(state.secondaryAction).toBeUndefined();
    expect(state.primaryOrb).toBeNull();
    expect(state.poolOrbs).toEqual([]);
  });

  it("builds English fixed home interface text when requested", () => {
    const state = buildHomeViewState("home-populated", { interfaceLanguage: "en" });

    expect(state.hero.title).toBe("Glitter · Idea Pools");
    expect(state.hero.subtitle).toBe("Calibrate the main stage, pool hierarchy, and key actions first.");
    expect(state.topbar.search?.placeholder).toBe("Search ideas, snippets, or pools");
    expect(state.topbar.controls).toEqual([
      { id: "view-switch", label: "Switch view", kind: "text" },
      { id: "settings", label: "Settings", kind: "text" },
      { id: "file-filter", label: "Referenced / file-created quick filter", kind: "icon" }
    ]);
    expect(state.primaryAction.label).toBe("Quick capture");
    expect(state.secondaryAction?.label).toBe("Create pool");
  });

  it("builds the populated state with tone/kind on ranked orbs and topbar search/controls", () => {
    const state = buildHomeViewState("home-populated");

    expect(state.mode).toBe("populated");
    expect(state.primaryOrb).toEqual({
      id: "pool-unsorted",
      label: "未整理",
      count: 47,
      size: "xxxl",
      x: 50,
      y: 50,
      tone: "unsorted",
      kind: "pool",
      isDefault: true
    });
    expect(state.poolOrbs).toEqual([
      { id: "pool-product", label: "产品池", count: 28, size: "xxl", x: 17, y: 24, tone: "product", kind: "pool", isDefault: false },
      { id: "pool-writing", label: "写作", count: 19, size: "lg", x: 89, y: 11, tone: "writing", kind: "pool", isDefault: false },
      { id: "pool-research", label: "研究", count: 13, size: "md", x: 84, y: 83, tone: "research", kind: "pool", isDefault: false },
      { id: "pool-unnamed", label: "未命名", count: 7, size: "xs", x: 26, y: 85, tone: "unnamed", kind: "pool", isDefault: false }
    ]);
    expect(state.hero.title).toBe("Glitter · 灵感池");
    expect(state.topbar.search?.placeholder).toBe("搜索灵感、片段或池");
    expect(state.topbar.controls).toEqual(POPULATED_TOPBAR_CONTROLS);
    expect(state.secondaryAction).toEqual({ label: "创建池", tone: "secondary" });
    expect(state.primaryAction).toEqual({ label: "快速记录", tone: "primary" });
  });

  it("adds a conflict banner without replacing the populated home stage", () => {
    const state = buildHomeViewState("settings-conflict");

    expect(state.mode).toBe("populated");
    expect(state.banner).toEqual({
      title: "设置冲突",
      description: "当前快捷记录与固定评审场景冲突，请先完成当前页面核对。",
      tone: "warning"
    });
    expect(state.primaryOrb?.label).toBe("未整理");
    expect(state.topbar.controls).toEqual(POPULATED_TOPBAR_CONTROLS);
  });

  it("keeps populated home state free of a first-use entry payload", () => {
    const state = buildHomeViewState("home-populated");

    expect(state.firstUseEntry).toBeUndefined();
  });

  it("exposes read-only demo orb exports while returning mutable copies in view state", () => {
    expect(Object.isFrozen(HOME_PRIMARY_ORB)).toBe(true);
    expect(Object.isFrozen(HOME_SUPPORTING_ORBS)).toBe(true);
    expect(Object.isFrozen(HOME_SUPPORTING_ORBS[0])).toBe(true);

    const state = buildHomeViewState("home-populated");

    expect(Object.isFrozen(state.primaryOrb)).toBe(false);
    expect(Object.isFrozen(state.poolOrbs)).toBe(false);
    expect(Object.isFrozen(state.poolOrbs[0])).toBe(false);

    expect(() => {
      if (!state.primaryOrb) {
        throw new Error("expected populated primary orb");
      }

      state.primaryOrb.label = "已变更";
      state.poolOrbs[0].label = "已变更";
    }).not.toThrow();

    expect(HOME_PRIMARY_ORB.label).toBe("未整理");
    expect(HOME_SUPPORTING_ORBS[0].label).toBe("产品池");
  });

  it("keeps the stage primary-only when runtime has a single populated pool", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          {
            id: "pool-alpha",
            name: "默认池",
            ideaCount: 30,
            isDefault: true,
            color: DEFAULT_SETTINGS.poolColors.unsorted
          }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    expect(state.primaryOrb).toEqual({
      id: "pool-alpha",
      label: "默认池",
      count: 30,
      size: "xxxl",
      x: 50,
      y: 50,
      tone: "unsorted",
      color: DEFAULT_SETTINGS.poolColors.unsorted,
      kind: "pool",
      isDefault: true
    });
    expect(state.poolOrbs).toEqual([]);
  });

  it("uses the dedicated one-supporting preset when exactly one supporting orb is visible", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          {
            id: "pool-alpha",
            name: "默认池",
            ideaCount: 30,
            isDefault: true,
            color: DEFAULT_SETTINGS.poolColors.unsorted
          },
          {
            id: "pool-beta",
            name: "产品池",
            ideaCount: 12,
            isDefault: false,
            color: DEFAULT_SETTINGS.poolColors.product
          }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    expect(state.primaryOrb).toMatchObject({ id: "pool-alpha", x: 50, y: 50, size: "xxxl" });
    expect(state.poolOrbs).toEqual([
      {
        id: "pool-beta",
        label: "产品池",
        count: 12,
        size: "md",
        x: 84,
        y: 84,
        tone: "product",
        color: DEFAULT_SETTINGS.poolColors.product,
        kind: "pool",
        isDefault: false
      }
    ]);
  });

  it("fills the visible supporting capacity without overflow when four supporting orbs are available", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-1", name: "池 1", ideaCount: 100, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-2", name: "池 2", ideaCount: 90, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-3", name: "池 3", ideaCount: 80, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-4", name: "池 4", ideaCount: 70, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-5", name: "池 5", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    expect(state.primaryOrb).toMatchObject({ id: "pool-1", size: "xxxl", x: 50, y: 50 });
    expect(state.poolOrbs).toEqual([
      { id: "pool-2", label: "池 2", count: 90, size: "xxl", x: 17, y: 24, tone: "product", color: DEFAULT_SETTINGS.poolColors.product, kind: "pool", isDefault: false },
      { id: "pool-3", label: "池 3", count: 80, size: "lg", x: 89, y: 11, tone: "writing", color: DEFAULT_SETTINGS.poolColors.writing, kind: "pool", isDefault: false },
      { id: "pool-4", label: "池 4", count: 70, size: "md", x: 84, y: 83, tone: "research", color: DEFAULT_SETTINGS.poolColors.research, kind: "pool", isDefault: false },
      { id: "pool-5", label: "池 5", count: 60, size: "xs", x: 26, y: 85, tone: "unnamed", color: DEFAULT_SETTINGS.poolColors.unnamed, kind: "pool", isDefault: false }
    ]);
  });

  it("sorts runtime pools by count, default precedence, locale name, and maps tones from swatches", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          {
            id: "pool-delta",
            name: "阿池",
            ideaCount: 21,
            isDefault: false,
            color: DEFAULT_SETTINGS.poolColors.writing
          },
          {
            id: "pool-beta",
            name: "测试乙",
            ideaCount: 30,
            isDefault: false,
            color: "#ffffff"
          },
          {
            id: "pool-alpha",
            name: "测试甲",
            ideaCount: 30,
            isDefault: true,
            color: DEFAULT_SETTINGS.poolColors.product
          },
          {
            id: "pool-gamma",
            name: "测试丙",
            ideaCount: 21,
            isDefault: false,
            color: DEFAULT_SETTINGS.poolColors.research
          }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    expect(state.primaryOrb).toEqual({
      id: "pool-alpha",
      label: "默认池",
      count: 30,
      size: "xxxl",
      x: 50,
      y: 50,
      tone: "product",
      color: DEFAULT_SETTINGS.poolColors.product,
      kind: "pool",
      isDefault: true
    });
    expect(state.poolOrbs).toEqual([
      {
        id: "pool-beta",
        label: "测试乙",
        count: 30,
        size: "xxxl",
        x: 17,
        y: 24,
        tone: "unsorted",
        color: "#ffffff",
        kind: "pool",
        isDefault: false
      },
      {
        id: "pool-delta",
        label: "阿池",
        count: 21,
        size: "md",
        x: 89,
        y: 11,
        tone: "writing",
        color: DEFAULT_SETTINGS.poolColors.writing,
        kind: "pool",
        isDefault: false
      },
      {
        id: "pool-gamma",
        label: "测试丙",
        count: 21,
        size: "md",
        x: 84,
        y: 83,
        tone: "research",
        color: DEFAULT_SETTINGS.poolColors.research,
        kind: "pool",
        isDefault: false
      }
    ]);
  });

  it("keeps all runtime pools visible in the home stage and disables overflow aggregation", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-1", name: "池 1", ideaCount: 100, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-2", name: "池 2", ideaCount: 90, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-3", name: "池 3", ideaCount: 80, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-4", name: "池 4", ideaCount: 70, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-5", name: "池 5", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed },
          { id: "pool-6", name: "池 6", ideaCount: 50, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-7", name: "池 7", ideaCount: 40, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    expect(state.primaryOrb?.id).toBe("pool-1");
    expect(state.poolOrbs).toHaveLength(6);
    expect(state.poolOrbs[0]).toMatchObject({ id: "pool-2", size: "xxl", x: 17, y: 24, kind: "pool" });
    expect(state.poolOrbs[1]).toMatchObject({ id: "pool-3", size: "xl", x: 89, y: 11, kind: "pool" });
    expect(state.poolOrbs[2]).toMatchObject({ id: "pool-4", size: "lg", x: 84, y: 83, kind: "pool" });
    expect(state.poolOrbs[3]).toMatchObject({ id: "pool-5", size: "md", x: 26, y: 85, kind: "pool" });
    expect(state.poolOrbs[4]).toMatchObject({ id: "pool-6", size: "sm", kind: "pool" });
    expect(state.poolOrbs[5]).toMatchObject({ id: "pool-7", size: "xs", kind: "pool" });
  });

  it("keeps primary orb ranking by semantic overview while ordering supporting orbs by recency", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          {
            id: "pool-primary",
            name: "默认池",
            ideaCount: 30,
            isDefault: true,
            color: DEFAULT_SETTINGS.poolColors.unsorted,
            lastUsedAt: "2025-01-01T00:00:00.000Z"
          },
          {
            id: "pool-old-high",
            name: "高频旧池",
            ideaCount: 29,
            isDefault: false,
            color: DEFAULT_SETTINGS.poolColors.product,
            lastUsedAt: "2025-01-01T00:00:00.000Z"
          },
          {
            id: "pool-recent-low",
            name: "低频新池",
            ideaCount: 1,
            isDefault: false,
            color: DEFAULT_SETTINGS.poolColors.writing,
            lastUsedAt: "2026-01-01T00:00:00.000Z"
          },
          {
            id: "pool-mid",
            name: "中频池",
            ideaCount: 20,
            isDefault: false,
            color: DEFAULT_SETTINGS.poolColors.research,
            lastUsedAt: "2025-06-01T00:00:00.000Z"
          },
          {
            id: "pool-no-usage",
            name: "无使用记录",
            ideaCount: 22,
            isDefault: false,
            color: DEFAULT_SETTINGS.poolColors.unnamed
          }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    expect(state.primaryOrb?.id).toBe("pool-primary");
    expect(state.poolOrbs).toEqual([
      expect.objectContaining({ id: "pool-recent-low", size: "xs", x: 17, y: 24 }),
      expect.objectContaining({ id: "pool-mid", size: "md", x: 89, y: 11 }),
      expect.objectContaining({ id: "pool-old-high", size: "xxl", x: 84, y: 83 }),
      expect.objectContaining({ id: "pool-no-usage", size: "lg", x: 26, y: 85 })
    ]);
  });

  it("assigns equal counts to the same orb size tier and preserves increasing size with count", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-1", name: "池 1", ideaCount: 90, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-2", name: "池 2", ideaCount: 90, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-3", name: "池 3", ideaCount: 64, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-4", name: "池 4", ideaCount: 64, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-5", name: "池 5", ideaCount: 32, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed },
          { id: "pool-6", name: "池 6", ideaCount: 18, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-7", name: "池 7", ideaCount: 7, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    expect(state.primaryOrb).toMatchObject({ id: "pool-1", size: "xxxl" });
    expect(state.poolOrbs[0]).toMatchObject({ id: "pool-2", size: "xxxl" });
    expect(state.poolOrbs[1]).toMatchObject({ id: "pool-3", size: "xxl" });
    expect(state.poolOrbs[2]).toMatchObject({ id: "pool-4", size: "xxl" });
    expect(state.poolOrbs[3]).toMatchObject({ id: "pool-5", size: "lg" });
    expect(state.poolOrbs[4]).toMatchObject({ id: "pool-6", size: "md" });
    expect(state.poolOrbs[5]).toMatchObject({ id: "pool-7", size: "xs" });
  });

  it("keeps populated runtime with zero pools in populated mode", () => {
    const state = buildHomeViewStateFromRuntime({
      mode: "populated",
      pools: []
    });

    expect(state.mode).toBe("populated");
    expect(state.primaryOrb).toBeNull();
    expect(state.poolOrbs).toEqual([]);
    expect(state.firstUseEntry).toBeUndefined();
    expect(state.emptyGuide).toBeUndefined();
  });

  it("spreads seven visible pools across all seven size tiers based on the current scene distribution", () => {
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-1", name: "池 1", ideaCount: 120, isDefault: true, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-2", name: "池 2", ideaCount: 95, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-3", name: "池 3", ideaCount: 70, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-4", name: "池 4", ideaCount: 48, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-5", name: "池 5", ideaCount: 31, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed },
          { id: "pool-6", name: "池 6", ideaCount: 19, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-7", name: "池 7", ideaCount: 8, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    expect(state.primaryOrb).toMatchObject({ id: "pool-1", size: "xxxl" });
    expect(state.poolOrbs[0]).toMatchObject({ id: "pool-2", size: "xxl" });
    expect(state.poolOrbs[1]).toMatchObject({ id: "pool-3", size: "xl" });
    expect(state.poolOrbs[2]).toMatchObject({ id: "pool-4", size: "lg" });
    expect(state.poolOrbs[3]).toMatchObject({ id: "pool-5", size: "md" });
    expect(state.poolOrbs[4]).toMatchObject({ id: "pool-6", size: "sm" });
    expect(state.poolOrbs[5]).toMatchObject({ id: "pool-7", size: "xs" });
  });

  it("throws for non-home scenarios", () => {
    expect(() => buildHomeViewState("search-results")).toThrow(
      /does not support scenario: search-results/
    );
  });
});
