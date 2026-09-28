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
import { SalesEnvironmentVariables } from '../config/sales-env';

export interface InventoryStockIssueRequest {
  referenceType: 'shipment';
  referenceId: string;
  warehouseId: string;
  lines: Array<{ productId: string; quantity: string }>;
}

// Phase 3.3 (Sales Shipment COGS) — one entry per requested line, in the
// exact same order `lines` was sent (inventory-service's StockIssuesService
// processes lines strictly 1:1 in order — never re-fetched from Sales, this
// is the authoritative moving-average cost at the moment of this issue).
// Phase 3.12 (Sales Return / Credit Note) prerequisite — `id` is the
// authoritative SALE StockMovement id, already returned by inventory-service
// (verified against StockIssueResult) but previously left uncaptured here;
// captured positionally onto ShipmentItem.inventoryMovementId, mirroring
// GoodsReceiptItem.inventoryMovementId's own capture exactly.
export interface InventoryStockIssueMovement {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string | null;
  totalCost: string | null;
}

export interface InventoryStockIssueResult {
  created: boolean;
  movements: InventoryStockIssueMovement[];
}

// Phase 3.12 (Sales Return / Credit Note) — inventory-service's stock-returns
// endpoint already accepts 'sales_return' (Phase 3.4) and, once inventory-
// service is extended, 'sales_return_reversal' (mirrors purchase-service's
// own InventoryStockPurchaseReturnRequest shape exactly). Additive on the
// inventory side (stock comes back in from the customer); costed at the
// ORIGINAL SALE movement's own unitCost, never client-supplied.
// Phase 3.16 (Shipment Cancellation / COGS Reversal) adds
// 'shipment_reversal' — undoes the original SALE movement directly (the
// root shipment-issue movement, never a derivative), also additive, also
// costed at that SALE movement's own unitCost.
export interface InventoryStockSalesReturnRequest {
  referenceType: 'sales_return' | 'sales_return_reversal' | 'shipment_reversal';
  referenceId: string;
  warehouseId: string;
  lines: Array<{
    productId: string;
    quantity: string;
    // The AUTHORITATIVE selector for which original movement this line
    // returns against — ShipmentItem.inventoryMovementId for 'sales_return',
    // SalesReturnItem.inventoryMovementId for 'sales_return_reversal'. Never
    // resolved by (referenceType, referenceId, productId) lookup.
    originalMovementId: string;
  }>;
}

// Positional per-line movement summary from inventory-service's response —
// movements[i] corresponds to lines[i] of the request, mirrors purchase-
// service's InventoryStockReturnMovementSummary exactly.
export interface InventoryStockSalesReturnMovementSummary {
  id: string;
  productId: string;
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
    private readonly config: ConfigService<SalesEnvironmentVariables, true>,
  ) {}

  async applyIssue(
    actor: ActorContext,
    body: InventoryStockIssueRequest,
  ): Promise<InventoryStockIssueResult> {
    const base = this.config
      .get('INVENTORY_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    const secret = this.config.get('INTERNAL_SERVICE_SECRET', { infer: true });
    try {
      const response = await firstValueFrom(
        this.http.post<InventoryEnvelope<InventoryStockIssueResult>>(
          `${base}/api/v1/internal/stock/issues`,
          body,
          {
            headers: {
              [INTERNAL_SERVICE_SECRET_HEADER]: secret,
              [ACTOR_USER_ID_HEADER]: actor.userId,
              [ACTOR_TENANT_ID_HEADER]: actor.tenantId,
            },
            validateStatus: (status) => status === 200 || status === 201,
          },
        ),
      );
      const data = response.data.data;
      return {
        created: response.status === 201,
        movements: data?.movements ?? [],
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  // Phase 3.12 — modeled directly on purchase-service's own applyReturn():
  // same base URL, headers, validateStatus, and error mapping; the endpoint
  // path is shared (POST .../stock/returns, the primitive Phase 3.4 built)
  // and the request/response shapes are the sales-return-specific ones above.
  async applyReturn(
    actor: ActorContext,
    body: InventoryStockSalesReturnRequest,
  ): Promise<{
    created: boolean;
    movements: InventoryStockSalesReturnMovementSummary[];
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
