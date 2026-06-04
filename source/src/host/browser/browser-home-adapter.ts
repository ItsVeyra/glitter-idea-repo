/**
 * 浏览器预览首页适配器，负责在轻量存储上保存首页与搜索页的预览状态。
 * 统一处理预览页与场景的读取、回退和写入错误屏蔽逻辑。
 */
import { isReviewScenario, type ReviewScenario } from "../../review/scenarios";

// 存储键与页面判断。
const PAGE_KEY = "GlitterIdea.preview.page";
const SCENARIO_KEY_PREFIX = "GlitterIdea.preview.scenario";

// 预览适配器契约。
export type PreviewPage = "home" | "search";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function isPreviewPage(value: string | null): value is PreviewPage {
  return value === "home" || value === "search";
}

function scenarioKeyForPage(page: PreviewPage): string {
  return `${SCENARIO_KEY_PREFIX}.${page}`;
}

function fallbackScenarioForPage(page: PreviewPage): ReviewScenario {
  return page === "search" ? "search-results" : "home-populated";
}

// 浏览器预览适配器。
export function createBrowserHomeAdapter(storage: StorageLike) {
  const getSafePage = (): PreviewPage => {
    try {
      const value = storage.getItem(PAGE_KEY);
      return isPreviewPage(value) ? value : "home";
    } catch {
      return "home";
    }
  };

  return {
    getPage(): PreviewPage {
      return getSafePage();
    },
    setPage(value: PreviewPage): void {
      try {
        storage.setItem(PAGE_KEY, value);
      } catch {
        // Ignore storage write errors and keep adapter non-throwing.
      }
    },
    getScenario(page: PreviewPage = getSafePage()): ReviewScenario {
      try {
        const value = storage.getItem(scenarioKeyForPage(page));
        return isReviewScenario(value) ? value : fallbackScenarioForPage(page);
      } catch {
        return fallbackScenarioForPage(page);
      }
    },
    setScenario(value: ReviewScenario, page: PreviewPage = getSafePage()): void {
      try {
        storage.setItem(scenarioKeyForPage(page), value);
      } catch {
        // Ignore storage write errors and keep adapter non-throwing.
      }
    }
  };
}
