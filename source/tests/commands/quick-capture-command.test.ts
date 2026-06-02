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
 * 保护快速捕获命令的注册与窗口触发相关行为，避免后续重构时出现静默回退。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_NEW_POOL_ID } from "../../src/plugin/constants";

// 预先收口可重置的依赖替身，方便验证对外协作。
const { quickCaptureOpenMock, poolOpenMock, quickCaptureInstances, poolModalInstances } = vi.hoisted(() => ({
  quickCaptureOpenMock: vi.fn(),
  poolOpenMock: vi.fn(),
  quickCaptureInstances: [] as Array<{
    step: "capture" | "saved-feedback";
    handlers: {
      onSaved?: (selection?: {
        poolId?: string;
        poolLabel?: string;
        createFileChecked?: boolean;
      }) => void;
      onBackHome?: () => void;
      onPoolPickerOpen?: (step?: "choose" | "create") => void;
    };
    options?: {
      flowContext?: "first-use" | "global";
      initialCreateFileChecked?: boolean;
      initialSelectedPoolId?: string;
      initialSelectedPoolLabel?: string;
    };
  }>,
  poolModalInstances: [] as Array<{
    step: "choose" | "create";
    handlers: {
      onPoolChosen?: (poolId: string) => void;
      onBackToChoose?: () => void;
      onBackToPrevious?: () => void;
    };
  }>
}));

// 用模块桩固定外部依赖，让断言聚焦当前单元的编排结果。
vi.mock("../../src/views/quick-capture-modal", () => ({
  QuickCaptureModal: vi.fn().mockImplementation((_plugin, step, handlers, options) => {
    quickCaptureInstances.push({ step, handlers, options });
    return {
      open: quickCaptureOpenMock
    };
  })
}));

vi.mock("../../src/views/pool-modal", () => ({
  PoolModal: vi.fn().mockImplementation((_plugin, step, handlers) => {
    poolModalInstances.push({ step, handlers });
    return {
      open: poolOpenMock
    };
  })
}));

import { registerQuickCaptureCommand } from "../../src/commands/quick-capture-command";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

