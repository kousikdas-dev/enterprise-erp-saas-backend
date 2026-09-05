/**
 * Backend permission keys (must match Identity / Gateway exactly).
 *
 * NOTE: There is currently no public Gateway endpoint that returns the
 * authenticated user's permission keys. Gateway resolves permissions via
 * Identity internal RBAC (`POST /api/v1/internal/rbac/permissions`), which
 * must never be called from the browser.
 *
 * Until a public source (e.g. expanded GET /v1/auth/me) exists:
 * - PermissionService.enforcementEnabled remains false
 * - UI permission checks are soft / no-op (always allow)
 * - Backend remains the authoritative security boundary
 */
export const AppPermissions = {
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_UPDATE: 'customers.update',
  QUOTATIONS_CREATE: 'quotations.create',
  QUOTATIONS_READ: 'quotations.read',
  QUOTATIONS_UPDATE: 'quotations.update',
  QUOTATIONS_SEND: 'quotations.send',
  QUOTATIONS_ACCEPT: 'quotations.accept',
  QUOTATIONS_REJECT: 'quotations.reject',
  QUOTATIONS_CANCEL: 'quotations.cancel',
  PROFORMA_INVOICES_CREATE: 'proforma-invoices.create',
  PROFORMA_INVOICES_READ: 'proforma-invoices.read',
  PROFORMA_INVOICES_UPDATE: 'proforma-invoices.update',
  PROFORMA_INVOICES_SEND: 'proforma-invoices.send',
  PROFORMA_INVOICES_CANCEL: 'proforma-invoices.cancel',
  SALES_ORDERS_CREATE: 'sales-orders.create',
  SALES_ORDERS_READ: 'sales-orders.read',
  SALES_ORDERS_UPDATE: 'sales-orders.update',
  SALES_ORDERS_CONFIRM: 'sales-orders.confirm',
  SALES_ORDERS_CANCEL: 'sales-orders.cancel',
  SALES_INVOICES_CREATE: 'sales-invoices.create',
  SALES_INVOICES_READ: 'sales-invoices.read',
  SALES_INVOICES_UPDATE: 'sales-invoices.update',
  SALES_INVOICES_SEND: 'sales-invoices.send',
  SALES_INVOICES_CANCEL: 'sales-invoices.cancel',
  SHIPMENTS_CREATE: 'shipments.create',
  SHIPMENTS_READ: 'shipments.read',
  SHIPMENTS_POST: 'shipments.post',
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
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_STATUS: 'users.status',
  USERS_ROLES: 'users.roles',
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_PERMISSIONS: 'roles.permissions',
  PERMISSIONS_READ: 'permissions.read',
  ACCOUNTS_CREATE: 'accounts.create',
  ACCOUNTS_READ: 'accounts.read',
  ACCOUNTS_UPDATE: 'accounts.update',
} as const;

export type AppPermission =
  (typeof AppPermissions)[keyof typeof AppPermissions];
