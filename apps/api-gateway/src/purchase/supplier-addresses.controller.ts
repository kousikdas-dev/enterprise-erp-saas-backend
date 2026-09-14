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
import {
  CreateSupplierAddressDto,
  SupplierAddressDeleteDto,
  SupplierAddressDto,
  SupplierAddressListDto,
  UpdateSupplierAddressDto,
} from './dto/supplier-address.dto';
import { PurchaseForwardService } from './purchase-forward.service';

@ApiTags('Supplier Addresses')
@Controller({ path: 'suppliers/:supplierId/addresses', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplierAddressesController {
  constructor(private readonly purchase: PurchaseForwardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ)
  @ApiOperation({
    summary: 'List supplier addresses',
    description:
      'Lists addresses for a JWT-tenant supplier. Permission: suppliers.read.',
  })
  @ApiOkResponse({ type: SupplierAddressListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ): Promise<SupplierAddressListDto> {
    return this.purchase.forward<SupplierAddressListDto>({
      method: 'GET',
      path: `/api/v1/suppliers/${supplierId}/addresses`,
      user,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SUPPLIERS_UPDATE)
  @ApiOperation({
    summary: 'Add supplier address',
    description:
      'Adds an address to a JWT-tenant supplier. Permission: suppliers.update.',
  })
  @ApiCreatedResponse({ type: SupplierAddressDto })
  @ApiConflictResponse({
    description: 'Address conflict or supplier not found',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreateSupplierAddressDto,
    @Req() request: Request,
  ): Promise<SupplierAddressDto> {
    return this.purchase.forward<SupplierAddressDto>({
      method: 'POST',
      path: `/api/v1/suppliers/${supplierId}/addresses`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':addressId')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_UPDATE)
  @ApiOperation({
    summary: 'Update supplier address',
    description:
      'Updates an address belonging to a JWT-tenant supplier. Permission: suppliers.update.',
  })
  @ApiOkResponse({ type: SupplierAddressDto })
  @ApiConflictResponse({
    description: 'Address conflict or supplier not found',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateSupplierAddressDto,
    @Req() request: Request,
  ): Promise<SupplierAddressDto> {
    return this.purchase.forward<SupplierAddressDto>({
      method: 'PATCH',
      path: `/api/v1/suppliers/${supplierId}/addresses/${addressId}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':addressId')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_UPDATE)
  @ApiOperation({
    summary: 'Remove supplier address',
    description:
      'Removes an address from a JWT-tenant supplier. Permission: suppliers.update.',
  })
  @ApiOkResponse({ type: SupplierAddressDeleteDto })
  @ApiManagementErrors()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Req() request: Request,
  ): Promise<SupplierAddressDeleteDto> {
    return this.purchase.forward<SupplierAddressDeleteDto>({
      method: 'DELETE',
      path: `/api/v1/suppliers/${supplierId}/addresses/${addressId}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
