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

export interface UnbuildPostingLine {
  productId: string;
  quantity: string;
}

export interface UnbuildPostingMovement {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
}

export interface UnbuildPostingResult {
  created: boolean;
  referenceId: string;
  warehouseId: string;
  finishedGoodsMovement: UnbuildPostingMovement;
  componentMovements: UnbuildPostingMovement[];
}

export interface UnbuildPostingRequest {
  referenceId: string;
  warehouseId: string;
  finishedGood: UnbuildPostingLine;
  components: UnbuildPostingLine[];
}

interface InventoryEnvelope<T> {
  success?: boolean;
  data?: T;
}

/**
 * Posts an Unbuild Order's stock effect to inventory-service's internal,
 * idempotent unbuild-postings endpoint. The error mapping below is what
 * UnbuildOrdersService.complete() relies on to decide whether a failure is
 * a definite rejection (safe to revert the order's PROCESSING claim back to
 * DRAFT) or ambiguous (must leave the claim in place and let a retry
 * resolve it — see design report, "Concurrency and recovery"):
 * NotFoundException/ConflictException/BadRequestException are definite;
 * ServiceUnavailableException/BadGatewayException are ambiguous.
 */
@Injectable()
export class InventoryUnbuildClient {
  private readonly logger = new Logger(InventoryUnbuildClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<ProductionEnvironmentVariables, true>,
  ) {}

  async post(
    actor: ActorContext,
    request: UnbuildPostingRequest,
  ): Promise<UnbuildPostingResult> {
    const base = this.config
      .get('INVENTORY_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    const secret = this.config.get('INTERNAL_SERVICE_SECRET', { infer: true });
    try {
      const response = await firstValueFrom(
        this.http.post<InventoryEnvelope<UnbuildPostingResult>>(
          `${base}/api/v1/internal/stock/unbuild-postings`,
          {
            referenceType: 'unbuild_order',
            referenceId: request.referenceId,
            warehouseId: request.warehouseId,
            finishedGood: request.finishedGood,
            components: request.components,
          },
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
      return response.data.data as UnbuildPostingResult;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (isAxiosError(error)) {
      if (!error.response) {
        this.logger.warn('Inventory service unreachable for unbuild posting');
        throw new ServiceUnavailableException('Inventory service unavailable');
      }
      const status = error.response.status;
      const message =
        (error.response.data as { message?: string } | undefined)?.message ??
        'Inventory service error';
      if (status === 404) throw new NotFoundException(message);
      if (status === 409) throw new ConflictException(message);
      if (status === 400) throw new ConflictException(message);
      // 5xx and anything else from inventory-service is ambiguous, not a
      // definite rejection — the posting transaction may have committed on
      // its side even though this response itself failed.
      throw new BadGatewayException('Inventory service error');
    }
    throw new BadGatewayException('Inventory service error');
  }
}
