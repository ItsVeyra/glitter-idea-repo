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

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const releaseRoot = resolve(testDir, "../../..");

describe("public README review disclosures", () => {
  it("documents the source review workspace, English summary, and verification commands", () => {
    const readme = readFileSync(resolve(releaseRoot, "README.md"), "utf8");

    expect(readme).toContain("Glitter is a lightweight idea capture plugin");
    expect(readme).toContain("source/");
    expect(readme).toContain("npm install");
    expect(readme).toContain("npm run test");
    expect(readme).toContain("npm run check");
    expect(readme).toContain("npm run build");
  });

  it("documents AI, network, and privacy boundaries", () => {
    const readme = readFileSync(resolve(releaseRoot, "README.md"), "utf8");

    expect(readme).toContain("API Key");
    expect(readme).toContain("Base URL");
    expect(readme).toContain("Model");
    expect(readme).toContain("无默认遥测");
    expect(readme).toContain("不会自动把你的 vault 内容上传到开发者服务器");
    expect(readme).toContain("主动导入链接");
    expect(readme).toContain("请求对应链接页面");
    expect(readme).toContain("当前文本内容才会发送到你指定的模型服务");
    expect(readme).toContain("如果你不使用链接导入，也不配置或触发 AI，Glitter 不会额外发起网络请求");
  });
});
