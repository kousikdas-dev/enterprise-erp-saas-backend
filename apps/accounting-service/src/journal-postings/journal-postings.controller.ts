import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { JournalPostingsService } from './journal-postings.service';
import {
  CreateJournalPostingDto,
  ReverseJournalPostingDto,
} from './dto/journal-posting.dto';

@Controller({ path: 'internal/journal-postings', version: '1' })
@UseGuards(InternalServiceGuard, ActorGuard)
export class JournalPostingsController {
  constructor(private readonly postings: JournalPostingsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateJournalPostingDto,
  ) {
    return this.postings.create(actor, dto);
  }

  @Post('reverse')
  reverse(
    @CurrentActor() actor: ActorContext,
    @Body() dto: ReverseJournalPostingDto,
  ) {
    return this.postings.reverse(actor, dto);
  }
}
