import type { PoolRoamBoundaryAnchorState } from "../ui/pool/pool-state";

export type SessionBoundaryAnchor = Omit<PoolRoamBoundaryAnchorState, "visibleBridge">;

type SessionBoundarySourceMeta = Omit<SessionBoundaryAnchor, "anchorId">;

type SessionBoundaryCanvas = {
  nodes: Array<{
    id?: unknown;
    glitterSource?: unknown;
    glitterSourceBlock?: unknown;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isSessionBoundarySourceMeta(value: unknown): value is SessionBoundarySourceMeta {
  return (
    isRecord(value)
    && typeof value.ideaId === "string"
    && typeof value.poolId === "string"
    && typeof value.poolName === "string"
    && typeof value.poolColor === "string"
    && typeof value.ideaTitle === "string"
  );
}

function isRootSessionBoundaryAnchorNode(node: unknown): boolean {
  if (!isRecord(node) || !isRecord(node.glitterSourceBlock)) {
    return true;
  }

  return typeof node.glitterSourceBlock.role === "string"
    && node.glitterSourceBlock.role.trim() === "root";
}

function buildSessionBoundaryAnchorIdentity(
  anchor: Pick<SessionBoundaryAnchor, "anchorId" | "ideaId" | "poolId" | "poolName" | "poolColor" | "ideaTitle">
): string {
  return [anchor.anchorId, anchor.ideaId, anchor.poolId, anchor.poolName, anchor.poolColor, anchor.ideaTitle].join("\u0000");
}

export function extractSessionBoundaryAnchors(canvas: SessionBoundaryCanvas): SessionBoundaryAnchor[] {
  return canvas.nodes.flatMap((node) => {
    if (
      typeof node.id !== "string"
      || !isSessionBoundarySourceMeta(node.glitterSource)
      || !isRootSessionBoundaryAnchorNode(node)
    ) {
      return [];
    }

    return [{
      anchorId: node.id,
      ideaId: node.glitterSource.ideaId,
      poolId: node.glitterSource.poolId,
      poolName: node.glitterSource.poolName,
      poolColor: node.glitterSource.poolColor,
      ideaTitle: node.glitterSource.ideaTitle
    }];
  });
}

export function hasSameSessionBoundaryAnchors(
  current: PoolRoamBoundaryAnchorState[],
  next: SessionBoundaryAnchor[]
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  const currentKeys = current.map((anchor) => buildSessionBoundaryAnchorIdentity(anchor)).sort();
  const nextKeys = next.map((anchor) => buildSessionBoundaryAnchorIdentity(anchor)).sort();
  return currentKeys.every((key, index) => key === nextKeys[index]);
}

export function buildRoamSourceContent<
  Card extends {
    title: string;
    body: string;
    contentType: unknown;
    sourceUrl?: unknown;
    attachmentPaths: string[];
  }
>(card: Card): Pick<Card, "title" | "body" | "contentType" | "sourceUrl"> & {
  attachmentPaths: string[];
} {
  return {
    title: card.title,
    body: card.body,
    contentType: card.contentType,
    sourceUrl: card.sourceUrl,
    attachmentPaths: [...card.attachmentPaths]
  };
}

export function canCreatePoolRoamCanvasHost(app: unknown): app is {
  vault: { getAbstractFileByPath: (path: string) => unknown };
  workspace: { getLeaf: (newLeaf: boolean) => { openFile: (file: unknown) => Promise<void>; detach?: () => void } };
} {
  return Boolean(app)
    && typeof app === "object"
    && typeof (app as { vault?: { getAbstractFileByPath?: unknown } }).vault?.getAbstractFileByPath === "function"
    && typeof (app as { workspace?: { getLeaf?: unknown } }).workspace?.getLeaf === "function";
}

export function canObservePoolRoamBoardVault(app: unknown): app is {
  vault: { on: (name: string, callback: (file: { path: string }) => void) => unknown };
} {
  return Boolean(app)
    && typeof app === "object"
    && typeof (app as { vault?: { on?: unknown } }).vault?.on === "function";
}

export function canWriteToClipboard(navigatorValue: unknown): navigatorValue is {
  clipboard: { writeText: (text: string) => Promise<void> };
} {
  return Boolean(navigatorValue)
    && typeof navigatorValue === "object"
    && typeof (navigatorValue as { clipboard?: { writeText?: unknown } }).clipboard?.writeText === "function";
}
