import type { Prisma } from '@prisma/client';

// Serializes vendor create, vendor edit, and import confirmation so GSTIN and phone checks never race.
// The lock is released when the surrounding transaction ends.
const VENDOR_IDENTITY_LOCK = 3001;

export async function vendorIdentityLock(tx: Prisma.TransactionClient): Promise<void> {
  // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void, which $queryRaw cannot read back.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VENDOR_IDENTITY_LOCK})`;
}
