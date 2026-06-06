import { describe, expect, it } from "vitest";
import {
  buildFirstUseChoosePoolState,
  buildFirstUseCreatePoolState,
  buildPoolViewState,
  buildPoolViewStateFromRuntime
} from "../../../src/ui/pool/pool-state";

type Assert<T extends true> = T;
type BrowseCard = NonNullable<ReturnType<typeof buildPoolViewState>["browse"]>["cards"][number];
type HasLegacyBrowseField =
  "referenceLabel" extends keyof BrowseCard
    ? true
    : "fileActionLabel" extends keyof BrowseCard
      ? true
      : "fileActionKind" extends keyof BrowseCard
        ? true
        : false;
const _browseCardsDropLegacyTask4Fields: Assert<HasLegacyBrowseField extends false ? true : false> = true;

describe("buildPoolViewState", () => {
  it("builds browse state for pool-browse", () => {
    const state = buildPoolViewState("pool-browse");

    expect(state.mode).toBe("browse");
    expect(state.pool).toEqual({
      id: "pool-product",
      title: "产品池",
      itemCount: 3,
      tone: "bluegray"
    });
    expect(state.header.eyebrow).toBe("Idea Pool");
    expect(state.browse?.description).toBe("继续在当前池中筛选、整理并沉淀灵感。");
    expect(state.browse?.poolSwitcherExpanded).toBe(false);
    expect(state.browse?.cards).toHaveLength(3);
    expect(state.browse?.cards.filter((card) => card.selected)).toHaveLength(1);
    expect(state.browse?.cards[0]).toMatchObject({
      updatedLabel: "2026-04-18 10:00",
      fileCreated: false,
      statusLabels: [],
      menuActions: [{ kind: "create-file", label: "创建文件" }]
    });
    expect((state.browse?.cards[0] as any)?.fileStatusLabel).toBeUndefined();
    expect(state.browse?.cards[0]).not.toHaveProperty("referenceLabel");
    expect(state.browse?.cards[0]).not.toHaveProperty("fileActionLabel");
    expect(state.browse?.cards[0]).not.toHaveProperty("fileActionKind");
    expect(state.browse?.cards[1]).toMatchObject({
      updatedLabel: "2026-04-17 09:30 已更新",
      fileCreated: true,
      statusLabels: ["已创建文件"],
      menuActions: [{ kind: "open-primary-file", label: "打开主文件" }]
    });
    expect((state.browse?.cards[1] as any)?.fileStatusLabel).toBeUndefined();
    expect(state.browse?.cards[1]).not.toHaveProperty("referenceLabel");
    expect(state.browse?.cards[1]).not.toHaveProperty("fileActionLabel");
    expect(state.browse?.cards[1]).not.toHaveProperty("fileActionKind");
  });

  it("builds empty state for pool-empty", () => {
    const state = buildPoolViewState("pool-empty");

    expect(state.mode).toBe("empty");
    expect(state.items).toEqual([]);
    expect(state.header.title).toBe("产品池");
    expect(state.browse).toMatchObject({
      description: "继续在当前池中筛选、整理并沉淀灵感。",
      activeOverlay: null,
      contentFilter: "all",
      poolSwitcherExpanded: false,
      resultSummary: "共 0 条灵感",
      cards: []
    });
    expect(state.emptyState).toEqual({
      title: "这个池里还没有灵感",
      description: "先记录一条灵感，之后就能在这里查看、筛选和整理。"
    });
  });

  it("builds reduced-motion browse state for pool-reduced-motion", () => {
    const state = buildPoolViewState("pool-reduced-motion");

    expect(state.mode).toBe("browse");
    expect(state.header.hint).toContain("Reduced motion");
    expect(state.pool.id).toBe("pool-archive");
    expect(state.browse?.cards.find((card) => card.selected)?.id).toBe("idea-archive-1");
  });

  it("builds first-use runtime choose state around default-vs-new pool onboarding", () => {
    const state = buildFirstUseChoosePoolState({
      pools: [{ id: "pool-writing", name: "写作池", ideaCount: 0 }]
    });

    expect(state.mode).toBe("first-use-choose");
    expect(state.pool.title).toBe("归池选择（首次）");
    expect(state.header.eyebrow).toBe("首次归池");
    expect(state.header.hint).toBe("第一条灵感已保存。你可以直接归入默认池，或现在创建一个新池来分类。");
    expect(state.choice).toEqual({
      title: "选择归池方式",
      options: [
        {
          id: "create-new-pool",
          label: "方案 A：新建池后归类（推荐）",
          description: "先创建池名称、描述与池色，再将这条灵感归入新池。"
        },
        {
          id: "pool-writing",
          label: "方案 B：归入默认池",
          description: "立即完成首次流程，并归入当前默认池「写作池」。系统随后展示后续使用指引。"
        }
      ],
      closeLabel: "关闭归池窗口",
      backLabel: "返回上一步",
      continueLabel: "继续"
    });
  });

  it("localizes first-use runtime choose state while preserving user pool names", () => {
    const state = buildFirstUseChoosePoolState({
      interfaceLanguage: "en",
      pools: [{ id: "pool-writing", name: "写作池", ideaCount: 0 }]
    });

    expect(state.pool.title).toBe("Choose pool assignment (first time)");
    expect(state.header.eyebrow).toBe("First pool assignment");
    expect(state.header.hint).toBe("Your first idea has been saved. Add it to the default pool, or create a new pool now to categorize it.");
    expect(state.choice).toEqual({
      title: "Choose how to assign this idea",
      options: [
        {
          id: "create-new-pool",
          label: "Option A: Create a new pool first (recommended)",
          description: "Create the pool name, description, and color first, then move this idea into the new pool."
        },
        {
          id: "pool-writing",
          label: "Option B: Use the default pool",
          description: "Finish the first-time flow now and move this idea into the current default pool \"写作池\". Glitter will then show the next-use guide."
        }
      ],
      closeLabel: "Close pool assignment window",
      backLabel: "Back",
      continueLabel: "Continue"
    });
  });

  it("localizes the system default pool fallback for first-use choose state", () => {
    const state = buildFirstUseChoosePoolState({
      interfaceLanguage: "en",
      pools: []
    });

    expect(state.choice?.options[1]).toMatchObject({
      id: "pool-default",
      description: "Finish the first-time flow now and move this idea into the current default pool \"Default pool\". Glitter will then show the next-use guide."
    });
  });

  it("builds first-use choose scenario for the redesigned onboarding window", () => {
    const state = buildPoolViewState("pool-first-use-choose");

    expect(state.mode).toBe("first-use-choose");
    expect(state.pool.title).toBe("归池选择（首次）");
    expect(state.header.eyebrow).toBe("首次归池");
    expect(state.header.hint).toBe("第一条灵感已保存。你可以直接归入默认池，或现在创建一个新池来分类。");
    expect(state.choice).toEqual({
      title: "选择归池方式",
      options: [
        {
          id: "create-new-pool",
          label: "方案 A：新建池后归类（推荐）",
          description: "先创建池名称、描述与池色，再将这条灵感归入新池。"
        },
        {
          id: "use-default-pool",
          label: "方案 B：归入默认池",
          description: "立即完成首次流程，并归入当前默认池「未整理」。系统随后展示后续使用指引。"
        }
      ],
      closeLabel: "关闭归池窗口",
      backLabel: "返回上一步",
      continueLabel: "继续"
    });
  });

  it("builds first-use create state for create-pool modal", () => {
    const state = buildPoolViewState("pool-first-use-create");

    expect(state.mode).toBe("first-use-create");
    expect(state.pool.title).toBe("新建池分类（首次）");
    expect(state.header.hint).toContain("创建一个新池");
    expect(state.createForm).toEqual({
      title: "新建池分类（首次）",
      subtitle: "为这条灵感创建一个新池，后续筛选和整理会更清晰。",
      nameLabel: "池名称",
      namePlaceholder: "例如：产品池 / 写作池 / 研究池",
      descriptionLabel: "池描述",
      descriptionPlaceholder: "填写该池聚焦的方向与使用场景，便于后续筛选和整理。",
      colorLabel: "池颜色",
      colorOptions: ["#6ab5ff", "#74ccba", "#ffa980", "#ffd468", "#b794ff"],
      tipTitle: "首次说明",
      tipText: "创建后会自动把当前灵感归入该池，并在首页显示首次入池反馈。",
      confirmLabel: "创建池",
      closeLabel: "关闭新建池窗口",
      createdPoolId: "new-pool-created",
      createdPoolLabel: "新建池"
    });
    expect(state.choice).toBeUndefined();
  });

  it("localizes global create state and default new pool label", () => {
    const state = buildFirstUseCreatePoolState({
      flowContext: "global",
      interfaceLanguage: "en"
    });

    expect(state.pool.title).toBe("New pool");
    expect(state.header.eyebrow).toBe("Pool management");
    expect(state.createForm).toMatchObject({
      title: "New pool",
      nameLabel: "Pool name",
      namePlaceholder: "For example: Product pool / Writing pool / Research pool",
      confirmLabel: "Create pool",
      closeLabel: "Close new pool window",
      createdPoolLabel: "New pool"
    });
  });

  it("builds global create state with flow-aware copy and ordered setting colors", () => {
    const state = buildFirstUseCreatePoolState({
      flowContext: "global",
      poolColors: {
        unsorted: "#111111",
        product: "#222222",
        research: "#333333",
        writing: "#444444",
        unnamed: "#555555"
      }
    });

    expect(state.pool.title).toBe("新建池");
    expect(state.header.eyebrow).toBe("池管理");
    expect(state.createForm?.title).toBe("新建池");
    expect(state.createForm?.tipTitle).toBe("提示");
    expect(state.createForm?.tipText).toContain("返回首页并刷新数据");
    expect(state.createForm?.colorOptions).toEqual(["#111111", "#222222", "#333333", "#444444", "#555555"]);
  });

  it("maps text and link runtime cards into explicit card slots", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "  聚焦产品研究与迭代。  ",
        totalItemCount: 5,
        visibleItemCount: 2,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-1",
          title: "Text idea",
          excerpt: "text excerpt",
          hasBodyContent: true,
          selected: true,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "idea-2",
          title: "Link idea",
          excerpt: "link excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "link",
          sourceUrl: "https://example.com/runtime-link",
          attachmentPaths: ["", "assets/fallback.png"],
          fileCreated: true,
          filePath: "Glitter/Link.md",
          referenced: true,
          createdAt: "2026-04-17T09:30:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-17T10:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 1,
        hasSelection: true
      },
      poolOptions: [
        {
          id: "pool-product",
          label: "产品池",
          count: 5,
          selected: true
        }
      ],
      batchMode: false,
      activeOverlay: "pool-switcher"
    });

    expect(state.mode).toBe("browse");
    expect(state.header.title).toBe("产品池");
    expect(state.browse).toMatchObject({
      description: "聚焦产品研究与迭代。",
      activeOverlay: "pool-switcher",
      contentFilter: "all",
      poolSwitcherExpanded: true,
      resultSummary: "命中 2 / 共 5 条灵感"
    });

    const textCard = state.browse?.cards.find((card) => card.id === "idea-1");
    expect(textCard).toMatchObject({
      typeIcon: "text",
      contentKind: "text",
      bodyText: "text excerpt",
      updatedLabel: "2026-04-18 18:00",
      fileCreated: false,
      statusLabels: [],
      menuActions: [{ kind: "create-file", label: "创建文件" }]
    });
    expect((textCard as any)?.fileStatusLabel).toBeUndefined();
    expect(textCard).not.toHaveProperty("referenceLabel");
    expect(textCard).not.toHaveProperty("fileActionLabel");
    expect(textCard).not.toHaveProperty("fileActionKind");
    expect(textCard?.mediaPath).toBeUndefined();
    expect(textCard?.linkUrl).toBeUndefined();
    expect(textCard?.linkDisplayText).toBeUndefined();

    const linkCard = state.browse?.cards.find((card) => card.id === "idea-2");
    expect(linkCard).toMatchObject({
      typeIcon: "link",
      contentKind: "link",
      bodyText: "link excerpt",
      linkUrl: "https://example.com/runtime-link",
      linkDisplayText: undefined,
      fileCreated: true,
      statusLabels: ["已创建文件"],
      menuActions: [{ kind: "open-primary-file", label: "打开主文件" }],
      updatedLabel: "2026-04-17 17:30"
    });
    expect((linkCard as any)?.fileStatusLabel).toBeUndefined();
    expect(linkCard).not.toHaveProperty("referenceLabel");
    expect(linkCard).not.toHaveProperty("fileActionLabel");
    expect(linkCard).not.toHaveProperty("fileActionKind");
    expect(linkCard?.mediaPath).toBeUndefined();

    expect(state.items).toEqual([]);
    expect(state.detail).toEqual({ title: "", meta: "", body: "" });
    expect(state.roam).toBeUndefined();
  });

  it("adds English fixed browse labels from interface language", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "Product pool",
        description: "Product notes",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      interfaceLanguage: "en",
      viewOptions: {
        queryPlaceholder: "Search filtered ideas"
      },
      preview: {
        available: true,
        open: true,
        saving: false,
        panelTitle: "Product pool Markdown file",
        saveLabel: "Save Markdown file"
      }
    });

    expect(state.browse?.queryPlaceholder).toBe("Search filtered ideas");
    expect(state.browse?.resultSummary).toBe("1 idea");
    expect(state.browse?.labels?.statusFilterOptions["file-created"]).toBe("File created");
    expect(state.preview?.panelTitle).toBe("Product pool Markdown file");
    expect(state.preview?.saveLabel).toBe("Save Markdown file");
  });

  it("builds English create-pool modal copy from interface language", () => {
    const state = buildFirstUseCreatePoolState({
      flowContext: "global",
      interfaceLanguage: "en"
    });

    expect(state.pool.title).toBe("New pool");
    expect(state.header.eyebrow).toBe("Pool management");
    expect(state.header.hint).toBe("Create a new pool for easier filtering and organization later.");
    expect(state.createForm?.nameLabel).toBe("Pool name");
    expect(state.createForm?.namePlaceholder).toBe("For example: Product pool / Writing pool / Research pool");
    expect(state.createForm?.confirmLabel).toBe("Create pool");
  });

  it("adds English roam panel labels from interface language", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "Product pool",
        description: "Product notes",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      interfaceLanguage: "en",
      roam: {
        open: true,
        mode: "empty",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: []
      }
    });

    if (!state.roam?.labels) {
      throw new Error("Expected roam labels");
    }
    expect(state.roam.labels).toEqual({
      toggleOpen: "Open roam mode",
      toggleClose: "Close roam mode",
      modeLabel: "Roam mode",
      downloadCurrentBoard: "Download current roam board",
      shareCurrentBoard: "Share current roam board",
      openHistory: "Open roam board history",
      errorTitle: "Roam board is temporarily unavailable",
      errorDescription: "Please try again later.",
      emptyTitle: "New blank roam area",
      emptyDescription: "Drag a dot from the top-right of a left card into this area to create the first roam board block.",
      sourceHandleTitle: "Drag a connection line to the roam board on the right",
      sourceHandleLabel: expect.any(Function),
      bridgeMarkerLabel: expect.any(Function),
      bridgeMeta: expect.any(Function),
      locateSource: "Locate source card",
      deleteLink: "Delete link"
    });
    expect(state.roam.labels.sourceHandleLabel("Design weekly notes")).toBe("Connect \"Design weekly notes\" to the roam board");
    expect(state.roam.labels.bridgeMarkerLabel("Design weekly notes")).toBe("View roam link for \"Design weekly notes\"");
    expect(state.roam.labels.bridgeMeta("Product pool")).toBe("From Product pool");
  });

  it("formats browse card timestamps in the local timezone instead of raw UTC slices", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";

    try {
      const state = buildPoolViewStateFromRuntime({
        pool: {
          id: "pool-product",
          title: "产品池",
          description: "desc",
          totalItemCount: 1,
          visibleItemCount: 1,
          tone: "bluegray"
        },
        header: {
          eyebrow: "Idea Pool",
          hint: "runtime"
        },
        cards: [
          {
            id: "idea-timezone",
            title: "Timezone idea",
            excerpt: "excerpt",
            hasBodyContent: true,
            selected: false,
            contentType: "text",
            sourceUrl: undefined,
            attachmentPaths: [],
            fileCreated: false,
            filePath: undefined,
            referenced: false,
            createdAt: "2026-05-05T15:50:00.000Z",
            editedAt: undefined,
            updatedAt: "2026-05-05T15:50:00.000Z"
          }
        ],
        controls: {
          query: "",
          status: "all",
          contentFilter: "all",
          sort: "updated-desc",
          selectedCount: 0,
          hasSelection: false
        },
        poolOptions: [
          {
            id: "pool-product",
            label: "产品池",
            count: 1,
            selected: true
          }
        ],
        batchMode: false
      });

      expect(state.browse?.cards[0]?.updatedLabel).toBe("2026-05-05 23:50");
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });

  it("derives grouped snippet labels and location menu metadata for browse cards", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-multi-snippet",
          title: "Grouped snippet idea",
          excerpt: "text excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: true,
          filePath: "Glitter/Grouped snippet idea.md",
          referenced: true,
          snippetNoteCount: 2,
          snippetLocations: [
            {
              notePath: "Folder/A.md",
              noteTitle: "A",
              occurrenceCount: 2,
              stale: false
            },
            {
              notePath: "Folder/B.md",
              noteTitle: "B",
              occurrenceCount: 1,
              stale: false
            }
          ],
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        } as any
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      activeOverlay: undefined
    });

    const card = state.browse?.cards.find((entry) => entry.id === "idea-multi-snippet");
    expect(card).toMatchObject({
      statusLabels: ["已创建文件", "已引用为 2 个片段"],
      menuActions: [
        { kind: "open-primary-file", label: "打开主文件" },
        { kind: "open-snippet-locations", label: "查看插入位置（2）" }
      ],
      snippetLocations: [
        {
          notePath: "Folder/A.md",
          noteTitle: "A",
          occurrenceCount: 2,
          stale: false
        },
        {
          notePath: "Folder/B.md",
          noteTitle: "B",
          occurrenceCount: 1,
          stale: false
        }
      ]
    });
  });

  it("adds a direct open-snippet-note action for a single non-stale snippet location", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-single-snippet",
          title: "Single snippet idea",
          excerpt: "text excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: true,
          snippetNoteCount: 1,
          snippetLocations: [
            {
              notePath: "Folder/A.md",
              noteTitle: "A",
              occurrenceCount: 2,
              stale: false
            }
          ],
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        } as any
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      activeOverlay: undefined
    });

    const card = state.browse?.cards.find((entry) => entry.id === "idea-single-snippet");
    expect(card).toMatchObject({
      statusLabels: ["已引用为 1 个片段"],
      menuActions: [
        { kind: "create-file", label: "创建文件" },
        { kind: "open-snippet-note", label: "打开插入笔记" }
      ]
    });
  });

  it("routes a single stale snippet location to the location list action", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-stale-snippet",
          title: "Stale snippet idea",
          excerpt: "text excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: true,
          snippetNoteCount: 1,
          snippetLocations: [
            {
              notePath: "Missing.md",
              noteTitle: "Missing",
              occurrenceCount: 1,
              stale: true
            }
          ],
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        } as any
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      activeOverlay: undefined
    });

    const card = state.browse?.cards.find((entry) => entry.id === "idea-stale-snippet");
    expect(card).toMatchObject({
      statusLabels: ["已引用为 1 个片段"],
      menuActions: [
        { kind: "create-file", label: "创建文件" },
        { kind: "open-snippet-locations", label: "查看插入位置（1）" }
      ]
    });
  });

  it("defaults popup active pool to selected pool when expanded", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-unsorted",
        title: "未整理",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        {
          id: "pool-unsorted",
          label: "未整理",
          count: 1,
          selected: false
        },
        {
          id: "pool-product",
          label: "产品池",
          count: 3,
          selected: true
        }
      ],
      batchMode: false,
      activeOverlay: "pool-switcher"
    });

    expect(state.browse?.poolSwitcherActivePoolId).toBe("pool-product");
  });

  it("preserves explicit popup active pool override when expanded", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-unsorted",
        title: "未整理",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        {
          id: "pool-product",
          label: "产品池",
          count: 3,
          selected: true
        }
      ],
      batchMode: false,
      activeOverlay: "pool-switcher",
      poolSwitcherActivePoolId: "pool-research"
    });

    expect(state.browse?.poolSwitcherActivePoolId).toBe("pool-research");
  });

  it("leaves popup active pool undefined when switcher is collapsed", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-unsorted",
        title: "未整理",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        {
          id: "pool-product",
          label: "产品池",
          count: 3,
          selected: true
        }
      ],
      batchMode: false,
      activeOverlay: undefined,
      poolSwitcherActivePoolId: "pool-research"
    });

    expect(state.browse?.poolSwitcherActivePoolId).toBeUndefined();
  });

  it("falls back to the current pool id when expanded without override or selected option", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-unsorted",
        title: "未整理",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        {
          id: "pool-product",
          label: "产品池",
          count: 3,
          selected: false
        }
      ],
      batchMode: false,
      activeOverlay: "pool-switcher"
    });

    expect(state.browse?.poolSwitcherActivePoolId).toBe("pool-unsorted");
  });

  it("maps multiline text runtime cards into the full browse body text instead of the excerpt", () => {
    const fullBody = "第一行\n第二行\n\n第三行";
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-1",
          title: "Text idea",
          body: fullBody,
          excerpt: "第一行摘要",
          hasBodyContent: true,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        {
          id: "pool-product",
          label: "产品池",
          count: 1,
          selected: true
        }
      ],
      batchMode: false,
      activeOverlay: undefined
    });

    const textCard = state.browse?.cards.find((card) => card.id === "idea-1");
    expect(textCard?.contentKind).toBe("text");
    expect(textCard?.bodyText).toBe(fullBody);
  });

  it("maps image and video runtime cards into media slots", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 2,
        visibleItemCount: 2,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-1",
          title: "Image idea",
          excerpt: "image",
          hasBodyContent: true,
          selected: false,
          contentType: "image",
          sourceUrl: undefined,
          attachmentPaths: ["", "assets/image-a.png", "assets/image-b.png"],
          mediaThumbnailUrl: "app://local/assets/image-a.png",
          mediaThumbnailUrls: [
            "app://local/assets/image-a.png",
            "app://local/assets/image-b.png"
          ],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        } as any,
        {
          id: "idea-2",
          title: "Video idea",
          excerpt: "video",
          hasBodyContent: true,
          selected: false,
          contentType: "video",
          sourceUrl: undefined,
          attachmentPaths: ["assets/video-a.mp4"],
          mediaThumbnailUrl: "app://local/assets/video-a.mp4",
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T11:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T11:00:00.000Z"
        } as any
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      activeOverlay: undefined
    });

    expect(state.mode).toBe("browse");
    expect(state.browse?.resultSummary).toBe("共 2 条灵感");

    const imageCard = state.browse?.cards.find((card) => card.id === "idea-1");
    expect(imageCard).toMatchObject({
      typeIcon: "image",
      contentKind: "image",
      mediaPath: "assets/image-a.png",
      mediaThumbnailUrl: "app://local/assets/image-a.png",
      mediaThumbnailUrls: [
        "app://local/assets/image-a.png",
        "app://local/assets/image-b.png"
      ],
      fileCreated: false,
      statusLabels: [],
      menuActions: [{ kind: "create-file", label: "创建文件" }],
      updatedLabel: "2026-04-18 18:00"
    });
    expect((imageCard as any)?.fileStatusLabel).toBeUndefined();
    expect(imageCard).not.toHaveProperty("referenceLabel");
    expect(imageCard).not.toHaveProperty("fileActionLabel");
    expect(imageCard).not.toHaveProperty("fileActionKind");
    expect(imageCard?.bodyText).toBe("image");
    expect(imageCard?.linkUrl).toBeUndefined();
    expect(imageCard?.linkDisplayText).toBeUndefined();

    const videoCard = state.browse?.cards.find((card) => card.id === "idea-2");
    expect(videoCard).toMatchObject({
      typeIcon: "video",
      contentKind: "video",
      mediaPath: "assets/video-a.mp4",
      mediaThumbnailUrl: "app://local/assets/video-a.mp4",
      fileCreated: false,
      statusLabels: [],
      menuActions: [{ kind: "create-file", label: "创建文件" }],
      updatedLabel: "2026-04-18 19:00"
    });
    expect((videoCard as any)?.fileStatusLabel).toBeUndefined();
    expect(videoCard).not.toHaveProperty("referenceLabel");
    expect(videoCard).not.toHaveProperty("fileActionLabel");
    expect(videoCard).not.toHaveProperty("fileActionKind");
    expect(videoCard?.bodyText).toBe("video");
    expect(videoCard?.linkUrl).toBeUndefined();
    expect(videoCard?.linkDisplayText).toBeUndefined();
  });

  it("keeps full image and video body text so card expansion can reveal all content", () => {
    const imageBody = "图片正文第一段\n图片正文第二段，应该完整保留。";
    const videoBody = "视频正文第一段\n视频正文第二段，应该完整保留。";
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 2,
        visibleItemCount: 2,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-image-full-body",
          title: "Image idea",
          body: imageBody,
          excerpt: "image excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "image",
          attachmentPaths: ["assets/image-a.png"],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "idea-video-full-body",
          title: "Video idea",
          body: videoBody,
          excerpt: "video excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "video",
          attachmentPaths: ["assets/video-a.mp4"],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T11:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T11:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      activeOverlay: undefined
    });

    const imageCard = state.browse?.cards.find((card) => card.id === "idea-image-full-body");
    const videoCard = state.browse?.cards.find((card) => card.id === "idea-video-full-body");

    expect(imageCard?.bodyText).toBe(imageBody);
    expect(videoCard?.bodyText).toBe(videoBody);
  });

  it("uses hasBodyContent instead of excerpt placeholder for content kind", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 5,
        visibleItemCount: 5,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "text-empty",
          title: "Text empty",
          excerpt: "text that should not drive kind",
          hasBodyContent: false,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "link-empty",
          title: "Link empty",
          excerpt: "non-empty excerpt should not force link",
          hasBodyContent: false,
          selected: false,
          contentType: "link",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "link-with-text",
          title: "Link with text",
          excerpt: "(empty)",
          hasBodyContent: true,
          selected: false,
          contentType: "link",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "mixed-with-text",
          title: "Mixed with text",
          excerpt: "(empty)",
          hasBodyContent: true,
          selected: false,
          contentType: "mixed",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "mixed-empty",
          title: "Mixed empty",
          excerpt: "non-empty excerpt should not force text",
          hasBodyContent: false,
          selected: false,
          contentType: "mixed",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      activeOverlay: undefined
    });

    const textEmpty = state.browse?.cards.find((card) => card.id === "text-empty");
    expect(textEmpty?.contentKind).toBe("empty");

    const linkEmpty = state.browse?.cards.find((card) => card.id === "link-empty");
    expect(linkEmpty?.contentKind).toBe("empty");

    const linkWithText = state.browse?.cards.find((card) => card.id === "link-with-text");
    expect(linkWithText?.contentKind).toBe("link");
    expect(linkWithText?.bodyText).toBe("(empty)");
    expect(linkWithText?.linkDisplayText).toBeUndefined();

    const mixedWithText = state.browse?.cards.find((card) => card.id === "mixed-with-text");
    expect(mixedWithText?.contentKind).toBe("text");
    expect(mixedWithText?.bodyText).toBe("(empty)");

    const mixedEmpty = state.browse?.cards.find((card) => card.id === "mixed-empty");
    expect(mixedEmpty?.contentKind).toBe("empty");
  });

  it("normalizes saved www-only sourceUrl and ignores malformed sourceUrl in link cards", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 4,
        visibleItemCount: 4,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "link-www-url",
          title: "Link www url",
          body: "真实正文",
          excerpt: "真实正文",
          hasBodyContent: true,
          selected: false,
          contentType: "link",
          sourceUrl: "www.example.com/article",
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "link-invalid-url",
          title: "Link invalid url",
          body: "真实正文",
          excerpt: "真实正文",
          hasBodyContent: true,
          selected: false,
          contentType: "link",
          sourceUrl: "article notes",
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "link-whitespace-url",
          title: "Link body only",
          body: "真实正文",
          excerpt: "真实正文",
          hasBodyContent: true,
          selected: false,
          contentType: "link",
          sourceUrl: "   \n\t  ",
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "link-whitespace-empty",
          title: "Whitespace link",
          body: "",
          excerpt: "(empty)",
          hasBodyContent: false,
          selected: false,
          contentType: "link",
          sourceUrl: "   ",
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          editedAt: undefined,
          updatedAt: "2026-04-18T10:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      activeOverlay: undefined
    });

    const wwwUrl = state.browse?.cards.find((card) => card.id === "link-www-url");
    expect(wwwUrl?.contentKind).toBe("link");
    expect(wwwUrl?.bodyText).toBe("真实正文");
    expect(wwwUrl?.linkUrl).toBe("https://www.example.com/article");
    expect(wwwUrl?.linkDisplayText).toBeUndefined();

    const invalidUrl = state.browse?.cards.find((card) => card.id === "link-invalid-url");
    expect(invalidUrl?.contentKind).toBe("link");
    expect(invalidUrl?.bodyText).toBe("真实正文");
    expect(invalidUrl?.linkUrl).toBeUndefined();
    expect(invalidUrl?.linkDisplayText).toBeUndefined();

    const linkBodyOnly = state.browse?.cards.find((card) => card.id === "link-whitespace-url");
    expect(linkBodyOnly?.contentKind).toBe("link");
    expect(linkBodyOnly?.bodyText).toBe("真实正文");
    expect(linkBodyOnly?.linkUrl).toBeUndefined();
    expect(linkBodyOnly?.linkDisplayText).toBeUndefined();

    const whitespaceEmpty = state.browse?.cards.find((card) => card.id === "link-whitespace-empty");
    expect(whitespaceEmpty?.contentKind).toBe("empty");
    expect(whitespaceEmpty?.linkUrl).toBeUndefined();
    expect(whitespaceEmpty?.linkDisplayText).toBeUndefined();
  });

  it("returns empty mode from runtime when there are no cards and no pool content", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-empty",
        title: "空池",
        description: "",
        totalItemCount: 0,
        visibleItemCount: 0,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      activeOverlay: undefined
    });

    expect(state.mode).toBe("empty");
    expect(state.header.title).toBe("空池");
    expect(state.browse).toMatchObject({
      description: "继续在当前池中筛选、整理并沉淀灵感。",
      activeOverlay: null,
      contentFilter: "all",
      resultSummary: "共 0 条灵感",
      cards: []
    });
    expect(state.emptyState).toEqual({
      title: "这个池里还没有灵感",
      description: "先记录一条灵感，之后就能在这里查看、筛选和整理。"
    });
  });

  it("keeps browse mode for filtered zero-result runtime states", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "   ",
        totalItemCount: 5,
        visibleItemCount: 0,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "nomatch",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [],
      batchMode: false,
      activeOverlay: undefined
    });

    expect(state.mode).toBe("browse");
    expect(state.header.title).toBe("产品池");
    expect(state.browse).toMatchObject({
      description: "继续在当前池中筛选、整理并沉淀灵感。",
      activeOverlay: null,
      contentFilter: "all",
      resultSummary: "命中 0 / 共 5 条灵感",
      cards: []
    });
    expect(state.emptyState).toBeUndefined();
  });

  it("supports non-pool browse surfaces with locked metadata and a custom query placeholder", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-global-status",
        title: "已引用 / 已建文件",
        description: "  汇总所有池中的状态灵感。  ",
        totalItemCount: 4,
        visibleItemCount: 2,
        tone: "bluegray"
      },
      header: {
        eyebrow: "全局状态",
        hint: "筛选所有池中的已引用与已建文件灵感"
      },
      cards: [
        {
          id: "idea-1",
          title: "Referenced idea",
          excerpt: "text excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: true,
          createdAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:00:00.000Z"
        },
        {
          id: "idea-2",
          title: "Created idea",
          excerpt: "file excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: true,
          filePath: "Glitter/Created.md",
          referenced: false,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "with-markers",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        { id: "pool-default", label: "默认池", count: 2, selected: false },
        { id: "pool-writing", label: "写作池", count: 2, selected: false }
      ],
      batchMode: false,
      activeOverlay: undefined,
      viewOptions: {
        showPoolSwitcher: false,
        metadataEditable: false,
        queryPlaceholder: "搜索当前筛选灵感"
      }
    });

    expect(state.mode).toBe("browse");
    expect(state.showPoolSwitcher).toBe(false);
    expect(state.metadataEditable).toBe(false);
    expect(state.browse?.description).toBe("汇总所有池中的状态灵感。");
    expect(state.browse?.queryPlaceholder).toBe("搜索当前筛选灵感");
    expect(state.browse?.resultSummary).toBe("命中 2 / 共 4 条灵感");
  });

  it("threads empty roam panel state from runtime", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 0,
        visibleItemCount: 0,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 0, selected: true }],
      batchMode: false,
      roam: {
        open: true,
        mode: "empty",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [
          {
            anchorId: "anchor-1",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Idea 1",
            visibleBridge: false
          }
        ]
      }
    } as any);

    expect(state.mode).toBe("empty");
    expect(state.roam).toMatchObject({
      open: true,
      mode: "empty",
      historyEnabled: true,
      floatingActions: ["download", "share", "history"],
      boundaryAnchors: [
        {
          anchorId: "anchor-1",
          poolId: "pool-product",
          poolName: "产品池",
          poolColor: "#6ab5ff",
          ideaTitle: "Idea 1",
          visibleBridge: false
        }
      ]
    });
    expect(state.roam?.labels).toMatchObject({
      toggleOpen: "打开漫游模式",
      emptyTitle: "新的空白漫游区"
    });
    expect(state.preview).toBeUndefined();
  });

  it("threads board roam panel state from runtime without reusing input references", () => {
    const roam = {
      open: true,
      mode: "board",
      boardPath: "Boards/product.canvas",
      historyEnabled: false,
      floatingActions: ["download", "share", "history"],
      boundaryAnchors: [
        {
          anchorId: "anchor-1",
          poolId: "pool-product",
          poolName: "产品池",
          poolColor: "#6ab5ff",
          ideaTitle: "Idea 1",
          visibleBridge: true
        },
        {
          anchorId: "anchor-2",
          poolId: "pool-writing",
          poolName: "写作池",
          poolColor: "#ffd468",
          ideaTitle: "Idea 2",
          visibleBridge: false
        }
      ]
    } as const;
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-1",
          title: "Board idea",
          excerpt: "text excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }],
      batchMode: false,
      roam
    } as any);

    expect(state.roam).toMatchObject(roam);
    expect(state.roam?.labels).toMatchObject({
      toggleOpen: "打开漫游模式",
      modeLabel: "漫游模式"
    });
    expect(state.roam).not.toBe(roam);
    expect(state.roam?.floatingActions).not.toBe(roam.floatingActions);
    expect(state.roam?.boundaryAnchors).not.toBe(roam.boundaryAnchors);
  });

  it("threads error roam panel state from runtime", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 1,
        visibleItemCount: 1,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-1",
          title: "Error idea",
          excerpt: "text excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [{ id: "pool-product", label: "产品池", count: 1, selected: true }],
      batchMode: false,
      roam: {
        open: true,
        mode: "error",
        historyEnabled: true,
        floatingActions: ["download", "share", "history"],
        boundaryAnchors: [
          {
            anchorId: "anchor-3",
            poolId: "pool-product",
            poolName: "产品池",
            poolColor: "#6ab5ff",
            ideaTitle: "Idea 3",
            visibleBridge: false
          }
        ],
        errorMessage: "Board metadata is unavailable."
      }
    } as any);

    expect(state.roam).toMatchObject({
      open: true,
      mode: "error",
      historyEnabled: true,
      floatingActions: ["download", "share", "history"],
      boundaryAnchors: [
        {
          anchorId: "anchor-3",
          poolId: "pool-product",
          poolName: "产品池",
          poolColor: "#6ab5ff",
          ideaTitle: "Idea 3",
          visibleBridge: false
        }
      ],
      errorMessage: "Board metadata is unavailable."
    });
  });

  it("threads pool markdown preview shell state from runtime", () => {
    const state = buildPoolViewStateFromRuntime({
      pool: {
        id: "pool-product",
        title: "产品池",
        description: "desc",
        totalItemCount: 2,
        visibleItemCount: 2,
        tone: "bluegray"
      },
      header: {
        eyebrow: "Idea Pool",
        hint: "runtime"
      },
      cards: [
        {
          id: "idea-1",
          title: "Preview idea",
          excerpt: "text excerpt",
          hasBodyContent: true,
          selected: false,
          contentType: "text",
          sourceUrl: undefined,
          attachmentPaths: [],
          fileCreated: false,
          filePath: undefined,
          referenced: false,
          createdAt: "2026-04-18T10:00:00.000Z",
          updatedAt: "2026-04-18T10:00:00.000Z"
        }
      ],
      controls: {
        query: "",
        status: "all",
        contentFilter: "all",
        sort: "updated-desc",
        selectedCount: 0,
        hasSelection: false
      },
      poolOptions: [
        { id: "pool-product", label: "产品池", count: 2, selected: true }
      ],
      batchMode: false,
      preview: {
        available: true,
        open: true,
        saving: true,
        panelTitle: "产品池 Markdown 文件",
        saveLabel: "保存 Markdown 文件"
      }
    });

    expect(state.preview).toEqual({
      available: true,
      open: true,
      saving: true,
      panelTitle: "产品池 Markdown 文件",
      saveLabel: "保存 Markdown 文件"
    });
  });

  it("throws for unsupported scenarios", () => {
    expect(() => buildPoolViewState("search-results" as never)).toThrow(
      "buildPoolViewState does not support scenario: search-results"
    );
  });
});
