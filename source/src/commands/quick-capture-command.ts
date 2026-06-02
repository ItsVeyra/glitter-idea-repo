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
 * 全局快速记录命令注册器，负责串联快速记录与选池弹窗。
 * 同时解析热键配置，并维护保存后回填与返回灵感池的弹窗流转。
 */
import type { Hotkey, Modifier } from "obsidian";
import { CREATE_NEW_POOL_ID } from "../plugin/constants";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { PoolModal } from "../views/pool-modal";
import { QuickCaptureModal, type QuickCaptureSavedSelection } from "../views/quick-capture-modal";

// 热键解析。
const HOTKEY_MODIFIER_ALIASES: Record<string, Modifier> = {
  mod: "Mod",
  ctrl: "Ctrl",
  control: "Ctrl",
  cmd: "Meta",
  command: "Meta",
  meta: "Meta",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
  opt: "Alt"
};

const HOTKEY_KEY_ALIASES: Record<string, string> = {
  enter: "Enter",
  return: "Enter",
  esc: "Escape",
  escape: "Escape",
  space: " ",
  spacebar: " "
};

function normalizeHotkeyKey(token: string): string | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (HOTKEY_KEY_ALIASES[normalized]) {
    return HOTKEY_KEY_ALIASES[normalized];
  }

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  if (/^f\d{1,2}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }

  return token.trim();
}

function parseConfiguredHotkey(value: string | null | undefined): Hotkey[] | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const tokens = normalized
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return undefined;
  }

  const key = normalizeHotkeyKey(tokens[tokens.length - 1] ?? "");
  if (!key) {
    return undefined;
  }

  const modifiers: Modifier[] = [];
  const seenModifiers = new Set<Modifier>();
  for (const token of tokens.slice(0, -1)) {
    const modifier = HOTKEY_MODIFIER_ALIASES[token.toLowerCase()];
    if (!modifier || seenModifiers.has(modifier)) {
      return undefined;
    }

    seenModifiers.add(modifier);
    modifiers.push(modifier);
  }

  return [{ modifiers, key }];
}

// 全局快速记录命令与弹窗流转。
export function registerQuickCaptureCommand(plugin: GlitterPlugin): void {
  let currentSelectedPoolState = plugin.quickCaptureWorkflow.getGlobalSelectedPoolState();

  // 全局快速记录弹窗流转。
  const openGlobalCapture = (
    step: "capture" | "saved-feedback",
    savedSelection?: QuickCaptureSavedSelection
  ): void => {
    const selectedPoolState = savedSelection
      ? {
          id: savedSelection.poolId ?? currentSelectedPoolState.id,
          label: savedSelection.poolLabel ?? currentSelectedPoolState.label
        }
      : currentSelectedPoolState;
    const modal = new QuickCaptureModal(
      plugin,
      step,
      {
        onSaved: (selection) => {
          if (selection?.poolId || selection?.poolLabel) {
            currentSelectedPoolState = {
              id: selection?.poolId ?? currentSelectedPoolState.id,
              label: selection?.poolLabel ?? currentSelectedPoolState.label
            };
          }

          if (step === "capture") {
            plugin.refreshOpenPoolViews();
            openGlobalCapture("saved-feedback", {
              poolId: selection?.poolId ?? selectedPoolState.id,
              poolLabel: selection?.poolLabel ?? selectedPoolState.label,
              createFileChecked: selection?.createFileChecked ?? false
            });
            return;
          }

          openGlobalCapture("capture");
        },
        onBackHome: () => {
          void plugin.activatePoolView({
            poolId: currentSelectedPoolState.id,
            resetFilters: true
          });
        },
        onPoolPickerOpen: (poolStep = "choose") => {
          openGlobalPoolModal(poolStep);
        }
      },
      {
        flowContext: "global",
        initialCreateFileChecked: step === "saved-feedback" ? savedSelection?.createFileChecked ?? false : undefined,
        initialSelectedPoolId: selectedPoolState.id,
        initialSelectedPoolLabel: selectedPoolState.label
      }
    );

    modal.open();
  };

  const openGlobalPoolModal = (step: "choose" | "create"): void => {
    const modal = new PoolModal(plugin, step, {
      onPoolChosen: async (poolId) => {
        if (poolId === CREATE_NEW_POOL_ID) {
          openGlobalPoolModal("create");
          return;
        }

        currentSelectedPoolState = await plugin.quickCaptureWorkflow.setGlobalSelectedPoolState(poolId);
        openGlobalCapture("capture");
      },
      onBackToPrevious: () => {
        openGlobalCapture("capture");
      },
      onBackToChoose: () => {
        openGlobalCapture("capture");
      }
    });

    modal.open();
  };

  // 命令元数据与快捷键。
  const globalQuickCaptureHotkey =
    plugin.settings.hotkeys.globalQuickCapture?.trim() || DEFAULT_SETTINGS.hotkeys.globalQuickCapture;

  plugin.addCommand({
    id: "open-quick-capture",
    name: "Open Glitter quick capture",
    hotkeys: parseConfiguredHotkey(globalQuickCaptureHotkey),
    callback: () => {
      openGlobalCapture("capture");
    }
  });
}
