import { Component, MarkdownRenderer } from "obsidian";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import type { PoolViewScope, PoolViewSort } from "./pool-view-history";

type PoolMarkdownPreviewData = Awaited<ReturnType<GlitterPlugin["poolWorkbenchWorkflow"]["loadPoolMarkdownPreview"]>>;
type PoolWorkbenchWorkflow = GlitterPlugin["poolWorkbenchWorkflow"];

type PoolMarkdownPreviewToastService = {
  show: (toast: { status: "success" | "error"; message: string }) => void;
};

type ResolvePoolMarkdownPreviewOptions = {
  preview?: PoolMarkdownPreviewData;
  lastPreview?: PoolMarkdownPreviewData;
  previewOpen: boolean;
  previewAvailable: boolean;
  runtimePoolId: string;
};

type PoolMarkdownPreviewRendererHost = Pick<Component, "addChild" | "removeChild">;

type PoolMarkdownPreviewRendererRenderOptions = {
  app: GlitterPlugin["app"];
  contentEl: HTMLElement | null | undefined;
  preview: PoolMarkdownPreviewData;
  shouldSkip?: () => boolean;
  onRenderError: () => void;
};

type SavePoolMarkdownPreviewFileOptions = {
  previewSaving: boolean;
  previewAvailable: boolean;
  runtimePoolId: string | undefined;
  sort: PoolViewSort;
  workflow: Pick<PoolWorkbenchWorkflow, "savePoolMarkdownFile">;
  toastService: PoolMarkdownPreviewToastService;
  setPreviewSaving: (saving: boolean) => void;
  onSavingStateChange: (saving: boolean) => void;
};

export function sanitizePoolMarkdownPreviewFileName(value: string): string {
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").replace(/[\\/:*?"<>|]/g, "-").trim() || "untitled";
}

export function derivePoolMarkdownPreviewSourcePath(poolTitle: string): string {
  return `Glitter/池导出/${sanitizePoolMarkdownPreviewFileName(poolTitle)}.md`;
}

export function isPoolMarkdownPreviewAvailableForPoolId(scope: PoolViewScope, poolId: string | undefined): boolean {
  return scope === "pool" && Boolean(poolId);
}

export function resolvePoolMarkdownPreview({
  preview,
  lastPreview,
  previewOpen,
  previewAvailable,
  runtimePoolId
}: ResolvePoolMarkdownPreviewOptions): PoolMarkdownPreviewData | undefined {
  if (preview) {
    return preview;
  }

  if (!previewOpen || !previewAvailable) {
    return undefined;
  }

  if (lastPreview?.poolId === runtimePoolId) {
    return lastPreview;
  }

  return undefined;
}

export function createPoolMarkdownPreviewRenderer(host: PoolMarkdownPreviewRendererHost) {
  let renderComponent: Component | undefined;

  const release = (): void => {
    if (!renderComponent) {
      return;
    }

    const activeRenderComponent = renderComponent;
    renderComponent = undefined;
    activeRenderComponent.unload();
    host.removeChild(activeRenderComponent);
  };

  const createRenderComponent = (): Component => {
    release();
    const nextRenderComponent = new Component();
    host.addChild(nextRenderComponent);
    renderComponent = nextRenderComponent;
    return nextRenderComponent;
  };

  return {
    release,
    async render({
      app,
      contentEl,
      preview,
      shouldSkip = () => false,
      onRenderError
    }: PoolMarkdownPreviewRendererRenderOptions): Promise<void> {
      const previewMount = contentEl?.querySelector?.(
        ".glitter-pool-stage__pool-markdown-preview-content"
      ) as HTMLElement | null;
      if (!previewMount) {
        release();
        return;
      }

      const nextRenderComponent = createRenderComponent();
      const previewMountWithEmpty = previewMount as HTMLElement & { empty?: () => void; innerHTML?: string };
      if (typeof previewMountWithEmpty.empty === "function") {
        previewMountWithEmpty.empty();
      } else if (typeof previewMountWithEmpty.innerHTML === "string") {
        previewMountWithEmpty.innerHTML = "";
      }

      try {
        await MarkdownRenderer.render(
          app,
          preview.markdown,
          previewMount,
          derivePoolMarkdownPreviewSourcePath(preview.poolTitle),
          nextRenderComponent as unknown as Parameters<typeof MarkdownRenderer.render>[4]
        );
      } catch (_error) {
        if (shouldSkip() || renderComponent !== nextRenderComponent) {
          return;
        }

        release();
        onRenderError();
      }
    }
  };
}

export async function savePoolMarkdownPreviewFile({
  previewSaving,
  previewAvailable,
  runtimePoolId,
  sort,
  workflow,
  toastService,
  setPreviewSaving,
  onSavingStateChange
}: SavePoolMarkdownPreviewFileOptions): Promise<void> {
  if (previewSaving || !previewAvailable || !runtimePoolId) {
    return;
  }

  setPreviewSaving(true);
  onSavingStateChange(true);

  try {
    await workflow.savePoolMarkdownFile({
      poolId: runtimePoolId,
      sort
    });
    toastService.show({
      status: "success",
      message: "Saved Markdown file."
    });
  } catch (_error) {
    toastService.show({
      status: "error",
      message: "Save Markdown file failed. Please try again."
    });
  } finally {
    setPreviewSaving(false);
    onSavingStateChange(false);
  }
}
