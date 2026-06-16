import type { PoolRoamBoundaryAnchorState } from "./pool-state";

type RoamBridgePoint = {
  x: number;
  y: number;
};

type RoamBridgeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type RoamBridgeSegment = {
  axis: "horizontal" | "vertical";
  left: number;
  top: number;
  width: number;
  height: number;
};

type RoamBridgeLayout = {
  traceLeft: number;
  traceTop: number;
  traceWidth: number;
  traceHeight: number;
  markerX: number;
  markerY: number;
  popoverX: number;
  popoverY: number;
  segments: RoamBridgeSegment[];
};
function isRoamBridgeSourceHandleVisibleInCardGrid(sourceHandleRect: DOMRect, cardGridRect: DOMRect | null): boolean {
  if (!cardGridRect || cardGridRect.width <= 0 || cardGridRect.height <= 0) {
    return true;
  }

  return (
    sourceHandleRect.bottom > cardGridRect.top
    && sourceHandleRect.top < cardGridRect.bottom
    && sourceHandleRect.right > cardGridRect.left
    && sourceHandleRect.left < cardGridRect.right
  );
}

function buildMarkerOnlyRoamBridgeLayout(
  workbenchRect: DOMRect,
  cardGridRect: DOMRect | null,
  sourceHandleRect: DOMRect,
  seamX: number
): RoamBridgeLayout {
  // 分隔线连接点需要贴着边界线中心，同时限制在当前卡片区可见范围内，避免看起来掉到边界线下面。
  const markerPadding = 12;
  const minVisibleY = clampRoamBridgeValue(
    (cardGridRect?.top ?? workbenchRect.top) - workbenchRect.top + markerPadding,
    markerPadding,
    Math.max(markerPadding, workbenchRect.height - markerPadding)
  );
  const maxVisibleY = clampRoamBridgeValue(
    (cardGridRect?.bottom ?? workbenchRect.bottom) - workbenchRect.top - markerPadding,
    minVisibleY,
    Math.max(markerPadding, workbenchRect.height - markerPadding)
  );
  const markerAbsoluteY = clampRoamBridgeValue(
    sourceHandleRect.top - workbenchRect.top + sourceHandleRect.height / 2,
    minVisibleY,
    maxVisibleY
  );
  const traceLeft = Math.max(0, seamX - markerPadding);
  const traceTop = Math.max(0, markerAbsoluteY - markerPadding);

  return {
    traceLeft,
    traceTop,
    traceWidth: markerPadding * 2,
    traceHeight: markerPadding * 2,
    markerX: seamX - traceLeft,
    markerY: markerAbsoluteY - traceTop,
    popoverX: seamX - traceLeft - 18,
    popoverY: markerAbsoluteY - traceTop,
    segments: []
  };
}

function buildDetachedMarkerOnlyRoamBridgeLayout(
  workbench: HTMLElement,
  anchorIndex: number,
  anchorCount: number
): RoamBridgeLayout | null {
  const roamPane = workbench.querySelector(".glitter-pool-stage__workbench-pane--roam") as HTMLElement | null;
  if (!roamPane) {
    return null;
  }

  const cardGrid = workbench.querySelector(".glitter-pool-stage__card-grid") as HTMLElement | null;
  const workbenchRect = workbench.getBoundingClientRect();
  const cardGridRect = cardGrid?.getBoundingClientRect() ?? null;
  const roamPaneRect = roamPane.getBoundingClientRect();
  const seamX = Math.max(0, roamPaneRect.left - workbenchRect.left);
  const markerPadding = 12;
  const lanePadding = 32;
  const minVisibleY = clampRoamBridgeValue(
    (cardGridRect?.top ?? workbenchRect.top) - workbenchRect.top + lanePadding,
    markerPadding,
    Math.max(markerPadding, workbenchRect.height - markerPadding)
  );
  const maxVisibleY = clampRoamBridgeValue(
    (cardGridRect?.bottom ?? workbenchRect.bottom) - workbenchRect.top - lanePadding,
    minVisibleY,
    Math.max(markerPadding, workbenchRect.height - markerPadding)
  );
  const normalizedIndex = anchorCount <= 1 ? 0.5 : (anchorIndex + 1) / (anchorCount + 1);
  const markerAbsoluteY = clampRoamBridgeValue(
    minVisibleY + (maxVisibleY - minVisibleY) * normalizedIndex,
    minVisibleY,
    maxVisibleY
  );
  const traceLeft = Math.max(0, seamX - markerPadding);
  const traceTop = Math.max(0, markerAbsoluteY - markerPadding);

  return {
    traceLeft,
    traceTop,
    traceWidth: markerPadding * 2,
    traceHeight: markerPadding * 2,
    markerX: seamX - traceLeft,
    markerY: markerAbsoluteY - traceTop,
    popoverX: seamX - traceLeft - 18,
    popoverY: markerAbsoluteY - traceTop,
    segments: []
  };
}

