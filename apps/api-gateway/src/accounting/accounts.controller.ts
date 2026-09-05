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
import { headerString } from '../identity/header-string';
import { ApiManagementErrors } from '../identity/api-management-errors';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { AccountingForwardService } from './accounting-forward.service';
import {
  AccountDto,
  AccountListDto,
  CreateAccountDto,
  UpdateAccountDto,
  UpdateAccountStatusDto,
} from './dto/account.dto';

@ApiTags('Chart of Accounts')
@Controller({ path: 'accounts', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountsController {
  constructor(private readonly accounting: AccountingForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ACCOUNTS_CREATE)
  @ApiOperation({
    summary: 'Create account',
    description:
      'Creates a chart-of-accounts entry in the JWT tenant. Permission: accounts.create.',
  })
  @ApiCreatedResponse({ type: AccountDto })
  @ApiConflictResponse({ description: 'Account code already exists' })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAccountDto,
    @Req() request: Request,
  ): Promise<AccountDto> {
    return this.accounting.forward<AccountDto>({
      method: 'POST',
      path: '/api/v1/accounts',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ACCOUNTS_READ)
  @ApiOperation({
    summary: 'List accounts',
    description:
      'Lists chart-of-accounts entries in the JWT tenant. Permission: accounts.read.',
  })
  @ApiOkResponse({ type: AccountListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<AccountListDto> {
    return this.accounting.forward<AccountListDto>({
      method: 'GET',
      path: '/api/v1/accounts',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_READ)
  @ApiOperation({
    summary: 'Get account',
    description: 'Returns a JWT-tenant account. Permission: accounts.read.',
  })
  @ApiOkResponse({ type: AccountDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDto> {
    return this.accounting.forward<AccountDto>({
      method: 'GET',
      path: `/api/v1/accounts/${id}`,
      user,
    });
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_UPDATE)
  @ApiOperation({
    summary: 'Activate or deactivate account',
    description:
      'Sets the active status of a JWT-tenant account. Permission: accounts.update.',
  })
  @ApiOkResponse({ type: AccountDto })
  @ApiManagementErrors()
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountStatusDto,
    @Req() request: Request,
  ): Promise<AccountDto> {
    return this.accounting.forward<AccountDto>({
      method: 'PATCH',
      path: `/api/v1/accounts/${id}/status`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ACCOUNTS_UPDATE)
  @ApiOperation({
    summary: 'Update account',
    description: 'Updates a JWT-tenant account. Permission: accounts.update.',
  })
  @ApiOkResponse({ type: AccountDto })
  @ApiConflictResponse({ description: 'Account code already exists' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @Req() request: Request,
  ): Promise<AccountDto> {
    return this.accounting.forward<AccountDto>({
      method: 'PATCH',
      path: `/api/v1/accounts/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
