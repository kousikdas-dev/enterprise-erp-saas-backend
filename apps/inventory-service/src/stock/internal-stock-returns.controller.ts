import { Body, Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { CreateStockReturnDto } from './dto/stock-return.dto';
import { StockReturnsService } from './stock-returns.service';

@Controller({ path: 'internal/stock/returns', version: '1' })
@UseGuards(InternalServiceGuard, ActorGuard)
export class InternalStockReturnsController {
  constructor(private readonly returns: StockReturnsService) {}

  @Post()
  async apply(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateStockReturnDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.returns.apply(actor, dto);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }
}
