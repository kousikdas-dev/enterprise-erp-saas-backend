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

  @Get('ledger')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ACCOUNT_LEDGER_READ)
  ledger(): { ok: true } {
    return { ok: true };
  }
}

@Controller('reports-probe')
class ReportsProbeController {
  @Get('trial-balance')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TRIAL_BALANCE_READ)
  trialBalance(): { ok: true } {
    return { ok: true };
  }

  @Get('profit-loss')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PROFIT_LOSS_READ)
  profitLoss(): { ok: true } {
    return { ok: true };
  }

  @Get('balance-sheet')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.BALANCE_SHEET_READ)
  balanceSheet(): { ok: true } {
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
      controllers: [AccountsProbeController, ReportsProbeController],
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

  it('denies the ledger route to a user with only accounts.read', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNTS_READ]);
    await request(server)
      .get('/accounts-probe/ledger')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
  });

  it('allows the ledger route with account-ledger.read', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.ACCOUNT_LEDGER_READ]);
    await request(server)
      .get('/accounts-probe/ledger')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  describe('Financial Reports — each report is gated by its own dedicated permission', () => {
    it('trial-balance requires trial-balance.read, not accounts.read or the other two report permissions', async () => {
      getPermissionKeys.mockResolvedValue([
        PERMISSIONS.ACCOUNTS_READ,
        PERMISSIONS.PROFIT_LOSS_READ,
        PERMISSIONS.BALANCE_SHEET_READ,
      ]);
      await request(server)
        .get('/reports-probe/trial-balance')
        .set('Authorization', `Bearer ${signAccess()}`)
        .expect(403);

      getPermissionKeys.mockResolvedValue([PERMISSIONS.TRIAL_BALANCE_READ]);
      await request(server)
        .get('/reports-probe/trial-balance')
        .set('Authorization', `Bearer ${signAccess()}`)
        .expect(200);
    });

    it('profit-loss requires profit-loss.read, not the other two report permissions', async () => {
      getPermissionKeys.mockResolvedValue([
        PERMISSIONS.TRIAL_BALANCE_READ,
        PERMISSIONS.BALANCE_SHEET_READ,
      ]);
      await request(server)
        .get('/reports-probe/profit-loss')
        .set('Authorization', `Bearer ${signAccess()}`)
        .expect(403);

      getPermissionKeys.mockResolvedValue([PERMISSIONS.PROFIT_LOSS_READ]);
      await request(server)
        .get('/reports-probe/profit-loss')
        .set('Authorization', `Bearer ${signAccess()}`)
        .expect(200);
    });

    it('balance-sheet requires balance-sheet.read, not the other two report permissions', async () => {
      getPermissionKeys.mockResolvedValue([
        PERMISSIONS.TRIAL_BALANCE_READ,
        PERMISSIONS.PROFIT_LOSS_READ,
      ]);
      await request(server)
        .get('/reports-probe/balance-sheet')
        .set('Authorization', `Bearer ${signAccess()}`)
        .expect(403);

      getPermissionKeys.mockResolvedValue([PERMISSIONS.BALANCE_SHEET_READ]);
      await request(server)
        .get('/reports-probe/balance-sheet')
        .set('Authorization', `Bearer ${signAccess()}`)
        .expect(200);
    });

    it('returns 401 without a JWT on any report route', async () => {
      await request(server).get('/reports-probe/trial-balance').expect(401);
    });
  });
});
