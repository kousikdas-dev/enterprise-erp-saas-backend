import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ACTOR_TENANT_ID_HEADER, ACTOR_USER_ID_HEADER } from '@app/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { DownstreamRegistry } from '../downstream/downstream.registry';

interface IdentityEnvelope<T> {
  success?: boolean;
  data?: T;
}

export interface IdentityForwardOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  user: AuthenticatedUser;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class IdentityForwardService {
  private readonly logger = new Logger(IdentityForwardService.name);

  constructor(
    private readonly http: HttpService,
    private readonly downstream: DownstreamRegistry,
  ) {}

  async forward<T>(options: IdentityForwardOptions): Promise<T> {
    const url = `${this.identityBaseUrl()}${options.path}`;
    const body = this.stripTenant(options.body);
    const params = this.stripTenant(options.query);
    try {
      const response = await firstValueFrom(
        this.http.request<IdentityEnvelope<T>>({
          method: options.method,
          url,
          data: body,
          params,
          headers: {
            [ACTOR_USER_ID_HEADER]: options.user.userId,
            [ACTOR_TENANT_ID_HEADER]: options.user.tenantId,
            'x-forwarded-for': options.ip,
            'user-agent': options.userAgent,
          },
        }),
      );
      if (response.data?.data === undefined) {
        throw new BadGatewayException('Identity service error');
      }
      return response.data.data;
    } catch (error) {
      this.rethrowUpstream(error);
    }
  }

  private stripTenant(
    body: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!body) {
      return undefined;
    }
    const copy = { ...body };
    delete copy.tenantId;
    delete copy.tenant_id;
    return copy;
  }

  private identityBaseUrl(): string {
    return this.downstream.getUrl('identity').replace(/\/$/, '');
  }

  private rethrowUpstream(error: unknown): never {
    if (
      error instanceof UnauthorizedException ||
      error instanceof BadRequestException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException ||
      error instanceof ConflictException ||
      error instanceof BadGatewayException ||
      error instanceof ServiceUnavailableException
    ) {
      throw error;
    }

    if (isAxiosError(error)) {
      const status = error.response?.status;
      if (!error.response) {
        this.logger.warn('Identity service unreachable');
        throw new ServiceUnavailableException('Identity service unavailable');
      }
      const message = this.publicMessage(error, 'Identity service error');
      if (status === HttpStatus.BAD_REQUEST) {
        throw new BadRequestException(message);
      }
      if (status === HttpStatus.UNAUTHORIZED) {
        throw new UnauthorizedException(message);
      }
      if (status === HttpStatus.FORBIDDEN) {
        throw new ForbiddenException(message);
      }
      if (status === HttpStatus.NOT_FOUND) {
        throw new NotFoundException(message);
      }
      if (status === HttpStatus.CONFLICT) {
        throw new ConflictException(message);
      }
      this.logger.warn(`Identity upstream status ${String(status)}`);
      throw new BadGatewayException('Identity service error');
    }

    this.logger.warn('Identity proxy failed');
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
