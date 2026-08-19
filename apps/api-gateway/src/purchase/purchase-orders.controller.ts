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
  CreatePurchaseOrderDto,
  PurchaseOrderDto,
  PurchaseOrderListDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { PurchaseForwardService } from './purchase-forward.service';

@ApiTags('Purchase Orders')
@Controller({ path: 'purchase-orders', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchase: PurchaseForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDERS_CREATE)
  @ApiOperation({
    summary: 'Create purchase order',
    description:
      'Creates a DRAFT purchase order. Quantities and costs are decimal strings. Permission: purchase-orders.create.',
  })
  @ApiCreatedResponse({ type: PurchaseOrderDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseOrderDto,
    @Req() request: Request,
  ): Promise<PurchaseOrderDto> {
    return this.purchase.forward<PurchaseOrderDto>({
      method: 'POST',
      path: '/api/v1/purchase-orders',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDERS_READ)
  @ApiOperation({
    summary: 'List purchase orders',
    description:
      'Lists purchase orders in the JWT tenant. Permission: purchase-orders.read.',
  })
  @ApiOkResponse({ type: PurchaseOrderListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<PurchaseOrderListDto> {
    return this.purchase.forward<PurchaseOrderListDto>({
      method: 'GET',
      path: '/api/v1/purchase-orders',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDERS_READ)
  @ApiOperation({
    summary: 'Get purchase order',
    description:
      'Returns a JWT-tenant purchase order. Permission: purchase-orders.read.',
  })
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrderDto> {
    return this.purchase.forward<PurchaseOrderDto>({
      method: 'GET',
      path: `/api/v1/purchase-orders/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDERS_UPDATE)
  @ApiOperation({
    summary: 'Update purchase order',
    description:
      'Updates a DRAFT purchase order only. Permission: purchase-orders.update.',
  })
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiConflictResponse({ description: 'Order is not DRAFT' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Req() request: Request,
  ): Promise<PurchaseOrderDto> {
    return this.purchase.forward<PurchaseOrderDto>({
      method: 'PATCH',
      path: `/api/v1/purchase-orders/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDERS_CONFIRM)
  @ApiOperation({
    summary: 'Confirm purchase order',
    description:
      'Moves a DRAFT order to CONFIRMED. Permission: purchase-orders.confirm.',
  })
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiConflictResponse({ description: 'Order cannot be confirmed' })
  @ApiManagementErrors()
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseOrderDto> {
    return this.purchase.forward<PurchaseOrderDto>({
      method: 'POST',
      path: `/api/v1/purchase-orders/${id}/confirm`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDERS_CANCEL)
  @ApiOperation({
    summary: 'Cancel purchase order',
    description:
      'Cancels a purchase order when allowed. Permission: purchase-orders.cancel.',
  })
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiConflictResponse({ description: 'Order cannot be cancelled' })
  @ApiManagementErrors()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseOrderDto> {
    return this.purchase.forward<PurchaseOrderDto>({
      method: 'POST',
      path: `/api/v1/purchase-orders/${id}/cancel`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
