import { Module } from '@nestjs/common';
import { InternalWarehousesController } from './internal-warehouses.controller';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

@Module({
  controllers: [WarehousesController, InternalWarehousesController],
  providers: [WarehousesService],
})
export class WarehousesModule {}
