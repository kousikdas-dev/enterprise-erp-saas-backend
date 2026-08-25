import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ACTOR_TENANT_ID_HEADER, ACTOR_USER_ID_HEADER } from '@app/common';
import { ActorContext } from './actor-context';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      actor?: ActorContext;
    }>();

    const userId = headerValue(request.headers[ACTOR_USER_ID_HEADER]);
    const tenantId = headerValue(request.headers[ACTOR_TENANT_ID_HEADER]);

    if (!isUuid(userId) || !isUuid(tenantId)) {
      throw new UnauthorizedException();
    }

    request.actor = { userId, tenantId };
    return true;
  }
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? '';
  }

  return value?.trim() ?? '';
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
