import { Controller, Delete, Get, INestApplication, Patch, Post, UseGuards } from '@nestjs/common';
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

@Controller('production-orders-probe')
class ProductionOrdersProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_READ)
  list(): { ok: true } {
    return { ok: true };
  }

  @Patch()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_UPDATE)
  update(): { ok: true } {
    return { ok: true };
  }

  @Delete()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_DELETE)
  remove(): { ok: true } {
    return { ok: true };
  }

  @Post('plan')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_PLAN)
  plan(): { ok: true } {
    return { ok: true };
  }

  @Post('release')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_RELEASE)
  release(): { ok: true } {
    return { ok: true };
  }

  @Post('start')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_START)
  start(): { ok: true } {
    return { ok: true };
  }

  @Post('complete')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_COMPLETE)
  complete(): { ok: true } {
    return { ok: true };
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_CANCEL)
  cancel(): { ok: true } {
    return { ok: true };
  }

  @Post('close')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_CLOSE)
  close(): { ok: true } {
    return { ok: true };
  }
}

describe('production Orders JWT and RBAC', () => {
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
      controllers: [ProductionOrdersProbeController],
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
    await request(server).get('/production-orders-probe').expect(401);
  });

  const cases: Array<{
    permission: string;
    method: 'post' | 'get' | 'patch' | 'delete';
    path: string;
    successStatus: number;
  }> = [
    { permission: PERMISSIONS.PRODUCTION_ORDERS_CREATE, method: 'post', path: '', successStatus: 201 },
    { permission: PERMISSIONS.PRODUCTION_ORDERS_READ, method: 'get', path: '', successStatus: 200 },
    { permission: PERMISSIONS.PRODUCTION_ORDERS_UPDATE, method: 'patch', path: '', successStatus: 200 },
    { permission: PERMISSIONS.PRODUCTION_ORDERS_DELETE, method: 'delete', path: '', successStatus: 200 },
    { permission: PERMISSIONS.PRODUCTION_ORDERS_PLAN, method: 'post', path: '/plan', successStatus: 201 },
    { permission: PERMISSIONS.PRODUCTION_ORDERS_RELEASE, method: 'post', path: '/release', successStatus: 201 },
    { permission: PERMISSIONS.PRODUCTION_ORDERS_START, method: 'post', path: '/start', successStatus: 201 },
    { permission: PERMISSIONS.PRODUCTION_ORDERS_COMPLETE, method: 'post', path: '/complete', successStatus: 201 },
    { permission: PERMISSIONS.PRODUCTION_ORDERS_CANCEL, method: 'post', path: '/cancel', successStatus: 201 },
    { permission: PERMISSIONS.PRODUCTION_ORDERS_CLOSE, method: 'post', path: '/close', successStatus: 201 },
  ];

  it.each(cases)(
    'requires $permission independently',
    async ({ permission, method, path, successStatus }) => {
      getPermissionKeys.mockResolvedValue([]);
      await request(server)
        [method](`/production-orders-probe${path}`)
        .set('Authorization', `Bearer ${signAccess()}`)
        .expect(403);

      getPermissionKeys.mockResolvedValue([permission]);
      await request(server)
        [method](`/production-orders-probe${path}`)
        .set('Authorization', `Bearer ${signAccess()}`)
        .expect(successStatus);
    },
  );
});
