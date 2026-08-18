import { ApiProperty } from '@nestjs/swagger';

export class AuthMeDto {
  @ApiProperty({ description: 'Authenticated user id (JWT sub)' })
  userId!: string;

  @ApiProperty({ description: 'Authenticated tenant id' })
  tenantId!: string;
}
