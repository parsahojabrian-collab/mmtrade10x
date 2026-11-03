import 'dotenv/config';
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { canonicalPhone, phoneVariants } from '../../../packages/shared/src/phone.js';

type RegistrationStage = 'STARTED' | 'CHANNELS_PENDING' | 'CONSENT_PENDING' | 'PHONE_PENDING' | 'REGISTERED' | 'MINI_APP_PENDING' | 'COMPLETE';
const RegistrationStage = { STARTED: 'STARTED', CHANNELS_PENDING: 'CHANNELS_PENDING', CONSENT_PENDING: 'CONSENT_PENDING', PHONE_PENDING: 'PHONE_PENDING', REGISTERED: 'REGISTERED', MINI_APP_PENDING: 'MINI_APP_PENDING', COMPLETE: 'COMPLETE' } as const;
const RegistrationStatus = { STARTED: 'STARTED', PHONE_PENDING: 'PHONE_PENDING', REGISTERED: 'REGISTERED', COMPLETE: 'COMPLETE' } as const;

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN is missing. Copy .env.example to .env and configure it.'); process.exit(1); }
// Use the official Telegram Bot API endpoint. No third-party relay is configured.
const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
const bot = new Bot(token, apiRoot ? { client: { apiRoot } } : undefined);
const prisma = new PrismaClient();
// TENX_DYNAMIC_BOT_MENU_V1
// TENX_BUILTIN_BUTTONS_V1
type BuiltInButton = {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
};
type DynamicBotConfig = {
  enabled: boolean;
  welcomeMessage: string;
  autoReplies: { keyword: string; response: string; enabled: boolean }[];
  customMenu: { label: string; response: string; enabled: boolean }[];
  builtInButtons: BuiltInButton[];
};

const DEFAULT_BUILTIN_BUTTONS: BuiltInButton[] = [
  { id: 'registration_status', label: '📝 وضعیت ثبت‌نام', enabled: true, order: 1 },
  { id: 'academy', label: '🎓 آکادمی', enabled: true, order: 2 },
  { id: 'challenge', label: '🏆 چالش 10X', enabled: true, order: 3 },
  { id: 'support', label: '💬 پشتیبانی', enabled: true, order: 4 },
  { id: 'miniapp', label: '🚀 ورود به 10X Mini App', enabled: true, order: 5 },
  { id: 'membership_check', label: '🔄 بررسی مجدد عضویت', enabled: true, order: 6 },
  { id: 'consent_yes', label: '✅ موافقم و ادامه می‌دهم', enabled: true, order: 7 },
  { id: 'consent_no', label: '❌ فعلاً ادامه نمی‌دهم', enabled: true, order: 8 },
  { id: 'share_phone', label: '📱 اشتراک‌گذاری شماره تلفن', enabled: true, order: 9 }
];

let BUILTIN_BUTTON_CACHE: BuiltInButton[] = DEFAULT_BUILTIN_BUTTONS;

