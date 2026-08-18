import { Module } from '@nestjs/common';
import { InternalServiceGuard } from '../internal/internal-service.guard';
import { AuditService } from './audit.service';
import { InternalAuditController } from './internal-audit.controller';

@Module({
  controllers: [InternalAuditController],
  providers: [AuditService, InternalServiceGuard],
  exports: [AuditService],
})
export class AuditModule {}
