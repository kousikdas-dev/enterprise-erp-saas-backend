import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ACTOR_TENANT_ID_HEADER, ACTOR_USER_ID_HEADER } from '@app/common';
import { ActorContext } from '../auth/actor-context';
import { SalesEnvironmentVariables } from '../config/sales-env';

// accounting-service's public /account-mappings and /accounts/:id/ledger
// routes are guarded only by ActorGuard (the two actor headers) — no
// internal secret variant exists for either, unlike AccountingTaxCodeClient/
// AccountingJournalClient's /internal/* routes. Mirrors
// purchase-service/src/accounting/accounting-ledger.client.ts exactly.
interface AccountMappingRow {
  id: string;
  purpose: string;
  externalRefId: string;
  accountId: string;
  account?: { id: string; code: string; name: string } | null;
}

interface AccountMappingListResponse {
  items: AccountMappingRow[];
}

interface AccountLedgerResponse {
  closingBalance: string;
}

interface AccountingEnvelope<T> {
  success?: boolean;
  data?: T;
}

export interface AccountsReceivableMapping {
  accountId: string;
  accountCode: string;
  accountName: string;
}

@Injectable()
export class AccountingLedgerClient {
  private readonly logger = new Logger(AccountingLedgerClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<SalesEnvironmentVariables, true>,
  ) {}

  /** Resolves the tenant's ACCOUNTS_RECEIVABLE account mapping, or null if
   * the tenant has not configured one yet — a data-completeness gap, not an
   * error, so callers surface it as such rather than failing the request. */
  async findAccountsReceivableMapping(
    actor: ActorContext,
  ): Promise<AccountsReceivableMapping | null> {
    const base = this.baseUrl();
    try {
      const response = await firstValueFrom(
        this.http.get<AccountingEnvelope<AccountMappingListResponse>>(
          `${base}/api/v1/account-mappings`,
          {
            headers: this.actorHeaders(actor),
            validateStatus: (status) => status === 200,
          },
        ),
      );
      const rows = response.data.data?.items ?? [];
      const row = rows.find(
        (item) => item.purpose === 'ACCOUNTS_RECEIVABLE' && item.externalRefId === '',
      );
      if (!row || !row.account) {
        return null;
      }
      return {
        accountId: row.account.id,
        accountCode: row.account.code,
        accountName: row.account.name,
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  /** The account's all-time closing balance (no date window) — its current
   * balance as of now. */
  async getAccountBalance(actor: ActorContext, accountId: string): Promise<string> {
    const base = this.baseUrl();
    try {
      const response = await firstValueFrom(
        this.http.get<AccountingEnvelope<AccountLedgerResponse>>(
          `${base}/api/v1/accounts/${accountId}/ledger`,
          {
            headers: this.actorHeaders(actor),
            params: { limit: 1 },
            validateStatus: (status) => status === 200,
          },
        ),
      );
      const data = response.data.data;
      if (!data) {
        throw new BadGatewayException('Accounting service error');
      }
      return data.closingBalance;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private actorHeaders(actor: ActorContext): Record<string, string> {
    return {
      [ACTOR_USER_ID_HEADER]: actor.userId,
      [ACTOR_TENANT_ID_HEADER]: actor.tenantId,
    };
  }

  private baseUrl(): string {
    return this.config
      .get('ACCOUNTING_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
  }

  private rethrow(error: unknown): never {
    if (isAxiosError(error)) {
      if (!error.response) {
        this.logger.warn('Accounting service unreachable');
        throw new ServiceUnavailableException('Accounting service unavailable');
      }
      this.logger.warn(`Accounting service returned status ${error.response.status}`);
      throw new BadGatewayException('Accounting service error');
    }
    throw new BadGatewayException('Accounting service error');
  }
}
