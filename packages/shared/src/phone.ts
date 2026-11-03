const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * One canonical form for every phone number (website form, Telegram contact, admin edits):
 * "+<country code><number>", e.g. +989123456789. Local numbers without a plus are left as digits.
 */
export function canonicalPhone(value: string): string {
  let s = value
    .replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\+/g, '');
  const digits = s.replace(/\+/g, '');
  if (/^09\d{9}$/.test(digits)) return '+98' + digits.slice(1);
  if (/^9\d{9}$/.test(digits)) return '+98' + digits;
  if (!digits.startsWith('0') && digits.length >= 10) return '+' + digits;
  return digits;
}

/** Every spelling an older record might have used, so lookups find legacy rows too. */
export function phoneVariants(value: string): string[] {
  const canonical = canonicalPhone(value);
  const bare = canonical.startsWith('+') ? canonical.slice(1) : canonical;
  const variants = new Set<string>([canonical, bare, '+' + bare]);
  if (bare.startsWith('98') && bare.length === 12) {
    const national = bare.slice(2);
    variants.add('0' + national);
    variants.add(national);
    variants.add('00' + bare);
  }
  return [...variants];
}
