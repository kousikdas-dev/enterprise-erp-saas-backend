import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ACTOR_TENANT_ID_HEADER, ACTOR_USER_ID_HEADER } from '@app/common';
import { DownstreamRegistry } from '../downstream/downstream.registry';
import { IdentityForwardService } from './identity-forward.service';

function firstArg<T>(mock: jest.Mock): T {
  const [first] = mock.mock.calls as unknown as [T][];
  return first[0];
}

describe('IdentityForwardService', () => {
  const user = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  it('forwards JWT actor headers and strips tenantId from the body', async () => {
    const request = jest.fn().mockReturnValue(
      of({
        data: {
          success: true,
          data: { id: 'tenant-1' },
        },
      }),
    );
    const service = new IdentityForwardService(
      { request } as unknown as HttpService,
      {
        getUrl: () => 'http://localhost:3001',
      } as unknown as DownstreamRegistry,
    );

    await service.forward({
      method: 'POST',
      path: '/api/v1/tenants',
      user,
      body: { name: 'Acme', code: 'ACME', tenantId: 'spoof' },
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    const requestArg = firstArg<{
      data: Record<string, unknown>;
      url: string;
      headers: Record<string, string>;
    }>(request);
    expect(requestArg.url).toBe('http://localhost:3001/api/v1/tenants');
    expect(requestArg.data).toEqual({ name: 'Acme', code: 'ACME' });
    expect(requestArg.data).not.toHaveProperty('tenantId');
    expect(requestArg.headers[ACTOR_USER_ID_HEADER]).toBe(user.userId);
    expect(requestArg.headers[ACTOR_TENANT_ID_HEADER]).toBe(user.tenantId);
  });
});
