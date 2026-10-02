import { Module } from '@nestjs/common';
import { WorkCentresController } from './work-centres.controller';
import { WorkCentresService } from './work-centres.service';

@Module({
  controllers: [WorkCentresController],
  providers: [WorkCentresService],
  exports: [WorkCentresService],
})
export class WorkCentresModule {}
