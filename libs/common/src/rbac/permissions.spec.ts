import { hasAllPermissions, PERMISSIONS, permissionKey } from './permissions';

describe('permission helpers', () => {
  it('formats resource and action as resource.action', () => {
    expect(permissionKey('users', 'read')).toBe('users.read');
    expect(permissionKey('rbac', 'test')).toBe('rbac.test');
    expect(PERMISSIONS.USERS_CREATE).toBe('users.create');
    expect(PERMISSIONS.TENANTS_READ).toBe('tenants.read');
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
