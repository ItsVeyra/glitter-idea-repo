/**
 * 灵感池视图命令注册器。
 * 负责声明打开 Glitter 灵感池的命令，并把回调绑定到插件导航入口。
 */
import type GlitterPlugin from "../plugin/GlitterPlugin";

// 命令注册。
export function registerOpenPoolViewCommand(plugin: GlitterPlugin): void {
  plugin.addCommand({
    id: "open-pool-view",
    name: "Open Glitter pool view",
    callback: () => plugin.activatePoolView()
  });
}
