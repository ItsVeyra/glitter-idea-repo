/**
 * 保护快速捕获链接导入辅助函数的 URL、请求与状态映射行为，避免重构时静默回退。
 */

import { describe, expect, it } from "vitest";

async function loadQuickCaptureLinkImportModule(): Promise<any> {
  try {
    return await import("../../src/views/quick-capture-link-import");
  } catch {
    return null;
  }
}

describe("quick-capture-link-import", () => {
  it("extracts typed source urls and removes them from body text", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();

    expect(linkImportModule?.extractQuickCaptureTypedSourceUrl("已有判断 https://example.com/article")).toBe(
      "https://example.com/article"
    );
    expect(linkImportModule?.isQuickCaptureUrlText("www.example.com/article")).toBe(true);

    const result = linkImportModule?.buildQuickCaptureBodyInputState({
      runtimeInput: {
        text: "旧正文",
        importedExcerpt: "旧摘要",
        importState: "loading",
        suspendInlineUrlAutoDetection: true
      },
      value: "已有判断  https://example.com/article\n\n",
      primaryPastedLink: null
    });

    expect(result?.typedSourceUrl).toBe("https://example.com/article");
    expect(result?.nextInput).toEqual(
      expect.objectContaining({
        text: "已有判断",
        sourceUrl: "https://example.com/article",
        importedExcerpt: undefined,
        importState: "loading",
        suspendInlineUrlAutoDetection: false
      })
    );
  });

  it("promotes the first typed url to sourceUrl even when media already exists", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();
    const result = linkImportModule?.buildQuickCaptureBodyInputState({
      runtimeInput: {
        text: "已有补充说明",
        hasMedia: true,
        sourceUrl: undefined,
        importState: "idle",
        suspendInlineUrlAutoDetection: false
      },
      value: "已有补充说明\n\nhttps://example.com/extra",
      primaryPastedLink: null
    });

    expect(result?.typedSourceUrl).toBe("https://example.com/extra");
    expect(result?.nextInput).toEqual(
      expect.objectContaining({
        text: "已有补充说明",
        hasMedia: true,
        sourceUrl: "https://example.com/extra"
      })
    );
    expect(result?.nextContentKind).toBe("media");
  });

  it("starts a new link import only when the request text changes", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();
    const nextInput = {
      text: "已有判断",
      sourceUrl: "https://example.com/article"
    };

    expect(
      linkImportModule?.shouldStartQuickCaptureLinkImport({
        nextInput,
        typedSourceUrl: "https://example.com/article",
        currentRequestState: null
      })
    ).toBe(true);

    expect(
      linkImportModule?.shouldStartQuickCaptureLinkImport({
        nextInput,
        typedSourceUrl: "https://example.com/article",
        currentRequestState: {
          requestId: 1,
          inputText: "https://example.com/article"
        }
      })
    ).toBe(false);

    expect(
      linkImportModule?.shouldStartQuickCaptureLinkImport({
        nextInput,
        typedSourceUrl: undefined,
        currentRequestState: null
      })
    ).toBe(false);
  });

  it("creates request state and matches only the latest request", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();
    const requestState = linkImportModule?.createQuickCaptureLinkImportRequestState({
      requestId: 2,
      inputText: "https://example.com/article",
      bodyPrefix: "已有判断",
      replaceBody: false
    });

    expect(requestState).toEqual({
      requestId: 2,
      inputText: "https://example.com/article",
      bodyPrefix: "已有判断",
      replaceBody: false
    });
    expect(linkImportModule?.isLatestQuickCaptureLinkImportRequest(requestState, 2, "https://example.com/article")).toBe(true);
    expect(linkImportModule?.isLatestQuickCaptureLinkImportRequest(requestState, 3, "https://example.com/article")).toBe(false);
    expect(linkImportModule?.isLatestQuickCaptureLinkImportRequest(requestState, 2, "https://example.com/other")).toBe(false);
  });

  it("appends imported content onto edited note text after a successful import", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();
    const result = linkImportModule?.resolveQuickCaptureLinkImportSuccess({
      runtimeInput: {
        text: "已有判断\n\n我自己的补充判断",
        importState: "loading"
      },
      imported: {
        title: "导入标题",
        body: "导入摘要",
        sourceUrl: "https://example.com/article",
        mediaCandidates: []
      },
      bodyPrefix: "已有判断",
      replaceBody: false
    });

    expect(result?.primaryPastedLink).toEqual({
      sourceUrl: "https://example.com/article",
      excerpt: "导入摘要"
    });
    expect(result?.nextInput).toEqual(
      expect.objectContaining({
        text: "已有判断\n\n我自己的补充判断\n\n导入摘要",
        title: "导入标题",
        sourceUrl: "https://example.com/article",
        importedExcerpt: "导入摘要",
        importState: "idle"
      })
    );
  });

  it("does not restore cleared note text after a successful import", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();
    const result = linkImportModule?.resolveQuickCaptureLinkImportSuccess({
      runtimeInput: {
        text: "",
        importState: "loading"
      },
      imported: {
        title: "导入标题",
        body: "导入摘要",
        sourceUrl: "https://example.com/article",
        mediaCandidates: []
      },
      bodyPrefix: "已有判断",
      replaceBody: false
    });

    expect(result?.nextInput).toEqual(
      expect.objectContaining({
        text: "",
        title: "导入标题",
        sourceUrl: "https://example.com/article",
        importedExcerpt: "导入摘要",
        importState: "idle"
      })
    );
  });

  it("clears link attachment state and suspends inline autodetect until the next edit", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();

    expect(
      linkImportModule?.clearQuickCaptureLinkAttachment({
        text: "导入摘要 https://docs.example.com/reference",
        sourceUrl: "https://example.com/article",
        importedExcerpt: "导入摘要",
        importState: "error",
        suspendInlineUrlAutoDetection: false
      })
    ).toEqual(
      expect.objectContaining({
        text: "导入摘要 https://docs.example.com/reference",
        sourceUrl: undefined,
        importedExcerpt: undefined,
        importState: "idle",
        suspendInlineUrlAutoDetection: true
      })
    );
  });

  it("appends a second pasted link as plain body text", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();

    expect(
      linkImportModule?.appendQuickCapturePastedLinkText(
        {
          text: "已有判断\n\n首条导入摘要",
          sourceUrl: "https://example.com/first",
          importedExcerpt: "首条导入摘要",
          importState: "loading"
        },
        "https://example.com/second"
      )
    ).toEqual(
      expect.objectContaining({
        text: "已有判断\n\n首条导入摘要\n\nhttps://example.com/second",
        sourceUrl: "https://example.com/first",
        importedExcerpt: "首条导入摘要",
        importState: "idle"
      })
    );
  });

  it("collects pasted image files and keeps the first-image helper stable", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();
    const pastedImage = new File(["image"], "pasted-shot.png", { type: "image/png" });
    const secondPastedImage = new File(["image-two"], "pasted-shot-2.jpg", { type: "image/jpeg" });
    const pastedImages = linkImportModule?.extractQuickCapturePastedImages([
      {
        kind: "string",
        type: "text/plain",
        getAsFile: () => null
      },
      {
        kind: "file",
        type: "image/png",
        getAsFile: () => pastedImage
      },
      {
        kind: "file",
        type: "image/jpeg",
        getAsFile: () => secondPastedImage
      }
    ]);

    expect(pastedImages).toEqual([pastedImage, secondPastedImage]);
    expect(
      linkImportModule?.extractQuickCapturePastedImage([
        {
          kind: "string",
          type: "text/plain",
          getAsFile: () => null
        },
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => pastedImage
        },
        {
          kind: "file",
          type: "image/jpeg",
          getAsFile: () => secondPastedImage
        }
      ])
    ).toBe(pastedImage);
  });

  it("maps import errors onto the current request source url", async () => {
    const linkImportModule = await loadQuickCaptureLinkImportModule();

    expect(
      linkImportModule?.resolveQuickCaptureLinkImportError({
        runtimeInput: {
          text: "已有判断",
          sourceUrl: "https://example.com/old",
          importedExcerpt: "保留摘要",
          importState: "loading"
        },
        requestSourceUrl: "https://example.com/new"
      })
    ).toEqual(
      expect.objectContaining({
        text: "已有判断",
        sourceUrl: "https://example.com/new",
        importedExcerpt: "保留摘要",
        importState: "error"
      })
    );
  });

  it("extracts og media candidates from imported html metadata", async () => {
    const { createLinkImportService } = await import("../../src/domain/link/link-import-service");
    const service = createLinkImportService(async () => ({
      status: 200,
      text: `
        <html>
          <head>
            <title>Article</title>
            <meta name="description" content="导入摘要" />
            <meta property="og:image" content="/cover.png" />
            <meta property="og:video" content="https://cdn.example.com/clip.mp4" />
          </head>
        </html>
      `
    }));

    await expect(service.importUrl("https://example.com/article")).resolves.toEqual({
      title: "Article",
      body: "导入摘要",
      sourceUrl: "https://example.com/article",
      mediaCandidates: [
        {
          url: "https://cdn.example.com/clip.mp4",
          mediaType: "video",
          fileName: "clip.mp4"
        },
        {
          url: "https://example.com/cover.png",
          mediaType: "image",
          fileName: "cover.png"
        }
      ]
    });
  });
});