function builtinLabel(id: string): string {
  return BUILTIN_BUTTON_CACHE.find(x => x.id === id)?.label
    || DEFAULT_BUILTIN_BUTTONS.find(x => x.id === id)!.label;
}
type BotSettings = {
  channelIds: string[];
  channelLinks: string[];
  allowNoChannels: boolean;
  miniAppUrl: string;
  academyPath: string;
  dynamicConfig: DynamicBotConfig;
};
const DEFAULT_DYNAMIC_CONFIG: DynamicBotConfig = {
  enabled: true,
  welcomeMessage: 'به 10X خوش آمدی، {name}!',
  autoReplies: [],
  customMenu: [],
  builtInButtons: DEFAULT_BUILTIN_BUTTONS
};
async function getBotSettings(): Promise<BotSettings> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: ['REQUIRED_CHANNELS', 'REQUIRED_CHANNEL_LINKS', 'ALLOW_NO_REQUIRED_CHANNELS', 'MINI_APP_URL', 'BOT_CONTROL_CONFIG', 'PAGE_PATH_academy'] } } });
  const saved = Object.fromEntries(rows.map(row => [row.key, row.value])) as Record<string, unknown>;
  const channels = String(saved.REQUIRED_CHANNELS ?? process.env.REQUIRED_CHANNELS ?? '');
  const links = String(saved.REQUIRED_CHANNEL_LINKS ?? process.env.REQUIRED_CHANNEL_LINKS ?? '');
  return {
    channelIds: channels.split(',').map(x => x.trim()).filter(Boolean),
    channelLinks: links.split(';').map(x => x.trim()),
    allowNoChannels: saved.ALLOW_NO_REQUIRED_CHANNELS === undefined ? process.env.ALLOW_NO_REQUIRED_CHANNELS === 'true' : saved.ALLOW_NO_REQUIRED_CHANNELS === true,
    miniAppUrl: String(saved.MINI_APP_URL ?? process.env.MINI_APP_URL ?? ''),
    academyPath: String(saved.PAGE_PATH_academy ?? '/miniapp/academy.html'),
    dynamicConfig: (() => {
      const raw = saved.BOT_CONTROL_CONFIG;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_DYNAMIC_CONFIG;
      const v = raw as Record<string, unknown>;
      const list = (value: unknown) => Array.isArray(value)
        ? value.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
            .slice(0, 50).map(x => ({
              keyword: typeof x.keyword === 'string' ? x.keyword.slice(0, 100) : '',
              label: typeof x.label === 'string' ? x.label.slice(0, 60) : '',
              response: typeof x.response === 'string' ? x.response.slice(0, 2000) : '',
              enabled: x.enabled !== false
            }))
        : [];
      return {
        enabled: v.enabled !== false,
        welcomeMessage: typeof v.welcomeMessage === 'string' && v.welcomeMessage.trim()
          ? v.welcomeMessage.slice(0, 2000) : DEFAULT_DYNAMIC_CONFIG.welcomeMessage,
        autoReplies: list(v.autoReplies).filter(x => x.keyword) as DynamicBotConfig['autoReplies'],
        customMenu: list(v.customMenu).filter(x => x.label) as DynamicBotConfig['customMenu'],
        builtInButtons: (() => {
          const allowed = new Set(DEFAULT_BUILTIN_BUTTONS.map(x => x.id));
          const savedButtons = Array.isArray(v.builtInButtons)
            ? v.builtInButtons.filter((x): x is Record<string, unknown> =>
                !!x && typeof x === 'object' && !Array.isArray(x))
            : [];
          const merged = DEFAULT_BUILTIN_BUTTONS.map(def => {
            const saved = savedButtons.find(x => x.id === def.id);
            return {
              ...def,
              label: typeof saved?.label === 'string' && saved.label.trim()
                ? saved.label.trim().slice(0, 60) : def.label,
              // Critical registration actions cannot be disabled.
              enabled: ['membership_check', 'consent_yes', 'consent_no', 'share_phone'].includes(def.id)
                ? true : saved?.enabled !== false,
              order: typeof saved?.order === 'number' ? Math.max(1, Math.min(100, saved.order)) : def.order
            };
          });
          BUILTIN_BUTTON_CACHE = merged;
          return merged;
        })()
      };
    })()
  };
}

