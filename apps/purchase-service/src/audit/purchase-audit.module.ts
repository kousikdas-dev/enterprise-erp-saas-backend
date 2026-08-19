import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { IdentityAuditClient } from './identity-audit.client';

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  providers: [IdentityAuditClient],
  exports: [IdentityAuditClient],
})
export class PurchaseAuditModule {}
