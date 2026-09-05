import {
  Controller,
  Get,
  INestApplication,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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

@Controller('accounts-probe')
class AccountsProbeController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ACCOUNTS_READ)
  list(): { ok: true } {
    return { ok: true };
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ACCOUNTS_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }

  @Patch('status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ACCOUNTS_UPDATE)
  status(): { ok: true } {
    return { ok: true };
  }
}

describe('accounting JWT and RBAC', () => {
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
      controllers: [AccountsProbeController],
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

  it('allows a user with accounts.read', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNTS_READ]);
    await request(server)
      .get('/accounts-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('denies accounts.create when missing', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNTS_READ]);
    await request(server)
      .post('/accounts-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
  });

  it('allows accounts.create when granted', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNTS_CREATE]);
    await request(server)
      .post('/accounts-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires accounts.update for the status endpoint, not accounts.create/read', async () => {
    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.ACCOUNTS_READ,
      PERMISSIONS.ACCOUNTS_CREATE,
    ]);
    await request(server)
      .patch('/accounts-probe/status')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNTS_UPDATE]);
    await request(server)
      .patch('/accounts-probe/status')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('returns 401 without JWT', async () => {
    await request(server).get('/accounts-probe').expect(401);
  });
});
