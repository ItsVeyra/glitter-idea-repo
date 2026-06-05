/**
 * 灵感片段渲染后增强器，负责让正文中的 Glitter 片段具备交互与状态同步能力。
 * 涵盖片段节点识别、点击绑定、失效态回退文案与池标签同步等增强逻辑。
 */
// 片段增强依赖契约。
export type ResolveSnippetIdeaExists = (ideaId: string) => boolean | Promise<boolean>;
export type ResolveSnippetPoolLabel = (ideaId: string) => string | null | Promise<string | null>;

const INVALID_SNIPPET_SOURCE_COPY = "⚠ 来自 Glitter · 请重新搜索并替换该片段";
const GLITTER_SOURCE_PREFIX = "✨ 来自 Glitter · ";
const GLITTER_SNIPPET_SELECTOR = [
  '.GlitterIdea-snippet[data-glitteridea-id]',
  '.GlitterIdea-snippet[data-glitter-idea-id]',
  '.glitter-idea-snippet[data-glitteridea-id]',
  '.glitter-idea-snippet[data-glitter-idea-id]',
  '.callout[data-callout="GlitterIdea"]',
  '.callout[data-callout="glitter-idea"]',
  '.callout[data-callout="glitteridea"]'
].join(", ");

// 片段节点解析。
function extractIdeaIdFromGlitterHref(href: string): string | null {
  const matched = href.match(/^glitter:\/\/idea\/([^/?#]+)$/);
  return matched?.[1] ?? null;
}

function resolveIdeaId(node: HTMLElement): string | null {
  const fromDataset = node.dataset.glitterideaId ?? node.dataset.glitterIdeaId;
  if (fromDataset) {
    node.dataset.glitterideaId = fromDataset;
    delete node.dataset.glitterIdeaId;
    return fromDataset;
  }

  const calloutLink = node.querySelector<HTMLAnchorElement>('.callout-title-inner a[href^="glitter://idea/"]');
  const fromHref = calloutLink?.href ? extractIdeaIdFromGlitterHref(calloutLink.href) : null;
  if (!fromHref) {
    return null;
  }

  node.dataset.glitterideaId = fromHref;
  delete node.dataset.glitterIdeaId;
  return fromHref;
}

// 交互绑定与展示同步。
function bindSnippetInteraction(node: HTMLElement, ideaId: string, onSnippetClick: (ideaId: string) => void): void {
  if (node.dataset.glitterBound === "true") {
    return;
  }

  node.dataset.glitterBound = "true";

  node.addEventListener("click", () => {
    if (node.dataset.glitterideaState === "invalid") {
      return;
    }

    onSnippetClick(ideaId);
  });

  node.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (node.dataset.glitterideaState === "invalid") {
      return;
    }

    event.preventDefault();
    onSnippetClick(ideaId);
  });
}

function resolveSourceNode(node: HTMLElement): HTMLElement | null {
  return (
    node.querySelector<HTMLElement>(".GlitterIdea-snippet__source")
    ?? node.querySelector<HTMLElement>(".glitter-idea-snippet__source")
    ?? node.querySelector<HTMLElement>(".callout-content > :last-child")
  );
}

function resolveCalloutFooterNode(node: HTMLElement): HTMLElement | null {
  return node.querySelector<HTMLElement>(".callout-content > :last-child");
}

function syncInvalidSourceCopy(node: HTMLElement, isValid: boolean): void {
  const sourceNode = resolveSourceNode(node);
  if (!sourceNode) {
    return;
  }

  if (isValid) {
    const originalText = sourceNode.dataset.glitterOriginalText;
    if (originalText !== undefined) {
      sourceNode.textContent = originalText;
      delete sourceNode.dataset.glitterOriginalText;
    }
    delete sourceNode.dataset.glitterInvalidSource;
    return;
  }

  if (sourceNode.dataset.glitterOriginalText === undefined) {
    sourceNode.dataset.glitterOriginalText = sourceNode.textContent ?? "";
  }

  sourceNode.textContent = INVALID_SNIPPET_SOURCE_COPY;
  sourceNode.dataset.glitterInvalidSource = "true";
}

function syncSnippetPoolLabel(node: HTMLElement, poolLabel: string | null): void {
  if (!poolLabel) {
    return;
  }

  const footerNode = resolveCalloutFooterNode(node);
  if (!footerNode) {
    return;
  }

  footerNode.textContent = `${GLITTER_SOURCE_PREFIX}${poolLabel}`;
}

function applySnippetState(node: HTMLElement, isValid: boolean, poolLabel: string | null): void {
  delete node.dataset.glitterIdeaState;
  node.dataset.glitterideaState = isValid ? "active" : "invalid";
  syncInvalidSourceCopy(node, isValid);
  if (isValid) {
    syncSnippetPoolLabel(node, poolLabel);
  }

  if (isValid) {
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.removeAttribute("aria-disabled");
    return;
  }

  node.tabIndex = -1;
  node.setAttribute("aria-disabled", "true");
  node.removeAttribute("role");
}

// 渲染后增强入口。
export async function enhanceGlitterSnippets(
  containerEl: HTMLElement,
  onSnippetClick: (ideaId: string) => void,
  resolveIdeaExists: ResolveSnippetIdeaExists = () => true,
  resolveIdeaPoolLabel: ResolveSnippetPoolLabel = () => null
): Promise<void> {
  const nodes = Array.from(containerEl.querySelectorAll<HTMLElement>(GLITTER_SNIPPET_SELECTOR));

  await Promise.all(
    nodes.map(async (node) => {
      const ideaId = resolveIdeaId(node);
      if (!ideaId) {
        return;
      }

      bindSnippetInteraction(node, ideaId, onSnippetClick);
      const [ideaExists, poolLabel] = await Promise.all([
        resolveIdeaExists(ideaId),
        resolveIdeaPoolLabel(ideaId)
      ]);
      applySnippetState(node, ideaExists, poolLabel);
    })
  );
}
