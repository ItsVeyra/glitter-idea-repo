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
 * 首页视图动作约定。
 * 负责描述首页灵感场对外暴露的用户操作，供首页渲染层与宿主视图解耦协作。
 */

import type { HomeFieldView } from "../../settings/settings";

// 首页主舞台与宿主视图之间的交互入口。
export interface HomeViewActions {
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onPoolSelect: (poolId: string) => void;
  onPoolTitleSelect?: (poolId: string) => void;
  onPoolRename?: (poolId: string, name: string) => void;
  onPoolDelete?: (poolId: string) => void;
  onOverflowOpen?: () => void;
  onSearchSubmit: (query: string) => void;
  onOpenSettings?: () => void;
  // 顶部“切换视图”菜单通过这里把圆满 / 涟漪的选择回传给宿主视图。
  onFieldViewSelect?: (fieldView: HomeFieldView) => void;
  onStatusFilterSelect?: () => void;
}
