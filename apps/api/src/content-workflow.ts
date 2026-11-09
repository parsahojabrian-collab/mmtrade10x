import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

type ContentSource = { title?: string | null; blocks?: unknown; updatedAt?: Date | string | null } | null;

/** Opaque token for the exact server-side content the editor loaded. */
export function contentRevision(source: ContentSource): string {
  return createHash('sha256').update(JSON.stringify({
    title: source?.title ?? null,
    blocks: source?.blocks ?? [],
    updatedAt: source?.updatedAt ?? null
  })).digest('hex');
}

export class ContentConflict extends Error {
  code: string;
  constructor(code: string) { super(code); this.code=code; }
}

export function assertContentRevision(source: ContentSource, expected: string | undefined): void {
  if (expected !== undefined && contentRevision(source) !== expected) {
    throw new ContentConflict('content_revision_conflict');
  }
}

/** The upsert takes a row write lock until commit, including across API processes.
 * Every content/spatial writer for a page must acquire this same lock first.
 * It needs no schema migration and never holds an in-memory-only mutex.
 */
export async function withContentLock<T>(
  db: PrismaClient, slug: string, action: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return db.$transaction(async tx => {
    const key = 'CONTENT_WRITE_LOCK_' + slug;
    await tx.systemSetting.upsert({
      where: { key }, create: { key, value: { locked: true } }, update: { value: { locked: true } }
    });
    return action(tx);
  });
}
