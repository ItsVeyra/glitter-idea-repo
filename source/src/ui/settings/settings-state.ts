/**
 * 设置页状态构造器。
 * 负责生成设置工作区的不同评审场景文案与分区数据。
 */

// 设置页视图模型与评审场景类型。
export type SettingsScenario =
  | "settings-default"
  | "settings-reduced-motion"
  | "settings-conflict";

export interface SettingsViewState {
  title: string;
  subtitle: string;
  sections: SettingsSection[];
}

export interface SettingsSection {
  title: string;
  description: string;
  items: SettingsItem[];
}

export interface SettingsItem {
  label: string;
  value: string;
  hint: string;
}

// 各类设置页静态状态工厂。
function createDefaultState(): SettingsViewState {
  return {
    title: "Settings",
    subtitle: "Adjust motion, theme, and deterministic pool color mappings.",
    sections: [
      {
        title: "Motion",
        description: "Control animation intensity for deterministic review runs.",
        items: [
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
        ]
      },
      {
        title: "Theme",
        description: "Align the preview shell with Obsidian appearance mode.",
        items: [
          {
            label: "UI theme mode",
            value: "obsidian-dark",
            hint: "Use the dark mode palette baseline."
          }
        ]
      },
      {
        title: "Pool colors",
        description: "Deterministic color assignments for core pools.",
        items: [
          {
            label: "unsorted",
            value: "#6ab5ff",
            hint: "Default inbox pool accent."
          },
          {
            label: "product",
            value: "#74ccba",
            hint: "Product exploration pool accent."
          },
          {
            label: "research",
            value: "#ffa980",
            hint: "Research pool accent."
          },
          {
            label: "writing",
            value: "#ffd468",
            hint: "Writing pool accent."
          },
          {
            label: "unnamed",
            value: "#b794ff",
            hint: "Fallback pool accent."
          }
        ]
      }
    ]
  };
}

function createReducedMotionState(): SettingsViewState {
  const base = createDefaultState();

  return {
    ...base,
    subtitle: "Reduced-motion profile for accessibility reviews and calmer shell behavior.",
    sections: base.sections.map((section) => {
      if (section.title !== "Motion") {
        return {
          ...section,
          items: section.items.map((item) => ({ ...item }))
        };
      }

      return {
        ...section,
        items: section.items.map((item) => {
          if (item.label === "Reduced motion") {
            return {
              ...item,
              value: "On",
              hint: "Prefer reduced transitions and animation amplitude."
            };
          }

          if (item.label === "Ambient motion") {
            return {
              ...item,
              value: "Off",
              hint: "Suppress ambient movement in preview shells."
            };
          }

          return { ...item };
        })
      };
    })
  };
}

function createConflictState(): SettingsViewState {
  return {
    title: "Settings",
    subtitle: "Conflict diagnostics highlight incompatible combinations before capture starts.",
    sections: [
      {
        title: "Motion",
        description: "Resolve contradictory animation preferences.",
        items: [
          {
            label: "Reduced motion",
            value: "On",
            hint: "Accessibility preference is enabled."
          },
          {
            label: "Ambient motion",
            value: "On",
            hint: "Conflict: ambient animation should be disabled when reduced motion is enabled."
          }
        ]
      },
      {
        title: "Theme",
        description: "Identify mismatch between selected and effective theme baseline.",
        items: [
          {
            label: "UI theme mode",
            value: "obsidian-light",
            hint: "Conflict: preview currently reports a dark shell baseline."
          }
        ]
      },
      {
        title: "Pool colors",
        description: "Highlight duplicate and invalid color assignments.",
        items: [
          {
            label: "unsorted",
            value: "#6ab5ff",
            hint: "Valid hex color."
          },
          {
            label: "product",
            value: "#6ab5ff",
            hint: "Conflict: duplicated with unsorted."
          },
          {
            label: "research",
            value: "#ffa980",
            hint: "Valid hex color."
          },
          {
            label: "writing",
            value: "amber",
            hint: "Conflict: must use a #RRGGBB hex value."
          },
          {
            label: "unnamed",
            value: "#b794ff",
            hint: "Valid hex color."
          }
        ]
      }
    ]
  };
}

// 设置页状态构建入口。
export function buildSettingsViewState(scenario: SettingsScenario): SettingsViewState {
  if (scenario === "settings-default") {
    return createDefaultState();
  }

  if (scenario === "settings-reduced-motion") {
    return createReducedMotionState();
  }

  if (scenario === "settings-conflict") {
    return createConflictState();
  }

  throw new Error(`buildSettingsViewState does not support scenario: ${scenario}`);
}
