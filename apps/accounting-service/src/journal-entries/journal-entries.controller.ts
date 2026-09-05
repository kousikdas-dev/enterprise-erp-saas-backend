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
import { JournalEntriesService } from './journal-entries.service';
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
} from './dto/journal-entry.dto';

@Controller({ path: 'journal-entries', version: '1' })
@UseGuards(ActorGuard)
export class JournalEntriesController {
  constructor(private readonly journalEntries: JournalEntriesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateJournalEntryDto,
    @Req() request: Request,
  ) {
    return this.journalEntries.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.journalEntries.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.journalEntries.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJournalEntryDto,
    @Req() request: Request,
  ) {
    return this.journalEntries.update(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }

  @Post(':id/post')
  post(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.journalEntries.post(actor, id, requestAuditMeta(request));
  }
}
