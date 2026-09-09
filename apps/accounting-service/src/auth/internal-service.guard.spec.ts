import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INTERNAL_SERVICE_SECRET_HEADER } from '@app/common';
import { AccountingEnvironmentVariables } from '../config/accounting-env';
import { InternalServiceGuard } from './internal-service.guard';

describe('InternalServiceGuard', () => {
  const SECRET = 'a'.repeat(20);
  const WRONG_SAME_LENGTH = 'b'.repeat(20);
  const WRONG_DIFFERENT_LENGTH = 'c'.repeat(10);

  function createGuard(configuredSecret: string = SECRET) {
    const config = {
      get: jest.fn().mockReturnValue(configuredSecret),
    };
    const guard = new InternalServiceGuard(
      config as unknown as ConfigService<AccountingEnvironmentVariables, true>,
    );
    return { guard, config };
  }

  function context(headers: Record<string, string | string[]>) {
    const request = { headers };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    };
  }

  it('allows the request when the header matches the configured secret', () => {
    const { guard } = createGuard();
    const ctx = context({ [INTERNAL_SERVICE_SECRET_HEADER]: SECRET });

    expect(guard.canActivate(ctx as never)).toBe(true);
  });

  it('rejects when the header is missing', () => {
    const { guard } = createGuard();
    const ctx = context({});

    expect(() => guard.canActivate(ctx as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the header does not match the configured secret', () => {
    const { guard } = createGuard();
    const ctx = context({
      [INTERNAL_SERVICE_SECRET_HEADER]: WRONG_SAME_LENGTH,
    });

    expect(() => guard.canActivate(ctx as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('allows the request when the header arrives as an array with a matching first element', () => {
    const { guard } = createGuard();
    const ctx = context({
      [INTERNAL_SERVICE_SECRET_HEADER]: [SECRET, WRONG_SAME_LENGTH],
    });

    expect(guard.canActivate(ctx as never)).toBe(true);
  });

  it('rejects when the header arrives as an array with a non-matching first element', () => {
    const { guard } = createGuard();
    const ctx = context({
      [INTERNAL_SERVICE_SECRET_HEADER]: [WRONG_SAME_LENGTH, SECRET],
    });

    expect(() => guard.canActivate(ctx as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the provided secret has a different length than the configured secret', () => {
    const { guard } = createGuard(SECRET);
    const ctx = context({
      [INTERNAL_SERVICE_SECRET_HEADER]: WRONG_DIFFERENT_LENGTH,
    });

    expect(() => guard.canActivate(ctx as never)).toThrow(
      UnauthorizedException,
    );
  });
});
