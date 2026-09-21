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

export type JournalPostingRole =
  'SALES_REVENUE' | 'ACCOUNTS_RECEIVABLE' | 'OUTPUT_TAX' | 'PAYMENT_METHOD';

export interface JournalPostingLineRequest {
  role: JournalPostingRole;
  side: 'DEBIT' | 'CREDIT';
  amount: string;
  paymentMethodId?: string;
  description?: string;
}

export interface CreateJournalPostingRequest {
  sourceService: string;
  sourceType: string;
  sourceId: string;
  entryDate?: string;
  description?: string;
  lines: JournalPostingLineRequest[];
}

export interface ReverseJournalPostingRequest {
  sourceService: string;
  sourceType: string;
  sourceId: string;
  reversalSourceType: string;
  entryDate?: string;
  description?: string;
}

export interface JournalPostingResponse {
  id: string;
  entryNumber: string;
  status: string;
  sourceService: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reversesJournalEntryId: string | null;
  idempotentReplay: boolean;
  totalDebit: string;
  totalCredit: string;
}

interface AccountingEnvelope<T> {
  success?: boolean;
  data?: T;
}

/**
 * Sales Accounting Integration — sibling to AccountingTaxCodeClient, same
 * direct-HTTP-to-accounting-service pattern (bypasses the gateway, internal-
 * secret + actor headers), exact mirror of Purchase's
 * AccountingJournalClient (Phase C1/C2). Never called from inside a Prisma
 * transaction (mirrors the repo-wide rule already followed for every other
 * external call from this service) — always invoked after the caller's own
 * transaction has committed.
 */
@Injectable()
export class AccountingJournalClient {
  private readonly logger = new Logger(AccountingJournalClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<SalesEnvironmentVariables, true>,
  ) {}

  async post(
    actor: ActorContext,
    request: CreateJournalPostingRequest,
  ): Promise<JournalPostingResponse> {
    return this.call('/api/v1/internal/journal-postings', actor, request);
  }

  async reverse(
    actor: ActorContext,
    request: ReverseJournalPostingRequest,
  ): Promise<JournalPostingResponse> {
    return this.call(
      '/api/v1/internal/journal-postings/reverse',
      actor,
      request,
    );
  }

  private async call(
    path: string,
    actor: ActorContext,
    body: unknown,
  ): Promise<JournalPostingResponse> {
    const base = this.config
      .get('ACCOUNTING_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    const secret = this.config.get('INTERNAL_SERVICE_SECRET', { infer: true });

    try {
      const response = await firstValueFrom(
        this.http.post<AccountingEnvelope<JournalPostingResponse>>(
          `${base}${path}`,
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
      return response.data.data as JournalPostingResponse;
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
