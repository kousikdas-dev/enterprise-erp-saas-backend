/**
 * Formats ProformaInvoice.sourceType (persisted, backend-authoritative,
 * immutable via update()) into a display label. Purely presentational —
 * never infers or overrides which document a proforma came from.
 */
export function proformaSourceLabel(sourceType: string): string {
  switch (sourceType) {
    case 'QUOTATION':
      return 'Quotation';
    case 'SALES_ORDER':
      return 'Sales Order';
    default:
      return 'No source document';
  }
}
