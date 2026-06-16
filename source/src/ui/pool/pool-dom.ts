type StyleWritableElement = HTMLElement & {
  setCssStyles?: (styles: Record<string, string>) => void;
  setCssProps?: (props: Record<string, string>) => void;
  style: CSSStyleDeclaration & Record<string, string> & {
    setCssStyles?: (styles: Record<string, string>) => void;
    setCssProps?: (props: Record<string, string>) => void;
    setProperty?: (name: string, value: string) => void;
  };
};

function camelCaseToKebabCase(name: string): string {
  return name.startsWith("--") ? name : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export function clearPoolContainer(containerEl: HTMLElement): void {
  const withEmpty = containerEl as HTMLElement & { empty?: () => void };
  if (typeof withEmpty.empty === "function") {
    withEmpty.empty();
    return;
  }

  while (containerEl.firstChild) {
    containerEl.firstChild.remove();
  }
}

export function createPoolNode(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
  const doc = (parent.ownerDocument ?? document) as Document;
  const node = doc.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  parent.appendChild(node);
  return node;
}

export function createPoolButton(
  parent: HTMLElement,
  className: string,
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const button = createPoolNode(parent, "button", className, label) as HTMLButtonElement;
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

export function createPoolAnchor(
  parent: HTMLElement,
  className: string,
  href: string
): HTMLAnchorElement {
  const anchor = createPoolNode(parent, "a", className) as HTMLAnchorElement;
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

export function renderPoolEmptyState(
  parent: HTMLElement,
  input: { eyebrow?: string; title: string; description: string }
): HTMLElement {
  const empty = createPoolNode(parent, "div", "glitter-pool-stage__empty");
  if (input.eyebrow) {
    createPoolNode(empty, "span", "glitter-pool-stage__empty-eyebrow", input.eyebrow);
  }
  createPoolNode(empty, "strong", "glitter-pool-stage__empty-title", input.title);
  createPoolNode(empty, "p", "glitter-pool-stage__empty-description", input.description);
  return empty;
}

export function setPoolInlineStyle(node: HTMLElement, property: string, value: string): void {
  const writableTarget = node as StyleWritableElement;
  const targetStyle = writableTarget.style;

  if (property.startsWith("--")) {
    if (typeof writableTarget.setCssProps === "function") {
      writableTarget.setCssProps({ [property]: value });
      return;
    }

    if (typeof targetStyle.setCssProps === "function") {
      targetStyle.setCssProps({ [property]: value });
      return;
    }
  } else {
    if (typeof writableTarget.setCssStyles === "function") {
      writableTarget.setCssStyles({ [property]: value });
      return;
    }

    if (typeof targetStyle.setCssStyles === "function") {
      targetStyle.setCssStyles({ [property]: value });
      return;
    }
  }

  targetStyle.setProperty(camelCaseToKebabCase(property), value);
}

export function clearPoolInlineStyle(node: HTMLElement, property: string): void {
  setPoolInlineStyle(node, property, "");
}

export function setPoolClassToken(node: HTMLElement, token: string, enabled: boolean): void {
  const classNames = new Set(node.className.split(/\s+/).filter(Boolean));
  if (enabled) {
    classNames.add(token);
  } else {
    classNames.delete(token);
  }
  node.className = Array.from(classNames).join(" ");
}
