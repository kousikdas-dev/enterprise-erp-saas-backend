import { Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantStatus, UserStatus } from '../../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export const INVALID_CREDENTIALS = 'Invalid credentials';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const tenantCode = dto.tenantCode.trim();
    const email = dto.email.trim().toLowerCase();

    const tenant = await this.prisma.tenant.findUnique({
      where: { code: tenantCode },
    });

    const user = tenant
      ? await this.prisma.user.findUnique({
          where: {
            tenantId_email: {
              tenantId: tenant.id,
              email,
            },
          },
        })
      : null;

    const passwordValid = await this.passwordService.verifyOrDummy(
      dto.password,
      user?.passwordHash,
    );

    if (
      !tenant ||
      tenant.status !== TenantStatus.ACTIVE ||
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !passwordValid
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
    });
    const refresh = this.tokenService.createRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refresh.rawToken,
      expiresIn: this.tokenService.getAccessTokenExpiresInSeconds(),
    };
  }
}
