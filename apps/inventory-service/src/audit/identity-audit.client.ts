import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { INTERNAL_SERVICE_SECRET_HEADER } from '@app/common';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { InventoryEnvironmentVariables } from '../config/inventory-env';

@Injectable()
export class IdentityAuditClient {
  private readonly logger = new Logger(IdentityAuditClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<InventoryEnvironmentVariables, true>,
  ) {}

  async record(input: {
    actor: ActorContext;
    action: string;
    resource: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
    request?: RequestAuditMeta;
  }): Promise<void> {
    const base = this.config
      .get('IDENTITY_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    const secret = this.config.get('INTERNAL_SERVICE_SECRET', { infer: true });
    try {
      await firstValueFrom(
        this.http.post(
          `${base}/api/v1/internal/audit`,
          {
            userId: input.actor.userId,
            tenantId: input.actor.tenantId,
            action: input.action,
            resource: input.resource,
            resourceId: input.resourceId,
            metadata: input.metadata,
            ipAddress: input.request?.ipAddress,
            userAgent: input.request?.userAgent,
          },
          {
            headers: {
              [INTERNAL_SERVICE_SECRET_HEADER]: secret,
            },
          },
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to record ${input.action} audit for ${input.resource} ${input.resourceId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
