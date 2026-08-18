import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  GatewayEnvironmentVariables,
  HealthModule,
  LoggingModule,
  validateEnv,
} from '@app/common';
import { MessagingModule } from '@app/messaging';
import { DownstreamModule } from './downstream/downstream.module';
import { AuthModule } from './auth/auth.module';
import { IdentityAdminModule } from './identity/identity-admin.module';
import { RbacModule } from './rbac/rbac.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => validateEnv(GatewayEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
    DownstreamModule,
    AuthModule,
    RbacModule,
    IdentityAdminModule,
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
    MessagingModule.register(),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ApiGatewayModule {}
