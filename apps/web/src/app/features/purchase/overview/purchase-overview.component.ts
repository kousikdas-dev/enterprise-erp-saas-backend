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
import { SupplierService } from '../suppliers/supplier.service';
import { PurchaseOrderService } from '../purchase-orders/purchase-order.service';
import { GoodsReceiptService } from '../goods-receipts/goods-receipt.service';
import { PurchaseInvoiceService } from '../purchase-invoices/purchase-invoice.service';

const OPEN_PURCHASE_ORDER_STATUSES = new Set([
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
]);

@Component({
  selector: 'app-purchase-overview',
  templateUrl: './purchase-overview.component.html',
  styleUrls: ['./purchase-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PurchaseOverviewComponent implements OnInit {
  private readonly supplierService = inject(SupplierService);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly goodsReceiptService = inject(GoodsReceiptService);
  private readonly purchaseInvoiceService = inject(PurchaseInvoiceService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canReadSuppliers = this.permissions.has(AppPermissions.SUPPLIERS_READ);
  readonly canReadPurchaseOrders = this.permissions.has(
    AppPermissions.PURCHASE_ORDERS_READ,
  );
  readonly canReadGoodsReceipts = this.permissions.has(
    AppPermissions.GOODS_RECEIPTS_READ,
  );
  readonly canReadPurchaseInvoices = this.permissions.has(
    AppPermissions.PURCHASE_INVOICES_READ,
  );

  loading = false;
  error: string | null = null;

  suppliersCount = 0;
  openPurchaseOrdersCount = 0;
  pendingGoodsReceiptsCount = 0;
  unpaidPurchaseInvoicesCount = 0;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    forkJoin({
      suppliers: this.canReadSuppliers
        ? this.supplierService.list()
        : of({ items: [] }),
      purchaseOrders: this.canReadPurchaseOrders
        ? this.purchaseOrderService.list()
        : of({ items: [] }),
      goodsReceipts: this.canReadGoodsReceipts
        ? this.goodsReceiptService.list()
        : of({ items: [] }),
      purchaseInvoices: this.canReadPurchaseInvoices
        ? this.purchaseInvoiceService.list()
        : of({ items: [] }),
    }).subscribe({
      next: ({ suppliers, purchaseOrders, goodsReceipts, purchaseInvoices }) => {
        this.suppliersCount = suppliers.items.length;
        this.openPurchaseOrdersCount = purchaseOrders.items.filter((o) =>
          OPEN_PURCHASE_ORDER_STATUSES.has(o.status),
        ).length;
        this.pendingGoodsReceiptsCount = goodsReceipts.items.filter(
          (g) => g.status === 'PENDING_STOCK',
        ).length;
        this.unpaidPurchaseInvoicesCount = purchaseInvoices.items.filter(
          (i) => i.paymentStatus !== 'PAID' && i.status !== 'CANCELLED',
        ).length;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load purchase overview');
        this.cdr.detectChanges();
      },
    });
  }
}
