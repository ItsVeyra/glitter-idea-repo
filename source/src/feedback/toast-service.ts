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
 * 提示反馈服务。
 * 负责把统一的反馈状态与消息透传到 Obsidian Notice，供调用方复用。
 */
import { Notice } from "obsidian";
import type { FeedbackStatus } from "./status-types";

// 提示服务契约。
export interface ToastInput {
  status: FeedbackStatus;
  message: string;
}

// 提示服务实现。
export function createToastService() {
  return {
    show(input: ToastInput): ToastInput {
      new Notice(input.message);
      return input;
    }
  };
}
