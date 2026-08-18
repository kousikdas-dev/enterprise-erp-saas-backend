import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class RecordInternalAuditDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  tenantId!: string;

  @IsString()
  @MaxLength(80)
  action!: string;

  @IsString()
  @MaxLength(80)
  resource!: string;

  @IsString()
  @MaxLength(80)
  resourceId!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}
