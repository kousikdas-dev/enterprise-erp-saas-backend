import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { IdentityForwardService } from './identity-forward.service';
import { PermissionsController } from './permissions.controller';
import { RolesController } from './roles.controller';
import { TenantsController } from './tenants.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
    AuthModule,
    RbacModule,
  ],
  controllers: [
    TenantsController,
    UsersController,
    RolesController,
    PermissionsController,
  ],
  providers: [IdentityForwardService],
})
export class IdentityAdminModule {}