// 提供测试夹具与辅助查询函数，减少重复的宿主搭建。
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// 覆盖命令注册后对外暴露的回调连线与委托契约。
describe("registerQuickCaptureCommand", () => {
  beforeEach(() => {
    quickCaptureOpenMock.mockReset();
    poolOpenMock.mockReset();
    quickCaptureInstances.length = 0;
    poolModalInstances.length = 0;
  });

  it("reopens global quick capture with choose or create pool modal based on trigger", async () => {
    let registeredCommand:
      | {
          callback: () => void;
          hotkeys?: Array<{ modifiers: string[]; key: string }>;
        }
      | undefined;
    let commandCallback: (() => void) | undefined;

    let selectedPoolState = { id: "pool-default", label: "默认池" };
    const setGlobalSelectedPoolState = vi.fn(async (poolId: string) => {
      const labels: Record<string, string> = {
        "pool-default": "默认池",
        "pool-research": "调研池",
        "pool-writing": "写作池",
        "pool-new": "新建池"
      };
      selectedPoolState = {
        id: poolId,
        label: labels[poolId] ?? selectedPoolState.label
      };
      return selectedPoolState;
    });
    const activatePoolView = vi.fn(async () => undefined);
    const refreshOpenPoolViews = vi.fn();

    const plugin = {
      app: {},
      settings: {
        hotkeys: {
          ...DEFAULT_SETTINGS.hotkeys
        }
      },
      activatePoolView,
      refreshOpenPoolViews,
      quickCaptureWorkflow: {
        getGlobalSelectedPoolState: vi.fn(() => ({ ...selectedPoolState })),
        setGlobalSelectedPoolState
      },
      addCommand: vi.fn((command: { callback: () => void; hotkeys?: Array<{ modifiers: string[]; key: string }> }) => {
        registeredCommand = command;
        commandCallback = command.callback;
      })
    };

    registerQuickCaptureCommand(plugin as any);

    expect(commandCallback).toBeTypeOf("function");
    expect(registeredCommand?.hotkeys).toEqual([
      {
        modifiers: ["Mod", "Shift"],
        key: "J"
      }
    ]);
    commandCallback?.();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(1);
    expect(quickCaptureInstances[0]?.step).toBe("capture");
    expect(quickCaptureInstances[0]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-default",
        initialSelectedPoolLabel: "默认池"
      })
    );

    quickCaptureInstances[0]?.handlers.onPoolPickerOpen?.();
    expect(poolOpenMock).toHaveBeenCalledTimes(1);
    expect(poolModalInstances[0]?.step).toBe("choose");

    poolModalInstances[0]?.handlers.onPoolChosen?.("pool-research");
    await flushMicrotasks();
    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(2);
    expect(quickCaptureInstances[1]?.step).toBe("capture");
    expect(quickCaptureInstances[1]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-research",
        initialSelectedPoolLabel: "调研池"
      })
    );

    quickCaptureInstances[1]?.handlers.onPoolPickerOpen?.("create");
    expect(poolOpenMock).toHaveBeenCalledTimes(2);
    expect(poolModalInstances[1]?.step).toBe("create");

    poolModalInstances[1]?.handlers.onBackToChoose?.();
    await flushMicrotasks();
    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(3);
    expect(quickCaptureInstances[2]?.step).toBe("capture");
    expect(quickCaptureInstances[2]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-research",
        initialSelectedPoolLabel: "调研池"
      })
    );

    quickCaptureInstances[2]?.handlers.onPoolPickerOpen?.();
    expect(poolOpenMock).toHaveBeenCalledTimes(3);
    expect(poolModalInstances[2]?.step).toBe("choose");

    poolModalInstances[2]?.handlers.onPoolChosen?.(CREATE_NEW_POOL_ID);
    expect(poolOpenMock).toHaveBeenCalledTimes(4);
    expect(poolModalInstances[3]?.step).toBe("create");

    poolModalInstances[3]?.handlers.onPoolChosen?.("pool-new");
    await flushMicrotasks();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(4);
    expect(quickCaptureInstances[3]?.step).toBe("capture");
    expect(quickCaptureInstances[3]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-new",
        initialSelectedPoolLabel: "新建池"
      })
    );
  });

  it("returns global choose modal back to capture", async () => {
    let registeredCommand:
      | {
          callback: () => void;
        }
      | undefined;

    const plugin = {
      settings: {
        hotkeys: {
          globalQuickCapture: DEFAULT_SETTINGS.hotkeys.globalQuickCapture
        }
      },
      quickCaptureWorkflow: {
        getGlobalSelectedPoolState: vi.fn(() => ({ id: "pool-default", label: "默认池" })),
        setGlobalSelectedPoolState: vi.fn(async () => ({ id: "pool-default", label: "默认池" }))
      },
      activatePoolView: vi.fn(async () => undefined),
      addCommand: vi.fn((command: { callback: () => void }) => {
        registeredCommand = command;
      })
    };

    registerQuickCaptureCommand(plugin as any);
    registeredCommand?.callback();

    quickCaptureInstances[0]?.handlers.onPoolPickerOpen?.();
    expect(poolModalInstances[0]?.step).toBe("choose");
    expect(poolModalInstances[0]?.handlers.onBackToPrevious).toEqual(expect.any(Function));

    poolModalInstances[0]?.handlers.onBackToPrevious?.();
    await flushMicrotasks();

    expect(quickCaptureOpenMock).toHaveBeenCalledTimes(2);
    expect(quickCaptureInstances[1]?.step).toBe("capture");
    expect(quickCaptureInstances[1]?.options).toEqual(
      expect.objectContaining({
        flowContext: "global",
        initialSelectedPoolId: "pool-default",
        initialSelectedPoolLabel: "默认池"
      })
    );
  });

  it("registers a custom global quick capture hotkey from settings", () => {
    let registeredCommand:
      | {
          callback: () => void;
          hotkeys?: Array<{ modifiers: string[]; key: string }>;
        }
      | undefined;

    const plugin = {
      app: {},
      settings: {
        hotkeys: {
          ...DEFAULT_SETTINGS.hotkeys,
          globalQuickCapture: "Ctrl+Alt+K"
        }
      },
      quickCaptureWorkflow: {
        getGlobalSelectedPoolState: vi.fn(() => ({ id: "pool-default", label: "默认池" })),
        setGlobalSelectedPoolState: vi.fn(async () => ({ id: "pool-default", label: "默认池" }))
      },
      activatePoolView: vi.fn(async () => undefined),
      addCommand: vi.fn((command: { callback: () => void; hotkeys?: Array<{ modifiers: string[]; key: string }> }) => {
        registeredCommand = command;
      })
    };

    registerQuickCaptureCommand(plugin as any);

    expect(registeredCommand?.hotkeys).toEqual([
      {
        modifiers: ["Ctrl", "Alt"],
        key: "K"
      }
    ]);
  });

  it("falls back to the built-in global quick capture hotkey when saved settings still store null", () => {
    let registeredCommand:
      | {
          callback: () => void;
          hotkeys?: Array<{ modifiers: string[]; key: string }>;
        }
      | undefined;

    const plugin = {
      app: {},
      settings: {
        hotkeys: {
          ...DEFAULT_SETTINGS.hotkeys,
          globalQuickCapture: null
        }
      },
      quickCaptureWorkflow: {
        getGlobalSelectedPoolState: vi.fn(() => ({ id: "pool-default", label: "默认池" })),
        setGlobalSelectedPoolState: vi.fn(async () => ({ id: "pool-default", label: "默认池" }))
      },
      activatePoolView: vi.fn(async () => undefined),
      addCommand: vi.fn((command: { callback: () => void; hotkeys?: Array<{ modifiers: string[]; key: string }> }) => {
        registeredCommand = command;
      })
    };

    registerQuickCaptureCommand(plugin as any);

    expect(registeredCommand?.hotkeys).toEqual([
      {
        modifiers: ["Mod", "Shift"],
        key: "J"
      }
    ]);
  });

  it("preserves selected pool when moving between capture and saved-feedback", async () => {
    let commandCallback: (() => void) | undefined;

    let selectedPoolState = { id: "pool-default", label: "默认池" };
    const setGlobalSelectedPoolState = vi.fn(async (poolId: string) => {
      const labels: Record<string, string> = {
        "pool-default": "默认池",
        "pool-product": "产品池",
        "pool-research": "调研池"
      };
      selectedPoolState = {
        id: poolId,
        label: labels[poolId] ?? selectedPoolState.label
      };
      return selectedPoolState;
    });
    const activatePoolView = vi.fn(async () => undefined);
    const refreshOpenPoolViews = vi.fn();

    const plugin = {
      app: {},
      settings: {
        hotkeys: {
          ...DEFAULT_SETTINGS.hotkeys
        }
      },
      activatePoolView,
      refreshOpenPoolViews,
      quickCaptureWorkflow: {
        getGlobalSelectedPoolState: vi.fn(() => ({ ...selectedPoolState })),
        setGlobalSelectedPoolState
      },
      addCommand: vi.fn((command: { callback: () => void }) => {
        commandCallback = command.callback;
      })
    };

    registerQuickCaptureCommand(plugin as any);
    commandCallback?.();

    quickCaptureInstances[0]?.handlers.onPoolPickerOpen?.();
    poolModalInstances[0]?.handlers.onPoolChosen?.("pool-product");
    await flushMicrotasks();

    quickCaptureInstances[1]?.handlers.onSaved?.({
      poolId: "pool-product",
      poolLabel: "产品池",
      createFileChecked: true
    });
    expect(refreshOpenPoolViews).toHaveBeenCalledTimes(1);
    expect(quickCaptureInstances[2]?.step).toBe("saved-feedback");
    expect(quickCaptureInstances[2]?.options).toEqual(
      expect.objectContaining({
        initialCreateFileChecked: true,
        initialSelectedPoolId: "pool-product",
        initialSelectedPoolLabel: "产品池"
      })
    );

    quickCaptureInstances[2]?.handlers.onSaved?.();
    expect(refreshOpenPoolViews).toHaveBeenCalledTimes(1);
    expect(quickCaptureInstances[3]?.step).toBe("capture");
    expect(quickCaptureInstances[3]?.options).toEqual(
      expect.objectContaining({
        initialSelectedPoolId: "pool-product",
        initialSelectedPoolLabel: "产品池"
      })
    );

    quickCaptureInstances[2]?.handlers.onBackHome?.();
    await flushMicrotasks();

    expect(activatePoolView).toHaveBeenCalledTimes(1);
    expect(activatePoolView).toHaveBeenCalledWith({
      poolId: "pool-product",
      resetFilters: true
    });
  });
});
