import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { JournalEntriesController } from './journal-entries.controller';
import { JournalEntriesService } from './journal-entries.service';

@Module({
  imports: [AccountsModule],
  controllers: [JournalEntriesController],
  providers: [JournalEntriesService],
  exports: [JournalEntriesService],
})
export class JournalEntriesModule {}
