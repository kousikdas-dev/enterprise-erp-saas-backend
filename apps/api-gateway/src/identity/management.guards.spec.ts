import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
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

@Controller('tenants-probe')
class TenantsProbeController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TENANTS_READ)
  list(): { ok: true } {
    return { ok: true };
  }
}

@Controller('roles-probe')
class RolesProbeController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  list(): { ok: true } {
    return { ok: true };
  }
}

describe('management JWT and RBAC', () => {
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
      controllers: [TenantsProbeController, RolesProbeController],
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

  function signAccess(): string {
    return jwtService.sign(
      {
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'admin@demo.local',
        typ: 'access',
      },
      { expiresIn: '5m' },
    );
  }

  it('returns 401 when the JWT is missing', async () => {
    await request(server).get('/tenants-probe').expect(401);
    await request(server).get('/roles-probe').expect(401);
  });

  it('returns 403 when the permission is missing', async () => {
    getPermissionKeys.mockResolvedValue(['rbac.test']);
    await request(server)
      .get('/tenants-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
    await request(server)
      .get('/roles-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
  });

  it('allows an authenticated caller with tenants.read', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.TENANTS_READ]);
    await request(server)
      .get('/tenants-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
    expect(getPermissionKeys).toHaveBeenCalledWith('user-1', 'tenant-1');
  });
});
