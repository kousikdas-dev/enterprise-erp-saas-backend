export type PriceTaxMode = 'TAX_INCLUDED' | 'TAX_EXCLUDED';
export type TaxRoundingMethod = 'ROUND_PER_TAX' | 'ROUND_PER_LINE';
export type TaxReturnPeriodicity = 'MONTHLY' | 'QUARTERLY';
export type AvaTaxIntegrationMethod = 'AVALARA_INCLUDED' | 'AVALARA_DIRECT';
export type CurrencyRateInterval = 'MANUALLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type TermsAndConditionsMode = 'NOTE' | 'WEB_PAGE';
export type CheckLayout = 'NONE' | 'STANDARD' | 'VOUCHER' | 'THREE_PER_PAGE';
export type DigitizeMode = 'DO_NOT_DIGITIZE' | 'ON_DEMAND' | 'AUTOMATIC';
export type DigitizeModeNoDemand = 'DO_NOT_DIGITIZE' | 'AUTOMATIC';
export type DeferredGenerateEntriesExpense =
  | 'ON_BILL_VALIDATION'
  | 'ON_PERIOD_END';
export type DeferredGenerateEntriesRevenue =
  | 'ON_INVOICE_VALIDATION'
  | 'ON_PERIOD_END';
export type DeferredPeriodicity = 'MONTHLY' | 'QUARTERLY';
export type DeferredComputation = 'BY_MONTHS' | 'BY_DAYS';
export type InventoryValuationMethod = 'PERIODIC' | 'PERPETUAL';
export type InventoryCostMethod = 'STANDARD' | 'FIFO' | 'AVERAGE';
export type PeriodicValuationMode = 'MANUAL' | 'AUTOMATIC';
export type NegativeAmountDisplay = '-100' | '100-';

export interface AccountingSettings {
  // Initial Setup
  /** Chart of Accounts package used to seed Accounts, taxes and legal statements. Not implemented yet — this tenant has one flat Chart of Accounts, no localization templates. */
  fiscalLocalizationPackage: string;

  // Taxes
  /** Tax code applied by default to new sale lines — see Accounting > Tax Master. */
  defaultSalesTaxCodeId: string;
  /** Tax code applied by default to new purchase lines — see Accounting > Tax Master. */
  defaultPurchaseTaxCodeId: string;
  pricesTaxMode: PriceTaxMode;
  roundingMethod: TaxRoundingMethod;
  /** Not implemented yet — no tax return filing module exists. */
  taxReturnPeriodicity: TaxReturnPeriodicity;
  taxReturnDeadlineDays: number;
  taxReturnJournal: string;
  /** Not implemented yet — no AvaTax/Avalara integration exists. */
  enableAvaTax: boolean;
  avaTaxIntegrationMethod: AvaTaxIntegrationMethod;
  avaTaxPortalEmail: string;
  avaTaxUseUpc: boolean;
  avaTaxAddressValidation: boolean;
  /** Not implemented yet — no VIES lookup integration exists. */
  verifyVatNumbers: boolean;
  /** Not implemented yet — no cash-basis tax posting exists. */
  cashBasis: boolean;
  fiscalCountry: string;

  // Currencies
  mainCurrency: string;
  /** Not implemented yet — no exchange-rate provider integration exists. */
  enableAutomaticCurrencyRates: boolean;
  currencyRateService: string;
  currencyRateInterval: CurrencyRateInterval;
  currencyRateNextRun: string;

  // Customer Invoices
  /** Not implemented yet — no postal/snailmail delivery integration exists. */
  enableSnailmail: boolean;
  snailmailPrintInColor: boolean;
  snailmailPrintBothSides: boolean;
  snailmailAddCoverPage: boolean;
  enableCustomerAddresses: boolean;
  enableTotalRounding: boolean;
  defaultIncoterm: string;
  enableSaleReceipt: boolean;
  enableDefaultTermsAndConditions: boolean;
  termsAndConditionsMode: TermsAndConditionsMode;
  /** Not implemented yet — no credit-limit check exists on invoice/order creation. */
  enableSalesCreditLimit: boolean;
  salesCreditLimitAmount: number;
  showInvoiceTotalInWords: boolean;
  showTaxesInCompanyCurrency: boolean;
  /** Not implemented yet — no e-signature capability exists. */
  enableAuthorizedSignatory: boolean;
  /** Not implemented yet — no reminder/notification module exists. */
  enableAutomaticInvoiceReminders: boolean;

  // Units & Packagings
  /** Sell and purchase products in different units of measure or packagings — see Inventory > Units. */
  enableUnitsOfMeasure: boolean;

  // Customer Payments
  /** Not implemented yet — no customer portal/online payment integration exists. */
  enableInvoiceOnlinePayment: boolean;
  addQrCodeLinkOnPdf: boolean;
  /** Not implemented yet — no UPI/bank QR-code generation exists. */
  enablePaymentQrCodes: boolean;
  /** Not implemented yet — no batch payment/reconciliation workflow exists. */
  enableBatchPayments: boolean;

