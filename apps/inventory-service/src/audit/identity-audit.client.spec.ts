import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { INTERNAL_SERVICE_SECRET_HEADER } from '@app/common';
import { IdentityAuditClient } from './identity-audit.client';
import { InventoryEnvironmentVariables } from '../config/inventory-env';

const INTERNAL_SECRET = 'test-internal-service-secret';

function config(): ConfigService<InventoryEnvironmentVariables, true> {
  return {
    get: (key: string) => {
      if (key === 'IDENTITY_SERVICE_URL') {
        return 'http://localhost:3001';
      }
      if (key === 'INTERNAL_SERVICE_SECRET') {
        return INTERNAL_SECRET;
      }
      return undefined;
    },
  } as unknown as ConfigService<InventoryEnvironmentVariables, true>;
}

describe('IdentityAuditClient', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  it('posts sanitized inventory audit events to Identity', async () => {
    const post = jest.fn().mockReturnValue(of({ data: { recorded: true } }));
    const client = new IdentityAuditClient(
      { post } as unknown as HttpService,
      config(),
    );

    await client.record({
      actor,
      action: 'stock.adjusted',
      resource: 'stock',
      resourceId: 'stock-1',
      metadata: { productId: 'p1', password: 'nope' },
    });

    expect(post).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/internal/audit',
      expect.objectContaining({
        action: 'stock.adjusted',
        tenantId: actor.tenantId,
        userId: actor.userId,
      }),
      {
        headers: {
          [INTERNAL_SERVICE_SECRET_HEADER]: INTERNAL_SECRET,
        },
      },
    );
  });

  it('does not throw when Identity audit is unavailable', async () => {
    const client = new IdentityAuditClient(
      {
        post: jest.fn().mockReturnValue(throwError(() => new Error('down'))),
      } as unknown as HttpService,
      config(),
    );

    await expect(
      client.record({
        actor,
        action: 'product.created',
        resource: 'product',
        resourceId: 'p1',
      }),
    ).resolves.toBeUndefined();
  });
});
