export type TextSelectionSnapshot = {
  shouldRestore: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
};

export type ScrollSnapshot = {
  shouldRestore: boolean;
  scrollTop: number;
  scrollLeft: number;
};

const CARD_GRID_SELECTOR = ".glitter-pool-stage__card-grid";
const SEARCH_HIT_CARD_SELECTOR_PREFIX = '.glitter-pool-stage__card-surface[data-item-id="';
const SEARCH_HIT_CARD_SELECTOR_SUFFIX = '"]';

function buildSearchHitCardSelector(activeSearchHitIdeaId: string): string {
  return `${SEARCH_HIT_CARD_SELECTOR_PREFIX}${activeSearchHitIdeaId}${SEARCH_HIT_CARD_SELECTOR_SUFFIX}`;
}

function getSearchHitCard(
  contentEl: HTMLElement | null | undefined,
  activeSearchHitIdeaId: string | null | undefined
): HTMLElement | null {
  if (!contentEl || !activeSearchHitIdeaId) {
    return null;
  }

  return contentEl.querySelector?.(buildSearchHitCardSelector(activeSearchHitIdeaId)) as HTMLElement | null;
}

export function captureTextSelectionSnapshot(
  contentEl: HTMLElement | null | undefined,
  selector: string,
  preserve: boolean
): TextSelectionSnapshot {
  if (!preserve || !contentEl?.ownerDocument) {
    return {
      shouldRestore: false,
      selectionStart: null,
      selectionEnd: null
    };
  }

  const activeElement = contentEl.ownerDocument.activeElement;
  const input = contentEl.querySelector?.(selector) as HTMLInputElement | null;
  if (!input || activeElement !== input) {
    return {
      shouldRestore: false,
      selectionStart: null,
      selectionEnd: null
    };
  }

  return {
    shouldRestore: true,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd
  };
}

export function restoreTextSelectionSnapshot(
  contentEl: HTMLElement | null | undefined,
  selector: string,
  snapshot: TextSelectionSnapshot
): void {
  if (!snapshot.shouldRestore || !contentEl) {
    return;
  }

  const nextInput = contentEl.querySelector(selector) as HTMLInputElement | null;
  if (!nextInput) {
    return;
  }

  nextInput.focus();
  if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
    nextInput.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}

export function captureCardGridScrollSnapshot(
  contentEl: HTMLElement | null | undefined,
  preserve: boolean
): ScrollSnapshot {
  if (!preserve || !contentEl) {
    return {
      shouldRestore: false,
      scrollTop: 0,
      scrollLeft: 0
    };
  }

  const cardGrid = contentEl.querySelector?.(CARD_GRID_SELECTOR) as HTMLElement | null;
  if (!cardGrid) {
    return {
      shouldRestore: false,
      scrollTop: 0,
      scrollLeft: 0
    };
  }

  return {
    shouldRestore: true,
    scrollTop: cardGrid.scrollTop,
    scrollLeft: cardGrid.scrollLeft
  };
}

export function restoreCardGridScrollSnapshot(
  contentEl: HTMLElement | null | undefined,
  snapshot: ScrollSnapshot
): void {
  if (!snapshot.shouldRestore || !contentEl) {
    return;
  }

  const nextCardGrid = contentEl.querySelector(CARD_GRID_SELECTOR) as HTMLElement | null;
  if (!nextCardGrid) {
    return;
  }

  nextCardGrid.scrollTop = snapshot.scrollTop;
  nextCardGrid.scrollLeft = snapshot.scrollLeft;
}

export function revealPoolViewSearchHitCard(
  contentEl: HTMLElement | null | undefined,
  activeSearchHitIdeaId: string | null | undefined
): void {
  getSearchHitCard(contentEl, activeSearchHitIdeaId)?.scrollIntoView({
    block: "center",
    behavior: "smooth"
  });
}

export function clearPoolViewSearchHitStyles(
  contentEl: HTMLElement | null | undefined,
  activeSearchHitIdeaId: string | null | undefined
): void {
  getSearchHitCard(contentEl, activeSearchHitIdeaId)?.classList.remove(
    "glitter-pool-stage__card-surface--search-hit",
    "is-pulsing"
  );
}
