import { Request } from 'express';
import { RequestAuditMeta } from '../auth/actor-context';

export function requestAuditMeta(request: Request): RequestAuditMeta {
  const ipAddress =
    firstHeader(request.headers['x-forwarded-for'])?.split(',')[0]?.trim() ||
    request.ip ||
    undefined;

  return {
    ipAddress,
    userAgent: firstHeader(request.headers['user-agent']),
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
