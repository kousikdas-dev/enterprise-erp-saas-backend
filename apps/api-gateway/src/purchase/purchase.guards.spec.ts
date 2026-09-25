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

@Controller('suppliers-probe')
class SuppliersProbeController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ)
  list(): { ok: true } {
    return { ok: true };
  }
}

@Controller('goods-receipts-probe')
class GoodsReceiptsProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.GOODS_RECEIPTS_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }
}

@Controller('purchase-invoices-retry-probe')
class PurchaseInvoicesRetryProbeController {
  @Post('posting')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_CONFIRM)
  retryPosting(): { ok: true } {
    return { ok: true };
  }

  @Post('reversal')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_CANCEL)
  retryReversal(): { ok: true } {
    return { ok: true };
  }
}

@Controller('purchase-invoices-payment-probe')
class PurchaseInvoicesPaymentProbeController {
  @Post('retry-accounting-posting')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_RECORD_PAYMENT)
  retryPosting(): { ok: true } {
    return { ok: true };
  }

  @Post('reverse')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_REVERSE_PAYMENT)
  reverse(): { ok: true } {
    return { ok: true };
  }

  @Post('retry-accounting-reversal')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_REVERSE_PAYMENT)
  retryReversal(): { ok: true } {
    return { ok: true };
  }
}

describe('purchase JWT and RBAC', () => {
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
        SuppliersProbeController,
        GoodsReceiptsProbeController,
        PurchaseInvoicesRetryProbeController,
        PurchaseInvoicesPaymentProbeController,
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

  it('allows DEMO admin with suppliers.read', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SUPPLIERS_READ]);
    await request(server)
      .get('/suppliers-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('denies goods-receipts.create when missing', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SUPPLIERS_READ]);
    await request(server)
      .post('/goods-receipts-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
  });

  it('allows goods-receipts.create', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.GOODS_RECEIPTS_CREATE]);
    await request(server)
      .post('/goods-receipts-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires purchase-invoices.confirm to retry accounting posting', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PURCHASE_INVOICES_CANCEL]);
    await request(server)
      .post('/purchase-invoices-retry-probe/posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.PURCHASE_INVOICES_CONFIRM,
    ]);
    await request(server)
      .post('/purchase-invoices-retry-probe/posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires purchase-invoices.cancel to retry accounting reversal', async () => {
    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.PURCHASE_INVOICES_CONFIRM,
    ]);
    await request(server)
      .post('/purchase-invoices-retry-probe/reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.PURCHASE_INVOICES_CANCEL]);
    await request(server)
      .post('/purchase-invoices-retry-probe/reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires purchase-invoices.record-payment to retry a supplier payment accounting posting', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PURCHASE_INVOICES_REVERSE_PAYMENT]);
    await request(server)
      .post('/purchase-invoices-payment-probe/retry-accounting-posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.PURCHASE_INVOICES_RECORD_PAYMENT,
    ]);
    await request(server)
      .post('/purchase-invoices-payment-probe/retry-accounting-posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires purchase-invoices.reverse-payment to reverse a supplier payment', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PURCHASE_INVOICES_RECORD_PAYMENT]);
    await request(server)
      .post('/purchase-invoices-payment-probe/reverse')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.PURCHASE_INVOICES_REVERSE_PAYMENT,
    ]);
    await request(server)
      .post('/purchase-invoices-payment-probe/reverse')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires purchase-invoices.reverse-payment to retry a supplier payment accounting reversal', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.PURCHASE_INVOICES_RECORD_PAYMENT]);
    await request(server)
      .post('/purchase-invoices-payment-probe/retry-accounting-reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.PURCHASE_INVOICES_REVERSE_PAYMENT,
    ]);
    await request(server)
      .post('/purchase-invoices-payment-probe/retry-accounting-reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });
});
