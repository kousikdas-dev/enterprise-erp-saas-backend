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
import {
  CreateSupplierDto,
  SupplierDto,
  SupplierListDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { PurchaseForwardService } from './purchase-forward.service';

@ApiTags('Suppliers')
@Controller({ path: 'suppliers', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SuppliersController {
  constructor(private readonly purchase: PurchaseForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SUPPLIERS_CREATE)
  @ApiOperation({
    summary: 'Create supplier',
    description:
      'Creates a supplier in the JWT tenant. Permission: suppliers.create.',
  })
  @ApiCreatedResponse({ type: SupplierDto })
  @ApiConflictResponse({ description: 'Supplier code already exists' })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupplierDto,
    @Req() request: Request,
  ): Promise<SupplierDto> {
    return this.purchase.forward<SupplierDto>({
      method: 'POST',
      path: '/api/v1/suppliers',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ)
  @ApiOperation({
    summary: 'List suppliers',
    description: 'Lists suppliers in the JWT tenant. Permission: suppliers.read.',
  })
  @ApiOkResponse({ type: SupplierListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SupplierListDto> {
    return this.purchase.forward<SupplierListDto>({
      method: 'GET',
      path: '/api/v1/suppliers',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ)
  @ApiOperation({
    summary: 'Get supplier',
    description: 'Returns a JWT-tenant supplier. Permission: suppliers.read.',
  })
  @ApiOkResponse({ type: SupplierDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierDto> {
    return this.purchase.forward<SupplierDto>({
      method: 'GET',
      path: `/api/v1/suppliers/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_UPDATE)
  @ApiOperation({
    summary: 'Update supplier',
    description: 'Updates a JWT-tenant supplier. Permission: suppliers.update.',
  })
  @ApiOkResponse({ type: SupplierDto })
  @ApiConflictResponse({ description: 'Supplier code already exists' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() request: Request,
  ): Promise<SupplierDto> {
    return this.purchase.forward<SupplierDto>({
      method: 'PATCH',
      path: `/api/v1/suppliers/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
