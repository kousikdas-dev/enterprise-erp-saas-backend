/** Matches Gateway accounting DTO shapes — do not invent fields. */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface AccountParent {
  id: string;
  code: string;
  name: string;
}

export interface Account {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  parent: AccountParent | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountRequest {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  description?: string;
}

export interface UpdateAccountRequest {
  code?: string;
  name?: string;
  type?: AccountType;
  parentId?: string | null;
  description?: string | null;
}

export interface UpdateAccountStatusRequest {
  isActive: boolean;
}

export interface ItemList<T> {
  items: T[];
}

export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'VOID';

export interface JournalLineAccount {
  id: string;
  code: string;
  name: string;
}

export interface JournalLine {
  id: string;
  tenantId: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  account: JournalLineAccount;
  debitAmount: string;
  creditAmount: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  entryNumber: string;
  entryDate: string;
  description: string | null;
  status: JournalEntryStatus;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: JournalLine[];
}

export interface JournalEntryList {
  items: JournalEntry[];
}

export interface CreateJournalLineRequest {
  lineNumber: number;
  accountId: string;
  debitAmount: string;
  creditAmount: string;
  description?: string;
}

export interface CreateJournalEntryRequest {
  entryDate?: string;
  description?: string;
  lines?: CreateJournalLineRequest[];
}

export interface UpdateJournalEntryRequest {
  entryDate?: string;
  description?: string | null;
  lines?: CreateJournalLineRequest[];
}

export type TaxComponentType = 'CGST' | 'SGST' | 'IGST' | 'CESS' | 'OTHER';

export interface TaxComponentAccount {
  id: string;
  code: string;
  name: string;
}

export interface TaxComponent {
  id: string;
  tenantId: string;
  taxCodeId: string;
  sequence: number;
  type: TaxComponentType;
  name: string | null;
  rate: string;
  accountId: string | null;
  account: TaxComponentAccount | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxCode {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  components: TaxComponent[];
}

export interface TaxCodeList {
  items: TaxCode[];
}

export interface CreateTaxComponentRequest {
  sequence: number;
  type: TaxComponentType;
  name?: string;
  rate: string;
  accountId?: string;
}

export interface CreateTaxCodeRequest {
  code: string;
  name: string;
  description?: string;
  components: CreateTaxComponentRequest[];
}

export interface UpdateTaxCodeRequest {
  code?: string;
  name?: string;
  description?: string | null;
  components?: CreateTaxComponentRequest[];
}

export interface UpdateTaxCodeStatusRequest {
  isActive: boolean;
}

export type AccountMappingPurpose =
  | 'PURCHASE_EXPENSE'
  | 'ACCOUNTS_PAYABLE'
  | 'INPUT_TAX'
  | 'PAYMENT_METHOD';

export interface AccountMapping {
  id: string;
  tenantId: string;
  purpose: AccountMappingPurpose;
  /** "" for the tenant-wide purposes; the master-data PaymentMethod id for PAYMENT_METHOD. */
  externalRefId: string;
  accountId: string;
  account: AccountParent | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountMappingList {
  items: AccountMapping[];
}

export interface CreateAccountMappingRequest {
  purpose: AccountMappingPurpose;
  externalRefId?: string;
  accountId: string;
}

export interface UpdateAccountMappingRequest {
  accountId: string;
}
