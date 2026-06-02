/*
Copyright (C) 2026 ItsVeyra

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3 of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
