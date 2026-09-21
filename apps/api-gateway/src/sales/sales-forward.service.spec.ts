import { ConflictException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { ACTOR_TENANT_ID_HEADER, ACTOR_USER_ID_HEADER } from '@app/common';
import { DownstreamRegistry } from '../downstream/downstream.registry';
import { SalesForwardService } from './sales-forward.service';

function firstArg<T>(mock: jest.Mock): T {
  const [first] = mock.mock.calls as unknown as [T][];
  return first[0];
}

describe('SalesForwardService', () => {
  const user = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  it('forwards JWT actor headers and strips tenantId from body and query', async () => {
    const request = jest.fn().mockReturnValue(
      of({ data: { success: true, data: { items: [] } } }),
    );
    const service = new SalesForwardService(
      { request } as unknown as HttpService,
      { getUrl: () => 'http://localhost:3002' } as unknown as DownstreamRegistry,
    );

    await service.forward({
      method: 'GET',
      path: '/api/v1/shipments',
      user,
      body: { tenantId: 'spoof' },
      query: { tenantId: 'spoof' },
    });

    const requestArg = firstArg<{
      data: Record<string, unknown>;
      params: Record<string, unknown>;
      url: string;
      headers: Record<string, string>;
    }>(request);
    expect(requestArg.url).toBe('http://localhost:3002/api/v1/shipments');
    expect(requestArg.data).toEqual({});
    expect(requestArg.params).toEqual({});
    expect(requestArg.headers[ACTOR_USER_ID_HEADER]).toBe(user.userId);
    expect(requestArg.headers[ACTOR_TENANT_ID_HEADER]).toBe(user.tenantId);
  });

  it('preserves a downstream error\'s machine-readable code/details rather than collapsing it to a plain message', async () => {
    const axiosError = new AxiosError('Request failed');
    axiosError.response = {
      status: 409,
      data: {
        success: false,
        code: 'SHIPMENT_CONVERSION_UNRESOLVED',
        message: 'Shipment cannot be posted',
        details: [{ shipmentItemId: 'shi1' }],
      },
    } as never;
    const request = jest.fn().mockReturnValue(throwError(() => axiosError));
    const service = new SalesForwardService(
      { request } as unknown as HttpService,
      { getUrl: () => 'http://localhost:3002' } as unknown as DownstreamRegistry,
    );

    const error: ConflictException = await service
      .forward({ method: 'POST', path: '/api/v1/shipments/x/post', user })
      .catch((e: unknown) => e as ConflictException);

    expect(error).toBeInstanceOf(ConflictException);
    const response = error.getResponse() as {
      code: string;
      message: string;
      details: unknown;
    };
    expect(response.code).toBe('SHIPMENT_CONVERSION_UNRESOLVED');
    expect(response.message).toBe('Shipment cannot be posted');
    expect(response.details).toEqual([{ shipmentItemId: 'shi1' }]);
  });

  it('falls back to a plain message when the downstream error carries no code/details', async () => {
    const axiosError = new AxiosError('Request failed');
    axiosError.response = {
      status: 404,
      data: { success: false, message: 'Shipment not found' },
    } as never;
    const request = jest.fn().mockReturnValue(throwError(() => axiosError));
    const service = new SalesForwardService(
      { request } as unknown as HttpService,
      { getUrl: () => 'http://localhost:3002' } as unknown as DownstreamRegistry,
    );

    const error = await service
      .forward({ method: 'GET', path: '/api/v1/shipments/x', user })
      .catch((e: unknown) => e);

    const response = (error as { getResponse(): { message: unknown } }).getResponse();
    expect(response.message).toBe('Shipment not found');
    expect(response).not.toHaveProperty('code');
    expect(response).not.toHaveProperty('details');
  });
});
