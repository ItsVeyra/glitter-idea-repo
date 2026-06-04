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
