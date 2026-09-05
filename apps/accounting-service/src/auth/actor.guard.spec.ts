import { UnauthorizedException } from '@nestjs/common';
import { ACTOR_TENANT_ID_HEADER, ACTOR_USER_ID_HEADER } from '@app/common';
import { ActorGuard } from './actor.guard';

describe('ActorGuard', () => {
  const guard = new ActorGuard();
  const userId = '11111111-1111-4111-8111-111111111111';
  const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function context(headers: Record<string, string>) {
    const request: { headers: Record<string, string>; actor?: unknown } = {
      headers,
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      request,
    };
  }

  it('sets actor from trusted gateway headers', () => {
    const ctx = context({
      [ACTOR_USER_ID_HEADER]: userId,
      [ACTOR_TENANT_ID_HEADER]: tenantId,
    });
    expect(guard.canActivate(ctx as never)).toBe(true);
    expect(ctx.request.actor).toEqual({ userId, tenantId });
  });

  it('rejects missing actor headers', () => {
    const ctx = context({});
    expect(() => guard.canActivate(ctx as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects non-UUID actor headers', () => {
    const ctx = context({
      [ACTOR_USER_ID_HEADER]: 'not-a-uuid',
      [ACTOR_TENANT_ID_HEADER]: tenantId,
    });
    expect(() => guard.canActivate(ctx as never)).toThrow(
      UnauthorizedException,
    );
  });
});
