import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { AccountsReceivableService } from './accounts-receivable.service';
import {
  ArAgingQueryDto,
  ArCustomerListQueryDto,
  ArInvoiceListQueryDto,
  ArStatementQueryDto,
} from './dto/accounts-receivable.dto';

@Controller({ path: 'accounts-receivable', version: '1' })
@UseGuards(ActorGuard)
export class AccountsReceivableController {
  constructor(private readonly ar: AccountsReceivableService) {}

  @Get('customers')
  listCustomers(
    @CurrentActor() actor: ActorContext,
    @Query() query: ArCustomerListQueryDto,
  ) {
    const onlyOutstanding = query.onlyOutstanding !== 'false';
    return this.ar.listCustomerSummaries(actor, onlyOutstanding);
  }

  @Get('customers/:customerId')
  getCustomer(
    @CurrentActor() actor: ActorContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.ar.getCustomerSummary(actor, customerId);
  }

  @Get('invoices')
  listInvoices(
    @CurrentActor() actor: ActorContext,
    @Query() query: ArInvoiceListQueryDto,
  ) {
    return this.ar.listInvoices(actor, query);
  }

  @Get('customers/:customerId/statement')
  getStatement(
    @CurrentActor() actor: ActorContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: ArStatementQueryDto,
  ) {
    return this.ar.getStatement(actor, customerId, query);
  }

  @Get('aging')
  getAging(@CurrentActor() actor: ActorContext, @Query() query: ArAgingQueryDto) {
    return this.ar.getAging(actor, query);
  }

  @Get('reconciliation')
  getReconciliation(@CurrentActor() actor: ActorContext) {
    return this.ar.getReconciliation(actor);
  }
}
