import {
  Body,
  Controller,
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
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller({ path: 'purchase-orders', version: '1' })
@UseGuards(ActorGuard)
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreatePurchaseOrderDto,
    @Req() request: Request,
  ) {
    return this.orders.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.orders.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Req() request: Request,
  ) {
    return this.orders.update(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/confirm')
  confirm(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.orders.confirm(actor, id, requestAuditMeta(request));
  }

  @Post(':id/cancel')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.orders.cancel(actor, id, requestAuditMeta(request));
  }
}
