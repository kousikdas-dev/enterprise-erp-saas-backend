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
import { CreateInvoiceFromSourceDto } from '../sales-invoices/dto/sales-invoice.dto';
import { SalesInvoicesService } from '../sales-invoices/sales-invoices.service';
import { UpdateProformaInvoiceDto } from './dto/proforma-invoice.dto';
import { ProformaInvoicesService } from './proforma-invoices.service';

@Controller({ path: 'proforma-invoices', version: '1' })
@UseGuards(ActorGuard)
export class ProformaInvoicesController {
  constructor(
    private readonly proformas: ProformaInvoicesService,
    private readonly salesInvoices: SalesInvoicesService,
  ) {}

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.proformas.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.proformas.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProformaInvoiceDto,
    @Req() request: Request,
  ) {
    return this.proformas.update(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/send')
  send(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.proformas.send(actor, id, requestAuditMeta(request));
  }

  @Post(':id/cancel')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.proformas.cancel(actor, id, requestAuditMeta(request));
  }

  @Post(':id/invoice')
  createInvoice(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInvoiceFromSourceDto,
    @Req() request: Request,
  ) {
    return this.salesInvoices.createFromProformaInvoice(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }
}
