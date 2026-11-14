import { TELEGRAM_CONSENT_VERSION, withBotUserLock, mergeWebRegistration } from './account-state.js';
import { NOTIFICATION_RETRY_PREFIX, notificationRetry, readNotificationRetry } from './notification-retry.js';
import 'dotenv/config';
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { botProgress, menuRowPlan, renderBotScreen, renderBotText, type BotScreen } from './bot-ui.js';
import { canonicalPhone, phoneVariants } from '../../../packages/shared/src/phone.js';

type RegistrationStage = 'STARTED' | 'CHANNELS_PENDING' | 'CONSENT_PENDING' | 'PHONE_PENDING' | 'REGISTERED' | 'MINI_APP_PENDING' | 'COMPLETE';
const RegistrationStage = { STARTED: 'STARTED', CHANNELS_PENDING: 'CHANNELS_PENDING', CONSENT_PENDING: 'CONSENT_PENDING', PHONE_PENDING: 'PHONE_PENDING', REGISTERED: 'REGISTERED', MINI_APP_PENDING: 'MINI_APP_PENDING', COMPLETE: 'COMPLETE' } as const;
const RegistrationStatus = { STARTED: 'STARTED', PHONE_PENDING: 'PHONE_PENDING', REGISTERED: 'REGISTERED', COMPLETE: 'COMPLETE' } as const;

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN is missing. Copy .env.example to .env and configure it.'); process.exit(1); }
// Use the official Telegram Bot API endpoint. No third-party relay is configured.
const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
const bot = new Bot(token, apiRoot ? { client: { apiRoot } } : undefined);
// All registration, support and menu actions belong to a private conversation.
bot.use(async (ctx, next) => {
  if (ctx.chat?.type !== 'private') return;
  return next();
});
const prisma = new PrismaClient();

// Visual presentation only: retain Telegram handlers and existing business workflows.
function uiReply(ctx: any, text: string, options: any = {}) {
  return ctx.reply(renderBotText(String(text)), {
    ...options, parse_mode: 'HTML', link_preview_options: { is_disabled: true }
  });
}
function uiScreen(ctx: any, screen: BotScreen, options: any = {}) {
  return ctx.reply(renderBotScreen(screen), {
    ...options, parse_mode: 'HTML', link_preview_options: { is_disabled: true }
  });
}
// TENX_DYNAMIC_BOT_MENU_V1
// TENX_BUILTIN_BUTTONS_V1
type BuiltInButton = {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
};
type BotMenuBlock = {
  type: 'text' | 'image' | 'video' | 'link' | 'separator';
  text?: string;
  url?: string;
  caption?: string;
};

