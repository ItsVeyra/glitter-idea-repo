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
 * 灵感池概览排序规则。
 * 负责为首页或概览场景提供稳定的池排序比较逻辑。
 */
// 概览排序输入与规则。
export interface PoolOverviewSortEntry {
  name: string;
  ideaCount: number;
  isDefault: boolean;
}

export function comparePoolOverviewEntries(
  a: PoolOverviewSortEntry,
  b: PoolOverviewSortEntry
): number {
  if (b.ideaCount !== a.ideaCount) {
    return b.ideaCount - a.ideaCount;
  }
  if (a.isDefault !== b.isDefault) {
    return a.isDefault ? -1 : 1;
  }

  return a.name.localeCompare(b.name, "zh-Hans-CN");
}
