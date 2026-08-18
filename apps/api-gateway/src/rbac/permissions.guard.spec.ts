import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const user: AuthenticatedUser = {
    userId: 'user-1',
    tenantId: 'tenant-a',
  };

  function createContext(request: {
    user?: AuthenticatedUser;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, string>;
  }): ExecutionContext {
    return {
      getHandler: () => Function,
      getClass: () => class TestClass {},
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('allows when the authenticated user has the required permission', async () => {
    const getPermissionKeys = jest.fn().mockResolvedValue(['rbac.test']);
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['rbac.test']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, { getPermissionKeys });

    await expect(guard.canActivate(createContext({ user }))).resolves.toBe(
      true,
    );
    expect(getPermissionKeys).toHaveBeenCalledWith(user.userId, user.tenantId);
  });

  it('returns 403 when the permission is missing', async () => {
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(['rbac.test']),
      } as unknown as Reflector,
      { getPermissionKeys: jest.fn().mockResolvedValue(['users.read']) },
    );

    await expect(
      guard.canActivate(createContext({ user })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 401 when there is no authenticated user context', async () => {
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(['rbac.test']),
      } as unknown as Reflector,
      { getPermissionKeys: jest.fn() },
    );

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses JWT tenantId and ignores tenant from headers, query, and body', async () => {
    const getPermissionKeys = jest.fn().mockResolvedValue(['rbac.test']);
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(['rbac.test']),
      } as unknown as Reflector,
      { getPermissionKeys },
    );

    await guard.canActivate(
      createContext({
        user,
        headers: { 'x-tenant-id': 'tenant-b' },
        query: { tenantId: 'tenant-b' },
        body: { tenantId: 'tenant-b' },
      }),
    );

    expect(getPermissionKeys).toHaveBeenCalledTimes(1);
    expect(getPermissionKeys).toHaveBeenCalledWith('user-1', 'tenant-a');
    expect(getPermissionKeys).not.toHaveBeenCalledWith('user-1', 'tenant-b');
  });
});
