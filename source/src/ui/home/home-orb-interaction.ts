import type { HomePoolActionLabels } from "./home-state";
import { addClassName, createNode, removeClassName, setElementStyles, startOrbTitleInlineEdit } from "./home-dom";
import {
  applyOrbCenterPosition,
  applyOrbShiftStyles,
  clampOrbCenterToStage,
  clearOrbShiftStyles,
  getOrbInteractionInfluenceRadius,
  getPopulatedHomeStageInteractionSize,
  setOrbClickSuppressed,
  type ResolvedOrbLayout
} from "./home-orb-layout";

const HOME_ORB_STIR_DRAG_THRESHOLD = 8;
const HOME_ORB_STIR_SUPPORT_FLOW_SCALE = 0.18;
const HOME_ORB_STIR_SUPPORT_RADIAL_SCALE = 0.06;
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

export type HomeOrbInteractionController = {
  applyLayout: (layout: ResolvedOrbLayout) => void;
  destroy: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createHomeOrbInteractionController(
  orbStage: HTMLElement,
  primaryOrbButton: HTMLButtonElement | null,
  supportingOrbButtons: HTMLButtonElement[],
  onPoolEnter: (poolId: string) => void,
  actionLabels: HomePoolActionLabels,
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

    setElementStyles(actionCorridor, {
      left: `${corridorLeft}px`,
      top: `${corridorTop}px`,
      width: `${Math.max(0, corridorRight - corridorLeft)}px`,
      height: `${corridorHeight}px`
    });
  };

  const positionActionRail = (): void => {
    if (!actionRail) {
      return;
    }

    const railPosition = getActionRailPosition();
    if (!railPosition) {
      return;
    }

    setElementStyles(actionRail, {
      left: `${railPosition.left}px`,
      top: `${railPosition.top}px`
    });
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
      actionLabels.edit,
      onEdit
    );
    createActionButton(
      "glitter-home-stage__pool-orb-action glitter-home-stage__pool-orb-action--delete",
      "delete",
      actionLabels.delete,
      onDelete
    );
    createActionButton(
      "glitter-home-stage__pool-orb-action glitter-home-stage__pool-orb-action--enter",
      "enter",
      actionLabels.enter,
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
