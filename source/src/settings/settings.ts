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
 * 插件设置类型定义。
 * 负责描述 Glitter 设置对象、主题模式与池配色结构，供运行时与设置页共享。
 */
import type { ReviewScenario } from "../review/scenarios";

// 设置结构定义。
export type UiThemeMode = "follow-obsidian" | "obsidian-dark" | "obsidian-light";
export type AppliedUiThemeMode = Exclude<UiThemeMode, "follow-obsidian">;
// 首页池场当前支持两套底层视图：圆满沿用水面基线，涟漪对应独立的 spring-rain 渲染语义。
export type HomeFieldView = "water" | "spring-rain";

export interface PoolColorSettings {
  unsorted: string;
  product: string;
  research: string;
  writing: string;
  unnamed: string;
}

// AI 直连配置：目前用于快速记录文本润色，并保留 provider 字段给后续扩展。
export interface AiSettings {
  enabled: boolean;
  quickCapturePolishEnabled: boolean;
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface RoamSettings {
  boardStorageDirectory: string;
}

export interface GlitterPluginSettings {
  defaultPoolId: string | null;
  enableQuickCapture: boolean;
  enableCreateFromSelection: boolean;
  enableInsertIdeaReference: boolean;
  showHomeRibbonIcon: boolean;
  enableReducedMotion: boolean;
  enableAmbientMotion: boolean;
  uiThemeMode: UiThemeMode;
  homeFieldView: HomeFieldView;
  ai: AiSettings;
  poolColors: PoolColorSettings;
  createMdFileByDefault: boolean;
  mediaStorageDirectory: string;
  fileStorageDirectory: string;
  roam: RoamSettings;
  createdIdeaEmoji: string;
  referencedIdeaEmoji: string;
  usePerTypeHotkeys: boolean;
  enableDesignReviewMode: boolean;
  reviewScenario: ReviewScenario;
  openMainViewOnNextLoad: boolean;
  hasCompletedFirstUse: boolean;
  hotkeys: {
    globalQuickCapture: string | null;
    createFromSelection: string | null;
    insertIdeaReference: string | null;
  };
}
