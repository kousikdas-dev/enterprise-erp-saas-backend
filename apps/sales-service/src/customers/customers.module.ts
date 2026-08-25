import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerAddressesController } from './customer-addresses.controller';
import { CustomerAddressesService } from './customer-addresses.service';

@Module({
  controllers: [
    CustomersController,
    CustomerAddressesController,
  ],
  providers: [
    CustomersService,
    CustomerAddressesService,
  ],
  exports: [
    CustomersService,
    CustomerAddressesService,
  ],
})
export class CustomersModule {}