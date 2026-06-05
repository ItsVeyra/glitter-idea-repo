/**
 * 保护首页渲染与样式约束相关行为，避免后续重构时出现静默回退。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { buildHomeViewState, buildHomeViewStateFromRuntime } from "../../../src/ui/home/home-state";
import { renderHomeView } from "../../../src/ui/home/render-home";
import { applyThemeSnapshot } from "../../../src/ui/shared/theme-state";

type OrbStyleLike = {
  getPropertyValue: (name: string) => string;
  left: string;
  top: string;
};

type OrbElement = HTMLElement & { className: string; style: OrbStyleLike };

function parsePercent(value: string): number {
  return Number.parseFloat(value.trim().replace(/%$/, ""));
}

// 构造最小宿主替身，承接渲染层与事件层断言。
class FakeRange {
  public target: FakeElement | null = null;
  public startOffset = 0;
  public endOffset = 0;

  selectNodeContents(target: FakeElement): void {
    this.target = target;
    this.startOffset = 0;
    this.endOffset = target.textContent.length;
  }
}

class FakeSelection {
  public range: FakeRange | null = null;
  public anchorOffset = 0;
  public focusOffset = 0;
  public selectedText = "";

  removeAllRanges(): void {
    this.range = null;
    this.anchorOffset = 0;
    this.focusOffset = 0;
    this.selectedText = "";
  }

  addRange(range: FakeRange): void {
    this.range = range;
    this.anchorOffset = range.startOffset;
    this.focusOffset = range.endOffset;
    this.selectedText = range.target?.textContent ?? "";
  }
}

function toKebabCase(value: string): string {
  return value.startsWith("--") ? value : value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function toCamelCase(value: string): string {
  if (value.startsWith("--")) {
    return value;
  }

  return value.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

class FakeStyle {
  public setCssStylesCallCount = 0;
  public setCssPropsCallCount = 0;

  private readonly values: Record<string, string> = {};

  private storeValue(name: string, value: string): void {
    this.values[name] = value;
    const kebabName = toKebabCase(name);
    const camelName = toCamelCase(name);
    this.values[kebabName] = value;
    this.values[camelName] = value;
  }

  setProperty(name: string, value: string): void {
    this.storeValue(name, value);
  }

  setCssStyles(styles: Record<string, string>): void {
    this.setCssStylesCallCount += 1;
    Object.entries(styles).forEach(([name, value]) => {
      this.setProperty(name, value);
    });
  }

  setCssProps(props: Record<string, string>): void {
    this.setCssPropsCallCount += 1;
    Object.entries(props).forEach(([name, value]) => {
      this.setProperty(name, value);
    });
  }

  getPropertyValue(name: string): string {
    return this.values[name] ?? "";
  }

  get left(): string {
    return this.getPropertyValue("left");
  }

  set left(value: string) {
    this.setProperty("left", value);
  }

  get top(): string {
    return this.getPropertyValue("top");
  }

  set top(value: string) {
    this.setProperty("top", value);
  }

  get opacity(): string {
    return this.getPropertyValue("opacity");
  }

  set opacity(value: string) {
    this.setProperty("opacity", value);
  }

  get pointerEvents(): string {
    return this.getPropertyValue("pointerEvents");
  }

  set pointerEvents(value: string) {
    this.setProperty("pointerEvents", value);
  }

  get width(): string {
    return this.getPropertyValue("width");
  }

  set width(value: string) {
    this.setProperty("width", value);
  }

  get height(): string {
    return this.getPropertyValue("height");
  }

  set height(value: string) {
    this.setProperty("height", value);
  }

  get minHeight(): string {
    return this.getPropertyValue("minHeight");
  }

  set minHeight(value: string) {
    this.setProperty("minHeight", value);
  }
}

type FakeEvent = {
  key?: string;
  isComposing?: boolean;
  keyCode?: number;
  offsetX?: number;
  offsetY?: number;
  clientX?: number;
  clientY?: number;
  pointerId?: number;
  relatedTarget?: FakeElement | null;
  preventDefault: () => void;
  stopPropagation: () => void;
  target?: FakeElement;
  currentTarget?: FakeElement;
};

class FakeElement {
  public className = "";
  public children: FakeElement[] = [];
  public parent: FakeElement | null = null;
  public style = new FakeStyle();
  public dataset: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public disabled = false;
  public type = "";
  public value = "";
  public placeholder = "";
  public focused = false;

  private _textContent = "";
  private rectWidth = 0;
  private rectHeight = 0;
  private readonly listeners = new Map<string, Array<(event?: FakeEvent) => void>>();

  constructor(public readonly tagName: string, public readonly ownerDocument: FakeDocument) {}

  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement): FakeElement {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parent = null;
    }
    return child;
  }

  setCssStyles(styles: Record<string, string>): void {
    this.style.setCssStyles(styles);
  }

  setCssProps(props: Record<string, string>): void {
    this.style.setCssProps(props);
  }

  addEventListener(type: string, listener: (event?: FakeEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  click(options?: { offsetX?: number; offsetY?: number; clientX?: number; clientY?: number }): void {
    if (this.disabled) {
      return;
    }

    let propagationStopped = false;
    const event: FakeEvent = {
      offsetX: options?.offsetX,
      offsetY: options?.offsetY,
      clientX: options?.clientX,
      clientY: options?.clientY,
      preventDefault() {},
      stopPropagation() {
        propagationStopped = true;
      },
      target: this
    };

    let currentTarget: FakeElement | null = this;
    while (currentTarget) {
      const listeners = currentTarget.listeners.get("click") ?? [];
      listeners.forEach((listener) => listener({ ...event, currentTarget: currentTarget ?? undefined }));
      if (propagationStopped) {
        break;
      }
      currentTarget = currentTarget.parent;
    }
  }

  focus(): void {
    this.focused = true;
  }

  keydown(key: string, options?: { isComposing?: boolean; keyCode?: number }): void {
    const listeners = this.listeners.get("keydown") ?? [];
    const event: FakeEvent = {
      key,
      isComposing: options?.isComposing,
      keyCode: options?.keyCode,
      preventDefault() {},
      stopPropagation() {},
      target: this,
      currentTarget: this
    };
    listeners.forEach((listener) => listener(event));
  }

  dispatch(type: string, overrides: Partial<FakeEvent> = {}): void {
    const listeners = this.listeners.get(type) ?? [];
    const event: FakeEvent = {
      preventDefault() {},
      stopPropagation() {},
      target: this,
      currentTarget: this,
      ...overrides
    };
    listeners.forEach((listener) => listener(event));
  }

  pointerdown(options?: { pointerId?: number; clientX?: number; clientY?: number }): void {
    const listeners = this.listeners.get("pointerdown") ?? [];
    const event: FakeEvent = {
      pointerId: options?.pointerId ?? 1,
      clientX: options?.clientX,
      clientY: options?.clientY,
      preventDefault() {},
      stopPropagation() {},
      target: this,
      currentTarget: this
    };
    listeners.forEach((listener) => listener(event));
  }

  setPointerCapture(_pointerId: number): void {}

  releasePointerCapture(_pointerId: number): void {}

  set textContent(value: string) {
    this._textContent = value;
  }

  get textContent(): string {
    const childText = this.children.map((child) => child.textContent).join("");
    return `${this._textContent}${childText}`;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (!selector.startsWith(".")) {
      return [];
    }

    const cls = selector.slice(1);
    const matches: FakeElement[] = [];

    const visit = (node: FakeElement): void => {
      const classes = node.className.split(/\s+/).filter(Boolean);
      if (classes.includes(cls)) {
        matches.push(node);
      }

      node.children.forEach(visit);
    };

    this.children.forEach(visit);
    return matches;
  }

  setRectSize(width: number, height: number): void {
    this.rectWidth = width;
    this.rectHeight = height;
  }

  get offsetWidth(): number {
    return this.rectWidth;
  }

  get offsetHeight(): number {
    return this.rectHeight;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return {
      left: 0,
      top: 0,
      width: this.rectWidth,
      height: this.rectHeight
    };
  }

  remove(): void {
    if (!this.parent) {
      return;
    }

    const index = this.parent.children.indexOf(this);
    if (index >= 0) {
      this.parent.children.splice(index, 1);
    }
    this.parent = null;
  }

  set innerHTML(_value: string) {
    this.children = [];
    this.textContent = "";
  }
}

class FakeDocument {
  public body: FakeElement;

  private readonly listeners = new Map<string, Array<(event?: FakeEvent) => void>>();
  private readonly selection = new FakeSelection();

  constructor() {
    this.body = new FakeElement("BODY", this);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName.toUpperCase(), this);
  }

  createRange(): FakeRange {
    return new FakeRange();
  }

  getSelection(): FakeSelection {
    return this.selection;
  }

  addEventListener(type: string, listener: (event?: FakeEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: (event?: FakeEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      existing.filter((candidate) => candidate !== listener)
    );
  }

  dispatch(type: string, event: FakeEvent): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.forEach((listener) => listener(event));
  }
}

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
function createContainer(): HTMLElement {
  const document = new FakeDocument();
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container as unknown as HTMLElement;
}

// 直接载入真实样式文本，确保结构断言与当前界面契约保持一致。
const stylesCss = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRuleBlocks(css: string, selector: string): string[] {
  const rulePattern = /(^|\n)\s*([^{}]+)\{([\s\S]*?)\}/gm;
  const blocks: string[] = [];

  for (const match of css.matchAll(rulePattern)) {
    const selectorList = match[2]
      ?.replace(/\/\*[\s\S]*?\*\//g, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const block = match[3] ?? "";

    if (!selectorList?.includes(selector)) {
      continue;
    }

    blocks.push(block);
  }

  return blocks;
}

function expectRuleHasDeclarations(selector: string, declarations: string[], css: string = stylesCss): void {
  const blocks = getRuleBlocks(css, selector);
  expect(blocks.length).toBeGreaterThan(0);

  const matchedBlock = blocks.find((block) => declarations.every((declaration) => block.includes(declaration)));
  expect(matchedBlock).toBeDefined();
}

function expectRulePropertyContains(
  selector: string,
  propertyName: string,
  expectedFragment: string,
  css: string = stylesCss
): void {
  const blocks = getRuleBlocks(css, selector);
  expect(blocks.length).toBeGreaterThan(0);
  const propertyPattern = new RegExp(`${escapeRegExp(propertyName)}\\s*:\\s*([^;]+);`);

  const matchedValue = blocks
    .map((block) => block.match(propertyPattern)?.[1])
    .find((value) => value !== undefined);

  expect(matchedValue).toContain(expectedFragment);
}

function getMediaBlock(css: string, mediaQuery: string): string {
  const start = css.indexOf(mediaQuery);
  expect(start).toBeGreaterThan(-1);
  const nextMediaStart = css.indexOf("@media", start + mediaQuery.length);
  return css.slice(start, nextMediaStart === -1 ? undefined : nextMediaStart);
}

function formatForSignature(value: number): string {
  return value.toFixed(3).replace(/\.?(?:0+)$/, "");
}

function parsePixelStyle(value: string): number {
  expect(value.trim().endsWith("px")).toBe(true);
  const parsed = Number.parseFloat(value.replace("px", ""));
  expect(Number.isFinite(parsed)).toBe(true);
  return parsed;
}

function getCircleOverlapAreaRatio(firstRadius: number, secondRadius: number, distance: number): number {
  const smallerRadius = Math.min(firstRadius, secondRadius);
  const largerRadius = Math.max(firstRadius, secondRadius);

  if (distance >= firstRadius + secondRadius) {
    return 0;
  }

  if (distance <= Math.abs(largerRadius - smallerRadius)) {
    return 1;
  }

  const firstAngle = Math.acos(
    Math.max(
      -1,
      Math.min(1, (distance * distance + firstRadius * firstRadius - secondRadius * secondRadius) / (2 * distance * firstRadius))
    )
  );
  const secondAngle = Math.acos(
    Math.max(
      -1,
      Math.min(1, (distance * distance + secondRadius * secondRadius - firstRadius * firstRadius) / (2 * distance * secondRadius))
    )
  );
  const overlapArea =
    firstRadius * firstRadius * firstAngle +
    secondRadius * secondRadius * secondAngle -
    0.5 *
      Math.sqrt(
        Math.max(
          0,
          (-distance + firstRadius + secondRadius) *
            (distance + firstRadius - secondRadius) *
            (distance - firstRadius + secondRadius) *
            (distance + firstRadius + secondRadius)
        )
      );

  return overlapArea / (Math.PI * smallerRadius * smallerRadius);
}

function getOrbRadiusByClassName(className: string): number {
  if (className.includes("glitter-home-stage__pool-orb--xxxl")) {
    return 216 / 2;
  }
  if (className.includes("glitter-home-stage__pool-orb--xxl")) {
    return 190 / 2;
  }
  if (className.includes("glitter-home-stage__pool-orb--xl")) {
    return 166 / 2;
  }
  if (className.includes("glitter-home-stage__pool-orb--lg")) {
    return 144 / 2;
  }
  if (className.includes("glitter-home-stage__pool-orb--md")) {
    return 124 / 2;
  }
  if (className.includes("glitter-home-stage__pool-orb--sm")) {
    return 106 / 2;
  }

  return 88 / 2;
}

function getOrbRadius(orbEl: OrbElement): number {
  const explicitWidth = orbEl.style.getPropertyValue("width").trim();
  if (explicitWidth.endsWith("px")) {
    return parsePixelStyle(explicitWidth) / 2;
  }

  return getOrbRadiusByClassName(orbEl.className);
}

function getDocumentFromContainer(container: HTMLElement): FakeDocument {
  return (container as unknown as { ownerDocument: FakeDocument }).ownerDocument;
}

function getDocumentSelection(container: HTMLElement): FakeSelection {
  return getDocumentFromContainer(container).getSelection();
}

function getPointerPosition(
  orbEl: HTMLElement & { style: OrbStyleLike }
): { clientX: number; clientY: number } {
  return {
    clientX: parsePixelStyle(orbEl.style.left),
    clientY: parsePixelStyle(orbEl.style.top)
  };
}

function dispatchPointerMove(container: HTMLElement, options: { pointerId?: number; clientX: number; clientY: number }): void {
  getDocumentFromContainer(container).dispatch("pointermove", {
    pointerId: options.pointerId ?? 1,
    clientX: options.clientX,
    clientY: options.clientY,
    preventDefault() {},
    stopPropagation() {}
  });
}

function dispatchPointerUp(container: HTMLElement, options?: { pointerId?: number; clientX?: number; clientY?: number }): void {
  getDocumentFromContainer(container).dispatch("pointerup", {
    pointerId: options?.pointerId ?? 1,
    clientX: options?.clientX,
    clientY: options?.clientY,
    preventDefault() {},
    stopPropagation() {}
  });
}

function dispatchPointerCancel(
  container: HTMLElement,
  options?: { pointerId?: number; clientX?: number; clientY?: number }
): void {
  getDocumentFromContainer(container).dispatch("pointercancel", {
    pointerId: options?.pointerId ?? 1,
    clientX: options?.clientX,
    clientY: options?.clientY,
    preventDefault() {},
    stopPropagation() {}
  });
}

function setPopulatedStageSize(container: HTMLElement, width: number, height: number): void {
  const stage = container.querySelector(".glitter-home-stage__pool-stage") as
    | (HTMLElement & { setRectSize?: (rectWidth: number, rectHeight: number) => void })
    | null;

  expect(stage).not.toBeNull();
  stage!.style.setProperty("width", `${width}px`);
  stage!.style.setProperty("height", `${height}px`);
  if (typeof stage!.setRectSize === "function") {
    stage!.setRectSize(width, height);
  }
}

function getPopulatedStageSize(container: HTMLElement): { width: number; height: number } {
  const stage = container.querySelector(".glitter-home-stage__pool-stage") as
    | (HTMLElement & {
        style: FakeStyle;
        getBoundingClientRect?: () => { width?: number; height?: number };
        offsetWidth?: number;
        offsetHeight?: number;
      })
    | null;

  expect(stage).not.toBeNull();

  const derivedWidth = stage!.style.getPropertyValue("--glitter-home-derived-stage-width").trim();
  const derivedHeight = stage!.style.getPropertyValue("--glitter-home-derived-stage-height").trim();
  if (derivedWidth.endsWith("px") && derivedHeight.endsWith("px")) {
    return {
      width: parsePixelStyle(derivedWidth),
      height: parsePixelStyle(derivedHeight)
    };
  }

  const styleWidth = stage!.style.getPropertyValue("width").trim();
  const styleHeight = stage!.style.getPropertyValue("height").trim();
  if (styleWidth.endsWith("px") && styleHeight.endsWith("px")) {
    return {
      width: parsePixelStyle(styleWidth),
      height: parsePixelStyle(styleHeight)
    };
  }

  const rect = stage!.getBoundingClientRect?.();
  if (rect?.width && rect?.height) {
    return { width: rect.width, height: rect.height };
  }

  const offsetWidth = stage!.offsetWidth ?? 0;
  const offsetHeight = stage!.offsetHeight ?? 0;
  if (offsetWidth > 0 && offsetHeight > 0) {
    return {
      width: offsetWidth,
      height: offsetHeight
    };
  }

  return {
    width: 660,
    height: 420
  };
}

function collectOrbGeometry(container: HTMLElement): Array<{
  element: OrbElement;
  centerX: number;
  centerY: number;
  radius: number;
}> {
  const allOrbs = Array.from(container.querySelectorAll(".glitter-home-stage__pool-orb")) as Array<
    OrbElement
  >;

  return allOrbs
    .filter((orbEl) => orbEl.style.getPropertyValue("opacity") !== "0")
    .map((orbEl) => ({
      element: orbEl,
      centerX: parsePixelStyle(orbEl.style.left),
      centerY: parsePixelStyle(orbEl.style.top),
      radius: getOrbRadius(orbEl)
    }));
}

function getPrimaryOrbElement(
  container: HTMLElement
): (HTMLElement & { className: string; style: FakeStyle; pointerdown: (options?: { pointerId?: number; clientX?: number; clientY?: number }) => void }) {
  const primaryOrb = container.querySelector(".glitter-home-stage__primary-orb") as
    | (HTMLElement & {
        className: string;
        style: FakeStyle;
        pointerdown: (options?: { pointerId?: number; clientX?: number; clientY?: number }) => void;
      })
    | null;

  expect(primaryOrb).not.toBeNull();
  return primaryOrb!;
}

function getNearestSupportingOrbElement(
  container: HTMLElement
): OrbElement {
  const geometry = collectOrbGeometry(container);
  const primaryOrb = geometry.find((orb) => orb.element.className.includes("glitter-home-stage__primary-orb"));
  expect(primaryOrb).toBeDefined();

  const nearestSupportingOrb = geometry
    .filter((orb) => !orb.element.className.includes("glitter-home-stage__primary-orb"))
    .sort(
      (left, right) =>
        Math.hypot(left.centerX - primaryOrb!.centerX, left.centerY - primaryOrb!.centerY) -
        Math.hypot(right.centerX - primaryOrb!.centerX, right.centerY - primaryOrb!.centerY)
    )[0]?.element;

  expect(nearestSupportingOrb).toBeDefined();
  return nearestSupportingOrb!;
}

function getLargestLeftSupportingOrbElement(
  container: HTMLElement,
  stageWidth: number
): OrbElement {
  const leftSupportingOrb = collectOrbGeometry(container)
    .filter(
      (orb) =>
        !orb.element.className.includes("glitter-home-stage__primary-orb") && orb.centerX < stageWidth / 2
    )
    .sort((left, right) => right.radius - left.radius || right.centerX - left.centerX)[0]?.element;

  expect(leftSupportingOrb).toBeDefined();
  return leftSupportingOrb!;
}

function parseStyleNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^-?\d+(?:\.\d+)?px$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }

  return null;
}

function measureTextUnits(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    if (/\s/.test(char)) {
      return sum + 0.33;
    }
    if (/[0-9A-Za-z]/.test(char)) {
      return sum + 0.62;
    }
    if (/[\u2E80-\u9FFF]/u.test(char)) {
      return sum + 1;
    }

    return sum + 0.8;
  }, 0);
}

function getOrbTextFitMetrics(
  orbEl: OrbElement
): {
  label: string;
  count: string;
  availableWidth: number;
  availableHeight: number;
  requiredCountWidth: number;
  requiredHeight: number;
  labelLineCount: number;
  fits: boolean;
} {
  const diameter = getOrbRadius(orbEl) * 2;
  const shellInset =
    parseStyleNumber(orbEl.style.getPropertyValue("--glitter-home-orb-shell-inset")) ??
    (orbEl.className.includes("glitter-home-stage__primary-orb") ? 14 : 16);
  const textPadding = parseStyleNumber(orbEl.style.getPropertyValue("--glitter-home-orb-text-padding")) ?? 10;
  const textGap =
    parseStyleNumber(orbEl.style.getPropertyValue("--glitter-home-orb-text-gap")) ??
    (orbEl.className.includes("glitter-home-stage__primary-orb") ? 6 : 4);
  const nameFontSize = parseStyleNumber(orbEl.style.getPropertyValue("--glitter-home-orb-name-font-size")) ?? 10;
  const countFontSize = parseStyleNumber(orbEl.style.getPropertyValue("--glitter-home-orb-count-font-size")) ?? 16;
  const nameLineHeight = parseStyleNumber(orbEl.style.getPropertyValue("--glitter-home-orb-name-line-height")) ?? 1.15;
  const countLineHeight = parseStyleNumber(orbEl.style.getPropertyValue("--glitter-home-orb-count-line-height")) ?? 1;
  const label = orbEl.querySelector(".glitter-home-stage__pool-orb-name")?.textContent ?? "";
  const count = orbEl.querySelector(".glitter-home-stage__pool-orb-count")?.textContent ?? "";
  const contentBoxSize = Math.max(0, diameter - shellInset * 2);
  const availableWidth = Math.max(0, contentBoxSize - textPadding * 2);
  const availableHeight = Math.max(0, contentBoxSize - textPadding * 2);
  const labelUnitsPerLine = Math.max(1, Math.floor(availableWidth / nameFontSize));
  const labelLineCount = label ? Math.ceil(measureTextUnits(label) / labelUnitsPerLine) : 0;
  const requiredLabelHeight = label ? labelLineCount * nameFontSize * nameLineHeight : 0;
  const requiredCountWidth = measureTextUnits(count) * countFontSize;
  const requiredHeight = requiredLabelHeight + (label && count ? textGap : 0) + countFontSize * countLineHeight;

  return {
    label,
    count,
    availableWidth,
    availableHeight,
    requiredCountWidth,
    requiredHeight,
    labelLineCount,
    fits: availableWidth >= requiredCountWidth && availableHeight >= requiredHeight
  };
}

function expectOrbTextFits(orbEl: OrbElement): void {
  const metrics = getOrbTextFitMetrics(orbEl);

  expect(
    metrics.fits,
    `${metrics.label} / ${metrics.count} requires ${metrics.requiredHeight.toFixed(2)}x${metrics.requiredCountWidth.toFixed(2)} inside ${metrics.availableHeight.toFixed(2)}x${metrics.availableWidth.toFixed(2)}`
  ).toBe(true);
}

function getOrbShift(orbEl: HTMLElement & { style: OrbStyleLike }): { x: number; y: number } {
  return {
    x: parseStyleNumber(orbEl.style.getPropertyValue("--glitter-home-orb-shift-x")) ?? 0,
    y: parseStyleNumber(orbEl.style.getPropertyValue("--glitter-home-orb-shift-y")) ?? 0
  };
}

function getOrbShiftMagnitude(orbEl: HTMLElement & { style: OrbStyleLike }): number {
  const shift = getOrbShift(orbEl);
  return Math.hypot(shift.x, shift.y);
}

function getDisplayedPointerPosition(
  orbEl: HTMLElement & { style: OrbStyleLike }
): { clientX: number; clientY: number } {
  const position = getPointerPosition(orbEl);
  const shift = getOrbShift(orbEl);

  return {
    clientX: position.clientX + shift.x,
    clientY: position.clientY + shift.y
  };
}

function expectOrbGeometryConstraints(
  orbs: Array<{
    element: OrbElement;
    centerX: number;
    centerY: number;
    radius: number;
  }>,
  stageWidth: number,
  stageHeight: number,
  options: {
    requireGap?: boolean;
    maxOverlapAreaRatio?: number;
    edgeGap?: number;
    enforceSupportDistance?: boolean;
  } = {}
): void {
  const centerX = stageWidth / 2;
  const centerY = stageHeight / 2;
  const safeEdgeGap = options.edgeGap ?? 18;
  const interOrbGap = 20;
  const supportMaxDistance = Math.min(stageWidth, stageHeight) * 0.62;
  const requireGap = options.requireGap ?? true;
  const maxOverlapAreaRatio = options.maxOverlapAreaRatio ?? 0;
  const enforceSupportDistance = options.enforceSupportDistance ?? true;

  expect(orbs.length).toBeGreaterThan(0);

  const primary = orbs.find((orb) => orb.element.className.includes("glitter-home-stage__primary-orb"));
  expect(primary).toBeDefined();

  for (const orb of orbs) {
    expect(orb.centerX).toBeGreaterThanOrEqual(orb.radius + safeEdgeGap);
    expect(orb.centerX).toBeLessThanOrEqual(stageWidth - orb.radius - safeEdgeGap);
    expect(orb.centerY).toBeGreaterThanOrEqual(orb.radius + safeEdgeGap);
    expect(orb.centerY).toBeLessThanOrEqual(stageHeight - orb.radius - safeEdgeGap);
  }

  for (let i = 0; i < orbs.length; i += 1) {
    for (let j = i + 1; j < orbs.length; j += 1) {
      const first = orbs[i]!;
      const second = orbs[j]!;
      const distance = Math.hypot(first.centerX - second.centerX, first.centerY - second.centerY);
      const radiusSum = first.radius + second.radius;

      if (requireGap) {
        expect(distance).toBeGreaterThanOrEqual(radiusSum + interOrbGap - 0.001);
        continue;
      }

      expect(distance).toBeGreaterThan(0);
      const overlapAreaRatio = getCircleOverlapAreaRatio(first.radius, second.radius, distance);
      expect(overlapAreaRatio).toBeLessThanOrEqual(maxOverlapAreaRatio + 0.001);
    }
  }

  expect(Math.abs(primary!.centerX - centerX)).toBeLessThanOrEqual(0.001);

  const supporting = orbs.filter((orb) => !orb.element.className.includes("glitter-home-stage__primary-orb"));
  expect(supporting.length).toBeGreaterThan(0);

  if (enforceSupportDistance) {
    supporting.forEach((orb) => {
      const distanceFromCenter = Math.hypot(orb.centerX - centerX, orb.centerY - centerY);
      expect(distanceFromCenter).toBeLessThanOrEqual(supportMaxDistance + 0.001);
    });
  }
}

// 覆盖渲染单元在主要状态分支下的结构与交互契约。
describe("renderHomeView", () => {
  it("builds populated-home topbar search metadata and four static controls", () => {
    const populatedTopbar = buildHomeViewState("home-populated").topbar as unknown as {
      search?: { placeholder: string };
      controls?: Array<{ id: string; label: string; kind: "text" | "icon" }>;
    };
    const emptyTopbar = buildHomeViewState("home-empty").topbar as unknown as {
      search?: { placeholder: string };
      controls?: Array<{ id: string; label: string; kind: "text" | "icon" }>;
    };

    expect(populatedTopbar.search?.placeholder).toBe("可搜索标题/标签/池名，按状态筛选。");
    expect(populatedTopbar.controls).toEqual([
      { id: "view-switch", label: "切换视图", kind: "text" },
      { id: "settings", label: "设置", kind: "text" },
      { id: "file-filter", label: "已引用 / 已建文件快速筛选", kind: "icon" }
    ]);
    expect(emptyTopbar.controls).toEqual([]);
    expect(emptyTopbar.search).toBeUndefined();
  });

  it("returns the rendered stage element and does not set dataset.glitterTheme", () => {
    const container = createContainer();

    const stage = renderHomeView(container, buildHomeViewState("home-empty"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    expect(stage).toBe((container as unknown as { children: HTMLElement[] }).children[0]);
    expect(stage.className).toContain("glitter-home-stage");
    expect(stage.className).toContain("glitter-home-stage--empty");
    expect(stage.dataset.glitterTheme).toBeUndefined();
  });

  it("safely detaches the previous stage tree when rerendering without empty()", () => {
    const container = createContainer();
    const actions = {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    };

    renderHomeView(container, buildHomeViewState("home-empty"), actions);
    const previousStage = (container as unknown as { children: FakeElement[] }).children[0] ?? null;

    expect(previousStage).not.toBeNull();
    expect(previousStage?.parent).toBe(container as unknown as FakeElement);

    renderHomeView(container, buildHomeViewState("home-populated"), actions);

    expect(previousStage?.parent).toBeNull();
    expect((container as unknown as { children: FakeElement[] }).children).not.toContain(previousStage);
  });

  it("prefers the CSS prop bridge when applying a runtime theme snapshot", () => {
    const container = createContainer();
    const target = getDocumentFromContainer(container).createElement("div") as unknown as HTMLElement & {
      dataset: Record<string, string>;
      style: FakeStyle;
    };

    applyThemeSnapshot(target, {
      mode: "obsidian-dark",
      baseBackground: "#111729",
      secondaryBackground: "#162034",
      accent: "#7397ff",
      accentHover: "#8ea9e3",
      textNormal: "#dce5ff",
      textMuted: "#aeb7d0"
    });

    expect(target.dataset.glitterTheme).toBe("obsidian-dark");
    expect(target.style.setCssPropsCallCount).toBeGreaterThan(0);
    expect(target.style.getPropertyValue("--glitter-runtime-bg-base")).toBe("#111729");
    expect(target.style.getPropertyValue("--glitter-runtime-text-muted")).toBe("#aeb7d0");
  });

  it("matches rule blocks when a block comment sits directly above the selector", () => {
    const css = "/* stage contract */\n.glitter-home-stage {\n  display: grid;\n  align-content: stretch;\n}";
    const blocks = getRuleBlocks(css, ".glitter-home-stage");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("display: grid;");
    expect(blocks[0]).toContain("align-content: stretch;");
  });

  it("keeps populated pool orb fills background-directed while rendering a circular diffuse static backdrop mist", () => {
    const homeStageBlock = getRuleBlocks(stylesCss, ".glitter-home-stage").join("\n");
    const lightThemeBlock = getRuleBlocks(stylesCss, '.glitter-home-stage[data-glitter-theme="obsidian-light"]').join("\n");
    const populatedBackdropBlock = getRuleBlocks(
      stylesCss,
      ".glitter-home-stage--populated .glitter-home-stage__orb-region::before"
    ).join("\n");
    const waterSurfaceBlock = getRuleBlocks(stylesCss, ".glitter-home-stage__water-surface").join("\n");
    const glowBlock = getRuleBlocks(stylesCss, ".glitter-home-stage__empty-field-glow").join("\n");

    expect(stylesCss).toContain("--glitter-runtime-bg-base: var(--background-primary, #111729);");
    expect(stylesCss).toContain("--glitter-runtime-accent: var(--interactive-accent, #7397ff);");
    expect(stylesCss).toContain("--glitter-runtime-text-normal: var(--text-normal, #dce5ff);");
    expect(stylesCss).toContain("--glitter-home-empty-halo: color-mix(in srgb, var(--glitter-runtime-accent)");
    expect(stylesCss).toContain(".glitter-home-stage[data-glitter-theme=\"obsidian-light\"] {");
    expect(homeStageBlock).toContain("--glitter-home-stage-sample-layer-1:");
    expect(homeStageBlock).toContain("--glitter-home-stage-sample-layer-2:");
    expect(homeStageBlock).toContain(
      "color-mix(in srgb, var(--glitter-runtime-bg-secondary) 18%, white 6%) 0%"
    );
    expect(homeStageBlock).toContain(
      "color-mix(in srgb, var(--glitter-runtime-bg-base) 84%, white 12%) 0%"
    );
    expect(lightThemeBlock).toContain("--glitter-home-stage-sample-layer-1:");
    expect(lightThemeBlock).toContain("--glitter-home-stage-sample-layer-2:");
    expect(lightThemeBlock).toContain(
      "color-mix(in srgb, var(--glitter-runtime-bg-secondary) 8%, white 92%) 0%"
    );
    expect(lightThemeBlock).toContain(
      "color-mix(in srgb, var(--glitter-runtime-bg-base) 3%, white 97%) 0%"
    );
    expect(stylesCss).not.toContain("color-mix(in srgb, var(--glitter-runtime-accent) 16%, transparent) 0%");
    expect(stylesCss).not.toContain("color-mix(in srgb, var(--glitter-home-empty-halo) 34%, transparent) 0%");
    expect(homeStageBlock).toContain("background-color: var(--glitter-runtime-bg-base);");
    expect(homeStageBlock).not.toContain("background-image:");
    expect(homeStageBlock).toContain("--glitter-home-center-field-layer-1:");
    expect(homeStageBlock).toContain("--glitter-home-center-field-layer-2:");
    expect(homeStageBlock).toContain("--glitter-home-center-field-glow-layer-1:");
    expect(homeStageBlock).toContain("--glitter-home-center-field-glow-layer-2:");
    expect(homeStageBlock).toContain(
      "circle at 50% 50%"
    );
    expect(homeStageBlock).toContain(
      "color-mix(in srgb, var(--glitter-runtime-bg-secondary) 18%, white 6%) 0%"
    );
    expect(homeStageBlock).toContain(
      "color-mix(in srgb, var(--glitter-runtime-bg-base) 88%, white 8%) 0%"
    );
    expect(lightThemeBlock).toContain("--glitter-home-center-field-layer-1:");
    expect(lightThemeBlock).toContain("--glitter-home-center-field-layer-2:");
    expect(lightThemeBlock).toContain("--glitter-home-center-field-glow-layer-1:");
    expect(lightThemeBlock).toContain("--glitter-home-center-field-glow-layer-2:");
    expect(lightThemeBlock).toContain(
      "circle at 50% 50%"
    );
    expect(lightThemeBlock).toContain(
      "color-mix(in srgb, var(--glitter-runtime-bg-secondary) 6%, white 94%) 0%"
    );
    expect(lightThemeBlock).toContain(
      "color-mix(in srgb, var(--glitter-runtime-bg-base) 2%, white 98%) 0%"
    );
    expect(populatedBackdropBlock).toContain(
      "background-image:\n    var(--glitter-home-center-field-layer-1),\n    var(--glitter-home-center-field-layer-2);"
    );
    expect(populatedBackdropBlock).toContain("left: 50%;");
    expect(populatedBackdropBlock).toContain("top: 50%;");
    expect(populatedBackdropBlock).toContain("aspect-ratio: 1 / 1;");
    expect(populatedBackdropBlock).toContain("background-position:\n    50% 50%,\n    50% 50%;");
    expect(populatedBackdropBlock).toContain("background-size:\n    100% 100%,\n    100% 100%;");
    expect(populatedBackdropBlock).toContain("filter: blur(42px);");
    expect(populatedBackdropBlock).toContain("opacity: 0.66;");
    expect(populatedBackdropBlock).not.toContain("animation:");
    expect(stylesCss).not.toContain("@keyframes glitter-home-stage-backdrop-drift {");
    expect(waterSurfaceBlock).toContain(
      "background-image:\n    var(--glitter-home-stage-sample-layer-1),\n    var(--glitter-home-stage-sample-layer-2);"
    );
    expect(glowBlock).toContain(
      "background:\n    var(--glitter-home-center-field-glow-layer-1),\n    var(--glitter-home-center-field-glow-layer-2);"
    );
    expect(glowBlock).toContain("filter: blur(24px);");
    expect(glowBlock).toContain("opacity: 0.94;");
  });

  it("keeps the empty prompt pointer icon and roomier empty-orb copy spacing", () => {
    expect(stylesCss).toContain("M4 4l7.07 17 2.51-7.39L21 11.07z");

    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-content", ["gap: 9px;"]);
    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-content-title", [
      "font-size: clamp(15px, 2vw, 18px);"
    ]);

    const narrowOrShortViewportBlock = getMediaBlock(
      stylesCss,
      "@media (max-width: 640px), (max-height: 820px) {"
    );
    expectRuleHasDeclarations(
      ".glitter-home-stage__empty-orb-content-title",
      ["font-size: clamp(16px, 4vw, 20px);"],
      narrowOrShortViewportBlock
    );
  });

  it("renders empty state with top-row first-use badge and centered orb composition without side helper copy or bottom action bar", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("home-empty"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    expect(container.querySelector(".glitter-home-stage__header--weak")).not.toBeNull();
    expect(container.querySelector(".glitter-home-stage__topbar-hint")).toBeNull();
    expect(container.querySelector(".glitter-home-stage__topbar-hint--empty")).toBeNull();
    const brand = container.querySelector(".glitter-home-stage__brand") as
      | (HTMLElement & { textContent: string; children: Array<{ tagName: string; textContent: string }> })
      | null;

    expect(brand).not.toBeNull();
    expect(brand?.textContent).toBe("Glitter · 灵感池");
    expect(brand?.children).toHaveLength(1);
    expect(brand?.children[0]?.tagName).toBe("H2");

    const orbRegion = container.querySelector(".glitter-home-stage__orb-region") as
      | (HTMLElement & { children: Array<{ className: string }> })
      | null;
    const orbWrap = container.querySelector(".glitter-home-stage__orb-wrap") as
      | (HTMLElement & { children: Array<{ className: string }> })
      | null;
    const topbarActions = container.querySelector(".glitter-home-stage__topbar-actions") as
      | (HTMLElement & { parent: unknown; className: string })
      | null;
    const topbarBadge = container.querySelector(".glitter-home-stage__guide-badge--topbar") as
      | (HTMLElement & { parent: unknown; children: Array<{ className: string; textContent: string }> })
      | null;
    expect(orbRegion).not.toBeNull();
    expect(container.querySelector(".glitter-home-stage__empty-field-glow")).not.toBeNull();
    expect(orbWrap).not.toBeNull();
    expect(topbarActions).not.toBeNull();
    expect(topbarActions?.className).toContain("glitter-home-stage__topbar-actions--empty");
    expect(topbarBadge).not.toBeNull();
    expect(topbarBadge?.parent).toBe(topbarActions);
    expect(topbarBadge?.textContent).toContain("首次引导");
    expect(topbarBadge?.children[0]?.className).toContain("glitter-home-stage__guide-badge-icon");
    expect(topbarBadge?.children[1]?.className).toContain("glitter-home-stage__guide-badge-text");
    expect(topbarBadge?.children[1]?.textContent).toContain("首次引导");
    expect(container.querySelector(".glitter-home-stage__empty-guide-top")).toBeNull();
    expect(container.querySelector(".glitter-home-stage__guide-helper--side")).toBeNull();

    const emptyPromptPill = container.querySelector(".glitter-home-stage__empty-prompt-pill") as
      | (HTMLElement & { textContent: string; children: Array<{ className: string; textContent: string }> })
      | null;
    expect(emptyPromptPill).not.toBeNull();
    expect(container.querySelector(".glitter-home-stage__empty-prompt-pill--attached")).not.toBeNull();
    expect(container.querySelector(".glitter-home-stage__empty-prompt-icon")).not.toBeNull();
    expect(container.querySelector(".glitter-home-stage__empty-prompt-text")).not.toBeNull();
    expect(emptyPromptPill?.children[0]?.className).toContain("glitter-home-stage__empty-prompt-icon");
    expect(emptyPromptPill?.children[1]?.className).toContain("glitter-home-stage__empty-prompt-text");
    expect(emptyPromptPill?.children[1]?.textContent).toContain("点击空灵感球开始流程");

    const emptyHitArea = container.querySelector(".glitter-home-stage__empty-orb-hit-area") as
      | (HTMLElement & { parent: unknown; getAttribute: (name: string) => string | null })
      | null;
    const emptyBase = container.querySelector(".glitter-home-stage__empty-orb-base") as
      | (HTMLElement & { parent: unknown })
      | null;
    const emptyShell = container.querySelector(".glitter-home-stage__empty-orb-shell") as
      | (HTMLElement & { parent: unknown })
      | null;
    const emptyContent = container.querySelector(".glitter-home-stage__empty-orb-content") as
      | (HTMLElement & {
          id: string;
          parent: unknown;
          textContent: string;
          children: Array<{ className: string; textContent: string }>;
        })
      | null;

    expect(container.querySelectorAll(".glitter-home-stage__orb-ring")).toHaveLength(0);
    expect(emptyBase).not.toBeNull();
    expect(emptyShell).not.toBeNull();
    expect(emptyContent).not.toBeNull();
    expect(emptyHitArea?.getAttribute("aria-labelledby")).toBe(emptyContent?.id);
    expect(emptyBase?.parent).toBe(emptyHitArea);
    expect(emptyShell?.parent).toBe(emptyHitArea);
    expect(emptyContent?.parent).toBe(emptyHitArea);
    expect(emptyContent?.children[0]?.className).toContain("glitter-home-stage__empty-orb-content-icon");
    expect(emptyContent?.children[1]?.className).toContain("glitter-home-stage__empty-orb-content-title");
    expect(emptyContent?.children[1]?.textContent).toContain("灵感待录入");
    expect(emptyContent?.children[2]?.className).toContain("glitter-home-stage__empty-orb-content-subtitle");
    expect(emptyContent?.children[2]?.textContent).toContain("点击开始首次记录");
    expect(container.querySelector(".glitter-home-stage__orb-core")).not.toBeNull();

    expect(container.querySelector(".glitter-home-stage__action-bar")).toBeNull();
    expect(container.querySelector(".glitter-home-stage__action-primary")).toBeNull();
    expect(container.querySelector(".glitter-home-stage__action-secondary")).toBeNull();
  });

  it("renders populated home with a populated stage class and a single bottom action shell", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("home-populated"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const stage = container.querySelector(".glitter-home-stage") as
      | (HTMLElement & { className: string })
      | null;
    const actionBar = container.querySelector(".glitter-home-stage__action-bar") as
      | (HTMLElement & {
          className: string;
          children: Array<{ tagName: string; className: string; children?: Array<{ className: string; textContent?: string }> }>;
          querySelector: (selector: string) => HTMLElement | null;
        })
      | null;
    const secondaryButton = container.querySelector(".glitter-home-stage__action-secondary") as HTMLElement | null;
    const primaryButton = container.querySelector(".glitter-home-stage__action-primary") as HTMLElement | null;

    expect(stage).not.toBeNull();
    expect(stage?.className).toContain("glitter-home-stage--populated");
    expect(actionBar).not.toBeNull();
    expect(actionBar?.className).toContain("glitter-home-stage__action-bar--populated");
    expect(actionBar?.children.filter((child) => child.tagName === "BUTTON")).toHaveLength(2);
    expect(actionBar?.children[0]?.className).toContain("glitter-home-stage__action-secondary");
    expect(actionBar?.children[1]?.className).toContain("glitter-home-stage__action-primary");
    expect(actionBar?.querySelector(".glitter-home-stage__action-bar-shell")).toBeNull();
    expect(secondaryButton?.querySelector(".glitter-home-stage__action-icon--secondary")).not.toBeNull();
    expect(primaryButton?.querySelector(".glitter-home-stage__action-icon--primary")).not.toBeNull();
    expect(secondaryButton?.querySelector(".glitter-home-stage__action-label")?.textContent).toBe("创建池");
    expect(primaryButton?.querySelector(".glitter-home-stage__action-label")?.textContent).toBe("灵感速记");
  });

  it("prefers CSS write bridge helpers for populated-home stage and orb layout writes", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("home-populated"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const orbStage = container.querySelector(".glitter-home-stage__pool-stage") as
      | (HTMLElement & { style: FakeStyle })
      | null;
    const primaryOrb = getPrimaryOrbElement(container) as HTMLElement & { style: FakeStyle };

    expect(orbStage).not.toBeNull();
    expect(orbStage?.style.setCssStylesCallCount).toBeGreaterThan(0);
    expect(orbStage?.style.setCssPropsCallCount).toBeGreaterThan(0);
    expect(primaryOrb.style.setCssStylesCallCount).toBeGreaterThan(0);
    expect(primaryOrb.style.setCssPropsCallCount).toBeGreaterThan(0);
  });

  it("renders populated topbar with a real input and submits entered query on Enter", () => {
    const container = createContainer();
    const submittedQueries: string[] = [];

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit: (query) => {
        submittedQueries.push(query);
      }
    });

    const searchShell = container.querySelector(".glitter-home-stage__topbar-search") as
      | (HTMLElement & { textContent: string })
      | null;
    const searchInput = container.querySelector(".glitter-home-stage__topbar-search-input") as
      | (HTMLElement & {
          type: string;
          value: string;
          placeholder: string;
          keydown: (key: string, options?: { isComposing?: boolean; keyCode?: number }) => void;
          getAttribute: (name: string) => string | null;
        })
      | null;
    const controls = Array.from(
      container.querySelectorAll(".glitter-home-stage__topbar-control")
    ) as Array<HTMLElement & { className: string; textContent: string; disabled: boolean; type: string }>;

    expect(searchShell).not.toBeNull();
    expect(searchShell?.querySelector(".glitter-home-stage__topbar-search-icon")).not.toBeNull();
    expect(searchShell?.querySelector(".glitter-home-stage__topbar-search-placeholder")).toBeNull();
    expect(searchInput).not.toBeNull();
    expect(searchInput?.type).toBe("text");
    expect(searchInput?.placeholder).toBe("可搜索标题/标签/池名，按状态筛选。");
    expect(searchInput?.getAttribute("aria-label")).toBe("可搜索标题/标签/池名，按状态筛选。");
    expect(container.querySelector(".glitter-home-stage__brand")?.textContent).toContain("Glitter · 灵感池");
    expect(container.querySelector(".glitter-home-stage__brand")?.textContent).not.toContain(
      "先校准主舞台、池球层级和关键操作位。"
    );

    searchInput!.value = "已创建文件";
    searchInput!.keydown("Enter");
    searchInput!.keydown("Escape");

    expect(submittedQueries).toEqual(["已创建文件"]);
    expect(controls).toHaveLength(3);
    expect(controls.map((control) => control.textContent)).toEqual([
      "切换视图",
      "设置",
      "已引用 / 已建文件快速筛选"
    ]);
  });

  it("routes the populated settings control through the home settings action", () => {
    const container = createContainer();
    const opened: string[] = [];

    renderHomeView(container, buildHomeViewState("home-populated"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {},
      onOpenSettings: () => {
        opened.push("settings");
      }
    });

    const controls = Array.from(
      container.querySelectorAll(".glitter-home-stage__topbar-control")
    ) as Array<HTMLElement & { disabled: boolean; click: () => void }>;

    expect(controls).toHaveLength(3);
    expect(controls[1]?.disabled).toBe(false);

    controls[1]?.click();

    expect(opened).toEqual(["settings"]);
  });

  it("routes the populated status icon through the home status-filter action", () => {
    const container = createContainer();
    const statusSelections: string[] = [];

    renderHomeView(container, buildHomeViewState("home-populated"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {},
      onStatusFilterSelect: () => {
        statusSelections.push("opened");
      }
    });

    const controls = Array.from(
      container.querySelectorAll(".glitter-home-stage__topbar-control")
    ) as Array<HTMLElement & { disabled: boolean; click: () => void }>;

    expect(controls).toHaveLength(3);
    expect(controls[2]?.disabled).toBe(false);

    controls[2]?.click();

    expect(statusSelections).toEqual(["opened"]);
  });

  it("opens the populated field-view menu directly below the trigger, keeps the current view selected, and routes selection", () => {
    const container = createContainer();
    const selectedViews: string[] = [];

    renderHomeView(container, buildHomeViewState("home-populated", { homeFieldView: "spring-rain" }), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {},
      onFieldViewSelect: (homeFieldView) => {
        selectedViews.push(homeFieldView);
      }
    });

    const controls = Array.from(
      container.querySelectorAll(".glitter-home-stage__topbar-control")
    ) as Array<HTMLElement & { disabled: boolean; click: () => void }>;
    const controlSlots = Array.from(
      container.querySelectorAll(".glitter-home-stage__topbar-control-slot")
    ) as Array<HTMLElement & { className: string; querySelector: (selector: string) => FakeElement | null }>;
    const fieldViewMenu = container.querySelector(".glitter-home-stage__field-view-menu") as
      | (HTMLElement & { className: string; getAttribute: (name: string) => string | null })
      | null;
    const fieldViewOptions = Array.from(container.querySelectorAll(".glitter-home-stage__field-view-option")) as Array<
      HTMLElement & { className: string; textContent: string; click: () => void }
    >;

    expect(controls).toHaveLength(3);
    expect(controls[0]?.disabled).toBe(false);
    expect(fieldViewMenu?.getAttribute("aria-hidden")).toBe("true");
    expect(fieldViewOptions.map((option) => option.textContent)).toEqual(["圆满", "涟漪"]);
    expect(fieldViewOptions[1]?.className).toContain("glitter-home-stage__field-view-option--selected");

    controls[0]?.click();

    expect(controlSlots[0]?.className).toContain("glitter-home-stage__topbar-control-slot--menu-open");
    expect(fieldViewMenu?.className).toContain("glitter-home-stage__field-view-menu--open");
    expect(fieldViewMenu?.getAttribute("aria-hidden")).toBe("false");

    fieldViewOptions[0]?.click();

    expect(selectedViews).toEqual(["water"]);
    expect(fieldViewMenu?.className).not.toContain("glitter-home-stage__field-view-menu--open");
    expect(fieldViewMenu?.getAttribute("aria-hidden")).toBe("true");
  });

  it("prefers the CSS prop bridge for spring-rain pool runtime variables", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("home-populated", { homeFieldView: "spring-rain" }), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const centeredPool = container.querySelector(".glitter-home-stage__spring-rain-pool--slot-center") as
      | (HTMLElement & { style: FakeStyle })
      | null;

    expect(centeredPool).not.toBeNull();
    expect(centeredPool?.style.setCssPropsCallCount).toBeGreaterThan(0);
  });

  it("renders spring-rain pools with a centered primary pool, visible text labels, and ripple metadata keyed by size and count tiers", () => {
    const container = createContainer();

    renderHomeView(
      container,
      buildHomeViewState("home-populated", { homeFieldView: "spring-rain" }),
      {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      }
    );

    const springRainStage = container.querySelector(".glitter-home-stage__pool-stage--spring-rain") as
      | HTMLElement
      | null;
    const pools = Array.from(container.querySelectorAll(".glitter-home-stage__spring-rain-pool")) as Array<
      HTMLElement & {
        className: string;
        dataset: Record<string, string>;
        style: OrbStyleLike;
        querySelector: (selector: string) => FakeElement | null;
      }
    >;
    const firstPool = pools[0] ?? null;
    const secondPool = pools[1] ?? null;
    const titleColumn = firstPool?.querySelector(".glitter-home-stage__spring-rain-title-column") as
      | (HTMLElement & { tagName: string })
      | null;
    const titleHitArea = firstPool?.querySelector(".glitter-home-stage__spring-rain-title-hit-area") as
      | (HTMLElement & { tagName: string; textContent: string })
      | null;
    const title = firstPool?.querySelector(".glitter-home-stage__spring-rain-title") as
      | (HTMLElement & { tagName: string })
      | null;
    const count = firstPool?.querySelector(".glitter-home-stage__spring-rain-count") as
      | (HTMLElement & { tagName: string })
      | null;
    const titleActions = firstPool?.querySelector(".glitter-home-stage__spring-rain-actions") as
      | (HTMLElement & {
          children: Array<HTMLElement & { disabled: boolean; textContent: string }>;
        })
      | null;
    const actionCorridor = firstPool?.querySelector(".glitter-home-stage__spring-rain-action-corridor") as
      | HTMLElement
      | null;
    const connector = firstPool?.querySelector(".glitter-home-stage__spring-rain-connector") as HTMLElement | null;
    const body = firstPool?.querySelector(".glitter-home-stage__spring-rain-body") as HTMLElement | null;
    const plane = firstPool?.querySelector(".glitter-home-stage__spring-rain-body-plane") as HTMLElement | null;
    const core = firstPool?.querySelector(".glitter-home-stage__spring-rain-body-core") as HTMLElement | null;
    const rippleLayer = firstPool?.querySelector(".glitter-home-stage__spring-rain-body-ripple-layer") as
      | (HTMLElement & { children: FakeElement[] })
      | null;

    expect(springRainStage).not.toBeNull();
    expect(container.querySelector(".glitter-home-stage__spring-rain-slot")).toBeNull();
    expect(pools).toHaveLength(5);
    expect(container.querySelectorAll(".glitter-home-stage__spring-rain-pool--foreground")).toHaveLength(1);
    expect(container.querySelectorAll(".glitter-home-stage__spring-rain-pool--midground")).toHaveLength(2);
    expect(container.querySelectorAll(".glitter-home-stage__spring-rain-pool--background")).toHaveLength(2);
    expect(firstPool?.className).toContain("glitter-home-stage__spring-rain-pool--slot-center");
    expect(firstPool?.dataset.springRainSlot).toBe("center");
    expect(firstPool?.dataset.textTier).toBe("7");
    expect(firstPool?.dataset.springRainSize).toBe("xxxl");
    expect(secondPool?.dataset.textTier).toBe("6");
    expect(secondPool?.dataset.springRainSize).toBe("xxl");
    expect(firstPool?.style.getPropertyValue("--glitter-home-spring-rain-origin-x")).toBe("50%");
    expect(firstPool?.style.getPropertyValue("--glitter-home-spring-rain-origin-y")).toBe("82%");
    expect(firstPool?.style.getPropertyValue("--glitter-home-spring-rain-wave-step")).toBe("0.38s");
    expect(firstPool?.style.getPropertyValue("--glitter-home-spring-rain-ripple-duration")).toBe("4.96s");
    expect(secondPool?.style.getPropertyValue("--glitter-home-spring-rain-wave-step")).not.toBe(
      firstPool?.style.getPropertyValue("--glitter-home-spring-rain-wave-step")
    );
    expect(secondPool?.style.getPropertyValue("--glitter-home-spring-rain-ripple-duration")).not.toBe(
      firstPool?.style.getPropertyValue("--glitter-home-spring-rain-ripple-duration")
    );
    expect(firstPool?.style.getPropertyValue("--glitter-home-spring-rain-body-tilt")).toBe("");
    pools.slice(1).forEach((pool) => {
      const originX = parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-x"));
      const originY = parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-y"));
      expect(originX).toBeGreaterThanOrEqual(32);
      expect(originX).toBeLessThanOrEqual(68);
      expect(originY).toBeGreaterThanOrEqual(74);
      expect(originY).toBeLessThanOrEqual(92);
    });
    expect(titleColumn?.tagName).toBe("DIV");
    expect(titleHitArea?.tagName).toBe("BUTTON");
    expect(titleHitArea?.textContent).toBe("");
    expect(titleHitArea?.getAttribute("aria-label")).toBeNull();
    expect(titleHitArea?.getAttribute("aria-labelledby")).toBe(titleColumn?.children[0]?.getAttribute("id"));
    expect(title?.tagName).toBe("SPAN");
    expect(title?.textContent).toBe("未整理");
    expect(count?.tagName).toBe("SPAN");
    expect(count?.textContent).toBe("47");
    expect(titleActions).not.toBeNull();
    expect(titleActions?.children).toHaveLength(3);
    expect(titleActions?.children.map((child) => child.textContent)).toEqual(["编辑池", "删除池", "进入池"]);
    expect(titleActions?.children[0]?.disabled).toBe(true);
    expect(titleActions?.children[1]?.disabled).toBe(true);
    expect(titleActions?.children[2]?.disabled).toBe(false);
    expect(actionCorridor).not.toBeNull();
    expect(actionCorridor?.getAttribute("aria-hidden")).toBe("true");
    expect(connector).not.toBeNull();
    expect(body).not.toBeNull();
    expect(body?.getAttribute("aria-hidden")).toBe("true");
    expect(body?.getAttribute("tabindex")).toBeNull();
    expect(body?.getAttribute("aria-label")).toBeNull();
    expect(plane).not.toBeNull();
    expect(core).toBeNull();
    expect(container.querySelector(".glitter-home-stage__spring-rain-body-core")).toBeNull();
    expect(rippleLayer).not.toBeNull();
    expect(rippleLayer?.children).toHaveLength(4);
    expect(rippleLayer?.children[0]?.className).toContain("glitter-home-stage__spring-rain-body-ripple--near");
    expect(rippleLayer?.children[1]?.className).toContain("glitter-home-stage__spring-rain-body-ripple--mid");
    expect(rippleLayer?.children[2]?.className).toContain("glitter-home-stage__spring-rain-body-ripple--far");
    expect(rippleLayer?.children[3]?.className).toContain("glitter-home-stage__spring-rain-body-ripple--outer");
    expect(container.querySelector(".glitter-home-stage__water-surface")).toBeNull();
  });

  it("keeps the centered spring-rain pool bound to the runtime highest-count primary pool instead of input order", () => {
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-low", name: "低频池", ideaCount: 4, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-high", name: "高频池", ideaCount: 31, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-mid", name: "中频池", ideaCount: 12, isDefault: true, color: DEFAULT_SETTINGS.poolColors.writing }
        ]
      },
      {
        homeFieldView: "spring-rain",
        poolColors: DEFAULT_SETTINGS.poolColors
      }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const centeredPool = container.querySelector(
      ".glitter-home-stage__spring-rain-pool--slot-center"
    ) as
      | (HTMLElement & {
          dataset: Record<string, string>;
          querySelector: (selector: string) => FakeElement | null;
        })
      | null;
    const centeredTitle = centeredPool?.querySelector(".glitter-home-stage__spring-rain-title") as HTMLElement | null;
    const centeredCount = centeredPool?.querySelector(".glitter-home-stage__spring-rain-count") as HTMLElement | null;

    expect(state.primaryOrb?.id).toBe("pool-high");
    expect(state.primaryOrb?.count).toBe(31);
    expect(centeredPool).not.toBeNull();
    expect(centeredPool?.dataset.springRainSlot).toBe("center");
    expect(centeredPool?.dataset.poolId).toBe("pool-high");
    expect(centeredTitle?.textContent).toBe("高频池");
    expect(centeredCount?.textContent).toBe("31");
  });

  it("keeps the full spring-rain supporting slot ring clustered around the centered primary pool", () => {
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-80", name: "主池", ideaCount: 80, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-60", name: "产品", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-44", name: "研究", ideaCount: 44, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-36", name: "写作", ideaCount: 36, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-28", name: "待整理", ideaCount: 28, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-20", name: "侧记", ideaCount: 20, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-12", name: "片段", ideaCount: 12, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-6", name: "零散", ideaCount: 6, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing }
        ]
      },
      {
        homeFieldView: "spring-rain",
        poolColors: DEFAULT_SETTINGS.poolColors
      }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const pools = Array.from(container.querySelectorAll(".glitter-home-stage__spring-rain-pool")) as Array<
      HTMLElement & {
        dataset: Record<string, string>;
        style: OrbStyleLike;
      }
    >;
    const centeredPool = pools.find((pool) => pool.dataset.springRainSlot === "center") ?? null;

    expect(pools).toHaveLength(8);
    expect(centeredPool?.dataset.poolId).toBe("pool-80");

    const supportingCoordinates = pools
      .filter((pool) => pool.dataset.springRainSlot !== "center")
      .map((pool) => {
        const originX = parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-x"));
        const originY = parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-y"));
        expect(originX).toBeGreaterThanOrEqual(30);
        expect(originX).toBeLessThanOrEqual(72);
        expect(originY).toBeGreaterThanOrEqual(66);
        expect(originY).toBeLessThanOrEqual(92);
        return { originX, originY };
      });

    supportingCoordinates.forEach((coordinate, index) => {
      supportingCoordinates.slice(index + 1).forEach((nextCoordinate) => {
        expect(
          Math.hypot(coordinate.originX - nextCoordinate.originX, coordinate.originY - nextCoordinate.originY)
        ).toBeGreaterThan(6);
      });
    });
  });

  it("keeps supporting spring-rain slot jitter stable across renders while offsetting pools away from raw template coordinates", () => {
    const buildState = () =>
      buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-80", name: "主池", ideaCount: 80, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
            { id: "pool-60", name: "产品", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
            { id: "pool-44", name: "研究", ideaCount: 44, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
            { id: "pool-36", name: "写作", ideaCount: 36, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
            { id: "pool-28", name: "待整理", ideaCount: 28, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
            { id: "pool-20", name: "侧记", ideaCount: 20, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
            { id: "pool-12", name: "片段", ideaCount: 12, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
            { id: "pool-6", name: "零散", ideaCount: 6, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing }
          ]
        },
        {
          homeFieldView: "spring-rain",
          poolColors: DEFAULT_SETTINGS.poolColors
        }
      );

    const collectSupportingCoordinates = (container: HTMLElement) =>
      (Array.from(container.querySelectorAll(".glitter-home-stage__spring-rain-pool")) as Array<
        HTMLElement & { dataset: Record<string, string>; style: OrbStyleLike }
      >)
        .filter((pool) => pool.dataset.springRainSlot !== "center")
        .map((pool) => ({
          poolId: pool.dataset.poolId,
          slot: pool.dataset.springRainSlot,
          x: parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-x")),
          y: parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-y"))
        }));

    const rawSlotCoordinates = new Map([
      ["northwest", { x: 40.5, y: 75.5 }],
      ["northeast", { x: 59.5, y: 76 }],
      ["southeast", { x: 63.5, y: 88 }],
      ["southwest", { x: 36.5, y: 89 }],
      ["north", { x: 50, y: 68.5 }],
      ["east", { x: 68, y: 81 }],
      ["west", { x: 32, y: 82 }]
    ]);

    const firstContainer = createContainer();
    const secondContainer = createContainer();

    renderHomeView(firstContainer, buildState(), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });
    renderHomeView(secondContainer, buildState(), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const firstCoordinates = collectSupportingCoordinates(firstContainer);
    const secondCoordinates = collectSupportingCoordinates(secondContainer);

    expect(firstCoordinates).toHaveLength(7);
    expect(secondCoordinates).toEqual(firstCoordinates);
    firstCoordinates.forEach(({ slot, x, y }) => {
      const raw = rawSlotCoordinates.get(slot);
      expect(raw).toBeDefined();
      expect(x === raw?.x && y === raw?.y).toBe(false);
    });
  });

  it("keeps extra spring-rain pools spreading outward from the centered primary pool after the first ring fills", () => {
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-90", name: "主池", ideaCount: 90, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-70", name: "产品", ideaCount: 70, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-60", name: "研究", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-50", name: "写作", ideaCount: 50, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-40", name: "待整理", ideaCount: 40, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-30", name: "侧记", ideaCount: 30, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-20", name: "片段", ideaCount: 20, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-10", name: "零散", ideaCount: 10, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-9", name: "草稿", ideaCount: 9, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-8", name: "归档", ideaCount: 8, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product }
        ]
      },
      {
        homeFieldView: "spring-rain",
        poolColors: DEFAULT_SETTINGS.poolColors
      }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const pools = Array.from(container.querySelectorAll(".glitter-home-stage__spring-rain-pool")) as Array<
      HTMLElement & {
        dataset: Record<string, string>;
        style: OrbStyleLike;
      }
    >;
    const centeredPool = pools.find((pool) => pool.dataset.springRainSlot === "center") ?? null;
    const nonCenterPools = pools.filter((pool) => pool.dataset.springRainSlot !== "center");
    const groupedBySlot = new Map<
      string,
      Array<{ x: number; y: number; distanceFromCenter: number }>
    >();
    const coordinates = nonCenterPools.map((pool) => {
      const x = parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-x"));
      const y = parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-y"));
      const distanceFromCenter = Math.hypot(x - 50, y - 82);
      const slotEntries = groupedBySlot.get(pool.dataset.springRainSlot) ?? [];
      slotEntries.push({ x, y, distanceFromCenter });
      groupedBySlot.set(pool.dataset.springRainSlot, slotEntries);
      return { x, y };
    });

    expect(pools).toHaveLength(10);
    expect(centeredPool?.dataset.poolId).toBe("pool-90");
    expect(new Set(coordinates.map(({ x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`)).size).toBe(nonCenterPools.length);
    expect(nonCenterPools.some((pool) => parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-x")) < 50)).toBe(true);
    expect(nonCenterPools.some((pool) => parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-x")) > 50)).toBe(true);
    expect(nonCenterPools.some((pool) => parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-y")) < 82)).toBe(true);
    expect(nonCenterPools.some((pool) => parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-y")) > 82)).toBe(true);

    nonCenterPools.forEach((pool) => {
      const originX = parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-x"));
      const originY = parsePercent(pool.style.getPropertyValue("--glitter-home-spring-rain-origin-y"));
      expect(originX).toBeGreaterThanOrEqual(22);
      expect(originX).toBeLessThanOrEqual(78);
      expect(originY).toBeGreaterThanOrEqual(59);
      expect(originY).toBeLessThanOrEqual(94);
    });

    Array.from(groupedBySlot.values())
      .filter((slotEntries) => slotEntries.length > 1)
      .forEach((slotEntries) => {
        expect(slotEntries[1]?.distanceFromCenter).toBeGreaterThan(slotEntries[0]?.distanceFromCenter ?? 0);
      });
  });

  it("toggles spring-rain focused and muted classes from body hover and clears them on pointerleave", () => {
    vi.useFakeTimers();

    try {
      const container = createContainer();

      renderHomeView(
        container,
        buildHomeViewState("home-populated", { homeFieldView: "spring-rain" }),
        {
          onPrimaryAction() {},
          onSecondaryAction() {},
          onPoolSelect() {},
          onSearchSubmit() {}
        }
      );

      const pools = Array.from(container.querySelectorAll(".glitter-home-stage__spring-rain-pool")) as Array<
        HTMLElement & { className: string; querySelector: (selector: string) => FakeElement | null }
      >;
      const activePool = pools[0] ?? null;
      const siblingPool = pools[1] ?? null;
      const body = activePool?.querySelector(".glitter-home-stage__spring-rain-body") as
        | (HTMLElement & { dispatch: (type: string) => void })
        | null;

      expect(activePool).not.toBeNull();
      expect(siblingPool).not.toBeNull();
      expect(body).not.toBeNull();

      body?.dispatch("pointerenter");

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

      body?.dispatch("pointerleave");
      vi.advanceTimersByTime(119);

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

      vi.advanceTimersByTime(1);

      expect(activePool?.className).not.toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).not.toContain("glitter-home-stage__spring-rain-pool--muted");
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies the same spring-rain focus preview from title focus and clears it on blur", () => {
    const container = createContainer();

    renderHomeView(
      container,
      buildHomeViewState("home-populated", { homeFieldView: "spring-rain" }),
      {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      }
    );

    const pools = Array.from(container.querySelectorAll(".glitter-home-stage__spring-rain-pool")) as Array<
      HTMLElement & { className: string; querySelector: (selector: string) => FakeElement | null }
    >;
    const activePool = pools[0] ?? null;
    const siblingPool = pools[1] ?? null;
    const titleColumn = activePool?.querySelector(".glitter-home-stage__spring-rain-title-hit-area") as
      | (HTMLElement & { dispatch: (type: string) => void })
      | null;

    expect(activePool).not.toBeNull();
    expect(siblingPool).not.toBeNull();
    expect(titleColumn).not.toBeNull();

    titleColumn?.dispatch("focus");

    expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
    expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

    titleColumn?.dispatch("blur");

    expect(activePool?.className).not.toContain("glitter-home-stage__spring-rain-pool--focused");
    expect(siblingPool?.className).not.toContain("glitter-home-stage__spring-rain-pool--muted");
  });

  it("applies the same spring-rain focus preview from title hover and ripple hover and clears it on pointerleave", () => {
    vi.useFakeTimers();

    try {
      const container = createContainer();

      renderHomeView(
        container,
        buildHomeViewState("home-populated", { homeFieldView: "spring-rain" }),
        {
          onPrimaryAction() {},
          onSecondaryAction() {},
          onPoolSelect() {},
          onSearchSubmit() {}
        }
      );

      const pools = Array.from(container.querySelectorAll(".glitter-home-stage__spring-rain-pool")) as Array<
        HTMLElement & { className: string; querySelector: (selector: string) => FakeElement | null }
      >;
      const activePool = pools[0] ?? null;
      const siblingPool = pools[1] ?? null;
      const titleHitArea = activePool?.querySelector(".glitter-home-stage__spring-rain-title-hit-area") as
        | (HTMLElement & { dispatch: (type: string) => void })
        | null;
      const rippleLayer = activePool?.querySelector(".glitter-home-stage__spring-rain-body-ripple-layer") as
        | (HTMLElement & { dispatch: (type: string) => void })
        | null;

      expect(activePool).not.toBeNull();
      expect(siblingPool).not.toBeNull();
      expect(titleHitArea).not.toBeNull();
      expect(rippleLayer).not.toBeNull();

      titleHitArea?.dispatch("pointerenter");

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

      titleHitArea?.dispatch("pointerleave");
      vi.advanceTimersByTime(119);

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

      vi.advanceTimersByTime(1);

      expect(activePool?.className).not.toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).not.toContain("glitter-home-stage__spring-rain-pool--muted");

      rippleLayer?.dispatch("pointerenter");

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

      rippleLayer?.dispatch("pointerleave");
      vi.advanceTimersByTime(119);

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

      vi.advanceTimersByTime(1);

      expect(activePool?.className).not.toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).not.toContain("glitter-home-stage__spring-rain-pool--muted");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows spring-rain title-side actions with the same edit delete and enter semantics as the water view", () => {
    vi.useFakeTimers();

    try {
      const container = createContainer();
      const enteredPoolIds: string[] = [];
      const deletedPoolIds: string[] = [];
      const renamedPools: Array<{ poolId: string; name: string }> = [];

      renderHomeView(
        container,
        buildHomeViewState("home-populated", { homeFieldView: "spring-rain" }),
        {
          onPrimaryAction() {},
          onSecondaryAction() {},
          onPoolSelect() {},
          onPoolTitleSelect: (poolId) => {
            enteredPoolIds.push(poolId);
          },
          onPoolRename: (poolId, name) => {
            renamedPools.push({ poolId, name });
          },
          onPoolDelete: (poolId) => {
            deletedPoolIds.push(poolId);
          },
          onSearchSubmit() {}
        }
      );

      const pools = Array.from(container.querySelectorAll(".glitter-home-stage__spring-rain-pool")) as Array<
        HTMLElement & {
          className: string;
          dataset: Record<string, string>;
          querySelector: (selector: string) => FakeElement | null;
        }
      >;
      const activePool = pools[1] ?? null;
      const siblingPool = pools[0] ?? null;
      const titleHitArea = activePool?.querySelector(".glitter-home-stage__spring-rain-title-hit-area") as
        | (HTMLElement & { dispatch: (type: string, overrides?: Partial<FakeEvent>) => void })
        | null;
      const rippleLayer = activePool?.querySelector(".glitter-home-stage__spring-rain-body-ripple-layer") as
        | (HTMLElement & { dispatch: (type: string, overrides?: Partial<FakeEvent>) => void })
        | null;
      const actionRail = activePool?.querySelector(".glitter-home-stage__spring-rain-actions") as
        | (HTMLElement & {
            dispatch: (type: string, overrides?: Partial<FakeEvent>) => void;
            children: Array<HTMLElement & { textContent: string }>;
            querySelector: (selector: string) => FakeElement | null;
          })
        | null;
      const actionCorridor = activePool?.querySelector(".glitter-home-stage__spring-rain-action-corridor") as
        | (HTMLElement & { dispatch: (type: string, overrides?: Partial<FakeEvent>) => void })
        | null;
      const editButton = actionRail?.querySelector(".glitter-home-stage__pool-orb-action--edit") as
        | (FakeElement & { click: () => void; disabled: boolean })
        | null;
      const deleteButton = actionRail?.querySelector(".glitter-home-stage__pool-orb-action--delete") as
        | ({ click: () => void; disabled: boolean })
        | null;
      const enterButton = actionRail?.querySelector(".glitter-home-stage__pool-orb-action--enter") as
        | ({ click: () => void; disabled: boolean })
        | null;
      const title = activePool?.querySelector(".glitter-home-stage__spring-rain-title") as
        | (HTMLElement & {
            textContent: string;
            keydown: (key: string, options?: { isComposing?: boolean; keyCode?: number }) => void;
            getAttribute: (name: string) => string | null;
          })
        | null;

      expect(activePool).not.toBeNull();
      expect(siblingPool).not.toBeNull();
      expect(titleHitArea).not.toBeNull();
      expect(rippleLayer).not.toBeNull();
      expect(actionRail).not.toBeNull();
      expect(actionCorridor).not.toBeNull();
      expect(editButton).not.toBeNull();
      expect(deleteButton).not.toBeNull();
      expect(enterButton).not.toBeNull();
      expect(title).not.toBeNull();

      titleHitArea?.dispatch("focus");
      titleHitArea?.dispatch("blur", { relatedTarget: editButton as unknown as FakeElement });

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

      titleHitArea?.dispatch("pointerenter");
      titleHitArea?.dispatch("pointerleave", { relatedTarget: actionCorridor as unknown as FakeElement });
      actionCorridor?.dispatch("pointerleave", { relatedTarget: actionRail as unknown as FakeElement });

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

      rippleLayer?.dispatch("pointerenter");

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");
      expect(actionRail?.children.map((child) => child.textContent)).toEqual(["编辑池", "删除池", "进入池"]);

      rippleLayer?.dispatch("pointerleave");
      vi.advanceTimersByTime(60);
      actionRail?.dispatch("pointerenter");
      vi.advanceTimersByTime(200);

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");

      editButton?.click();

      expect(editButton?.disabled).toBe(false);
      expect(deleteButton?.disabled).toBe(false);
      expect(enterButton?.disabled).toBe(false);
      expect(title?.getAttribute("contenteditable")).toBe("true");
      expect(enteredPoolIds).toEqual([]);

      title!.textContent = "已编辑产品池";
      title!.keydown("Enter");

      expect(title?.getAttribute("contenteditable")).toBe("false");
      expect(renamedPools).toEqual([{ poolId: activePool?.dataset.poolId ?? "", name: "已编辑产品池" }]);

      deleteButton?.click();
      enterButton?.click();

      expect(deletedPoolIds).toEqual([activePool?.dataset.poolId ?? ""]);
      expect(enteredPoolIds).toEqual([activePool?.dataset.poolId ?? ""]);

      actionRail?.dispatch("pointerleave");
      vi.advanceTimersByTime(119);

      expect(activePool?.className).toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).toContain("glitter-home-stage__spring-rain-pool--muted");

      vi.advanceTimersByTime(1);

      expect(activePool?.className).not.toContain("glitter-home-stage__spring-rain-pool--focused");
      expect(siblingPool?.className).not.toContain("glitter-home-stage__spring-rain-pool--muted");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps spring-rain body clicks inert while title clicks enter the pool through onPoolTitleSelect", () => {
    const container = createContainer();
    const bodySelections: string[] = [];
    const titleSelections: string[] = [];

    renderHomeView(
      container,
      buildHomeViewState("home-populated", { homeFieldView: "spring-rain" }),
      {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect: (poolId) => {
          bodySelections.push(poolId);
        },
        onPoolTitleSelect: (poolId) => {
          titleSelections.push(poolId);
        },
        onSearchSubmit() {}
      }
    );

    const firstPool = container.querySelector(".glitter-home-stage__spring-rain-pool") as
      | (HTMLElement & { querySelector: (selector: string) => FakeElement | null })
      | null;
    const titleColumn = firstPool?.querySelector(".glitter-home-stage__spring-rain-title-hit-area") as
      | (HTMLElement & { click: () => void })
      | null;
    const body = firstPool?.querySelector(".glitter-home-stage__spring-rain-body") as
      | (HTMLElement & { click: () => void })
      | null;

    expect(firstPool).not.toBeNull();
    expect(titleColumn).not.toBeNull();
    expect(body).not.toBeNull();

    body?.click();
    titleColumn?.click();

    expect(bodySelections).toEqual([]);
    expect(titleSelections).toEqual(["pool-unsorted"]);
  });

  it("falls back to onPoolSelect when spring-rain title clicks lack a dedicated title handler", () => {
    const container = createContainer();
    const selectedPoolIds: string[] = [];

    renderHomeView(
      container,
      buildHomeViewState("home-populated", { homeFieldView: "spring-rain" }),
      {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect: (poolId) => {
          selectedPoolIds.push(poolId);
        },
        onSearchSubmit() {}
      }
    );

    const firstPool = container.querySelector(".glitter-home-stage__spring-rain-pool") as
      | (HTMLElement & { querySelector: (selector: string) => FakeElement | null })
      | null;
    const titleColumn = firstPool?.querySelector(".glitter-home-stage__spring-rain-title-hit-area") as
      | (HTMLElement & { click: () => void })
      | null;

    expect(firstPool).not.toBeNull();
    expect(titleColumn).not.toBeNull();

    titleColumn?.click();

    expect(selectedPoolIds).toEqual(["pool-unsorted"]);
  });

  it("keeps spring-rain ripple sizing and text hierarchy driven by size and count tiers without rotation variables", () => {
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-pool", [
      "--glitter-home-orb-text-strength: 100%;"
    ]);
    expectRuleHasDeclarations('.glitter-home-stage__spring-rain-pool[data-spring-rain-size="xs"]', [
      "--glitter-home-spring-rain-body-width: clamp(130px, 15.4vw, 172px);",
      "--glitter-home-spring-rain-title-size: clamp(11px, 1.3vw, 13px);"
    ]);
    expectRuleHasDeclarations('.glitter-home-stage__spring-rain-pool[data-spring-rain-size="xxxl"]', [
      "--glitter-home-spring-rain-body-width: clamp(230px, 28vw, 302px);",
      "--glitter-home-spring-rain-count-size: clamp(21px, 2.7vw, 29px);"
    ]);
    expectRuleHasDeclarations('.glitter-home-stage__spring-rain-pool[data-text-tier="1"]', [
      "--glitter-home-orb-text-strength: 25%;"
    ]);
    expectRuleHasDeclarations('.glitter-home-stage__spring-rain-pool[data-text-tier="7"]', [
      "--glitter-home-orb-text-strength: 100%;"
    ]);
    expect(stylesCss).not.toContain("--glitter-home-spring-rain-body-tilt");
    expect(stylesCss).not.toContain("rotate(var(--glitter-home-spring-rain-body-tilt))");
  });

  it("does not submit populated-home search while IME composition is in progress", () => {
    const container = createContainer();
    const submittedQueries: string[] = [];

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit: (query) => {
        submittedQueries.push(query);
      }
    });

    const searchInput = container.querySelector(".glitter-home-stage__topbar-search-input") as
      | (HTMLElement & {
          value: string;
          keydown: (key: string, options?: { isComposing?: boolean; keyCode?: number }) => void;
        })
      | null;

    expect(searchInput).not.toBeNull();

    searchInput!.value = "输入法候选";
    searchInput!.keydown("Enter", { isComposing: true });
    searchInput!.keydown("Enter", { keyCode: 229 });
    expect(submittedQueries).toEqual([]);

    searchInput!.keydown("Enter");
    expect(submittedQueries).toEqual(["输入法候选"]);
  });

  it("keeps populated-home title alignment and folds the inner search input fully into the outer shell", () => {
    expectRuleHasDeclarations(".glitter-home-stage__topbar", [
      "display: grid;",
      "background: transparent;",
      "box-shadow: none;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage--populated", [
      "--glitter-home-stage-padding-top: 0px;",
      "--glitter-home-stage-gap: 0px;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage--populated .glitter-home-stage__topbar", [
      "position: absolute;",
      "top: 0;",
      "left: 0;",
      "right: 0;",
      "padding: 14px var(--glitter-home-stage-padding-x) 10px;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage--populated .glitter-home-stage__field", [
      "grid-row: 1 / -1;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__brand", [
      "display: flex;",
      "align-items: center;",
      "min-height: 42px;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__topbar-search", [
      "height: 42px;",
      "gap: 10px;",
      "padding: 0 14px;",
      "background: color-mix(in srgb, var(--glitter-ui-surface) 88%, transparent);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__topbar-control", [
      "background: color-mix(in srgb, var(--glitter-ui-surface) 88%, transparent);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__topbar-search-input", [
      "all: unset;",
      "padding: 0 !important;",
      "border: none !important;",
      "border-radius: 0 !important;",
      "background: none !important;",
      "background-color: transparent !important;",
      "box-shadow: none !important;",
      "color: var(--glitter-home-topbar-control-text);",
      "-webkit-text-fill-color: var(--glitter-home-topbar-control-text);",
      "caret-color: var(--glitter-home-topbar-control-text);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__topbar-search-input::placeholder", [
      "var(--glitter-home-brand-subtle) 86%, white 10%"
    ]);
    expect(stylesCss).toMatch(
      /\.glitter-home-stage \.glitter-home-stage__topbar-search-input:hover,[\s\S]*?\.glitter-home-stage \.glitter-home-stage__topbar-search-input:focus,[\s\S]*?outline: none !important;/
    );
    expect(stylesCss).not.toContain(".glitter-home-stage__topbar-control-icon--reference-filter {");
    expect(stylesCss).not.toContain("M22 12h-6l-2 3h-4l-2-3H2");
    expect(stylesCss).toContain(".glitter-home-stage__topbar-control-icon--file-filter {");
    expect(stylesCss).toContain("M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z");
    expect(stylesCss).toContain("M19 3v4");
    expect(stylesCss).toContain("M21 5h-4");
  });

  it("keeps the Obsidian main-view host full-height without turning the home stage into a shrink-to-fit flex item", () => {
    const mainViewBlocks = getRuleBlocks(stylesCss, ".glitter-idea-main-view-host");
    expect(mainViewBlocks.length).toBeGreaterThan(0);
    expect(
      mainViewBlocks.some((block) => block.includes("height: 100%;") && block.includes("overflow: hidden;"))
    ).toBe(true);
    expect(mainViewBlocks.every((block) => !block.includes("display: flex;"))).toBe(true);

    const homeStageBlocks = getRuleBlocks(stylesCss, ".glitter-home-stage");
    expect(homeStageBlocks.length).toBeGreaterThan(0);
    const homeStageHeight = homeStageBlocks
      .map((block) => block.match(/(?:^|\n)\s*height\s*:\s*([^;]+);/)?.[1]?.trim())
      .find((value) => value !== undefined);
    expect(homeStageHeight).toBe("100%");
  });

  it("renders the populated action bar as a floating bottom overlay instead of a third grid row", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("home-populated"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const stage = container.querySelector(".glitter-home-stage") as
      | (HTMLElement & { className: string })
      | null;
    const actionBar = container.querySelector(".glitter-home-stage__action-bar--populated") as
      | (HTMLElement & { parent: unknown })
      | null;

    expect(stage).not.toBeNull();
    expect(actionBar).not.toBeNull();
    expect(actionBar?.parent).toBe(stage);
    expectRuleHasDeclarations(".glitter-home-stage", [
      "grid-template-rows: auto minmax(0, 1fr);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__action-bar--populated", [
      "position: absolute;",
      "left: 50%;",
      "bottom: var(--glitter-home-floating-action-bottom-offset);",
      "transform: translateX(-50%);"
    ]);
  });

  it("does not let the floating populated action bar reduce the orb interaction height", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();

      renderHomeView(container, buildHomeViewState("home-populated"), {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      });

      const root = container.querySelector(".glitter-plugin-root") as
        | (HTMLElement & { style: FakeStyle; setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;
      const topbar = container.querySelector(".glitter-home-stage__topbar") as
        | (HTMLElement & { setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;
      const actionBar = container.querySelector(".glitter-home-stage__action-bar--populated") as
        | (HTMLElement & { setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;

      expect(root).not.toBeNull();
      expect(topbar).not.toBeNull();
      expect(actionBar).not.toBeNull();

      root!.style.setProperty("width", "1600px");
      root!.style.setProperty("height", "900px");
      root!.setRectSize?.(1600, 900);
      topbar!.setRectSize?.(1600, 42);
      actionBar!.setRectSize?.(360, 60);

      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();
      observer!.trigger();

      const populatedStageSize = getPopulatedStageSize(container);
      expect(populatedStageSize.height).toBe(886);
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("keeps populated stage height anchored to the fixed main-view host instead of a self-expanded home stage", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer() as HTMLElement & {
        className: string;
        style: FakeStyle;
        setRectSize?: (rectWidth: number, rectHeight: number) => void;
      };
      container.className = "glitter-idea-main-view-host";
      container.style.setProperty("width", "1600px");
      container.style.setProperty("height", "900px");
      container.setRectSize?.(1600, 900);

      renderHomeView(container, buildHomeViewState("home-populated"), {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      });

      const stageRoot = container.querySelector(".glitter-home-stage") as
        | (HTMLElement & { setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;
      const topbar = container.querySelector(".glitter-home-stage__topbar") as
        | (HTMLElement & { setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;
      const actionBar = container.querySelector(".glitter-home-stage__action-bar--populated") as
        | (HTMLElement & { setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;

      expect(stageRoot).not.toBeNull();
      expect(topbar).not.toBeNull();
      expect(actionBar).not.toBeNull();

      stageRoot!.setRectSize?.(1600, 1300);
      topbar!.setRectSize?.(1600, 42);
      actionBar!.setRectSize?.(360, 60);

      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();
      observer!.trigger();

      const populatedStageSize = getPopulatedStageSize(container);
      expect(populatedStageSize.height).toBe(886);
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("keeps populated stage height stable while populated chrome is still measured in normal flow", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;
    const previousGetComputedStyle = (globalThis as typeof globalThis & { getComputedStyle?: unknown }).getComputedStyle;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;
    (globalThis as typeof globalThis & { getComputedStyle?: unknown }).getComputedStyle = ((element: {
      className?: string;
    }) => {
      const className = typeof element.className === "string" ? element.className : "";
      if (
        className.includes("glitter-home-stage__topbar")
        || className.includes("glitter-home-stage__action-bar--populated")
      ) {
        return { position: "static" };
      }

      return { position: "" };
    }) as unknown as typeof getComputedStyle;

    try {
      const container = createContainer();

      renderHomeView(container, buildHomeViewState("home-populated"), {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      });

      const root = container.querySelector(".glitter-plugin-root") as
        | (HTMLElement & { style: FakeStyle; setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;
      const topbar = container.querySelector(".glitter-home-stage__topbar") as
        | (HTMLElement & { setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;
      const actionBar = container.querySelector(".glitter-home-stage__action-bar--populated") as
        | (HTMLElement & { setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;
      const orbStage = container.querySelector(".glitter-home-stage__pool-stage") as
        | (HTMLElement & { style: FakeStyle })
        | null;

      expect(root).not.toBeNull();
      expect(topbar).not.toBeNull();
      expect(actionBar).not.toBeNull();
      expect(orbStage).not.toBeNull();

      root!.style.setProperty("width", "1600px");
      topbar!.setRectSize?.(1600, 42);
      actionBar!.setRectSize?.(360, 60);

      const syncRootHeightToInFlowChrome = (): void => {
        const stageMinHeight = orbStage!.style.getPropertyValue("minHeight").trim();
        const stageHeight = stageMinHeight.endsWith("px") ? parsePixelStyle(stageMinHeight) : 420;
        root!.setRectSize?.(1600, stageHeight + 42 + 60 + 14);
      };

      syncRootHeightToInFlowChrome();
      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();

      observer!.trigger();
      const firstHeight = getPopulatedStageSize(container).height;

      syncRootHeightToInFlowChrome();
      observer!.trigger();
      const secondHeight = getPopulatedStageSize(container).height;

      syncRootHeightToInFlowChrome();
      observer!.trigger();
      const thirdHeight = getPopulatedStageSize(container).height;

      expect(firstHeight).toBe(420);
      expect(secondHeight).toBe(firstHeight);
      expect(thirdHeight).toBe(firstHeight);
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
      (globalThis as typeof globalThis & { getComputedStyle?: unknown }).getComputedStyle = previousGetComputedStyle;
    }
  });

  it("keeps the populated orb cluster centered while exposing viewport-wide drag bounds without page scrolling", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();

      renderHomeView(container, buildHomeViewState("home-populated"), {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      });

      const root = container.querySelector(".glitter-plugin-root") as
        | (HTMLElement & { style: FakeStyle; setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;
      const orbStage = container.querySelector(".glitter-home-stage__pool-stage") as
        | (HTMLElement & {
            style: FakeStyle;
            getBoundingClientRect?: () => { width?: number; height?: number };
            offsetWidth?: number;
            offsetHeight?: number;
          })
        | null;

      expect(root).not.toBeNull();
      expect(orbStage).not.toBeNull();
      root!.style.setProperty("width", "1600px");
      root!.style.setProperty("height", "900px");
      if (typeof root!.setRectSize === "function") {
        root!.setRectSize(1600, 900);
      }

      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();
      observer!.trigger();

      expect(container.querySelector(".glitter-home-stage__topbar")).not.toBeNull();
      expect(container.querySelector(".glitter-home-stage__field")).not.toBeNull();
      expect(container.querySelector(".glitter-home-stage__middle")).not.toBeNull();
      expect(container.querySelector(".glitter-home-stage__orb-layer")).not.toBeNull();
      expect(container.querySelector(".glitter-home-stage__orb-region")).not.toBeNull();
      expect(container.querySelector(".glitter-home-stage__orb-stage")).not.toBeNull();
      expect(container.querySelector(".glitter-home-stage__water-surface")).not.toBeNull();
      expect(container.querySelector(".glitter-home-stage__water-seed")).toBeNull();
      expect(container.querySelector(".glitter-home-stage__water-ripple-layer")).not.toBeNull();

      const populatedStageSize = getPopulatedStageSize(container);
      expect(populatedStageSize.width).toBeGreaterThan(1200);
      expect(populatedStageSize.height).toBeGreaterThan(300);
      expect(orbStage?.style.getPropertyValue("--glitter-home-derived-stage-width")).not.toBe("");

      const geometry = collectOrbGeometry(container);
      const primaryOrb = geometry.find((orb) => orb.element.className.includes("glitter-home-stage__primary-orb"));
      expect(primaryOrb).toBeDefined();
      expect(primaryOrb!.centerX).toBeCloseTo(populatedStageSize.width / 2, 3);
      expect(primaryOrb!.centerY).toBeCloseTo(populatedStageSize.height / 2, 3);

      const maxSupportingDistance = geometry
        .filter((orb) => !orb.element.className.includes("glitter-home-stage__primary-orb"))
        .reduce(
          (maxDistance, orb) =>
            Math.max(maxDistance, Math.hypot(orb.centerX - primaryOrb!.centerX, orb.centerY - primaryOrb!.centerY)),
          0
        );
      expect(maxSupportingDistance).toBeLessThan(340);

      expectRuleHasDeclarations(".glitter-home-stage", [
        "grid-template-rows: auto minmax(0, 1fr);",
        "align-content: stretch;"
      ]);
      expectRuleHasDeclarations(".glitter-home-stage__field", ["height: 100%;"]);
      expectRuleHasDeclarations(".glitter-home-stage__middle", ["overflow: hidden;"]);
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("renders a centered miss overlay with scrim when populated home carries search feedback", () => {
    const container = createContainer();
    const state = buildHomeViewState("home-populated", {
      searchFeedbackMessage: "未读取到搜索内容"
    });

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const overlay = container.querySelector(".glitter-home-stage__search-feedback-overlay") as HTMLElement | null;
    const scrim = container.querySelector(".glitter-home-stage__search-feedback-scrim") as HTMLElement | null;
    const dialog = container.querySelector(".glitter-home-stage__search-feedback-dialog") as HTMLElement | null;

    expect(overlay).not.toBeNull();
    expect(scrim).not.toBeNull();
    expect(dialog?.textContent).toBe("未读取到搜索内容");

    expectRuleHasDeclarations(".glitter-home-stage__search-feedback-overlay", [
      "position: absolute;",
      "inset: 0;",
      "display: grid;",
      "place-items: center;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__search-feedback-scrim", [
      "position: absolute;",
      "inset: 0;",
      "background: color-mix(in srgb, var(--glitter-shell-bg) 46%, transparent);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__search-feedback-dialog", [
      "position: relative;",
      "z-index: 1;",
      "border-radius: 999px;"
    ]);
  });

  it("does not render follow-up guidance inside populated home", () => {
    const container = createContainer();
    const state = buildHomeViewState("home-populated");

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    expect(container.querySelector(".glitter-home-stage__guidance-overlay")).toBeNull();
    expect(container.querySelector(".glitter-home-stage__guidance-window")).toBeNull();
  });

  it("derives rendered orb color variables from each pool's saved color", () => {
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-default", name: "默认池", ideaCount: 30, isDefault: true, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-writing", name: "写作池", ideaCount: 12, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const writingOrb = Array.from(container.querySelectorAll(".glitter-home-stage__pool-orb")).find(
      (orb) => (orb as unknown as { dataset?: Record<string, string> }).dataset?.poolId === "pool-writing"
    ) as (HTMLElement & { style: { getPropertyValue: (name: string) => string } }) | undefined;

    expect(writingOrb).toBeDefined();
    expect(writingOrb?.style.getPropertyValue("--glitter-home-orb-rgb")).toBe("255 212 104");
  });

  it("keeps dashed core-ring stroke width stable across different orb diameters", () => {
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-primary", name: "默认池", ideaCount: 100, isDefault: true, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-c", name: "池 C", ideaCount: 90, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-b", name: "池 B", ideaCount: 80, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-a", name: "池 A", ideaCount: 70, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-z", name: "池 Z", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const dashedShells = Array.from(
      container.querySelectorAll(".glitter-home-stage__water-surface--dashed")
    ) as HTMLElement[];
    const dashedMaskImages = dashedShells
      .map((shell) => shell.style.getPropertyValue("--glitter-home-dashed-ring-mask-image"))
      .filter(Boolean);

    expect(dashedMaskImages.length).toBeGreaterThanOrEqual(2);
    expect(new Set(dashedMaskImages).size).toBeGreaterThan(1);
    dashedMaskImages.forEach((maskImage) => {
      expect(maskImage).toContain("stroke-width='2'");
      expect(maskImage).not.toContain("viewBox='0 0 100 100'");
    });
  });

  it("keeps the center primary orb fixed to a solid ring even when supporting orbs use the mixed strategy", () => {
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-primary", name: "默认池", ideaCount: 100, isDefault: true, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-c", name: "池 C", ideaCount: 90, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-b", name: "池 B", ideaCount: 80, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-a", name: "池 A", ideaCount: 70, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-z", name: "池 Z", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const primaryOrb = container.querySelector(".glitter-home-stage__primary-orb") as HTMLElement | null;
    const primaryShell = primaryOrb?.querySelector(".glitter-home-stage__pool-orb-shell") as HTMLElement | null;
    const supportingShells = Array.from(container.querySelectorAll(".glitter-home-stage__supporting-orb"))
      .map((orb) => orb.querySelector(".glitter-home-stage__pool-orb-shell"))
      .filter((shell): shell is HTMLElement => shell !== null);
    const dashedSupportingShells = supportingShells.filter((shell) =>
      shell.className.includes("glitter-home-stage__water-surface--dashed")
    );

    expect(primaryShell).not.toBeNull();
    expect(primaryShell?.className).toContain("glitter-home-stage__water-surface");
    expect(primaryShell?.className).not.toContain("glitter-home-stage__water-surface--dashed");
    expect(primaryShell?.style.getPropertyValue("--glitter-home-dashed-ring-mask-image")).toBe("");
    expect(dashedSupportingShells.length).toBeGreaterThan(0);
    expect(dashedSupportingShells.length).toBeLessThan(supportingShells.length);
  });

  it("solves populated-home orb geometry with edge safety, centered primary position, and non-overlap", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    expectOrbGeometryConstraints(collectOrbGeometry(container), 660, 420);
  });

  it("reflows populated-home orb geometry when ResizeObserver fires", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown })
      .ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();

      renderHomeView(container, buildHomeViewState("settings-conflict"), {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
          onSearchSubmit() {}
      });

      const before = collectOrbGeometry(container);

      setPopulatedStageSize(container, 760, 560);
      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();
      observer!.trigger();

      const after = collectOrbGeometry(container);
      expect(after).toHaveLength(before.length);

      const movedCount = after.filter((orbAfter, index) => {
        const orbBefore = before[index]!;
        return (
          Math.abs(orbAfter.centerX - orbBefore.centerX) > 0.001 ||
          Math.abs(orbAfter.centerY - orbBefore.centerY) > 0.001
        );
      }).length;

      expect(movedCount).toBeGreaterThan(0);
      expectOrbGeometryConstraints(after, 760, 560);
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("keeps the dense fallback centered on the inspiration-field origin", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown })
      .ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: Array.from({ length: 12 }, (_, index) => ({
            id: `pool-${index + 1}`,
            name: `池 ${index + 1}`,
            ideaCount: 240 - index * 10,
            isDefault: index === 0,
            color:
              index % 5 === 0
                ? DEFAULT_SETTINGS.poolColors.unsorted
                : index % 5 === 1
                  ? DEFAULT_SETTINGS.poolColors.product
                  : index % 5 === 2
                    ? DEFAULT_SETTINGS.poolColors.writing
                    : index % 5 === 3
                      ? DEFAULT_SETTINGS.poolColors.research
                      : DEFAULT_SETTINGS.poolColors.unnamed
          }))
        },
        { poolColors: DEFAULT_SETTINGS.poolColors }
      );

      renderHomeView(container, state, {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      });

      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();

      setPopulatedStageSize(container, 320, 220);
      observer!.trigger();
      const denseStage = getPopulatedStageSize(container);
      const denseOrbs = collectOrbGeometry(container);
      const primaryOrb = denseOrbs.find((orb) => orb.element.className.includes("glitter-home-stage__primary-orb"));

      expect(denseStage.height).toBeGreaterThan(220);
      expect(primaryOrb).toBeDefined();
      expect(primaryOrb!.centerX).toBeCloseTo(denseStage.width / 2, 3);
      expect(primaryOrb!.centerY).toBeCloseTo(denseStage.height / 2, 3);
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("returns from dense readable layout after the stage widens again", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown })
      .ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: Array.from({ length: 12 }, (_, index) => ({
            id: `pool-${index + 1}`,
            name: `池 ${index + 1}`,
            ideaCount: 240 - index * 10,
            isDefault: index === 0,
            color:
              index % 5 === 0
                ? DEFAULT_SETTINGS.poolColors.unsorted
                : index % 5 === 1
                  ? DEFAULT_SETTINGS.poolColors.product
                  : index % 5 === 2
                    ? DEFAULT_SETTINGS.poolColors.writing
                    : index % 5 === 3
                      ? DEFAULT_SETTINGS.poolColors.research
                      : DEFAULT_SETTINGS.poolColors.unnamed
          }))
        },
        { poolColors: DEFAULT_SETTINGS.poolColors }
      );

      renderHomeView(container, state, {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      });

      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();

      setPopulatedStageSize(container, 320, 220);
      observer!.trigger();
      const denseStage = getPopulatedStageSize(container);
      expect(denseStage.height).toBeGreaterThan(220);

      setPopulatedStageSize(container, 760, 560);
      observer!.trigger();
      const widenedStage = getPopulatedStageSize(container);
      const widenedOrbs = collectOrbGeometry(container);

      expect(widenedStage.height).toBe(560);
      expect(widenedOrbs.length).toBe(12);
      expectOrbGeometryConstraints(widenedOrbs, 760, 560, {
        requireGap: false,
        maxOverlapAreaRatio: 0.15,
        edgeGap: 0,
        enforceSupportDistance: false
      });
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("keeps all pool orbs visible and interactive when many pools reflow on a tighter stage", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown })
      .ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: Array.from({ length: 60 }, (_, index) => ({
            id: `pool-${index + 1}`,
            name: `池 ${index + 1}`,
            ideaCount: 620 - index * 10,
            isDefault: index === 0,
            color:
              index % 5 === 0
                ? DEFAULT_SETTINGS.poolColors.unsorted
                : index % 5 === 1
                  ? DEFAULT_SETTINGS.poolColors.product
                  : index % 5 === 2
                    ? DEFAULT_SETTINGS.poolColors.writing
                    : index % 5 === 3
                      ? DEFAULT_SETTINGS.poolColors.research
                      : DEFAULT_SETTINGS.poolColors.unnamed
          }))
        },
        { poolColors: DEFAULT_SETTINGS.poolColors }
      );

      renderHomeView(container, state, {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
          onSearchSubmit() {}
      });

      setPopulatedStageSize(container, 320, 220);
      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();
      observer!.trigger();

      const allPoolOrbs = Array.from(container.querySelectorAll(".glitter-home-stage__pool-orb")) as Array<
        HTMLElement & { style: FakeStyle }
      >;
      const visibleOrbs = collectOrbGeometry(container);
      const stageSize = getPopulatedStageSize(container);

      expect(allPoolOrbs).toHaveLength(60);
      expect(visibleOrbs).toHaveLength(60);
      allPoolOrbs.forEach((orb) => {
        expect(orb.style.getPropertyValue("opacity")).not.toBe("0");
        expect(orb.style.getPropertyValue("pointerEvents")).not.toBe("none");
      });
      visibleOrbs.forEach((orb) => {
        expect(orb.radius * 2).toBeGreaterThanOrEqual(60);
        expect(orb.centerX).toBeGreaterThanOrEqual(orb.radius - 0.001);
        expect(orb.centerX).toBeLessThanOrEqual(stageSize.width - orb.radius + 0.001);
        expect(orb.centerY).toBeGreaterThanOrEqual(orb.radius - 0.001);
        expect(orb.centerY).toBeLessThanOrEqual(stageSize.height - orb.radius + 0.001);
      });
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("keeps every visible orb label and count fully readable after tight-stage reflow", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown })
      .ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: Array.from({ length: 60 }, (_, index) => ({
            id: `pool-${index + 1}`,
            name: `超长灵感池名称 ${index + 1}`,
            ideaCount: 620 - index * 10,
            isDefault: index === 0,
            color:
              index % 5 === 0
                ? DEFAULT_SETTINGS.poolColors.unsorted
                : index % 5 === 1
                  ? DEFAULT_SETTINGS.poolColors.product
                  : index % 5 === 2
                    ? DEFAULT_SETTINGS.poolColors.writing
                    : index % 5 === 3
                      ? DEFAULT_SETTINGS.poolColors.research
                      : DEFAULT_SETTINGS.poolColors.unnamed
          }))
        },
        { poolColors: DEFAULT_SETTINGS.poolColors }
      );

      renderHomeView(container, state, {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      });

      setPopulatedStageSize(container, 420, 280);
      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();
      observer!.trigger();

      const visibleOrbs = collectOrbGeometry(container);
      const stageSize = getPopulatedStageSize(container);

      expect(visibleOrbs).toHaveLength(60);
      expect(stageSize.height).toBeGreaterThan(280);
      visibleOrbs.forEach((orb) => {
        expect(orb.centerX).toBeGreaterThanOrEqual(orb.radius - 0.001);
        expect(orb.centerX).toBeLessThanOrEqual(stageSize.width - orb.radius + 0.001);
        expect(orb.centerY).toBeGreaterThanOrEqual(orb.radius - 0.001);
        expect(orb.centerY).toBeLessThanOrEqual(stageSize.height - orb.radius + 0.001);
        expectOrbTextFits(orb.element);
      });
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("keeps the smallest orb readable on a compact seven-tier home stage", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown })
      .ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-1", name: "池 1", ideaCount: 70, isDefault: true, color: DEFAULT_SETTINGS.poolColors.unsorted },
            { id: "pool-2", name: "池 2", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
            { id: "pool-3", name: "池 3", ideaCount: 50, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
            { id: "pool-4", name: "池 4", ideaCount: 40, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
            { id: "pool-5", name: "池 5", ideaCount: 30, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed },
            { id: "pool-6", name: "池 6", ideaCount: 20, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
            { id: "pool-7", name: "池 7", ideaCount: 10, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research }
          ]
        },
        { poolColors: DEFAULT_SETTINGS.poolColors }
      );

      renderHomeView(container, state, {
        onPrimaryAction() {},
        onSecondaryAction() {},
        onPoolSelect() {},
        onSearchSubmit() {}
      });

      setPopulatedStageSize(container, 460, 340);
      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();
      observer!.trigger();

      const visibleOrbs = collectOrbGeometry(container);
      const smallestOrb = visibleOrbs.find((orb) =>
        orb.element.className.includes("glitter-home-stage__pool-orb--xs")
      );

      const stageSize = getPopulatedStageSize(container);

      expect(visibleOrbs).toHaveLength(7);
      expect(smallestOrb).toBeDefined();
      expect(smallestOrb!.radius * 2).toBeGreaterThanOrEqual(60);
      expectOrbTextFits(smallestOrb!.element);
      visibleOrbs.forEach((orb) => {
        expect(orb.centerX).toBeGreaterThanOrEqual(orb.radius - 0.001);
        expect(orb.centerX).toBeLessThanOrEqual(stageSize.width - orb.radius + 0.001);
        expect(orb.centerY).toBeGreaterThanOrEqual(orb.radius - 0.001);
        expect(orb.centerY).toBeLessThanOrEqual(stageSize.height - orb.radius + 0.001);
      });
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("sets rendered home buttons to non-submit button type", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const orbButtons = Array.from(container.querySelectorAll(".glitter-home-stage__pool-orb"));
    const actionButtons = [
      container.querySelector(".glitter-home-stage__action-secondary"),
      container.querySelector(".glitter-home-stage__action-primary")
    ].filter((button): button is Element => button !== null);
    const buttons = [...orbButtons, ...actionButtons];

    buttons.forEach((button: Element) => {
      expect((button as unknown as { type: string }).type).toBe("button");
    });
  });

  it("renders orb tone/kind/count metadata for pool orbs and keeps orb button structure", () => {
    const runtimeState = {
      mode: "populated" as const,
      pools: [
        { id: "pool-a", name: "A池", ideaCount: 90, isDefault: true, color: "#6AB5FF" },
        { id: "pool-b", name: "B池", ideaCount: 70, isDefault: false, color: "#74CCBA" },
        { id: "pool-c", name: "C池", ideaCount: 70, isDefault: false, color: "#FFA980" },
        { id: "pool-d", name: "D池", ideaCount: 50, isDefault: false, color: "#FFD468" },
        { id: "pool-e", name: "E池", ideaCount: 30, isDefault: false, color: "#B794FF" },
        { id: "pool-f", name: "F池", ideaCount: 18, isDefault: false, color: "#6AB5FF" },
        { id: "pool-g", name: "G池", ideaCount: 7, isDefault: false, color: "#74CCBA" }
      ]
    };
    const state = buildHomeViewStateFromRuntime(runtimeState, {
      poolColors: {
        unsorted: "#6AB5FF",
        product: "#74CCBA",
        research: "#FFA980",
        writing: "#FFD468",
        unnamed: "#B794FF"
      }
    });

    state.poolOrbs[0]!.id = "pool-id-does-not-map-tone";
    state.poolOrbs[0]!.tone = "research";

    const selectedPoolIds: string[] = [];
    const container = createContainer();
    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect: (poolId) => {
        selectedPoolIds.push(poolId);
      },
      onSearchSubmit() {}
    });

    const allOrbs = Array.from(container.querySelectorAll(".glitter-home-stage__pool-orb")) as Array<
      HTMLElement & {
        dataset: Record<string, string>;
        children: Array<{ tagName?: string }>;
      }
    >;
    expect(allOrbs.length).toBeGreaterThan(0);
    expect(container.querySelector(".glitter-home-stage__pool-orb--overflow")).toBeNull();
    expect(container.querySelector('[data-orb-kind="overflow"]')).toBeNull();

    const motionSignatures = new Set<string>();
    const supportingRippleScaleRiseValues: number[] = [];
    const supportingRippleScaleMidValues: number[] = [];
    const supportingRippleScaleEndValues: number[] = [];
    const supportingBreatheDurationValues: number[] = [];
    let primaryRippleScaleRise: number | null = null;
    let primaryRippleScaleMid: number | null = null;
    let primaryRippleScaleEnd: number | null = null;
    let primaryBreatheDuration: number | null = null;
    let dashedShellCount = 0;
    let solidShellCount = 0;

    allOrbs.forEach((orb) => {
      const shell = orb.querySelector(".glitter-home-stage__pool-orb-shell") as
        | (HTMLElement & { className: string; children: Array<{ className: string; textContent: string }> })
        | null;
      const rippleLayer = orb.querySelector(".glitter-home-stage__water-ripple-layer") as
        | (HTMLElement & { children: Array<{ className: string; textContent: string }> })
        | null;
      const isolationOrbit = orb.querySelector(".glitter-home-stage__pool-orb-isolation-orbit") as
        | (HTMLElement & { children: Array<{ className: string; textContent: string }> })
        | null;
      const textLayer = orb.querySelector(".glitter-home-stage__pool-orb-text") as
        | (HTMLElement & { children: Array<{ className: string; textContent: string }> })
        | null;
      const isCompactRippleOrb = ["xs", "sm", "md"].some((size) =>
        orb.className.includes(`glitter-home-stage__pool-orb--${size}`)
      );
      expect(shell).not.toBeNull();
      expect(shell?.className).toContain("glitter-home-stage__water-surface");
      if (shell?.className.includes("glitter-home-stage__water-surface--dashed")) {
        dashedShellCount += 1;
      } else {
        solidShellCount += 1;
      }
      expect(shell?.children).toHaveLength(0);
      expect(rippleLayer).not.toBeNull();
      expect(rippleLayer?.children).toHaveLength(isCompactRippleOrb ? 2 : 3);
      expect(rippleLayer?.children[0]?.className).toContain("glitter-home-stage__water-ripple");
      expect(rippleLayer?.children[0]?.className).toContain("glitter-home-stage__water-ripple--near");
      expect(rippleLayer?.children[1]?.className).toContain("glitter-home-stage__water-ripple--mid");
      if (isCompactRippleOrb) {
        expect(rippleLayer?.children[2]).toBeUndefined();
      } else {
        expect(rippleLayer?.children[2]?.className).toContain("glitter-home-stage__water-ripple--far");
      }
      expect(isolationOrbit).not.toBeNull();
      expect(isolationOrbit?.children).toHaveLength(1);
      expect(isolationOrbit?.children[0]?.className).toContain("glitter-home-stage__pool-orb-isolation-runner");
      expect(isolationOrbit?.children[0]?.children).toHaveLength(2);
      expect(isolationOrbit?.children[0]?.children[0]?.className).toContain("glitter-home-stage__pool-orb-isolation-comet");
      expect(isolationOrbit?.children[0]?.children[1]?.className).toContain("glitter-home-stage__pool-orb-isolation-head");
      expect(textLayer).not.toBeNull();
      expect(textLayer?.children).toHaveLength(2);
      expect(textLayer?.children[0]?.className).toContain("glitter-home-stage__pool-orb-name");
      expect(textLayer?.children[1]?.className).toContain("glitter-home-stage__pool-orb-count");
      expect(orb.querySelector(".glitter-home-stage__water-ripple-layer")).not.toBeNull();
      expect(orb.querySelector(".glitter-home-stage__water-seed")).toBeNull();
      expect(orb.querySelector(".glitter-home-stage__water-ripple")).not.toBeNull();
      expect(orb.querySelector(".glitter-home-stage__water-ripple--near")).not.toBeNull();
      expect(orb.querySelector(".glitter-home-stage__water-ripple--mid")).not.toBeNull();
      if (isCompactRippleOrb) {
        expect(orb.querySelector(".glitter-home-stage__water-ripple--far")).toBeNull();
      } else {
        expect(orb.querySelector(".glitter-home-stage__water-ripple--far")).not.toBeNull();
      }
      expect(orb.className).not.toMatch(/glitter-home-stage__pool-orb--phase-\d/);
      expect(orb.children.filter((child) => child.tagName === "BUTTON")).toHaveLength(0);
      expect(orb.dataset.poolId).toBeTruthy();
      expect(orb.dataset.orbTone).toBeTruthy();
      expect(orb.dataset.orbKind).toBe("pool");
      expect(orb.style.getPropertyValue("--glitter-home-stage-sample-x")).not.toBe("");
      expect(orb.style.getPropertyValue("--glitter-home-stage-sample-y")).not.toBe("");

      const rippleScaleRise = Number(orb.style.getPropertyValue("--glitter-home-ripple-scale-rise"));
      const rippleScaleMid = Number(orb.style.getPropertyValue("--glitter-home-ripple-scale-mid"));
      const rippleScaleEnd = Number(orb.style.getPropertyValue("--glitter-home-ripple-scale-end"));
      const rippleDelay = Number.parseFloat(
        orb.style.getPropertyValue("--glitter-home-ripple-delay").replace("s", "")
      );
      const breatheDuration = Number.parseFloat(
        orb.style.getPropertyValue("--glitter-home-breathe-duration").replace("s", "")
      );
      const breatheDelay = Number.parseFloat(
        orb.style.getPropertyValue("--glitter-home-breathe-delay").replace("s", "")
      );

      expect(rippleDelay).toBeGreaterThanOrEqual(0);
      expect(breatheDelay).toBeGreaterThanOrEqual(0);

      const signature = [
        orb.style.getPropertyValue("--glitter-home-ripple-duration"),
        orb.style.getPropertyValue("--glitter-home-ripple-delay"),
        orb.style.getPropertyValue("--glitter-home-breathe-duration"),
        orb.style.getPropertyValue("--glitter-home-breathe-delay"),
        formatForSignature(rippleScaleRise),
        formatForSignature(rippleScaleMid),
        formatForSignature(rippleScaleEnd),
        orb.style.getPropertyValue("--glitter-home-ripple-opacity-peak"),
        orb.style.getPropertyValue("--glitter-home-ripple-opacity-trail")
      ].join("|");
      expect(signature).not.toBe("||||||||||");
      motionSignatures.add(signature);

      if (orb.className.includes("glitter-home-stage__primary-orb")) {
        primaryRippleScaleRise = rippleScaleRise;
        primaryRippleScaleMid = rippleScaleMid;
        primaryRippleScaleEnd = rippleScaleEnd;
        primaryBreatheDuration = breatheDuration;
      } else {
        supportingRippleScaleRiseValues.push(rippleScaleRise);
        supportingRippleScaleMidValues.push(rippleScaleMid);
        supportingRippleScaleEndValues.push(rippleScaleEnd);
        supportingBreatheDurationValues.push(breatheDuration);
      }
    });

    expect(motionSignatures.size).toBe(allOrbs.length);
    expect(primaryRippleScaleRise).not.toBeNull();
    expect(primaryRippleScaleMid).not.toBeNull();
    expect(primaryRippleScaleEnd).not.toBeNull();
    expect(primaryBreatheDuration).not.toBeNull();
    expect(supportingRippleScaleRiseValues.length).toBeGreaterThan(0);
    expect(supportingRippleScaleMidValues.length).toBeGreaterThan(0);
    expect(supportingRippleScaleEndValues.length).toBeGreaterThan(0);
    expect(supportingBreatheDurationValues.length).toBeGreaterThan(0);

    expect(Math.min(...supportingRippleScaleRiseValues)).toBeGreaterThanOrEqual(1.3);
    expect(Math.max(...supportingRippleScaleRiseValues)).toBeLessThanOrEqual(1.4);
    expect(Math.min(...supportingRippleScaleMidValues)).toBeGreaterThanOrEqual(1.82);
    expect(Math.max(...supportingRippleScaleMidValues)).toBeLessThanOrEqual(2);
    expect(Math.min(...supportingRippleScaleEndValues)).toBeGreaterThanOrEqual(2.48);
    expect(Math.max(...supportingRippleScaleEndValues)).toBeLessThanOrEqual(2.67);
    expect(primaryRippleScaleRise!).toBeGreaterThanOrEqual(1.44);
    expect(primaryRippleScaleRise!).toBeLessThanOrEqual(1.53);
    expect(primaryRippleScaleMid!).toBeGreaterThanOrEqual(2.05);
    expect(primaryRippleScaleMid!).toBeLessThanOrEqual(2.23);
    expect(primaryRippleScaleEnd!).toBeGreaterThanOrEqual(2.62);
    expect(primaryRippleScaleEnd!).toBeLessThanOrEqual(2.83);
    expect(Math.min(...supportingBreatheDurationValues)).toBeGreaterThan(19);
    expect(Math.max(...supportingBreatheDurationValues)).toBeLessThanOrEqual(22.8);
    expect(primaryBreatheDuration!).toBeGreaterThan(Math.max(...supportingBreatheDurationValues));
    expect(dashedShellCount).toBeGreaterThan(0);
    expect(solidShellCount).toBeGreaterThan(0);

    const firstSupportingOrb = allOrbs.find((orb) => orb.dataset.poolId === "pool-id-does-not-map-tone");
    const firstSupportingText = firstSupportingOrb?.querySelector(".glitter-home-stage__pool-orb-text") as
      | (HTMLElement & { children: Array<{ textContent: string }> })
      | null;
    const equalCountOrb = allOrbs.find((orb) => orb.dataset.poolId === "pool-c");
    expect(firstSupportingOrb?.dataset.orbTone).toBe("research");
    expect(firstSupportingOrb?.dataset.orbKind).toBe("pool");
    expect(firstSupportingText?.children[1]?.textContent).toBe("70");
    expect(firstSupportingOrb?.className).toContain("glitter-home-stage__pool-orb--xxl");
    expect(equalCountOrb?.className).toContain("glitter-home-stage__pool-orb--xxl");

    const emptyContainer = createContainer();
    renderHomeView(emptyContainer, buildHomeViewState("home-empty"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });
    expect(emptyContainer.querySelectorAll(".glitter-home-stage__empty-orb-ripple")).toHaveLength(3);
    expect(emptyContainer.querySelector(".glitter-home-stage__empty-orb-ripple--inner")).not.toBeNull();
    expect(emptyContainer.querySelector(".glitter-home-stage__empty-orb-ripple--middle")).not.toBeNull();
    expect(emptyContainer.querySelector(".glitter-home-stage__empty-orb-ripple--outer")).not.toBeNull();
  });

  it("keeps orb text on a count-driven darkest-to-lightest progression", () => {
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-max", name: "最大池", ideaCount: 120, isDefault: true, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-high", name: "高位池", ideaCount: 80, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-mid-a", name: "中位池A", ideaCount: 1, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-mid-b", name: "中位池B", ideaCount: 1, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed },
          { id: "pool-low", name: "低位池", ideaCount: 0, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const allOrbs = Array.from(container.querySelectorAll(".glitter-home-stage__pool-orb")) as Array<
      HTMLElement & { dataset: Record<string, string> }
    >;
    const primaryOrb = allOrbs.find((orb) => orb.dataset.poolId === "pool-max") ?? null;
    const highOrb = allOrbs.find((orb) => orb.dataset.poolId === "pool-high") ?? null;
    const midOrbA = allOrbs.find((orb) => orb.dataset.poolId === "pool-mid-a") ?? null;
    const midOrbB = allOrbs.find((orb) => orb.dataset.poolId === "pool-mid-b") ?? null;
    const lowOrb = allOrbs.find((orb) => orb.dataset.poolId === "pool-low") ?? null;

    expect(primaryOrb).not.toBeNull();
    expect(highOrb).not.toBeNull();
    expect(midOrbA).not.toBeNull();
    expect(midOrbB).not.toBeNull();
    expect(lowOrb).not.toBeNull();

    expect(primaryOrb!.dataset.textTier).toBe("7");
    expect(highOrb!.dataset.textTier).toBe("5");
    expect(midOrbA!.dataset.textTier).toBe("3");
    expect(midOrbB!.dataset.textTier).toBe("3");
    expect(lowOrb!.dataset.textTier).toBe("1");
  });

  it("maps orb text colors onto seven fixed count tiers", () => {
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-7", name: "七档", ideaCount: 70, isDefault: true, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-6", name: "六档", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-5", name: "五档", ideaCount: 50, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-4", name: "四档", ideaCount: 40, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed },
          { id: "pool-3", name: "三档", ideaCount: 30, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-2", name: "二档", ideaCount: 20, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-1", name: "一档", ideaCount: 10, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const allOrbs = Array.from(container.querySelectorAll(".glitter-home-stage__pool-orb")) as Array<
      HTMLElement & { dataset: Record<string, string> }
    >;
    const getTextTier = (poolId: string): string | undefined =>
      allOrbs.find((candidate) => candidate.dataset.poolId === poolId)?.dataset.textTier;

    expect(getTextTier("pool-7")).toBe("7");
    expect(getTextTier("pool-6")).toBe("6");
    expect(getTextTier("pool-5")).toBe("5");
    expect(getTextTier("pool-4")).toBe("4");
    expect(getTextTier("pool-3")).toBe("3");
    expect(getTextTier("pool-2")).toBe("2");
    expect(getTextTier("pool-1")).toBe("1");
  });

  it("keeps low nonzero pools visibly darker than zero-count pools when one pool is a large outlier", () => {
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-max", name: "最大池", ideaCount: 21, isDefault: true, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-one-a", name: "单条池A", ideaCount: 1, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-one-b", name: "单条池B", ideaCount: 1, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-zero", name: "零条池", ideaCount: 0, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    const allOrbs = Array.from(container.querySelectorAll(".glitter-home-stage__pool-orb")) as Array<
      HTMLElement & { dataset: Record<string, string> }
    >;
    const primaryOrb = allOrbs.find((orb) => orb.dataset.poolId === "pool-max") ?? null;
    const oneOrbA = allOrbs.find((orb) => orb.dataset.poolId === "pool-one-a") ?? null;
    const oneOrbB = allOrbs.find((orb) => orb.dataset.poolId === "pool-one-b") ?? null;
    const zeroOrb = allOrbs.find((orb) => orb.dataset.poolId === "pool-zero") ?? null;

    expect(primaryOrb).not.toBeNull();
    expect(oneOrbA).not.toBeNull();
    expect(oneOrbB).not.toBeNull();
    expect(zeroOrb).not.toBeNull();

    expect(primaryOrb!.dataset.textTier).toBe("7");
    expect(oneOrbA!.dataset.textTier).toBe("4");
    expect(oneOrbB!.dataset.textTier).toBe("4");
    expect(zeroOrb!.dataset.textTier).toBe("1");
  });

  it("does not render an overflow entry card when overflowEntry is absent", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("home-populated"), {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect() {},
      onSearchSubmit() {}
    });

    expect(container.querySelector(".glitter-home-stage__overflow-entry")).toBeNull();
  });

  it("keeps rendering every pool orb when runtime pools exceed the old overflow threshold", () => {
    const selectedPoolIds: string[] = [];
    const container = createContainer();
    const state = buildHomeViewStateFromRuntime(
      {
        mode: "populated",
        pools: [
          { id: "pool-1", name: "池 1", ideaCount: 100, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unsorted },
          { id: "pool-2", name: "池 2", ideaCount: 90, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-3", name: "池 3", ideaCount: 80, isDefault: false, color: DEFAULT_SETTINGS.poolColors.writing },
          { id: "pool-4", name: "池 4", ideaCount: 70, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research },
          { id: "pool-5", name: "池 5", ideaCount: 60, isDefault: false, color: DEFAULT_SETTINGS.poolColors.unnamed },
          { id: "pool-6", name: "池 6", ideaCount: 50, isDefault: false, color: DEFAULT_SETTINGS.poolColors.product },
          { id: "pool-7", name: "池 7", ideaCount: 40, isDefault: false, color: DEFAULT_SETTINGS.poolColors.research }
        ]
      },
      { poolColors: DEFAULT_SETTINGS.poolColors }
    );

    renderHomeView(container, state, {
      onPrimaryAction() {},
      onSecondaryAction() {},
      onPoolSelect: (poolId) => {
        selectedPoolIds.push(poolId);
      },
      onSearchSubmit() {}
    });

    const allPoolOrbs = Array.from(container.querySelectorAll(".glitter-home-stage__pool-orb")) as Array<
      HTMLElement & { click: () => void; dataset: Record<string, string> }
    >;
    const extraPoolOrb = allPoolOrbs.find((orb) => orb.dataset.poolId === "pool-7") ?? null;

    expect(allPoolOrbs).toHaveLength(7);
    expect(container.querySelector(".glitter-home-stage__overflow-entry")).toBeNull();
    expect(extraPoolOrb).not.toBeNull();
    expect(extraPoolOrb?.dataset.orbKind).toBe("pool");
    expect(extraPoolOrb?.querySelector(".glitter-home-stage__pool-orb-shell")).not.toBeNull();
    expect(extraPoolOrb?.querySelector(".glitter-home-stage__water-surface")).not.toBeNull();
    expect(extraPoolOrb?.querySelector(".glitter-home-stage__water-seed")).toBeNull();
    expect(extraPoolOrb?.querySelector(".glitter-home-stage__water-ripple-layer")).not.toBeNull();
    expect(extraPoolOrb?.querySelector(".glitter-home-stage__water-ripple")).not.toBeNull();
    expect(extraPoolOrb?.querySelector(".glitter-home-stage__water-ripple--near")).not.toBeNull();

    extraPoolOrb?.click();

    expect(selectedPoolIds).toEqual(["pool-7"]);
  });

  it("keeps populated-home tone families, water-ripple styling, and frozen empty ripple css markers", () => {
    expect(stylesCss).toContain('.glitter-home-stage__pool-orb[data-orb-tone="unsorted"] {');
    expect(stylesCss).toContain('.glitter-home-stage__pool-orb[data-orb-tone="product"] {');
    expect(stylesCss).toContain('.glitter-home-stage__pool-orb[data-orb-tone="research"] {');
    expect(stylesCss).toContain('.glitter-home-stage__pool-orb[data-orb-tone="writing"] {');
    expect(stylesCss).toContain('.glitter-home-stage__pool-orb[data-orb-tone="unnamed"] {');
    expect(stylesCss).toContain("--glitter-home-orb-size-xs-min: 88px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xs-max: 88px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-sm-min: 106px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-sm-max: 106px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-md-min: 124px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-md-max: 124px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-lg-min: 144px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-lg-max: 144px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xl-min: 166px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xl-max: 166px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xxl-min: 190px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xxl-max: 190px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xxxl-min: 216px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xxxl-max: 216px;");
    expect(stylesCss).toContain("--glitter-home-orb-safe-gap: clamp(16px, 2.8vw, 26px);");

    expectRuleHasDeclarations(".glitter-home-stage__pool-stage", ["overflow: visible;"]);
    expect(stylesCss).not.toContain(".glitter-home-stage__pool-orb--phase-0 {");
    expect(stylesCss).not.toContain(".glitter-home-stage__pool-orb--phase-1 {");
    expect(stylesCss).not.toContain(".glitter-home-stage__pool-orb--phase-2 {");
    expect(stylesCss).not.toContain(".glitter-home-stage__pool-orb--phase-3 {");
    expect(stylesCss).not.toContain('.glitter-home-stage__pool-orb[data-orb-tone="overflow"] {');
    expect(stylesCss).not.toContain('[data-orb-kind="overflow"] .glitter-home-stage__pool-orb-count');
    expect(stylesCss).not.toContain(".glitter-home-stage__overflow-entry {");
    expect(stylesCss).not.toContain(".glitter-home-stage__overflow-entry-bubbles {");
    expect(stylesCss).not.toContain(".glitter-home-stage__overflow-entry-bubble {");
    expect(stylesCss).not.toContain(".glitter-home-stage__overflow-entry-bubble--near {");
    expect(stylesCss).not.toContain(".glitter-home-stage__overflow-entry-bubble--mid {");
    expect(stylesCss).not.toContain(".glitter-home-stage__overflow-entry-bubble--far {");
    expect(stylesCss).not.toContain(".glitter-home-stage__overflow-entry-copy {");
    expect(stylesCss).not.toContain(".glitter-home-stage__overflow-entry-label {");
    expect(stylesCss).not.toContain(".glitter-home-stage__overflow-entry-count {");
    expect(stylesCss).not.toContain("@keyframes glitter-home-overflow-bubble-float {");

    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__pool-orb", [
      "--glitter-home-orb-shell-inset: 16px;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__primary-orb", [
      "--glitter-home-orb-shell-inset: 14px;"
    ]);

    expectRuleHasDeclarations(".glitter-home-stage__water-surface", [
      "position: absolute;",
      "inset: var(--glitter-home-orb-shell-inset);",
      "border-radius: 999px;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__water-surface", [
      "overflow: hidden;",
      "background-repeat: no-repeat;"
    ]);
    const waterSurfaceBaseBlock = getRuleBlocks(stylesCss, ".glitter-home-stage__water-surface").join("\n");
    expect(waterSurfaceBaseBlock).not.toContain("animation:");
    expectRuleHasDeclarations(".glitter-home-stage__water-ripple-layer", [
      "position: absolute;",
      "inset: var(--glitter-home-orb-shell-inset);",
      "z-index: 2;",
      "overflow: visible;",
      "pointer-events: none;"
    ]);
    expect(getRuleBlocks(stylesCss, ".glitter-home-stage__water-seed")).toHaveLength(0);
    expectRuleHasDeclarations(".glitter-home-stage__water-ripple", [
      "position: absolute;",
      "inset: 0;",
      "border-radius: 999px;",
      "transform-origin: center;"
    ]);
    expectRuleHasDeclarations('.glitter-home-stage[data-glitter-theme="obsidian-light"] .glitter-home-stage__water-surface', [
      "border-color: rgb(var(--glitter-home-orb-rgb, 113 136 190));",
      "box-shadow:",
      "inset 0 0 0 1px rgb(var(--glitter-home-orb-rgb, 113 136 190))"
    ]);
    expectRuleHasDeclarations('.glitter-home-stage[data-glitter-theme="obsidian-light"] .glitter-home-stage__water-ripple', [
      "border-color: rgb(var(--glitter-home-orb-rgb, 113 136 190));",
      "box-shadow: none;",
      "background-image: none;"
    ]);
    expectRulePropertyContains(
      ".glitter-home-stage__water-ripple",
      "animation",
      "glitter-home-water-ripple-stream"
    );
    expect(getRuleBlocks(stylesCss, ".glitter-home-stage__water-ripple--near")).toHaveLength(1);
    expect(getRuleBlocks(stylesCss, ".glitter-home-stage__water-ripple--mid")).toHaveLength(1);
    expect(getRuleBlocks(stylesCss, ".glitter-home-stage__water-ripple--far")).toHaveLength(1);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb-text", [
      "position: absolute;",
      "inset: var(--glitter-home-orb-shell-inset);",
      "pointer-events: none;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb-text--editing", [
      "pointer-events: auto;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb-name", [
      "position: relative;",
      "z-index: 1;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb-count", [
      "position: relative;",
      "z-index: 1;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb-name", [
      "white-space: normal;",
      "overflow-wrap: anywhere;",
      "text-overflow: clip;"
    ]);
    expectRuleHasDeclarations('.glitter-home-stage__pool-orb-name[contenteditable="true"]', [
      "cursor: text;",
      "outline: none;",
      "text-decoration-line: underline;",
      "text-underline-offset: 0.18em;"
    ]);

    const populatedRippleKeyframes = stylesCss.slice(
      stylesCss.indexOf("@keyframes glitter-home-water-ripple {"),
      stylesCss.indexOf("@keyframes glitter-home-water-ripple-core {")
    );
    expect(populatedRippleKeyframes).toBe("");
    expect(stylesCss).not.toContain("@keyframes glitter-home-water-ripple {");

    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-ripple", [
      "width: 62%;",
      "transform: translate(-50%, -50%) scale(0.66);",
      "animation: glitter-home-empty-orb-ripple 4.8s ease-out infinite;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-ripple--inner", ["animation-delay: 0s;"]);
    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-ripple--middle", ["animation-delay: 1.2s;"]);
    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-ripple--outer", ["animation-delay: 2.4s;"]);
    expect(stylesCss).toContain("@keyframes glitter-home-empty-orb-ripple {");
    expect(stylesCss).toContain("transform: translate(-50%, -50%) scale(0.64);");
    expect(stylesCss).toContain("opacity: 0.48;");
    expect(stylesCss).toContain("opacity: 0.22;");
    expect(stylesCss).toContain("scale(2.56)");
  });

  it("adds centered spring-rain stage css blocks with text-only title hit areas and visible ripple overlap", () => {
    expectRuleHasDeclarations(".glitter-home-stage__pool-stage--spring-rain", [
      "position: relative;",
      "overflow: visible;",
      "isolation: isolate;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-pool", [
      "position: absolute;",
      "left: var(--glitter-home-spring-rain-origin-x);",
      "top: var(--glitter-home-spring-rain-origin-y);",
      "transform: translate(-50%, -50%);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-title-column", [
      "position: absolute;",
      "left: 50%;",
      "transform: translateX(-50%);",
      "overflow: visible;"
    ]);
    expectRulePropertyContains(
      ".glitter-home-stage__spring-rain-title-column",
      "bottom",
      "50% +"
    );
    expectRulePropertyContains(
      ".glitter-home-stage__spring-rain-title-column",
      "bottom",
      "var(--glitter-home-spring-rain-connector-height)"
    );
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-pool--muted", [
      "opacity: 0.16;",
      "filter: blur(2.4px) saturate(0.42) brightness(0.72);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-action-corridor", [
      "position: absolute;",
      "left: calc(50% + 8px);",
      "width: 116px;",
      "pointer-events: none;",
      "z-index: 2;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-actions", [
      "position: absolute;",
      "left: calc(100% + 6px);",
      "opacity: 0;",
      "pointer-events: none;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-title-column--editing .glitter-home-stage__spring-rain-title-hit-area", [
      "pointer-events: none;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-title-hit-area", [
      "all: unset;",
      "appearance: none !important;",
      "background: transparent !important;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-connector", [
      "left: 50%;",
      "bottom: 50%;",
      "transform: translateX(-50%);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-body", [
      "border-radius: 50%;",
      "overflow: visible;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-body-ripple-layer", [
      "inset: -8% -6%;",
      "pointer-events: auto;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__spring-rain-body-ripple", [
      "border-radius: 50%;",
      "transform: scale(0.08);"
    ]);
    expectRulePropertyContains(
      ".glitter-home-stage__spring-rain-body-ripple",
      "animation",
      "glitter-home-spring-rain-ripple var(--glitter-home-spring-rain-ripple-duration)"
    );
    expectRulePropertyContains(
      ".glitter-home-stage__spring-rain-body-ripple",
      "animation",
      "cubic-bezier(0.16, 0.48, 0.22, 1)"
    );
    expectRulePropertyContains(
      ".glitter-home-stage__spring-rain-body-ripple--mid",
      "animation-delay",
      "var(--glitter-home-spring-rain-wave-step) * 0.72"
    );
    expectRulePropertyContains(
      ".glitter-home-stage__spring-rain-pool--focused .glitter-home-stage__spring-rain-title-shell",
      "animation",
      "glitter-home-spring-rain-title-float"
    );
    expect(stylesCss).toContain("@keyframes glitter-home-spring-rain-ripple {");
    expect(stylesCss).toContain("transform: scale(var(--glitter-home-spring-rain-ripple-impact-scale, 0.18));");
    expect(stylesCss).toContain("78% {");
    expect(stylesCss).toContain("opacity: 0.06;");
    expect(stylesCss).toContain("@keyframes glitter-home-spring-rain-title-float {");
    expect(stylesCss).not.toContain("--glitter-home-spring-rain-body-tilt");
  });

  it("keeps populated water ripple motion as a static core with outward animated concentric ripples", () => {
    expect(stylesCss).toContain("@keyframes glitter-home-water-ripple-stream {");
    expect(stylesCss).not.toContain("@keyframes glitter-home-water-seed-breathe {");
    expect(stylesCss).not.toContain("@keyframes glitter-home-water-ripple-core {");
    const streamKeyframes = stylesCss.slice(
      stylesCss.indexOf("@keyframes glitter-home-water-ripple-stream {"),
      stylesCss.indexOf("@keyframes glitter-home-empty-orb-ripple {")
    );

    expectRuleHasDeclarations(".glitter-home-stage__water-ripple-layer", [
      "position: absolute;",
      "inset: var(--glitter-home-orb-shell-inset);",
      "overflow: visible;",
      "pointer-events: none;"
    ]);
    expect(getRuleBlocks(stylesCss, ".glitter-home-stage__water-seed")).toHaveLength(0);
    expectRuleHasDeclarations(".glitter-home-stage__water-ripple", [
      "position: absolute;",
      "inset: 0;",
      "border-radius: 999px;",
      "transform: scale(1);",
      "transform-origin: center;"
    ]);
    expectRulePropertyContains(
      ".glitter-home-stage__water-ripple",
      "animation",
      "glitter-home-water-ripple-stream var(--glitter-home-ripple-duration, 20.8s) linear calc(var(--glitter-home-ripple-delay, 0s) + var(--glitter-home-ripple-delay-offset, 0s)) infinite"
    );
    expectRuleHasDeclarations(".glitter-home-stage__water-ripple--near", [
      "--glitter-home-ripple-target-scale: var(--glitter-home-ripple-scale-rise, 1.34);",
      "--glitter-home-ripple-delay-offset: 0s;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__water-ripple--mid", [
      "--glitter-home-ripple-target-scale: var(--glitter-home-ripple-scale-mid, 1.88);",
      "--glitter-home-ripple-delay-offset: calc(var(--glitter-home-ripple-duration, 20.8s) * 0.22);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__water-ripple--far", [
      "--glitter-home-ripple-target-scale: var(--glitter-home-ripple-scale-end, 2.56);",
      "--glitter-home-ripple-delay-offset: calc(var(--glitter-home-ripple-duration, 20.8s) * 0.44);"
    ]);

    expect(streamKeyframes).toContain("18% {");
    expect(streamKeyframes).toContain("0% {\n    opacity: 0;\n    border-width: var(--glitter-home-ripple-line-width-start, 1.1px);\n    transform: scale(1);");
    expect(streamKeyframes).toContain("18% {\n    opacity: var(--glitter-home-ripple-opacity-peak, 0.18);");
    expect(streamKeyframes).toContain("54% {\n    opacity: var(--glitter-home-ripple-opacity-trail, 0.08);\n    border-width: var(--glitter-home-ripple-line-width-mid, 0.82px);");
    expect(streamKeyframes).toContain("100% {\n    opacity: 0;\n    border-width: var(--glitter-home-ripple-line-width-end, 0.58px);\n    transform: scale(var(--glitter-home-ripple-target-scale, var(--glitter-home-ripple-scale-end, 2.56)));");
  });

  it("pins orb diameters to seven fixed tiers with a readable minimum size", () => {
    expect(stylesCss).toContain("--glitter-home-orb-size-xs-min: 88px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-sm-min: 106px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-md-min: 124px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-lg-min: 144px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xl-min: 166px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xxl-min: 190px;");
    expect(stylesCss).toContain("--glitter-home-orb-size-xxxl-min: 216px;");

    expectRuleHasDeclarations(".glitter-home-stage__primary-orb .glitter-home-stage__pool-orb-text", [
      "gap: var(--glitter-home-orb-text-gap, 6px);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__primary-orb .glitter-home-stage__pool-orb-name", [
      "font-size: var(--glitter-home-orb-name-font-size, clamp(12px, 1.9vw, 14px));"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__primary-orb .glitter-home-stage__pool-orb-count", [
      "font-size: var(--glitter-home-orb-count-font-size, clamp(26px, 3.6vw, 32px));"
    ]);

    expectRuleHasDeclarations(".glitter-home-stage__pool-orb--xs", [
      "width: var(--glitter-home-orb-size-xs-max);",
      "height: var(--glitter-home-orb-size-xs-max);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb--sm", [
      "width: var(--glitter-home-orb-size-sm-max);",
      "height: var(--glitter-home-orb-size-sm-max);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb--md", [
      "width: var(--glitter-home-orb-size-md-max);",
      "height: var(--glitter-home-orb-size-md-max);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb--lg", [
      "width: var(--glitter-home-orb-size-lg-max);",
      "height: var(--glitter-home-orb-size-lg-max);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb--xl", [
      "width: var(--glitter-home-orb-size-xl-max);",
      "height: var(--glitter-home-orb-size-xl-max);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb--xxl", [
      "width: var(--glitter-home-orb-size-xxl-max);",
      "height: var(--glitter-home-orb-size-xxl-max);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb--xxxl", [
      "width: var(--glitter-home-orb-size-xxxl-max);",
      "height: var(--glitter-home-orb-size-xxxl-max);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__primary-orb", [
      "width: var(--glitter-home-orb-size-xxxl-max);",
      "height: var(--glitter-home-orb-size-xxxl-max);"
    ]);
    expect(stylesCss).not.toContain("@container glitter-home-orb-region");
  });

  it("keeps reduced-motion fallback by fully disabling populated ripple animation", () => {
    const reducedMotionBlock = getMediaBlock(stylesCss, "@media (prefers-reduced-motion: reduce) {");

    expect(reducedMotionBlock).toContain(".glitter-home-stage *::after {");
    expect(reducedMotionBlock).toContain("animation: none !important;");
    expect(reducedMotionBlock).toContain("transition: none !important;");
    expect(reducedMotionBlock).not.toContain(".glitter-home-stage__water-surface {");
    expect(reducedMotionBlock).not.toContain(".glitter-home-stage__water-ripple {");
    expect(reducedMotionBlock).not.toContain("glitter-home-water-ripple-stream");
  });

  it("keeps populated-home CSS contract for floating bottom shell and solid-core orbs", () => {
    expect(stylesCss).toContain("--glitter-home-populated-action-shell-bg: color-mix(in srgb, var(--glitter-ui-surface) 88%, transparent);");
    expect(stylesCss).toContain("--glitter-home-populated-orb-label: var(--h1-color, var(--text-normal, #dce5ff));");
    expect(stylesCss).toContain("--glitter-home-populated-orb-count: var(--h1-color, var(--text-normal, #dce5ff));");
    expect(stylesCss).toContain("--glitter-home-populated-orb-label-muted:");
    expect(stylesCss).toContain("--glitter-home-populated-orb-count-muted:");
    expectRulePropertyContains(
      ".glitter-home-stage",
      "--glitter-home-populated-orb-label-muted",
      "var(--background-primary"
    );
    expectRulePropertyContains(
      ".glitter-home-stage",
      "--glitter-home-populated-orb-count-muted",
      "var(--background-primary"
    );
    expectRuleHasDeclarations('.glitter-home-stage[data-glitter-theme="obsidian-light"]', [
      "--glitter-home-populated-orb-label-muted:",
      "--glitter-home-populated-orb-count-muted:"
    ]);
    expectRulePropertyContains(
      '.glitter-home-stage[data-glitter-theme="obsidian-light"]',
      "--glitter-home-populated-orb-label-muted",
      "white"
    );
    expectRulePropertyContains(
      '.glitter-home-stage[data-glitter-theme="obsidian-light"]',
      "--glitter-home-populated-orb-count-muted",
      "white"
    );
    expectRulePropertyContains(
      ".glitter-home-stage__pool-orb-name",
      "color",
      "var(--glitter-home-populated-orb-label)"
    );
    expectRulePropertyContains(
      ".glitter-home-stage__pool-orb-count",
      "color",
      "var(--glitter-home-populated-orb-count)"
    );

    expectRuleHasDeclarations(".glitter-home-stage", [
      "grid-template-rows: auto minmax(0, 1fr);",
      "box-sizing: border-box;"
    ]);

    expectRuleHasDeclarations(".glitter-home-stage__action-bar--populated", [
      "position: absolute;",
      "left: 50%;",
      "bottom: var(--glitter-home-floating-action-bottom-offset);",
      "transform: translateX(-50%);",
      "width: fit-content;",
      "max-width: calc(100% - 56px);",
      "min-height: 60px;",
      "border-radius: 16px;",
      "border: none;",
      "background: var(--glitter-home-populated-action-shell-bg);",
      "-webkit-backdrop-filter: blur(20px) saturate(146%);",
      "backdrop-filter: blur(20px) saturate(146%);"
    ]);

    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__action-secondary", [
      "position: relative;",
      "overflow: hidden;",
      "isolation: isolate;",
      "transform: translateY(0);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__action-secondary", [
      "min-width: 156px;",
      "min-height: 44px;",
      "border: 1px solid var(--glitter-home-populated-action-secondary-border);",
      "color: var(--glitter-home-populated-action-secondary-text);"
    ]);
    expectRulePropertyContains(
      ".glitter-home-stage .glitter-home-stage__action-secondary",
      "background",
      "var(--glitter-home-populated-action-secondary-bg) 96%"
    );
    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__action-secondary", [
      "box-shadow: none;"
    ]);

    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__action-primary", [
      "position: relative;",
      "overflow: hidden;",
      "isolation: isolate;",
      "transform: translateY(0);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__action-primary", [
      "min-width: 220px;",
      "min-height: 44px;",
      "border: none;",
      "background: var(--glitter-ui-accent);",
      "background-image: none;",
      "color: var(--glitter-ui-accent-contrast);"
    ]);
    expectRulePropertyContains(
      ".glitter-home-stage .glitter-home-stage__action-primary",
      "box-shadow",
      "0 6px 14px"
    );
    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__action-secondary:hover", [
      "transform: translateY(-1px);"
    ]);
    expectRulePropertyContains(
      ".glitter-home-stage .glitter-home-stage__action-secondary:hover",
      "box-shadow",
      "0 10px 20px"
    );
    expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__action-primary:hover", [
      "transform: translateY(-1px);"
    ]);
    expectRulePropertyContains(
      ".glitter-home-stage .glitter-home-stage__action-primary:hover",
      "background-image",
      "linear-gradient("
    );
    expect(stylesCss).not.toContain(".glitter-home-stage .glitter-home-stage__action-primary::after {");
    expect(stylesCss).not.toContain(".glitter-home-stage .glitter-home-stage__action-primary:hover::after {");
    expect(stylesCss).not.toContain("@keyframes glitter-home-action-primary-water-drift");

    expectRuleHasDeclarations(".glitter-home-stage__action-icon", [
      "width: 14px;",
      "height: 14px;",
      "background-color: currentColor;"
    ]);
    expect(stylesCss).toContain(".glitter-home-stage__action-icon--secondary {");
    expect(stylesCss).toContain("M2 6c2 0 2 2 4 2s2-2 4-2");
    expect(stylesCss).toContain(".glitter-home-stage__action-icon--primary {");
    expect(stylesCss).toContain("M12 5v14");

    expectRuleHasDeclarations(".glitter-home-stage__pool-orb::before", ["content: none;"]);

    expectRuleHasDeclarations(".glitter-home-stage__water-surface", [
      "position: absolute;",
      "inset: var(--glitter-home-orb-shell-inset);",
      "border: 1px solid transparent;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb-isolation-orbit", [
      "position: absolute;",
      "inset: var(--glitter-home-orb-shell-inset);",
      "overflow: visible;",
      "pointer-events: none;",
      "opacity: 0;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb-isolation-runner", [
      "transform-origin: center;",
      "will-change: transform;",
      "animation: glitter-home-orb-isolation-orbit 60s linear infinite;",
      "animation-play-state: paused;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb-isolation-comet", [
      "position: absolute;",
      "inset: 0;",
      "filter: blur(0.82px);",
      "opacity: 0.94;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb-isolation-head", [
      "left: calc(100% - 1px);",
      "width: 10px;",
      "height: 10px;",
      "animation: glitter-home-orb-isolation-head-glint 1.8s ease-in-out infinite;",
      "animation-play-state: paused;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__pool-orb--isolated .glitter-home-stage__pool-orb-isolation-orbit", [
      "opacity: 1;"
    ]);
    expectRulePropertyContains(
      ".glitter-home-stage__water-surface",
      "box-shadow",
      "inset 0 0 0 2px"
    );
    const waterSurfaceBlock = getRuleBlocks(stylesCss, ".glitter-home-stage__water-surface").join("\n");
    expect(waterSurfaceBlock).not.toContain("inset 0 0 0 1px");
    expect(waterSurfaceBlock).not.toContain("white 72%, rgb(var(--glitter-home-orb-rgb, 113 136 190)) 28%) 0%, color-mix(in srgb, white 26%, rgb(var(--glitter-home-orb-rgb, 113 136 190)) 18%) 11%, transparent 22%");
    expect(stylesCss).not.toContain(".glitter-home-stage__pool-orb--xs .glitter-home-stage__water-surface,");
    expect(stylesCss).not.toContain(".glitter-home-stage__pool-orb--sm .glitter-home-stage__water-surface,");
    expect(stylesCss).not.toContain(".glitter-home-stage__pool-orb--md .glitter-home-stage__water-surface {");
    expectRuleHasDeclarations(
      ".glitter-home-stage__water-surface--dashed",
      ["box-shadow: none;"]
    );
    const dashedWaterSurfaceBlock = getRuleBlocks(stylesCss, ".glitter-home-stage__water-surface--dashed").join("\n");
    expect(dashedWaterSurfaceBlock).not.toContain("inset 0 0 0 2px");
    expect(dashedWaterSurfaceBlock).not.toContain("inset 0 1px 0");
    expect(dashedWaterSurfaceBlock).not.toContain("inset 0 -12px 20px");
    expectRuleHasDeclarations(
      ".glitter-home-stage__water-surface--dashed::after",
      [
        'content: "";',
        "position: absolute;",
        "inset: 0;",
        "border-radius: inherit;",
        "background-color: rgb(var(--glitter-home-orb-rgb, 113 136 190));"
      ]
    );
    const dashedAfterBlock = getRuleBlocks(stylesCss, ".glitter-home-stage__water-surface--dashed::after").join("\n");
    expect(dashedAfterBlock).not.toContain("inset: 6px;");
    expect(stylesCss).toContain("stroke-linecap='round'");
    expect(stylesCss).toContain("stroke-dasharray='1 7'");
    expect(stylesCss).toContain("r='49'");
    expect(stylesCss).toContain("stroke-width='2'");
    expect(stylesCss).not.toContain("stroke-dasharray='5 8'");
    expect(stylesCss).not.toContain("r='47'");
    expect(stylesCss).not.toContain("stroke-width='4'");

    expect(getRuleBlocks(stylesCss, ".glitter-home-stage__fusion-bridge")).toHaveLength(0);
    expect(getRuleBlocks(stylesCss, ".glitter-home-stage__fusion-filter-defs")).toHaveLength(0);
    expect(stylesCss).not.toContain("glitter-home-fusion-goo");
    expect(stylesCss).not.toContain("data-fusion-softened");

    expect(stylesCss).toContain("--glitter-home-stage-sample-layer-1:");
    expect(stylesCss).toContain("--glitter-home-stage-sample-layer-2:");
    expect(stylesCss).toContain("background-color: var(--glitter-runtime-bg-base);");
    expect(stylesCss).toContain("background-image:\n    var(--glitter-home-stage-sample-layer-1),\n    var(--glitter-home-stage-sample-layer-2);");
    expect(stylesCss).toContain("background-size:\n    var(--glitter-home-derived-stage-width) var(--glitter-home-derived-stage-height),\n    var(--glitter-home-derived-stage-width) var(--glitter-home-derived-stage-height);");
    expect(stylesCss).toContain("background-position:\n    calc(0px - var(--glitter-home-stage-sample-x)) calc(0px - var(--glitter-home-stage-sample-y)),\n    calc(0px - var(--glitter-home-stage-sample-x)) calc(0px - var(--glitter-home-stage-sample-y));");
    expect(waterSurfaceBlock).not.toContain("radial-gradient(");
    expect(waterSurfaceBlock).not.toContain("repeating-radial-gradient(");
    expect(stylesCss).not.toContain("glitter-home-water-seed-breathe");
    expect(stylesCss).not.toContain("glitter-home-water-ripple-core");
    expect(stylesCss).toContain("--glitter-home-ripple-target-scale");
    expect(stylesCss).toContain("glitter-home-water-ripple-stream var(--glitter-home-ripple-duration, 20.8s) linear calc(var(--glitter-home-ripple-delay, 0s) + var(--glitter-home-ripple-delay-offset, 0s)) infinite");
    expect(stylesCss).toContain("--glitter-home-orb-ring-rgb:");
    expect(stylesCss).toContain("@keyframes glitter-home-orb-isolation-orbit {");
    expect(stylesCss).toContain("transform: rotate(132deg);");
    expect(stylesCss).toContain("transform: rotate(492deg);");
    expect(stylesCss).toContain("@keyframes glitter-home-orb-isolation-head-glint {");
    expect(stylesCss).toContain("M12 1 14.3 9.7 23 12");
    expect(stylesCss).toContain('.glitter-home-stage[data-glitter-theme="obsidian-light"] .glitter-home-stage__pool-orb-isolation-comet {');
    expectRulePropertyContains(
      '.glitter-home-stage[data-glitter-theme="obsidian-light"] .glitter-home-stage__pool-orb-isolation-comet',
      'filter',
      'blur(0.26px) saturate(1.34) contrast(1.18)'
    );
    expectRulePropertyContains(
      '.glitter-home-stage[data-glitter-theme="obsidian-light"] .glitter-home-stage__pool-orb-isolation-comet',
      'opacity',
      '1'
    );
    expect(stylesCss).toContain('.glitter-home-stage[data-glitter-theme="obsidian-light"] .glitter-home-stage__pool-orb-isolation-head {');
    expectRulePropertyContains(
      '.glitter-home-stage[data-glitter-theme="obsidian-light"] .glitter-home-stage__pool-orb-isolation-head',
      'box-shadow',
      '0 0 0 1px'
    );
    expectRulePropertyContains(
      '.glitter-home-stage[data-glitter-theme="obsidian-light"] .glitter-home-stage__pool-orb-isolation-head',
      'background',
      'white 0 12%'
    );
    expectRulePropertyContains(
      '.glitter-home-stage[data-glitter-theme="obsidian-light"] .glitter-home-stage__pool-orb-isolation-head::before',
      'opacity',
      '1'
    );
    expect(stylesCss).not.toContain("background: linear-gradient(180deg, color-mix(in srgb, var(--glitter-home-populated-action-primary-bg) 94%, white 6%) 0%, var(--glitter-home-populated-action-primary-bg) 100%);");


    expectRuleHasDeclarations(".glitter-home-stage__primary-orb .glitter-home-stage__water-surface", [
      "opacity: 0.84;",
      "border-color: transparent;"
    ]);
    const primaryWaterSurfaceBlock = getRuleBlocks(
      stylesCss,
      ".glitter-home-stage__primary-orb .glitter-home-stage__water-surface"
    ).join("\n");
    expect(primaryWaterSurfaceBlock).not.toContain("inset 0 0 0 1px");
    expect(primaryWaterSurfaceBlock).not.toContain("inset 0 12px 24px");
  });

  it("calls onPrimaryAction and onSecondaryAction when action buttons are clicked", () => {
    const container = createContainer();
    let primaryCalls = 0;
    let secondaryCalls = 0;

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => {
        primaryCalls += 1;
      },
      onSecondaryAction: () => {
        secondaryCalls += 1;
      },
      onPoolSelect: () => undefined,
      onSearchSubmit() {}
    });

    const primaryButton = container.querySelector(".glitter-home-stage__action-primary") as HTMLElement | null;
    const secondaryButton = container.querySelector(".glitter-home-stage__action-secondary") as HTMLElement | null;

    primaryButton?.click();
    secondaryButton?.click();

    expect(primaryCalls).toBe(1);
    expect(secondaryCalls).toBe(1);
  });

  it("keeps empty-state orb wired to primary handler and omits bottom action handlers", () => {
    const container = createContainer();
    let primaryCalls = 0;
    let secondaryCalls = 0;

    renderHomeView(container, buildHomeViewState("home-empty"), {
      onPrimaryAction: () => {
        primaryCalls += 1;
      },
      onSecondaryAction: () => {
        secondaryCalls += 1;
      },
      onPoolSelect: () => undefined,
      onSearchSubmit() {}
    });

    const emptyOrb = container.querySelector(".glitter-home-stage__empty-orb-hit-area") as HTMLElement | null;
    const primaryButton = container.querySelector(".glitter-home-stage__action-primary") as HTMLElement | null;
    const secondaryButton = container.querySelector(".glitter-home-stage__action-secondary") as HTMLElement | null;

    expect((emptyOrb as unknown as { disabled?: boolean } | null)?.disabled).toBe(false);

    emptyOrb?.click();
    primaryButton?.click();
    secondaryButton?.click();

    expect(primaryCalls).toBe(1);
    expect(secondaryCalls).toBe(0);
  });

  it("marks empty-state orb hit area disabled when primary action is disabled", () => {
    const container = createContainer();
    const state = buildHomeViewState("home-empty");
    state.primaryAction.disabled = true;
    let primaryCalls = 0;

    renderHomeView(container, state, {
      onPrimaryAction: () => {
        primaryCalls += 1;
      },
      onSecondaryAction: () => undefined,
      onPoolSelect: () => undefined,
      onSearchSubmit() {}
    });

    const emptyOrb = container.querySelector(".glitter-home-stage__empty-orb-hit-area") as
      | (HTMLElement & { disabled?: boolean; click: () => void })
      | null;

    expect(emptyOrb?.disabled).toBe(true);

    emptyOrb?.click();

    expect(primaryCalls).toBe(0);
  });

  it("keeps empty-orb button chrome reset and aligns hit-area sizing with visible orb layers", () => {
    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-hit-area", [
      "all: unset;",
      "appearance: none;",
      "-webkit-appearance: none;",
      "font: inherit;",
      "border-radius: 999px;",
      "text-shadow: none;",
      "display: grid;",
      "overflow: visible;",
      "width: clamp(176px, 50vw, 264px);"
    ]);
    expectRulePropertyContains(".glitter-home-stage__empty-orb-hit-area", "box-shadow", "none");
    expect(stylesCss).not.toContain("font-size: 0;");
    expect(stylesCss).not.toContain("text-indent: -9999px;");

    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-hit-area:focus-visible", [
      "outline: 2px solid color-mix(in srgb, var(--glitter-runtime-accent) 76%, white 24%);",
      "outline-offset: 6px;",
      "0 0 0 8px color-mix(in srgb, var(--glitter-home-empty-halo) 40%, transparent);"
    ]);

    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-base", [
      "width: 100%;",
      "0 0 0 12px color-mix(in srgb, var(--glitter-home-empty-halo) 10%, transparent);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-shell", ["width: 86%;"]);
    expect(stylesCss).toContain("radial-gradient(circle at 50% 32%");
    expect(stylesCss).toContain("linear-gradient(180deg");
    expect(stylesCss).toContain("inset 0 -12px 18px");

    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-content", [
      "width: fit-content;",
      "max-width: none;",
      "top: 46%;",
      "z-index: 4;"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-content", ["gap: 9px;"]);
    expect(stylesCss).not.toContain("width: min(100%, 164px);");

    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-content-title", [
      "font-size: clamp(15px, 2vw, 18px);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-content-subtitle", ["font-size: 10px;"]);
    expectRuleHasDeclarations(".glitter-home-stage__empty-orb-content-icon", [
      "background-color: currentColor;",
      "-webkit-mask-image: url(\"data:image/svg+xml",
      "mask-image: url(\"data:image/svg+xml",
      "color: var(--glitter-home-empty-icon);",
      "text-shadow: 0 1px 6px color-mix(in srgb, var(--glitter-home-empty-halo) 46%, transparent);"
    ]);
    expectRuleHasDeclarations(".glitter-home-stage__empty-prompt-pill--attached", ["margin-top: -28px;"]);
  });

  it("keeps empty-state responsive constraints for narrow or short viewports without shrinking populated orb diameters", () => {
    expect(stylesCss).toContain("@media (max-width: 900px) {");
    expect(stylesCss).toContain(".glitter-home-stage__empty-layout {");
    expect(stylesCss).toContain("transform: translateY(-8px);");
    expect(stylesCss).toContain(".glitter-home-stage__empty-orb-hit-area {");
    expect(stylesCss).toContain("width: clamp(168px, 46vw, 248px);");
    expect(stylesCss).toContain("@media (max-width: 640px), (max-height: 820px) {");
    expect(stylesCss).toContain(".glitter-home-stage__field--empty {");
    expect(stylesCss).toContain("padding-top: 0;");
    expect(stylesCss).toContain(".glitter-home-stage__orb-region,\n  .glitter-home-stage__orb-stage {");
    expect(stylesCss).toContain("min-height: clamp(230px, min(48vh, 60vw), 360px);");
    expect(stylesCss).toContain("width: clamp(148px, 42vw, 204px);");
    expect(stylesCss).toContain("font-size: clamp(16px, 4vw, 20px);");
    expect(stylesCss).toContain(".glitter-home-stage__empty-prompt-pill--attached {");
    expect(stylesCss).toContain("@media (max-height: 680px) {");
    expect(stylesCss).toContain("min-height: 220px;");
    expect(stylesCss).not.toContain("container-type: inline-size;");
    expect(stylesCss).not.toContain("container-name: glitter-home-orb-region;");
    expect(stylesCss).not.toContain("@container glitter-home-orb-region (max-width: 440px) {");
    expect(stylesCss).not.toContain("@container glitter-home-orb-region (max-width: 360px) {");
  });

  it("keeps pool clicks working after removing the home click feedback layer", () => {
    const container = createContainer();
    const selectedPoolIds: string[] = [];

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: (poolId) => {
        selectedPoolIds.push(poolId);
      },
      onSearchSubmit() {}
    });

    const poolOrb = container.querySelector(".glitter-home-stage__primary-orb") as
      | (HTMLElement & {
          click: (options?: { offsetX?: number; offsetY?: number; clientX?: number; clientY?: number }) => void;
          dataset: Record<string, string>;
        })
      | null;

    expect(container.querySelector(".glitter-home-stage__water-surface")).not.toBeNull();
    expect(container.querySelector(".glitter-home-stage__water-seed")).toBeNull();
    expect(container.querySelector(".glitter-home-stage__water-ripple-layer")).not.toBeNull();

    poolOrb?.click();

    expect(selectedPoolIds).toHaveLength(1);
    expect(selectedPoolIds[0]).toBe(poolOrb?.dataset.poolId);
  });

  it("does not start stir-drag motion for tiny pointer drift below threshold", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: () => undefined,
      onSearchSubmit() {}
    });

    const primaryOrb = getPrimaryOrbElement(container);
    const origin = getPointerPosition(primaryOrb);

    primaryOrb.pointerdown(origin);
    dispatchPointerMove(container, {
      clientX: origin.clientX + 4,
      clientY: origin.clientY + 3
    });

    expect(getOrbShiftMagnitude(primaryOrb)).toBe(0);
    dispatchPointerUp(container, origin);
  });

  it("stirs nearby supporting orbs when the primary orb is dragged", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: () => undefined,
      onSearchSubmit() {}
    });

    const primaryOrb = getPrimaryOrbElement(container);
    const nearbySupportingOrb = getNearestSupportingOrbElement(container);
    const primarySampleXBefore = primaryOrb.style.getPropertyValue("--glitter-home-stage-sample-x");
    const nearbySampleXBefore = nearbySupportingOrb.style.getPropertyValue("--glitter-home-stage-sample-x");
    const origin = getPointerPosition(primaryOrb);

    primaryOrb.pointerdown(origin);
    dispatchPointerMove(container, {
      clientX: origin.clientX + 36,
      clientY: origin.clientY + 18
    });

    expect(getOrbShiftMagnitude(primaryOrb)).toBeGreaterThan(0);
    expect(getOrbShiftMagnitude(nearbySupportingOrb)).toBeGreaterThan(0);
    expect(getOrbShiftMagnitude(nearbySupportingOrb)).toBeLessThan(getOrbShiftMagnitude(primaryOrb));
    expect(primaryOrb.style.getPropertyValue("--glitter-home-stage-sample-x")).not.toBe(primarySampleXBefore);
    expect(nearbySupportingOrb.style.getPropertyValue("--glitter-home-stage-sample-x")).not.toBe(nearbySampleXBefore);

    dispatchPointerUp(container, {
      clientX: origin.clientX + 36,
      clientY: origin.clientY + 18
    });
  });

  it("lets a supporting orb drive stir-drag disturbance too", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: () => undefined,
      onSearchSubmit() {}
    });

    const primaryOrb = getPrimaryOrbElement(container);
    const supportingOrb = getNearestSupportingOrbElement(container) as unknown as HTMLElement & {
      className: string;
      style: OrbStyleLike;
      pointerdown: (options?: { pointerId?: number; clientX?: number; clientY?: number }) => void;
    };
    const origin = getPointerPosition(supportingOrb);

    supportingOrb.pointerdown(origin);
    dispatchPointerMove(container, {
      clientX: origin.clientX - 28,
      clientY: origin.clientY + 16
    });

    expect(getOrbShiftMagnitude(supportingOrb)).toBeGreaterThan(0);
    expect(getOrbShiftMagnitude(primaryOrb)).toBeGreaterThan(0);
    expect(getOrbShiftMagnitude(primaryOrb)).toBeLessThan(getOrbShiftMagnitude(supportingOrb));

    dispatchPointerUp(container, {
      clientX: origin.clientX - 28,
      clientY: origin.clientY + 16
    });
  });

  it("keeps a supporting orb at a far dragged landing position after release", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = [];

      constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
      }

      observe(): void {}

      disconnect(): void {}

      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    const previousResizeObserver = (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;

    try {
      const container = createContainer();

      renderHomeView(container, buildHomeViewState("settings-conflict"), {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: () => undefined,
        onSearchSubmit() {}
      });

      const root = container.querySelector(".glitter-plugin-root") as
        | (HTMLElement & { style: FakeStyle; setRectSize?: (rectWidth: number, rectHeight: number) => void })
        | null;
      expect(root).not.toBeNull();
      root!.style.setProperty("width", "1600px");
      root!.style.setProperty("height", "900px");
      if (typeof root!.setRectSize === "function") {
        root!.setRectSize(1600, 900);
      }
      const observer = ResizeObserverStub.instances.at(-1);
      expect(observer).toBeDefined();
      observer!.trigger();

      const stageSize = getPopulatedStageSize(container);
      const supportingOrb = getLargestLeftSupportingOrbElement(container, stageSize.width) as unknown as HTMLElement & {
        pointerdown: (options?: { pointerId?: number; clientX?: number; clientY?: number }) => void;
      };
      const origin = getPointerPosition(supportingOrb);
      const radius = getOrbRadius(supportingOrb);
      const deltaX = origin.clientX < stageSize.width / 2 ? 420 : -420;
      const deltaY = origin.clientY < stageSize.height / 2 ? 56 : -56;
      const expectedX = Math.min(stageSize.width - radius, Math.max(radius, origin.clientX + deltaX));
      const expectedY = Math.min(stageSize.height - radius, Math.max(radius, origin.clientY + deltaY));

      supportingOrb.pointerdown(origin);
      dispatchPointerMove(container, {
        clientX: origin.clientX + deltaX,
        clientY: origin.clientY + deltaY
      });

      const preReleaseShift = getOrbShift(supportingOrb);
      expect(preReleaseShift.x).toBeCloseTo(expectedX - origin.clientX, 3);
      expect(preReleaseShift.y).toBeCloseTo(expectedY - origin.clientY, 3);
      expect(expectedX).toBeGreaterThan(900);

      dispatchPointerUp(container, {
        clientX: origin.clientX + deltaX,
        clientY: origin.clientY + deltaY
      });

      const finalPosition = getPointerPosition(supportingOrb);
      expect(finalPosition.clientX).toBeCloseTo(expectedX, 3);
      expect(finalPosition.clientY).toBeCloseTo(expectedY, 3);
      expect(getOrbShiftMagnitude(supportingOrb)).toBeLessThan(0.001);
    } finally {
      (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = previousResizeObserver;
    }
  });

  it("commits a far-dragged orb and disturbed neighbors into new positions on release", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: () => undefined,
      onSearchSubmit() {}
    });

    const primaryOrb = getPrimaryOrbElement(container);
    const nearbySupportingOrb = getNearestSupportingOrbElement(container);
    const initialPrimary = getPointerPosition(primaryOrb);
    const initialSupporting = getPointerPosition(nearbySupportingOrb);
    const stageSize = getPopulatedStageSize(container);
    const primaryRadius = getOrbRadius(primaryOrb);
    const expectedPrimaryX = Math.min(
      stageSize.width - primaryRadius,
      Math.max(primaryRadius, initialPrimary.clientX + 120)
    );
    const expectedPrimaryY = Math.min(
      stageSize.height - primaryRadius,
      Math.max(primaryRadius, initialPrimary.clientY + 60)
    );

    primaryOrb.pointerdown(initialPrimary);
    dispatchPointerMove(container, {
      clientX: initialPrimary.clientX + 120,
      clientY: initialPrimary.clientY + 60
    });

    const preReleasePrimaryShift = getOrbShift(primaryOrb);
    const preReleaseSupportingShift = getOrbShift(nearbySupportingOrb);
    expect(preReleasePrimaryShift.x).toBeCloseTo(expectedPrimaryX - initialPrimary.clientX, 3);
    expect(preReleasePrimaryShift.y).toBeCloseTo(expectedPrimaryY - initialPrimary.clientY, 3);
    expect(Math.hypot(preReleaseSupportingShift.x, preReleaseSupportingShift.y)).toBeGreaterThan(0);

    dispatchPointerUp(container, {
      clientX: initialPrimary.clientX + 120,
      clientY: initialPrimary.clientY + 60
    });

    const finalPrimary = getPointerPosition(primaryOrb);
    const finalSupporting = getPointerPosition(nearbySupportingOrb);

    expect(finalPrimary.clientX).toBeCloseTo(expectedPrimaryX, 3);
    expect(finalPrimary.clientY).toBeCloseTo(expectedPrimaryY, 3);
    expect(finalSupporting.clientX).not.toBe(initialSupporting.clientX);
    expect(finalSupporting.clientY).not.toBe(initialSupporting.clientY);
    expect(getOrbShiftMagnitude(primaryOrb)).toBeLessThan(0.001);
    expect(getOrbShiftMagnitude(nearbySupportingOrb)).toBeLessThan(0.001);
  });

  it("creates a small water-like settling ripple after release without changing the landed position", () => {
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const frameQueue: Array<FrameRequestCallback> = [];
    let now = 0;

    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frameQueue.push(callback);
      return frameQueue.length;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => 0) as typeof globalThis.cancelAnimationFrame;

    try {
      const container = createContainer();

      renderHomeView(container, buildHomeViewState("settings-conflict"), {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: () => undefined,
        onSearchSubmit() {}
      });

      const primaryOrb = getPrimaryOrbElement(container);
      const origin = getPointerPosition(primaryOrb);

      primaryOrb.pointerdown(origin);
      dispatchPointerMove(container, {
        clientX: origin.clientX + 56,
        clientY: origin.clientY + 28
      });
      dispatchPointerUp(container, {
        clientX: origin.clientX + 56,
        clientY: origin.clientY + 28
      });

      const landedPosition = getPointerPosition(primaryOrb);
      const firstCallback = frameQueue.shift();
      expect(firstCallback).toBeDefined();
      now += 16;
      firstCallback?.(now);

      const rippleShift = getOrbShiftMagnitude(primaryOrb);
      expect(rippleShift).toBeGreaterThan(0);
      expect(rippleShift).toBeLessThan(12);
      expect(getPointerPosition(primaryOrb)).toEqual(landedPosition);

      for (let index = 0; index < 24; index += 1) {
        const callback = frameQueue.shift();
        if (!callback) {
          break;
        }
        now += 16;
        callback(now);
      }

      expect(getOrbShiftMagnitude(primaryOrb)).toBeLessThan(1.2);
      expect(getPointerPosition(primaryOrb)).toEqual(landedPosition);
    } finally {
      globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
    }
  });

  it("does not render any fusion bridge chrome for populated home", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: () => undefined,
      onSearchSubmit() {}
    });

    expect(container.querySelector(".glitter-home-stage__fusion-filter-defs")).toBeNull();
    expect(container.querySelector(".glitter-home-stage__fusion-bridge")).toBeNull();
    expect(container.querySelectorAll(".glitter-home-stage__fusion-blob")).toHaveLength(0);
  });

  it("keeps dragged supporting orbs separated from neighbors without fusion overlap", () => {
    const container = createContainer();

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: () => undefined,
      onSearchSubmit() {}
    });

    const supportingOrbs = Array.from(container.querySelectorAll(".glitter-home-stage__supporting-orb")) as Array<
      HTMLElement & {
        className: string;
        style: FakeStyle;
        pointerdown: (options?: { pointerId?: number; clientX?: number; clientY?: number }) => void;
        querySelector: (selector: string) => HTMLElement | null;
      }
    >;
    const draggedOrb = [...supportingOrbs].sort((left, right) => getOrbRadius(left) - getOrbRadius(right))[0];
    expect(draggedOrb).toBeDefined();

    const initialGeometry = collectOrbGeometry(container);
    const draggedGeometry = initialGeometry.find((orb) => orb.element === draggedOrb);
    expect(draggedGeometry).toBeDefined();
    const neighborGeometry = initialGeometry
      .filter((orb) => orb.element !== draggedOrb && orb.radius >= draggedGeometry!.radius)
      .sort(
        (left, right) =>
          Math.hypot(left.centerX - draggedGeometry!.centerX, left.centerY - draggedGeometry!.centerY) -
          Math.hypot(right.centerX - draggedGeometry!.centerX, right.centerY - draggedGeometry!.centerY)
      )[0];
    expect(neighborGeometry).toBeDefined();

    const fromNeighborX = draggedGeometry!.centerX - neighborGeometry!.centerX;
    const fromNeighborY = draggedGeometry!.centerY - neighborGeometry!.centerY;
    const originDistance = Math.hypot(fromNeighborX, fromNeighborY);
    const unitX = originDistance > 0 ? fromNeighborX / originDistance : 1;
    const unitY = originDistance > 0 ? fromNeighborY / originDistance : 0;
    const targetCenterX = neighborGeometry!.centerX + unitX * Math.max(6, draggedGeometry!.radius * 0.2);
    const targetCenterY = neighborGeometry!.centerY + unitY * Math.max(6, draggedGeometry!.radius * 0.2);
    const origin = getPointerPosition(draggedOrb!);

    draggedOrb!.pointerdown(origin);
    dispatchPointerMove(container, {
      clientX: targetCenterX,
      clientY: targetCenterY
    });

    const dragDisplayedPosition = getDisplayedPointerPosition(draggedOrb!);
    const neighborDisplayedPosition = getDisplayedPointerPosition(neighborGeometry!.element);
    const dragOverlapRatio = getCircleOverlapAreaRatio(
      getOrbRadius(draggedOrb!),
      getOrbRadius(neighborGeometry!.element),
      Math.hypot(
        dragDisplayedPosition.clientX - neighborDisplayedPosition.clientX,
        dragDisplayedPosition.clientY - neighborDisplayedPosition.clientY
      )
    );
    const draggedShell = draggedOrb!.querySelector(".glitter-home-stage__pool-orb-shell") as
      | (HTMLElement & { dataset: Record<string, string> })
      | null;
    const neighborShell = neighborGeometry!.element.querySelector(".glitter-home-stage__pool-orb-shell") as
      | (HTMLElement & { dataset: Record<string, string> })
      | null;

    expect(container.querySelector(".glitter-home-stage__fusion-bridge")).toBeNull();
    expect(draggedShell?.dataset.fusionSoftened).not.toBe("true");
    expect(neighborShell?.dataset.fusionSoftened).not.toBe("true");
    expect(dragOverlapRatio).toBeLessThanOrEqual(0.001);
  });

  it("suppresses pool selection after a completed stir-drag gesture", () => {
    const container = createContainer();
    const selectedPoolIds: string[] = [];

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: (poolId) => {
        selectedPoolIds.push(poolId);
      },
      onSearchSubmit() {}
    });

    const primaryOrb = getPrimaryOrbElement(container);
    const origin = getPointerPosition(primaryOrb);

    primaryOrb.pointerdown(origin);
    dispatchPointerMove(container, {
      clientX: origin.clientX + 32,
      clientY: origin.clientY + 14
    });
    dispatchPointerUp(container, {
      clientX: origin.clientX + 32,
      clientY: origin.clientY + 14
    });
    primaryOrb.click();

    expect(selectedPoolIds).toEqual([]);
  });

  it("suppresses supporting-orb selection after its own stir-drag gesture", () => {
    const container = createContainer();
    const selectedPoolIds: string[] = [];

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: (poolId) => {
        selectedPoolIds.push(poolId);
      },
      onSearchSubmit() {}
    });

    const supportingOrb = getNearestSupportingOrbElement(container) as unknown as HTMLElement & {
      pointerdown: (options?: { pointerId?: number; clientX?: number; clientY?: number }) => void;
      click: () => void;
    };
    const origin = getPointerPosition(supportingOrb);

    supportingOrb.pointerdown(origin);
    dispatchPointerMove(container, {
      clientX: origin.clientX - 30,
      clientY: origin.clientY + 12
    });
    dispatchPointerUp(container, {
      clientX: origin.clientX - 30,
      clientY: origin.clientY + 12
    });
    supportingOrb.click();

    expect(selectedPoolIds).toEqual([]);
  });

  it("settles stirred orbs after pointer cancellation", () => {
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const frameQueue: Array<FrameRequestCallback> = [];
    let now = 0;

    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frameQueue.push(callback);
      return frameQueue.length;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => 0) as typeof globalThis.cancelAnimationFrame;

    try {
      const container = createContainer();

      renderHomeView(container, buildHomeViewState("settings-conflict"), {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: () => undefined,
        onSearchSubmit() {}
      });

      const primaryOrb = getPrimaryOrbElement(container);
      const nearbySupportingOrb = getNearestSupportingOrbElement(container);
      const origin = getPointerPosition(primaryOrb);

      primaryOrb.pointerdown(origin);
      dispatchPointerMove(container, {
        clientX: origin.clientX + 42,
        clientY: origin.clientY + 16
      });
      dispatchPointerCancel(container, {
        clientX: origin.clientX + 42,
        clientY: origin.clientY + 16
      });

      expect(getOrbShiftMagnitude(primaryOrb)).toBeGreaterThan(0);
      expect(getOrbShiftMagnitude(nearbySupportingOrb)).toBeGreaterThan(0);

      for (let index = 0; index < 18; index += 1) {
        const callback = frameQueue.shift();
        if (!callback) {
          break;
        }
        now += 16;
        callback(now);
      }

      expect(getOrbShiftMagnitude(primaryOrb)).toBeLessThan(1.2);
      expect(getOrbShiftMagnitude(nearbySupportingOrb)).toBeLessThan(1.2);
    } finally {
      globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
    }
  });

  it("activates isolated orb hover state only after a 3 second dwell and shows iconized side actions", () => {
    vi.useFakeTimers();

    try {
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-default", name: "默认池", ideaCount: 8, isDefault: true, color: "#6AB5FF" },
            { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false, color: "#74CCBA" }
          ]
        },
        {
          poolColors: {
            unsorted: "#6AB5FF",
            product: "#74CCBA",
            research: "#FFA980",
            writing: "#FFD468",
            unnamed: "#B794FF"
          }
        }
      );
      const container = createContainer();
      const selectedPoolIds: string[] = [];
      const deletedPoolIds: string[] = [];

      renderHomeView(container, state, {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: (poolId) => {
          selectedPoolIds.push(poolId);
        },
        onPoolDelete: (poolId) => {
          deletedPoolIds.push(poolId);
        },
        onSearchSubmit() {}
      });

      const primaryOrb = container.querySelector(".glitter-home-stage__primary-orb") as
        | (HTMLElement & { className: string; dataset: Record<string, string>; dispatch: (type: string) => void })
        | null;
      const supportingOrb = container.querySelector(".glitter-home-stage__supporting-orb") as
        | (HTMLElement & { className: string; dataset: Record<string, string>; dispatch: (type: string) => void })
        | null;

      expect(primaryOrb).not.toBeNull();
      expect(supportingOrb).not.toBeNull();
      expect(container.querySelector(".glitter-home-stage__pool-orb-actions")).toBeNull();

      supportingOrb?.dispatch("pointerenter");
      vi.advanceTimersByTime(2999);

      expect(supportingOrb?.className).not.toContain("glitter-home-stage__pool-orb--isolated");
      expect(container.querySelector(".glitter-home-stage__pool-orb-actions")).toBeNull();

      vi.advanceTimersByTime(1);

      expect(supportingOrb?.className).toContain("glitter-home-stage__pool-orb--isolated");
      expect(primaryOrb?.className).toContain("glitter-home-stage__pool-orb--background-muted");

      const actionRail = container.querySelector(".glitter-home-stage__pool-orb-actions") as
        | (HTMLElement & { children: Array<{ textContent: string; className: string; children: Array<{ className: string; textContent: string }> }> })
        | null;
      expect(actionRail).not.toBeNull();
      expect(actionRail?.children).toHaveLength(3);
      expect(actionRail?.children.map((child) => child.textContent)).toEqual(["编辑池", "删除池", "进入池"]);

      const editIcon = actionRail?.children[0]?.querySelector(".glitter-home-stage__pool-orb-action-icon") as
        | ({ className: string })
        | null;
      const deleteIcon = actionRail?.children[1]?.querySelector(".glitter-home-stage__pool-orb-action-icon") as
        | ({ className: string })
        | null;
      const enterIcon = actionRail?.children[2]?.querySelector(".glitter-home-stage__pool-orb-action-icon") as
        | ({ className: string })
        | null;
      expect(editIcon).not.toBeNull();
      expect(deleteIcon).not.toBeNull();
      expect(enterIcon).not.toBeNull();
      expect(editIcon?.className).toContain("glitter-home-stage__pool-orb-action-icon--edit");
      expect(deleteIcon?.className).toContain("glitter-home-stage__pool-orb-action-icon--delete");
      expect(enterIcon?.className).toContain("glitter-home-stage__pool-orb-action-icon--enter");

      expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__pool-orb-action", [
        "width: 36px;",
        "min-width: 36px;",
        "padding: 0;",
        "overflow: hidden;",
        "appearance: none !important;",
        "-webkit-appearance: none !important;",
        "background-image: none !important;",
        "font-family: inherit;"
      ]);
      expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__pool-orb-action-label", [
        "max-width: 0;",
        "opacity: 0;"
      ]);
      expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__pool-orb-action:hover", [
        "width: 94px;",
        "justify-content: flex-start;"
      ]);
      expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__pool-orb-action:hover .glitter-home-stage__pool-orb-action-label", [
        "max-width: 44px;",
        "opacity: 1;"
      ]);
      expectRuleHasDeclarations(".glitter-home-stage .glitter-home-stage__pool-orb-action--delete:hover", [
        "color: var(--text-error, #ff6b6b);"
      ]);
      expect(getRuleBlocks(stylesCss, ".glitter-home-stage .glitter-home-stage__pool-orb-action:focus-visible .glitter-home-stage__pool-orb-action-label")).toHaveLength(0);

      const orbActionFocusBlocks = getRuleBlocks(stylesCss, ".glitter-home-stage .glitter-home-stage__pool-orb-action:focus-visible");
      expect(orbActionFocusBlocks.length).toBeGreaterThan(0);
      expect(orbActionFocusBlocks.every((block) => !block.includes("width: 94px;"))).toBe(true);

      const deleteButton = actionRail?.querySelector(".glitter-home-stage__pool-orb-action--delete") as
        | ({ click: () => void; disabled: boolean })
        | null;
      const enterButton = actionRail?.querySelector(".glitter-home-stage__pool-orb-action--enter") as
        | ({ click: () => void })
        | null;
      expect(deleteButton).not.toBeNull();
      expect(deleteButton?.disabled).toBe(false);
      deleteButton?.click();
      enterButton?.click();

      expect(deletedPoolIds).toEqual([supportingOrb?.dataset.poolId]);
      expect(selectedPoolIds).toEqual([supportingOrb?.dataset.poolId]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts inline orb-name editing from the edit action without entering the pool", () => {
    vi.useFakeTimers();

    try {
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-default", name: "默认池", ideaCount: 8, isDefault: true, color: "#6AB5FF" },
            { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false, color: "#74CCBA" }
          ]
        },
        {
          poolColors: {
            unsorted: "#6AB5FF",
            product: "#74CCBA",
            research: "#FFA980",
            writing: "#FFD468",
            unnamed: "#B794FF"
          }
        }
      );
      const container = createContainer();
      const selectedPoolIds: string[] = [];

      renderHomeView(container, state, {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: (poolId) => {
          selectedPoolIds.push(poolId);
        },
        onSearchSubmit() {}
      });

      const supportingOrb = container.querySelector(".glitter-home-stage__supporting-orb") as
        | (HTMLElement & { dataset: Record<string, string>; dispatch: (type: string) => void })
        | null;

      expect(supportingOrb).not.toBeNull();

      supportingOrb?.dispatch("pointerenter");
      vi.advanceTimersByTime(3000);

      const actionRail = container.querySelector(".glitter-home-stage__pool-orb-actions") as
        | (HTMLElement & { querySelector: (selector: string) => FakeElement | null })
        | null;
      const editButton = actionRail?.querySelector(".glitter-home-stage__pool-orb-action--edit") as
        | ({ click: () => void })
        | null;
      const textLayer = supportingOrb?.querySelector(".glitter-home-stage__pool-orb-text") as
        | (HTMLElement & { className: string })
        | null;
      const title = supportingOrb?.querySelector(".glitter-home-stage__pool-orb-name") as
        | (HTMLElement & {
            focused: boolean;
            getAttribute: (name: string) => string | null;
          })
        | null;

      expect(actionRail).not.toBeNull();
      expect(editButton).not.toBeNull();
      expect(textLayer).not.toBeNull();
      expect(title).not.toBeNull();
      expect(title?.getAttribute("contenteditable")).not.toBe("true");

      editButton?.click();

      const selection = getDocumentSelection(container);
      expect(selectedPoolIds).toEqual([]);
      expect(container.querySelector(".glitter-home-stage__pool-orb-name-inline-input")).toBeNull();
      expect(textLayer?.className).toContain("glitter-home-stage__pool-orb-text--editing");
      expect(title?.getAttribute("contenteditable")).toBe("true");
      expect(title?.focused).toBe(true);
      expect(selection.selectedText).toBe("写作池");
      expect(selection.anchorOffset).toBe(0);
      expect(selection.focusOffset).toBe("写作池".length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps orb isolation active while inline rename is in progress", () => {
    vi.useFakeTimers();

    try {
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-default", name: "默认池", ideaCount: 8, isDefault: true, color: "#6AB5FF" },
            { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false, color: "#74CCBA" }
          ]
        },
        {
          poolColors: {
            unsorted: "#6AB5FF",
            product: "#74CCBA",
            research: "#FFA980",
            writing: "#FFD468",
            unnamed: "#B794FF"
          }
        }
      );
      const container = createContainer();

      renderHomeView(container, state, {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: () => undefined,
        onSearchSubmit() {}
      });

      const supportingOrb = container.querySelector(".glitter-home-stage__supporting-orb") as
        | (HTMLElement & { className: string; dispatch: (type: string) => void })
        | null;

      expect(supportingOrb).not.toBeNull();

      supportingOrb?.dispatch("pointerenter");
      vi.advanceTimersByTime(3000);

      const actionRail = container.querySelector(".glitter-home-stage__pool-orb-actions") as
        | (HTMLElement & { dispatch: (type: string) => void; querySelector: (selector: string) => FakeElement | null })
        | null;
      const editButton = actionRail?.querySelector(".glitter-home-stage__pool-orb-action--edit") as
        | ({ click: () => void })
        | null;
      const title = supportingOrb?.querySelector(".glitter-home-stage__pool-orb-name") as
        | (HTMLElement & { getAttribute: (name: string) => string | null })
        | null;

      expect(actionRail).not.toBeNull();
      expect(editButton).not.toBeNull();
      expect(title).not.toBeNull();

      editButton?.click();
      supportingOrb?.dispatch("pointerleave");
      actionRail?.dispatch("pointerleave");
      vi.advanceTimersByTime(200);

      expect(title?.getAttribute("contenteditable")).toBe("true");
      expect(supportingOrb?.className).toContain("glitter-home-stage__pool-orb--isolated");
      expect(container.querySelector(".glitter-home-stage__pool-orb-actions")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps title clicks inside the editable orb name from reopening the pool", () => {
    vi.useFakeTimers();

    try {
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-default", name: "默认池", ideaCount: 8, isDefault: true, color: "#6AB5FF" },
            { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false, color: "#74CCBA" }
          ]
        },
        {
          poolColors: {
            unsorted: "#6AB5FF",
            product: "#74CCBA",
            research: "#FFA980",
            writing: "#FFD468",
            unnamed: "#B794FF"
          }
        }
      );
      const container = createContainer();
      const selectedPoolIds: string[] = [];

      renderHomeView(container, state, {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: (poolId) => {
          selectedPoolIds.push(poolId);
        },
        onSearchSubmit() {}
      });

      const supportingOrb = container.querySelector(".glitter-home-stage__supporting-orb") as
        | (HTMLElement & { dispatch: (type: string) => void })
        | null;
      const editButton = () =>
        container.querySelector(".glitter-home-stage__pool-orb-action--edit") as ({ click: () => void }) | null;
      const title = () =>
        supportingOrb?.querySelector(".glitter-home-stage__pool-orb-name") as ({ click: () => void }) | null;

      expect(supportingOrb).not.toBeNull();

      supportingOrb?.dispatch("pointerenter");
      vi.advanceTimersByTime(3000);
      editButton()?.click();
      title()?.click();

      expect(selectedPoolIds).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not enter the pool if the orb receives a click while inline rename is active", () => {
    vi.useFakeTimers();

    try {
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-default", name: "默认池", ideaCount: 8, isDefault: true, color: "#6AB5FF" },
            { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false, color: "#74CCBA" }
          ]
        },
        {
          poolColors: {
            unsorted: "#6AB5FF",
            product: "#74CCBA",
            research: "#FFA980",
            writing: "#FFD468",
            unnamed: "#B794FF"
          }
        }
      );
      const container = createContainer();
      const selectedPoolIds: string[] = [];

      renderHomeView(container, state, {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: (poolId) => {
          selectedPoolIds.push(poolId);
        },
        onSearchSubmit() {}
      });

      const supportingOrb = container.querySelector(".glitter-home-stage__supporting-orb") as
        | (HTMLElement & { click: () => void; dispatch: (type: string) => void })
        | null;
      const editButton = () =>
        container.querySelector(".glitter-home-stage__pool-orb-action--edit") as ({ click: () => void }) | null;
      const title = () =>
        supportingOrb?.querySelector(".glitter-home-stage__pool-orb-name") as
          | ({ textContent: string; keydown: (key: string) => void; getAttribute: (name: string) => string | null })
          | null;

      expect(supportingOrb).not.toBeNull();

      supportingOrb?.dispatch("pointerenter");
      vi.advanceTimersByTime(3000);
      editButton()?.click();
      title()!.textContent = "写 作池";
      supportingOrb?.click();

      expect(title()?.getAttribute("contenteditable")).toBe("true");
      expect(selectedPoolIds).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not commit inline orb rename while IME composition is active", () => {
    vi.useFakeTimers();

    try {
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-default", name: "默认池", ideaCount: 8, isDefault: true, color: "#6AB5FF" },
            { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false, color: "#74CCBA" }
          ]
        },
        {
          poolColors: {
            unsorted: "#6AB5FF",
            product: "#74CCBA",
            research: "#FFA980",
            writing: "#FFD468",
            unnamed: "#B794FF"
          }
        }
      );
      const container = createContainer();
      const renamedPools: Array<{ poolId: string; name: string }> = [];

      const actions = {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: () => undefined,
        onPoolRename: (poolId: string, name: string) => {
          renamedPools.push({ poolId, name });
        },
        onSearchSubmit() {}
      } as unknown as Parameters<typeof renderHomeView>[2];

      renderHomeView(container, state, actions);

      const supportingOrb = container.querySelector(".glitter-home-stage__supporting-orb") as
        | (HTMLElement & { dataset: Record<string, string>; dispatch: (type: string) => void })
        | null;
      const editButton = () =>
        container.querySelector(".glitter-home-stage__pool-orb-action--edit") as ({ click: () => void }) | null;
      const title = () =>
        supportingOrb?.querySelector(".glitter-home-stage__pool-orb-name") as
          | ({
              textContent: string;
              keydown: (key: string, options?: { isComposing?: boolean; keyCode?: number }) => void;
              getAttribute: (name: string) => string | null;
            })
          | null;

      expect(supportingOrb).not.toBeNull();

      supportingOrb?.dispatch("pointerenter");
      vi.advanceTimersByTime(3000);
      editButton()?.click();

      title()!.textContent = "输入法候选";
      title()!.keydown("Enter", { isComposing: true });
      title()!.keydown("Enter", { keyCode: 229 });

      expect(title()?.getAttribute("contenteditable")).toBe("true");
      expect(renamedPools).toEqual([]);

      title()!.keydown("Enter");

      expect(title()?.getAttribute("contenteditable")).toBe("false");
      expect(renamedPools).toEqual([{ poolId: supportingOrb?.dataset.poolId ?? "", name: "输入法候选" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("commits the trimmed inline orb name on Enter through the home rename action", () => {
    vi.useFakeTimers();

    try {
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-default", name: "默认池", ideaCount: 8, isDefault: true, color: "#6AB5FF" },
            { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false, color: "#74CCBA" }
          ]
        },
        {
          poolColors: {
            unsorted: "#6AB5FF",
            product: "#74CCBA",
            research: "#FFA980",
            writing: "#FFD468",
            unnamed: "#B794FF"
          }
        }
      );
      const container = createContainer();
      const renamedPools: Array<{ poolId: string; name: string }> = [];

      const actions = {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: () => undefined,
        onPoolRename: (poolId: string, name: string) => {
          renamedPools.push({ poolId, name });
        },
        onSearchSubmit() {}
      } as unknown as Parameters<typeof renderHomeView>[2];

      renderHomeView(container, state, actions);

      const supportingOrb = container.querySelector(".glitter-home-stage__supporting-orb") as
        | (HTMLElement & { dataset: Record<string, string>; dispatch: (type: string) => void })
        | null;

      expect(supportingOrb).not.toBeNull();

      supportingOrb?.dispatch("pointerenter");
      vi.advanceTimersByTime(3000);

      const editButton = container.querySelector(".glitter-home-stage__pool-orb-action--edit") as
        | ({ click: () => void })
        | null;
      const title = supportingOrb?.querySelector(".glitter-home-stage__pool-orb-name") as
        | (HTMLElement & {
            textContent: string;
            keydown: (key: string, options?: { isComposing?: boolean; keyCode?: number }) => void;
            getAttribute: (name: string) => string | null;
          })
        | null;

      expect(editButton).not.toBeNull();
      expect(title).not.toBeNull();

      editButton?.click();
      title!.textContent = "  已编辑写作池  ";
      title!.keydown("Enter");

      expect(title?.textContent).toBe("已编辑写作池");
      expect(title?.getAttribute("contenteditable")).toBe("false");
      expect(renamedPools).toEqual([{ poolId: supportingOrb?.dataset.poolId ?? "", name: "已编辑写作池" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables inline rename from the edit action for the default pool", () => {
    vi.useFakeTimers();

    try {
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-default", name: "默认池", ideaCount: 8, isDefault: true, color: "#6AB5FF" },
            { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false, color: "#74CCBA" }
          ]
        },
        {
          poolColors: {
            unsorted: "#6AB5FF",
            product: "#74CCBA",
            research: "#FFA980",
            writing: "#FFD468",
            unnamed: "#B794FF"
          }
        }
      );
      const container = createContainer();

      renderHomeView(container, state, {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: () => undefined,
        onSearchSubmit() {}
      });

      const primaryOrb = container.querySelector(".glitter-home-stage__primary-orb") as
        | (HTMLElement & { dispatch: (type: string) => void })
        | null;

      expect(primaryOrb).not.toBeNull();

      primaryOrb?.dispatch("pointerenter");
      vi.advanceTimersByTime(3000);

      const editButton = container.querySelector(".glitter-home-stage__pool-orb-action--edit") as
        | ({ disabled: boolean })
        | null;

      expect(editButton).not.toBeNull();
      expect(editButton?.disabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps orb isolation active while the pointer moves through the corridor toward the action rail", () => {
    vi.useFakeTimers();

    try {
      const state = buildHomeViewStateFromRuntime(
        {
          mode: "populated",
          pools: [
            { id: "pool-default", name: "默认池", ideaCount: 8, isDefault: true, color: "#6AB5FF" },
            { id: "pool-writing", name: "写作池", ideaCount: 3, isDefault: false, color: "#74CCBA" }
          ]
        },
        {
          poolColors: {
            unsorted: "#6AB5FF",
            product: "#74CCBA",
            research: "#FFA980",
            writing: "#FFD468",
            unnamed: "#B794FF"
          }
        }
      );
      const container = createContainer();

      renderHomeView(container, state, {
        onPrimaryAction: () => undefined,
        onSecondaryAction: () => undefined,
        onPoolSelect: () => undefined,
        onSearchSubmit() {}
      });

      const supportingOrb = container.querySelector(".glitter-home-stage__supporting-orb") as
        | (HTMLElement & { className: string; dispatch: (type: string) => void })
        | null;

      expect(supportingOrb).not.toBeNull();

      supportingOrb?.dispatch("pointerenter");
      vi.advanceTimersByTime(3000);

      const actionRail = container.querySelector(".glitter-home-stage__pool-orb-actions") as
        | (HTMLElement & { dispatch: (type: string) => void })
        | null;
      const hoverCorridor = container.querySelector(".glitter-home-stage__pool-orb-action-corridor") as
        | (HTMLElement & { dispatch: (type: string) => void })
        | null;

      expect(actionRail).not.toBeNull();
      expect(hoverCorridor).not.toBeNull();

      supportingOrb?.dispatch("pointerleave");
      hoverCorridor?.dispatch("pointerenter");
      vi.advanceTimersByTime(200);

      expect(supportingOrb?.className).toContain("glitter-home-stage__pool-orb--isolated");
      expect(container.querySelector(".glitter-home-stage__pool-orb-actions")).not.toBeNull();

      hoverCorridor?.dispatch("pointerleave");
      vi.advanceTimersByTime(120);

      expect(supportingOrb?.className).not.toContain("glitter-home-stage__pool-orb--isolated");
      expect(container.querySelector(".glitter-home-stage__pool-orb-actions")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls onPoolSelect with the clicked pool id", () => {
    const container = createContainer();
    const selectedPoolIds: string[] = [];

    renderHomeView(container, buildHomeViewState("settings-conflict"), {
      onPrimaryAction: () => undefined,
      onSecondaryAction: () => undefined,
      onPoolSelect: (poolId) => {
        selectedPoolIds.push(poolId);
      },
      onSearchSubmit() {}
    });

    const poolOrb = container.querySelector(".glitter-home-stage__primary-orb") as HTMLElement | null;

    expect(poolOrb).not.toBeNull();
    poolOrb?.click();

    expect(selectedPoolIds).toHaveLength(1);
    expect(selectedPoolIds[0]).toBe(poolOrb?.dataset.poolId);
  });
});
