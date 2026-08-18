import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { GatewayUserStatus } from './create-user.dto';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: GatewayUserStatus })
  @IsEnum(GatewayUserStatus)
  status!: GatewayUserStatus;
}
