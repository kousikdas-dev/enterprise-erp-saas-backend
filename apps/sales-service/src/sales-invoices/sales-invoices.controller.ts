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
  CreateSalesInvoiceDto,
  CreateSalesPaymentDto,
  UpdateSalesInvoiceDto,
} from './dto/sales-invoice.dto';
import { ReverseSalesPaymentDto } from './dto/reverse-sales-payment.dto';
import { SalesInvoicesService } from './sales-invoices.service';

@Controller({ path: 'sales-invoices', version: '1' })
@UseGuards(ActorGuard)
export class SalesInvoicesController {
  constructor(private readonly invoices: SalesInvoicesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateSalesInvoiceDto,
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
    @Body() dto: UpdateSalesInvoiceDto,
    @Req() request: Request,
  ) {
    return this.invoices.update(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/send')
  send(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.invoices.send(actor, id, requestAuditMeta(request));
  }

  @Post(':id/cancel')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.invoices.cancel(actor, id, requestAuditMeta(request));
  }

  @Post(':id/retry-accounting-posting')
  retryAccountingPosting(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.invoices.retryAccountingPosting(
      actor,
      id,
      requestAuditMeta(request),
    );
  }

  @Post(':id/retry-accounting-reversal')
  retryAccountingReversal(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.invoices.retryAccountingReversal(
      actor,
      id,
      requestAuditMeta(request),
    );
  }

  @Post(':id/payments')
  recordPayment(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSalesPaymentDto,
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

  @Post(':id/payments/:paymentId/retry-accounting-posting')
  retryPaymentAccountingPosting(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Req() request: Request,
  ) {
    return this.invoices.retryPaymentAccountingPosting(
      actor,
      id,
      paymentId,
      requestAuditMeta(request),
    );
  }

  @Post(':id/payments/:paymentId/reverse')
  reversePayment(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ReverseSalesPaymentDto,
    @Req() request: Request,
  ) {
    return this.invoices.reversePayment(
      actor,
      id,
      paymentId,
      dto,
      requestAuditMeta(request),
    );
  }

  @Post(':id/payments/:paymentId/retry-accounting-reversal')
  retryPaymentAccountingReversal(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Req() request: Request,
  ) {
    return this.invoices.retryPaymentAccountingReversal(
      actor,
      id,
      paymentId,
      requestAuditMeta(request),
    );
  }
}
