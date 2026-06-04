import type { KeymapEventHandler, KeymapEventListener, Modifier } from "obsidian";
import { describe, expect, it, vi } from "vitest";

async function loadLifecycleModule() {
  return import("../../src/views/quick-capture-modal-lifecycle");
}

type EditableField = {
  selectionStart: number | null;
  selectionEnd: number | null;
  scrollTop: number;
  focus: () => void;
  setSelectionRange: (start: number, end: number) => void;
};

function createEditableField(ownerDocument: { activeElement?: unknown }): EditableField {
  const field: EditableField = {
    selectionStart: null,
    selectionEnd: null,
    scrollTop: 0,
    focus: vi.fn(() => {
      ownerDocument.activeElement = field;
    }),
    setSelectionRange: vi.fn((start: number, end: number) => {
      field.selectionStart = start;
      field.selectionEnd = end;
    })
  };

  return field;
}

function createClickHost() {
  const captureListeners = new Map<string, Array<(event: any) => void>>();

  return {
    addEventListener: vi.fn((type: string, listener: (event: any) => void, options?: boolean | { capture?: boolean }) => {
      if (!(options === true || (typeof options === "object" && options?.capture))) {
        return;
      }

      const listeners = captureListeners.get(type) ?? [];
      listeners.push(listener);
      captureListeners.set(type, listeners);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: any) => void, options?: boolean | { capture?: boolean }) => {
      if (!(options === true || (typeof options === "object" && options?.capture))) {
        return;
      }

      const listeners = captureListeners.get(type) ?? [];
      captureListeners.set(
        type,
        listeners.filter((registeredListener) => registeredListener !== listener)
      );
    }),
    dispatchClick(target: unknown, eventOverrides: Record<string, unknown> = {}) {
      const event = {
        type: "click",
        target,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        ...eventOverrides
      };

      for (const listener of captureListeners.get("click") ?? []) {
        listener(event);
      }

      return event;
    }
  };
}

