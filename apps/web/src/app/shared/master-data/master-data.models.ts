/** Matches Gateway master-data DTO shapes — do not invent fields. */

export interface MasterDataOption {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MasterDataList {
  items: MasterDataOption[];
}
