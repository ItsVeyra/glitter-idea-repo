import type { HomeViewActions } from "./home-actions";
import type { HomeStageOrb } from "./home-demo-data";
import { setOrbClickSuppressed } from "./home-orb-layout";
import { resolveHomeOrbRgb, resolveHomeOrbRingRgb } from "./home-orb-tone";
import { createNode, removeClassName, setElementCssProps, setElementStyles } from "./home-dom";

export type OrbTextStrength = {
  tier: string;
};

const ORB_TEXT_TIERS = Object.freeze(["1", "2", "3", "4", "5", "6", "7"] as const);

const PRIMARY_ORB_MOTION = Object.freeze({
  rippleDurationMultiplier: 1.08,
  breatheDurationMultiplier: 1.16,
  rippleScaleRiseMultiplier: 1.1,
  rippleScaleMidMultiplier: 1.12,
  rippleScaleEndMultiplier: 1.06,
  rippleOpacityPeakScale: 0.94,
  rippleOpacityTrailScale: 0.9
});

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(3).replace(/\.?(?:0+)$/, "")}s`;
}

function formatNumber(value: number): string {
  return value.toFixed(3).replace(/\.?(?:0+)$/, "");
}

function getOrbCountText(orb: HomeStageOrb): string {
  if (orb.countText !== undefined) {
    return orb.countText;
  }

  return orb.count !== undefined ? String(orb.count) : "";
}

export function createPerRenderId(prefix: string): string {
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

  setElementCssProps(orbButton, {
    "--glitter-home-orb-rgb": orbRgb,
    "--glitter-home-orb-ring-rgb": ringRgb
  });
}

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

  setElementCssProps(orbButton, {
    "--glitter-home-ripple-duration": formatSeconds(rippleDurationSeconds),
    "--glitter-home-ripple-delay": formatSeconds(rippleDelaySeconds),
    "--glitter-home-breathe-duration": formatSeconds(breatheDurationSeconds),
    "--glitter-home-breathe-delay": formatSeconds(breatheDelaySeconds),
    "--glitter-home-ripple-scale-rise": formatNumber(rippleScaleRise),
    "--glitter-home-ripple-scale-mid": formatNumber(rippleScaleMid),
    "--glitter-home-ripple-scale-end": formatNumber(rippleScaleEnd),
    "--glitter-home-ripple-opacity-peak": formatNumber(rippleOpacityPeak),
    "--glitter-home-ripple-opacity-trail": formatNumber(rippleOpacityTrail),
    "--glitter-home-ripple-opacity-tail": formatNumber(rippleOpacityTail)
  });
}

export function buildOrbTextStrengthById(orbs: ReadonlyArray<HomeStageOrb>): ReadonlyMap<string, OrbTextStrength> {
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

export function renderOrb(
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
  setElementStyles(orbButton, {
    left: `${orb.x}%`,
    top: `${orb.y}%`
  });
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

export function renderActionButton(
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
