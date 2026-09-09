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

export interface TaxCodeComponentResponse {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: string;
}

export interface TaxCodeResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  components: TaxCodeComponentResponse[];
}

interface AccountingEnvelope<T> {
  success?: boolean;
  data?: T;
}

@Injectable()
export class AccountingTaxCodeClient {
  private readonly logger = new Logger(AccountingTaxCodeClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<SalesEnvironmentVariables, true>,
  ) {}

  async getById(actor: ActorContext, id: string): Promise<TaxCodeResponse> {
    const base = this.config
      .get('ACCOUNTING_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    const secret = this.config.get('INTERNAL_SERVICE_SECRET', { infer: true });
    try {
      const response = await firstValueFrom(
        this.http.get<AccountingEnvelope<TaxCodeResponse>>(
          `${base}/api/v1/internal/tax-codes/${id}`,
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
      return response.data.data as TaxCodeResponse;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (isAxiosError(error)) {
      if (!error.response) {
        this.logger.warn('Accounting service unreachable');
        throw new ServiceUnavailableException('Accounting service unavailable');
      }
      const status = error.response.status;
      const message =
        (error.response.data as { message?: string } | undefined)?.message ??
        'Accounting service error';
      if (status === 404) throw new NotFoundException(message);
      if (status === 409) throw new ConflictException(message);
      if (status === 400) throw new ConflictException(message);
      throw new BadGatewayException('Accounting service error');
    }
    throw new BadGatewayException('Accounting service error');
  }
}