type DynamicBotConfig = {
  enabled: boolean;
  miniAppOnly: boolean;
  welcomeMessage: string;
  challengeLessonId?: string;
  autoReplies: { keyword: string; response: string; enabled: boolean }[];
  customMenu: {
    label: string;
    response: string;
    enabled: boolean;
    action?: 'reply' | 'url' | 'web_app' | 'academy_lesson';
    url?: string;
    lessonId?: string;
    blocks?: BotMenuBlock[];
  }[];
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
function hearsBuiltin(id: string, handler: (ctx: any) => Promise<unknown>) {
  bot.on('message:text', async (ctx, next) => {
    await getBotSettings().catch(() => undefined);
    const label=ctx.message.text.trim();
    const button=BUILTIN_BUTTON_CACHE.find(x=>x.id===id);
    if(label===builtinLabel(id)||label===DEFAULT_BUILTIN_BUTTONS.find(x=>x.id===id)?.label){
      if(button?.enabled===false){await uiReply(ctx,'این گزینه توسط مدیر غیرفعال شده است؛ /menu را بزن.');return;}
      return handler(ctx);
    }
    return next();
  });
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
  miniAppOnly: false,
  welcomeMessage: 'به 10X خوش آمدی، {name}!',
  autoReplies: [],
  customMenu: [],
  builtInButtons: DEFAULT_BUILTIN_BUTTONS
};
let SETTINGS_CACHE: { at: number; value: BotSettings } | null = null;
async function getBotSettings(): Promise<BotSettings> {
  if (SETTINGS_CACHE && Date.now() - SETTINGS_CACHE.at < 10_000) return SETTINGS_CACHE.value;
  const value = await loadBotSettings();
  SETTINGS_CACHE = { at: Date.now(), value };
  return value;
}
async function loadBotSettings(): Promise<BotSettings> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: ['REQUIRED_CHANNELS', 'REQUIRED_CHANNEL_LINKS', 'ALLOW_NO_REQUIRED_CHANNELS', 'MINI_APP_URL', 'BOT_CONTROL_CONFIG', 'PAGE_PATH_academy'] } } });
  const saved = Object.fromEntries(rows.map(row => [row.key, row.value])) as Record<string, unknown>;
  const channels = String(saved.REQUIRED_CHANNELS ?? process.env.REQUIRED_CHANNELS ?? '');
  const links = String(saved.REQUIRED_CHANNEL_LINKS ?? process.env.REQUIRED_CHANNEL_LINKS ?? '');
  return {
    channelIds: channels.split(',').map(x => x.trim()).filter(Boolean),
    channelLinks: links.split(';').map(x => x.trim()),
    allowNoChannels: saved.ALLOW_NO_REQUIRED_CHANNELS === undefined ? process.env.ALLOW_NO_REQUIRED_CHANNELS === 'true' : saved.ALLOW_NO_REQUIRED_CHANNELS === true,
    miniAppUrl: String(saved.MINI_APP_URL ?? process.env.MINI_APP_URL ?? ''),
    academyPath: String(saved.PAGE_PATH_academy ?? '/academy'),
    dynamicConfig: (() => {
      const raw = saved.BOT_CONTROL_CONFIG;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { BUILTIN_BUTTON_CACHE=DEFAULT_BUILTIN_BUTTONS;return DEFAULT_DYNAMIC_CONFIG; }
      const v = raw as Record<string, unknown>;
      const list = (value: unknown) => Array.isArray(value)
        ? value.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
            .slice(0, 50).map(x => ({
              keyword: typeof x.keyword === 'string' ? x.keyword.slice(0, 100) : '',
              label: typeof x.label === 'string' ? x.label.slice(0, 60) : '',
              response: typeof x.response === 'string' ? x.response.slice(0, 2000) : '',
              enabled: x.enabled !== false,
              action: ['reply', 'url', 'web_app', 'academy_lesson'].includes(String(x.action))
                ? x.action as 'reply' | 'url' | 'web_app' | 'academy_lesson' : 'reply',
              url: typeof x.url === 'string' ? x.url.slice(0, 1000) : '',
              lessonId: typeof x.lessonId === 'string' ? x.lessonId.slice(0, 128) : '',
              blocks: Array.isArray(x.blocks) ? x.blocks.slice(0, 20).filter((b): b is Record<string, unknown> =>
                !!b && typeof b === 'object' && !Array.isArray(b)
              ).map(b => ({
                type: ['text', 'image', 'video', 'link', 'separator'].includes(String(b.type))
                  ? b.type as BotMenuBlock['type'] : 'text',
                text: typeof b.text === 'string' ? b.text.slice(0, 2000) : '',
                url: typeof b.url === 'string' ? b.url.slice(0, 1000) : '',
                caption: typeof b.caption === 'string' ? b.caption.slice(0, 500) : ''
              })) : []
            }))
        : [];
      return {
        enabled: v.enabled !== false,
        miniAppOnly: v.miniAppOnly === true,
        welcomeMessage: typeof v.welcomeMessage === 'string' && v.welcomeMessage.trim()
          ? v.welcomeMessage.slice(0, 2000) : DEFAULT_DYNAMIC_CONFIG.welcomeMessage,
        challengeLessonId: typeof v.challengeLessonId === 'string'
          ? v.challengeLessonId.slice(0, 128) : '',
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
  const chatId = String(from.id);
  const telegramId = String(from.id);
  const existed = await prisma.user.findUnique({ where: { telegramId }, select: { id: true, profileCompletedAt: true } });
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: { telegramId, username: from.username ?? null, firstName: from.first_name, lastName: from.last_name ?? null, registrationStage: settings.channelIds.length ? RegistrationStage.CHANNELS_PENDING : RegistrationStage.STARTED, registrationStatus: RegistrationStatus.STARTED, lastActivityAt: new Date() },
    update: {
      username: from.username ?? null,
      ...(existed?.profileCompletedAt ? {} : {
        firstName: from.first_name,
        lastName: from.last_name ?? null
      }),
      lastActivityAt: new Date()
    }
  });
  if (!existed) await prisma.registrationStageEvent.create({ data: { userId: user.id, stage: user.registrationStage, detail: { source: 'telegram_start' } } });
  await prisma.telegramAccount.upsert({ where: { telegramId }, create: { userId: user.id, telegramId, chatId, languageCode: from.language_code, isBot: from.is_bot }, update: { chatId, languageCode: from.language_code } });
  return user;
}
async function setStage(userId: string, stage: RegistrationStage, detail?: object) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { registrationStage: stage, ...(['STARTED','CHANNELS_PENDING','CONSENT_PENDING','PHONE_PENDING'].includes(stage)?{registrationStatus:stage==='PHONE_PENDING'?RegistrationStatus.PHONE_PENDING:RegistrationStatus.STARTED}:{}), lastActivityAt: new Date() } }),
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
function registrationComplete(user: {registrationStatus?: string}) {
  return user.registrationStatus === 'REGISTERED' || user.registrationStatus === 'COMPLETE';
}
async function latestTelegramConsent(userId:string,db:PrismaClient|import('@prisma/client').Prisma.TransactionClient=prisma){
  return db.userConsent.findFirst({where:{userId,type:'PRIVACY_PROCESSING',channel:'TELEGRAM',wordingVersion:TELEGRAM_CONSENT_VERSION},orderBy:[{createdAt:'desc'},{id:'desc'}]});
}
async function recordTelegramConsent(userId:string,granted:boolean){
  return withBotUserLock(prisma,userId,async tx=>{
    const latest=await latestTelegramConsent(userId,tx);
    if(latest?.granted===granted)return latest;
    const createdAt=new Date(Math.max(Date.now(),(latest?.createdAt.getTime()||0)+1));
    return tx.userConsent.create({data:{userId,type:'PRIVACY_PROCESSING',channel:'TELEGRAM',wordingVersion:TELEGRAM_CONSENT_VERSION,granted,createdAt}});
  });
}
async function sendConsentPrompt(ctx: any, userId: string) {
  const current = await prisma.user.findUnique({where:{id:userId}});
  if (current && registrationComplete(current)) { await showMainMenu(ctx, current); return; }
  await setStage(userId, RegistrationStage.CONSENT_PENDING);
  const keyboard = new Keyboard()
    .text(builtinLabel('consent_yes')).row()
    .text(builtinLabel('consent_no'))
    .resized();
  await uiReply(ctx,'برای ادامه ثبت‌نام، لازم است با پردازش اطلاعاتی که در این مسیر ارسال می‌کنی موافقت کنی. شماره تلفن فقط پس از اقدام خودت و با دکمه رسمی تلگرام دریافت می‌شود. متن سیاست حریم خصوصی باید پیش از استقرار نهایی در وب‌سایت منتشر شود.', { reply_markup: keyboard });
}
/** Removing a reply keyboard and sending an inline Web App button require
 * separate Telegram messages: a message has only one reply_markup field.
 */
