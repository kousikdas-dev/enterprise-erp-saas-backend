export interface TopNavChild {
  label: string;
  route: string;
}

/** A Configuration-menu entry. `route` is omitted for items not built yet, which renders as disabled. */
export interface TopNavConfigItem {
  label: string;
  route?: string;
}

/** A labeled sub-section inside a dropdown group (e.g. Odoo-style "Planning ▾" split into "Work Orders" / "Employees" / "MPS"). */
export interface TopNavDropdownSection {
  header: string;
  items: TopNavConfigItem[];
}

/** A named dropdown group in the secondary nav strip (e.g. Odoo-style "Operations ▾"). Items without a `route` show as disabled placeholders, same as TopNavConfigItem.
 *  Use `items` for a flat list, or `sections` to group items under headers; `sections` takes precedence when both would apply. */
export interface TopNavDropdownGroup {
  label: string;
  items?: TopNavConfigItem[];
  sections?: TopNavDropdownSection[];
}

export interface TopNavItem {
  id: string;
  label: string;
  /** Default page for this module (used by the Dashboard app tile and the header link target). */
  route: string;
  /** pe-7s-* icon class shown on the Dashboard tile and the header module badge. */
  icon: string;
  /** One of the `bg-*` gradient utility classes (assets/utils/_backgrounds.scss). */
  bgClass: string;
  /** Optional image path that replaces `icon`/`bgClass` in the header module badge only (Dashboard tiles always use icon/bgClass). */
  headerBadgeImage?: string;
  children?: TopNavChild[];
  /** Named dropdown groups rendered between `children` and `configItems` (e.g. Odoo-style "Operations ▾", "Planning ▾"). */
  dropdownGroups?: TopNavDropdownGroup[];
  /** Module-specific "Configuration" dropdown, rendered at the end of the secondary nav strip. Items without a `route` show as disabled placeholders. */
  configItems?: TopNavConfigItem[];
}

/** Module id -> label/icon/children, shared by the Dashboard app grid, the
 *  header's module badge and the inline module tabs. */
