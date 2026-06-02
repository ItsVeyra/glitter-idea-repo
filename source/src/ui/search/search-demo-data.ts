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
 * 搜索页示例数据。
 * 负责固定评审场景下的搜索结果占位内容。
 */

// 固定评审场景使用的搜索结果样例。
export const SEARCH_DEMO_RESULTS = [
  {
    id: "result-1",
    title: "Editor plugin onboarding notes",
    meta: "Research · Updated today"
  },
  {
    id: "result-2",
    title: "Visual QA checklist for shell states",
    meta: "Design · Updated yesterday"
  },
  {
    id: "result-3",
    title: "Selection parser edge cases",
    meta: "Engineering · Updated this week"
  }
] as const;
