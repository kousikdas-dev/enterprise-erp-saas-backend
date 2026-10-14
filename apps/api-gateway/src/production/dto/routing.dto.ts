import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateRoutingStepDto {
  @ApiProperty({ format: 'uuid', description: 'production-service Operation id.' })
  @IsUUID()
  operationId!: string;

  @ApiProperty({ format: 'uuid', description: 'production-service Work Centre id.' })
  @IsUUID()
  workCentreId!: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  sequence!: number;

  @ApiPropertyOptional({ example: 15, description: 'Fixed, one-time setup minutes.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  setupMinutes?: number;

  @ApiPropertyOptional({
    example: '2.500000',
    description: 'Standard run time per unit of output, in minutes.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  runMinutesPerUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateRoutingDto {
  @ApiProperty({ format: 'uuid', description: 'Inventory-service Product id.' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'Cotton Yarn — Standard Route' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @ApiPropertyOptional({
    type: [CreateRoutingStepDto],
    description:
      'Ordered manufacturing steps. May be omitted/empty to save a DRAFT and add steps later — at least one is required to activate.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRoutingStepDto)
  steps?: CreateRoutingStepDto[];
}

export class UpdateRoutingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @ApiPropertyOptional({
    type: [CreateRoutingStepDto],
    description: 'Replaces the full step list for this routing (DRAFT only). Omit to leave unchanged.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRoutingStepDto)
  steps?: CreateRoutingStepDto[];
}

export class RoutingStepDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  routingId!: string;

  @ApiProperty()
  sequence!: number;

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
  setupMinutes!: number;

  @ApiProperty({ example: '2.500000' })
  runMinutesPerUnit!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;
}

export class RoutingDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productSku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ example: 'DRAFT' })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  effectiveFrom!: Date | string | null;

  @ApiPropertyOptional({ nullable: true })
  effectiveTo!: Date | string | null;

  @ApiProperty({ type: [RoutingStepDto] })
  steps!: RoutingStepDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class RoutingListDto {
  @ApiProperty({ type: [RoutingDto] })
  items!: RoutingDto[];
}
