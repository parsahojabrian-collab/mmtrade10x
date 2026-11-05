import { PrismaClient, AdminRole } from '@prisma/client';

const prisma = new PrismaClient();

export const TEAM_ROLES: AdminRole[] = [
  'USER_MANAGER',
  'CHALLENGE_MANAGER',
  'SUPPORT',
  'ANALYST'
];

export async function findTelegramTeamAdmin(
  telegramId: string
) {
  if (!/^[1-9][0-9]{0,19}$/.test(telegramId)) {
    return null;
  }

  return prisma.telegramTeamAdmin.findUnique({
    where: { telegramId }
  });
}

export async function canManageTeam(
  telegramId: string
) {
  const admin = await findTelegramTeamAdmin(telegramId);

  return Boolean(
    admin &&
    admin.isActive &&
    TEAM_ROLES.includes(admin.role)
  );
}

export async function canApproveEplanet(
  telegramId: string
) {
  const admin = await findTelegramTeamAdmin(telegramId);

  return Boolean(
    admin &&
    admin.isActive &&
    (
      admin.role === 'USER_MANAGER' ||
      admin.role === 'CHALLENGE_MANAGER'
    )
  );
}
