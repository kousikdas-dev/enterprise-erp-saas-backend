import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAllPermissions } from '@app/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { PERMISSION_RESOLVER, PermissionResolver } from './permission-resolver';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PERMISSION_RESOLVER)
    private readonly permissions: PermissionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    const user = request.user;
    if (!user?.userId || !user.tenantId) {
      throw new UnauthorizedException();
    }

    const owned = await this.permissions.getPermissionKeys(
      user.userId,
      user.tenantId,
    );
    if (!hasAllPermissions(owned, required)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
