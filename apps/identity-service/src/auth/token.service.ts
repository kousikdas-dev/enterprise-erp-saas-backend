import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes } from 'node:crypto';
import { IdentityEnvironmentVariables } from '../config/identity-env';
import { parseExpiresInToSeconds } from './parse-expires-in';

export interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  email: string;
  typ: 'access';
}

export interface IssuedRefreshToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  private readonly refreshSecret: string;
  private readonly accessExpiresInSeconds: number;
  private readonly refreshExpiresInSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService<IdentityEnvironmentVariables, true>,
  ) {
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.accessExpiresInSeconds = parseExpiresInToSeconds(
      config.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
    );
    this.refreshExpiresInSeconds = parseExpiresInToSeconds(
      config.get('JWT_REFRESH_EXPIRES_IN', { infer: true }),
    );
  }

  getAccessTokenExpiresInSeconds(): number {
    return this.accessExpiresInSeconds;
  }

  signAccessToken(claims: Omit<AccessTokenClaims, 'typ'>): string {
    const payload: AccessTokenClaims = {
      sub: claims.sub,
      tenantId: claims.tenantId,
      email: claims.email,
      typ: 'access',
    };

    return this.jwtService.sign(payload, {
      expiresIn: this.accessExpiresInSeconds,
    });
  }

  createRefreshToken(): IssuedRefreshToken {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashRefreshToken(rawToken);
    const expiresAt = new Date(
      Date.now() + this.refreshExpiresInSeconds * 1000,
    );

    return { rawToken, tokenHash, expiresAt };
  }

  hashRefreshToken(rawToken: string): string {
    return createHmac('sha256', this.refreshSecret)
      .update(rawToken)
      .digest('hex');
  }
}
