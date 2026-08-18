import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { AuthenticatedUser } from './authenticated-user';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

@Controller('protected')
class ProtectedProbeController {
  @Get()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

describe('JwtAuthGuard', () => {
  const secret = 'test-access-secret-change-me';
  let app: INestApplication;
  let jwtService: JwtService;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      controllers: [ProtectedProbeController],
      providers: [JwtStrategy, JwtAuthGuard],
    }).compile();

    app = moduleRef.createNestApplication();
    jwtService = moduleRef.get(JwtService);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  function signAccess(overrides: Record<string, unknown> = {}): string {
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

  it('accepts a valid access token and exposes userId and tenantId', async () => {
    const token = signAccess();
    const response = await request(server)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('password');
  });

  it('rejects a missing token', async () => {
    await request(server).get('/protected').expect(401);
  });

  it('rejects an invalid token', async () => {
    await request(server)
      .get('/protected')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .expect(401);
  });

  it('rejects an expired access token', async () => {
    const token = jwtService.sign({
      sub: 'user-1',
      tenantId: 'tenant-1',
      typ: 'access',
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await request(server)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a refresh token used as an access token', async () => {
    await request(server)
      .get('/protected')
      .set('Authorization', 'Bearer dGhpcy1pcy1ub3QtYS1qd3Q')
      .expect(401);
  });
});
