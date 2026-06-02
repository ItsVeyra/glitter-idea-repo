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
 * 保护设置页状态装配相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it } from "vitest";
import { buildSettingsViewState } from "../../../src/ui/settings/settings-state";

// 覆盖状态装配函数在主要输入场景下的输出契约。
describe("buildSettingsViewState", () => {
  it("builds default settings state deterministically", () => {
    const state = buildSettingsViewState("settings-default");

    expect(state.title).toBe("Settings");
    expect(state.sections).toHaveLength(3);

    const motionSection = state.sections.find((section) => section.title === "Motion");
    expect(motionSection).toBeDefined();
    expect(motionSection?.items).toEqual([
      {
        label: "Reduced motion",
        value: "Off",
        hint: "Standard motion remains enabled."
      },
      {
        label: "Ambient motion",
        value: "On",
        hint: "Background ambient effects are allowed."
      }
    ]);

    const poolSection = state.sections.find((section) => section.title === "Pool colors");
    expect(poolSection?.items.map((item) => item.label)).toEqual([
      "unsorted",
      "product",
      "research",
      "writing",
      "unnamed"
    ]);
  });

  it("builds reduced-motion scenario with motion preferences flipped", () => {
    const state = buildSettingsViewState("settings-reduced-motion");

    const motionSection = state.sections.find((section) => section.title === "Motion");
    expect(motionSection).toBeDefined();

    const reducedMotion = motionSection?.items.find((item) => item.label === "Reduced motion");
    const ambientMotion = motionSection?.items.find((item) => item.label === "Ambient motion");

    expect(reducedMotion?.value).toBe("On");
    expect(ambientMotion?.value).toBe("Off");
  });

  it("builds conflict scenario with conflict hints", () => {
    const state = buildSettingsViewState("settings-conflict");

    expect(state.subtitle).toContain("Conflict diagnostics");

    const motionSection = state.sections.find((section) => section.title === "Motion");
    const ambientMotion = motionSection?.items.find((item) => item.label === "Ambient motion");
    expect(ambientMotion?.hint).toContain("Conflict");

    const poolSection = state.sections.find((section) => section.title === "Pool colors");
    const writingColor = poolSection?.items.find((item) => item.label === "writing");
    expect(writingColor?.value).toBe("amber");
    expect(writingColor?.hint).toContain("must use a #RRGGBB hex value");
  });

  it("throws for unsupported scenarios", () => {
    expect(() =>
      buildSettingsViewState("unknown-settings-scenario" as unknown as "settings-default")
    ).toThrow("buildSettingsViewState does not support scenario: unknown-settings-scenario");
  });
});
