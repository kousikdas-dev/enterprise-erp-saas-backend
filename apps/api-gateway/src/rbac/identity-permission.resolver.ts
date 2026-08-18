import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { DownstreamRegistry } from '../downstream/downstream.registry';
import { PermissionResolver } from './permission-resolver';

const IDENTITY_PERMISSIONS_PATH = '/api/v1/internal/rbac/permissions';

interface IdentityPermissionsEnvelope {
  success?: boolean;
  data?: { permissions?: string[] };
}

@Injectable()
export class IdentityPermissionResolver implements PermissionResolver {
  private readonly logger = new Logger(IdentityPermissionResolver.name);

  constructor(
    private readonly http: HttpService,
    private readonly downstream: DownstreamRegistry,
  ) {}

  async getPermissionKeys(userId: string, tenantId: string): Promise<string[]> {
    const base = this.downstream.getUrl('identity').replace(/\/$/, '');
    const url = `${base}${IDENTITY_PERMISSIONS_PATH}`;

    try {
      const response = await firstValueFrom(
        this.http.post<IdentityPermissionsEnvelope>(url, { userId, tenantId }),
      );
      const permissions = response.data?.data?.permissions;
      if (!Array.isArray(permissions)) {
        throw new BadGatewayException('Identity service error');
      }
      return permissions.filter((item) => typeof item === 'string');
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      if (isAxiosError(error) && !error.response) {
        this.logger.warn('Identity RBAC lookup unreachable');
        throw new ServiceUnavailableException('Identity service unavailable');
      }
      this.logger.warn('Identity RBAC lookup failed');
      throw new BadGatewayException('Identity service error');
    }
  }
}
