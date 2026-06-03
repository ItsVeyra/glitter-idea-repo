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
 * 浏览器预览壳，负责在独立页面中驱动 Glitter 各页面与覆盖层的演示状态。
 * 统一管理预览页切换、场景持久化、快速记录覆盖层与各页面重渲染逻辑。
 */
import {
  REVIEW_SCENARIOS,
  createQuickCaptureRuntimeStateForScenario,
  createQuickCaptureWriteStateOverridesForScenario,
  type ReviewScenario
} from "../review/scenarios";
import {
  deriveQuickCaptureStateModel,
  type QuickCaptureFlowContext,
  type QuickCaptureRuntimeState
} from "../ui/write/quick-capture-runtime";
import { createBrowserHomeAdapter } from "../host/browser/browser-home-adapter";
import { buildHomeViewState } from "../ui/home/home-state";
import { renderHomeView } from "../ui/home/render-home";
import { buildSearchViewState } from "../ui/search/search-state";
import { renderSearchView } from "../ui/search/render-search";
import { buildPoolViewState, type PoolScenario } from "../ui/pool/pool-state";
import { renderPoolView } from "../ui/pool/render-pool";
import { buildWriteViewState } from "../ui/write/write-state";
import { renderWriteView } from "../ui/write/render-write";
import { buildFollowupGuidanceState, renderFollowupGuidanceView } from "../ui/shared/followup-guidance";
import { buildSettingsViewState, type SettingsScenario } from "../ui/settings/settings-state";
import { renderSettingsView } from "../ui/settings/render-settings";

// 预览页与场景枚举。
export const PREVIEW_PAGES = ["home", "search", "pool", "write", "settings"] as const;
export type PreviewPage = (typeof PREVIEW_PAGES)[number];

const PREVIEW_PAGE_SET = new Set<string>(PREVIEW_PAGES);
const STORAGE_PAGE_KEY = "glitter-idea.preview.page";
const STORAGE_SCENARIO_KEY_PREFIX = "glitter-idea.preview.scenario";

type AdapterPage = "home" | "search";
type PreviewOverlayStep = "capture" | "saved-feedback" | "pool-choose" | "pool-create" | "followup-guidance";

type OverlayCaptureStep = Extract<PreviewOverlayStep, "capture" | "saved-feedback">;

// 分页场景筛选。
// `settings-conflict` remains available on the home page preview because it predates
// the dedicated settings page and still represents a home-surface conflict banner state.
const HOME_SCENARIOS = REVIEW_SCENARIOS.filter(
  (scenario): scenario is ReviewScenario => scenario.startsWith("home-") || scenario === "settings-conflict"
);
const SEARCH_SCENARIOS = REVIEW_SCENARIOS.filter(
  (scenario): scenario is ReviewScenario => scenario.startsWith("search-")
);
const POOL_SCENARIOS = REVIEW_SCENARIOS.filter(
  (scenario): scenario is ReviewScenario => scenario.startsWith("pool-")
);
const WRITE_SCENARIOS = REVIEW_SCENARIOS.filter(
  (scenario): scenario is ReviewScenario =>
    scenario.startsWith("write-") || scenario.startsWith("quick-capture-")
);
const SETTINGS_SCENARIOS = REVIEW_SCENARIOS.filter(
  (scenario): scenario is ReviewScenario => scenario.startsWith("settings-")
);

type PreviewScenario = ReviewScenario;

export function scenariosForPage(page: PreviewPage): readonly PreviewScenario[] {
  switch (page) {
    case "home":
      return HOME_SCENARIOS;
    case "search":
      return SEARCH_SCENARIOS;
    case "pool":
      return POOL_SCENARIOS;
    case "write":
      return WRITE_SCENARIOS;
    case "settings":
      return SETTINGS_SCENARIOS;
  }
}

function fallbackScenarioForPage(page: PreviewPage): PreviewScenario {
  switch (page) {
    case "home":
      return "home-populated";
    case "search":
      return "search-results";
    case "pool":
      return "pool-browse";
    case "write":
      return "write-immersive-default";
    case "settings":
      return "settings-default";
  }
}

function ensureScenario(page: PreviewPage, value: unknown): PreviewScenario {
  const scenarios = scenariosForPage(page);
  if (typeof value === "string" && scenarios.includes(value as PreviewScenario)) {
    return value as PreviewScenario;
  }

  return fallbackScenarioForPage(page);
}

function ensurePage(value: unknown): PreviewPage {
  return typeof value === "string" && PREVIEW_PAGE_SET.has(value) ? (value as PreviewPage) : "home";
}

function isAdapterPage(page: PreviewPage): page is AdapterPage {
  return page === "home" || page === "search";
}