async function showMiniAppOnly(ctx: any, settings: BotSettings) {
  await uiReply(ctx,'برای ادامه، مینی‌اپ را باز کن.', {reply_markup:{remove_keyboard:true}});
  let url: URL;
  try {
    url = new URL(settings.miniAppUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid mini app URL');
  } catch {
    await uiReply(ctx,'لینک مینی‌اپ هنوز به‌درستی تنظیم نشده است. لطفاً به پشتیبانی اطلاع بده.');
    return;
  }
  await uiReply(ctx,'ورود به مینی‌اپ:', {
    reply_markup: new InlineKeyboard().webApp('🚀 ورود به مینی‌اپ', url.toString())
  });
}

async function showMainMenu(ctx: any, user: any) {
  const settings = await getBotSettings();
  if (settings.dynamicConfig.miniAppOnly) return showMiniAppOnly(ctx, settings);
  const menuButtons = settings.dynamicConfig.builtInButtons
    .filter(item => item.enabled && ['registration_status', 'academy', 'challenge', 'support', 'miniapp'].includes(item.id))
    .filter(item => item.id !== 'miniapp' || !!settings.miniAppUrl)
    .sort((x, y) => x.order - y.order);

  const reserved = new Set([
    ...settings.dynamicConfig.builtInButtons.map(x => x.label),
    '🔄 بررسی مجدد عضویت', '✅ موافقم و ادامه می‌دهم',
    '❌ فعلاً ادامه نمی‌دهم', '📝 وضعیت ثبت‌نام',
    '🎓 آکادمی', '🏆 چالش 10X', '💬 پشتیبانی',
    '🚀 ورود به 10X Mini App', '📱 اشتراک‌گذاری شماره تلفن'
  ]);

  const customLabels: string[] = [];
  if (settings.dynamicConfig.enabled) {
    const seen = new Set<string>();
    for (const item of settings.dynamicConfig.customMenu) {
      const label = item.label?.trim();
      if (!item.enabled || !label || reserved.has(label) ||
          seen.has(label) || label.length > 60 || label.includes('\n')) continue;
      seen.add(label);
      customLabels.push(label);
    }
  }

  // Native Telegram keyboards cannot be themed with CSS. Keep short actions in
  // paired rows, and long labels as full-width touch targets.
  const keyboard = new Keyboard();
  const groups = [menuRowPlan(menuButtons.map(item => item.label)), menuRowPlan(customLabels)];
  for (const group of groups) {
    for (const row of group) {
      for (const label of row) keyboard.text(label);
      keyboard.row();
    }
  }
  await uiScreen(ctx, {
    title: 'منوی اصلی ربات',
    description: `وضعیت فعلی ثبت‌نام: ${stageLabel(user.registrationStage)}\n\nبخش موردنظر خودت را از دکمه‌های پایین انتخاب کن.`,
    progress: botProgress(user.registrationStage),
    hint: 'برای نمایش دوباره این منو، /menu را بزن.'
  }, { reply_markup: keyboard.resized() });
}

// === TENX_P50_BOT_ATTRIBUTION_V1_START ===
const growthBotDefaultCampaigns=[
  {code:'campaign01',active:true},{code:'blogger01',active:true},
  {code:'telegram01',active:true},{code:'instagram01',active:true},
  {code:'matin_channel',active:true},{code:'mohammadjavad_channel',active:true}
];
async function growthAttributeStart(ctx:any,userId:string){
  const raw=String(ctx.match||'').trim();
  if(!/^c_[a-z0-9_-]{3,32}$/.test(raw))return;
  const code=raw.slice(2);
  const row=await prisma.systemSetting.findUnique({where:{key:'TENX_GROWTH_CAMPAIGNS_V1'}});
  const campaigns=Array.isArray(row?.value)?row.value as any[]:growthBotDefaultCampaigns;
  if(!campaigns.some((x:any)=>x?.code===code&&x?.active!==false&&!x?.archivedAt&&(!x?.expiresAt||(Number.isFinite(Date.parse(String(x.expiresAt)))&&Date.parse(String(x.expiresAt))>Date.now()))))return; // TENX_P58_CAMPAIGN_LIFECYCLE_V1
  const current=await prisma.user.findUnique({where:{id:userId},select:{registrationSource:true,registrationStage:true,registeredAt:true,createdAt:true}});
  if(!current)return;
  // A campaign must arrive during the initial start, not months after registration.
  if(current.registeredAt || Date.now()-current.createdAt.getTime()>5*60000)return;
  // First-touch attribution: a returning user does not overwrite a prior campaign.
  if(current.registrationSource && !['telegram','unknown',''].includes(current.registrationSource))return;
  const changed=await prisma.user.updateMany({where:{id:userId,registrationSource:{in:['telegram','unknown','']},createdAt:{gte:new Date(Date.now()-5*60000)},registeredAt:null},
    data:{registrationSource:'campaign:'+code}});
  if(changed.count){
    await prisma.registrationStageEvent.create({data:{userId,stage:current.registrationStage,detail:{source:'campaign:'+code,tracking:'P50_FIRST_TOUCH'}}});
  }
}
// === TENX_P50_BOT_ATTRIBUTION_V1_END ===


// Registered before commands, old callback buttons, contact and support handlers.
// Stop at the gateway so old keyboards cannot still trigger hidden actions.
bot.use(async (ctx, next) => {
  if (!ctx.message && !ctx.callbackQuery) return next();
  const settings = await getBotSettings();
  if (!settings.dynamicConfig.miniAppOnly) return next();
  if (!ctx.from) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => undefined);
  const user = await upsertTelegramUser(ctx);
  if (ctx.message?.text && /^\/start(?:@\w+)?(?:\s|$)/.test(ctx.message.text)) {
    await growthAttributeStart(ctx, user.id).catch(error => console.error('growth_attribution_failed', error));
  }
  return showMiniAppOnly(ctx, settings);
});

