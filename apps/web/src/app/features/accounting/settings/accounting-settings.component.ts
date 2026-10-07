import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { Account, TaxCode } from '../models/accounting.models';
import { AccountService } from '../accounts/account.service';
import { TaxCodeService } from '../tax-codes/tax-code.service';
import { DEFAULT_ACCOUNTING_SETTINGS } from './accounting-settings.model';
import { AccountingSettingsService } from './accounting-settings.service';

@Component({
  selector: 'app-accounting-settings',
  templateUrl: './accounting-settings.component.html',
  styleUrls: ['./accounting-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AccountingSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(AccountingSettingsService);
  private readonly accountsService = inject(AccountService);
  private readonly taxCodesService = inject(TaxCodeService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = false;
  saving = false;
  accounts: Account[] = [];
  taxCodes: TaxCode[] = [];

  readonly form = this.fb.nonNullable.group({
    fiscalLocalizationPackage: [
      DEFAULT_ACCOUNTING_SETTINGS.fiscalLocalizationPackage,
    ],

    defaultSalesTaxCodeId: [DEFAULT_ACCOUNTING_SETTINGS.defaultSalesTaxCodeId],
    defaultPurchaseTaxCodeId: [
      DEFAULT_ACCOUNTING_SETTINGS.defaultPurchaseTaxCodeId,
    ],
    pricesTaxMode: [DEFAULT_ACCOUNTING_SETTINGS.pricesTaxMode],
    roundingMethod: [DEFAULT_ACCOUNTING_SETTINGS.roundingMethod],
    taxReturnPeriodicity: [DEFAULT_ACCOUNTING_SETTINGS.taxReturnPeriodicity],
    taxReturnDeadlineDays: [
      DEFAULT_ACCOUNTING_SETTINGS.taxReturnDeadlineDays,
      [Validators.required, Validators.min(0), Validators.max(365)],
    ],
    taxReturnJournal: [DEFAULT_ACCOUNTING_SETTINGS.taxReturnJournal],
    enableAvaTax: [DEFAULT_ACCOUNTING_SETTINGS.enableAvaTax],
    avaTaxIntegrationMethod: [
      DEFAULT_ACCOUNTING_SETTINGS.avaTaxIntegrationMethod,
    ],
    avaTaxPortalEmail: [DEFAULT_ACCOUNTING_SETTINGS.avaTaxPortalEmail],
    avaTaxUseUpc: [DEFAULT_ACCOUNTING_SETTINGS.avaTaxUseUpc],
    avaTaxAddressValidation: [
      DEFAULT_ACCOUNTING_SETTINGS.avaTaxAddressValidation,
    ],
    verifyVatNumbers: [DEFAULT_ACCOUNTING_SETTINGS.verifyVatNumbers],
    cashBasis: [DEFAULT_ACCOUNTING_SETTINGS.cashBasis],
    fiscalCountry: [DEFAULT_ACCOUNTING_SETTINGS.fiscalCountry],

    mainCurrency: [DEFAULT_ACCOUNTING_SETTINGS.mainCurrency],
    enableAutomaticCurrencyRates: [
      DEFAULT_ACCOUNTING_SETTINGS.enableAutomaticCurrencyRates,
    ],
    currencyRateService: [DEFAULT_ACCOUNTING_SETTINGS.currencyRateService],
    currencyRateInterval: [DEFAULT_ACCOUNTING_SETTINGS.currencyRateInterval],
    currencyRateNextRun: [DEFAULT_ACCOUNTING_SETTINGS.currencyRateNextRun],

    enableSnailmail: [DEFAULT_ACCOUNTING_SETTINGS.enableSnailmail],
    snailmailPrintInColor: [
      DEFAULT_ACCOUNTING_SETTINGS.snailmailPrintInColor,
    ],
    snailmailPrintBothSides: [
      DEFAULT_ACCOUNTING_SETTINGS.snailmailPrintBothSides,
    ],
    snailmailAddCoverPage: [
      DEFAULT_ACCOUNTING_SETTINGS.snailmailAddCoverPage,
    ],
    enableCustomerAddresses: [
      DEFAULT_ACCOUNTING_SETTINGS.enableCustomerAddresses,
    ],
    enableTotalRounding: [DEFAULT_ACCOUNTING_SETTINGS.enableTotalRounding],
    defaultIncoterm: [DEFAULT_ACCOUNTING_SETTINGS.defaultIncoterm],
    enableSaleReceipt: [DEFAULT_ACCOUNTING_SETTINGS.enableSaleReceipt],
    enableDefaultTermsAndConditions: [
      DEFAULT_ACCOUNTING_SETTINGS.enableDefaultTermsAndConditions,
    ],
    termsAndConditionsMode: [
      DEFAULT_ACCOUNTING_SETTINGS.termsAndConditionsMode,
    ],
    enableSalesCreditLimit: [
      DEFAULT_ACCOUNTING_SETTINGS.enableSalesCreditLimit,
    ],
    salesCreditLimitAmount: [
      DEFAULT_ACCOUNTING_SETTINGS.salesCreditLimitAmount,
      [Validators.min(0)],
    ],
    showInvoiceTotalInWords: [
      DEFAULT_ACCOUNTING_SETTINGS.showInvoiceTotalInWords,
    ],
    showTaxesInCompanyCurrency: [
      DEFAULT_ACCOUNTING_SETTINGS.showTaxesInCompanyCurrency,
    ],
    enableAuthorizedSignatory: [
      DEFAULT_ACCOUNTING_SETTINGS.enableAuthorizedSignatory,
    ],
    enableAutomaticInvoiceReminders: [
      DEFAULT_ACCOUNTING_SETTINGS.enableAutomaticInvoiceReminders,
    ],

    enableUnitsOfMeasure: [DEFAULT_ACCOUNTING_SETTINGS.enableUnitsOfMeasure],

    enableInvoiceOnlinePayment: [
      DEFAULT_ACCOUNTING_SETTINGS.enableInvoiceOnlinePayment,
    ],
    addQrCodeLinkOnPdf: [DEFAULT_ACCOUNTING_SETTINGS.addQrCodeLinkOnPdf],
    enablePaymentQrCodes: [
      DEFAULT_ACCOUNTING_SETTINGS.enablePaymentQrCodes,
    ],
    enableBatchPayments: [DEFAULT_ACCOUNTING_SETTINGS.enableBatchPayments],

    enableChecks: [DEFAULT_ACCOUNTING_SETTINGS.enableChecks],
    checkLayout: [DEFAULT_ACCOUNTING_SETTINGS.checkLayout],
    checkMultiPagesStub: [DEFAULT_ACCOUNTING_SETTINGS.checkMultiPagesStub],
    checkTopMargin: [
      DEFAULT_ACCOUNTING_SETTINGS.checkTopMargin,
      [Validators.min(0)],
    ],
    checkLeftMargin: [
      DEFAULT_ACCOUNTING_SETTINGS.checkLeftMargin,
      [Validators.min(0)],
    ],
    enableUsDirectDeposit: [
      DEFAULT_ACCOUNTING_SETTINGS.enableUsDirectDeposit,
    ],
    enableSepaCreditTransfer: [
      DEFAULT_ACCOUNTING_SETTINGS.enableSepaCreditTransfer,
    ],
    sepaCompanyIdentification: [
      DEFAULT_ACCOUNTING_SETTINGS.sepaCompanyIdentification,
    ],
    sepaIssuer: [DEFAULT_ACCOUNTING_SETTINGS.sepaIssuer],

    enableDocumentDigitization: [
      DEFAULT_ACCOUNTING_SETTINGS.enableDocumentDigitization,
    ],
    digitizeCustomerInvoices: [
      DEFAULT_ACCOUNTING_SETTINGS.digitizeCustomerInvoices,
    ],
    digitizeVendorBills: [DEFAULT_ACCOUNTING_SETTINGS.digitizeVendorBills],
    digitizeBankStatements: [
      DEFAULT_ACCOUNTING_SETTINGS.digitizeBankStatements,
    ],
    digitizeLoans: [DEFAULT_ACCOUNTING_SETTINGS.digitizeLoans],
    enableSingleInvoiceLinePerTax: [
      DEFAULT_ACCOUNTING_SETTINGS.enableSingleInvoiceLinePerTax,
    ],

    exchangeDifferenceJournal: [
      DEFAULT_ACCOUNTING_SETTINGS.exchangeDifferenceJournal,
    ],
    exchangeGainAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.exchangeGainAccountId,
    ],
    exchangeLossAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.exchangeLossAccountId,
    ],
    bankSuspenseAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.bankSuspenseAccountId,
    ],
    internalTransferAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.internalTransferAccountId,
    ],
    deferredExpenseJournal: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredExpenseJournal,
    ],
    deferredExpenseAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredExpenseAccountId,
    ],
    deferredExpenseGenerateEntries: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredExpenseGenerateEntries,
    ],
    deferredExpensePeriodicity: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredExpensePeriodicity,
    ],
    deferredExpenseComputation: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredExpenseComputation,
    ],
    deferredRevenueJournal: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredRevenueJournal,
    ],
    deferredRevenueAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredRevenueAccountId,
    ],
    deferredRevenueGenerateEntries: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredRevenueGenerateEntries,
    ],
    deferredRevenuePeriodicity: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredRevenuePeriodicity,
    ],
    deferredRevenueComputation: [
      DEFAULT_ACCOUNTING_SETTINGS.deferredRevenueComputation,
    ],
    incomeAccountId: [DEFAULT_ACCOUNTING_SETTINGS.incomeAccountId],
    expenseAccountId: [DEFAULT_ACCOUNTING_SETTINGS.expenseAccountId],
    earlyDiscountGainAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.earlyDiscountGainAccountId,
    ],
    earlyDiscountLossAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.earlyDiscountLossAccountId,
    ],
    salesAccrualInvoicesToBeIssuedAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.salesAccrualInvoicesToBeIssuedAccountId,
    ],
    salesAccrualInvoicedNotDeliveredAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.salesAccrualInvoicedNotDeliveredAccountId,
    ],
    purchaseAccrualBillsToReceiveAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.purchaseAccrualBillsToReceiveAccountId,
    ],
    purchaseAccrualBilledNotReceivedAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.purchaseAccrualBilledNotReceivedAccountId,
    ],
    roundingProfitAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.roundingProfitAccountId,
    ],
    roundingLossAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.roundingLossAccountId,
    ],
    intercompanyClearingJournal: [
      DEFAULT_ACCOUNTING_SETTINGS.intercompanyClearingJournal,
    ],
    intercompanyAccountPayableId: [
      DEFAULT_ACCOUNTING_SETTINGS.intercompanyAccountPayableId,
    ],
    intercompanyAccountReceivableId: [
      DEFAULT_ACCOUNTING_SETTINGS.intercompanyAccountReceivableId,
    ],
    withholdingTaxBaseAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.withholdingTaxBaseAccountId,
    ],

    inventoryValuationMethod: [
      DEFAULT_ACCOUNTING_SETTINGS.inventoryValuationMethod,
    ],
    inventoryCostMethod: [DEFAULT_ACCOUNTING_SETTINGS.inventoryCostMethod],
    periodicValuationMode: [
      DEFAULT_ACCOUNTING_SETTINGS.periodicValuationMode,
    ],
    stockValuationAccountId: [
      DEFAULT_ACCOUNTING_SETTINGS.stockValuationAccountId,
    ],
    inventoryValuationJournal: [
      DEFAULT_ACCOUNTING_SETTINGS.inventoryValuationJournal,
    ],
    wipAccountId: [DEFAULT_ACCOUNTING_SETTINGS.wipAccountId],
    wipOverheadAccountId: [DEFAULT_ACCOUNTING_SETTINGS.wipOverheadAccountId],

    enableQifImport: [DEFAULT_ACCOUNTING_SETTINGS.enableQifImport],
    enableAutoTransfer: [DEFAULT_ACCOUNTING_SETTINGS.enableAutoTransfer],

    fiscalYearLastDayMonth: [
      DEFAULT_ACCOUNTING_SETTINGS.fiscalYearLastDayMonth,
      [Validators.required, Validators.min(1), Validators.max(12)],
    ],
    fiscalYearLastDayOfMonth: [
      DEFAULT_ACCOUNTING_SETTINGS.fiscalYearLastDayOfMonth,
      [Validators.required, Validators.min(1), Validators.max(31)],
    ],
    invoicingSwitchThresholdDate: [
      DEFAULT_ACCOUNTING_SETTINGS.invoicingSwitchThresholdDate,
    ],
    enableMultiYearFiscalYears: [
      DEFAULT_ACCOUNTING_SETTINGS.enableMultiYearFiscalYears,
    ],

    enableAnalyticAccounting: [
      DEFAULT_ACCOUNTING_SETTINGS.enableAnalyticAccounting,
    ],
    enableBudgetManagement: [
      DEFAULT_ACCOUNTING_SETTINGS.enableBudgetManagement,
    ],
    enableMarginAnalysis: [
      DEFAULT_ACCOUNTING_SETTINGS.enableMarginAnalysis,
    ],

    enableRestrictiveAuditTrail: [
      DEFAULT_ACCOUNTING_SETTINGS.enableRestrictiveAuditTrail,
    ],
    enableTotalsBelowSections: [
      DEFAULT_ACCOUNTING_SETTINGS.enableTotalsBelowSections,
    ],
    negativeAmountDisplay: [
      DEFAULT_ACCOUNTING_SETTINGS.negativeAmountDisplay,
    ],
    datevGlAccountLength: [
      DEFAULT_ACCOUNTING_SETTINGS.datevGlAccountLength,
      [Validators.required, Validators.min(1), Validators.max(20)],
    ],

    enableQuickEncoding: [DEFAULT_ACCOUNTING_SETTINGS.enableQuickEncoding],
    enableDocumentSequenceEditable: [
      DEFAULT_ACCOUNTING_SETTINGS.enableDocumentSequenceEditable,
    ],
    enableReviewData: [DEFAULT_ACCOUNTING_SETTINGS.enableReviewData],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.cdr.detectChanges();
    forkJoin({
      settings: this.settingsService.get(),
      accounts: this.accountsService.list(),
      taxCodes: this.taxCodesService.list(),
    }).subscribe({
      next: ({ settings, accounts, taxCodes }) => {
        this.accounts = (accounts.items ?? []).filter((a) => a.isActive);
        this.taxCodes = (taxCodes.items ?? []).filter((t) => t.isActive);
        this.form.reset(settings);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(apiErrorMessage(err, 'Failed to load settings'));
        this.cdr.detectChanges();
      },
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
      this.toast.success('Accounting settings saved');
      this.cdr.detectChanges();
    });
  }

  discard(): void {
    this.load();
  }
}
