import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'DEMO', description: 'Tenant code' })
  @IsString()
  @IsNotEmpty()
  tenantCode!: string;

  @ApiProperty({ example: 'admin@demo.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'DevPassword123!',
    format: 'password',
    description: 'Account password. Never logged by the gateway.',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
