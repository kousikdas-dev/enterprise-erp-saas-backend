export type BillControlPolicy = 'ORDERED_QUANTITIES' | 'RECEIVED_QUANTITIES';

export interface PurchaseSettings {
  /** Sell — i.e. buy — variants of a product using attributes (size, color, etc.) — see Inventory > Attributes. */
  enableVariants: boolean;
  /** Purchase products in a unit of measure other than their base unit (see Inventory > Units). */
  enableUnitsOfMeasure: boolean;
  /** Grant discounts on purchase order lines. */
  enableDiscounts: boolean;
  /** Set multiple vendor prices per product via rule-based pricelists. Not implemented yet — no vendor pricelist module exists. */
  enableVendorPricelists: boolean;
  /** Request managers to approve purchase orders above a minimum amount. Not implemented yet — no approval workflow exists. */
  enablePurchaseOrderApproval: boolean;
  /** Minimum order amount above which approval is requested when enablePurchaseOrderApproval is on. */
  purchaseOrderApprovalMinAmount: number;
  /** Automatically lock confirmed orders to prevent editing. Not yet enforced anywhere in the Purchase Orders UI. */
  lockConfirmedOrders: boolean;
  /** Get warnings in orders for flagged products or vendors. Not implemented yet — no warning-message field exists on Product/Supplier. */
  enablePurchaseWarnings: boolean;
  /** Manage blanket orders and purchase templates. Not implemented yet — no purchase agreements module exists. */
  enablePurchaseAgreements: boolean;
  /** Automatically remind the receipt date to your vendors. Not implemented yet — no reminder/notification module exists. */
  enableReceiptReminder: boolean;
  /** Days before the expected receipt date that the reminder is sent, when enableReceiptReminder is on. */
  receiptReminderDaysBefore: number;
  /** Link RFQs together and compare them. Not implemented yet — no RFQ-linking capability exists. */
  enablePurchaseAlternative: boolean;
  /** Require an expected receipt date before a purchase order can be confirmed. */
  requireReceiptDateOnOrders: boolean;
  /** Allow a goods receipt to cover less than a purchase order's remaining quantity. */
  allowPartialReceipts: boolean;
  /** Days from billDate that a purchase invoice's dueDate defaults to. */
  defaultBillDueDays: number;
  /** Whether bills are generated from a purchase order's ordered or received quantities. Not yet enforced by the bill-creation endpoint. */
  billControlPolicy: BillControlPolicy;
  /** Compare quantities and prices across the order, receipt and bill before validating. Not implemented yet — no 3-way matching logic exists. */
  enable3WayMatching: boolean;
  /** Line discount percent above which approval is recommended. */
  maxDiscountPercentWithoutApproval: number;
  /** Flag line discounts above the limit above as needing approval before confirming. */
  requireApprovalAboveDiscountLimit: boolean;
  /** Require a reason when creating a purchase return or debit note. */
  requireReasonForReturns: boolean;
}

export const DEFAULT_PURCHASE_SETTINGS: PurchaseSettings = {
  enableVariants: true,
  enableUnitsOfMeasure: true,
  enableDiscounts: true,
  enableVendorPricelists: false,
  enablePurchaseOrderApproval: false,
  purchaseOrderApprovalMinAmount: 1000,
  lockConfirmedOrders: false,
  enablePurchaseWarnings: true,
  enablePurchaseAgreements: true,
  enableReceiptReminder: true,
  receiptReminderDaysBefore: 1,
  enablePurchaseAlternative: true,
  requireReceiptDateOnOrders: false,
  allowPartialReceipts: true,
  defaultBillDueDays: 30,
  billControlPolicy: 'ORDERED_QUANTITIES',
  enable3WayMatching: false,
  maxDiscountPercentWithoutApproval: 10,
  requireApprovalAboveDiscountLimit: false,
  requireReasonForReturns: true,
};
