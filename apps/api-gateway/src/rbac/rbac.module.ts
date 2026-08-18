import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityPermissionResolver } from './identity-permission.resolver';
import { PERMISSION_RESOLVER } from './permission-resolver';
import { PermissionsGuard } from './permissions.guard';
import { RbacTestController } from './rbac-test.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
    AuthModule,
  ],
  controllers: [RbacTestController],
  providers: [
    PermissionsGuard,
    {
      provide: PERMISSION_RESOLVER,
      useClass: IdentityPermissionResolver,
    },
  ],
  exports: [PermissionsGuard, PERMISSION_RESOLVER],
})
export class RbacModule {}
