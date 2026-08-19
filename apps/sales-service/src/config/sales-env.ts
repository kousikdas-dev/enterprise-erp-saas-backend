import { IsString, MinLength } from 'class-validator';
import { ServiceEnvironmentVariables } from '@app/common';

export class SalesEnvironmentVariables extends ServiceEnvironmentVariables {
  @IsString()
  IDENTITY_SERVICE_URL!: string;

  @IsString()
  INVENTORY_SERVICE_URL!: string;

  @IsString()
  @MinLength(16)
  INTERNAL_SERVICE_SECRET!: string;
}
