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
import { CreateGoodsReceiptDto } from './dto/goods-receipt.dto';
import { GoodsReceiptsService } from './goods-receipts.service';

@Controller({ path: 'goods-receipts', version: '1' })
@UseGuards(ActorGuard)
export class GoodsReceiptsController {
  constructor(private readonly receipts: GoodsReceiptsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateGoodsReceiptDto,
    @Req() request: Request,
  ) {
    return this.receipts.create(actor, dto, requestAuditMeta(request));
  }

  @Post(':id/post')
  post(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.receipts.post(actor, id, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.receipts.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.receipts.getById(actor, id);
  }
}
