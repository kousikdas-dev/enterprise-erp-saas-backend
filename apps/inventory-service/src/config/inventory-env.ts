import { IsString, MinLength } from 'class-validator';
import { ServiceEnvironmentVariables } from '@app/common';

export class InventoryEnvironmentVariables extends ServiceEnvironmentVariables {
  @IsString()
  IDENTITY_SERVICE_URL!: string;

  @IsString()
  @MinLength(16)
  INTERNAL_SERVICE_SECRET!: string;
}
