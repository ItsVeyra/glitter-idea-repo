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
 * 快速记录运行时模型工具。
 * 负责从弹窗输入状态推导内容类型、自动标题和渲染层所需的最小模型。
 */

import { DEFAULT_POOL_ID, DEFAULT_POOL_LABEL } from "../../plugin/constants";

// 快速记录运行时状态契约。
export type QuickCaptureFlowContext = "first-use" | "global";
export type QuickCapturePhase = "capture" | "saving" | "save-failed" | "saved-feedback";
export type QuickCaptureContentKind = "text" | "link" | "media";
export type QuickCaptureImportState = "idle" | "loading" | "error";

export interface QuickCaptureRuntimeInput {
  text: string;
  title?: string;
  hasManualTitle?: boolean;
  hasMedia?: boolean;
  sourceUrl?: string;
  importedExcerpt?: string;
  importState?: QuickCaptureImportState;
  suspendInlineUrlAutoDetection?: boolean;
  createFileChecked?: boolean;
  selectedPoolId?: string;
  selectedPoolLabel?: string;
  poolDropdownVisible?: boolean;
}

export interface QuickCaptureRuntimeState {
  flowContext: QuickCaptureFlowContext;
  phase: QuickCapturePhase;
  input: QuickCaptureRuntimeInput;
}

export interface QuickCaptureStateModel {
  flowContext: QuickCaptureFlowContext;
  phase: QuickCapturePhase;
  contentKind: QuickCaptureContentKind;
  importState: QuickCaptureImportState;
  generatedTitle: string;
  titleText: string;
  hasManualTitle: boolean;
  inputText: string;
  importedExcerpt?: string;
  sourceUrl?: string;
  createFileChecked: boolean;
  selectedPoolId: string;
  selectedPoolLabel: string;
  poolDropdownVisible: boolean;
}

// 输入内容识别与标题兜底规则。
const URL_CANDIDATE_PATTERN = /(?:https?:\/\/|www\.)\S+/i;

function formatTitleFallback(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `灵感 ${month}-${day} ${hour}:${minute}`;
}

// 记录内容类型判定。
export function detectQuickCaptureContentKind(input: QuickCaptureRuntimeInput): QuickCaptureContentKind {
  if (input.hasMedia) {
    return "media";
  }

  if (input.sourceUrl || (!input.suspendInlineUrlAutoDetection && URL_CANDIDATE_PATTERN.test(input.text))) {
    return "link";
  }

  return "text";
}

// 渲染层消费的快速记录状态派生。
export function deriveQuickCaptureStateModel(
  runtimeState: QuickCaptureRuntimeState,
  options: { now?: Date; attachedMediaLabels?: string[] } = {}
): QuickCaptureStateModel {
  const now = options.now ?? new Date();
  const contentKind = detectQuickCaptureContentKind(runtimeState.input);
  const firstAttachedMediaLabel = options.attachedMediaLabels?.[0]?.trim();
  const hasManualTitle = runtimeState.input.hasManualTitle ?? false;
  const explicitAutoTitle =
    runtimeState.input.hasManualTitle === false && contentKind === "text"
      ? runtimeState.input.title?.trim()
      : undefined;
  const generatedTitle =
    runtimeState.flowContext === "first-use"
      ? "我的第一条灵感"
      : contentKind === "media"
        ? firstAttachedMediaLabel || "媒体灵感"
        : explicitAutoTitle || formatTitleFallback(now);
  const titleText = runtimeState.input.title !== undefined ? runtimeState.input.title : generatedTitle;

  return {
    flowContext: runtimeState.flowContext,
    phase: runtimeState.phase,
    contentKind,
    importState: runtimeState.input.importState ?? "idle",
    generatedTitle,
    titleText,
    hasManualTitle,
    inputText: runtimeState.input.text,
    importedExcerpt: runtimeState.input.importedExcerpt,
    sourceUrl: runtimeState.input.sourceUrl,
    createFileChecked: runtimeState.input.createFileChecked ?? false,
    selectedPoolId: runtimeState.input.selectedPoolId ?? DEFAULT_POOL_ID,
    selectedPoolLabel: runtimeState.input.selectedPoolLabel ?? DEFAULT_POOL_LABEL,
    poolDropdownVisible: runtimeState.input.poolDropdownVisible ?? false
  };
}
