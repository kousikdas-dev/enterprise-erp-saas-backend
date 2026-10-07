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
  CreateUnspscCategoryDto,
  UpdateUnspscCategoryDto,
} from './dto/unspsc-category.dto';
import { UnspscCategoriesService } from './unspsc-categories.service';

@Controller({ path: 'unspsc-categories', version: '1' })
@UseGuards(ActorGuard)
export class UnspscCategoriesController {
  constructor(private readonly unspscCategories: UnspscCategoriesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateUnspscCategoryDto,
    @Req() request: Request,
  ) {
    return this.unspscCategories.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.unspscCategories.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.unspscCategories.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnspscCategoryDto,
    @Req() request: Request,
  ) {
    return this.unspscCategories.update(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }
}
