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
 * 保护浏览器首页适配器的页面与场景切换相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { createBrowserHomeAdapter } from "../../../src/host/browser/browser-home-adapter";

// 覆盖该工厂产物在主要协作路径上的行为契约。
describe("createBrowserHomeAdapter", () => {
  it("persists the active preview page and each page scenario separately", () => {
    const storageState = new Map<string, string>();
    const storage = {
      getItem(key: string): string | null {
        return storageState.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        storageState.set(key, value);
      }
    };

    const adapter = createBrowserHomeAdapter(storage);

    adapter.setPage("home");
    adapter.setScenario("settings-conflict", "home");
    adapter.setPage("search");
    adapter.setScenario("search-batch", "search");

    expect(adapter.getPage()).toBe("search");
    expect(adapter.getScenario("home")).toBe("settings-conflict");
    expect(adapter.getScenario("search")).toBe("search-batch");
  });

  it("falls back to home page and page-specific default scenarios when storage is empty", () => {
    const adapter = createBrowserHomeAdapter({
      getItem() {
        return null;
      },
      setItem() {}
    });

    expect(adapter.getPage()).toBe("home");
    expect(adapter.getScenario()).toBe("home-populated");
    expect(adapter.getScenario("search")).toBe("search-results");
  });

  it("falls back to home page and page-specific default scenarios when persisted values are invalid", () => {
    const storage = {
      getItem(key: string): string {
        if (key === "glitter-idea.preview.page") {
          return "unknown-page";
        }
        return "unknown-scenario";
      },
      setItem(): void {}
    };

    const adapter = createBrowserHomeAdapter(storage);

    expect(adapter.getPage()).toBe("home");
    expect(adapter.getScenario()).toBe("home-populated");
    expect(adapter.getScenario("search")).toBe("search-results");
  });

  it("falls back safely with page-specific defaults when storage getItem throws", () => {
    const storage = {
      getItem(): string | null {
        throw new Error("read failed");
      },
      setItem(): void {}
    };

    const adapter = createBrowserHomeAdapter(storage);

    expect(adapter.getPage()).toBe("home");
    expect(adapter.getScenario()).toBe("home-populated");
    expect(adapter.getScenario("search")).toBe("search-results");
  });

  it("does not throw when storage setItem throws", () => {
    const storage = {
      getItem(): string | null {
        return null;
      },
      setItem(): void {
        throw new Error("write failed");
      }
    };

    const adapter = createBrowserHomeAdapter(storage);

    expect(() => {
      adapter.setPage("home");
      adapter.setScenario("home-populated");
    }).not.toThrow();
  });
});
