import {
  BadGatewayException,
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { DownstreamRegistry } from '../downstream/downstream.registry';
import { LoginDto } from './dto/login.dto';
import { LoginDataDto } from './dto/login-response.dto';

const IDENTITY_LOGIN_PATH = '/api/v1/auth/login';

interface IdentityLoginEnvelope {
  success?: boolean;
  data?: LoginDataDto;
}

@Injectable()
export class AuthProxyService {
  private readonly logger = new Logger(AuthProxyService.name);

  constructor(
    private readonly http: HttpService,
    private readonly downstream: DownstreamRegistry,
  ) {}

  async login(dto: LoginDto): Promise<LoginDataDto> {
    const url = `${this.identityBaseUrl()}${IDENTITY_LOGIN_PATH}`;

    try {
      const response = await firstValueFrom(
        this.http.post<IdentityLoginEnvelope>(url, {
          tenantCode: dto.tenantCode,
          email: dto.email,
          password: dto.password,
        }),
      );
      const tokens = response.data?.data;
      if (
        !tokens?.accessToken ||
        !tokens.refreshToken ||
        typeof tokens.expiresIn !== 'number'
      ) {
        throw new BadGatewayException('Identity service error');
      }
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };
    } catch (error) {
      this.rethrowUpstream(error);
    }
  }

  private identityBaseUrl(): string {
    return this.downstream.getUrl('identity').replace(/\/$/, '');
  }

  private rethrowUpstream(error: unknown): never {
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    if (error instanceof BadRequestException) {
      throw error;
    }
    if (error instanceof BadGatewayException) {
      throw error;
    }
    if (error instanceof ServiceUnavailableException) {
      throw error;
    }

    if (isAxiosError(error)) {
      const status = error.response?.status;
      if (!error.response) {
        this.logger.warn('Identity service unreachable');
        throw new ServiceUnavailableException('Identity service unavailable');
      }
      if (status === HttpStatus.UNAUTHORIZED) {
        throw new UnauthorizedException(
          this.publicMessage(error, 'Invalid credentials'),
        );
      }
      if (status === HttpStatus.BAD_REQUEST) {
        throw new BadRequestException(
          this.publicMessage(error, 'Invalid request'),
        );
      }
      this.logger.warn(`Identity login upstream status ${String(status)}`);
      throw new BadGatewayException('Identity service error');
    }

    this.logger.warn('Identity login proxy failed');
    throw new BadGatewayException('Identity service error');
  }

  private publicMessage(error: unknown, fallback: string): string | string[] {
    if (!isAxiosError(error)) {
      return fallback;
    }
    const payload = error.response?.data as { message?: unknown } | undefined;
    const message = payload?.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    if (
      Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
    ) {
      return message;
    }
    return fallback;
  }
}
