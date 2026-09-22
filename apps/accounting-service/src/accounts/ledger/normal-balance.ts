import { AccountType } from '../../../generated/prisma-client';

/**
 * No schema field encodes normal-balance side (see schema.prisma's
 * SALES_DISCOUNT comment — contra-revenue is a posting convention, not a
 * schema-level distinction). This is the single hardcoded mapping the
 * Account Ledger uses to turn (debitAmount, creditAmount) into a signed
 * balance movement: standard accounting convention, ASSET/EXPENSE increase
 * on debit, LIABILITY/EQUITY/REVENUE increase on credit.
 */
const DEBIT_NORMAL_TYPES: ReadonlySet<AccountType> = new Set([
  AccountType.ASSET,
  AccountType.EXPENSE,
]);

export function isDebitNormal(type: AccountType): boolean {
  return DEBIT_NORMAL_TYPES.has(type);
}
