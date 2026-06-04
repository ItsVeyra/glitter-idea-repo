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