function isRoamBridgePointInsideRect(point: RoamBridgePoint, rect: RoamBridgeRect): boolean {
  return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

function doesRoamBridgeHorizontalSegmentIntersectRect(y: number, startX: number, endX: number, rect: RoamBridgeRect): boolean {
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  return y > rect.top && y < rect.bottom && right > rect.left && left < rect.right;
}

function doesRoamBridgeVerticalSegmentIntersectRect(x: number, startY: number, endY: number, rect: RoamBridgeRect): boolean {
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  return x > rect.left && x < rect.right && bottom > rect.top && top < rect.bottom;
}

function isRoamBridgeSegmentClear(start: RoamBridgePoint, end: RoamBridgePoint, obstacles: RoamBridgeRect[]): boolean {
  if (start.x === end.x) {
    return obstacles.every((rect) => !doesRoamBridgeVerticalSegmentIntersectRect(start.x, start.y, end.y, rect));
  }

  if (start.y === end.y) {
    return obstacles.every((rect) => !doesRoamBridgeHorizontalSegmentIntersectRect(start.y, start.x, end.x, rect));
  }

  return false;
}

function clampRoamBridgeValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function collectRoamBridgeObstacleRects(
  workbench: HTMLElement,
  workbenchRect: DOMRect,
  sourceIdeaId: string
): RoamBridgeRect[] {
  const obstaclePadding = 12;
  const cardShells = Array.from(workbench.querySelectorAll(".glitter-pool-stage__card-shell")) as HTMLElement[];

  return cardShells
    .filter((cardShell) => (cardShell.dataset.ideaId ?? "") !== sourceIdeaId)
    .map((cardShell) => {
      const rect = cardShell.getBoundingClientRect();
      return {
        left: rect.left - workbenchRect.left - obstaclePadding,
        top: rect.top - workbenchRect.top - obstaclePadding,
        right: rect.right - workbenchRect.left + obstaclePadding,
        bottom: rect.bottom - workbenchRect.top + obstaclePadding
      };
    })
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
}

function buildRoamBridgePath(start: RoamBridgePoint, seamX: number, workbenchHeight: number, obstacles: RoamBridgeRect[]): RoamBridgePoint[] {
  const routePadding = 12;
  const maxY = Math.max(routePadding, workbenchHeight - routePadding);
  const candidateXValues = new Set<number>([start.x, seamX]);
  const candidateYValues = new Set<number>([clampRoamBridgeValue(start.y, routePadding, maxY)]);

  obstacles.forEach((rect) => {
    candidateXValues.add(rect.left);
    candidateXValues.add(rect.right);
    candidateYValues.add(clampRoamBridgeValue(rect.top, routePadding, maxY));
    candidateYValues.add(clampRoamBridgeValue(rect.bottom, routePadding, maxY));
  });

  candidateYValues.add(routePadding);
  candidateYValues.add(maxY);

  const candidateX = Array.from(candidateXValues).sort((left, right) => left - right);
  const candidateY = Array.from(candidateYValues).sort((top, bottom) => top - bottom);
  const points: RoamBridgePoint[] = [];
  const pointIndexByKey = new Map<string, number>();
  const registerPoint = (point: RoamBridgePoint): number => {
    const key = `${point.x}:${point.y}`;
    const existingIndex = pointIndexByKey.get(key);
    if (existingIndex !== undefined) {
      return existingIndex;
    }

    const nextIndex = points.length;
    points.push(point);
    pointIndexByKey.set(key, nextIndex);
    return nextIndex;
  };

  candidateX.forEach((x) => {
    candidateY.forEach((y) => {
      const point = { x, y };
      if (obstacles.some((rect) => isRoamBridgePointInsideRect(point, rect))) {
        return;
      }
      registerPoint(point);
    });
  });

  const startIndex = registerPoint(start);
  const edges = new Map<number, Array<{ to: number; cost: number }>>();
  const pushEdge = (from: number, to: number): void => {
    const fromPoint = points[from];
    const toPoint = points[to];
    if (!fromPoint || !toPoint || !isRoamBridgeSegmentClear(fromPoint, toPoint, obstacles)) {
      return;
    }

    const cost = Math.abs(fromPoint.x - toPoint.x) + Math.abs(fromPoint.y - toPoint.y);
    const outgoing = edges.get(from) ?? [];
    outgoing.push({ to, cost });
    edges.set(from, outgoing);
  };

  const pointsByY = new Map<number, number[]>();
  const pointsByX = new Map<number, number[]>();
  points.forEach((point, index) => {
    const sameY = pointsByY.get(point.y) ?? [];
    sameY.push(index);
    pointsByY.set(point.y, sameY);

    const sameX = pointsByX.get(point.x) ?? [];
    sameX.push(index);
    pointsByX.set(point.x, sameX);
  });

  pointsByY.forEach((indices) => {
    indices.sort((left, right) => points[left]!.x - points[right]!.x);
    for (let index = 1; index < indices.length; index += 1) {
      const previous = indices[index - 1]!;
      const current = indices[index]!;
      pushEdge(previous, current);
      pushEdge(current, previous);
    }
  });

  pointsByX.forEach((indices) => {
    indices.sort((left, right) => points[left]!.y - points[right]!.y);
    for (let index = 1; index < indices.length; index += 1) {
      const previous = indices[index - 1]!;
      const current = indices[index]!;
      pushEdge(previous, current);
      pushEdge(current, previous);
    }
  });

  const distances = new Array<number>(points.length).fill(Number.POSITIVE_INFINITY);
  const previous = new Array<number>(points.length).fill(-1);
  const visited = new Set<number>();
  distances[startIndex] = 0;

  while (visited.size < points.length) {
    let currentIndex = -1;
    let currentDistance = Number.POSITIVE_INFINITY;

    distances.forEach((distance, index) => {
      if (visited.has(index) || distance >= currentDistance) {
        return;
      }
      currentIndex = index;
      currentDistance = distance;
    });

    if (currentIndex < 0) {
      break;
    }

    visited.add(currentIndex);
    const outgoing = edges.get(currentIndex) ?? [];
    outgoing.forEach(({ to, cost }) => {
      if (visited.has(to)) {
        return;
      }
      const nextDistance = currentDistance + cost;
      if (nextDistance < distances[to]!) {
        distances[to] = nextDistance;
        previous[to] = currentIndex;
      }
    });
  }

  const seamPointIndices = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.x === seamX)
    .sort((left, right) => {
      const leftDistance = distances[left.index] ?? Number.POSITIVE_INFINITY;
      const rightDistance = distances[right.index] ?? Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return Math.abs(left.point.y - start.y) - Math.abs(right.point.y - start.y);
    });

  const bestSeamPoint = seamPointIndices.find(({ index }) => Number.isFinite(distances[index] ?? Number.POSITIVE_INFINITY));
  if (!bestSeamPoint) {
    return [start, { x: seamX, y: start.y }];
  }

  const path: RoamBridgePoint[] = [];
  let cursor = bestSeamPoint.index;
  while (cursor >= 0) {
    path.push(points[cursor]!);
    cursor = previous[cursor] ?? -1;
  }

  return simplifyRoamBridgePath(path.reverse());
}

