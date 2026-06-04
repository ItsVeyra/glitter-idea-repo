/**
 * 时间戳辅助。
 * 负责统一输出当前时刻的 ISO 字符串，供仓储与服务层记录更新时间。
 */
// 时间戳生成。
export function nowIso(): string {
  return new Date().toISOString();
}
