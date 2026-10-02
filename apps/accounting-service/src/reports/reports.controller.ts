import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import {
  BalanceSheetQueryDto,
  ProfitLossQueryDto,
  TrialBalanceQueryDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';

@Controller({ path: 'reports', version: '1' })
@UseGuards(ActorGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('trial-balance')
  getTrialBalance(
    @CurrentActor() actor: ActorContext,
    @Query() query: TrialBalanceQueryDto,
  ) {
    return this.reports.getTrialBalance(actor, query);
  }

  @Get('profit-loss')
  getProfitLoss(
    @CurrentActor() actor: ActorContext,
    @Query() query: ProfitLossQueryDto,
  ) {
    return this.reports.getProfitLoss(actor, query);
  }

  @Get('balance-sheet')
  getBalanceSheet(
    @CurrentActor() actor: ActorContext,
    @Query() query: BalanceSheetQueryDto,
  ) {
    return this.reports.getBalanceSheet(actor, query);
  }
}
