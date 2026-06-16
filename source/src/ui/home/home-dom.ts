type StyleWritableElement = HTMLElement & {
  setCssStyles?: (styles: Record<string, string>) => void;
  setCssProps?: (props: Record<string, string>) => void;
  style: CSSStyleDeclaration & {
    setCssStyles?: (styles: Record<string, string>) => void;
    setCssProps?: (props: Record<string, string>) => void;
  };
};

function camelCaseToKebabCase(name: string): string {
  return name.startsWith("--") ? name : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export function setElementStyles(targetEl: HTMLElement, styles: Record<string, string>): void {
  const writableTarget = targetEl as StyleWritableElement;
  const targetStyle = writableTarget.style;
  const targetSetCssStyles = writableTarget.setCssStyles;
  const styleSetCssStyles = targetStyle.setCssStyles;

  if (typeof targetSetCssStyles === "function") {
    targetSetCssStyles.call(writableTarget, styles);
    return;
  }

  if (typeof styleSetCssStyles === "function") {
    styleSetCssStyles.call(targetStyle, styles);
    return;
  }

  Object.entries(styles).forEach(([name, value]) => {
    targetStyle.setProperty(camelCaseToKebabCase(name), value);
  });
}

export function setElementCssProps(targetEl: HTMLElement, props: Record<string, string>): void {
  const writableTarget = targetEl as StyleWritableElement;
  const targetStyle = writableTarget.style;
  const targetSetCssProps = writableTarget.setCssProps;
  const styleSetCssProps = targetStyle.setCssProps;

  if (typeof targetSetCssProps === "function") {
    targetSetCssProps.call(writableTarget, props);
    return;
  }

  if (typeof styleSetCssProps === "function") {
    styleSetCssProps.call(targetStyle, props);
    return;
  }

  Object.entries(props).forEach(([name, value]) => {
    targetStyle.setProperty(name, value);
  });
}

export function clearHomeContainerChildren(containerEl: HTMLElement): void {
  const withEmpty = containerEl as HTMLElement & { empty?: () => void };
  if (typeof withEmpty.empty === "function") {
    withEmpty.empty();
    return;
  }

  while (containerEl.firstChild) {
    containerEl.removeChild(containerEl.firstChild);
  }
}

export function createNode(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
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

function hasClassName(element: { className: string }, className: string): boolean {
  return element.className.split(/\s+/).includes(className);
}

export function addClassName(element: { className: string }, className: string): void {
  if (hasClassName(element, className)) {
    return;
  }

  element.className = `${element.className} ${className}`.trim();
}

export function removeClassName(element: { className: string }, className: string): void {
  element.className = element.className
    .split(/\s+/)
    .filter((token) => token && token !== className)
    .join(" ");
}

function selectEditableTextAtRightEdge(node: HTMLElement): void {
  const doc = (node.ownerDocument ?? document) as Document & {
    createRange?: () => Range;
    getSelection?: () => Selection | null;
  };
  const selection = doc.getSelection?.();
  const range = doc.createRange?.();
  if (!selection || !range) {
    return;
  }

  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function startOrbTitleInlineEdit(orbButton: HTMLButtonElement): void {
  const textLayer = orbButton.querySelector(".glitter-home-stage__pool-orb-text") as HTMLElement | null;
  const title = orbButton.querySelector(".glitter-home-stage__pool-orb-name") as HTMLElement | null;
  if (!textLayer || !title || title.getAttribute("contenteditable") === "true") {
    return;
  }

  orbButton.dataset.inlineRenameActive = "true";
  addClassName(textLayer, "glitter-home-stage__pool-orb-text--editing");
  title.setAttribute("contenteditable", "true");
  title.focus?.();
  selectEditableTextAtRightEdge(title);
}
