import {
  Controller,
  Get,
  INestApplication,
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

@Controller('customers-probe')
class CustomersProbeController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  list(): { ok: true } {
    return { ok: true };
  }
}

@Controller('shipments-probe')
class ShipmentsProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SHIPMENTS_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }

  @Post('post')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SHIPMENTS_POST)
  post(): { ok: true } {
    return { ok: true };
  }
}

describe('sales JWT and RBAC', () => {
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
      controllers: [CustomersProbeController, ShipmentsProbeController],
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

  it('allows DEMO admin with customers.read', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.CUSTOMERS_READ]);
    await request(server)
      .get('/customers-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('denies shipments.create when missing', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.CUSTOMERS_READ]);
    await request(server)
      .post('/shipments-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
  });

  it('allows shipments.create', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SHIPMENTS_CREATE]);
    await request(server)
      .post('/shipments-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires shipments.post separately from create', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SHIPMENTS_CREATE]);
    await request(server)
      .post('/shipments-probe/post')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SHIPMENTS_POST]);
    await request(server)
      .post('/shipments-probe/post')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('returns 401 without JWT', async () => {
    await request(server).get('/customers-probe').expect(401);
  });
});