function simplifyRoamBridgePath(path: RoamBridgePoint[]): RoamBridgePoint[] {
  if (path.length <= 2) {
    return path;
  }

  const simplified: RoamBridgePoint[] = [path[0]!];
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1]!;
    const current = path[index]!;
    const next = path[index + 1]!;
    const sharesVerticalAxis = previous.x === current.x && current.x === next.x;
    const sharesHorizontalAxis = previous.y === current.y && current.y === next.y;

    if (sharesVerticalAxis || sharesHorizontalAxis) {
      continue;
    }

    simplified.push(current);
  }

  simplified.push(path[path.length - 1]!);
  return simplified;
}

function buildRoamBridgeSegments(path: RoamBridgePoint[], traceLeft: number, traceTop: number): RoamBridgeSegment[] {
  const segments: RoamBridgeSegment[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1]!;
    const current = path[index]!;

    if (previous.x === current.x) {
      segments.push({
        axis: "vertical",
        left: previous.x - traceLeft - 1,
        top: Math.min(previous.y, current.y) - traceTop,
        width: 2,
        height: Math.max(2, Math.abs(current.y - previous.y))
      });
      continue;
    }

    segments.push({
      axis: "horizontal",
      left: Math.min(previous.x, current.x) - traceLeft,
      top: previous.y - traceTop - 1,
      width: Math.max(2, Math.abs(current.x - previous.x)),
      height: 2
    });
  }

  return segments;
}

