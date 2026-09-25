import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@app/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiManagementErrors } from '../identity/api-management-errors';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import {
  ArAgingQueryDto,
  ArAgingResultDto,
  ArInvoiceListQueryDto,
  ArReconciliationSummaryDto,
  ArStatementQueryDto,
  ArCustomerListQueryDto,
  CustomerArLedgerListDto,
  CustomerArStatementDto,
  CustomerArSummaryDto,
  CustomerArSummaryListDto,
} from './dto/accounts-receivable.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Accounts Receivable')
@Controller({ path: 'accounts-receivable', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountsReceivableController {
  constructor(private readonly sales: SalesForwardService) {}

  @Get('customers')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_RECEIVABLE_READ)
  @ApiOperation({
    summary: 'List customer AR summaries',
    description:
      'Per-customer totalInvoiced/totalPaid/totalOutstanding across SENT sales invoices. Defaults to only customers with a positive outstanding balance. Permission: accounts-receivable.read.',
  })
  @ApiOkResponse({ type: CustomerArSummaryListDto })
  @ApiManagementErrors()
  listCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ArCustomerListQueryDto,
  ): Promise<CustomerArSummaryListDto> {
    return this.sales.forward<CustomerArSummaryListDto>({
      method: 'GET',
      path: '/api/v1/accounts-receivable/customers',
      user,
      query: { ...query },
    });
  }

  @Get('customers/:customerId')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_RECEIVABLE_READ)
  @ApiOperation({
    summary: 'Get one customer\'s AR summary',
    description: 'Permission: accounts-receivable.read.',
  })
  @ApiOkResponse({ type: CustomerArSummaryDto })
  @ApiManagementErrors()
  getCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CustomerArSummaryDto> {
    return this.sales.forward<CustomerArSummaryDto>({
      method: 'GET',
      path: `/api/v1/accounts-receivable/customers/${customerId}`,
      user,
    });
  }

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_RECEIVABLE_READ)
  @ApiOperation({
    summary: 'List AR invoice ledger entries',
    description:
      'Sales invoices with balanceDue and optional payment history, filterable by customer/status/paymentStatus. Permission: accounts-receivable.read.',
  })
  @ApiOkResponse({ type: CustomerArLedgerListDto })
  @ApiManagementErrors()
  listInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ArInvoiceListQueryDto,
  ): Promise<CustomerArLedgerListDto> {
    return this.sales.forward<CustomerArLedgerListDto>({
      method: 'GET',
      path: '/api/v1/accounts-receivable/invoices',
      user,
      query: { ...query },
    });
  }

  @Get('customers/:customerId/statement')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_RECEIVABLE_READ)
  @ApiOperation({
    summary: 'Customer AR statement',
    description:
      'A running-balance statement of INVOICE/PAYMENT lines for one customer, paginated. Permission: accounts-receivable.read.',
  })
  @ApiOkResponse({ type: CustomerArStatementDto })
  @ApiManagementErrors()
  getStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: ArStatementQueryDto,
  ): Promise<CustomerArStatementDto> {
    return this.sales.forward<CustomerArStatementDto>({
      method: 'GET',
      path: `/api/v1/accounts-receivable/customers/${customerId}/statement`,
      user,
      query: { ...query },
    });
  }

  @Get('aging')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_RECEIVABLE_READ)
  @ApiOperation({
    summary: 'AR aging report',
    description:
      'Buckets outstanding SENT invoices by days overdue as of asOfDate (default today, UTC). Permission: accounts-receivable.read.',
  })
  @ApiOkResponse({ type: ArAgingResultDto })
  @ApiManagementErrors()
  getAging(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ArAgingQueryDto,
  ): Promise<ArAgingResultDto> {
    return this.sales.forward<ArAgingResultDto>({
      method: 'GET',
      path: '/api/v1/accounts-receivable/aging',
      user,
      query: { ...query },
    });
  }

  @Get('reconciliation')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_RECEIVABLE_READ)
  @ApiOperation({
    summary: 'AR subledger vs GL reconciliation',
    description:
      'Compares the AR subledger\'s total outstanding balance against accounting-service\'s ACCOUNTS_RECEIVABLE account balance. Permission: accounts-receivable.read.',
  })
  @ApiOkResponse({ type: ArReconciliationSummaryDto })
  @ApiManagementErrors()
  getReconciliation(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ArReconciliationSummaryDto> {
    return this.sales.forward<ArReconciliationSummaryDto>({
      method: 'GET',
      path: '/api/v1/accounts-receivable/reconciliation',
      user,
    });
  }
}
