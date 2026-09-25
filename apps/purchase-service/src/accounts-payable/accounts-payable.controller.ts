import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { AccountsPayableService } from './accounts-payable.service';
import {
  ApAgingQueryDto,
  ApInvoiceListQueryDto,
  ApStatementQueryDto,
  ApSupplierListQueryDto,
} from './dto/accounts-payable.dto';

@Controller({ path: 'accounts-payable', version: '1' })
@UseGuards(ActorGuard)
export class AccountsPayableController {
  constructor(private readonly ap: AccountsPayableService) {}

  @Get('suppliers')
  listSuppliers(
    @CurrentActor() actor: ActorContext,
    @Query() query: ApSupplierListQueryDto,
  ) {
    const onlyOutstanding = query.onlyOutstanding !== 'false';
    return this.ap.listSupplierSummaries(actor, onlyOutstanding);
  }

  @Get('suppliers/:supplierId')
  getSupplier(
    @CurrentActor() actor: ActorContext,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.ap.getSupplierSummary(actor, supplierId);
  }

  @Get('invoices')
  listInvoices(
    @CurrentActor() actor: ActorContext,
    @Query() query: ApInvoiceListQueryDto,
  ) {
    return this.ap.listInvoices(actor, query);
  }

  @Get('suppliers/:supplierId/statement')
  getStatement(
    @CurrentActor() actor: ActorContext,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query() query: ApStatementQueryDto,
  ) {
    return this.ap.getStatement(actor, supplierId, query);
  }

  @Get('aging')
  getAging(@CurrentActor() actor: ActorContext, @Query() query: ApAgingQueryDto) {
    return this.ap.getAging(actor, query);
  }

  @Get('reconciliation')
  getReconciliation(@CurrentActor() actor: ActorContext) {
    return this.ap.getReconciliation(actor);
  }
}
