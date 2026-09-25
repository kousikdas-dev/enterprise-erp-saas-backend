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

  describe('findAccountsPayableMapping', () => {
    it('parses the real /account-mappings envelope shape ({ data: { items: [...] } }), not a bare array', async () => {
      // Regression test: account-mappings.service.ts's list() returns
      // `{ items: [...] }`, wrapped again by the global response envelope as
      // `{ data: { items: [...] } }`. An earlier version of this client
      // assumed `response.data.data` WAS the array directly, which crashed
      // (TypeError: rows.find is not a function) and surfaced as a 502 —
      // caught live via Docker verification, not by any unit test.
      const client = buildClient(() =>
        of(
          axiosResponse({
            items: [
              {
                id: 'm1',
                purpose: 'PURCHASE_EXPENSE',
                externalRefId: '',
                accountId: 'acc-expense',
                account: { id: 'acc-expense', code: '5001', name: 'Purchase Expense' },
              },
              {
                id: 'm2',
                purpose: 'ACCOUNTS_PAYABLE',
                externalRefId: '',
                accountId: 'acc-ap',
                account: { id: 'acc-ap', code: '2001', name: 'Accounts Payable' },
              },
            ],
          }),
        ),
      );

      const result = await client.findAccountsPayableMapping(actor);

      expect(result).toEqual({
        accountId: 'acc-ap',
        accountCode: '2001',
        accountName: 'Accounts Payable',
      });
    });

    it('returns null when no ACCOUNTS_PAYABLE mapping is configured', async () => {
      const client = buildClient(() =>
        of(
          axiosResponse({
            items: [
              {
                id: 'm1',
                purpose: 'PURCHASE_EXPENSE',
                externalRefId: '',
                accountId: 'acc-expense',
                account: { id: 'acc-expense', code: '5001', name: 'Purchase Expense' },
              },
            ],
          }),
        ),
      );

      const result = await client.findAccountsPayableMapping(actor);
      expect(result).toBeNull();
    });

    it('returns null when the response has no items at all', async () => {
      const client = buildClient(() => of(axiosResponse({ items: [] })));
      const result = await client.findAccountsPayableMapping(actor);
      expect(result).toBeNull();
    });

    it('ignores an ACCOUNTS_PAYABLE row with a non-empty externalRefId (per-entity, not the tenant singleton)', async () => {
      const client = buildClient(() =>
        of(
          axiosResponse({
            items: [
              {
                id: 'm1',
                purpose: 'ACCOUNTS_PAYABLE',
                externalRefId: 'some-entity-id',
                accountId: 'acc-ap',
                account: { id: 'acc-ap', code: '2001', name: 'Accounts Payable' },
              },
            ],
          }),
        ),
      );

      const result = await client.findAccountsPayableMapping(actor);
      expect(result).toBeNull();
    });

    it('sends the two actor headers and no internal-service secret', async () => {
      const getSpy = jest.fn(() => of(axiosResponse({ items: [] })));
      const client = buildClient(getSpy);

      await client.findAccountsPayableMapping(actor);

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
      await expect(client.findAccountsPayableMapping(actor)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('throws BadGatewayException on an unexpected upstream status', async () => {
      const client = buildClient(() =>
        throwError(() => ({ isAxiosError: true, response: { status: 500 } })),
      );
      await expect(client.findAccountsPayableMapping(actor)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('getAccountBalance', () => {
    it('reads closingBalance from the account ledger response envelope', async () => {
      const client = buildClient(() => of(axiosResponse({ closingBalance: '1470.0000' })));
      const result = await client.getAccountBalance(actor, 'acc-ap');
      expect(result).toBe('1470.0000');
    });

    it('requests limit=1 against /accounts/:id/ledger', async () => {
      const getSpy = jest.fn(() => of(axiosResponse({ closingBalance: '0.0000' })));
      const client = buildClient(getSpy);

      await client.getAccountBalance(actor, 'acc-ap');

      expect(getSpy).toHaveBeenCalledWith(
        'http://accounting-service:3004/api/v1/accounts/acc-ap/ledger',
        expect.objectContaining({ params: { limit: 1 } }),
      );
    });

    it('throws BadGatewayException when the envelope carries no data', async () => {
      const client = buildClient(() =>
        of({ data: { success: true }, status: 200, statusText: 'OK', headers: {}, config: {} as any }),
      );
      await expect(client.getAccountBalance(actor, 'acc-ap')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });
});
