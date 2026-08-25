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
  CreateCustomerAddressDto,
  CustomerAddressDto,
  CustomerAddressListDto,
  UpdateCustomerAddressDto,
} from './dto/customer-address.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Customer Addresses')
@Controller({ path: 'customers/:customerId/addresses', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomerAddressesController {
  constructor(private readonly sales: SalesForwardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({
    summary: 'List customer addresses',
    description:
      'Lists addresses for a JWT-tenant customer. Permission: customers.read.',
  })
  @ApiOkResponse({ type: CustomerAddressListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CustomerAddressListDto> {
    return this.sales.forward<CustomerAddressListDto>({
      method: 'GET',
      path: `/api/v1/customers/${customerId}/addresses`,
      user,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiOperation({
    summary: 'Add customer address',
    description:
      'Adds an address to a JWT-tenant customer. Permission: customers.update.',
  })
  @ApiCreatedResponse({ type: CustomerAddressDto })
  @ApiConflictResponse({
    description: 'Address conflict or customer not found',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateCustomerAddressDto,
    @Req() request: Request,
  ): Promise<CustomerAddressDto> {
    return this.sales.forward<CustomerAddressDto>({
      method: 'POST',
      path: `/api/v1/customers/${customerId}/addresses`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':addressId')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiOperation({
    summary: 'Update customer address',
    description:
      'Updates an address belonging to a JWT-tenant customer. Permission: customers.update.',
  })
  @ApiOkResponse({ type: CustomerAddressDto })
  @ApiConflictResponse({
    description: 'Address conflict or customer not found',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateCustomerAddressDto,
    @Req() request: Request,
  ): Promise<CustomerAddressDto> {
    return this.sales.forward<CustomerAddressDto>({
      method: 'PATCH',
      path: `/api/v1/customers/${customerId}/addresses/${addressId}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':addressId')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiOperation({
    summary: 'Remove customer address',
    description:
      'Removes an address from a JWT-tenant customer. Permission: customers.update.',
  })
  @ApiOkResponse({ type: CustomerAddressDto })
  @ApiManagementErrors()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Req() request: Request,
  ): Promise<CustomerAddressDto> {
    return this.sales.forward<CustomerAddressDto>({
      method: 'DELETE',
      path: `/api/v1/customers/${customerId}/addresses/${addressId}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