export const NAV_ITEMS: TopNavItem[] = [
  { id: 'dashboardMenu', label: 'Dashboard', route: '/dashboard', icon: 'pe-7s-rocket', bgClass: 'bg-tempting-azure' },
  {
    id: 'salesMenu', label: 'Sales', route: '/sales', icon: 'pe-7s-cart', bgClass: 'bg-happy-fisher',
    headerBadgeImage: 'assets/images/modules/sales.png',
    children: [
      { label: 'Overview', route: '/sales/overview' },
      { label: 'Customers', route: '/sales/customers' },
      { label: 'Quotations', route: '/sales/quotations' },
      { label: 'Proforma Invoices', route: '/sales/proforma-invoices' },
      { label: 'Sales Orders', route: '/sales/sales-orders' },
      { label: 'Shipments', route: '/sales/shipments' },
      { label: 'Sales Invoices', route: '/sales/sales-invoices' },
      { label: 'Sales Returns', route: '/sales/sales-returns' },
      { label: 'Accounts Receivable', route: '/sales/accounts-receivable' },
    ],
    configItems: [
      { label: 'Sales Settings', route: '/sales/settings' },
      { label: 'Pricelists', route: '/sales/pricelists' },
      { label: 'Payment Terms' },
      { label: 'Delivery Methods', route: '/sales/delivery-methods' },
      { label: 'Document Templates' },
    ]
  },
  {
    id: 'purchaseMenu', label: 'Purchase', route: '/purchase', icon: 'pe-7s-shopbag', bgClass: 'bg-arielle-smile', children: [
      { label: 'Overview', route: '/purchase/overview' },
      { label: 'Suppliers', route: '/purchase/suppliers' },
      { label: 'Purchase Orders', route: '/purchase/purchase-orders' },
      { label: 'Goods Receipts', route: '/purchase/goods-receipts' },
      { label: 'Purchase Invoices', route: '/purchase/purchase-invoices' },
      { label: 'Purchase Returns', route: '/purchase/purchase-returns' },
      { label: 'Accounts Payable', route: '/purchase/accounts-payable' },
    ],
    configItems: [
      { label: 'Purchase Settings', route: '/purchase/settings' },
      { label: 'Payment Terms' },
      { label: 'Approval Workflows' },
    ]
  },
  {
    id: 'inventoryMenu', label: 'Inventory', route: '/inventory', icon: 'pe-7s-box2', bgClass: 'bg-malibu-beach', children: [
      { label: 'Overview', route: '/inventory/overview' },
      { label: 'Products', route: '/inventory/products' },
      { label: 'Stock', route: '/inventory/stock' },
      { label: 'Stock Movements', route: '/inventory/stock-movements' },
      { label: 'Opening Stock', route: '/inventory/opening-stock' },
    ],
    configItems: [
      { label: 'Attributes', route: '/inventory/attributes' },
      { label: 'Categories', route: '/inventory/categories' },
      { label: 'Units', route: '/inventory/units' },
      { label: 'UNSPSC Categories', route: '/inventory/unspsc-categories' },
      { label: 'Warehouses', route: '/inventory/warehouses' },
      { label: 'Inventory Settings', route: '/inventory/settings' },
    ]
  },
  {
    id: 'productionMenu', label: 'Production', route: '/production', icon: 'pe-7s-tools', bgClass: 'bg-mean-fruit', children: [
      { label: 'Overview', route: '/production/overview' },
    ],
    dropdownGroups: [
      {
        label: 'Operations', items: [
          { label: 'Manufacturing Orders', route: '/production/production-orders' },
          { label: 'Work Orders', route: '/production/work-orders' },
          { label: 'Unbuild Orders' },
          { label: 'Scrap' },
        ]
      },
      {
        label: 'Planning', sections: [
          {
            header: 'Work Orders', items: [
              { label: 'Planning', route: '/production/work-orders/planning' },
              { label: 'Kanban', route: '/production/work-orders/kanban' },
            ]
          },
          {
            header: 'Employees', items: [
              { label: 'Planning' },
            ]
          },
          {
            header: 'MPS', items: [
              { label: 'Master Production Schedule' },
            ]
          },
        ]
      },
      {
        label: 'Products', items: [
          { label: 'Products', route: '/inventory/products' },
          { label: 'Bills of Materials', route: '/production/boms' },
          { label: 'Routings', route: '/production/routings' },
          { label: 'Lots/Serial Numbers' },
        ]
      },
      {
        label: 'Reporting', items: [
          { label: 'Work Orders' },
          { label: 'Overall Equipment Effectiveness' },
          { label: 'Production Analysis' },
        ]
      },
    ],
    configItems: [
      { label: 'Settings' },
      { label: 'Work Centres', route: '/production/work-centres' },
      { label: 'Operations', route: '/production/operations' },
    ]
  },
  {
    id: 'accountingMenu', label: 'Accounting', route: '/accounting', icon: 'pe-7s-wallet', bgClass: 'bg-plum-plate', children: [
      { label: 'Overview', route: '/accounting/overview' },
      { label: 'Chart of Accounts', route: '/accounting/accounts' },
      { label: 'Journal Entries', route: '/accounting/journal-entries' },
      { label: 'Trial Balance', route: '/accounting/reports/trial-balance' },
      { label: 'Profit & Loss', route: '/accounting/reports/profit-loss' },
      { label: 'Balance Sheet', route: '/accounting/reports/balance-sheet' },
    ],
    configItems: [
      { label: 'Accounting Settings', route: '/accounting/settings' },
      { label: 'Tax Master', route: '/accounting/tax-codes' },
      { label: 'Account Mappings', route: '/accounting/account-mappings' },
    ]
  },
  {
    id: 'adminMenu', label: 'Administration', route: '/admin', icon: 'pe-7s-users', bgClass: 'bg-ripe-malin', children: [
      { label: 'Users', route: '/admin/users' },
      { label: 'Roles', route: '/admin/roles' },
      { label: 'Permissions', route: '/admin/permissions' },
    ],
    configItems: [
      { label: 'Tenant Settings' },
      { label: 'Email Settings' },
      { label: 'System Preferences' },
    ]
  },
  {
    id: 'auditMenu', label: 'Audit Logs', route: '/audit', icon: 'pe-7s-next-2', bgClass: 'bg-night-fade',
    configItems: [
      { label: 'Retention Policy' },
      { label: 'Export Settings' },
    ]
  },
];
