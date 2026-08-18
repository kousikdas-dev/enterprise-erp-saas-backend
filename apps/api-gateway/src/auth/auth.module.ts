import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthProxyService } from './auth-proxy.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthProxyService],
})
export class AuthModule {}
