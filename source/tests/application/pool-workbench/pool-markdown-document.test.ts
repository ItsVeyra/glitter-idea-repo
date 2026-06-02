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

import { describe, expect, it } from "vitest";
import type { Idea } from "../../../src/domain/idea/idea-model";
import type { Pool } from "../../../src/domain/pool/pool-model";

async function loadPoolMarkdownDocumentModule() {
  return import("../../../src/application/pool-workbench/pool-markdown-document");
}

type PoolMarkdownDocumentIdea = Pick<
  Idea,
  "title" | "body" | "contentType" | "sourceUrl" | "attachmentPaths" | "createdAt" | "updatedAt"
>;

function formatExpectedIdeaTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

describe("buildPoolMarkdownDocument", () => {
  it("builds one combined markdown document with frontmatter, sections, metadata, and per-type content", async () => {
    const { buildPoolMarkdownDocument } = await loadPoolMarkdownDocumentModule();
    const pool: Pick<Pool, "name"> = {
      name: "研究池"
    };
    const ideas: PoolMarkdownDocumentIdea[] = [
      {
        title: "文本灵感",
        body: "第一行\n第二行",
        contentType: "text",
        sourceUrl: undefined,
        attachmentPaths: [],
        createdAt: "2026-04-10T08:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z"
      },
      {
        title: "链接灵感",
        body: "链接说明正文",
        contentType: "link",
        sourceUrl: "https://example.com/source",
        attachmentPaths: [],
        createdAt: "2026-04-11T08:00:00.000Z",
        updatedAt: "2026-04-11T09:00:00.000Z"
      },
      {
        title: "图片灵感",
        body: "图片说明",
        contentType: "image",
        sourceUrl: undefined,
        attachmentPaths: ["assets/cover.png", "assets/detail.png"],
        createdAt: "2026-04-12T08:00:00.000Z",
        updatedAt: "2026-04-12T09:00:00.000Z"
      },
      {
        title: "视频灵感",
        body: "",
        contentType: "video",
        sourceUrl: undefined,
        attachmentPaths: ["assets/demo.mp4", "assets/raw.mov"],
        createdAt: "2026-04-13T08:00:00.000Z",
        updatedAt: "2026-04-13T09:00:00.000Z"
      },
      {
        title: "混合灵感",
        body: "混合说明正文",
        contentType: "mixed",
        sourceUrl: "https://example.com/mixed",
        attachmentPaths: ["assets/mixed-cover.png", "assets/mixed-detail.png"],
        createdAt: "2026-04-14T08:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z"
      },
      {
        title: "空正文灵感",
        body: "   ",
        contentType: "text",
        sourceUrl: undefined,
        attachmentPaths: [],
        createdAt: "2026-04-15T08:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z"
      }
    ];

    expect(buildPoolMarkdownDocument({ pool, ideas })).toBe(
      [
        "---",
        "Glitter: \"研究池\"",
        "---",
        "",
        "# 研究池",
        "",
        "## 文本灵感",
        "",
        `创建时间：${formatExpectedIdeaTimestamp("2026-04-10T08:00:00.000Z")}`,
        `更新时间：${formatExpectedIdeaTimestamp("2026-04-10T09:00:00.000Z")}`,
        "",
        "第一行",
        "第二行",
        "",
        "## 链接灵感",
        "",
        `创建时间：${formatExpectedIdeaTimestamp("2026-04-11T08:00:00.000Z")}`,
        `更新时间：${formatExpectedIdeaTimestamp("2026-04-11T09:00:00.000Z")}`,
        "",
        "来源链接：https://example.com/source",
        "",
        "链接说明正文",
        "",
        "## 图片灵感",
        "",
        `创建时间：${formatExpectedIdeaTimestamp("2026-04-12T08:00:00.000Z")}`,
        `更新时间：${formatExpectedIdeaTimestamp("2026-04-12T09:00:00.000Z")}`,
        "",
        "![[assets/cover.png]]",
        "![[assets/detail.png]]",
        "",
        "图片说明",
        "",
        "## 视频灵感",
        "",
        `创建时间：${formatExpectedIdeaTimestamp("2026-04-13T08:00:00.000Z")}`,
        `更新时间：${formatExpectedIdeaTimestamp("2026-04-13T09:00:00.000Z")}`,
        "",
        "![[assets/demo.mp4]]",
        "![[assets/raw.mov]]",
        "",
        "## 混合灵感",
        "",
        `创建时间：${formatExpectedIdeaTimestamp("2026-04-14T08:00:00.000Z")}`,
        `更新时间：${formatExpectedIdeaTimestamp("2026-04-14T09:00:00.000Z")}`,
        "",
        "来源链接：https://example.com/mixed",
        "",
        "![[assets/mixed-cover.png]]",
        "![[assets/mixed-detail.png]]",
        "",
        "混合说明正文",
        "",
        "## 空正文灵感",
        "",
        `创建时间：${formatExpectedIdeaTimestamp("2026-04-15T08:00:00.000Z")}`,
        `更新时间：${formatExpectedIdeaTimestamp("2026-04-15T09:00:00.000Z")}`
      ].join("\n")
    );
  });

  it("preserves provided blank pool and idea titles without fallback names", async () => {
    const { buildPoolMarkdownDocument } = await loadPoolMarkdownDocumentModule();
    const pool: Pick<Pool, "name"> = {
      name: "   "
    };
    const ideas: PoolMarkdownDocumentIdea[] = [
      {
        title: "",
        body: "正文保留",
        contentType: "text",
        sourceUrl: undefined,
        attachmentPaths: [],
        createdAt: "2026-04-15T08:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z"
      }
    ];

    expect(buildPoolMarkdownDocument({ pool, ideas })).toBe(
      [
        "---",
        "Glitter: \"   \"",
        "---",
        "",
        "#    ",
        "",
        "## ",
        "",
        `创建时间：${formatExpectedIdeaTimestamp("2026-04-15T08:00:00.000Z")}`,
        `更新时间：${formatExpectedIdeaTimestamp("2026-04-15T09:00:00.000Z")}`,
        "",
        "正文保留"
      ].join("\n")
    );
  });

  it("renders mixed ideas with link and attachments even when body text is blank", async () => {
    const { buildPoolMarkdownDocument } = await loadPoolMarkdownDocumentModule();
    const pool: Pick<Pool, "name"> = {
      name: "混合池"
    };
    const ideas: PoolMarkdownDocumentIdea[] = [
      {
        title: "混合灵感",
        body: "   ",
        contentType: "mixed",
        sourceUrl: "https://example.com/mixed",
        attachmentPaths: ["assets/mixed.png", "assets/mixed-detail.png"],
        createdAt: "2026-04-16T08:00:00.000Z",
        updatedAt: "2026-04-16T09:00:00.000Z"
      }
    ];

    expect(buildPoolMarkdownDocument({ pool, ideas })).toBe(
      [
        "---",
        "Glitter: \"混合池\"",
        "---",
        "",
        "# 混合池",
        "",
        "## 混合灵感",
        "",
        `创建时间：${formatExpectedIdeaTimestamp("2026-04-16T08:00:00.000Z")}`,
        `更新时间：${formatExpectedIdeaTimestamp("2026-04-16T09:00:00.000Z")}`,
        "",
        "来源链接：https://example.com/mixed",
        "",
        "![[assets/mixed.png]]",
        "![[assets/mixed-detail.png]]"
      ].join("\n")
    );
  });

  it("quotes colon-containing pool names in frontmatter", async () => {
    const { buildPoolMarkdownDocument } = await loadPoolMarkdownDocumentModule();
    const pool: Pick<Pool, "name"> = {
      name: "主池: Alpha"
    };

    expect(buildPoolMarkdownDocument({ pool, ideas: [] })).toBe(
      ["---", "Glitter: \"主池: Alpha\"", "---", "", "# 主池: Alpha"].join("\n")
    );
  });

  it("replaces newlines in pool and idea headings while preserving frontmatter value", async () => {
    const { buildPoolMarkdownDocument } = await loadPoolMarkdownDocumentModule();
    const pool: Pick<Pool, "name"> = {
      name: "上层\n下层"
    };
    const ideas: PoolMarkdownDocumentIdea[] = [
      {
        title: "第一行\r\n第二行",
        body: "正文保留",
        contentType: "text",
        sourceUrl: undefined,
        attachmentPaths: [],
        createdAt: "2026-04-17T08:00:00.000Z",
        updatedAt: "2026-04-17T09:00:00.000Z"
      }
    ];

    expect(buildPoolMarkdownDocument({ pool, ideas })).toBe(
      [
        "---",
        "Glitter: \"上层\\n下层\"",
        "---",
        "",
        "# 上层 下层",
        "",
        "## 第一行 第二行",
        "",
        `创建时间：${formatExpectedIdeaTimestamp("2026-04-17T08:00:00.000Z")}`,
        `更新时间：${formatExpectedIdeaTimestamp("2026-04-17T09:00:00.000Z")}`,
        "",
        "正文保留"
      ].join("\n")
    );
  });

  it("returns a valid document for an empty pool", async () => {
    const { buildPoolMarkdownDocument } = await loadPoolMarkdownDocumentModule();
    const pool: Pick<Pool, "name"> = {
      name: "空池"
    };

    expect(buildPoolMarkdownDocument({ pool, ideas: [] })).toBe(["---", "Glitter: \"空池\"", "---", "", "# 空池"].join("\n"));
  });
});
