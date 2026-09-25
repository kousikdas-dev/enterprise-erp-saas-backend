import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { AccountsReceivableController } from './accounts-receivable.controller';
import { AccountsReceivableService } from './accounts-receivable.service';

@Module({
  imports: [AccountingClientModule],
  controllers: [AccountsReceivableController],
  providers: [AccountsReceivableService],
})
export class AccountsReceivableModule {}