bot.command('start', async ctx => {
  if (!ctx.from) return;
  if (ctx.chat?.type !== 'private') { await uiReply(ctx,'برای ثبت‌نام و اشتراک‌گذاری امن شماره تلفن، لطفاً ربات را در گفتگوی خصوصی باز کن و /start را بزن.'); return; }  
  try {
    const user = await upsertTelegramUser(ctx);
    await growthAttributeStart(ctx,user.id).catch(e=>console.error('growth_attribution_failed',e));
    const settings = await getBotSettings();
    const defaultWelcome = `به 10X خوش آمدی، ${ctx.from.first_name || 'دوست عزیز'}!\n\n10X یک مسیر آموزشی برای یادگیری بازار رمزارز، مدیریت ریسک و تمرین مسئولانه است. هیچ سودی تضمین نمی‌شود و معامله‌گری می‌تواند به از دست رفتن سرمایه منجر شود.`;
    const welcome = settings.dynamicConfig.welcomeMessage;
    await uiReply(ctx,
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
        await uiReply(ctx,'ثبت‌نام هنوز آماده ادامه نیست؛ کانال‌های الزامی در تنظیمات ربات مشخص نشده‌اند. مدیر پروژه باید REQUIRED_CHANNELS را تنظیم کند.');
        return;
      }
    } else if (!membership.ok) {
      await setStage(user.id, RegistrationStage.CHANNELS_PENDING, { missingChannels: membership.missing });
      await uiReply(ctx,'برای ادامه، ابتدا در کانال‌های الزامی عضو شو و سپس روی «بررسی مجدد عضویت» بزن.', { reply_markup: await channelKeyboard() });
      return;
    }
    if (user.phone && (await latestTelegramConsent(user.id))?.granted) {
      const ready = await prisma.user.update({ where: { id: user.id }, data: { registrationStatus: RegistrationStatus.REGISTERED, registrationStage: RegistrationStage.REGISTERED, registeredAt: user.registeredAt || new Date(), lastActivityAt: new Date() } });
      await setStage(user.id, RegistrationStage.REGISTERED, { phoneAlreadyProvided: true });
      await showMainMenu(ctx, ready); return;
    }
    await sendConsentPrompt(ctx, user.id);
  } catch (error) { console.error('start handler failed', error); await uiReply(ctx,'در اجرای درخواست خطایی رخ داد. چند لحظه دیگر دوباره /start را بزن.'); }
});

bot.callbackQuery('noop', async ctx => { await ctx.answerCallbackQuery({ text: 'این لینک هنوز توسط مدیر تنظیم نشده است.' }); });
hearsBuiltin('membership_check', async (ctx: any) => {
  try {
    const user = await upsertTelegramUser(ctx);
    const settings = await getBotSettings();
    if (!ctx.from) return;
      const result = await checkMembership(ctx, user.id, ctx.from.id);
    if (result.setupMissing && !settings.allowNoChannels) {
      await uiReply(ctx,'کانال‌های الزامی هنوز در تنظیمات ربات تعریف نشده‌اند.');
      return;
    }
    if (!result.ok) {
      await uiReply(ctx,`هنوز عضویت همه کانال‌ها تأیید نشده است. موارد نیازمند بررسی: ${result.missing.join(', ')}`, { reply_markup: await channelKeyboard() });
      return;
    }
    await sendConsentPrompt(ctx, user.id);
  } catch (error) {
    console.error('membership check failed', error);
    await uiReply(ctx,'بررسی عضویت انجام نشد. لطفاً بعداً تلاش کن.');
  }
});

bot.callbackQuery('check_membership', async ctx => {
  await ctx.answerCallbackQuery();
  try {
    const user = await upsertTelegramUser(ctx);
    const settings = await getBotSettings();
    const result = await checkMembership(ctx, user.id, ctx.from.id);
    if (result.setupMissing && !settings.allowNoChannels) { await uiReply(ctx,'کانال‌های الزامی هنوز در تنظیمات ربات تعریف نشده‌اند.'); return; }
    if (!result.ok) { await uiReply(ctx,`هنوز عضویت همه کانال‌ها تأیید نشده است. موارد نیازمند بررسی: ${result.missing.join(', ')}`, { reply_markup: await channelKeyboard() }); return; }
    await sendConsentPrompt(ctx, user.id);
  } catch (error) { console.error('membership check failed', error); await uiReply(ctx,'بررسی عضویت انجام نشد. لطفاً بعداً تلاش کن.'); }
});

hearsBuiltin('consent_yes', async (ctx: any) => {
  await handleConsentYes(ctx);
});
hearsBuiltin('consent_no', async (ctx: any) => {
  try {
    const user = await upsertTelegramUser(ctx);
    if (registrationComplete(user)) { await showMainMenu(ctx, user); return; }
    await recordTelegramConsent(user.id,false);
    await setStage(user.id, RegistrationStage.CONSENT_PENDING, { consentDeclined: true });
    await uiReply(ctx,'بدون رضایت، شماره تلفن دریافت نمی‌شود. هر زمان آماده بودی با /start می‌توانی ادامه بدهی.',{reply_markup:{remove_keyboard:true}});
  } catch (error) { console.error('consent decline failed', error); }
});

