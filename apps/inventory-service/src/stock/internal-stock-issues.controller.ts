import { Body, Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { CreateStockIssueDto } from './dto/stock-issue.dto';
import { StockIssuesService } from './stock-issues.service';

@Controller({ path: 'internal/stock/issues', version: '1' })
@UseGuards(InternalServiceGuard, ActorGuard)
export class InternalStockIssuesController {
  constructor(private readonly issues: StockIssuesService) {}

  @Post()
  async apply(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateStockIssueDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.issues.apply(actor, dto);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }
}
