import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  HealthModule,
  LoggingModule,
  ServiceEnvironmentVariables,
  validateEnv,
} from '@app/common';
import { MessagingModule } from '@app/messaging';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => validateEnv(ServiceEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
    PrismaModule,
    MessagingModule.register(),
  ],
})
export class AccountingModule {}