async function handleConsentYes(ctx: any) {

  try {
    const user = await upsertTelegramUser(ctx);
    if (registrationComplete(user)) { await showMainMenu(ctx, user); return; }
    const membership = await checkMembership(ctx, user.id, ctx.from.id);
    const settings = await getBotSettings();
    if ((membership.setupMissing && !settings.allowNoChannels) || !membership.ok) {
      await setStage(user.id, RegistrationStage.CHANNELS_PENDING, { reason: 'membership_required_before_consent' });
      await uiReply(ctx,'قبل از ادامه ثبت‌نام، عضویت کانال‌های الزامی باید تأیید شود.', { reply_markup: await channelKeyboard() });
      return;
    }
    await recordTelegramConsent(user.id,true);
    await setStage(user.id, RegistrationStage.PHONE_PENDING);
    const keyboard = new Keyboard().requestContact(builtinLabel('share_phone')).resized().oneTime();
    await uiReply(ctx,'برای ثبت‌نام، دکمه زیر را بزن تا شماره تلفنت را مستقیماً از طریق قابلیت رسمی تلگرام ارسال کنی. شماره تایپ‌شده یا شماره شخص دیگر پذیرفته نمی‌شود.', { reply_markup: keyboard });
  } catch (error) { console.error('consent handling failed', error); await uiReply(ctx,'ثبت رضایت انجام نشد. لطفاً دوباره تلاش کن.'); }
}
bot.callbackQuery('consent_yes', async ctx => {
  await ctx.answerCallbackQuery();
  await handleConsentYes(ctx);
});
bot.callbackQuery('consent_no', async ctx => {
  await ctx.answerCallbackQuery();
  try {
    const user = await upsertTelegramUser(ctx);
    if (registrationComplete(user)) { await showMainMenu(ctx, user); return; }
    await recordTelegramConsent(user.id,false);
    await setStage(user.id, RegistrationStage.CONSENT_PENDING, { consentDeclined: true });
    await uiReply(ctx,'بدون رضایت، شماره تلفن دریافت نمی‌شود. هر زمان آماده بودی با /start می‌توانی ادامه بدهی.',{reply_markup:{remove_keyboard:true}});
  } catch (error) { console.error('consent decline failed', error); }
});

