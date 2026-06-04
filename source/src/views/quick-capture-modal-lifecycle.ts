import type { KeymapEventHandler, KeymapEventListener, Modifier } from "obsidian";
import type { QuickCaptureFlowContext } from "../ui/write/quick-capture-runtime";

const QUICK_CAPTURE_TITLE_SELECTOR = ".glitter-write-stage__auto-title-text";
const QUICK_CAPTURE_BODY_SELECTOR = ".glitter-write-stage__body-editor";

type QuickCaptureEditableFieldSelector =
  | typeof QUICK_CAPTURE_TITLE_SELECTOR
  | typeof QUICK_CAPTURE_BODY_SELECTOR;

type QuickCaptureShortcutStep = "capture" | "saved-feedback";

type QuickCaptureOwnerDocument = {
  activeElement?: unknown;
};

type QuickCaptureOwnerDocumentHost = {
  ownerDocument?: QuickCaptureOwnerDocument;
};

type QuickCaptureBlurTarget = {
  blur?: () => void;
};

type QuickCaptureOutsideClickHost = {
  addEventListener?: (
    type: string,
    listener: (event: MouseEvent) => void,
    options?: boolean | AddEventListenerOptions
  ) => void;
  removeEventListener?: (
    type: string,
    listener: (event: MouseEvent) => void,
    options?: boolean | EventListenerOptions
  ) => void;
};

type QuickCaptureModalRoot = {
  contains?: (node: Node) => boolean;
};

type QuickCaptureEditableFieldElement = {
  selectionStart: number | null;
  selectionEnd: number | null;
  scrollTop: number;
  focus?: () => void;
  setSelectionRange?: (start: number, end: number) => void;
};

type QuickCaptureEditableFieldContainer = QuickCaptureOwnerDocumentHost & {
  querySelector?: (selector: QuickCaptureEditableFieldSelector) => QuickCaptureEditableFieldElement | null;
};

export interface QuickCaptureEditableFieldState {
  selector: QuickCaptureEditableFieldSelector;
  selectionStart: number | null;
  selectionEnd: number | null;
  scrollTop: number;
}

export interface QuickCaptureShortcutScope {
  register(modifiers: Modifier[] | null, key: string | null, handler: KeymapEventListener): KeymapEventHandler;
  unregister(handler: KeymapEventHandler): void;
}

function resolveOwnerDocument(
  hosts: Array<QuickCaptureOwnerDocumentHost | undefined>
): QuickCaptureOwnerDocument | undefined {
  for (const host of hosts) {
    if (host?.ownerDocument) {
      return host.ownerDocument;
    }
  }

  return typeof document !== "undefined"
    ? (document as unknown as QuickCaptureOwnerDocument)
    : undefined;
}

function createEditableFieldState(
  selector: QuickCaptureEditableFieldSelector,
  field: QuickCaptureEditableFieldElement
): QuickCaptureEditableFieldState {
  return {
    selector,
    selectionStart: field.selectionStart,
    selectionEnd: field.selectionEnd,
    scrollTop: field.scrollTop
  };
}

export function captureFirstUseLauncherFocusTarget(
  flowContext: QuickCaptureFlowContext,
  hosts: {
    containerEl?: QuickCaptureOwnerDocumentHost;
    modalEl?: QuickCaptureOwnerDocumentHost;
    contentEl?: QuickCaptureOwnerDocumentHost;
  }
): QuickCaptureBlurTarget | null {
  if (flowContext !== "first-use") {
    return null;
  }

  const ownerDocument = resolveOwnerDocument([hosts.containerEl, hosts.modalEl, hosts.contentEl]);
  return (ownerDocument?.activeElement as QuickCaptureBlurTarget | undefined) ?? null;
}

export function blurFirstUseLauncherAfterClose(
  flowContext: QuickCaptureFlowContext,
  launcherFocusTarget: QuickCaptureBlurTarget | null
): void {
  if (flowContext !== "first-use") {
    return;
  }

  queueMicrotask(() => {
    launcherFocusTarget?.blur?.();
  });
}

export function registerQuickCaptureOutsideClickGuard({
  containerEl,
  modalEl
}: {
  containerEl?: QuickCaptureOutsideClickHost;
  modalEl?: QuickCaptureModalRoot;
}): () => void {
  const outsideClickGuardHandler = (event: MouseEvent) => {
    const target = event.target;
    if (target && modalEl?.contains?.(target as Node)) {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
  };

  containerEl?.addEventListener?.("click", outsideClickGuardHandler, true);

  return () => {
    containerEl?.removeEventListener?.("click", outsideClickGuardHandler, true);
  };
}

export function registerQuickCaptureShortcutHandlers({
  scope,
  step,
  onClose,
  onSubmit
}: {
  scope: QuickCaptureShortcutScope;
  step: QuickCaptureShortcutStep;
  onClose: () => void;
  onSubmit?: () => void | Promise<void>;
}): () => void {
  const registeredHandlers: KeymapEventHandler[] = [];

  registeredHandlers.push(
    scope.register([], "Escape", (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      onClose();
      return false;
    })
  );

  if (step === "capture") {
    registeredHandlers.push(
      scope.register(["Mod"], "Enter", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        void onSubmit?.();
        return false;
      })
    );
  }

  return () => {
    for (const handler of registeredHandlers) {
      scope.unregister(handler);
    }
  };
}

export function captureQuickCaptureEditableFieldState(
  contentEl?: QuickCaptureEditableFieldContainer
): QuickCaptureEditableFieldState | null {
  const activeElement = contentEl?.ownerDocument?.activeElement;
  if (!activeElement || !contentEl?.querySelector) {
    return null;
  }

  const titleField = contentEl.querySelector(QUICK_CAPTURE_TITLE_SELECTOR);
  if (titleField && activeElement === titleField) {
    return createEditableFieldState(QUICK_CAPTURE_TITLE_SELECTOR, titleField);
  }

  const bodyField = contentEl.querySelector(QUICK_CAPTURE_BODY_SELECTOR);
  if (bodyField && activeElement === bodyField) {
    return createEditableFieldState(QUICK_CAPTURE_BODY_SELECTOR, bodyField);
  }

  return null;
}

export function restoreQuickCaptureEditableFieldState(
  contentEl: QuickCaptureEditableFieldContainer | undefined,
  state: QuickCaptureEditableFieldState | null
): void {
  if (!state || !contentEl?.querySelector) {
    return;
  }

  const field = contentEl.querySelector(state.selector);
  if (!field) {
    return;
  }

  field.focus?.();
  if (typeof state.selectionStart === "number" && typeof state.selectionEnd === "number") {
    field.setSelectionRange?.(state.selectionStart, state.selectionEnd);
  }
  field.scrollTop = state.scrollTop;
}
