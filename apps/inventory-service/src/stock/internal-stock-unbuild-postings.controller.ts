import { Body, Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { CreateUnbuildPostingDto } from './dto/stock-unbuild-posting.dto';
import { StockUnbuildPostingsService } from './stock-unbuild-postings.service';

@Controller({ path: 'internal/stock/unbuild-postings', version: '1' })
@UseGuards(InternalServiceGuard, ActorGuard)
export class InternalStockUnbuildPostingsController {
  constructor(private readonly unbuildPostings: StockUnbuildPostingsService) {}

  @Post()
  async apply(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateUnbuildPostingDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.unbuildPostings.apply(actor, dto);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }
}
