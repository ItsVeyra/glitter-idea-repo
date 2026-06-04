/**
 * 首页灵感场渲染器。
 * 负责首页舞台的 DOM 结构、球体布局解算、动效交互以及首页动作绑定。
 */

import type { HomeViewActions } from "./home-actions";
import type { HomeStageOrb } from "./home-demo-data";
import { HOME_FIELD_VIEW_LABELS, HOME_FIELD_VIEW_OPTIONS, type HomeViewState } from "./home-state";
import { resolveHomeOrbRgb, resolveHomeOrbRingRgb } from "./home-orb-tone";
import { renderHomeSpringRainStage } from "./home-spring-rain-stage";

// 基础 DOM、类名与内联编辑工具。
function clearContainer(containerEl: HTMLElement): void {
  disconnectPopulatedOrbLayoutObservers(containerEl);

  const withEmpty = containerEl as HTMLElement & { empty?: () => void };
  if (typeof withEmpty.empty === "function") {
    withEmpty.empty();
    return;
  }

  containerEl.innerHTML = "";
}

function createNode(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
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

function addClassName(element: { className: string }, className: string): void {
  if (hasClassName(element, className)) {
    return;
  }

  element.className = `${element.className} ${className}`.trim();
}

function removeClassName(element: { className: string }, className: string): void {
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

function startOrbTitleInlineEdit(orbButton: HTMLButtonElement): void {
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

// 首页球体的尺寸、布局与动效参数。
const ORB_PIXEL_SIZE_BY_SIZE: Readonly<Record<HomeStageOrb["size"], number>> = Object.freeze({
  xs: 88,
  sm: 106,
  md: 124,
  lg: 144,
  xl: 166,
  xxl: 190,
  xxxl: 216
});

const HOME_ORB_MIN_READABLE_DIAMETER = 60;
const HOME_ORB_LAYOUT_EXPANDED_STAGE_MIN_EXTRA_HEIGHT = 120;
const HOME_ORB_LAYOUT_EXPANDED_STAGE_GROWTH_FACTOR = 1.25;
const HOME_ORB_LAYOUT_DEFAULT_STAGE = Object.freeze({ width: 660, height: 420 });
const HOME_ORB_LAYOUT_SAFE_EDGE_GAP = 18;
const HOME_ORB_LAYOUT_INTER_ORB_GAP = 20;
const HOME_ORB_LAYOUT_SUPPORT_MAX_DISTANCE_RATIO = 0.66;
const HOME_ORB_LAYOUT_PRIMARY_X_RATIO = 0.5;
const HOME_ORB_LAYOUT_PRIMARY_Y_RATIO = 0.5;
const HOME_ORB_RESIZE_OBSERVER_KEY = "__glitterHomeOrbResizeObserver";
const HOME_ORB_INTERACTION_CONTROLLER_KEY = "__glitterHomeOrbInteractionController";
const HOME_ORB_STIR_DRAG_THRESHOLD = 8;
const HOME_ORB_STIR_SUPPORT_FLOW_SCALE = 0.18;
const HOME_ORB_STIR_SUPPORT_RADIAL_SCALE = 0.06;
const HOME_ORB_STIR_INFLUENCE_RADIUS_MULTIPLIER = 3.8;
const HOME_ORB_STIR_SETTLE_DECAY = 0.76;
const HOME_ORB_STIR_SETTLE_VELOCITY_DECAY = 0.52;
const HOME_ORB_STIR_PRIMARY_RELEASE_VELOCITY_SCALE = 0.18;
const HOME_ORB_STIR_SUPPORT_RELEASE_VELOCITY_SCALE = 0.08;
const HOME_ORB_STIR_COMMIT_RIPPLE_VELOCITY_SCALE = 0.08;
const HOME_ORB_STIR_STOP_SHIFT_EPSILON = 0.35;
const HOME_ORB_STIR_STOP_VELOCITY_EPSILON = 0.05;
const HOME_ORB_HOVER_ISOLATION_DELAY_MS = 3000;
const HOME_ORB_HOVER_ISOLATION_EXIT_DELAY_MS = 120;
const HOME_ORB_HOVER_ACTION_OFFSET_X = 22;
const HOME_ORB_HOVER_ACTION_BUTTON_COUNT = 3;
const HOME_ORB_HOVER_ACTION_BUTTON_SIZE = 36;
const HOME_ORB_HOVER_ACTION_GAP = 8;
const HOME_ORB_HOVER_ACTION_CORRIDOR_X_PADDING = 12;
const HOME_ORB_HOVER_ACTION_CORRIDOR_Y_PADDING = 18;
const HOME_ORB_HOVER_ACTION_RAIL_ESTIMATED_HEIGHT =
  HOME_ORB_HOVER_ACTION_BUTTON_COUNT * HOME_ORB_HOVER_ACTION_BUTTON_SIZE +
  HOME_ORB_HOVER_ACTION_GAP * (HOME_ORB_HOVER_ACTION_BUTTON_COUNT - 1);

type OrbPlacement = { x: number; y: number; radius: number };
type ResolvedOrbLayout = {
  scale: number;
  stageHeight: number;
  placements: Map<HTMLButtonElement, OrbPlacement>;
};
type OrbTextMetrics = {
  shellInset: number;
  textPadding: number;
  textGap: number;
  nameFontSize: number;
  nameLineHeight: number;
  countFontSize: number;
  countLineHeight: number;
};

type OrbTextStrength = {
  tier: string;
};

// 文本强弱档位用于在不同球体数量下保持名称和计数的视觉层次。
const ORB_TEXT_TIERS = Object.freeze(["1", "2", "3", "4", "5", "6", "7"] as const);

type OrbInteractionRecord = {
  button: HTMLButtonElement;
  baseX: number;
  baseY: number;
  layoutX: number;
  layoutY: number;
  committedOffsetX: number;
  committedOffsetY: number;
  hasResolvedLayout: boolean;
  radius: number;
  isPrimary: boolean;
  shiftX: number;
  shiftY: number;
  velocityX: number;
  velocityY: number;
};

function getOrbInteractionInfluenceRadius(sourceRadius: number, targetRadius: number): number {
  return Math.max(sourceRadius, targetRadius) * HOME_ORB_STIR_INFLUENCE_RADIUS_MULTIPLIER;
}

function clampOrbCenterToStage(
  centerX: number,
  centerY: number,
  radius: number,
  stageWidth: number,
  stageHeight: number
): { x: number; y: number } {
  return {
    x: clamp(centerX, radius, Math.max(radius, stageWidth - radius)),
    y: clamp(centerY, radius, Math.max(radius, stageHeight - radius))
  };
}

type HomeOrbInteractionController = {
  applyLayout: (layout: ResolvedOrbLayout) => void;
  destroy: () => void;
};

const HOME_ORB_LAYOUT_SUPPORTING_SLOT_OFFSETS: ReadonlyArray<{ x: number; y: number }> = Object.freeze([
  { x: -0.18, y: -0.06 },
  { x: 0.32, y: -0.08 },
  { x: 0.28, y: 0.22 },
  { x: -0.28, y: 0.23 },
  { x: 0.02, y: -0.32 },
  { x: 0.04, y: 0.31 },
  { x: -0.42, y: 0.08 },
  { x: 0.42, y: 0.08 }
]);

const HOME_ORB_LAYOUT_FALLBACK_OFFSETS: ReadonlyArray<{ x: number; y: number }> = Object.freeze([
  { x: 0, y: 0 },
  { x: 22, y: 0 },
  { x: -22, y: 0 },
  { x: 0, y: 22 },
  { x: 0, y: -22 },
  { x: 16, y: 16 },
  { x: -16, y: 16 },
  { x: 16, y: -16 },
  { x: -16, y: -16 }
]);

// 球体波纹与描边节奏预设：让首页在静态基调下仍保留轻微水面生命感。
type OrbMotionPreset = {
  readonly rippleDurationSeconds: number;
  readonly rippleDelaySeconds: number;
  readonly breatheDurationSeconds: number;
  readonly breatheDelaySeconds: number;
  readonly rippleScaleRise: number;
  readonly rippleScaleMid: number;
  readonly rippleScaleEnd: number;
  readonly rippleOpacityPeak: number;
  readonly rippleOpacityTrail: number;
};

const PRIMARY_ORB_MOTION = Object.freeze({
  rippleDurationMultiplier: 1.08,
  breatheDurationMultiplier: 1.16,
  rippleScaleRiseMultiplier: 1.1,
  rippleScaleMidMultiplier: 1.12,
  rippleScaleEndMultiplier: 1.06,
  rippleOpacityPeakScale: 0.94,
  rippleOpacityTrailScale: 0.9
});

const ORB_MOTION_PRESETS: readonly OrbMotionPreset[] = Object.freeze([
  {
    rippleDurationSeconds: 20.8,
    rippleDelaySeconds: 0.3,
    breatheDurationSeconds: 20.8,
    breatheDelaySeconds: 0.3,
    rippleScaleRise: 1.34,
    rippleScaleMid: 1.88,
    rippleScaleEnd: 2.56,
    rippleOpacityPeak: 0.18,
    rippleOpacityTrail: 0.08
  },
  {
    rippleDurationSeconds: 21.6,
    rippleDelaySeconds: 1,
    breatheDurationSeconds: 21.6,
    breatheDelaySeconds: 1,
    rippleScaleRise: 1.36,
    rippleScaleMid: 1.92,
    rippleScaleEnd: 2.61,
    rippleOpacityPeak: 0.17,
    rippleOpacityTrail: 0.07
  },
  {
    rippleDurationSeconds: 22.4,
    rippleDelaySeconds: 1.5,
    breatheDurationSeconds: 22.4,
    breatheDelaySeconds: 1.5,
    rippleScaleRise: 1.35,
    rippleScaleMid: 1.95,
    rippleScaleEnd: 2.65,
    rippleOpacityPeak: 0.18,
    rippleOpacityTrail: 0.06
  },
  {
    rippleDurationSeconds: 21.2,
    rippleDelaySeconds: 0.7,
    breatheDurationSeconds: 21.2,
    breatheDelaySeconds: 0.7,
    rippleScaleRise: 1.38,
    rippleScaleMid: 1.98,
    rippleScaleEnd: 2.59,
    rippleOpacityPeak: 0.16,
    rippleOpacityTrail: 0.06
  },
  {
    rippleDurationSeconds: 22,
    rippleDelaySeconds: 1.2,
    breatheDurationSeconds: 22,
    breatheDelaySeconds: 1.2,
    rippleScaleRise: 1.32,
    rippleScaleMid: 1.84,
    rippleScaleEnd: 2.53,
    rippleOpacityPeak: 0.19,
    rippleOpacityTrail: 0.09
  },
  {
    rippleDurationSeconds: 20.5,
    rippleDelaySeconds: 0.1,
    breatheDurationSeconds: 20.5,
    breatheDelaySeconds: 0.1,
    rippleScaleRise: 1.37,
    rippleScaleMid: 1.9,
    rippleScaleEnd: 2.49,
    rippleOpacityPeak: 0.2,
    rippleOpacityTrail: 0.07
  }
]);

const ORB_MOTION_CYCLE_OFFSETS = Object.freeze({
  durationSeconds: [0, 0.2, -0.16, 0.32, -0.28],
  delaySeconds: [0, 0.15, 0.28, 0.45, 0.58],
  scaleRise: [0, 0.005, -0.003, 0.008, -0.006],
  scaleMid: [0, 0.006, -0.004, 0.01, -0.008],
  scaleEnd: [0, 0.008, -0.006, 0.012, -0.01],
  opacityPeak: [0, 0.008, -0.006, 0.01, -0.008],
  opacityTrail: [0, 0.006, -0.004, 0.008, -0.006]
} as const);
const HOME_DASHED_CORE_RING_STROKE_WIDTH = 2;
const HOME_DASHED_CORE_RING_DASH_LENGTH = 1;
const HOME_DASHED_CORE_RING_GAP_LENGTH = 7;

// 动效格式化与舞台尺寸测量工具。
function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(3).replace(/\.?(?:0+)$/, "")}s`;
}

function formatNumber(value: number): string {
  return value.toFixed(3).replace(/\.?(?:0+)$/, "");
}

function encodeSvgDataUrl(svg: string): string {
  return svg
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDashedCoreRingMaskImage(shellDiameter: number): string {
  const normalizedDiameter = Math.max(HOME_DASHED_CORE_RING_STROKE_WIDTH + 2, Math.round(shellDiameter));
  const center = normalizedDiameter / 2;
  const radius = Math.max(0, center - HOME_DASHED_CORE_RING_STROKE_WIDTH / 2);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${normalizedDiameter} ${normalizedDiameter}'><circle cx='${formatNumber(center)}' cy='${formatNumber(center)}' r='${formatNumber(radius)}' fill='none' stroke='white' stroke-width='${HOME_DASHED_CORE_RING_STROKE_WIDTH}' stroke-dasharray='${HOME_DASHED_CORE_RING_DASH_LENGTH} ${HOME_DASHED_CORE_RING_GAP_LENGTH}' stroke-linecap='round'/></svg>`;

  return `url("data:image/svg+xml,${encodeSvgDataUrl(svg)}")`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parsePixelLength(rawValue: string): number | null {
  const match = rawValue.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getExplicitElementStyleSize(element: HTMLElement): { width: number; height: number } | null {
  const styleWidth = parsePixelLength((element as HTMLElement).style.getPropertyValue("width"));
  const styleHeight = parsePixelLength((element as HTMLElement).style.getPropertyValue("height"));

  if (styleWidth !== null && styleHeight !== null && styleWidth > 0 && styleHeight > 0) {
    return { width: styleWidth, height: styleHeight };
  }

  return null;
}

function getElementSizeIfAvailable(element: HTMLElement): { width: number; height: number } | null {
  const explicitSize = getExplicitElementStyleSize(element);
  if (explicitSize) {
    return explicitSize;
  }

  const withRect = element as HTMLElement & {
    getBoundingClientRect?: () => { width?: number; height?: number };
  };

  if (typeof withRect.getBoundingClientRect === "function") {
    const rect = withRect.getBoundingClientRect();
    const rectWidth = rect?.width;
    const rectHeight = rect?.height;

    if (
      typeof rectWidth === "number" &&
      Number.isFinite(rectWidth) &&
      rectWidth > 0 &&
      typeof rectHeight === "number" &&
      Number.isFinite(rectHeight) &&
      rectHeight > 0
    ) {
      return { width: rectWidth, height: rectHeight };
    }
  }

  const withOffsets = element as HTMLElement & {
    offsetWidth?: number;
    offsetHeight?: number;
  };

  if (
    typeof withOffsets.offsetWidth === "number" &&
    withOffsets.offsetWidth > 0 &&
    typeof withOffsets.offsetHeight === "number" &&
    withOffsets.offsetHeight > 0
  ) {
    return { width: withOffsets.offsetWidth, height: withOffsets.offsetHeight };
  }

  return null;
}

function getElementSizeFromStyle(
  element: HTMLElement,
  fallbackWidth: number,
  fallbackHeight: number
): { width: number; height: number } {
  return getElementSizeIfAvailable(element) ?? { width: fallbackWidth, height: fallbackHeight };
}

function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

function findHomeStageRoot(orbStage: HTMLElement): HTMLElement | null {
  let current: (HTMLElement & {
    parentElement?: HTMLElement | null;
    parent?: HTMLElement | null;
    className?: string;
  }) | null = orbStage;

  while (current) {
    const classNames = typeof current.className === "string" ? current.className.split(/\s+/) : [];
    if (classNames.includes("glitter-home-stage")) {
      return current;
    }
    current = current.parentElement ?? current.parent ?? null;
  }

  return null;
}

function findHomeStageViewportHost(orbStage: HTMLElement): HTMLElement | null {
  let current: (HTMLElement & {
    parentElement?: HTMLElement | null;
    parent?: HTMLElement | null;
    className?: string;
  }) | null = orbStage;

  while (current) {
    const classNames = typeof current.className === "string" ? current.className.split(/\s+/) : [];
    if (classNames.includes("glitter-idea-main-view-host")) {
      return current;
    }
    current = current.parentElement ?? current.parent ?? null;
  }

  return null;
}

function isElementFloatingOutOfFlow(element: HTMLElement | null, fallback: boolean): boolean {
  if (!element) {
    return false;
  }

  const inlinePosition = element.style.getPropertyValue("position").trim();
  if (inlinePosition === "absolute" || inlinePosition === "fixed") {
    return true;
  }
  if (inlinePosition.length > 0) {
    return false;
  }

  const getComputedStyleFn = (globalThis as typeof globalThis & {
    getComputedStyle?: (target: Element) => { position?: string };
  }).getComputedStyle;

  if (typeof getComputedStyleFn === "function") {
    try {
      const computedPosition = getComputedStyleFn(element as unknown as Element)?.position?.trim() ?? "";
      if (computedPosition === "absolute" || computedPosition === "fixed") {
        return true;
      }
      if (computedPosition.length > 0) {
        return false;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function getHomeStageViewportSize(orbStage: HTMLElement): { width: number; height: number } {
  const root = findHomeStageRoot(orbStage);
  if (!root) {
    return getElementSizeFromStyle(
      orbStage,
      HOME_ORB_LAYOUT_DEFAULT_STAGE.width,
      HOME_ORB_LAYOUT_DEFAULT_STAGE.height
    );
  }

  const viewportHost = findHomeStageViewportHost(orbStage);
  const viewportBase = viewportHost ?? root;
  const viewportSize = getElementSizeIfAvailable(viewportBase);
  if (!viewportSize) {
    return {
      width: HOME_ORB_LAYOUT_DEFAULT_STAGE.width,
      height: HOME_ORB_LAYOUT_DEFAULT_STAGE.height
    };
  }
  const topbar = root.querySelector(".glitter-home-stage__topbar") as HTMLElement | null;
  const actionBar = root.querySelector(".glitter-home-stage__action-bar") as HTMLElement | null;
  const topbarSize = topbar
    ? getElementSizeIfAvailable(topbar) ?? { width: viewportSize.width, height: 0 }
    : { width: viewportSize.width, height: 0 };
  const actionBarSize = actionBar
    ? getElementSizeIfAvailable(actionBar) ?? { width: viewportSize.width, height: 0 }
    : { width: viewportSize.width, height: 0 };
  const rootClassNames = typeof root.className === "string" ? root.className.split(/\s+/) : [];
  const actionBarClassNames = typeof actionBar?.className === "string" ? actionBar.className.split(/\s+/) : [];
  const isPopulatedStage = rootClassNames.includes("glitter-home-stage--populated");
  const isFloatingPopulatedTopbar = isPopulatedStage && isElementFloatingOutOfFlow(topbar, true);
  const isFloatingPopulatedActionBar = actionBarClassNames.includes("glitter-home-stage__action-bar--populated")
    && isElementFloatingOutOfFlow(actionBar, true);

  const rootStyle = root.style;
  const paddingTop = parsePixelLength(rootStyle.getPropertyValue("padding-top")) ?? (isPopulatedStage ? 0 : 14);
  const paddingBottom = parsePixelLength(rootStyle.getPropertyValue("padding-bottom")) ?? 14;
  const paddingLeft = parsePixelLength(rootStyle.getPropertyValue("padding-left")) ?? 28;
  const paddingRight = parsePixelLength(rootStyle.getPropertyValue("padding-right")) ?? 28;
  const gap = parsePixelLength(rootStyle.getPropertyValue("gap")) ?? (isPopulatedStage ? 0 : 14);
  const layoutTopbarHeight = isFloatingPopulatedTopbar ? 0 : topbarSize.height;
  const layoutActionBarHeight = isFloatingPopulatedActionBar ? 0 : actionBarSize.height;
  const layoutGapCount = actionBar && !isFloatingPopulatedActionBar ? 2 : isPopulatedStage ? 0 : 1;

  return {
    width: Math.max(220, viewportSize.width - paddingLeft - paddingRight),
    height: Math.max(
      220,
      viewportSize.height - paddingTop - paddingBottom - layoutTopbarHeight - layoutActionBarHeight - gap * layoutGapCount
    )
  };
}

function getPopulatedHomeStageLayoutInputSize(orbStage: HTMLElement): { width: number; height: number } {
  return getExplicitElementStyleSize(orbStage) ?? {
    width: HOME_ORB_LAYOUT_DEFAULT_STAGE.width,
    height: HOME_ORB_LAYOUT_DEFAULT_STAGE.height
  };
}

function getPopulatedHomeStageInteractionSize(orbStage: HTMLElement): { width: number; height: number } {
  const derivedWidth = parsePixelLength(orbStage.style.getPropertyValue("--glitter-home-derived-stage-width"));
  const derivedHeight = parsePixelLength(orbStage.style.getPropertyValue("--glitter-home-derived-stage-height"));
  if (derivedWidth !== null && derivedHeight !== null && derivedWidth > 0 && derivedHeight > 0) {
    return { width: derivedWidth, height: derivedHeight };
  }

  return getHomeStageViewportSize(orbStage);
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
    clamp(
      (distance * distance + firstRadius * firstRadius - secondRadius * secondRadius) / (2 * distance * firstRadius),
      -1,
      1
    )
  );
  const secondAngle = Math.acos(
    clamp(
      (distance * distance + secondRadius * secondRadius - firstRadius * firstRadius) / (2 * distance * secondRadius),
      -1,
      1
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

function resolveOrbSizeFromClassName(className: string): HomeStageOrb["size"] {
  const classNames = className.split(/\s+/);
  const orbSizeEntries = Object.keys(ORB_PIXEL_SIZE_BY_SIZE) as HomeStageOrb["size"][];

  return orbSizeEntries.find((size) => classNames.includes(`glitter-home-stage__pool-orb--${size}`)) ?? "sm";
}

function disconnectPopulatedOrbLayoutObservers(root: HTMLElement): void {
  const withQuery = root as HTMLElement & {
    querySelectorAll?: (selector: string) => NodeListOf<HTMLElement> | HTMLElement[];
  };
  const stageNodes = withQuery.querySelectorAll?.(".glitter-home-stage__pool-stage") ?? [];

  Array.from(stageNodes).forEach((stageNode) => {
    const withObserverHandle = stageNode as HTMLElement & {
      [HOME_ORB_RESIZE_OBSERVER_KEY]?: { disconnect?: () => void };
      [HOME_ORB_INTERACTION_CONTROLLER_KEY]?: { destroy?: () => void };
    };
    withObserverHandle[HOME_ORB_RESIZE_OBSERVER_KEY]?.disconnect?.();
    withObserverHandle[HOME_ORB_INTERACTION_CONTROLLER_KEY]?.destroy?.();
    delete withObserverHandle[HOME_ORB_RESIZE_OBSERVER_KEY];
    delete withObserverHandle[HOME_ORB_INTERACTION_CONTROLLER_KEY];
  });
}

function isOrbPlacementWithinStage(
  candidateX: number,
  candidateY: number,
  candidateRadius: number,
  stageWidth: number,
  stageHeight: number,
  edgeGap: number
): boolean {
  return (
    candidateX >= candidateRadius + edgeGap &&
    candidateX <= stageWidth - candidateRadius - edgeGap &&
    candidateY >= candidateRadius + edgeGap &&
    candidateY <= stageHeight - candidateRadius - edgeGap
  );
}

function hasAcceptableOrbSeparation(
  candidateX: number,
  candidateY: number,
  candidateRadius: number,
  placedOrbs: OrbPlacement[],
  interOrbGap: number,
  maxOverlapAreaRatio: number
): boolean {
  return placedOrbs.every((placedOrb) => {
    const distance = getDistance(candidateX, candidateY, placedOrb.x, placedOrb.y);
    const radiusSum = candidateRadius + placedOrb.radius;

    if (distance >= radiusSum + interOrbGap) {
      return true;
    }

    if (maxOverlapAreaRatio <= 0) {
      return false;
    }

    if (distance >= radiusSum) {
      return true;
    }

    return getCircleOverlapAreaRatio(candidateRadius, placedOrb.radius, distance) <= maxOverlapAreaRatio;
  });
}

function isOrbPlacementValid(
  candidateX: number,
  candidateY: number,
  candidateRadius: number,
  stageWidth: number,
  stageHeight: number,
  maxDistanceFromCenter: number,
  centerX: number,
  centerY: number,
  edgeGap: number,
  interOrbGap: number,
  maxOverlapAreaRatio: number,
  placedOrbs: OrbPlacement[]
): boolean {
  if (!isOrbPlacementWithinStage(candidateX, candidateY, candidateRadius, stageWidth, stageHeight, edgeGap)) {
    return false;
  }

  if (getDistance(candidateX, candidateY, centerX, centerY) > maxDistanceFromCenter) {
    return false;
  }

  return hasAcceptableOrbSeparation(
    candidateX,
    candidateY,
    candidateRadius,
    placedOrbs,
    interOrbGap,
    maxOverlapAreaRatio
  );
}

function getHomeOrbTextMetrics(diameter: number, isPrimaryOrb: boolean): OrbTextMetrics {
  const shellInsetBase = isPrimaryOrb ? 14 : 16;
  const shellInset = Math.round(clamp(diameter * (isPrimaryOrb ? 0.12 : 0.15), 4, shellInsetBase));
  const innerDiameter = Math.max(0, diameter - shellInset * 2);
  const textPadding = Math.round(clamp(innerDiameter * 0.16, 4, 10));
  const nameFontSize = Math.round(clamp(innerDiameter * 0.12, 10, isPrimaryOrb ? 13 : 12));
  const countFontSize = Math.round(clamp(innerDiameter * 0.2, 12, isPrimaryOrb ? 20 : 16));
  const textGap = Math.round(clamp(innerDiameter * 0.04, 2, isPrimaryOrb ? 6 : 4));

  return {
    shellInset,
    textPadding,
    textGap,
    nameFontSize,
    nameLineHeight: 1.15,
    countFontSize,
    countLineHeight: 1
  };
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

// 文字可读直径求解：根据池名长度、计数字宽和主次球字号反推最小球径，避免 populated 场景里文字挤爆球面。
function getOrbMinimumReadableDiameter(orbButton: HTMLButtonElement, isPrimaryOrb: boolean): number {
  const label = orbButton.querySelector(".glitter-home-stage__pool-orb-name")?.textContent ?? "";
  const count = orbButton.querySelector(".glitter-home-stage__pool-orb-count")?.textContent ?? "";

  for (let diameter = HOME_ORB_MIN_READABLE_DIAMETER; diameter <= 320; diameter += 2) {
    const metrics = getHomeOrbTextMetrics(diameter, isPrimaryOrb);
    const contentBoxDiameter = Math.max(0, diameter - metrics.shellInset * 2);
    const availableWidth = Math.max(0, contentBoxDiameter - metrics.textPadding * 2);
    const availableHeight = Math.max(0, contentBoxDiameter - metrics.textPadding * 2);
    const labelUnitsPerLine = Math.max(1, Math.floor(availableWidth / metrics.nameFontSize));
    const labelLineCount = label ? Math.ceil(measureTextUnits(label) / labelUnitsPerLine) : 0;
    const requiredLabelHeight = label ? labelLineCount * metrics.nameFontSize * metrics.nameLineHeight : 0;
    const requiredCountWidth = measureTextUnits(count) * metrics.countFontSize;
    const requiredHeight =
      requiredLabelHeight + (label && count ? metrics.textGap : 0) + metrics.countFontSize * metrics.countLineHeight;

    if (requiredCountWidth <= availableWidth && requiredHeight <= availableHeight) {
      return diameter;
    }
  }

  return 320;
}

// 球体背板取样点跟随中心位移、shell inset 与拖拽偏移同步，保证玻璃底图始终采到球体当前所在位置的背景。
function updateOrbBackdropSample(orbButton: HTMLButtonElement): void {
  const centerX = parsePixelLength(orbButton.style.left);
  const centerY = parsePixelLength(orbButton.style.top);
  const diameter = parsePixelLength(orbButton.style.width);
  const shellInset = parsePixelLength(orbButton.style.getPropertyValue("--glitter-home-orb-shell-inset")) ?? 0;
  const shiftX = parsePixelLength(orbButton.style.getPropertyValue("--glitter-home-orb-shift-x")) ?? 0;
  const shiftY = parsePixelLength(orbButton.style.getPropertyValue("--glitter-home-orb-shift-y")) ?? 0;

  if (centerX === null || centerY === null || diameter === null) {
    orbButton.style.setProperty("--glitter-home-stage-sample-x", "0px");
    orbButton.style.setProperty("--glitter-home-stage-sample-y", "0px");
    return;
  }

  const sampleX = centerX - diameter / 2 + shiftX + shellInset;
  const sampleY = centerY - diameter / 2 + shiftY + shellInset;
  orbButton.style.setProperty("--glitter-home-stage-sample-x", `${sampleX.toFixed(3)}px`);
  orbButton.style.setProperty("--glitter-home-stage-sample-y", `${sampleY.toFixed(3)}px`);
}

function applyOrbCenterPosition(orbButton: HTMLButtonElement, centerX: number, centerY: number): void {
  orbButton.style.left = `${centerX}px`;
  orbButton.style.top = `${centerY}px`;
  updateOrbBackdropSample(orbButton);
}

function applyOrbLayoutSize(
  orbButton: HTMLButtonElement,
  radius: number,
  scale: number,
  isPrimaryOrb: boolean
): void {
  const diameter = radius * 2;
  const metrics = getHomeOrbTextMetrics(diameter, isPrimaryOrb);
  const shellDiameter = Math.max(0, diameter - metrics.shellInset * 2);

  orbButton.style.width = `${diameter}px`;
  orbButton.style.height = `${diameter}px`;
  orbButton.style.setProperty("--glitter-home-orb-shell-inset", `${metrics.shellInset}px`);
  orbButton.style.setProperty("--glitter-home-orb-text-padding", `${metrics.textPadding}px`);
  orbButton.style.setProperty("--glitter-home-orb-text-gap", `${metrics.textGap}px`);
  orbButton.style.setProperty("--glitter-home-orb-name-font-size", `${metrics.nameFontSize}px`);
  orbButton.style.setProperty("--glitter-home-orb-name-line-height", `${metrics.nameLineHeight}`);
  orbButton.style.setProperty("--glitter-home-orb-count-font-size", `${metrics.countFontSize}px`);
  orbButton.style.setProperty("--glitter-home-orb-count-line-height", `${metrics.countLineHeight}`);

  const dashedShell = orbButton.querySelector(".glitter-home-stage__water-surface--dashed") as HTMLElement | null;
  if (dashedShell) {
    dashedShell.style.setProperty("--glitter-home-dashed-ring-mask-image", buildDashedCoreRingMaskImage(shellDiameter));
  }

  updateOrbBackdropSample(orbButton);
}

function applyOrbShiftStyles(orbButton: HTMLButtonElement, shiftX: number, shiftY: number): void {
  orbButton.style.setProperty("--glitter-home-orb-shift-x", `${shiftX.toFixed(3)}px`);
  orbButton.style.setProperty("--glitter-home-orb-shift-y", `${shiftY.toFixed(3)}px`);
  updateOrbBackdropSample(orbButton);
}

function clearOrbShiftStyles(orbButton: HTMLButtonElement): void {
  applyOrbShiftStyles(orbButton, 0, 0);
}

function setOrbClickSuppressed(orbButton: HTMLButtonElement, suppressed: boolean): void {
  orbButton.dataset.stirDragSuppressClick = suppressed ? "true" : "false";
}

function resolveSupportingOrbPlacement(
  orbIndex: number,
  radius: number,
  scale: number,
  stageWidth: number,
  stageHeight: number,
  referenceWidth: number,
  referenceHeight: number,
  centerX: number,
  centerY: number,
  maxDistanceFromCenter: number,
  edgeGap: number,
  interOrbGap: number,
  maxOverlapAreaRatio: number,
  placedOrbs: OrbPlacement[]
): OrbPlacement | null {
  const slotOffset = HOME_ORB_LAYOUT_SUPPORTING_SLOT_OFFSETS[
    orbIndex % HOME_ORB_LAYOUT_SUPPORTING_SLOT_OFFSETS.length
  ]!;
  const preferredAngle = Math.atan2(slotOffset.y * referenceHeight, slotOffset.x * referenceWidth);
  const preferredDistance = Math.min(
    maxDistanceFromCenter,
    Math.hypot(slotOffset.x * referenceWidth, slotOffset.y * referenceHeight)
  );
  const radialStep = Math.max(6, Math.round(8 * Math.max(scale, 0.35)));
  const angleSegments = 72;
  const angleStep = (Math.PI * 2) / angleSegments;

  const candidateDistances = [preferredDistance];
  for (let offset = radialStep; offset <= maxDistanceFromCenter; offset += radialStep) {
    candidateDistances.push(preferredDistance + offset);
    if (preferredDistance - offset >= 0) {
      candidateDistances.push(preferredDistance - offset);
    }
  }

  for (const candidateDistance of candidateDistances) {
    if (candidateDistance < 0 || candidateDistance > maxDistanceFromCenter) {
      continue;
    }

    for (let segmentIndex = 0; segmentIndex < angleSegments; segmentIndex += 1) {
      const signedOffset =
        segmentIndex === 0 ? 0 : Math.ceil(segmentIndex / 2) * (segmentIndex % 2 === 1 ? 1 : -1);
      const candidateAngle = preferredAngle + signedOffset * angleStep;
      const candidateX = centerX + Math.cos(candidateAngle) * candidateDistance;
      const candidateY = centerY + Math.sin(candidateAngle) * candidateDistance;

      if (
        isOrbPlacementValid(
          candidateX,
          candidateY,
          radius,
          stageWidth,
          stageHeight,
          maxDistanceFromCenter,
          centerX,
          centerY,
          edgeGap,
          interOrbGap,
          maxOverlapAreaRatio,
          placedOrbs
        )
      ) {
        return { x: candidateX, y: candidateY, radius };
      }
    }
  }

  return null;
}

// 已有灵感池布局求解：保证主球居中、辅助球可读、相互不重叠，并为后续拖拽提供基准坐标。
function solvePopulatedOrbLayout(
  orbStage: HTMLElement,
  primaryOrbButton: HTMLButtonElement | null,
  supportingOrbButtons: HTMLButtonElement[]
): ResolvedOrbLayout | null {
  if (!primaryOrbButton && supportingOrbButtons.length === 0) {
    return null;
  }

  const explicitStageSize = getExplicitElementStyleSize(orbStage);
  const layoutInputStageSize = explicitStageSize ?? getPopulatedHomeStageLayoutInputSize(orbStage);
  const interactionStageSize = explicitStageSize ?? getHomeStageViewportSize(orbStage);
  const stageWidth = layoutInputStageSize.width;
  const baseStageHeight = layoutInputStageSize.height;
  const primaryBaseRadius = primaryOrbButton
    ? ORB_PIXEL_SIZE_BY_SIZE[resolveOrbSizeFromClassName(primaryOrbButton.className)] / 2
    : 0;
  const primaryMinReadableDiameter = primaryOrbButton
    ? getOrbMinimumReadableDiameter(primaryOrbButton, true)
    : 0;
  const supportingDescriptors = supportingOrbButtons.map((orbButton, orbIndex) => {
    const size = resolveOrbSizeFromClassName(orbButton.className);

    return {
      orbButton,
      orbIndex,
      size,
      baseRadius: ORB_PIXEL_SIZE_BY_SIZE[size] / 2,
      minReadableDiameter: getOrbMinimumReadableDiameter(orbButton, false)
    };
  });
  const orderedSupportingDescriptors = [...supportingDescriptors].sort(
    (left, right) => right.baseRadius - left.baseRadius || left.orbIndex - right.orbIndex
  );
  const minReadableScale = Math.max(
    ...[
      ...(primaryOrbButton && primaryBaseRadius > 0
        ? [primaryMinReadableDiameter / (primaryBaseRadius * 2)]
        : []),
      ...supportingDescriptors.map((descriptor) => descriptor.minReadableDiameter / (descriptor.baseRadius * 2))
    ]
  );

  const tryResolvePlacements = (
    candidateStageHeight: number,
    options: {
      minScale: number;
      maxOverlapAreaRatio: number;
      relaxSupportRadius?: boolean;
      scaleGaps?: boolean;
      minEdgeGap?: number;
      minInterOrbGap?: number;
      requireMinReadableDiameter?: boolean;
    }
  ): ResolvedOrbLayout | null => {
    const effectiveMinScale = options.requireMinReadableDiameter
      ? Math.max(options.minScale, minReadableScale)
      : options.minScale;
    const centerX = stageWidth * 0.5;
    const centerY = candidateStageHeight * 0.5;
    const stageMinDimension = Math.min(stageWidth, candidateStageHeight);

    const scaleCandidates =
      effectiveMinScale > 1
        ? [Number(effectiveMinScale.toFixed(2))]
        : Array.from({ length: Math.floor((1 - effectiveMinScale) / 0.04) + 2 }, (_, index) =>
            Number((1 - index * 0.04).toFixed(2))
          ).filter((candidateScale) => candidateScale >= effectiveMinScale);

    for (const normalizedScale of scaleCandidates) {
      const edgeGap = options.scaleGaps
        ? Math.max(options.minEdgeGap ?? 0, Math.round(HOME_ORB_LAYOUT_SAFE_EDGE_GAP * normalizedScale * 0.55))
        : HOME_ORB_LAYOUT_SAFE_EDGE_GAP;
      const interOrbGap = options.scaleGaps
        ? Math.max(
            options.minInterOrbGap ?? 0,
            Math.round(HOME_ORB_LAYOUT_INTER_ORB_GAP * normalizedScale * 0.45)
          )
        : HOME_ORB_LAYOUT_INTER_ORB_GAP;
      const maxSupportDistanceFromCenter = options.relaxSupportRadius
        ? Math.hypot(Math.max(0, stageWidth * 0.5 - edgeGap), Math.max(0, candidateStageHeight * 0.5 - edgeGap))
        : stageMinDimension * HOME_ORB_LAYOUT_SUPPORT_MAX_DISTANCE_RATIO;
      const placedOrbs: OrbPlacement[] = [];
      const placements = new Map<HTMLButtonElement, OrbPlacement>();

      if (primaryOrbButton) {
        const primaryRadius = primaryBaseRadius * normalizedScale;
        const primaryPlacement = {
          x: clamp(
            stageWidth * HOME_ORB_LAYOUT_PRIMARY_X_RATIO,
            primaryRadius + edgeGap,
            stageWidth - primaryRadius - edgeGap
          ),
          y: clamp(
            candidateStageHeight * HOME_ORB_LAYOUT_PRIMARY_Y_RATIO,
            primaryRadius + edgeGap,
            candidateStageHeight - primaryRadius - edgeGap
          ),
          radius: primaryRadius
        };

        if (
          !isOrbPlacementWithinStage(
            primaryPlacement.x,
            primaryPlacement.y,
            primaryPlacement.radius,
            stageWidth,
            candidateStageHeight,
            edgeGap
          )
        ) {
          continue;
        }

        placements.set(primaryOrbButton, primaryPlacement);
        placedOrbs.push(primaryPlacement);
      }

      let allResolved = true;
      for (const descriptor of orderedSupportingDescriptors) {
        const placement = resolveSupportingOrbPlacement(
          descriptor.orbIndex,
          descriptor.baseRadius * normalizedScale,
          normalizedScale,
          stageWidth,
          candidateStageHeight,
          layoutInputStageSize.width,
          layoutInputStageSize.height,
          centerX,
          centerY,
          maxSupportDistanceFromCenter,
          edgeGap,
          interOrbGap,
          options.maxOverlapAreaRatio,
          placedOrbs
        );

        if (!placement) {
          allResolved = false;
          break;
        }

        placements.set(descriptor.orbButton, placement);
        placedOrbs.push(placement);
      }

      if (allResolved) {
        return { scale: normalizedScale, stageHeight: candidateStageHeight, placements };
      }
    }

    return null;
  };

  const candidateStageHeights = [baseStageHeight];
  let expandedStageHeight = baseStageHeight;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    expandedStageHeight = Math.max(
      expandedStageHeight + HOME_ORB_LAYOUT_EXPANDED_STAGE_MIN_EXTRA_HEIGHT,
      Math.round(expandedStageHeight * HOME_ORB_LAYOUT_EXPANDED_STAGE_GROWTH_FACTOR)
    );
    candidateStageHeights.push(expandedStageHeight);
  }

  let resolved: ResolvedOrbLayout | null = null;

  for (const candidateStageHeight of candidateStageHeights) {
    resolved =
      tryResolvePlacements(candidateStageHeight, {
        minScale: 0.6,
        maxOverlapAreaRatio: 0,
        requireMinReadableDiameter: true
      }) ??
      tryResolvePlacements(candidateStageHeight, {
        minScale: 0.12,
        maxOverlapAreaRatio: 0,
        relaxSupportRadius: true,
        scaleGaps: true,
        minEdgeGap: 0,
        minInterOrbGap: 0,
        requireMinReadableDiameter: true
      }) ??
      tryResolvePlacements(candidateStageHeight, {
        minScale: 0.12,
        maxOverlapAreaRatio: 0.15,
        relaxSupportRadius: true,
        scaleGaps: true,
        minEdgeGap: 0,
        minInterOrbGap: 0,
        requireMinReadableDiameter: true
      });

    if (resolved) {
      break;
    }
  }

  if (!resolved) {
    return null;
  }

  const effectiveInteractionHeight = Math.max(interactionStageSize.height, resolved.stageHeight);
  const layoutOriginX = Math.max(0, (interactionStageSize.width - stageWidth) * 0.5);
  const layoutOriginY = Math.max(0, (effectiveInteractionHeight - resolved.stageHeight) * 0.5);
  const anchoredPlacements = new Map<HTMLButtonElement, OrbPlacement>();

  resolved.placements.forEach((placement, button) => {
    anchoredPlacements.set(button, {
      x: placement.x + layoutOriginX,
      y: placement.y + layoutOriginY,
      radius: placement.radius
    });
  });

  const anchoredResolved: ResolvedOrbLayout = {
    ...resolved,
    stageHeight: effectiveInteractionHeight,
    placements: anchoredPlacements
  };

  orbStage.style.minHeight = `${effectiveInteractionHeight}px`;
  orbStage.style.setProperty("--glitter-home-derived-stage-width", `${interactionStageSize.width}px`);
  orbStage.style.setProperty("--glitter-home-derived-stage-height", `${effectiveInteractionHeight}px`);

  if (primaryOrbButton) {
    const primaryPlacement = anchoredResolved.placements.get(primaryOrbButton);
    if (primaryPlacement) {
      applyOrbLayoutSize(primaryOrbButton, primaryPlacement.radius, anchoredResolved.scale, true);
      primaryOrbButton.style.opacity = "1";
      primaryOrbButton.style.pointerEvents = "auto";
      applyOrbCenterPosition(primaryOrbButton, primaryPlacement.x, primaryPlacement.y);
    }
  }

  supportingOrbButtons.forEach((orbButton) => {
    const placement = anchoredResolved.placements.get(orbButton);
    if (!placement) {
      return;
    }

    applyOrbLayoutSize(orbButton, placement.radius, anchoredResolved.scale, false);
    orbButton.style.opacity = "1";
    orbButton.style.pointerEvents = "auto";
    applyOrbCenterPosition(orbButton, placement.x, placement.y);
  });

  return anchoredResolved;
}

// 搅动交互控制器：负责指针拖拽、惯性回弹、提交后水波扩散，以及隔离态进入前的位移计算。
function createHomeOrbInteractionController(
  orbStage: HTMLElement,
  primaryOrbButton: HTMLButtonElement | null,
  supportingOrbButtons: HTMLButtonElement[],
  onPoolEnter: (poolId: string) => void,
  onPoolDelete?: (poolId: string) => void
): HomeOrbInteractionController | null {
  if (!primaryOrbButton && supportingOrbButtons.length === 0) {
    return null;
  }

  const ownerDocument = orbStage.ownerDocument;
  if (!ownerDocument) {
    return null;
  }

  const records = new Map<HTMLButtonElement, OrbInteractionRecord>();
  const allOrbButtons = [primaryOrbButton, ...supportingOrbButtons].filter(
    (button): button is HTMLButtonElement => button !== null
  );
  allOrbButtons.forEach((button) => {
    records.set(button, {
      button,
      baseX: 0,
      baseY: 0,
      layoutX: 0,
      layoutY: 0,
      committedOffsetX: 0,
      committedOffsetY: 0,
      hasResolvedLayout: false,
      radius: 0,
      isPrimary: button === primaryOrbButton,
      shiftX: 0,
      shiftY: 0,
      velocityX: 0,
      velocityY: 0
    });
    clearOrbShiftStyles(button);
    setOrbClickSuppressed(button, false);
  });

  let activePointerId: number | null = null;
  let activeDraggedRecord: OrbInteractionRecord | null = null;
  let dragOriginX = 0;
  let dragOriginY = 0;
  let dragOriginBaseX = 0;
  let dragOriginBaseY = 0;
  let dragStarted = false;
  let suppressNextClick = false;
  let activeFrameId: number | null = null;
  let hoverIsolationTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let hoverIsolationExitTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let isolatedRecord: OrbInteractionRecord | null = null;
  let actionRail: HTMLDivElement | null = null;
  let actionCorridor: HTMLDivElement | null = null;

  const clearHoverIsolationTimer = (): void => {
    if (hoverIsolationTimerId === null) {
      return;
    }

    globalThis.clearTimeout(hoverIsolationTimerId);
    hoverIsolationTimerId = null;
  };

  const clearHoverIsolationExitTimer = (): void => {
    if (hoverIsolationExitTimerId === null) {
      return;
    }

    globalThis.clearTimeout(hoverIsolationExitTimerId);
    hoverIsolationExitTimerId = null;
  };

  const getActionRailPosition = (): { left: number; top: number } | null => {
    if (!isolatedRecord) {
      return null;
    }

    const stageSize = getPopulatedHomeStageInteractionSize(orbStage);
    const centerX = isolatedRecord.baseX + isolatedRecord.shiftX;
    const centerY = isolatedRecord.baseY + isolatedRecord.shiftY;

    return {
      left: clamp(centerX + isolatedRecord.radius + HOME_ORB_HOVER_ACTION_OFFSET_X, 52, Math.max(52, stageSize.width - 52)),
      top: clamp(centerY, 56, Math.max(56, stageSize.height - 56))
    };
  };

  const positionActionCorridor = (): void => {
    if (!isolatedRecord || !actionCorridor) {
      return;
    }

    const stageSize = getPopulatedHomeStageInteractionSize(orbStage);
    const railPosition = getActionRailPosition();
    if (!railPosition) {
      return;
    }

    const centerX = isolatedRecord.baseX + isolatedRecord.shiftX;
    const centerY = isolatedRecord.baseY + isolatedRecord.shiftY;
    const orbRightEdge = centerX + isolatedRecord.radius;
    const corridorLeft = clamp(
      Math.min(orbRightEdge, railPosition.left) - HOME_ORB_HOVER_ACTION_CORRIDOR_X_PADDING,
      0,
      stageSize.width
    );
    const corridorRight = clamp(
      Math.max(orbRightEdge, railPosition.left) + HOME_ORB_HOVER_ACTION_CORRIDOR_X_PADDING,
      corridorLeft,
      stageSize.width
    );
    const corridorHeight = Math.min(
      stageSize.height,
      Math.max(
        isolatedRecord.radius * 2 + HOME_ORB_HOVER_ACTION_CORRIDOR_Y_PADDING * 2,
        HOME_ORB_HOVER_ACTION_RAIL_ESTIMATED_HEIGHT + HOME_ORB_HOVER_ACTION_CORRIDOR_Y_PADDING * 2
      )
    );
    const corridorTop = clamp(
      centerY,
      corridorHeight / 2,
      Math.max(corridorHeight / 2, stageSize.height - corridorHeight / 2)
    );

    actionCorridor.style.left = `${corridorLeft}px`;
    actionCorridor.style.top = `${corridorTop}px`;
    actionCorridor.style.width = `${Math.max(0, corridorRight - corridorLeft)}px`;
    actionCorridor.style.height = `${corridorHeight}px`;
  };

  const positionActionRail = (): void => {
    if (!actionRail) {
      return;
    }

    const railPosition = getActionRailPosition();
    if (!railPosition) {
      return;
    }

    actionRail.style.left = `${railPosition.left}px`;
    actionRail.style.top = `${railPosition.top}px`;
    positionActionCorridor();
  };

  const clearOrbIsolation = (): void => {
    clearHoverIsolationTimer();
    clearHoverIsolationExitTimer();
    removeClassName(orbStage, "glitter-home-stage__pool-stage--orb-isolation-active");
    records.forEach((record) => {
      removeClassName(record.button, "glitter-home-stage__pool-orb--isolated");
      removeClassName(record.button, "glitter-home-stage__pool-orb--background-muted");
    });
    actionRail?.remove();
    actionRail = null;
    actionCorridor?.remove();
    actionCorridor = null;
    isolatedRecord = null;
  };

  const isInlineRenameActive = (): boolean => isolatedRecord?.button.dataset.inlineRenameActive === "true";

  const scheduleOrbIsolationExit = (): void => {
    clearHoverIsolationTimer();
    clearHoverIsolationExitTimer();
    if (!isolatedRecord || isInlineRenameActive()) {
      return;
    }

    hoverIsolationExitTimerId = globalThis.setTimeout(() => {
      hoverIsolationExitTimerId = null;
      clearOrbIsolation();
    }, HOME_ORB_HOVER_ISOLATION_EXIT_DELAY_MS);
  };

  const showOrbIsolation = (record: OrbInteractionRecord): void => {
    clearHoverIsolationTimer();
    clearHoverIsolationExitTimer();
    isolatedRecord = record;
    addClassName(orbStage, "glitter-home-stage__pool-stage--orb-isolation-active");

    records.forEach((candidate) => {
      if (candidate === record) {
        addClassName(candidate.button, "glitter-home-stage__pool-orb--isolated");
        removeClassName(candidate.button, "glitter-home-stage__pool-orb--background-muted");
        return;
      }

      removeClassName(candidate.button, "glitter-home-stage__pool-orb--isolated");
      addClassName(candidate.button, "glitter-home-stage__pool-orb--background-muted");
    });

    actionRail?.remove();
    actionCorridor?.remove();
    actionCorridor = createNode(orbStage, "div", "glitter-home-stage__pool-orb-action-corridor") as HTMLDivElement;
    actionCorridor.setAttribute("aria-hidden", "true");
    actionCorridor.addEventListener("pointerenter", () => {
      clearHoverIsolationExitTimer();
    });
    actionCorridor.addEventListener("pointerleave", () => {
      scheduleOrbIsolationExit();
    });
    actionRail = createNode(orbStage, "div", "glitter-home-stage__pool-orb-actions") as HTMLDivElement;

    const createActionButton = (
      className: string,
      icon: "edit" | "delete" | "enter",
      label: string,
      onClick?: () => void
    ): HTMLButtonElement => {
      const button = createNode(actionRail!, "button", className) as HTMLButtonElement;
      button.type = "button";
      button.disabled = !onClick;
      createNode(
        button,
        "span",
        `glitter-home-stage__pool-orb-action-icon glitter-home-stage__pool-orb-action-icon--${icon}`
      );
      createNode(button, "span", "glitter-home-stage__pool-orb-action-label", label);
      if (onClick) {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        });
      }
      return button;
    };

    const poolId = record.button.dataset.poolId;
    const isDefaultPool = record.button.dataset.poolIsDefault === "true";
    const onEdit = poolId && !isDefaultPool ? () => startOrbTitleInlineEdit(record.button) : undefined;
    const onDelete = poolId && !isDefaultPool && onPoolDelete ? () => onPoolDelete(poolId) : undefined;

    createActionButton(
      "glitter-home-stage__pool-orb-action glitter-home-stage__pool-orb-action--edit",
      "edit",
      "编辑池",
      onEdit
    );
    createActionButton(
      "glitter-home-stage__pool-orb-action glitter-home-stage__pool-orb-action--delete",
      "delete",
      "删除池",
      onDelete
    );
    createActionButton(
      "glitter-home-stage__pool-orb-action glitter-home-stage__pool-orb-action--enter",
      "enter",
      "进入池",
      poolId ? () => onPoolEnter(poolId) : undefined
    );

    actionRail.addEventListener("pointerenter", () => {
      clearHoverIsolationExitTimer();
    });
    actionRail.addEventListener("pointerleave", () => {
      scheduleOrbIsolationExit();
    });
    positionActionRail();
  };

  const setAnimating = (next: boolean): void => {
    if (!next || activeFrameId !== null || typeof globalThis.requestAnimationFrame !== "function") {
      return;
    }

    activeFrameId = globalThis.requestAnimationFrame(stepSettling);
  };

  const isSettled = (): boolean =>
    [...records.values()].every(
      (record) =>
        Math.hypot(record.shiftX, record.shiftY) <= HOME_ORB_STIR_STOP_SHIFT_EPSILON &&
        Math.hypot(record.velocityX, record.velocityY) <= HOME_ORB_STIR_STOP_VELOCITY_EPSILON
    );

  const applyRecords = (): void => {
    records.forEach((record) => {
      applyOrbShiftStyles(record.button, record.shiftX, record.shiftY);
    });
  };

  const resetVelocities = (): void => {
    records.forEach((record) => {
      record.velocityX = 0;
      record.velocityY = 0;
    });
  };

  const commitRecordPositions = (): void => {
    const releasedPositions = new Map<OrbInteractionRecord, { x: number; y: number }>();
    const committedPositions = new Map<OrbInteractionRecord, { x: number; y: number }>();

    records.forEach((record) => {
      const releasedX = record.baseX + record.shiftX;
      const releasedY = record.baseY + record.shiftY;
      const position = { x: releasedX, y: releasedY };
      releasedPositions.set(record, position);
      committedPositions.set(record, position);
    });

    records.forEach((record) => {
      const releasedPosition = releasedPositions.get(record);
      const committedPosition = committedPositions.get(record);
      if (!releasedPosition || !committedPosition) {
        return;
      }

      const commitShiftX = releasedPosition.x - record.baseX;
      const commitShiftY = releasedPosition.y - record.baseY;
      const carryShiftX = releasedPosition.x - committedPosition.x;
      const carryShiftY = releasedPosition.y - committedPosition.y;

      record.baseX = committedPosition.x;
      record.baseY = committedPosition.y;
      record.committedOffsetX = record.baseX - record.layoutX;
      record.committedOffsetY = record.baseY - record.layoutY;
      applyOrbCenterPosition(record.button, record.baseX, record.baseY);
      record.shiftX = carryShiftX;
      record.shiftY = carryShiftY;
      record.velocityX = commitShiftX * HOME_ORB_STIR_COMMIT_RIPPLE_VELOCITY_SCALE;
      record.velocityY = commitShiftY * HOME_ORB_STIR_COMMIT_RIPPLE_VELOCITY_SCALE;
      applyOrbShiftStyles(record.button, record.shiftX, record.shiftY);
    });
  };

  const applyDragInteraction = (pointerX: number, pointerY: number): void => {
    const draggedRecord = activeDraggedRecord;
    if (!draggedRecord) {
      return;
    }

    const rawDragX = pointerX - dragOriginX;
    const rawDragY = pointerY - dragOriginY;
    const dragDistance = Math.hypot(rawDragX, rawDragY);

    if (!dragStarted) {
      if (dragDistance < HOME_ORB_STIR_DRAG_THRESHOLD) {
        return;
      }
      dragStarted = true;
      suppressNextClick = true;
      setOrbClickSuppressed(draggedRecord.button, true);
    }

    const stageSize = getPopulatedHomeStageInteractionSize(orbStage);
    const clampedDraggedCenter = clampOrbCenterToStage(
      dragOriginBaseX + rawDragX,
      dragOriginBaseY + rawDragY,
      draggedRecord.radius,
      stageSize.width,
      stageSize.height
    );
    const draggedShiftX = clampedDraggedCenter.x - draggedRecord.baseX;
    const draggedShiftY = clampedDraggedCenter.y - draggedRecord.baseY;
    const draggedShiftDistance = Math.hypot(draggedShiftX, draggedShiftY);
    const draggedCenterX = draggedRecord.baseX + draggedShiftX;
    const draggedCenterY = draggedRecord.baseY + draggedShiftY;
    const targetCenters = new Map<OrbInteractionRecord, { x: number; y: number }>();

    targetCenters.set(draggedRecord, {
      x: draggedCenterX,
      y: draggedCenterY
    });

    records.forEach((record) => {
      if (record === draggedRecord) {
        return;
      }

      const fromDraggedX = record.baseX - draggedCenterX;
      const fromDraggedY = record.baseY - draggedCenterY;
      const distanceFromDragged = Math.hypot(fromDraggedX, fromDraggedY);
      const influenceRadius = getOrbInteractionInfluenceRadius(draggedRecord.radius, record.radius);
      const influence = clamp(1 - distanceFromDragged / influenceRadius, 0, 1);
      const radialX = distanceFromDragged > 0 ? fromDraggedX / distanceFromDragged : 0;
      const radialY = distanceFromDragged > 0 ? fromDraggedY / distanceFromDragged : 0;
      const flowScale = influence * (record.radius / Math.max(draggedRecord.radius, 1));
      const stirredTargetX =
        record.baseX +
        draggedShiftX * HOME_ORB_STIR_SUPPORT_FLOW_SCALE * flowScale +
        radialX * draggedShiftDistance * HOME_ORB_STIR_SUPPORT_RADIAL_SCALE * flowScale;
      const stirredTargetY =
        record.baseY +
        draggedShiftY * HOME_ORB_STIR_SUPPORT_FLOW_SCALE * flowScale +
        radialY * draggedShiftDistance * HOME_ORB_STIR_SUPPORT_RADIAL_SCALE * flowScale;
      const clampedSupportingCenter = clampOrbCenterToStage(
        stirredTargetX,
        stirredTargetY,
        record.radius,
        stageSize.width,
        stageSize.height
      );

      targetCenters.set(record, clampedSupportingCenter);
    });

    let adjustedDraggedCenterX = draggedCenterX;
    let adjustedDraggedCenterY = draggedCenterY;
    const draggedNeighbors = [...records.values()]
      .filter((record) => record !== draggedRecord)
      .sort((left, right) => {
        const leftCenter = targetCenters.get(left);
        const rightCenter = targetCenters.get(right);
        const leftDistance = leftCenter
          ? Math.hypot(leftCenter.x - adjustedDraggedCenterX, leftCenter.y - adjustedDraggedCenterY)
          : Number.POSITIVE_INFINITY;
        const rightDistance = rightCenter
          ? Math.hypot(rightCenter.x - adjustedDraggedCenterX, rightCenter.y - adjustedDraggedCenterY)
          : Number.POSITIVE_INFINITY;
        return leftDistance - rightDistance;
      });

    draggedNeighbors.forEach((neighbor) => {
      const neighborCenter = targetCenters.get(neighbor);
      if (!neighborCenter) {
        return;
      }

      const fromDraggedX = neighborCenter.x - adjustedDraggedCenterX;
      const fromDraggedY = neighborCenter.y - adjustedDraggedCenterY;
      const centerDistance = Math.hypot(fromDraggedX, fromDraggedY);
      const minDistance = draggedRecord.radius + neighbor.radius;

      if (centerDistance >= minDistance) {
        return;
      }

      const fallbackX = neighbor.baseX - adjustedDraggedCenterX;
      const fallbackY = neighbor.baseY - adjustedDraggedCenterY;
      const fallbackDistance = Math.hypot(fallbackX, fallbackY);
      const unitX = centerDistance > 0 ? fromDraggedX / centerDistance : fallbackDistance > 0 ? fallbackX / fallbackDistance : 1;
      const unitY = centerDistance > 0 ? fromDraggedY / centerDistance : fallbackDistance > 0 ? fallbackY / fallbackDistance : 0;
      const clampedSeparatedNeighborCenter = clampOrbCenterToStage(
        adjustedDraggedCenterX + unitX * minDistance,
        adjustedDraggedCenterY + unitY * minDistance,
        neighbor.radius,
        stageSize.width,
        stageSize.height
      );

      targetCenters.set(neighbor, clampedSeparatedNeighborCenter);

      if (draggedRecord.isPrimary) {
        return;
      }

      const resolvedDistance = Math.hypot(
        clampedSeparatedNeighborCenter.x - adjustedDraggedCenterX,
        clampedSeparatedNeighborCenter.y - adjustedDraggedCenterY
      );
      if (resolvedDistance >= minDistance) {
        return;
      }

      const clampedSeparatedDraggedCenter = clampOrbCenterToStage(
        clampedSeparatedNeighborCenter.x - unitX * minDistance,
        clampedSeparatedNeighborCenter.y - unitY * minDistance,
        draggedRecord.radius,
        stageSize.width,
        stageSize.height
      );

      adjustedDraggedCenterX = clampedSeparatedDraggedCenter.x;
      adjustedDraggedCenterY = clampedSeparatedDraggedCenter.y;
    });

    targetCenters.set(draggedRecord, {
      x: adjustedDraggedCenterX,
      y: adjustedDraggedCenterY
    });

    records.forEach((record) => {
      const resolvedCenter = targetCenters.get(record);
      if (!resolvedCenter) {
        return;
      }

      const resolvedShiftX = resolvedCenter.x - record.baseX;
      const resolvedShiftY = resolvedCenter.y - record.baseY;
      record.velocityX = resolvedShiftX - record.shiftX;
      record.velocityY = resolvedShiftY - record.shiftY;
      record.shiftX = resolvedShiftX;
      record.shiftY = resolvedShiftY;
    });

    applyRecords();
  };

  function stepSettling(): void {
    activeFrameId = null;

    records.forEach((record) => {
      record.velocityX *= HOME_ORB_STIR_SETTLE_VELOCITY_DECAY;
      record.velocityY *= HOME_ORB_STIR_SETTLE_VELOCITY_DECAY;
      record.shiftX = (record.shiftX + record.velocityX) * HOME_ORB_STIR_SETTLE_DECAY;
      record.shiftY = (record.shiftY + record.velocityY) * HOME_ORB_STIR_SETTLE_DECAY;

      if (Math.abs(record.shiftX) <= HOME_ORB_STIR_STOP_SHIFT_EPSILON) {
        record.shiftX = 0;
      }
      if (Math.abs(record.shiftY) <= HOME_ORB_STIR_STOP_SHIFT_EPSILON) {
        record.shiftY = 0;
      }
      if (Math.abs(record.velocityX) <= HOME_ORB_STIR_STOP_VELOCITY_EPSILON) {
        record.velocityX = 0;
      }
      if (Math.abs(record.velocityY) <= HOME_ORB_STIR_STOP_VELOCITY_EPSILON) {
        record.velocityY = 0;
      }
    });

    applyRecords();

    if (!isSettled()) {
      setAnimating(true);
      return;
    }

  }

  const onPointerMove = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    event.preventDefault();
    applyDragInteraction(event.clientX, event.clientY);
  };

  const finishPointerInteraction = (mode: "commit" | "revert"): void => {
    if (activePointerId === null) {
      return;
    }

    activeDraggedRecord?.button.releasePointerCapture?.(activePointerId);

    if (mode === "commit") {
      commitRecordPositions();
      setAnimating(true);
    } else {
      records.forEach((record) => {
        const velocityScale = record === activeDraggedRecord
          ? HOME_ORB_STIR_PRIMARY_RELEASE_VELOCITY_SCALE
          : HOME_ORB_STIR_SUPPORT_RELEASE_VELOCITY_SCALE;
        record.velocityX = record.shiftX * velocityScale;
        record.velocityY = record.shiftY * velocityScale;
      });
      setAnimating(true);
    }

    activePointerId = null;
    activeDraggedRecord = null;
    dragStarted = false;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    finishPointerInteraction("commit");
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    finishPointerInteraction("revert");
  };

  allOrbButtons.forEach((orbButton) => {
    orbButton.addEventListener("pointerenter", () => {
      if (activePointerId !== null) {
        return;
      }

      const record = records.get(orbButton);
      if (!record) {
        return;
      }

      clearHoverIsolationExitTimer();
      clearHoverIsolationTimer();
      if (isolatedRecord && isolatedRecord !== record) {
        if (isInlineRenameActive()) {
          return;
        }
        clearOrbIsolation();
      }
      if (isolatedRecord === record) {
        return;
      }

      hoverIsolationTimerId = globalThis.setTimeout(() => {
        hoverIsolationTimerId = null;
        showOrbIsolation(record);
      }, HOME_ORB_HOVER_ISOLATION_DELAY_MS);
    });

    orbButton.addEventListener("pointerleave", () => {
      clearHoverIsolationTimer();
      if (isolatedRecord === records.get(orbButton)) {
        scheduleOrbIsolationExit();
      }
    });

    orbButton.addEventListener("pointerdown", (event) => {
      clearOrbIsolation();
      activePointerId = event.pointerId;
      activeDraggedRecord = records.get(orbButton) ?? null;
      dragOriginX = event.clientX;
      dragOriginY = event.clientY;
      dragOriginBaseX = activeDraggedRecord?.baseX ?? 0;
      dragOriginBaseY = activeDraggedRecord?.baseY ?? 0;
      dragStarted = false;
      suppressNextClick = false;
      setOrbClickSuppressed(orbButton, false);
      resetVelocities();
      orbButton.setPointerCapture?.(event.pointerId);
    });

    orbButton.addEventListener("click", (event) => {
      if (!suppressNextClick && orbButton.dataset.stirDragSuppressClick !== "true") {
        return;
      }

      suppressNextClick = false;
      setOrbClickSuppressed(orbButton, false);
      event.preventDefault();
      event.stopPropagation();
    }, true);
  });

  ownerDocument.addEventListener("pointermove", onPointerMove);
  ownerDocument.addEventListener("pointerup", onPointerUp);
  ownerDocument.addEventListener("pointercancel", onPointerCancel);

  return {
    applyLayout(layout: ResolvedOrbLayout): void {
      layout.placements.forEach((placement, button) => {
        const record = records.get(button);
        if (!record) {
          return;
        }

        record.layoutX = placement.x;
        record.layoutY = placement.y;
        record.radius = placement.radius;
        record.hasResolvedLayout = true;
        record.baseX = record.layoutX + record.committedOffsetX;
        record.baseY = record.layoutY + record.committedOffsetY;
        applyOrbCenterPosition(button, record.baseX, record.baseY);

        if (activePointerId === null) {
          record.shiftX = 0;
          record.shiftY = 0;
          record.velocityX = 0;
          record.velocityY = 0;
          clearOrbShiftStyles(button);
        }
      });

      positionActionRail();
    },
    destroy(): void {
      ownerDocument.removeEventListener("pointermove", onPointerMove);
      ownerDocument.removeEventListener("pointerup", onPointerUp);
      ownerDocument.removeEventListener("pointercancel", onPointerCancel);
      if (activeFrameId !== null && typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(activeFrameId);
        activeFrameId = null;
      }
      clearOrbIsolation();
      records.forEach((record) => {
        clearOrbShiftStyles(record.button);
        setOrbClickSuppressed(record.button, false);
      });
    }
  };
}

// 布局回流与球体动效应用。
function bindPopulatedOrbLayoutReflow(
  orbStage: HTMLElement,
  primaryOrbButton: HTMLButtonElement | null,
  supportingOrbButtons: HTMLButtonElement[],
  onPoolEnter: (poolId: string) => void,
  onPoolDelete?: (poolId: string) => void
): void {
  const withObserverHandle = orbStage as HTMLElement & {
    [HOME_ORB_RESIZE_OBSERVER_KEY]?: ResizeObserver;
    [HOME_ORB_INTERACTION_CONTROLLER_KEY]?: HomeOrbInteractionController;
  };
  withObserverHandle[HOME_ORB_INTERACTION_CONTROLLER_KEY]?.destroy();

  const interactionController = createHomeOrbInteractionController(
    orbStage,
    primaryOrbButton,
    supportingOrbButtons,
    onPoolEnter,
    onPoolDelete
  );
  if (interactionController) {
    withObserverHandle[HOME_ORB_INTERACTION_CONTROLLER_KEY] = interactionController;
  }

  const applyResolvedLayout = (): void => {
    const resolvedLayout = solvePopulatedOrbLayout(orbStage, primaryOrbButton, supportingOrbButtons);
    if (resolvedLayout) {
      withObserverHandle[HOME_ORB_INTERACTION_CONTROLLER_KEY]?.applyLayout(resolvedLayout);
    }
  };

  applyResolvedLayout();

  const ResizeObserverCtor = (globalThis as typeof globalThis & {
    ResizeObserver?: new (callback: ResizeObserverCallback) => ResizeObserver;
  }).ResizeObserver;

  if (typeof ResizeObserverCtor !== "function") {
    return;
  }

  withObserverHandle[HOME_ORB_RESIZE_OBSERVER_KEY]?.disconnect?.();

  const observer = new ResizeObserverCtor(() => {
    applyResolvedLayout();
  });

  observer.observe(orbStage);
  withObserverHandle[HOME_ORB_RESIZE_OBSERVER_KEY] = observer;
}

// 动效参数落到 DOM 变量，CSS 侧据此驱动不同球体的水纹、虚线环和轨道节奏。
function applyOrbMotionPreset(
  orbButton: HTMLButtonElement,
  motionPresetIndex: number,
  isPrimaryOrb: boolean
): void {
  const basePreset = ORB_MOTION_PRESETS[motionPresetIndex % ORB_MOTION_PRESETS.length]!;
  const cycleIndex = Math.floor(motionPresetIndex / ORB_MOTION_PRESETS.length);
  const offsetIndex = cycleIndex % ORB_MOTION_CYCLE_OFFSETS.durationSeconds.length;

  const durationOffset = ORB_MOTION_CYCLE_OFFSETS.durationSeconds[offsetIndex]!;
  const delayOffset = ORB_MOTION_CYCLE_OFFSETS.delaySeconds[offsetIndex]!;

  let rippleDurationSeconds = basePreset.rippleDurationSeconds + durationOffset;
  const rippleDelaySeconds = basePreset.rippleDelaySeconds + delayOffset;
  let breatheDurationSeconds = basePreset.breatheDurationSeconds + durationOffset;
  const breatheDelaySeconds = basePreset.breatheDelaySeconds + delayOffset;

  let rippleScaleRise = basePreset.rippleScaleRise + ORB_MOTION_CYCLE_OFFSETS.scaleRise[offsetIndex]!;
  let rippleScaleMid = basePreset.rippleScaleMid + ORB_MOTION_CYCLE_OFFSETS.scaleMid[offsetIndex]!;
  let rippleScaleEnd = basePreset.rippleScaleEnd + ORB_MOTION_CYCLE_OFFSETS.scaleEnd[offsetIndex]!;
  let rippleOpacityPeak = basePreset.rippleOpacityPeak + ORB_MOTION_CYCLE_OFFSETS.opacityPeak[offsetIndex]!;
  let rippleOpacityTrail =
    basePreset.rippleOpacityTrail + ORB_MOTION_CYCLE_OFFSETS.opacityTrail[offsetIndex]!;

  if (isPrimaryOrb) {
    rippleDurationSeconds *= PRIMARY_ORB_MOTION.rippleDurationMultiplier;
    breatheDurationSeconds *= PRIMARY_ORB_MOTION.breatheDurationMultiplier;
    rippleScaleRise *= PRIMARY_ORB_MOTION.rippleScaleRiseMultiplier;
    rippleScaleMid *= PRIMARY_ORB_MOTION.rippleScaleMidMultiplier;
    rippleScaleEnd *= PRIMARY_ORB_MOTION.rippleScaleEndMultiplier;
    rippleOpacityPeak *= PRIMARY_ORB_MOTION.rippleOpacityPeakScale;
    rippleOpacityTrail *= PRIMARY_ORB_MOTION.rippleOpacityTrailScale;
  }

  rippleScaleRise = clamp(rippleScaleRise, 1.3, 1.53);
  rippleScaleMid = clamp(rippleScaleMid, 1.82, 2.23);
  rippleScaleEnd = clamp(rippleScaleEnd, 2.48, 2.83);
  rippleOpacityPeak = clamp(rippleOpacityPeak, 0.13, 0.2);
  rippleOpacityTrail = clamp(rippleOpacityTrail, 0.05, 0.09);
  const rippleOpacityTail = clamp(rippleOpacityTrail * 0.38, 0.02, 0.04);

  orbButton.style.setProperty("--glitter-home-ripple-duration", formatSeconds(rippleDurationSeconds));
  orbButton.style.setProperty("--glitter-home-ripple-delay", formatSeconds(rippleDelaySeconds));
  orbButton.style.setProperty("--glitter-home-breathe-duration", formatSeconds(breatheDurationSeconds));
  orbButton.style.setProperty("--glitter-home-breathe-delay", formatSeconds(breatheDelaySeconds));
  orbButton.style.setProperty("--glitter-home-ripple-scale-rise", formatNumber(rippleScaleRise));
  orbButton.style.setProperty("--glitter-home-ripple-scale-mid", formatNumber(rippleScaleMid));
  orbButton.style.setProperty("--glitter-home-ripple-scale-end", formatNumber(rippleScaleEnd));
  orbButton.style.setProperty("--glitter-home-ripple-opacity-peak", formatNumber(rippleOpacityPeak));
  orbButton.style.setProperty("--glitter-home-ripple-opacity-trail", formatNumber(rippleOpacityTrail));
  orbButton.style.setProperty("--glitter-home-ripple-opacity-tail", formatNumber(rippleOpacityTail));
}

function buildOrbTextStrengthById(orbs: ReadonlyArray<HomeStageOrb>): ReadonlyMap<string, OrbTextStrength> {
  if (orbs.length === 0) {
    return new Map();
  }

  const counts = orbs.map((orb) => orb.count ?? 0);
  const distinctCountsDescending = Array.from(new Set(counts)).sort((left, right) => right - left);
  const strongestTierIndex = ORB_TEXT_TIERS.length - 1;
  const countTierIndexByValue = new Map(
    distinctCountsDescending.map((count, rank) => {
      const tierIndex = Math.max(
        0,
        Math.min(
          distinctCountsDescending.length <= 1
            ? strongestTierIndex
            : Math.ceil((1 - rank / (distinctCountsDescending.length - 1)) * strongestTierIndex),
          strongestTierIndex
        )
      );

      return [count, tierIndex];
    })
  );

  return new Map(
    orbs.map((orb) => {
      const tierIndex = countTierIndexByValue.get(orb.count ?? 0) ?? 0;
      const textTier = ORB_TEXT_TIERS[tierIndex] ?? ORB_TEXT_TIERS[0];

      return [
        orb.id,
        {
          tier: textTier
        }
      ];
    })
  );
}

function getOrbCountText(orb: HomeStageOrb): string {
  if (orb.countText !== undefined) {
    return orb.countText;
  }

  return orb.count !== undefined ? String(orb.count) : "";
}

function createPerRenderId(prefix: string): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  return `${prefix}-${randomPart}`;
}

function shouldUseDashedCoreRing(orbId: string, motionPresetIndex: number, isPrimaryOrb: boolean): boolean {
  if (isPrimaryOrb) {
    return false;
  }

  let hash = motionPresetIndex * 17;
  for (const character of orbId) {
    hash = (hash * 33 + character.charCodeAt(0)) >>> 0;
  }

  return hash % 3 === 0;
}

function applyOrbColorVariables(orbButton: HTMLButtonElement, orb: HomeStageOrb): void {
  const orbRgb = resolveHomeOrbRgb(orb.color);
  const ringRgb = resolveHomeOrbRingRgb(orb.color);
  if (!orbRgb || !ringRgb) {
    return;
  }

  orbButton.style.setProperty("--glitter-home-orb-rgb", orbRgb);
  orbButton.style.setProperty("--glitter-home-orb-ring-rgb", ringRgb);
}

// 单个池球体渲染：这里决定尺寸、颜色、虚实描边、名称计数、隔离态按钮和内联改名入口。
function renderOrb(
  parent: HTMLElement,
  orb: HomeStageOrb,
  className: string,
  actions: HomeViewActions,
  motionPresetIndex: number,
  isPrimaryOrb: boolean,
  textStrength?: OrbTextStrength
): HTMLButtonElement {
  const orbButton = createNode(
    parent,
    "button",
    `${className} glitter-home-stage__pool-orb--${orb.size}`
  ) as HTMLButtonElement;

  orbButton.type = "button";
  orbButton.style.left = `${orb.x}%`;
  orbButton.style.top = `${orb.y}%`;
  applyOrbMotionPreset(orbButton, motionPresetIndex, isPrimaryOrb);
  orbButton.dataset.poolId = orb.id;
  orbButton.dataset.poolIsDefault = orb.isDefault ? "true" : "false";
  orbButton.dataset.orbTone = orb.tone;
  orbButton.dataset.orbKind = orb.kind;
  applyOrbColorVariables(orbButton, orb);
  if (textStrength) {
    orbButton.dataset.textTier = textStrength.tier;
  }

  const isOrbTitleEditing = (): boolean => {
    const title = orbButton.querySelector(".glitter-home-stage__pool-orb-name") as HTMLElement | null;
    return title?.getAttribute("contenteditable") === "true";
  };

  orbButton.addEventListener("click", () => {
    if (orbButton.dataset.stirDragSuppressClick === "true") {
      setOrbClickSuppressed(orbButton, false);
      return;
    }

    if (isOrbTitleEditing()) {
      return;
    }

    actions.onPoolSelect(orb.id);
  });

  const rippleLayer = createNode(orbButton, "span", "glitter-home-stage__water-ripple-layer");
  const rippleVariants =
    orb.size === "xs" || orb.size === "sm" || orb.size === "md"
      ? ["near", "mid"]
      : ["near", "mid", "far"];
  rippleVariants.forEach((variant) => {
    createNode(rippleLayer, "span", `glitter-home-stage__water-ripple glitter-home-stage__water-ripple--${variant}`);
  });
  const usesDashedCoreRing = shouldUseDashedCoreRing(orb.id, motionPresetIndex, isPrimaryOrb);
  const shellClassName = usesDashedCoreRing
    ? "glitter-home-stage__pool-orb-shell glitter-home-stage__water-surface glitter-home-stage__water-surface--dashed"
    : "glitter-home-stage__pool-orb-shell glitter-home-stage__water-surface";
  createNode(orbButton, "span", shellClassName);
  const isolationOrbit = createNode(orbButton, "span", "glitter-home-stage__pool-orb-isolation-orbit");
  const isolationRunner = createNode(isolationOrbit, "span", "glitter-home-stage__pool-orb-isolation-runner");
  createNode(isolationRunner, "span", "glitter-home-stage__pool-orb-isolation-comet");
  createNode(isolationRunner, "span", "glitter-home-stage__pool-orb-isolation-head");
  const orbText = createNode(orbButton, "span", "glitter-home-stage__pool-orb-text");
  let currentTitle = orb.label;
  const title = createNode(orbText, "span", "glitter-home-stage__pool-orb-name", currentTitle);
  const commitTitle = (): void => {
    if (title.getAttribute("contenteditable") !== "true") {
      return;
    }

    const nextTitle = (title.textContent ?? "").trim();
    const finalTitle = nextTitle || currentTitle;
    title.textContent = finalTitle;
    title.setAttribute("contenteditable", "false");
    delete orbButton.dataset.inlineRenameActive;
    removeClassName(orbText, "glitter-home-stage__pool-orb-text--editing");

    if (!nextTitle || nextTitle === currentTitle) {
      return;
    }

    currentTitle = nextTitle;
    actions.onPoolRename?.(orb.id, nextTitle);
  };

  title.addEventListener("click", (event) => {
    if (title.getAttribute("contenteditable") === "true") {
      event.stopPropagation();
    }
  });
  title.addEventListener("pointerdown", (event) => {
    if (title.getAttribute("contenteditable") === "true") {
      event.stopPropagation();
    }
  });
  title.addEventListener("blur", commitTitle);
  title.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent & { isComposing?: boolean; keyCode?: number };
    if (keyboardEvent.key !== "Enter") {
      return;
    }

    if (keyboardEvent.isComposing || keyboardEvent.keyCode === 229) {
      return;
    }

    keyboardEvent.preventDefault();
    commitTitle();
  });
  createNode(
    orbText,
    "span",
    "glitter-home-stage__pool-orb-count",
    getOrbCountText(orb)
  );

  return orbButton;
}

function renderActionButton(
  parent: HTMLElement,
  className: string,
  label: string,
  tone: "primary" | "secondary" | "muted" | undefined,
  disabled: boolean | undefined,
  onClick: () => void
): void {
  const toneClass = tone ? ` glitter-home-stage__action--${tone}` : "";
  const button = createNode(parent, "button", `${className}${toneClass}`) as HTMLButtonElement;
  button.type = "button";
  button.disabled = Boolean(disabled);

  const iconClass =
    tone === "primary"
      ? "glitter-home-stage__action-icon glitter-home-stage__action-icon--primary"
      : tone === "secondary"
        ? "glitter-home-stage__action-icon glitter-home-stage__action-icon--secondary"
        : undefined;

  if (iconClass) {
    createNode(button, "span", iconClass);
  }

  createNode(button, "span", "glitter-home-stage__action-label", label);

  if (!button.disabled) {
    button.addEventListener("click", onClick);
  }
}

// 首页总入口：拼装顶部栏、空态引导、球体舞台与底部动作区，并根据场景切换对应交互。
export function renderHomeView(
  containerEl: HTMLElement,
  state: HomeViewState,
  actions: HomeViewActions
): HTMLElement {
  clearContainer(containerEl);

  const stage = createNode(
    containerEl,
    "div",
    `glitter-plugin-root glitter-home-stage glitter-home-stage--${state.mode}`
  );
  const topbarClass =
    state.mode === "empty"
      ? "glitter-home-stage__topbar glitter-home-stage__header--weak"
      : "glitter-home-stage__topbar";
  const topbar = createNode(stage, "div", topbarClass);
  const brand = createNode(topbar, "div", "glitter-home-stage__brand");

  createNode(brand, "h2", undefined, state.hero.title);

  if (state.mode === "empty" && state.hero.subtitle) {
    createNode(brand, "p", undefined, state.hero.subtitle);
  }

  if (state.mode !== "empty" && state.topbar.search) {
    const topbarSearch = createNode(topbar, "div", "glitter-home-stage__topbar-search");
    createNode(topbarSearch, "span", "glitter-home-stage__topbar-search-icon");
    const searchInput = createNode(
      topbarSearch,
      "input",
      "glitter-home-stage__topbar-search-input"
    ) as HTMLInputElement;
    searchInput.type = "text";
    searchInput.placeholder = state.topbar.search.placeholder;
    searchInput.setAttribute("aria-label", state.topbar.search.placeholder);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      const keyCode =
        "keyCode" in event
          ? (event as KeyboardEvent & { keyCode?: number }).keyCode
          : undefined;

      if (event.isComposing || keyCode === 229) {
        return;
      }

      event.preventDefault();
      actions.onSearchSubmit(searchInput.value.trim());
    });
  }

  const topbarActionsClass =
    state.mode === "empty"
      ? "glitter-home-stage__topbar-actions glitter-home-stage__topbar-actions--empty"
      : "glitter-home-stage__topbar-actions";
  const topbarActions = createNode(topbar, "div", topbarActionsClass);
  // 视图菜单独立维护开合记录，保证点击舞台其它区域时能统一收起。
  let openFieldViewMenuRecord:
    | {
        slot: HTMLElement;
        control: HTMLButtonElement;
        menu: HTMLElement;
      }
    | null = null;

  const setFieldViewMenuOpenState = (
    slot: HTMLElement,
    control: HTMLButtonElement,
    menu: HTMLElement,
    isOpen: boolean
  ): void => {
    if (isOpen) {
      addClassName(slot, "glitter-home-stage__topbar-control-slot--menu-open");
      addClassName(menu, "glitter-home-stage__field-view-menu--open");
      control.setAttribute("aria-expanded", "true");
      menu.setAttribute("aria-hidden", "false");
      return;
    }

    removeClassName(slot, "glitter-home-stage__topbar-control-slot--menu-open");
    removeClassName(menu, "glitter-home-stage__field-view-menu--open");
    control.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-hidden", "true");
  };

  const closeFieldViewMenu = (): void => {
    if (!openFieldViewMenuRecord) {
      return;
    }

    setFieldViewMenuOpenState(
      openFieldViewMenuRecord.slot,
      openFieldViewMenuRecord.control,
      openFieldViewMenuRecord.menu,
      false
    );
    openFieldViewMenuRecord = null;
  };

  stage.addEventListener("click", () => {
    closeFieldViewMenu();
  });

  state.topbar.controls.forEach((controlState) => {
    const controlSlot = createNode(topbarActions, "div", "glitter-home-stage__topbar-control-slot");
    if (controlState.id === "view-switch") {
      addClassName(controlSlot, "glitter-home-stage__topbar-control-slot--view-switch");
    }

    const controlClass =
      controlState.kind === "text"
        ? "glitter-home-stage__topbar-control glitter-home-stage__topbar-control--text"
        : "glitter-home-stage__topbar-control glitter-home-stage__topbar-control--icon";
    const control = createNode(controlSlot, "button", controlClass) as HTMLButtonElement;
    control.type = "button";

    if (controlState.id === "view-switch") {
      const fieldViewMenu = createNode(controlSlot, "div", "glitter-home-stage__field-view-menu");
      fieldViewMenu.setAttribute("aria-hidden", "true");
      fieldViewMenu.setAttribute("role", "menu");
      control.setAttribute("aria-haspopup", "menu");
      control.setAttribute("aria-expanded", "false");
      fieldViewMenu.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      HOME_FIELD_VIEW_OPTIONS.forEach((homeFieldView) => {
        const optionClass =
          homeFieldView === state.fieldView
            ? "glitter-home-stage__field-view-option glitter-home-stage__field-view-option--selected"
            : "glitter-home-stage__field-view-option";
        const option = createNode(
          fieldViewMenu,
          "button",
          optionClass,
          HOME_FIELD_VIEW_LABELS[homeFieldView]
        ) as HTMLButtonElement;
        option.type = "button";
        option.setAttribute("role", "menuitemradio");
        option.setAttribute("aria-checked", homeFieldView === state.fieldView ? "true" : "false");
        option.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          closeFieldViewMenu();
          actions.onFieldViewSelect?.(homeFieldView);
        });
      });

      control.disabled = !actions.onFieldViewSelect;
      if (actions.onFieldViewSelect) {
        control.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const shouldOpen = openFieldViewMenuRecord?.menu !== fieldViewMenu;
          closeFieldViewMenu();
          if (!shouldOpen) {
            return;
          }

          setFieldViewMenuOpenState(controlSlot, control, fieldViewMenu, true);
          openFieldViewMenuRecord = {
            slot: controlSlot,
            control,
            menu: fieldViewMenu
          };
        });
      }

      if (controlState.kind === "text") {
        control.textContent = controlState.label;
      } else {
        createNode(
          control,
          "span",
          `glitter-home-stage__topbar-control-icon glitter-home-stage__topbar-control-icon--${controlState.id}`
        );
        createNode(control, "span", "glitter-home-stage__visually-hidden", controlState.label);
      }
      return;
    }

    const onClick =
      controlState.id === "settings"
        ? actions.onOpenSettings
        : controlState.id === "file-filter"
          ? actions.onStatusFilterSelect
          : undefined;
    control.disabled = !onClick;
    if (onClick) {
      control.addEventListener("click", () => onClick());
    }

    if (controlState.kind === "text") {
      control.textContent = controlState.label;
      return;
    }

    createNode(
      control,
      "span",
      `glitter-home-stage__topbar-control-icon glitter-home-stage__topbar-control-icon--${controlState.id}`
    );
    createNode(control, "span", "glitter-home-stage__visually-hidden", controlState.label);
  });
  if (state.mode === "empty" && state.emptyGuide) {
    const guideBadge = createNode(
      topbarActions,
      "span",
      "glitter-home-stage__guide-badge glitter-home-stage__guide-badge--topbar"
    );
    createNode(guideBadge, "span", "glitter-home-stage__guide-badge-icon");
    createNode(guideBadge, "span", "glitter-home-stage__guide-badge-text", state.emptyGuide.badge);
  }

  const fieldClass =
    state.mode === "empty"
      ? "glitter-home-stage__field glitter-home-stage__field--empty"
      : "glitter-home-stage__field";
  const field = createNode(stage, "div", fieldClass);
  const middle = createNode(field, "div", "glitter-home-stage__middle");
  const orbLayer = createNode(middle, "div", "glitter-home-stage__orb-layer");
  const orbRegion = createNode(orbLayer, "div", "glitter-home-stage__orb-region");

  if (state.mode === "empty") {
    const emptyLayout = createNode(orbRegion, "div", "glitter-home-stage__empty-layout glitter-home-stage__orb-stage");
    createNode(emptyLayout, "div", "glitter-home-stage__empty-field-glow");
    const orbWrap = createNode(emptyLayout, "div", "glitter-home-stage__orb-wrap");

    createNode(
      orbWrap,
      "span",
      "glitter-home-stage__empty-orb-ripple glitter-home-stage__empty-orb-ripple--inner"
    );
    createNode(
      orbWrap,
      "span",
      "glitter-home-stage__empty-orb-ripple glitter-home-stage__empty-orb-ripple--middle"
    );
    createNode(
      orbWrap,
      "span",
      "glitter-home-stage__empty-orb-ripple glitter-home-stage__empty-orb-ripple--outer"
    );
    const emptyOrbButton = createNode(
      orbWrap,
      "button",
      "glitter-home-stage__empty-orb-hit-area"
    ) as HTMLButtonElement;
    emptyOrbButton.type = "button";
    emptyOrbButton.disabled = Boolean(state.primaryAction.disabled);
    if (!emptyOrbButton.disabled) {
      emptyOrbButton.addEventListener("click", () => actions.onPrimaryAction());
    }

    createNode(emptyOrbButton, "span", "glitter-home-stage__empty-orb-base");
    createNode(emptyOrbButton, "span", "glitter-home-stage__empty-orb-shell");
    const emptyContent = createNode(
      emptyOrbButton,
      "span",
      "glitter-home-stage__orb-core glitter-home-stage__empty-orb-content"
    );
    const emptyOrbLabelId = createPerRenderId("glitter-home-empty-orb-label");
    emptyContent.id = emptyOrbLabelId;
    emptyOrbButton.setAttribute("aria-labelledby", emptyOrbLabelId);
    createNode(emptyContent, "span", "glitter-home-stage__empty-orb-content-icon");
    createNode(emptyContent, "span", "glitter-home-stage__empty-orb-content-title", "灵感待录入");
    createNode(emptyContent, "span", "glitter-home-stage__empty-orb-content-subtitle", "点击开始首次记录");

    if (state.emptyGuide) {
      const promptPill = createNode(
        emptyLayout,
        "span",
        "glitter-home-stage__empty-prompt-pill glitter-home-stage__empty-prompt-pill--attached"
      );
      createNode(promptPill, "span", "glitter-home-stage__empty-prompt-icon");
      createNode(promptPill, "span", "glitter-home-stage__empty-prompt-text", state.emptyGuide.prompt);
    }

  } else {
    const orbStage = createNode(orbRegion, "div", "glitter-home-stage__pool-stage glitter-home-stage__orb-stage");

    if (state.banner) {
      const banner = createNode(orbStage, "div", "glitter-home-stage__conflict-banner");
      createNode(banner, "strong", undefined, state.banner.title);
      createNode(banner, "span", undefined, state.banner.description);
    }

    const renderedOrbs = state.primaryOrb ? [state.primaryOrb, ...state.poolOrbs] : state.poolOrbs;

    // populated 首页只替换底层池场渲染器；顶部、搜索、操作栏等首页外壳继续共用同一套结构。
    if (state.fieldView === "spring-rain") {
      renderHomeSpringRainStage(orbStage, renderedOrbs, actions);
    } else {
      let motionPresetIndex = 0;
      let renderedPrimaryOrbButton: HTMLButtonElement | null = null;
      const renderedSupportingOrbButtons: HTMLButtonElement[] = [];
      const orbTextStrengthById = buildOrbTextStrengthById(renderedOrbs);

      if (state.primaryOrb) {
        renderedPrimaryOrbButton = renderOrb(
          orbStage,
          state.primaryOrb,
          "glitter-home-stage__pool-orb glitter-home-stage__primary-orb",
          actions,
          motionPresetIndex,
          true,
          orbTextStrengthById.get(state.primaryOrb.id)
        );
        motionPresetIndex += 1;
      }

      state.poolOrbs.forEach((orb) => {
        const supportingOrbButton = renderOrb(
          orbStage,
          orb,
          `glitter-home-stage__pool-orb glitter-home-stage__supporting-orb glitter-home-stage__pool-orb--${orb.size}`,
          actions,
          motionPresetIndex,
          false,
          orbTextStrengthById.get(orb.id)
        );
        renderedSupportingOrbButtons.push(supportingOrbButton);
        motionPresetIndex += 1;
      });

      bindPopulatedOrbLayoutReflow(
        orbStage,
        renderedPrimaryOrbButton,
        renderedSupportingOrbButtons,
        actions.onPoolSelect,
        actions.onPoolDelete
      );
    }
  }

  if (state.mode !== "empty" && state.searchFeedback) {
    const overlay = createNode(stage, "div", "glitter-home-stage__search-feedback-overlay");
    createNode(overlay, "div", "glitter-home-stage__search-feedback-scrim");
    createNode(overlay, "div", "glitter-home-stage__search-feedback-dialog", state.searchFeedback.message);
  }

  if (state.mode !== "empty") {
    const actionBar = createNode(
      stage,
      "div",
      "glitter-home-stage__action-bar glitter-home-stage__action-bar--populated"
    );

    if (state.secondaryAction) {
      renderActionButton(
        actionBar,
        "glitter-home-stage__action-secondary",
        state.secondaryAction.label,
        state.secondaryAction.tone,
        state.secondaryAction.disabled,
        () => actions.onSecondaryAction()
      );
    }

    renderActionButton(
      actionBar,
      "glitter-home-stage__action-primary",
      state.primaryAction.label,
      state.primaryAction.tone,
      state.primaryAction.disabled,
      () => actions.onPrimaryAction()
    );
  }

  return stage;
}
