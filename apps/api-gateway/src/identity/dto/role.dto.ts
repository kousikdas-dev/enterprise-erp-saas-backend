import { ApiProperty } from '@nestjs/swagger';
import { PermissionDto } from './permission.dto';

export class RoleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: [PermissionDto] })
  permissions!: PermissionDto[];
}

export class RoleListDto {
  @ApiProperty({ type: [RoleDto] })
  items!: RoleDto[];
}

export class RoleRemovedDto extends RoleDto {
  @ApiProperty({ example: true })
  removed!: true;
}
