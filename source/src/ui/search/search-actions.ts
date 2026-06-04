/**
 * 搜索页动作约定。
 * 负责描述搜索工作区对外抛出的查询、选中与批量操作回调。
 */

// 搜索结果页与宿主视图之间的交互入口。
export interface SearchViewActions {
  onQuerySubmit: () => void;
  onResultSelect: (resultId: string) => void;
  onBatchAction: (actionId: string) => void;
}
