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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDto, UserListDto } from './dto/user.dto';
import { IdentityForwardService } from './identity-forward.service';

function headerString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

@ApiTags('Users')
@Controller({ path: 'users', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly identity: IdentityForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @ApiOperation({
    summary: 'Create user',
    description:
      'Creates a user in the JWT tenant only. Password is hashed in Identity. Permission: users.create.',
  })
  @ApiCreatedResponse({ type: UserDto })
  @ApiConflictResponse({ description: 'Email already exists in this tenant' })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
    @Req() request: Request,
  ): Promise<UserDto> {
    return this.identity.forward<UserDto>({
      method: 'POST',
      path: '/api/v1/users',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({
    summary: 'List users',
    description: 'Lists users in the JWT tenant only. Permission: users.read.',
  })
  @ApiOkResponse({ type: UserListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<UserListDto> {
    return this.identity.forward<UserListDto>({
      method: 'GET',
      path: '/api/v1/users',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({
    summary: 'Get user',
    description:
      'Returns a user in the JWT tenant. Other tenants: 404. Permission: users.read.',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserDto> {
    return this.identity.forward<UserDto>({
      method: 'GET',
      path: `/api/v1/users/${id}`,
      user,
    });
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.USERS_STATUS)
  @ApiOperation({
    summary: 'Change user status',
    description:
      'Updates status for a user in the JWT tenant. Permission: users.status.',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiManagementErrors()
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() request: Request,
  ): Promise<UserDto> {
    return this.identity.forward<UserDto>({
      method: 'PATCH',
      path: `/api/v1/users/${id}/status`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @ApiOperation({
    summary: 'Update user',
    description: 'Updates a user in the JWT tenant. Permission: users.update.',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: Request,
  ): Promise<UserDto> {
    return this.identity.forward<UserDto>({
      method: 'PATCH',
      path: `/api/v1/users/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
