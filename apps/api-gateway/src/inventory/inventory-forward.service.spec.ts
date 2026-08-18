import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ACTOR_TENANT_ID_HEADER, ACTOR_USER_ID_HEADER } from '@app/common';
import { DownstreamRegistry } from '../downstream/downstream.registry';
import { InventoryForwardService } from './inventory-forward.service';

function firstArg<T>(mock: jest.Mock): T {
  const [first] = mock.mock.calls as unknown as [T][];
  return first[0];
}

describe('InventoryForwardService', () => {
  const user = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  it('forwards JWT actor headers and strips tenantId from body and query', async () => {
    const request = jest.fn().mockReturnValue(
      of({
        data: {
          success: true,
          data: { items: [] },
        },
      }),
    );
    const service = new InventoryForwardService(
      { request } as unknown as HttpService,
      {
        getUrl: () => 'http://localhost:3003',
      } as unknown as DownstreamRegistry,
    );

    await service.forward({
      method: 'GET',
      path: '/api/v1/stock',
      user,
      body: { tenantId: 'spoof' },
      query: { productId: 'p1', tenantId: 'spoof' },
    });

    const requestArg = firstArg<{
      data: Record<string, unknown>;
      params: Record<string, unknown>;
      url: string;
      headers: Record<string, string>;
    }>(request);
    expect(requestArg.url).toBe('http://localhost:3003/api/v1/stock');
    expect(requestArg.data).toEqual({});
    expect(requestArg.params).toEqual({ productId: 'p1' });
    expect(requestArg.headers[ACTOR_USER_ID_HEADER]).toBe(user.userId);
    expect(requestArg.headers[ACTOR_TENANT_ID_HEADER]).toBe(user.tenantId);
  });
});
