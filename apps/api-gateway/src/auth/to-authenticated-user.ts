import { UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user';

export function toAuthenticatedUser(payload: unknown): AuthenticatedUser {
  if (!isRecord(payload)) {
    throw new UnauthorizedException();
  }

  const typ = payload['typ'];
  const sub = payload['sub'];
  const tenantId = payload['tenantId'];

  if (typ !== 'access') {
    throw new UnauthorizedException();
  }
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new UnauthorizedException();
  }
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw new UnauthorizedException();
  }

  return { userId: sub, tenantId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
