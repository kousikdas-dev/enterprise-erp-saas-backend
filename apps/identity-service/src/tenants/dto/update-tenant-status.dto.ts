import { IsEnum } from 'class-validator';
import { TenantStatus } from '../../../generated/prisma-client';

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus)
  status!: TenantStatus;
}
