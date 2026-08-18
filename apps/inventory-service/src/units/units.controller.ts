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
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';
import { UnitsService } from './units.service';

@Controller({ path: 'units', version: '1' })
@UseGuards(ActorGuard)
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateUnitDto,
    @Req() request: Request,
  ) {
    return this.units.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.units.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.units.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
    @Req() request: Request,
  ) {
    return this.units.update(actor, id, dto, requestAuditMeta(request));
  }
}
