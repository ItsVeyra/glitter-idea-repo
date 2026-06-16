import type { PoolBrowseLabels } from "./pool-state";
import {
  createPoolButton,
  createPoolNode,
  setPoolClassToken
} from "./pool-dom";

type PoolMediaPreviewOverlayElement = HTMLElement & {
  __glitterPoolMediaPreviewCleanup?: () => void;
};

const POOL_MEDIA_PREVIEW_OPEN_CLASS = "glitter-pool-stage--media-preview-open";

export function createMediaPreviewButton(
  parent: HTMLElement,
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const button = createPoolNode(parent, "button", "glitter-pool-stage__card-media-hitbox") as HTMLButtonElement;
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

export function closePoolMediaPreviewOverlay(stage: HTMLElement): void {
  const overlay = stage.querySelector(".glitter-pool-stage__media-preview-overlay") as PoolMediaPreviewOverlayElement | null;
  if (!overlay) {
    setPoolClassToken(stage, POOL_MEDIA_PREVIEW_OPEN_CLASS, false);
    return;
  }
  overlay.__glitterPoolMediaPreviewCleanup?.();
  overlay.__glitterPoolMediaPreviewCleanup = undefined;
  overlay.remove();
  setPoolClassToken(stage, POOL_MEDIA_PREVIEW_OPEN_CLASS, false);
}

export function findClosestPoolStage(element: HTMLElement, fallback: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element;
  while (current) {
    const classTokens = current.className.split(/\s+/);
    if (classTokens.includes("glitter-pool-stage")) {
      return current;
    }
    current = current.parentElement ?? (current.parentNode as HTMLElement | null) ?? ((current as unknown as { parent?: HTMLElement | null }).parent ?? null);
  }

  return fallback;
}

export function openPoolMediaPreviewOverlay(
  stage: HTMLElement,
  input:
    | { src: string; title: string; kind: "video"; labels: PoolBrowseLabels }
    | { src: string; title: string; kind: "image"; imageSources?: string[]; initialIndex?: number; labels: PoolBrowseLabels }
): void {
  closePoolMediaPreviewOverlay(stage);

  const overlay = createPoolNode(stage, "div", "glitter-pool-stage__media-preview-overlay") as PoolMediaPreviewOverlayElement;
  setPoolClassToken(stage, POOL_MEDIA_PREVIEW_OPEN_CLASS, true);
  const previewCleanupCallbacks: Array<() => void> = [];
  overlay.__glitterPoolMediaPreviewCleanup = () => {
    while (previewCleanupCallbacks.length > 0) {
      previewCleanupCallbacks.pop()?.();
    }
  };
  const removeOverlay = (): void => {
    overlay.__glitterPoolMediaPreviewCleanup?.();
    overlay.__glitterPoolMediaPreviewCleanup = undefined;
    overlay.remove();
    setPoolClassToken(stage, POOL_MEDIA_PREVIEW_OPEN_CLASS, false);
  };
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      removeOverlay();
    }
  });

  const dialog = createPoolNode(overlay, "div", "glitter-pool-stage__media-preview-dialog");

  if (input.kind === "image") {
    const imageSources = input.imageSources?.length ? input.imageSources : [input.src];
    let currentImageIndex = Math.max(0, Math.min(input.initialIndex ?? 0, imageSources.length - 1));
    const previewViewport = createPoolNode(
      dialog,
      "div",
      `glitter-pool-stage__media-preview-viewport${imageSources.length > 1 ? " glitter-pool-stage__media-preview-viewport--gallery" : ""}`
    );
    const previewNavLayer = imageSources.length > 1
      ? createPoolNode(dialog, "div", "glitter-pool-stage__media-preview-nav-layer")
      : undefined;
    const previewStage = createPoolNode(
      previewViewport,
      "div",
      `glitter-pool-stage__media-preview-stage${imageSources.length > 1 ? " glitter-pool-stage__media-preview-stage--gallery" : ""}`
    );
    const previewFrame = createPoolNode(
      previewStage,
      "div",
      `glitter-pool-stage__media-preview-frame${imageSources.length > 1 ? " glitter-pool-stage__media-preview-frame--gallery" : ""}`
    );
    const previewImage = createPoolNode(previewFrame, "img", "glitter-pool-stage__media-preview-image") as HTMLImageElement;
    let pagination: HTMLElement | undefined;

    const syncPreviewBounds = (): void => {
      if (typeof previewStage.getBoundingClientRect !== "function") {
        return;
      }
      const stageRect = previewStage.getBoundingClientRect();
      const maxImageWidth = Math.max(0, Math.min(stageRect.width, 1180));
      const maxImageHeight = Math.max(0, stageRect.height);
      if (maxImageWidth > 0) {
        previewStage.style.setProperty("--glitter-pool-preview-image-max-width", `${maxImageWidth}px`);
      } else {
        previewStage.style.removeProperty("--glitter-pool-preview-image-max-width");
      }
      if (maxImageHeight > 0) {
        previewStage.style.setProperty("--glitter-pool-preview-image-max-height", `${maxImageHeight}px`);
      } else {
        previewStage.style.removeProperty("--glitter-pool-preview-image-max-height");
      }
    };
    const scheduleSyncPreviewBounds = (): void => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          syncPreviewBounds();
        });
        return;
      }
      syncPreviewBounds();
    };

    const syncPreviewImage = (): void => {
      const currentImageSrc = imageSources[currentImageIndex] ?? input.src;
      previewImage.setAttribute("src", currentImageSrc);
      previewImage.setAttribute(
        "alt",
        imageSources.length > 1
          ? input.labels.mediaPreviewImageAltWithPosition(
              input.title,
              input.labels.cardImagePositionLabel(currentImageIndex + 1, imageSources.length)
            )
          : input.labels.mediaPreviewImageAlt(input.title)
      );
      if (pagination) {
        pagination.textContent = `${currentImageIndex + 1} / ${imageSources.length}`;
      }
      syncPreviewBounds();
      scheduleSyncPreviewBounds();
    };

    previewImage.addEventListener("load", () => {
      scheduleSyncPreviewBounds();
    });

    if (typeof ResizeObserver === "function") {
      const previewResizeObserver = new ResizeObserver(() => {
        scheduleSyncPreviewBounds();
      });
      previewResizeObserver.observe(previewStage);
      previewCleanupCallbacks.push(() => {
        previewResizeObserver.disconnect();
      });
    } else if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      const handleWindowResize = (): void => {
        scheduleSyncPreviewBounds();
      };
      window.addEventListener("resize", handleWindowResize);
      previewCleanupCallbacks.push(() => {
        window.removeEventListener("resize", handleWindowResize);
      });
    }

    if (imageSources.length > 1) {
      const previousButton = createPoolButton(
        previewNavLayer ?? dialog,
        "glitter-pool-stage__media-preview-nav glitter-pool-stage__media-preview-nav--previous",
        "",
        () => {
          currentImageIndex = (currentImageIndex - 1 + imageSources.length) % imageSources.length;
          syncPreviewImage();
        }
      );
      previousButton.setAttribute("aria-label", input.labels.mediaPreviewPreviousImageLabel);
      createPoolNode(previousButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--chevron-left");

      const nextButton = createPoolButton(
        previewNavLayer ?? dialog,
        "glitter-pool-stage__media-preview-nav glitter-pool-stage__media-preview-nav--next",
        "",
        () => {
          currentImageIndex = (currentImageIndex + 1) % imageSources.length;
          syncPreviewImage();
        }
      );
      nextButton.setAttribute("aria-label", input.labels.mediaPreviewNextImageLabel);
      createPoolNode(nextButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--chevron-right");

      pagination = createPoolNode(previewViewport, "span", "glitter-pool-stage__media-preview-pagination", "");
    }

    syncPreviewImage();
  } else {
    const previewVideo = createPoolNode(dialog, "video", "glitter-pool-stage__media-preview-video") as HTMLVideoElement;
    previewVideo.setAttribute("src", input.src);
    previewVideo.setAttribute("controls", "");
    previewVideo.setAttribute("playsinline", "");
    previewVideo.setAttribute("preload", "metadata");
    previewVideo.setAttribute("aria-label", input.labels.mediaPreviewVideoLabel(input.title));
    previewVideo.controls = true;
    previewVideo.playsInline = true;
    previewVideo.preload = "metadata";
  }

  const closeButton = createPoolButton(dialog, "glitter-pool-stage__media-preview-close", "", () => {
    removeOverlay();
  });
  closeButton.setAttribute("aria-label", input.labels.mediaPreviewCloseLabel);
  createPoolNode(closeButton, "span", "glitter-write-stage__icon glitter-write-stage__icon--close");
}
