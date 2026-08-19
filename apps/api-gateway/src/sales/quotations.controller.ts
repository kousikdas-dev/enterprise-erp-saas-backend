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
  CreateQuotationDto,
  QuotationDto,
  QuotationListDto,
  UpdateQuotationDto,
} from './dto/quotation.dto';
import { SalesOrderDto } from './dto/sales-order.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Quotations')
@Controller({ path: 'quotations', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuotationsController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.QUOTATIONS_CREATE)
  @ApiOperation({
    summary: 'Create quotation',
    description:
      'Creates a DRAFT quotation. Permission: quotations.create.',
  })
  @ApiCreatedResponse({ type: QuotationDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuotationDto,
    @Req() request: Request,
  ): Promise<QuotationDto> {
    return this.sales.forward<QuotationDto>({
      method: 'POST',
      path: '/api/v1/quotations',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ)
  @ApiOperation({
    summary: 'List quotations',
    description:
      'Lists quotations in the JWT tenant. Permission: quotations.read.',
  })
  @ApiOkResponse({ type: QuotationListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<QuotationListDto> {
    return this.sales.forward<QuotationListDto>({
      method: 'GET',
      path: '/api/v1/quotations',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ)
  @ApiOperation({
    summary: 'Get quotation',
    description: 'Returns a JWT-tenant quotation. Permission: quotations.read.',
  })
  @ApiOkResponse({ type: QuotationDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuotationDto> {
    return this.sales.forward<QuotationDto>({
      method: 'GET',
      path: `/api/v1/quotations/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_UPDATE)
  @ApiOperation({
    summary: 'Update quotation',
    description:
      'Updates a DRAFT quotation only. Permission: quotations.update.',
  })
  @ApiOkResponse({ type: QuotationDto })
  @ApiConflictResponse({ description: 'Quotation is not DRAFT' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
    @Req() request: Request,
  ): Promise<QuotationDto> {
    return this.sales.forward<QuotationDto>({
      method: 'PATCH',
      path: `/api/v1/quotations/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/send')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_SEND)
  @ApiOperation({
    summary: 'Send quotation',
    description: 'Moves DRAFT → SENT. Permission: quotations.send.',
  })
  @ApiOkResponse({ type: QuotationDto })
  @ApiConflictResponse({ description: 'Quotation cannot be sent' })
  @ApiManagementErrors()
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<QuotationDto> {
    return this.sales.forward<QuotationDto>({
      method: 'POST',
      path: `/api/v1/quotations/${id}/send`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/accept')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_ACCEPT)
  @ApiOperation({
    summary: 'Accept quotation',
    description: 'Moves SENT → ACCEPTED. Permission: quotations.accept.',
  })
  @ApiOkResponse({ type: QuotationDto })
  @ApiConflictResponse({ description: 'Quotation cannot be accepted' })
  @ApiManagementErrors()
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<QuotationDto> {
    return this.sales.forward<QuotationDto>({
      method: 'POST',
      path: `/api/v1/quotations/${id}/accept`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_REJECT)
  @ApiOperation({
    summary: 'Reject quotation',
    description: 'Moves SENT → REJECTED. Permission: quotations.reject.',
  })
  @ApiOkResponse({ type: QuotationDto })
  @ApiConflictResponse({ description: 'Quotation cannot be rejected' })
  @ApiManagementErrors()
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<QuotationDto> {
    return this.sales.forward<QuotationDto>({
      method: 'POST',
      path: `/api/v1/quotations/${id}/reject`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_CANCEL)
  @ApiOperation({
    summary: 'Cancel quotation',
    description: 'Cancels a quotation when allowed. Permission: quotations.cancel.',
  })
  @ApiOkResponse({ type: QuotationDto })
  @ApiConflictResponse({ description: 'Quotation cannot be cancelled' })
  @ApiManagementErrors()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<QuotationDto> {
    return this.sales.forward<QuotationDto>({
      method: 'POST',
      path: `/api/v1/quotations/${id}/cancel`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/proforma')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PROFORMA_INVOICES_CREATE)
  @ApiOperation({
    summary: 'Create proforma from quotation',
    description:
      'Creates a commercial proforma snapshot from a quotation. Permission: proforma-invoices.create.',
  })
  @ApiCreatedResponse({ type: ProformaInvoiceDto })
  @ApiConflictResponse({ description: 'Quotation cannot create proforma' })
  @ApiManagementErrors()
  createProforma(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProformaInvoiceDto> {
    return this.sales.forward<ProformaInvoiceDto>({
      method: 'POST',
      path: `/api/v1/quotations/${id}/proforma`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/convert-to-order')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_ORDERS_CREATE)
  @ApiOperation({
    summary: 'Convert quotation to sales order',
    description:
      'Converts an ACCEPTED quotation into a DRAFT sales order. Permission: sales-orders.create.',
  })
  @ApiCreatedResponse({ type: SalesOrderDto })
  @ApiConflictResponse({
    description: 'Quotation not ACCEPTED or already converted',
  })
  @ApiManagementErrors()
  convertToOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesOrderDto> {
    return this.sales.forward<SalesOrderDto>({
      method: 'POST',
      path: `/api/v1/quotations/${id}/convert-to-order`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
