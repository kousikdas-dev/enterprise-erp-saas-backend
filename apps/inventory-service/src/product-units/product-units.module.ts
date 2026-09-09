import { Module } from '@nestjs/common';
import { ProductUnitsController } from './product-units.controller';
import { ProductUnitsService } from './product-units.service';

@Module({
  controllers: [ProductUnitsController],
  providers: [ProductUnitsService],
  exports: [ProductUnitsService],
})
export class ProductUnitsModule {}
