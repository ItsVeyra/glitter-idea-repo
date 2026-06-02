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
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Manifest = {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl: string;
  isDesktopOnly: boolean;
};

const testDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(testDir, "../..");
const releaseRoot = resolve(sourceRoot, "..");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("public release repository contract", () => {
  it("ships the required community-plugin files at the repository root", () => {
    const required = ["README.md", "LICENSE", "manifest.json", "versions.json", "main.js", "styles.css"];

    expect(required.every((file) => existsSync(resolve(releaseRoot, file)))).toBe(true);
  });

  it("keeps the release manifest aligned with the source review manifest", () => {
    const rootManifest = readJson<Manifest>(resolve(releaseRoot, "manifest.json"));
    const sourceManifest = readJson<Manifest>(resolve(sourceRoot, "manifest.json"));

    expect(rootManifest).toEqual(sourceManifest);
    expect(rootManifest.authorUrl).toBe("https://github.com/ItsVeyra");
    expect(rootManifest.description).not.toContain("Obsidian");
  });

  it("maps the published plugin version to its minimum Obsidian version", () => {
    const manifest = readJson<Manifest>(resolve(releaseRoot, "manifest.json"));
    const versions = readJson<Record<string, string>>(resolve(releaseRoot, "versions.json"));

    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
    expect(Object.keys(versions)).toContain(manifest.version);
  });

  it("keeps styles.css aligned between the release root and the source review workspace", () => {
    const rootStyles = readFileSync(resolve(releaseRoot, "styles.css"), "utf8");
    const sourceStyles = readFileSync(resolve(sourceRoot, "styles.css"), "utf8");

    expect(rootStyles).toBe(sourceStyles);
  });
});
