import { Module } from '@nestjs/common';
import { FiscalPositionsController } from './fiscal-positions.controller';
import { FiscalPositionsService } from './fiscal-positions.service';

@Module({
  controllers: [FiscalPositionsController],
  providers: [FiscalPositionsService],
  exports: [FiscalPositionsService],
})
export class FiscalPositionsModule {}