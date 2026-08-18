import { ApiProperty } from '@nestjs/swagger';

export class LoginDataDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque refresh token (not a JWT)' })
  refreshToken!: string;

  @ApiProperty({
    example: 900,
    description: 'Access-token lifetime in seconds',
  })
  expiresIn!: number;
}

export class LoginSuccessDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 201 })
  statusCode!: number;

  @ApiProperty({ type: LoginDataDto })
  data!: LoginDataDto;

  @ApiProperty()
  timestamp!: string;
}
