/**
 * 首页示例球体数据。
 * 负责固定评审场景下首页灵感球的尺寸、语义与默认布局示例。
 */

import type { HomeOrbTone } from "./home-orb-tone";

// 首页灵感球的静态数据结构。
export type HomeOrbSize = "xs" | "sm" | "md" | "lg" | "xl" | "xxl" | "xxxl";

export interface HomeStageOrb {
  id: string;
  label: string;
  count?: number;
  countText?: string;
  tone: HomeOrbTone;
  color?: string;
  kind: "pool" | "overflow";
  isDefault: boolean;
  size: HomeOrbSize;
  x: number;
  y: number;
}

// 固定评审场景下用于渲染首页舞台的示例球体。
export const HOME_PRIMARY_ORB: Readonly<HomeStageOrb> = Object.freeze({
  id: "pool-unsorted",
  label: "未整理",
  count: 47,
  tone: "unsorted",
  kind: "pool",
  isDefault: true,
  size: "xxxl",
  x: 50,
  y: 50
});

export const HOME_SUPPORTING_ORBS: ReadonlyArray<Readonly<HomeStageOrb>> = Object.freeze([
  Object.freeze({
    id: "pool-product",
    label: "产品池",
    count: 28,
    tone: "product",
    kind: "pool",
    isDefault: false,
    size: "xxl",
    x: 17,
    y: 24
  }),
  Object.freeze({
    id: "pool-writing",
    label: "写作",
    count: 19,
    tone: "writing",
    kind: "pool",
    isDefault: false,
    size: "lg",
    x: 89,
    y: 11
  }),
  Object.freeze({
    id: "pool-research",
    label: "研究",
    count: 13,
    tone: "research",
    kind: "pool",
    isDefault: false,
    size: "md",
    x: 84,
    y: 83
  }),
  Object.freeze({
    id: "pool-unnamed",
    label: "未命名",
    count: 7,
    tone: "unnamed",
    kind: "pool",
    isDefault: false,
    size: "xs",
    x: 26,
    y: 85
  })
]);
