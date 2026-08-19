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
  CreateCustomerDto,
  CustomerDto,
  CustomerListDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Customers')
@Controller({ path: 'customers', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CUSTOMERS_CREATE)
  @ApiOperation({
    summary: 'Create customer',
    description:
      'Creates a customer in the JWT tenant. Permission: customers.create.',
  })
  @ApiCreatedResponse({ type: CustomerDto })
  @ApiConflictResponse({ description: 'Customer code already exists' })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
    @Req() request: Request,
  ): Promise<CustomerDto> {
    return this.sales.forward<CustomerDto>({
      method: 'POST',
      path: '/api/v1/customers',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({
    summary: 'List customers',
    description: 'Lists customers in the JWT tenant. Permission: customers.read.',
  })
  @ApiOkResponse({ type: CustomerListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<CustomerListDto> {
    return this.sales.forward<CustomerListDto>({
      method: 'GET',
      path: '/api/v1/customers',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({
    summary: 'Get customer',
    description: 'Returns a JWT-tenant customer. Permission: customers.read.',
  })
  @ApiOkResponse({ type: CustomerDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerDto> {
    return this.sales.forward<CustomerDto>({
      method: 'GET',
      path: `/api/v1/customers/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiOperation({
    summary: 'Update customer',
    description: 'Updates a JWT-tenant customer. Permission: customers.update.',
  })
  @ApiOkResponse({ type: CustomerDto })
  @ApiConflictResponse({ description: 'Customer code already exists' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() request: Request,
  ): Promise<CustomerDto> {
    return this.sales.forward<CustomerDto>({
      method: 'PATCH',
      path: `/api/v1/customers/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
