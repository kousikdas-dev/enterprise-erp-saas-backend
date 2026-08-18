export const PERMISSION_RESOLVER = Symbol('PERMISSION_RESOLVER');

export interface PermissionResolver {
  getPermissionKeys(userId: string, tenantId: string): Promise<string[]>;
}
