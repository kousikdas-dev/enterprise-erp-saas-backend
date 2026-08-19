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
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import {
  CreateQuotationDto,
  UpdateQuotationDto,
} from './dto/quotation.dto';
import { QuotationsService } from './quotations.service';

@Controller({ path: 'quotations', version: '1' })
@UseGuards(ActorGuard)
export class QuotationsController {
  constructor(
    private readonly quotations: QuotationsService,
    private readonly proformas: ProformaInvoicesService,
    private readonly salesOrders: SalesOrdersService,
  ) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateQuotationDto,
    @Req() request: Request,
  ) {
    return this.quotations.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.quotations.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotations.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
    @Req() request: Request,
  ) {
    return this.quotations.update(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/send')
  send(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.quotations.send(actor, id, requestAuditMeta(request));
  }

  @Post(':id/accept')
  accept(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.quotations.accept(actor, id, requestAuditMeta(request));
  }

  @Post(':id/reject')
  reject(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.quotations.reject(actor, id, requestAuditMeta(request));
  }

  @Post(':id/cancel')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.quotations.cancel(actor, id, requestAuditMeta(request));
  }

  @Post(':id/proforma')
  createProforma(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.proformas.createFromQuotation(
      actor,
      id,
      requestAuditMeta(request),
    );
  }

  @Post(':id/convert-to-order')
  convertToOrder(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.salesOrders.convertFromQuotation(
      actor,
      id,
      requestAuditMeta(request),
    );
  }
}
