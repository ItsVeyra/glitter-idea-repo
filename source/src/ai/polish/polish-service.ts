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
 * 快速记录文本润色服务。
 */

import type { GlitterPluginSettings } from "../../settings/settings";
import { createOpenAiCompatiblePolishProvider } from "./openai-compatible-provider";
import {
  normalizeQuickCapturePolishError,
  QuickCapturePolishError,
  type QuickCapturePolishProvider
} from "./polish-types";

export function createQuickCapturePolishService(
  provider: QuickCapturePolishProvider = createOpenAiCompatiblePolishProvider()
) {
  return {
    async polishText(input: string, settings: GlitterPluginSettings): Promise<string> {
      const aiSettings = settings.ai;
      const hasConfig =
        aiSettings.enabled &&
        aiSettings.quickCapturePolishEnabled &&
        aiSettings.baseUrl.trim().length > 0 &&
        aiSettings.model.trim().length > 0 &&
        aiSettings.apiKey.trim().length > 0;

      if (!hasConfig) {
        throw new QuickCapturePolishError("missing-config");
      }

      try {
        return await provider.polishText(input, aiSettings);
      } catch (error) {
        throw normalizeQuickCapturePolishError(error);
      }
    }
  };
}
