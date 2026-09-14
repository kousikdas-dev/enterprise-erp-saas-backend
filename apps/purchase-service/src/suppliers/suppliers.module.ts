import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { SupplierAddressesController } from './supplier-addresses.controller';
import { SupplierAddressesService } from './supplier-addresses.service';

@Module({
  controllers: [SuppliersController, SupplierAddressesController],
  providers: [SuppliersService, SupplierAddressesService],
  exports: [SuppliersService, SupplierAddressesService],
})
export class SuppliersModule {}
