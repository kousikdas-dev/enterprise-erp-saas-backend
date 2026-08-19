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
import { ProformaInvoicesService } from '../proforma-invoices/proforma-invoices.service';
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';
import { SalesOrdersService } from './sales-orders.service';

@Controller({ path: 'sales-orders', version: '1' })
@UseGuards(ActorGuard)
export class SalesOrdersController {
  constructor(
    private readonly orders: SalesOrdersService,
    private readonly proformas: ProformaInvoicesService,
  ) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateSalesOrderDto,
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
    @Body() dto: UpdateSalesOrderDto,
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

  @Post(':id/proforma')
  createProforma(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.proformas.createFromSalesOrder(
      actor,
      id,
      requestAuditMeta(request),
    );
  }
}
