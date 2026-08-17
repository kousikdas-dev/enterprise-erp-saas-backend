import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TenantStatus, UserStatus } from '../../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, INVALID_CREDENTIALS } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const TENANT_A = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Acme',
  code: 'acme',
  status: TenantStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TENANT_B = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Globex',
  code: 'globex',
  status: TenantStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PASSWORD = 'correct-horse-battery';

type RefreshTokenCreateArgs = {
  data: { userId: string; tokenHash: string; expiresAt: Date };
};

describe('AuthService', () => {
  let service: AuthService;
  let passwordService: PasswordService;
  let tokenService: TokenService;
  let passwordHash: string;
  let storedRefreshTokens: RefreshTokenCreateArgs['data'][];
  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    refreshToken: { create: jest.Mock };
  };

  const loginDto = {
    tenantCode: TENANT_A.code,
    email: 'user@acme.test',
    password: PASSWORD,
  };

  function userRecord(
    status: UserStatus,
    overrides: { tenantId?: string; email?: string } = {},
  ) {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: overrides.tenantId ?? TENANT_A.id,
      email: overrides.email ?? 'user@acme.test',
      passwordHash,
      firstName: 'Ada',
      lastName: 'Lovelace',
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async function expectInvalidCredentials(dto: {
    tenantCode: string;
    email: string;
    password: string;
  }): Promise<void> {
    await expect(service.login(dto)).rejects.toThrow(INVALID_CREDENTIALS);
  }

  beforeAll(async () => {
    passwordService = new PasswordService();
    passwordHash = await passwordService.hash(PASSWORD);
  });

  beforeEach(async () => {
    storedRefreshTokens = [];
    prisma = {
      tenant: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      refreshToken: {
        create: jest.fn((args: RefreshTokenCreateArgs) => {
          storedRefreshTokens.push(args.data);
          return Promise.resolve({ id: 'refresh-row' });
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-access-secret-change-me',
        }),
      ],
      providers: [
        AuthService,
        PasswordService,
        TokenService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                JWT_ACCESS_SECRET: 'test-access-secret-change-me',
                JWT_REFRESH_SECRET: 'test-refresh-secret-change-me',
                JWT_ACCESS_EXPIRES_IN: '15m',
                JWT_REFRESH_EXPIRES_IN: '7d',
              })[key],
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    tokenService = moduleRef.get(TokenService);
  });

  it('logs in an ACTIVE user within the requested tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue(TENANT_A);
    prisma.user.findUnique.mockResolvedValue(userRecord(UserStatus.ACTIVE));

    const result = await service.login(loginDto);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_email: {
          tenantId: TENANT_A.id,
          email: 'user@acme.test',
        },
      },
    });
    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.expiresIn).toBe(15 * 60);

    const payload = JSON.parse(
      Buffer.from(result.accessToken.split('.')[1], 'base64url').toString(
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      sub: '33333333-3333-4333-8333-333333333333',
      tenantId: TENANT_A.id,
      email: 'user@acme.test',
      typ: 'access',
    });
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('passwordHash');
    expect(payload).not.toHaveProperty('firstName');
  });

  it('rejects an invalid password with a generic error', async () => {
    prisma.tenant.findUnique.mockResolvedValue(TENANT_A);
    prisma.user.findUnique.mockResolvedValue(userRecord(UserStatus.ACTIVE));

    await expectInvalidCredentials({ ...loginDto, password: 'wrong-password' });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects a non-existent tenant with a generic error', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expectInvalidCredentials(loginDto);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects a non-existent user in the tenant with a generic error', async () => {
    prisma.tenant.findUnique.mockResolvedValue(TENANT_A);
    prisma.user.findUnique.mockResolvedValue(null);

    await expectInvalidCredentials(loginDto);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_email: { tenantId: TENANT_A.id, email: 'user@acme.test' },
      },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects an INACTIVE user with a generic error', async () => {
    prisma.tenant.findUnique.mockResolvedValue(TENANT_A);
    prisma.user.findUnique.mockResolvedValue(userRecord(UserStatus.INACTIVE));

    await expectInvalidCredentials(loginDto);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects a LOCKED user with a generic error', async () => {
    prisma.tenant.findUnique.mockResolvedValue(TENANT_A);
    prisma.user.findUnique.mockResolvedValue(userRecord(UserStatus.LOCKED));

    await expectInvalidCredentials(loginDto);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects an INVITED user with a generic error', async () => {
    prisma.tenant.findUnique.mockResolvedValue(TENANT_A);
    prisma.user.findUnique.mockResolvedValue(userRecord(UserStatus.INVITED));

    await expectInvalidCredentials(loginDto);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('generates a refresh token on successful login', async () => {
    prisma.tenant.findUnique.mockResolvedValue(TENANT_A);
    prisma.user.findUnique.mockResolvedValue(userRecord(UserStatus.ACTIVE));

    const result = await service.login(loginDto);

    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken.length).toBeGreaterThan(32);
  });

  it('stores only a hash of the refresh token, never the raw value', async () => {
    prisma.tenant.findUnique.mockResolvedValue(TENANT_A);
    prisma.user.findUnique.mockResolvedValue(userRecord(UserStatus.ACTIVE));

    const result = await service.login(loginDto);

    const storedHash = tokenService.hashRefreshToken(result.refreshToken);
    const persisted = storedRefreshTokens[0];
    expect(persisted).toBeDefined();
    expect(persisted?.userId).toBe('33333333-3333-4333-8333-333333333333');
    expect(persisted?.tokenHash).toBe(storedHash);
    expect(persisted?.tokenHash).not.toBe(result.refreshToken);
    expect(persisted?.expiresAt).toBeInstanceOf(Date);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('does not authenticate a Tenant A user when Tenant B is requested', async () => {
    prisma.tenant.findUnique.mockImplementation(
      ({ where }: { where: { code: string } }) => {
        if (where.code === TENANT_B.code) {
          return Promise.resolve(TENANT_B);
        }
        if (where.code === TENANT_A.code) {
          return Promise.resolve(TENANT_A);
        }
        return Promise.resolve(null);
      },
    );
    prisma.user.findUnique.mockImplementation(
      ({
        where,
      }: {
        where: { tenantId_email: { tenantId: string; email: string } };
      }) => {
        if (
          where.tenantId_email.tenantId === TENANT_A.id &&
          where.tenantId_email.email === 'user@acme.test'
        ) {
          return Promise.resolve(userRecord(UserStatus.ACTIVE));
        }
        return Promise.resolve(null);
      },
    );

    await expectInvalidCredentials({
      tenantCode: TENANT_B.code,
      email: 'user@acme.test',
      password: PASSWORD,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_email: {
          tenantId: TENANT_B.id,
          email: 'user@acme.test',
        },
      },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});
