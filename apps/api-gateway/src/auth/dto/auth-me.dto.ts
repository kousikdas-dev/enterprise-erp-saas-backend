import { ApiProperty } from '@nestjs/swagger';

export class AuthMeDto {
  @ApiProperty({ description: 'Authenticated user id (JWT sub)' })
  userId!: string;

  @ApiProperty({ description: 'Authenticated tenant id' })
  tenantId!: string;

  @ApiProperty({
    description:
      'Tenant display name, when present on the access token (tokens issued before this field existed will omit it until the user logs in again)',
    required: false,
  })
  tenantName?: string;

  @ApiProperty({
    description:
      'User display name (first + last), when present on the access token (tokens issued before this field existed will omit it until the user logs in again)',
    required: false,
  })
  userName?: string;
}
