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
 * 搜索视图命令注册器。
 * 负责声明打开 Glitter 搜索页的命令，并把回调绑定到插件导航入口。
 */
import type GlitterPlugin from "../plugin/GlitterPlugin";

// 命令注册。
export function registerOpenSearchViewCommand(plugin: GlitterPlugin): void {
  plugin.addCommand({
    id: "open-search-view",
    name: "Open Glitter search view",
    callback: () => plugin.activateSearchView()
  });
}
