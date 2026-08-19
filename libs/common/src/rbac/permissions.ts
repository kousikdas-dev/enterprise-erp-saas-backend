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
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_READ: 'products.read',
  PRODUCTS_UPDATE: 'products.update',
  CATEGORIES_CREATE: 'categories.create',
  CATEGORIES_READ: 'categories.read',
  CATEGORIES_UPDATE: 'categories.update',
  UNITS_CREATE: 'units.create',
  UNITS_READ: 'units.read',
  UNITS_UPDATE: 'units.update',
  WAREHOUSES_CREATE: 'warehouses.create',
  WAREHOUSES_READ: 'warehouses.read',
  WAREHOUSES_UPDATE: 'warehouses.update',
  STOCK_READ: 'stock.read',
  STOCK_ADJUST: 'stock.adjust',
  STOCK_MOVEMENTS_READ: 'stock.movements.read',
  SUPPLIERS_CREATE: 'suppliers.create',
  SUPPLIERS_READ: 'suppliers.read',
  SUPPLIERS_UPDATE: 'suppliers.update',
  PURCHASE_ORDERS_CREATE: 'purchase-orders.create',
  PURCHASE_ORDERS_READ: 'purchase-orders.read',
  PURCHASE_ORDERS_UPDATE: 'purchase-orders.update',
  PURCHASE_ORDERS_CONFIRM: 'purchase-orders.confirm',
  PURCHASE_ORDERS_CANCEL: 'purchase-orders.cancel',
  GOODS_RECEIPTS_CREATE: 'goods-receipts.create',
  GOODS_RECEIPTS_READ: 'goods-receipts.read',
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
