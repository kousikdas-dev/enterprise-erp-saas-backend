import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@app/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiManagementErrors } from '../identity/api-management-errors';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { AccountingForwardService } from './accounting-forward.service';
import {
  BalanceSheetQueryDto,
  BalanceSheetResponseDto,
  ProfitLossQueryDto,
  ProfitLossResponseDto,
  TrialBalanceQueryDto,
  TrialBalanceResponseDto,
} from './dto/reports.dto';

@ApiTags('Financial Reports')
@Controller({ path: 'reports', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly accounting: AccountingForwardService) {}

  @Get('trial-balance')
  @RequirePermissions(PERMISSIONS.TRIAL_BALANCE_READ)
  @ApiOperation({
    summary: 'Trial Balance',
    description:
      'Every account in the JWT tenant\'s chart of accounts, with its closing debit/credit ' +
      'balance as of the given date (defaults to today). Derived entirely from posted ' +
      'JournalEntry/JournalLine rows. Permission: trial-balance.read.',
  })
  @ApiOkResponse({ type: TrialBalanceResponseDto })
  @ApiManagementErrors()
  getTrialBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TrialBalanceQueryDto,
  ): Promise<TrialBalanceResponseDto> {
    return this.accounting.forward<TrialBalanceResponseDto>({
      method: 'GET',
      path: '/api/v1/reports/trial-balance',
      user,
      query: { ...query },
    });
  }

  @Get('profit-loss')
  @RequirePermissions(PERMISSIONS.PROFIT_LOSS_READ)
  @ApiOperation({
    summary: 'Profit & Loss',
    description:
      'Revenue and Expense activity for the JWT tenant within [fromDate, toDate], with ' +
      'Net Income = Revenue - Expense. Permission: profit-loss.read.',
  })
  @ApiOkResponse({ type: ProfitLossResponseDto })
  @ApiManagementErrors()
  getProfitLoss(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProfitLossQueryDto,
  ): Promise<ProfitLossResponseDto> {
    return this.accounting.forward<ProfitLossResponseDto>({
      method: 'GET',
      path: '/api/v1/reports/profit-loss',
      user,
      query: { ...query },
    });
  }

  @Get('balance-sheet')
  @RequirePermissions(PERMISSIONS.BALANCE_SHEET_READ)
  @ApiOperation({
    summary: 'Balance Sheet',
    description:
      'Assets, Liabilities, and Equity for the JWT tenant as of the given date (defaults ' +
      'to today), with Net Income accumulated since inception folded into Equity as a ' +
      'Retained Earnings line. Permission: balance-sheet.read.',
  })
  @ApiOkResponse({ type: BalanceSheetResponseDto })
  @ApiManagementErrors()
  getBalanceSheet(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BalanceSheetQueryDto,
  ): Promise<BalanceSheetResponseDto> {
    return this.accounting.forward<BalanceSheetResponseDto>({
      method: 'GET',
      path: '/api/v1/reports/balance-sheet',
      user,
      query: { ...query },
    });
  }
}
