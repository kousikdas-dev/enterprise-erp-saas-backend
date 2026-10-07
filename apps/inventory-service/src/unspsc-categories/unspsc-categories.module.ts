import { Module } from '@nestjs/common';
import { UnspscCategoriesController } from './unspsc-categories.controller';
import { UnspscCategoriesService } from './unspsc-categories.service';

@Module({
  controllers: [UnspscCategoriesController],
  providers: [UnspscCategoriesService],
  exports: [UnspscCategoriesService],
})
export class UnspscCategoriesModule {}
