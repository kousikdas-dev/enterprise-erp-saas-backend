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
  CreatePurchaseInvoiceDto,
  CreateSupplierPaymentDto,
  UpdatePurchaseInvoiceDto,
} from './dto/purchase-invoice.dto';
import { PurchaseInvoicesService } from './purchase-invoices.service';

@Controller({ path: 'purchase-invoices', version: '1' })
@UseGuards(ActorGuard)
export class PurchaseInvoicesController {
  constructor(private readonly invoices: PurchaseInvoicesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreatePurchaseInvoiceDto,
    @Req() request: Request,
  ) {
    return this.invoices.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.invoices.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseInvoiceDto,
    @Req() request: Request,
  ) {
    return this.invoices.update(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/confirm')
  confirm(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.invoices.confirm(actor, id, requestAuditMeta(request));
  }

  @Post(':id/cancel')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.invoices.cancel(actor, id, requestAuditMeta(request));
  }

  @Post(':id/payments')
  recordPayment(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupplierPaymentDto,
    @Req() request: Request,
  ) {
    return this.invoices.recordPayment(actor, id, dto, requestAuditMeta(request));
  }

  @Get(':id/payments')
  listPayments(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.listPayments(actor, id);
  }
}
