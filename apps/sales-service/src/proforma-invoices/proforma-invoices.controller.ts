import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { ProformaInvoicesService } from './proforma-invoices.service';

@Controller({ path: 'proforma-invoices', version: '1' })
@UseGuards(ActorGuard)
export class ProformaInvoicesController {
  constructor(private readonly proformas: ProformaInvoicesService) {}

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
}
