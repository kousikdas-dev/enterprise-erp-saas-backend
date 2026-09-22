import { AccountType } from '../../../generated/prisma-client';
import { isDebitNormal } from './normal-balance';

describe('isDebitNormal', () => {
  it('treats ASSET and EXPENSE as debit-normal', () => {
    expect(isDebitNormal(AccountType.ASSET)).toBe(true);
    expect(isDebitNormal(AccountType.EXPENSE)).toBe(true);
  });

  it('treats LIABILITY, EQUITY and REVENUE as credit-normal', () => {
    expect(isDebitNormal(AccountType.LIABILITY)).toBe(false);
    expect(isDebitNormal(AccountType.EQUITY)).toBe(false);
    expect(isDebitNormal(AccountType.REVENUE)).toBe(false);
  });
});