  // Vendor Payments
  /** Not implemented yet — no check-printing capability exists. */
  enableChecks: boolean;
  checkLayout: CheckLayout;
  checkMultiPagesStub: boolean;
  checkTopMargin: number;
  checkLeftMargin: number;
  /** Not implemented yet — no Wise integration exists. */
  enableUsDirectDeposit: boolean;
  /** Not implemented yet — no SEPA/ISO20022 payment-initiation integration exists. */
  enableSepaCreditTransfer: boolean;
  sepaCompanyIdentification: string;
  sepaIssuer: string;

  // Digitization
  /** Not implemented yet — no OCR/document digitization integration exists. */
  enableDocumentDigitization: boolean;
  digitizeCustomerInvoices: DigitizeMode;
  digitizeVendorBills: DigitizeMode;
  digitizeBankStatements: DigitizeModeNoDemand;
  digitizeLoans: DigitizeModeNoDemand;
  enableSingleInvoiceLinePerTax: boolean;

  // Default Accounts — account fields reference real Chart of Accounts entries (see Accounting > Chart of Accounts); journal fields are free text, since this tenant has no Journal master entity.
  exchangeDifferenceJournal: string;
  exchangeGainAccountId: string;
  exchangeLossAccountId: string;
  bankSuspenseAccountId: string;
  internalTransferAccountId: string;
  deferredExpenseJournal: string;
  deferredExpenseAccountId: string;
  deferredExpenseGenerateEntries: DeferredGenerateEntriesExpense;
  deferredExpensePeriodicity: DeferredPeriodicity;
  deferredExpenseComputation: DeferredComputation;
  deferredRevenueJournal: string;
  deferredRevenueAccountId: string;
  deferredRevenueGenerateEntries: DeferredGenerateEntriesRevenue;
  deferredRevenuePeriodicity: DeferredPeriodicity;
  deferredRevenueComputation: DeferredComputation;
  incomeAccountId: string;
  expenseAccountId: string;
  earlyDiscountGainAccountId: string;
  earlyDiscountLossAccountId: string;
  salesAccrualInvoicesToBeIssuedAccountId: string;
  salesAccrualInvoicedNotDeliveredAccountId: string;
  purchaseAccrualBillsToReceiveAccountId: string;
  purchaseAccrualBilledNotReceivedAccountId: string;
  roundingProfitAccountId: string;
  roundingLossAccountId: string;
  intercompanyClearingJournal: string;
  intercompanyAccountPayableId: string;
  intercompanyAccountReceivableId: string;
  withholdingTaxBaseAccountId: string;

  // Inventory Valuation
  inventoryValuationMethod: InventoryValuationMethod;
  inventoryCostMethod: InventoryCostMethod;
  periodicValuationMode: PeriodicValuationMode;
  stockValuationAccountId: string;
  inventoryValuationJournal: string;
  wipAccountId: string;
  wipOverheadAccountId: string;

  // Bank & Cash
  /** Not implemented yet — no QIF bank-statement import exists. */
  enableQifImport: boolean;
  /** Not implemented yet — no auto-transfer-between-accounts rule engine exists. */
  enableAutoTransfer: boolean;

  // Fiscal Periods
  /** Not implemented yet — no fiscal year model exists; periods are plain calendar months. */
  fiscalYearLastDayMonth: number;
  fiscalYearLastDayOfMonth: number;
  invoicingSwitchThresholdDate: string;
  enableMultiYearFiscalYears: boolean;

  // Analytics
  /** Not implemented yet — no analytic accounting (cost/revenue by project, department, etc.) module exists. */
  enableAnalyticAccounting: boolean;
  /** Not implemented yet — no budgeting module exists. */
  enableBudgetManagement: boolean;
  /** Not implemented yet — no margin analysis report exists. */
  enableMarginAnalysis: boolean;

  // Reporting
  /** Not implemented yet — posted journal entries aren't change-logged. */
  enableRestrictiveAuditTrail: boolean;
  enableTotalsBelowSections: boolean;
  negativeAmountDisplay: NegativeAmountDisplay;
  datevGlAccountLength: number;

  // Accounting Firms mode
  /** Not implemented yet — no "Total (tax inc.)" quick-encoding field exists on journal entry lines. */
  enableQuickEncoding: boolean;
  enableDocumentSequenceEditable: boolean;
  /** Not implemented yet — no bookkeeper review/approval workflow exists. */
  enableReviewData: boolean;
}

