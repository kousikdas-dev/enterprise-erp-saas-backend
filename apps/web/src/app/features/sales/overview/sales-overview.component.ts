import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { CustomerService } from '../customers/customer.service';
import { QuotationService } from '../quotations/quotation.service';
import { SalesOrderService } from '../sales-orders/sales-order.service';
import { ShipmentService } from '../shipments/shipment.service';
import { SalesInvoiceService } from '../sales-invoices/sales-invoice.service';

const OPEN_QUOTATION_STATUSES = new Set(['DRAFT', 'SENT']);
const OPEN_SALES_ORDER_STATUSES = new Set(['CONFIRMED', 'PARTIALLY_FULFILLED']);

@Component({
  selector: 'app-sales-overview',
  templateUrl: './sales-overview.component.html',
  styleUrls: ['./sales-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SalesOverviewComponent implements OnInit {
  private readonly customerService = inject(CustomerService);
  private readonly quotationService = inject(QuotationService);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly shipmentService = inject(ShipmentService);
  private readonly salesInvoiceService = inject(SalesInvoiceService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canReadCustomers = this.permissions.has(AppPermissions.CUSTOMERS_READ);
  readonly canReadQuotations = this.permissions.has(AppPermissions.QUOTATIONS_READ);
  readonly canReadSalesOrders = this.permissions.has(AppPermissions.SALES_ORDERS_READ);
  readonly canReadShipments = this.permissions.has(AppPermissions.SHIPMENTS_READ);
  readonly canReadSalesInvoices = this.permissions.has(
    AppPermissions.SALES_INVOICES_READ,
  );

  loading = false;
  error: string | null = null;

  customersCount = 0;
  openQuotationsCount = 0;
  openSalesOrdersCount = 0;
  pendingShipmentsCount = 0;
  unpaidSalesInvoicesCount = 0;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    forkJoin({
      customers: this.canReadCustomers
        ? this.customerService.list()
        : of({ items: [] }),
      quotations: this.canReadQuotations
        ? this.quotationService.list()
        : of({ items: [] }),
      salesOrders: this.canReadSalesOrders
        ? this.salesOrderService.list()
        : of({ items: [] }),
      shipments: this.canReadShipments
        ? this.shipmentService.list()
        : of({ items: [] }),
      salesInvoices: this.canReadSalesInvoices
        ? this.salesInvoiceService.list()
        : of({ items: [] }),
    }).subscribe({
      next: ({ customers, quotations, salesOrders, shipments, salesInvoices }) => {
        this.customersCount = customers.items.length;
        this.openQuotationsCount = quotations.items.filter((q) =>
          OPEN_QUOTATION_STATUSES.has(q.status),
        ).length;
        this.openSalesOrdersCount = salesOrders.items.filter((o) =>
          OPEN_SALES_ORDER_STATUSES.has(o.status),
        ).length;
        this.pendingShipmentsCount = shipments.items.filter(
          (s) => s.status === 'PENDING_STOCK',
        ).length;
        this.unpaidSalesInvoicesCount = salesInvoices.items.filter(
          (i) => i.paymentStatus !== 'PAID' && i.status !== 'CANCELLED',
        ).length;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load sales overview');
        this.cdr.detectChanges();
      },
    });
  }
}
