import {
  Body,
  Controller,
  Delete,
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
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleDto, RoleListDto, RoleRemovedDto } from './dto/role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { headerString } from './header-string';
import { IdentityForwardService } from './identity-forward.service';

@ApiTags('Roles')
@Controller({ path: 'roles', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly identity: IdentityForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ROLES_CREATE)
  @ApiOperation({
    summary: 'Create role',
    description:
      'Creates a role in the JWT tenant. Name is unique per tenant. Permission: roles.create.',
  })
  @ApiCreatedResponse({ type: RoleDto })
  @ApiConflictResponse({
    description: 'Role name already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoleDto,
    @Req() request: Request,
  ): Promise<RoleDto> {
    return this.identity.forward<RoleDto>({
      method: 'POST',
      path: '/api/v1/roles',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @ApiOperation({
    summary: 'List roles',
    description: 'Lists roles in the JWT tenant only. Permission: roles.read.',
  })
  @ApiOkResponse({ type: RoleListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<RoleListDto> {
    return this.identity.forward<RoleListDto>({
      method: 'GET',
      path: '/api/v1/roles',
      user,
    });
  }

  @Post(':id/permissions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ROLES_PERMISSIONS)
  @ApiTags('Role Permissions')
  @ApiOperation({
    summary: 'Assign permission to role',
    description:
      'Assigns a catalog permission to a role in the JWT tenant. Permission: roles.permissions.',
  })
  @ApiCreatedResponse({ type: RoleDto })
  @ApiConflictResponse({ description: 'Permission already assigned' })
  @ApiManagementErrors()
  assignPermission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionDto,
    @Req() request: Request,
  ): Promise<RoleDto> {
    return this.identity.forward<RoleDto>({
      method: 'POST',
      path: `/api/v1/roles/${id}/permissions`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id/permissions/:permissionId')
  @RequirePermissions(PERMISSIONS.ROLES_PERMISSIONS)
  @ApiTags('Role Permissions')
  @ApiOperation({
    summary: 'Remove permission from role',
    description:
      'Removes a catalog permission from a JWT-tenant role. Missing assignment: 404. Permission: roles.permissions.',
  })
  @ApiOkResponse({ type: RoleRemovedDto })
  @ApiManagementErrors()
  removePermission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @Req() request: Request,
  ): Promise<RoleRemovedDto> {
    return this.identity.forward<RoleRemovedDto>({
      method: 'DELETE',
      path: `/api/v1/roles/${id}/permissions/${permissionId}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @ApiOperation({
    summary: 'Get role',
    description:
      'Returns a role in the JWT tenant including assigned permissions. Other tenants: 404. Permission: roles.read.',
  })
  @ApiOkResponse({ type: RoleDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoleDto> {
    return this.identity.forward<RoleDto>({
      method: 'GET',
      path: `/api/v1/roles/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLES_UPDATE)
  @ApiOperation({
    summary: 'Update role',
    description:
      'Updates name/description for a JWT-tenant role. Permission: roles.update.',
  })
  @ApiOkResponse({ type: RoleDto })
  @ApiConflictResponse({
    description: 'Role name already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: Request,
  ): Promise<RoleDto> {
    return this.identity.forward<RoleDto>({
      method: 'PATCH',
      path: `/api/v1/roles/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
