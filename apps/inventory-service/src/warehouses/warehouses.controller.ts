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
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { WarehousesService } from './warehouses.service';

@Controller({ path: 'warehouses', version: '1' })
@UseGuards(ActorGuard)
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateWarehouseDto,
    @Req() request: Request,
  ) {
    return this.warehouses.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.warehouses.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.warehouses.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @Req() request: Request,
  ) {
    return this.warehouses.update(actor, id, dto, requestAuditMeta(request));
  }
}
