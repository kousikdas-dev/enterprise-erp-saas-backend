import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@app/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { ApiManagementErrors } from './api-management-errors';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantDto, TenantListDto } from './dto/tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { IdentityForwardService } from './identity-forward.service';

function headerString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

@ApiTags('Tenants')
@Controller({ path: 'tenants', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantsController {
  constructor(private readonly identity: IdentityForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.TENANTS_CREATE)
  @ApiOperation({
    summary: 'Create tenant',
    description:
      "Requires tenants.create (platform capability assigned via the caller's tenant roles). Ordinary tenant users do not receive this permission. Tenant is never taken from the body.",
  })
  @ApiCreatedResponse({ type: TenantDto })
  @ApiConflictResponse({ description: 'Tenant code already exists' })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTenantDto,
    @Req() request: Request,
  ): Promise<TenantDto> {
    return this.identity.forward<TenantDto>({
      method: 'POST',
      path: '/api/v1/tenants',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TENANTS_READ)
  @ApiOperation({
    summary: 'List tenants',
    description:
      "Returns only the caller's tenant from the JWT. Required permission: tenants.read.",
  })
  @ApiOkResponse({ type: TenantListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<TenantListDto> {
    return this.identity.forward<TenantListDto>({
      method: 'GET',
      path: '/api/v1/tenants',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TENANTS_READ)
  @ApiOperation({
    summary: 'Get tenant',
    description:
      'Returns the tenant when id matches JWT tenantId. Other tenants: 404. Permission: tenants.read.',
  })
  @ApiOkResponse({ type: TenantDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TenantDto> {
    return this.identity.forward<TenantDto>({
      method: 'GET',
      path: `/api/v1/tenants/${id}`,
      user,
    });
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.TENANTS_STATUS)
  @ApiOperation({
    summary: 'Change tenant status',
    description:
      'Updates status for the JWT tenant only. Permission: tenants.status.',
  })
  @ApiOkResponse({ type: TenantDto })
  @ApiManagementErrors()
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
    @Req() request: Request,
  ): Promise<TenantDto> {
    return this.identity.forward<TenantDto>({
      method: 'PATCH',
      path: `/api/v1/tenants/${id}/status`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TENANTS_UPDATE)
  @ApiOperation({
    summary: 'Update tenant',
    description: 'Updates the JWT tenant only. Permission: tenants.update.',
  })
  @ApiOkResponse({ type: TenantDto })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @Req() request: Request,
  ): Promise<TenantDto> {
    return this.identity.forward<TenantDto>({
      method: 'PATCH',
      path: `/api/v1/tenants/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
