import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { IdentityEnvironmentVariables } from './config/identity-env';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

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
    RbacModule,
    AuditModule,
    TenantsModule,
    UsersModule,
    MessagingModule.register(),
  ],
})
export class IdentityModule {}
