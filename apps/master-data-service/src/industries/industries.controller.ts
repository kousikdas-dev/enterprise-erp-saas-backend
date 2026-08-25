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
import {
  CreateIndustryDto,
  UpdateIndustryDto,
} from './dto/industry.dto';
import { IndustriesService } from './industries.service';

@Controller({ path: 'industries', version: '1' })
@UseGuards(ActorGuard)
export class IndustriesController {
  constructor(
    private readonly industries: IndustriesService,
  ) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateIndustryDto,
    @Req() request: Request,
  ) {
    return this.industries.create(
      actor,
      dto,
      requestAuditMeta(request),
    );
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.industries.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.industries.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIndustryDto,
    @Req() request: Request,
  ) {
    return this.industries.update(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }
}