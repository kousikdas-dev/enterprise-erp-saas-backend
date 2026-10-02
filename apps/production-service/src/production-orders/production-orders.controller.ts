import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductionOrderStatus } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import {
  CreateProductionOrderDto,
  UpdateProductionOrderDto,
} from './dto/production-order.dto';
import { ProductionOrdersService } from './production-orders.service';

function toPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

@Controller({ path: 'production-orders', version: '1' })
@UseGuards(ActorGuard)
export class ProductionOrdersController {
  constructor(private readonly productionOrders: ProductionOrdersService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateProductionOrderDto,
  ) {
    return this.productionOrders.create(actor, dto);
  }

  @Get()
  list(
    @CurrentActor() actor: ActorContext,
    @Query('search') search?: string,
    @Query('status') status?: ProductionOrderStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.productionOrders.list(actor, {
      search,
      status,
      dateFrom,
      dateTo,
      page: toPositiveInt(page),
      pageSize: toPositiveInt(pageSize),
    });
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productionOrders.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductionOrderDto,
  ) {
    return this.productionOrders.update(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productionOrders.remove(actor, id);
  }

  @Post(':id/plan')
  plan(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productionOrders.plan(actor, id);
  }

  @Post(':id/release')
  release(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productionOrders.release(actor, id);
  }

  @Post(':id/start')
  start(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productionOrders.start(actor, id);
  }

  @Post(':id/complete')
  complete(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productionOrders.complete(actor, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productionOrders.cancel(actor, id);
  }

  @Post(':id/close')
  close(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productionOrders.close(actor, id);
  }
}
