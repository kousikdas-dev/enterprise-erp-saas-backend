export const PERMISSIONS = {
  TENANTS_READ: 'tenants.read',
  TENANTS_CREATE: 'tenants.create',
  TENANTS_UPDATE: 'tenants.update',
  TENANTS_STATUS: 'tenants.status',
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_STATUS: 'users.status',
  USERS_ROLES: 'users.roles',
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_STATUS: 'roles.status',
  ROLES_PERMISSIONS: 'roles.permissions',
  PERMISSIONS_READ: 'permissions.read',
  RBAC_TEST: 'rbac.test',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function permissionKey(resource: string, action: string): string {
  return `${resource}.${action}`;
}

export function hasAllPermissions(
  owned: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0) {
    return true;
  }
  const granted = new Set(owned);
  return required.every((permission) => granted.has(permission));
}
