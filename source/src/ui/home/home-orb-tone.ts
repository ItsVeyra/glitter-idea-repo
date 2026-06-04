/**
 * 首页灵感球配色工具。
 * 负责把池颜色解析为首页球体可用的语义色、RGB 变量与回退色。
 */

import type { PoolColorSettings } from "../../settings/settings";

export type HomeOrbTone = keyof PoolColorSettings | "overflow";

// 首页球体允许映射的池色键。
const HOME_POOL_TONE_KEYS: Array<keyof PoolColorSettings> = [
  "unsorted",
  "product",
  "research",
  "writing",
  "unnamed"
];

// 颜色归一化与 RGB 混合工具。
export function normalizeHexColor(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (/^#[0-9a-f]{3}$/u.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  if (/^#[0-9a-f]{6}$/u.test(normalized)) {
    return normalized;
  }

  return null;
}

function resolveHexRgbChannels(value: string | undefined): [number, number, number] | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) {
    return null;
  }

  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16)
  ];
}

function formatRgbChannels([red, green, blue]: readonly [number, number, number]): string {
  return `${red} ${green} ${blue}`;
}

function mixRgbChannels(
  [red, green, blue]: readonly [number, number, number],
  target: readonly [number, number, number],
  ratio: number
): [number, number, number] {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return [
    Math.round(red + (target[0] - red) * clampedRatio),
    Math.round(green + (target[1] - green) * clampedRatio),
    Math.round(blue + (target[2] - blue) * clampedRatio)
  ];
}

// 输出给渲染层使用的首页球体颜色值。
export function resolveHomeOrbRgb(poolColor: string | undefined): string | undefined {
  const channels = resolveHexRgbChannels(poolColor);
  return channels ? formatRgbChannels(channels) : undefined;
}

export function resolveHomeOrbRingRgb(poolColor: string | undefined): string | undefined {
  const channels = resolveHexRgbChannels(poolColor);
  return channels ? formatRgbChannels(mixRgbChannels(channels, [255, 255, 255], 0.32)) : undefined;
}

export function resolveHomeOrbTone(
  poolColor: string | undefined,
  poolColors: PoolColorSettings | undefined
): keyof PoolColorSettings {
  const normalizedPoolColor = normalizeHexColor(poolColor);
  if (!normalizedPoolColor || !poolColors) {
    return "unsorted";
  }

  for (const key of HOME_POOL_TONE_KEYS) {
    if (normalizeHexColor(poolColors[key]) === normalizedPoolColor) {
      return key;
    }
  }

  return "unsorted";
}
