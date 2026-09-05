import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AccountingForwardService } from './accounting-forward.service';
import { AccountsController } from './accounts.controller';
import { JournalEntriesController } from './journal-entries.controller';
import { TaxCodesController } from './tax-codes.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
    AuthModule,
    RbacModule,
  ],
  controllers: [AccountsController, JournalEntriesController, TaxCodesController],
  providers: [AccountingForwardService],
})
export class AccountingAdminModule {}
