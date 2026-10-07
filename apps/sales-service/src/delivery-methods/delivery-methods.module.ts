import { Module } from '@nestjs/common';
import { DeliveryMethodsController } from './delivery-methods.controller';
import { DeliveryMethodsService } from './delivery-methods.service';

@Module({
  controllers: [DeliveryMethodsController],
  providers: [DeliveryMethodsService],
  exports: [DeliveryMethodsService],
})
export class DeliveryMethodsModule {}
