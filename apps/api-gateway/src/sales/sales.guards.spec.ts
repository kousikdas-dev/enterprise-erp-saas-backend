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

  @Post('reverse')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SHIPMENTS_REVERSE)
  reverse(): { ok: true } {
    return { ok: true };
  }

  @Post('retry-accounting-reversal')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SHIPMENTS_REVERSE)
  retryAccountingReversal(): { ok: true } {
    return { ok: true };
  }
}

@Controller('sales-invoices-retry-probe')
class SalesInvoicesRetryProbeController {
  @Post('posting')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_SEND)
  retryPosting(): { ok: true } {
    return { ok: true };
  }

  @Post('reversal')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_CANCEL)
  retryReversal(): { ok: true } {
    return { ok: true };
  }
}

@Controller('sales-credit-notes-probe')
class SalesCreditNotesProbeController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_READ)
  list(): { ok: true } {
    return { ok: true };
  }

  @Post('post')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_POST)
  post(): { ok: true } {
    return { ok: true };
  }

  @Post('retry-accounting-posting')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_POST)
  retryPosting(): { ok: true } {
    return { ok: true };
  }

  @Post('reverse')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_REVERSE)
  reverse(): { ok: true } {
    return { ok: true };
  }

  @Post('retry-accounting-reversal')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_REVERSE)
  retryReversal(): { ok: true } {
    return { ok: true };
  }
}

@Controller('sales-invoices-payment-probe')
class SalesInvoicesPaymentProbeController {
  @Post('retry-accounting-posting')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_RECORD_PAYMENT)
  retryPaymentPosting(): { ok: true } {
    return { ok: true };
  }

  @Post('reverse')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_REVERSE_PAYMENT)
  reverse(): { ok: true } {
    return { ok: true };
  }

  @Post('retry-accounting-reversal')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_REVERSE_PAYMENT)
  retryPaymentReversal(): { ok: true } {
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
      controllers: [
        CustomersProbeController,
        ShipmentsProbeController,
        SalesInvoicesRetryProbeController,
        SalesInvoicesPaymentProbeController,
        SalesCreditNotesProbeController,
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

  it('requires shipments.reverse separately from post — reuses no other permission', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SHIPMENTS_POST]);
    await request(server)
      .post('/shipments-probe/reverse')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SHIPMENTS_REVERSE]);
    await request(server)
      .post('/shipments-probe/reverse')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('gates the retry-accounting-reversal route by shipments.reverse, the same permission as reverse', async () => {
    getPermissionKeys.mockResolvedValue([]);
    await request(server)
      .post('/shipments-probe/retry-accounting-reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SHIPMENTS_REVERSE]);
    await request(server)
      .post('/shipments-probe/retry-accounting-reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('returns 401 without JWT', async () => {
    await request(server).get('/customers-probe').expect(401);
  });

  it('requires sales-invoices.send to retry accounting posting', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_CANCEL]);
    await request(server)
      .post('/sales-invoices-retry-probe/posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_SEND]);
    await request(server)
      .post('/sales-invoices-retry-probe/posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires sales-invoices.cancel to retry accounting reversal', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_SEND]);
    await request(server)
      .post('/sales-invoices-retry-probe/reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_CANCEL]);
    await request(server)
      .post('/sales-invoices-retry-probe/reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires sales-invoices.record-payment to retry a customer payment accounting posting', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_REVERSE_PAYMENT]);
    await request(server)
      .post('/sales-invoices-payment-probe/retry-accounting-posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_RECORD_PAYMENT]);
    await request(server)
      .post('/sales-invoices-payment-probe/retry-accounting-posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires sales-invoices.reverse-payment to reverse a customer payment', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_RECORD_PAYMENT]);
    await request(server)
      .post('/sales-invoices-payment-probe/reverse')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_REVERSE_PAYMENT]);
    await request(server)
      .post('/sales-invoices-payment-probe/reverse')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires sales-invoices.reverse-payment to retry a customer payment accounting reversal', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_RECORD_PAYMENT]);
    await request(server)
      .post('/sales-invoices-payment-probe/retry-accounting-reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_INVOICES_REVERSE_PAYMENT]);
    await request(server)
      .post('/sales-invoices-payment-probe/retry-accounting-reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('existing sales permissions (customers.read, shipments.create/post) remain unchanged by the new retry routes', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.CUSTOMERS_READ]);
    await request(server)
      .get('/customers-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SHIPMENTS_POST]);
    await request(server)
      .post('/shipments-probe/post')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires sales-credit-notes.create to create', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_CREDIT_NOTES_READ]);
    await request(server)
      .post('/sales-credit-notes-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_CREDIT_NOTES_CREATE]);
    await request(server)
      .post('/sales-credit-notes-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires sales-credit-notes.read to list', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_CREDIT_NOTES_CREATE]);
    await request(server)
      .get('/sales-credit-notes-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_CREDIT_NOTES_READ]);
    await request(server)
      .get('/sales-credit-notes-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('requires sales-credit-notes.post to post and to retry accounting posting', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_CREDIT_NOTES_REVERSE]);
    await request(server)
      .post('/sales-credit-notes-probe/post')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
    await request(server)
      .post('/sales-credit-notes-probe/retry-accounting-posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_CREDIT_NOTES_POST]);
    await request(server)
      .post('/sales-credit-notes-probe/post')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
    await request(server)
      .post('/sales-credit-notes-probe/retry-accounting-posting')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires sales-credit-notes.reverse to reverse and to retry accounting reversal', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_CREDIT_NOTES_POST]);
    await request(server)
      .post('/sales-credit-notes-probe/reverse')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
    await request(server)
      .post('/sales-credit-notes-probe/retry-accounting-reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.SALES_CREDIT_NOTES_REVERSE]);
    await request(server)
      .post('/sales-credit-notes-probe/reverse')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
    await request(server)
      .post('/sales-credit-notes-probe/retry-accounting-reversal')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('returns 401 without JWT on the sales-credit-notes probe', async () => {
    await request(server).get('/sales-credit-notes-probe').expect(401);
  });
});
