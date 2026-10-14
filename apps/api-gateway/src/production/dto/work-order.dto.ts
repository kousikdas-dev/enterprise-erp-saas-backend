import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productionOrderId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  operationId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workCentreId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  sequence!: number;

  @ApiProperty({ example: 45, description: 'Planned duration, in minutes.' })
  @IsInt()
  @Min(1)
  plannedDurationMinutes!: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  scheduledStartDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  scheduledEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateWorkOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  operationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  workCentreId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  @Min(1)
  plannedDurationMinutes?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  scheduledStartDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  scheduledEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class WorkOrderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ example: 'WO-000001' })
  workOrderNumber!: string;

  @ApiProperty()
  productionOrderId!: string;

  @ApiProperty({ example: 'MO-000001' })
  productionOrderNumber!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productSku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  operationId!: string;

  @ApiProperty()
  operationCode!: string;

  @ApiProperty()
  operationName!: string;

  @ApiProperty()
  workCentreId!: string;

  @ApiProperty()
  workCentreCode!: string;

  @ApiProperty()
  workCentreName!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty()
  plannedDurationMinutes!: number;

  @ApiPropertyOptional({ nullable: true })
  scheduledStartDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  scheduledEndDate!: string | null;

  @ApiProperty({ example: 'PENDING' })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}

export class WorkOrderListDto {
  @ApiProperty({ type: [WorkOrderDto] })
  items!: WorkOrderDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
