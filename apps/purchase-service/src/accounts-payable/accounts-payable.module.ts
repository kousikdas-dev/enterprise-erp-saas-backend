import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { AccountsPayableController } from './accounts-payable.controller';
import { AccountsPayableService } from './accounts-payable.service';

@Module({
  imports: [AccountingClientModule],
  controllers: [AccountsPayableController],
  providers: [AccountsPayableService],
})
export class AccountsPayableModule {}
