import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { BomsController } from './boms.controller';
import { OperationsController } from './operations.controller';
import { ProductionForwardService } from './production-forward.service';
import { ProductionOrdersController } from './production-orders.controller';
import { RoutingsController } from './routings.controller';
import { UnbuildOrdersController } from './unbuild-orders.controller';
import { WorkCentresController } from './work-centres.controller';
import { WorkOrdersController } from './work-orders.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
    AuthModule,
    RbacModule,
  ],
  controllers: [
    BomsController,
    OperationsController,
    WorkCentresController,
    ProductionOrdersController,
    WorkOrdersController,
    RoutingsController,
    UnbuildOrdersController,
  ],
  providers: [ProductionForwardService],
})
export class ProductionAdminModule {}
