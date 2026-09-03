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
  ProformaInvoiceDto,
  ProformaInvoiceListDto,
  UpdateProformaInvoiceDto,
} from './dto/proforma-invoice.dto';
import {
  CreateInvoiceFromSourceDto,
  SalesInvoiceDto,
} from './dto/sales-invoice.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Proforma Invoices')
@Controller({ path: 'proforma-invoices', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProformaInvoicesController {
  constructor(private readonly sales: SalesForwardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROFORMA_INVOICES_READ)
  @ApiOperation({
    summary: 'List proforma invoices',
    description:
      'Lists proforma invoices in the JWT tenant. Permission: proforma-invoices.read.',
  })
  @ApiOkResponse({ type: ProformaInvoiceListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProformaInvoiceListDto> {
    return this.sales.forward<ProformaInvoiceListDto>({
      method: 'GET',
      path: '/api/v1/proforma-invoices',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROFORMA_INVOICES_READ)
  @ApiOperation({
    summary: 'Get proforma invoice',
    description:
      'Returns a JWT-tenant proforma invoice. Permission: proforma-invoices.read.',
  })
  @ApiOkResponse({ type: ProformaInvoiceDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProformaInvoiceDto> {
    return this.sales.forward<ProformaInvoiceDto>({
      method: 'GET',
      path: `/api/v1/proforma-invoices/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PROFORMA_INVOICES_UPDATE)
  @ApiOperation({
    summary: 'Update proforma invoice',
    description:
      'Updates a DRAFT proforma invoice only. Permission: proforma-invoices.update.',
  })
  @ApiOkResponse({ type: ProformaInvoiceDto })
  @ApiConflictResponse({ description: 'Proforma invoice is not DRAFT' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProformaInvoiceDto,
    @Req() request: Request,
  ): Promise<ProformaInvoiceDto> {
    return this.sales.forward<ProformaInvoiceDto>({
      method: 'PATCH',
      path: `/api/v1/proforma-invoices/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/send')
  @RequirePermissions(PERMISSIONS.PROFORMA_INVOICES_SEND)
  @ApiOperation({
    summary: 'Send proforma invoice',
    description: 'Moves DRAFT → ISSUED. Permission: proforma-invoices.send.',
  })
  @ApiOkResponse({ type: ProformaInvoiceDto })
  @ApiConflictResponse({ description: 'Proforma invoice cannot be sent' })
  @ApiManagementErrors()
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProformaInvoiceDto> {
    return this.sales.forward<ProformaInvoiceDto>({
      method: 'POST',
      path: `/api/v1/proforma-invoices/${id}/send`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PROFORMA_INVOICES_CANCEL)
  @ApiOperation({
    summary: 'Cancel proforma invoice',
    description:
      'Cancels a proforma invoice when allowed. Permission: proforma-invoices.cancel.',
  })
  @ApiOkResponse({ type: ProformaInvoiceDto })
  @ApiConflictResponse({ description: 'Proforma invoice cannot be cancelled' })
  @ApiManagementErrors()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProformaInvoiceDto> {
    return this.sales.forward<ProformaInvoiceDto>({
      method: 'POST',
      path: `/api/v1/proforma-invoices/${id}/cancel`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/invoice')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_INVOICES_CREATE)
  @ApiOperation({
    summary: 'Create sales invoice from proforma invoice',
    description:
      'Creates a DRAFT sales invoice from an ISSUED proforma invoice. Permission: sales-invoices.create.',
  })
  @ApiCreatedResponse({ type: SalesInvoiceDto })
  @ApiConflictResponse({
    description: 'Proforma invoice cannot create a sales invoice',
  })
  @ApiManagementErrors()
  createInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInvoiceFromSourceDto,
    @Req() request: Request,
  ): Promise<SalesInvoiceDto> {
    return this.sales.forward<SalesInvoiceDto>({
      method: 'POST',
      path: `/api/v1/proforma-invoices/${id}/invoice`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
