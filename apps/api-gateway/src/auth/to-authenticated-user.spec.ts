import { UnauthorizedException } from '@nestjs/common';
import { toAuthenticatedUser } from './to-authenticated-user';

describe('toAuthenticatedUser', () => {
  it('maps a valid access token payload to request user context', () => {
    expect(
      toAuthenticatedUser({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'admin@demo.local',
        typ: 'access',
      }),
    ).toEqual({ userId: 'user-1', tenantId: 'tenant-1' });
  });

  it('rejects a missing payload', () => {
    expect(() => toAuthenticatedUser(undefined)).toThrow(UnauthorizedException);
  });

  it('rejects a refresh-style token type', () => {
    expect(() =>
      toAuthenticatedUser({
        sub: 'user-1',
        tenantId: 'tenant-1',
        typ: 'refresh',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a payload without tenantId', () => {
    expect(() => toAuthenticatedUser({ sub: 'user-1', typ: 'access' })).toThrow(
      UnauthorizedException,
    );
  });
});
