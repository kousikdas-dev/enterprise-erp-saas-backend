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
import { DownstreamRegistry } from './downstream/downstream.registry';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => validateEnv(GatewayEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
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
    DownstreamRegistry,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ApiGatewayModule {}
