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
 * 搜索页动作约定。
 * 负责描述搜索工作区对外抛出的查询、选中与批量操作回调。
 */

// 搜索结果页与宿主视图之间的交互入口。
export interface SearchViewActions {
  onQuerySubmit: () => void;
  onResultSelect: (resultId: string) => void;
  onBatchAction: (actionId: string) => void;
}