bot.on('message:contact', async ctx => {
  try {
    const contact = ctx.message.contact;
    if (!contact.user_id || contact.user_id !== ctx.from.id) { await uiReply(ctx,'لطفاً فقط با دکمه رسمی تلگرام شماره متعلق به حساب خودت را به اشتراک بگذار.'); return; }
    const user = await upsertTelegramUser(ctx);
    const consent = await latestTelegramConsent(user.id);
    if (!consent?.granted) { await uiReply(ctx,'ابتدا باید با پردازش اطلاعات موافقت کنی. دستور /start را بزن.'); return; }
    const membership = await checkMembership(ctx, user.id, ctx.from.id);
    const settings = await getBotSettings();
    if ((membership.setupMissing && !settings.allowNoChannels) || !membership.ok) { await setStage(user.id, RegistrationStage.CHANNELS_PENDING, { reason: 'membership_missing_at_contact' }); await uiReply(ctx,'برای تکمیل ثبت‌نام، عضویت کانال‌های الزامی باید تأیید شود.', { reply_markup: await channelKeyboard() }); return; }
    if (user.phone && (user.registrationStatus === RegistrationStatus.REGISTERED || user.registrationStatus === RegistrationStatus.COMPLETE)) {
      await uiReply(ctx,'ثبت‌نام شما قبلاً انجام شده است. اطلاعات جدیدی ایجاد نشد.');
      await showMainMenu(ctx, user);
      return;
    }
    const phone = canonicalPhone(contact.phone_number);
    if (!/^\+?[0-9]{7,15}$/.test(phone)) { await uiReply(ctx,'شماره تلفن معتبر به نظر نمی‌رسد. دوباره از دکمه اشتراک‌گذاری استفاده کن.'); return; }
    const updated = await withBotUserLock(prisma,user.id,async tx => {
      const current=await tx.user.findUnique({where:{id:user.id}});
      if(current&&registrationComplete(current))return current;
      if(!(await latestTelegramConsent(user.id,tx))?.granted)throw Error('privacy_consent_required');
      const saved = await tx.user.update({ where: { id: user.id }, data: { phone, registrationStatus: RegistrationStatus.REGISTERED, registrationStage: RegistrationStage.REGISTERED, registeredAt: user.registeredAt || new Date(), lastActivityAt: new Date() } });
      await tx.registrationStageEvent.create({ data: { userId: user.id, stage: RegistrationStage.REGISTERED, detail: { phoneSharedViaTelegramContact: true } } });
      await tx.followUpJob.updateMany({ where: { userId: user.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      // Merge a website pre-registration (same phone, no Telegram id) into this verified Telegram account.
      const webOnly = await tx.user.findMany({ where: { telegramId: null, id: { not: user.id }, phone: { in: phoneVariants(phone) } }, select: { id: true } });
      for (const web of webOnly) await mergeWebRegistration(tx,user.id,web.id);
      // Include reminders moved from website-only accounts in the cancellation.
      await tx.followUpJob.updateMany({where:{userId:user.id,status:'PENDING'},data:{status:'CANCELLED'}});
      await tx.auditLog.create({ data: { userId: user.id, action: 'TELEGRAM_REGISTRATION_COMPLETED', entityType: 'User', entityId: user.id, metadata: { contactShared: true } } });
      return saved;
    });
    await uiReply(ctx,'✅ ثبت‌نام اولیه با موفقیت ثبت شد. شماره تلفن ذخیره شد و مرحله فعلی حساب به‌روزرسانی شد.', { reply_markup: { remove_keyboard: true } });
    await showMainMenu(ctx, updated);
  } catch (error) { console.error('contact handling failed', error); await uiReply(ctx,'ذخیره ثبت‌نام با خطا مواجه شد. لطفاً دوباره تلاش کن یا با پشتیبانی تماس بگیر.'); }
});

hearsBuiltin('registration_status', async (ctx: any) => {
  try {
    const user = await upsertTelegramUser(ctx);
    await uiReply(ctx,`وضعیت ثبت‌نام: ${stageLabel(user.registrationStage)}\nشناسه داخلی: ${user.id}\nآخرین فعالیت: ${user.lastActivityAt.toISOString()}`);
  } catch (error) { console.error('registration status failed', error); await uiReply(ctx,'دریافت وضعیت انجام نشد. لطفاً دوباره تلاش کن.'); }
});
hearsBuiltin('academy', async (ctx: any) => {
  const settings = await getBotSettings();
  if (!settings.miniAppUrl) { await uiReply(ctx,'آکادمی داخل Mini App باز می‌شود، ولی لینک Mini App هنوز توسط مدیر تنظیم نشده است.'); return; }
  const base = settings.miniAppUrl.endsWith('/') ? settings.miniAppUrl : settings.miniAppUrl + '/';
  await uiReply(ctx,'آکادمی 10X داخل Mini App باز می‌شود. محتوا آموزشی است و هیچ سودی تضمین نمی‌شود.', {
    reply_markup: new InlineKeyboard().webApp('🎓 ورود به آکادمی', new URL(settings.academyPath || '/academy', base).toString())
  });
});
hearsBuiltin('challenge', async (ctx: any) => {
    const settings = await getBotSettings();
    const lessonId = settings.dynamicConfig.challengeLessonId;
    if (!settings.miniAppUrl) {
      await uiReply(ctx,'لینک Mini App هنوز توسط مدیر تنظیم نشده است.');
      return;
    }
    const base = settings.miniAppUrl.endsWith('/') ? settings.miniAppUrl : settings.miniAppUrl + '/';
    if (!lessonId) {
      const academyUrl = new URL(settings.academyPath || '/academy', base).toString();
      await uiReply(ctx,'برای مشاهده محتوای چالش 10X وارد آکادمی شو. فعالیت در بازارهای مالی با ریسک همراه است و هیچ سودی تضمین نمی‌شود.', {
        reply_markup: new InlineKeyboard().webApp('🏆 ورود به آکادمی', academyUrl)
      });
      return;
    }
    const lessonUrl = new URL('/miniapp/index.html', base);
    lessonUrl.searchParams.set('view', 'academy');
    lessonUrl.searchParams.set('lessonId', lessonId);
    await uiReply(ctx,'درس معرفی چالش 10X را مشاهده کن. این محتوا تضمین‌کننده سود نیست و فعالیت در بازارهای مالی با ریسک همراه است.', {
      reply_markup: new InlineKeyboard().webApp('🏆 مشاهده درس چالش', lessonUrl.toString())
    });
  });
hearsBuiltin('support', async (ctx: any) => {
  try {
    const user = await upsertTelegramUser(ctx);
    const created=await withBotUserLock(prisma,user.id,async tx=>{
      const existing=await tx.supportTicket.findFirst({where:{userId:user.id,status:{in:['OPEN','IN_PROGRESS','WAITING_USER']}},orderBy:{createdAt:'desc'}});
      if(existing)return false;
      const ticket=await tx.supportTicket.create({data:{userId:user.id,subject:'درخواست پشتیبانی تلگرام',status:'OPEN'}});
      await tx.supportMessage.create({data:{ticketId:ticket.id,senderType:'SYSTEM',body:'گفتگوی پشتیبانی ایجاد شد.'}});
      return true;
    });
    if(!created){await uiReply(ctx,'یک گفتگوی پشتیبانی باز داری. پیام خودت را همین‌جا بفرست. برای بستن گفتگو از /closesupport استفاده کن.');return;}
    await uiReply(ctx,'گفتگوی پشتیبانی ایجاد شد. پیام خودت را همین‌جا بفرست. برای بستن گفتگو از /closesupport استفاده کن.');
  } catch (error) {
    console.error('support ticket create failed', error);
    await uiReply(ctx,'ایجاد درخواست پشتیبانی انجام نشد. لطفاً دوباره تلاش کن.');
  }
});

bot.command('closesupport',async ctx=>{
 try{
  const user=await upsertTelegramUser(ctx);
  const closed=await withBotUserLock(prisma,user.id,async tx=>{
   const ticket=await tx.supportTicket.findFirst({where:{userId:user.id,status:{in:['OPEN','IN_PROGRESS','WAITING_USER']}},orderBy:{createdAt:'desc'}});
   if(!ticket)return false;
   await tx.supportTicket.update({where:{id:ticket.id},data:{status:'CLOSED'}});
   await tx.supportMessage.create({data:{ticketId:ticket.id,senderType:'SYSTEM',body:'کاربر گفتگو را بست.'}});return true;
  });
  await uiReply(ctx,closed?'گفتگوی پشتیبانی بسته شد. هر زمان لازم بود دوباره از منوی پشتیبانی اقدام کن.':'گفتگوی بازی پیدا نشد.');
 }catch(error){console.error('support ticket close failed',error);await uiReply(ctx,'بستن گفتگو انجام نشد.');}
});

hearsBuiltin('miniapp', async (ctx: any) => {
  const settings = await getBotSettings();
  if (settings.miniAppUrl) {
    await uiReply(ctx,'برای ورود به مینی‌اپ از این لینک استفاده کن:', {
      reply_markup: new InlineKeyboard().webApp('🚀 ورود به 10X Mini App', settings.miniAppUrl)
    });
  } else {
    await uiReply(ctx,'لینک Mini App هنوز توسط مدیر تنظیم نشده است.');
  }
});
bot.on('message:text', async (ctx, next) => {
  const body = ctx.message.text.trim();
  if (!body || body.startsWith('/')) return next();
  try {
    const cfg = (await getBotSettings()).dynamicConfig;
    if (cfg.enabled && cfg.customMenu.some(i => i.enabled && i.label?.trim() === body)) return next();
  } catch { /* ignore */ }
  try {
    const user=await upsertTelegramUser(ctx);
    if(body.length>3500){await uiReply(ctx,'پیام پشتیبانی حداکثر ۳۵۰۰ نویسه است.');return;}
    const saved=await withBotUserLock(prisma,user.id,async tx=>{
      const ticket=await tx.supportTicket.findFirst({where:{userId:user.id,status:{in:['OPEN','IN_PROGRESS','WAITING_USER']}},orderBy:{createdAt:'desc'}});
      if(!ticket)return false;
      await tx.supportTicket.update({where:{id:ticket.id},data:{status:'OPEN'}});
      await tx.supportMessage.create({data:{ticketId:ticket.id,senderType:'USER',body}});return true;
    });
    if(!saved)return next();
    await uiReply(ctx,'پیامت در درخواست پشتیبانی ثبت شد.');
  }catch(error){console.error('support message save failed',error);await uiReply(ctx,'ذخیره پیام پشتیبانی انجام نشد.');}
});
async function sendDynamicMenuItem(ctx: any, item: DynamicBotConfig['customMenu'][number], settings: BotSettings) {
  const action = item.action || 'reply';

  if (action === 'url' || action === 'web_app') {
    const target = item.url?.trim();
    if (!target || !/^https:\/\//i.test(target)) {
      await uiReply(ctx,'لینک این گزینه معتبر یا تنظیم نشده است.');
      return;
    }
    if (action === 'web_app') {
      await uiReply(ctx,'برای ادامه روی دکمه زیر بزن.', {
        reply_markup: new InlineKeyboard().webApp(item.label || 'ورود', target)
      });
    } else {
      await uiReply(ctx,target, {
        reply_markup: new InlineKeyboard().url(item.label || 'مشاهده لینک', target)
      });
    }
    return;
  }

  if (action === 'academy_lesson') {
    const lessonId = item.lessonId?.trim();
    if (!lessonId || !settings.miniAppUrl) {
      await uiReply(ctx,'درس آکادمی برای این گزینه تنظیم نشده است.');
      return;
    }
    const base = settings.miniAppUrl.endsWith('/') ? settings.miniAppUrl : settings.miniAppUrl + '/';
    const target = new URL('/miniapp/index.html', base);
    target.searchParams.set('view', 'academy');
    target.searchParams.set('lessonId', lessonId);
    await uiReply(ctx,'برای مشاهده درس روی دکمه زیر بزن.', {
      reply_markup: new InlineKeyboard().webApp('🎓 مشاهده درس', target.toString())
    });
    return;
  }

  const blocks = item.blocks || [];
  if (!blocks.length) {
    if (item.response?.trim()) await uiReply(ctx,item.response.slice(0, 2000));
    else await uiReply(ctx,'محتوایی برای این گزینه ثبت نشده است.');
    return;
  }

  for (const block of blocks) {
    if (block.type === 'separator') {
      await uiReply(ctx,'━━━━━━━━━━━━');
    } else if (block.type === 'text') {
      if (block.text?.trim()) await uiReply(ctx,block.text.slice(0, 2000));
    } else if (block.type === 'image' || block.type === 'video') {
      const url = block.url?.trim();
      if (!url || !/^https:\/\//i.test(url)) continue;
      if (block.type === 'image') {
        await ctx.replyWithPhoto(url, block.caption ? { caption: block.caption.slice(0, 1000) } : {});
      } else {
        await ctx.replyWithVideo(url, block.caption ? { caption: block.caption.slice(0, 1000) } : {});
      }
    } else if (block.type === 'link') {
      const url = block.url?.trim();
      if (url && /^https:\/\//i.test(url)) {
        await uiReply(ctx,block.text?.slice(0, 500) || 'لینک:', {
          reply_markup: new InlineKeyboard().url('باز کردن لینک', url)
        });
      }
    }
  }
}

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
      await sendDynamicMenuItem(ctx, menuItem, settings);
      return;
    }

    const normalized = body.toLocaleLowerCase();
    const autoReply = config.autoReplies.find(item =>
      item.enabled &&
      item.keyword?.trim() &&
      normalized.includes(item.keyword.trim().toLocaleLowerCase())
    );

    if (autoReply) {
      await uiReply(ctx,autoReply.response);
      return;
    }

    return next();
  } catch (error) {
    console.error('dynamic bot config handler failed', error);
    return next();
  }
});

