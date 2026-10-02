import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ACTOR_TENANT_ID_HEADER, ACTOR_USER_ID_HEADER } from '@app/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { DownstreamRegistry } from '../downstream/downstream.registry';

interface ProductionEnvelope<T> {
  success?: boolean;
  data?: T;
}

export interface ProductionForwardOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  user: AuthenticatedUser;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ProductionForwardService {
  private readonly logger = new Logger(ProductionForwardService.name);

  constructor(
    private readonly http: HttpService,
    private readonly downstream: DownstreamRegistry,
  ) {}

  async forward<T>(options: ProductionForwardOptions): Promise<T> {
    const url = `${this.productionBaseUrl()}${options.path}`;
    const body = this.stripTenant(options.body);
    const params = this.stripTenant(options.query);
    try {
      const response = await firstValueFrom(
        this.http.request<ProductionEnvelope<T>>({
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
        throw new BadGatewayException('Production service error');
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

  private productionBaseUrl(): string {
    return this.downstream.getUrl('production').replace(/\/$/, '');
  }

  private rethrowUpstream(error: unknown): never {
    if (
      error instanceof UnauthorizedException ||
      error instanceof BadRequestException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException ||
      error instanceof ConflictException ||
      error instanceof NotImplementedException ||
      error instanceof BadGatewayException ||
      error instanceof ServiceUnavailableException
    ) {
      throw error;
    }

    if (isAxiosError(error)) {
      const status = error.response?.status;
      if (!error.response) {
        this.logger.warn('Production service unreachable');
        throw new ServiceUnavailableException('Production service unavailable');
      }
      const body = this.publicErrorBody(error, 'Production service error');
      if (status === HttpStatus.BAD_REQUEST) {
        throw new BadRequestException(body);
      }
      if (status === HttpStatus.UNAUTHORIZED) {
        throw new UnauthorizedException(body);
      }
      if (status === HttpStatus.FORBIDDEN) {
        throw new ForbiddenException(body);
      }
      if (status === HttpStatus.NOT_FOUND) {
        throw new NotFoundException(body);
      }
      if (status === HttpStatus.CONFLICT) {
        throw new ConflictException(body);
      }
      if (status === HttpStatus.NOT_IMPLEMENTED) {
        throw new NotImplementedException(body);
      }
      this.logger.warn(`Production upstream status ${String(status)}`);
      throw new BadGatewayException('Production service error');
    }

    this.logger.warn('Production proxy failed');
    throw new BadGatewayException('Production service error');
  }

  private publicErrorBody(
    error: unknown,
    fallback: string,
  ): string | string[] | { message: string | string[]; code?: string; details?: unknown } {
    if (!isAxiosError(error)) {
      return fallback;
    }
    const payload = error.response?.data as
      | { message?: unknown; code?: unknown; details?: unknown }
      | undefined;
    const rawMessage = payload?.message;
    const message =
      typeof rawMessage === 'string' && rawMessage.length > 0
        ? rawMessage
        : Array.isArray(rawMessage) &&
            rawMessage.every((item) => typeof item === 'string')
          ? (rawMessage as string[])
          : fallback;
    const code = typeof payload?.code === 'string' ? payload.code : undefined;
    if (code === undefined && payload?.details === undefined) {
      return message;
    }
    return { message, ...(code !== undefined ? { code } : {}), ...(payload?.details !== undefined ? { details: payload.details } : {}) };
  }
}
