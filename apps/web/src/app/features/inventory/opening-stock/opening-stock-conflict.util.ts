import { DuplicateActiveConflictDetail } from './opening-stock.models';

/**
 * Human-readable label for the Opening Stock document already active over a
 * duplicate-active conflict line. Prefers the document number; falls back to
 * the raw UUID only if the backend omitted it (should not happen in
 * practice, but keeps the table from rendering blank).
 */
export function activeOpeningStockLabel(detail: DuplicateActiveConflictDetail): string {
  return detail.activeOpeningStockDocumentNumber || detail.activeOpeningStockId;
}
