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

interface PurchaseEnvelope<T> {
  success?: boolean;
  data?: T;
}

export interface PurchaseForwardOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  user: AuthenticatedUser;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class PurchaseForwardService {
  private readonly logger = new Logger(PurchaseForwardService.name);

  constructor(
    private readonly http: HttpService,
    private readonly downstream: DownstreamRegistry,
  ) {}

  async forward<T>(options: PurchaseForwardOptions): Promise<T> {
    const url = `${this.purchaseBaseUrl()}${options.path}`;
    const body = this.stripTenant(options.body);
    const params = this.stripTenant(options.query);
    try {
      const response = await firstValueFrom(
        this.http.request<PurchaseEnvelope<T>>({
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
        throw new BadGatewayException('Purchase service error');
      }
      return response.data.data;
    } catch (error) {
      this.rethrowUpstream(error);
    }
  }

  private stripTenant(
    value: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!value) {
      return undefined;
    }
    const copy = { ...value };
    delete copy.tenantId;
    delete copy.tenant_id;
    return copy;
  }

  private purchaseBaseUrl(): string {
    return this.downstream.getUrl('purchase').replace(/\/$/, '');
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
        this.logger.warn('Purchase service unreachable');
        throw new ServiceUnavailableException('Purchase service unavailable');
      }
      const message = this.publicMessage(error, 'Purchase service error');
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
      this.logger.warn(`Purchase upstream status ${String(status)}`);
      throw new BadGatewayException('Purchase service error');
    }

    this.logger.warn('Purchase proxy failed');
    throw new BadGatewayException('Purchase service error');
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
