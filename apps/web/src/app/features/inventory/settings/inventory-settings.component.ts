import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ToastService } from '../../../shared/toast/toast.service';
import { DEFAULT_INVENTORY_SETTINGS } from './inventory-settings.model';
import { InventorySettingsService } from './inventory-settings.service';

@Component({
  selector: 'app-inventory-settings',
  templateUrl: './inventory-settings.component.html',
  styleUrls: ['./inventory-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class InventorySettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(InventorySettingsService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = false;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    enablePackages: [DEFAULT_INVENTORY_SETTINGS.enablePackages],
    enableBatchWaveClusterTransfers: [
      DEFAULT_INVENTORY_SETTINGS.enableBatchWaveClusterTransfers,
    ],
    enablePartnerSpecificInstructions: [
      DEFAULT_INVENTORY_SETTINGS.enablePartnerSpecificInstructions,
    ],
    shippingPolicy: [DEFAULT_INVENTORY_SETTINGS.shippingPolicy],
    enableQuality: [DEFAULT_INVENTORY_SETTINGS.enableQuality],
    enableQualityWorksheet: [
      DEFAULT_INVENTORY_SETTINGS.enableQualityWorksheet,
    ],
    enableSpontaneousReturns: [
      DEFAULT_INVENTORY_SETTINGS.enableSpontaneousReturns,
    ],
    annualInventoryMonth: [
      DEFAULT_INVENTORY_SETTINGS.annualInventoryMonth,
      [Validators.required, Validators.min(1), Validators.max(12)],
    ],
    annualInventoryDay: [
      DEFAULT_INVENTORY_SETTINGS.annualInventoryDay,
      [Validators.required, Validators.min(1), Validators.max(31)],
    ],

    enableBarcodeScanner: [DEFAULT_INVENTORY_SETTINGS.enableBarcodeScanner],
    barcodeNomenclature: [DEFAULT_INVENTORY_SETTINGS.barcodeNomenclature],
    enableStockBarcodeDatabase: [
      DEFAULT_INVENTORY_SETTINGS.enableStockBarcodeDatabase,
    ],

    enableDeliveryMethods: [DEFAULT_INVENTORY_SETTINGS.enableDeliveryMethods],
    enableTransportManagement: [
      DEFAULT_INVENTORY_SETTINGS.enableTransportManagement,
    ],
    enableConfirmationEmail: [
      DEFAULT_INVENTORY_SETTINGS.enableConfirmationEmail,
    ],
    enableTextConfirmation: [
      DEFAULT_INVENTORY_SETTINGS.enableTextConfirmation,
    ],
    requireSignatureOnDeliveryOrders: [
      DEFAULT_INVENTORY_SETTINGS.requireSignatureOnDeliveryOrders,
    ],

    enableVariants: [DEFAULT_INVENTORY_SETTINGS.enableVariants],
    enableUnitsOfMeasure: [DEFAULT_INVENTORY_SETTINGS.enableUnitsOfMeasure],

    enableLotsAndSerialNumbers: [
      DEFAULT_INVENTORY_SETTINGS.enableLotsAndSerialNumbers,
    ],
    printGs1BarcodesForLots: [
      DEFAULT_INVENTORY_SETTINGS.printGs1BarcodesForLots,
    ],
    scannablePackageContentsSeparator: [
      DEFAULT_INVENTORY_SETTINGS.scannablePackageContentsSeparator,
    ],
    enableExpirationDates: [DEFAULT_INVENTORY_SETTINGS.enableExpirationDates],
    displayLotsSerialNumbersOnDeliverySlips: [
      DEFAULT_INVENTORY_SETTINGS.displayLotsSerialNumbersOnDeliverySlips,
    ],
    enableConsignment: [DEFAULT_INVENTORY_SETTINGS.enableConsignment],

    enableLandedCosts: [DEFAULT_INVENTORY_SETTINGS.enableLandedCosts],
    landedCostsDefaultJournal: [
      DEFAULT_INVENTORY_SETTINGS.landedCostsDefaultJournal,
    ],
    displayLotsSerialNumbersOnInvoices: [
      DEFAULT_INVENTORY_SETTINGS.displayLotsSerialNumbersOnInvoices,
    ],

    enableStorageLocations: [
      DEFAULT_INVENTORY_SETTINGS.enableStorageLocations,
    ],
    enableMultiStepRoutes: [DEFAULT_INVENTORY_SETTINGS.enableMultiStepRoutes],

    replenishmentHorizonDays: [
      DEFAULT_INVENTORY_SETTINGS.replenishmentHorizonDays,
      [Validators.required, Validators.min(0)],
    ],
    enableSecurityLeadTimeForSales: [
      DEFAULT_INVENTORY_SETTINGS.enableSecurityLeadTimeForSales,
    ],
    daysToPurchase: [
      DEFAULT_INVENTORY_SETTINGS.daysToPurchase,
      [Validators.required, Validators.min(0)],
    ],

    enableDropshipping: [DEFAULT_INVENTORY_SETTINGS.enableDropshipping],
    enableReplenishOnOrder: [
      DEFAULT_INVENTORY_SETTINGS.enableReplenishOnOrder,
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
      this.toast.success('Inventory settings saved');
      this.cdr.detectChanges();
    });
  }

  discard(): void {
    this.load();
  }
}
