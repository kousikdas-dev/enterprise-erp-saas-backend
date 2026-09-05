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

@Controller('journal-entries-probe')
class JournalEntriesProbeController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.JOURNAL_ENTRIES_READ)
  list(): { ok: true } {
    return { ok: true };
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.JOURNAL_ENTRIES_CREATE)
  create(): { ok: true } {
    return { ok: true };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.JOURNAL_ENTRIES_UPDATE)
  update(): { ok: true } {
    return { ok: true };
  }

  @Post(':id/post')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.JOURNAL_ENTRIES_POST)
  post(): { ok: true } {
    return { ok: true };
  }
}

describe('journal entries JWT and RBAC', () => {
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
      controllers: [JournalEntriesProbeController],
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

  it('allows a user with journal-entries.read', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.JOURNAL_ENTRIES_READ]);
    await request(server)
      .get('/journal-entries-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('denies journal-entries.create when missing', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.JOURNAL_ENTRIES_READ]);
    await request(server)
      .post('/journal-entries-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);
  });

  it('allows journal-entries.create when granted', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.JOURNAL_ENTRIES_CREATE]);
    await request(server)
      .post('/journal-entries-probe')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('requires journal-entries.update separately from create/read', async () => {
    getPermissionKeys.mockResolvedValue([
      PERMISSIONS.JOURNAL_ENTRIES_READ,
      PERMISSIONS.JOURNAL_ENTRIES_CREATE,
    ]);
    await request(server)
      .patch('/journal-entries-probe/je-1')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.JOURNAL_ENTRIES_UPDATE]);
    await request(server)
      .patch('/journal-entries-probe/je-1')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(200);
  });

  it('requires journal-entries.post separately from update', async () => {
    getPermissionKeys.mockResolvedValue([PERMISSIONS.JOURNAL_ENTRIES_UPDATE]);
    await request(server)
      .post('/journal-entries-probe/je-1/post')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(403);

    getPermissionKeys.mockResolvedValue([PERMISSIONS.JOURNAL_ENTRIES_POST]);
    await request(server)
      .post('/journal-entries-probe/je-1/post')
      .set('Authorization', `Bearer ${signAccess()}`)
      .expect(201);
  });

  it('returns 401 without JWT', async () => {
    await request(server).get('/journal-entries-probe').expect(401);
  });
});
