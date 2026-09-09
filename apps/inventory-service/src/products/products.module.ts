import { Module } from '@nestjs/common';
import { ProductUnitsModule } from '../product-units/product-units.module';
import { UnitsModule } from '../units/units.module';
import { InternalProductsController } from './internal-products.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [ProductUnitsModule, UnitsModule],
  controllers: [ProductsController, InternalProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
