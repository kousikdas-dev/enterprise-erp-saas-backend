import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import { CreateShipmentDto } from './dto/shipment.dto';
import { ShipmentsService } from './shipments.service';

@Controller({ path: 'shipments', version: '1' })
@UseGuards(ActorGuard)
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateShipmentDto,
    @Req() request: Request,
  ) {
    return this.shipments.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.shipments.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shipments.getById(actor, id);
  }

  @Post(':id/post')
  post(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.shipments.post(actor, id, requestAuditMeta(request));
  }
}
