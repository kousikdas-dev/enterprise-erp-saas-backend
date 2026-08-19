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
import { ProformaInvoiceDto } from './dto/proforma-invoice.dto';
import {
  CreateSalesOrderDto,
  SalesOrderDto,
  SalesOrderListDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Sales Orders')
@Controller({ path: 'sales-orders', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesOrdersController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_ORDERS_CREATE)
  @ApiOperation({
    summary: 'Create sales order',
    description:
      'Creates a DRAFT sales order. Permission: sales-orders.create.',
  })
  @ApiCreatedResponse({ type: SalesOrderDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSalesOrderDto,
    @Req() request: Request,
  ): Promise<SalesOrderDto> {
    return this.sales.forward<SalesOrderDto>({
      method: 'POST',
      path: '/api/v1/sales-orders',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_ORDERS_READ)
  @ApiOperation({
    summary: 'List sales orders',
    description:
      'Lists sales orders in the JWT tenant. Permission: sales-orders.read.',
  })
  @ApiOkResponse({ type: SalesOrderListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SalesOrderListDto> {
    return this.sales.forward<SalesOrderListDto>({
      method: 'GET',
      path: '/api/v1/sales-orders',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_ORDERS_READ)
  @ApiOperation({
    summary: 'Get sales order',
    description:
      'Returns a JWT-tenant sales order. Permission: sales-orders.read.',
  })
  @ApiOkResponse({ type: SalesOrderDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesOrderDto> {
    return this.sales.forward<SalesOrderDto>({
      method: 'GET',
      path: `/api/v1/sales-orders/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SALES_ORDERS_UPDATE)
  @ApiOperation({
    summary: 'Update sales order',
    description:
      'Updates a DRAFT sales order only. Permission: sales-orders.update.',
  })
  @ApiOkResponse({ type: SalesOrderDto })
  @ApiConflictResponse({ description: 'Sales order is not DRAFT' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesOrderDto,
    @Req() request: Request,
  ): Promise<SalesOrderDto> {
    return this.sales.forward<SalesOrderDto>({
      method: 'PATCH',
      path: `/api/v1/sales-orders/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.SALES_ORDERS_CONFIRM)
  @ApiOperation({
    summary: 'Confirm sales order',
    description:
      'Moves a DRAFT sales order to CONFIRMED. Permission: sales-orders.confirm.',
  })
  @ApiOkResponse({ type: SalesOrderDto })
  @ApiConflictResponse({ description: 'Sales order cannot be confirmed' })
  @ApiManagementErrors()
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesOrderDto> {
    return this.sales.forward<SalesOrderDto>({
      method: 'POST',
      path: `/api/v1/sales-orders/${id}/confirm`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.SALES_ORDERS_CANCEL)
  @ApiOperation({
    summary: 'Cancel sales order',
    description:
      'Cancels a sales order when allowed. Permission: sales-orders.cancel.',
  })
  @ApiOkResponse({ type: SalesOrderDto })
  @ApiConflictResponse({ description: 'Sales order cannot be cancelled' })
  @ApiManagementErrors()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesOrderDto> {
    return this.sales.forward<SalesOrderDto>({
      method: 'POST',
      path: `/api/v1/sales-orders/${id}/cancel`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/proforma')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PROFORMA_INVOICES_CREATE)
  @ApiOperation({
    summary: 'Create proforma from sales order',
    description:
      'Creates a commercial proforma snapshot from a sales order. Permission: proforma-invoices.create.',
  })
  @ApiCreatedResponse({ type: ProformaInvoiceDto })
  @ApiConflictResponse({ description: 'Sales order cannot create proforma' })
  @ApiManagementErrors()
  createProforma(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProformaInvoiceDto> {
    return this.sales.forward<ProformaInvoiceDto>({
      method: 'POST',
      path: `/api/v1/sales-orders/${id}/proforma`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
