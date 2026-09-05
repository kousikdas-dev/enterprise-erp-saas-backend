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
  CreateTaxCodeDto,
  TaxCodeDto,
  TaxCodeListDto,
  UpdateTaxCodeDto,
  UpdateTaxCodeStatusDto,
} from './dto/tax-code.dto';

@ApiTags('Tax Master')
@Controller({ path: 'tax-codes', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaxCodesController {
  constructor(private readonly accounting: AccountingForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.TAX_CODES_CREATE)
  @ApiOperation({
    summary: 'Create tax code',
    description:
      'Creates a tax code with its tax components in the JWT tenant. Permission: tax-codes.create.',
  })
  @ApiCreatedResponse({ type: TaxCodeDto })
  @ApiConflictResponse({ description: 'Tax code already exists' })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaxCodeDto,
    @Req() request: Request,
  ): Promise<TaxCodeDto> {
    return this.accounting.forward<TaxCodeDto>({
      method: 'POST',
      path: '/api/v1/tax-codes',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TAX_CODES_READ)
  @ApiOperation({
    summary: 'List tax codes',
    description:
      'Lists tax codes in the JWT tenant. Permission: tax-codes.read.',
  })
  @ApiOkResponse({ type: TaxCodeListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<TaxCodeListDto> {
    return this.accounting.forward<TaxCodeListDto>({
      method: 'GET',
      path: '/api/v1/tax-codes',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TAX_CODES_READ)
  @ApiOperation({
    summary: 'Get tax code',
    description: 'Returns a JWT-tenant tax code. Permission: tax-codes.read.',
  })
  @ApiOkResponse({ type: TaxCodeDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaxCodeDto> {
    return this.accounting.forward<TaxCodeDto>({
      method: 'GET',
      path: `/api/v1/tax-codes/${id}`,
      user,
    });
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.TAX_CODES_UPDATE)
  @ApiOperation({
    summary: 'Activate or deactivate tax code',
    description:
      'Sets the active status of a JWT-tenant tax code. Permission: tax-codes.update.',
  })
  @ApiOkResponse({ type: TaxCodeDto })
  @ApiManagementErrors()
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxCodeStatusDto,
    @Req() request: Request,
  ): Promise<TaxCodeDto> {
    return this.accounting.forward<TaxCodeDto>({
      method: 'PATCH',
      path: `/api/v1/tax-codes/${id}/status`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TAX_CODES_UPDATE)
  @ApiOperation({
    summary: 'Update tax code',
    description:
      'Updates a JWT-tenant tax code, optionally replacing all of its components. Permission: tax-codes.update.',
  })
  @ApiOkResponse({ type: TaxCodeDto })
  @ApiConflictResponse({ description: 'Tax code already exists' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxCodeDto,
    @Req() request: Request,
  ): Promise<TaxCodeDto> {
    return this.accounting.forward<TaxCodeDto>({
      method: 'PATCH',
      path: `/api/v1/tax-codes/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
