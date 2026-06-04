/**
 * 快速记录文本润色能力的共享类型定义。
 */

import type { AiSettings } from "../../settings/settings";

export type QuickCapturePolishErrorCode =
  | "missing-config"
  | "unauthorized"
  | "network"
  | "unavailable"
  | "invalid-response"
  | "insufficient-rewrite";

const ERROR_MESSAGES: Record<QuickCapturePolishErrorCode, string> = {
  "missing-config": "AI polish is not configured.",
  unauthorized: "AI polish authorization failed.",
  network: "AI polish network request failed.",
  unavailable: "AI polish is currently unavailable.",
  "invalid-response": "AI polish returned an invalid response.",
  "insufficient-rewrite": "AI polish did not produce a substantive rewrite."
};

export class QuickCapturePolishError extends Error {
  readonly code: QuickCapturePolishErrorCode;

  constructor(code: QuickCapturePolishErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "QuickCapturePolishError";
    this.code = code;
  }
}

export interface QuickCapturePolishProvider {
  polishText(input: string, settings: AiSettings): Promise<string>;
}

export function isQuickCapturePolishError(error: unknown): error is QuickCapturePolishError {
  return error instanceof QuickCapturePolishError;
}

export function normalizeQuickCapturePolishError(
  error: unknown,
  fallbackCode: QuickCapturePolishErrorCode = "unavailable"
): QuickCapturePolishError {
  if (isQuickCapturePolishError(error)) {
    return error;
  }

  return new QuickCapturePolishError(fallbackCode);
}
