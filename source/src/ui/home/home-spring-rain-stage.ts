/*
Copyright (C) 2026 ItsVeyra

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3 of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * 首页涟漪视图（内部协议名 spring-rain）舞台渲染器。
 * 负责把首页池数据渲染为前中后景的涟漪节点，并处理标题进入、主体聚焦等交互。
 */

import type { HomeViewActions } from "./home-actions";
import type { HomeStageOrb } from "./home-demo-data";
import { resolveHomeOrbRgb, resolveHomeOrbRingRgb } from "./home-orb-tone";

type SpringRainDepth = "foreground" | "midground" | "background";
type SpringRainSlotName =
  | "center"
  | "northwest"
  | "northeast"
  | "southeast"
  | "southwest"
  | "north"
  | "east"
  | "west";

type SpringRainSlot = {
  name: SpringRainSlotName;
  depth: SpringRainDepth;
  originX: string;
  originY: string;
  waveDelaySeconds: number;
  waveStepSeconds: number;
  rippleDurationSeconds: number;
};

const SPRING_RAIN_TEXT_TIERS = Object.freeze(["1", "2", "3", "4", "5", "6", "7"] as const);
const SPRING_RAIN_HOVER_EXIT_DELAY_MS = 120;

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

function getOrbCountText(orb: HomeStageOrb): string {
  if (orb.countText !== undefined) {
    return orb.countText;
  }

  return orb.count !== undefined ? String(orb.count) : "";
}

function createSpringRainPerRenderId(prefix: string): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  return `${prefix}-${randomPart}`;
}

