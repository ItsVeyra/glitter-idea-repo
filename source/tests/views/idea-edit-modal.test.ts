/**
 * 保护灵感编辑弹窗的渲染与样式约束相关行为，避免后续重构时出现静默回退。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 预先收口可重置的依赖替身，方便验证对外协作。
const { toastShowMock } = vi.hoisted(() => ({
  toastShowMock: vi.fn()
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/feedback/toast-service", () => ({
  createToastService: () => ({
    show: toastShowMock
  })
}));

// 直接载入真实样式文本，确保结构断言与当前界面契约保持一致。
const stylesCss = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
function expectDeclarationsInSelectorBlock(css: string, selector: string, declarations: string[]): void {
  const selectorPattern = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const blockPattern = new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\}`, "m");
  const blockMatch = css.match(blockPattern);
  expect(blockMatch, `Expected CSS block for selector ${selector}`).not.toBeNull();
  const blockBody = blockMatch?.[1] ?? "";
  declarations.forEach((declaration) => {
    expect(blockBody).toContain(declaration);
  });
}

// 构造最小宿主替身，承接渲染层与事件层断言。
class FakeElement {
  className = "";
  type = "";
  value = "";
  textContent = "";
  children: FakeElement[] = [];
  attributes: Record<string, string> = {};

  private readonly listeners = new Map<string, Array<(event?: unknown) => void | Promise<void>>>();

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  clear(): void {
    this.children = [];
    this.textContent = "";
  }

  empty(): void {
    this.clear();
  }

  addClass(cls: string): void {
    const classSet = new Set(this.className.split(/\s+/).filter(Boolean));
    classSet.add(cls);
    this.className = Array.from(classSet).join(" ");
  }

  removeClass(cls: string): void {
    const classSet = new Set(this.className.split(/\s+/).filter(Boolean));
    classSet.delete(cls);
    this.className = Array.from(classSet).join(" ");
  }

  setAttr(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttr(name: string): string | undefined {
    return this.attributes[name];
  }

  createEl(tag: string, options?: { cls?: string; text?: string; type?: string }): FakeElement {
    const node = new FakeElement();
    node.type = options?.type ?? tag;
    if (options?.cls) {
      node.className = options.cls;
    }
    if (options?.text !== undefined) {
      node.textContent = options.text;
    }
    this.appendChild(node);
    return node;
  }

  createDiv(options?: { cls?: string }): FakeElement {
    return this.createEl("div", options);
  }

  addEventListener(type: string, listener: (event?: unknown) => void | Promise<void>): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  async dispatch(type: string, event?: unknown): Promise<void> {
    const handlers = this.listeners.get(type) ?? [];
    for (const handler of handlers) {
      await handler(event);
    }
  }

  async click(): Promise<void> {
    await this.dispatch("click");
  }

  querySelector<T>(selector: string): T | null {
    return (this.querySelectorAll<T>(selector)[0] ?? null) as T | null;
  }

  querySelectorAll<T>(selector: string): T[] {
    if (!selector.startsWith(".")) {
      return [];
    }

    const cls = selector.slice(1);
    const matches: FakeElement[] = [];
    const visit = (node: FakeElement): void => {
      const classes = node.className.split(/\s+/).filter(Boolean);
      if (classes.includes(cls)) {
        matches.push(node);
      }
      node.children.forEach(visit);
    };

    this.children.forEach(visit);
    return matches as T[];
  }
}

vi.mock("obsidian", () => ({
  Modal: class {
    containerEl = { addClass() {}, removeClass() {} };
    modalEl = { addClass() {}, removeClass() {} };
    contentEl = { addClass() {}, removeClass() {}, empty() {} };

    constructor(public readonly app: unknown) {}

    open(): void {}

    close(): void {}
  }
}));

import { IdeaEditModal } from "../../src/views/idea-edit-modal";

// 覆盖视图宿主在生命周期、渲染与回调桥接上的核心契约。
describe("IdeaEditModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function attachModalHost(modal: IdeaEditModal) {
    const containerAddClass = vi.fn();
    const containerRemoveClass = vi.fn();
    const modalAddClass = vi.fn();
    const modalRemoveClass = vi.fn();

    const contentEl = new FakeElement() as FakeElement & {
      empty: () => void;
      addClass: (cls: string) => void;
      removeClass: (cls: string) => void;
    };
    const empty = vi.fn(function (this: FakeElement) {
      this.clear();
    });
    const contentAddClass = vi.fn(function (this: FakeElement, cls: string) {
      FakeElement.prototype.addClass.call(this, cls);
    });
    const contentRemoveClass = vi.fn(function (this: FakeElement, cls: string) {
      FakeElement.prototype.removeClass.call(this, cls);
    });

    contentEl.empty = empty.bind(contentEl);
    contentEl.addClass = contentAddClass.bind(contentEl);
    contentEl.removeClass = contentRemoveClass.bind(contentEl);

    (modal as any).containerEl = {
      addClass: containerAddClass,
      removeClass: containerRemoveClass
    };
    (modal as any).modalEl = { addClass: modalAddClass, removeClass: modalRemoveClass };
    (modal as any).contentEl = contentEl;

    return {
      contentEl,
      calls: {
        containerAddClass,
        containerRemoveClass,
        modalAddClass,
        modalRemoveClass,
        contentAddClass,
        contentRemoveClass,
        contentEmpty: empty
      }
    };
  }

  function flushMicrotasks(times = 2): Promise<void> {
    let chain = Promise.resolve();
    for (let index = 0; index < times; index += 1) {
      chain = chain.then(() => Promise.resolve());
    }
    return chain;
  }

  it("adds shell classes and renders expected modal structure", async () => {
    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(async () => ({ title: "Old title", body: "Old body" })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl, calls } = attachModalHost(modal);

    await modal.onOpen();

    expect(calls.containerAddClass).toHaveBeenCalledWith("GlitterIdea-edit-modal-host");
    expect(calls.modalAddClass).toHaveBeenCalledWith("GlitterIdea-edit-modal");
    expect(calls.contentAddClass).toHaveBeenCalledWith("GlitterIdea-edit-modal__content");

    expect(contentEl.querySelector(".GlitterIdea-edit-modal__surface")).not.toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__header")).not.toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__heading")).not.toBeNull();

    const closeButton = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__close");
    expect(closeButton).not.toBeNull();
    expect(closeButton?.className.split(/\s+/).filter(Boolean)).toContain("glitter-write-stage__close-button");
    expect(closeButton?.getAttr("aria-label")).toBe("关闭编辑窗口");
    expect(closeButton?.querySelector(".glitter-write-stage__icon--close")).not.toBeNull();

    expect(contentEl.querySelector(".GlitterIdea-edit-modal__fields")).not.toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__title")).not.toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__body")).not.toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__footer")).not.toBeNull();
    expect(contentEl.querySelectorAll(".GlitterIdea-edit-modal__button")).toHaveLength(2);
  });

  it("renders English labels for edit modal chrome and actions", async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn((file: { path: string }) => `app://${file.path}`)
        }
      },
      settings: {
        interfaceLanguage: "en"
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "image",
          attachmentPaths: ["existing/image-1.png", "existing/image-2.png"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      },
      appAdapter: {
        resolveResourcePath: (path: string) => `app://${path}`
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const heading = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__heading");
    const closeButton = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__close");
    const previousButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-nav-button--previous");
    const nextButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-nav-button--next");
    const addButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--add");
    const replaceButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--replace");
    const removeButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--remove");
    const footerButtons = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button");

    expect(heading?.textContent).toBe("Edit idea");
    expect(closeButton?.getAttr("aria-label")).toBe("Close edit window");
    expect(previousButton?.getAttr("aria-label")).toBe("Previous image");
    expect(nextButton?.getAttr("aria-label")).toBe("Next image");
    expect(addButton?.getAttr("aria-label")).toBe("Add image");
    expect(replaceButton?.getAttr("aria-label")).toBe("Replace current image");
    expect(removeButton?.getAttr("aria-label")).toBe("Remove current image");
    expect(footerButtons[0]?.textContent).toBe("Cancel");
    expect(footerButtons[1]?.textContent).toBe("Save");
  });

  it("renders link-edit content area with an editable inline source attachment", async () => {
    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "link",
          sourceUrl: "https://old.example.com",
          attachmentPaths: ["existing/image-old.png"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const bodyPanel = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__link-body-panel");
    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const linkAttachmentRow = contentEl.querySelector<FakeElement>(".glitter-write-stage__link-attachment-row");
    const linkAttachmentPrimary = contentEl.querySelector<FakeElement>(".glitter-write-stage__link-attachment-primary");
    const linkAttachmentRemove = contentEl.querySelector<FakeElement>(".glitter-write-stage__attachment-remove");
    const sourceInlineInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__source-inline-input");

    expect(contentEl.querySelector(".GlitterIdea-edit-modal__source-url")).toBeNull();
    expect(bodyPanel).not.toBeNull();
    expect(bodyPanel?.className).toContain("glitter-write-stage__body-panel--link");
    expect(bodyInput?.className.split(/\s+/).filter(Boolean)).toContain("glitter-write-stage__textarea--panel-blend");
    expect(linkAttachmentRow).not.toBeNull();
    expect(linkAttachmentPrimary).not.toBeNull();
    expect(sourceInlineInput?.value).toBe("https://old.example.com");
    expect(bodyPanel?.children[bodyPanel.children.length - 1]?.className).toContain("glitter-write-stage__link-attachment-row");
    expect(linkAttachmentRemove?.getAttr("aria-label")).toBe("移除已加载链接");
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__attachment-trigger")).toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__attachment-list")).not.toBeNull();
    expect(contentEl.querySelectorAll(".glitter-write-stage__link-attachment-row")).toHaveLength(2);
  });

  it("removes the inline source attachment when its close button is clicked", async () => {
    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "link",
          sourceUrl: "https://old.example.com",
          attachmentPaths: ["existing/image-old.png"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const bodyPanel = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__link-body-panel");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];
    const linkAttachmentRemove = contentEl.querySelector<FakeElement>(".glitter-write-stage__attachment-remove");

    expect(linkAttachmentRemove).not.toBeNull();
    expect(saveButton?.getAttr("data-dirty")).toBe("false");

    await linkAttachmentRemove!.click();

    expect(bodyPanel?.querySelector(".glitter-write-stage__link-attachment-row")).toBeNull();
    expect(contentEl.querySelectorAll(".glitter-write-stage__link-attachment-row")).toHaveLength(1);
    expect(saveButton?.getAttr("data-dirty")).toBe("true");
  });

  it("keeps an empty inline source input so link ideas without a saved url can still be edited", async () => {
    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "link",
          sourceUrl: "",
          attachmentPaths: ["existing/image-old.png"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const bodyPanel = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__link-body-panel");
    const sourceInlineInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__source-inline-input");
    const linkAttachmentRemove = contentEl.querySelector<FakeElement>(".glitter-write-stage__attachment-remove");

    expect(bodyPanel?.querySelector(".glitter-write-stage__link-attachment-row")).not.toBeNull();
    expect(sourceInlineInput?.value).toBe("");
    expect(linkAttachmentRemove?.getAttr("aria-label")).toBe("移除已加载链接");
    expect(bodyPanel?.children).toHaveLength(2);
    expect(contentEl.querySelectorAll(".glitter-write-stage__link-attachment-row")).toHaveLength(2);
  });

  it("renders image-edit content area with shared media surface overlay controls", async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn((file: { path: string }) => `app://vault/${file.path}`)
        }
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Image idea",
          body: "Old body",
          contentType: "image",
          attachmentPaths: ["existing/cover.png"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const mediaLayout = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__media-layout");
    const thumbnailSurface = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-surface");
    const previewTrigger = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-preview-trigger");
    const thumbnailImage = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-image");
    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const pageChip = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-page-chip");
    const addButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--add");
    const replaceButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--replace");
    const removeButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--remove");

    expect(mediaLayout).not.toBeNull();
    expect(thumbnailSurface).not.toBeNull();
    expect(thumbnailSurface?.className).toContain("glitter-write-stage__media-thumbnail-surface--action-icons-light");
    expect(previewTrigger).not.toBeNull();
    expect(thumbnailImage).not.toBeNull();
    expect(thumbnailImage?.getAttr("src")).toBe("app://vault/existing/cover.png");
    expect(bodyInput?.className.split(/\s+/).filter(Boolean)).toContain("glitter-write-stage__textarea--panel-blend");
    expect(pageChip?.textContent).toBe("1 / 1");
    expect(addButton?.getAttr("aria-label")).toBe("增加图片");
    expect(replaceButton?.getAttr("aria-label")).toBe("替换当前图片");
    expect(removeButton?.getAttr("aria-label")).toBe("删除当前图片");
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__media-path-trigger")).toBeNull();
    expect(contentEl.querySelector(".glitter-write-stage__media-path-primary")).toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__attachment-trigger")).toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__attachment-list")).toBeNull();
  });

  it("navigates and shrinks image galleries from the shared media surface", async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn((file: { path: string }) => `app://vault/${file.path}`)
        }
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Image gallery idea",
          body: "Old body",
          contentType: "image",
          attachmentPaths: ["existing/cover-1.png", "existing/cover-2.png", "existing/cover-3.png"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-gallery");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const previousButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-nav-button--previous");
    const nextButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-nav-button--next");

    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-page-chip")?.textContent).toBe("1 / 3");
    expect((previousButton as FakeElement & { disabled?: boolean } | null)?.disabled).toBe(true);
    expect((nextButton as FakeElement & { disabled?: boolean } | null)?.disabled).toBe(false);

    await nextButton!.click();

    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-page-chip")?.textContent).toBe("2 / 3");
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-image")?.getAttr("src")).toBe(
      "app://vault/existing/cover-2.png"
    );

    const removeButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--remove");
    expect(removeButton?.getAttr("aria-label")).toBe("删除当前图片");

    await removeButton!.click();

    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-page-chip")?.textContent).toBe("2 / 2");
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-image")?.getAttr("src")).toBe(
      "app://vault/existing/cover-3.png"
    );
    expect(
      (contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-nav-button--previous") as FakeElement & {
        disabled?: boolean;
      } | null)?.disabled
    ).toBe(false);
    expect(
      (contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-nav-button--next") as FakeElement & {
        disabled?: boolean;
      } | null)?.disabled
    ).toBe(true);
  });

  it("adds images to an existing gallery and saves ordered attachment paths", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const createFolder = vi.fn(async () => undefined);
    const createBinary = vi.fn(async () => undefined);
    const getAbstractFileByPath = vi.fn((path: string) => ({ path }));
    const getResourcePath = vi.fn((file: { path: string }) => `app://vault/${file.path}`);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath,
          getResourcePath,
          createFolder,
          createBinary
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Image gallery idea",
          body: "Old body",
          contentType: "image",
          attachmentPaths: ["existing/cover-1.png", "existing/cover-2.png"],
          poolId: "pool-default"
        })),
        updateIdea
      }
    };

    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};
    const appendChild = vi.fn(function (this: FakeElement, node: FakeElement) {
      return FakeElement.prototype.appendChild.call(this, node);
    });
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [
        {
          name: "cover-3.png",
          type: "image/png",
          arrayBuffer: async () => new ArrayBuffer(1)
        },
        {
          name: "cover-4.png",
          type: "image/png",
          arrayBuffer: async () => new ArrayBuffer(1)
        }
      ],
      addEventListener,
      click,
      remove: vi.fn()
    };
    const createElement = vi.fn(() => fileInput);
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockImplementation((source: Blob | MediaSource) => {
      return `blob:${"name" in source ? (source as { name?: string }).name ?? "preview" : "preview"}`;
    });

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-gallery", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");
    (modal as any).contentEl.ownerDocument = { createElement };
    (modal as any).contentEl.appendChild = appendChild;

    await modal.onOpen();

    const addButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--add");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    expect(addButton?.getAttr("aria-label")).toBe("增加图片");

    await addButton!.click();

    expect(fileInput.accept).toBe("image/*");
    expect(fileInput.multiple).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    changeListener?.();

    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-page-chip")?.textContent).toBe("3 / 4");
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-image")?.getAttr("src")).toBe(
      "blob:cover-3.png"
    );

    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-gallery", {
      title: "Image gallery idea",
      body: "Old body",
      sourceUrl: undefined,
      attachmentPaths: [
        "existing/cover-1.png",
        "existing/cover-2.png",
        "Glitter/images/默认池/cover-3.png",
        "Glitter/images/默认池/cover-4.png"
      ],
      markEdited: true
    });
    expect(createBinary).toHaveBeenCalledWith("Glitter/images/默认池/cover-3.png", expect.any(ArrayBuffer));
    expect(createBinary).toHaveBeenCalledWith("Glitter/images/默认池/cover-4.png", expect.any(ArrayBuffer));
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);

    createObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("appends pasted images into an image idea gallery and saves them in order", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const createFolder = vi.fn(async () => undefined);
    const createBinary = vi.fn(async () => undefined);
    const getAbstractFileByPath = vi.fn((path: string) => ({ path }));
    const getResourcePath = vi.fn((file: { path: string }) => `app://vault/${file.path}`);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath,
          getResourcePath,
          createFolder,
          createBinary
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Image gallery idea",
          body: "Old body",
          contentType: "image",
          attachmentPaths: ["existing/cover-1.png", "existing/cover-2.png"],
          poolId: "pool-default"
        })),
        updateIdea
      }
    };

    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockImplementation((source: Blob | MediaSource) => {
      return `blob:${"name" in source ? (source as { name?: string }).name ?? "preview" : "preview"}`;
    });

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-gallery", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];
    const preventDefault = vi.fn();
    const pastedImages = [
      {
        name: "cover-3.png",
        type: "image/png",
        arrayBuffer: async () => new ArrayBuffer(1)
      },
      {
        name: "cover-4.png",
        type: "image/png",
        arrayBuffer: async () => new ArrayBuffer(1)
      }
    ] as File[];

    await bodyInput!.dispatch("paste", {
      clipboardData: {
        items: pastedImages.map((file) => ({ kind: "file", type: file.type, getAsFile: () => file }))
      },
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-page-chip")?.textContent).toBe("3 / 4");
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-image")?.getAttr("src")).toBe(
      "blob:cover-3.png"
    );
    expect(saveButton?.getAttr("data-dirty")).toBe("true");

    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-gallery", {
      title: "Image gallery idea",
      body: "Old body",
      sourceUrl: undefined,
      attachmentPaths: [
        "existing/cover-1.png",
        "existing/cover-2.png",
        "Glitter/images/默认池/cover-3.png",
        "Glitter/images/默认池/cover-4.png"
      ],
      markEdited: true
    });
    expect(createBinary).toHaveBeenCalledWith("Glitter/images/默认池/cover-3.png", expect.any(ArrayBuffer));
    expect(createBinary).toHaveBeenCalledWith("Glitter/images/默认池/cover-4.png", expect.any(ArrayBuffer));
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);

    createObjectUrlSpy.mockRestore();
  });

  it("adds pasted images to a link idea attachment list and saves them", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const createFolder = vi.fn(async () => undefined);
    const createBinary = vi.fn(async () => undefined);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          createFolder,
          createBinary
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Link idea",
          body: "Old body",
          contentType: "link",
          sourceUrl: "https://old.example.com",
          attachmentPaths: ["existing/image-old.png"],
          poolId: "pool-default"
        })),
        updateIdea
      }
    };

    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockImplementation((source: Blob | MediaSource) => {
      return `blob:${"name" in source ? (source as { name?: string }).name ?? "preview" : "preview"}`;
    });

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-link", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];
    const preventDefault = vi.fn();
    const pastedImages = [
      {
        name: "image-1.png",
        type: "image/png",
        arrayBuffer: async () => new ArrayBuffer(1)
      },
      {
        name: "image-2.png",
        type: "image/png",
        arrayBuffer: async () => new ArrayBuffer(1)
      }
    ] as File[];

    expect(contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__attachment-item")).toHaveLength(1);

    await bodyInput!.dispatch("paste", {
      clipboardData: {
        items: pastedImages.map((file) => ({ kind: "file", type: file.type, getAsFile: () => file }))
      },
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__attachment-item")).toHaveLength(3);
    expect(saveButton?.getAttr("data-dirty")).toBe("true");

    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-link", {
      title: "Link idea",
      body: "Old body",
      sourceUrl: "https://old.example.com",
      attachmentPaths: [
        "existing/image-old.png",
        "Glitter/images/默认池/image-1.png",
        "Glitter/images/默认池/image-2.png"
      ],
      markEdited: true
    });
    expect(createBinary).toHaveBeenCalledWith("Glitter/images/默认池/image-1.png", expect.any(ArrayBuffer));
    expect(createBinary).toHaveBeenCalledWith("Glitter/images/默认池/image-2.png", expect.any(ArrayBuffer));
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);

    createObjectUrlSpy.mockRestore();
  });

  it("revokes overflow picked previews when gallery add exceeds the 7-image ceiling", async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn((file: { path: string }) => `app://vault/${file.path}`)
        }
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Image gallery idea",
          body: "Old body",
          contentType: "image",
          attachmentPaths: [
            "existing/cover-1.png",
            "existing/cover-2.png",
            "existing/cover-3.png",
            "existing/cover-4.png",
            "existing/cover-5.png",
            "existing/cover-6.png"
          ],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};
    const appendChild = vi.fn(function (this: FakeElement, node: FakeElement) {
      return FakeElement.prototype.appendChild.call(this, node);
    });
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [
        {
          name: "cover-7.png",
          type: "image/png",
          arrayBuffer: async () => new ArrayBuffer(1)
        },
        {
          name: "cover-overflow.png",
          type: "image/png",
          arrayBuffer: async () => new ArrayBuffer(1)
        }
      ],
      addEventListener,
      click,
      remove: vi.fn()
    };
    const createElement = vi.fn(() => fileInput);
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockImplementation((source: Blob | MediaSource) => {
      return `blob:${"name" in source ? (source as { name?: string }).name ?? "preview" : "preview"}`;
    });
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const modal = new IdeaEditModal(plugin as any, "idea-gallery");
    const { contentEl } = attachModalHost(modal);
    (modal as any).contentEl.ownerDocument = { createElement };
    (modal as any).contentEl.appendChild = appendChild;

    await modal.onOpen();

    const addButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--add");
    await addButton!.click();
    changeListener?.();

    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-page-chip")?.textContent).toBe("7 / 7");
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-image")?.getAttr("src")).toBe(
      "blob:cover-7.png"
    );
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:cover-overflow.png");

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("preserves extra existing video attachment paths when saving non-media edits", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn((file: { path: string }) => `app://vault/${file.path}`),
          createFolder: vi.fn(async () => undefined),
          createBinary: vi.fn(async () => undefined)
        }
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Video idea",
          body: "Old body",
          contentType: "video",
          attachmentPaths: ["existing/clip-1.mp4", "existing/clip-2.mp4"],
          poolId: "pool-default"
        })),
        updateIdea
      }
    };

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-video", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    bodyInput!.value = "New body";
    await bodyInput!.dispatch("input");
    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-video", {
      title: "Video idea",
      body: "New body",
      sourceUrl: undefined,
      attachmentPaths: ["existing/clip-1.mp4", "existing/clip-2.mp4"],
      markEdited: true
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("opens and closes the shared image preview overlay from the media surface", async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn((file: { path: string }) => `app://vault/${file.path}`)
        }
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Image idea",
          body: "Old body",
          contentType: "image",
          attachmentPaths: ["existing/cover.png"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const previewTrigger = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-preview-trigger");
    expect(previewTrigger).not.toBeNull();

    await previewTrigger!.click();
    expect(contentEl.querySelector(".glitter-write-stage__media-preview-overlay")).not.toBeNull();

    const previewClose = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-preview-close");
    expect(previewClose).not.toBeNull();

    await previewClose!.click();
    expect(contentEl.querySelector(".glitter-write-stage__media-preview-overlay")).toBeNull();
  });

  it("renders video-edit thumbnail with shared overlay actions and autoplay preview", async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn((file: { path: string }) => `app://vault/${file.path}`)
        }
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Video idea",
          body: "Old body",
          contentType: "video",
          attachmentPaths: ["existing/clip.mp4"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-video");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const thumbnailSurface = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-surface");
    const thumbnailVideo = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-video");
    const replaceButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--replace");
    const removeButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--remove");

    expect(thumbnailSurface).not.toBeNull();
    expect(thumbnailSurface?.className).toContain("glitter-write-stage__media-thumbnail-surface--action-icons-light");
    expect(thumbnailVideo).not.toBeNull();
    expect(thumbnailVideo?.getAttr("src")).toBe("app://vault/existing/clip.mp4");
    expect(thumbnailVideo?.getAttr("autoplay")).toBe("");
    expect(thumbnailVideo?.getAttr("loop")).toBe("");
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__media-play-button")).toBeNull();
    expect(contentEl.querySelector(".glitter-write-stage__media-surface-page-chip")).toBeNull();
    expect(contentEl.querySelector(".glitter-write-stage__media-surface-action--add")).toBeNull();
    expect(replaceButton?.getAttr("aria-label")).toBe("替换视频");
    expect(removeButton?.getAttr("aria-label")).toBe("删除视频");
  });

  it("keeps replace and remove controls when an existing media attachment has no preview url", async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn(() => undefined)
        }
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Image idea",
          body: "Old body",
          contentType: "image",
          attachmentPaths: ["existing/cover.png"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-previewless");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    expect(contentEl.querySelector(".glitter-write-stage__media-thumbnail-image")).toBeNull();
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--add")?.getAttr("aria-label")).toBe(
      "增加图片"
    );
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--replace")?.getAttr("aria-label")).toBe(
      "替换当前图片"
    );
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--remove")?.getAttr("aria-label")).toBe(
      "删除当前图片"
    );
  });

  it("ignores pasted images for non-image non-link ideas", async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn((file: { path: string }) => `app://vault/${file.path}`)
        }
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Video idea",
          body: "Old body",
          contentType: "video",
          attachmentPaths: ["existing/clip.mp4"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-video");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];
    const preventDefault = vi.fn();
    const pastedImage = {
      name: "cover.png",
      type: "image/png",
      arrayBuffer: async () => new ArrayBuffer(1)
    } as File;

    await bodyInput!.dispatch("paste", {
      clipboardData: {
        items: [{ kind: "file", type: pastedImage.type, getAsFile: () => pastedImage }]
      },
      preventDefault
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-video")?.getAttr("src")).toBe(
      "app://vault/existing/clip.mp4"
    );
    expect(saveButton?.getAttr("data-dirty")).toBe("false");
  });

  it("restricts video replacement picking to video files even if the picker returns a mismatched image", async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => ({ path })),
          getResourcePath: vi.fn((file: { path: string }) => `app://vault/${file.path}`)
        }
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Video idea",
          body: "Old body",
          contentType: "video",
          attachmentPaths: ["existing/clip.mp4"],
          poolId: "pool-default"
        })),
        updateIdea: vi.fn()
      }
    };

    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};
    const appendChild = vi.fn(function (this: FakeElement, node: FakeElement) {
      return FakeElement.prototype.appendChild.call(this, node);
    });
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [
        {
          name: "cover.png",
          type: "image/png",
          arrayBuffer: async () => new ArrayBuffer(1)
        }
      ],
      addEventListener,
      click,
      remove: vi.fn()
    };
    const createElement = vi.fn(() => fileInput);

    const modal = new IdeaEditModal(plugin as any, "idea-video");
    const { contentEl } = attachModalHost(modal);
    (modal as any).contentEl.ownerDocument = { createElement };
    (modal as any).contentEl.appendChild = appendChild;

    await modal.onOpen();

    const replaceButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--replace");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];
    expect(replaceButton).not.toBeNull();

    await replaceButton!.click();

    expect(createElement).toHaveBeenCalledWith("input");
    expect(fileInput.accept).toBe("video/*");
    expect(fileInput.multiple).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);

    changeListener?.();

    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-video")?.getAttr("src")).toBe(
      "app://vault/existing/clip.mp4"
    );
    expect(contentEl.querySelector(".glitter-write-stage__media-thumbnail-image")).toBeNull();
    expect(saveButton?.getAttr("data-dirty")).toBe("false");

    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("uses priority-safe title backgrounds that match the body surfaces", () => {
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal__close.glitter-write-stage__close-button,\n.GlitterIdea-edit-modal__close-button.glitter-write-stage__close-button", [
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 88%, transparent);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal .GlitterIdea-edit-modal__title", [
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 86%, transparent) !important;",
      "background-image: none !important;",
      "box-shadow: none !important;",
      "appearance: none;",
      "-webkit-appearance: none;"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".GlitterIdea-edit-modal .GlitterIdea-edit-modal__body:not(.glitter-write-stage__textarea--panel-blend)",
      [
        "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 86%, transparent) !important;",
        "background-image: none !important;",
        "box-shadow: none !important;",
        "appearance: none;",
        "-webkit-appearance: none;"
      ]
    );
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal .GlitterIdea-edit-modal__title--link", [
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 88%, transparent) !important;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal__link-body-panel", [
      "margin-top: 0;",
      "min-height: 180px;",
      "border: none;",
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 88%, transparent);",
      "box-shadow: none;"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".GlitterIdea-edit-modal__link-body-panel .GlitterIdea-edit-modal__body.glitter-write-stage__textarea--panel-blend",
      ["border: none;", "background: transparent;"]
    );
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal__link-body-panel:focus-within", [
      "outline: 1px solid color-mix(in srgb, var(--glitter-ui-border-strong) 64%, transparent);",
      "box-shadow: none;"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".GlitterIdea-edit-modal__link-body-panel .glitter-write-stage__link-attachment-row,\n.GlitterIdea-edit-modal__attachment-item",
      [
        "border-color: transparent;",
        "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 82%, transparent);",
        "box-shadow: none;"
      ]
    );
  });

  it("keeps title and body borders aligned and switches them to the theme accent on focus", () => {
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal__title,\n.GlitterIdea-edit-modal__body", [
      "border: 1px solid color-mix(in srgb, var(--glitter-ui-border) 76%, transparent);"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".GlitterIdea-edit-modal__title:focus,\n.GlitterIdea-edit-modal__title:focus-visible,\n.GlitterIdea-edit-modal__body:focus,\n.GlitterIdea-edit-modal__body:focus-visible",
      [
        "outline: none;",
        "border-color: var(--glitter-ui-accent);",
        "box-shadow: none !important;"
      ]
    );
  });

  it("reuses the shared frosted overlay button contract inside the media edit surface", () => {
    expectDeclarationsInSelectorBlock(stylesCss, ".glitter-write-stage__media-inputs-column", ["min-width: 0;"]);
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal__media-layout", [
      "min-height: 248px;",
      "grid-template-columns: minmax(176px, 38%) minmax(0, 1fr);",
      "gap: 14px;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal__title,\n.GlitterIdea-edit-modal__body", [
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 86%, transparent);"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-write-stage__media-surface-nav-button,\n.glitter-write-stage__media-surface-action",
      [
        "border-radius: 999px;",
        "border: 1px solid color-mix(in srgb, var(--glitter-ui-border-strong) 42%, white 16%);",
        "background: color-mix(in srgb, var(--glitter-ui-bg) 62%, transparent);",
        "pointer-events: auto;",
        "appearance: none;",
        "-webkit-appearance: none;",
        "cursor: pointer;",
        "-webkit-backdrop-filter: blur(18px) saturate(148%);",
        "backdrop-filter: blur(18px) saturate(148%);"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-write-stage button.glitter-write-stage__media-surface-action,\n.GlitterIdea-edit-modal button.glitter-write-stage__media-surface-action",
      [
        "position: relative;",
        "width: 30px;",
        "height: 30px;",
        "overflow: hidden;",
        "isolation: isolate;",
        "color: var(--glitter-media-surface-action-icon-color);"
      ]
    );
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".glitter-write-stage__media-surface-action .glitter-write-stage__icon",
      ["color: inherit;", "pointer-events: none;"]
    );
  });

  it("only changes save button visual state after meaningful edits", async () => {
    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(async () => ({ title: "Old title", body: "Old body" })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    expect(bodyInput).not.toBeNull();
    expect(saveButton?.getAttr("data-dirty")).toBe("false");

    bodyInput!.value = "Old body ";
    await bodyInput!.dispatch("input");
    expect(saveButton?.getAttr("data-dirty")).toBe("false");

    bodyInput!.value = "New body";
    await bodyInput!.dispatch("input");
    expect(saveButton?.getAttr("data-dirty")).toBe("true");

    bodyInput!.value = "Old body";
    await bodyInput!.dispatch("input");
    expect(saveButton?.getAttr("data-dirty")).toBe("false");
  });

  it("treats pre-existing leading and trailing whitespace as unchanged on open", async () => {
    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(async () => ({ title: " Old title ", body: " Old body " })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];
    expect(saveButton?.getAttr("data-dirty")).toBe("false");
  });

  it("treats clean saves as no-ops and only closes the modal", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const syncIdeaSourceInRoamBoards = vi.fn(async () => undefined);
    const process = vi.fn(async (_file: { path: string }, updater: (content: string) => string) => updater("Old body"));
    const refreshOpenMarkdownPreviews = vi.fn();
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((path: string) => (path === "Journal.md" ? { path } : null)),
          process
        }
      },
      poolWorkbenchWorkflow: {
        syncIdeaSourceInRoamBoards
      },
      refreshOpenMarkdownPreviews,
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "text",
          attachmentPaths: [],
          tags: [],
          poolId: "pool-default",
          snippetRefs: [{ notePath: "Journal.md", insertedAt: "2026-05-14T00:00:00.000Z" }]
        })),
        updateIdea
      }
    };

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-1", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];
    expect(saveButton?.getAttr("data-dirty")).toBe("false");

    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).not.toHaveBeenCalled();
    expect(syncIdeaSourceInRoamBoards).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
    expect(refreshOpenMarkdownPreviews).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("uses flat footer button states and only highlights save after edits", () => {
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal .GlitterIdea-edit-modal__button", [
      "appearance: none;",
      "background-image: none !important;",
      "box-shadow: none !important;"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal__button--save[data-dirty=\"false\"]", [
      "background: color-mix(in srgb, var(--glitter-ui-bg-alt) 82%, transparent);",
      "color: var(--glitter-ui-text);"
    ]);
    expectDeclarationsInSelectorBlock(stylesCss, ".GlitterIdea-edit-modal__button--save[data-dirty=\"true\"]", [
      "background: var(--glitter-ui-accent);",
      "color: var(--glitter-ui-accent-contrast);"
    ]);
    expectDeclarationsInSelectorBlock(
      stylesCss,
      ".GlitterIdea-edit-modal .GlitterIdea-edit-modal__button:focus-visible,\n.GlitterIdea-edit-modal .GlitterIdea-edit-modal__button:active",
      ["box-shadow: none !important;"]
    );
  });

  it("keeps footer actions ordered as cancel then save", async () => {
    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(async () => ({ title: "Old title", body: "Old body" })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);

    await modal.onOpen();

    const footer = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__footer");
    expect(footer).not.toBeNull();

    const footerButtons = footer!.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button");
    expect(footerButtons).toHaveLength(2);
    expect(footerButtons[0]?.textContent).toBe("取消");
    expect(footerButtons[1]?.textContent).toBe("保存");
  });

  it("closes when close button and cancel button are clicked", async () => {
    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(async () => ({ title: "Old title", body: "Old body" })),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const closeButton = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__close");
    const cancelButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[0];

    expect(closeButton).not.toBeNull();
    expect(cancelButton).toBeDefined();

    await closeButton!.click();
    await cancelButton.click();

    expect(closeSpy).toHaveBeenCalledTimes(2);
  });

  it("shows error toast and closes when getIdea throws", async () => {
    const getIdea = vi.fn(async () => {
      throw new Error("load failed");
    });

    const plugin = {
      app: {},
      ideaService: {
        getIdea,
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    expect(getIdea).toHaveBeenCalledWith("idea-1");
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Load idea failed. Please try again."
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("shows error toast and closes when getIdea returns null", async () => {
    const getIdea = vi.fn(async () => null);

    const plugin = {
      app: {},
      ideaService: {
        getIdea,
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    expect(getIdea).toHaveBeenCalledWith("idea-1");
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Load idea failed. Please try again."
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("shows error toast and keeps modal open when save fails", async () => {
    const updateIdea = vi.fn(async () => {
      throw new Error("save failed");
    });

    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(async () => ({ title: "Old title", body: "Old body" })),
        updateIdea
      }
    };

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-1", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const titleInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__title");
    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    expect(titleInput).not.toBeNull();
    expect(bodyInput).not.toBeNull();
    expect(saveButton).toBeDefined();

    titleInput!.value = " New title ";
    bodyInput!.value = " New body ";

    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-1", {
      title: "New title",
      body: "New body",
      markEdited: true
    });
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Save idea failed. Please try again."
    });
    expect(closeSpy).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("deletes newly written attachment files when metadata save fails", async () => {
    const updateIdea = vi.fn(async () => {
      throw new Error("save failed");
    });
    const folders = new Set<string>();
    const files = new Map<string, { path: string }>();
    const createFolder = vi.fn(async (path: string) => {
      folders.add(path);
    });
    const createBinary = vi.fn(async (path: string) => {
      files.set(path, { path });
    });
    const deleteFile = vi.fn(async (file: { path: string }, _force?: boolean) => {
      files.delete(file.path);
    });
    const getAbstractFileByPath = vi.fn((path: string) => {
      if (folders.has(path)) {
        return { children: [] };
      }
      return files.get(path) ?? null;
    });
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath,
          createFolder,
          createBinary,
          delete: deleteFile
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "image",
          attachmentPaths: [],
          poolId: "pool-default"
        })),
        updateIdea
      }
    };

    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};
    const appendChild = vi.fn(function (this: FakeElement, node: FakeElement) {
      return FakeElement.prototype.appendChild.call(this, node);
    });
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [
        {
          name: "cover.png",
          type: "image/png",
          arrayBuffer: async () => new ArrayBuffer(1)
        }
      ],
      addEventListener,
      click,
      remove: vi.fn()
    };
    const createElement = vi.fn(() => fileInput);
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image-preview");

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-1", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");
    (modal as any).contentEl.ownerDocument = { createElement };
    (modal as any).contentEl.appendChild = appendChild;

    await modal.onOpen();

    const addButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--add");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    expect(addButton).not.toBeNull();
    expect(saveButton).toBeDefined();

    await addButton!.click();
    expect(fileInput.accept).toBe("image/*");
    expect(fileInput.multiple).toBe(true);
    changeListener?.();
    await saveButton.click();
    await flushMicrotasks();

    expect(createBinary).toHaveBeenCalledWith("Glitter/images/默认池/cover.png", expect.any(ArrayBuffer));
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile.mock.calls[0]?.[0]).toMatchObject({ path: "Glitter/images/默认池/cover.png" });
    expect(deleteFile.mock.calls[0]?.[1]).toBe(true);
    expect(files.has("Glitter/images/默认池/cover.png")).toBe(false);
    expect(toastShowMock).toHaveBeenCalledWith({
      status: "error",
      message: "Save idea failed. Please try again."
    });
    expect(closeSpy).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();

    createObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("replaces the current media attachment when a new file is chosen from the overlay action", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const createFolder = vi.fn(async () => undefined);
    const createBinary = vi.fn(async () => undefined);
    const getAbstractFileByPath = vi.fn((path: string) => ({ path }));
    const getResourcePath = vi.fn((file: { path: string }) => `app://vault/${file.path}`);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath,
          getResourcePath,
          createFolder,
          createBinary
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Image idea",
          body: "Old body",
          contentType: "image",
          attachmentPaths: ["existing/cover.png"],
          poolId: "pool-default"
        })),
        updateIdea
      }
    };

    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};
    const appendChild = vi.fn(function (this: FakeElement, node: FakeElement) {
      return FakeElement.prototype.appendChild.call(this, node);
    });
    const remove = vi.fn();
    let changeListener: (() => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const click = vi.fn();
    const replacementFile = {
      name: "replacement.png",
      type: "image/png",
      arrayBuffer: async () => new ArrayBuffer(1)
    };
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [replacementFile],
      addEventListener,
      click,
      remove
    };
    const createElement = vi.fn(() => fileInput);
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:replacement-preview");

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-1", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");
    (modal as any).contentEl.ownerDocument = { createElement };
    (modal as any).contentEl.appendChild = appendChild;

    await modal.onOpen();

    const replaceButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--replace");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    expect(replaceButton).not.toBeNull();
    expect(saveButton).toBeDefined();

    await replaceButton!.click();
    expect(createElement).toHaveBeenCalledWith("input");
    expect(fileInput.accept).toBe("image/*");
    expect(fileInput.multiple).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);

    changeListener?.();

    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--replace")?.getAttr("aria-label")).toBe(
      "替换当前图片"
    );
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-thumbnail-image")?.getAttr("src")).toBe(
      "blob:replacement-preview"
    );

    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-1", {
      title: "Image idea",
      body: "Old body",
      sourceUrl: undefined,
      attachmentPaths: ["Glitter/images/默认池/replacement.png"],
      markEdited: true
    });
    expect(createBinary).toHaveBeenCalledWith("Glitter/images/默认池/replacement.png", expect.any(ArrayBuffer));
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);

    createObjectUrlSpy.mockRestore();
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("removes the current media attachment when the overlay delete action is used", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const getAbstractFileByPath = vi.fn((path: string) => ({ path }));
    const getResourcePath = vi.fn((file: { path: string }) => `app://vault/${file.path}`);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath,
          getResourcePath,
          createFolder: vi.fn(async () => undefined),
          createBinary: vi.fn(async () => undefined)
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Image idea",
          body: "Old body",
          contentType: "image",
          attachmentPaths: ["existing/cover.png"],
          poolId: "pool-default"
        })),
        updateIdea
      }
    };

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-1", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const removeButton = contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--remove");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    expect(removeButton).not.toBeNull();

    await removeButton!.click();

    expect(contentEl.querySelector(".glitter-write-stage__media-thumbnail-image")).toBeNull();
    expect(contentEl.querySelector(".glitter-write-stage__media-surface-action--replace")).toBeNull();
    expect(contentEl.querySelector<FakeElement>(".glitter-write-stage__media-surface-action--add")?.getAttr("aria-label")).toBe(
      "增加图片"
    );
    expect(saveButton?.getAttr("data-dirty")).toBe("true");

    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-1", {
      title: "Image idea",
      body: "Old body",
      sourceUrl: undefined,
      attachmentPaths: undefined,
      markEdited: true
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("trims title/body, saves the edited source url, and preserves attachments for link ideas", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((_path: string) => null),
          createFolder: vi.fn(async () => undefined),
          createBinary: vi.fn(async () => undefined)
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "link",
          sourceUrl: "https://old.example.com",
          attachmentPaths: ["existing/image-old.png"],
          poolId: "pool-default"
        })),
        updateIdea
      }
    };

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-1", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const titleInputs = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__title");
    const titleInput = titleInputs[0] ?? null;
    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const sourceInlineInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__source-inline-input");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    expect(titleInputs).toHaveLength(1);
    expect(titleInput).not.toBeNull();
    expect(bodyInput).not.toBeNull();
    expect(sourceInlineInput).not.toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__source-url")).toBeNull();
    expect(contentEl.querySelector(".GlitterIdea-edit-modal__attachment-trigger")).toBeNull();
    expect(saveButton).toBeDefined();

    titleInput!.value = " New title ";
    bodyInput!.value = " New body ";
    sourceInlineInput!.value = " www.new.example.com/article ";
    await sourceInlineInput!.dispatch("input");

    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-1", {
      title: "New title",
      body: "New body",
      sourceUrl: "www.new.example.com/article",
      attachmentPaths: ["existing/image-old.png"],
      markEdited: true
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("clears the saved source url after removing the inline source attachment", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((_path: string) => null),
          createFolder: vi.fn(async () => undefined),
          createBinary: vi.fn(async () => undefined)
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "link",
          sourceUrl: "https://old.example.com",
          attachmentPaths: ["existing/image-old.png"],
          poolId: "pool-default"
        })),
        updateIdea
      }
    };

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-1", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];
    const linkAttachmentRemove = contentEl.querySelector<FakeElement>(".glitter-write-stage__attachment-remove");

    await linkAttachmentRemove!.click();
    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-1", {
      title: "Old title",
      body: "Old body",
      sourceUrl: undefined,
      attachmentPaths: ["existing/image-old.png"],
      markEdited: true
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("syncs roam source blocks after metadata save completes", async () => {
    const updateIdea = vi.fn(async () => undefined);
    const syncIdeaSourceInRoamBoards = vi.fn(async () => undefined);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn((_path: string) => null),
          createFolder: vi.fn(async () => undefined),
          createBinary: vi.fn(async () => undefined)
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      settings: {
        mediaStorageDirectory: "Glitter"
      },
      poolWorkbenchWorkflow: {
        syncIdeaSourceInRoamBoards
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "text",
          attachmentPaths: [],
          tags: [],
          poolId: "pool-default",
          snippetRefs: []
        })),
        updateIdea
      }
    };

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-1", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const titleInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__title");
    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    titleInput!.value = "New title";
    bodyInput!.value = "New body";

    await saveButton.click();
    await flushMicrotasks();

    expect(updateIdea).toHaveBeenCalledWith("idea-1", {
      title: "New title",
      body: "New body",
      sourceUrl: undefined,
      attachmentPaths: undefined,
      markEdited: true
    });
    expect(syncIdeaSourceInRoamBoards).toHaveBeenCalledWith("idea-1");
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("refreshes referenced note snippets after saving an edited idea", async () => {
    const noteContents = new Map([
      [
        "Journal.md",
        `# Journal

> [!GlitterIdea] [\\[引用灵感\\] Old title](glitter://idea/idea-1)
> Old body
>
> ✨ 来自 Glitter · 默认池

> [!GlitterIdea] [\\[引用灵感\\] Keep title](glitter://idea/idea-2)
> Keep body
>
> ✨ 来自 Glitter · 默认池

> [!GlitterIdea] [\\[引用灵感\\] Old title](glitter://idea/idea-1)
> Old body
>
> ✨ 来自 Glitter · 默认池`
      ]
    ]);
    const updateIdea = vi.fn(async () => undefined);
    const process = vi.fn(async (file: { path: string }, updater: (content: string) => string) => {
      const current = noteContents.get(file.path) ?? "";
      noteContents.set(file.path, updater(current));
    });
    const getAbstractFileByPath = vi.fn((path: string) => (path === "Journal.md" ? { path } : null));
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath,
          process
        }
      },
      poolService: {
        getPool: vi.fn(async () => ({ name: "默认池" }))
      },
      ideaService: {
        getIdea: vi.fn(async () => ({
          title: "Old title",
          body: "Old body",
          contentType: "text",
          sourceType: "quick-capture",
          attachmentPaths: [],
          tags: [],
          poolId: "pool-default",
          snippetRefs: [
            { notePath: "Journal.md", insertedAt: "2026-05-14T00:00:00.000Z" },
            { notePath: "Journal.md", insertedAt: "2026-05-14T00:01:00.000Z" }
          ]
        })),
        updateIdea
      }
    };

    const onSaved = vi.fn();
    const modal = new IdeaEditModal(plugin as any, "idea-1", { onSaved });
    const { contentEl } = attachModalHost(modal);
    const closeSpy = vi.spyOn(modal as unknown as { close: () => void }, "close");

    await modal.onOpen();

    const titleInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__title");
    const bodyInput = contentEl.querySelector<FakeElement>(".GlitterIdea-edit-modal__body");
    const saveButton = contentEl.querySelectorAll<FakeElement>(".GlitterIdea-edit-modal__button")[1];

    titleInput!.value = "New title";
    bodyInput!.value = "New body";

    await saveButton.click();
    await flushMicrotasks();

    const rewritten = noteContents.get("Journal.md") ?? "";

    expect(updateIdea).toHaveBeenCalledWith("idea-1", {
      title: "New title",
      body: "New body",
      sourceUrl: undefined,
      attachmentPaths: undefined,
      markEdited: true
    });
    expect(getAbstractFileByPath).toHaveBeenCalledWith("Journal.md");
    expect(process).toHaveBeenCalledTimes(1);
    expect(rewritten).toContain("[\\[引用灵感\\] New title](glitter://idea/idea-1)");
    expect(rewritten).toContain("> New body");
    expect(rewritten).not.toContain("[\\[引用灵感\\] Old title](glitter://idea/idea-1)");
    expect(rewritten).not.toContain("> Old body");
    expect(rewritten).toContain("[\\[引用灵感\\] Keep title](glitter://idea/idea-2)");
    expect(rewritten).toContain("> Keep body");
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("removes shell classes and empties content on close", () => {
    const plugin = {
      app: {},
      ideaService: {
        getIdea: vi.fn(),
        updateIdea: vi.fn()
      }
    };

    const modal = new IdeaEditModal(plugin as any, "idea-1");
    const { calls } = attachModalHost(modal);

    modal.onClose();

    expect(calls.containerRemoveClass).toHaveBeenCalledWith("GlitterIdea-edit-modal-host");
    expect(calls.modalRemoveClass).toHaveBeenCalledWith("GlitterIdea-edit-modal");
    expect(calls.contentRemoveClass).toHaveBeenCalledWith("GlitterIdea-edit-modal__content");
    expect(calls.contentEmpty).toHaveBeenCalledTimes(1);
  });
});
