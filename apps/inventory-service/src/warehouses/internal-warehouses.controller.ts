import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { WarehousesService } from './warehouses.service';

@Controller({ path: 'internal/warehouses', version: '1' })
@UseGuards(InternalServiceGuard, ActorGuard)
export class InternalWarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get(':id')
  async getInternalDetail(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const warehouse = await this.warehouses.getById(actor, id);
    return {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      isActive: warehouse.isActive,
    };
  }
}
