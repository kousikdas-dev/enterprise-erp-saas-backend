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
import { FiscalPositionsService } from './fiscal-positions.service';
import {
  CreateFiscalPositionDto,
  UpdateFiscalPositionDto,
} from './dto/fiscal-position.dto';

@Controller({ path: 'fiscal-positions', version: '1' })
@UseGuards(ActorGuard)
export class FiscalPositionsController {
  constructor(
    private readonly fiscalPositions: FiscalPositionsService,
  ) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateFiscalPositionDto,
    @Req() request: Request,
  ) {
    return this.fiscalPositions.create(
      actor,
      dto,
      requestAuditMeta(request),
    );
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.fiscalPositions.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.fiscalPositions.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFiscalPositionDto,
    @Req() request: Request,
  ) {
    return this.fiscalPositions.update(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }
}