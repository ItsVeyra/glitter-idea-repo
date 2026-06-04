/**
 * 浏览器预览入口文件。
 * 负责获取预览挂载点并启动 Glitter 预览壳的渲染流程。
 */
import { mountPreviewShell } from "./preview-shell";

// 预览入口挂载。
const app = document.getElementById("app");

if (!(app instanceof HTMLElement)) {
  throw new Error("Preview root #app is missing.");
}

mountPreviewShell(app);
