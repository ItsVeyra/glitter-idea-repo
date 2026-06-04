/**
 * 搜索视图命令注册器。
 * 负责声明打开 Glitter 搜索页的命令，并把回调绑定到插件导航入口。
 */
import type GlitterPlugin from "../plugin/GlitterPlugin";

// 命令注册。
export function registerOpenSearchViewCommand(plugin: GlitterPlugin): void {
  plugin.addCommand({
    id: "open-search-view",
    name: "Open Glitter search view",
    callback: () => plugin.activateSearchView()
  });
}
