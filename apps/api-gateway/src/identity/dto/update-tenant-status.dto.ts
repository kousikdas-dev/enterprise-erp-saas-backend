import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum GatewayTenantStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class UpdateTenantStatusDto {
  @ApiProperty({ enum: GatewayTenantStatus })
  @IsEnum(GatewayTenantStatus)
  status!: GatewayTenantStatus;
}
