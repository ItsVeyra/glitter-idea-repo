import type { HomeStageOrb } from "./home-demo-data";
import { setElementCssProps, setElementStyles } from "./home-dom";

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
export const HOME_ORB_RESIZE_OBSERVER_KEY = "__glitterHomeOrbResizeObserver";
export const HOME_ORB_INTERACTION_CONTROLLER_KEY = "__glitterHomeOrbInteractionController";
const HOME_ORB_STIR_INFLUENCE_RADIUS_MULTIPLIER = 3.8;
const HOME_DASHED_CORE_RING_STROKE_WIDTH = 2;
const HOME_DASHED_CORE_RING_DASH_LENGTH = 1;
const HOME_DASHED_CORE_RING_GAP_LENGTH = 7;

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

type OrbPlacement = { x: number; y: number; radius: number };
export type ResolvedOrbLayout = {
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

type LayoutInputStageSize = { width: number; height: number };

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

function getPopulatedHomeStageLayoutInputSize(orbStage: HTMLElement): LayoutInputStageSize {
  return getExplicitElementStyleSize(orbStage) ?? {
    width: HOME_ORB_LAYOUT_DEFAULT_STAGE.width,
    height: HOME_ORB_LAYOUT_DEFAULT_STAGE.height
  };
}

export function getPopulatedHomeStageInteractionSize(orbStage: HTMLElement): LayoutInputStageSize {
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

export function disconnectPopulatedOrbLayoutObservers(root: HTMLElement): void {
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

function updateOrbBackdropSample(orbButton: HTMLButtonElement): void {
  const centerX = parsePixelLength(orbButton.style.left);
  const centerY = parsePixelLength(orbButton.style.top);
  const diameter = parsePixelLength(orbButton.style.width);
  const shellInset = parsePixelLength(orbButton.style.getPropertyValue("--glitter-home-orb-shell-inset")) ?? 0;
  const shiftX = parsePixelLength(orbButton.style.getPropertyValue("--glitter-home-orb-shift-x")) ?? 0;
  const shiftY = parsePixelLength(orbButton.style.getPropertyValue("--glitter-home-orb-shift-y")) ?? 0;

  if (centerX === null || centerY === null || diameter === null) {
    setElementCssProps(orbButton, {
      "--glitter-home-stage-sample-x": "0px",
      "--glitter-home-stage-sample-y": "0px"
    });
    return;
  }

  const sampleX = centerX - diameter / 2 + shiftX + shellInset;
  const sampleY = centerY - diameter / 2 + shiftY + shellInset;
  setElementCssProps(orbButton, {
    "--glitter-home-stage-sample-x": `${sampleX.toFixed(3)}px`,
    "--glitter-home-stage-sample-y": `${sampleY.toFixed(3)}px`
  });
}

export function applyOrbCenterPosition(orbButton: HTMLButtonElement, centerX: number, centerY: number): void {
  setElementStyles(orbButton, {
    left: `${centerX}px`,
    top: `${centerY}px`
  });
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

  setElementStyles(orbButton, {
    width: `${diameter}px`,
    height: `${diameter}px`
  });
  setElementCssProps(orbButton, {
    "--glitter-home-orb-shell-inset": `${metrics.shellInset}px`,
    "--glitter-home-orb-text-padding": `${metrics.textPadding}px`,
    "--glitter-home-orb-text-gap": `${metrics.textGap}px`,
    "--glitter-home-orb-name-font-size": `${metrics.nameFontSize}px`,
    "--glitter-home-orb-name-line-height": `${metrics.nameLineHeight}`,
    "--glitter-home-orb-count-font-size": `${metrics.countFontSize}px`,
    "--glitter-home-orb-count-line-height": `${metrics.countLineHeight}`
  });

  const dashedShell = orbButton.querySelector(".glitter-home-stage__water-surface--dashed") as HTMLElement | null;
  if (dashedShell) {
    setElementCssProps(dashedShell, {
      "--glitter-home-dashed-ring-mask-image": buildDashedCoreRingMaskImage(shellDiameter)
    });
  }

  void scale;
  updateOrbBackdropSample(orbButton);
}

export function applyOrbShiftStyles(orbButton: HTMLButtonElement, shiftX: number, shiftY: number): void {
  setElementCssProps(orbButton, {
    "--glitter-home-orb-shift-x": `${shiftX.toFixed(3)}px`,
    "--glitter-home-orb-shift-y": `${shiftY.toFixed(3)}px`
  });
  updateOrbBackdropSample(orbButton);
}

export function clearOrbShiftStyles(orbButton: HTMLButtonElement): void {
  applyOrbShiftStyles(orbButton, 0, 0);
}

export function setOrbClickSuppressed(orbButton: HTMLButtonElement, suppressed: boolean): void {
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

export function solvePopulatedOrbLayout(
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

  setElementStyles(orbStage, {
    minHeight: `${effectiveInteractionHeight}px`
  });
  setElementCssProps(orbStage, {
    "--glitter-home-derived-stage-width": `${interactionStageSize.width}px`,
    "--glitter-home-derived-stage-height": `${effectiveInteractionHeight}px`
  });

  if (primaryOrbButton) {
    const primaryPlacement = anchoredResolved.placements.get(primaryOrbButton);
    if (primaryPlacement) {
      applyOrbLayoutSize(primaryOrbButton, primaryPlacement.radius, anchoredResolved.scale, true);
      setElementStyles(primaryOrbButton, {
        opacity: "1",
        pointerEvents: "auto"
      });
      applyOrbCenterPosition(primaryOrbButton, primaryPlacement.x, primaryPlacement.y);
    }
  }

  supportingOrbButtons.forEach((orbButton) => {
    const placement = anchoredResolved.placements.get(orbButton);
    if (!placement) {
      return;
    }

    applyOrbLayoutSize(orbButton, placement.radius, anchoredResolved.scale, false);
    setElementStyles(orbButton, {
      opacity: "1",
      pointerEvents: "auto"
    });
    applyOrbCenterPosition(orbButton, placement.x, placement.y);
  });

  return anchoredResolved;
}

export function clampOrbCenterToStage(
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

export function getOrbInteractionInfluenceRadius(sourceRadius: number, targetRadius: number): number {
  return Math.max(sourceRadius, targetRadius) * HOME_ORB_STIR_INFLUENCE_RADIUS_MULTIPLIER;
}
