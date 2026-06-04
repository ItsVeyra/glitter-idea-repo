/**
 * 首页视图命令注册器。
 * 负责声明打开 Glitter 首页的命令，并把回调绑定到插件导航入口。
 */
import type GlitterPlugin from "../plugin/GlitterPlugin";

// 命令注册。
export function registerOpenMainViewCommand(plugin: GlitterPlugin): void {
  plugin.addCommand({
    id: "open-main-view",
    name: "Open Glitter home view",
    callback: async () => {
      await plugin.activateMainView();
    }
  });
}
