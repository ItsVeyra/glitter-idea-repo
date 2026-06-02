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
 * 保护插件命令总注册相关行为，避免后续重构时出现静默回退。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// 预先收口可重置的依赖替身，方便验证对外协作。
const {
  registerOpenMainViewCommandMock,
  registerOpenSearchViewCommandMock,
  registerOpenPoolViewCommandMock,
  registerQuickCaptureCommandMock,
  registerCreateFromSelectionCommandMock,
  registerInsertIdeaReferenceCommandMock
} = vi.hoisted(() => ({
  registerOpenMainViewCommandMock: vi.fn(),
  registerOpenSearchViewCommandMock: vi.fn(),
  registerOpenPoolViewCommandMock: vi.fn(),
  registerQuickCaptureCommandMock: vi.fn(),
  registerCreateFromSelectionCommandMock: vi.fn(),
  registerInsertIdeaReferenceCommandMock: vi.fn()
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/commands/open-main-view-command", () => ({
  registerOpenMainViewCommand: registerOpenMainViewCommandMock
}));

vi.mock("../../src/commands/open-search-view-command", () => ({
  registerOpenSearchViewCommand: registerOpenSearchViewCommandMock
}));

vi.mock("../../src/commands/open-pool-view-command", () => ({
  registerOpenPoolViewCommand: registerOpenPoolViewCommandMock
}));

vi.mock("../../src/commands/quick-capture-command", () => ({
  registerQuickCaptureCommand: registerQuickCaptureCommandMock
}));

vi.mock("../../src/commands/create-from-selection-command", () => ({
  registerCreateFromSelectionCommand: registerCreateFromSelectionCommandMock
}));

vi.mock("../../src/commands/insert-idea-command", () => ({
  registerInsertIdeaReferenceCommand: registerInsertIdeaReferenceCommandMock
}));

import { registerCommands } from "../../src/commands/register-commands";

// 覆盖命令注册后对外暴露的回调连线与委托契约。
describe("registerCommands", () => {
  beforeEach(() => {
    registerOpenMainViewCommandMock.mockReset();
    registerOpenSearchViewCommandMock.mockReset();
    registerOpenPoolViewCommandMock.mockReset();
    registerQuickCaptureCommandMock.mockReset();
    registerCreateFromSelectionCommandMock.mockReset();
    registerInsertIdeaReferenceCommandMock.mockReset();
  });

  it("only registers feature commands enabled by settings", () => {
    const plugin = {
      settings: {
        enableQuickCapture: false,
        enableCreateFromSelection: true,
        enableInsertIdeaReference: false
      }
    };

    registerCommands(plugin as any);

    expect(registerOpenMainViewCommandMock).toHaveBeenCalledWith(plugin);
    expect(registerOpenSearchViewCommandMock).toHaveBeenCalledWith(plugin);
    expect(registerOpenPoolViewCommandMock).toHaveBeenCalledWith(plugin);
    expect(registerCreateFromSelectionCommandMock).toHaveBeenCalledWith(plugin);
    expect(registerQuickCaptureCommandMock).not.toHaveBeenCalled();
    expect(registerInsertIdeaReferenceCommandMock).not.toHaveBeenCalled();
  });
});
