import { hasAllPermissions, PERMISSIONS, permissionKey } from './permissions';

describe('permission helpers', () => {
  it('formats resource and action as resource.action', () => {
    expect(permissionKey('users', 'read')).toBe('users.read');
    expect(permissionKey('rbac', 'test')).toBe('rbac.test');
    expect(PERMISSIONS.ROLES_PERMISSIONS).toBe('roles.permissions');
    expect(PERMISSIONS.USERS_ROLES).toBe('users.roles');
    expect(PERMISSIONS.PERMISSIONS_READ).toBe('permissions.read');
    expect(PERMISSIONS.PRODUCTS_CREATE).toBe('products.create');
    expect(PERMISSIONS.STOCK_ADJUST).toBe('stock.adjust');
    expect(PERMISSIONS.STOCK_MOVEMENTS_READ).toBe('stock.movements.read');
  });

  it('allows when all required permissions are owned', () => {
    expect(hasAllPermissions(['users.read', 'rbac.test'], ['rbac.test'])).toBe(
      true,
    );
  });

  it('denies when a required permission is missing', () => {
    expect(hasAllPermissions(['users.read'], ['rbac.test'])).toBe(false);
  });
});
