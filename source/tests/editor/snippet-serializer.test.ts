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
 * 保护灵感片段序列化输出与样式契约相关行为，避免后续重构时出现静默回退。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { serializeIdeaSnippet } from "../../src/editor/snippet-serializer";

// 直接载入真实样式文本，确保结构断言与当前界面契约保持一致。
const stylesCss = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

// 校验灵感片段序列化后的 Markdown 结构与样式引用约定。
describe("serializeIdeaSnippet", () => {
  it("serializes the reference-style glitter callout snippet", () => {
    const markdown = serializeIdeaSnippet({
      id: "idea-123",
      title: "Example",
      body: "Body",
      sourceUrl: "https://example.com",
      contentType: "text",
      attachmentPaths: ["Glitter/images/默认池/example.png"],
      tags: ["tagA", "tagB"],
      poolLabel: "默认池",
      emoji: "🔖"
    });

    expect(markdown).toContain("> [!glitter-idea] [\\[引用灵感\\] Example](glitter://idea/idea-123)");
    expect(markdown).toContain("> https://example.com");
    expect(markdown).toContain("> Body");
    expect(markdown).toContain("> ![[Glitter/images/默认池/example.png]]");
    expect(markdown).toContain("> #tagA #tagB");
    expect(markdown).toContain("> ✨ 来自 Glitter · 默认池");
    expect(markdown).not.toContain("<div class=\"glitter-idea-snippet\"");
  });

  it("escapes the callout title while preserving body copy", () => {
    const markdown = serializeIdeaSnippet({
      id: "idea-124",
      title: "Example [tag]",
      body: 'Body with <script> and "quotes"',
      contentType: "text",
      attachmentPaths: [],
      tags: [],
      poolLabel: "默认池",
      emoji: "💡"
    });

    expect(markdown).toContain("[\\[引用灵感\\] Example \\[tag\\]](glitter://idea/idea-124)");
    expect(markdown).toContain('Body with <script> and "quotes"');
  });

  it("keeps invalid snippet copy while styling the replaced footer line directly", () => {
    expect(stylesCss).not.toContain('.callout[data-callout="glitter-idea"][data-glitter-idea-state="invalid"] {\n  --callout-color: 214, 97, 97;\n  border-color: transparent;\n  background: transparent;\n  box-shadow: none;\n  cursor: default;\n}');
    expect(stylesCss).toContain('.callout[data-callout="glitter-idea"][data-glitter-idea-state="invalid"] .callout-title-inner::after');
    expect(stylesCss).toContain('content: "（已失效）";');
    expect(stylesCss).toContain('color: var(--text-error, #ff8f97);');
    expect(stylesCss).not.toContain('.callout[data-callout="glitter-idea"][data-glitter-idea-state="invalid"] .callout-content > * {\n  display: none;\n}');
    expect(stylesCss).not.toContain('.glitter-idea-snippet[data-glitter-idea-state="invalid"] .glitter-idea-snippet__body,\n.glitter-idea-snippet[data-glitter-idea-state="invalid"] .glitter-idea-snippet__source,\n.callout[data-callout="glitter-idea"][data-glitter-idea-state="invalid"] .callout-content > * {\n  display: none;\n}');
    expect(stylesCss).toContain('.callout[data-callout="glitter-idea"][data-glitter-idea-state="invalid"] .callout-content::before');
    expect(stylesCss).toContain('content: "原链接不可访问或已变更";');
    expect(stylesCss).toContain('.callout[data-callout="glitter-idea"][data-glitter-idea-state="invalid"] .callout-content > [data-glitter-invalid-source="true"]');
    expect(stylesCss).toContain('font-size: max(11px, calc(var(--font-text-size) - 2px));');
    expect(stylesCss).not.toContain('.callout[data-callout="glitter-idea"][data-glitter-idea-state="invalid"] .callout-content > p:last-child::before');
    expect(stylesCss).not.toContain('.callout[data-callout="glitter-idea"][data-glitter-idea-state="invalid"] .callout-content::after');
  });
});
