import { createHmac, timingSafeEqual } from 'node:crypto';

export type TelegramInitDataResult =
  | { ok: true; user: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string; photo_url?: string } }
  | { ok: false; reason: string };

/** Validates Telegram WebApp initData using Telegram's documented HMAC-SHA-256 scheme. */
export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 86400): TelegramInitDataResult {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const authDate = Number(params.get('auth_date'));
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return { ok: false, reason: 'missing_or_invalid_hash' };
    if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: 'missing_auth_date' };
    const now = Math.floor(Date.now() / 1000);
    if (authDate > now + 60) return { ok: false, reason: 'auth_date_in_future' };
    if (now - authDate > maxAgeSeconds) return { ok: false, reason: 'init_data_expired' };
    const entries = [...params.entries()].filter(([key]) => key !== 'hash').sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculated = createHmac('sha256', secretKey).update(dataCheckString).digest();
    const supplied = Buffer.from(hash, 'hex');
    if (supplied.length !== calculated.length || !timingSafeEqual(supplied, calculated)) return { ok: false, reason: 'signature_mismatch' };
    const rawUser = params.get('user');
    if (!rawUser) return { ok: false, reason: 'missing_user' };
    const user = JSON.parse(rawUser);
    if (!Number.isSafeInteger(user?.id) || user.id <= 0 || user.is_bot === true) return { ok: false, reason: 'invalid_user' };
    return { ok: true, user };
  } catch {
    return { ok: false, reason: 'malformed_init_data' };
  }
}
