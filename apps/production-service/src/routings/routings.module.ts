import { Module } from '@nestjs/common';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { RoutingsController } from './routings.controller';
import { RoutingsService } from './routings.service';

@Module({
  imports: [InventoryClientModule],
  controllers: [RoutingsController],
  providers: [RoutingsService],
  exports: [RoutingsService],
})
export class RoutingsModule {}
