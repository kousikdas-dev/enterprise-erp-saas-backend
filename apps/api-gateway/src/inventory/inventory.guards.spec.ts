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

@Controller('products-probe')
class ProductsProbeController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  list(): { ok: true } {
    return { ok: true };
  }
}

@Controller('stock-adjust-probe')
class StockAdjustProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  adjust(): { ok: true } {
    return { ok: true };
  }
}

// Phase 3.15 — these retry routes deliberately reuse the same permission as
// the action they retry (stock.adjust / opening-stock.post /
// opening-stock.reverse), never a dedicated new permission.
@Controller('stock-retry-accounting-probe')
class StockRetryAccountingProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  retry(): { ok: true } {
    return { ok: true };
  }
}

@Controller('opening-stock-retry-posting-probe')
class OpeningStockRetryPostingProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_POST)
  retry(): { ok: true } {
    return { ok: true };
  }
}

@Controller('opening-stock-retry-reversal-probe')
class OpeningStockRetryReversalProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_REVERSE)
  retry(): { ok: true } {
    return { ok: true };
  }
}

describe('inventory JWT and RBAC', () => {
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
      controllers: [
        ProductsProbeController,
        StockAdjustProbeController,
        StockRetryAccountingProbeController,
        OpeningStockRetryPostingProbeController,
        OpeningStockRetryReversalProbeController,
      ],
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

  it('returns 401 when the JWT is missing', async () => {
    await request(server).get('/products-probe').expect(401);
    await request(server).post('/stock-adjust-probe').expect(401);
  });

  it('returns 403 when the viewer is missing inventory permissions', async () => {
    getPermissionKeys.mockResolvedValue([]);
    const token = signAccess({ email: 'viewer@demo.local' });
    await request(server)
      .get('/products-probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(server)
      .post('/stock-adjust-probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 403 when another tenant user lacks inventory permissions', async () => {
    getPermissionKeys.mockResolvedValue([]);
    const token = signAccess({
      sub: 'other-user',
      tenantId: 'other-tenant',
      email: 'admin@other.local',
    });
    await request(server)
      .get('/products-probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows DEMO admin with products.read and stock.adjust', async () => {
    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.PRODUCTS_READ,
      PERMISSIONS.STOCK_ADJUST,
    ]);
    const token = signAccess();
    await request(server)
      .get('/products-probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(server)
      .post('/stock-adjust-probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });

  describe('Phase 3.15 — accounting retry routes reuse existing permissions', () => {
    it('the stock-movement retry route is gated by stock.adjust, not a new permission', async () => {
      getPermissionKeys.mockResolvedValue([]);
      const noPerm = signAccess({ email: 'viewer@demo.local' });
      await request(server)
        .post('/stock-retry-accounting-probe')
        .set('Authorization', `Bearer ${noPerm}`)
        .expect(403);

      getPermissionKeys.mockResolvedValue([PERMISSIONS.STOCK_ADJUST]);
      const withPerm = signAccess();
      await request(server)
        .post('/stock-retry-accounting-probe')
        .set('Authorization', `Bearer ${withPerm}`)
        .expect(201);
    });

    it('the opening-stock retry-posting route is gated by opening-stock.post, not a new permission', async () => {
      getPermissionKeys.mockResolvedValue([]);
      const noPerm = signAccess({ email: 'viewer@demo.local' });
      await request(server)
        .post('/opening-stock-retry-posting-probe')
        .set('Authorization', `Bearer ${noPerm}`)
        .expect(403);

      getPermissionKeys.mockResolvedValue([PERMISSIONS.OPENING_STOCK_POST]);
      const withPerm = signAccess();
      await request(server)
        .post('/opening-stock-retry-posting-probe')
        .set('Authorization', `Bearer ${withPerm}`)
        .expect(201);
    });

    it('the opening-stock retry-reversal route is gated by opening-stock.reverse, not a new permission', async () => {
      getPermissionKeys.mockResolvedValue([]);
      const noPerm = signAccess({ email: 'viewer@demo.local' });
      await request(server)
        .post('/opening-stock-retry-reversal-probe')
        .set('Authorization', `Bearer ${noPerm}`)
        .expect(403);

      getPermissionKeys.mockResolvedValue([PERMISSIONS.OPENING_STOCK_REVERSE]);
      const withPerm = signAccess();
      await request(server)
        .post('/opening-stock-retry-reversal-probe')
        .set('Authorization', `Bearer ${withPerm}`)
        .expect(201);
    });
  });
});
