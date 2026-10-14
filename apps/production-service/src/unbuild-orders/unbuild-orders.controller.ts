import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UnbuildOrderStatus } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CreateUnbuildOrderDto, UpdateUnbuildOrderDto } from './dto/unbuild-order.dto';
import { UnbuildOrdersService } from './unbuild-orders.service';

function toPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

@Controller({ path: 'unbuild-orders', version: '1' })
@UseGuards(ActorGuard)
export class UnbuildOrdersController {
  constructor(private readonly unbuildOrders: UnbuildOrdersService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateUnbuildOrderDto,
  ) {
    return this.unbuildOrders.create(actor, dto);
  }

  @Get()
  list(
    @CurrentActor() actor: ActorContext,
    @Query('status') status?: UnbuildOrderStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.unbuildOrders.list(actor, {
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
    return this.unbuildOrders.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnbuildOrderDto,
  ) {
    return this.unbuildOrders.update(actor, id, dto);
  }

  @Post(':id/complete')
  complete(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.unbuildOrders.complete(actor, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.unbuildOrders.cancel(actor, id);
  }
}