function stageLabel(stage: RegistrationStage): string {
  const labels: Record<RegistrationStage, string> = {
    STARTED: 'شروع شده', CHANNELS_PENDING: 'عضویت کانال‌ها', CONSENT_PENDING: 'رضایت‌نامه', PHONE_PENDING: 'دریافت شماره تلفن', REGISTERED: 'ثبت‌نام اولیه تکمیل شده', MINI_APP_PENDING: 'تکمیل در مینی‌اپ', COMPLETE: 'تکمیل‌شده'
  };
  return labels[stage];
}
async function upsertTelegramUser(ctx: any) {
  const settings = await getBotSettings();
  const from = ctx.from;
  const chatId = String(ctx.chat?.id ?? from.id);
  const telegramId = String(from.id);
  const existed = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } });
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: { telegramId, username: from.username, firstName: from.first_name, lastName: from.last_name, registrationStage: settings.channelIds.length ? RegistrationStage.CHANNELS_PENDING : RegistrationStage.STARTED, registrationStatus: RegistrationStatus.STARTED, lastActivityAt: new Date() },
    update: { username: from.username, firstName: from.first_name, lastName: from.last_name, lastActivityAt: new Date() }
  });
  if (!existed) await prisma.registrationStageEvent.create({ data: { userId: user.id, stage: user.registrationStage, detail: { source: 'telegram_start' } } });
  await prisma.telegramAccount.upsert({ where: { telegramId }, create: { userId: user.id, telegramId, chatId, languageCode: from.language_code, isBot: from.is_bot }, update: { chatId, languageCode: from.language_code } });
  return user;
}
async function setStage(userId: string, stage: RegistrationStage, detail?: object) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { registrationStage: stage, lastActivityAt: new Date() } }),
    prisma.registrationStageEvent.create({ data: { userId, stage, detail: detail as any } })
  ]);
}
async function channelKeyboard() {
  const settings = await getBotSettings();
  const keyboard = new InlineKeyboard();
  settings.channelIds.forEach((channel, index) => {
    const link = settings.channelLinks[index] || (channel.startsWith('@') ? `https://t.me/${channel.slice(1)}` : '');
    if (link) keyboard.url(`عضویت در کانال ${index + 1}`, link).row();
    else keyboard.text(`کانال ${channel} (لینک تنظیم نشده)`, 'noop').row();
  });
  keyboard.row().text('🔄 بررسی مجدد عضویت', 'check_membership');
  return keyboard;
}
async function recordMembership(userId: string, channelId: string, isMember: boolean, errorCode?: string) {
  const last = await prisma.channelMembershipCheck.findFirst({ where: { userId, channelId }, orderBy: { checkedAt: 'desc' } });
  if (last && last.isMember === isMember && (last.errorCode ?? null) === (errorCode ?? null) && Date.now() - last.checkedAt.getTime() < 60 * 60 * 1000) return;
  await prisma.channelMembershipCheck.create({ data: { userId, channelId, isMember, ...(errorCode ? { errorCode } : {}) } });
}
async function checkMembership(ctx: any, userId: string, telegramId: number) {
  const settings = await getBotSettings();
  if (!settings.channelIds.length) return { ok: settings.allowNoChannels, missing: [], setupMissing: true };
  const missing: string[] = [];
  for (const channel of settings.channelIds) {
    try {
      const member = await ctx.api.getChatMember(channel, telegramId);
      const isMember = ['creator', 'administrator', 'member'].includes(member.status) || (member.status === 'restricted' && member.is_member === true);
      await recordMembership(userId, channel, isMember);
      if (!isMember) missing.push(channel);
    } catch (error) {
      const code = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
      await recordMembership(userId, channel, false, code);
      missing.push(channel);
      console.error(`Membership check failed for configured channel ${channel}; ensure bot is an administrator.`, code);
    }
  }
  return { ok: missing.length === 0, missing, setupMissing: false };
}
async function sendConsentPrompt(ctx: any, userId: string) {
  await setStage(userId, RegistrationStage.CONSENT_PENDING);
  const keyboard = new Keyboard()
    .text('✅ موافقم و ادامه می‌دهم').row()
    .text('❌ فعلاً ادامه نمی‌دهم')
    .resized();
  await ctx.reply('برای ادامه ثبت‌نام، لازم است با پردازش اطلاعاتی که در این مسیر ارسال می‌کنی موافقت کنی. شماره تلفن فقط پس از اقدام خودت و با دکمه رسمی تلگرام دریافت می‌شود. متن سیاست حریم خصوصی باید پیش از استقرار نهایی در وب‌سایت منتشر شود.', { reply_markup: keyboard });
}
async function showMainMenu(ctx: any, user: any) {
  const settings = await getBotSettings();
  const keyboard = new Keyboard();
  const menuButtons = settings.dynamicConfig.builtInButtons
    .filter(item => item.enabled && ['registration_status', 'academy', 'challenge', 'support', 'miniapp'].includes(item.id))
    .filter(item => item.id !== 'miniapp' || !!settings.miniAppUrl)
    .sort((x, y) => x.order - y.order);

  for (const item of menuButtons) {
    keyboard.text(item.label).row();
  }

  const reserved = new Set([
    ...settings.dynamicConfig.builtInButtons.map(x => x.label),
    '🔄 بررسی مجدد عضویت', '✅ موافقم و ادامه می‌دهم',
    '❌ فعلاً ادامه نمی‌دهم', '📝 وضعیت ثبت‌نام',
    '🎓 آکادمی', '🏆 چالش 10X', '💬 پشتیبانی',
    '🚀 ورود به 10X Mini App', '📱 اشتراک‌گذاری شماره تلفن'
  ]);


  if (settings.dynamicConfig.enabled) {
    const seen = new Set<string>();
    for (const item of settings.dynamicConfig.customMenu) {
      const label = item.label?.trim();
      if (!item.enabled || !label || reserved.has(label) ||
          seen.has(label) || label.length > 60 || label.includes('\n')) continue;
      seen.add(label);
      keyboard.row().text(label);
    }
  }
  await ctx.reply(`وضعیت فعلی ثبت‌نام: ${stageLabel(user.registrationStage)}\n\nاز کیبورد پایین ادامه بده.`, {
    reply_markup: keyboard.resized()
  });
}

