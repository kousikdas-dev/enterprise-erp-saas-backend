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
import { PricelistsService } from './pricelists.service';
import { CreatePricelistDto, UpdatePricelistDto } from './dto/pricelist.dto';
import {
  CreatePricelistItemDto,
  UpdatePricelistItemDto,
} from './dto/pricelist-item.dto';

@Controller({ path: 'pricelists', version: '1' })
@UseGuards(ActorGuard)
export class PricelistsController {
  constructor(private readonly pricelists: PricelistsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreatePricelistDto,
    @Req() request: Request,
  ) {
    return this.pricelists.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.pricelists.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pricelists.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePricelistDto,
    @Req() request: Request,
  ) {
    return this.pricelists.update(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/items')
  addItem(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePricelistItemDto,
    @Req() request: Request,
  ) {
    return this.pricelists.addItem(actor, id, dto, requestAuditMeta(request));
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdatePricelistItemDto,
    @Req() request: Request,
  ) {
    return this.pricelists.updateItem(
      actor,
      id,
      itemId,
      dto,
      requestAuditMeta(request),
    );
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() request: Request,
  ) {
    return this.pricelists.removeItem(
      actor,
      id,
      itemId,
      requestAuditMeta(request),
    );
  }
}
