import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { AuthModule } from './auth/auth.module';
import { IdentityEnvironmentVariables } from './config/identity-env';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => validateEnv(IdentityEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
    PrismaModule,
    AuthModule,
    MessagingModule.register(),
  ],
})
export class IdentityModule {}
