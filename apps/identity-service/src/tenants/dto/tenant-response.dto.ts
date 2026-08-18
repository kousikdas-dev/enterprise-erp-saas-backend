import { Tenant, TenantStatus } from '../../../generated/prisma-client';

export class TenantResponseDto {
  id!: string;
  name!: string;
  code!: string;
  status!: TenantStatus;
  createdAt!: Date;
  updatedAt!: Date;
}

export function toTenantResponse(tenant: Tenant): TenantResponseDto {
  return {
    id: tenant.id,
    name: tenant.name,
    code: tenant.code,
    status: tenant.status,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}
