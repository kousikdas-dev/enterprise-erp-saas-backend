import { IsUUID } from 'class-validator';

export class LookupPermissionsDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  tenantId!: string;
}