bot.command('start', async ctx => {
  if (!ctx.from) return;
  if (ctx.chat?.type !== 'private') { await ctx.reply('برای ثبت‌نام و اشتراک‌گذاری امن شماره تلفن، لطفاً ربات را در گفتگوی خصوصی باز کن و /start را بزن.'); return; }  
  try {
    const user = await upsertTelegramUser(ctx);
    const settings = await getBotSettings();
    const defaultWelcome = `به 10X خوش آمدی، ${ctx.from.first_name || 'دوست عزیز'}!\n\n10X یک مسیر آموزشی برای یادگیری بازار رمزارز، مدیریت ریسک و تمرین مسئولانه است. هیچ سودی تضمین نمی‌شود و معامله‌گری می‌تواند به از دست رفتن سرمایه منجر شود.`;
    const welcome = settings.dynamicConfig.welcomeMessage;
    await ctx.reply(
      settings.dynamicConfig.enabled && welcome
        ? welcome.replace(/\{name\}/g, ctx.from.first_name || 'دوست عزیز')
        : defaultWelcome
    );
    if (user.registrationStatus === RegistrationStatus.REGISTERED || user.registrationStatus === RegistrationStatus.COMPLETE) {
      await showMainMenu(ctx, user); return;
    }
    const membership = await checkMembership(ctx, user.id, ctx.from.id);
    if (membership.setupMissing) {
      if (!settings.allowNoChannels) {
        await setStage(user.id, RegistrationStage.CHANNELS_PENDING, { reason: 'required_channels_not_configured' });
        await ctx.reply('ثبت‌نام هنوز آماده ادامه نیست؛ کانال‌های الزامی در تنظیمات ربات مشخص نشده‌اند. مدیر پروژه باید REQUIRED_CHANNELS را تنظیم کند.');
        return;
      }
    } else if (!membership.ok) {
      await setStage(user.id, RegistrationStage.CHANNELS_PENDING, { missingChannels: membership.missing });
      await ctx.reply('برای ادامه، ابتدا در کانال‌های الزامی عضو شو و سپس روی «بررسی مجدد عضویت» بزن.', { reply_markup: await channelKeyboard() });
      return;
    }
    if (user.phone) {
      const ready = await prisma.user.update({ where: { id: user.id }, data: { registrationStatus: RegistrationStatus.REGISTERED, registrationStage: RegistrationStage.REGISTERED, registeredAt: user.registeredAt || new Date(), lastActivityAt: new Date() } });
      await setStage(user.id, RegistrationStage.REGISTERED, { phoneAlreadyProvided: true });
      await showMainMenu(ctx, ready); return;
    }
    await sendConsentPrompt(ctx, user.id);
  } catch (error) { console.error('start handler failed', error); await ctx.reply('در اجرای درخواست خطایی رخ داد. چند لحظه دیگر دوباره /start را بزن.'); }
});

bot.callbackQuery('noop', async ctx => { await ctx.answerCallbackQuery({ text: 'این لینک هنوز توسط مدیر تنظیم نشده است.' }); });
bot.hears(builtinLabel('membership_check'), async ctx => {
  try {
    const user = await upsertTelegramUser(ctx);
    const settings = await getBotSettings();
    if (!ctx.from) return;
      const result = await checkMembership(ctx, user.id, ctx.from.id);
    if (result.setupMissing && !settings.allowNoChannels) {
      await ctx.reply('کانال‌های الزامی هنوز در تنظیمات ربات تعریف نشده‌اند.');
      return;
    }
    if (!result.ok) {
      await ctx.reply(`هنوز عضویت همه کانال‌ها تأیید نشده است. موارد نیازمند بررسی: ${result.missing.join(', ')}`, { reply_markup: await channelKeyboard() });
      return;
    }
    await sendConsentPrompt(ctx, user.id);
  } catch (error) {
    console.error('membership check failed', error);
    await ctx.reply('بررسی عضویت انجام نشد. لطفاً بعداً تلاش کن.');
  }
});

bot.callbackQuery('check_membership', async ctx => {
  await ctx.answerCallbackQuery();
  try {
    const user = await upsertTelegramUser(ctx);
    const settings = await getBotSettings();
    const result = await checkMembership(ctx, user.id, ctx.from.id);
    if (result.setupMissing && !settings.allowNoChannels) { await ctx.reply('کانال‌های الزامی هنوز در تنظیمات ربات تعریف نشده‌اند.'); return; }
    if (!result.ok) { await ctx.reply(`هنوز عضویت همه کانال‌ها تأیید نشده است. موارد نیازمند بررسی: ${result.missing.join(', ')}`, { reply_markup: await channelKeyboard() }); return; }
    await sendConsentPrompt(ctx, user.id);
  } catch (error) { console.error('membership check failed', error); await ctx.reply('بررسی عضویت انجام نشد. لطفاً بعداً تلاش کن.'); }
});

