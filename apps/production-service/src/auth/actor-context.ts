export interface ActorContext {
  userId: string;
  tenantId: string;
}

export interface RequestAuditMeta {
  ipAddress?: string;
  userAgent?: string;
}
