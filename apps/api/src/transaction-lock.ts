import type { Prisma, PrismaClient } from '@prisma/client';

/** A shared row lock, held until the guarded reads, writes and audit commit.
 * ReadCommitted is explicit so a waiter sees the preceding writer's result.
 */
export async function withSystemLock<T>(
  db: PrismaClient, key: string, action: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return db.$transaction(async tx => {
    await tx.systemSetting.upsert({
      where: { key }, create: { key, value: { locked: true } }, update: { value: { locked: true } }
    });
    return action(tx);
  }, { isolationLevel: 'ReadCommitted' });
}
