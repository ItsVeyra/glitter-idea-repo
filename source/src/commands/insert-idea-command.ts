/**
 * 片段插入命令注册器，连接快捷键、命令面板与编辑器右键菜单。
 * 负责解析用户配置的热键，并在触发后打开灵感选择器完成正文插片。
 */
import { Notice, type Hotkey, type Menu, type MenuItem, type Modifier } from "obsidian";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { getActiveEditor } from "../editor/editor-integration";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { IdeaPickerModal } from "../views/idea-picker-modal";

// 热键解析。
const HOTKEY_MODIFIER_ALIASES: Record<string, Modifier> = {
  mod: "Mod",
  ctrl: "Ctrl",
  control: "Ctrl",
  cmd: "Meta",
  command: "Meta",
  meta: "Meta",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
  opt: "Alt"
};

const HOTKEY_KEY_ALIASES: Record<string, string> = {
  enter: "Enter",
  return: "Enter",
  esc: "Escape",
  escape: "Escape",
  space: " ",
  spacebar: " "
};

function normalizeHotkeyKey(token: string): string | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (HOTKEY_KEY_ALIASES[normalized]) {
    return HOTKEY_KEY_ALIASES[normalized];
  }

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  if (/^f\d{1,2}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }

  return token.trim();
}

function parseConfiguredHotkey(value: string | null | undefined): Hotkey[] | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const tokens = normalized
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return undefined;
  }

  const key = normalizeHotkeyKey(tokens[tokens.length - 1] ?? "");
  if (!key) {
    return undefined;
  }

  const modifiers: Modifier[] = [];
  const seenModifiers = new Set<Modifier>();
  for (const token of tokens.slice(0, -1)) {
    const modifier = HOTKEY_MODIFIER_ALIASES[token.toLowerCase()];
    if (!modifier || seenModifiers.has(modifier)) {
      return undefined;
    }

    seenModifiers.add(modifier);
    modifiers.push(modifier);
  }

  return [{ modifiers, key }];
}

function buildInsertIdeaReferenceMenuTitle(hotkey: string | null | undefined): string {
  const hint = hotkey?.trim() || DEFAULT_SETTINGS.hotkeys.insertIdeaReference || "";
  return hint ? `插入灵感片段（${hint}）` : "插入灵感片段";
}

type UndocumentedSubmenuMenuItem = MenuItem & {
  setSubmenu?: () => Menu;
};

function addInsertIdeaReferenceMenuAction(
  item: Pick<MenuItem, "setTitle" | "onClick">,
  plugin: GlitterPlugin,
  editor: Parameters<typeof openInsertIdeaReferencePicker>[1],
  notePath: string | null,
  hotkey: string | null | undefined
): void {
  item.setTitle(buildInsertIdeaReferenceMenuTitle(hotkey)).onClick(() => {
    void openInsertIdeaReferencePicker(plugin, editor, notePath);
  });
}

// 片段选择器打开逻辑。
async function openInsertIdeaReferencePicker(
  plugin: GlitterPlugin,
  editor = getActiveEditor(plugin),
  notePath = plugin.app.workspace.getActiveFile()?.path ?? null
): Promise<void> {
  if (!editor || !notePath) {
    return;
  }

  const picker = new IdeaPickerModal(plugin, async (ideaId) => {
    await plugin.editorWorkflow.insertIdeaReference({
      ideaId,
      editor,
      notePath,
      emoji: plugin.settings.referencedIdeaEmoji
    });
    editor.focus();
    new Notice("已插入灵感片段");
  });

  picker.open();
}

// 命令与菜单注册。
export function registerInsertIdeaReferenceCommand(plugin: GlitterPlugin): void {
  const configuredHotkey = plugin.settings.hotkeys.insertIdeaReference?.trim() || DEFAULT_SETTINGS.hotkeys.insertIdeaReference;

  plugin.addCommand({
    id: "insert-idea-reference",
    name: "Insert Glitter snippet",
    hotkeys: parseConfiguredHotkey(configuredHotkey),
    callback: async () => {
      await openInsertIdeaReferencePicker(plugin);
    }
  });

  plugin.registerEvent?.(
    plugin.app.workspace.on("editor-menu", (menu, editor, info) => {
      menu.addItem((item) => {
        const notePath = info.file?.path ?? null;
        const submenuItem = item as UndocumentedSubmenuMenuItem;
        if (typeof submenuItem.setSubmenu === "function") {
          submenuItem.setTitle("Glitter");
          const submenu = submenuItem.setSubmenu();
          submenu.addItem((submenuEntry) => {
            addInsertIdeaReferenceMenuAction(submenuEntry, plugin, editor, notePath, configuredHotkey);
          });
          return;
        }

        addInsertIdeaReferenceMenuAction(item, plugin, editor, notePath, configuredHotkey);
      });
    })
  );
}
