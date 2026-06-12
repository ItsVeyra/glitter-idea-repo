/**
 * 首页视图动作约定。
 * 负责描述首页灵感场对外暴露的用户操作，供首页渲染层与宿主视图解耦协作。
 */

import type { HomeFieldView, PluginInterfaceLanguage } from "../../settings/settings";

// 首页主舞台与宿主视图之间的交互入口。
export interface HomeViewActions {
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onPoolSelect: (poolId: string) => void;
  onPoolTitleSelect?: (poolId: string) => void;
  onPoolRename?: (poolId: string, name: string) => void;
  onPoolDelete?: (poolId: string) => void;
  onOverflowOpen?: () => void;
  onSearchSubmit: (query: string) => void;
  onOpenSettings?: () => void;
  // 顶部“切换视图”菜单通过这里把圆满 / 涟漪的选择回传给宿主视图。
  onFieldViewSelect?: (fieldView: HomeFieldView) => void;
  onStatusFilterSelect?: () => void;
  onFirstUseLanguageSelect?: (language: PluginInterfaceLanguage) => void | Promise<void>;
}
