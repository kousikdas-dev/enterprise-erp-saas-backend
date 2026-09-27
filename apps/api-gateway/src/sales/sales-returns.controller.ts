import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  CreateSalesReturnDto,
  ReverseSalesReturnDto,
  SalesReturnDto,
  SalesReturnListDto,
} from './dto/sales-return.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Sales Returns')
@Controller({ path: 'sales-returns', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesReturnsController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_RETURNS_CREATE)
  @ApiOperation({
    summary: 'Create sales return',
    description:
      'Creates a DRAFT sales return / credit note against a SENT sales invoice. Each line optionally references a sales invoice line (drives revenue/tax/AR reversal) and/or a shipment line (drives inventory/COGS reversal) — at least one is required. Quantities are commercial-UOM decimal strings. Permission: sales-returns.create.',
  })
  @ApiCreatedResponse({ type: SalesReturnDto })
  @ApiConflictResponse({
    description:
      'Sales invoice not SENT, quantity exceeds returnable quantity, or a shipment line predates Sales Return support (no captured inventory movement reference)',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSalesReturnDto,
    @Req() request: Request,
  ): Promise<SalesReturnDto> {
    return this.sales.forward<SalesReturnDto>({
      method: 'POST',
      path: '/api/v1/sales-returns',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.SALES_RETURNS_CONFIRM)
  @ApiOperation({
    summary: 'Confirm sales return',
    description:
      'Applies the return to Inventory (for shipment-linked lines) and posts the combined revenue/tax/AR + inventory/COGS reversal journal. Idempotent if already CONFIRMED. Permission: sales-returns.confirm.',
  })
  @ApiOkResponse({ type: SalesReturnDto })
  @ApiConflictResponse({
    description: 'Sales invoice no longer SENT, or return quantity exceeds the returnable quantity',
  })
  @ApiManagementErrors()
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesReturnDto> {
    return this.sales.forward<SalesReturnDto>({
      method: 'POST',
      path: `/api/v1/sales-returns/${id}/confirm`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-posting')
  @RequirePermissions(PERMISSIONS.SALES_RETURNS_CONFIRM)
  @ApiOperation({
    summary: 'Retry sales return accounting posting',
    description:
      'Retries posting the accounting journal for a CONFIRMED return whose posting previously failed. No-op if already POSTED. Permission: sales-returns.confirm.',
  })
  @ApiOkResponse({ type: SalesReturnDto })
  @ApiConflictResponse({ description: 'Only a CONFIRMED sales return can have its accounting posting retried' })
  @ApiManagementErrors()
  retryAccountingPosting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesReturnDto> {
    return this.sales.forward<SalesReturnDto>({
      method: 'POST',
      path: `/api/v1/sales-returns/${id}/retry-accounting-posting`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/reverse')
  @RequirePermissions(PERMISSIONS.SALES_RETURNS_REVERSE)
  @ApiOperation({
    summary: 'Reverse sales return',
    description:
      'Undoes a CONFIRMED return: reverses its Inventory movement (for shipment-linked lines), restores SalesInvoice.amountCredited / SalesInvoiceItem.returnedQuantity / ShipmentItem.returnedQuantity, and posts a reversing accounting journal. Idempotent if already REVERSED. Permission: sales-returns.reverse.',
  })
  @ApiOkResponse({ type: SalesReturnDto })
  @ApiConflictResponse({
    description: 'Only a CONFIRMED sales return can be reversed, or a line has no captured inventory movement reference',
  })
  @ApiManagementErrors()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseSalesReturnDto,
    @Req() request: Request,
  ): Promise<SalesReturnDto> {
    return this.sales.forward<SalesReturnDto>({
      method: 'POST',
      path: `/api/v1/sales-returns/${id}/reverse`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-reversal')
  @RequirePermissions(PERMISSIONS.SALES_RETURNS_REVERSE)
  @ApiOperation({
    summary: 'Retry sales return accounting reversal',
    description:
      'Retries the journal reversal for a REVERSED return whose post-reversal accounting attempt failed (still accountingPostingStatus POSTED). A no-op returning the return unchanged if already REVERSED. Same permission as reverse. Permission: sales-returns.reverse.',
  })
  @ApiOkResponse({ type: SalesReturnDto })
  @ApiConflictResponse({ description: 'Return is not REVERSED, or has no posted journal to reverse' })
  @ApiManagementErrors()
  retryAccountingReversal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesReturnDto> {
    return this.sales.forward<SalesReturnDto>({
      method: 'POST',
      path: `/api/v1/sales-returns/${id}/retry-accounting-reversal`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_RETURNS_READ)
  @ApiOperation({
    summary: 'List sales returns',
    description: 'Lists sales returns in the JWT tenant. Permission: sales-returns.read.',
  })
  @ApiOkResponse({ type: SalesReturnListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SalesReturnListDto> {
    return this.sales.forward<SalesReturnListDto>({
      method: 'GET',
      path: '/api/v1/sales-returns',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_RETURNS_READ)
  @ApiOperation({
    summary: 'Get sales return',
    description: 'Returns a JWT-tenant sales return. Permission: sales-returns.read.',
  })
  @ApiOkResponse({ type: SalesReturnDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesReturnDto> {
    return this.sales.forward<SalesReturnDto>({
      method: 'GET',
      path: `/api/v1/sales-returns/${id}`,
      user,
    });
  }
}
