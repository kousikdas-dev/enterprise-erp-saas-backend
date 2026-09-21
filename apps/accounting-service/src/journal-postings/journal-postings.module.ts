import { Module } from '@nestjs/common';
import { AccountMappingsModule } from '../account-mappings/account-mappings.module';
import { JournalPostingsController } from './journal-postings.controller';
import { JournalPostingsService } from './journal-postings.service';

@Module({
  imports: [AccountMappingsModule],
  controllers: [JournalPostingsController],
  providers: [JournalPostingsService],
  exports: [JournalPostingsService],
})
export class JournalPostingsModule {}
