/**
 * 首页灵感场渲染器。
 * 负责首页舞台外壳、空态/已有灵感态切换，以及顶部与底部动作的装配。
 */

import type { HomeViewActions } from "./home-actions";
import {
  HOME_FIELD_VIEW_LABELS,
  HOME_FIELD_VIEW_OPTIONS,
  type HomePoolActionLabels,
  type HomeViewState
} from "./home-state";
import { clearHomeContainerChildren, addClassName, createNode, removeClassName } from "./home-dom";
import { createHomeOrbInteractionController, type HomeOrbInteractionController } from "./home-orb-interaction";
import {
  disconnectPopulatedOrbLayoutObservers,
  HOME_ORB_INTERACTION_CONTROLLER_KEY,
  HOME_ORB_RESIZE_OBSERVER_KEY,
  solvePopulatedOrbLayout
} from "./home-orb-layout";
import { buildOrbTextStrengthById, createPerRenderId, renderActionButton, renderOrb } from "./home-orb-render";
import { renderHomeSpringRainStage } from "./home-spring-rain-stage";

function clearContainer(containerEl: HTMLElement): void {
  disconnectPopulatedOrbLayoutObservers(containerEl);
  clearHomeContainerChildren(containerEl);
}

function bindPopulatedOrbLayoutReflow(
  orbStage: HTMLElement,
  primaryOrbButton: HTMLButtonElement | null,
  supportingOrbButtons: HTMLButtonElement[],
  onPoolEnter: (poolId: string) => void,
  actionLabels: HomePoolActionLabels,
  onPoolDelete?: (poolId: string) => void
): void {
  const withObserverHandle = orbStage as HTMLElement & {
    [HOME_ORB_RESIZE_OBSERVER_KEY]?: ResizeObserver;
    [HOME_ORB_INTERACTION_CONTROLLER_KEY]?: HomeOrbInteractionController;
  };
  withObserverHandle[HOME_ORB_INTERACTION_CONTROLLER_KEY]?.destroy();

  const interactionController = createHomeOrbInteractionController(
    orbStage,
    primaryOrbButton,
    supportingOrbButtons,
    onPoolEnter,
    actionLabels,
    onPoolDelete
  );
  if (interactionController) {
    withObserverHandle[HOME_ORB_INTERACTION_CONTROLLER_KEY] = interactionController;
  }

  const applyResolvedLayout = (): void => {
    const resolvedLayout = solvePopulatedOrbLayout(orbStage, primaryOrbButton, supportingOrbButtons);
    if (resolvedLayout) {
      withObserverHandle[HOME_ORB_INTERACTION_CONTROLLER_KEY]?.applyLayout(resolvedLayout);
    }
  };

  applyResolvedLayout();

  const ResizeObserverCtor = (globalThis as typeof globalThis & {
    ResizeObserver?: new (callback: ResizeObserverCallback) => ResizeObserver;
  }).ResizeObserver;

  if (typeof ResizeObserverCtor !== "function") {
    return;
  }

  withObserverHandle[HOME_ORB_RESIZE_OBSERVER_KEY]?.disconnect?.();

  const observer = new ResizeObserverCtor(() => {
    applyResolvedLayout();
  });

  observer.observe(orbStage);
  withObserverHandle[HOME_ORB_RESIZE_OBSERVER_KEY] = observer;
}

