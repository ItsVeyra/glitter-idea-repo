/**
 * 灵感池概览排序规则。
 * 负责为首页或概览场景提供稳定的池排序比较逻辑。
 */
// 概览排序输入与规则。
export interface PoolOverviewSortEntry {
  name: string;
  ideaCount: number;
  isDefault: boolean;
}

export function comparePoolOverviewEntries(
  a: PoolOverviewSortEntry,
  b: PoolOverviewSortEntry
): number {
  if (b.ideaCount !== a.ideaCount) {
    return b.ideaCount - a.ideaCount;
  }
  if (a.isDefault !== b.isDefault) {
    return a.isDefault ? -1 : 1;
  }

  return a.name.localeCompare(b.name, "zh-Hans-CN");
}
