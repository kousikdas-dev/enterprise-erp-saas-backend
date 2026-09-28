import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import { CreatePurchaseDebitNoteDto } from './dto/purchase-debit-note.dto';
import { ReversePurchaseDebitNoteDto } from './dto/reverse-purchase-debit-note.dto';
import { PurchaseDebitNotesService } from './purchase-debit-notes.service';

@Controller({ path: 'purchase-debit-notes', version: '1' })
@UseGuards(ActorGuard)
export class PurchaseDebitNotesController {
  constructor(private readonly debitNotes: PurchaseDebitNotesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreatePurchaseDebitNoteDto,
    @Req() request: Request,
  ) {
    return this.debitNotes.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.debitNotes.list(actor);
  }

  @Get(':id')
  getById(@CurrentActor() actor: ActorContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.debitNotes.getById(actor, id);
  }

  @Post(':id/post')
  post(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.debitNotes.post(actor, id, requestAuditMeta(request));
  }

  @Post(':id/retry-accounting-posting')
  retryAccountingPosting(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.debitNotes.retryAccountingPosting(actor, id, requestAuditMeta(request));
  }

  @Post(':id/reverse')
  reverse(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePurchaseDebitNoteDto,
    @Req() request: Request,
  ) {
    return this.debitNotes.reverse(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/retry-accounting-reversal')
  retryAccountingReversal(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.debitNotes.retryAccountingReversal(actor, id, requestAuditMeta(request));
  }
}
