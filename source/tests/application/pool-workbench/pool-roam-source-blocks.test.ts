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
import {
  buildPoolRoamCaptionMarkdown,
  buildPoolRoamImageTileLayout,
  buildPoolRoamSourceBlock,
  resolvePoolRoamSourceBlockKind
} from "../../../src/application/pool-workbench/pool-roam-source-blocks";

function buildSource(overrides: Record<string, unknown> = {}) {
  return {
    ideaId: "idea-1",
    title: "Source title",
    body: "Source body",
    contentType: "text",
    sourceUrl: undefined,
    attachments: [],
    attachmentPaths: [],
    ...overrides
  } as const;
}

describe("pool roam source blocks", () => {
  it("resolves mixed content with only image attachments as an image block", () => {
    const kind = resolvePoolRoamSourceBlockKind(
      buildSource({
        contentType: "mixed",
        sourceUrl: "https://example.com/mixed",
        attachments: [{ path: "assets/reference.png", mediaType: "image", width: 1600, height: 900 }]
      })
    );

    expect(kind).toBe("image");
  });

  it("resolves mixed content with any real video attachment as a video block", () => {
    const kind = resolvePoolRoamSourceBlockKind(
      buildSource({
        contentType: "mixed",
        attachments: [
          { path: "assets/poster.png", mediaType: "image", width: 1200, height: 675 },
          { path: "assets/demo.mp4", mediaType: "video" }
        ]
      })
    );

    expect(kind).toBe("video");
  });

  it.each(["assets/demo.ogv", "assets/demo.ogg"])("treats %s attachments as video media", (path) => {
    const kind = resolvePoolRoamSourceBlockKind(
      buildSource({
        contentType: "mixed",
        attachments: [{ path }]
      })
    );

    expect(kind).toBe("video");
  });

  it("preserves explicit video content even when auxiliary image attachments exist", () => {
    const kind = resolvePoolRoamSourceBlockKind(
      buildSource({
        contentType: "video",
        attachments: [
          { path: "assets/poster.png", mediaType: "image", width: 1200, height: 675 },
          { path: "assets/demo.mp4", mediaType: "video" }
        ]
      })
    );

    expect(kind).toBe("video");
  });

  it("builds glitter-source markdown for link ideas", () => {
    const markdown = buildPoolRoamCaptionMarkdown(
      buildSource({
        title: "Link idea",
        body: "链接说明正文",
        contentType: "link",
        sourceUrl: "https://example.com/source"
      })
    );

    expect(markdown).toBe(
      [
        "> [!glitter-source] Link idea",
        "> > https://example.com/source",
        ">",
        "> 链接说明正文"
      ].join("\n")
    );
  });

  it("embeds the first video attachment for video markdown", () => {
    const markdown = buildPoolRoamCaptionMarkdown(
      buildSource({
        title: "Video idea",
        body: "视频说明",
        contentType: "video",
        attachments: [
          { path: "assets/demo.mp4", mediaType: "video" },
          { path: "assets/raw.mov", mediaType: "video" }
        ]
      })
    );

    expect(markdown).toBe(
      [
        "![[assets/demo.mp4]]",
        "> [!glitter-source] Video idea",
        "> 视频说明"
      ].join("\n")
    );
  });

  it("keeps image tile aspect ratios close to their originals", () => {
    const images = [
      { path: "assets/cover.png", width: 1600, height: 900 },
      { path: "assets/portrait.png", width: 900, height: 1400 },
      { path: "assets/detail.png", width: 1200, height: 800 },
      { path: "assets/square.png", width: 1000, height: 1000 },
      { path: "assets/wide.png", width: 1800, height: 1000 }
    ];

    const layout = buildPoolRoamImageTileLayout({
      images,
      width: 720,
      gap: 12
    });

    expect(layout.tiles).toHaveLength(images.length);
    expect(layout.width).toBe(720);
    expect(Math.max(...layout.tiles.map((tile) => tile.x + tile.width))).toBeCloseTo(layout.width, 5);
    expect(Math.max(...layout.tiles.map((tile) => tile.y + tile.height))).toBeCloseTo(layout.height, 5);

    for (const [index, tile] of layout.tiles.entries()) {
      const originalRatio = images[index].width / images[index].height;
      const tileRatio = tile.width / tile.height;
      expect(tileRatio).toBeCloseTo(originalRatio, 5);
    }
  });

  it("builds one managed root for video and composite managed nodes for image blocks", () => {
    const videoBlock = buildPoolRoamSourceBlock({
      sourceBlockId: "source-block-video",
      source: buildSource({
        ideaId: "idea-video",
        title: "Video idea",
        body: "视频说明",
        contentType: "video",
        attachments: [{ path: "assets/demo.mp4", mediaType: "video" }]
      }),
      x: 24,
      y: 36,
      width: 420
    });

    expect(videoBlock.kind).toBe("video");
    expect((videoBlock as { sourceBlockId?: string }).sourceBlockId).toBe("source-block-video");
    expect(videoBlock.nodes).toHaveLength(1);
    expect(videoBlock.nodes[0]).toMatchObject({
      type: "text",
      glitterSourceBlock: {
        sourceBlockId: "source-block-video",
        role: "root",
        kind: "video",
        sourceId: "idea-video"
      }
    });
    expect((videoBlock.nodes[0] as { text: string }).text).toContain("![[assets/demo.mp4]]");

    const imageBlock = buildPoolRoamSourceBlock({
      sourceBlockId: "source-block-image",
      source: buildSource({
        ideaId: "idea-image",
        title: "Image idea",
        body: "图片说明",
        contentType: "image",
        attachments: [
          { path: "assets/cover.png", mediaType: "image", width: 1600, height: 900 },
          { path: "assets/detail.png", mediaType: "image", width: 900, height: 900 }
        ]
      }),
      x: 12,
      y: 18,
      width: 540
    });

    expect(imageBlock.kind).toBe("image");
    expect((imageBlock as { sourceBlockId?: string }).sourceBlockId).toBe("source-block-image");
    expect(imageBlock.nodes).toHaveLength(4);
    expect(imageBlock.nodes.map((node) => node.type)).toEqual(["group", "text", "file", "file"]);
    expect(imageBlock.nodes[0]).toMatchObject({
      glitterSourceBlock: {
        sourceBlockId: "source-block-image",
        role: "root",
        kind: "image",
        sourceId: "idea-image",
        connectorEnabled: true
      }
    });
    expect(imageBlock.nodes[1]).toMatchObject({
      glitterSourceBlock: {
        sourceBlockId: "source-block-image",
        role: "caption",
        kind: "image",
        sourceId: "idea-image",
        connectorEnabled: false
      }
    });
    expect(imageBlock.nodes.slice(2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          file: "assets/cover.png",
          glitterSourceBlock: expect.objectContaining({ role: "image", attachmentPath: "assets/cover.png", connectorEnabled: true })
        }),
        expect.objectContaining({
          type: "file",
          file: "assets/detail.png",
          glitterSourceBlock: expect.objectContaining({ role: "image", attachmentPath: "assets/detail.png", connectorEnabled: true })
        })
      ])
    );

    const captionNode = imageBlock.nodes[1] as { y: number; height: number };
    const firstImageNode = imageBlock.nodes[2] as { y: number };
    expect(firstImageNode.y - (captionNode.y + captionNode.height)).toBeGreaterThanOrEqual(18);
  });

  it("reserves media height for inline video blocks", () => {
    const textBlock = buildPoolRoamSourceBlock({
      sourceBlockId: "source-block-text",
      source: buildSource({
        ideaId: "idea-video-height",
        title: "Video height",
        body: "同样的文案",
        contentType: "text"
      }),
      x: 0,
      y: 0,
      width: 420
    });

    const videoBlock = buildPoolRoamSourceBlock({
      sourceBlockId: "source-block-video-height",
      source: buildSource({
        ideaId: "idea-video-height",
        title: "Video height",
        body: "同样的文案",
        contentType: "video",
        attachments: [{ path: "assets/demo.mp4", mediaType: "video", width: 1920, height: 1080 }]
      }),
      x: 0,
      y: 0,
      width: 420
    });

    expect((videoBlock.nodes[0].height ?? 0) - (textBlock.nodes[0].height ?? 0)).toBeGreaterThan(200);
  });

  it("preserves previous text block frames so users can keep manual boundaries", () => {
    const textBlock = buildPoolRoamSourceBlock({
      sourceBlockId: "source-block-text-frame",
      source: buildSource({
        ideaId: "idea-text-frame",
        title: "Text frame",
        body: "允许手动调整边界",
        contentType: "text"
      }),
      x: 24,
      y: 36,
      width: 420,
      previousNodes: [
        {
          id: "node-text-frame-existing",
          type: "text",
          x: 88,
          y: 112,
          width: 512,
          height: 260,
          text: "old",
          glitterSourceBlock: {
            sourceBlockId: "source-block-text-frame",
            nodeKey: "source-block-text-frame:root",
            sourceId: "idea-text-frame",
            kind: "text",
            role: "root"
          }
        }
      ]
    });

    expect(textBlock.nodes[0]).toMatchObject({
      id: "node-text-frame-existing",
      x: 88,
      y: 112,
      width: 512,
      height: 260
    });

    const imageBlock = buildPoolRoamSourceBlock({
      sourceBlockId: "source-block-image-frame",
      source: buildSource({
        ideaId: "idea-image-frame",
        title: "Image frame",
        body: "图片里的文字块也保留手动边界",
        contentType: "image",
        attachments: [{ path: "assets/cover.png", mediaType: "image", width: 1600, height: 900 }]
      }),
      x: 12,
      y: 18,
      width: 540,
      previousNodes: [
        {
          id: "node-root-frame-existing",
          type: "group",
          x: 40,
          y: 52,
          width: 620,
          height: 420,
          glitterSourceBlock: {
            sourceBlockId: "source-block-image-frame",
            nodeKey: "source-block-image-frame:root",
            sourceId: "idea-image-frame",
            kind: "image",
            role: "root"
          }
        },
        {
          id: "node-caption-frame-existing",
          type: "text",
          x: 76,
          y: 96,
          width: 420,
          height: 180,
          text: "old",
          glitterSourceBlock: {
            sourceBlockId: "source-block-image-frame",
            nodeKey: "source-block-image-frame:caption",
            sourceId: "idea-image-frame",
            kind: "image",
            role: "caption"
          }
        }
      ]
    });

    expect(imageBlock.nodes[0]).toMatchObject({
      id: "node-root-frame-existing",
      x: 40,
      y: 52,
      width: 620,
      height: 420
    });
    expect(imageBlock.nodes[1]).toMatchObject({
      id: "node-caption-frame-existing",
      x: 76,
      y: 96,
      width: 420,
      height: 180
    });
  });

  it("assigns distinct block identities when the same idea is attached twice", () => {
    const source = buildSource({
      ideaId: "idea-repeat",
      title: "Repeat idea",
      body: "同一灵感重复挂载",
      contentType: "image",
      attachments: [{ path: "assets/cover.png", mediaType: "image", width: 1600, height: 900 }]
    });

    const firstBlock = buildPoolRoamSourceBlock({
      source,
      x: 0,
      y: 0,
      width: 480,
      createNodeId: (nodeKey) => `generated:${nodeKey}`
    });
    const secondBlock = buildPoolRoamSourceBlock({
      source,
      x: 0,
      y: 0,
      width: 480,
      createNodeId: (nodeKey) => `generated:${nodeKey}`
    });

    const firstSourceBlockId = (firstBlock as { sourceBlockId?: string }).sourceBlockId;
    const secondSourceBlockId = (secondBlock as { sourceBlockId?: string }).sourceBlockId;
    const allNodes = [...firstBlock.nodes, ...secondBlock.nodes];
    const allNodeIds = allNodes.map((node) => node.id);
    const allNodeKeys = allNodes.map((node) => node.glitterSourceBlock.nodeKey);

    expect(firstSourceBlockId).toBeTruthy();
    expect(secondSourceBlockId).toBeTruthy();
    expect(firstSourceBlockId).not.toBe(secondSourceBlockId);
    expect(allNodes.every((node) => (node.glitterSourceBlock as { sourceBlockId?: string }).sourceBlockId === firstSourceBlockId)).toBe(false);
    expect(firstBlock.nodes.every((node) => (node.glitterSourceBlock as { sourceBlockId?: string }).sourceBlockId === firstSourceBlockId)).toBe(true);
    expect(secondBlock.nodes.every((node) => (node.glitterSourceBlock as { sourceBlockId?: string }).sourceBlockId === secondSourceBlockId)).toBe(true);
    expect(new Set(allNodeIds).size).toBe(allNodeIds.length);
    expect(new Set(allNodeKeys).size).toBe(allNodeKeys.length);
  });

  it("clips managed image blocks to the first seven image attachments", () => {
    const attachments = Array.from({ length: 8 }, (_, index) => ({
      path: `assets/image-${index + 1}.png`,
      mediaType: "image" as const,
      width: 1200,
      height: 900
    }));

    const block = buildPoolRoamSourceBlock({
      source: buildSource({
        ideaId: "idea-image-overflow",
        title: "Overflow images",
        body: "图片超过上限时截断",
        contentType: "image",
        attachments
      }),
      x: 0,
      y: 0,
      width: 540
    });

    const imageNodes = block.nodes.slice(2);

    expect(block.kind).toBe("image");
    expect(imageNodes).toHaveLength(7);
    expect(imageNodes.map((node) => (node as { file: string }).file)).toEqual(
      attachments.slice(0, 7).map((attachment) => attachment.path)
    );
  });

  it("reuses previous managed node ids when node keys match", () => {
    const block = buildPoolRoamSourceBlock({
      sourceBlockId: "source-block-reuse",
      source: buildSource({
        ideaId: "idea-reuse",
        title: "Reuse image",
        body: "保持稳定 id",
        contentType: "image",
        attachments: [{ path: "assets/cover.png", mediaType: "image", width: 1600, height: 900 }]
      }),
      x: 0,
      y: 0,
      width: 480,
      previousNodes: [
        {
          id: "node-root-existing",
          type: "group",
          x: 0,
          y: 0,
          width: 480,
          height: 320,
          glitterSourceBlock: {
            sourceBlockId: "source-block-reuse",
            nodeKey: "source-block-reuse:root",
            sourceId: "idea-reuse",
            kind: "image",
            role: "root"
          }
        },
        {
          id: "node-caption-existing",
          type: "text",
          x: 0,
          y: 0,
          width: 480,
          height: 120,
          text: "old",
          glitterSourceBlock: {
            sourceBlockId: "source-block-reuse",
            nodeKey: "source-block-reuse:caption",
            sourceId: "idea-reuse",
            kind: "image",
            role: "caption"
          }
        },
        {
          id: "node-image-existing",
          type: "file",
          x: 0,
          y: 0,
          width: 480,
          height: 200,
          file: "assets/cover.png",
          glitterSourceBlock: {
            sourceBlockId: "source-block-reuse",
            nodeKey: "source-block-reuse:image:assets/cover.png:0",
            sourceId: "idea-reuse",
            kind: "image",
            role: "image",
            attachmentPath: "assets/cover.png",
            attachmentIndex: 0
          }
        }
      ]
    });

    expect((block as { sourceBlockId?: string }).sourceBlockId).toBe("source-block-reuse");
    expect(block.nodes.map((node) => node.id)).toEqual([
      "node-root-existing",
      "node-caption-existing",
      "node-image-existing"
    ]);
  });

  it("assigns duplicate image attachments distinct stable node keys and ids", () => {
    const source = buildSource({
      ideaId: "idea-duplicates",
      title: "Duplicate images",
      body: "重复图片仍需独立节点",
      contentType: "image",
      attachments: [
        { path: "assets/cover.png", mediaType: "image", width: 1600, height: 900 },
        { path: "assets/cover.png", mediaType: "image", width: 1600, height: 900 }
      ]
    });

    const firstBuild = buildPoolRoamSourceBlock({
      sourceBlockId: "source-block-duplicates",
      source,
      x: 0,
      y: 0,
      width: 480,
      createNodeId: (nodeKey) => `generated:${nodeKey}`
    });

    const firstImageNodes = firstBuild.nodes.slice(2);
    const firstImageKeys = firstImageNodes.map((node) => node.glitterSourceBlock.nodeKey);
    const firstImageIds = firstImageNodes.map((node) => node.id);

    expect(new Set(firstImageKeys).size).toBe(2);
    expect(new Set(firstImageIds).size).toBe(2);

    const rebuilt = buildPoolRoamSourceBlock({
      sourceBlockId: (firstBuild as { sourceBlockId?: string }).sourceBlockId,
      source,
      x: 0,
      y: 0,
      width: 480,
      previousNodes: firstBuild.nodes,
      createNodeId: (nodeKey) => `replacement:${nodeKey}`
    });

    const rebuiltImageNodes = rebuilt.nodes.slice(2);
    expect((rebuilt as { sourceBlockId?: string }).sourceBlockId).toBe((firstBuild as { sourceBlockId?: string }).sourceBlockId);
    expect(rebuiltImageNodes.map((node) => node.glitterSourceBlock.nodeKey)).toEqual(firstImageKeys);
    expect(rebuiltImageNodes.map((node) => node.id)).toEqual(firstImageIds);
  });
});
