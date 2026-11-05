import type { PrismaClient } from '@prisma/client';
import { validateTelegramInitData } from '../../../packages/shared/src/telegram-init-data.js';

export async function authenticateTeamAdmin(
  prisma: PrismaClient,
  initData: string,
  botToken: string
) {
  if (!initData || !botToken) {
    return { ok: false as const, error: 'missing_auth' };
  }

  const verified = validateTelegramInitData(
    initData,
    botToken,
    Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SECONDS || 86400)
  );

  if (!verified.ok) {
    return {
      ok: false as const,
      error: 'invalid_telegram_init_data'
    };
  }

  const telegramId = String(verified.user.id);

  const admin = await prisma.telegramTeamAdmin.findUnique({
    where: { telegramId },
    select: {
      id: true,
      telegramId: true,
      displayName: true,
      role: true,
      isActive: true
    }
  });

  if (!admin || !admin.isActive) {
    return {
      ok: false as const,
      error: 'team_access_denied'
    };
  }

  return {
    ok: true as const,
    admin
  };
}
