export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

/**
 * True only for a confirmed PostgreSQL deadlock (SQLSTATE 40P01) or
 * serialization failure (40001) surfaced through a raw query inside a
 * transaction. StockUnbuildPostingsService's row locks are acquired via
 * tx.$queryRaw (SELECT ... FOR UPDATE), so Prisma reports a deadlock abort
 * as P2010 ("raw query failed") carrying the underlying Postgres error in
 * `meta.code` — never as P2034, which only applies to Prisma's own
 * non-raw transaction-conflict detection. Verified against a real deadlock
 * reproduction: `{ code: 'P2010', meta: { code: '40P01', message: '...
 * deadlock detected...' } }`. Deliberately narrow: any other P2010 (a real
 * SQL/constraint bug in the raw query) must NOT be retried.
 */
export function isTransactionDeadlockError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  if ((error as { code: unknown }).code !== 'P2010') {
    return false;
  }
  const meta = (error as { meta?: { code?: unknown; message?: unknown } }).meta;
  const metaCode = meta?.code;
  if (metaCode === '40P01' || metaCode === '40001') {
    return true;
  }
  return typeof meta?.message === 'string' && /deadlock detected/i.test(meta.message);
}
