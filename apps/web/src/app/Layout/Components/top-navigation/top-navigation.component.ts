import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

interface TopNavChild {
  label: string;
  route: string;
}

interface TopNavItem {
  id: string;
  label: string;
  route?: string;
  children?: TopNavChild[];
}

@Component({
  selector: 'app-top-navigation',
  templateUrl: './top-navigation.component.html',
  styleUrls: ['./top-navigation.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class TopNavigationComponent implements OnInit, OnDestroy {
  public activeModule: string | undefined;
  public openModule: string | undefined;

  public readonly items: TopNavItem[] = [
    { id: 'dashboardMenu', label: 'Dashboard', route: '/dashboard' },
    {
      id: 'salesMenu', label: 'Sales', children: [
        { label: 'Customers', route: '/sales/customers' },
        { label: 'Quotations', route: '/sales/quotations' },
        { label: 'Proforma Invoices', route: '/sales/proforma-invoices' },
        { label: 'Sales Invoices', route: '/sales/sales-invoices' },
        { label: 'Sales Orders', route: '/sales/sales-orders' },
        { label: 'Shipments', route: '/sales/shipments' },
      ]
    },
    {
      id: 'purchaseMenu', label: 'Purchase', children: [
        { label: 'Suppliers', route: '/purchase/suppliers' },
        { label: 'Purchase Orders', route: '/purchase/purchase-orders' },
        { label: 'Goods Receipts', route: '/purchase/goods-receipts' },
      ]
    },
    {
      id: 'inventoryMenu', label: 'Inventory', children: [
        { label: 'Products', route: '/inventory/products' },
        { label: 'Categories', route: '/inventory/categories' },
        { label: 'Units', route: '/inventory/units' },
        { label: 'Warehouses', route: '/inventory/warehouses' },
        { label: 'Stock', route: '/inventory/stock' },
        { label: 'Stock Movements', route: '/inventory/stock-movements' },
      ]
    },
    {
      id: 'adminMenu', label: 'Administration', children: [
        { label: 'Users', route: '/admin/users' },
        { label: 'Roles', route: '/admin/roles' },
        { label: 'Permissions', route: '/admin/permissions' },
      ]
    },
    { id: 'auditMenu', label: 'Audit Logs', route: '/audit' },
  ];

  private routeSub?: Subscription;

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.syncFromRoute();
    this.routeSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.syncFromRoute());
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  get openItem(): TopNavItem | undefined {
    return this.items.find((item) => item.id === this.openModule);
  }

  onItemClick(item: TopNavItem): void {
    if (!item.children) {
      return;
    }
    this.openModule = this.openModule === item.id ? undefined : item.id;
  }

  private syncFromRoute(): void {
    this.activeModule = this.findExtraParameter(this.activatedRoute);
    const activeItem = this.items.find((item) => item.id === this.activeModule);
    this.openModule = activeItem?.children ? this.activeModule : undefined;
  }

  private findExtraParameter(route: ActivatedRoute): string | undefined {
    let current: ActivatedRoute | null = route;
    let found: string | undefined;
    while (current) {
      const value = current.snapshot.data['extraParameter'];
      if (typeof value === 'string' && value.length > 0) {
        found = value;
      }
      current = current.firstChild;
    }
    return found;
  }
}
