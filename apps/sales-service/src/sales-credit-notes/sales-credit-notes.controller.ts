import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import { CreateSalesCreditNoteDto } from './dto/sales-credit-note.dto';
import { ReverseSalesCreditNoteDto } from './dto/reverse-sales-credit-note.dto';
import { SalesCreditNotesService } from './sales-credit-notes.service';

@Controller({ path: 'sales-credit-notes', version: '1' })
@UseGuards(ActorGuard)
export class SalesCreditNotesController {
  constructor(private readonly creditNotes: SalesCreditNotesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateSalesCreditNoteDto,
    @Req() request: Request,
  ) {
    return this.creditNotes.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.creditNotes.list(actor);
  }

  @Get(':id')
  getById(@CurrentActor() actor: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.creditNotes.getById(actor, id);
  }

  @Post(':id/post')
  post(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.creditNotes.post(actor, id, requestAuditMeta(request));
  }

  @Post(':id/retry-accounting-posting')
  retryAccountingPosting(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.creditNotes.retryAccountingPosting(actor, id, requestAuditMeta(request));
  }

  @Post(':id/reverse')
  reverse(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseSalesCreditNoteDto,
    @Req() request: Request,
  ) {
    return this.creditNotes.reverse(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/retry-accounting-reversal')
  retryAccountingReversal(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.creditNotes.retryAccountingReversal(actor, id, requestAuditMeta(request));
  }
}
