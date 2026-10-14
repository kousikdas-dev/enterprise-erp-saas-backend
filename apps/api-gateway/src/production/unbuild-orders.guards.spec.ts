import { Controller, Get, INestApplication, Patch, Post, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { PERMISSIONS } from '@app/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PERMISSION_RESOLVER } from '../rbac/permission-resolver';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';

@Controller('production-unbuild-orders-probe')
class ProductionUnbuildOrdersProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_READ)
  list(): { ok: true } {
    return { ok: true };
  }

  @Patch()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_UPDATE)
  update(): { ok: true } {
    return { ok: true };
  }

  @Post('complete')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_COMPLETE)
  complete(): { ok: true } {
    return { ok: true };
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_CANCEL)
  cancel(): { ok: true } {
    return { ok: true };
  }
}

describe('production Unbuild Order JWT and RBAC', () => {
  const secret = 'test-access-secret-change-me';
  let app: INestApplication;
  let jwtService: JwtService;
  let server: Server;
  let getPermissionKeys: jest.Mock;

  beforeAll(async () => {
    getPermissionKeys = jest.fn();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      controllers: [ProductionUnbuildOrdersProbeController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        PermissionsGuard,
        { provide: PERMISSION_RESOLVER, useValue: { getPermissionKeys } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    jwtService = moduleRef.get(JwtService);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  function signAccess(overrides: Record<string, string> = {}): string {
    return jwtService.sign(
      {
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'admin@demo.local',
        typ: 'access',
        ...overrides,
      },
      { expiresIn: '5m' },
    );
  }

  it('rejects requests with no access token', async () => {
    await request(server).get('/production-unbuild-orders-probe').expect(401);
  });

  it('requires production-unbuild-orders.create to create', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_READ]);
    await request(server)
      .post('/production-unbuild-orders-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_CREATE]);
    await request(server)
      .post('/production-unbuild-orders-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires production-unbuild-orders.read to list', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_CREATE]);
    await request(server)
      .get('/production-unbuild-orders-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_READ]);
    await request(server)
      .get('/production-unbuild-orders-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('requires production-unbuild-orders.update to update', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_READ]);
    await request(server)
      .patch('/production-unbuild-orders-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_UPDATE]);
    await request(server)
      .patch('/production-unbuild-orders-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('requires production-unbuild-orders.complete / .cancel independently', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_CANCEL]);
    await request(server)
      .post('/production-unbuild-orders-probe/complete')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_COMPLETE]);
    await request(server)
      .post('/production-unbuild-orders-probe/complete')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_COMPLETE]);
    await request(server)
      .post('/production-unbuild-orders-probe/cancel')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_CANCEL]);
    await request(server)
      .post('/production-unbuild-orders-probe/cancel')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('rejects a tampered/foreign tenant token the same way other production probes do (JWT signature enforced)', async () => {
    const foreignJwt = new JwtService({ secret: 'different-secret' });
    const foreignToken = foreignJwt.sign(
      { sub: 'user-1', tenantId: 'tenant-1', email: 'admin@demo.local', typ: 'access' },
      { expiresIn: '5m' },
    );
    await request(server)
      .get('/production-unbuild-orders-probe')
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(401);
  });
});
