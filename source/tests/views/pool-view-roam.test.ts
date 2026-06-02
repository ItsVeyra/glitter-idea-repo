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

import { describe, expect, it, vi } from "vitest";
import { createPoolViewRoamController } from "../../src/views/pool-view-roam";

describe("createPoolViewRoamController", () => {
  it("builds an empty roam panel state for a new session", () => {
    const controller = createPoolViewRoamController();

    expect(
      controller.buildPanelState({
        open: true,
        historyEnabled: true,
        boundaryAnchors: []
      })
    ).toEqual({
      open: true,
      mode: "empty",
      historyEnabled: true,
      floatingActions: ["download", "share", "history"],
      boundaryAnchors: []
    });
  });

  it("keeps session anchors visible across pool switches and clears them for a fresh session", () => {
    const controller = createPoolViewRoamController();

    controller.rememberSessionBoundaryAnchor({
      anchorId: "anchor-a",
      ideaId: "idea-product",
      poolId: "pool-product",
      poolName: "产品池",
      poolColor: "#6ab5ff",
      ideaTitle: "产品灵感"
    });
    controller.rememberSessionBoundaryAnchor({
      anchorId: "anchor-b",
      ideaId: "idea-writing",
      poolId: "pool-writing",
      poolName: "写作池",
      poolColor: "#ffd468",
      ideaTitle: "写作灵感"
    });

    expect(controller.readSessionBoundaryAnchors("pool-product")).toEqual([
      {
        anchorId: "anchor-a",
        ideaId: "idea-product",
        poolId: "pool-product",
        poolName: "产品池",
        poolColor: "#6ab5ff",
        ideaTitle: "产品灵感",
        visibleBridge: true
      },
      {
        anchorId: "anchor-b",
        ideaId: "idea-writing",
        poolId: "pool-writing",
        poolName: "写作池",
        poolColor: "#ffd468",
        ideaTitle: "写作灵感",
        visibleBridge: true
      }
    ]);
    expect(controller.readSessionBoundaryAnchors("pool-writing")).toEqual([
      {
        anchorId: "anchor-a",
        ideaId: "idea-product",
        poolId: "pool-product",
        poolName: "产品池",
        poolColor: "#6ab5ff",
        ideaTitle: "产品灵感",
        visibleBridge: true
      },
      {
        anchorId: "anchor-b",
        ideaId: "idea-writing",
        poolId: "pool-writing",
        poolName: "写作池",
        poolColor: "#ffd468",
        ideaTitle: "写作灵感",
        visibleBridge: true
      }
    ]);

    controller.clearSession();

    expect(controller.readSessionBoundaryAnchors("pool-product")).toEqual([]);
  });

  it("mounts the inline board host only for board mode and preserves non-board shell content", async () => {
    const mountInlineBoard = vi.fn(async () => undefined);
    const destroy = vi.fn();
    const controller = createPoolViewRoamController({
      canvasHost: {
        mountInlineBoard,
        mountModalBoard: vi.fn(async () => undefined),
        destroy
      }
    });
    const containerEl = { innerHTML: "" } as unknown as HTMLElement & { innerHTML: string };

    await controller.syncInlinePanel(
      containerEl,
      controller.buildPanelState({
        open: true,
        historyEnabled: true,
        boardPath: "Glitter/灵感漫游/demo.canvas",
        boundaryAnchors: []
      })
    );

    expect(mountInlineBoard).toHaveBeenCalledWith(containerEl, "Glitter/灵感漫游/demo.canvas");
    expect(destroy).not.toHaveBeenCalled();

    await controller.syncInlinePanel(
      containerEl,
      controller.buildPanelState({
        open: true,
        historyEnabled: true,
        boardPath: "Glitter/灵感漫游/demo.canvas",
        boundaryAnchors: []
      })
    );

    expect(mountInlineBoard).toHaveBeenCalledTimes(1);

    await controller.syncInlinePanel(
      containerEl,
      controller.buildPanelState({
        open: true,
        historyEnabled: true,
        boardPath: "Glitter/灵感漫游/next.canvas",
        boundaryAnchors: []
      })
    );

    expect(mountInlineBoard).toHaveBeenNthCalledWith(2, containerEl, "Glitter/灵感漫游/next.canvas");

    containerEl.innerHTML = "<div>empty-shell</div>";

    await controller.syncInlinePanel(
      containerEl,
      controller.buildPanelState({
        open: true,
        historyEnabled: true,
        boundaryAnchors: []
      })
    );

    expect(containerEl.innerHTML).toBe("<div>empty-shell</div>");
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
