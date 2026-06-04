/**
 * 说明：该文件是 Obsidian 插件入口，只负责把真正的插件实现从 src/plugin/GlitterPlugin 暴露给宿主加载。
 */
import GlitterPlugin from "./src/plugin/GlitterPlugin";

// 说明：保持默认导出稳定，避免构建入口与运行时入口分叉维护。
export default GlitterPlugin;
