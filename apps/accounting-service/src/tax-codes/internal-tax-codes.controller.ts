import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { TaxCodesService } from './tax-codes.service';

interface InternalTaxComponentSource {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: string;
}

interface InternalTaxCodeSource {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  components: InternalTaxComponentSource[];
}

function toInternalTaxComponent(component: InternalTaxComponentSource) {
  return {
    id: component.id,
    sequence: component.sequence,
    type: component.type,
    name: component.name,
    rate: component.rate,
  };
}

function toInternalTaxCode(row: InternalTaxCodeSource) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    components: row.components.map(toInternalTaxComponent),
  };
}

@Controller({ path: 'internal/tax-codes', version: '1' })
@UseGuards(InternalServiceGuard, ActorGuard)
export class InternalTaxCodesController {
  constructor(private readonly taxCodes: TaxCodesService) {}

  @Get()
  async list(
    @CurrentActor() actor: ActorContext,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const { items } = await this.taxCodes.list(actor);
    const filtered =
      activeOnly === 'true' ? items.filter((item) => item.isActive) : items;
    return { items: filtered.map(toInternalTaxCode) };
  }

  @Get(':id')
  async getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toInternalTaxCode(await this.taxCodes.getById(actor, id));
  }
}
