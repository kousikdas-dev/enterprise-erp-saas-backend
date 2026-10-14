import { isTransactionDeadlockError, isUniqueConstraintError } from './prisma-errors';

describe('isUniqueConstraintError', () => {
  it('matches a P2002 error', () => {
    expect(isUniqueConstraintError({ code: 'P2002' })).toBe(true);
  });

  it('rejects a non-P2002 error', () => {
    expect(isUniqueConstraintError({ code: 'P2003' })).toBe(false);
    expect(isUniqueConstraintError(new Error('plain error'))).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
  });
});

describe('isTransactionDeadlockError', () => {
  it('matches a real Postgres deadlock (P2010 / meta.code 40P01) — exact shape reproduced from a live deadlock', () => {
    const error = {
      code: 'P2010',
      meta: {
        code: '40P01',
        message:
          'ERROR: deadlock detected\nDETAIL: Process 11365 waits for ShareLock on transaction 12554; blocked by process 11366.\nProcess 11366 waits for ShareLock on transaction 12555; blocked by process 11365.\nHINT: See server log for query details.',
      },
    };
    expect(isTransactionDeadlockError(error)).toBe(true);
  });

  it('matches a serialization failure (P2010 / meta.code 40001)', () => {
    const error = {
      code: 'P2010',
      meta: { code: '40001', message: 'ERROR: could not serialize access due to concurrent update' },
    };
    expect(isTransactionDeadlockError(error)).toBe(true);
  });

  it('matches via message text when meta.code is absent but the message says "deadlock detected"', () => {
    const error = { code: 'P2010', meta: { message: 'ERROR: deadlock detected' } };
    expect(isTransactionDeadlockError(error)).toBe(true);
  });

  it('rejects a P2010 raw-query error that is not a deadlock/serialization failure', () => {
    const error = { code: 'P2010', meta: { code: '42601', message: 'ERROR: syntax error at or near "SELCT"' } };
    expect(isTransactionDeadlockError(error)).toBe(false);
  });

  it('rejects a P2010 error with no meta at all', () => {
    expect(isTransactionDeadlockError({ code: 'P2010' })).toBe(false);
  });

  it('rejects any non-P2010 error code, even with deadlock-shaped meta', () => {
    expect(isTransactionDeadlockError({ code: 'P2002', meta: { code: '40P01' } })).toBe(false);
    expect(isTransactionDeadlockError({ code: 'P2034' })).toBe(false);
  });

  it('rejects business exceptions, plain errors, and non-object values', () => {
    expect(isTransactionDeadlockError(new Error('Insufficient stock'))).toBe(false);
    expect(isTransactionDeadlockError(null)).toBe(false);
    expect(isTransactionDeadlockError(undefined)).toBe(false);
    expect(isTransactionDeadlockError('deadlock detected')).toBe(false);
  });
});
