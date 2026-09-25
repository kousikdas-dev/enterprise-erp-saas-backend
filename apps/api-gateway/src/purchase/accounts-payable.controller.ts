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
  ApAgingQueryDto,
  ApAgingResultDto,
  ApInvoiceListQueryDto,
  ApReconciliationSummaryDto,
  ApStatementQueryDto,
  ApSupplierListQueryDto,
  SupplierApLedgerListDto,
  SupplierApStatementDto,
  SupplierApSummaryDto,
  SupplierApSummaryListDto,
} from './dto/accounts-payable.dto';
import { PurchaseForwardService } from './purchase-forward.service';

@ApiTags('Accounts Payable')
@Controller({ path: 'accounts-payable', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountsPayableController {
  constructor(private readonly purchase: PurchaseForwardService) {}

  @Get('suppliers')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_PAYABLE_READ)
  @ApiOperation({
    summary: 'List supplier AP summaries',
    description:
      'Per-supplier totalInvoiced/totalPaid/totalOutstanding across CONFIRMED purchase invoices. Defaults to only suppliers with a positive outstanding balance. Permission: accounts-payable.read.',
  })
  @ApiOkResponse({ type: SupplierApSummaryListDto })
  @ApiManagementErrors()
  listSuppliers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ApSupplierListQueryDto,
  ): Promise<SupplierApSummaryListDto> {
    return this.purchase.forward<SupplierApSummaryListDto>({
      method: 'GET',
      path: '/api/v1/accounts-payable/suppliers',
      user,
      query: { ...query },
    });
  }

  @Get('suppliers/:supplierId')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_PAYABLE_READ)
  @ApiOperation({
    summary: 'Get one supplier\'s AP summary',
    description: 'Permission: accounts-payable.read.',
  })
  @ApiOkResponse({ type: SupplierApSummaryDto })
  @ApiManagementErrors()
  getSupplier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ): Promise<SupplierApSummaryDto> {
    return this.purchase.forward<SupplierApSummaryDto>({
      method: 'GET',
      path: `/api/v1/accounts-payable/suppliers/${supplierId}`,
      user,
    });
  }

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_PAYABLE_READ)
  @ApiOperation({
    summary: 'List AP invoice ledger entries',
    description:
      'Purchase invoices with balanceDue and optional payment history, filterable by supplier/status/paymentStatus. Permission: accounts-payable.read.',
  })
  @ApiOkResponse({ type: SupplierApLedgerListDto })
  @ApiManagementErrors()
  listInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ApInvoiceListQueryDto,
  ): Promise<SupplierApLedgerListDto> {
    return this.purchase.forward<SupplierApLedgerListDto>({
      method: 'GET',
      path: '/api/v1/accounts-payable/invoices',
      user,
      query: { ...query },
    });
  }

  @Get('suppliers/:supplierId/statement')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_PAYABLE_READ)
  @ApiOperation({
    summary: 'Supplier AP statement',
    description:
      'A running-balance statement of INVOICE/PAYMENT/PAYMENT_REVERSAL lines for one supplier, paginated. Permission: accounts-payable.read.',
  })
  @ApiOkResponse({ type: SupplierApStatementDto })
  @ApiManagementErrors()
  getStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query() query: ApStatementQueryDto,
  ): Promise<SupplierApStatementDto> {
    return this.purchase.forward<SupplierApStatementDto>({
      method: 'GET',
      path: `/api/v1/accounts-payable/suppliers/${supplierId}/statement`,
      user,
      query: { ...query },
    });
  }

  @Get('aging')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_PAYABLE_READ)
  @ApiOperation({
    summary: 'AP aging report',
    description:
      'Buckets outstanding CONFIRMED invoices by days overdue as of asOfDate (default today, UTC). Permission: accounts-payable.read.',
  })
  @ApiOkResponse({ type: ApAgingResultDto })
  @ApiManagementErrors()
  getAging(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ApAgingQueryDto,
  ): Promise<ApAgingResultDto> {
    return this.purchase.forward<ApAgingResultDto>({
      method: 'GET',
      path: '/api/v1/accounts-payable/aging',
      user,
      query: { ...query },
    });
  }

  @Get('reconciliation')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_PAYABLE_READ)
  @ApiOperation({
    summary: 'AP subledger vs GL reconciliation',
    description:
      'Compares the AP subledger\'s total outstanding balance against accounting-service\'s ACCOUNTS_PAYABLE account balance. Permission: accounts-payable.read.',
  })
  @ApiOkResponse({ type: ApReconciliationSummaryDto })
  @ApiManagementErrors()
  getReconciliation(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApReconciliationSummaryDto> {
    return this.purchase.forward<ApReconciliationSummaryDto>({
      method: 'GET',
      path: '/api/v1/accounts-payable/reconciliation',
      user,
    });
  }
}