export function renderHomeView(
  containerEl: HTMLElement,
  state: HomeViewState,
  actions: HomeViewActions
): HTMLElement {
  clearContainer(containerEl);

  const stage = createNode(
    containerEl,
    "div",
    `glitter-plugin-root glitter-home-stage glitter-home-stage--${state.mode}`
  );
  const topbarClass =
    state.mode === "empty"
      ? "glitter-home-stage__topbar glitter-home-stage__header--weak"
      : "glitter-home-stage__topbar";
  const topbar = createNode(stage, "div", topbarClass);
  const brand = createNode(topbar, "div", "glitter-home-stage__brand");

  createNode(brand, "h2", undefined, state.hero.title);

  if (state.mode === "empty" && state.hero.subtitle) {
    createNode(brand, "p", undefined, state.hero.subtitle);
  }

  if (state.mode !== "empty" && state.topbar.search) {
    const topbarSearch = createNode(topbar, "div", "glitter-home-stage__topbar-search");
    createNode(topbarSearch, "span", "glitter-home-stage__topbar-search-icon");
    const searchInput = createNode(
      topbarSearch,
      "input",
      "glitter-home-stage__topbar-search-input"
    ) as HTMLInputElement;
    searchInput.type = "text";
    searchInput.placeholder = state.topbar.search.placeholder;
    searchInput.setAttribute("aria-label", state.topbar.search.placeholder);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      const keyCode =
        "keyCode" in event
          ? (event as KeyboardEvent & { keyCode?: number }).keyCode
          : undefined;

      if (event.isComposing || keyCode === 229) {
        return;
      }

      event.preventDefault();
      actions.onSearchSubmit(searchInput.value.trim());
    });
  }

  const topbarActionsClass =
    state.mode === "empty"
      ? "glitter-home-stage__topbar-actions glitter-home-stage__topbar-actions--empty"
      : "glitter-home-stage__topbar-actions";
  const topbarActions = createNode(topbar, "div", topbarActionsClass);
  let openFieldViewMenuRecord:
    | {
        slot: HTMLElement;
        control: HTMLButtonElement;
        menu: HTMLElement;
      }
    | null = null;
  let openLanguageMenuRecord:
    | {
        selector: HTMLElement;
        control: HTMLButtonElement;
        menu: HTMLElement;
      }
    | null = null;

  const setFieldViewMenuOpenState = (
    slot: HTMLElement,
    control: HTMLButtonElement,
    menu: HTMLElement,
    isOpen: boolean
  ): void => {
    if (isOpen) {
      addClassName(slot, "glitter-home-stage__topbar-control-slot--menu-open");
      addClassName(menu, "glitter-home-stage__field-view-menu--open");
      control.setAttribute("aria-expanded", "true");
      menu.setAttribute("aria-hidden", "false");
      return;
    }

    removeClassName(slot, "glitter-home-stage__topbar-control-slot--menu-open");
    removeClassName(menu, "glitter-home-stage__field-view-menu--open");
    control.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-hidden", "true");
  };

  const closeFieldViewMenu = (): void => {
    if (!openFieldViewMenuRecord) {
      return;
    }

    setFieldViewMenuOpenState(
      openFieldViewMenuRecord.slot,
      openFieldViewMenuRecord.control,
      openFieldViewMenuRecord.menu,
      false
    );
    openFieldViewMenuRecord = null;
  };

  const setLanguageMenuOpenState = (
    selector: HTMLElement,
    control: HTMLButtonElement,
    menu: HTMLElement,
    options: HTMLButtonElement[],
    isOpen: boolean
  ): void => {
    options.forEach((option) => {
      option.disabled = !isOpen;
    });

    if (isOpen) {
      addClassName(selector, "glitter-home-stage__language-selector--open");
      addClassName(menu, "glitter-home-stage__language-menu--open");
      control.setAttribute("aria-expanded", "true");
      menu.setAttribute("aria-hidden", "false");
      return;
    }

    removeClassName(selector, "glitter-home-stage__language-selector--open");
    removeClassName(menu, "glitter-home-stage__language-menu--open");
    control.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-hidden", "true");
  };

  const closeLanguageMenu = (): void => {
    if (!openLanguageMenuRecord) {
      return;
    }

    const options = Array.from(
      openLanguageMenuRecord.menu.querySelectorAll(".glitter-home-stage__language-option")
    ) as HTMLButtonElement[];
    setLanguageMenuOpenState(
      openLanguageMenuRecord.selector,
      openLanguageMenuRecord.control,
      openLanguageMenuRecord.menu,
      options,
      false
    );
    openLanguageMenuRecord = null;
  };

  stage.addEventListener("click", () => {
    closeFieldViewMenu();
    closeLanguageMenu();
  });

  state.topbar.controls.forEach((controlState) => {
    const controlSlot = createNode(topbarActions, "div", "glitter-home-stage__topbar-control-slot");
    if (controlState.id === "view-switch") {
      addClassName(controlSlot, "glitter-home-stage__topbar-control-slot--view-switch");
    }

    const controlClass =
      controlState.kind === "text"
        ? "glitter-home-stage__topbar-control glitter-home-stage__topbar-control--text"
        : "glitter-home-stage__topbar-control glitter-home-stage__topbar-control--icon";
    const control = createNode(controlSlot, "button", controlClass) as HTMLButtonElement;
    control.type = "button";

    if (controlState.id === "view-switch") {
      const fieldViewMenu = createNode(controlSlot, "div", "glitter-home-stage__field-view-menu");
      fieldViewMenu.setAttribute("aria-hidden", "true");
      fieldViewMenu.setAttribute("role", "menu");
      control.setAttribute("aria-haspopup", "menu");
      control.setAttribute("aria-expanded", "false");
      fieldViewMenu.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      HOME_FIELD_VIEW_OPTIONS.forEach((homeFieldView) => {
        const optionClass =
          homeFieldView === state.fieldView
            ? "glitter-home-stage__field-view-option glitter-home-stage__field-view-option--selected"
            : "glitter-home-stage__field-view-option";
        const option = createNode(
          fieldViewMenu,
          "button",
          optionClass,
          HOME_FIELD_VIEW_LABELS[homeFieldView]
        ) as HTMLButtonElement;
        option.type = "button";
        option.setAttribute("role", "menuitemradio");
        option.setAttribute("aria-checked", homeFieldView === state.fieldView ? "true" : "false");
        option.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          closeFieldViewMenu();
          actions.onFieldViewSelect?.(homeFieldView);
        });
      });

      control.disabled = !actions.onFieldViewSelect;
      if (actions.onFieldViewSelect) {
        control.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const shouldOpen = openFieldViewMenuRecord?.menu !== fieldViewMenu;
          closeFieldViewMenu();
          if (!shouldOpen) {
            return;
          }

          setFieldViewMenuOpenState(controlSlot, control, fieldViewMenu, true);
          openFieldViewMenuRecord = {
            slot: controlSlot,
            control,
            menu: fieldViewMenu
          };
        });
      }

      if (controlState.kind === "text") {
        control.textContent = controlState.label;
      } else {
        createNode(
          control,
          "span",
          `glitter-home-stage__topbar-control-icon glitter-home-stage__topbar-control-icon--${controlState.id}`
        );
        createNode(control, "span", "glitter-home-stage__visually-hidden", controlState.label);
      }
      return;
    }

    const onClick =
      controlState.id === "settings"
        ? actions.onOpenSettings
        : controlState.id === "file-filter"
          ? actions.onStatusFilterSelect
          : undefined;
    control.disabled = !onClick;
    if (onClick) {
      control.addEventListener("click", () => onClick());
    }

    if (controlState.kind === "text") {
      control.textContent = controlState.label;
      return;
    }

    createNode(
      control,
      "span",
      `glitter-home-stage__topbar-control-icon glitter-home-stage__topbar-control-icon--${controlState.id}`
    );
    createNode(control, "span", "glitter-home-stage__visually-hidden", controlState.label);
  });
  if (state.mode === "empty" && state.firstUseEntry) {
    const guideBadge = createNode(
      topbarActions,
      "span",
      "glitter-home-stage__guide-badge glitter-home-stage__guide-badge--topbar"
    );
    createNode(guideBadge, "span", "glitter-home-stage__guide-badge-icon");
    createNode(guideBadge, "span", "glitter-home-stage__guide-badge-text", state.firstUseEntry.badge);
  }

  const fieldClass =
    state.mode === "empty"
      ? "glitter-home-stage__field glitter-home-stage__field--empty"
      : "glitter-home-stage__field";
  const field = createNode(stage, "div", fieldClass);
  const middle = createNode(field, "div", "glitter-home-stage__middle");
  const orbLayer = createNode(middle, "div", "glitter-home-stage__orb-layer");
  const orbRegion = createNode(orbLayer, "div", "glitter-home-stage__orb-region");

  if (state.mode === "empty") {
    const emptyLayout = createNode(orbRegion, "div", "glitter-home-stage__empty-layout glitter-home-stage__orb-stage");
    createNode(emptyLayout, "div", "glitter-home-stage__empty-field-glow");
    const orbWrap = createNode(emptyLayout, "div", "glitter-home-stage__orb-wrap");

    createNode(
      orbWrap,
      "span",
      "glitter-home-stage__empty-orb-ripple glitter-home-stage__empty-orb-ripple--inner"
    );
    createNode(
      orbWrap,
      "span",
      "glitter-home-stage__empty-orb-ripple glitter-home-stage__empty-orb-ripple--middle"
    );
    createNode(
      orbWrap,
      "span",
      "glitter-home-stage__empty-orb-ripple glitter-home-stage__empty-orb-ripple--outer"
    );
    const emptyOrbButton = createNode(
      orbWrap,
      "button",
      "glitter-home-stage__empty-orb-hit-area"
    ) as HTMLButtonElement;
    emptyOrbButton.type = "button";
    emptyOrbButton.disabled = Boolean(state.primaryAction.disabled);
    if (!emptyOrbButton.disabled) {
      emptyOrbButton.addEventListener("click", () => actions.onPrimaryAction());
    }

    createNode(emptyOrbButton, "span", "glitter-home-stage__empty-orb-base");
    createNode(emptyOrbButton, "span", "glitter-home-stage__empty-orb-shell");
    const emptyContent = createNode(
      emptyOrbButton,
      "span",
      "glitter-home-stage__orb-core glitter-home-stage__empty-orb-content"
    );
    const emptyOrbLabelId = createPerRenderId("glitter-home-empty-orb-label");
    emptyContent.id = emptyOrbLabelId;
    emptyOrbButton.setAttribute("aria-labelledby", emptyOrbLabelId);
    createNode(emptyContent, "span", "glitter-home-stage__empty-orb-content-icon");
    createNode(
      emptyContent,
      "span",
      "glitter-home-stage__empty-orb-content-title",
      state.firstUseEntry?.orbTitle ?? ""
    );
    createNode(
      emptyContent,
      "span",
      "glitter-home-stage__empty-orb-content-subtitle",
      state.firstUseEntry?.orbSubtitle ?? ""
    );

    if (state.firstUseEntry) {
      const languageSelector = createNode(emptyLayout, "div", "glitter-home-stage__language-selector");
      const languageTrigger = createNode(
        languageSelector,
        "button",
        "glitter-home-stage__language-trigger"
      ) as HTMLButtonElement;
      languageTrigger.type = "button";
      languageTrigger.setAttribute("aria-haspopup", "menu");
      languageTrigger.setAttribute("aria-expanded", "false");
      createNode(
        languageTrigger,
        "span",
        "glitter-home-stage__language-trigger-label",
        state.firstUseEntry.languageLabel
      );
      createNode(
        languageTrigger,
        "span",
        "glitter-home-stage__language-trigger-value",
        state.firstUseEntry.currentLanguageLabel
      );
      createNode(languageTrigger, "span", "glitter-home-stage__language-trigger-chevron");

      const languageMenu = createNode(languageSelector, "div", "glitter-home-stage__language-menu");
      languageMenu.setAttribute("aria-hidden", "true");
      languageMenu.setAttribute("role", "menu");
      languageMenu.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      const languageOptions: HTMLButtonElement[] = [];
      state.firstUseEntry.options.forEach((option) => {
        const optionClass = option.selected
          ? "glitter-home-stage__language-option glitter-home-stage__language-option--selected"
          : "glitter-home-stage__language-option";
        const languageOption = createNode(languageMenu, "button", optionClass, option.label) as HTMLButtonElement;
        languageOption.type = "button";
        languageOption.disabled = true;
        languageOption.setAttribute("role", "menuitemradio");
        languageOption.setAttribute("aria-checked", option.selected ? "true" : "false");
        languageOption.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          closeLanguageMenu();
          void actions.onFirstUseLanguageSelect?.(option.value);
        });
        languageOptions.push(languageOption);
      });

      languageTrigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const shouldOpen = openLanguageMenuRecord?.menu !== languageMenu;
        closeLanguageMenu();
        if (!shouldOpen) {
          return;
        }

        setLanguageMenuOpenState(languageSelector, languageTrigger, languageMenu, languageOptions, true);
        openLanguageMenuRecord = {
          selector: languageSelector,
          control: languageTrigger,
          menu: languageMenu
        };
      });
    }

  } else {
    const orbStage = createNode(orbRegion, "div", "glitter-home-stage__pool-stage glitter-home-stage__orb-stage");

    if (state.banner) {
      const banner = createNode(orbStage, "div", "glitter-home-stage__conflict-banner");
      createNode(banner, "strong", undefined, state.banner.title);
      createNode(banner, "span", undefined, state.banner.description);
    }

    const renderedOrbs = state.primaryOrb ? [state.primaryOrb, ...state.poolOrbs] : state.poolOrbs;

    if (state.fieldView === "spring-rain") {
      renderHomeSpringRainStage(orbStage, renderedOrbs, actions, state.poolActionLabels);
    } else {
      let motionPresetIndex = 0;
      let renderedPrimaryOrbButton: HTMLButtonElement | null = null;
      const renderedSupportingOrbButtons: HTMLButtonElement[] = [];
      const orbTextStrengthById = buildOrbTextStrengthById(renderedOrbs);

      if (state.primaryOrb) {
        renderedPrimaryOrbButton = renderOrb(
          orbStage,
          state.primaryOrb,
          "glitter-home-stage__pool-orb glitter-home-stage__primary-orb",
          actions,
          motionPresetIndex,
          true,
          orbTextStrengthById.get(state.primaryOrb.id)
        );
        motionPresetIndex += 1;
      }

      state.poolOrbs.forEach((orb) => {
        const supportingOrbButton = renderOrb(
          orbStage,
          orb,
          `glitter-home-stage__pool-orb glitter-home-stage__supporting-orb glitter-home-stage__pool-orb--${orb.size}`,
          actions,
          motionPresetIndex,
          false,
          orbTextStrengthById.get(orb.id)
        );
        renderedSupportingOrbButtons.push(supportingOrbButton);
        motionPresetIndex += 1;
      });

      bindPopulatedOrbLayoutReflow(
        orbStage,
        renderedPrimaryOrbButton,
        renderedSupportingOrbButtons,
        actions.onPoolSelect,
        state.poolActionLabels,
        actions.onPoolDelete
      );
    }
  }

  if (state.mode !== "empty" && state.searchFeedback) {
    const overlay = createNode(stage, "div", "glitter-home-stage__search-feedback-overlay");
    createNode(overlay, "div", "glitter-home-stage__search-feedback-scrim");
    createNode(overlay, "div", "glitter-home-stage__search-feedback-dialog", state.searchFeedback.message);
  }

  if (state.mode !== "empty") {
    const actionBar = createNode(
      stage,
      "div",
      "glitter-home-stage__action-bar glitter-home-stage__action-bar--populated"
    );

    if (state.secondaryAction) {
      renderActionButton(
        actionBar,
        "glitter-home-stage__action-secondary",
        state.secondaryAction.label,
        state.secondaryAction.tone,
        state.secondaryAction.disabled,
        () => actions.onSecondaryAction()
      );
    }

    renderActionButton(
      actionBar,
      "glitter-home-stage__action-primary",
      state.primaryAction.label,
      state.primaryAction.tone,
      state.primaryAction.disabled,
      () => actions.onPrimaryAction()
    );
  }

  return stage;
}
