import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import {
  CreateStockAdjustmentDto,
  StockMovementQueryDto,
  StockQueryDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

@Controller({ version: '1' })
@UseGuards(ActorGuard)
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('stock')
  list(@CurrentActor() actor: ActorContext, @Query() query: StockQueryDto) {
    return this.stock.list(actor, query);
  }

  @Get('stock-movements')
  listMovements(
    @CurrentActor() actor: ActorContext,
    @Query() query: StockMovementQueryDto,
  ) {
    return this.stock.listMovements(actor, query);
  }

  @Get('stock-movements/:id')
  getMovement(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.stock.getMovement(actor, id);
  }

  @Post('stock-adjustments')
  adjust(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateStockAdjustmentDto,
    @Req() request: Request,
  ) {
    return this.stock.adjust(actor, dto, requestAuditMeta(request));
  }
}
