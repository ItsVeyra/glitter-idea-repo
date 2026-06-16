import type { PoolViewSort } from "./pool-view-history";

type SelectableRuntimeCard = {
  id: string;
  selected: boolean;
};

type SelectableRuntimeControls = {
  selectedCount: number;
  hasSelection: boolean;
};

export function beginPoolViewRenderCycle(currentRenderVersion: number): number {
  return currentRenderVersion + 1;
}

export function finishPoolViewRenderCycle(
  pendingBrowseRenderVersion: number | undefined,
  renderVersion: number
): number | undefined {
  return pendingBrowseRenderVersion === renderVersion ? undefined : pendingBrowseRenderVersion;
}

export function shouldSkipPoolViewRender(
  isClosed: boolean,
  currentRenderVersion: number,
  renderVersion: number
): boolean {
  return isClosed || renderVersion !== currentRenderVersion;
}

export function buildPoolViewRuntimeWithSelectedCards<
  Runtime extends {
    cards: SelectableRuntimeCard[];
    controls: SelectableRuntimeControls;
  }
>(runtime: Runtime, selectedIdeaIds: Set<string>): Runtime {
  return {
    ...runtime,
    cards: runtime.cards.map((card) => ({
      ...card,
      selected: selectedIdeaIds.has(card.id)
    })),
    controls: {
      ...runtime.controls,
      selectedCount: selectedIdeaIds.size,
      hasSelection: selectedIdeaIds.size > 0
    }
  } satisfies Runtime;
}

export type RenderPoolMarkdownPreviewFromCachedRuntimeInput<Runtime, Preview> = {
  runtime: Runtime | undefined;
  activePoolId: string | undefined;
  sort: PoolViewSort;
  renderedBrowseRuntimeVersion: number;
  renderPoolShell: () => void;
  loadPreview: (input: { poolId: string; sort: PoolViewSort }) => Promise<Preview>;
  renderBrowseFromRuntime: (runtime: Runtime, preview?: Preview) => void;
  resolveActivePoolIdFromRuntime: (runtime: Runtime) => string | undefined;
  isPreviewAvailableForPoolId: (poolId: string) => boolean;
  isPreviewOpen: () => boolean;
  getActivePoolId: () => string | undefined;
  hasPendingBrowseRender: () => boolean;
  shouldSkipRender: (renderVersion: number) => boolean;
  getRenderVersion: () => number;
  getRenderedBrowseRuntimeVersion: () => number;
  getLastRenderedBrowseRuntime: () => Runtime | undefined;
  onLoadError: () => void;
};

export async function renderPoolMarkdownPreviewFromCachedRuntime<Runtime, Preview>(
  input: RenderPoolMarkdownPreviewFromCachedRuntimeInput<Runtime, Preview>
): Promise<void> {
  const runtime = input.runtime;
  const poolId = input.activePoolId;
  if (!runtime || !poolId || !input.isPreviewAvailableForPoolId(poolId)) {
    input.renderPoolShell();
    return;
  }

  const renderVersion = input.getRenderVersion();
  const renderedBrowseRuntimeVersion = input.renderedBrowseRuntimeVersion;
  if (input.hasPendingBrowseRender()) {
    return;
  }

  try {
    const preview = await input.loadPreview({
      poolId,
      sort: input.sort
    });
    if (
      input.shouldSkipRender(renderVersion) ||
      input.hasPendingBrowseRender() ||
      !input.isPreviewOpen() ||
      input.getActivePoolId() !== poolId ||
      !input.isPreviewAvailableForPoolId(poolId)
    ) {
      return;
    }

    const runtimeToRender = renderedBrowseRuntimeVersion === input.getRenderedBrowseRuntimeVersion()
      ? runtime
      : input.getLastRenderedBrowseRuntime();
    if (!runtimeToRender || input.resolveActivePoolIdFromRuntime(runtimeToRender) !== poolId) {
      return;
    }

    input.renderBrowseFromRuntime(runtimeToRender, preview);
  } catch {
    if (
      input.shouldSkipRender(renderVersion) ||
      input.hasPendingBrowseRender() ||
      !input.isPreviewOpen() ||
      input.getActivePoolId() !== poolId ||
      !input.isPreviewAvailableForPoolId(poolId)
    ) {
      return;
    }

    input.onLoadError();
  }
}
