import { Module } from '@nestjs/common';
import { PricelistsController } from './pricelists.controller';
import { PricelistsService } from './pricelists.service';

@Module({
  controllers: [PricelistsController],
  providers: [PricelistsService],
  exports: [PricelistsService],
})
export class PricelistsModule {}
