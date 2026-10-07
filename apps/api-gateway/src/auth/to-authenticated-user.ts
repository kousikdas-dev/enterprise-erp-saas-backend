import { UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user';

export function toAuthenticatedUser(payload: unknown): AuthenticatedUser {
  if (!isRecord(payload)) {
    throw new UnauthorizedException();
  }

  const typ = payload['typ'];
  const sub = payload['sub'];
  const tenantId = payload['tenantId'];
  const tenantName = payload['tenantName'];
  const userName = payload['userName'];

  if (typ !== 'access') {
    throw new UnauthorizedException();
  }
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new UnauthorizedException();
  }
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw new UnauthorizedException();
  }

  return {
    userId: sub,
    tenantId,
    tenantName: typeof tenantName === 'string' && tenantName.length > 0 ? tenantName : undefined,
    userName: typeof userName === 'string' && userName.length > 0 ? userName : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
