import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import {
  CreateProductUnitDto,
  UpdateProductUnitDto,
} from './dto/product-unit.dto';
import { ProductUnitsService } from './product-units.service';

@Controller({ path: 'products/:productId/units', version: '1' })
@UseGuards(ActorGuard)
export class ProductUnitsController {
  constructor(private readonly productUnits: ProductUnitsService) {}

  @Get()
  list(
    @CurrentActor() actor: ActorContext,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.productUnits.list(actor, productId);
  }

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductUnitDto,
    @Req() request: Request,
  ) {
    return this.productUnits.create(
      actor,
      productId,
      dto,
      requestAuditMeta(request),
    );
  }

  @Patch(':unitId')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: UpdateProductUnitDto,
    @Req() request: Request,
  ) {
    return this.productUnits.update(
      actor,
      productId,
      unitId,
      dto,
      requestAuditMeta(request),
    );
  }

  @Delete(':unitId')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Req() request: Request,
  ) {
    return this.productUnits.remove(
      actor,
      productId,
      unitId,
      requestAuditMeta(request),
    );
  }
}