export const DEFAULT_ACCOUNTING_SETTINGS: AccountingSettings = {
  fiscalLocalizationPackage: 'Generic (Minimal) Chart of Accounts',

  defaultSalesTaxCodeId: '',
  defaultPurchaseTaxCodeId: '',
  pricesTaxMode: 'TAX_EXCLUDED',
  roundingMethod: 'ROUND_PER_TAX',
  taxReturnPeriodicity: 'MONTHLY',
  taxReturnDeadlineDays: 7,
  taxReturnJournal: 'Tax Returns',
  enableAvaTax: false,
  avaTaxIntegrationMethod: 'AVALARA_INCLUDED',
  avaTaxPortalEmail: '',
  avaTaxUseUpc: true,
  avaTaxAddressValidation: false,
  verifyVatNumbers: false,
  cashBasis: false,
  fiscalCountry: '',

  mainCurrency: 'USD',
  enableAutomaticCurrencyRates: true,
  currencyRateService: 'European Central Bank',
  currencyRateInterval: 'MANUALLY',
  currencyRateNextRun: '',

  enableSnailmail: false,
  snailmailPrintInColor: true,
  snailmailPrintBothSides: false,
  snailmailAddCoverPage: false,
  enableCustomerAddresses: true,
  enableTotalRounding: true,
  defaultIncoterm: '',
  enableSaleReceipt: false,
  enableDefaultTermsAndConditions: true,
  termsAndConditionsMode: 'WEB_PAGE',
  enableSalesCreditLimit: false,
  salesCreditLimitAmount: 0,
  showInvoiceTotalInWords: false,
  showTaxesInCompanyCurrency: true,
  enableAuthorizedSignatory: false,
  enableAutomaticInvoiceReminders: false,

  enableUnitsOfMeasure: true,

  enableInvoiceOnlinePayment: true,
  addQrCodeLinkOnPdf: false,
  enablePaymentQrCodes: false,
  enableBatchPayments: true,

  enableChecks: true,
  checkLayout: 'NONE',
  checkMultiPagesStub: false,
  checkTopMargin: 0.25,
  checkLeftMargin: 0.25,
  enableUsDirectDeposit: false,
  enableSepaCreditTransfer: true,
  sepaCompanyIdentification: '',
  sepaIssuer: '',

  enableDocumentDigitization: false,
  digitizeCustomerInvoices: 'ON_DEMAND',
  digitizeVendorBills: 'AUTOMATIC',
  digitizeBankStatements: 'AUTOMATIC',
  digitizeLoans: 'AUTOMATIC',
  enableSingleInvoiceLinePerTax: true,

  exchangeDifferenceJournal: 'Exchange Difference',
  exchangeGainAccountId: '',
  exchangeLossAccountId: '',
  bankSuspenseAccountId: '',
  internalTransferAccountId: '',
  deferredExpenseJournal: 'Miscellaneous Operations',
  deferredExpenseAccountId: '',
  deferredExpenseGenerateEntries: 'ON_BILL_VALIDATION',
  deferredExpensePeriodicity: 'MONTHLY',
  deferredExpenseComputation: 'BY_MONTHS',
  deferredRevenueJournal: 'Miscellaneous Operations',
  deferredRevenueAccountId: '',
  deferredRevenueGenerateEntries: 'ON_INVOICE_VALIDATION',
  deferredRevenuePeriodicity: 'MONTHLY',
  deferredRevenueComputation: 'BY_MONTHS',
  incomeAccountId: '',
  expenseAccountId: '',
  earlyDiscountGainAccountId: '',
  earlyDiscountLossAccountId: '',
  salesAccrualInvoicesToBeIssuedAccountId: '',
  salesAccrualInvoicedNotDeliveredAccountId: '',
  purchaseAccrualBillsToReceiveAccountId: '',
  purchaseAccrualBilledNotReceivedAccountId: '',
  roundingProfitAccountId: '',
  roundingLossAccountId: '',
  intercompanyClearingJournal: '',
  intercompanyAccountPayableId: '',
  intercompanyAccountReceivableId: '',
  withholdingTaxBaseAccountId: '',

  inventoryValuationMethod: 'PERIODIC',
  inventoryCostMethod: 'STANDARD',
  periodicValuationMode: 'MANUAL',
  stockValuationAccountId: '',
  inventoryValuationJournal: 'Inventory Valuation',
  wipAccountId: '',
  wipOverheadAccountId: '',

  enableQifImport: false,
  enableAutoTransfer: false,

  fiscalYearLastDayMonth: 12,
  fiscalYearLastDayOfMonth: 31,
  invoicingSwitchThresholdDate: '',
  enableMultiYearFiscalYears: false,

  enableAnalyticAccounting: false,
  enableBudgetManagement: false,
  enableMarginAnalysis: false,

  enableRestrictiveAuditTrail: false,
  enableTotalsBelowSections: true,
  negativeAmountDisplay: '-100',
  datevGlAccountLength: 8,

  enableQuickEncoding: false,
  enableDocumentSequenceEditable: false,
  enableReviewData: false,
};
