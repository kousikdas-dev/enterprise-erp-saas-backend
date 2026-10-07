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
  BillControlPolicy,
  DEFAULT_PURCHASE_SETTINGS,
} from './purchase-settings.model';
import { PurchaseSettingsService } from './purchase-settings.service';

@Component({
  selector: 'app-purchase-settings',
  templateUrl: './purchase-settings.component.html',
  styleUrls: ['./purchase-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PurchaseSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(PurchaseSettingsService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = false;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    enableVariants: [DEFAULT_PURCHASE_SETTINGS.enableVariants],
    enableUnitsOfMeasure: [DEFAULT_PURCHASE_SETTINGS.enableUnitsOfMeasure],
    enableDiscounts: [DEFAULT_PURCHASE_SETTINGS.enableDiscounts],
    enableVendorPricelists: [DEFAULT_PURCHASE_SETTINGS.enableVendorPricelists],
    enablePurchaseOrderApproval: [
      DEFAULT_PURCHASE_SETTINGS.enablePurchaseOrderApproval,
    ],
    purchaseOrderApprovalMinAmount: [
      DEFAULT_PURCHASE_SETTINGS.purchaseOrderApprovalMinAmount,
      [Validators.required, Validators.min(0)],
    ],
    lockConfirmedOrders: [DEFAULT_PURCHASE_SETTINGS.lockConfirmedOrders],
    enablePurchaseWarnings: [DEFAULT_PURCHASE_SETTINGS.enablePurchaseWarnings],
    enablePurchaseAgreements: [
      DEFAULT_PURCHASE_SETTINGS.enablePurchaseAgreements,
    ],
    enableReceiptReminder: [DEFAULT_PURCHASE_SETTINGS.enableReceiptReminder],
    receiptReminderDaysBefore: [
      DEFAULT_PURCHASE_SETTINGS.receiptReminderDaysBefore,
      [Validators.required, Validators.min(0), Validators.max(30)],
    ],
    enablePurchaseAlternative: [
      DEFAULT_PURCHASE_SETTINGS.enablePurchaseAlternative,
    ],
    requireReceiptDateOnOrders: [
      DEFAULT_PURCHASE_SETTINGS.requireReceiptDateOnOrders,
    ],
    allowPartialReceipts: [DEFAULT_PURCHASE_SETTINGS.allowPartialReceipts],
    defaultBillDueDays: [
      DEFAULT_PURCHASE_SETTINGS.defaultBillDueDays,
      [Validators.required, Validators.min(0), Validators.max(365)],
    ],
    billControlPolicy: [
      DEFAULT_PURCHASE_SETTINGS.billControlPolicy as BillControlPolicy,
    ],
    enable3WayMatching: [DEFAULT_PURCHASE_SETTINGS.enable3WayMatching],
    maxDiscountPercentWithoutApproval: [
      DEFAULT_PURCHASE_SETTINGS.maxDiscountPercentWithoutApproval,
      [Validators.required, Validators.min(0), Validators.max(100)],
    ],
    requireApprovalAboveDiscountLimit: [
      DEFAULT_PURCHASE_SETTINGS.requireApprovalAboveDiscountLimit,
    ],
    requireReasonForReturns: [
      DEFAULT_PURCHASE_SETTINGS.requireReasonForReturns,
    ],
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
      this.toast.success('Purchase settings saved');
      this.cdr.detectChanges();
    });
  }

  discard(): void {
    this.load();
  }
}
