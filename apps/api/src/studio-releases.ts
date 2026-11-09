import type { Prisma } from '@prisma/client';

type Version = { id: string; version: number; title: string | null; blocks: unknown; createdAt?: Date | string };
export const studioReleaseKey = (slug: string, id: string) => `MMVS_RELEASE_V1:${slug}:${id}`;

/** Capture only content and published layout read inside the same page transaction. */
export async function recordStudioRelease(
  tx: Prisma.TransactionClient, slug: string, version: Version, layout: unknown
): Promise<void> {
  const snapshot = JSON.parse(JSON.stringify({
    format: 1, slug, contentVersionId: version.id, version: version.version,
    title: version.title, blocks: version.blocks, layout,
    capturedAt: new Date().toISOString()
  })) as Prisma.InputJsonValue;
  await tx.systemSetting.create({data:{key:studioReleaseKey(slug,version.id),value:snapshot}});
}
