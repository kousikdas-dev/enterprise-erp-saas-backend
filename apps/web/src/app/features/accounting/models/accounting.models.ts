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
