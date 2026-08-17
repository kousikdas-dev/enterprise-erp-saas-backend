import { IsString } from 'class-validator';
import { ServiceEnvironmentVariables } from '@app/common';

export class IdentityEnvironmentVariables extends ServiceEnvironmentVariables {
  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN!: string;
}
