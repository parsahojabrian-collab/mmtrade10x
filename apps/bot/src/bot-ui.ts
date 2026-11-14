/** Presentation-only Telegram UI primitives. Never place account/business logic here. */
export type BotTone = 'default' | 'success' | 'warning' | 'error';
export type BotScreen = {
  title: string;
  description: string;
  tone?: BotTone;
  hint?: string;
  progress?: { current: number; total: number };
};

const toneIcon: Record<BotTone, string> = {
  default: '◈',
  success: '✅',
  warning: '⚠️',
  error: '⛔'
};

export function escapeBotHtml(value: string): string {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function botProgress(stage: string): { current: number; total: number } {
  const current: Record<string, number> = {
    STARTED: 1,
    CHANNELS_PENDING: 1,
    CONSENT_PENDING: 2,
    PHONE_PENDING: 3,
    REGISTERED: 4,
    MINI_APP_PENDING: 4,
    COMPLETE: 4
  };
  return { current: current[stage] || 1, total: 4 };
}

export function renderBotScreen(screen: BotScreen): string {
  const tone = toneIcon[screen.tone || 'default'];
  const safeTitle = escapeBotHtml(screen.title.slice(0, 100));
  // Limit data *before* adding HTML entities to avoid breaking Telegram markup.
  const safeBody = escapeBotHtml(screen.description.slice(0, 3200));
  const parts = [
    '✦ <b>MMTRADE 10X</b>',
    '',
    `${tone} <b>${safeTitle}</b>`,
    '',
    safeBody
  ];
  if (screen.progress) {
    const total = Math.min(8, Math.max(1, Math.floor(screen.progress.total)));
    const current = Math.min(total, Math.max(0, Math.floor(screen.progress.current)));
    parts.push('', `پیشرفت  ${'●'.repeat(current)}${'○'.repeat(total - current)}  ${current}/${total}`);
  }
  if (screen.hint) parts.push('', `↳ ${escapeBotHtml(screen.hint.slice(0, 500))}`);
  return parts.join('\n');
}

/** Small, consistent brand wrapper for simple replies and custom administrator content. */
export function renderBotText(text: string): string {
  return renderBotScreen({ title: 'راهنمای 10X', description: text });
}

/** A separate function enables lightweight unit tests without Telegram or a DB. */
export function menuRowPlan(labels: readonly string[]): string[][] {
  const rows: string[][] = [];
  let pending: string[] = [];
  for (const label of labels) {
    if (!label.trim()) continue;
    const wide = Array.from(label).length > 25;
    if (wide) {
      if (pending.length) rows.push(pending);
      pending = [];
      rows.push([label]);
    } else {
      pending.push(label);
      if (pending.length === 2) { rows.push(pending); pending = []; }
    }
  }
  if (pending.length) rows.push(pending);
  return rows;
}
