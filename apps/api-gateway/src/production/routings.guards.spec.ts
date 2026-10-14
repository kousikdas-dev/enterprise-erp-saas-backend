import { Controller, Delete, Get, INestApplication, Post, UseGuards } from '@nestjs/common';
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

@Controller('production-routings-probe')
class ProductionRoutingsProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_READ)
  list(): { ok: true } {
    return { ok: true };
  }

  @Delete()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_DELETE)
  remove(): { ok: true } {
    return { ok: true };
  }

  @Post('activate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_ACTIVATE)
  activate(): { ok: true } {
    return { ok: true };
  }

  @Post('deactivate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_DEACTIVATE)
  deactivate(): { ok: true } {
    return { ok: true };
  }
}

describe('production Routing JWT and RBAC', () => {
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
      controllers: [ProductionRoutingsProbeController],
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
    await request(server).get('/production-routings-probe').expect(401);
  });

  it('requires production-routings.create to create', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_READ]);
    await request(server)
      .post('/production-routings-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_CREATE]);
    await request(server)
      .post('/production-routings-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires production-routings.read to list', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_CREATE]);
    await request(server)
      .get('/production-routings-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_READ]);
    await request(server)
      .get('/production-routings-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('requires production-routings.delete to remove', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_READ]);
    await request(server)
      .delete('/production-routings-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_DELETE]);
    await request(server)
      .delete('/production-routings-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('requires production-routings.activate / .deactivate independently', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_DEACTIVATE]);
    await request(server)
      .post('/production-routings-probe/activate')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_ACTIVATE]);
    await request(server)
      .post('/production-routings-probe/activate')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_ACTIVATE]);
    await request(server)
      .post('/production-routings-probe/deactivate')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PRODUCTION_ROUTINGS_DEACTIVATE]);
    await request(server)
      .post('/production-routings-probe/deactivate')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });
});
