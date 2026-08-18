import { ApiProperty } from '@nestjs/swagger';
import { GatewayTenantStatus } from './update-tenant-status.dto';

export class TenantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: GatewayTenantStatus })
  status!: GatewayTenantStatus;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class TenantListDto {
  @ApiProperty({ type: [TenantDto] })
  items!: TenantDto[];
}
