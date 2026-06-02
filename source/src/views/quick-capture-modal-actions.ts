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
 * 快速记录弹窗渲染动作工厂。
 * 只负责把宿主已决定好的回调接到写作视图 actions 上。
 */

import type {
  WriteBodyPastePayload,
  WriteTextInputChangeOptions,
  WriteViewActions
} from "../ui/write/render-write";

export type QuickCaptureModalStep = "capture" | "saved-feedback";

export interface QuickCaptureModalActionFactoryDeps {
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
  onSecondaryAction?: () => void;
  onPoolPickerToggle: () => void;
  onPoolSelect: (poolId: string) => void;
  onBodyInputChange: (value: string, options?: WriteTextInputChangeOptions) => void;
  onBodyPaste: (payload: WriteBodyPastePayload) => Promise<void> | void;
  onTitleInputChange: (value: string, options?: WriteTextInputChangeOptions) => void;
  onAttachmentPick: () => Promise<void> | void;
  onRemoveMediaAttachment: () => void;
  onRemoveLinkAttachment: () => void;
  onMediaNavigatePrevious: () => void;
  onMediaNavigateNext: () => void;
  onMediaAddAttachment: () => Promise<void> | void;
  onMediaReplaceAttachment: () => Promise<void> | void;
  onCreateFileToggle: (checked: boolean) => void;
  onMediaPreviewOpen: () => void;
  onMediaPreviewClose: () => void;
  onResumeCapture: () => void;
  onConfirmClose: () => void;
  onAiPolishStart?: () => Promise<void> | void;
  onAiPolishRedo?: () => Promise<void> | void;
  onAiPolishAccept?: () => Promise<void> | void;
  onAiPolishBackToEditing?: () => Promise<void> | void;
}

export function createQuickCaptureModalActions(deps: QuickCaptureModalActionFactoryDeps): WriteViewActions {
  return {
    onClose: () => {
      deps.onClose();
    },
    onSubmit: () => {
      void deps.onSubmit();
    },
    onSecondaryAction: deps.onSecondaryAction,
    onPoolPickerToggle: () => {
      deps.onPoolPickerToggle();
    },
    onPoolSelect: (poolId) => {
      deps.onPoolSelect(poolId);
    },
    onRetryLinkImport: () => {},
    onBodyInputChange: (value, options) => {
      deps.onBodyInputChange(value, options);
    },
    onBodyPaste: (payload) => {
      void deps.onBodyPaste(payload);
    },
    onTitleInputChange: (value, options = {}) => {
      deps.onTitleInputChange(value, options);
    },
    onAttachmentPick: () => {
      void deps.onAttachmentPick();
    },
    onRemoveMediaAttachment: () => {
      deps.onRemoveMediaAttachment();
    },
    onRemoveLinkAttachment: () => {
      deps.onRemoveLinkAttachment();
    },
    onMediaNavigatePrevious: () => {
      deps.onMediaNavigatePrevious();
    },
    onMediaNavigateNext: () => {
      deps.onMediaNavigateNext();
    },
    onMediaAddAttachment: () => {
      void deps.onMediaAddAttachment();
    },
    onMediaReplaceAttachment: () => {
      void deps.onMediaReplaceAttachment();
    },
    onCreateFileToggle: (checked) => {
      deps.onCreateFileToggle(checked);
    },
    onMediaPreviewOpen: () => {
      deps.onMediaPreviewOpen();
    },
    onMediaPreviewClose: () => {
      deps.onMediaPreviewClose();
    },
    onResumeCapture: () => {
      deps.onResumeCapture();
    },
    onConfirmClose: () => {
      deps.onConfirmClose();
    },
    // AI 润色动作在这里统一转成视图层约定的回调，宿主可继续保持本地状态编排。
    onAiPolishStart: deps.onAiPolishStart
      ? () => {
          void deps.onAiPolishStart?.();
        }
      : undefined,
    onAiPolishRedo: deps.onAiPolishRedo
      ? () => {
          void deps.onAiPolishRedo?.();
        }
      : undefined,
    onAiPolishAccept: deps.onAiPolishAccept
      ? () => {
          void deps.onAiPolishAccept?.();
        }
      : undefined,
    onAiPolishBackToEditing: deps.onAiPolishBackToEditing
      ? () => {
          void deps.onAiPolishBackToEditing?.();
        }
      : undefined
  };
}

export default createQuickCaptureModalActions;