function scenarioStorageKeyFor(page: PreviewPage): string {
  return `${STORAGE_SCENARIO_KEY_PREFIX}.${page}`;
}

// 预览存储辅助。
type StorageLike = Pick<Storage, "getItem" | "setItem">;

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    }
  };
}

function getPreviewStorage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

function readStorage(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write failures for deterministic browser previews.
  }
}

// DOM 辅助与附件选择。
function clearContainer(containerEl: HTMLElement): void {
  containerEl.innerHTML = "";
}

function setClassFlag(element: HTMLElement, className: string, enabled: boolean): void {
  const classNames = new Set(element.className.split(/\s+/).filter(Boolean));
  if (enabled) {
    classNames.add(className);
  } else {
    classNames.delete(className);
  }
  element.className = Array.from(classNames).join(" ");
}

function openPreviewAttachmentPicker(
  hostEl: HTMLElement,
  onFilesSelected: (files: File[]) => void
): void {
  if (typeof document === "undefined" || !hostEl.ownerDocument) {
    return;
  }

  const inputEl = hostEl.ownerDocument.createElement("input") as HTMLInputElement;
  inputEl.type = "file";
  inputEl.accept = "image/*,video/*";
  inputEl.multiple = true;
  inputEl.style.display = "none";

  hostEl.appendChild(inputEl);

  inputEl.addEventListener("change", () => {
    const files = Array.from(inputEl.files ?? []).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    inputEl.remove();

    if (files.length === 0) {
      return;
    }

    onFilesSelected(files);
  });

  inputEl.click();
}

