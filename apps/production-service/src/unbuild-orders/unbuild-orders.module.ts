import { Module } from '@nestjs/common';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { UnbuildOrdersController } from './unbuild-orders.controller';
import { UnbuildOrdersService } from './unbuild-orders.service';

@Module({
  imports: [InventoryClientModule],
  controllers: [UnbuildOrdersController],
  providers: [UnbuildOrdersService],
  exports: [UnbuildOrdersService],
})
export class UnbuildOrdersModule {}
