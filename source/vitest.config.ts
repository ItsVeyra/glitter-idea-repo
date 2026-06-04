/**
 * 说明：Vitest 配置只保留本仓库需要的别名与忽略规则，确保测试不会误扫到 worktree 副本。
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // 说明：把 obsidian 模块映射到测试桩，避免在 Node 测试环境直接依赖宿主运行时。
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/helpers/obsidian-shim.ts", import.meta.url))
    }
  },
  // 说明：显式排除 .worktrees，避免重复收集测试文件或误读分支副本。
  test: {
    exclude: ["**/.worktrees/**"]
  }
});
