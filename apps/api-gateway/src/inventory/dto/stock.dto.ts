import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum GatewayStockAdjustmentType {
  OPENING = 'OPENING',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
}

export enum GatewayStockMovementType {
  OPENING = 'OPENING',
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
}

export class CreateStockAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ enum: GatewayStockAdjustmentType })
  @IsEnum(GatewayStockAdjustmentType)
  type!: GatewayStockAdjustmentType;

  @ApiProperty({ example: '10', description: 'Positive decimal string' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @ApiPropertyOptional({ example: 'Physical stock count' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class StockQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class StockMovementQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: GatewayStockMovementType })
  @IsOptional()
  @IsEnum(GatewayStockMovementType)
  type?: GatewayStockMovementType;

  @ApiPropertyOptional({ description: 'ISO-8601 start of createdAt range' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 end of createdAt range' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class StockDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiProperty({ example: '100.000000' })
  quantity!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class StockListDto {
  @ApiProperty({ type: [StockDto] })
  items!: StockDto[];
}

export class StockMovementDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiProperty({ enum: GatewayStockMovementType })
  type!: GatewayStockMovementType;

  @ApiProperty({ example: '10.000000' })
  quantity!: string;

  @ApiPropertyOptional({ nullable: true })
  referenceType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  referenceId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  createdAt!: string;
}

export class StockMovementListDto {
  @ApiProperty({ type: [StockMovementDto] })
  items!: StockMovementDto[];
}

export class StockAdjustmentResultDto {
  @ApiProperty({ type: StockDto })
  stock!: StockDto;

  @ApiProperty({ type: StockMovementDto })
  movement!: StockMovementDto;
}
