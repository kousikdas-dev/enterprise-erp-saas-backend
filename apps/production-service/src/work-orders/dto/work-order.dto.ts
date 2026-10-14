import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWorkOrderDto {
  @IsUUID()
  productionOrderId!: string;

  @IsUUID()
  operationId!: string;

  @IsUUID()
  workCentreId!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsInt()
  @Min(1)
  plannedDurationMinutes!: number;

  @IsOptional()
  @IsISO8601()
  scheduledStartDate?: string;

  @IsOptional()
  @IsISO8601()
  scheduledEndDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateWorkOrderDto {
  @IsOptional()
  @IsUUID()
  operationId?: string;

  @IsOptional()
  @IsUUID()
  workCentreId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  plannedDurationMinutes?: number;

  @IsOptional()
  @IsISO8601()
  scheduledStartDate?: string;

  @IsOptional()
  @IsISO8601()
  scheduledEndDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
