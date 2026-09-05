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

@Controller('tax-codes-probe')
class TaxCodesProbeController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TAX_CODES_READ)
  list(): { ok: true } {
    return { ok: true };
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TAX_CODES_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TAX_CODES_UPDATE)
  update(): { ok: true } {
    return { ok: true };
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TAX_CODES_UPDATE)
  updateStatus(): { ok: true } {
    return { ok: true };
  }
}

describe('tax codes JWT and RBAC', () => {
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
      controllers: [TaxCodesProbeController],
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

  it('allows a user with tax-codes.read', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.TAX_CODES_READ]);
    await request(server)
      .get('/tax-codes-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('denies tax-codes.create when missing', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.TAX_CODES_READ]);
    await request(server)
      .post('/tax-codes-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
  });

  it('allows tax-codes.create when granted', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.TAX_CODES_CREATE]);
    await request(server)
      .post('/tax-codes-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires tax-codes.update separately from create/read', async () => {
    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.TAX_CODES_READ,
      PERMISSIONS.TAX_CODES_CREATE,
    ]);
    await request(server)
      .patch('/tax-codes-probe/tc-1')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.TAX_CODES_UPDATE]);
    await request(server)
      .patch('/tax-codes-probe/tc-1')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('gates the status endpoint under tax-codes.update as well', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.TAX_CODES_READ]);
    await request(server)
      .patch('/tax-codes-probe/tc-1/status')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.TAX_CODES_UPDATE]);
    await request(server)
      .patch('/tax-codes-probe/tc-1/status')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('returns 401 without JWT', async () => {
    await request(server).get('/tax-codes-probe').expect(401);
  });
});
