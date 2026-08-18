import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { INTERNAL_SERVICE_SECRET_HEADER } from '@app/common';
import { AuditService } from '../audit/audit.service';
import { InternalAuditController } from '../audit/internal-audit.controller';
import { InternalServiceGuard } from './internal-service.guard';

const SECRET = 'test-internal-service-secret';

const validBody = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  action: 'product.created',
  resource: 'product',
  resourceId: '55555555-aaaa-4aaa-8aaa-555555555555',
  metadata: { sku: 'SKU-001' },
};

describe('InternalServiceGuard (internal audit)', () => {
  let app: INestApplication;
  let server: Server;
  let record: jest.Mock;

  beforeAll(async () => {
    record = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ INTERNAL_SERVICE_SECRET: SECRET })],
        }),
      ],
      controllers: [InternalAuditController],
      providers: [
        InternalServiceGuard,
        { provide: AuditService, useValue: { record } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 when the internal secret is missing', async () => {
    await request(server).post('/internal/audit').send(validBody).expect(401);
    expect(record).not.toHaveBeenCalled();
  });

  it('returns 401 when the internal secret is invalid', async () => {
    await request(server)
      .post('/internal/audit')
      .set(INTERNAL_SERVICE_SECRET_HEADER, 'wrong-internal-service-secret')
      .send(validBody)
      .expect(401);
    expect(record).not.toHaveBeenCalled();
  });

  it('records the audit when the internal secret is valid', async () => {
    await request(server)
      .post('/internal/audit')
      .set(INTERNAL_SERVICE_SECRET_HEADER, SECRET)
      .send(validBody)
      .expect(201);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.created',
        resource: 'product',
        resourceId: validBody.resourceId,
        resourceTenantId: validBody.tenantId,
        actor: {
          userId: validBody.userId,
          tenantId: validBody.tenantId,
        },
      }),
    );
  });
});
