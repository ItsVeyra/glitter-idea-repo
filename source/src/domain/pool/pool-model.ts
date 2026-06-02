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
 * 灵感池领域模型定义。
 * 负责描述池实体的基础字段，供服务层、存储层与视图层共享。
 */
// 灵感池实体定义。
export interface Pool {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