bot.command('menu', async ctx => {
  try {
    const user = await upsertTelegramUser(ctx);
    await showMainMenu(ctx, user);
  } catch (error) { console.error('menu failed', error); await uiReply(ctx,'نمایش منو انجام نشد. لطفاً دوباره تلاش کن.'); }
});
bot.on('message',async ctx=>{
 if(ctx.message.text){await uiReply(ctx,'برای دیدن گزینه‌های ربات /menu را بزن.');return;}
 await uiReply(ctx,'در این نسخه، پیام پشتیبانی باید به‌صورت متن ارسال شود؛ فایل یا صدا ثبت نشده است.');
});
bot.catch(error => { console.error('unhandled Telegram update error', error); });

let automationBusy = false;
let stopping=false,automationTimer:ReturnType<typeof setInterval>|undefined;
let automationDone:Promise<void>=Promise.resolve();
let resolveAutomationDone:()=>void=()=>{};
let automationUserCursor: string | null = null;
const MAX_AUTO_FOLLOWUPS = 3;
async function processDueAutomations() {
  if (automationBusy||stopping) return;
  automationBusy = true;
  automationDone=new Promise(resolve=>{resolveAutomationDone=resolve});
  try {
    const now = new Date();
    // Automatically queue one registration reminder after five hours of inactivity.
    const inactiveBefore = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const inactiveUsers = await prisma.user.findMany({
      where: { registrationStatus: { in: ['STARTED', 'PHONE_PENDING'] }, lastActivityAt: { lte: inactiveBefore }, telegramAccount: { isNot: null } },
      select: { id: true }, orderBy: { id: 'asc' }, take: 100,
      ...(automationUserCursor ? { cursor: { id: automationUserCursor }, skip: 1 } : {})
    });
    automationUserCursor = inactiveUsers.length === 100 ? inactiveUsers[inactiveUsers.length - 1].id : null;
    for (const candidate of inactiveUsers) {
      if(stopping)break;
      const recent = await prisma.followUpJob.findFirst({ where: { userId: candidate.id, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }, select: { id: true } });
      if (!recent) {
        const history = await prisma.followUpJob.findMany({ where: { userId: candidate.id }, select: { lastError: true } });
        if (history.length < MAX_AUTO_FOLLOWUPS && !history.some(h => h.lastError === 'bot_blocked')) await prisma.followUpJob.create({ data: { userId: candidate.id, dueAt: now, status: 'PENDING' } });
      }
    }
    const jobs = await prisma.followUpJob.findMany({ where: { status: 'PENDING', dueAt: { lte: now } }, orderBy: { dueAt: 'asc' }, take: 20, include: { user: { include: { telegramAccount: true } } } });
    for (const job of jobs) {
      if(stopping)break;
      const claim = await prisma.followUpJob.updateMany({ where: { id: job.id, status: 'PENDING' }, data: { status: 'PROCESSING' } });
      if (!claim.count) continue;
      if (!job.user.telegramAccount || ['REGISTERED', 'COMPLETE'].includes(job.user.registrationStatus)) {
        await prisma.followUpJob.update({ where: { id: job.id }, data: { status: 'CANCELLED', lastError: job.user.telegramAccount ? 'registration_already_complete' : 'telegram_account_missing' } });
        continue;
      }
      try {
        await bot.api.sendMessage(job.user.telegramAccount.telegramId, 'یادآوری 10X: ثبت‌نامت هنوز کامل نشده است. برای ادامه، ربات را باز کن و /start را بزن. هیچ سودی تضمین نمی‌شود و مدیریت ریسک ضروری است.');
        await prisma.followUpJob.update({ where: { id: job.id }, data: { status: 'SENT', lastError: null } });
        await prisma.auditLog.create({ data: { userId: job.userId, action: 'REGISTRATION_FOLLOWUP_SENT', entityType: 'FollowUpJob', entityId: job.id } });
      } catch (error) {
        const attempts = job.attempts + 1;
        const blocked = (error as { error_code?: number }).error_code === 403;
        const message = error instanceof Error ? error.message.slice(0, 500) : 'unknown_error';
        await prisma.followUpJob.update({ where: { id: job.id }, data: { attempts, lastError: blocked ? 'bot_blocked' : message, status: blocked || attempts >= 5 ? 'FAILED' : 'PENDING', dueAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000) } });
      }
    }
    const retryRows = await prisma.systemSetting.findMany({where:{key:{startsWith:NOTIFICATION_RETRY_PREFIX}}});
    const retries = new Map(retryRows.map(row => [row.key.slice(NOTIFICATION_RETRY_PREFIX.length), readNotificationRetry(row.value)]));
    const dueRetryIds = [...retries].filter(([,state]) => !state || state.nextAttemptAt <= now.getTime()).map(([id]) => id);
    const pending = await prisma.notification.findMany({
      where: { channel:'TELEGRAM', OR:[{status:'PENDING'},{status:'RETRY',id:{in:dueRetryIds}}] },
      orderBy:{createdAt:'asc'},take:20,include:{user:{include:{telegramAccount:true}}}
    });
    for (const item of pending) {
      if(stopping)break;
      const retryKey = NOTIFICATION_RETRY_PREFIX + item.id;
      const claim = await prisma.notification.updateMany({where:{id:item.id,status:item.status},data:{status:'PROCESSING'}});
      if (!claim.count) continue;
      if (!item.user.telegramAccount) {
        await prisma.$transaction(async tx => {
          await tx.notification.update({where:{id:item.id},data:{status:'FAILED'}});
          await tx.systemSetting.deleteMany({where:{key:retryKey}});
        });
        continue;
      }
      try {
        const text = item.title ? `<b>${escapeHtml(item.title)}</b>\n\n${escapeHtml(item.body)}` : escapeHtml(item.body);
        await bot.api.sendMessage(item.user.telegramAccount.telegramId, text, {parse_mode:'HTML'});
        await prisma.$transaction(async tx => {
          await tx.notification.update({where:{id:item.id},data:{status:'SENT',sentAt:new Date()}});
          await tx.systemSetting.deleteMany({where:{key:retryKey}});
        });
      } catch (error) {
        const next = notificationRetry(error,(retries.get(item.id)?.attempts || 0) + 1,Date.now());
        await prisma.$transaction(async tx => {
          await tx.notification.update({where:{id:item.id},data:{status:next?'RETRY':'FAILED'}});
          if(next) await tx.systemSetting.upsert({where:{key:retryKey},create:{key:retryKey,value:next},update:{value:next}});
          else await tx.systemSetting.deleteMany({where:{key:retryKey}});
        });
        console.error('notification send failed',item.id,next?'retry_scheduled':'terminal_failure');
      }
    }
  } catch (error) { console.error('automation worker failed', error); }
  finally { automationBusy = false;resolveAutomationDone(); }
}
function escapeHtml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

