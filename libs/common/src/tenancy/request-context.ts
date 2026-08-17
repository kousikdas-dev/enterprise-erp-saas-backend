import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  tenantId?: string;
  userId?: string;
  correlationId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function getRequiredTenantId(): string {
  const tenantId = requestContextStorage.getStore()?.tenantId;
  if (!tenantId) {
    throw new Error('Tenant context is not available for this request');
  }
  return tenantId;
}
