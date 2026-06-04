/**
 * 说明：统一管理 Glitter 插件与浏览器预览的 esbuild 入口，便于在同一脚本里切换不同构建目标。
 */
import esbuild from "esbuild";
import process from "node:process";

// 说明：通过命令行参数区分生产构建与浏览器预览构建。
const production = process.argv.includes("production");
const preview = process.argv.includes("preview");

// 说明：根据目标选择对应入口与平台参数，避免插件构建配置和预览构建配置分散维护。
const context = await esbuild.context(
  preview
    ? {
        entryPoints: ["src/preview/index.ts"],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "es2020",
        sourcemap: production ? false : "inline",
        minify: production,
        outfile: "preview/preview.js",
        logLevel: "info"
      }
    : {
        entryPoints: ["main.ts"],
        bundle: true,
        external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", "@codemirror/commands"],
        format: "cjs",
        platform: "node",
        target: "es2020",
        sourcemap: production ? false : "inline",
        minify: production,
        outfile: "main.js",
        logLevel: "info"
      }
);

// 说明：生产模式执行一次性构建；开发模式进入 watch，便于持续预览或插件调试。
if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
  console.log(preview ? "Watching preview build..." : "Watching plugin build...");
}
