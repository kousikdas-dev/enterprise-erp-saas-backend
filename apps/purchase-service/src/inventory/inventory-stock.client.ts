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
  lines: Array<{ productId: string; quantity: string }>;
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
  ): Promise<{ created: boolean }> {
    const base = this.config
      .get('INVENTORY_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    const secret = this.config.get('INTERNAL_SERVICE_SECRET', { infer: true });
    try {
      const response = await firstValueFrom(
        this.http.post<InventoryEnvelope<{ created?: boolean }>>(
          `${base}/api/v1/internal/stock/receipts`,
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
      return { created: response.status === 201 };
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
