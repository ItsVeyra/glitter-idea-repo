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

import { describe, expect, it, vi } from "vitest";

const { markdownRenderMock } = vi.hoisted(() => ({
  markdownRenderMock: vi.fn()
}));

vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("obsidian")>();

  return {
    ...actual,
    MarkdownRenderer: {
      render: markdownRenderMock
    }
  };
});

import { Component } from "obsidian";
import type GlitterPlugin from "../../src/plugin/GlitterPlugin";
import {
  createPoolMarkdownPreviewRenderer,
  derivePoolMarkdownPreviewSourcePath,
  isPoolMarkdownPreviewAvailableForPoolId,
  resolvePoolMarkdownPreview,
  sanitizePoolMarkdownPreviewFileName,
  savePoolMarkdownPreviewFile
} from "../../src/views/pool-view-markdown-preview";

function createPreviewRendererHost(): Parameters<typeof createPoolMarkdownPreviewRenderer>[0] & {
  addedChildren: Component[];
  removedChildren: Component[];
} {
  const addedChildren: Component[] = [];
  const removedChildren: Component[] = [];

  return {
    addedChildren,
    removedChildren,
    addChild<T extends Component>(child: T): T {
      addedChildren.push(child);
      return child;
    },
    removeChild<T extends Component>(child: T): T {
      removedChildren.push(child);
      return child;
    }
  };
}

describe("pool-view-markdown-preview", () => {
  it("sanitizes exported markdown preview file names and source paths", () => {
    expect(sanitizePoolMarkdownPreviewFileName("\n  产品池 / 已存在导出\u0000  \n第二行")).toBe("产品池 - 已存在导出");
    expect(derivePoolMarkdownPreviewSourcePath("\n  产品池 / 已存在导出\u0000  \n第二行")).toBe(
      "Glitter/池导出/产品池 - 已存在导出.md"
    );
    expect(derivePoolMarkdownPreviewSourcePath("   ")).toBe("Glitter/池导出/untitled.md");
  });

  it("enables preview only for real pool ids and reuses cached previews only for the same pool", () => {
    const cachedPreview = {
      poolId: "pool-product",
      poolTitle: "产品池",
      markdown: "# 产品池"
    };
    const loadedPreview = {
      poolId: "pool-growth",
      poolTitle: "增长池",
      markdown: "# 增长池"
    };

    expect(isPoolMarkdownPreviewAvailableForPoolId("pool", "pool-product")).toBe(true);
    expect(isPoolMarkdownPreviewAvailableForPoolId("pool", undefined)).toBe(false);
    expect(isPoolMarkdownPreviewAvailableForPoolId("global-status", "pool-product")).toBe(false);

    expect(
      resolvePoolMarkdownPreview({
        preview: undefined,
        lastPreview: cachedPreview,
        previewOpen: true,
        previewAvailable: true,
        runtimePoolId: "pool-product"
      })
    ).toBe(cachedPreview);
    expect(
      resolvePoolMarkdownPreview({
        preview: undefined,
        lastPreview: cachedPreview,
        previewOpen: true,
        previewAvailable: true,
        runtimePoolId: "pool-growth"
      })
    ).toBeUndefined();
    expect(
      resolvePoolMarkdownPreview({
        preview: loadedPreview,
        lastPreview: cachedPreview,
        previewOpen: true,
        previewAvailable: true,
        runtimePoolId: "pool-growth"
      })
    ).toBe(loadedPreview);
  });

  it("toggles saving state, saves the markdown file once, and shows success feedback", async () => {
    let resolveSave: (() => void) | undefined;
    const savePoolMarkdownFileMock = vi.fn(
      () =>
        new Promise<{ filePath: string; poolTitle: string }>((resolve) => {
          resolveSave = () => {
            resolve({
              filePath: "Glitter/池导出/产品池.md",
              poolTitle: "产品池"
            });
          };
        })
    );
    const savingStates: boolean[] = [];
    const rerenderStates: boolean[] = [];
    const toastShowMock = vi.fn();

    const savePromise = savePoolMarkdownPreviewFile({
      previewSaving: false,
      previewAvailable: true,
      runtimePoolId: "pool-product",
      sort: "updated-desc",
      workflow: {
        savePoolMarkdownFile: savePoolMarkdownFileMock
      } as any,
      toastService: {
        show: toastShowMock
      },
      setPreviewSaving: (saving) => {
        savingStates.push(saving);
      },
      onSavingStateChange: (saving) => {
        rerenderStates.push(saving);
      }
    });

    expect(savingStates).toEqual([true]);
    expect(rerenderStates).toEqual([true]);
    expect(savePoolMarkdownFileMock).toHaveBeenCalledTimes(1);
    expect(savePoolMarkdownFileMock).toHaveBeenCalledWith({
      poolId: "pool-product",
      sort: "updated-desc"
    });

    resolveSave?.();
    await savePromise;

    expect(savingStates).toEqual([true, false]);
    expect(rerenderStates).toEqual([true, false]);
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "success",
      message: "Saved Markdown file."
    });
  });

  it("renders markdown and releases the preview component lifecycle cleanly", async () => {
    markdownRenderMock.mockReset();
    const previewMount = {
      empty: vi.fn()
    } as unknown as HTMLElement;
    const contentEl = {
      querySelector: vi.fn((selector: string) => {
        if (selector === ".glitter-pool-stage__pool-markdown-preview-content") {
          return previewMount;
        }
        return null;
      })
    } as unknown as HTMLElement;
    const host = createPreviewRendererHost();
    const renderer = createPoolMarkdownPreviewRenderer(host);
    const app = {} as GlitterPlugin["app"];

    await renderer.render({
      app,
      contentEl,
      preview: {
        poolId: "pool-product",
        poolTitle: "产品池 / 已存在导出",
        markdown: "# 产品池"
      },
      shouldSkip: () => false,
      onRenderError: vi.fn()
    });

    expect(previewMount.empty).toHaveBeenCalledTimes(1);
    expect(markdownRenderMock).toHaveBeenCalledWith(
      app,
      "# 产品池",
      previewMount,
      "Glitter/池导出/产品池 - 已存在导出.md",
      expect.any(Component)
    );

    const renderComponent = markdownRenderMock.mock.calls[0]?.[4] as Component;
    const renderComponentUnloadSpy = vi.spyOn(renderComponent, "unload");
    expect(host.addedChildren).toEqual([renderComponent]);
    expect(host.removedChildren).toEqual([]);

    renderer.release();

    expect(renderComponentUnloadSpy).toHaveBeenCalledTimes(1);
    expect(host.removedChildren).toEqual([renderComponent]);
  });
});
