/**
 * 保护后续使用指引的本地化文案，避免首次引导在英文界面回退到中文。
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildFollowupGuidanceState,
  renderFollowupGuidanceView
} from "../../../src/ui/shared/followup-guidance";

type FakeListener = () => void;

class FakeElement {
  className = "";
  textContent = "";
  type = "";
  children: FakeElement[] = [];
  attributes: Record<string, string> = {};
  ownerDocument = {
    createElement: (tag: string) => {
      const node = new FakeElement();
      node.type = tag;
      return node;
    }
  };

  private readonly listeners = new Map<string, FakeListener[]>();

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    this.textContent += child.textContent;
    return child;
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  click(): void {
    const listeners = this.listeners.get("click") ?? [];
    listeners.forEach((listener) => listener());
  }

  queryByClass(className: string): FakeElement | null {
    const classes = this.className.split(/\s+/).filter(Boolean);
    if (classes.includes(className)) {
      return this;
    }

    for (const child of this.children) {
      const match = child.queryByClass(className);
      if (match) {
        return match;
      }
    }

    return null;
  }
}

describe("followup guidance localization", () => {
  it("builds English follow-up guidance copy", () => {
    const state = buildFollowupGuidanceState("en");

    expect(state).toMatchObject({
      title: "Next-use guide",
      closeLabel: "Close next-use guide",
      continueLabel: "Go to idea pool",
      footnote: "This guide appears only once. You can reopen it later from Settings."
    });
    expect(state.items).toEqual([
      {
        title: "Global quick capture",
        description: "Capture ideas from anywhere without breaking your flow.",
        icon: "keyboard"
      },
      {
        title: "Automatic link detection",
        description: "Paste a link and Glitter will detect it and bring the content in.",
        icon: "link-2"
      },
      {
        title: "Multi-content quick capture",
        description: "Paste links, images, or videos in Quick Capture and switch layouts quickly.",
        icon: "file-text"
      },
      {
        title: "Embed idea snippets in notes",
        description: "Use the note context menu or your custom shortcut to insert idea snippets quickly.",
        icon: "quote"
      },
      {
        title: "Roam mode",
        description: "Follow connections between ideas in Roam mode and expand related threads quickly.",
        icon: "roam"
      }
    ]);
  });

  it("renders the localized close label and continue CTA", () => {
    const container = new FakeElement() as unknown as HTMLElement & FakeElement;
    const onDismiss = vi.fn();
    const onContinue = vi.fn();

    renderFollowupGuidanceView(container, buildFollowupGuidanceState("en"), {
      onDismiss,
      onContinue
    });

    const closeButton = container.queryByClass("glitter-followup-guidance-view__close");
    const continueButton = container.queryByClass("glitter-followup-guidance-view__continue");
    expect(closeButton?.getAttribute("aria-label")).toBe("Close next-use guide");
    expect(continueButton?.textContent).toContain("Go to idea pool");

    closeButton?.click();
    continueButton?.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