bot.hears(builtinLabel('consent_yes'), async ctx => {
  await handleConsentYes(ctx);
});
bot.hears(builtinLabel('consent_no'), async ctx => {
  const user = await upsertTelegramUser(ctx);
  await setStage(user.id, RegistrationStage.CONSENT_PENDING, { consentDeclined: true });
  await ctx.reply('بدون رضایت، شماره تلفن دریافت نمی‌شود. هر زمان آماده بودی با /start می‌توانی ادامه بدهی.');
});

async function handleConsentYes(ctx: any) {

  try {
    const user = await upsertTelegramUser(ctx);
    const membership = await checkMembership(ctx, user.id, ctx.from.id);
    const settings = await getBotSettings();
    if ((membership.setupMissing && !settings.allowNoChannels) || !membership.ok) {
      await setStage(user.id, RegistrationStage.CHANNELS_PENDING, { reason: 'membership_required_before_consent' });
      await ctx.reply('قبل از ادامه ثبت‌نام، عضویت کانال‌های الزامی باید تأیید شود.', { reply_markup: await channelKeyboard() });
      return;
    }
    await prisma.userConsent.create({ data: { userId: user.id, type: 'PRIVACY_PROCESSING', channel: 'TELEGRAM', granted: true, wordingVersion: 'telegram-registration-v1' } });
    await setStage(user.id, RegistrationStage.PHONE_PENDING);
    const keyboard = new Keyboard().requestContact(builtinLabel('share_phone')).resized().oneTime();
    await ctx.reply('برای ثبت‌نام، دکمه زیر را بزن تا شماره تلفنت را مستقیماً از طریق قابلیت رسمی تلگرام ارسال کنی. شماره تایپ‌شده یا شماره شخص دیگر پذیرفته نمی‌شود.', { reply_markup: keyboard });
  } catch (error) { console.error('consent handling failed', error); await ctx.reply('ثبت رضایت انجام نشد. لطفاً دوباره تلاش کن.'); }
}
bot.callbackQuery('consent_yes', async ctx => {
  await ctx.answerCallbackQuery();
  await handleConsentYes(ctx);
});
bot.callbackQuery('consent_no', async ctx => {
  await ctx.answerCallbackQuery();
  const user = await upsertTelegramUser(ctx);
  await setStage(user.id, RegistrationStage.CONSENT_PENDING, { consentDeclined: true });
  await ctx.reply('بدون رضایت، شماره تلفن دریافت نمی‌شود. هر زمان آماده بودی با /start می‌توانی ادامه بدهی.');
});

