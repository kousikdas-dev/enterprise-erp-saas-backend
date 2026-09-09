import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ACTOR_TENANT_ID_HEADER,
  ACTOR_USER_ID_HEADER,
  INTERNAL_SERVICE_SECRET_HEADER,
} from '@app/common';
import {
  AccountingTaxCodeClient,
  TaxCodeResponse,
} from './accounting-tax-code.client';
import { SalesEnvironmentVariables } from '../config/sales-env';

const ACCOUNTING_SERVICE_URL = 'http://localhost:3004/';
const INTERNAL_SECRET = 'test-internal-service-secret';

function config(): ConfigService<SalesEnvironmentVariables, true> {
  return {
    get: (key: string) => {
      if (key === 'ACCOUNTING_SERVICE_URL') return ACCOUNTING_SERVICE_URL;
      if (key === 'INTERNAL_SERVICE_SECRET') return INTERNAL_SECRET;
      return undefined;
    },
  } as unknown as ConfigService<SalesEnvironmentVariables, true>;
}

function axiosError(status?: number, data?: unknown) {
  return {
    isAxiosError: true,
    response: status === undefined ? undefined : { status, data },
  };
}

describe('AccountingTaxCodeClient', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const taxCodeId = 'tc-1';

  const taxCode: TaxCodeResponse = {
    id: taxCodeId,
    code: 'GST18_LOCAL',
    name: 'GST 18% Local',
    description: null,
    isActive: true,
    components: [
      { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
      { id: 'comp-2', sequence: 2, type: 'SGST', name: null, rate: '9.0000' },
    ],
  };

  function createClient(get: jest.Mock) {
    return new AccountingTaxCodeClient(
      { get } as unknown as HttpService,
      config(),
    );
  }

  it('resolves to the unwrapped payload from the response envelope', async () => {
    const get = jest.fn().mockReturnValue(
      of({
        data: {
          success: true,
          statusCode: 200,
          data: taxCode,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      }),
    );
    const client = createClient(get);

    const result = await client.getById(actor, taxCodeId);

    expect(result).toEqual(taxCode);
  });

  it('calls the correct URL with the correct internal headers', async () => {
    const get = jest.fn().mockReturnValue(
      of({
        data: { success: true, statusCode: 200, data: taxCode, timestamp: '' },
      }),
    );
    const client = createClient(get);

    await client.getById(actor, taxCodeId);

    expect(get).toHaveBeenCalledWith(
      `http://localhost:3004/api/v1/internal/tax-codes/${taxCodeId}`,
      {
        headers: {
          [INTERNAL_SERVICE_SECRET_HEADER]: INTERNAL_SECRET,
          [ACTOR_USER_ID_HEADER]: actor.userId,
          [ACTOR_TENANT_ID_HEADER]: actor.tenantId,
        },
        validateStatus: expect.any(Function),
      },
    );
  });

  it('throws ServiceUnavailableException when Accounting is unreachable', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => axiosError()));
    const client = createClient(get);

    await expect(client.getById(actor, taxCodeId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws NotFoundException on a 404 response', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => axiosError(404)));
    const client = createClient(get);

    await expect(client.getById(actor, taxCodeId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws ConflictException on a 409 response', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => axiosError(409)));
    const client = createClient(get);

    await expect(client.getById(actor, taxCodeId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws ConflictException on a 400 response', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => axiosError(400)));
    const client = createClient(get);

    await expect(client.getById(actor, taxCodeId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws BadGatewayException on any other error status', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => axiosError(500)));
    const client = createClient(get);

    await expect(client.getById(actor, taxCodeId)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('throws BadGatewayException for a non-Axios error', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => new Error('boom')));
    const client = createClient(get);

    await expect(client.getById(actor, taxCodeId)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
