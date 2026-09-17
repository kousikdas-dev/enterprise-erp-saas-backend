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
  CreatePurchaseInvoiceDto,
  CreateSupplierPaymentDto,
  PurchaseInvoiceDto,
  PurchaseInvoiceListDto,
  RecordSupplierPaymentResultDto,
  SupplierPaymentListDto,
  UpdatePurchaseInvoiceDto,
} from './dto/purchase-invoice.dto';
import { PurchaseForwardService } from './purchase-forward.service';

@ApiTags('Purchase Invoices')
@Controller({ path: 'purchase-invoices', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseInvoicesController {
  constructor(private readonly purchase: PurchaseForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_CREATE)
  @ApiOperation({
    summary: 'Create purchase invoice',
    description:
      'Creates a DRAFT purchase invoice against a receivable purchase order. Quantities/costs are decimal strings. Permission: purchase-invoices.create.',
  })
  @ApiCreatedResponse({ type: PurchaseInvoiceDto })
  @ApiConflictResponse({
    description: 'PO not open for invoicing, or invoice quantity exceeds remaining received/ordered quantity',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseInvoiceDto,
    @Req() request: Request,
  ): Promise<PurchaseInvoiceDto> {
    return this.purchase.forward<PurchaseInvoiceDto>({
      method: 'POST',
      path: '/api/v1/purchase-invoices',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_READ)
  @ApiOperation({
    summary: 'List purchase invoices',
    description:
      'Lists purchase invoices in the JWT tenant. Permission: purchase-invoices.read.',
  })
  @ApiOkResponse({ type: PurchaseInvoiceListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<PurchaseInvoiceListDto> {
    return this.purchase.forward<PurchaseInvoiceListDto>({
      method: 'GET',
      path: '/api/v1/purchase-invoices',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_READ)
  @ApiOperation({
    summary: 'Get purchase invoice',
    description:
      'Returns a JWT-tenant purchase invoice. Permission: purchase-invoices.read.',
  })
  @ApiOkResponse({ type: PurchaseInvoiceDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseInvoiceDto> {
    return this.purchase.forward<PurchaseInvoiceDto>({
      method: 'GET',
      path: `/api/v1/purchase-invoices/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_UPDATE)
  @ApiOperation({
    summary: 'Update purchase invoice',
    description:
      'Updates a DRAFT purchase invoice only; a full items[] replaces the existing line set. Permission: purchase-invoices.update.',
  })
  @ApiOkResponse({ type: PurchaseInvoiceDto })
  @ApiConflictResponse({ description: 'Invoice is not DRAFT' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseInvoiceDto,
    @Req() request: Request,
  ): Promise<PurchaseInvoiceDto> {
    return this.purchase.forward<PurchaseInvoiceDto>({
      method: 'PATCH',
      path: `/api/v1/purchase-invoices/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_CONFIRM)
  @ApiOperation({
    summary: 'Confirm purchase invoice',
    description:
      'Moves a DRAFT invoice to CONFIRMED, committing its quantities against the purchase order lines. Permission: purchase-invoices.confirm.',
  })
  @ApiOkResponse({ type: PurchaseInvoiceDto })
  @ApiConflictResponse({ description: 'Invoice cannot be confirmed' })
  @ApiManagementErrors()
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseInvoiceDto> {
    return this.purchase.forward<PurchaseInvoiceDto>({
      method: 'POST',
      path: `/api/v1/purchase-invoices/${id}/confirm`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_CANCEL)
  @ApiOperation({
    summary: 'Cancel purchase invoice',
    description:
      'Cancels a DRAFT or CONFIRMED invoice (rejected once any payment is recorded); CONFIRMED cancellation reverses the committed quantities. Permission: purchase-invoices.cancel.',
  })
  @ApiOkResponse({ type: PurchaseInvoiceDto })
  @ApiConflictResponse({ description: 'Invoice cannot be cancelled' })
  @ApiManagementErrors()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseInvoiceDto> {
    return this.purchase.forward<PurchaseInvoiceDto>({
      method: 'POST',
      path: `/api/v1/purchase-invoices/${id}/cancel`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/payments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_RECORD_PAYMENT)
  @ApiOperation({
    summary: 'Record a supplier payment',
    description:
      'Records a payment against a CONFIRMED purchase invoice and returns the payment plus the updated invoice balance. Permission: purchase-invoices.record-payment.',
  })
  @ApiCreatedResponse({ type: RecordSupplierPaymentResultDto })
  @ApiConflictResponse({ description: 'Purchase invoice cannot receive this payment' })
  @ApiManagementErrors()
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupplierPaymentDto,
    @Req() request: Request,
  ): Promise<RecordSupplierPaymentResultDto> {
    return this.purchase.forward<RecordSupplierPaymentResultDto>({
      method: 'POST',
      path: `/api/v1/purchase-invoices/${id}/payments`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get(':id/payments')
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICES_READ)
  @ApiOperation({
    summary: 'List supplier payments',
    description:
      'Lists the payment history for a JWT-tenant purchase invoice. Permission: purchase-invoices.read.',
  })
  @ApiOkResponse({ type: SupplierPaymentListDto })
  @ApiManagementErrors()
  listPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierPaymentListDto> {
    return this.purchase.forward<SupplierPaymentListDto>({
      method: 'GET',
      path: `/api/v1/purchase-invoices/${id}/payments`,
      user,
    });
  }
}
