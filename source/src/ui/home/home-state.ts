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
 * 首页视图状态构造器。
 * 负责把首页运行时池数据整理成首页舞台、顶部控件与提示区可直接渲染的视图模型。
 */

import type { HomeFieldView, PoolColorSettings } from "../../settings/settings";
import type { ReviewScenario } from "../../review/scenarios";
import {
  HOME_PRIMARY_ORB,
  HOME_SUPPORTING_ORBS,
  type HomeStageOrb
} from "./home-demo-data";
import { comparePoolOverviewEntries } from "../../domain/pool/pool-overview-sort";
import { resolveHomeOrbTone } from "./home-orb-tone";

// 首页主舞台的视图模型与运行时输入。
interface HomeHero {
  title: string;
  subtitle: string;
  emphasis: "single-center" | "stage-top";
}

interface HomeAction {
  label: string;
  tone?: "primary" | "secondary" | "muted";
  disabled?: boolean;
}

interface HomeTopbarSearch {
  placeholder: string;
}

interface HomeTopbarControl {
  id: "view-switch" | "settings" | "file-filter";
  label: string;
  kind: "text" | "icon";
}

interface HomeTopbar {
  search?: HomeTopbarSearch;
  controls: HomeTopbarControl[];
}

interface HomeEmptyGuide {
  badge: string;
  helper: string;
  prompt: string;
}

interface HomeBanner {
  title: string;
  description: string;
  tone: "warning";
}

interface HomeSearchFeedback {
  message: string;
}

// 视图顺序同时驱动顶部切换菜单的展示顺序：圆满固定在前，涟漪固定在后。
export const HOME_FIELD_VIEW_OPTIONS: ReadonlyArray<HomeFieldView> = Object.freeze([
  "water",
  "spring-rain"
]);

// 对外文案与内部协议值分离，避免后续改名时影响持久化字段。
export const HOME_FIELD_VIEW_LABELS: Readonly<Record<HomeFieldView, string>> = Object.freeze({
  water: "圆满",
  "spring-rain": "涟漪"
});

export interface HomeViewState {
  mode: "empty" | "populated";
  fieldView: HomeFieldView;
  hero: HomeHero;
  topbar: HomeTopbar;
  emptyGuide?: HomeEmptyGuide;
  primaryAction: HomeAction;
  secondaryAction?: HomeAction;
  primaryOrb: HomeStageOrb | null;
  poolOrbs: HomeStageOrb[];
  banner?: HomeBanner;
  searchFeedback?: HomeSearchFeedback;
}

export interface BuildHomeViewStateOptions {
  homeFieldView?: HomeFieldView;
  poolColors?: PoolColorSettings;
  searchFeedbackMessage?: string;
}

export interface HomeRuntimePoolSummary {
  id: string;
  name: string;
  ideaCount: number;
  isDefault: boolean;
  color?: string;
  lastUsedAt?: string;
}

export interface HomeRuntimeState {
  mode: "empty" | "populated";
  pools: HomeRuntimePoolSummary[];
}

type HomeSupportingLayout = { x: number; y: number };
type HomeSupportingLayoutCount = 0 | 1 | 2 | 3 | 4;

// 首页主球与陪伴球的基础布局预设。
const HOME_PRIMARY_LAYOUT = { x: 50, y: 50 };
const HOME_SUPPORTING_LAYOUTS: Readonly<Record<HomeSupportingLayoutCount, ReadonlyArray<HomeSupportingLayout>>> =
  Object.freeze({
    0: [],
    1: [{ x: 84, y: 84 }],
    2: [
      { x: 17, y: 24 },
      { x: 84, y: 84 }
    ],
    3: [
      { x: 17, y: 24 },
      { x: 89, y: 11 },
      { x: 84, y: 83 }
    ],
    4: [
      { x: 17, y: 24 },
      { x: 89, y: 11 },
      { x: 84, y: 83 },
      { x: 26, y: 85 }
    ]
  });
const HOME_EXTRA_SUPPORTING_LAYOUTS: ReadonlyArray<HomeSupportingLayout> = Object.freeze([
  { x: 50, y: 12 },
  { x: 55, y: 88 },
  { x: 10, y: 58 },
  { x: 92, y: 58 }
]);

// 根据池数量与活跃度推导球体布局和尺寸。
function resolveSupportingLayout(index: number, supportingPoolCount: number): HomeSupportingLayout {
  const visiblePresetCount = Math.min(supportingPoolCount, 4) as HomeSupportingLayoutCount;
  const presetLayout = HOME_SUPPORTING_LAYOUTS[visiblePresetCount][index];

  if (presetLayout) {
    return presetLayout;
  }

  return HOME_EXTRA_SUPPORTING_LAYOUTS[(index - 4) % HOME_EXTRA_SUPPORTING_LAYOUTS.length]!;
}

function compareHomeSupportingPoolsByRecency(
  a: HomeRuntimePoolSummary,
  b: HomeRuntimePoolSummary
): number {
  const aLastUsedAt = a.lastUsedAt;
  const bLastUsedAt = b.lastUsedAt;

  if (aLastUsedAt && bLastUsedAt && aLastUsedAt !== bLastUsedAt) {
    return bLastUsedAt.localeCompare(aLastUsedAt);
  }
  if (aLastUsedAt && !bLastUsedAt) {
    return -1;
  }
  if (!aLastUsedAt && bLastUsedAt) {
    return 1;
  }

  return comparePoolOverviewEntries(a, b);
}

const HOME_ORB_SIZE_ORDER: ReadonlyArray<HomeStageOrb["size"]> = Object.freeze([
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "xxl",
  "xxxl"
]);

