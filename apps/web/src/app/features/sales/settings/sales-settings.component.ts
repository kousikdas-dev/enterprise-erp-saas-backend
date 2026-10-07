import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  DEFAULT_SALES_SETTINGS,
  InvoicingPolicy,
} from './sales-settings.model';
import { SalesSettingsService } from './sales-settings.service';

@Component({
  selector: 'app-sales-settings',
  templateUrl: './sales-settings.component.html',
  styleUrls: ['./sales-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SalesSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SalesSettingsService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = false;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    enableDiscounts: [DEFAULT_SALES_SETTINGS.enableDiscounts],
    enablePromotions: [DEFAULT_SALES_SETTINGS.enablePromotions],
    enablePricelists: [DEFAULT_SALES_SETTINGS.enablePricelists],
    enableMargins: [DEFAULT_SALES_SETTINGS.enableMargins],
    enableVariants: [DEFAULT_SALES_SETTINGS.enableVariants],
    enableUnitsOfMeasure: [DEFAULT_SALES_SETTINGS.enableUnitsOfMeasure],
    defaultQuotationValidityDays: [
      DEFAULT_SALES_SETTINGS.defaultQuotationValidityDays,
      [Validators.required, Validators.min(1), Validators.max(365)],
    ],
    autoExpireQuotations: [DEFAULT_SALES_SETTINGS.autoExpireQuotations],
    enableOnlineSignature: [DEFAULT_SALES_SETTINGS.enableOnlineSignature],
    enableOnlinePayment: [DEFAULT_SALES_SETTINGS.enableOnlinePayment],
    onlinePaymentPercent: [
      DEFAULT_SALES_SETTINGS.onlinePaymentPercent,
      [Validators.required, Validators.min(1), Validators.max(100)],
    ],
    enableSaleWarnings: [DEFAULT_SALES_SETTINGS.enableSaleWarnings],
    enablePdfQuoteBuilder: [DEFAULT_SALES_SETTINGS.enablePdfQuoteBuilder],
    enableDisplayProductImages: [
      DEFAULT_SALES_SETTINGS.enableDisplayProductImages,
    ],
    lockConfirmedSales: [DEFAULT_SALES_SETTINGS.lockConfirmedSales],
    enableProformaInvoice: [DEFAULT_SALES_SETTINGS.enableProformaInvoice],
    enableDeliveryMethods: [DEFAULT_SALES_SETTINGS.enableDeliveryMethods],
    requireDeliveryDateOnOrders: [
      DEFAULT_SALES_SETTINGS.requireDeliveryDateOnOrders,
    ],
    allowPartialShipments: [DEFAULT_SALES_SETTINGS.allowPartialShipments],
    defaultInvoiceDueDays: [
      DEFAULT_SALES_SETTINGS.defaultInvoiceDueDays,
      [Validators.required, Validators.min(0), Validators.max(365)],
    ],
    autoSendInvoiceEmails: [DEFAULT_SALES_SETTINGS.autoSendInvoiceEmails],
    invoicingPolicy: [
      DEFAULT_SALES_SETTINGS.invoicingPolicy as InvoicingPolicy,
    ],
    enableAutomaticInvoicing: [
      DEFAULT_SALES_SETTINGS.enableAutomaticInvoicing,
    ],
    enableCommissions: [DEFAULT_SALES_SETTINGS.enableCommissions],
    enableServicesAndMaterials: [
      DEFAULT_SALES_SETTINGS.enableServicesAndMaterials,
    ],
    consolidateSubscriptionsBilling: [
      DEFAULT_SALES_SETTINGS.consolidateSubscriptionsBilling,
    ],
    maxDiscountPercentWithoutApproval: [
      DEFAULT_SALES_SETTINGS.maxDiscountPercentWithoutApproval,
      [Validators.required, Validators.min(0), Validators.max(100)],
    ],
    requireApprovalAboveDiscountLimit: [
      DEFAULT_SALES_SETTINGS.requireApprovalAboveDiscountLimit,
    ],
    requireReasonForReturns: [DEFAULT_SALES_SETTINGS.requireReasonForReturns],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.cdr.detectChanges();
    this.settingsService.get().subscribe((settings) => {
      this.form.reset(settings);
      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.cdr.detectChanges();
      return;
    }
    this.saving = true;
    this.cdr.detectChanges();
    this.settingsService.update(this.form.getRawValue()).subscribe(() => {
      this.saving = false;
      this.toast.success('Sales settings saved');
      this.cdr.detectChanges();
    });
  }

  discard(): void {
    this.load();
  }
}
