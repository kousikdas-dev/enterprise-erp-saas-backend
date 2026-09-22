import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountLedgerService } from './ledger/account-ledger.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccountLedgerService],
  exports: [AccountsService],
})
export class AccountsModule {}
