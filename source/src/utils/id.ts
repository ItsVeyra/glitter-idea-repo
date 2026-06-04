/**
 * 标识生成辅助。
 * 负责为 Glitter 领域对象生成带前缀的唯一标识。
 */
// 标识生成。
export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
