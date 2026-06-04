/**
 * 保护快速记录文本润色服务的配置校验与 OpenAI 兼容请求契约，避免后续接线时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";
import { createOpenAiCompatiblePolishProvider } from "../../../src/ai/polish/openai-compatible-provider";
import { createQuickCapturePolishService } from "../../../src/ai/polish/polish-service";
import type { QuickCapturePolishProvider } from "../../../src/ai/polish/polish-types";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import type { GlitterPluginSettings } from "../../../src/settings/settings";

function createSettings(
  aiOverrides: Partial<GlitterPluginSettings["ai"]> = {}
): GlitterPluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    ai: {
      ...DEFAULT_SETTINGS.ai,
      enabled: true,
      quickCapturePolishEnabled: true,
      baseUrl: "https://api.example.com/v1",
      model: "gpt-4.1-mini",
      apiKey: "sk-test-key",
      ...aiOverrides
    }
  };
}

describe("createQuickCapturePolishService", () => {
  it("rejects missing config before making any request", async () => {
    const provider: QuickCapturePolishProvider = {
      polishText: vi.fn(async () => "should not run")
    };
    const service = createQuickCapturePolishService(provider);

    await expect(
      service.polishText(
        "messy draft",
        createSettings({
          apiKey: ""
        })
      )
    ).rejects.toMatchObject({ code: "missing-config" });

    expect(provider.polishText).not.toHaveBeenCalled();
  });

  it("posts to chat completions with a substantive polish prompt and returns the final assistant text", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Polished quick capture"
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText("messy draft", createSettings())).resolves.toBe(
      "Polished quick capture"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect(requestInit).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer sk-test-key"
      })
    });
    expect(JSON.parse((requestInit?.body as string | undefined) ?? "{}")).toMatchObject({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("成熟短文")
        }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("messy draft")
        })
      ]
    });
  });

  it("retries with a stronger prompt when the first polish result only mirrors the source", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "messy draft"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "A clearer and more complete draft"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText("messy draft", createSettings())).resolves.toBe(
      "A clearer and more complete draft"
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstRequestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    const [, secondRequestInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit | undefined];
    const firstBody = JSON.parse((firstRequestInit?.body as string | undefined) ?? "{}");
    const secondBody = JSON.parse((secondRequestInit?.body as string | undefined) ?? "{}");

    expect(firstBody.messages[1]?.content).toContain("请润色下面这段内容");
    expect(secondBody.messages[1]?.content).toContain("重写成一段适合保存的成熟短文");
    expect(secondBody.messages[1]?.content).toContain("messy draft");
  });

  it("sends a mature-shortform first pass and a forced-rewrite retry prompt", async () => {
    const source = "按钮不明显";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: source
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "这个按钮现在不够醒目，用户很容易错过主要操作。"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText(source, createSettings())).resolves.toBe(
      "这个按钮现在不够醒目，用户很容易错过主要操作。"
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstRequestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    const [, secondRequestInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit | undefined];
    const firstBody = JSON.parse((firstRequestInit?.body as string | undefined) ?? "{}");
    const secondBody = JSON.parse((secondRequestInit?.body as string | undefined) ?? "{}");

    expect(firstBody.messages[0]?.content).toContain("成熟短文");
    expect(firstBody.messages[0]?.content).toContain("完整段落");
    expect(firstBody.messages[0]?.content).toContain("不要编造原文没有依据的具体事实");
    expect(secondBody.messages[1]?.content).toContain("重写成一段适合保存的成熟短文");
    expect(secondBody.messages[1]?.content).toContain("不要只做排版、换行、标点或轻微同义替换");
    expect(secondBody.messages[1]?.content).toContain(source);
  });

  it("retries when the first result only changes punctuation or line wrapping", async () => {
    const source = "不止局限于软件业\n我们现有的工作流程";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "不止局限于软件业，我们现有的工作流程。"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "不止局限于软件业，我们现有的工作流程，其实都建立在一个成本偏高、协作偏慢的旧范式上。"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText(source, createSettings())).resolves.toContain("旧范式");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries when the first result still reads like a multi-line draft", async () => {
    const source = "想法：把等待时间做成缓冲层\n问题：用户不知道下一步\n目标：减少打断感";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "想法是把等待时间做成缓冲层。\n用户现在还不知道下一步。\n目标是减少打断感。"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content:
                    "我想把等待时间设计成一个让用户逐步进入状态的缓冲层，但前提是界面必须更清楚地告诉用户下一步要做什么，这样整体体验才不会被频繁打断。"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText(source, createSettings())).resolves.toContain("缓冲层");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails when even the retry still returns a multi-line draft", async () => {
    const source = "想法：把等待时间做成缓冲层\n问题：用户不知道下一步\n目标：减少打断感";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "想法是把等待时间做成缓冲层。\n用户现在还不知道下一步。\n目标是减少打断感。"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "等待时间可以做成缓冲层。\n用户需要更清楚的下一步提示。\n这样打断感会更少。"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText(source, createSettings())).rejects.toMatchObject({
      code: "insufficient-rewrite"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["numbered list", "1. 先梳理现状\n2. 再确定下一步"],
    ["numbered list without spaces", "1.先梳理现状\n2.再确定下一步"],
    ["Chinese numbered list", "1、先梳理现状\n2、再确定下一步"],
    ["bulleted list", "- 先梳理现状\n- 再确定下一步"],
    ["checklist", "- [x] 先梳理现状\n- [x] 再确定下一步"]
  ])("retries when the first result only reformats the source as a %s", async (_label, firstPass) => {
    const source = "先梳理现状\n再确定下一步";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: firstPass
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "先梳理现状，再确定下一步，这样后续动作和当前判断都会更清楚。"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText(source, createSettings())).resolves.toContain("后续动作");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries when the first result only makes a near-identical paraphrase", async () => {
    const source = "The current layout makes the action button easy to miss.";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "The current layout makes the action button easy to overlook."
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "In the current layout, the action button gets lost too easily, so the primary action is harder to notice at a glance."
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText(source, createSettings())).resolves.toContain("harder to notice");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries when the first result only adds a minimal short-text tweak", async () => {
    const source = "按钮不明显";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "按钮不够明显"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "这个按钮现在不够醒目，用户很容易错过主要操作。"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText(source, createSettings())).resolves.toContain("主要操作");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts a clearly improved rewrite even when it stays close in length", async () => {
    const source = "The current layout makes the action button easy to miss.";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "In this layout, the action button gets lost too easily."
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText(source, createSettings())).resolves.toContain("gets lost too easily");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails when even the retry still does not produce a substantive rewrite", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "messy draft"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "messy draft!"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText("messy draft", createSettings())).rejects.toMatchObject({
      code: "insufficient-rewrite"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])("maps %s responses to unauthorized", async (status) => {
    const fetchMock = vi.fn(async () => new Response("denied", { status }));
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText("messy draft", createSettings())).rejects.toMatchObject({
      code: "unauthorized",
      message: expect.not.stringContaining("sk-test-key")
    });
  });

  it.each([
    [
      "malformed json",
      new Response("{", {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      })
    ],
    [
      "empty assistant content",
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "   "
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    ]
  ])("maps %s to invalid-response", async (_label, response) => {
    const fetchMock = vi.fn(async () => response);
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText("messy draft", createSettings())).rejects.toMatchObject({
      code: "invalid-response"
    });
  });

  it("maps fetch failures to network", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("request failed for sk-test-key");
    });
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText("messy draft", createSettings())).rejects.toMatchObject({
      code: "network",
      message: expect.not.stringContaining("sk-test-key")
    });
  });

  it("maps non-auth HTTP failures to unavailable", async () => {
    const fetchMock = vi.fn(async () => new Response("busy", { status: 503 }));
    const provider = createOpenAiCompatiblePolishProvider(fetchMock as typeof fetch);
    const service = createQuickCapturePolishService(provider);

    await expect(service.polishText("messy draft", createSettings())).rejects.toMatchObject({
      code: "unavailable"
    });
  });
});
