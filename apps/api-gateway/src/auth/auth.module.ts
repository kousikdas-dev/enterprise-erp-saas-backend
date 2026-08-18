import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { GatewayEnvironmentVariables } from '@app/common';
import { AuthController } from './auth.controller';
import { AuthProxyService } from './auth-proxy.service';
import { assertJwtSecretForEnvironment } from './assert-jwt-secret';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<GatewayEnvironmentVariables, true>,
      ) => {
        const secret = config.get('JWT_ACCESS_SECRET', { infer: true });
        assertJwtSecretForEnvironment(
          config.get('NODE_ENV', { infer: true }),
          secret,
        );
        return { secret };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthProxyService, JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtStrategy],
})
export class AuthModule {}
