import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalServiceGuard } from '../internal/internal-service.guard';
import { AuditService } from './audit.service';
import { RecordInternalAuditDto } from './dto/record-internal-audit.dto';

@Controller({ path: 'internal/audit', version: '1' })
@UseGuards(InternalServiceGuard)
export class InternalAuditController {
  constructor(private readonly audit: AuditService) {}

  @Post()
  async record(
    @Body() dto: RecordInternalAuditDto,
  ): Promise<{ recorded: true }> {
    await this.audit.record({
      actor: { userId: dto.userId, tenantId: dto.tenantId },
      resourceTenantId: dto.tenantId,
      action: dto.action,
      resource: dto.resource,
      resourceId: dto.resourceId,
      metadata: dto.metadata,
      request: { ipAddress: dto.ipAddress, userAgent: dto.userAgent },
    });
    return { recorded: true };
  }
}
