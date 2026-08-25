import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { MasterDataForwardService } from './master-data-forward.service';
import { PaymentTermsController } from './payment-terms.controller';
import { PaymentMethodsController } from './payment-methods.controller';
import { FiscalPositionsController } from './fiscal-positions.controller';
import { IndustriesController } from './industries.controller';


@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
    AuthModule,
    RbacModule,
  ],
  controllers: [PaymentTermsController,PaymentMethodsController,FiscalPositionsController,IndustriesController,],
  providers: [MasterDataForwardService],
})
export class MasterDataAdminModule {}