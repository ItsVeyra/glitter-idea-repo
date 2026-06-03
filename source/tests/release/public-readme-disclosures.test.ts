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
    expect(readme).toContain("no default telemetry");
    expect(readme).toContain("does not automatically upload your vault content to developer servers");
    expect(readme).toContain("actively import a link");
    expect(readme).toContain("requests that page in order to extract the title, description, and other link information");
    expect(readme).toContain("current text content be sent to the model service you specified");
    expect(readme).toContain("do not use link import, and do not configure or trigger AI, Glitter will not make extra network requests");
  });
});
