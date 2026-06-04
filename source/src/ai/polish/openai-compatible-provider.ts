/**
 * OpenAI 兼容文本润色提供方。
 */

import type { AiSettings } from "../../settings/settings";
import type { QuickCapturePolishProvider } from "./polish-types";
import { QuickCapturePolishError } from "./polish-types";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

type PolishPromptMode = "default" | "substantive-retry";

// 首轮提示词强调真实优化与适度扩写，避免模型把润色退化成排版整理。
const DEFAULT_POLISH_SYSTEM_PROMPT = [
  "你是 Glitter 的 AI 润色助手。",
  "你的任务不是简单润色，而是把用户的原始草稿整理成一段可直接保存的成熟短文。",
  "请在不改变核心意图、不编造事实的前提下：",
  "1. 优先输出完整段落，而不是保留条目、碎片句或清单感；",
  "2. 主动重组句序、合并重复表达，并补足必要的承接与收束；",
  "3. 让结果比原文更完整、更顺畅、更适合直接保存；",
  "4. 允许明显改写，但不要编造原文没有依据的具体事实、数据、承诺或结论；",
  "5. 尽量保留用户原本的语气、视角与重点。",
  "只返回润色后的最终正文，不要解释，不要加标题，不要使用代码块。"
].join("\n");

// 二次重试专门压制“只改标点/换行/轻微同义替换”的低价值结果。
const SUBSTANTIVE_RETRY_PROMPT = [
  "请把下面的内容直接重写成一段适合保存的成熟短文。",
  "不要只做排版、换行、标点或轻微同义替换。",
  "请主动重组表达、补足承接，并消除明显的草稿感或清单感。",
  "可以明显改写，但不要编造任何原文没有依据的事实。",
  "只返回重写后的最终正文。"
].join("\n");

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

function buildMessages(input: string, mode: PolishPromptMode) {
  if (mode === "substantive-retry") {
    return [
      {
        role: "system",
        content: DEFAULT_POLISH_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `${SUBSTANTIVE_RETRY_PROMPT}\n\n原文：\n${input}`
      }
    ];
  }

  return [
    {
      role: "system",
      content: DEFAULT_POLISH_SYSTEM_PROMPT
    },
    {
      role: "user",
      content: `请润色下面这段内容，并直接返回润色后的最终正文：\n\n${input}`
    }
  ];
}

function extractAssistantText(payload: ChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new QuickCapturePolishError("invalid-response");
  }

  return content.trim();
}

const LIST_PREFIX_PATTERN = /^(?:[-*•●◦▪︎▸▶](?:\s*\[[ xX]\])?|\d+[.)、]|[a-zA-Z][.)])\s*/u;

// 先抹平常见的列表/清单前缀，避免模型只改列表格式就被误判为实质性润色。
function normalizeFormattingOnlyLinePrefixes(input: string): string {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim().replace(LIST_PREFIX_PATTERN, ""))
    .join("\n");
}

function countSentenceEndingPunctuation(input: string): number {
  return (input.match(/[。！？.!?]/g) ?? []).length;
}

function isPolishedOutputStillDraftLike(input: string): boolean {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return false;
  }

  const listLikeLines = lines.filter((line) => LIST_PREFIX_PATTERN.test(line)).length;
  const shortFragmentLines = lines.filter((line) => line.length <= 18).length;
  const sentenceEndings = countSentenceEndingPunctuation(input);

  if (listLikeLines >= Math.ceil(lines.length / 2)) {
    return true;
  }

  if (lines.length >= 3 && shortFragmentLines >= 2 && sentenceEndings <= 1) {
    return true;
  }

  return lines.length >= 3 && shortFragmentLines >= lines.length - 1 && sentenceEndings <= lines.length;
}

function normalizeTextForSubstantiveComparison(input: string): string {
  return normalizeFormattingOnlyLinePrefixes(input)
    .trim()
    .replace(/[\s\u00A0]+/g, "")
    .replace(/[.,!?;:'"“”‘’()（）\[\]{}<>《》【】、，。！？；：—…·-]/g, "")
    .toLowerCase();
}

function calculateLevenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previousRow[0] ?? 0;
    previousRow[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const nextDiagonal = previousRow[rightIndex] ?? 0;
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previousRow[rightIndex] = Math.min(
        (previousRow[rightIndex] ?? 0) + 1,
        (previousRow[rightIndex - 1] ?? 0) + 1,
        diagonal + substitutionCost
      );
      diagonal = nextDiagonal;
    }
  }

  return previousRow[right.length] ?? 0;
}

// 用归一化 + 编辑距离同时兜住原文回显、短文本微调、列表重排等“看起来改了、实际没改”的结果。
function isPolishedOutputTooCloseToSource(source: string, polished: string): boolean {
  if (source.trim() === polished.trim()) {
    return true;
  }

  const normalizedSource = normalizeTextForSubstantiveComparison(source);
  const normalizedPolished = normalizeTextForSubstantiveComparison(polished);
  if (normalizedSource.length === 0 || normalizedPolished.length === 0) {
    return true;
  }

  if (normalizedSource === normalizedPolished) {
    return true;
  }

  const distance = calculateLevenshteinDistance(normalizedSource, normalizedPolished);
  const maxLength = Math.max(normalizedSource.length, normalizedPolished.length);
  const minLength = Math.min(normalizedSource.length, normalizedPolished.length);
  const similarity = 1 - distance / maxLength;
  const expansionRatio = normalizedPolished.length / normalizedSource.length;

  if (similarity >= 0.92) {
    return true;
  }

  if (minLength <= 10 && distance <= 2 && expansionRatio < 1.35) {
    return true;
  }

  return similarity >= 0.84 && expansionRatio < 1.18;
}

function isPolishedOutputGoodEnough(source: string, polished: string): boolean {
  return !isPolishedOutputTooCloseToSource(source, polished) && !isPolishedOutputStillDraftLike(polished);
}

async function requestPolishedText(
  input: string,
  settings: AiSettings,
  fetcher: typeof fetch,
  mode: PolishPromptMode
): Promise<string> {
  let response: Response;

  try {
    response = await fetcher(buildChatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.7,
        messages: buildMessages(input, mode)
      })
    });
  } catch {
    throw new QuickCapturePolishError("network");
  }

  if (response.status === 401 || response.status === 403) {
    throw new QuickCapturePolishError("unauthorized");
  }

  if (!response.ok) {
    throw new QuickCapturePolishError("unavailable");
  }

  try {
    const payload = (await response.json()) as ChatCompletionResponse;
    return extractAssistantText(payload);
  } catch (error) {
    if (error instanceof QuickCapturePolishError) {
      throw error;
    }

    throw new QuickCapturePolishError("invalid-response");
  }
}

export function createOpenAiCompatiblePolishProvider(
  fetcher: typeof fetch = fetch
): QuickCapturePolishProvider {
  return {
    async polishText(input: string, settings: AiSettings) {
      const firstPass = await requestPolishedText(input, settings, fetcher, "default");
      if (isPolishedOutputGoodEnough(input, firstPass)) {
        return firstPass;
      }

      const secondPass = await requestPolishedText(input, settings, fetcher, "substantive-retry");
      if (!isPolishedOutputGoodEnough(input, secondPass)) {
        throw new QuickCapturePolishError("insufficient-rewrite");
      }

      return secondPass;
    }
  };
}
