import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  ACTOR_TENANT_ID_HEADER,
  ACTOR_USER_ID_HEADER,
  INTERNAL_SERVICE_SECRET_HEADER,
} from '@app/common';
import { ActorContext } from '../auth/actor-context';
import { PurchaseEnvironmentVariables } from '../config/purchase-env';

export interface InventoryStockReceiptRequest {
  referenceType: 'goods_receipt';
  referenceId: string;
  warehouseId: string;
  // unitCost is optional (Inventory Valuation V1, Phase 2 — the receipt
  // endpoint already accepts it and blends it into Stock.totalValue via
  // moving average). Phase 3.1 (GRNI Accounting) is the first Purchase-side
  // caller to actually populate it, from the persisted GoodsReceiptItem.unitCost
  // snapshot; a legacy line with no snapshotted cost simply omits it,
  // preserving the exact pre-Phase-3.1 behavior for that line.
  lines: Array<{ productId: string; quantity: string; unitCost?: string }>;
}

// Phase 3.5 — inventory-service's stock-returns endpoint, extended to accept
// this alongside Phase 3.4's 'sales_return'. Subtractive on the inventory
// side (stock leaves the warehouse back to the vendor); costed at the
// ORIGINAL PURCHASE movement's unitCost, never client-supplied.
//
// Phase 3.6 adds 'purchase_return_reversal': additive (stock comes back in),
// costed at the ORIGINAL PURCHASE_RETURN movement's own unitCost — same
// endpoint, same shape, only referenceType and each line's originalMovementId
// selector differ (there it points at a PurchaseReturnItem's own captured
// inventoryMovementId instead of a GoodsReceiptItem's).
//
// Phase 3.7 adds 'goods_receipt_reversal': subtractive (stock goes back out —
// carries the same "Insufficient stock" risk as 'purchase_return', unlike the
// additive reversal above), reversing the original PURCHASE movement
// directly. Always full-quantity — Goods Receipt reversal never sends a
// partial line.
export interface InventoryStockPurchaseReturnRequest {
  referenceType:
    | 'purchase_return'
    | 'purchase_return_reversal'
    | 'goods_receipt_reversal';
  referenceId: string;
  warehouseId: string;
  lines: Array<{
    productId: string;
    quantity: string;
    // The AUTHORITATIVE selector for which original movement this line acts
    // against — GoodsReceiptItem.inventoryMovementId for 'purchase_return'
    // and 'goods_receipt_reversal', PurchaseReturnItem.inventoryMovementId
    // for 'purchase_return_reversal'. Never resolved by (referenceType,
    // referenceId, productId) lookup.
    originalMovementId: string;
  }>;
}

// Positional per-line movement summary from inventory-service's response.
// `movements[i]` corresponds to `lines[i]` of the request that produced it —
// inventory-service iterates and pushes in that exact order. The HTTP body
// itself is wrapped in the standard {success, statusCode, data, timestamp}
// envelope every service applies globally via ResponseInterceptor (verified
// live during Phase 3.5.6 — a controller's own `return result` reads as
// unenveloped only if you don't also check the app-wide interceptor chain),
// so callers below always unwrap via `response.data.data`.
export interface InventoryStockMovementSummary {
  id: string;
  productId: string;
}

export interface InventoryStockReturnMovementSummary
  extends InventoryStockMovementSummary {
  unitCost: string | null;
  totalCost: string | null;
}

interface InventoryEnvelope<T> {
  success?: boolean;
  data?: T;
}

@Injectable()
export class InventoryStockClient {
  private readonly logger = new Logger(InventoryStockClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<PurchaseEnvironmentVariables, true>,
  ) {}

  async applyReceipt(
    actor: ActorContext,
    body: InventoryStockReceiptRequest,
  ): Promise<{ created: boolean; movements: InventoryStockMovementSummary[] }> {
    const base = this.config
      .get('INVENTORY_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    const secret = this.config.get('INTERNAL_SERVICE_SECRET', { infer: true });
    try {
      const response = await firstValueFrom(
        this.http.post<
          InventoryEnvelope<{
            movements?: Array<{ id: string; productId: string }>;
          }>
        >(`${base}/api/v1/internal/stock/receipts`, body, {
          headers: {
            [INTERNAL_SERVICE_SECRET_HEADER]: secret,
            [ACTOR_USER_ID_HEADER]: actor.userId,
            [ACTOR_TENANT_ID_HEADER]: actor.tenantId,
          },
          validateStatus: (status) => status === 200 || status === 201,
        }),
      );
      return {
        created: response.status === 201,
        movements: (response.data.data?.movements ?? []).map((movement) => ({
          id: movement.id,
          productId: movement.productId,
        })),
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  // Phase 3.5 — modeled directly on applyReceipt(): same base URL, headers,
  // validateStatus, and error mapping; the only difference is the endpoint
  // path is shared (POST .../stock/returns, same primitive Phase 3.4 built)
  // and the request/response shapes are the return-specific ones above.
  async applyReturn(
    actor: ActorContext,
    body: InventoryStockPurchaseReturnRequest,
  ): Promise<{
    created: boolean;
    movements: InventoryStockReturnMovementSummary[];
  }> {
    const base = this.config
      .get('INVENTORY_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    const secret = this.config.get('INTERNAL_SERVICE_SECRET', { infer: true });
    try {
      const response = await firstValueFrom(
        this.http.post<
          InventoryEnvelope<{
            movements?: Array<{
              id: string;
              productId: string;
              unitCost: string | null;
              totalCost: string | null;
            }>;
          }>
        >(`${base}/api/v1/internal/stock/returns`, body, {
          headers: {
            [INTERNAL_SERVICE_SECRET_HEADER]: secret,
            [ACTOR_USER_ID_HEADER]: actor.userId,
            [ACTOR_TENANT_ID_HEADER]: actor.tenantId,
          },
          validateStatus: (status) => status === 200 || status === 201,
        }),
      );
      return {
        created: response.status === 201,
        movements: (response.data.data?.movements ?? []).map((movement) => ({
          id: movement.id,
          productId: movement.productId,
          unitCost: movement.unitCost,
          totalCost: movement.totalCost,
        })),
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (isAxiosError(error)) {
      if (!error.response) {
        this.logger.warn('Inventory service unreachable');
        throw new ServiceUnavailableException('Inventory service unavailable');
      }
      const status = error.response.status;
      const message =
        (error.response.data as { message?: string } | undefined)?.message ??
        'Inventory service error';
      if (status === 404) throw new NotFoundException(message);
      if (status === 409) throw new ConflictException(message);
      if (status === 400) throw new ConflictException(message);
      throw new BadGatewayException('Inventory service error');
    }
    throw new BadGatewayException('Inventory service error');
  }
}
