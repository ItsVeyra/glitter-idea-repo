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
 * 插件常量中心。
 * 负责集中维护插件标识、视图类型、默认池常量与共享文案回退规则。
 */
// 插件标识与视图类型。
export const PLUGIN_ID = "glitter-idea";
export const GLITTER_ICON_ID = "glitter-idea-plugin-sparkles";
export const MAIN_VIEW_TYPE = "glitter-idea-main-view";
export const SEARCH_VIEW_TYPE = "glitter-idea-search-view";
export const POOL_VIEW_TYPE = "glitter-idea-pool-view";

// 默认池与新建池常量。
export const DEFAULT_POOL_ID = "pool-default";
export const DEFAULT_POOL_LABEL = "默认池";
export const DEFAULT_POOL_DESCRIPTION = "继续在当前池中筛选、整理并沉淀灵感。";
export const CREATE_NEW_POOL_ID = "create-new-pool";
export const CREATE_NEW_POOL_LABEL = "新建池";
export const NEW_POOL_CREATED_ID = "new-pool-created";
export const NEW_POOL_CREATED_LABEL = "新建池";

// 文案回退辅助。
export function resolvePoolDescription(description?: string | null): string {
  const normalizedDescription = description?.trim();
  return normalizedDescription && normalizedDescription.length > 0
    ? normalizedDescription
    : DEFAULT_POOL_DESCRIPTION;
}
