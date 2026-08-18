import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuditModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
