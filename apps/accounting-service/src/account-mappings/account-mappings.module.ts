import { Module } from '@nestjs/common';
import { AccountMappingsController } from './account-mappings.controller';
import { AccountMappingsService } from './account-mappings.service';

@Module({
  controllers: [AccountMappingsController],
  providers: [AccountMappingsService],
  exports: [AccountMappingsService],
})
export class AccountMappingsModule {}
