import {
  Controller,
  Delete,
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

@Controller('account-mappings-probe')
class AccountMappingsProbeController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ACCOUNT_MAPPINGS_READ)
  list(): { ok: true } {
    return { ok: true };
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ACCOUNT_MAPPINGS_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ACCOUNT_MAPPINGS_UPDATE)
  update(): { ok: true } {
    return { ok: true };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ACCOUNT_MAPPINGS_DELETE)
  remove(): { ok: true } {
    return { ok: true };
  }
}

describe('account-mappings JWT and RBAC', () => {
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
      controllers: [AccountMappingsProbeController],
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

  it('allows a user with account-mappings.read', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNT_MAPPINGS_READ]);
    await request(server)
      .get('/account-mappings-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('denies account-mappings.create when missing', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNT_MAPPINGS_READ]);
    await request(server)
      .post('/account-mappings-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
  });

  it('allows account-mappings.create when granted', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNT_MAPPINGS_CREATE]);
    await request(server)
      .post('/account-mappings-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires account-mappings.update for patch, not create/read', async () => {
    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.ACCOUNT_MAPPINGS_READ,
      PERMISSIONS.ACCOUNT_MAPPINGS_CREATE,
    ]);
    await request(server)
      .patch('/account-mappings-probe/mapping-1')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNT_MAPPINGS_UPDATE]);
    await request(server)
      .patch('/account-mappings-probe/mapping-1')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('requires account-mappings.delete for delete', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNT_MAPPINGS_READ]);
    await request(server)
      .delete('/account-mappings-probe/mapping-1')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNT_MAPPINGS_DELETE]);
    await request(server)
      .delete('/account-mappings-probe/mapping-1')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('returns 401 without JWT', async () => {
    await request(server).get('/account-mappings-probe').expect(401);
  });
});
