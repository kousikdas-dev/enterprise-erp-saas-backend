export interface ActorContext {
  userId: string;
  tenantId: string;
}

export interface RequestAuditMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface RecordAuditInput {
  actor: ActorContext;
  resourceTenantId: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  request?: RequestAuditMeta;
}