describe("quick-capture-modal-lifecycle", () => {
  it("captures title selection state when the title field is active", async () => {
    const { captureQuickCaptureEditableFieldState } = await loadLifecycleModule();
    const ownerDocument: { activeElement?: unknown } = {};
    const titleField = createEditableField(ownerDocument);
    const bodyField = createEditableField(ownerDocument);
    titleField.selectionStart = 1;
    titleField.selectionEnd = 3;
    titleField.scrollTop = 12;
    ownerDocument.activeElement = titleField;

    const contentEl = {
      ownerDocument,
      querySelector(selector: string) {
        if (selector === ".glitter-write-stage__auto-title-text") {
          return titleField;
        }

        if (selector === ".glitter-write-stage__body-editor") {
          return bodyField;
        }

        return null;
      }
    };

    expect(captureQuickCaptureEditableFieldState(contentEl)).toEqual({
      selector: ".glitter-write-stage__auto-title-text",
      selectionStart: 1,
      selectionEnd: 3,
      scrollTop: 12
    });
  });

  it("restores body selection and scroll state onto the rerendered field", async () => {
    const {
      captureQuickCaptureEditableFieldState,
      restoreQuickCaptureEditableFieldState
    } = await loadLifecycleModule();
    const ownerDocument: { activeElement?: unknown } = {};
    const firstBodyField = createEditableField(ownerDocument);
    const titleField = createEditableField(ownerDocument);
    firstBodyField.selectionStart = 2;
    firstBodyField.selectionEnd = 4;
    firstBodyField.scrollTop = 18;
    ownerDocument.activeElement = firstBodyField;

    let renderedBodyField: EditableField = firstBodyField;
    const contentEl = {
      ownerDocument,
      querySelector(selector: string) {
        if (selector === ".glitter-write-stage__auto-title-text") {
          return titleField;
        }

        if (selector === ".glitter-write-stage__body-editor") {
          return renderedBodyField;
        }

        return null;
      }
    };

    const capturedState = captureQuickCaptureEditableFieldState(contentEl);
    const rerenderedBodyField = createEditableField(ownerDocument);
    renderedBodyField = rerenderedBodyField;

    restoreQuickCaptureEditableFieldState(contentEl, capturedState);

    expect(rerenderedBodyField.focus).toHaveBeenCalledTimes(1);
    expect(rerenderedBodyField.setSelectionRange).toHaveBeenCalledWith(2, 4);
    expect(rerenderedBodyField.selectionStart).toBe(2);
    expect(rerenderedBodyField.selectionEnd).toBe(4);
    expect(rerenderedBodyField.scrollTop).toBe(18);
    expect(ownerDocument.activeElement).toBe(rerenderedBodyField);
  });

  it("captures the first-use launcher and re-blurs it after close focus restoration", async () => {
    const {
      blurFirstUseLauncherAfterClose,
      captureFirstUseLauncherFocusTarget
    } = await loadLifecycleModule();
    const ownerDocument: { activeElement?: unknown } = {};
    const launcher = {
      blur: vi.fn(() => {
        ownerDocument.activeElement = null;
      })
    };
    ownerDocument.activeElement = launcher;

    const capturedLauncher = captureFirstUseLauncherFocusTarget("first-use", {
      contentEl: { ownerDocument }
    });

    expect(capturedLauncher).toBe(launcher);

    ownerDocument.activeElement = launcher;
    blurFirstUseLauncherAfterClose("first-use", capturedLauncher);
    await Promise.resolve();

    expect(launcher.blur).toHaveBeenCalledTimes(1);
    expect(ownerDocument.activeElement).toBeNull();
  });

  it("blocks outside clicks and removes the guard on cleanup", async () => {
    const { registerQuickCaptureOutsideClickGuard } = await loadLifecycleModule();
    const host = createClickHost();
    const insideNode = { inside: true };
    const cleanup = registerQuickCaptureOutsideClickGuard({
      containerEl: host,
      modalEl: {
        contains(node: unknown) {
          return node === insideNode;
        }
      }
    });

    const outsideEvent = host.dispatchClick({ outside: true });
    expect(outsideEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(outsideEvent.stopPropagation).toHaveBeenCalledTimes(1);

    const insideEvent = host.dispatchClick(insideNode);
    expect(insideEvent.preventDefault).not.toHaveBeenCalled();
    expect(insideEvent.stopPropagation).not.toHaveBeenCalled();

    cleanup();

    const postCleanupEvent = host.dispatchClick({ outside: true });
    expect(postCleanupEvent.preventDefault).not.toHaveBeenCalled();
    expect(postCleanupEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it("registers Escape and Mod+Enter handlers and unregisters both on cleanup", async () => {
    const { registerQuickCaptureShortcutHandlers } = await loadLifecycleModule();
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    const registrations: Array<{
      modifiers: Modifier[] | null;
      key: string | null;
      listener: KeymapEventListener;
      token: KeymapEventHandler;
    }> = [];
    const unregister = vi.fn();
    const scope = {
      register(modifiers: Modifier[] | null, key: string | null, listener: KeymapEventListener) {
        const token = { key } as KeymapEventHandler;
        registrations.push({ modifiers, key, listener, token });
        return token;
      },
      unregister
    };

    const cleanup = registerQuickCaptureShortcutHandlers({
      scope,
      step: "capture",
      onClose,
      onSubmit
    });

    expect(registrations.map(({ modifiers, key }) => ({ modifiers, key }))).toEqual([
      { modifiers: [], key: "Escape" },
      { modifiers: ["Mod"], key: "Enter" }
    ]);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const context = { vkey: "Escape", modifiers: null, key: "Escape" };
    expect(registrations[0]?.listener({ preventDefault, stopPropagation } as unknown as KeyboardEvent, context)).toBe(false);
    expect(registrations[1]?.listener({ preventDefault, stopPropagation } as unknown as KeyboardEvent, context)).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(stopPropagation).toHaveBeenCalledTimes(2);

    cleanup();

    expect(unregister.mock.calls).toEqual([[registrations[0]?.token], [registrations[1]?.token]]);
  });

  it("omits the submit shortcut outside the capture step", async () => {
    const { registerQuickCaptureShortcutHandlers } = await loadLifecycleModule();
    const unregister = vi.fn();
    const registrations: Array<{ modifiers: Modifier[] | null; key: string | null; token: KeymapEventHandler }> = [];
    const scope = {
      register(modifiers: Modifier[] | null, key: string | null) {
        const token = { key } as KeymapEventHandler;
        registrations.push({ modifiers, key, token });
        return token;
      },
      unregister
    };

    const cleanup = registerQuickCaptureShortcutHandlers({
      scope,
      step: "saved-feedback",
      onClose: vi.fn(),
      onSubmit: vi.fn()
    });

    expect(registrations).toEqual([{ modifiers: [], key: "Escape", token: { key: "Escape" } }]);

    cleanup();

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledWith(registrations[0]?.token);
  });
});
