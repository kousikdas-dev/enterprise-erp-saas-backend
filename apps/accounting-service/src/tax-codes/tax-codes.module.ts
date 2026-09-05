import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TaxCodesController } from './tax-codes.controller';
import { TaxCodesService } from './tax-codes.service';

@Module({
  imports: [AccountsModule],
  controllers: [TaxCodesController],
  providers: [TaxCodesService],
  exports: [TaxCodesService],
})
export class TaxCodesModule {}