function selectSpringRainEditableTextAtRightEdge(node: HTMLElement): void {
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

function isSpringRainRelatedTargetWithin(root: { contains?: (target: Node | null) => boolean }, target: unknown): boolean {
  if (!target) {
    return false;
  }

  if (typeof root.contains === "function" && typeof Node !== "undefined" && target instanceof Node && root.contains(target)) {
    return true;
  }

  let current = target as { parentElement?: unknown; parentNode?: unknown; parent?: unknown } | null;
  while (current) {
    if (current === root) {
      return true;
    }

    current = (current.parentElement ?? current.parentNode ?? current.parent ?? null) as
      | { parentElement?: unknown; parentNode?: unknown; parent?: unknown }
      | null;
  }

  return false;
}

// 第一圈槽位定义了中心池与环绕池的空间骨架，额外池再沿这些方向继续向外扩散。
const SPRING_RAIN_SLOTS: ReadonlyArray<Readonly<SpringRainSlot>> = Object.freeze([
  Object.freeze({
    name: "center",
    depth: "foreground",
    originX: "50%",
    originY: "82%",
    waveDelaySeconds: 0.06,
    waveStepSeconds: 0.38,
    rippleDurationSeconds: 4.96
  }),
  Object.freeze({
    name: "northwest",
    depth: "midground",
    originX: "40.5%",
    originY: "75.5%",
    waveDelaySeconds: 0.56,
    waveStepSeconds: 0.47,
    rippleDurationSeconds: 5.38
  }),
  Object.freeze({
    name: "northeast",
    depth: "midground",
    originX: "59.5%",
    originY: "76%",
    waveDelaySeconds: 1.02,
    waveStepSeconds: 0.52,
    rippleDurationSeconds: 5.64
  }),
  Object.freeze({
    name: "southeast",
    depth: "background",
    originX: "63.5%",
    originY: "88%",
    waveDelaySeconds: 1.46,
    waveStepSeconds: 0.41,
    rippleDurationSeconds: 5.12
  }),
  Object.freeze({
    name: "southwest",
    depth: "background",
    originX: "36.5%",
    originY: "89%",
    waveDelaySeconds: 1.88,
    waveStepSeconds: 0.5,
    rippleDurationSeconds: 5.48
  }),
  Object.freeze({
    name: "north",
    depth: "background",
    originX: "50%",
    originY: "68.5%",
    waveDelaySeconds: 2.34,
    waveStepSeconds: 0.39,
    rippleDurationSeconds: 4.88
  }),
  Object.freeze({
    name: "east",
    depth: "background",
    originX: "68%",
    originY: "81%",
    waveDelaySeconds: 2.76,
    waveStepSeconds: 0.55,
    rippleDurationSeconds: 5.72
  }),
  Object.freeze({
    name: "west",
    depth: "background",
    originX: "32%",
    originY: "82%",
    waveDelaySeconds: 3.18,
    waveStepSeconds: 0.45,
    rippleDurationSeconds: 5.24
  })
]);

const SPRING_RAIN_CENTER_ORIGIN_X = 50;
const SPRING_RAIN_CENTER_ORIGIN_Y = 82;
const SPRING_RAIN_SUPPORTING_RING_STEP = 11;
const SPRING_RAIN_SUPPORTING_RADIAL_JITTER = 3.8;
const SPRING_RAIN_SUPPORTING_TANGENTIAL_JITTER = 3.2;
const SPRING_RAIN_MIN_ORIGIN_X = 22;
const SPRING_RAIN_MAX_ORIGIN_X = 78;
const SPRING_RAIN_MIN_ORIGIN_Y = 59;
const SPRING_RAIN_MAX_ORIGIN_Y = 94;

function parseSpringRainPercent(value: string): number {
  return Number.parseFloat(value.trim().replace(/%$/, ""));
}

function formatSpringRainPercent(value: number): string {
  return `${Math.round(value * 1000) / 1000}%`;
}

function clampSpringRainPercent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildSpringRainStableNoise(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

// 超出首圈后的池复用基础方向，并叠加稳定噪声，避免每次渲染都出现不同的重叠结果。
function resolveSpringRainSlot(index: number, orbId: string): SpringRainSlot {
  if (index <= 0) {
    return SPRING_RAIN_SLOTS[0]!;
  }

  const supportingSlots = SPRING_RAIN_SLOTS.slice(1);
  const supportingIndex = index - 1;
  const baseSlot = supportingSlots[supportingIndex % supportingSlots.length] ?? SPRING_RAIN_SLOTS[0]!;
  const ringIndex = Math.floor(supportingIndex / supportingSlots.length);
  const baseOriginX = parseSpringRainPercent(baseSlot.originX);
  const baseOriginY = parseSpringRainPercent(baseSlot.originY);
  const vectorX = baseOriginX - SPRING_RAIN_CENTER_ORIGIN_X;
  const vectorY = baseOriginY - SPRING_RAIN_CENTER_ORIGIN_Y;
  const baseDistance = Math.hypot(vectorX, vectorY);

  if (baseDistance === 0) {
    return baseSlot;
  }

  const outwardUnitX = vectorX / baseDistance;
  const outwardUnitY = vectorY / baseDistance;
  const tangentUnitX = -outwardUnitY;
  const tangentUnitY = outwardUnitX;
  const noiseSeed = `${orbId}:${index}:${ringIndex}:${baseSlot.name}`;
  const tangentialNoise = buildSpringRainStableNoise(`${noiseSeed}:tangent`) - 0.5;
  const radialNoise = buildSpringRainStableNoise(`${noiseSeed}:radial`);
  const radialOffset = ringIndex * SPRING_RAIN_SUPPORTING_RING_STEP + 1.2 + radialNoise * SPRING_RAIN_SUPPORTING_RADIAL_JITTER;
  const tangentialOffset = tangentialNoise * SPRING_RAIN_SUPPORTING_TANGENTIAL_JITTER;
  const nextOriginX = clampSpringRainPercent(
    SPRING_RAIN_CENTER_ORIGIN_X + outwardUnitX * (baseDistance + radialOffset) + tangentUnitX * tangentialOffset,
    SPRING_RAIN_MIN_ORIGIN_X,
    SPRING_RAIN_MAX_ORIGIN_X
  );
  const nextOriginY = clampSpringRainPercent(
    SPRING_RAIN_CENTER_ORIGIN_Y + outwardUnitY * (baseDistance + radialOffset) + tangentUnitY * tangentialOffset,
    SPRING_RAIN_MIN_ORIGIN_Y,
    SPRING_RAIN_MAX_ORIGIN_Y
  );

  return {
    ...baseSlot,
    originX: formatSpringRainPercent(nextOriginX),
    originY: formatSpringRainPercent(nextOriginY),
    waveDelaySeconds: baseSlot.waveDelaySeconds + ringIndex * 0.34,
    waveStepSeconds: baseSlot.waveStepSeconds + ringIndex * 0.03,
    rippleDurationSeconds: baseSlot.rippleDurationSeconds + ringIndex * 0.22
  };
}

function buildSpringRainTextTierById(orbs: ReadonlyArray<HomeStageOrb>): ReadonlyMap<string, string> {
  if (orbs.length === 0) {
    return new Map();
  }

  const counts = orbs.map((orb) => orb.count ?? 0);
  const distinctCountsDescending = Array.from(new Set(counts)).sort((left, right) => right - left);
  const strongestTierIndex = SPRING_RAIN_TEXT_TIERS.length - 1;
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
      return [orb.id, SPRING_RAIN_TEXT_TIERS[tierIndex] ?? SPRING_RAIN_TEXT_TIERS[0]];
    })
  );
}

