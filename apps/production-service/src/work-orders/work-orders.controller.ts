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
import { WorkOrderStatus } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CreateWorkOrderDto, UpdateWorkOrderDto } from './dto/work-order.dto';
import { WorkOrdersService } from './work-orders.service';

function toPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

@Controller({ path: 'work-orders', version: '1' })
@UseGuards(ActorGuard)
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateWorkOrderDto,
  ) {
    return this.workOrders.create(actor, dto);
  }

  @Get()
  list(
    @CurrentActor() actor: ActorContext,
    @Query('productionOrderId') productionOrderId?: string,
    @Query('workCentreId') workCentreId?: string,
    @Query('status') status?: WorkOrderStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.workOrders.list(actor, {
      productionOrderId,
      workCentreId,
      status,
      search,
      page: toPositiveInt(page),
      pageSize: toPositiveInt(pageSize),
    });
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workOrders.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkOrderDto,
  ) {
    return this.workOrders.update(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workOrders.remove(actor, id);
  }

  @Post(':id/start')
  start(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workOrders.start(actor, id);
  }

  @Post(':id/block')
  block(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workOrders.block(actor, id);
  }

  @Post(':id/unblock')
  unblock(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workOrders.unblock(actor, id);
  }

  @Post(':id/complete')
  complete(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workOrders.complete(actor, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workOrders.cancel(actor, id);
  }
}