async function main() {
  const mode=process.env.TELEGRAM_MODE||'polling';
  if(mode!=='polling')throw Error('This build supports polling only. Keep TELEGRAM_MODE=polling.');
  await prisma.$connect();
  if(stopping)return;
  // A restart can interrupt a send; release anything left in PROCESSING (single bot instance).
  await prisma.followUpJob.updateMany({ where: { status: 'PROCESSING' }, data: { status: 'PENDING' } });
  await prisma.notification.updateMany({ where: { status: 'PROCESSING' }, data: { status: 'PENDING' } });
  await processDueAutomations();
  if(stopping)return;
  automationTimer=setInterval(()=>{void processDueAutomations()},15_000);automationTimer.unref();
  await bot.start({ onStart: info => console.log(`10X Telegram bot polling as @${info.username}`) });
}
async function shutdown(){
 if(stopping)return;stopping=true;if(automationTimer)clearInterval(automationTimer);
 try{if(bot.isRunning())await bot.stop();await automationDone;}finally{await prisma.$disconnect();}
}
process.once('SIGINT',()=>{void shutdown().catch(error=>console.error('bot shutdown failed',error));});
process.once('SIGTERM',()=>{void shutdown().catch(error=>console.error('bot shutdown failed',error));});
main().catch(async error => { console.error('Bot startup failed:', error); await prisma.$disconnect(); process.exit(1); });
