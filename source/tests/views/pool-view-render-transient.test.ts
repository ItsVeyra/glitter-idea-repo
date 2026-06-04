import { describe, expect, it, vi } from "vitest";
import {
  captureCardGridScrollSnapshot,
  captureTextSelectionSnapshot,
  clearPoolViewSearchHitStyles,
  restoreCardGridScrollSnapshot,
  restoreTextSelectionSnapshot,
  revealPoolViewSearchHitCard
} from "../../src/views/pool-view-render-transient";

describe("pool-view-render-transient", () => {
  it("does not capture or restore text selection when the matching input is not focused", () => {
    const activeElement = {} as Element;
    const currentInput = {
      selectionStart: 2,
      selectionEnd: 5
    } as HTMLInputElement;
    const nextInput = {
      focus: vi.fn(),
      setSelectionRange: vi.fn()
    } as unknown as HTMLInputElement;

    const querySelector = vi
      .fn<(selector: string) => HTMLInputElement | null>()
      .mockImplementationOnce(() => currentInput)
      .mockImplementation(() => nextInput);

    const contentEl = {
      ownerDocument: { activeElement },
      querySelector
    } as unknown as HTMLElement;

    const snapshot = captureTextSelectionSnapshot(contentEl, ".glitter-pool-stage__query", true);
    restoreTextSelectionSnapshot(contentEl, ".glitter-pool-stage__query", snapshot);

    expect(snapshot).toEqual({
      shouldRestore: false,
      selectionStart: null,
      selectionEnd: null
    });
    expect(querySelector).toHaveBeenCalledTimes(1);
    expect(nextInput.focus).not.toHaveBeenCalled();
    expect(nextInput.setSelectionRange).not.toHaveBeenCalled();
  });

  it("captures and restores text selection when the matching input is focused", () => {
    const currentInput = {
      selectionStart: 2,
      selectionEnd: 5
    } as HTMLInputElement;
    const nextInput = {
      focus: vi.fn(),
      setSelectionRange: vi.fn()
    } as unknown as HTMLInputElement;
    const querySelector = vi
      .fn<(selector: string) => HTMLInputElement | null>()
      .mockImplementationOnce(() => currentInput)
      .mockImplementation(() => nextInput);
    const contentEl = {
      ownerDocument: { activeElement: currentInput },
      querySelector
    } as unknown as HTMLElement;

    const snapshot = captureTextSelectionSnapshot(contentEl, ".glitter-pool-stage__query", true);
    restoreTextSelectionSnapshot(contentEl, ".glitter-pool-stage__query", snapshot);

    expect(snapshot).toEqual({
      shouldRestore: true,
      selectionStart: 2,
      selectionEnd: 5
    });
    expect(querySelector).toHaveBeenCalledTimes(2);
    expect(nextInput.focus).toHaveBeenCalledTimes(1);
    expect(nextInput.setSelectionRange).toHaveBeenCalledWith(2, 5);
  });

  it("captures and restores the card-grid scroll position", () => {
    const currentCardGrid = {
      scrollTop: 168,
      scrollLeft: 12
    } as HTMLElement;
    const nextCardGrid = {
      scrollTop: 0,
      scrollLeft: 0
    } as HTMLElement;
    const querySelector = vi
      .fn<(selector: string) => HTMLElement | null>()
      .mockImplementationOnce(() => currentCardGrid)
      .mockImplementation(() => nextCardGrid);
    const contentEl = {
      querySelector
    } as unknown as HTMLElement;

    const snapshot = captureCardGridScrollSnapshot(contentEl, true);
    restoreCardGridScrollSnapshot(contentEl, snapshot);

    expect(snapshot).toEqual({
      shouldRestore: true,
      scrollTop: 168,
      scrollLeft: 12
    });
    expect(querySelector).toHaveBeenCalledTimes(2);
    expect(nextCardGrid.scrollTop).toBe(168);
    expect(nextCardGrid.scrollLeft).toBe(12);
  });

  it("reveals the active search-hit card and clears its styles", () => {
    const scrollIntoView = vi.fn();
    const classListRemove = vi.fn();
    const targetCard = {
      scrollIntoView,
      classList: {
        remove: classListRemove
      }
    } as unknown as HTMLElement;
    const querySelector = vi.fn(() => targetCard);
    const contentEl = {
      querySelector
    } as unknown as HTMLElement;

    revealPoolViewSearchHitCard(contentEl, "idea-1");
    clearPoolViewSearchHitStyles(contentEl, "idea-1");

    expect(querySelector).toHaveBeenNthCalledWith(
      1,
      '.glitter-pool-stage__card-surface[data-item-id="idea-1"]'
    );
    expect(querySelector).toHaveBeenNthCalledWith(
      2,
      '.glitter-pool-stage__card-surface[data-item-id="idea-1"]'
    );
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth"
    });
    expect(classListRemove).toHaveBeenCalledWith("glitter-pool-stage__card-surface--search-hit", "is-pulsing");
  });
});
