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
 * 保护从选区创建灵感命令的注册与委托相关行为，避免后续重构时出现静默回退。
 */

import { describe, expect, it, vi } from "vitest";

// 预先收口可重置的依赖替身，方便验证对外协作。
const { getActiveEditorMock } = vi.hoisted(() => ({
  getActiveEditorMock: vi.fn()
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/editor/editor-integration", () => ({
  getActiveEditor: getActiveEditorMock
}));

import { registerCreateFromSelectionCommand } from "../../src/commands/create-from-selection-command";

// 覆盖命令注册后对外暴露的回调连线与委托契约。
describe("registerCreateFromSelectionCommand", () => {
  it("delegates selection capture to editor workflow with active note path", async () => {
    let registeredCommand: { callback: () => Promise<void> } | undefined;
    const createIdeaFromSelection = vi.fn(async () => ({ id: "idea-1" }));

    getActiveEditorMock.mockReturnValue({
      getSelection: vi.fn(() => "选中的正文")
    });

    const plugin = {
      app: {
        workspace: {
          getActiveFile: vi.fn(() => ({ path: "Welcome.md" }))
        }
      },
      editorWorkflow: {
        createIdeaFromSelection
      },
      addCommand(command: { callback: () => Promise<void> }) {
        registeredCommand = command;
      }
    };

    registerCreateFromSelectionCommand(plugin as any);

    await registeredCommand?.callback();

    expect(createIdeaFromSelection).toHaveBeenCalledWith({
      selection: "选中的正文"
    });
  });
});
