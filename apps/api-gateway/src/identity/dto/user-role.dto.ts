import { ApiProperty } from '@nestjs/swagger';

export class UserRoleDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  roleId!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  roleName!: string;

  @ApiProperty()
  createdAt!: string;
}

export class UserRoleRemovedDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  roleId!: string;

  @ApiProperty({ example: true })
  removed!: true;
}
