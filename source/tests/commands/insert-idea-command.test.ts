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
 * 保护插入灵感引用命令的注册与委托相关行为，避免后续重构时出现静默回退。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// 预先收口可重置的依赖替身，方便验证对外协作。
const {
  getActiveEditorMock,
  ideaPickerOpenMock,
  ideaPickerInstances,
  noticeConstructorMock
} = vi.hoisted(() => ({
  getActiveEditorMock: vi.fn(),
  ideaPickerOpenMock: vi.fn(),
  ideaPickerInstances: [] as Array<{
    onPick: (ideaId: string) => Promise<void>;
  }>,
  noticeConstructorMock: vi.fn()
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("obsidian", () => ({
  Notice: vi.fn(function noticeConstructor(message: string) {
    noticeConstructorMock(message);
  })
}));

vi.mock("../../src/editor/editor-integration", () => ({
  getActiveEditor: getActiveEditorMock
}));

vi.mock("../../src/views/idea-picker-modal", () => ({
  IdeaPickerModal: vi.fn().mockImplementation((_plugin, onPick) => {
    ideaPickerInstances.push({ onPick });
    return {
      open: ideaPickerOpenMock
    };
  })
}));

import { registerInsertIdeaReferenceCommand } from "../../src/commands/insert-idea-command";

// 覆盖命令注册后对外暴露的回调连线与委托契约。
describe("registerInsertIdeaReferenceCommand", () => {
  beforeEach(() => {
    getActiveEditorMock.mockReset();
    ideaPickerOpenMock.mockReset();
    ideaPickerInstances.length = 0;
    noticeConstructorMock.mockReset();
  });

  it("registers the editor snippet insertion command with a configured hotkey", () => {
    let registeredCommand:
      | {
          id: string;
          name: string;
          hotkeys?: Array<{ modifiers: string[]; key: string }>;
          callback: () => Promise<void>;
        }
      | undefined;

    const plugin = {
      app: {
        workspace: {
          getActiveFile: vi.fn(() => ({ path: "Welcome.md" })),
          on: vi.fn(() => ({}))
        }
      },
      registerEvent: vi.fn(),
      settings: {
        referencedIdeaEmoji: "⭐",
        hotkeys: {
          insertIdeaReference: "Ctrl+Alt+K"
        }
      },
      editorWorkflow: {
        insertIdeaReference: vi.fn(async () => undefined)
      },
      addCommand(command: {
        id: string;
        name: string;
        hotkeys?: Array<{ modifiers: string[]; key: string }>;
        callback: () => Promise<void>;
      }) {
        registeredCommand = command;
      }
    };

    registerInsertIdeaReferenceCommand(plugin as any);

    expect(registeredCommand).toMatchObject({
      id: "insert-idea-reference",
      name: "Insert Glitter snippet",
      hotkeys: [
        {
          modifiers: ["Ctrl", "Alt"],
          key: "K"
        }
      ]
    });
  });

  it("parses modifier and key aliases in the configured hotkey", () => {
    let registeredCommand:
      | {
          hotkeys?: Array<{ modifiers: string[]; key: string }>;
        }
      | undefined;

    const plugin = {
      app: {
        workspace: {
          getActiveFile: vi.fn(() => ({ path: "Welcome.md" })),
          on: vi.fn(() => ({}))
        }
      },
      registerEvent: vi.fn(),
      settings: {
        referencedIdeaEmoji: "⭐",
        hotkeys: {
          insertIdeaReference: "cmd+return"
        }
      },
      editorWorkflow: {
        insertIdeaReference: vi.fn(async () => undefined)
      },
      addCommand(command: {
        hotkeys?: Array<{ modifiers: string[]; key: string }>;
      }) {
        registeredCommand = command;
      }
    };

    registerInsertIdeaReferenceCommand(plugin as any);

    expect(registeredCommand?.hotkeys).toEqual([
      {
        modifiers: ["Meta"],
        key: "Enter"
      }
    ]);
  });

  it("falls back to the default snippet hotkey when no custom hotkey is saved", () => {
    let registeredCommand:
      | {
          hotkeys?: Array<{ modifiers: string[]; key: string }>;
        }
      | undefined;

    const plugin = {
      app: {
        workspace: {
          getActiveFile: vi.fn(() => ({ path: "Welcome.md" })),
          on: vi.fn(() => ({}) )
        }
      },
      registerEvent: vi.fn(),
      settings: {
        referencedIdeaEmoji: "⭐",
        hotkeys: {
          insertIdeaReference: null
        }
      },
      editorWorkflow: {
        insertIdeaReference: vi.fn(async () => undefined)
      },
      addCommand(command: {
        hotkeys?: Array<{ modifiers: string[]; key: string }>;
      }) {
        registeredCommand = command;
      }
    };

    registerInsertIdeaReferenceCommand(plugin as any);

    expect(registeredCommand?.hotkeys).toEqual([
      {
        modifiers: ["Mod", "Shift"],
        key: "I"
      }
    ]);
  });

  it("registers an editor Glitter submenu with a shortcut hint and opens the snippet picker for the clicked editor", async () => {
    let registeredCommand: { callback: () => Promise<void> } | undefined;
    let editorMenuHandler:
      | ((menu: {
        addItem: (builder: (item: {
          setTitle: (title: string) => typeof item;
          onClick: (callback: () => void | Promise<void>) => typeof item;
          setSubmenu: () => {
            addItem: (builder: (item: {
              setTitle: (title: string) => typeof item;
              onClick: (callback: () => void | Promise<void>) => typeof item;
            }) => void) => void;
          };
        }) => void) => void;
      }, editor: { focus: () => void }, info: { file?: { path: string } }) => void)
      | undefined;
    const focus = vi.fn();
    const insertIdeaReference = vi.fn(async () => undefined);
    let menuItemTitle = "";
    let submenuItemTitle = "";
    let submenuItemClick: (() => void | Promise<void>) | undefined;

    const menu = {
      addItem(builder: (item: {
        setTitle: (title: string) => any;
        onClick: (callback: () => void | Promise<void>) => any;
        setSubmenu: () => {
          addItem: (builder: (item: {
            setTitle: (title: string) => any;
            onClick: (callback: () => void | Promise<void>) => any;
          }) => void) => void;
        };
      }) => void) {
        const submenu = {
          addItem(builder: (item: {
            setTitle: (title: string) => any;
            onClick: (callback: () => void | Promise<void>) => any;
          }) => void) {
            const submenuItem = {
              setTitle(title: string) {
                submenuItemTitle = title;
                return submenuItem;
              },
              onClick(callback: () => void | Promise<void>) {
                submenuItemClick = callback;
                return submenuItem;
              }
            };
            builder(submenuItem);
          }
        };
        const item = {
          setTitle(title: string) {
            menuItemTitle = title;
            return item;
          },
          onClick(_callback: () => void | Promise<void>) {
            return item;
          },
          setSubmenu() {
            return submenu;
          }
        };
        builder(item);
      }
    };

    const plugin = {
      app: {
        workspace: {
          getActiveFile: vi.fn(() => ({ path: "Active.md" })),
          on: vi.fn((event: string, callback: typeof editorMenuHandler) => {
            if (event === "editor-menu") {
              editorMenuHandler = callback;
            }
            return { event, callback };
          })
        }
      },
      registerEvent: vi.fn(),
      settings: {
        referencedIdeaEmoji: "⭐",
        hotkeys: {
          insertIdeaReference: null
        }
      },
      editorWorkflow: {
        insertIdeaReference
      },
      addCommand(command: { callback: () => Promise<void> }) {
        registeredCommand = command;
      }
    };

    registerInsertIdeaReferenceCommand(plugin as any);

    expect(plugin.registerEvent).toHaveBeenCalledTimes(1);
    expect(editorMenuHandler).toBeTypeOf("function");

    editorMenuHandler?.(menu as any, { focus } as any, { file: { path: "Clicked.md" } } as any);
    expect(menuItemTitle).toBe("Glitter");
    expect(submenuItemTitle).toBe("插入灵感片段（Mod+Shift+I）");

    await submenuItemClick?.();

    expect(ideaPickerOpenMock).toHaveBeenCalledTimes(1);
    await ideaPickerInstances[0]?.onPick("idea-1");
    expect(insertIdeaReference).toHaveBeenCalledWith({
      ideaId: "idea-1",
      editor: { focus },
      notePath: "Clicked.md",
      emoji: "⭐"
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(noticeConstructorMock).toHaveBeenCalledWith("已插入灵感片段");
    await registeredCommand?.callback();
  });

  it("opens picker, inserts snippet, refocuses the editor, and shows a notice", async () => {
    let registeredCommand:
      | {
          callback: () => Promise<void>;
        }
      | undefined;
    const replaceSelection = vi.fn();
    const focus = vi.fn();
    const insertIdeaReference = vi.fn(async () => undefined);

    getActiveEditorMock.mockReturnValue({
      replaceSelection,
      focus
    });

    const plugin = {
      app: {
        workspace: {
          getActiveFile: vi.fn(() => ({ path: "Welcome.md" }))
        }
      },
      settings: {
        referencedIdeaEmoji: "⭐",
        hotkeys: {
          insertIdeaReference: null
        }
      },
      editorWorkflow: {
        insertIdeaReference
      },
      addCommand(command: { callback: () => Promise<void> }) {
        registeredCommand = command;
      }
    };

    registerInsertIdeaReferenceCommand(plugin as any);

    await registeredCommand?.callback();

    expect(ideaPickerOpenMock).toHaveBeenCalledTimes(1);
    await ideaPickerInstances[0]?.onPick("idea-1");

    expect(insertIdeaReference).toHaveBeenCalledWith({
      ideaId: "idea-1",
      editor: { replaceSelection, focus },
      notePath: "Welcome.md",
      emoji: "⭐"
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(noticeConstructorMock).toHaveBeenCalledWith("已插入灵感片段");
  });

  it("does nothing when there is no active file", async () => {
    let registeredCommand: { callback: () => Promise<void> } | undefined;
    const insertIdeaReference = vi.fn(async () => undefined);

    getActiveEditorMock.mockReturnValue({
      replaceSelection: vi.fn(),
      focus: vi.fn()
    });

    const plugin = {
      app: {
        workspace: {
          getActiveFile: vi.fn(() => null)
        }
      },
      settings: {
        referencedIdeaEmoji: "⭐",
        hotkeys: {
          insertIdeaReference: null
        }
      },
      editorWorkflow: {
        insertIdeaReference
      },
      addCommand(command: { callback: () => Promise<void> }) {
        registeredCommand = command;
      }
    };

    registerInsertIdeaReferenceCommand(plugin as any);

    await registeredCommand?.callback();

    expect(ideaPickerOpenMock).not.toHaveBeenCalled();
    expect(insertIdeaReference).not.toHaveBeenCalled();
    expect(noticeConstructorMock).not.toHaveBeenCalled();
  });

  it("does nothing when there is no active editor", async () => {
    let registeredCommand: { callback: () => Promise<void> } | undefined;
    const insertIdeaReference = vi.fn(async () => undefined);

    getActiveEditorMock.mockReturnValue(null);

    const plugin = {
      app: {
        workspace: {
          getActiveFile: vi.fn(() => ({ path: "Welcome.md" }))
        }
      },
      settings: {
        referencedIdeaEmoji: "⭐",
        hotkeys: {
          insertIdeaReference: null
        }
      },
      editorWorkflow: {
        insertIdeaReference
      },
      addCommand(command: { callback: () => Promise<void> }) {
        registeredCommand = command;
      }
    };

    registerInsertIdeaReferenceCommand(plugin as any);

    await registeredCommand?.callback();

    expect(ideaPickerOpenMock).not.toHaveBeenCalled();
    expect(insertIdeaReference).not.toHaveBeenCalled();
    expect(noticeConstructorMock).not.toHaveBeenCalled();
  });
});
