import {
  Body,
  Controller,
  Delete,
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
import { AttributesService } from './attributes.service';
import { CreateAttributeDto, UpdateAttributeDto } from './dto/attribute.dto';
import {
  CreateAttributeValueDto,
  UpdateAttributeValueDto,
} from './dto/attribute-value.dto';

@Controller({ path: 'attributes', version: '1' })
@UseGuards(ActorGuard)
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateAttributeDto,
    @Req() request: Request,
  ) {
    return this.attributes.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.attributes.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attributes.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttributeDto,
    @Req() request: Request,
  ) {
    return this.attributes.update(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/values')
  addValue(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAttributeValueDto,
    @Req() request: Request,
  ) {
    return this.attributes.addValue(actor, id, dto, requestAuditMeta(request));
  }

  @Patch(':id/values/:valueId')
  updateValue(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valueId', ParseUUIDPipe) valueId: string,
    @Body() dto: UpdateAttributeValueDto,
    @Req() request: Request,
  ) {
    return this.attributes.updateValue(
      actor,
      id,
      valueId,
      dto,
      requestAuditMeta(request),
    );
  }

  @Delete(':id/values/:valueId')
  removeValue(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valueId', ParseUUIDPipe) valueId: string,
    @Req() request: Request,
  ) {
    return this.attributes.removeValue(
      actor,
      id,
      valueId,
      requestAuditMeta(request),
    );
  }
}