function buildHomeOrbSizeByCount(
  pools: ReadonlyArray<HomeRuntimePoolSummary>
): ReadonlyMap<number, HomeStageOrb["size"]> {
  const uniqueCounts = [...new Set(pools.map((pool) => pool.ideaCount))].sort((left, right) => right - left);

  if (uniqueCounts.length === 0) {
    return new Map();
  }

  if (uniqueCounts.length === 1) {
    return new Map(uniqueCounts.map((count) => [count, pools.length === 1 ? "xxxl" : "lg"]));
  }

  if (uniqueCounts.length === 2) {
    return new Map([
      [uniqueCounts[0]!, "xxxl"],
      [uniqueCounts[1]!, "md"]
    ]);
  }

  return new Map(
    uniqueCounts.map((count, rank) => {
      const sizeIndex = Math.max(
        0,
        Math.min(
          Math.ceil(
            (1 - rank / (uniqueCounts.length - 1)) * (HOME_ORB_SIZE_ORDER.length - 1)
          ),
          HOME_ORB_SIZE_ORDER.length - 1
        )
      );

      return [count, HOME_ORB_SIZE_ORDER[sizeIndex]!];
    })
  );
}

function buildPoolOrb(
  pool: HomeRuntimePoolSummary,
  layout: { x: number; y: number },
  poolColors: PoolColorSettings | undefined,
  orbSizeByCount: ReadonlyMap<number, HomeStageOrb["size"]>
): HomeStageOrb {
  return {
    id: pool.id,
    label: pool.name,
    count: pool.ideaCount,
    tone: resolveHomeOrbTone(pool.color, poolColors),
    color: pool.color,
    kind: "pool",
    isDefault: pool.isDefault,
    size: orbSizeByCount.get(pool.ideaCount) ?? "xs",
    x: layout.x,
    y: layout.y
  };
}

// empty 首页始终强制回到圆满，只有 populated 首页才恢复用户上次选中的底层视图。
function resolveHomeFieldView(
  mode: HomeViewState["mode"],
  homeFieldView: HomeFieldView | undefined
): HomeFieldView {
  if (mode === "empty") {
    return "water";
  }

  return homeFieldView ?? "water";
}

// 运行时首页状态适配。
export function buildHomeViewStateFromRuntime(
  runtime: HomeRuntimeState,
  options: BuildHomeViewStateOptions = {}
): HomeViewState {
  if (runtime.mode === "empty") {
    return buildHomeViewState("home-empty", options);
  }

  const sortedPools = [...runtime.pools].sort(comparePoolOverviewEntries);

  const primaryPool = sortedPools[0];
  const supportingPools = sortedPools.slice(1).sort(compareHomeSupportingPoolsByRecency);
  const base = buildHomeViewState("home-populated", options);
  const orbSizeByCount = buildHomeOrbSizeByCount(sortedPools);

  const poolOrbs = supportingPools.map((pool, index) =>
    buildPoolOrb(pool, resolveSupportingLayout(index, supportingPools.length), options.poolColors, orbSizeByCount)
  );

  return {
    ...base,
    primaryOrb: primaryPool ? buildPoolOrb(primaryPool, HOME_PRIMARY_LAYOUT, options.poolColors, orbSizeByCount) : null,
    poolOrbs,
    searchFeedback: options.searchFeedbackMessage
      ? {
          message: options.searchFeedbackMessage
        }
      : undefined,
  };
}

// 固定评审场景状态构造。
export function buildHomeViewState(
  scenario: ReviewScenario,
  options: BuildHomeViewStateOptions = {}
): HomeViewState {
  const mode = scenario === "home-empty" ? "empty" : "populated";
  const fieldView = resolveHomeFieldView(mode, options.homeFieldView);

  if (scenario === "home-empty") {
    return {
      mode: "empty",
      fieldView,
      hero: {
        title: "Glitter · 灵感池",
        subtitle: "",
        emphasis: "single-center"
      },
      topbar: {
        controls: []
      },
      emptyGuide: {
        badge: "首次引导",
        helper: "点击中央灵感球，打开首次记录窗口",
        prompt: "点击空灵感球开始流程"
      },
      primaryAction: {
        label: "灵感速记",
        tone: "primary"
      },
      primaryOrb: null,
      poolOrbs: [],
      };
  }

  if (scenario === "home-populated" || scenario === "settings-conflict") {
    return {
      mode: "populated",
      fieldView,
      hero: {
        title: "Glitter · 灵感池",
        subtitle: "先校准主舞台、池球层级和关键操作位。",
        emphasis: "stage-top"
      },
      topbar: {
        search: {
          placeholder: "可搜索标题/标签/池名，按状态筛选。"
        },
        controls: [
          { id: "view-switch", label: "切换视图", kind: "text" },
          { id: "settings", label: "设置", kind: "text" },
          { id: "file-filter", label: "已引用 / 已建文件快速筛选", kind: "icon" }
        ]
      },
      primaryAction: {
        label: "灵感速记",
        tone: "primary"
      },
      secondaryAction: {
        label: "创建池",
        tone: "secondary"
      },
      primaryOrb: { ...HOME_PRIMARY_ORB },
      poolOrbs: HOME_SUPPORTING_ORBS.map((orb) => ({ ...orb })),
      banner:
        scenario === "settings-conflict"
          ? {
              title: "设置冲突",
              description: "当前快捷记录与固定评审场景冲突，请先完成当前页面核对。",
              tone: "warning"
            }
          : undefined,
      searchFeedback: options.searchFeedbackMessage
        ? {
            message: options.searchFeedbackMessage
          }
        : undefined
    };
  }

  throw new Error(`buildHomeViewState does not support scenario: ${scenario}`);
}
