import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { IdentityEnvironmentVariables } from '../config/identity-env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { parseExpiresInToSeconds } from './parse-expires-in';
import { TokenService } from './token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<IdentityEnvironmentVariables, true>,
      ) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: parseExpiresInToSeconds(
            config.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
})
export class AuthModule {}
