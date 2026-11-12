/** Persist retry state in SystemSetting; no database schema change is required. */
export const NOTIFICATION_RETRY_PREFIX = 'BOT_NOTIFICATION_RETRY_V1:';
export type NotificationRetry = { attempts: number; nextAttemptAt: number; lastError: string };
export function notificationRetry(error: unknown, attempts: number, now: number): NotificationRetry | null {
  const e = error as { error_code?: number; parameters?: { retry_after?: number } };
  const code = Number(e?.error_code || 0);
  if (attempts >= 5 || (code >= 400 && code < 500 && code !== 429)) return null;
  const retryAfter = Number(e?.parameters?.retry_after || 0);
  const delaySeconds = Math.max(2 ** attempts * 30, Number.isFinite(retryAfter) ? retryAfter : 0);
  return { attempts, nextAttemptAt: now + delaySeconds * 1000,
    lastError: error instanceof Error ? error.message.slice(0, 500) : 'telegram_send_error' };
}
export function readNotificationRetry(value: unknown): NotificationRetry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as NotificationRetry;
  return Number.isInteger(v.attempts) && v.attempts >= 1 && v.attempts < 5 &&
    Number.isFinite(v.nextAttemptAt) && typeof v.lastError === 'string' ? v : null;
}
