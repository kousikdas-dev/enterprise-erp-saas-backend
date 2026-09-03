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
import { ApiManagementErrors } from '../identity/api-management-errors';
import { headerString } from '../identity/header-string';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import {
  CreateSalesInvoiceDto,
  SalesInvoiceDto,
  SalesInvoiceListDto,
  UpdateSalesInvoiceDto,
} from './dto/sales-invoice.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Sales Invoices')
@Controller({ path: 'sales-invoices', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesInvoicesController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_CREATE)
  @ApiOperation({
    summary: 'Create sales invoice',
    description:
      'Creates a DRAFT sales invoice directly (not sourced from a sales order or proforma invoice). Permission: sales-invoices.create.',
  })
  @ApiCreatedResponse({ type: SalesInvoiceDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSalesInvoiceDto,
    @Req() request: Request,
  ): Promise<SalesInvoiceDto> {
    return this.sales.forward<SalesInvoiceDto>({
      method: 'POST',
      path: '/api/v1/sales-invoices',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_READ)
  @ApiOperation({
    summary: 'List sales invoices',
    description:
      'Lists sales invoices in the JWT tenant. Permission: sales-invoices.read.',
  })
  @ApiOkResponse({ type: SalesInvoiceListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SalesInvoiceListDto> {
    return this.sales.forward<SalesInvoiceListDto>({
      method: 'GET',
      path: '/api/v1/sales-invoices',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_READ)
  @ApiOperation({
    summary: 'Get sales invoice',
    description:
      'Returns a JWT-tenant sales invoice. Permission: sales-invoices.read.',
  })
  @ApiOkResponse({ type: SalesInvoiceDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesInvoiceDto> {
    return this.sales.forward<SalesInvoiceDto>({
      method: 'GET',
      path: `/api/v1/sales-invoices/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_UPDATE)
  @ApiOperation({
    summary: 'Update sales invoice',
    description:
      'Updates a DRAFT sales invoice only. Permission: sales-invoices.update.',
  })
  @ApiOkResponse({ type: SalesInvoiceDto })
  @ApiConflictResponse({ description: 'Sales invoice is not DRAFT' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesInvoiceDto,
    @Req() request: Request,
  ): Promise<SalesInvoiceDto> {
    return this.sales.forward<SalesInvoiceDto>({
      method: 'PATCH',
      path: `/api/v1/sales-invoices/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/send')
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_SEND)
  @ApiOperation({
    summary: 'Send sales invoice',
    description:
      'Moves DRAFT → SENT and publishes the sales.invoice.posted integration event for Accounting. Permission: sales-invoices.send.',
  })
  @ApiOkResponse({ type: SalesInvoiceDto })
  @ApiConflictResponse({ description: 'Sales invoice cannot be sent' })
  @ApiManagementErrors()
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesInvoiceDto> {
    return this.sales.forward<SalesInvoiceDto>({
      method: 'POST',
      path: `/api/v1/sales-invoices/${id}/send`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_CANCEL)
  @ApiOperation({
    summary: 'Cancel sales invoice',
    description:
      'Cancels a sales invoice when allowed. Permission: sales-invoices.cancel.',
  })
  @ApiOkResponse({ type: SalesInvoiceDto })
  @ApiConflictResponse({ description: 'Sales invoice cannot be cancelled' })
  @ApiManagementErrors()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesInvoiceDto> {
    return this.sales.forward<SalesInvoiceDto>({
      method: 'POST',
      path: `/api/v1/sales-invoices/${id}/cancel`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