bot.on('message:contact', async ctx => {
  try {
    const contact = ctx.message.contact;
    if (!contact.user_id || contact.user_id !== ctx.from.id) { await ctx.reply('لطفاً فقط با دکمه رسمی تلگرام شماره متعلق به حساب خودت را به اشتراک بگذار.'); return; }
    const user = await upsertTelegramUser(ctx);
    const consent = await prisma.userConsent.findFirst({ where: { userId: user.id, type: 'PRIVACY_PROCESSING', granted: true }, orderBy: { createdAt: 'desc' } });
    if (!consent) { await ctx.reply('ابتدا باید با پردازش اطلاعات موافقت کنی. دستور /start را بزن.'); return; }
    const membership = await checkMembership(ctx, user.id, ctx.from.id);
    const settings = await getBotSettings();
    if ((membership.setupMissing && !settings.allowNoChannels) || !membership.ok) { await setStage(user.id, RegistrationStage.CHANNELS_PENDING, { reason: 'membership_missing_at_contact' }); await ctx.reply('برای تکمیل ثبت‌نام، عضویت کانال‌های الزامی باید تأیید شود.', { reply_markup: await channelKeyboard() }); return; }
    if (user.phone && (user.registrationStatus === RegistrationStatus.REGISTERED || user.registrationStatus === RegistrationStatus.COMPLETE)) {
      await ctx.reply('ثبت‌نام شما قبلاً انجام شده است. اطلاعات جدیدی ایجاد نشد.');
      await showMainMenu(ctx, user);
      return;
    }
    const phone = canonicalPhone(contact.phone_number);
    if (!/^\+?[0-9]{7,15}$/.test(phone)) { await ctx.reply('شماره تلفن معتبر به نظر نمی‌رسد. دوباره از دکمه اشتراک‌گذاری استفاده کن.'); return; }
    const updated = await prisma.$transaction(async tx => {
      const saved = await tx.user.update({ where: { id: user.id }, data: { phone, registrationStatus: RegistrationStatus.REGISTERED, registrationStage: RegistrationStage.REGISTERED, registeredAt: user.registeredAt || new Date(), lastActivityAt: new Date() } });
      await tx.registrationStageEvent.create({ data: { userId: user.id, stage: RegistrationStage.REGISTERED, detail: { phoneSharedViaTelegramContact: true } } });
      await tx.followUpJob.updateMany({ where: { userId: user.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      // Merge a website pre-registration (same phone, no Telegram id) into this verified Telegram account.
      const webOnly = await tx.user.findMany({ where: { telegramId: null, id: { not: user.id }, phone: { in: phoneVariants(phone) } }, select: { id: true } });
      for (const web of webOnly) {
        await tx.userConsent.updateMany({ where: { userId: web.id }, data: { userId: user.id } });
        await tx.registrationStageEvent.updateMany({ where: { userId: web.id }, data: { userId: user.id } });
        await tx.auditLog.updateMany({ where: { userId: web.id }, data: { userId: user.id } });
        await tx.supportTicket.updateMany({ where: { userId: web.id }, data: { userId: user.id } });
        await tx.user.delete({ where: { id: web.id } });
        await tx.auditLog.create({ data: { userId: user.id, action: 'WEB_PREREGISTRATION_MERGED', entityType: 'User', entityId: web.id } });
      }
      await tx.auditLog.create({ data: { userId: user.id, action: 'TELEGRAM_REGISTRATION_COMPLETED', entityType: 'User', entityId: user.id, metadata: { contactShared: true } } });
      return saved;
    });
    await ctx.reply('✅ ثبت‌نام اولیه با موفقیت ثبت شد. شماره تلفن ذخیره شد و مرحله فعلی حساب به‌روزرسانی شد.', { reply_markup: { remove_keyboard: true } });
    await showMainMenu(ctx, updated);
  } catch (error) { console.error('contact handling failed', error); await ctx.reply('ذخیره ثبت‌نام با خطا مواجه شد. لطفاً دوباره تلاش کن یا با پشتیبانی تماس بگیر.'); }
});

bot.hears(builtinLabel('registration_status'), async ctx => {
  const user = await upsertTelegramUser(ctx);
  await ctx.reply(`وضعیت ثبت‌نام: ${stageLabel(user.registrationStage)}\nشناسه داخلی: ${user.id}\nآخرین فعالیت: ${user.lastActivityAt.toISOString()}`);
});
bot.hears(builtinLabel('academy'), async ctx => {
  const settings = await getBotSettings();
  if (!settings.miniAppUrl) { await ctx.reply('آکادمی داخل Mini App باز می‌شود، ولی لینک Mini App هنوز توسط مدیر تنظیم نشده است.'); return; }
  const base = settings.miniAppUrl.endsWith('/') ? settings.miniAppUrl : settings.miniAppUrl + '/';
  await ctx.reply('آکادمی 10X داخل Mini App باز می‌شود. محتوا آموزشی است و هیچ سودی تضمین نمی‌شود.', {
    reply_markup: new InlineKeyboard().webApp('🎓 ورود به آکادمی', new URL(settings.academyPath || '/miniapp/academy.html', base).toString())
  });
});
bot.hears(builtinLabel('challenge'), async ctx => {
  await ctx.reply('بخش چالش 10X در حال آماده‌سازی است. هدف چالش به‌معنای تضمین بازده نیست و ممکن است با ریسک از دست رفتن سرمایه همراه باشد.');
});
bot.hears(builtinLabel('support'), async ctx => {
  try {
    const user = await upsertTelegramUser(ctx);
    const activeStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] as const;
    const existing = await prisma.supportTicket.findFirst({
      where: { userId: user.id, status: { in: [...activeStatuses] } },
      orderBy: { createdAt: 'desc' }
    });

    if (existing) {
      await ctx.reply('یک گفتگوی پشتیبانی باز داری. پیام خودت را همین‌جا بفرست. برای بستن گفتگو از /closesupport استفاده کن.');
      return;
    }

    const ticket = await prisma.supportTicket.create({
      data: { userId: user.id, subject: 'درخواست پشتیبانی تلگرام', status: 'OPEN' }
    });
    await prisma.supportMessage.create({
      data: { ticketId: ticket.id, senderType: 'SYSTEM', body: 'گفتگوی پشتیبانی ایجاد شد.' }
    });
    await ctx.reply('گفتگوی پشتیبانی ایجاد شد. پیام خودت را همین‌جا بفرست. برای بستن گفتگو از /closesupport استفاده کن.');
  } catch (error) {
    console.error('support ticket create failed', error);
    await ctx.reply('ایجاد درخواست پشتیبانی انجام نشد. لطفاً دوباره تلاش کن.');
  }
});

bot.command('closesupport', async ctx => {
  try { const user = await upsertTelegramUser(ctx); const ticket = await prisma.supportTicket.findFirst({ where: { userId: user.id, status: { in: ['OPEN','IN_PROGRESS','WAITING_USER'] } }, orderBy: { createdAt: 'desc' } }); if (!ticket) { await ctx.reply('گفتگوی بازی پیدا نشد.'); return; } await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'CLOSED' } }); await prisma.supportMessage.create({ data: { ticketId: ticket.id, senderType: 'SYSTEM', body: 'کاربر گفتگو را بست.' } }); await ctx.reply('گفتگوی پشتیبانی بسته شد. هر زمان لازم بود دوباره از منوی پشتیبانی اقدام کن.'); } catch (error) { console.error('support ticket close failed', error); await ctx.reply('بستن گفتگو انجام نشد.'); }
});

