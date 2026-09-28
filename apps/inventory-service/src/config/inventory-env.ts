import { IsString, MinLength } from 'class-validator';
import { ServiceEnvironmentVariables } from '@app/common';

export class InventoryEnvironmentVariables extends ServiceEnvironmentVariables {
  @IsString()
  IDENTITY_SERVICE_URL!: string;

  // Phase 3.15 (Inventory Adjustment Accounting) — inventory-service now
  // posts Stock Adjustment / Opening Stock journals directly to
  // accounting-service, mirroring purchase-service's/sales-service's own
  // identical env var.
  @IsString()
  ACCOUNTING_SERVICE_URL!: string;

  @IsString()
  @MinLength(16)
  INTERNAL_SERVICE_SECRET!: string;
}
