import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class BaseEnvironmentVariables {
  @IsString()
  SERVICE_NAME!: string;

  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: 'development' | 'test' | 'production';

  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  PORT!: number;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;
}

export class GatewayEnvironmentVariables extends BaseEnvironmentVariables {
  @IsString()
  IDENTITY_SERVICE_URL!: string;

  @IsString()
  SALES_SERVICE_URL!: string;

  @IsString()
  INVENTORY_SERVICE_URL!: string;

  @IsString()
  ACCOUNTING_SERVICE_URL!: string;

  @IsString()
  PURCHASE_SERVICE_URL!: string;

  @IsString()
  MASTER_DATA_SERVICE_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  RABBITMQ_URL?: string;
}

export class ServiceEnvironmentVariables extends BaseEnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  RABBITMQ_URL!: string;

  @IsString()
  RABBITMQ_QUEUE!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;
}