bot.hears(builtinLabel('miniapp'), async ctx => {
  const settings = await getBotSettings();
  if (settings.miniAppUrl) {
    await ctx.reply('برای ورود به مینی‌اپ از این لینک استفاده کن:', {
      reply_markup: new InlineKeyboard().webApp('🚀 ورود به 10X Mini App', settings.miniAppUrl)
    });
  } else {
    await ctx.reply('لینک Mini App هنوز توسط مدیر تنظیم نشده است.');
  }
});
bot.on('message:text', async (ctx, next) => {
  const body = ctx.message.text.trim();
  if (!body || body.startsWith('/')) return next();
  try { const user = await upsertTelegramUser(ctx); const ticket = await prisma.supportTicket.findFirst({ where: { userId: user.id, status: { in: ['OPEN','IN_PROGRESS','WAITING_USER'] } }, orderBy: { createdAt: 'desc' } }); if (!ticket) return next(); if (body.length > 3500) { await ctx.reply('پیام پشتیبانی حداکثر ۳۵۰۰ نویسه است. لطفاً کوتاه‌تر ارسال کن.'); return; } await prisma.supportMessage.create({ data: { ticketId: ticket.id, senderType: 'USER', body } }); await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN' } }); await ctx.reply('پیامت در درخواست پشتیبانی ثبت شد.'); } catch (error) { console.error('support message save failed', error); await ctx.reply('ذخیره پیام پشتیبانی انجام نشد.'); }
});
// پاسخ‌های سفارشی پس از مدیریت پیام‌های پشتیبانی اجرا می‌شوند.
bot.on('message:text', async (ctx, next) => {
  const body = ctx.message.text.trim();
  if (!body || body.startsWith('/')) return next();

  try {
    const settings = await getBotSettings();
    const config = settings.dynamicConfig;

    if (!config.enabled) return next();

    const menuItem = config.customMenu.find(item =>
      item.enabled && item.label?.trim() === body
    );

    if (menuItem) {
      await ctx.reply(menuItem.response);
      return;
    }

    const normalized = body.toLocaleLowerCase();
    const autoReply = config.autoReplies.find(item =>
      item.enabled &&
      item.keyword?.trim() &&
      normalized.includes(item.keyword.trim().toLocaleLowerCase())
    );

    if (autoReply) {
      await ctx.reply(autoReply.response);
      return;
    }

    return next();
  } catch (error) {
    console.error('dynamic bot config handler failed', error);
    return next();
  }
});

bot.command('menu', async ctx => {
  const user = await upsertTelegramUser(ctx);
  await showMainMenu(ctx, user);
});
bot.catch(error => { console.error('unhandled Telegram update error', error); });

let automationBusy = false;
const MAX_AUTO_FOLLOWUPS = 3;
async function processDueAutomations() {
  if (automationBusy) return;
  automationBusy = true;
  try {
    const now = new Date();
    // Automatically queue one registration reminder after five hours of inactivity.
    const inactiveBefore = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const inactiveUsers = await prisma.user.findMany({
      where: { registrationStatus: { in: ['STARTED', 'PHONE_PENDING'] }, lastActivityAt: { lte: inactiveBefore }, telegramAccount: { isNot: null } },
      select: { id: true }, take: 100
    });
    for (const candidate of inactiveUsers) {
      const recent = await prisma.followUpJob.findFirst({ where: { userId: candidate.id, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }, select: { id: true } });
      if (!recent) {
        const history = await prisma.followUpJob.findMany({ where: { userId: candidate.id }, select: { lastError: true } });
        if (history.length < MAX_AUTO_FOLLOWUPS && !history.some(h => h.lastError === 'bot_blocked')) await prisma.followUpJob.create({ data: { userId: candidate.id, dueAt: now, status: 'PENDING' } });
      }
    }
    const jobs = await prisma.followUpJob.findMany({ where: { status: 'PENDING', dueAt: { lte: now } }, orderBy: { dueAt: 'asc' }, take: 20, include: { user: { include: { telegramAccount: true } } } });
    for (const job of jobs) {
      const claim = await prisma.followUpJob.updateMany({ where: { id: job.id, status: 'PENDING' }, data: { status: 'PROCESSING' } });
      if (!claim.count) continue;
      if (!job.user.telegramAccount || ['REGISTERED', 'COMPLETE'].includes(job.user.registrationStatus)) {
        await prisma.followUpJob.update({ where: { id: job.id }, data: { status: 'CANCELLED', lastError: job.user.telegramAccount ? 'registration_already_complete' : 'telegram_account_missing' } });
        continue;
      }
      try {
        await bot.api.sendMessage(job.user.telegramAccount.chatId, 'یادآوری 10X: ثبت‌نامت هنوز کامل نشده است. برای ادامه، ربات را باز کن و /start را بزن. هیچ سودی تضمین نمی‌شود و مدیریت ریسک ضروری است.');
        await prisma.followUpJob.update({ where: { id: job.id }, data: { status: 'SENT', lastError: null } });
        await prisma.auditLog.create({ data: { userId: job.userId, action: 'REGISTRATION_FOLLOWUP_SENT', entityType: 'FollowUpJob', entityId: job.id } });
      } catch (error) {
        const attempts = job.attempts + 1;
        const blocked = (error as { error_code?: number }).error_code === 403;
        const message = error instanceof Error ? error.message.slice(0, 500) : 'unknown_error';
        await prisma.followUpJob.update({ where: { id: job.id }, data: { attempts, lastError: blocked ? 'bot_blocked' : message, status: blocked || attempts >= 5 ? 'FAILED' : 'PENDING', dueAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000) } });
      }
    }
    const pending = await prisma.notification.findMany({ where: { status: 'PENDING', channel: 'TELEGRAM' }, orderBy: { createdAt: 'asc' }, take: 20, include: { user: { include: { telegramAccount: true } } } });
    for (const item of pending) {
      const claim = await prisma.notification.updateMany({ where: { id: item.id, status: 'PENDING' }, data: { status: 'PROCESSING' } });
      if (!claim.count) continue;
      if (!item.user.telegramAccount) { await prisma.notification.update({ where: { id: item.id }, data: { status: 'FAILED' } }); continue; }
      try {
        const text = item.title ? `<b>${escapeHtml(item.title)}</b>\n\n${escapeHtml(item.body)}` : escapeHtml(item.body);
        await bot.api.sendMessage(item.user.telegramAccount.chatId, text, { parse_mode: 'HTML' });
        await prisma.notification.update({ where: { id: item.id }, data: { status: 'SENT', sentAt: new Date() } });
      } catch (error) {
        console.error('notification send failed', item.id, error instanceof Error ? error.message : 'unknown_error');
        await prisma.notification.update({ where: { id: item.id }, data: { status: 'FAILED' } });
      }
    }
  } catch (error) { console.error('automation worker failed', error); }
  finally { automationBusy = false; }
}
function escapeHtml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

async function main() {
  await prisma.$connect();
  // A restart can interrupt a send; release anything left in PROCESSING (single bot instance).
  await prisma.followUpJob.updateMany({ where: { status: 'PROCESSING' }, data: { status: 'PENDING' } });
  await prisma.notification.updateMany({ where: { status: 'PROCESSING' }, data: { status: 'PENDING' } });
  await processDueAutomations();
  setInterval(() => { void processDueAutomations(); }, 15_000).unref();
  const mode = process.env.TELEGRAM_MODE || 'polling';
  if (mode !== 'polling') throw new Error('This build supports polling only. Keep TELEGRAM_MODE=polling until the dedicated HTTPS webhook receiver is implemented and tested.');
  await bot.start({ onStart: info => console.log(`10X Telegram bot polling as @${info.username}`) });
}
process.once('SIGINT', async () => { bot.stop(); await prisma.$disconnect(); });
process.once('SIGTERM', async () => { bot.stop(); await prisma.$disconnect(); });
main().catch(async error => { console.error('Bot startup failed:', error); await prisma.$disconnect(); process.exit(1); });
