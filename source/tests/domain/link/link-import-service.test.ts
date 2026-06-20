/**
 * 保护链接导入服务的抓取、解析与清洗相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { createLinkImportService } from "../../../src/domain/link/link-import-service";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createLinkImportService", () => {
  it("uses requestUrl-style responses instead of browser fetch Response objects", async () => {
    const service = createLinkImportService(
      (async () => ({
        status: 200,
        text: `<html><head><title>RequestUrl Page</title><meta name="description" content="RequestUrl description"></head></html>`
      })) as any
    );

    const result = await service.importUrl("https://example.com/request-url");

    expect(result).toEqual({
      title: "RequestUrl Page",
      body: "RequestUrl description",
      sourceUrl: "https://example.com/request-url",
      mediaCandidates: []
    });
  });
  it("extracts title and description from HTML response", async () => {
    const service = createLinkImportService(
      (async () =>
        new Response(
          `<html><head><title>Example Page</title><meta name="description" content="Example description"></head></html>`,
          { status: 200 }
        )) as typeof fetch
    );

    const result = await service.importUrl("https://example.com");

    expect(result).toEqual({
      title: "Example Page",
      body: "Example description",
      sourceUrl: "https://example.com",
      mediaCandidates: []
    });
  });

  it("extracts every og image and video candidate from HTML metadata", async () => {
    const service = createLinkImportService(
      (async () =>
        new Response(
          `<html><head>
            <title>Example Page</title>
            <meta property="og:image" content="/cover-a.png">
            <meta property="og:image" content="https://cdn.example.com/cover-b.jpg">
            <meta name="twitter:image" content="/cover-c.webp">
            <meta property="og:video" content="https://cdn.example.com/clip-a.mp4">
            <meta property="og:video:url" content="/clip-b.webm">
          </head></html>`,
          { status: 200 }
        )) as typeof fetch
    );

    await expect(service.importUrl("https://example.com/article")).resolves.toEqual({
      title: "Example Page",
      body: "",
      sourceUrl: "https://example.com/article",
      mediaCandidates: [
        {
          url: "https://cdn.example.com/clip-a.mp4",
          mediaType: "video",
          fileName: "clip-a.mp4"
        },
        {
          url: "https://example.com/clip-b.webm",
          mediaType: "video",
          fileName: "clip-b.webm"
        },
        {
          url: "https://example.com/cover-a.png",
          mediaType: "image",
          fileName: "cover-a.png"
        },
        {
          url: "https://cdn.example.com/cover-b.jpg",
          mediaType: "image",
          fileName: "cover-b.jpg"
        },
        {
          url: "https://example.com/cover-c.webp",
          mediaType: "image",
          fileName: "cover-c.webp"
        }
      ]
    });
  });

  it("throws when the HTTP response is not ok", async () => {
    const service = createLinkImportService(
      (async () => new Response("not found", { status: 404 })) as typeof fetch
    );

    await expect(service.importUrl("https://example.com/missing")).rejects.toThrow(
      "404"
    );
  });

  it("falls back to parser default title behavior when metadata is missing", async () => {
    const service = createLinkImportService(
      (async () => new Response("<html><head></head><body>No metadata</body></html>", { status: 200 })) as typeof fetch
    );

    const result = await service.importUrl("https://example.com/no-metadata");

    expect(result).toEqual({
      title: "https://example.com/no-metadata",
      body: "",
      sourceUrl: "https://example.com/no-metadata",
      mediaCandidates: []
    });
  });
});
