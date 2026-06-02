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
 * 归池流程弹窗。
 * 负责承载首次归池选择、新建池表单，以及两步之间的回退与确认流程。
 */

import { Modal } from "obsidian";
import type { FirstUseCommitResult } from "../application/first-use/first-use-workflow";
import type GlitterPlugin from "../plugin/GlitterPlugin";
import { CREATE_NEW_POOL_ID } from "../plugin/constants";
import { renderPoolView } from "../ui/pool/render-pool";
import { buildFirstUseChoosePoolState, buildFirstUseCreatePoolState } from "../ui/pool/pool-state";

// 归池弹窗的步骤与回调约定。
const FALLBACK_CREATE_POOL_COLOR_KEY = "unnamed" as const;

export interface PoolModalHandlers {
  onPoolChosen?: (poolId: string, poolName?: string, commitResult?: FirstUseCommitResult) => void;
  onBackToChoose?: () => void;
  onBackToPrevious?: () => void;
}

export interface PoolModalOptions {
  flowContext?: "first-use" | "global";
  origin?: "home-secondary-action" | "quick-capture-pool-picker" | "saved-feedback" | "capture";
}

export type PoolModalStep = "choose" | "create";

// 归池弹窗生命周期与步骤渲染。
export class PoolModal extends Modal {
  private readonly plugin: GlitterPlugin;

  private flowContext: "first-use" | "global" = "first-use";

  private outsideClickGuardHandler?: (event: MouseEvent) => void;

  private firstUseCommitInFlight = false;

  constructor(
    plugin: GlitterPlugin,
    private readonly step: PoolModalStep = "choose",
    private readonly handlers: PoolModalHandlers = {},
    private readonly options: PoolModalOptions = {}
  ) {
    super(plugin.app);
    this.plugin = plugin;
  }

  override onOpen(): void {
    this.flowContext = this.options.flowContext ?? "first-use";
    this.registerOutsideClickGuard();
    this.modalEl?.addClass?.(this.step === "create" ? "glitter-pool-modal--create" : "glitter-pool-modal--choose");
    void this.renderCurrentStep();
  }

  private registerOutsideClickGuard(): void {
    if (this.outsideClickGuardHandler) {
      return;
    }

    this.outsideClickGuardHandler = (event) => {
      const target = event.target;
      if (target && this.modalEl?.contains?.(target as Node)) {
        return;
      }

      event.preventDefault?.();
      event.stopPropagation?.();
    };

    this.containerEl?.addEventListener?.("click", this.outsideClickGuardHandler, true);
  }

  private unregisterOutsideClickGuard(): void {
    if (!this.outsideClickGuardHandler) {
      return;
    }

    this.containerEl?.removeEventListener?.("click", this.outsideClickGuardHandler, true);
    this.outsideClickGuardHandler = undefined;
  }

  // 根据当前步骤装配选池或建池页面。
  private async renderCurrentStep(): Promise<void> {
    this.containerEl?.addClass?.("glitter-pool-modal-host");
    this.modalEl?.addClass?.("glitter-pool-modal");
    if (this.flowContext === "first-use") {
      this.modalEl?.addClass?.("glitter-pool-modal--first-use");
    }
    this.contentEl?.addClass?.("glitter-pool-modal__content");

    const state =
      this.step === "create"
        ? buildFirstUseCreatePoolState({
            flowContext: this.flowContext,
            poolColors: this.plugin.settings?.poolColors
          })
        : buildFirstUseChoosePoolState({
            pools: (await this.plugin.poolService.listPools()).map((pool) => ({
              id: pool.id,
              name: pool.name,
              ideaCount: 0
            }))
          });

    renderPoolView(this.contentEl, state, {
      onBack: () => {
        this.close();
        if (this.step === "create") {
          this.handlers.onBackToChoose?.();
          return;
        }

        this.handlers.onBackToPrevious?.();
      },
      onClose: () => {
        this.close();
      },
      onItemSelect: (itemId) => {
        void this.handleItemSelect(itemId);
      },
      onCreateIdea: () => undefined
    });
  }

  // 处理选池、新建池和首次提交流程。
  private async handleItemSelect(itemId: string): Promise<void> {
    if (this.step === "create") {
      const nameInput = this.contentEl.querySelector<HTMLInputElement>(".glitter-pool-stage__field-input");
      const descriptionInput = this.contentEl.querySelector<HTMLTextAreaElement>(
        ".glitter-pool-stage__field-input--textarea"
      );
      const createInput = {
        name: nameInput?.value?.trim() || "新建池",
        description: descriptionInput?.value?.trim() || undefined,
        color: this.resolveCreatePoolColor()
      };

      if (this.flowContext === "global") {
        const created = await this.plugin.poolService.createPool(createInput);
        this.close();
        this.handlers.onPoolChosen?.(created.id, created.name?.trim() || createInput.name);
        return;
      }

      if (this.firstUseCommitInFlight) {
        return;
      }

      this.firstUseCommitInFlight = true;
      try {
        const created = await this.plugin.firstUseWorkflow.commitDraftToNewPool(createInput);

        this.close();
        this.handlers.onPoolChosen?.(created.pool.id, created.pool.name?.trim() || createInput.name, created.commitResult);
      } finally {
        this.firstUseCommitInFlight = false;
      }
      return;
    }

    if (itemId === CREATE_NEW_POOL_ID) {
      this.close();
      this.handlers.onPoolChosen?.(itemId);
      return;
    }

    if (this.flowContext === "global") {
      this.close();
      this.handlers.onPoolChosen?.(itemId);
      return;
    }

    if (this.firstUseCommitInFlight) {
      return;
    }

    this.firstUseCommitInFlight = true;
    try {
      const commitResult = await this.plugin.firstUseWorkflow.commitDraftToExistingPool(itemId);
      this.close();
      this.handlers.onPoolChosen?.(itemId, undefined, commitResult);
    } finally {
      this.firstUseCommitInFlight = false;
    }
  }

  // 从当前表单中解析选中的池色。
  private resolveCreatePoolColor(): string | undefined {
    const swatch = this.contentEl.querySelector<HTMLButtonElement>(".glitter-pool-stage__swatch--selected");
    const selectedColor = swatch?.dataset.poolColor?.trim();

    if (selectedColor) {
      return selectedColor;
    }

    const swatchGroup = this.contentEl.querySelector<HTMLElement>(".glitter-pool-stage__swatches");
    const selectedGroupColor = swatchGroup?.dataset.selectedPoolColor?.trim();
    if (selectedGroupColor) {
      return selectedGroupColor;
    }

    const configuredColors = this.plugin.settings?.poolColors;
    return configuredColors?.[FALLBACK_CREATE_POOL_COLOR_KEY];
  }

  // 关闭时移除宿主样式与外层点击守卫。
  override onClose(): void {
    this.unregisterOutsideClickGuard();
    this.containerEl?.removeClass?.("glitter-pool-modal-host");
    this.modalEl?.removeClass?.("glitter-pool-modal");
    this.modalEl?.removeClass?.(this.step === "create" ? "glitter-pool-modal--create" : "glitter-pool-modal--choose");
    this.modalEl?.removeClass?.("glitter-pool-modal--first-use");
    this.contentEl?.removeClass?.("glitter-pool-modal__content");
    this.contentEl?.empty?.();
  }
}
