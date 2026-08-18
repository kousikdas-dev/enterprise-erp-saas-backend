import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordAuditInput } from './audit.types';
import { sanitizeAuditMetadata } from './sanitize-audit-metadata';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: RecordAuditInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const sameTenant = input.actor.tenantId === input.resourceTenantId;
    await client.auditLog.create({
      data: {
        tenantId: input.resourceTenantId,
        userId: sameTenant ? input.actor.userId : null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        metadata: sanitizeAuditMetadata({
          ...input.metadata,
          actorUserId: input.actor.userId,
          actorTenantId: input.actor.tenantId,
        }) as Prisma.InputJsonValue,
        ipAddress: input.request?.ipAddress,
        userAgent: input.request?.userAgent,
      },
    });
  }
}
