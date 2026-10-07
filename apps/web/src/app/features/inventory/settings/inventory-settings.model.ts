export type ShippingPolicy = 'ASAP' | 'WHEN_ALL_READY';

export interface InventorySettings {
  // Operations
  /** Put your products in packs (e.g. parcels, boxes) and track them. Not implemented yet — no package model exists. */
  enablePackages: boolean;
  /** Optimize your transfers by grouping operations together and assigning jobs to workers. Not implemented yet — no batch/wave/cluster transfer workflow exists. */
  enableBatchWaveClusterTransfers: boolean;
  /** Display instructions tailored to the customer or vendor on stock operations. Not implemented yet — no instructions field exists on Supplier/Customer. */
  enablePartnerSpecificInstructions: boolean;
  /** When to start shipping. Not implemented yet — not enforced by the shipment/goods-receipt workflow. */
  shippingPolicy: ShippingPolicy;
  /** Add quality checks to your transfer operations. Not implemented yet — no quality module exists. */
  enableQuality: boolean;
  /** Create customizable worksheets for your quality checks. Not implemented yet — depends on enableQuality, which has no backing module. */
  enableQualityWorksheet: boolean;
  /** Allow users to return products without a linked source document. Not implemented yet — Sales Returns and Purchase Returns require a source order. */
  enableSpontaneousReturns: boolean;
  /** Calendar month (1-12) the next physical inventory is scheduled in by default. Not implemented yet — no physical-inventory-count module exists. */
  annualInventoryMonth: number;
  annualInventoryDay: number;

  // Barcode
  /** Process operations faster with barcodes. Not implemented yet — no barcode-scanning integration exists. */
  enableBarcodeScanner: boolean;
  barcodeNomenclature: string;
  /** Create products easily by scanning using barcodelookup.com in barcode. Not implemented yet — no barcode-lookup integration exists. */
  enableStockBarcodeDatabase: boolean;

  // Shipping
  /** Compute shipping costs — see Sales > Delivery Methods. */
  enableDeliveryMethods: boolean;
  /** Organize deliveries by dock, assign drivers and vehicles, and print consignment notes. Not implemented yet — no transport management module exists. */
  enableTransportManagement: boolean;
  /** Send an automatic confirmation email when Delivery Orders are done. Not implemented yet — no shipment-completion email exists. */
  enableConfirmationEmail: boolean;
  /** Send an automatic confirmation text message when Delivery Orders are done. Not implemented yet — no SMS integration exists. */
  enableTextConfirmation: boolean;
  /** Require a signature on your delivery orders. Not implemented yet — no e-signature capability exists. */
  requireSignatureOnDeliveryOrders: boolean;

  // Products
  /** Set product attributes (e.g. color, size) to manage variants — see Inventory > Attributes. */
  enableVariants: boolean;
  /** Sell and purchase products in different units of measure or packagings — see Inventory > Units. */
  enableUnitsOfMeasure: boolean;

  // Traceability
  /** Get a full traceability from vendors to customers. Not implemented yet — Stock/StockMovement track quantities only, no lot/serial dimension. */
  enableLotsAndSerialNumbers: boolean;
  /** Use GS1 nomenclature datamatrix whenever barcodes are printed for lots and serial numbers. Not implemented yet — depends on enableLotsAndSerialNumbers. */
  printGs1BarcodesForLots: boolean;
  /** Character(s) used to separate serial numbers in a scannable package-contents QR code. Not implemented yet — no package/serial QR generation exists. */
  scannablePackageContentsSeparator: string;
  /** Set expiration dates on lots & serial numbers. Not implemented yet — depends on enableLotsAndSerialNumbers. */
  enableExpirationDates: boolean;
  /** Lots & serial numbers will appear on the delivery slip. Not implemented yet — no delivery slip document exists. */
  displayLotsSerialNumbersOnDeliverySlips: boolean;
  /** Set owner on stored products (consignment stock). Not implemented yet — no ownership field exists on Stock. */
  enableConsignment: boolean;

  // Valuation
  /** Add additional cost (transport, customs, ...) in the value of the product. Not implemented yet — no landed-cost allocation exists. */
  enableLandedCosts: boolean;
  /** Default journal for landed cost entries. Free text — this tenant has no Journal master entity. */
  landedCostsDefaultJournal: string;
  /** Lots & serial numbers will appear on the invoice. Not implemented yet — depends on enableLotsAndSerialNumbers. */
  displayLotsSerialNumbersOnInvoices: boolean;

  // Warehouse
  /** Track product location in your warehouse — see Inventory > Warehouses (this tenant has flat warehouses, not a location hierarchy). */
  enableStorageLocations: boolean;
  /** Use your own routes between warehouses. Not implemented yet — no route/procurement-rule model exists. */
  enableMultiStepRoutes: boolean;

  // Advanced Scheduling
  /** Days to trigger reordering rules ahead of the need date. Not implemented yet — no reordering-rule engine exists. */
  replenishmentHorizonDays: number;
  /** Schedule deliveries earlier to avoid delays. Not implemented yet — no security lead time is applied to sales scheduling. */
  enableSecurityLeadTimeForSales: boolean;
  /** Days needed to confirm a purchase order. Not implemented yet — not enforced by the purchase order workflow. */
  daysToPurchase: number;

  // Logistics
  /** Request your vendors to deliver to your customers. Not implemented yet — no dropship routing exists. */
  enableDropshipping: boolean;
  /** Allow Make to Order, or automate PO, when a product is sold and get direct links between documents. Not implemented yet — no MTO procurement route exists. */
  enableReplenishOnOrder: boolean;
}

export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = {
  enablePackages: true,
  enableBatchWaveClusterTransfers: true,
  enablePartnerSpecificInstructions: true,
  shippingPolicy: 'ASAP',
  enableQuality: true,
  enableQualityWorksheet: true,
  enableSpontaneousReturns: false,
  annualInventoryMonth: 12,
  annualInventoryDay: 31,

  enableBarcodeScanner: true,
  barcodeNomenclature: 'Default Nomenclature',
  enableStockBarcodeDatabase: true,

  enableDeliveryMethods: true,
  enableTransportManagement: true,
  enableConfirmationEmail: false,
  enableTextConfirmation: false,
  requireSignatureOnDeliveryOrders: false,

  enableVariants: true,
  enableUnitsOfMeasure: true,

  enableLotsAndSerialNumbers: true,
  printGs1BarcodesForLots: false,
  scannablePackageContentsSeparator: ',',
  enableExpirationDates: true,
  displayLotsSerialNumbersOnDeliverySlips: false,
  enableConsignment: false,

  enableLandedCosts: true,
  landedCostsDefaultJournal: '',
  displayLotsSerialNumbersOnInvoices: false,

  enableStorageLocations: true,
  enableMultiStepRoutes: true,

  replenishmentHorizonDays: 365,
  enableSecurityLeadTimeForSales: false,
  daysToPurchase: 0,

  enableDropshipping: true,
  enableReplenishOnOrder: true,
};
