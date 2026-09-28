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
  CreateShipmentDto,
  ResolveShipmentLineConversionDto,
  ReverseShipmentDto,
  ShipmentDto,
  ShipmentListDto,
} from './dto/shipment.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Shipments')
@Controller({ path: 'shipments', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShipmentsController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SHIPMENTS_CREATE)
  @ApiOperation({
    summary: 'Create shipment',
    description:
      'Creates a shipment (PENDING_STOCK then posts stock via Inventory). Partial shipments allowed. Exact Inventory replay returns POSTED. Permission: shipments.create.',
  })
  @ApiCreatedResponse({ type: ShipmentDto })
  @ApiConflictResponse({
    description:
      'Order not shippable, over-shipment, insufficient stock, or Inventory payload mismatch',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShipmentDto,
    @Req() request: Request,
  ): Promise<ShipmentDto> {
    return this.sales.forward<ShipmentDto>({
      method: 'POST',
      path: '/api/v1/shipments',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/post')
  @RequirePermissions(PERMISSIONS.SHIPMENTS_POST)
  @ApiOperation({
    summary: 'Post / finalize shipment',
    description:
      'Retries Inventory application and finalizes a PENDING_STOCK shipment using the same Shipment UUID. Idempotent if already POSTED. Permission: shipments.post.',
  })
  @ApiOkResponse({ type: ShipmentDto })
  @ApiConflictResponse({ description: 'Inventory payload mismatch' })
  @ApiManagementErrors()
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ShipmentDto> {
    return this.sales.forward<ShipmentDto>({
      method: 'POST',
      path: `/api/v1/shipments/${id}/post`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/reverse')
  @RequirePermissions(PERMISSIONS.SHIPMENTS_REVERSE)
  @ApiOperation({
    summary: 'Reverse shipment',
    description:
      'Undoes a POSTED shipment in full: reverses its Inventory movement(s), restores SalesOrderItem.shippedQuantity and SalesOrder.status, and reverses the COGS journal. Only permitted when zero downstream activity exists (no Sales Return recorded against any line). Idempotent if already REVERSED. Permission: shipments.reverse.',
  })
  @ApiOkResponse({ type: ShipmentDto })
  @ApiConflictResponse({
    description:
      'Only a POSTED shipment can be reversed, a line has a Sales Return recorded against it, has no captured inventory movement reference, or the shipped quantity has since been consumed elsewhere (insufficient stock)',
  })
  @ApiManagementErrors()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseShipmentDto,
    @Req() request: Request,
  ): Promise<ShipmentDto> {
    return this.sales.forward<ShipmentDto>({
      method: 'POST',
      path: `/api/v1/shipments/${id}/reverse`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-reversal')
  @RequirePermissions(PERMISSIONS.SHIPMENTS_REVERSE)
  @ApiOperation({
    summary: 'Retry shipment accounting reversal',
    description:
      'Retries the COGS journal reversal for a REVERSED shipment whose post-reversal accounting attempt failed (still accountingPostingStatus POSTED). A no-op returning the shipment unchanged if already REVERSED. Same permission as reverse. Permission: shipments.reverse.',
  })
  @ApiOkResponse({ type: ShipmentDto })
  @ApiConflictResponse({ description: 'Shipment is not REVERSED, or has no posted journal to reverse' })
  @ApiManagementErrors()
  retryAccountingReversal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ShipmentDto> {
    return this.sales.forward<ShipmentDto>({
      method: 'POST',
      path: `/api/v1/shipments/${id}/retry-accounting-reversal`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':id/lines/:lineId/resolve-conversion')
  @RequirePermissions(PERMISSIONS.SHIPMENTS_RESOLVE_CONVERSION)
  @ApiOperation({
    summary: 'Manually resolve a legacy shipment line UOM conversion',
    description:
      'For a shipment blocked at UOM_RESOLUTION_REQUIRED: records the operator-selected unit of measure (validated against the current Inventory product/UOM configuration) as the historical conversion for a legacy line whose original UOM snapshot cannot be recovered. This is a manual, audited decision, not an automatic default. Permission: shipments.resolve-conversion.',
  })
  @ApiOkResponse({ type: ShipmentDto })
  @ApiConflictResponse({
    description:
      'Shipment not awaiting resolution, line already resolved, or the selected unit of measure is invalid for this line\'s product',
  })
  @ApiManagementErrors()
  resolveConversion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: ResolveShipmentLineConversionDto,
    @Req() request: Request,
  ): Promise<ShipmentDto> {
    return this.sales.forward<ShipmentDto>({
      method: 'PATCH',
      path: `/api/v1/shipments/${id}/lines/${lineId}/resolve-conversion`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SHIPMENTS_READ)
  @ApiOperation({
    summary: 'List shipments',
    description:
      'Lists shipments in the JWT tenant. Permission: shipments.read.',
  })
  @ApiOkResponse({ type: ShipmentListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ShipmentListDto> {
    return this.sales.forward<ShipmentListDto>({
      method: 'GET',
      path: '/api/v1/shipments',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SHIPMENTS_READ)
  @ApiOperation({
    summary: 'Get shipment',
    description: 'Returns a JWT-tenant shipment. Permission: shipments.read.',
  })
  @ApiOkResponse({ type: ShipmentDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShipmentDto> {
    return this.sales.forward<ShipmentDto>({
      method: 'GET',
      path: `/api/v1/shipments/${id}`,
      user,
    });
  }
}
