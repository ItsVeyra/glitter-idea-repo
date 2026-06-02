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
 * 说明：该文件是 Obsidian 插件入口，只负责把真正的插件实现从 src/plugin/GlitterPlugin 暴露给宿主加载。
 */
import GlitterPlugin from "./src/plugin/GlitterPlugin";

// 说明：保持默认导出稳定，避免构建入口与运行时入口分叉维护。
export default GlitterPlugin;
