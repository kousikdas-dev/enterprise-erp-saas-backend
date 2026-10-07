export type InvoicingPolicy = 'ORDERED_QUANTITIES' | 'DELIVERED_QUANTITIES';

export interface SalesSettings {
  /** Grant discounts on sales order lines. */
  enableDiscounts: boolean;
  /** Manage Promotions, Coupons, Loyalty cards, Gift cards & eWallet. Not implemented yet — no module backs this. */
  enablePromotions: boolean;
  /** Set multiple prices per product via rule-based price lists — see Sales > Pricelists. */
  enablePricelists: boolean;
  /** Show margins (sellingPrice vs. costPrice) on sales orders. */
  enableMargins: boolean;
  /** Sell variants of a product using attributes (size, color, etc.) — see Inventory > Attributes. */
  enableVariants: boolean;
  /** Sell products in a unit of measure other than their base unit (see Inventory > Units). */
  enableUnitsOfMeasure: boolean;
  /** Days from creation that a quotation's validUntil defaults to. */
  defaultQuotationValidityDays: number;
  /** Treat quotations past their validUntil date as expired in the UI. */
  autoExpireQuotations: boolean;
  /** Request customers to sign quotations to validate orders. Not implemented yet — no e-signature capability exists. */
  enableOnlineSignature: boolean;
  /** Request a payment to confirm orders. Not implemented yet — no payment-gateway integration exists. */
  enableOnlinePayment: boolean;
  /** Percentage of the order total requested upfront when enableOnlinePayment is on. */
  onlinePaymentPercent: number;
  /** Surface warnings in quotations/orders for flagged products or customers. Not implemented yet — no warning-message field exists on Product/Customer. */
  enableSaleWarnings: boolean;
  /** Add header/product-description/footer pages when generating a quote PDF. Not implemented yet — no PDF template builder exists. */
  enablePdfQuoteBuilder: boolean;
  /** Show product images on quote PDFs and online quotes. Not implemented yet — Product has no image field. */
  enableDisplayProductImages: boolean;
  /** Prevent editing a sales order once it's confirmed. Not yet enforced anywhere in the Sales Orders UI. */
  lockConfirmedSales: boolean;
  /** Allow sending a Proforma Invoice to customers — see Sales > Proforma Invoices (already a real, working feature). */
  enableProformaInvoice: boolean;
  /** Configure named delivery methods (with a price) — see Sales > Delivery Methods. */
  enableDeliveryMethods: boolean;
  /** Require a delivery date before a sales order can be confirmed. */
  requireDeliveryDateOnOrders: boolean;
  /** Allow a shipment to cover less than a sales order's remaining quantity (PARTIALLY_FULFILLED). */
  allowPartialShipments: boolean;
  /** Days from invoiceDate that a sales invoice's dueDate defaults to. */
  defaultInvoiceDueDays: number;
  /** Send the customer an email automatically when a sales invoice is created. */
  autoSendInvoiceEmails: boolean;
  /** Whether invoices are generated from a sales order's ordered or delivered (shipped) quantities. Real distinction — SalesOrderItem tracks orderedQuantity/shippedQuantity separately — but not yet enforced by the invoice-creation endpoint. */
  invoicingPolicy: InvoicingPolicy;
  /** Generate the invoice automatically when the online payment is confirmed. Depends on enableOnlinePayment, which isn't implemented yet. */
  enableAutomaticInvoicing: boolean;
  /** Manage sales teams' targets and commissions. Not implemented yet — no commission/target module exists. */
  enableCommissions: boolean;
  /** Use fixed-price and cost-based services/materials for re-invoicing. Not implemented yet — ProductType has SERVICE, but no re-invoicing workflow exists. */
  enableServicesAndMaterials: boolean;
  /** Consolidate a customer's same-day subscription charges onto one invoice. Not implemented yet — no subscription/recurring-billing module exists. */
  consolidateSubscriptionsBilling: boolean;
  /** Line discount percent above which approval is recommended. */
  maxDiscountPercentWithoutApproval: number;
  /** Flag line discounts above the limit above as needing approval before confirming. */
  requireApprovalAboveDiscountLimit: boolean;
  /** Require a reason when creating a sales return or standalone credit note. */
  requireReasonForReturns: boolean;
}

export const DEFAULT_SALES_SETTINGS: SalesSettings = {
  enableDiscounts: true,
  enablePromotions: true,
  enablePricelists: true,
  enableMargins: true,
  enableVariants: true,
  enableUnitsOfMeasure: true,
  defaultQuotationValidityDays: 30,
  autoExpireQuotations: false,
  enableOnlineSignature: true,
  enableOnlinePayment: true,
  onlinePaymentPercent: 100,
  enableSaleWarnings: false,
  enablePdfQuoteBuilder: true,
  enableDisplayProductImages: false,
  lockConfirmedSales: false,
  enableProformaInvoice: true,
  enableDeliveryMethods: true,
  requireDeliveryDateOnOrders: false,
  allowPartialShipments: true,
  defaultInvoiceDueDays: 30,
  autoSendInvoiceEmails: false,
  invoicingPolicy: 'ORDERED_QUANTITIES',
  enableAutomaticInvoicing: true,
  enableCommissions: true,
  enableServicesAndMaterials: false,
  consolidateSubscriptionsBilling: false,
  maxDiscountPercentWithoutApproval: 10,
  requireApprovalAboveDiscountLimit: false,
  requireReasonForReturns: true,
};
