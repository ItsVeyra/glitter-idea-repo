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
 * 命令总装配入口，统一接入 Glitter 提供的命令集合。
 * 负责根据当前设置决定哪些命令需要注册到宿主应用。
 */
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { registerCreateFromSelectionCommand } from "./create-from-selection-command";
import { registerInsertIdeaReferenceCommand } from "./insert-idea-command";
import { registerOpenMainViewCommand } from "./open-main-view-command";
import { registerOpenPoolViewCommand } from "./open-pool-view-command";
import { registerOpenSearchViewCommand } from "./open-search-view-command";
import { registerQuickCaptureCommand } from "./quick-capture-command";

// 按当前设置注册命令。
export function registerCommands(plugin: GlitterPlugin): void {
  registerOpenMainViewCommand(plugin);
  registerOpenSearchViewCommand(plugin);
  registerOpenPoolViewCommand(plugin);

  if (plugin.settings.enableQuickCapture) {
    registerQuickCaptureCommand(plugin);
  }

  if (plugin.settings.enableCreateFromSelection) {
    registerCreateFromSelectionCommand(plugin);
  }

  if (plugin.settings.enableInsertIdeaReference) {
    registerInsertIdeaReferenceCommand(plugin);
  }
}
