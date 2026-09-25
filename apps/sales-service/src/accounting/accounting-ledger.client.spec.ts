import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { AccountingLedgerClient } from './accounting-ledger.client';

describe('AccountingLedgerClient', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  function buildClient(getImpl: (...args: unknown[]) => unknown) {
    const http = { get: jest.fn(getImpl) } as unknown as HttpService;
    const config = {
      get: jest.fn().mockReturnValue('http://accounting-service:3004'),
    } as any;
    return new AccountingLedgerClient(http, config);
  }

  function axiosResponse<T>(data: T): AxiosResponse<{ success: true; data: T }> {
    return {
      data: { success: true, data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    };
  }

  describe('findAccountsReceivableMapping', () => {
    it('parses the real /account-mappings envelope shape ({ data: { items: [...] } }), not a bare array', async () => {
      // Same shape the /account-mappings endpoint actually returns — see
      // purchase-service's AccountingLedgerClient for the live-verified bug
      // this guards against (an earlier version assumed a bare array).
      const client = buildClient(() =>
        of(
          axiosResponse({
            items: [
              {
                id: 'm1',
                purpose: 'SALES_REVENUE',
                externalRefId: '',
                accountId: 'acc-revenue',
                account: { id: 'acc-revenue', code: '4001', name: 'Sales Revenue' },
              },
              {
                id: 'm2',
                purpose: 'ACCOUNTS_RECEIVABLE',
                externalRefId: '',
                accountId: 'acc-ar',
                account: { id: 'acc-ar', code: '1201', name: 'Accounts Receivable' },
              },
            ],
          }),
        ),
      );

      const result = await client.findAccountsReceivableMapping(actor);

      expect(result).toEqual({
        accountId: 'acc-ar',
        accountCode: '1201',
        accountName: 'Accounts Receivable',
      });
    });

    it('returns null when no ACCOUNTS_RECEIVABLE mapping is configured', async () => {
      const client = buildClient(() =>
        of(
          axiosResponse({
            items: [
              {
                id: 'm1',
                purpose: 'SALES_REVENUE',
                externalRefId: '',
                accountId: 'acc-revenue',
                account: { id: 'acc-revenue', code: '4001', name: 'Sales Revenue' },
              },
            ],
          }),
        ),
      );

      const result = await client.findAccountsReceivableMapping(actor);
      expect(result).toBeNull();
    });

    it('returns null when the response has no items at all', async () => {
      const client = buildClient(() => of(axiosResponse({ items: [] })));
      const result = await client.findAccountsReceivableMapping(actor);
      expect(result).toBeNull();
    });

    it('ignores an ACCOUNTS_RECEIVABLE row with a non-empty externalRefId (per-entity, not the tenant singleton)', async () => {
      const client = buildClient(() =>
        of(
          axiosResponse({
            items: [
              {
                id: 'm1',
                purpose: 'ACCOUNTS_RECEIVABLE',
                externalRefId: 'some-entity-id',
                accountId: 'acc-ar',
                account: { id: 'acc-ar', code: '1201', name: 'Accounts Receivable' },
              },
            ],
          }),
        ),
      );

      const result = await client.findAccountsReceivableMapping(actor);
      expect(result).toBeNull();
    });

    it('sends the two actor headers and no internal-service secret', async () => {
      const getSpy = jest.fn(() => of(axiosResponse({ items: [] })));
      const client = buildClient(getSpy);

      await client.findAccountsReceivableMapping(actor);

      expect(getSpy).toHaveBeenCalledWith(
        'http://accounting-service:3004/api/v1/account-mappings',
        expect.objectContaining({
          headers: {
            'x-actor-user-id': actor.userId,
            'x-actor-tenant-id': actor.tenantId,
          },
        }),
      );
    });

    it('throws ServiceUnavailableException when accounting-service is unreachable', async () => {
      const client = buildClient(() =>
        throwError(() => ({ isAxiosError: true, response: undefined })),
      );
      await expect(client.findAccountsReceivableMapping(actor)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('throws BadGatewayException on an unexpected upstream status', async () => {
      const client = buildClient(() =>
        throwError(() => ({ isAxiosError: true, response: { status: 500 } })),
      );
      await expect(client.findAccountsReceivableMapping(actor)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('getAccountBalance', () => {
    it('reads closingBalance from the account ledger response envelope', async () => {
      const client = buildClient(() => of(axiosResponse({ closingBalance: '980.0000' })));
      const result = await client.getAccountBalance(actor, 'acc-ar');
      expect(result).toBe('980.0000');
    });

    it('requests limit=1 against /accounts/:id/ledger', async () => {
      const getSpy = jest.fn(() => of(axiosResponse({ closingBalance: '0.0000' })));
      const client = buildClient(getSpy);

      await client.getAccountBalance(actor, 'acc-ar');

      expect(getSpy).toHaveBeenCalledWith(
        'http://accounting-service:3004/api/v1/accounts/acc-ar/ledger',
        expect.objectContaining({ params: { limit: 1 } }),
      );
    });

    it('throws BadGatewayException when the envelope carries no data', async () => {
      const client = buildClient(() =>
        of({ data: { success: true }, status: 200, statusText: 'OK', headers: {}, config: {} as any }),
      );
      await expect(client.getAccountBalance(actor, 'acc-ar')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });
});
