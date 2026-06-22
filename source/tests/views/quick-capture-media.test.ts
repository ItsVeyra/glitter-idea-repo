/**
 * 保护快速捕获媒体辅助函数的路径与预览行为，避免重构时回退。
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  normalizePath: (value: string) => value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "")
}));

async function loadQuickCaptureMediaModule(): Promise<any> {
  try {
    return await import("../../src/views/quick-capture-media");
  } catch {
    return null;
  }
}

describe("quick-capture-media", () => {
  it("sanitizes invalid file-name characters for vault-safe media paths", async () => {
    const mediaModule = await loadQuickCaptureMediaModule();

    expect(mediaModule?.sanitizeQuickCaptureMediaFileName('  shot:/\\*?"<>|.png  ')).toBe("shot---------.png");
  });

  it("sanitizes pool folder names and falls back when only dots remain", async () => {
    const mediaModule = await loadQuickCaptureMediaModule();

    expect(mediaModule?.sanitizeQuickCaptureMediaFolderName('  研发/池:*?\u0001  ')).toBe("研发-池---");
    expect(mediaModule?.sanitizeQuickCaptureMediaFolderName("...")).toBe("未命名池");
  });

  it("creates and releases preview urls only for image and video attachments", async () => {
    const mediaModule = await loadQuickCaptureMediaModule();
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:image-preview")
      .mockReturnValueOnce("blob:video-preview");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const imageMedia = mediaModule?.createSelectedCaptureMedia(new File(["image"], "cover.png", { type: "image/png" }));
    const videoMedia = mediaModule?.createSelectedCaptureMedia(new File(["video"], "clip.mp4", { type: "video/mp4" }));
    const textMedia = mediaModule?.createSelectedCaptureMedia(new File(["text"], "notes.txt", { type: "text/plain" }));

    expect(imageMedia).toEqual(
      expect.objectContaining({
        previewUrl: "blob:image-preview",
        previewKind: "image"
      })
    );
    expect(videoMedia).toEqual(
      expect.objectContaining({
        previewUrl: "blob:video-preview",
        previewKind: "video"
      })
    );
    expect(textMedia?.previewUrl).toBeUndefined();
    expect(textMedia?.previewKind).toBeUndefined();

    mediaModule?.releaseSelectedCaptureMediaPreviews([imageMedia, videoMedia, textMedia]);

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:image-preview");
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:video-preview");
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(2);

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("picks only image and video files from the attachment picker", async () => {
    const mediaModule = await loadQuickCaptureMediaModule();
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};
    let changeListener: (() => void) | undefined;
    const imageFile = new File(["image"], "cover.png", { type: "image/png" });
    const videoFile = new File(["video"], "clip.mp4", { type: "video/mp4" });
    const textFile = new File(["text"], "notes.txt", { type: "text/plain" });
    const remove = vi.fn();
    const click = vi.fn();
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === "change") {
        changeListener = listener;
      }
    });
    const fileInput = {
      type: "",
      accept: "",
      multiple: false,
      style: { display: "" },
      files: [imageFile, textFile, videoFile],
      addEventListener,
      click,
      remove
    };
    const createElement = vi.fn(() => fileInput);
    const appendChild = vi.fn((node) => node);
    const contentEl = {
      ownerDocument: { createElement },
      appendChild
    } as unknown as HTMLElement;

    const pickedFilesPromise = mediaModule?.pickQuickCaptureAttachmentFiles(contentEl);
    changeListener?.();
    const pickedFiles = await pickedFilesPromise;

    expect(createElement).toHaveBeenCalledWith("input");
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(pickedFiles).toEqual([imageFile, videoFile]);

    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("generates a unique media path by incrementing the file name within the target folder", async () => {
    const mediaModule = await loadQuickCaptureMediaModule();
    const existingPaths = new Set([
      "Glitter/images/研发池/shot.png",
      "Glitter/images/研发池/shot-1.png"
    ]);
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => (existingPaths.has(path) ? { path } : null)),
      createFolder: vi.fn(async () => undefined),
      createBinary: vi.fn(async () => undefined)
    };

    await expect(
      mediaModule?.createQuickCaptureUniqueMediaPath(vault, "Glitter/images/研发池", "shot.png")
    ).resolves.toBe("Glitter/images/研发池/shot-2.png");
  });

  it("saves selected media into Glitter/images/<pool> and deduplicates names within the folder", async () => {
    const mediaModule = await loadQuickCaptureMediaModule();
    const folders = new Set<string>();
    const files = new Set<string>();
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => {
        if (folders.has(path)) {
          return { children: [] };
        }
        return files.has(path) ? { path } : null;
      }),
      createFolder: vi.fn(async (path: string) => {
        folders.add(path);
      }),
      createBinary: vi.fn(async (path: string) => {
        files.add(path);
      })
    };

    await expect(
      mediaModule?.saveQuickCaptureSelectedMediaFiles({
        selectedMedia: [
          { file: new File(["image-one"], "shot.png", { type: "image/png" }) },
          { file: new File(["image-two"], "shot.png", { type: "image/png" }) }
        ],
        mediaStorageDirectory: " Glitter ",
        selectedPoolLabel: "研发/池:*?",
        vault
      })
    ).resolves.toEqual([
      "Glitter/images/研发-池---/shot.png",
      "Glitter/images/研发-池---/shot-1.png"
    ]);

    expect(vault.createFolder).toHaveBeenCalledWith("Glitter");
    expect(vault.createFolder).toHaveBeenCalledWith("Glitter/images");
    expect(vault.createFolder).toHaveBeenCalledWith("Glitter/images/研发-池---");
    expect(vault.createBinary).toHaveBeenNthCalledWith(
      1,
      "Glitter/images/研发-池---/shot.png",
      expect.any(ArrayBuffer)
    );
    expect(vault.createBinary).toHaveBeenNthCalledWith(
      2,
      "Glitter/images/研发-池---/shot-1.png",
      expect.any(ArrayBuffer)
    );
  });

  it("downloads imported remote media into a File", async () => {
    const mediaModule = await loadQuickCaptureMediaModule();
    const fetched = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => new TextEncoder().encode("png-binary").buffer
    }));

    const file = await mediaModule?.downloadQuickCaptureImportedMedia(
      {
        url: "https://cdn.example.com/cover.png",
        mediaType: "image",
        fileName: "cover.png"
      },
      fetched
    );

    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("cover.png");
    expect(file?.type).toBe("image/png");
  });

  it("falls back to the candidate video type when the remote content type is generic", async () => {
    const mediaModule = await loadQuickCaptureMediaModule();
    const fetched = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/octet-stream" }),
      arrayBuffer: async () => new TextEncoder().encode("video-binary").buffer
    }));

    const file = await mediaModule?.downloadQuickCaptureImportedMedia(
      {
        url: "https://cdn.example.com/clip",
        mediaType: "video",
        fileName: "clip.mp4"
      },
      fetched
    );

    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("clip.mp4");
    expect(file?.type).toBe("video/mp4");
  });

  it("prefers imported video files over imported images when a link includes video candidates", async () => {
    const mediaModule = await loadQuickCaptureMediaModule();
    const fetched = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": url.endsWith(".mp4") ? "video/mp4" : "image/png"
      }),
      arrayBuffer: async () => new TextEncoder().encode(url).buffer
    }));

    const selectedMedia = await mediaModule?.createSelectedCaptureMediaFromImportedCandidates(
      [
        {
          url: "https://cdn.example.com/clip.mp4",
          mediaType: "video",
          fileName: "clip.mp4"
        },
        {
          url: "https://cdn.example.com/cover.png",
          mediaType: "image",
          fileName: "cover.png"
        }
      ],
      fetched
    );

    expect(selectedMedia).toHaveLength(1);
    expect(selectedMedia?.[0]?.file.name).toBe("clip.mp4");
    expect(selectedMedia?.[0]?.file.type).toBe("video/mp4");
    expect(selectedMedia?.[0]?.previewKind).toBe("video");
  });
});
