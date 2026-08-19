import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { CreateStockReceiptDto } from './dto/stock-receipt.dto';
import { StockReceiptsService } from './stock-receipts.service';

@Controller({ path: 'internal/stock/receipts', version: '1' })
@UseGuards(InternalServiceGuard, ActorGuard)
export class InternalStockReceiptsController {
  constructor(private readonly receipts: StockReceiptsService) {}

  @Post()
  async apply(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateStockReceiptDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.receipts.apply(actor, dto);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }
}
