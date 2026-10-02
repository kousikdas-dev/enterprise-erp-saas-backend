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
import { ProductionEnvironmentVariables } from '../config/production-env';

export interface InventoryProductDetail {
  id: string;
  sku: string;
  name: string;
  isActive: boolean;
  trackInventory: boolean;
  productType: string;
  categoryId: string;
  unitOfMeasureId: string;
  base: { unitOfMeasureId: string; code: string; name: string };
  alternatives: Array<{
    unitOfMeasureId: string;
    code: string;
    name: string;
    conversionFactor: string;
    sellingPrice: string;
  }>;
}

interface InventoryEnvelope<T> {
  success?: boolean;
  data?: T;
}

@Injectable()
export class InventoryProductClient {
  private readonly logger = new Logger(InventoryProductClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<ProductionEnvironmentVariables, true>,
  ) {}

  async getProductDetail(
    actor: ActorContext,
    productId: string,
  ): Promise<InventoryProductDetail> {
    const base = this.config
      .get('INVENTORY_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    const secret = this.config.get('INTERNAL_SERVICE_SECRET', { infer: true });
    try {
      const response = await firstValueFrom(
        this.http.get<InventoryEnvelope<InventoryProductDetail>>(
          `${base}/api/v1/internal/products/${productId}`,
          {
            headers: {
              [INTERNAL_SERVICE_SECRET_HEADER]: secret,
              [ACTOR_USER_ID_HEADER]: actor.userId,
              [ACTOR_TENANT_ID_HEADER]: actor.tenantId,
            },
            validateStatus: (status) => status === 200,
          },
        ),
      );
      return response.data.data as InventoryProductDetail;
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