// 预览壳挂载与交互。
export function mountPreviewShell(containerEl: HTMLElement): void {
  // 外层壳体结构。
  containerEl.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "glitter-preview-shell";

  const header = document.createElement("header");
  header.className = "glitter-preview-shell__header";

  const title = document.createElement("h1");
  title.textContent = "Glitter Browser Preview";

  const controls = document.createElement("div");
  controls.className = "glitter-preview-shell__controls";

  const pageLabel = document.createElement("label");
  pageLabel.className = "glitter-preview-shell__page-label";
  pageLabel.textContent = "Page";

  const pageSelect = document.createElement("select");
  pageSelect.className = "glitter-preview-shell__page-select";

  PREVIEW_PAGES.forEach((page) => {
    const option = document.createElement("option");
    option.value = page;
    option.textContent = page;
    pageSelect.appendChild(option);
  });

  pageLabel.appendChild(pageSelect);

  const scenarioLabel = document.createElement("label");
  scenarioLabel.className = "glitter-preview-shell__scenario-label";
  scenarioLabel.textContent = "Scenario";

  const scenarioSelect = document.createElement("select");
  scenarioSelect.className = "glitter-preview-shell__scenario-select";
  scenarioLabel.appendChild(scenarioSelect);

  controls.appendChild(pageLabel);
  controls.appendChild(scenarioLabel);
  header.appendChild(title);
  header.appendChild(controls);

  const hostFrame = document.createElement("div");
  hostFrame.className = "glitter-preview-shell__host-frame";

  const mountArea = document.createElement("div");
  mountArea.className = "glitter-preview-shell__mount-area";

  const baseSurface = document.createElement("div");
  baseSurface.className = "glitter-preview-shell__base-surface";

  const overlaySurface = document.createElement("div");
  overlaySurface.className = "glitter-preview-shell__overlay-surface";

  mountArea.appendChild(baseSurface);
  mountArea.appendChild(overlaySurface);
  hostFrame.appendChild(mountArea);
  shell.appendChild(header);
  shell.appendChild(hostFrame);
  containerEl.appendChild(shell);

  // 场景选择与覆盖层状态。
  const storage = getPreviewStorage();
  const adapter = createBrowserHomeAdapter(storage);

  const getStoredScenario = (page: PreviewPage): string | null => {
    const directlyStored = readStorage(storage, scenarioStorageKeyFor(page));
    if (directlyStored !== null) {
      return directlyStored;
    }

    return isAdapterPage(page) ? adapter.getScenario(page) : null;
  };

  const updateScenarioSelect = (page: PreviewPage, scenario: PreviewScenario): void => {
    scenarioSelect.innerHTML = "";

    scenariosForPage(page).forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      scenarioSelect.appendChild(option);
    });

    scenarioSelect.value = scenario;
  };

  let overlayStep: PreviewOverlayStep | null = null;
  let poolChooseReturnStep: OverlayCaptureStep | null = null;
  let showCaptureCloseConfirm = false;
  let renderedPage: PreviewPage | null = null;
  let renderedScenario: PreviewScenario | null = null;
  let previousPageBeforeWrite: PreviewPage = "home";
  let previousScenarioBeforeWrite: PreviewScenario = "home-empty";

  let firstUseCaptureInputText = "";
  let firstUseCaptureTitleText = "";
  let firstUseCaptureTitleDirty = false;
  let firstUseCaptureHasMedia = false;
  let firstUseCaptureAttachedMediaCount = 0;
  let firstUseCaptureImportState: "idle" | "loading" | "error" = "idle";
  let firstUseCaptureCreateFileChecked = false;
  let firstUseCaptureSelectedPoolLabel = "默认池";
  let firstUseCapturePoolDropdownVisible = false;

  let globalCaptureInputText = "这是全局捕获的标题来源。下一句不会进入标题";
  let globalCaptureTitleText = "";
  let globalCaptureTitleDirty = false;
  let globalCaptureHasMedia = false;
  let globalCaptureAttachedMediaCount = 0;
  let globalCaptureImportState: "idle" | "loading" | "error" = "idle";
  let globalCaptureCreateFileChecked = false;
  let globalCaptureSelectedPoolLabel = "默认池";
  let globalCapturePoolDropdownVisible = false;

  // 覆盖层渲染辅助。
  const closeOverlay = (): void => {
    overlayStep = null;
    clearContainer(overlaySurface);
    setClassFlag(hostFrame, "glitter-preview-shell__host-frame--overlay-active", false);
    setClassFlag(mountArea, "glitter-preview-shell__mount-area--overlay-active", false);
    setClassFlag(baseSurface, "glitter-preview-shell__base-surface--overlay-dimmed", false);
    setClassFlag(overlaySurface, "glitter-preview-shell__overlay-surface--active", false);
  };

  const renderOverlay = (
    step: PreviewOverlayStep,
    renderContent: (overlayMount: HTMLElement) => void
  ): void => {
    clearContainer(overlaySurface);

    setClassFlag(hostFrame, "glitter-preview-shell__host-frame--overlay-active", true);
    setClassFlag(mountArea, "glitter-preview-shell__mount-area--overlay-active", true);
    setClassFlag(baseSurface, "glitter-preview-shell__base-surface--overlay-dimmed", true);
    setClassFlag(overlaySurface, "glitter-preview-shell__overlay-surface--active", true);

    const scrim = document.createElement("div");
    scrim.className = "glitter-preview-shell__overlay-scrim";

    const overlayMount = document.createElement("div");
    overlayMount.className = `glitter-preview-shell__overlay-mount glitter-preview-shell__overlay-mount--${step}`;

    overlaySurface.appendChild(scrim);
    overlaySurface.appendChild(overlayMount);

    renderContent(overlayMount);
  };

  const renderCaptureOverlay = (
    flowContext: QuickCaptureFlowContext,
    persistedScenario: PreviewScenario,
    onSubmit: () => void,
    onClose: () => void,
    onPoolCreate: () => void
  ): void => {
    const currentInputText = flowContext === "first-use" ? firstUseCaptureInputText : globalCaptureInputText;
    const currentTitleText = flowContext === "first-use" ? firstUseCaptureTitleText : globalCaptureTitleText;
    const currentTitleDirty = flowContext === "first-use" ? firstUseCaptureTitleDirty : globalCaptureTitleDirty;
    const currentAttachedMediaCount =
      flowContext === "first-use" ? firstUseCaptureAttachedMediaCount : globalCaptureAttachedMediaCount;
    const currentImportState = flowContext === "first-use" ? firstUseCaptureImportState : globalCaptureImportState;
    const currentCreateFileChecked =
      flowContext === "first-use" ? firstUseCaptureCreateFileChecked : globalCaptureCreateFileChecked;
    const currentSelectedPoolLabel =
      flowContext === "first-use" ? firstUseCaptureSelectedPoolLabel : globalCaptureSelectedPoolLabel;
    const currentPoolDropdownVisible =
      flowContext === "first-use" ? firstUseCapturePoolDropdownVisible : globalCapturePoolDropdownVisible;

    const fallbackRuntimeState: QuickCaptureRuntimeState = {
      flowContext,
      phase: "capture",
      input: {
        text: currentInputText,
        title: currentTitleText,
        hasManualTitle: currentTitleDirty,
        hasMedia: currentAttachedMediaCount > 0,
        importState: currentImportState,
        createFileChecked: currentCreateFileChecked,
        selectedPoolLabel: currentSelectedPoolLabel,
        poolDropdownVisible: currentPoolDropdownVisible
      }
    };
    const runtimeState = createQuickCaptureRuntimeStateForScenario(persistedScenario, fallbackRuntimeState);

    if (flowContext === "first-use") {
      firstUseCaptureInputText = runtimeState.input.text;
      if (runtimeState.input.title !== undefined || !firstUseCaptureTitleDirty) {
        firstUseCaptureTitleText = runtimeState.input.title ?? "";
      }
      firstUseCaptureHasMedia = currentAttachedMediaCount > 0;
      firstUseCaptureAttachedMediaCount = currentAttachedMediaCount;
      firstUseCaptureImportState = runtimeState.input.importState ?? "idle";
      firstUseCaptureCreateFileChecked = runtimeState.input.createFileChecked ?? false;
      firstUseCaptureSelectedPoolLabel = runtimeState.input.selectedPoolLabel ?? "默认池";
      firstUseCapturePoolDropdownVisible = runtimeState.input.poolDropdownVisible ?? false;
    } else {
      globalCaptureInputText = runtimeState.input.text;
      if (runtimeState.input.title !== undefined || !globalCaptureTitleDirty) {
        globalCaptureTitleText = runtimeState.input.title ?? "";
      }
      globalCaptureHasMedia = currentAttachedMediaCount > 0;
      globalCaptureAttachedMediaCount = currentAttachedMediaCount;
      globalCaptureImportState = runtimeState.input.importState ?? "idle";
      globalCaptureCreateFileChecked = runtimeState.input.createFileChecked ?? false;
      globalCaptureSelectedPoolLabel = runtimeState.input.selectedPoolLabel ?? "默认池";
      globalCapturePoolDropdownVisible = runtimeState.input.poolDropdownVisible ?? false;
    }

    const writeState = buildWriteViewState({
      ...deriveQuickCaptureStateModel(runtimeState),
      attachedMediaCount: currentAttachedMediaCount,
      closeConfirmVisible: showCaptureCloseConfirm
    });
    renderOverlay("capture", (overlayMount) => {
      renderWriteView(overlayMount, writeState, {
        onClose: () => {
          showCaptureCloseConfirm = true;
          const currentPage = ensurePage(pageSelect.value);
          rerender(currentPage, persistedScenario);
        },
        onSubmit,
        onPoolPickerToggle: () => {
          if (flowContext === "first-use") {
            firstUseCapturePoolDropdownVisible = !firstUseCapturePoolDropdownVisible;
          } else {
            globalCapturePoolDropdownVisible = !globalCapturePoolDropdownVisible;
          }

          const currentPage = ensurePage(pageSelect.value);
          rerender(currentPage, persistedScenario);
        },
        onPoolSelect: (poolId) => {
          if (poolId === "create-new-pool") {
            if (flowContext === "first-use") {
              firstUseCapturePoolDropdownVisible = false;
            } else {
              globalCapturePoolDropdownVisible = false;
            }

            onPoolCreate();
            return;
          }

          const selectedPoolLabel =
            poolId === "pool-product"
              ? "产品池"
              : poolId === "pool-research"
                ? "调研池"
                : poolId === "pool-writing"
                  ? "写作池"
                  : "默认池";

          if (flowContext === "first-use") {
            firstUseCaptureSelectedPoolLabel = selectedPoolLabel;
            firstUseCapturePoolDropdownVisible = false;
          } else {
            globalCaptureSelectedPoolLabel = selectedPoolLabel;
            globalCapturePoolDropdownVisible = false;
          }

          const currentPage = ensurePage(pageSelect.value);
          rerender(currentPage, persistedScenario);
        },
        onRetryLinkImport: () => {
          const nextState: "idle" | "loading" = currentImportState === "error" ? "loading" : "idle";
          if (flowContext === "first-use") {
            firstUseCaptureImportState = nextState;
            firstUseCaptureInputText = runtimeState.input.text;
            firstUseCaptureTitleText = runtimeState.input.title ?? firstUseCaptureTitleText;
            firstUseCaptureHasMedia = Boolean(runtimeState.input.hasMedia);
          } else {
            globalCaptureImportState = nextState;
            globalCaptureInputText = runtimeState.input.text;
            globalCaptureTitleText = runtimeState.input.title ?? globalCaptureTitleText;
            globalCaptureHasMedia = Boolean(runtimeState.input.hasMedia);
          }

          const currentPage = ensurePage(pageSelect.value);
          rerender(currentPage, persistedScenario);
        },
        onBodyInputChange: (value) => {
          if (flowContext === "first-use") {
            firstUseCaptureInputText = value;
          } else {
            globalCaptureInputText = value;
          }

          const currentPage = ensurePage(pageSelect.value);
          rerender(currentPage, persistedScenario);
        },
        onTitleInputChange: (value) => {
          if (flowContext === "first-use") {
            firstUseCaptureTitleText = value;
            firstUseCaptureTitleDirty = true;
          } else {
            globalCaptureTitleText = value;
            globalCaptureTitleDirty = true;
          }

          const currentPage = ensurePage(pageSelect.value);
          rerender(currentPage, persistedScenario);
        },
        onAttachmentPick: () => {
          openPreviewAttachmentPicker(overlayMount, (files) => {
            if (flowContext === "first-use") {
              firstUseCaptureHasMedia = true;
              firstUseCaptureAttachedMediaCount += files.length;
            } else {
              globalCaptureHasMedia = true;
              globalCaptureAttachedMediaCount += files.length;
            }

            const currentPage = ensurePage(pageSelect.value);
            rerender(currentPage, persistedScenario);
          });
        },
        onCreateFileToggle: (checked) => {
          if (flowContext === "first-use") {
            firstUseCaptureCreateFileChecked = checked;
            firstUseCapturePoolDropdownVisible = false;
          } else {
            globalCaptureCreateFileChecked = checked;
            globalCapturePoolDropdownVisible = false;
          }

          const currentPage = ensurePage(pageSelect.value);
          rerender(currentPage, persistedScenario);
        },
        onResumeCapture: () => {
          showCaptureCloseConfirm = false;
          const currentPage = ensurePage(pageSelect.value);
          rerender(currentPage, persistedScenario);
        },
        onConfirmClose: () => {
          showCaptureCloseConfirm = false;
          onClose();
        }
      });
    });
  };

  // 整页重渲染入口。
  const rerender = (page: PreviewPage, scenarioValue: unknown): void => {
    const previousPage = renderedPage;
    const previousScenario = renderedScenario;
    const scenario = ensureScenario(page, scenarioValue);

    if (previousPage === "write" && page === "write" && previousScenario !== null && previousScenario !== scenario) {
      showCaptureCloseConfirm = false;
    }

    if (page !== "write") {
      previousPageBeforeWrite = page;
      previousScenarioBeforeWrite = scenario;
    }

    writeStorage(storage, STORAGE_PAGE_KEY, page);
    writeStorage(storage, scenarioStorageKeyFor(page), scenario);

    if (isAdapterPage(page)) {
      adapter.setPage(page);
      adapter.setScenario(scenario as ReviewScenario, page);
    }

    pageSelect.value = page;
    updateScenarioSelect(page, scenario);
    renderedPage = page;
    renderedScenario = scenario;

    if (page !== "home") {
      closeOverlay();
      if (page !== "write") {
        showCaptureCloseConfirm = false;
      }
    }

    if (page === "home" && scenario !== "home-empty" && overlayStep !== "followup-guidance") {
      closeOverlay();
      showCaptureCloseConfirm = false;
    }

    if (page === "home") {
      const state = buildHomeViewState(scenario);
      renderHomeView(baseSurface, state, {
        onPrimaryAction: () => {
          if (scenario === "home-empty") {
            overlayStep = "capture";
            rerender(page, scenario);
            return;
          }

          console.info("[preview] onPrimaryAction", { page, scenario });
        },
        onSecondaryAction: () => {
          if (scenario === "home-empty") {
            poolChooseReturnStep = "capture";
            overlayStep = "pool-choose";
            rerender(page, scenario);
            return;
          }

          console.info("[preview] onSecondaryAction", { page, scenario });
        },
        onPoolSelect: (poolId) => {
          console.info("[preview] onPoolSelect", { page, scenario, poolId });
        },
        onSearchSubmit: (query) => {
          console.info("[preview] onSearchSubmit", { page, scenario, query });
        }
      });

      if (overlayStep === "followup-guidance") {
        renderOverlay("followup-guidance", (overlayMount) => {
          const closeGuidanceOverlay = (): void => {
            closeOverlay();
            rerender("home", "home-populated");
          };

          renderFollowupGuidanceView(overlayMount, buildFollowupGuidanceState(), {
            onDismiss: closeGuidanceOverlay,
            onContinue: closeGuidanceOverlay
          });
        });
        return;
      }

      if (overlayStep === "capture") {
        renderCaptureOverlay(
          "first-use",
          scenario,
          () => {
            poolChooseReturnStep = "capture";
            overlayStep = "pool-choose";
            rerender("home", scenario);
          },
          () => {
            closeOverlay();
            rerender("home", scenario);
          },
          () => {
            poolChooseReturnStep = "capture";
            overlayStep = "pool-choose";
            rerender("home", scenario);
          }
        );
        return;
      }

      if (overlayStep === "saved-feedback") {
        const runtimeState: QuickCaptureRuntimeState = {
          flowContext: "first-use",
          phase: "saved-feedback",
          input: {
            text: firstUseCaptureInputText,
            hasMedia: firstUseCaptureHasMedia,
            importState: firstUseCaptureImportState,
            createFileChecked: firstUseCaptureCreateFileChecked,
            selectedPoolLabel: firstUseCaptureSelectedPoolLabel,
            poolDropdownVisible: firstUseCapturePoolDropdownVisible
          }
        };
        const writeState = buildWriteViewState(deriveQuickCaptureStateModel(runtimeState));

        renderOverlay("saved-feedback", (overlayMount) => {
          renderWriteView(overlayMount, writeState, {
            onClose: () => {
              overlayStep = "followup-guidance";
              rerender("home", "home-populated");
            },
            onSubmit: () => {
              poolChooseReturnStep = "saved-feedback";
              overlayStep = "pool-choose";
              rerender("home", scenario);
            },
            onPoolPickerToggle: () => {
              poolChooseReturnStep = "saved-feedback";
              overlayStep = "pool-choose";
              rerender("home", scenario);
            },
            onRetryLinkImport: () => undefined,
            onBodyInputChange: () => undefined
          });
        });
        return;
      }

      if (overlayStep === "pool-choose") {
        const poolState = buildPoolViewState("pool-first-use-choose");
        renderOverlay("pool-choose", (overlayMount) => {
          renderPoolView(overlayMount, poolState, {
            onBack: () => {
              overlayStep = poolChooseReturnStep ?? "saved-feedback";
              rerender("home", scenario);
            },
            onItemSelect: (itemId) => {
              if (itemId === "create-new-pool") {
                overlayStep = "pool-create";
                rerender("home", scenario);
                return;
              }

              overlayStep = "followup-guidance";
              rerender("home", "home-populated");
              console.info("[preview] onItemSelect", {
                page,
                scenario,
                itemId,
                source: "home-overlay-pool-choose"
              });
            },
            onCreateIdea: () => undefined
          });
        });
        return;
      }

      if (overlayStep === "pool-create") {
        const poolState = buildPoolViewState("pool-first-use-create");
        renderOverlay("pool-create", (overlayMount) => {
          renderPoolView(overlayMount, poolState, {
            onBack: () => {
              overlayStep = "pool-choose";
              rerender("home", scenario);
            },
            onItemSelect: (itemId) => {
              overlayStep = "followup-guidance";
              rerender("home", "home-populated");
              console.info("[preview] onItemSelect", {
                page,
                scenario,
                itemId,
                source: "home-overlay-pool-create"
              });
            },
            onCreateIdea: () => undefined
          });
        });
        return;
      }

      closeOverlay();
      return;
    }

    if (page === "search") {
      const state = buildSearchViewState(scenario);
      renderSearchView(baseSurface, state, {
        onQuerySubmit: () => {
          console.info("[preview] onQuerySubmit", { page, scenario });
        },
        onResultSelect: (resultId) => {
          console.info("[preview] onResultSelect", { page, scenario, resultId });
        },
        onBatchAction: (actionId) => {
          console.info("[preview] onBatchAction", { page, scenario, actionId });
        }
      });
      return;
    }

    if (page === "pool") {
      const state = buildPoolViewState(scenario as PoolScenario);
      renderPoolView(baseSurface, state, {
        onBack: () => {
          console.info("[preview] onBack", { page, scenario });
        },
        onItemSelect: (itemId) => {
          console.info("[preview] onItemSelect", { page, scenario, itemId });
        },
        onCreateIdea: () => {
          console.info("[preview] onCreateIdea", { page, scenario });
        }
      });
      return;
    }

    if (page === "write") {
      const isQuickCaptureScenario = scenario.startsWith("quick-capture-");

      if (isQuickCaptureScenario) {
        const runtimeScenario = scenario as ReviewScenario;
        const isAiQuickCaptureScenario = runtimeScenario.startsWith("quick-capture-ai-");
        const isGlobalFlow = isAiQuickCaptureScenario || runtimeScenario.includes("-global-");
        const currentTitleDirty = isGlobalFlow ? globalCaptureTitleDirty : firstUseCaptureTitleDirty;
        const fallbackRuntimeState: QuickCaptureRuntimeState = {
          flowContext: isGlobalFlow ? "global" : "first-use",
          phase: runtimeScenario.endsWith("-saved") || runtimeScenario === "quick-capture-first-use-saved" ? "saved-feedback" : "capture",
          input: {
            text: isGlobalFlow ? globalCaptureInputText : firstUseCaptureInputText,
            title: isGlobalFlow ? globalCaptureTitleText : firstUseCaptureTitleText,
            hasManualTitle: currentTitleDirty,
            hasMedia: isGlobalFlow ? globalCaptureHasMedia : firstUseCaptureHasMedia,
            importState: isGlobalFlow ? globalCaptureImportState : firstUseCaptureImportState,
            createFileChecked: isGlobalFlow ? globalCaptureCreateFileChecked : firstUseCaptureCreateFileChecked,
            selectedPoolLabel: isGlobalFlow ? globalCaptureSelectedPoolLabel : firstUseCaptureSelectedPoolLabel,
            poolDropdownVisible: isGlobalFlow ? globalCapturePoolDropdownVisible : firstUseCapturePoolDropdownVisible
          }
        };
        const scenarioRuntimeState = createQuickCaptureRuntimeStateForScenario(runtimeScenario, fallbackRuntimeState);
        const canMutateQuickCapturePreviewState = !isAiQuickCaptureScenario;
        const runtimeState: QuickCaptureRuntimeState = isAiQuickCaptureScenario
          ? scenarioRuntimeState
          : {
              ...scenarioRuntimeState,
              input: {
                ...scenarioRuntimeState.input,
                title: currentTitleDirty
                  ? (isGlobalFlow ? globalCaptureTitleText : firstUseCaptureTitleText)
                  : scenarioRuntimeState.input.title,
                hasManualTitle: currentTitleDirty || scenarioRuntimeState.input.hasManualTitle === true,
                hasMedia:
                  (isGlobalFlow ? globalCaptureAttachedMediaCount : firstUseCaptureAttachedMediaCount) > 0
                    ? true
                    : scenarioRuntimeState.input.hasMedia
              }
            };

        if (!isAiQuickCaptureScenario) {
          if (isGlobalFlow) {
            globalCaptureInputText = runtimeState.input.text;
            if (runtimeState.input.title !== undefined || !globalCaptureTitleDirty) {
              globalCaptureTitleText = runtimeState.input.title ?? "";
            }
            globalCaptureHasMedia = globalCaptureAttachedMediaCount > 0;
            globalCaptureImportState = runtimeState.input.importState ?? "idle";
            globalCaptureCreateFileChecked = runtimeState.input.createFileChecked ?? false;
            globalCaptureSelectedPoolLabel = runtimeState.input.selectedPoolLabel ?? "默认池";
            globalCapturePoolDropdownVisible = runtimeState.input.poolDropdownVisible ?? false;
          } else {
            firstUseCaptureInputText = runtimeState.input.text;
            if (runtimeState.input.title !== undefined || !firstUseCaptureTitleDirty) {
              firstUseCaptureTitleText = runtimeState.input.title ?? "";
            }
            firstUseCaptureHasMedia = firstUseCaptureAttachedMediaCount > 0;
            firstUseCaptureImportState = runtimeState.input.importState ?? "idle";
            firstUseCaptureCreateFileChecked = runtimeState.input.createFileChecked ?? false;
            firstUseCaptureSelectedPoolLabel = runtimeState.input.selectedPoolLabel ?? "默认池";
            firstUseCapturePoolDropdownVisible = runtimeState.input.poolDropdownVisible ?? false;
          }
        }

        const model = deriveQuickCaptureStateModel(runtimeState);
        const writeStateOverrides = createQuickCaptureWriteStateOverridesForScenario(runtimeScenario);
        const attachedMediaCount = isAiQuickCaptureScenario
          ? 0
          : isGlobalFlow
            ? globalCaptureAttachedMediaCount
            : firstUseCaptureAttachedMediaCount;
        const state = buildWriteViewState({
          ...model,
          titleText: isAiQuickCaptureScenario ? model.titleText : isGlobalFlow ? globalCaptureTitleText : firstUseCaptureTitleText,
          attachedMediaCount,
          closeConfirmVisible: isAiQuickCaptureScenario ? false : showCaptureCloseConfirm,
          ...writeStateOverrides
        });

        renderWriteView(baseSurface, state, {
          onClose: () => {
            if (isAiQuickCaptureScenario) {
              return;
            }

            showCaptureCloseConfirm = true;
            rerender("write", runtimeScenario);
          },
          onSubmit: () => {
            console.info("[preview] onSubmit", { page, scenario });
          },
          onPoolPickerToggle: () => {
            if (!canMutateQuickCapturePreviewState) {
              return;
            }

            if (isGlobalFlow) {
              globalCapturePoolDropdownVisible = !globalCapturePoolDropdownVisible;
            } else {
              firstUseCapturePoolDropdownVisible = !firstUseCapturePoolDropdownVisible;
            }
            rerender("write", runtimeScenario);
          },
          onPoolSelect: (poolId) => {
            if (!canMutateQuickCapturePreviewState) {
              return;
            }

            if (poolId === "create-new-pool") {
              if (isGlobalFlow) {
                globalCapturePoolDropdownVisible = false;
              } else {
                firstUseCapturePoolDropdownVisible = false;
              }
              console.info("[preview] onPoolCreate", { page, scenario });
              rerender("write", runtimeScenario);
              return;
            }

            const selectedPoolLabel =
              poolId === "pool-product"
                ? "产品池"
                : poolId === "pool-research"
                  ? "调研池"
                  : poolId === "pool-writing"
                    ? "写作池"
                    : "默认池";

            if (isGlobalFlow) {
              globalCaptureSelectedPoolLabel = selectedPoolLabel;
              globalCapturePoolDropdownVisible = false;
            } else {
              firstUseCaptureSelectedPoolLabel = selectedPoolLabel;
              firstUseCapturePoolDropdownVisible = false;
            }

            rerender("write", runtimeScenario);
          },
          onRetryLinkImport: () => {
            console.info("[preview] onRetryLinkImport", { page, scenario });
          },
          onBodyInputChange: (value) => {
            if (!canMutateQuickCapturePreviewState) {
              return;
            }

            if (isGlobalFlow) {
              globalCaptureInputText = value;
            } else {
              firstUseCaptureInputText = value;
            }

            rerender("write", runtimeScenario);
          },
          onTitleInputChange: (value) => {
            if (!canMutateQuickCapturePreviewState) {
              return;
            }

            if (isGlobalFlow) {
              globalCaptureTitleText = value;
              globalCaptureTitleDirty = true;
            } else {
              firstUseCaptureTitleText = value;
              firstUseCaptureTitleDirty = true;
            }

            rerender("write", runtimeScenario);
          },
          onAttachmentPick: () => {
            if (!canMutateQuickCapturePreviewState) {
              return;
            }

            openPreviewAttachmentPicker(baseSurface, (files) => {
              if (isGlobalFlow) {
                globalCaptureHasMedia = true;
                globalCaptureAttachedMediaCount += files.length;
              } else {
                firstUseCaptureHasMedia = true;
                firstUseCaptureAttachedMediaCount += files.length;
              }
              rerender("write", runtimeScenario);
            });
          },
          onCreateFileToggle: (checked) => {
            if (!canMutateQuickCapturePreviewState) {
              return;
            }

            if (isGlobalFlow) {
              globalCaptureCreateFileChecked = checked;
              globalCapturePoolDropdownVisible = false;
            } else {
              firstUseCaptureCreateFileChecked = checked;
              firstUseCapturePoolDropdownVisible = false;
            }
            rerender("write", runtimeScenario);
          },
          onResumeCapture: () => {
            showCaptureCloseConfirm = false;
            rerender("write", runtimeScenario);
          },
          onConfirmClose: () => {
            showCaptureCloseConfirm = false;
            overlayStep = null;
            closeOverlay();
            rerender(previousPageBeforeWrite, previousScenarioBeforeWrite);
          }
        });
        return;
      }

      const state = buildWriteViewState(
        scenario as "write-immersive-default" | "write-immersive-success" | "write-immersive-error"
      );
      renderWriteView(baseSurface, state, {
        onClose: () => {
          console.info("[preview] onClose", { page, scenario });
        },
        onSubmit: () => {
          console.info("[preview] onSubmit", { page, scenario });
        },
        onPoolPickerToggle: () => {
          console.info("[preview] onPoolPickerToggle", { page, scenario });
        },
        onRetryLinkImport: () => {
          console.info("[preview] onRetryLinkImport", { page, scenario });
        },
        onBodyInputChange: () => undefined
      });
      return;
    }

    const state = buildSettingsViewState(scenario as SettingsScenario);
    renderSettingsView(baseSurface, state);
  };

  // 初始化与事件绑定。
  const initialStoredPage = readStorage(storage, STORAGE_PAGE_KEY);
  const initialPage = ensurePage(initialStoredPage ?? adapter.getPage());
  const initialScenario = ensureScenario(initialPage, getStoredScenario(initialPage));
  pageSelect.value = initialPage;
  rerender(initialPage, initialScenario);

  pageSelect.addEventListener("change", () => {
    const page = ensurePage(pageSelect.value);
    rerender(page, ensureScenario(page, getStoredScenario(page)));
  });

  scenarioSelect.addEventListener("change", () => {
    const currentPage = ensurePage(pageSelect.value);
    rerender(currentPage, ensureScenario(currentPage, scenarioSelect.value));
  });
}
