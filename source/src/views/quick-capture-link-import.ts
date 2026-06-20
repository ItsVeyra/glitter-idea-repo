/**
 * 快速记录弹窗链接导入辅助函数。
 * 负责 URL 识别、粘贴解析与链接导入状态映射。
 */

import type { QuickCaptureLinkImportResult } from "../application/quick-capture/link-import";
import {
  detectQuickCaptureContentKind,
  type QuickCaptureContentKind,
  type QuickCaptureRuntimeInput
} from "../ui/write/quick-capture-runtime";

const QUICK_CAPTURE_URL_CANDIDATE_PATTERN = /(?:https?:\/\/|www\.)\S+/i;

interface QuickCaptureBodyInputState {
  typedSourceUrl?: string;
  nextInput: QuickCaptureRuntimeInput;
  nextContentKind: QuickCaptureContentKind;
  shouldRenderImmediately: boolean;
}

export interface QuickCaptureLinkImportRequestState {
  requestId: number;
  inputText: string;
  bodyPrefix?: string;
  replaceBody?: boolean;
}

export interface QuickCapturePasteLinkState {
  sourceUrl: string;
  excerpt?: string;
}

function removeTypedSourceUrlFromBody(value: string, typedSourceUrl: string): string {
  return value
    .replace(typedSourceUrl, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractQuickCaptureTypedSourceUrl(value: string): string | undefined {
  return value.match(QUICK_CAPTURE_URL_CANDIDATE_PATTERN)?.[0];
}

export function isQuickCaptureUrlText(value: string): boolean {
  return QUICK_CAPTURE_URL_CANDIDATE_PATTERN.test(value);
}

export function buildQuickCaptureBodyInputState({
  runtimeInput,
  value,
  primaryPastedLink
}: {
  runtimeInput: QuickCaptureRuntimeInput;
  value: string;
  primaryPastedLink: QuickCapturePasteLinkState | null;
}): QuickCaptureBodyInputState {
  const previousContentKind = detectQuickCaptureContentKind(runtimeInput);
  const typedSourceUrl = runtimeInput.sourceUrl ? undefined : extractQuickCaptureTypedSourceUrl(value);
  const nextText = typedSourceUrl ? removeTypedSourceUrlFromBody(value, typedSourceUrl) : value;
  const previousSourceUrl = primaryPastedLink?.sourceUrl ?? runtimeInput.sourceUrl;
  const nextInput: QuickCaptureRuntimeInput = {
    ...runtimeInput,
    text: nextText,
    sourceUrl: typedSourceUrl ?? previousSourceUrl,
    importedExcerpt:
      typedSourceUrl && typedSourceUrl !== previousSourceUrl ? undefined : runtimeInput.importedExcerpt,
    suspendInlineUrlAutoDetection: false
  };
  const nextContentKind = detectQuickCaptureContentKind(nextInput);

  return {
    typedSourceUrl,
    nextInput,
    nextContentKind,
    shouldRenderImmediately:
      previousContentKind !== nextContentKind ||
      runtimeInput.sourceUrl !== nextInput.sourceUrl ||
      runtimeInput.text !== nextInput.text
  };
}

export function shouldStartQuickCaptureLinkImport({
  nextInput,
  typedSourceUrl,
  currentRequestState
}: {
  nextInput: QuickCaptureRuntimeInput;
  typedSourceUrl?: string;
  currentRequestState: QuickCaptureLinkImportRequestState | null;
}): boolean {
  if (detectQuickCaptureContentKind(nextInput) !== "link") {
    return false;
  }

  if (nextInput.sourceUrl && !typedSourceUrl) {
    return false;
  }

  const requestText = typedSourceUrl ?? nextInput.sourceUrl;
  return Boolean(requestText && currentRequestState?.inputText !== requestText);
}

export function createQuickCaptureLinkImportRequestState({
  requestId,
  inputText,
  bodyPrefix,
  replaceBody
}: QuickCaptureLinkImportRequestState): QuickCaptureLinkImportRequestState {
  return {
    requestId,
    inputText,
    bodyPrefix,
    replaceBody
  };
}

export function isLatestQuickCaptureLinkImportRequest(
  requestState: QuickCaptureLinkImportRequestState | null,
  requestId: number,
  inputText: string
): boolean {
  return requestState?.requestId === requestId && requestState.inputText === inputText;
}

export function appendQuickCapturePastedLinkText(
  runtimeInput: QuickCaptureRuntimeInput,
  pastedText: string
): QuickCaptureRuntimeInput {
  return {
    ...runtimeInput,
    text: runtimeInput.text.trim() ? `${runtimeInput.text}\n\n${pastedText}` : pastedText,
    importState: "idle"
  };
}

export function clearQuickCaptureLinkAttachment(runtimeInput: QuickCaptureRuntimeInput): QuickCaptureRuntimeInput {
  return {
    ...runtimeInput,
    sourceUrl: undefined,
    importedExcerpt: undefined,
    importState: "idle",
    suspendInlineUrlAutoDetection: true
  };
}

export function extractQuickCapturePastedImages(
  items: Array<Pick<DataTransferItem, "kind" | "type" | "getAsFile">>
): File[] {
  return items
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile?.() ?? null)
    .filter((file): file is File => file !== null);
}

export function extractQuickCapturePastedImage(
  items: Array<Pick<DataTransferItem, "kind" | "type" | "getAsFile">>
): File | null {
  return extractQuickCapturePastedImages(items)[0] ?? null;
}

export function resolveQuickCaptureLinkImportSuccess({
  runtimeInput,
  imported,
  bodyPrefix,
  replaceBody
}: {
  runtimeInput: QuickCaptureRuntimeInput;
  imported: QuickCaptureLinkImportResult;
  bodyPrefix?: string;
  replaceBody?: boolean;
}): {
  nextInput: QuickCaptureRuntimeInput;
  primaryPastedLink: QuickCapturePasteLinkState;
} {
  const importedBody = imported.body.trim() ? imported.body : undefined;
  const requestedBodyPrefix = bodyPrefix ?? "";
  const currentBodyText = runtimeInput.text;
  const bodyChangedSinceRequest = currentBodyText !== requestedBodyPrefix;
  const nextText =
    replaceBody === false
      ? bodyChangedSinceRequest
        ? currentBodyText.trim()
          ? [currentBodyText.trim(), importedBody].filter(Boolean).join("\n\n")
          : currentBodyText
        : requestedBodyPrefix.trim()
          ? [requestedBodyPrefix.trim(), importedBody].filter(Boolean).join("\n\n")
          : importedBody ?? currentBodyText
      : importedBody ?? "";

  return {
    primaryPastedLink: {
      sourceUrl: imported.sourceUrl,
      excerpt: importedBody
    },
    nextInput: {
      ...runtimeInput,
      text: nextText,
      title: imported.title,
      sourceUrl: imported.sourceUrl,
      importedExcerpt: importedBody,
      importState: "idle"
    }
  };
}

export function resolveQuickCaptureLinkImportError({
  runtimeInput,
  requestSourceUrl
}: {
  runtimeInput: QuickCaptureRuntimeInput;
  requestSourceUrl: string;
}): QuickCaptureRuntimeInput {
  return {
    ...runtimeInput,
    sourceUrl: requestSourceUrl,
    importedExcerpt: runtimeInput.importedExcerpt,
    importState: "error"
  };
}