function setFocusedPool(activePool: HTMLElement, pools: HTMLElement[]): void {
  pools.forEach((pool) => {
    if (pool === activePool) {
      addClassName(pool, "glitter-home-stage__spring-rain-pool--focused");
      removeClassName(pool, "glitter-home-stage__spring-rain-pool--muted");
      return;
    }

    removeClassName(pool, "glitter-home-stage__spring-rain-pool--focused");
    addClassName(pool, "glitter-home-stage__spring-rain-pool--muted");
  });
}

function clearFocusedPools(pools: HTMLElement[]): void {
  pools.forEach((pool) => {
    removeClassName(pool, "glitter-home-stage__spring-rain-pool--focused");
    removeClassName(pool, "glitter-home-stage__spring-rain-pool--muted");
  });
}

function applySpringRainColorVariables(pool: HTMLElement, orb: HomeStageOrb): void {
  const orbRgb = resolveHomeOrbRgb(orb.color);
  const ringRgb = resolveHomeOrbRingRgb(orb.color);

  if (orbRgb) {
    pool.style.setProperty("--glitter-home-orb-rgb", orbRgb);
  }

  if (ringRgb) {
    pool.style.setProperty("--glitter-home-orb-ring-rgb", ringRgb);
  }
}

export function renderHomeSpringRainStage(
  stage: HTMLElement,
  orbs: ReadonlyArray<HomeStageOrb>,
  actions: HomeViewActions
): void {
  addClassName(stage, "glitter-home-stage__pool-stage--spring-rain");

  const renderedPools: HTMLElement[] = [];
  const textTierById = buildSpringRainTextTierById(orbs);
  // hover 退出留一小段缓冲时间，给标题/涟漪到右侧操作按钮的鼠标移动留出过渡。
  let focusedPoolExitTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;
  const clearFocusedPoolExitTimer = (): void => {
    if (focusedPoolExitTimerId === null) {
      return;
    }

    globalThis.clearTimeout(focusedPoolExitTimerId);
    focusedPoolExitTimerId = null;
  };
  const showFocusedPoolPreview = (activePool: HTMLElement): void => {
    clearFocusedPoolExitTimer();
    setFocusedPool(activePool, renderedPools);
  };
  const scheduleClearFocusedPoolPreview = (): void => {
    clearFocusedPoolExitTimer();
    focusedPoolExitTimerId = globalThis.setTimeout(() => {
      focusedPoolExitTimerId = null;
      clearFocusedPools(renderedPools);
    }, SPRING_RAIN_HOVER_EXIT_DELAY_MS);
  };

  orbs.forEach((orb, index) => {
    const springRainSlot = resolveSpringRainSlot(index, orb.id);
    const pool = createNode(
      stage,
      "div",
      `glitter-home-stage__spring-rain-pool glitter-home-stage__spring-rain-pool--${springRainSlot.depth} glitter-home-stage__spring-rain-pool--slot-${springRainSlot.name}`
    );
    pool.dataset.poolId = orb.id;
    pool.dataset.orbTone = orb.tone;
    pool.dataset.orbKind = orb.kind;
    pool.dataset.poolIsDefault = orb.isDefault ? "true" : "false";
    pool.dataset.springRainSlot = springRainSlot.name;
    pool.dataset.springRainSize = orb.size;
    pool.dataset.textTier = textTierById.get(orb.id) ?? SPRING_RAIN_TEXT_TIERS[0];
    pool.style.setProperty("--glitter-home-spring-rain-origin-x", springRainSlot.originX);
    pool.style.setProperty("--glitter-home-spring-rain-origin-y", springRainSlot.originY);
    pool.style.setProperty("--glitter-home-spring-rain-wave-delay", `${springRainSlot.waveDelaySeconds}s`);
    pool.style.setProperty("--glitter-home-spring-rain-wave-step", `${springRainSlot.waveStepSeconds}s`);
    pool.style.setProperty("--glitter-home-spring-rain-ripple-duration", `${springRainSlot.rippleDurationSeconds}s`);
    applySpringRainColorVariables(pool, orb);
    renderedPools.push(pool);

    const titleColumn = createNode(pool, "div", "glitter-home-stage__spring-rain-title-column");
    const titleShell = createNode(titleColumn, "span", "glitter-home-stage__spring-rain-title-shell");
    const titleShellId = createSpringRainPerRenderId("glitter-home-spring-rain-title");
    titleShell.id = titleShellId;
    titleShell.setAttribute("id", titleShellId);
    let currentTitle = orb.label;
    const title = createNode(titleShell, "span", "glitter-home-stage__spring-rain-title", currentTitle);
    createNode(titleShell, "span", "glitter-home-stage__spring-rain-count", getOrbCountText(orb));

    const isTitleEditing = (): boolean => title.getAttribute("contenteditable") === "true";
    const clearFocusedPoolPreview = (event?: { relatedTarget?: unknown }): void => {
      if (isTitleEditing() || isSpringRainRelatedTargetWithin(pool, event?.relatedTarget)) {
        clearFocusedPoolExitTimer();
        return;
      }

      scheduleClearFocusedPoolPreview();
    };
    const commitTitle = (): void => {
      if (!isTitleEditing()) {
        return;
      }

      const nextTitle = (title.textContent ?? "").trim();
      const finalTitle = nextTitle || currentTitle;
      title.textContent = finalTitle;
      title.setAttribute("contenteditable", "false");
      delete pool.dataset.inlineRenameActive;
      removeClassName(titleColumn, "glitter-home-stage__spring-rain-title-column--editing");

      if (!nextTitle || nextTitle === currentTitle) {
        return;
      }

      currentTitle = nextTitle;
      actions.onPoolRename?.(orb.id, nextTitle);
    };
    const startTitleInlineEdit = (): void => {
      if (orb.isDefault || isTitleEditing()) {
        return;
      }

      pool.dataset.inlineRenameActive = "true";
      addClassName(titleColumn, "glitter-home-stage__spring-rain-title-column--editing");
      title.setAttribute("contenteditable", "true");
      title.focus?.();
      selectSpringRainEditableTextAtRightEdge(title);
      showFocusedPoolPreview(pool);
    };

    title.addEventListener("click", (event) => {
      if (isTitleEditing()) {
        event.stopPropagation();
      }
    });
    title.addEventListener("pointerdown", (event) => {
      if (isTitleEditing()) {
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

    const titleHitArea = createNode(
      titleColumn,
      "button",
      "glitter-home-stage__spring-rain-title-hit-area"
    ) as HTMLButtonElement;
    titleHitArea.type = "button";
    titleHitArea.setAttribute("aria-labelledby", titleShellId);
    titleHitArea.addEventListener("focus", () => {
      showFocusedPoolPreview(pool);
    });
    titleHitArea.addEventListener("blur", (event) => {
      if (isSpringRainRelatedTargetWithin(pool, (event as { relatedTarget?: unknown } | undefined)?.relatedTarget)) {
        return;
      }

      clearFocusedPoolExitTimer();
      clearFocusedPools(renderedPools);
    });
    titleHitArea.addEventListener("pointerenter", () => {
      showFocusedPoolPreview(pool);
    });
    titleHitArea.addEventListener("pointerleave", (event) => {
      clearFocusedPoolPreview(event as { relatedTarget?: unknown });
    });
    titleHitArea.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isTitleEditing()) {
        return;
      }

      (actions.onPoolTitleSelect ?? actions.onPoolSelect)(orb.id);
    });

    const titleActions = createNode(
      titleColumn,
      "div",
      "glitter-home-stage__spring-rain-actions"
    ) as HTMLDivElement;
    const createActionButton = (
      className: string,
      icon: "edit" | "delete" | "enter",
      label: string,
      onClick?: () => void
    ): HTMLButtonElement => {
      const button = createNode(titleActions, "button", className) as HTMLButtonElement;
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

    createActionButton(
      "glitter-home-stage__pool-orb-action glitter-home-stage__pool-orb-action--edit",
      "edit",
      "编辑池",
      orb.isDefault ? undefined : startTitleInlineEdit
    );
    createActionButton(
      "glitter-home-stage__pool-orb-action glitter-home-stage__pool-orb-action--delete",
      "delete",
      "删除池",
      !orb.isDefault && actions.onPoolDelete ? () => actions.onPoolDelete?.(orb.id) : undefined
    );
    createActionButton(
      "glitter-home-stage__pool-orb-action glitter-home-stage__pool-orb-action--enter",
      "enter",
      "进入池",
      () => (actions.onPoolTitleSelect ?? actions.onPoolSelect)(orb.id)
    );
    titleActions.addEventListener("pointerenter", () => {
      showFocusedPoolPreview(pool);
    });
    titleActions.addEventListener("pointerleave", (event) => {
      clearFocusedPoolPreview(event as { relatedTarget?: unknown });
    });

    const actionCorridor = createNode(pool, "div", "glitter-home-stage__spring-rain-action-corridor");
    actionCorridor.setAttribute("aria-hidden", "true");
    actionCorridor.addEventListener("pointerenter", () => {
      showFocusedPoolPreview(pool);
    });
    actionCorridor.addEventListener("pointerleave", (event) => {
      clearFocusedPoolPreview(event as { relatedTarget?: unknown });
    });

    createNode(pool, "span", "glitter-home-stage__spring-rain-connector");

    const body = createNode(pool, "div", "glitter-home-stage__spring-rain-body");
    body.setAttribute("aria-hidden", "true");
    body.addEventListener("pointerenter", () => {
      showFocusedPoolPreview(pool);
    });
    body.addEventListener("pointerleave", (event) => {
      clearFocusedPoolPreview(event as { relatedTarget?: unknown });
    });
    body.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    createNode(body, "span", "glitter-home-stage__spring-rain-body-plane");
    const rippleLayer = createNode(body, "span", "glitter-home-stage__spring-rain-body-ripple-layer");
    rippleLayer.addEventListener("pointerenter", () => {
      showFocusedPoolPreview(pool);
    });
    rippleLayer.addEventListener("pointerleave", (event) => {
      clearFocusedPoolPreview(event as { relatedTarget?: unknown });
    });
    createNode(rippleLayer, "span", "glitter-home-stage__spring-rain-body-ripple glitter-home-stage__spring-rain-body-ripple--near");
    createNode(rippleLayer, "span", "glitter-home-stage__spring-rain-body-ripple glitter-home-stage__spring-rain-body-ripple--mid");
    createNode(rippleLayer, "span", "glitter-home-stage__spring-rain-body-ripple glitter-home-stage__spring-rain-body-ripple--far");
    createNode(rippleLayer, "span", "glitter-home-stage__spring-rain-body-ripple glitter-home-stage__spring-rain-body-ripple--outer");
  });
}
