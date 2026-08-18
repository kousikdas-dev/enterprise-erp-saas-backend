import { ApiProperty } from '@nestjs/swagger';
import { GatewayUserStatus } from './create-user.dto';

export class UserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ enum: GatewayUserStatus })
  status!: GatewayUserStatus;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class UserListDto {
  @ApiProperty({ type: [UserDto] })
  items!: UserDto[];
}
