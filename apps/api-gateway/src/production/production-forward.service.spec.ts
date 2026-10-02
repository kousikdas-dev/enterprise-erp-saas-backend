import {
  ConflictException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { ACTOR_TENANT_ID_HEADER, ACTOR_USER_ID_HEADER } from '@app/common';
import { DownstreamRegistry } from '../downstream/downstream.registry';
import { ProductionForwardService } from './production-forward.service';

function firstArg<T>(mock: jest.Mock): T {
  const [first] = mock.mock.calls as unknown as [T][];
  return first[0];
}

describe('ProductionForwardService', () => {
  const user = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  it('forwards actor headers to production-service and strips tenantId from body/query', async () => {
    const request = jest.fn().mockReturnValue(
      of({ data: { success: true, data: { items: [] } } }),
    );
    const service = new ProductionForwardService(
      { request } as unknown as HttpService,
      { getUrl: () => 'http://localhost:3007' } as unknown as DownstreamRegistry,
    );

    await service.forward({
      method: 'GET',
      path: '/api/v1/boms',
      user,
      body: { tenantId: 'spoof' },
      query: { parentProductId: 'p1', tenantId: 'spoof' },
    });

    const requestArg = firstArg<{
      data: Record<string, unknown>;
      params: Record<string, unknown>;
      url: string;
      headers: Record<string, string>;
    }>(request);
    expect(requestArg.url).toBe('http://localhost:3007/api/v1/boms');
    expect(requestArg.data).toEqual({});
    expect(requestArg.params).toEqual({ parentProductId: 'p1' });
    expect(requestArg.headers[ACTOR_USER_ID_HEADER]).toBe(user.userId);
    expect(requestArg.headers[ACTOR_TENANT_ID_HEADER]).toBe(user.tenantId);
  });

  it('remaps a 409 from production-service into a ConflictException, preserving message', async () => {
    const axiosError = new AxiosError('Request failed');
    axiosError.response = {
      status: 409,
      data: { success: false, message: 'This BOM would create a circular reference' },
    } as never;
    const request = jest.fn().mockReturnValue(throwError(() => axiosError));
    const service = new ProductionForwardService(
      { request } as unknown as HttpService,
      { getUrl: () => 'http://localhost:3007' } as unknown as DownstreamRegistry,
    );

    const error = await service
      .forward({ method: 'POST', path: '/api/v1/boms', user })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    const response = (error as ConflictException).getResponse() as { message: unknown };
    expect(response.message).toBe('This BOM would create a circular reference');
  });

  it('remaps a 501 from production-service into a NotImplementedException, preserving message', async () => {
    const axiosError = new AxiosError('Request failed');
    axiosError.response = {
      status: 501,
      data: {
        success: false,
        message: 'Completing a production order requires Production Receipt, which is not implemented yet',
      },
    } as never;
    const request = jest.fn().mockReturnValue(throwError(() => axiosError));
    const service = new ProductionForwardService(
      { request } as unknown as HttpService,
      { getUrl: () => 'http://localhost:3007' } as unknown as DownstreamRegistry,
    );

    const error = await service
      .forward({ method: 'POST', path: '/api/v1/production-orders/1/complete', user })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotImplementedException);
    const response = (error as NotImplementedException).getResponse() as { message: unknown };
    expect(response.message).toBe(
      'Completing a production order requires Production Receipt, which is not implemented yet',
    );
  });

  it('maps an unreachable production-service to a ServiceUnavailableException', async () => {
    const axiosError = new AxiosError('connect ECONNREFUSED');
    const request = jest.fn().mockReturnValue(throwError(() => axiosError));
    const service = new ProductionForwardService(
      { request } as unknown as HttpService,
      { getUrl: () => 'http://localhost:3007' } as unknown as DownstreamRegistry,
    );

    const error = await service
      .forward({ method: 'GET', path: '/api/v1/boms', user })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
  });
});
