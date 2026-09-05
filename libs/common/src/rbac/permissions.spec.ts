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
    expect(PERMISSIONS.SUPPLIERS_CREATE).toBe('suppliers.create');
    expect(PERMISSIONS.PURCHASE_ORDERS_CONFIRM).toBe('purchase-orders.confirm');
    expect(PERMISSIONS.GOODS_RECEIPTS_CREATE).toBe('goods-receipts.create');
    expect(PERMISSIONS.CUSTOMERS_CREATE).toBe('customers.create');
    expect(PERMISSIONS.QUOTATIONS_ACCEPT).toBe('quotations.accept');
    expect(PERMISSIONS.PROFORMA_INVOICES_CREATE).toBe('proforma-invoices.create');
    expect(PERMISSIONS.PROFORMA_INVOICES_UPDATE).toBe('proforma-invoices.update');
    expect(PERMISSIONS.PROFORMA_INVOICES_SEND).toBe('proforma-invoices.send');
    expect(PERMISSIONS.PROFORMA_INVOICES_CANCEL).toBe('proforma-invoices.cancel');
    expect(PERMISSIONS.SALES_ORDERS_CONFIRM).toBe('sales-orders.confirm');
    expect(PERMISSIONS.SALES_INVOICES_CREATE).toBe('sales-invoices.create');
    expect(PERMISSIONS.SALES_INVOICES_SEND).toBe('sales-invoices.send');
    expect(PERMISSIONS.SALES_INVOICES_CANCEL).toBe('sales-invoices.cancel');
    expect(PERMISSIONS.SHIPMENTS_POST).toBe('shipments.post');
    expect(PERMISSIONS.ACCOUNTS_CREATE).toBe('accounts.create');
    expect(PERMISSIONS.ACCOUNTS_UPDATE).toBe('accounts.update');
    expect(PERMISSIONS.JOURNAL_ENTRIES_CREATE).toBe('journal-entries.create');
    expect(PERMISSIONS.JOURNAL_ENTRIES_POST).toBe('journal-entries.post');
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
