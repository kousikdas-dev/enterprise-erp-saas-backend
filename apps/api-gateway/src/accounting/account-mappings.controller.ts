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
import { headerString } from '../identity/header-string';
import { ApiManagementErrors } from '../identity/api-management-errors';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { AccountingForwardService } from './accounting-forward.service';
import {
  AccountMappingDto,
  AccountMappingListDto,
  CreateAccountMappingDto,
  UpdateAccountMappingDto,
} from './dto/account-mapping.dto';

@ApiTags('Account Mappings')
@Controller({ path: 'account-mappings', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountMappingsController {
  constructor(private readonly accounting: AccountingForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ACCOUNT_MAPPINGS_CREATE)
  @ApiOperation({
    summary: 'Create account mapping',
    description:
      'Maps a purpose (and, for PAYMENT_METHOD, an entity id) to a chart-of-accounts entry in the JWT tenant. Permission: account-mappings.create.',
  })
  @ApiCreatedResponse({ type: AccountMappingDto })
  @ApiConflictResponse({
    description:
      'A mapping for this purpose (and entity, if applicable) already exists',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAccountMappingDto,
    @Req() request: Request,
  ): Promise<AccountMappingDto> {
    return this.accounting.forward<AccountMappingDto>({
      method: 'POST',
      path: '/api/v1/account-mappings',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ACCOUNT_MAPPINGS_READ)
  @ApiOperation({
    summary: 'List account mappings',
    description:
      'Lists account mappings in the JWT tenant. Permission: account-mappings.read.',
  })
  @ApiOkResponse({ type: AccountMappingListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<AccountMappingListDto> {
    return this.accounting.forward<AccountMappingListDto>({
      method: 'GET',
      path: '/api/v1/account-mappings',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ACCOUNT_MAPPINGS_READ)
  @ApiOperation({
    summary: 'Get account mapping',
    description:
      'Returns a JWT-tenant account mapping. Permission: account-mappings.read.',
  })
  @ApiOkResponse({ type: AccountMappingDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountMappingDto> {
    return this.accounting.forward<AccountMappingDto>({
      method: 'GET',
      path: `/api/v1/account-mappings/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ACCOUNT_MAPPINGS_UPDATE)
  @ApiOperation({
    summary: 'Update account mapping',
    description:
      'Repoints a JWT-tenant account mapping to a different account. Permission: account-mappings.update.',
  })
  @ApiOkResponse({ type: AccountMappingDto })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountMappingDto,
    @Req() request: Request,
  ): Promise<AccountMappingDto> {
    return this.accounting.forward<AccountMappingDto>({
      method: 'PATCH',
      path: `/api/v1/account-mappings/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ACCOUNT_MAPPINGS_DELETE)
  @ApiOperation({
    summary: 'Delete account mapping',
    description:
      'Removes a JWT-tenant account mapping. Permission: account-mappings.delete.',
  })
  @ApiOkResponse({ description: 'Mapping deleted' })
  @ApiManagementErrors()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<{ success: boolean; id: string }> {
    return this.accounting.forward<{ success: boolean; id: string }>({
      method: 'DELETE',
      path: `/api/v1/account-mappings/${id}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
