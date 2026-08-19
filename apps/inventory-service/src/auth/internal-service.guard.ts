import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INTERNAL_SERVICE_SECRET_HEADER } from '@app/common';
import { InventoryEnvironmentVariables } from '../config/inventory-env';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<InventoryEnvironmentVariables, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const provided = headerValue(
      request.headers[INTERNAL_SERVICE_SECRET_HEADER],
    );
    const expected = this.config.get('INTERNAL_SERVICE_SECRET', {
      infer: true,
    });
    if (!provided || !secretsEqual(provided, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? '';
  }
  return value?.trim() ?? '';
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
