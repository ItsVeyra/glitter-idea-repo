/**
 * 搜索页示例数据。
 * 负责固定评审场景下的搜索结果占位内容。
 */

// 固定评审场景使用的搜索结果样例。
export const SEARCH_DEMO_RESULTS = [
  {
    id: "result-1",
    title: "Editor plugin onboarding notes",
    meta: "Research · Updated today"
  },
  {
    id: "result-2",
    title: "Visual QA checklist for shell states",
    meta: "Design · Updated yesterday"
  },
  {
    id: "result-3",
    title: "Selection parser edge cases",
    meta: "Engineering · Updated this week"
  }
] as const;