export function resolveRoamBridgeLayout(
  workbench: HTMLElement,
  anchor: PoolRoamBoundaryAnchorState,
  anchorIndex: number,
  anchorCount: number
): RoamBridgeLayout | null {
  const sourceHandle = workbench.querySelector(
    `[data-glitter-pool-roam-source-handle="${anchor.ideaId}"]`
  ) as HTMLElement | null;

  if (!sourceHandle) {
    return buildDetachedMarkerOnlyRoamBridgeLayout(workbench, anchorIndex, anchorCount);
  }

  const cardGrid = workbench.querySelector(".glitter-pool-stage__card-grid") as HTMLElement | null;
  const roamPane = workbench.querySelector(".glitter-pool-stage__workbench-pane--roam") as HTMLElement | null;

  if (!roamPane) {
    return null;
  }

  const workbenchRect = workbench.getBoundingClientRect();
  const sourceHandleRect = sourceHandle.getBoundingClientRect();
  const cardGridRect = cardGrid?.getBoundingClientRect() ?? null;
  const roamPaneRect = roamPane.getBoundingClientRect();
  const seamX = Math.max(0, roamPaneRect.left - workbenchRect.left);

  if (!isRoamBridgeSourceHandleVisibleInCardGrid(sourceHandleRect, cardGridRect as DOMRect | null)) {
    return buildMarkerOnlyRoamBridgeLayout(workbenchRect as DOMRect, cardGridRect as DOMRect | null, sourceHandleRect as DOMRect, seamX);
  }

  const start = {
    x: Math.max(0, sourceHandleRect.left - workbenchRect.left + sourceHandleRect.width / 2),
    y: Math.max(0, sourceHandleRect.top - workbenchRect.top + sourceHandleRect.height / 2)
  };
  const path = buildRoamBridgePath(
    start,
    Math.max(start.x + 24, seamX),
    workbenchRect.height,
    collectRoamBridgeObstacleRects(workbench, workbenchRect as DOMRect, anchor.ideaId)
  );
  const xs = path.map((point) => point.x);
  const ys = path.map((point) => point.y);
  const routePadding = 12;
  const traceLeft = Math.max(0, Math.min(...xs) - routePadding);
  const traceTop = Math.max(0, Math.min(...ys) - routePadding);
  const traceWidth = Math.max(24, Math.max(...xs) - traceLeft + routePadding);
  const traceHeight = Math.max(24, Math.max(...ys) - traceTop + routePadding);
  const endPoint = path[path.length - 1] ?? start;

  return {
    traceLeft,
    traceTop,
    traceWidth,
    traceHeight,
    markerX: endPoint.x - traceLeft,
    markerY: endPoint.y - traceTop,
    popoverX: endPoint.x - traceLeft - 18,
    popoverY: endPoint.y - traceTop,
    segments: buildRoamBridgeSegments(path, traceLeft, traceTop)
  };
}
